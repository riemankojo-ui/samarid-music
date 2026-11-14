export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const body = await req.json();
    const { email, code, artistName } = body;

    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Missing email or code' }), { status: 400 });
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; text-align: center;">
        <h2 style="color: #ff0033; margin-bottom: 10px;">FlexTune Security</h2>
        <p style="color: #333; font-size: 14px;">You requested to claim the artist profile: <strong>${artistName}</strong>.</p>
        <p style="color: #333; font-size: 14px;">Here is your 6-digit verification code:</p>
        <h1 style="font-size: 32px; letter-spacing: 5px; color: #0a0a0a; background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">${code}</h1>
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