// Run this in your terminal with: node clean-cloudinary.js

const CLOUDINARY_CLOUD_NAME = 't2wneryo';
const CLOUDINARY_API_KEY = 'YOUR_API_KEY';       // <-- PASTE YOUR CLOUDINARY API KEY
const CLOUDINARY_API_SECRET = 'YOUR_API_SECRET'; // <-- PASTE YOUR CLOUDINARY API SECRET

const SUPABASE_URL = 'https://kamnfnukaizdglntcdvi.supabase.co';
const SUPABASE_KEY = 'sb_publishable__YPveWCU1NMYYsegLLYskg_38s0VRip';

async function clean() {
  console.log("Fetching all songs from Supabase...");
  const res = await fetch(SUPABASE_URL + '/rest/v1/songs?select=cover,downloadurl', {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });
  const songs = await res.json();

  // Extract all public_ids used in Supabase
  const usedPublicIds = new Set();
  songs.forEach(s => {
    if (s.cover && s.cover.includes('cloudinary')) {
      const match = s.cover.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z]+)?$/i);
      if (match) usedPublicIds.add(match[1]);
    }
    if (s.downloadurl && s.downloadurl.includes('cloudinary')) {
      const match = s.downloadurl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i);
      if (match) usedPublicIds.add(match[1]);
    }
  });

  console.log(`Found ${usedPublicIds.size} files used in Supabase.`);

  // Fetch Cloudinary resources (Images and Videos)
  const deleteCloudinaryFile = async (publicId, type) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const str = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
    const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
    const signature = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const form = new URLSearchParams();
    form.append('public_id', publicId);
    form.append('timestamp', timestamp);
    form.append('api_key', CLOUDINARY_API_KEY);
    form.append('signature', signature);

    const endpoint = type === 'video' ? 'video/destroy' : 'image/destroy';
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${endpoint}`, { method: 'POST', body: form });
    return r.ok;
  };

  const checkCloudinary = async (type) => {
    let nextCursor = null;
    let deletedCount = 0;
    do {
      const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/${type}?max_results=500${nextCursor ? '&next_cursor=' + nextCursor : ''}`;
      const auth = Buffer.from(`${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}`).toString('base64');
      const cRes = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
      const data = await cRes.json();
      
      if (data.resources) {
        for (const file of data.resources) {
          if (!usedPublicIds.has(file.public_id)) {
            console.log(`Deleting unused ${type}: ${file.public_id}`);
            await deleteCloudinaryFile(file.public_id, type);
            deletedCount++;
          }
        }
      }
      nextCursor = data.next_cursor;
    } while (nextCursor);
    
    console.log(`Cleanup complete for ${type}. Deleted ${deletedCount} files.`);
  };

  await checkCloudinary('image');
  await checkCloudinary('video');
}

clean().catch(console.error);