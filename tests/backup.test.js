'use strict';
// node tests/backup.test.js
const assert = require('assert');
const B = require('../www/backup.js');
const enc = (s) => new TextEncoder().encode(s), u32 = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

function fakeDb() {
  const rows = [];
  const keyOf = (st, v) => st === 'sessions' ? v.id : (st === 'movies' || st === 'music' || st === 'projects') ? v.sid : v.sid + '|' + (v.i != null ? v.i : v.n);
  return { rows,
    put(st, v) { const sid = st === 'sessions' ? v.id : v.sid, key = keyOf(st, v), i = rows.findIndex(r => r.st === st && r.key === key); const row = { st, sid, key, v }; if (i >= 0) rows[i] = row; else rows.push(row); return Promise.resolve(); },
    get(st, sid) { const r = rows.find(r => r.st === st && r.sid === sid); return Promise.resolve(r ? r.v : undefined); },
    range(st, sid) { return Promise.resolve(rows.filter(r => r.st === st && r.sid === sid).map(r => r.v)); },
    delSession(sid) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].sid === sid) rows.splice(i, 1); return Promise.resolve(); } };
}
const rec = (obj, blob) => { const h = enc(JSON.stringify(obj)); return [u32(h.length), h].concat(blob ? [blob] : []); };
const file = (parts) => new Blob([enc(B.MAGIC)].concat(...parts));
const reject = (p, re, msg) => p.then(() => { throw new Error('should have failed: ' + msg); }, (e) => assert(re.test(e.message), msg + ': ' + e.message));

(async () => {
  let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };
  const db = fakeDb();
  await db.put('sessions', { id: 's1', name: 'My trip', events: [{ t: 0, type: 'rec_start' }], durationMs: 5000 });
  await db.put('chunks', { sid: 's1', i: 0, blob: new Blob(['aaa'], { type: 'audio/webm' }) });
  await db.put('chunks', { sid: 's1', i: 1, blob: new Blob(['bbbb'], { type: 'audio/webm' }) });
  await db.put('levels', { sid: 's1', i: 0, data: [1, 2, 3] });
  await db.put('movies', { sid: 's1', name: 'm.mp4', size: 7, blob: new Blob(['MOVIE!!'], { type: 'video/mp4' }) });
  await db.put('overlays', { sid: 's1', n: 1, id: 'ov1', name: 'p.png', blob: new Blob(['PNG'], { type: 'image/png' }) });
  await db.put('projects', { sid: 's1', sig: 'x', project: { tracks: [] } });
  await db.put('sessions', { id: 's2', name: 'Other' });

  await ok('a backup comes back as a new session with every file and record, and the original is untouched', async () => {
    const f = await B.exportSession(db, 's1', { app: 't' }), r = await B.importSession(db, f, { newId: 'sNEW' });
    assert.strictEqual(r.id, 'sNEW'); assert.strictEqual(r.name, 'My trip');
    const g = (st) => db.rows.filter(x => x.sid === 'sNEW' && x.st === st).map(x => x.v);
    assert.strictEqual(g('sessions')[0].id, 'sNEW'); assert.deepStrictEqual(g('sessions')[0].events, [{ t: 0, type: 'rec_start' }]);
    assert.deepStrictEqual(await Promise.all(g('chunks').sort((a, b) => a.i - b.i).map(c => c.blob.text())), ['aaa', 'bbbb']); assert.strictEqual(g('chunks')[0].blob.type, 'audio/webm');
    assert.deepStrictEqual(g('levels')[0].data, [1, 2, 3]); assert.strictEqual(await g('movies')[0].blob.text(), 'MOVIE!!'); assert.strictEqual(g('movies')[0].size, 7);
    assert.strictEqual(g('overlays')[0].id, 'ov1'); assert.strictEqual(await g('overlays')[0].blob.text(), 'PNG'); assert.deepStrictEqual(g('projects')[0].project, { tracks: [] });
    assert.strictEqual(db.rows.filter(x => x.sid === 's1').length, 7, 'the original is still there'); assert.strictEqual(db.rows.filter(x => x.sid === 's2').length, 1, 'other sessions are not copied');
  });
  await ok('a file that is not a backup, or is cut short, is refused and leaves nothing behind', async () => {
    const d = fakeDb(); await reject(B.importSession(d, new Blob(['hello world, not a backup']), { newId: 'x' }), /not a Naki backup/, 'bad magic');
    const f = await B.exportSession(db, 's1'), cut = f.slice(0, f.size - 9), d2 = fakeDb();
    await reject(B.importSession(d2, cut, { newId: 'x' }), /incomplete|damaged/, 'cut short'); assert.strictEqual(d2.rows.length, 0);
    const mid = f.slice(0, Math.floor(f.size / 2)), d3 = fakeDb(); await reject(B.importSession(d3, mid, { newId: 'x' }), /incomplete|damaged/, 'half'); assert.strictEqual(d3.rows.length, 0);
  });
  await ok('an unknown store, a missing session and a newer file version are refused, with the partial copy removed', async () => {
    const d = fakeDb();
    await reject(B.importSession(d, file([rec({ kind: 'meta', version: 1 }), rec({ kind: 'rec', store: 'sessions', rec: { id: 'a', name: 'n' }, size: 0 }), rec({ kind: 'rec', store: 'evil', rec: {}, size: 0 })]), { newId: 'z' }), /does not understand/, 'unknown store');
    assert.strictEqual(d.rows.length, 0);
    await reject(B.importSession(fakeDb(), file([rec({ kind: 'meta', version: 1 }), rec({ kind: 'end', count: 0 })]), { newId: 'z' }), /no session/, 'no session');
    await reject(B.importSession(fakeDb(), file([rec({ kind: 'meta', version: 9 })]), { newId: 'z' }), /newer version/, 'newer');
    await reject(B.exportSession(fakeDb(), 'nope'), /not found/, 'missing session');
  });
  await ok('two restores of the same backup make two separate sessions', async () => {
    const f = await B.exportSession(db, 's1'), d = fakeDb(), a = await B.importSession(d, f), b = await B.importSession(d, f);
    assert.notStrictEqual(a.id, b.id); assert.strictEqual(d.rows.filter(x => x.st === 'sessions').length, 2);
  });
  console.log('\n' + n + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });