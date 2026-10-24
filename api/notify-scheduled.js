export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const cronKey = process.env.CRON_KEY || '';
  if (!cronKey || url.searchParams.get('key') !== cronKey) return new Response('Unauthorized', { status: 401 });

  const SUPABASE_URL = 'https://kamnfnukaizdglntcdvi.supabase.co';
  const SITE_URL = process.env.SITE_URL || 'https://flextune.vercel.app';
  const key = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!key) return new Response('SUPABASE_SERVICE_KEY is not set', { status: 500 });
  const sb = { apikey: key, 'Content-Type': 'application/json' };
  if (key.indexOf('eyJ') === 0) sb.Authorization = 'Bearer ' + key;

  const now = new Date().toISOString();
  const dueRes = await fetch(SUPABASE_URL + '/rest/v1/songs?status=eq.scheduled&notified=eq.false&release_at=lte.' + encodeURIComponent(now) + '&select=id,title,cover,artist_name,album_name&order=release_at.asc&limit=50', { headers: sb });
  const due = await dueRes.json();
  if (!Array.isArray(due)) return new Response('Supabase error: ' + JSON.stringify(due).substring(0, 150), { status: 500 });
  if (due.length === 0) return new Response(JSON.stringify({ due: 0 }), { status: 200 });

  const subRes = await fetch(SUPABASE_URL + '/rest/v1/subscribers?select=email', { headers: sb });
  const subs = await subRes.json();
  if (!Array.isArray(subs)) return new Response('Supabase error: ' + JSON.stringify(subs).substring(0, 150), { status: 500 });

  const groups = {};
  due.forEach(function (s) {
    const k = s.album_name ? 'album:' + s.album_name : 'song:' + s.id;
    (groups[k] = groups[k] || []).push(s);
  });

  const esc = function (s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const results = [];

  for (const k of Object.keys(groups).slice(0, 3)) {
    const items = groups[k], first = items[0];
    const title = first.album_name || first.title, artist = first.artist_name || 'Samarid';
    const html =
      '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;text-align:center">' +
      (first.cover ? '<img src="' + esc(first.cover) + '" width="300" style="border-radius:12px">' : '') +
      '<h2>' + esc(artist) + ' - ' + esc(title) + '</h2>' +
      '<p>New music just dropped on FlexTune.</p>' +
      '<a href="' + SITE_URL + '" style="background:#ff0033;color:#fff;padding:12px 24px;border-radius:30px;text-decoration:none;font-weight:bold">Listen now</a>' +
      '</div>';

    let sent = 0, firstErr = '';
    const list = subs.slice(0, 290);
    const sendTo = async function (s) {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'FlexTune', email: process.env.BREVO_SENDER_EMAIL },
          to: [{ email: s.email }],
          subject: 'New drop: ' + artist + ' - ' + title,
          htmlContent: html
        })
      });
      if (r.ok) return 1;
      if (!firstErr) firstErr = (await r.text()).substring(0, 120);
      return 0;
    };
    for (let i = 0; i < list.length; i += 10) {
      const part = await Promise.all(list.slice(i, i + 10).map(sendTo));
      sent += part.reduce(function (a, b) { return a + b; }, 0);
    }

    if (sent > 0 || list.length === 0) {
      const ids = items.map(function (s) { return s.id; }).join(',');
      await fetch(SUPABASE_URL + '/rest/v1/songs?id=in.(' + ids + ')', { method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, sb), body: JSON.stringify({ notified: true }) });
    }
    results.push({ release: title, sent: sent, error: firstErr });
  }
  return new Response(JSON.stringify({ due: due.length, results: results }), { status: 200 });
}