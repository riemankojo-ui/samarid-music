export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://kamnfnukaizdglntcdvi.supabase.co';
const HOUR = 60 * 60 * 1000;

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/[^a-z0-9]+/g, ' ').trim();
}

function words(s) { return norm(s).split(' ').filter(Boolean); }

function wordScore(ytTitle, songTitle, artistName) {
  const tw = words(ytTitle);
  const sw = words(songTitle);
  const aw = words(artistName);
  // how many song title words appear in yt title
  const titleHits = sw.filter(w => tw.includes(w)).length;
  const titleRatio = sw.length ? titleHits / sw.length : 0;
  // how many artist words appear in yt title or channel
  return { titleRatio, titleHits, artistInTitle: aw.length ? aw.filter(w => tw.includes(w)).length / aw.length : 0 };
}

// score: 3 = official video, 2 = distributor "Topic" audio, 1 = other audio / plain upload, null = not a match
function rate(item, title, artist, featuring) {
  const t = norm(item.snippet.title), ch = norm(item.snippet.channelTitle);
  const { titleRatio, titleHits } = wordScore(t, title, artist);
  const chWords = words(ch), aWords = words(artist);
  const fWords = words(featuring || '');
  const artistInCh = aWords.length ? aWords.filter(w => chWords.includes(w)).length / aWords.length : 0;
  const tWords = words(t);

  // need at least 60% of song title words to match, or at least 2 words
  if (titleRatio < 0.6 && titleHits < 2) return null;

  // block covers/remixes/etc
  if (/\b(cover|remix|reaction|karaoke|instrumental|slowed|sped up|live session|tutorial)\b/.test(t)) return null;

  const isOfficialVideo = /official (music )?video|music video/.test(t);
  const isTopic = / topic$/.test(ch);
  const isAudioWord = /\b(audio|visuali[sz]er|lyrics?)\b/.test(t);

  // artist match: check title, channel, and featuring
  const artistInTitle = aWords.length ? aWords.filter(w => tWords.includes(w)).length / aWords.length : 0;
  const featInTitle = fWords.length ? fWords.filter(w => tWords.includes(w)).length / fWords.length : 0;
  const artistMatch = artistInTitle > 0.4 || artistInCh > 0.4 || featInTitle > 0.4;

  // if song title is only 1 word, artist match is REQUIRED to avoid picking wrong artist's song
  if (sw.length <= 1 && !artistMatch) return null;

  if (!isAudioWord && isOfficialVideo) return artistMatch ? 5 : 3;
  if (isTopic) return artistMatch ? 4 : 2;
  if (artistMatch) return 2;
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

  const r = await fetch(SUPABASE_URL + '/rest/v1/songs?id=eq.' + id + '&select=id,title,artist_name,featuring,youtube,auto_youtube,auto_youtube_type,auto_youtube_checked&limit=1', { headers: sb });
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows[0]) return json({ url: null, why: 'song not found', detail: Array.isArray(rows) ? 'no row' : JSON.stringify(rows).substring(0, 160) });
  const song = rows[0];

  // 1) a link pasted in the studio always wins
  if (song.youtube && String(song.youtube).trim()) return json({ url: song.youtube, type: 'manual' });

  // 2) cache: official video re-checked every 7 days, audio/topic every 30min, nothing found every 15min
  const have = song.auto_youtube ? { url: song.auto_youtube, type: song.auto_youtube_type } : null;
  const age = song.auto_youtube_checked ? Date.now() - new Date(song.auto_youtube_checked).getTime() : Infinity;
  if (have && have.type === 'video' && age < 7 * 24 * HOUR) return json(have);
  if (have && have.type !== 'video' && age < 30 * 60 * 1000) return json(have);
  if (!have && age < 15 * 60 * 1000) return json({ url: null });

  if (!ytKey) return json(have || { url: null, error: 'YOUTUBE_API_KEY is not set' });

  // 4) search YouTube — try up to 2 queries for best coverage
  const queries = [
    (song.artist_name || '') + ' ' + (song.title || ''),
    (song.title || '') + (song.featuring ? ' ft ' + song.featuring : '')
  ].filter(Boolean);

  let best = null, bestScore = 0, yd = null;

  for (const q of queries) {
    const yr = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=10&q=' + encodeURIComponent(q) + '&key=' + ytKey);
    yd = await yr.json();
    if (!yr.ok || !Array.isArray(yd.items)) {
      return json(have || { url: null, error: (yd && yd.error && yd.error.message || 'YouTube error').substring(0, 120) });
    }
    yd.items.forEach(function (it) {
      if (!it.id || !it.id.videoId) return;
      const sc = rate(it, song.title, song.artist_name, song.featuring);
      if (sc && sc > bestScore) { best = it.id.videoId; bestScore = sc; }
    });
    if (best && bestScore >= 3) break; // found official video, stop
  }

  const patch = { auto_youtube_checked: new Date().toISOString() };
  let result = have || { url: null };
  if (best) {
    const newType = bestScore >= 3 ? 'video' : 'audio';
    // always upgrade: audio → video, or better video score
    const shouldUpdate = !have || newType === 'video' || have.type !== 'video';
    if (shouldUpdate) {
      result = { url: 'https://www.youtube.com/watch?v=' + best, type: newType };
      patch.auto_youtube = result.url;
      patch.auto_youtube_type = newType;
    } else {
      result = have;
    }
  }
  await fetch(SUPABASE_URL + '/rest/v1/songs?id=eq.' + id, { method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, sb), body: JSON.stringify(patch) });
  return json(result);
}