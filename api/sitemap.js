export default async function handler(req, res) {
  const SUPABASE_URL = "https://kamnfnukaizdglntcdvi.supabase.co";
  const SUPABASE_KEY = "sb_publishable__YPveWCU1NMYYsegLLYskg_38s0VRip";
  const SITE_URL = "https://samarid-music.vercel.app";

  try {
    const songsRes = await fetch(
      SUPABASE_URL + '/rest/v1/songs?select=id,title,artist_name,album_name&order=id.desc',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    const songs = await songsRes.json();
    if (!Array.isArray(songs)) throw new Error('Could not fetch songs');

    const artistSet = new Set();
    songs.forEach(s => { if (s.artist_name && s.artist_name.trim()) artistSet.add(s.artist_name.trim()); });

    const albumSet = new Set();
    songs.forEach(s => { if (s.album_name && s.album_name.trim()) albumSet.add(s.album_name.trim()); });

    const artists = Array.from(artistSet);
    const albums = Array.from(albumSet);
    const today = new Date().toISOString().split('T')[0];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    const staticPages = [
      { url: '/', priority: '1.0', freq: 'daily' },
      { url: '/albums.html', priority: '0.9', freq: 'weekly' },
      { url: '/artists.html', priority: '0.9', freq: 'weekly' },
      { url: '/videos.html', priority: '0.8', freq: 'weekly' },
      { url: '/about.html', priority: '0.6', freq: 'monthly' },
      { url: '/promo.html', priority: '0.6', freq: 'monthly' },
      { url: '/distributors.html', priority: '0.5', freq: 'monthly' }
    ];

    staticPages.forEach(p => {
      xml += '  <url>\n    <loc>' + SITE_URL + p.url + '</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>' + p.freq + '</changefreq>\n    <priority>' + p.priority + '</priority>\n  </url>\n';
    });

    artists.forEach(name => {
      xml += '  <url>\n    <loc>' + SITE_URL + '/artist-template.html?name=' + encodeURIComponent(name) + '</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n';
    });

    albums.forEach(name => {
      xml += '  <url>\n    <loc>' + SITE_URL + '/album.html?name=' + encodeURIComponent(name) + '</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n';
    });

    songs.forEach(s => {
      xml += '  <url>\n    <loc>' + SITE_URL + '/song.html?id=' + s.id + '</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n';
    });

    xml += '</urlset>\n';

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).send(xml);
  } catch (e) {
    res.status(500).send('Error generating sitemap: ' + e.message);
  }
                  }
