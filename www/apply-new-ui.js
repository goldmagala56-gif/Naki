// Naki new interface (v2): navigation, Home, Session screen, Export sheet, editor tool column, teal accent.
// Run from the www folder:   node apply-new-ui.js
// Always starts from your ORIGINAL index.html (kept as index.html.bak), so it is safe to run again after an update.
const fs = require('fs'), path = require('path');
const dir = process.cwd(), P = f => path.join(dir, f);
function fail(m){ console.error('\nSTOPPED: ' + m + '\nNothing was changed.'); process.exit(1); }
function once(s, a, label){ const n = s.split(a).length - 1; if (n !== 1) fail('could not find "' + label + '" exactly once in index.html (found ' + n + '). Is this the index.html I was given?'); }
function swap(s, a, b, label){ once(s, a, label); return s.replace(a, () => b); }
for (const f of ['index.html', 'theme.css', 'newui.css']) if (!fs.existsSync(P(f))) fail(f + ' is not in this folder (' + dir + ').');
let src = fs.readFileSync(P('index.html'), 'utf8');
if (src.indexOf('newui.css') >= 0){
  if (!fs.existsSync(P('index.html.bak'))) fail('index.html already has the new look but there is no index.html.bak to start from. Restore your original index.html and run again.');
  src = fs.readFileSync(P('index.html.bak'), 'utf8');
  if (src.indexOf('newui.css') >= 0) fail('index.html.bak is not the original file.');
} else fs.writeFileSync(P('index.html.bak'), src);
const crlf = src.indexOf('\r\n') >= 0; let h = src.replace(/\r\n/g, '\n');

// --- head
h = swap(h, '<link rel="stylesheet" href="theme.css">', '<link rel="stylesheet" href="theme.css">\n<link rel="stylesheet" href="newui.css">', 'theme.css link');
h = swap(h, '<meta name="theme-color" content="#111b24">', '<meta name="theme-color" content="#0c0d0f">', 'theme-color meta');
// --- navigation + top bar
const NAV = [['home', 'house', 'Home'], ['session', 'mic-vocal', 'Session'], ['editor', 'scissors', 'Editor'], ['settings', 'settings', 'Settings']];
const nb = NAV.map(n => '<button class="nb" data-noskin data-go="' + n[0] + '" aria-label="' + n[2] + '"><span data-ic="' + n[1] + '"></span>' + n[2] + '</button>').join('\n    ');
h = swap(h, '<body>\n<header class="top">', '<body>\n<nav class="rail" id="rail" aria-label="Main">\n    <img class="logo" src="icon.svg" alt="Naki" onerror="this.remove()">\n    ' + nb + '\n  </nav>\n<nav class="bottomnav" id="bottomnav" aria-label="Main">\n    ' + nb + '\n  </nav>\n<header class="top">', 'body + header');
h = swap(h, '<div class="brand">Naki<i></i></div>\n</header>',
  '<div class="brand">Naki<i></i></div>\n  <div id="topTitle" class="ttl"></div>\n  <span id="recPill" class="rec" hidden><i></i><span id="recPillT">Recording</span></span>\n  <span id="offlineChip" class="chip2" hidden><span data-ic="wifi-off" data-s="14"></span>Works offline</span>\n  <button id="btnSettingsTop" class="back" data-noskin aria-label="Device check"><span data-ic="settings"></span></button>\n</header>', 'brand + end of header');
// --- Home
{
  const a = h.indexOf('<section id="view-home">'); if (a < 0) fail('Home section not found.');
  const b = h.indexOf('</section>', a) + 10; const old = h.slice(a, b);
  ['id="btnNew"', 'id="btnCheck"', 'id="btnInstall"', 'id="sessList"', 'id="verLine"'].forEach(k => { if (old.indexOf(k) < 0) fail('the Home section does not contain ' + k); });
  h = h.slice(0, a) + `<section id="view-home">
    <h1>What do you want to make today?</h1>
    <p class="lead">Narrate a movie live, or edit any video on the timeline. Everything is saved on this device and works without internet.</p>
    <div class="hero">
      <div class="act"><div class="tile" data-ic="mic-vocal" data-s="26"></div><h3>Session</h3><p>Play a movie, talk over it and pause whenever you want to explain. Then export it, or send it to the editor.</p><button id="btnNew" data-noskin class="btn primary big"><span data-ic="mic"></span>Start a session</button></div>
      <div class="act alt"><div class="tile" data-ic="clapperboard" data-s="26"></div><h3>Editor</h3><p>Open any video and edit it on the timeline: cut, text, captions, effects, music and more. No narration needed.</p><button id="btnEditor" data-noskin class="btn big"><span data-ic="scissors"></span>Edit a video</button></div>
    </div>
    <div class="drop"><div class="tile" data-ic="file-up"></div><div class="dtx"><b>Import a video</b>Choose a file (or drop it here), then pick: edit it, or narrate it.</div><button id="btnImport" data-noskin class="btn"><span data-ic="upload"></span>Choose video</button></div>
    <h2>Your projects</h2>
    <div id="sessList"></div>
    <div class="home-sub"><button id="btnCheck" class="btn ghost">Check this device</button><button id="btnInstall" class="btn" hidden>Install Naki on this phone</button></div>
    <p id="verLine" class="dim small" style="margin-top:20px"></p>
  </section>` + h.slice(b);
}
// --- Export: the old buttons move into one sheet
{
  const a = h.indexOf('<h3>Export</h3>'), b = h.indexOf('<details class="opts">\n            <summary>Advanced');
  if (a < 0 || b < a) fail('the Export block was not found.');
  const old = h.slice(a, b); ['id="bExport"', 'id="exportBox"', 'id="bShapeLandscape"', 'id="bQualitySharper"', 'id="bPickLogo"'].forEach(k => { if (old.indexOf(k) < 0) fail('the Export block does not contain ' + k); });
  h = h.slice(0, a) + h.slice(b);
}
h = swap(h, '<button id="bHome" class="btn">Home</button>', '<button id="bOpenExport" data-noskin class="btn"><span data-ic="download"></span>Export</button>\n            <button id="bHome" class="btn">Home</button>', 'Home button');
const SHEET = `<div id="exportSheet" class="veil" hidden><div class="sheet" role="dialog" aria-label="Export">
  <h3>Export <button id="bSheetClose" class="btn icon ghost" data-noskin aria-label="Close"><span data-ic="x"></span></button></h3>
  <div class="pv"><div class="pvth"></div><div style="min-width:0"><b id="shName"></b><div id="shMeta" class="dim small"></div></div></div>
  <div class="opt"><label>Shape <span>TikTok is tall</span></label><div class="seg"><button type="button" id="bShapeLandscape" aria-pressed="true">Landscape</button><button type="button" id="bShapeVertical" aria-pressed="false">Vertical (TikTok)</button></div></div>
  <div class="opt"><label>Resolution <span>Original = the movie's own size</span></label><div class="seg" id="segRes"><button type="button" data-res="480" aria-pressed="false">480p</button><button type="button" data-res="720" aria-pressed="true">720p</button><button type="button" data-res="1080" aria-pressed="false">1080p</button><button type="button" data-res="orig" aria-pressed="false">Original</button></div></div>
  <div class="opt"><label>Quality <span>bigger file, sharper picture</span></label><div class="seg"><button type="button" id="bQualityFaster" aria-pressed="true">Recommended</button><button type="button" id="bQualitySharper" aria-pressed="false">Higher (slower)</button></div></div>
  <div class="opt"><label>Logo <span>optional</span></label><div class="row wrap" style="margin:0"><button type="button" id="bPickLogo" class="btn">Add logo</button><span id="logoName" class="dim small" style="align-self:center"></span><button type="button" id="bClearLogo" class="btn" hidden>Remove logo</button></div></div>
  <div class="est"><span data-ic="info" data-s="18"></span><span id="shEst"></span></div>
  <div id="exportBox" hidden>
    <div class="field">
      <label for="exportStatus" style="margin-bottom:6px"><span id="exportStatus">Working...</span> <span id="exportPct" class="num"></span></label>
      <div class="meter"><div id="exportBar" style="position:absolute;left:0;top:0;bottom:0;width:0;background:var(--mango);border-radius:8px"></div></div>
    </div>
    <div id="exportDone" hidden>
      <video id="exportPreview" controls playsinline style="width:100%;border-radius:12px;background:#000;margin:10px 0"></video>
      <div class="row wrap">
        <button id="bShareVideo" class="btn primary" hidden>Share / save to gallery</button>
        <a id="exportDownload" class="btn" download="naki.mp4">Download file</a>
      </div>
      <p class="dim small">Watch it here before saving it anywhere. If "Share" isn't available on this device, use Download.</p>
    </div>
  </div>
  <p class="dim small">Builds your finished video on this device. The first time it needs internet once (about 30&nbsp;MB); after that it works offline. The size above is an estimate.</p>
  <div class="foot"><button id="bSheetCancel" class="btn">Close</button><button id="bExport" data-noskin class="btn primary big"><span data-ic="download"></span>Export video</button></div>
</div></div>
`;
h = swap(h, '<input type="file" id="filePick"', SHEET + '<input type="file" id="filePick"', 'filePick input');
h = swap(h, '<audio id="voice" preload="auto"></audio>', `<div id="importModal" class="modalWrap" hidden>
  <div class="modalCard">
    <h3 style="margin-top:0">What do you want to do?</h3>
    <p id="importName" class="dim small" style="overflow-wrap:anywhere"></p>
    <div class="row wrap"><button id="bImportEdit" class="btn primary" data-noskin>Edit it</button><button id="bImportNarrate" class="btn" data-noskin>Narrate it</button></div>
    <p class="dim small">Edit opens the timeline with the video and its own sound. Narrate lets you record your voice over it.</p>
    <div class="row"><button id="bImportCancel" class="btn ghost" data-noskin>Cancel</button></div>
  </div>
</div>
<audio id="voice" preload="auto"></audio>`, 'voice audio element');
// --- editor Export button now opens the sheet
{
  const a = h.indexOf('onExport: function(){'), e = '  },\n  music: $(\'music\'),', b = h.indexOf(e, a);
  if (a < 0 || b < 0 || h.slice(a, b).indexOf('b.click()') < 0) fail('the editor onExport hook was not found.');
  h = h.slice(0, a) + 'onExport: function(){ openExportSheet(); },\n  music: $(\'music\'),' + h.slice(b + e.length);
}
// --- resolution choice
h = swap(h, "  var cap = sharper ? 1080 : 720;\n  var targetH = Math.max(480, Math.min(cap, sourceH));",
  "  var targetH = S.exportRes === 'orig' ? sourceH : Math.max(240, Math.min(+S.exportRes || 720, sourceH));\n  targetH -= targetH % 2;", 'export size lines');
// --- project cards
{
  const s0 = h.indexOf('all.forEach(function(s){\n      var label'), e0 = "'Delete'))));\n    });", b0 = h.indexOf(e0, s0);
  if (s0 < 0 || b0 < 0) fail('the project list code in refreshHome was not found.');
  h = h.slice(0, s0) + `all.forEach(function(s, i){
      var label = s.status === 'stopped' ? 'Saved' : 'Recovered';
      list.appendChild(h('div', { class: 'pj' },
        h('div', { class: 'th g' + (i % 4), 'data-sid': s.id, style: s.thumb ? 'background-image:url(' + s.thumb + ');background-size:cover;background-position:center' : '', role: 'button', tabindex: '0', 'aria-label': 'Open ' + s.name, onclick: function(){ openSaved(s.id); } },
          h('span', { class: 'kind' }, label), h('span', { class: 'dur' }, fmt(s.durationMs || 0))),
        h('div', { class: 'pm' },
          h('div', { class: 't' }, h('b', null, s.name), h('span', null, new Date(s.created).toLocaleDateString() + ' \\u00b7 ' + fmt(s.durationMs || 0))),
          h('button', { class: 'btn icon ghost', 'data-noskin': '', 'aria-label': 'Edit', onclick: function(){ openAndEdit(s.id); } }, h('span', { 'data-ic': 'pencil', 'data-s': '18' }, h('span', { class: 'lbl' }, 'Edit'))),
          h('button', { class: 'btn icon ghost', 'data-noskin': '', 'aria-label': 'Delete', onclick: function(){ delSaved(s); } }, h('span', { 'data-ic': 'trash-2', 'data-s': '18' }, h('span', { class: 'lbl' }, 'Delete'))))));
    });` + h.slice(b0 + e0.length);
}
// --- file picked (edit / import choose what happens), thumbnail saved with the session, show()
h = swap(h, "    if (S.pickPurpose === 'new') return enterStudio();\n    $('needMovie').hidden = true; updatePreviewUI();\n  }).catch(function(){",
  "    if (S.pickPurpose === 'new') return enterStudio();\n    if (S.pickPurpose === 'edit') return startEditOnly();\n    if (S.pickPurpose === 'import') return askImport();\n    $('needMovie').hidden = true; updatePreviewUI();\n  }).catch(function(){", 'file picked handler');
h = swap(h, "      if (S.pickPurpose === 'new') return enterStudio();\n      $('needMovie').hidden = true; updatePreviewUI();\n      toast('Converted and ready.');",
  "      if (S.pickPurpose === 'new') return enterStudio();\n      if (S.pickPurpose === 'edit') return startEditOnly();\n      if (S.pickPurpose === 'import') return askImport();\n      $('needMovie').hidden = true; updatePreviewUI();\n      toast('Converted and ready.');", 'converted handler');
h = swap(h, "voiceRanges: s.voiceRanges || null };", "voiceRanges: s.voiceRanges || null, thumb: s.thumb || null };", 'sessionRecord end');
h = swap(h, "  $('btnBack').hidden = (view === 'home');\n}", "  $('btnBack').hidden = (view === 'home');\n  document.documentElement.setAttribute('data-view', view); if (window.markNav) window.markNav(view);\n}", 'end of show()');
// --- wiring
const JS = `<script>
/* new interface: navigation, icons, project buttons, export sheet */
(function(){
  S.exportRes = '720';
  function icons(){
    var I = window.NakiIcons; if (!I) return;
    [].forEach.call(document.querySelectorAll('[data-ic]'), function(e){
      var n = e.getAttribute('data-ic'); if (!I.has(n)) return;
      e.innerHTML = I.svg(n, { size: +e.getAttribute('data-s') || 22 }); e.removeAttribute('data-ic');
    });
  }
  window.markNav = function(view){
    var on = view === 'home' ? 'home' : view === 'check' ? 'settings' : '';
    [].forEach.call(document.querySelectorAll('.nb'), function(b){ b.classList.toggle('on', b.getAttribute('data-go') === on); });
  };
  window.openAndEdit = function(id){
    openSaved(id);
    var n = 0, iv = setInterval(function(){
      if (S.sess && S.sess.id === id && S.mode === 'preview' && S.view === 'work'){ clearInterval(iv); $('bEdit').click(); }
      else if (++n > 100) clearInterval(iv);
    }, 100);
  };
  /* ---- video only: edit a video with no narration ---- */
  function silentWav(sec){
    var sr = 8000, n = sr * sec, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    function w(o, t){ for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    return new Blob([b], { type: 'audio/wav' });
  }
  function dropVoiceClips(){
    var guard = 0;
    (function step(){
      var c = null; NakiEditor.project().tracks.forEach(function(t){ if (!c && t.role === 'voice' && t.clips.length) c = t.clips[0]; });
      if (!c || ++guard > 20) return;
      NakiEditor.select(c.id); NakiEditor.deleteSel(); step();
    })();
  }
  window.startEditOnly = function(){
    if (!S.movieFile){ toast('Choose a video first.'); return; }
    var dur = S.movieDurMs || 0; if (dur < 300){ toast('This video has no length that Naki can read.'); return; }
    el.voice.pause(); S.sess = null;
    var sess = newSession(), nLv = Math.ceil(dur / LEVEL_STEP_MS) + 1, lv = [];
    for (var i = 0; i < nLv; i++) lv.push(0);
    var wav = silentWav(1);
    sess.status = 'stopped'; sess.durationMs = dur; sess.levels = lv; sess.voiceMime = 'audio/wav'; sess.voiceBlob = wav; sess.chunks = [wav]; sess.chunkTimes = [dur];
    sess.events = [{ t: 0, type: 'rec_start', movieMs: 0 }, { t: 0, type: 'vol', value: 1 }, { t: 0, type: 'duck', enabled: false, thresholdDb: -42, duckedGain: 1 },
      { t: 0, type: 'play', movieMs: 0 }, { t: dur, type: 'pause', movieMs: dur }, { t: dur, type: 'rec_stop' }];
    sess.warnings = [{ t: 0, type: 'no_narration' }];
    if (DB.ok){
      DB.put('movies', { sid: sess.id, name: S.movieFile.name, size: S.movieFile.size, blob: S.movieFile }).catch(function(){
        sess.warnings.push({ t: 0, type: 'movie_not_remembered' });
        toast('This video is too large to remember on this device. You will need to choose it again next time you open this project.', 8000);
      });
    } else sess.warnings.push({ t: 0, type: 'movie_not_remembered_no_db' });
    persistTrimmed(sess).then(function(){
      openPreview(sess); $('bEdit').click();
      var n = 0, iv = setInterval(function(){
        if (NakiEditor.isOpen()){ clearInterval(iv); try { dropVoiceClips(); } catch (e) { console.warn('could not remove the empty voice row', e); } }
        else if (++n > 60) clearInterval(iv);
      }, 100);
    });
  };
  window.askImport = function(){
    $('importName').textContent = S.movieFile ? S.movieFile.name : '';
    $('importModal').hidden = false;
  };
  $('bImportEdit').onclick = function(){ $('importModal').hidden = true; startEditOnly(); };
  $('bImportNarrate').onclick = function(){ $('importModal').hidden = true; enterStudio(); };
  $('bImportCancel').onclick = function(){ $('importModal').hidden = true; };
  // the empty "Your voice" row is hidden when a project has no narration
  setInterval(function(){
    if (!NakiEditor.isOpen() || !S.sess || !(S.sess.warnings || []).some(function(w){ return w.type === 'no_narration'; })) return;
    var ed = document.getElementById('editor'); if (!ed) return;
    var rows = ed.querySelectorAll('.ed-row'), labs = ed.querySelectorAll('.ed-labels .ed-label');
    for (var i = 0; i < rows.length; i++){
      var empty = rows[i].classList.contains('k-voice') && !rows[i].querySelector('.ed-clip'), d = empty ? 'none' : '';
      if (rows[i].style.display !== d) rows[i].style.display = d;
      if (labs[i] && labs[i].style.display !== d) labs[i].style.display = d;
    }
  }, 400);
  $('btnEditor').onclick = function(){ chooseMovie('edit'); };
  $('btnImport').onclick = function(){ chooseMovie('import'); };
  var dz = document.querySelector('.drop');
  ['dragenter', 'dragover'].forEach(function(t){ dz.addEventListener(t, function(e){ e.preventDefault(); dz.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function(t){ dz.addEventListener(t, function(e){ e.preventDefault(); dz.classList.remove('over'); }); });
  dz.addEventListener('drop', function(e){
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
    S.pickPurpose = 'import';
    try { el.pick.files = e.dataTransfer.files; el.pick.dispatchEvent(new Event('change')); } catch (er) { toast('Could not take that file. Use Choose video instead.'); }
  });
  /* ---- real frames instead of placeholder colours on the project cards ---- */
  function captureThumb(blob){
    return new Promise(function(res){
      var v = document.createElement('video'), u = URL.createObjectURL(blob), done = false;
      function fin(x){ if (done) return; done = true; try { URL.revokeObjectURL(u); } catch (e) {} res(x); }
      v.muted = true; v.preload = 'auto'; v.setAttribute('playsinline', '');
      v.onerror = function(){ fin(null); };
      v.onloadedmetadata = function(){ try { v.currentTime = Math.min(1, (v.duration || 2) * 0.1); } catch (e) { fin(null); } };
      v.onseeked = function(){
        try {
          var w = 320, h = Math.max(1, Math.round(w * (v.videoHeight || 9) / (v.videoWidth || 16))), c = document.createElement('canvas');
          c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h); fin(c.toDataURL('image/jpeg', 0.7));
        } catch (e) { fin(null); }
      };
      setTimeout(function(){ fin(null); }, 8000);
      v.src = u;
    });
  }
  var tried = {};
  function fillThumbs(){
    if (!DB.ok) return;
    DB.all('sessions').then(function(all){
      var todo = all.filter(function(x){ return !x.thumb && x.status !== 'recording' && !tried[x.id]; });
      (function next(){
        var x = todo.shift(); if (!x) return; tried[x.id] = 1;
        DB.get('movies', x.id).then(function(rec){ return rec && rec.blob ? captureThumb(rec.blob) : null; }).then(function(t){
          if (!t) return;
          return DB.get('sessions', x.id).then(function(r){
            if (!r) return; r.thumb = t;
            return DB.put('sessions', r).then(function(){
              var card = document.querySelector('[data-sid="' + x.id + '"]');
              if (card){ card.style.backgroundImage = 'url(' + t + ')'; card.style.backgroundSize = 'cover'; card.style.backgroundPosition = 'center'; }
            });
          });
        }).then(next, next);
      })();
    }, function(){});
  }
  var rh0 = refreshHome;
  refreshHome = function(){ return Promise.resolve(rh0.apply(this, arguments)).then(fillThumbs); };
  $('btnSettingsTop').onclick = function(){ if (S.rec.on || S.rec.starting){ toast('Stop the recording first.'); return; } runCheck(); };
  [].forEach.call(document.querySelectorAll('.nb'), function(b){
    b.addEventListener('click', function(){
      var g = b.getAttribute('data-go');
      if (S.rec.on || S.rec.starting){ toast('Stop the recording first.'); return; }
      if (g === 'settings'){ runCheck(); return; }
      if (S.view !== 'home') $('btnBack').click();
      if (g === 'session') $('btnNew').click(); else if (g === 'editor') $('btnEditor').click();
    });
  });
  // export sheet
  function planMs(){
    var s = S.sess, vd = el.voice.duration;
    try { return NakiEditor.planFor(s, { voiceDurMs: isFinite(vd) && vd > 0 ? Math.round(vd * 1000) : null, saved: s.savedProject }).durationMs; } catch (e) { return s.durationMs || 0; }
  }
  function est(){
    if (!S.sess) return;
    var ms = planMs(), src = el.movie.videoHeight || 720;
    var h0 = S.exportRes === 'orig' ? src : Math.min(+S.exportRes || 720, src);
    var mbps = h0 >= 1000 ? 5 : h0 >= 700 ? 2.5 : h0 >= 500 ? 1.5 : 1;
    if (S.exportQuality === 'sharper') mbps *= 1.5;
    var mb = Math.max(1, Math.round(ms / 1000 * mbps / 8));
    $('shEst').innerHTML = 'About <b>' + mb + ' MB</b> \\u00b7 ' + h0 + 'p \\u00b7 ' + (S.exportQuality === 'sharper' ? 'higher quality' : 'recommended quality');
    $('shMeta').textContent = fmt(ms) + ' \\u00b7 ' + (S.exportVertical ? 'vertical 9:16' : 'landscape');
  }
  window.openExportSheet = function(){
    if (!S.sess){ toast('Open a session first.'); return; }
    $('shName').textContent = S.sess.name; est(); $('exportSheet').hidden = false;
  };
  function closeSheet(){ $('exportSheet').hidden = true; }
  $('bOpenExport').onclick = openExportSheet;
  $('bSheetClose').onclick = $('bSheetCancel').onclick = closeSheet;
  $('exportSheet').addEventListener('click', function(e){ if (e.target === this) closeSheet(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !$('exportSheet').hidden) closeSheet(); });
  [].forEach.call(document.querySelectorAll('#segRes button'), function(b){
    b.addEventListener('click', function(){
      S.exportRes = b.getAttribute('data-res');
      [].forEach.call(document.querySelectorAll('#segRes button'), function(x){ x.setAttribute('aria-pressed', String(x === b)); });
      est();
    });
  });
  ['bShapeLandscape', 'bShapeVertical', 'bQualityFaster', 'bQualitySharper'].forEach(function(id){ $(id).addEventListener('click', est); });
  // title, recording pill, offline chip in the top bar
  setInterval(function(){
    var w = S.view === 'work', t = $('topTitle');
    var name = w ? ((S.sess && S.sess.name) || (S.movieFile && S.movieFile.name.replace(/\\.[^.]+$/, '')) || '') : '';
    if (t.textContent !== name) t.textContent = name;
    var rp = $('recPill'), on = !!(w && S.mode === 'studio' && S.rec.on);
    if (rp.hidden === on) rp.hidden = !on;
    if (on){ var tx = 'Recording ' + $('recTime').textContent; if ($('recPillT').textContent !== tx) $('recPillT').textContent = tx; }
    var oc = $('offlineChip'), off = !IS_DEV && !!(navigator.serviceWorker && navigator.serviceWorker.controller); if (oc.hidden === off) oc.hidden = !off;
  }, 300);
  icons(); window.markNav(S.view); document.documentElement.setAttribute('data-view', S.view);
  new MutationObserver(icons).observe(document.body, { childList: true, subtree: true });
})();
</script>
<script src="skin.js"></script>`;
h = swap(h, '<script src="skin.js"></script>', JS, 'skin.js script tag');
fs.writeFileSync(P('index.html'), crlf ? h.replace(/\n/g, '\r\n') : h);
console.log('index.html updated.');
// accent colour
let t = fs.readFileSync(P('theme.css'), 'utf8');
if (/--mango:\s*#2ee6d6/i.test(t)) console.log('Accent is already teal.');
else {
  if (!/--mango:\s*#[0-9a-fA-F]{3,8}/.test(t)) fail('theme.css has no --mango line.');
  if (!fs.existsSync(P('theme.css.bak'))) fs.writeFileSync(P('theme.css.bak'), t);
  t = t.replace(/--mango:\s*#[0-9a-fA-F]{3,8}/, '--mango: #2ee6d6').replace(/--on-accent:\s*#[0-9a-fA-F]{3,8}/, '--on-accent: #03201d');
  fs.writeFileSync(P('theme.css'), t); console.log('theme.css: accent is now teal (#2ee6d6).');
}
console.log('\nDone. Add ./newui.css to FILES in sw.js (with the slash), then clear the cache and reload.');
