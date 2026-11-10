'use strict';
// node tests/sfx-more.test.js
// The extra sound-effect pack (www/sfx-more.js): over a thousand effects, each one a real, steady, non-clipping sound with its own name.
const assert = require('assert'), fs = require('fs'), path = require('path');
const S = require('../www/sfx.js'), apply = require('../www/sfx-more.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const before = S.LIST.length; apply(S); apply(S);   // twice on purpose: it must not add them twice
const more = S.LIST.slice(before), SR = 16000;
ok('over a thousand new effects, added once, each with a unique key, a unique name and a category; the original ones are untouched', () => {
  assert(more.length >= 1000, 'new effects: ' + more.length); assert.strictEqual(S.LIST.length, before + more.length);
  assert.strictEqual(new Set(S.LIST.map(x => x.key)).size, S.LIST.length); assert.strictEqual(new Set(S.LIST.map(x => x.label)).size, S.LIST.length);
  more.forEach(x => assert(x.cat && x.label && x.durMs >= 60 && x.durMs <= 8000, x.key));
  ['whoosh', 'swipe', 'pop', 'click', 'ding', 'coin', 'laser', 'boom', 'riser', 'drop'].forEach((k, i) => assert.strictEqual(S.LIST[i].key, k));
});
ok('every group has several effects, so the buttons are worth having', () => {
  const by = {}; more.forEach(x => { by[x.cat] = (by[x.cat] || 0) + 1; }); assert(Object.keys(by).length >= 25, Object.keys(by).join()); Object.keys(by).forEach(c => assert(by[c] >= 10, c));
});
ok('every effect: the right length, loudest sample 0.85 (never clipping), really sounding, soft at both ends, no bad numbers, and always the same', () => {
  more.forEach(x => {
    const a = S.render(x.key, SR), b = S.render(x.key, SR); assert.strictEqual(a.length, Math.round(x.durMs * SR / 1000), x.key + ' length');
    let pk = 0, e = 0, mx = 0; for (let i = 0; i < a.length; i++) { assert(Number.isFinite(a[i]), x.key + ' sample ' + i); pk = Math.max(pk, Math.abs(a[i])); e += a[i] * a[i]; }
    assert(Math.abs(pk - 0.85) < 0.001, x.key + ' peak ' + pk); assert(Math.sqrt(e / a.length) > 0.012, x.key + ' is nearly silent: ' + Math.sqrt(e / a.length).toFixed(4));
    assert(Math.abs(a[0]) < 0.01 && Math.abs(a[a.length - 1]) < 0.01, x.key + ' ends'); for (let i = 0; i < a.length; i += 7) assert.strictEqual(a[i], b[i], x.key + ' repeatable at ' + i);
  });
});
ok('no two effects are the same sound', () => {
  const seen = new Map(); more.forEach(x => { const a = S.render(x.key, 8000); let h = 0; for (let i = 0; i < a.length; i += 3) h = (Math.imul(h, 31) + Math.round(a[i] * 1000)) | 0; const id = a.length + ':' + h; assert(!seen.has(id), x.key + ' sounds exactly like ' + seen.get(id)); seen.set(id, x.key); });
});
ok('it works at other sample rates and the WAV file is right', () => {
  const x = more[5], a = S.render(x.key, 48000), w = S.toWav(a, 48000), v = new DataView(w.buffer);
  assert.strictEqual(a.length, Math.round(x.durMs * 48)); assert.strictEqual(String.fromCharCode(w[0], w[1], w[2], w[3]), 'RIFF'); assert.strictEqual(w.length, 44 + a.length * 2); assert.strictEqual(v.getUint32(24, true), 48000);
  assert.strictEqual(S.render('nonsense'), null);
});
ok('index.html loads sfx-more.js right after sfx.js, and the service worker caches it', () => {
  const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8'), sw = fs.readFileSync(path.join(__dirname, '../www/sw.js'), 'utf8');
  assert(/<script src="sfx\.js"><\/script>\s*<script src="sfx-more\.js"><\/script>/.test(html), 'script tag'); assert(sw.includes('sfx-more.js'), 'sw.js');
});
console.log('\n' + n + ' checks passed');
