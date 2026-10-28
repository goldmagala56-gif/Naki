'use strict';
// One-time patch: 14 bundled fonts in the font picker (loaded before any frame is drawn, so exports match the preview), and .vtt files for captions.
//   - look.js:    the font table gets Inter, Montserrat, Poppins, Bebas Neue, Anton, Oswald, Archivo Black, Bangers, Righteous, Playfair, Pacifico, Lobster, Caveat, Dancing Script
//                 and a loadFonts() that waits for the letters a title needs
//   - index.html: loads fonts/fonts.css, and the export waits for the fonts before it draws
//   - sw.js:      the font files are kept for offline use
//   - editor.js:  Import accepts .vtt as well as .srt (read by subtitles.js), and there is a Save .vtt button
//   - www/fonts/fonts.css is written again (a font with one weight is declared for every weight, so the browser never fakes a bold)
// Needs first: naki-fonts.zip unzipped into the project (www/fonts), and www/subtitles.js in place.
// Put this file in the tools folder and run from the project folder:   node tools/apply-fonts-subs.js
// It checks that every spot is found exactly once BEFORE writing anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

// package name, family, key in the font picker, label, weights in the zip, what to fall back on
const FAMS = [
  ['inter', 'Inter', 'inter', 'Inter', [400, 700, 800], 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'],
  ['montserrat', 'Montserrat', 'montserrat', 'Montserrat', [400, 700, 800], 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'],
  ['poppins', 'Poppins', 'poppins', 'Poppins', [500, 700], 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'],
  ['bebas-neue', 'Bebas Neue', 'bebas', 'Bebas Neue', [400], 'Impact, "Arial Narrow", sans-serif'],
  ['anton', 'Anton', 'anton', 'Anton', [400], 'Impact, "Arial Narrow", sans-serif'],
  ['oswald', 'Oswald', 'oswald', 'Oswald', [700], 'Impact, "Arial Narrow", sans-serif'],
  ['archivo-black', 'Archivo Black', 'archivo', 'Archivo Black', [400], '"Arial Black", Impact, sans-serif'],
  ['bangers', 'Bangers', 'bangers', 'Bangers', [400], 'Impact, "Comic Sans MS", cursive'],
  ['righteous', 'Righteous', 'righteous', 'Righteous', [400], 'system-ui, -apple-system, "Segoe UI", sans-serif'],
  ['playfair-display', 'Playfair Display', 'playfair', 'Playfair', [700], 'Georgia, "Times New Roman", serif'],
  ['pacifico', 'Pacifico', 'pacifico', 'Pacifico', [400], '"Brush Script MT", "Segoe Script", cursive'],
  ['lobster', 'Lobster', 'lobster', 'Lobster', [400], '"Brush Script MT", "Segoe Script", cursive'],
  ['caveat', 'Caveat', 'caveat', 'Caveat', [700], '"Segoe Script", "Comic Sans MS", cursive'],
  ['dancing-script', 'Dancing Script', 'dancing', 'Dancing Script', [700], '"Brush Script MT", "Segoe Script", cursive']
];
const RANGE = {
  'latin': 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
};

function load(rel) { const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o) { fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const problems = [], notes = [];
const nm = (o) => path.basename(o.f);
// find (a string or a regular expression) must be there exactly once; it is replaced by what fn gives (fn gets the matched text)
function rep(o, find, fn, label, optional) {
  const re = typeof find === 'string' ? new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : new RegExp(find.source, 'g');
  const n = (o.text.match(re) || []).length;
  if (n !== 1) { if (optional) { notes.push(label + ': skipped (found ' + n + ' times)'); return; } problems.push(label + ': found ' + n + ' times (need exactly 1) in ' + nm(o)); return; }
  o.text = o.text.replace(re, (m) => fn(m));
}

// ---- before anything: are the font files and subtitles.js there? ----
const fontsDir = path.join(root, 'www', 'fonts');
const woff = [];
FAMS.forEach(([pkg, fam, , , weights]) => weights.forEach(w => ['latin', 'latin-ext'].forEach(sub => woff.push(pkg + '-' + sub + '-' + w + '-normal.woff2'))));
const missing = woff.filter(f => !fs.existsSync(path.join(fontsDir, f)));
if (missing.length) { console.log('NOTHING WAS CHANGED. ' + missing.length + ' font files are missing from www/fonts (first: ' + missing[0] + ').\nUnzip naki-fonts.zip into the project folder first, so that www\\fonts exists, then run this again.'); process.exit(1); }
if (!fs.existsSync(path.join(root, 'www', 'subtitles.js'))) { console.log('NOTHING WAS CHANGED. www/subtitles.js is missing. Copy it into www first, then run this again.'); process.exit(1); }
const lookPath = path.join(root, 'www', 'look.js');
if (fs.readFileSync(lookPath, 'utf8').includes('loadFonts')) { console.log('Already applied (look.js has loadFonts). Nothing to do.'); process.exit(0); }

const look = load('www/look.js'), ix = load('www/index.html'), sw = load('www/sw.js'), ed = load('www/editor.js'), pk = load('package.json');

// ---- look.js ----
rep(look, /script: \{ label: 'Script', css: '[^\n]*' \}/, (m) => m + ',\n' + FAMS.map(([, fam, key, label, , fb]) =>
  '    ' + key + ": { label: '" + label + "', css: '\"" + fam + "\", " + fb + "' }").join(',\n'), 'look: font table');
rep(look, /function fontList\(\)\{[^\n]*\n/, (m) => m + [
  '  // Loads the web fonts the titles use, so a canvas draws them and not a stand-in. items: { font, weight, text } (or just a font key). Only the parts of a font',
  '  // that the text needs are fetched. It never waits more than 8 seconds and never fails, so an export is not held up.',
  '  function loadFonts(items){',
  "    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return Promise.resolve();",
  '    var seen = {}, jobs = [];',
  '    (items || []).forEach(function (it){',
  "      var o = typeof it === 'string' ? { font: it } : (it || {}), spec = (o.weight || 700) + ' 32px ' + fontCss(o.font), text = String(o.text || 'Aa'), id = spec + '|' + text;",
  '      if (seen[id]) return; seen[id] = 1;',
  '      try { jobs.push(document.fonts.load(spec, text)); } catch (e) {}',
  '    });',
  '    var all = Promise.all(jobs).catch(function (){}), timer, wait = new Promise(function (res){ timer = setTimeout(res, 8000); });',
  '    return Promise.race([all, wait]).then(function (){ clearTimeout(timer); });',
  '  }',
  ''].join('\n'), 'look: loadFonts');
rep(look, 'fontList: fontList,', () => 'fontList: fontList, loadFonts: loadFonts,', 'look: export loadFonts');
rep(look, /NakiVersions\['look\.js'\] = '[^']*'/, () => "NakiVersions['look.js'] = 'fonts'", 'look: version', true);

// ---- index.html ----
rep(ix, '</head>', () => '<link rel="stylesheet" href="fonts/fonts.css">\n</head>', 'page: font styles');
rep(ix, /return loadWebCodecsEngine\(\)\.then\(function\(\)\{/, () =>
  "return Promise.resolve().then(function(){ return (window.NakiLook && window.NakiLook.loadFonts) ? window.NakiLook.loadFonts(plan.texts || []) : null; })" +
  '.then(function(){ return loadWebCodecsEngine(); }).then(function(){', 'page: the export waits for the fonts');
rep(ix, /'look\.js': '[^']*'/, () => "'look.js': 'fonts'", 'page: version list', true);
// subtitles.js has to be loaded before editor.js reads it
const iSub = ix.text.indexOf('<script src="subtitles.js"></script>'), reEd = /<script src="editor\.js"[^>]*><\/script>/, mEd = reEd.exec(ix.text);
if (!mEd) problems.push('page: could not find the editor.js script tag in index.html');
else if (iSub < 0) ix.text = ix.text.replace(reEd, (m) => '<script src="subtitles.js"></script>\n' + m);
else if (iSub > mEd.index) problems.push('page: the subtitles.js script tag comes after editor.js. Move it above the editor.js line in index.html.');

// ---- sw.js ----
if (!sw.text.includes('./fonts/fonts.css')) {
  rep(sw, "'./vendor/mediabunny/mediabunny.min.mjs'", (m) => ["'./fonts/fonts.css'"].concat(woff.map(f => "'./fonts/" + f + "'")).join(', ') + ', ' + m, 'service worker: font files');
}
if (!sw.text.includes("'./subtitles.js'")) notes.push("sw.js does not list './subtitles.js' yet: add it to FILES.");

// ---- editor.js ----
rep(ed, /var NCAP = [^\n]*\n/, (m) => m + "  var NSUBS = (typeof module !== 'undefined' && module.exports) ? require('./subtitles.js') : (typeof window !== 'undefined' ? window.NakiSubs : null);\n", 'editor: subtitle reader');
rep(ed, 'var items = P.parseSrt(text);', () => 'var items = NSUBS ? NSUBS.parse(text).cues : P.parseSrt(text);   // .srt and .vtt', 'editor: read .srt and .vtt');
rep(ed, 'No subtitle lines were found in that file. It should be an .srt file.', () => 'No subtitle lines were found in that file. It should be an .srt or .vtt file.', 'editor: message');
rep(ed, ".srt,text/plain,application/x-subrip", () => ".srt,.vtt,text/plain,text/vtt,application/x-subrip", 'editor: file picker');
rep(ed, 'function addMusic(){', (m) => [
  'function exportVttFile(){',
  '    var srt = exportSrt(), txt = (srt && NSUBS) ? NSUBS.toVtt(NSUBS.parse(srt).cues) : \'\';',
  "    if (!txt || txt === 'WEBVTT\\n\\n'){ toast('There are no captions or titles to save yet.'); return; }",
  "    var a = document.createElement('a'), name = String((E.sess && E.sess.name) || 'naki').replace(/[^\\w\\-]+/g, '_').slice(0, 40) || 'naki';",
  "    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/vtt' })); a.download = name + '.vtt';",
  '    document.body.appendChild(a); a.click(); setTimeout(function (){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);',
  "    toast('Saved ' + name + '.vtt');",
  '  }',
  '  ' + m].join('\n'), 'editor: save .vtt');
rep(ed, "{ id: 'edCapExport', label: 'Save .srt', run: exportSrtFile }", (m) => m + ", { id: 'edCapExportVtt', label: 'Save .vtt', run: exportVttFile }", 'editor: save .vtt button');
rep(ed, "label: 'Import .srt'", () => "label: 'Import .srt / .vtt'", 'editor: import button name');

// ---- package.json ----
let pkgNote = '';
if (!pk.text.includes('tests/fonts-subs.test.js')) {
  if (!fs.existsSync(path.join(root, 'tests', 'fonts-subs.test.js'))) pkgNote = '\nNote: copy fonts-subs.test.js into tests/, then add  && node tests/fonts-subs.test.js  to the "test" line in package.json.';
  else rep(pk, /("test":\s*"[^"]*)"/, (m) => m.slice(0, -1) + ' && node tests/fonts-subs.test.js"', 'package.json: test list');
}

if (problems.length) {
  console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + problems.join('\n  - '));
  console.log('\nSend me that list (and the file names) and I will adjust.');
  process.exit(1);
}

// the font styles: each file covers one part of the alphabet; a font with a single weight is declared for every weight, so the browser never fakes a bold
const css = ['/* Naki bundled fonts (all SIL Open Font License 1.1, see LICENSES). Each file covers one part of the alphabet; the browser only downloads what a text needs. */'];
FAMS.forEach(([pkg, fam, , , weights]) => weights.forEach(w => ['latin', 'latin-ext'].forEach(sub =>
  css.push("@font-face{font-family:'" + fam + "';font-style:normal;font-display:swap;font-weight:" + (weights.length === 1 ? '100 900' : w) + ';src:url(' + pkg + '-' + sub + '-' + w + '-normal.woff2) format(\'woff2\');unicode-range:' + RANGE[sub] + ';}'))));
[look, ix, sw, ed, pk].forEach(save);
fs.writeFileSync(path.join(fontsDir, 'fonts.css'), css.join('\n') + '\n');
console.log('Done. Changed look.js, index.html, sw.js, editor.js' + (pk.text.includes('fonts-subs') ? ', package.json' : '') + ' and rewrote www/fonts/fonts.css.' + (notes.length ? '\n  ' + notes.join('\n  ') : '') + pkgNote + '\nNow run:  npm test');
