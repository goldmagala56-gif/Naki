'use strict';
// node tests/fonts-subs.test.js
// The bundled fonts (picker, files, licences, loading before export, offline) and .vtt support in the captions.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), www = (f) => path.join(root, 'www', f), read = (f) => fs.readFileSync(www(f), 'utf8');
const L = require('../www/look.js'), P = require('../www/project.js'), S = require('../www/subtitles.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const NEW = ['inter', 'montserrat', 'poppins', 'bebas', 'anton', 'oswald', 'archivo', 'bangers', 'righteous', 'playfair', 'pacifico', 'lobster', 'caveat', 'dancing'];
const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' }] }] };
const css = read('fonts/fonts.css'), urls = [...css.matchAll(/url\(([^)]+\.woff2)\)/g)].map(m => m[1]);
const familyOf = (k) => /^"([^"]+)"/.exec(L.fontCss(k))[1];

ok('fonts: the five old fonts are still there, the fourteen new ones are added, and each names its own font first with a stand-in after it', () => {
  const keys = L.fontList().map(f => f.key);
  ['sans', 'serif', 'mono', 'bold', 'script'].forEach(k => assert(keys.includes(k), k)); assert.strictEqual(keys.length, 19); assert.strictEqual(new Set(keys).size, 19);
  NEW.forEach(k => { assert(keys.includes(k), k); assert(/^"[^"]+", [^,]+/.test(L.fontCss(k)), k + ': ' + L.fontCss(k)); });
  L.fontList().forEach(f => assert(f.label, f.key));
});
ok('fonts: fonts.css names every family, every file it uses is there, and every font file in the folder is used', () => {
  assert.strictEqual(urls.length, 38, 'fourteen families, both alphabets'); urls.forEach(u => assert(fs.existsSync(www('fonts/' + u)), u));
  const files = fs.readdirSync(www('fonts')).filter(f => f.endsWith('.woff2')).sort(); assert.deepStrictEqual(files, [...new Set(urls)].sort());
  NEW.forEach(k => assert(css.includes("font-family:'" + familyOf(k) + "'"), k));
  assert(css.includes('U+0100-02BA'), 'the extended Latin part covers letters such as \u014b'); assert(css.includes('font-display:swap'));
});
ok('fonts: a font that comes in one weight is declared for every weight, so the browser never fakes a bold', () => {
  ['Bebas Neue', 'Anton', 'Archivo Black', 'Bangers', 'Righteous', 'Pacifico', 'Lobster', 'Caveat', 'Oswald', 'Playfair Display', 'Dancing Script'].forEach(f => {
    const lines = css.split('\n').filter(l => l.includes("font-family:'" + f + "'")); assert(lines.length === 2 && lines.every(l => l.includes('font-weight:100 900')), f);
  });
  assert(css.includes("font-family:'Inter'") && /font-weight:800/.test(css) && /font-weight:400/.test(css), 'fonts with several weights keep them');
});
ok('fonts: every font has its licence text next to it, and there is a list of who made them', () => {
  const dir = www('fonts/LICENSES'), list = fs.readdirSync(dir); assert.strictEqual(list.length, 14);
  list.forEach(f => assert(/SIL OPEN FONT LICENSE/i.test(fs.readFileSync(path.join(dir, f), 'utf8')), f)); assert(/Open Font License/.test(read('fonts/FONTS.txt')));
});
ok('fonts: the project takes every new font on a title and on captions', () => {
  NEW.forEach(k => { const out = {}; let p = P.addTextClip(base, 1000, 3000, out); p = P.setTextProps(p, out.id, { text: 'Hi', font: k }); assert.strictEqual(P.findClip(p, out.id).clip.font, k, k + ' was not kept on a title'); });
  const o = {}; let q = P.addCaptions(base, [{ startMs: 0, endMs: 2000, text: 'Hi' }], {}, o); q = P.setCaptionStyle(q, { size: 5, color: '#ffffff', pos: 'bottom', weight: 700, bg: true, font: 'bebas', outline: 0, shadow: 1 });
  assert.strictEqual(P.captionTrackOf(q).clips[0].font, 'bebas', 'captions');
});
ok('fonts: loadFonts asks the browser for each font once, with the letters the text needs, and is harmless where there is no browser', () => {
  const none = L.loadFonts([{ font: 'inter', text: 'x' }]); assert(none && typeof none.then === 'function', 'no document: still gives back something to wait on');
  const calls = []; global.document = { fonts: { load: (spec, text) => { calls.push([spec, text]); return Promise.resolve([]); } } };
  try {
    const r = L.loadFonts([{ font: 'bebas', weight: 400, text: 'Oli \u014b' }, { font: 'bebas', weight: 400, text: 'Oli \u014b' }, 'inter', null, {}]);
    assert(r && typeof r.then === 'function'); assert.strictEqual(calls.length, 3, 'the repeat is asked once; the two empty entries share the standard font: ' + JSON.stringify(calls));
    assert(calls[0][0].startsWith('400 32px "Bebas Neue"') && calls[0][1] === 'Oli \u014b', 'the letters are passed on, so the right part of the font is fetched'); assert(calls[1][0].startsWith('700 32px "Inter"') && calls[1][1] === 'Aa');
    assert.strictEqual(L.loadFonts().then !== undefined, true, 'no list is fine');
  } finally { delete global.document; }
});
ok('page: fonts.css is linked, the export waits for the fonts, every font file is kept for offline use, and subtitles.js loads before the editor', () => {
  const ix = read('index.html'), sw = read('sw.js');
  assert(ix.includes('href="fonts/fonts.css"')); assert(/loadFonts\(plan\.texts/.test(ix), 'the export waits for the fonts');
  assert(sw.includes("'./fonts/fonts.css'")); urls.forEach(u => assert(sw.includes("'./fonts/" + u + "'"), u + ' is not in the offline list'));
  const a = ix.indexOf('<script src="subtitles.js"'), b = ix.indexOf('<script src="editor.js"'); assert(a > 0 && b > 0 && a < b, 'subtitles.js before editor.js');
});
ok('captions: Import takes .vtt as well as .srt through the new reader, and there is a Save .vtt button beside Save .srt', () => {
  const ed = read('editor.js');
  assert(ed.includes(".srt,.vtt")); assert(ed.includes('NSUBS.parse(text)')); assert(ed.includes("label: 'Save .vtt'") && ed.includes("label: 'Save .srt'")); assert(ed.includes('function exportVttFile'));
});
ok('captions: a .vtt file becomes captions on the timeline, and saving gives a file that reads back the same in both formats', () => {
  const cues = S.parse('WEBVTT\n\n00:01.000 --> 00:02.500 align:start\nHello\n\n00:03.000 --> 00:04.000\n<i>Again</i>\n').cues, out = {};
  const p = P.addCaptions(base, cues, { replace: true }, out); assert.strictEqual(out.added, 2); assert.deepStrictEqual(P.captionList(p).map(c => c.text), ['Hello', 'Again']);
  const srt = P.toSrt(p), back = S.parse(srt).cues; assert.deepStrictEqual(back.map(c => [c.startMs, c.endMs, c.text]), [[1000, 2500, 'Hello'], [3000, 4000, 'Again']]);
  const vtt = S.toVtt(back); assert(vtt.startsWith('WEBVTT\n\n') && vtt.includes('00:00:01.000 --> 00:00:02.500\nHello')); assert.deepStrictEqual(S.parse(vtt).cues, back);
});
console.log('\n' + n + ' checks passed');
