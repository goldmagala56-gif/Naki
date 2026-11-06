'use strict';
/* Naki backup: one session (recording, voice, movie, music, overlays, sound effects, added videos, edits) as a single .naki file, and back again.
   File = "NAKIBKP1", then records. Each record = 4 bytes (header length), a JSON header, and the file bytes the header names (header.size, may be 0).
   Records: meta first, then one per stored row, then "end" with the count (so a cut-off file is noticed). Restoring always makes a NEW session id. */
var NakiBackup = (function () {
  var MAGIC = 'NAKIBKP1', VERSION = 1, MAX_HEADER = 64 * 1048576;
  var SINGLE = ['sessions', 'movies', 'music', 'projects'], MANY = ['chunks', 'levels', 'overlays', 'sfx', 'videos'], ALL = SINGLE.concat(MANY);
  function isBlob(v) { return typeof Blob !== 'undefined' && v instanceof Blob; }
  function u32(n) { return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }
  function rd32(b) { return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0; }
  function utf8(s) { return new TextEncoder().encode(s); }
  function bytes(file, a, b) { return file.slice(a, b).arrayBuffer().then(function (x) { return new Uint8Array(x); }); }
  function makeId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  // db needs: get(store, sid), range(store, sid)  (the page's DB object has both)
  function exportSession(db, sid, opts) {
    var parts = [utf8(MAGIC)], count = 0;
    function add(store, rec) {
      var copy = {}, blob = null, field = null;
      Object.keys(rec).forEach(function (k) {
        if (isBlob(rec[k])) { if (blob) throw new Error('A stored item has two files in it.'); blob = rec[k]; field = k; } else copy[k] = rec[k];
      });
      var head = utf8(JSON.stringify({ kind: 'rec', store: store, rec: copy, blobField: field, size: blob ? blob.size : 0, type: blob ? blob.type : '' }));
      parts.push(u32(head.length), head); if (blob) parts.push(blob); count++;
    }
    return db.get('sessions', sid).then(function (sess) {
      if (!sess) throw new Error('That session was not found.');
      var meta = utf8(JSON.stringify({ kind: 'meta', version: VERSION, app: (opts && opts.app) || '', created: Date.now(), name: sess.name, sid: sid }));
      parts.push(u32(meta.length), meta);
      add('sessions', sess);
      var chain = Promise.resolve();
      SINGLE.slice(1).forEach(function (st) { chain = chain.then(function () { return db.get(st, sid); }).then(function (r) { if (r) add(st, r); }); });
      MANY.forEach(function (st) { chain = chain.then(function () { return db.range(st, sid); }).then(function (list) { (list || []).forEach(function (r) { add(st, r); }); }); });
      return chain;
    }).then(function () {
      var end = utf8(JSON.stringify({ kind: 'end', count: count })); parts.push(u32(end.length), end);
      return new Blob(parts, { type: 'application/octet-stream' });
    });
  }

  // db needs: put(store, rec), delSession(sid). Resolves { id, name, count }.
  async function importSession(db, file, opts) {
    var newId = (opts && opts.newId) || makeId(), pos = 0, n = 0, ended = false, hasSession = false, name = '', wrote = false;
    try {
      var m = await bytes(file, 0, MAGIC.length), tag = '';
      for (var i = 0; i < m.length; i++) tag += String.fromCharCode(m[i]);
      if (tag !== MAGIC) throw new Error('This is not a Naki backup file.');
      pos = MAGIC.length;
      while (pos < file.size) {
        var lb = await bytes(file, pos, pos + 4);
        if (lb.length < 4) throw new Error('This backup file is incomplete.');
        var hl = rd32(lb); pos += 4;
        if (hl > MAX_HEADER || pos + hl > file.size) throw new Error('This backup file is damaged or incomplete.');
        var head = JSON.parse(new TextDecoder().decode(await bytes(file, pos, pos + hl))); pos += hl;
        if (head.kind === 'meta') {
          if (head.version > VERSION) throw new Error('This backup was made by a newer version of Naki. Update the app first.');
          name = head.name || ''; continue;
        }
        if (head.kind === 'end') { if (head.count !== n) throw new Error('This backup file is incomplete.'); ended = true; break; }
        if (head.kind !== 'rec' || ALL.indexOf(head.store) < 0 || !head.rec) throw new Error('This backup file has something Naki does not understand.');
        var size = head.size | 0;
        if (size < 0 || pos + size > file.size) throw new Error('This backup file is incomplete.');
        var rec = head.rec;
        if (head.blobField) rec[head.blobField] = file.slice(pos, pos + size, head.type || '');
        pos += size;
        if (head.store === 'sessions') { rec.id = newId; hasSession = true; name = rec.name || name; } else rec.sid = newId;
        wrote = true;
        await db.put(head.store, rec); n++;
      }
      if (!ended) throw new Error('This backup file is incomplete.');
      if (!hasSession) throw new Error('This backup has no session in it.');
      return { id: newId, name: name, count: n };
    } catch (e) {
      if (wrote) { try { await db.delSession(newId); } catch (e2) {} }
      throw e;
    }
  }

  var api = { exportSession: exportSession, importSession: importSession, MAGIC: MAGIC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiBackup = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['backup.js'] = 'backup1'; }
  return api;
})();