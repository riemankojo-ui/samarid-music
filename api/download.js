export const config = { runtime: 'edge' };

export default async function handler(req) {
  const target = new URL(req.url).searchParams.get('url');
  if (!target || !/^https?:\/\//i.test(target)) {
    return new Response('Bad url', { status: 400 });
  }
  try {
    const up = await fetch(target, { redirect: 'follow' });
    if (!up.ok) return new Response('Upstream error', { status: 502 });
    const type = up.headers.get('content-type') || 'application/octet-stream';
    if (!/^(audio|image)\/|octet-stream/i.test(type)) {
      return new Response('Not allowed', { status: 415 });
    }
    return new Response(up.body, {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' }
    });
  } catch (e) {
    return new Response('Failed', { status: 502 });
  }
}