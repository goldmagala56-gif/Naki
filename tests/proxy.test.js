'use strict';
// node tests/proxy.test.js
// Smooth editing (light copy): the bookkeeping is tested here with pretend parts; the making of the copy needs a real phone.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const html = read('index.html'), ed = read('editor.js');
const a = html.indexOf('// ---------- smooth editing: a light copy'), b = html.indexOf('// ---------- end smooth editing ----------');
assert(a > 0 && b > a, 'the light copy code is in index.html');
function world(over) {
  const log = { revoked: [], put: [] }, store = {};
  const ctx = Object.assign({
    S: { movieFile: { name: 'm.mp4', size: 1000, lastModified: 5 }, movieUrl: 'blob:orig' }, el: { movie: { videoWidth: 640, videoHeight: 360 } },
    DB: { ok: true, get: (s, k) => Promise.resolve(store[s + k]), put: (s, r) => { store[s + r.sid] = r; log.put.push(r.sid); return Promise.resolve(); } },
    URL: { createObjectURL: () => 'blob:proxy', revokeObjectURL: u => log.revoked.push(u) }, toast: () => {}, console, Promise, Math, Blob, Error, document: {}, location: { href: 'http://x/' }, VideoEncoder: function () {}
  }, over || {});
  vm.createContext(ctx); vm.runInContext(html.slice(a, b), ctx); return { ctx, log, store };
}
ok('the preview uses the original until a light copy exists and is switched on', () => {
  const { ctx } = world(); assert.strictEqual(vm.runInContext('pxUrl()', ctx), 'blob:orig');
  vm.runInContext("PX.url = 'blob:proxy'; PX.key = pxKey(S.movieFile);", ctx); assert.strictEqual(vm.runInContext('pxUrl()', ctx), 'blob:orig', 'off by default');
  assert.strictEqual(vm.runInContext('PXHOOK.set(true)', ctx), true); assert.strictEqual(vm.runInContext('pxUrl()', ctx), 'blob:proxy'); assert.strictEqual(vm.runInContext('PXHOOK.set(false)', ctx), false);
  assert.strictEqual(vm.runInContext('pxUrl()', ctx), 'blob:orig');
});
ok('it cannot be switched on without a copy; dropping it switches it off and frees it', () => {
  const { ctx, log } = world(); assert.strictEqual(vm.runInContext('PXHOOK.set(true)', ctx), false);
  vm.runInContext("PX.url = 'blob:proxy'; PX.key = 'k'; PX.on = true;", ctx); vm.runInContext('pxDrop()', ctx);
  assert.deepStrictEqual(log.revoked, ['blob:proxy']); assert.strictEqual(vm.runInContext('pxUrl()', ctx), 'blob:orig'); assert.strictEqual(vm.runInContext('PX.on', ctx), false);
});
ok('a heavy movie is told apart from a light one, and the advice is given once per movie', () => {
  const w = world(); assert.strictEqual(vm.runInContext('pxState().big', w.ctx), false);
  const big = world({ el: { movie: { videoWidth: 1920, videoHeight: 1080 } } }); assert.strictEqual(vm.runInContext('pxState().big', big.ctx), true);
  const huge = world(); huge.ctx.S.movieFile.size = 400 * 1024 * 1024; assert.strictEqual(vm.runInContext('pxState().big', huge.ctx), true);
  assert.strictEqual(vm.runInContext('pxState().advised', big.ctx), false); vm.runInContext('PXHOOK.advised()', big.ctx); assert.strictEqual(vm.runInContext('pxState().advised', big.ctx), true);
});
ok('a copy kept on the device is found again for the same movie, and not for another one', async () => {
  const w = world(); w.store['moviesproxy:' + 'm.mp4|1000|5'] = { sid: 'proxy:m.mp4|1000|5', blob: { size: 5 } };
  const s = await vm.runInContext('pxLoad()', w.ctx); assert.strictEqual(s.have, true); assert.strictEqual(s.on, false);
  const o = world(); o.ctx.S.movieFile = { name: 'other.mp4', size: 9, lastModified: 1 }; o.store['moviesproxy:m.mp4|1000|5'] = { blob: {} };
  assert.strictEqual((await vm.runInContext('pxLoad()', o.ctx)).have, false);
});
ok('without the browser video encoder nothing is attempted', async () => {
  const w = world({ VideoEncoder: undefined }); let said = ''; w.ctx.toast = t => { said = t; };
  assert.strictEqual(await vm.runInContext('pxBuild()', w.ctx), false); assert(/cannot make/.test(said));
});
ok('the editor is wired: the hook, the movie url, the new-movie drop, the panel and the forced swap; edited files parse', () => {
  ['movieUrl: function(){ return pxUrl(); }, proxy: PXHOOK,', 'pxDrop();   // a different movie'].forEach(s => assert(html.includes(s), s));
  ["proxy: { title: 'Smooth editing'", "id: 'edProxyMake'", "id: 'edProxyToggle'", 'function resyncMedia', "openPanel('proxy')"].forEach(s => assert(ed.includes(s), s));
  new vm.Script(ed); const m = html.match(/<script>([\s\S]*?)<\/script>/g) || []; assert(m.length > 0); m.forEach(s => { const code = s.replace(/^<script>|<\/script>$/g, ''); if (!/src=/.test(s)) new vm.Script(code); });
});
console.log('\n' + n + ' checks passed');
