export const config = { runtime: 'edge' };

const SB = 'https://kamnfnukaizdglntcdvi.supabase.co/rest/v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

const MIN = 60 * 1000;
const CODE_LIFE = 10 * MIN;
const TICKET_LIFE = 15 * MIN;
const SESSION_LIFE = 30 * 24 * 60 * MIN;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function sbHeaders() {
  const k = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' };
}
function secret() { return (process.env.AUTH_SECRET || '').trim(); }

function b64u(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
function hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function unhex(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function safeEq(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function sha(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}
async function hmacKey() {
  return crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signToken(payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(body));
  return body + '.' + b64u(sig);
}
async function readToken(tok, purposes) {
  try {
    const parts = String(tok || '').split('.');
    if (parts.length !== 2) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), unb64u(parts[1]), enc.encode(parts[0]));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(unb64u(parts[0])));
    if (!p || !p.n || p.exp < Date.now() || purposes.indexOf(p.p) === -1) return null;
    return p;
  } catch (e) { return null; }
}
async function hashPassword(pw, saltBytes) {
  const km = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' }, km, 256);
  return hex(bits);
}

async function findArtist(name) {
  name = String(name || '').trim();
  if (!name) return null;
  const esc = name.replace(/[\\%_]/g, m => '\\' + m);
  const r = await fetch(SB + '/artists?select=id,name,email&limit=20&name=ilike.' + encodeURIComponent(esc), { headers: sbHeaders() });
  const rows = await r.json();
  if (!Array.isArray(rows)) return null;
  return rows.find(x => (x.name || '').trim().toLowerCase() === name.toLowerCase()) || null;
}
async function getAuth(key) {
  const r = await fetch(SB + '/artist_auth?select=*&name_key=eq.' + encodeURIComponent(key) + '&limit=1', { headers: sbHeaders() });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
async function saveAuth(key, fields) {
  const body = Object.assign({ name_key: key }, fields);
  const r = await fetch(SB + '/artist_auth?on_conflict=name_key', {
    method: 'POST',
    headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, sbHeaders()),
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('db_error');
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
async function sendMail(to, artistName, code, purpose) {
  const what = purpose === 'login' ? 'log in to' : purpose === 'reset' ? 'reset the password for' : 'claim';
  const html = '<div style="font-family:Arial,sans-serif;max-width:400px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px;text-align:center;">' +
    '<h2 style="color:#ff0033;margin-bottom:10px;">FlexTune Security</h2>' +
    '<p style="color:#333;font-size:14px;">Someone asked to ' + what + ' the artist profile <strong>' + esc(artistName) + '</strong>.</p>' +
    '<p style="color:#333;font-size:14px;">Your 6-digit code (valid for 10 minutes):</p>' +
    '<h1 style="font-size:36px;letter-spacing:6px;color:#0a0a0a;background:#f5f5f5;padding:16px;border-radius:8px;margin:20px 0 8px;user-select:all;">' + code + '</h1>' +
    '<p style="font-size:12px;color:#888;">If this was not you, ignore this email. Nobody can get in without this code.</p></div>';
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'FlexTune', email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject: 'Your FlexTune code: ' + code,
      htmlContent: html
    })
  });
  if (!res.ok) throw new Error('mail_failed');
}
async function issueCode(art, purpose) {
  const key = art.name.trim().toLowerCase();
  const auth = await getAuth(key);
  if (auth && auth.code_exp && (auth.code_exp - CODE_LIFE + 45 * 1000) > Date.now()) {
    return { error: 'wait_a_bit', status: 429 };
  }
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await saveAuth(key, { code_hash: await sha(key + ':' + code + ':' + secret()), code_exp: Date.now() + CODE_LIFE, code_tries: 0, code_purpose: purpose });
  await sendMail(art.email, art.name, code, purpose);
  return { ok: true };
}
function sessionFor(name) {
  return signToken({ n: name, p: 'session', exp: Date.now() + SESSION_LIFE });
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!secret() || !(process.env.SUPABASE_SERVICE_KEY || '').trim()) return json({ error: 'server_not_ready' }, 500);

  try {
    const b = await req.json();
    const action = b.action;

    // 1) First claim: send a code, only if the typed email matches the email on file
    if (action === 'claim-code') {
      const art = await findArtist(b.name);
      if (!art) return json({ error: 'not_found' }, 404);
      const onFile = (art.email || '').trim().toLowerCase();
      if (!onFile) return json({ error: 'no_email' }, 403);
      if (onFile !== String(b.email || '').trim().toLowerCase()) return json({ error: 'name_taken' }, 403);
      const auth = await getAuth(art.name.trim().toLowerCase());
      if (auth && auth.pw_hash) return json({ error: 'already_claimed' }, 409);
      const r = await issueCode(art, 'claim');
      return r.error ? json({ error: r.error }, r.status) : json({ ok: true });
    }

    // 2) Login step 1: name + password, then a code is emailed
    if (action === 'login') {
      const art = await findArtist(b.name);
      const key = art ? art.name.trim().toLowerCase() : '';
      const auth = art ? await getAuth(key) : null;
      if (!art || !auth || !auth.pw_hash) return json({ error: 'bad_login' }, 401);
      if ((auth.lock_until || 0) > Date.now()) return json({ error: 'locked' }, 429);
      const h = await hashPassword(String(b.password || ''), unhex(auth.pw_salt));
      if (!safeEq(h, auth.pw_hash)) {
        const fails = (auth.fail_count || 0) + 1;
        await saveAuth(key, fails >= 5 ? { fail_count: 0, lock_until: Date.now() + 15 * MIN } : { fail_count: fails });
        return json({ error: 'bad_login' }, 401);
      }
      await saveAuth(key, { fail_count: 0 });
      if (!art.email) return json({ error: 'no_email' }, 403);
      const r = await issueCode(art, 'login');
      return r.error ? json({ error: r.error }, r.status) : json({ ok: true });
    }

    // 3) Forgot password: code goes to the email on file
    if (action === 'reset-code') {
      const art = await findArtist(b.name);
      if (art && art.email) {
        const auth = await getAuth(art.name.trim().toLowerCase());
        if (auth && auth.pw_hash) {
          const r = await issueCode(art, 'reset');
          if (r.error) return json({ error: r.error }, r.status);
        }
      }
      return json({ ok: true });
    }

    // 4) Check a code: claim/reset give a short ticket, login gives the session
    if (action === 'verify-code') {
      const purpose = b.purpose;
      if (['claim', 'reset', 'login'].indexOf(purpose) === -1) return json({ error: 'bad_request' }, 400);
      const art = await findArtist(b.name);
      if (!art) return json({ error: 'wrong_code' }, 400);
      const key = art.name.trim().toLowerCase();
      const auth = await getAuth(key);
      if (!auth || !auth.code_hash || auth.code_purpose !== purpose || (auth.code_exp || 0) < Date.now()) return json({ error: 'code_expired' }, 400);
      if ((auth.code_tries || 0) >= 5) return json({ error: 'too_many' }, 429);
      const h = await sha(key + ':' + String(b.code || '').trim() + ':' + secret());
      if (!safeEq(h, auth.code_hash)) {
        await saveAuth(key, { code_tries: (auth.code_tries || 0) + 1 });
        return json({ error: 'wrong_code' }, 400);
      }
      await saveAuth(key, { code_hash: null, code_exp: 0, code_tries: 0, code_purpose: null });
      if (purpose === 'login') return json({ ok: true, token: await sessionFor(art.name), artist: art.name });
      return json({ ok: true, ticket: await signToken({ n: art.name, p: purpose, exp: Date.now() + TICKET_LIFE }) });
    }

    // 5) Set the password (last step of claim, or after a reset)
    if (action === 'set-password') {
      const t = await readToken(b.ticket, ['claim', 'reset']);
      if (!t) return json({ error: 'ticket_expired' }, 401);
      const pw = String(b.password || '');
      if (pw.length < 8 || pw.length > 100) return json({ error: 'weak_password' }, 400);
      const key = t.n.trim().toLowerCase();
      const auth = await getAuth(key);
      if (t.p === 'claim' && auth && auth.pw_hash) return json({ error: 'already_claimed' }, 409);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      await saveAuth(key, { pw_hash: await hashPassword(pw, salt), pw_salt: hex(salt), fail_count: 0, lock_until: 0 });
      return json({ ok: true, token: await sessionFor(t.n), artist: t.n });
    }

    // 6) The studio asks: is this session real?
    if (action === 'check') {
      const s = await readToken(b.token, ['session']);
      if (!s) return json({ error: 'invalid' }, 401);
      const auth = await getAuth(s.n.trim().toLowerCase());
      if (!auth || !auth.pw_hash) return json({ error: 'invalid' }, 401);
      return json({ ok: true, artist: s.n });
    }

    return json({ error: 'bad_request' }, 400);
  } catch (e) {
    return json({ error: 'server_error' }, 500);
  }
}
