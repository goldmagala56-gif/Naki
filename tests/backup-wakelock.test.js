'use strict';
// node tests/backup-wakelock.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
let n = 0; const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; console.log('  ok  ' + name); });
const tick = () => new Promise(r => setImmediate(r));
function sentinel() { const l = []; return { released: false, release() { this.released = true; l.forEach(f => f()); }, addEventListener(t, f) { l.push(f); } }; }
function wakeContext() {
  const m = /\/\*wake:start\*\/([\s\S]*?)\/\*wake:end\*\//.exec(html); assert(m, 'the wake block is in index.html');
  const ctx = { S: { wake: null }, Object, Promise }; ctx.requests = 0; ctx.last = null;
  ctx.navigator = { wakeLock: { request() { ctx.requests++; ctx.last = sentinel(); return Promise.resolve(ctx.last); } } };
  vm.createContext(ctx); vm.runInContext(m[1], ctx); return ctx;
}
(async function () {
  await ok('backup.js is loaded before the editor, and every project has a Back up button', () => {
    assert(html.includes('<script src="backup.js"></script>')); assert(html.indexOf('backup.js') < html.indexOf('src="editor.js"'));
    ["'aria-label': 'Back up'", 'backupSaved(s)', 'id="bBackup"', "$('bBackup').onclick", 'function backupPrepare', 'backupWarn'].forEach(s => assert(html.includes(s), s));
  });
  await ok('the inline scripts still parse', () => { const re = /<script>([\s\S]*?)<\/script>/g; let m, k = 0; while ((m = re.exec(html))) { new vm.Script(m[1]); k++; } assert(k >= 2); });
  await ok('exporting and converting hold the screen awake and let go when they finish', () => {
    ["wakeOn('export')", "wakeOff('export')", "wakeOn('convert')", "wakeOff('convert')", "wakeOn('rec')", "wakeOff('rec')", 'id="exportAwake"'].forEach(s => assert(html.includes(s), s));
    assert(!html.includes("navigator.wakeLock.request('screen').then(function(w){ S.wake = w; }"), 'the old leaking request is gone');
  });
  await ok('one lock is shared: asking again does not make another, and it is kept until the last user lets go', async () => {
    const c = wakeContext(); c.wakeOn('export'); await tick(); assert.strictEqual(c.requests, 1); assert(c.S.wake);
    c.wakeOn('rec'); await tick(); assert.strictEqual(c.requests, 1);
    const s = c.last; c.wakeOff('export'); assert.strictEqual(s.released, false); assert(c.S.wake);
    c.wakeOff('rec'); assert.strictEqual(s.released, true); assert.strictEqual(c.S.wake, null);
  });
  await ok('letting go before the phone answers still releases the lock', async () => {
    const c = wakeContext(); c.wakeOn('x'); c.wakeOff('x'); await tick(); assert.strictEqual(c.last.released, true); assert.strictEqual(c.S.wake, null);
  });
  await ok('when the phone drops the lock (page hidden), coming back asks for it again', async () => {
    const c = wakeContext(); c.wakeOn('export'); await tick(); c.last.release(); assert.strictEqual(c.S.wake, null);
    c.wakeSync(); await tick(); assert.strictEqual(c.requests, 2); assert(c.S.wake);
  });
  await ok('a browser without wake lock does not break anything', async () => {
    const c = wakeContext(); c.navigator = {}; c.wakeOn('export'); c.wakeOff('export'); assert.strictEqual(c.S.wake, null);
  });
  console.log('\n' + n + ' checks passed');
})().catch(e => { console.error(e); process.exit(1); });