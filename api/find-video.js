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
  const titleHits = sw.filter(w => tw.includes(w)).length;
  const titleRatio = sw.length ? titleHits / sw.length : 0;
  return { titleRatio, titleHits, artistInTitle: aw.length ? aw.filter(w => tw.includes(w)).length / aw.length : 0 };
}

function rate(item, title, artist, featuring) {
  const t = norm(item.snippet.title), ch = norm(item.snippet.channelTitle);
  const sw = words(title);
  const { titleRatio, titleHits } = wordScore(t, title, artist);
  const chWords = words(ch), aWords = words(artist);
  const fWords = words(featuring || '');
  const artistInCh = aWords.length ? aWords.filter(w => chWords.includes(w)).length / aWords.length : 0;
  const tWords = words(t);

  if (titleRatio < 0.6 && titleHits < 2) return null;
  if (/\b(cover|remix|reaction|karaoke|instrumental|slowed|sped up|live session|tutorial)\b/.test(t)) return null;

  const isOfficialVideo = /official (music )?video|music video/.test(t);
  const isTopic = / topic$/.test(ch);
  const isAudioWord = /\b(audio|visuali[sz]er|lyrics?)\b/.test(t);

  const artistInTitle = aWords.length ? aWords.filter(w => tWords.includes(w)).length / aWords.length : 0;
  const featInTitle = fWords.length ? fWords.filter(w => tWords.includes(w)).length / fWords.length : 0;
  const artistMatch = artistInTitle > 0.5 || artistInCh > 0.5 || featInTitle > 0.5;

  if (!artistMatch) return null;

  const dashParts = t.split(/\s*-\s*/);
  if (dashParts.length >= 2) {
    const titleArtistPart = words(dashParts[0]);
    const ourArtistWords = [...aWords, ...fWords];
    const titleArtistMatchesOurs = ourArtistWords.some(w => titleArtistPart.includes(w));
    const titleArtistMatchesOther = titleArtistPart.length > 0 && !titleArtistMatchesOurs;
    if (titleArtistMatchesOther) return null;
  }

  const isVisualizer = /\bvisualiz?er\b/.test(t);
  if (!isAudioWord && !isVisualizer && isOfficialVideo) return artistMatch ? 6 : 4;
  if (!isAudioWord && !isVisualizer && artistMatch) return 5;
  if (isVisualizer && artistMatch) return 3;
  if (isTopic && artistMatch) return 2;
  if (artistMatch) return 1;
  return null;
}

async function searchInvidious(query, title, artist, featuring) {
  const instances = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be'];
  for (const instance of instances) {
    try {
      const res = await fetch(instance + '/api/v1/search?q=' + encodeURIComponent(query) + '&type=video');
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;

      const items = data.map(item => ({
        id: { videoId: item.videoId },
        snippet: {
          title: item.title,
          channelTitle: item.author,
          thumbnails: { medium: { url: item.videoThumbnails?.[0]?.url || '' }, default: { url: item.videoThumbnails?.[0]?.url || '' } }
        }
      }));

      let best = null, bestScore = 0;
      items.forEach(it => {
        const sc = rate(it, title, artist, featuring);
        if (sc && sc > bestScore) { bestScore = sc; best = it; }
      });
      if (best) return { videoId: best.id.videoId, score: bestScore, title: best.snippet.title, channel: best.snippet.channelTitle, thumb: best.snippet.thumbnails.medium.url };
    } catch (e) {}
  }
  return null;
}

async function searchPiped(query, title, artist, featuring) {
  const instances = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee'];
  for (const instance of instances) {
    try {
      const res = await fetch(instance + '/search?q=' + encodeURIComponent(query) + '&filter=videos');
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.items) continue;
      
      const items = data.items.map(item => ({
        id: { videoId: item.url.split('?v=')[1] },
        snippet: {
          title: item.title,
          channelTitle: item.uploaderName,
          thumbnails: { medium: { url: item.thumbnail }, default: { url: item.thumbnail } }
        }
      }));

      let best = null, bestScore = 0;
      items.forEach(it => {
        const sc = rate(it, title, artist, featuring);
        if (sc && sc > bestScore) { bestScore = sc; best = it; }
      });
      if (best) return { videoId: best.id.videoId, score: bestScore, title: best.snippet.title, channel: best.snippet.channelTitle, thumb: best.snippet.thumbnails.medium.url };
    } catch (e) {}
  }
  return null;
}

async function findCandidates(song, ytKey) {
  const bestBy = {};
  let quotaHit = false;

  if (ytKey) {
    const cq = [
      (song.artist_name || '') + ' ' + (song.title || '') + ' official video',
      (song.artist_name || '') + ' ' + (song.title || '') + ' visualizer',
      (song.artist_name || '') + ' ' + (song.title || '')
    ];
    
    for (const q of cq) {
      try {
        const cr = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=10&q=' + encodeURIComponent(q) + '&key=' + ytKey);
        const cd = await cr.json();
        if (!cr.ok || !Array.isArray(cd.items)) {
          if (cd && cd.error && cd.error.message && (cd.error.message.includes('quota') || cd.error.message.includes('limit'))) {
             quotaHit = true;
             break;
          }
          continue;
        }
        cd.items.forEach(function (it) {
          if (!it.id || !it.id.videoId) return;
          const sc = rate(it, song.title, song.artist_name, song.featuring);
          if (!sc) return;
          const kind = sc >= 4 ? 'video' : (sc === 3 ? 'visualizer' : 'audio');
          if (!bestBy[kind] || sc > bestBy[kind].score) {
            const th = it.snippet.thumbnails || {};
            bestBy[kind] = {
              score: sc, kind: kind,
              label: kind === 'video' ? 'Official video' : (kind === 'visualizer' ? 'Visualizer' : 'Audio'),
              url: 'https://www.youtube.com/watch?v=' + it.id.videoId,
              title: it.snippet.title, channel: it.snippet.channelTitle,
              thumb: (th.medium || th.default || {}).url || ''
            };
          }
        });
      } catch(e) {}
    }
  } else {
     quotaHit = true;
  }

  if (quotaHit || Object.keys(bestBy).length === 0) {
     const query = (song.artist_name || '') + ' ' + (song.title || '') + ' official';
     let fallbackResult = await searchInvidious(query, song.title, song.artist_name, song.featuring);
     
     if (!fallbackResult) {
         fallbackResult = await searchPiped(query, song.title, song.artist_name, song.featuring);
     }
     
     if (fallbackResult) {
        const kind = fallbackResult.score >= 4 ? 'video' : (fallbackResult.score === 3 ? 'visualizer' : 'audio');
        bestBy[kind] = {
          score: fallbackResult.score, kind: kind,
          label: (kind === 'video' ? 'Official video' : (kind === 'visualizer' ? 'Visualizer' : 'Audio')) + ' (Free)',
          url: 'https://www.youtube.com/watch?v=' + fallbackResult.videoId,
          title: fallbackResult.title, channel: fallbackResult.channel, thumb: fallbackResult.thumb
        };
     }
  }

  return { 
    candidates: ['video', 'visualizer', 'audio'].filter(function (k) { return bestBy[k]; }).map(function (k) { return bestBy[k]; }),
    error: quotaHit && Object.keys(bestBy).length === 0 ? 'No matches found.' : null
  };
}

export default async function handler(req) {
  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim();
  const force = url.searchParams.get('force') === '1';
  const qTitle = (url.searchParams.get('title') || '').trim();

  if (url.searchParams.get('candidates') === '1' && qTitle) {
    return json(await findCandidates({ title: qTitle, artist_name: (url.searchParams.get('artist') || '').trim(), featuring: (url.searchParams.get('featuring') || '').trim() }, (process.env.YOUTUBE_API_KEY || '').trim()));
  }
  if (!/^[0-9a-zA-Z-]+$/.test(id)) return json({ error: 'bad id' }, 400);

  const ytKey = (process.env.YOUTUBE_API_KEY || '').trim();
  const key = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!key) return json({ error: 'SUPABASE_SERVICE_KEY is not set' }, 500);
  const sb = { apikey: key, 'Content-Type': 'application/json' };
  if (key.indexOf('eyJ') === 0) sb.Authorization = 'Bearer ' + key;

  const r = await fetch(SUPABASE_URL + '/rest/v1/songs?id=eq.' + id + '&select=id,title,artist_name,featuring,youtube,auto_youtube,auto_youtube_type,auto_youtube_checked,auto_youtube_score&limit=1', { headers: sb });
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows[0]) return json({ url: null, why: 'song not found' });
  const song = rows[0];

  if (song.youtube && String(song.youtube).trim()) return json({ url: song.youtube, type: 'manual' });

  const have = song.auto_youtube ? { url: song.auto_youtube, type: song.auto_youtube_type } : null;
  const age = song.auto_youtube_checked ? Date.now() - new Date(song.auto_youtube_checked).getTime() : Infinity;
  if (!force) {
    if (have && have.type === 'video' && age < 7 * 24 * HOUR) return json(have);
    if (have && have.type !== 'video' && age < 30 * 60 * 1000) return json(have);
    if (!have && age < 15 * 60 * 1000) return json({ url: null });
  }

  if (ytKey) {
    const queries = [
      (song.artist_name || '') + ' ' + (song.title || '') + ' official',
      (song.artist_name || '') + ' ' + (song.title || '')
    ].filter(q => q.trim());

    let best = null, bestScore = 0, quotaHit = false;

    for (const q of queries) {
      const yr = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=10&q=' + encodeURIComponent(q) + '&key=' + ytKey);
      const yd = await yr.json();
      if (!yr.ok || !Array.isArray(yd.items)) {
        if (yd && yd.error && yd.error.message && yd.error.message.includes('quota')) {
          quotaHit = true;
          break;
        }
        continue;
      }
      yd.items.forEach(function (it) {
        if (!it.id || !it.id.videoId) return;
        const sc = rate(it, song.title, song.artist_name, song.featuring);
        if (sc && sc > bestScore) { best = it.id.videoId; bestScore = sc; }
      });
      if (best && bestScore >= 3) break;
    }

    if (best) {
      const patch = { auto_youtube_checked: new Date().toISOString() };
      const newType = bestScore >= 3 ? 'video' : 'audio';
      const haveScore = song.auto_youtube_score || 0;
      let result = have || { url: null };
      if (!have || bestScore > haveScore) {
        result = { url: 'https://www.youtube.com/watch?v=' + best, type: newType };
        patch.auto_youtube = result.url;
        patch.auto_youtube_type = newType;
        patch.auto_youtube_score = bestScore;
      }
      await fetch(SUPABASE_URL + '/rest/v1/songs?id=eq.' + id, { method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, sb), body: JSON.stringify(patch) });
      return json(result);
    }

    if (!quotaHit) {
      const patch = { auto_youtube_checked: new Date().toISOString() };
      await fetch(SUPABASE_URL + '/rest/v1/songs?id=eq.' + id, { method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, sb), body: JSON.stringify(patch) });
      return json(have || { url: null });
    }
  }

  const query = (song.artist_name || '') + ' ' + (song.title || '') + ' official';
  let invResult = await searchInvidious(query, song.title, song.artist_name, song.featuring);
  if (!invResult) {
      invResult = await searchPiped(query, song.title, song.artist_name, song.featuring);
  }

  const patch = { auto_youtube_checked: new Date().toISOString() };
  if (invResult) {
    const newType = invResult.score >= 3 ? 'video' : 'audio';
    const result = { url: 'https://www.youtube.com/watch?v=' + invResult.videoId, type: newType };
    patch.auto_youtube = result.url;
    patch.auto_youtube_type = newType;
    patch.auto_youtube_score = invResult.score;
    await fetch(SUPABASE_URL + '/rest/v1/songs?id=eq.' + id, { method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, sb), body: JSON.stringify(patch) });
    return json(result);
  }

  await fetch(SUPABASE_URL + '/rest/v1/songs?id=eq.' + id, { method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, sb), body: JSON.stringify(patch) });
  return json({ url: null, error: 'No matches found.' });
}