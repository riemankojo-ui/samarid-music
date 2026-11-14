export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const body = await req.json();
    const { email, code, artistName } = body;

    const sbKey = (process.env.SUPABASE_SERVICE_KEY || '').trim();
    if (!sbKey) return new Response(JSON.stringify({ error: 'server_not_ready' }), { status: 500 });
    const ar = await fetch('https://kamnfnukaizdglntcdvi.supabase.co/rest/v1/artists?select=name,email&limit=20&name=ilike.' + encodeURIComponent(artistName || ''), { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } });
    const rows = await ar.json();
    const row = (Array.isArray(rows) ? rows : []).find(r => (r.name || '').trim().toLowerCase() === String(artistName || '').trim().toLowerCase());
    const onFile = ((row && row.email) || '').trim().toLowerCase();
    if (!onFile) return new Response(JSON.stringify({ error: 'no_email' }), { status: 403 });
    if (onFile !== String(email || '').trim().toLowerCase()) return new Response(JSON.stringify({ error: 'name_taken' }), { status: 403 });

    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Missing email or code' }), { status: 400 });
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; text-align: center;">
        <h2 style="color: #ff0033; margin-bottom: 10px;">FlexTune Security</h2>
        <p style="color: #333; font-size: 14px;">You requested to claim the artist profile: <strong>${artistName}</strong>.</p>
        <p style="color: #333; font-size: 14px;">Here is your 6-digit verification code:</p>
        <h1 style="font-size: 36px; letter-spacing: 6px; color: #0a0a0a; background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0 8px; -webkit-user-select: all; user-select: all;">${code}</h1>
        <p style="font-size: 12px; color: #888; margin: 0 0 18px;">Tap and hold the code, then choose Copy.</p>
        <p style="font-size: 12px; color: #888;">If you did not request this, you can safely ignore this email.</p>
      </div>
    `;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'FlexTune', email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: email }],
        subject: 'Your FlexTune Verification Code: ' + code,
        htmlContent: html
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}