/* FlexTune Studio - Import TXT fills the real forms (Add / Schedule, Single / Album).
   Load AFTER the main script in smstudio-8842.html:
   <script src="/import-fill.js"></script>
   Nothing is published by the import. It fills the form, opens it, and you tap Submit / Schedule yourself. */
(function () {
  'use strict';

  var MONTHS_L = ['january','february','march','april','may','june','july','august','september','october','november','december'];

  var TEMPLATE =
'Type: Album\n' +
'Release: Now\n' +
'Album: Lonely\n' +
'Artist: Jh linx\n' +
'Featuring: Samarid\n' +
'Category: Afrobeats\n' +
'Country: Ghana\n' +
'Cover: https://example.com/cover.jpg\n' +
'Description: About the whole album (used for any track without its own).\n' +
'\n' +
'Track 1: Missing You\n' +
'Featuring: Kofi Kinaata\n' +
'Description: About this track.\n' +
'Download: https://example.com/missing-you.mp3\n' +
'YouTube: https://youtube.com/watch?v=xxxx\n' +
'\n' +
'Track 2: Cry Baby\n' +
'Description: About this track.\n' +
'Download: https://example.com/cry-baby.mp3\n' +
'\n' +
'--- TO SCHEDULE, change these two lines and add Date + Time ---\n' +
'Release: Schedule\n' +
'Date: December 5, 2026\n' +
'Time: 6:00 PM\n' +
'\n' +
'--- FOR A SINGLE ---\n' +
'Type: Single\n' +
'Release: Now\n' +
'Title: Back To Sender\n' +
'Artist: Jh linx\n' +
'Category: Afrobeats\n' +
'Country: Ghana\n' +
'Description: A hard-hitting banger.\n' +
'Cover: https://example.com/cover.jpg\n' +
'Download: https://example.com/song.mp3\n' +
'Spotify: https://open.spotify.com/track/xxxxx\n' +
'YouTube: https://youtube.com/watch?v=xxxx';

  var LABELS = {
    type: 'type', release: 'release', date: 'date', time: 'time',
    album: 'album', title: 'title', song: 'title',
    artist: 'artist', 'artist name': 'artist', by: 'artist',
    featuring: 'feat', feat: 'feat', 'featuring artist': 'feat', 'featuring artists': 'feat',
    category: 'category', genre: 'category',
    country: 'country', location: 'country',
    cover: 'cover', 'cover art': 'cover', art: 'cover', image: 'cover',
    description: 'desc', about: 'desc',
    download: 'download', 'download mp3': 'download', 'download link': 'download', mp3: 'download', audio: 'download',
    spotify: 'spotify', 'spotify link': 'spotify',
    youtube: 'youtube', 'youtube link': 'youtube', video: 'youtube',
    lyrics: 'lyrics', lyric: 'lyrics'
  };

  function $(id) { return document.getElementById(id); }
  function setVal(id, v) {
    var el = $(id); if (!el || v === undefined || v === null) return;
    el.value = v;
    try { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
  }
  function say(msg, bad) {
    if (bad) { alert(msg); return; }
    if (typeof showEditToast === 'function') showEditToast(msg); else alert(msg);
  }

  /* ---------- PARSER ---------- */
  function parse(raw) {
    var lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
    var head = {}, tracks = [], cur = head, lastKey = null;

    lines.forEach(function (line) {
      if (/^\s*-{3,}.*$/.test(line)) return;               // --- separators / notes
      var t = line.match(/^\s*Track\s*\d+\s*[:\-]\s*(.*)$/i);
      if (t) { cur = { title: t[1].trim() }; tracks.push(cur); lastKey = 'title'; return; }
      var m = line.match(/^\s*([A-Za-z][A-Za-z ]{1,20}?)\s*[:\-]\s*(.*)$/);
      if (m) {
        var key = LABELS[m[1].trim().toLowerCase()];
        if (key) { cur[key] = m[2].trim(); lastKey = key; return; }
      }
      if (line.trim() && lastKey && (lastKey === 'desc' || lastKey === 'lyrics')) {
        cur[lastKey] = (cur[lastKey] ? cur[lastKey] + '\n' : '') + line.trim();   // continuation lines
      }
    });

    var typeRaw = (head.type || '').toLowerCase();
    var isAlbum = typeRaw === 'album' || tracks.length > 0 || !!head.album;
    var rel = (head.release || '').toLowerCase();
    var isScheduled = rel.indexOf('schedul') > -1 || rel.indexOf('later') > -1 || (!!head.date && rel.indexOf('now') === -1);
    return { head: head, tracks: tracks, isAlbum: isAlbum, isScheduled: isScheduled };
  }

  function parseDate(s) {
    if (!s) return null;
    var m = s.match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
    if (m) { var mi = MONTHS_L.indexOf(m[1].toLowerCase()); if (mi > -1) return { month: mi, day: +m[2], year: +m[3] }; }
    m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return { month: +m[2] - 1, day: +m[3], year: +m[1] };
    return null;
  }
  function parseTime(s) {
    var h = 12, min = 0, ap = 'AM';
    if (!s) return { hour: 12, minute: 0, ampm: 'AM' };
    var m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!m) return { hour: 12, minute: 0, ampm: 'AM' };
    h = +m[1]; min = m[2] ? +m[2] : 0;
    if (m[3]) ap = m[3].toUpperCase();
    else { ap = h >= 12 ? 'PM' : 'AM'; }
    if (h === 0) { h = 12; ap = 'AM'; } else if (h > 12) { h -= 12; ap = 'PM'; }
    min = Math.floor(min / 5) * 5;
    return { hour: h, minute: min, ampm: ap };
  }

  function fillDateTime(ids, ampmFn, head) {
    var d = parseDate(head.date);
    if (!d) return false;
    var t = parseTime(head.time);
    setVal(ids[0], d.month); setVal(ids[1], d.day); setVal(ids[2], d.year);
    setVal(ids[3], t.hour); setVal(ids[4], t.minute);
    ampmFn(t.ampm);
    return true;
  }

  /* ---------- FILL ---------- */
  function fillAlbum(p) {
    var h = p.head, s = p.isScheduled;
    var P = s ? 'schAlbum' : 'album';
    setVal(P + 'Name', h.album || h.title || '');
    setVal(P + 'Artist', h.artist || '');
    setVal(P + 'Cover', h.cover || '');
    setVal(P + 'Category', h.category || '');
    setVal(P + 'Country', /nigeria/i.test(h.country || '') ? 'Nigeria' : 'Ghana');
    if (!s) setVal('albumDate', h.date || '');

    var box = $(s ? 'schAlbumSongsContainer' : 'albumSongsContainer');
    box.innerHTML = '';
    if (s) schAlbumSongIndex = 0; else albumSongIndex = 0;

    p.tracks.forEach(function (t) {
      if (s) addSchAlbumSong(); else addAlbumSong();
      var item = box.lastElementChild, c = s ? 'sch-album-song-' : 'album-song-';
      function f(cls, v) { var el = item.querySelector('.' + c + cls); if (el && v) el.value = v; }
      f('title', t.title);
      f('feat', t.feat || h.feat);
      f('download', t.download);
      f('desc', t.desc || h.desc);
      f('youtube', t.youtube);
      f('lyrics', t.lyrics);
    });

    if (s) {
      goToPage('release'); switchReleaseTab('album', $('releaseTabAlbum'));
      if (h.date && !fillDateTime(['schAMonth','schADay','schAYear','schAHour','schAMinute'], setAAmPm, h)) return 'Could not read Date. Use: Date: December 5, 2026';
    } else {
      goToPage('add'); switchAddTab('album', $('addTabAlbum'));
    }
    var miss = [];
    if (!h.cover) miss.push('cover');
    p.tracks.forEach(function (t, i) { if (!t.download) miss.push('track ' + (i + 1) + ' MP3'); });
    return { ok: true, msg: (s ? 'Schedule album' : 'Add album') + ' filled: ' + p.tracks.length + ' songs.' + (miss.length ? ' Still needed: ' + miss.join(', ') + '.' : ' Check it, then tap the button.') };
  }

  function fillSingle(p) {
    var h = p.head, s = p.isScheduled;
    var P = s ? 'sch' : 'song';
    var title = h.title || (p.tracks[0] && p.tracks[0].title) || h.album || '';
    setVal(P + 'Title', title);
    setVal(P + 'Cover', h.cover || '');
    setVal(P + 'Artist', h.artist || '');
    setVal(P + 'Featuring', h.feat || '');
    setVal(P + 'Category', h.category || '');
    setVal(P + 'Country', /nigeria/i.test(h.country || '') ? 'Nigeria' : 'Ghana');
    setVal(P + 'Description', h.desc || '');
    setVal(P + 'Lyrics', h.lyrics || '');
    setVal(P + 'Download', h.download || '');
    setVal(P + 'Spotify', h.spotify || '');
    setVal(P + 'Youtube', h.youtube || '');
    if (s) {
      goToPage('release'); switchReleaseTab('single', $('releaseTabSingle'));
      if (h.date && !fillDateTime(['schMonth','schDay','schYear','schHour','schMinute'], setAmPm, h)) return 'Could not read Date. Use: Date: December 5, 2026';
    } else {
      setVal('songDate', h.date || '');
      goToPage('add'); switchAddTab('single', $('addTabSingle'));
      if (h.cover && typeof checkSongCover === 'function') checkSongCover();
    }
    var miss = [];
    if (!h.cover) miss.push('cover');
    if (!h.download) miss.push('MP3');
    return { ok: true, msg: (s ? 'Schedule single' : 'Add single') + ' filled.' + (miss.length ? ' Still needed: ' + miss.join(', ') + '.' : ' Check it, then tap the button.') };
  }

function run(text, force) {
  var p;
  if (force && text === null) {
    p = { head: {}, tracks: [], isAlbum: force.type === 'album', isScheduled: force.scheduled };
  } else {
    if (!String(text || '').trim()) { say('The file is empty.', true); return; }
    p = parse(text);
    if (force) { p.isAlbum = force.type === 'album'; p.isScheduled = force.scheduled; }
  }
  if (p.isAlbum && force) { while (p.tracks.length < (force.count || 1)) p.tracks.push({}); }
  
  // Show the choice card for both singles and albums
  if (!force) {
    showPublishChoice(p.isAlbum, function(isScheduled) {
      p.isScheduled = isScheduled;
      processParsedData(p);
    });
  } else {
    processParsedData(p);
  }
}

function processParsedData(p) {
  var r;
  if (p.isAlbum && !p.tracks.length) { say('Album found but no "Track 1: ..." lines.', true); return; }
  try { r = p.isAlbum ? fillAlbum(p) : fillSingle(p); } catch (e) { say('Import error: ' + e.message, true); return; }
  if (typeof r === 'string') { say(r, true); return; }
  window.scrollTo(0, 0);
  say(r.msg);
  var hasContent = p.isAlbum
    ? p.tracks.some(function (t) { return t && t.title; })
    : !!(p.head.title || p.head.album);
  if (hasContent) setTimeout(function () { autoTestVideos(p); }, 400);
}

function showPublishChoice(isAlbum, callback) {
  var old = document.getElementById('importChoiceModal'); if (old) old.remove();
  var o = document.createElement('div'); o.id = 'importChoiceModal';
  o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';
  
  var cardStyle = 'background:#1f1f1f;border:1px solid #333;border-radius:20px;padding:24px;width:100%;max-width:340px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.5);';
  var optBase = 'display:flex;align-items:center;gap:12px;padding:16px;border-radius:12px;border:2px solid #333;background:#0a0a0a;cursor:pointer;margin-bottom:10px;transition:all 0.15s;text-align:left;';
  
  o.innerHTML =
    '<div style="' + cardStyle + '">' +
      '<div style="font-size:40px;margin-bottom:10px;">' + (isAlbum ? '💿' : '🎵') + '</div>' +
      '<h3 style="color:#fff;font-size:20px;margin-bottom:6px;font-weight:900;">' + (isAlbum ? 'Album Detected' : 'Single Song Detected') + '</h3>' +
      '<p style="color:#888;font-size:13px;margin-bottom:20px;">Choose how to publish this release</p>' +
      
      '<div id="optAdd" style="' + optBase + '">' +
        '<div style="width:20px;height:20px;border-radius:50%;border:2px solid #555;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><div id="dotAdd" style="width:10px;height:10px;border-radius:50%;background:transparent;transition:0.15s;"></div></div>' +
        '<div><div style="color:#fff;font-weight:800;font-size:14px;">Add Now</div><div style="color:#888;font-size:11px;">Publish immediately</div></div>' +
      '</div>' +
      
      '<div id="optSchedule" style="' + optBase + '">' +
        '<div style="width:20px;height:20px;border-radius:50%;border:2px solid #555;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><div id="dotSchedule" style="width:10px;height:10px;border-radius:50%;background:transparent;transition:0.15s;"></div></div>' +
        '<div><div style="color:#fff;font-weight:800;font-size:14px;">Schedule Release</div><div style="color:#888;font-size:11px;">Pick a future date and time</div></div>' +
      '</div>' +
      
      '<button id="choiceFillBtn" style="width:100%;padding:14px;margin-top:10px;background:#ff8800;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:900;font-family:inherit;cursor:pointer;">Fill Form</button>' +
      '<button id="choiceCancelBtn" style="width:100%;padding:14px;margin-top:8px;background:transparent;color:#999;border:none;border-radius:12px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;">Cancel</button>' +
    '</div>';
    
  document.body.appendChild(o);
  
  var selectedValue = false; // false = Add Now, true = Schedule
  
  var optAdd = document.getElementById('optAdd');
  var optSchedule = document.getElementById('optSchedule');
  var dotAdd = document.getElementById('dotAdd');
  var dotSchedule = document.getElementById('dotSchedule');
  
  function updateUI() {
    if (selectedValue === false) {
      optAdd.style.borderColor = '#ff8800';
      optAdd.style.background = 'rgba(255,136,0,0.08)';
      dotAdd.style.background = '#ff8800';
      
      optSchedule.style.borderColor = '#333';
      optSchedule.style.background = '#0a0a0a';
      dotSchedule.style.background = 'transparent';
    } else {
      optSchedule.style.borderColor = '#1d9bf0';
      optSchedule.style.background = 'rgba(29,155,240,0.08)';
      dotSchedule.style.background = '#1d9bf0';
      
      optAdd.style.borderColor = '#333';
      optAdd.style.background = '#0a0a0a';
      dotAdd.style.background = 'transparent';
    }
  }
  
  updateUI();
  
  optAdd.onclick = function() { selectedValue = false; updateUI(); };
  optSchedule.onclick = function() { selectedValue = true; updateUI(); };
  
  function close() { o.remove(); }
  
  document.getElementById('choiceFillBtn').onclick = function() { close(); callback(selectedValue); };
  document.getElementById('choiceCancelBtn').onclick = function() { close(); };
}

function autoTestVideos(p) {
  try {
    if (p.isAlbum) {
      var containerId = p.isScheduled ? 'schAlbumSongsContainer' : 'albumSongsContainer';
      var prefix = p.isScheduled ? 'sch-album-song-' : 'album-song-';
      var artistId = p.isScheduled ? 'schAlbumArtist' : 'albumArtist';
      var container = document.getElementById(containerId);
      if (!container || typeof window.testVideoFor !== 'function') return;
      var items = container.querySelectorAll('.album-song-item');
      
      // Search EVERY song, but stagger them by 1.5 seconds
      for (let i = 0; i < items.length; i++) {
        let item = items[i]; // Using 'let' fixes the bug where it searched the same song twice
        setTimeout(function () {
          var titleEl = item.querySelector('.' + prefix + 'title');
          var featEl = item.querySelector('.' + prefix + 'feat');
          var ytEl = item.querySelector('.' + prefix + 'youtube');
          var box = item.querySelector('.album-yt-test');
          if (titleEl && ytEl && box) {
            window.testVideoFor(titleEl, artistId, featEl, ytEl, box);
          }
        }, i * 1500); // Wait 1.5 seconds between each song
      }
    } else if (typeof window.testVideoFor === 'function') {
      if (p.isScheduled) {
        window.testVideoFor('schTitle', 'schArtist', 'schFeaturing', 'schYoutube', 'schYtTest');
      } else {
        window.testVideoFor('songTitle', 'songArtist', 'songFeaturing', 'songYoutube', 'songYtTest');
      }
    }
  } catch (e) { console.warn('Auto test video failed:', e); }
}

  /* ---------- HOOKS (replace the old import behaviour) ---------- */
  window.handleImportFile = function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var fn = $('importFilename'); if (fn) fn.innerText = file.name;
    var rd = new FileReader();
    rd.onload = function (e) { run(e.target.result || ''); };
    rd.onerror = function () { say('Could not read file.', true); };
    rd.readAsText(file);
    event.target.value = '';
  };
  window.parseImport = function () {
    var area = $('importPasteArea');
    if (!area || !area.value.trim()) { say('Choose a .txt file (it fills automatically) or paste text first.', true); return; }
    run(area.value);
  };

  /* ---------- IMPORT BUTTON + POPUP on Add and Release pages ---------- */
  function openImportPopup(scheduled) {
    var old = $('impPop'); if (old) old.remove();
    var type = 'single';
    var o = document.createElement('div'); o.id = 'impPop';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
    var tg = 'flex:1;padding:12px;border-radius:10px;border:1px solid #333;background:#0a0a0a;color:#999;font-size:14px;font-weight:800;font-family:inherit';
    var bt = 'width:100%;padding:13px;border-radius:10px;border:0;font-size:14px;font-weight:800;font-family:inherit;margin-top:10px';
    o.innerHTML =
      '<div style="width:100%;max-width:340px;background:#1f1f1f;border:1px solid #2e2e2e;border-radius:16px;padding:20px;color:#fff">' +
        '<div style="font-size:17px;font-weight:900;margin-bottom:4px">Import</div>' +
        '<div style="font-size:12px;color:#999;margin-bottom:14px">' + (scheduled ? 'For Schedule Release' : 'For Add New (publish now)') + '</div>' +
        '<div style="display:flex;gap:8px"><button data-t="single" style="' + tg + '">Single</button><button data-t="album" style="' + tg + '">Album</button></div>' +
        '<div id="impCountRow" style="display:none;margin-top:14px"><div style="font-size:11px;color:#999;letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:6px">Total songs</div>' +
        '<input id="impCount" type="number" min="1" max="50" value="5" style="width:100%;padding:12px;background:#0a0a0a;border:1px solid #333;border-radius:10px;color:#fff;font-size:15px;font-family:inherit"></div>' +
        '<input id="impFile" type="file" accept=".txt,text/plain" style="display:none">' +
        '<button id="impPick" style="' + bt + ';background:#ff8800;color:#fff">Choose .txt file</button>' +
        '<button id="impBlank" style="' + bt + ';background:#222;color:#fff;border:1px solid #333">Open blank forms</button>' +
        '<button id="impCancel" style="' + bt + ';background:transparent;color:#999">Cancel</button>' +
      '</div>';
    document.body.appendChild(o);
    function paint() {
      o.querySelectorAll('[data-t]').forEach(function (b) {
        var on = b.getAttribute('data-t') === type;
        b.style.background = on ? '#ff8800' : '#0a0a0a'; b.style.color = on ? '#fff' : '#999'; b.style.borderColor = on ? '#ff8800' : '#333';
      });
      $('impCountRow').style.display = type === 'album' ? 'block' : 'none';
    }
    function force() {
      var n = parseInt($('impCount').value, 10); if (!n || n < 1) n = 1; if (n > 50) n = 50;
      return { scheduled: scheduled, type: type, count: n };
    }
    o.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { type = b.getAttribute('data-t'); paint(); }; });
    $('impPick').onclick = function () { $('impFile').click(); };
    $('impFile').onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      var fc = force(), rd = new FileReader();
      rd.onload = function (e) { o.remove(); run(e.target.result || '', fc); };
      rd.onerror = function () { say('Could not read file.', true); };
      rd.readAsText(f);
    };
    $('impBlank').onclick = function () { var fc = force(); o.remove(); run(null, fc); };
    $('impCancel').onclick = function () { o.remove(); };
    o.onclick = function (e) { if (e.target === o) o.remove(); };
    paint();
  }

  window.openImportPopup = openImportPopup;

  function addImportButtons() {
    [['pageAdd', false], ['pageRelease', true]].forEach(function (x) {
      var page = $(x[0]); if (!page || page.querySelector('.imp-open')) return;
      var h = page.querySelector('.page-title') || page.firstElementChild; if (!h) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'imp-open';
      b.textContent = 'Import';
      b.style.cssText = 'position:absolute;top:0;right:0;background:#ff8800;color:#fff;border:0;border-radius:18px;padding:9px 18px;font-size:13px;font-weight:800;font-family:inherit;z-index:5';
      b.onclick = function () { openImportPopup(x[1]); };
      page.style.position = 'relative';
      page.insertBefore(b, page.firstChild);
    });
  }
  try { addImportButtons(); window.addEventListener('load', addImportButtons); setTimeout(addImportButtons, 800); }
  catch (e) { alert('import-fill.js error: ' + e.message); }

  var tpl = $('importTemplate'); if (tpl) tpl.textContent = TEMPLATE;
  var btn = document.querySelector('#pageImport .main-btn'); if (btn) btn.innerHTML = '<i class="fas fa-magic"></i> Read & Fill Form';
})();
