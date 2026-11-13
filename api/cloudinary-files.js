export const config = { runtime: 'edge' };

export default async function handler(req) {
  const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 't2wneryo';
  const API_KEY = process.env.CLOUDINARY_API_KEY;
  const API_SECRET = process.env.CLOUDINARY_API_SECRET;
  
  const SUPABASE_URL = "https://kamnfnukaizdglntcdvi.supabase.co";
  const SUPABASE_KEY = "sb_publishable__YPveWCU1NMYYsegLLYskg_38s0VRip";

  if (!API_KEY || !API_SECRET) return new Response(JSON.stringify({ error: 'Keys missing' }), { status: 500 });

  // 1. Get used files from Supabase
  const sbRes = await fetch(SUPABASE_URL + '/rest/v1/songs?select=cover,downloadurl', {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });
  const songs = await sbRes.json();
  
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

  // 2. Fetch Cloudinary files
  const fetchCloudinary = async (type) => {
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/${type}?max_results=500`;
    const auth = btoa(`${API_KEY}:${API_SECRET}`);
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    const data = await res.json();
    
    if (!data.resources) return [];
    return data.resources.map(f => ({
      public_id: f.public_id,
      url: f.secure_url,
      type: type,
      inUse: usedIds.has(f.public_id)
    }));
  };

  // 3. Fetch Cloudinary Usage (Total Storage)
  let storageBytes = 0;
  try {
    const usageRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/usage`, { headers: { Authorization: `Basic ${auth}` } });
    const usageData = await usageRes.json();
    if (usageData.storage && usageData.storage.usage) {
      storageBytes = usageData.storage.usage;
    }
  } catch (e) {}

  const [images, audios] = await Promise.all([
    fetchCloudinary('image'),
    fetchCloudinary('video')
  ]);

  return new Response(JSON.stringify({ images, audios, storageBytes }), { 
    status: 200, 
    headers: { 'Content-Type': 'application/json' } 
  });
}