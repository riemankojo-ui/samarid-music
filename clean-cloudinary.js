export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== 'flex123') {
    return new Response('Unauthorized. Add ?secret=flex123 to the URL.', { status: 401 });
  }

  const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 't2wneryo';
  const API_KEY = process.env.CLOUDINARY_API_KEY;
  const API_SECRET = process.env.CLOUDINARY_API_SECRET;
  
  const SUPABASE_URL = "https://kamnfnukaizdglntcdvi.supabase.co";
  const SUPABASE_KEY = "sb_publishable__YPveWCU1NMYYsegLLYskg_38s0VRip";

  if (!API_KEY || !API_SECRET) return new Response('Cloudinary keys missing in Vercel', { status: 500 });

  const res = await fetch(SUPABASE_URL + '/rest/v1/songs?select=cover,downloadurl', {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });
  const songs = await res.json();
  
  const usedIds = new Set();
  songs.forEach(s => {
    if (s.cover && s.cover.includes('cloudinary')) {
      const match = s.cover.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z]+)?$/i);
      if (match) usedIds.add(match[1]);
    }
    if (s.downloadurl && s.downloadurl.includes('cloudinary')) {
      const match = s.downloadurl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i);
      if (match) usedIds.add(match[1]);
    }
  });

  let deleted = 0;

  const cleanType = async (type) => {
    let nextCursor = null;
    do {
      const cUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/${type}?max_results=100${nextCursor ? '&next_cursor=' + nextCursor : ''}`;
      const auth = btoa(`${API_KEY}:${API_SECRET}`);
      const cRes = await fetch(cUrl, { headers: { Authorization: `Basic ${auth}` } });
      const data = await cRes.json();
      
      if (data.resources) {
        for (const file of data.resources) {
          if (!usedIds.has(file.public_id)) {
            const timestamp = Math.floor(Date.now() / 1000);
            const str = `public_id=${file.public_id}&timestamp=${timestamp}${API_SECRET}`;
            const msgBuffer = new TextEncoder().encode(str);
            const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
            const signature = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

            const form = new URLSearchParams();
            form.append('public_id', file.public_id);
            form.append('timestamp', timestamp);
            form.append('api_key', API_KEY);
            form.append('signature', signature);

            const endpoint = type === 'video' ? 'video/destroy' : 'image/destroy';
            await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${endpoint}`, { method: 'POST', body: form });
            deleted++;
          }
        }
      }
      nextCursor = data.next_cursor;
    } while (nextCursor);
  };

  await cleanType('image');
  await cleanType('video');

  return new Response(`Done! Deleted ${deleted} unused files from Cloudinary.`, { status: 200 });
}