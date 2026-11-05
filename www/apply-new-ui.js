// Naki new interface, stage 1: side rail / bottom bar, new Home, project cards, teal accent.
// Run from the www folder:   node apply-new-ui.js
// It edits index.html and theme.css in place (backups: index.html.bak, theme.css.bak). Safe to run twice.
const fs = require('fs'), path = require('path');
const dir = process.cwd();
function read(f){ return fs.readFileSync(path.join(dir, f), 'utf8'); }
function fail(m){ console.error('\nSTOPPED: ' + m + '\nNothing was changed.'); process.exit(1); }
function once(s, a, label){ const n = s.split(a).length - 1; if (n !== 1) fail('could not find "' + label + '" exactly once in index.html (found ' + n + '). Is this the same index.html as the one I was given?'); }
for (const f of ['index.html', 'theme.css', 'newui.css']) if (!fs.existsSync(path.join(dir, f))) fail(f + ' is not in this folder (' + dir + ').');
let raw = read('index.html'); const crlf = raw.indexOf('\r\n') >= 0; let h = raw.replace(/\r\n/g, '\n');
if (h.indexOf('href="newui.css"') >= 0){ console.log('index.html already has the new interface. Only checking the accent colour.'); }
else {
  // A. stylesheet + browser bar colour
  once(h, '<link rel="stylesheet" href="theme.css">', 'theme.css link');
  h = h.replace('<link rel="stylesheet" href="theme.css">', '<link rel="stylesheet" href="theme.css">\n<link rel="stylesheet" href="newui.css">');
  once(h, '<meta name="theme-color" content="#111b24">', 'theme-color meta');
  h = h.replace('<meta name="theme-color" content="#111b24">', '<meta name="theme-color" content="#0c0d0f">');
  // B. rail + bottom bar
  once(h, '<body>\n<header class="top">', '<body> then <header class="top">');
  const NAV = [['home', 'house', 'Home'], ['session', 'mic-vocal', 'Session'], ['editor', 'scissors', 'Editor'], ['settings', 'settings', 'Settings']];
  const btns = NAV.map(n => '<button class="nb" data-noskin data-go="' + n[0] + '" aria-label="' + n[2] + '"><span data-ic="' + n[1] + '"></span>' + n[2] + '</button>').join('\n    ');
  const rail = '<nav class="rail" id="rail" aria-label="Main">\n    <div class="logo">N</div>\n    ' + btns + '\n  </nav>\n<nav class="bottomnav" id="bottomnav" aria-label="Main">\n    ' + btns + '\n  </nav>\n';
  h = h.replace('<body>\n<header class="top">', '<body>\n' + rail + '<header class="top">');
  // C. Home
  const a = h.indexOf('<section id="view-home">'); if (a < 0) fail('Home section not found.');
  const b = h.indexOf('</section>', a); const old = h.slice(a, b + 10);
  ['id="btnNew"', 'id="btnCheck"', 'id="btnInstall"', 'id="sessList"', 'id="verLine"'].forEach(k => { if (old.indexOf(k) < 0) fail('the Home section does not contain ' + k); });
  const home = `<section id="view-home">
    <h1>What do you want to make today?</h1>
    <p class="lead">Narrate a movie live, or edit a saved project on the timeline. Everything is saved on this device and works without internet.</p>
    <div class="hero">
      <div class="act"><div class="tile" data-ic="mic-vocal" data-s="26"></div><h3>Session</h3><p>Play a movie, talk over it and pause whenever you want to explain. Then export it, or send it to the editor.</p><button id="btnNew" data-noskin class="btn primary big"><span data-ic="mic"></span>Start a session</button></div>
      <div class="act alt"><div class="tile" data-ic="clapperboard" data-s="26"></div><h3>Editor</h3><p>Open your latest project and edit it: cut, text, captions, effects, sounds, music and more.</p><button id="btnEditor" data-noskin class="btn big"><span data-ic="scissors"></span>Edit latest project</button></div>
    </div>
    <div class="tip">Wear headphones or earphones while you record. Without them, the movie sound leaks into your microphone.</div>
    <h2>Your projects</h2>
    <div id="sessList"></div>
    <div class="home-sub"><button id="btnCheck" class="btn ghost">Check this device</button><button id="btnInstall" class="btn" hidden>Install Naki on this phone</button></div>
    <p id="verLine" class="dim small" style="margin-top:20px"></p>
  </section>`;
  h = h.replace(old, home);
  // D. show(): tell the page which screen is showing
  once(h, "  $('btnBack').hidden = (view === 'home');\n}", 'end of show()');
  h = h.replace("  $('btnBack').hidden = (view === 'home');\n}", "  $('btnBack').hidden = (view === 'home');\n  document.documentElement.setAttribute('data-view', view); if (window.markNav) window.markNav(view);\n}");
  // E. an Edit button on every project card
  const openBtn = "h('button', { class: 'btn', onclick: function(){ openSaved(s.id); } }, 'Open'),";
  once(h, openBtn, 'the Open button in refreshHome');
  h = h.replace(openBtn, openBtn + "\n          h('button', { class: 'btn', onclick: function(){ openAndEdit(s.id); } }, 'Edit'),");
  // F. wiring
  once(h, '<script src="skin.js"></script>', 'skin.js script tag');
  const js = `<script>
/* new interface: navigation, icons, Edit buttons */
(function(){
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
  // open a saved project and go straight into the editor
  window.openAndEdit = function(id){
    openSaved(id);
    var n = 0, iv = setInterval(function(){
      if (S.sess && S.sess.id === id && S.mode === 'preview' && S.view === 'work'){ clearInterval(iv); $('bEdit').click(); }
      else if (++n > 100) clearInterval(iv);
    }, 100);
  };
  function latest(){
    if (!DB.ok) return Promise.resolve(null);
    return DB.all('sessions').then(function(all){ all.sort(function(a, b){ return b.created - a.created; }); return all[0] || null; }, function(){ return null; });
  }
  $('btnEditor').onclick = function(){
    latest().then(function(s){
      if (!s){ toast('No projects yet. Start a session first, then you can edit it.', 5000); return; }
      openAndEdit(s.id);
    });
  };
  [].forEach.call(document.querySelectorAll('.nb'), function(b){
    b.addEventListener('click', function(){
      var g = b.getAttribute('data-go');
      if (S.rec.on || S.rec.starting){ toast('Stop the recording first.'); return; }
      if (g === 'home'){ if (S.view !== 'home') $('btnBack').click(); }
      else if (g === 'session'){ if (S.view !== 'home') $('btnBack').click(); $('btnNew').click(); }
      else if (g === 'editor'){ if (S.view !== 'home') $('btnBack').click(); $('btnEditor').click(); }
      else if (g === 'settings'){ runCheck(); }
    });
  });
  icons(); window.markNav(S.view); document.documentElement.setAttribute('data-view', S.view);
})();
</script>
<script src="skin.js"></script>`;
  h = h.replace('<script src="skin.js"></script>', js);
  fs.copyFileSync(path.join(dir, 'index.html'), path.join(dir, 'index.html.bak'));
  fs.writeFileSync(path.join(dir, 'index.html'), crlf ? h.replace(/\n/g, '\r\n') : h);
  console.log('index.html updated.');
}
// accent colour: orange -> teal
let t = read('theme.css'), tcrlf = t.indexOf('\r\n') >= 0;
if (/--mango:\s*#2ee6d6/i.test(t)) console.log('Accent is already teal.');
else {
  if (!/--mango:\s*#[0-9a-fA-F]{3,8}/.test(t)) fail('theme.css has no --mango line.');
  fs.copyFileSync(path.join(dir, 'theme.css'), path.join(dir, 'theme.css.bak'));
  t = t.replace(/--mango:\s*#[0-9a-fA-F]{3,8}/, '--mango: #2ee6d6').replace(/--on-accent:\s*#[0-9a-fA-F]{3,8}/, '--on-accent: #03201d');
  if (!/--on-accent/.test(t)) t = t.replace('--mango: #2ee6d6', '--mango: #2ee6d6;\n  --on-accent: #03201d');
  fs.writeFileSync(path.join(dir, 'theme.css'), t);
  console.log('theme.css: accent is now teal (#2ee6d6).');
}
console.log('\nDone. Now: add newui.css to the list of files in sw.js and change its cache version, then hard-reload.');
