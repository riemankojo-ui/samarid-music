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
  const key = (process.env.SUPABASE_SERVICE_KEY || '').trim();

  if (!key) return new Response('SUPABASE_SERVICE_KEY is not set on the server (check the Key name and redeploy)', { status: 500 });
  const sbHeaders = { apikey: key };
  if (key.indexOf('eyJ') === 0) sbHeaders.Authorization = 'Bearer ' + key;
  const subRes = await fetch(SUPABASE_URL + '/rest/v1/subscribers?select=email', { headers: sbHeaders });
  const subs = await subRes.json();
  if (!Array.isArray(subs)) return new Response('Supabase error: ' + JSON.stringify(subs).substring(0, 120) + ' [key length ' + key.length + ']', { status: 500 });
  if (subs.length === 0) return new Response('No subscribers found', { status: 200 });

  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let songUrl = SITE_URL;
  try {
    const lr = await fetch(SUPABASE_URL + '/rest/v1/songs?select=id&title=eq.' + encodeURIComponent(body.title || '') + '&artist_name=eq.' + encodeURIComponent(body.artist || '') + '&order=id.desc&limit=1', { headers: sbHeaders });
    const lj = await lr.json();
    if (Array.isArray(lj) && lj[0] && lj[0].id) songUrl = SITE_URL + '/song.html?id=' + lj[0].id;
  } catch (e) {}
  const html =
    '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;text-align:center">' +
    (body.cover ? '<img src="' + esc(body.cover) + '" width="300" style="border-radius:12px">' : '') +
    '<h2>' + esc(body.artist) + (body.featuring ? ' ft. ' + esc(body.featuring) : '') + ' - ' + esc(body.title) + '</h2>' +
    '<p>New music just dropped on FlexTune.</p>' +
    '<p style="margin:20px 0 28px"><a href="' + songUrl + '" style="display:inline-block;background:#ff0033;color:#ffffff;padding:14px 32px;border-radius:30px;text-decoration:none;font-weight:bold;font-size:16px;line-height:20px">Listen now</a></p>' +
    '</div>';

  let sent = 0, firstErr = '';
  for (const s of subs.slice(0, 290)) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'FlexTune', email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: s.email }],
        subject: 'New drop: ' + body.artist + (body.featuring ? ' ft. ' + body.featuring : '') + ' - ' + body.title,
        htmlContent: html
      })
    });
    if (r.ok) sent++; else if (!firstErr) firstErr = (await r.text()).substring(0, 120);
  }
  return new Response(JSON.stringify({ sent: sent, error: firstErr }), { status: 200 });
}