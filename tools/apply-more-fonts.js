'use strict';
// 60 more bundled fonts (all SIL Open Font License). Downloads them from npm (@fontsource), copies the latin files into www/fonts,
// adds them to look.js (the picker), project.js (the list of fonts a title may use), sw.js (offline) and rewrites www/fonts/fonts.css.
// Run from the project folder:   node tools/apply-more-fonts.js
// It checks every spot before writing, skips any font that cannot be downloaded, and tells you which.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..'), fontsDir = path.join(root, 'www', 'fonts');

const FB = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  display: 'Impact, "Arial Narrow", sans-serif',
  script: '"Brush Script MT", "Segoe Script", cursive',
  hand: '"Segoe Script", "Comic Sans MS", cursive'
};
// package id, label, weights wanted, kind
const NEW = [
  // serif and elegant
  ['lora', 'Lora', [400, 700], 'serif'], ['merriweather', 'Merriweather', [400, 700], 'serif'], ['libre-baskerville', 'Libre Baskerville', [400, 700], 'serif'],
  ['crimson-text', 'Crimson', [400, 700], 'serif'], ['eb-garamond', 'EB Garamond', [400, 700], 'serif'], ['cormorant-garamond', 'Cormorant', [400, 700], 'serif'],
  ['pt-serif', 'PT Serif', [400, 700], 'serif'], ['source-serif-4', 'Source Serif', [400, 700], 'serif'], ['libre-caslon-text', 'Libre Caslon', [400, 700], 'serif'],
  ['abril-fatface', 'Abril Fatface', [400], 'serif'], ['dm-serif-display', 'DM Serif Display', [400], 'serif'], ['cinzel', 'Cinzel', [400, 700], 'serif'],
  ['cinzel-decorative', 'Cinzel Decorative', [400, 700], 'serif'], ['marcellus', 'Marcellus', [400], 'serif'], ['old-standard-tt', 'Old Standard', [400, 700], 'serif'],
  ['alfa-slab-one', 'Alfa Slab', [400], 'display'], ['unifrakturcook', 'Gothic', [700], 'serif'],
  // scripts and handwriting
  ['great-vibes', 'Great Vibes', [400], 'script'], ['sacramento', 'Sacramento', [400], 'script'], ['allura', 'Allura', [400], 'script'], ['parisienne', 'Parisienne', [400], 'script'],
  ['alex-brush', 'Alex Brush', [400], 'script'], ['pinyon-script', 'Pinyon Script', [400], 'script'], ['italianno', 'Italianno', [400], 'script'], ['tangerine', 'Tangerine', [400, 700], 'script'],
  ['satisfy', 'Satisfy', [400], 'script'], ['kaushan-script', 'Kaushan Script', [400], 'script'], ['yellowtail', 'Yellowtail', [400], 'script'], ['courgette', 'Courgette', [400], 'script'],
  ['cookie', 'Cookie', [400], 'script'], ['playball', 'Playball', [400], 'script'],
  ['shadows-into-light', 'Shadows Into Light', [400], 'hand'], ['indie-flower', 'Indie Flower', [400], 'hand'], ['permanent-marker', 'Permanent Marker', [400], 'hand'],
  ['rock-salt', 'Rock Salt', [400], 'hand'], ['amatic-sc', 'Amatic', [400, 700], 'hand'], ['gloria-hallelujah', 'Gloria Hallelujah', [400], 'hand'],
  // display and fun
  ['luckiest-guy', 'Luckiest Guy', [400], 'display'], ['chewy', 'Chewy', [400], 'display'], ['creepster', 'Creepster', [400], 'display'], ['bungee', 'Bungee', [400], 'display'],
  ['staatliches', 'Staatliches', [400], 'display'], ['monoton', 'Monoton', [400], 'display'], ['black-ops-one', 'Black Ops', [400], 'display'], ['russo-one', 'Russo One', [400], 'display'],
  ['press-start-2p', 'Pixel', [400], 'display'], ['orbitron', 'Orbitron', [400, 700], 'sans'], ['special-elite', 'Typewriter', [400], 'serif'], ['lilita-one', 'Lilita One', [400], 'display'],
  ['fredoka', 'Fredoka', [400, 700], 'sans'], ['teko', 'Teko', [400, 700], 'display'],
  // clean sans
  ['lato', 'Lato', [400, 700], 'sans'], ['open-sans', 'Open Sans', [400, 700], 'sans'], ['roboto', 'Roboto', [400, 700], 'sans'], ['raleway', 'Raleway', [400, 700], 'sans'],
  ['nunito', 'Nunito', [400, 700], 'sans'], ['quicksand', 'Quicksand', [400, 700], 'sans'], ['comfortaa', 'Comfortaa', [400, 700], 'sans'], ['josefin-sans', 'Josefin Sans', [400, 700], 'sans'],
  ['barlow-condensed', 'Barlow Condensed', [500, 700], 'display'], ['baloo-2', 'Baloo', [400, 700], 'sans']
];
// the 14 fonts already installed (for rewriting fonts.css): package, family, weights
const OLD = [['inter', 'Inter', [400, 700, 800]], ['montserrat', 'Montserrat', [400, 700, 800]], ['poppins', 'Poppins', [500, 700]], ['bebas-neue', 'Bebas Neue', [400]], ['anton', 'Anton', [400]],
  ['oswald', 'Oswald', [700]], ['archivo-black', 'Archivo Black', [400]], ['bangers', 'Bangers', [400]], ['righteous', 'Righteous', [400]], ['playfair-display', 'Playfair Display', [700]],
  ['pacifico', 'Pacifico', [400]], ['lobster', 'Lobster', [400]], ['caveat', 'Caveat', [700]], ['dancing-script', 'Dancing Script', [700]]];
const RANGE = {
  'latin': 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
};
const keyOf = (id) => id.replace(/-/g, '');

function load(rel) { const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o) { fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const look = load('www/look.js'), proj = load('www/project.js'), sw = load('www/sw.js');
if (look.text.includes("lora: {")) { console.log('Already applied. Nothing to do.'); process.exit(0); }
const reDance = /dancing: \{ label: '[^']*', css: '[^']*' \}/, reTF = /(var TEXT_FONTS = \[[^\]]*'dancing')\]/;
const problems = [];
if (!reDance.test(look.text)) problems.push("look.js: the 'dancing' line of the font table was not found (run apply-fonts-subs.js first, or send me the font table)");
if (!reTF.test(proj.text)) problems.push("project.js: the TEXT_FONTS list was not found");
if (!sw.text.includes("'./fonts/fonts.css'")) problems.push("sw.js: './fonts/fonts.css' was not found in the file list");
if (!fs.existsSync(fontsDir)) problems.push('www/fonts does not exist');
if (problems.length) { console.log('NOTHING WAS CHANGED:\n  - ' + problems.join('\n  - ')); process.exit(1); }

// ---- download ----
const tmp = path.join(root, '.fonttmp');
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"fonttmp","version":"1.0.0","private":true}');
const ok = [], skipped = [];
console.log('Downloading ' + NEW.length + ' fonts (about a minute or two)...');
NEW.forEach(([id, label, weights, kind]) => {
  try { cp.execSync('npm install --no-audit --no-fund --silent --prefix "' + tmp + '" @fontsource/' + id, { stdio: 'ignore' }); }
  catch (e) { skipped.push(label + ' (could not download)'); return; }
  const dir = path.join(tmp, 'node_modules', '@fontsource', id, 'files');
  const have = weights.filter(w => fs.existsSync(path.join(dir, id + '-latin-' + w + '-normal.woff2')));
  if (!have.length) { skipped.push(label + ' (no files for the weights wanted)'); return; }
  have.forEach(w => fs.copyFileSync(path.join(dir, id + '-latin-' + w + '-normal.woff2'), path.join(fontsDir, id + '-latin-' + w + '-normal.woff2')));
  ok.push({ id, label, weights: have, kind, key: keyOf(id) });
});
fs.rmSync(tmp, { recursive: true, force: true });
if (!ok.length) { console.log('NOTHING WAS CHANGED. No font could be downloaded. Check your internet connection and run it again.'); process.exit(1); }

// ---- look.js: the picker ----
look.text = look.text.replace(reDance, (m) => m + ',\n' + ok.map(f => '    ' + f.key + ": { label: '" + f.label + "', css: '\"" + f.label.replace(/ Fatface$/, ' Fatface') + "\", " + FB[f.kind] + "' }").join(',\n'));
// ---- project.js: the fonts a title may use ----
proj.text = proj.text.replace(reTF, (m, a) => a + ', ' + ok.map(f => "'" + f.key + "'").join(', ') + ']');
// ---- sw.js: offline ----
const files = []; ok.forEach(f => f.weights.forEach(w => files.push(f.id + '-latin-' + w + '-normal.woff2')));
sw.text = sw.text.replace("'./fonts/fonts.css'", () => "'./fonts/fonts.css', " + files.map(n => "'./fonts/" + n + "'").join(', '));
// ---- fonts.css: everything again ----
const css = ['/* Naki bundled fonts (all SIL Open Font License 1.1). Each file covers one part of the alphabet; the browser only downloads what a text needs. */'];
const face = (fam, id, sub, w, single) => "@font-face{font-family:'" + fam + "';font-style:normal;font-display:swap;font-weight:" + (single ? '100 900' : w) + ';src:url(' + id + '-' + sub + '-' + w + "-normal.woff2) format('woff2');unicode-range:" + RANGE[sub] + ';}';
OLD.forEach(([id, fam, ws]) => ws.forEach(w => ['latin', 'latin-ext'].forEach(sub => css.push(face(fam, id, sub, w, ws.length === 1)))));
ok.forEach(f => f.weights.forEach(w => css.push(face(f.label.replace(/^Crimson$/, 'Crimson Text').replace(/^Cormorant$/, 'Cormorant Garamond'), f.id, 'latin', w, f.weights.length === 1))));
[look, proj, sw].forEach(save);
fs.writeFileSync(path.join(fontsDir, 'fonts.css'), css.join('\n') + '\n');
console.log('Done. Added ' + ok.length + ' fonts (' + (14 + ok.length) + ' in all).' + (skipped.length ? '\nSkipped: ' + skipped.join(', ') : '') + '\nNow run:  npm test');