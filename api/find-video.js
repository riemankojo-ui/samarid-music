export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://kamnfnukaizdglntcdvi.supabase.co';
const HOUR = 60 * 60 * 1000;

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/[^a-z0-9]+/g, ' ').trim();
}

// score: 3 = official video, 2 = distributor "Topic" audio, 1 = other audio / plain upload, null = not a match
function rate(item, title, artist) {
  const t = norm(item.snippet.title), ch = norm(item.snippet.channelTitle);
  const nt = norm(title), na = norm(artist);
  if (!nt || t.indexOf(nt) === -1) return null;
  if (na && t.indexOf(na) === -1 && ch.indexOf(na) === -1) return null;
  const rest = t.replace(nt, ' ');
  if (/\b(cover|remix|reaction|karaoke|instrumental|slowed|sped up|live|tutorial)\b/.test(rest)) return null;
  const isAudioWord = /\b(audio|visuali[sz]er|lyrics?)\b/.test(rest);
  if (!isAudioWord && /official (music )?video|music video/.test(rest)) return 3;
  if (/ topic$/.test(ch)) return 2;
  return 1;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (!/^[0-9a-zA-Z-]+$/.test(id)) return json({ error: 'bad id' }, 400);

  const ytKey = (process.env.YOUTUBE_API_KEY || '').trim();
  const key = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!key) return json({ error: 'SUPABASE_SERVICE_KEY is not set' }, 500);
  const sb = { apikey: key, 'Content-Type': 'application/json' };
  if (key.indexOf('eyJ') === 0) sb.Authorization = 'Bearer ' + key;

  const r = await fetch(SUPABASE_URL + '/rest/v1/songs?id=eq.' + id + '&select=id,title,artist_name,youtube,auto_youtube,auto_youtube_type,auto_youtube_checked&limit=1', { headers: sb });
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows[0]) return json({ url: null });
  const song = rows[0];

  // 1) a link pasted in the studio always wins
  if (song.youtube && String(song.youtube).trim()) return json({ url: song.youtube, type: 'manual' });

  // 2) already found an official video: done, never search again
  const have = song.auto_youtube ? { url: song.auto_youtube, type: song.auto_youtube_type } : null;
  if (have && have.type === 'video') return json(have);

  // 3) recently checked: reuse the result (audio re-checked every 24h, nothing found every 6h)
  const age = song.auto_youtube_checked ? Date.now() - new Date(song.auto_youtube_checked).getTime() : Infinity;
  if (have && age < 24 * HOUR) return json(have);
  if (!have && age < 6 * HOUR) return json({ url: null });

  if (!ytKey) return json(have || { url: null, error: 'YOUTUBE_API_KEY is not set' });

  // 4) search YouTube
  const q = (song.artist_name || '') + ' ' + (song.title || '');
  const yr = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=10&q=' + encodeURIComponent(q) + '&key=' + ytKey);
  const yd = await yr.json();
  if (!yr.ok || !Array.isArray(yd.items)) {
    // quota or key problem: do not mark as checked, try again later
    return json(have || { url: null, error: (yd && yd.error && yd.error.message || 'YouTube error').substring(0, 120) });
  }

  let best = null, bestScore = 0;
  yd.items.forEach(function (it) {
    if (!it.id || !it.id.videoId) return;
    const sc = rate(it, song.title, song.artist_name);
    if (sc && sc > bestScore) { best = it.id.videoId; bestScore = sc; }
  });

  const patch = { auto_youtube_checked: new Date().toISOString() };
  let result = have || { url: null };
  if (best) {
    // never replace a saved video with a worse one
    const newType = bestScore === 3 ? 'video' : 'audio';
    result = { url: 'https://www.youtube.com/watch?v=' + best, type: newType };
    patch.auto_youtube = result.url;
    patch.auto_youtube_type = newType;
  }
  await fetch(SUPABASE_URL + '/rest/v1/songs?id=eq.' + id, { method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, sb), body: JSON.stringify(patch) });
  return json(result);
}