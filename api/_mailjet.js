export const config = { runtime: 'edge' };

export async function sendCodeEmail(to, subject, html) {
  const key = (process.env.MAILJET_API_KEY || '').trim();
  const secret = (process.env.MAILJET_SECRET_KEY || '').trim();
  const sender = (process.env.MAILJET_SENDER_EMAIL || '').trim();
  if (!key || !secret || !sender) return { ok: false, error: 'mailjet_not_set' };
  try {
    const r = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(key + ':' + secret),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        Messages: [{
          From: { Email: sender, Name: 'FlexTune' },
          To: [{ Email: to }],
          Subject: subject,
          HTMLPart: html
        }]
      })
    });
    if (!r.ok) return { ok: false, error: 'mailjet_' + r.status + ' ' + (await r.text()).substring(0, 100) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message) };
  }
}