import { sendEmail } from './_mail.js';
export const config = { runtime: 'edge' };

const SB = 'https://kamnfnukaizdglntcdvi.supabase.co/rest/v1';
const SITE = 'https://flextune.vercel.app';

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function sameKey(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function patchRequest(h, id, fields) {
  return fetch(SB + '/artist_requests?id=eq.' + encodeURIComponent(id) + '&link_sent_at=is.null', {
    method: 'PATCH',
    headers: Object.assign({ Prefer: 'return=minimal' }, h),
    body: JSON.stringify(fields)
  });
}

async function processDue(h) {
  const out = { sent: 0, failed: 0 };
  const r = await fetch(SB + '/artist_requests?select=*&status=eq.approved&link_sent_at=is.null&send_at=lte.' + encodeURIComponent(new Date().toISOString()), { headers: h });
  const rows = await r.json();
  if (!Array.isArray(rows)) return out;
  for (const q of rows) {
    try {
      const name = String(q.name || '').trim();
      const email = String(q.email || '').trim().toLowerCase();
      const ar = await fetch(SB + '/artists?select=id,email&limit=1&name=ilike.' + encodeURIComponent(name), { headers: h });
      const found = await ar.json();
      if (Array.isArray(found) && found.length) {
        const onFile = String(found[0].email || '').trim().toLowerCase();
        if (onFile && onFile !== email) { await patchRequest(h, q.id, { status: 'conflict' }); out.failed++; continue; }
        if (!onFile) await fetch(SB + '/artists?id=eq.' + encodeURIComponent(found[0].id), { method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, h), body: JSON.stringify({ email: email }) });
      } else {
        const ins = await fetch(SB + '/artists', { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, h), body: JSON.stringify({ name: name, email: email }) });
        if (!ins.ok) { out.failed++; continue; }
      }
      const link = SITE + '/claim.html?name=' + encodeURIComponent(name) + '&email=' + encodeURIComponent(email);
      const html = '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px;text-align:center;">' +
        '<h2 style="color:#ff0033;margin-bottom:10px;">FlexTune</h2>' +
        '<p style="color:#333;font-size:15px;">Good news! Your request to join FlexTune as <strong>' + esc(name) + '</strong> was approved.</p>' +
        '<p style="color:#333;font-size:14px;">Tap the button below to claim your artist profile and set your password.</p>' +
        '<p style="margin:24px 0;"><a href="' + esc(link) + '" style="background:#ff8800;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:bold;display:inline-block;">Claim my profile</a></p>' +
        '<p style="font-size:12px;color:#888;">If you did not ask to join FlexTune, ignore this email.</p></div>';
      const m = await sendEmail(email, 'Your FlexTune artist profile is ready', html);
      if (!m.ok) { out.failed++; continue; }
      await patchRequest(h, q.id, { status: 'sent', link_sent_at: new Date().toISOString() });
      out.sent++;
    } catch (e) { out.failed++; }
  }
  return out;
}

export default async function handler(req) {
  const key = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  const admin = (process.env.ADMIN_KEY || '').trim();
  if (!key || !admin) return json({ error: 'server_not_ready' }, 500);
  const h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

  let b = {};
  if (req.method === 'GET') {
    const u = new URL(req.url);
    b = { action: u.searchParams.get('action'), key: u.searchParams.get('key') };
  } else if (req.method === 'POST') {
    try { b = await req.json(); } catch (e) {}
  } else {
    return json({ error: 'method' }, 405);
  }
  if (!sameKey(b.key, admin)) return json({ error: 'unauthorized' }, 401);

  try {
    if (b.action === 'process') {
      return json(Object.assign({ ok: true }, await processDue(h)));
    }

    if (b.action === 'list') {
      await processDue(h);
      let r = await fetch(SB + '/artist_requests?select=*&order=created_at.desc&limit=100', { headers: h });
      if (!r.ok) r = await fetch(SB + '/artist_requests?select=*&limit=100', { headers: h });
      let rows = await r.json();
      if (!Array.isArray(rows)) rows = [];
      const s = await fetch(SB + '/app_settings?select=value&key=eq.notify_email&limit=1', { headers: h });
      const sr = await s.json();
      return json({ ok: true, requests: rows, notify_email: (Array.isArray(sr) && sr[0] && sr[0].value) || '' });
    }

    if (b.action === 'artists-emails') {
      const ar = await fetch(SB + '/artists?select=name,email&order=name.asc&limit=1000', { headers: h });
      const arows = await ar.json();
      const au = await fetch(SB + '/artist_auth?select=name_key,pw_hash&limit=1000', { headers: h });
      const aurows = await au.json();
      const claimed = {};
      (Array.isArray(aurows) ? aurows : []).forEach(function (x) { if (x.pw_hash) claimed[String(x.name_key || '')] = true; });
      const list = (Array.isArray(arows) ? arows : []).map(function (a) {
        return { name: a.name, email: a.email || '', claimed: !!claimed[String(a.name || '').trim().toLowerCase()] };
      });
      return json({ ok: true, artists: list });
    }

    if (b.action === 'set-notify') {
      const email = String(b.email || '').trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'bad_email' }, 400);
      const r = await fetch(SB + '/app_settings', {
        method: 'POST',
        headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, h),
        body: JSON.stringify({ key: 'notify_email', value: email })
      });
      return r.ok ? json({ ok: true }) : json({ error: 'db_error' }, 500);
    }

    if (b.action === 'decide') {
      const id = String(b.id || '');
      if (!id) return json({ error: 'bad_request' }, 400);
      if (b.decision === 'reject') {
        await patchRequest(h, id, { status: 'rejected', reviewed_at: new Date().toISOString() });
        return json({ ok: true });
      }
      if (b.decision === 'approve') {
        let hours = Number(b.delay_hours);
        if (!(hours >= 0 && hours <= 72)) hours = 24;
        await patchRequest(h, id, { status: 'approved', reviewed_at: new Date().toISOString(), send_at: new Date(Date.now() + hours * 3600000).toISOString() });
        if (hours === 0) await processDue(h);
        return json({ ok: true });
      }
      return json({ error: 'bad_request' }, 400);
    }

    return json({ error: 'bad_request' }, 400);
  } catch (e) {
    return json({ error: 'server_error' }, 500);
  }
}