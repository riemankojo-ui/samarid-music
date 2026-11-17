export const config = { runtime: 'edge' };

let spToken = null;
let spExp = 0;

function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function viaBrevo(to, subject, html) {
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) throw new Error('brevo_not_set');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'FlexTune', email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject: subject,
      htmlContent: html
    })
  });
  if (!r.ok) throw new Error('brevo_' + r.status + ' ' + (await r.text()).substring(0, 100));
}

async function spGetToken() {
  if (spToken && Date.now() < spExp) return spToken;
  const r = await fetch('https://api.sendpulse.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: (process.env.SENDPULSE_ID || '').trim(),
      client_secret: (process.env.SENDPULSE_SECRET || '').trim()
    })
  });
  if (!r.ok) throw new Error('sendpulse_token_' + r.status);
  const d = await r.json();
  spToken = d.access_token;
  spExp = Date.now() + ((d.expires_in || 3600) - 120) * 1000;
  return spToken;
}

async function viaSendPulse(to, subject, html) {
  if (!process.env.SENDPULSE_ID || !process.env.SENDPULSE_SECRET || !process.env.SENDPULSE_SENDER_EMAIL) throw new Error('sendpulse_not_set');
  const token = await spGetToken();
  const r = await fetch('https://api.sendpulse.com/smtp/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: {
        subject: subject,
        from: { name: 'FlexTune', email: process.env.SENDPULSE_SENDER_EMAIL },
        to: [{ email: to }],
        html: toB64(html)
      }
    })
  });
  if (!r.ok) throw new Error('sendpulse_' + r.status + ' ' + (await r.text()).substring(0, 100));
}

export async function sendEmail(to, subject, html) {
  try {
    await viaBrevo(to, subject, html);
    return { ok: true, via: 'brevo' };
  } catch (e1) {
    try {
      await viaSendPulse(to, subject, html);
      return { ok: true, via: 'sendpulse' };
    } catch (e2) {
      return { ok: false, error: String(e1.message) + ' | ' + String(e2.message) };
    }
  }
}