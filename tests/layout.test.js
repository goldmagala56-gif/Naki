'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const www = p => path.join(__dirname, '..', 'www', p);
const ed = fs.readFileSync(www('editor.js'), 'utf8'), html = fs.readFileSync(www('index.html'), 'utf8'), css = fs.readFileSync(www('editor.css'), 'utf8');
const P = require('../www/project.js'), NP = require('../www/plan.js'), LY = require('../www/layout.js');
const EX = require('../www/export-engine.js'), WC = require('../www/webcodecs-export.js').WebCodecsExport;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };

ok('there are mirror and split-screen presets, and bad input is tidied', () => {
  assert(LY.LIST.length >= 16); assert(LY.inGroup('mirror').length >= 5 && LY.inGroup('split').length >= 9);
  assert.strictEqual(LY.clean({ preset: 'nope' }), null); assert.strictEqual(LY.clean(null), null);
  const c = LY.clean({ preset: 'grid4', gap: 5, zoom: 9, color: 'zzz' }); assert.strictEqual(c.gap, 0.1); assert.strictEqual(c.zoom, 3); assert.strictEqual(c.color, '#111111');
  assert.strictEqual(LY.clean({ preset: 'mirror_lr' }).gap, 0); assert.strictEqual(LY.clean({ preset: 'grid4' }).gap, 0.012);
});
ok('with no divider every preset fills the frame exactly, with even numbers, inside the frame', () => {
  LY.LIST.forEach(e => {
    const W = 640, H = 360, cs = LY.cells({ preset: e.key, gap: 0 }, W, H); let area = 0;
    cs.forEach(c => {
      [c.x, c.y, c.w, c.h, c.sx, c.sy, c.sw, c.sh].forEach(v => assert.strictEqual(v % 2, 0, e.key + ' even'));
      assert(c.x >= 0 && c.y >= 0 && c.x + c.w <= W && c.y + c.h <= H, e.key + ' cell inside');
      assert(c.sx >= 0 && c.sy >= 0 && c.sx + c.sw <= W && c.sy + c.sh <= H, e.key + ' source inside');
      area += c.w * c.h;
    });
    assert.strictEqual(area, W * H, e.key + ' fills the frame');
  });
});
ok('mirror presets flip the copy, and show the right half of the picture', () => {
  const lr = LY.cells({ preset: 'mirror_lr' }, 640, 360);
  assert.strictEqual(lr.length, 2); assert(!lr[0].fh && lr[1].fh); assert.strictEqual(lr[0].sx, 0); assert.strictEqual(lr[1].sx, 0); assert.strictEqual(lr[1].sw, 320);
  const q = LY.cells({ preset: 'mirror_quad' }, 640, 360); assert.deepStrictEqual(q.map(c => [c.fh, c.fv]), [[false, false], [true, false], [false, true], [true, true]]);
  assert.strictEqual(LY.cells({ preset: 'mirror_rl' }, 640, 360)[0].sx, 320);
});
ok('a divider only goes between boxes, never on the outer edge; zoom shrinks the part shown; nothing is stretched', () => {
  const cs = LY.cells({ preset: 'grid4', gap: 0.05 }, 640, 360);
  assert.strictEqual(cs[0].x, 0); assert.strictEqual(cs[0].y, 0); assert(cs[1].x > cs[0].x + cs[0].w, 'gap between columns'); assert(cs[2].y > cs[0].y + cs[0].h, 'gap between rows');
  assert.strictEqual(cs[3].x + cs[3].w, 640 - 0); assert.strictEqual(cs[3].y + cs[3].h, 360);
  const a = LY.cells({ preset: 'split2v', gap: 0, zoom: 1 }, 640, 360)[0], b = LY.cells({ preset: 'split2v', gap: 0, zoom: 2 }, 640, 360)[0];
  assert(b.sw < a.sw && b.sh < a.sh);
  [a, b].forEach(c => assert(Math.abs(c.sw / c.sh - c.w / c.h) < 0.02, 'same shape as the box'));
});
ok('the ffmpeg graph has one copy per box, flips, a divider colour and the time window', () => {
  const g = LY.graph({ preset: 'mirror_quad', color: '#ff0000' }, 1, 3, 'v0', 'v1', 640, 360);
  assert(g.startsWith('[v0]split=6')); assert((g.match(/crop=/g) || []).length === 4); assert(g.includes('hflip') && g.includes('vflip'));
  assert(g.includes('0xff0000') && g.includes("between(t,1.000,3.000)") && g.endsWith('[v1]'));
  assert.strictEqual(LY.graph({ preset: 'zzz' }, 0, 1, 'a', 'b', 640, 360), '[a]null[b]');
});
ok('addLayout puts a clip on its own row; overlapping ones get another row; an empty row goes away', () => {
  const o1 = {}, o2 = {}; let p = P.addLayout(base, 2000, 'grid4', o1);
  const f = P.findClip(p, o1.id); assert.strictEqual(f.track.kind, 'layout'); assert.strictEqual(f.clip.start, 2000); assert.strictEqual(f.clip.dur, 4000); assert.strictEqual(f.clip.layout.preset, 'grid4');
  p = P.addLayout(p, 3000, 'mirror_lr', o2); assert.strictEqual(p.tracks.filter(t => t.kind === 'layout').length, 2);
  assert.strictEqual(P.addLayout(base, 2000, 'nope', {}), base);
  assert.strictEqual(P.addLayout(base, 11900, 'grid4', {}), base, 'no room at the very end');
  p = P.deleteClip(P.deleteClip(p, o1.id), o2.id); assert.strictEqual(p.tracks.filter(t => t.kind === 'layout').length, 0);
});
ok('setLayoutProps changes only what is mentioned, and layoutsAt finds the layout under the playhead', () => {
  const o = {}; let p = P.addLayout(base, 2000, 'split2v', o);
  assert.strictEqual(P.setLayoutProps(p, o.id, { gap: 0.012 }), p, 'same value, same project');
  p = P.setLayoutProps(p, o.id, { preset: 'grid9', zoom: 1.5 }); const c = P.findClip(p, o.id).clip.layout;
  assert.strictEqual(c.preset, 'grid9'); assert.strictEqual(c.zoom, 1.5); assert.strictEqual(c.gap, 0.012);
  assert.strictEqual(P.setLayoutProps(p, o.id, { preset: 'nope' }), p);
  assert.strictEqual(P.layoutsAt(p, 1000).length, 0); assert.strictEqual(P.layoutsAt(p, 3000).length, 1); assert.strictEqual(P.layoutsAt(p, 6000).length, 0);
});
ok('layouts split, move with a cut and with a held picture like the other effects', () => {
  const o = {}; const p = P.addLayout(base, 2000, 'grid4', o);
  assert.strictEqual(P.splitAt(p, 4000).tracks.find(t => t.kind === 'layout').clips.length, 2);
  assert.strictEqual(P.findClip(P.rippleDelete(p, 500, 1500), o.id).clip.start, 1000);
  assert.strictEqual(P.findClip(P.insertFreeze(p, 1000, 1000), o.id).clip.start, 3000);
});
ok('the plan carries the layouts, and both export engines take them', () => {
  const o = {}, p = P.addLayout(base, 2000, 'mirror_lr', o), plan = NP.projectToPlan(p);
  assert.strictEqual(plan.layouts.length, 1); assert.strictEqual(plan.layouts[0].startMs, 2000); assert.strictEqual(plan.layouts[0].layout.preset, 'mirror_lr');
  assert.strictEqual(NP.projectToPlan(base).layouts, undefined);
  assert.strictEqual(WC.canRender(plan), true, 'the fast engine draws layouts');
  const jobs = EX.planToJobs({ durationMs: 6000, movie: { durationMs: 60000 }, video: [{ type: 'play', sessionStart: 0, sessionEnd: 6000, movieStart: 0 }], audio: [],
    layouts: [{ startMs: 1000, durMs: 2000, layout: { preset: 'mirror_lr' } }] }, { hasAudio: false, width: 640, height: 360, sar: 1, durationSec: 60 }, { height: 360 }).jobs;
  const a = jobs[0].args, fc = a[a.indexOf('-filter_complex') + 1];
  assert(fc.includes('hflip') && fc.includes("between(t,1.000,3.000)") && fc.includes('crop='));
});
ok('the editor has the Layout tool, the preview canvas and the panels; layout.js loads before project.js', () => {
  ['function addLayoutHere', 'function syncLayout', 'function previewFrame', 'ROWS.layout = ', 'PANELS.layoutpick = ', 'PANELS.layoutedit = ', "name: 'layout'", "'ed-layoutcv'", 'syncLayout(m, vc, css)', "id: 'edAddLayout'"].forEach(s => assert(ed.includes(s), s));
  assert(css.includes('.ed-layoutcv') && css.includes('.ed-clip.k-layout'));
  assert(html.includes('<script src="layout.js"></script>') && html.indexOf('layout.js') < html.indexOf('src="project.js"'));
});
console.log('\n' + n + ' checks passed');