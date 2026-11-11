'use strict';
// One-time patch: keyframes for TEXT (left/right and up/down), with the keyframe bar (diamond, arrows, easing) working on texts like on overlays.
// Texts already move by keyframes in the preview and in both exports (that is how Track motion works); only the bar and the sliders were switched off.
// Edits www/project.js and www/editor.js, adds tests/text-keyframes.test.js.   Run from the project folder:   node tools/apply-text-keyframes.js    then   npm test
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
function rd(rel){ const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') }; }
function wr(o){ fs.writeFileSync(o.f, o.crlf ? o.t.replace(/\n/g, '\r\n') : o.t); }
const pj = rd('www/project.js'), ed = rd('www/editor.js'), bad = [];
if (pj.t.includes("if (kind === 'text') return ['x', 'y'];")){ console.log('Already applied. Nothing to do.'); process.exit(0); }
function rep(o, a, b, label){ const n = o.t.split(a).length - 1; if (n !== 1){ bad.push(label + ': found ' + n + ' times (need exactly 1) in ' + o.rel); return; } o.t = o.t.replace(a, () => b); }
rep(pj, "if (kind === 'text') return [];", "if (kind === 'text') return ['x', 'y'];   // a text moves by an offset from its usual place: keyframes on that offset (the same ones Track motion writes)", 'project: keyframes for text');
rep(ed, "body.appendChild(ti); body.appendChild(mk('div', 'ed-hint', 'Drag the text on the timeline",
`body.appendChild(ti);
      var tkv = function (k){ return NANIM ? NANIM.valueOf(c, 'text', k, relNow(c)) : 0; }, tks = function (k, v){ return P.setAnimated(E.hist.cur, c.id, k, v, relNow(c)); };
      [['x', 'Left / right'], ['y', 'Up / down']].forEach(function (a){
        body.appendChild(sliderRow(a[1], -100, 100, 1, Math.round(tkv(a[0]) * 100), function (v){ return v + '%'; }, function (v){ live(tks(a[0], v / 100)); }, function (v){ commit(tks(a[0], v / 100)); }));
      });
      body.appendChild(mk('div', 'ed-hint', 'Move from the text's usual place. To animate: put the playhead on the text, tap the diamond, move the playhead, change a slider. The text glides between the keyframes. Tap Top, Middle or Bottom under Text style to put it back.'));
      body.appendChild(mk('div', 'ed-hint', 'Drag the text on the timeline`, 'editor: text position sliders');
if (bad.length){ console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + bad.join('\n  - ') + '\n\nSend me that list and I will adjust.'); process.exit(1); }
// the apostrophe inside the hint text above must not break the string
ed.t = ed.t.replace("'Move from the text's usual place.", "'Move from the text\\u2019s usual place.");
wr(pj); wr(ed);
const TEST = `'use strict';
// node tests/text-keyframes.test.js
// A text can be keyframed left/right and up/down; the values glide between keyframes.
const assert = require('assert'), P = require('../www/project.js'), NA = require('../www/anim.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 10000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] },
    { id: 't-text', kind: 'text', role: 'text', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'x1', type: 'text', start: 1000, dur: 4000, text: 'Hello', size: 7, color: '#ffffff', pos: 'bottom' }] }] };
ok('a text now has left/right and up/down keyframes', () => { assert.deepStrictEqual(P.keyframeProps(base, 'x1'), ['x', 'y']); });
ok('keyframes make the text glide: the middle is half way', () => {
  let p = P.toggleKeyframes(base, 'x1', 500); p = P.setAnimatedAuto(p, 'x1', 'x', 0.3, 3500);
  const c = P.findClip(p, 'x1').clip; assert(c.kf && c.kf.x && c.kf.x.length === 2, JSON.stringify(c.kf));
  const mid = NA.shiftOf(c, 2000); assert(Math.abs(mid.x - 0.15) < 0.01, 'x at the middle: ' + mid.x); assert(Math.abs(NA.shiftOf(c, 0).x) < 0.001); assert(Math.abs(NA.shiftOf(c, 4000).x - 0.3) < 0.001);
});
ok('without keyframes a slider still just moves the text', () => { const p = P.setAnimated(base, 'x1', 'y', -0.2, 0), c = P.findClip(p, 'x1').clip; assert.strictEqual(c.dy, -0.2); assert(!c.kf); });
console.log('\\n' + n + ' checks passed');
`;
fs.mkdirSync(path.join(root, 'tests'), { recursive: true }); fs.writeFileSync(path.join(root, 'tests', 'text-keyframes.test.js'), TEST);
console.log('Done. Texts can now be keyframed (project.js, editor.js) and tests/text-keyframes.test.js was added.\nNow run:  node tests/text-keyframes.test.js   and then   npm test');