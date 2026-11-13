export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 't2wneryo';
  const API_KEY = (process.env.CLOUDINARY_API_KEY || '').trim();
  const API_SECRET = (process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!API_KEY || !API_SECRET) return new Response(JSON.stringify({ error: 'Cloudinary not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  let body;
  try { body = await req.json(); } catch (e) { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  const { public_id, resource_type } = body;
  if (!public_id) return new Response(JSON.stringify({ error: 'public_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const timestamp = Math.floor(Date.now() / 1000);
  const str = 'public_id=' + public_id + '&timestamp=' + timestamp + API_SECRET;

  // SHA-1 signature using Web Crypto
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-1', enc.encode(str));
  const signature = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

  const form = new URLSearchParams();
  form.append('public_id', public_id);
  form.append('timestamp', String(timestamp));
  form.append('api_key', API_KEY);
  form.append('signature', signature);

  // Use 'video/destroy' for MP3s, 'image/destroy' for covers
  const endpoint = resource_type === 'video' ? 'video/destroy' : 'image/destroy';
  const res = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD_NAME + '/' + endpoint, { method: 'POST', body: form });
  const data = await res.json();
  return new Response(JSON.stringify(data), { status: res.ok ? 200 : 500, headers: { 'Content-Type': 'application/json' } });
}