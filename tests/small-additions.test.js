'use strict';
// node tests/small-additions.test.js   Lens flare and light effects, colour matching, more stickers.
const assert = require('assert'), fs = require('fs'), path = require('path');
const www = (f) => path.join(__dirname, '..', 'www', f);
const FX = require(www('fx.js')).vfx, CL = require(www('colour.js')), ST = require(www('stickers.js'));
let n = 0; function t(name, fn) { fn(); n++; console.log('  ok  ' + name); }

t('the four new light effects exist, in Flash & light, and draw in the ffmpeg graph and the preview', () => {
  ['flare', 'leak', 'burn', 'streak'].forEach((k) => {
    assert(FX.has(k), k + ' is registered'); assert(FX.inCat('light').some((e) => e.key === k), k + ' is in the light category');
    const g = FX.graph({ fx: k, strength: 0.6 }, 1, 3, 'cur', 'out', 1280, 720);
    assert(g && g.indexOf('[cur]split') === 0 && /\[out\]$/.test(g), k + ' graph shape');
    assert(!/NaN|undefined/.test(g), k + ' graph has no NaN');
    const p = FX.preview([{ fx: k, strength: 0.6, start: 1000, dur: 2000 }], 1500);
    assert(p.tints.length === 1, k + ' has a preview tint');
  });
  assert(/geq=lum=/.test(FX.graph({ fx: 'flare', strength: 0.5 }, 0, 2, 'a', 'b', 1920, 1080)));
});
t('frameStats reads the average and spread', () => {
  const px = new Uint8ClampedArray(4 * 100);
  for (let i = 0; i < 100; i++) { px[i * 4] = i % 2 ? 200 : 100; px[i * 4 + 1] = 50; px[i * 4 + 2] = 0; px[i * 4 + 3] = 255; }
  const s = CL.frameStats(px); assert(Math.abs(s.mean[0] - 150 / 255) < 0.01); assert(Math.abs(s.std[0] - 50 / 255) < 0.01); assert(s.std[1] === 0);
});
t('matchGrade: identical pictures need nothing; a darker one is pulled toward the reference', () => {
  const a = { mean: [0.5, 0.5, 0.5], std: [0.2, 0.2, 0.2] };
  const none = CL.matchGrade(a, a, 1); assert(!none.r && !none.g && !none.b);
  const cur = { mean: [0.3, 0.35, 0.5], std: [0.15, 0.15, 0.2] }, m = CL.matchGrade(a, cur, 1);
  assert(m.r && m.g && !m.b, 'red and green change, blue already matches');
  const fr = CL.curveFn(m.r); assert(fr(0.3) > 0.45, 'red at its old average is lifted to about the reference average: ' + fr(0.3));
  const half = CL.curveFn(CL.matchGrade(a, cur, 0.5).r); assert(half(0.3) < fr(0.3) && half(0.3) > 0.3, 'half strength lands in between');
  const g = CL.cleanGrade({ curves: { r: m.r, g: m.g } }); assert(g && g.curves.r);
});
t('the editor has the Match previous clip button', () => {
  const ed = fs.readFileSync(www('editor.js'), 'utf8'); assert(ed.includes('edGradeMatch') && ed.includes('function matchPrevious'));
});
t('stickers: the first emoji are unchanged, there are many more, no duplicates', () => {
  assert.strictEqual(ST.EMOJI.slice(0, 5).join(''), '😀😂😍😎🥳'); assert(ST.EMOJI.length > 150);
  assert.strictEqual(new Set(ST.EMOJI).size, ST.EMOJI.length); assert(ST.SYMBOLS.length >= 30 && ST.isSymbol('♡'));
  assert(!ST.SYMBOLS.some((s) => ST.EMOJI.indexOf(s) >= 0), 'a symbol is not also an emoji');
});
console.log('\n' + n + ' checks passed');