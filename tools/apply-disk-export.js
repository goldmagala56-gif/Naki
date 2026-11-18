// Run from the project root:  node tools/apply-disk-export.js
// The fast export engine now writes the finished video to the browser's private disk area (OPFS)
// instead of holding all of it in memory. Where that is not available it works as before.
const fs = require('fs'), path = require('path');
const file = path.join('www', 'webcodecs-export.js');
if (!fs.existsSync(file)) { console.error('Run this from the Naki project root.'); process.exit(1); }
let raw = fs.readFileSync(file, 'utf8'); const crlf = raw.includes('\r\n'); let s = raw.replace(/\r\n/g, '\n');
if (s.includes('Naki:disk-export')) { console.log('Already applied.'); process.exit(0); }
function rep(a, b) { const n = s.split(a).length - 1; if (n !== 1) { console.error('Anchor not found exactly once (' + n + '):\n' + a.slice(0, 100)); process.exit(1); } s = s.replace(a, () => b); }

rep("    var output = new M.Output({ format: new M.Mp4OutputFormat(), target: new M.BufferTarget() });",
`    var disk = await openDiskTarget(M);   // Naki:disk-export
    var output = new M.Output({ format: new M.Mp4OutputFormat(), target: disk ? disk.target : new M.BufferTarget() });`);

rep("    return new Blob([output.target.buffer], { type: 'video/mp4' });",
`    if (disk) { var df = await disk.fh.getFile(); return df.slice(0, df.size, 'video/mp4'); }   // a file on disk, not in memory
    return new Blob([output.target.buffer], { type: 'video/mp4' });`);

rep("  function canRender(plan) {",
`  // Where the finished video is written. OPFS is the app's own private disk area: it takes big files without filling memory.
  async function openDiskTarget(M) {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory || !M.StreamTarget || typeof WritableStream === 'undefined') return null;
      var dir = await navigator.storage.getDirectory();
      try { for await (var ent of dir.entries()) { if (/^naki-export-/.test(ent[0])) { try { await dir.removeEntry(ent[0]); } catch (e) {} } } } catch (e) {}   // leftovers of earlier exports
      var fh = await dir.getFileHandle('naki-export-' + Date.now() + '.mp4', { create: true });
      if (!fh.createWritable) return null;
      var w = await fh.createWritable();
      var ws = new WritableStream({
        write: function (c) { return w.write({ type: 'write', position: c.position, data: c.data }); },
        close: function () { return w.close(); },
        abort: function () { try { return w.abort(); } catch (e) {} }
      });
      return { target: new M.StreamTarget(ws, { chunked: true }), fh: fh };
    } catch (e) { return null; }
  }

  function canRender(plan) {`);

fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('Done. Now run: npm test');