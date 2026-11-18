import { sendEmail } from './_mail.js';
export const config = { runtime: 'edge' };

const SB = 'https://kamnfnukaizdglntcdvi.supabase.co/rest/v1';

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const key = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!key) return json({ error: 'server_not_ready' }, 500);
  const h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

  try {
    const b = await req.json();
    const name = String(b.name || '').trim().slice(0, 80);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
    const phone = String(b.phone || '').trim().slice(0, 40);
    const genre = String(b.genre || '').trim().slice(0, 60);
    const link = String(b.link || '').trim().slice(0, 300);
    if (!name || /[*%]/.test(name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'bad_request' }, 400);

    // Name already on the site: they must use the claim page instead
    const a = await fetch(SB + '/artists?select=id&limit=1&name=ilike.' + encodeURIComponent(name), { headers: h });
    const aRows = await a.json();
    if (Array.isArray(aRows) && aRows.length) return json({ error: 'exists' }, 409);

    // Same email already waiting: treat as done, do not create a duplicate
    const pe = await fetch(SB + '/artist_requests?select=id&limit=1&link_sent_at=is.null&email=eq.' + encodeURIComponent(email), { headers: h });
    const peRows = await pe.json();
    if (Array.isArray(peRows) && peRows.length) return json({ ok: true });

    // Same name waiting under a different email: block
    const pn = await fetch(SB + '/artist_requests?select=id&limit=1&link_sent_at=is.null&name=ilike.' + encodeURIComponent(name), { headers: h });
    const pnRows = await pn.json();
    if (Array.isArray(pnRows) && pnRows.length) return json({ error: 'name_pending' }, 409);

    const ins = await fetch(SB + '/artist_requests', {
      method: 'POST',
      headers: Object.assign({ Prefer: 'return=minimal' }, h),
      body: JSON.stringify({ name: name, email: email, phone: phone, genre: genre, link: link })
    });
    if (!ins.ok) return json({ error: 'db_error' }, 500);

    try {
      const sr = await fetch(SB + '/app_settings?select=value&key=eq.notify_email&limit=1', { headers: h });
      const srRows = await sr.json();
      const notifyTo = (Array.isArray(srRows) && srRows[0] && srRows[0].value) || '';
      if (notifyTo) {
        const e = function (s) { return String(s || '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
        const html = '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px;">' +
          '<h2 style="color:#ff0033;margin-bottom:10px;text-align:center;">New artist request</h2>' +
          '<p style="color:#333;font-size:14px;line-height:1.8;"><strong>Name:</strong> ' + e(name) + '<br><strong>Email:</strong> ' + e(email) + '<br><strong>Phone:</strong> ' + e(phone) + '<br><strong>Genre:</strong> ' + e(genre) + '<br><strong>Link:</strong> ' + e(link) + '</p>' +
          '<p style="margin:24px 0;text-align:center;"><a href="https://flextune.vercel.app/smpanel-2261.html#requests" style="background:#ff8800;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:bold;display:inline-block;">Feedback</a></p></div>';
        await sendEmail(notifyTo, 'New artist request: ' + name, html);
      }
    } catch (err) {}
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'server_error' }, 500);
  }
}