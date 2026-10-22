export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = await req.json().catch(() => ({}));
  const serverSecret = process.env.NOTIFY_SECRET || '';
  if (!serverSecret) {
    return new Response('Unauthorized: NOTIFY_SECRET is not set on the server (add it and redeploy)', { status: 401 });
  }
  if (!body.secret || body.secret !== serverSecret) {
    return new Response('Unauthorized: secrets differ. Studio sent ' + String(body.secret || '').length + ' characters, server has ' + serverSecret.length, { status: 401 });
  }

  const SUPABASE_URL = 'https://kamnfnukaizdglntcdvi.supabase.co';
  const SITE_URL = process.env.SITE_URL || 'https://flextune.vercel.app';
  const key = process.env.SUPABASE_SERVICE_KEY;

  const subRes = await fetch(SUPABASE_URL + '/rest/v1/subscribers?select=email', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  const subs = await subRes.json();
  if (!Array.isArray(subs)) return new Response('Supabase error: ' + JSON.stringify(subs).substring(0, 120), { status: 500 });
  if (subs.length === 0) return new Response('No subscribers found', { status: 200 });

  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html =
    '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;text-align:center">' +
    (body.cover ? '<img src="' + esc(body.cover) + '" width="300" style="border-radius:12px">' : '') +
    '<h2>' + esc(body.artist) + ' - ' + esc(body.title) + '</h2>' +
    '<p>New music just dropped on FlexTune.</p>' +
    '<a href="' + SITE_URL + '" style="background:#ff0033;color:#fff;padding:12px 24px;border-radius:30px;text-decoration:none;font-weight:bold">Listen now</a>' +
    '</div>';

  let sent = 0, firstErr = '';
  for (const s of subs.slice(0, 290)) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'FlexTune', email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: s.email }],
        subject: 'New drop: ' + body.artist + ' - ' + body.title,
        htmlContent: html
      })
    });
    if (r.ok) sent++; else if (!firstErr) firstErr = (await r.text()).substring(0, 120);
  }
  return new Response(JSON.stringify({ sent: sent, error: firstErr }), { status: 200 });
}