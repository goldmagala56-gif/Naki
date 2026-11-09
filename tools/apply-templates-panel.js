'use strict';
// One-time patch: the Text > Templates panel (it opened nothing before: the button asked for a panel that was never built),
// 26 new professional templates (news, neon, TV and retro, cinema, social, fun), and "Save this text as a template" (kept on the phone).
//   - adds www/templates-more.js (more entries for NakiTemplates.LIST; your templates.js is NOT touched)
//   - adds the <script> for it to www/index.html (right after templates.js) and './templates-more.js' to www/sw.js (if it lists files)
//   - adds PANELS.templates to www/editor.js and some CSS to www/editor.css
// Run from the project folder:   node tools/apply-templates-panel.js
// It checks that every spot it needs to change is found exactly once BEFORE writing anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

const MORE = `'use strict';
/* Naki text templates, more: news, neon, TV and retro, cinema, social, fun. Added to NakiTemplates.LIST (templates.js is not changed).
   Same shape as the first ten: style (what a text already has, plus the text effects grad / arc / glow / bubble / extrude) and anim. */
(function () {
  var T = (typeof module !== 'undefined' && module.exports) ? require('./templates.js') : (typeof window !== 'undefined' ? window.NakiTemplates : null);
  if (!T) return;
  function a(i, o, l, im, om) { return { in: i, out: o, loop: l, inMs: im || 450, outMs: om || 400 }; }
  var MORE = [
    // ----- News -----
    { cat: 'News', key: 'n-breaking', label: 'Breaking news', text: 'BREAKING NEWS', style: { size: 7, color: '#ffffff', pos: 'bottom', weight: 800, bg: true, font: 'oswald', outline: 0, shadow: 0, grad: { c1: '#ffffff', c2: '#ffd0d0', angle: 90 } }, anim: a('slideup', 'slidedown', 'none') },
    { cat: 'News', key: 'n-headline', label: 'Headline', text: 'HEADLINE HERE', style: { size: 8, color: '#ffffff', pos: 'bottom', weight: 800, bg: true, font: 'anton', outline: 0, shadow: 0 }, anim: a('slideup', 'fade', 'none') },
    { cat: 'News', key: 'n-paper', label: 'Newspaper', text: 'EXTRA! EXTRA!', style: { size: 9, color: '#f4ecd8', pos: 'center', weight: 700, bg: true, font: 'abrilfatface', outline: 0, shadow: 0 }, anim: a('pop', 'fade', 'none') },
    { cat: 'News', key: 'n-serifhead', label: 'Print headline', text: 'The Big Story', style: { size: 8, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'playfair', outline: 0.5, shadow: 1 }, anim: a('fade', 'fade', 'none', 700, 600) },
    { cat: 'News', key: 'n-lower', label: 'Lower third', text: 'NAME SURNAME', style: { size: 5, color: '#ffffff', pos: 'bottom', weight: 700, bg: true, font: 'oswald', outline: 0, shadow: 0 }, anim: a('slideup', 'slidedown', 'none') },
    { cat: 'News', key: 'n-ticker', label: 'Ticker', text: 'LIVE  \\u2022  Your headline goes here', style: { size: 4, color: '#ffe14d', pos: 'bottom', weight: 700, bg: true, font: 'barlowcondensed', outline: 0, shadow: 0 }, anim: a('slideup', 'slidedown', 'none', 350, 350) },
    { cat: 'News', key: 'n-live', label: 'LIVE tag', text: 'LIVE', style: { size: 5, color: '#ff3b3b', pos: 'top', weight: 800, bg: true, font: 'archivo', outline: 0, shadow: 0 }, anim: a('fade', 'fade', 'pulse', 300, 300) },
    // ----- Neon -----
    { cat: 'Neon', key: 'x-pink', label: 'Neon pink', text: 'Neon', style: { size: 10, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'righteous', outline: 0, shadow: 0, glow: { color: '#ff2fa8', amount: 0.9 } }, anim: a('fade', 'fade', 'pulse', 500, 500) },
    { cat: 'Neon', key: 'x-cyan', label: 'Neon cyan', text: 'OPEN', style: { size: 10, color: '#e6ffff', pos: 'center', weight: 700, bg: false, font: 'bungee', outline: 0, shadow: 0, glow: { color: '#00e5ff', amount: 0.9 } }, anim: a('fade', 'fade', 'pulse', 500, 500) },
    { cat: 'Neon', key: 'x-green', label: 'Neon green', text: 'GO', style: { size: 12, color: '#f0ffe0', pos: 'center', weight: 700, bg: false, font: 'monoton', outline: 0, shadow: 0, glow: { color: '#7cff4d', amount: 0.9 } }, anim: a('pop', 'fade', 'pulse', 400, 400) },
    { cat: 'Neon', key: 'x-sign', label: 'Night sign', text: 'Cafe', style: { size: 11, color: '#fff3c4', pos: 'center', weight: 700, bg: false, font: 'lobster', outline: 0, shadow: 0, glow: { color: '#ff9f1c', amount: 0.85 } }, anim: a('fade', 'fade', 'pulse', 600, 600) },
    // ----- TV and retro -----
    { cat: 'TV', key: 'v-vhs', label: 'VHS play', text: 'PLAY \\u25b6', style: { size: 5, color: '#ffffff', pos: 'top', weight: 700, bg: false, font: 'pressstart2p', outline: 0.5, shadow: 1 }, anim: a('fade', 'fade', 'none', 200, 200) },
    { cat: 'TV', key: 'v-channel', label: 'Channel', text: 'CH 03', style: { size: 6, color: '#7dff9a', pos: 'top', weight: 700, bg: false, font: 'pressstart2p', outline: 0.5, shadow: 0, glow: { color: '#2bff6a', amount: 0.5 } }, anim: a('fade', 'fade', 'none', 200, 200) },
    { cat: 'TV', key: 'v-retro3d', label: 'Retro 3D', text: 'RETRO', style: { size: 11, color: '#ffd23f', pos: 'center', weight: 700, bg: false, font: 'bungee', outline: 0.3, shadow: 0, extrude: { color: '#ee4266', depth: 0.8 } }, anim: a('pop', 'pop', 'none', 350, 350) },
    { cat: 'TV', key: 'v-type', label: 'Typewriter', text: 'Dear diary...', style: { size: 6, color: '#f5f0e6', pos: 'bottom', weight: 700, bg: true, font: 'specialelite', outline: 0, shadow: 0 }, anim: a('fade', 'fade', 'none', 500, 400) },
    // ----- Cinema -----
    { cat: 'Cinema', key: 'c-title', label: 'Movie title', text: 'THE JOURNEY', style: { size: 10, color: '#f4e9c8', pos: 'center', weight: 700, bg: false, font: 'cinzel', outline: 0, shadow: 1 }, anim: a('fade', 'fade', 'none', 1200, 1000) },
    { cat: 'Cinema', key: 'c-credit', label: 'Credit', text: 'Directed by', style: { size: 5, color: '#e8e2d0', pos: 'bottom', weight: 400, bg: false, font: 'cormorantgaramond', outline: 0, shadow: 1 }, anim: a('fade', 'fade', 'none', 900, 900) },
    { cat: 'Cinema', key: 'c-gold', label: 'Gold', text: 'GOLD', style: { size: 10, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'marcellus', outline: 0.3, shadow: 1, grad: { c1: '#fff1a8', c2: '#b8860b', angle: 90 } }, anim: a('fade', 'fade', 'none', 900, 800) },
    // ----- Social -----
    { cat: 'Social', key: 's-pop', label: 'Bold caption', text: 'Wait for it', style: { size: 7, color: '#ffffff', pos: 'center', weight: 800, bg: false, font: 'montserrat', outline: 0.7, shadow: 1 }, anim: a('pop', 'fade', 'none', 250, 250) },
    { cat: 'Social', key: 's-sunset', label: 'Sunset', text: 'Sunset', style: { size: 11, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'anton', outline: 0.4, shadow: 1, grad: { c1: '#ff512f', c2: '#f9d423', angle: 90 } }, anim: a('pop', 'fade', 'none', 350, 350) },
    { cat: 'Social', key: 's-hand', label: 'Handwritten', text: 'so cute', style: { size: 8, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'caveat', outline: 0.3, shadow: 1 }, anim: a('fade', 'fade', 'float', 500, 500) },
    // ----- Fun -----
    { cat: 'Fun', key: 'f-fire', label: 'Fire', text: 'HOT', style: { size: 12, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'anton', outline: 0.2, shadow: 0, grad: { c1: '#fff200', c2: '#ff3b00', angle: 90 }, glow: { color: '#ff6a00', amount: 0.7 } }, anim: a('pop', 'fade', 'pulse', 350, 350) },
    { cat: 'Fun', key: 'f-ice', label: 'Ice', text: 'COOL', style: { size: 11, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'montserrat', outline: 0, shadow: 0, grad: { c1: '#ffffff', c2: '#7fd8ff', angle: 90 }, glow: { color: '#4fc3ff', amount: 0.8 } }, anim: a('fade', 'fade', 'float', 500, 500) },
    { cat: 'Fun', key: 'f-bubble', label: 'Bubblegum', text: 'YUM', style: { size: 11, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'luckiestguy', outline: 0, shadow: 1, bubble: { color: '#ff4fa3', width: 0.55 } }, anim: a('pop', 'pop', 'none', 350, 350) },
    { cat: 'Fun', key: 'f-comic', label: 'Comic burst', text: 'POW!', style: { size: 12, color: '#ffe600', pos: 'center', weight: 700, bg: false, font: 'bangers', outline: 1, shadow: 0, extrude: { color: '#000000', depth: 0.45 } }, anim: a('pop', 'pop', 'none', 300, 300) },
    { cat: 'Fun', key: 'f-rainbow', label: 'Rainbow arc', text: 'Hello!', style: { size: 10, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'pacifico', outline: 0.3, shadow: 1, arc: 0.6, grad: { c1: '#ff5f6d', c2: '#4facfe', angle: 0 } }, anim: a('pop', 'fade', 'float', 400, 400) }
  ];
  var have = {}; T.LIST.forEach(function (t) { have[t.key] = 1; });
  MORE.forEach(function (t) { if (!have[t.key]) T.LIST.push(t); });
})();
if (typeof window !== 'undefined') { window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['templates-more.js'] = 'tpl1'; }
`;

const PANEL = `// ----- the Templates panel (text looks): a gallery by group, plus "Save this text as a template" -----
  var MYTPL_KEY = 'naki.myTemplates';
  function myTpls(){ try { var a = JSON.parse(localStorage.getItem(MYTPL_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveMyTpls(a){ try { localStorage.setItem(MYTPL_KEY, JSON.stringify(a)); return true; } catch (e) { return false; } }
  function syncMyTpls(){
    if (!NTPL) return;
    for (var i = NTPL.LIST.length - 1; i >= 0; i--) if (NTPL.LIST[i].cat === 'Mine') NTPL.LIST.splice(i, 1);
    myTpls().forEach(function (t){ if (t && t.key && t.style) NTPL.LIST.push(Object.assign({}, t, { cat: 'Mine' })); });
  }
  // Applies a template to the selected title (or adds a new one at the playhead). Every effect the template does not have is cleared, so looks do not pile up.
  function applyTpl(key){
    var tp = NTPL && NTPL.find(key); if (!tp) return;
    var style = Object.assign({ grad: null, arc: null, glow: null, bubble: null, extrude: null }, tp.style), anim = Object.assign({ in: 'none', out: 'none', loop: 'none' }, tp.anim || {});
    var c = selText(), q, id;
    if (c){ q = P.setTextProps(E.hist.cur, c.id, style); id = c.id; }
    else {
      var out = {}; q = P.addTextClip(E.hist.cur, Math.round(E.t), 3000, out);
      if (q === E.hist.cur){ toast('There is no room for text at the playhead. Move it or shorten the other text.'); return; }
      id = out.id; q = P.setTextProps(q, id, Object.assign({ text: tp.text }, style));
    }
    q = P.setTextAnim(q, id, anim); E.sel = id; commit(q);
  }
  function tplSample(tp){
    var s = tp.style || {}, L = typeof window !== 'undefined' ? window.NakiLook : null, el = mk('span', 'ed-tplsample', tp.label || tp.key), st = el.style, sh = [];
    st.fontFamily = L && L.fontCss ? L.fontCss(s.font) : 'system-ui, sans-serif'; st.fontWeight = String(s.weight || 700); st.color = s.color || '#ffffff';
    if (s.outline) sh.push('1px 0 #000', '-1px 0 #000', '0 1px #000', '0 -1px #000');
    if (s.glow){ sh.push('0 0 5px ' + s.glow.color, '0 0 11px ' + s.glow.color); }
    if (s.extrude){ sh.push('1px 1px 0 ' + s.extrude.color, '2px 2px 0 ' + s.extrude.color, '3px 3px 0 ' + s.extrude.color); }
    if (s.bubble){ sh.push('1px 0 ' + s.bubble.color, '-1px 0 ' + s.bubble.color, '0 1px ' + s.bubble.color, '0 -1px ' + s.bubble.color, '0 0 6px ' + s.bubble.color); }
    if (s.shadow && !s.glow && !s.extrude) sh.push('0 2px 4px rgba(0,0,0,.7)');
    if (s.grad){ st.backgroundImage = 'linear-gradient(' + ((+s.grad.angle || 0) + 90) + 'deg,' + s.grad.c1 + ',' + s.grad.c2 + ')'; st.webkitBackgroundClip = 'text'; st.backgroundClip = 'text'; st.color = 'transparent'; st.webkitTextFillColor = 'transparent'; }
    else if (sh.length) st.textShadow = sh.join(',');
    if (s.bg){ st.background = 'rgba(0,0,0,.6)'; st.padding = '2px 8px'; st.borderRadius = '4px'; }
    return el;
  }
  function tplTile(tp){
    var b = mk('button', 'ed-tpl'); b.type = 'button'; b.setAttribute('aria-label', tp.label); b.appendChild(tplSample(tp));
    b.onclick = function (){ applyTpl(tp.key); };
    if (tp.cat === 'Mine'){
      var x = mk('span', 'ed-tplx', '\\u00d7'); x.setAttribute('role', 'button'); x.setAttribute('aria-label', 'Remove ' + tp.label);
      x.onclick = function (ev){ ev.stopPropagation(); if (!confirm('Remove "' + tp.label + '" from your templates?')) return; saveMyTpls(myTpls().filter(function (t){ return t.key !== tp.key; })); syncMyTpls(); renderDock(); };
      b.appendChild(x);
    }
    return b;
  }
  function saveMyTpl(){
    var c = selText(); if (!c){ toast('Tap a title on the timeline first.'); return; }
    var nm = prompt('Name this template:', 'My look'); if (nm === null) return; nm = String(nm).trim().slice(0, 24) || 'My look';
    var st = { font: 'sans', outline: 0, shadow: 1, bg: false };
    ['size', 'color', 'pos', 'weight', 'bg', 'font', 'outline', 'shadow'].forEach(function (k){ if (c[k] !== undefined) st[k] = c[k]; });
    ['grad', 'arc', 'glow', 'bubble', 'extrude'].forEach(function (k){ if (c[k] != null) st[k] = JSON.parse(JSON.stringify(c[k])); });
    var all = myTpls(); all.push({ key: 'my' + Date.now(), label: nm, text: c.text || 'Your text', style: st, anim: c.anim ? JSON.parse(JSON.stringify(c.anim)) : {} });
    if (!saveMyTpls(all)){ toast('This browser would not keep the template.'); return; }
    syncMyTpls(); E.chip.tplcat = 'Mine'; renderDock(); toast('Saved. It is in the Mine group.');
  }
  PANELS.templates = { title: 'Text templates', build: function (body){
    if (!NTPL){ body.appendChild(mk('div', 'ed-hint', 'templates.js is not loaded. Add <script src="templates.js"></script> to index.html, before editor.js.')); return; }
    syncMyTpls();
    var cats = [], list = NTPL.LIST; list.forEach(function (t){ var g = t.cat || 'Basics'; if (cats.indexOf(g) < 0) cats.push(g); });
    var opts = cats.map(function (g){ return { key: g, label: g }; }), ck = chipKey('tplcat', opts, cats[0]);
    body.appendChild(chips(opts, ck, pickChip('tplcat')));
    var grid = mk('div', 'ed-tplgrid'); list.filter(function (t){ return (t.cat || 'Basics') === ck; }).forEach(function (t){ grid.appendChild(tplTile(t)); }); body.appendChild(grid);
    body.appendChild(actions([{ id: 'edTplMine', label: selText() ? 'Save this text as a template' : 'Select a title to save its look', run: saveMyTpl }]));
    body.appendChild(mk('div', 'ed-hint', 'Tap a template to add it at the playhead, or to restyle the title you have selected. Your own look: style a title, then Save it here.'));
  } };
  `;

const CSS = `
/* text templates gallery */
.ed-tplgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px}
.ed-tpl{position:relative;min-height:56px;padding:6px;border:1px solid var(--line);border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;touch-action:manipulation;
  background:linear-gradient(135deg,#2a3542,#10161d);color:var(--chalk);font:inherit;overflow:hidden}
.ed-tpl:active{transform:scale(.97)}
.ed-tplsample{font-size:15px;line-height:1.25;text-align:center;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ed-tplx{position:absolute;top:0;right:2px;padding:0 5px;font-size:18px;line-height:20px;color:#fff;opacity:.7}
`;

const EDITS = {
  'www/editor.js': [{ label: 'editor: the Templates panel', find: `PANELS.markeredit = { title: 'Markers', build: function (body){`, replace: PANEL + `PANELS.markeredit = { title: 'Markers', build: function (body){` }],
  'www/index.html': [{ label: 'page: script', find: `<script src="templates.js"></script>`, replace: `<script src="templates.js"></script>\n<script src="templates-more.js"></script>` }],
  'www/sw.js': [{ label: 'service worker: file list', find: `'./templates.js'`, replace: `'./templates.js', './templates-more.js'`, optional: true }]
};

function load(rel){ const f = path.join(root, rel); const raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o){ fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
if (fs.existsSync(path.join(root, 'www', 'templates-more.js'))){ console.log('Already applied (www/templates-more.js exists). Nothing to do.'); process.exit(0); }
const problems = [], warnings = [], files = {};
Object.keys(EDITS).forEach(rel => {
  let o;
  try { o = files[rel] = load(rel); } catch (err) {
    if (EDITS[rel].every(e => e.optional)){ warnings.push(rel + ' was not found, so it was skipped'); return; }
    problems.push(rel + ' could not be read'); return;
  }
  EDITS[rel].forEach(e => {
    const n = o.text.split(e.find).length - 1;
    if (n !== 1){ if (e.optional) warnings.push(e.label + ': found ' + n + ' times (skipped)'); else problems.push(e.label + ': found ' + n + ' times (need exactly 1) in ' + path.basename(rel)); return; }
    o.text = o.text.replace(e.find, () => e.replace);
  });
});
const css = load('www/editor.css'); css.text = css.text.replace(/\s*$/, '\n') + CSS; files['www/editor.css'] = css;
if (problems.length){
  console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
Object.keys(files).forEach(rel => save(files[rel]));
fs.writeFileSync(path.join(root, 'www', 'templates-more.js'), MORE);
console.log('Done. Changed ' + Object.keys(files).length + ' files and added www/templates-more.js. Now run:  npm test');
if (warnings.length) console.log('Note:\n  - ' + warnings.join('\n  - ') + '\nIf sw.js was skipped, add \'./templates-more.js\' to its file list by hand so the app works offline.');