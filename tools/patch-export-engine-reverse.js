'use strict';
// Adds Reverse to www/export-engine.js.  Run once from the project folder:   node tools/patch-export-engine-reverse.js
// It checks every place it changes, writes export-engine.js.bak first, and stops without touching anything if a place is not found.
const fs = require('fs'), file = process.argv[2] || 'www/export-engine.js', orig = fs.readFileSync(file, 'utf8');
if (orig.includes('NakiReverse')) { console.log('export-engine.js already has Reverse. Nothing to do.'); process.exit(0); }
let s = orig;
function rep(old, neu) {
  if (s.split(old).length !== 2) { console.error('STOPPED: could not find this exactly once in ' + file + ':\n  ' + old.slice(0, 90) + '\nNothing was changed.'); process.exit(1); }
  s = s.replace(old, () => neu);
}
rep("var FPS = 30;\nvar SR = 48000;",
  "var _RV = (typeof module !== 'undefined' && module.exports) ? require('./reverse.js') : window.NakiReverse;\nvar FPS = 30;\nvar SR = 48000;");
// picture: a reversed part is reversed in pieces first, then read like any other source
rep("      jobs.push({ label: 'picture ' + (i + 1), produces: vfile,\n        args: pictureArgs(['-ss', clampSec(sp.movieStart).toFixed(3), '-i', 'movie.in'], transformFit(sp), nFrames, vfile, sp, spanSec, speed, Math.ceil(spanSec + 1)) });",
  "      if (sp.reverse) {\n        var rv = _RV.reversePicture(sp, { id: id, nFrames: nFrames, width: width, height: height, speed: speed, fitChain: transformFit(sp), enc: enc, ts: ts, clampSec: clampSec, chunkFrames: opts.reverseChunkFrames });\n        rv.jobs.forEach(function (j) { jobs.push(j); });\n        jobs.push({ label: 'picture ' + (i + 1), produces: vfile, files: rv.files,\n          args: pictureArgs(rv.sourceArgs, 'null', nFrames, vfile, sp, spanSec, 1, 1) });\n      } else jobs.push({ label: 'picture ' + (i + 1), produces: vfile,\n        args: pictureArgs(['-ss', clampSec(sp.movieStart).toFixed(3), '-i', 'movie.in'], transformFit(sp), nFrames, vfile, sp, spanSec, speed, Math.ceil(spanSec + 1)) });");
// sound: the stretch is cut out first, then reversed
rep("    var spd = c.speed && c.speed !== 1 ? c.speed : 1;\n", "    var spd = c.speed && c.speed !== 1 ? c.speed : 1;\n    var rev = !!c.reverse && src === 'movie';\n");
rep("'[0:a]' + sourceChain(src, movieInfo) + tempoChain(spd) +", "'[0:a]' + sourceChain(src, movieInfo) + (rev ? ',areverse' : '') + tempoChain(spd) +");
rep("      args: ['-ss', clampSec(c.inMs + lostMs * spd).toFixed(3), '-i', SRC_FILE[src],",
  "      args: (rev ? ['-ss', clampSec(c.inMs).toFixed(3), '-t', (c.durMs * spd / 1000).toFixed(3), '-i', SRC_FILE[src]]\n        : ['-ss', clampSec(c.inMs + lostMs * spd).toFixed(3), '-i', SRC_FILE[src]]).concat([");
rep("'-f', 'wav', afile] });", "'-f', 'wav', afile]) });");
fs.writeFileSync(file + '.bak', orig); fs.writeFileSync(file, s);
console.log('Reverse added to ' + file + ' (the old file is kept as ' + file + '.bak).');