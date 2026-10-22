'use strict';
// One-time patch (patch 2b): the text templates, the extra Adjust sliders (highlights, shadows, tint, hue, grain) and the video effects
// (shake, glitch, blur, flash, RGB split, film grain). This is tools/apply-look-text.js with its text animation left out, because patch 2a
// (apply-motion.js) already does that. It reads its building blocks from tools/apply-look-text.js, so KEEP that file next to this one until this has run.
// Run from the project folder:   node tools/apply-look2.js
// It checks that every spot it needs to change is found exactly once BEFORE writing anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const T2 = `'use strict';
// node tests/look2.test.js
// Text templates, the extra Adjust sliders (highlights, shadows, tint, hue, grain) and the video effects (shake, glitch, blur, flash, RGB split, film grain).
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const L = require('../www/look2.js'), T = require('../www/templates.js'), M = require('../www/motion.js'), P = require('../www/project.js'), NP = require('../www/plan.js'), E = require('../www/export-engine.js');
const { WebCodecsExport } = require('../www/webcodecs-export.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 10000, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'lA' }] }] };

ok('templates: ten looks, each made only of settings a text really has, so applying one gives exactly that look', () => {
  assert.strictEqual(T.LIST.length, 10);
  T.LIST.forEach(tp => {
    const out = {}; let p = P.addTextClip(base, 1000, 3000, out); p = P.setTextProps(p, out.id, Object.assign({ text: tp.text }, tp.style)); p = P.setTextAnim(p, out.id, tp.anim);
    const c = P.findClip(p, out.id).clip;
    assert.strictEqual(c.text, tp.text); assert.strictEqual(c.size, tp.style.size, tp.key + ' size'); assert.strictEqual(c.color, tp.style.color); assert.strictEqual(c.pos, tp.style.pos); assert.strictEqual(!!c.bg, tp.style.bg);
    assert.strictEqual(c.font || 'sans', tp.style.font, tp.key + ' font'); assert.strictEqual(c.outline || 0, tp.style.outline, tp.key + ' outline'); assert.strictEqual(c.shadow == null ? 1 : c.shadow, tp.style.shadow, tp.key + ' shadow');
    assert(c.anim, tp.key + ' animates'); assert.strictEqual(c.anim.in, tp.anim.in, tp.key + ' in'); assert.strictEqual(c.anim.out, tp.anim.out, tp.key + ' out'); assert.strictEqual(c.anim.loop || 'none', tp.anim.loop, tp.key + ' loop');
    assert(M.has(M.TEXT_IN, tp.anim.in) && M.has(M.TEXT_OUT, tp.anim.out) && M.has(M.TEXT_LOOP, tp.anim.loop), tp.key + ' uses names the animation library knows');
  });
  assert.strictEqual(T.find('neon').anim.loop, 'pulse'); assert.strictEqual(T.find('nope'), null);
});
ok('adjust: highlights, shadows, tint, hue and grain are kept within range, and a zero is not stored', () => {
  const a = P.setFilter(base, 'vA', { hue: 0.5, shadows: 0.4, grain: 3, tint: -9 }), f = P.findClip(a, 'vA').clip.filter;
  assert.deepStrictEqual([f.hue, f.shadows, f.grain, f.tint], [0.5, 0.4, 1, -1]); assert.strictEqual(f.highlights, undefined);
  assert.strictEqual(P.findClip(P.setFilter(a, 'vA', { hue: 0, shadows: 0, grain: 0, tint: 0 }), 'vA').clip.filter, undefined, 'all back to normal removes the filter');
  const h = P.setFilter(base, 'vA', { highlights: -0.3 }); assert.strictEqual(P.findClip(h, 'vA').clip.filter.highlights, -0.3, 'one alone is not lost');
  assert.strictEqual(P.findClip(P.setFilter(a, 'vA', { warmth: 0.2 }), 'vA').clip.filter.hue, 0.5, 'and does not disturb the older ones');
  const plan = NP.projectToPlan(a).video[0].filter; assert.deepStrictEqual([plan.hue, plan.shadows, plan.grain, plan.tint], [0.5, 0.4, 1, -1], 'the plan carries them');
  assert.strictEqual(L.hasExtras(plan), true); assert.strictEqual(L.hasExtras({ brightness: 1, warmth: 0.3 }), false); assert.strictEqual(L.hasExtras(null), false);
  assert.strictEqual(WebCodecsExport.canRender({ durationMs: 1000, video: [{ type: 'play', filter: plan }], audio: [] }), false, 'the fast engine leaves them to ffmpeg');
});
ok('effects: an effect at the playhead with a strength; overlapping ones get their own row; an empty row goes away; the plan lists them', () => {
  const o1 = {}, o2 = {}; let p = P.addFx(base, 1000, 'shake', o1); assert.deepStrictEqual(P.validate(p), []);
  const c = P.findClip(p, o1.id).clip, tr = P.findClip(p, o1.id).track; assert.deepStrictEqual([c.fx, c.start, c.dur, c.strength, tr.kind, tr.role], ['shake', 1000, 2000, 0.5, 'fx', 'fx']);
  assert.strictEqual(P.addFx(base, 1000, 'flash', {}).tracks.find(t => t.kind === 'fx').clips[0].dur, 500, 'a flash is short'); assert.strictEqual(P.addFx(base, 0, 'nope', {}), base);
  p = P.addFx(p, 2000, 'blur', o2); assert.strictEqual(p.tracks.filter(t => t.kind === 'fx').length, 2, 'overlapping in time: a second row');
  assert.deepStrictEqual(P.fxAt(p, 2500).map(x => x.fx).sort(), ['blur', 'shake']); assert.strictEqual(P.fxAt(p, 100).length, 0);
  const s = P.setFxProps(p, o1.id, { strength: 9, fx: 'glitch' }), sc = P.findClip(s, o1.id).clip; assert.deepStrictEqual([sc.fx, sc.strength], ['glitch', 1]); assert.strictEqual(P.setFxProps(p, o1.id, {}), p); assert.strictEqual(P.setFxProps(p, 'vA', { strength: 1 }), p);
  assert.strictEqual(P.setTextAnim(p, o1.id, { in: 'fade' }), p, 'an effect is not a title');
  const del = P.deleteClip(P.deleteClip(p, o2.id), o1.id); assert.strictEqual(del.tracks.filter(t => t.kind === 'fx').length, 0, 'the empty row is gone');
  const ids = P.addFx(del, 0, 'blur', {}).tracks.map(t => t.id); assert.strictEqual(new Set(ids).size, ids.length);
  const plan = NP.projectToPlan(p); assert.deepStrictEqual(plan.fx.map(x => [x.startMs, x.durMs, x.fx, x.strength]), [[1000, 2000, 'shake', 0.5], [2000, 2000, 'blur', 0.5]]); assert.strictEqual(NP.projectToPlan(base).fx, undefined);
  assert.strictEqual(WebCodecsExport.canRender(plan), false, 'effects are made by the ffmpeg engine');
  const fz = P.insertFreeze(p, 1500, 1000); assert.strictEqual(P.findClip(fz, o1.id).clip.dur, 3000, 'a held picture keeps the effect on');
  assert.strictEqual(P.splitAt(p, 1500).tracks.find(t => t.kind === 'fx').clips.length >= 2, true, 'an effect splits like any clip');
});

const info0 = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 6 };
const plan0 = (extra, spanA) => Object.assign({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 6000 }, audio: [],
  video: [Object.assign({ type: 'play', sessionStart: 0, sessionEnd: 4000, movieStart: 0 }, spanA || {})] }, extra || {});
const argsFor = (r, f) => r.jobs.find(j => j.produces === f).args, graph = (a) => a[a.indexOf('-filter_complex') + 1];
ok('ffmpeg engine: effects and the extra Adjust sliders become filters, only where they apply', () => {
  const fx = [{ startMs: 1000, durMs: 1000, fx: 'blur', strength: 0.5 }, { startMs: 1500, durMs: 1000, fx: 'shake', strength: 1 }, { startMs: 3000, durMs: 500, fx: 'flash', strength: 1 }];
  const r = E.planToJobs(plan0({ fx }), info0, { height: 360 }), g = graph(argsFor(r, 'v0000.ts'));
  assert(g.includes("gblur=sigma=11:enable='between(t,1.000,2.000)'") && g.includes('split[') && g.includes("overlay=enable='between(t,1.500,2.500)'") && g.includes("eq=brightness='1*max(0,1-(t-3.000)/0.350)':eval=frame"), g);
  const none = E.planToJobs(plan0(), info0, { height: 360 }); assert(argsFor(none, 'v0000.ts').indexOf('-filter_complex') < 0, 'no effect: the plain command');
  const adj = E.planToJobs(plan0(null, { filter: { brightness: 1, contrast: 1, saturate: 1, hue: 0.5, shadows: 0.5, grain: 0.4, tint: 0.3 } }), info0, { height: 360 }), ga = graph(argsFor(adj, 'v0000.ts'));
  assert(ga.includes('hue=h=90,colorbalance=gm=-0.09:gh=-0.045,curves=all=\\'0/0 0.25/0.34 0.75/0.75 1/1\\',noise=alls=14:allf=t'), ga);
});
ok('ffmpeg engine: an effect and an animated title can share one picture', () => {
  const r = E.planToJobs(plan0({ fx: [{ startMs: 1000, durMs: 1000, fx: 'blur', strength: 0.5 }], texts: [{ startMs: 500, durMs: 2000, text: 'Hi', size: 7, pos: 'bottom', anim: { in: 'fade', out: 'fade' } }] }), info0, { height: 360 });
  const a = argsFor(r, 'v0000.ts'); assert(graph(a).includes('gblur=') && a.some(x => /^txt000_\\d\\d\\.png$/.test(x)), a.join(' '));
});

function ffmpegOk() { const r = cp.spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }); const m = r.status === 0 && /version\\s+n?(\\d+)/.exec(r.stdout); return !!m && +m[1] >= 5; }
if (ffmpegOk()) {
  const render = (plan, opts, grey) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-look2-')), sh = (a) => cp.spawnSync('ffmpeg', ['-y', '-v', 'error'].concat(a), { cwd: dir, encoding: 'utf8' });
    let r = grey ? sh(['-f', 'lavfi', '-i', 'color=c=' + grey + ':s=640x360:r=30:d=6', '-pix_fmt', 'yuv420p', '-t', '6', 'm.mp4']) : sh(['-f', 'lavfi', '-i', 'color=c=red:s=320x360:r=30:d=6', '-f', 'lavfi', '-i', 'color=c=blue:s=320x360:r=30:d=6', '-filter_complex', '[0:v][1:v]hstack,format=yuv420p', '-t', '6', 'm.mp4']); assert.strictEqual(r.status, 0, r.stderr);
    fs.renameSync(path.join(dir, 'm.mp4'), path.join(dir, 'movie.in'));
    const built = E.planToJobs(plan, info0, Object.assign({ height: 360 }, opts || {}));
    built.jobs.forEach(j => { const x = sh(j.args); assert.strictEqual(x.status, 0, j.label + ': ' + x.stderr); });
    fs.writeFileSync(path.join(dir, 'video.txt'), built.videoList.map(f => "file '" + f + "'\\n").join(''));
    r = sh(E.finalMixArgs([], plan.durationMs)); assert.strictEqual(r.status, 0, r.stderr);
    const frame = (t) => { const o = cp.spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', path.join(dir, 'out.mp4'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: null }); return { w: built.width, h: built.height, d: o.stdout }; };
    const px = (t, fx, fy) => { const f = frame(t), i = (Math.round(fy * f.h) * f.w + Math.round(fx * f.w)) * 3; return [f.d[i], f.d[i + 1], f.d[i + 2]]; };
    const same = (t1, t2) => { const a = frame(t1).d, b = frame(t2).d; let d = 0; for (let i = 0; i < a.length; i += 7) d += Math.abs(a[i] - b[i]); return d; };
    const frames = +cp.spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path.join(dir, 'out.mp4')], { encoding: 'utf8' }).stdout.trim().split('\\n')[0];
    return { px, same, frames, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
  };
  ok('real ffmpeg: hue turns red toward green; shadows lift and sink a dark grey', () => {
    const f = (o) => Object.assign({ brightness: 1, contrast: 1, saturate: 1 }, o);
    const a = render(plan0()), b = render(plan0(null, { filter: f({ hue: 0.667 }) }));
    try { const r0 = a.px(1, 0.25, 0.5), r1 = b.px(1, 0.25, 0.5); assert(r0[0] > 180 && r0[1] < 80, 'red: ' + r0); assert(r1[1] > r1[0] + 40, 'red became ' + r1); } finally { a.done(); b.done(); }
    const m = render(plan0(null, { filter: f({}) }), null, '#404040'), l = render(plan0(null, { filter: f({ shadows: 1 }) }), null, '#404040'), d = render(plan0(null, { filter: f({ shadows: -1 }) }), null, '#404040');
    try { const x = m.px(1, 0.5, 0.5)[0], y = l.px(1, 0.5, 0.5)[0], z = d.px(1, 0.5, 0.5)[0]; assert(y > x + 20 && z < x - 8, z + ' < ' + x + ' < ' + y); } finally { m.done(); l.done(); d.done(); }
  });
  ok('real ffmpeg: every effect renders, only inside its time, and the video keeps its length', () => {
    ['blur', 'flash', 'rgbsplit', 'shake', 'grain', 'glitch'].forEach(fx => {
      const r = render(plan0({ fx: [{ startMs: 1000, durMs: 1000, fx, strength: 1 }] }));
      try { assert.strictEqual(r.frames, 120, fx); assert(r.same(0.2, 0.7) === 0 && r.same(2.5, 3.0) === 0, fx + ' leaves the rest of the video alone'); } finally { r.done(); }
    });
    const r = render(plan0({ fx: [{ startMs: 1000, durMs: 1000, fx: 'shake', strength: 1 }, { startMs: 1500, durMs: 1000, fx: 'blur', strength: 1 }] }), { ratio: '9:16', bg: { type: 'blur' } });
    try { assert.strictEqual(r.frames, 120, 'two effects at once, in another shape'); } finally { r.done(); }
  });
} else console.log('  --  real-file checks skipped (need ffmpeg 5 or newer on this computer)');
console.log('\\n' + n + ' checks passed');
`;

function load(rel){ const f = path.join(root, rel); const raw = fs.readFileSync(f, 'utf8'); return { f, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o){ fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const problems = [];
const nm = (o) => path.basename(o.f);
function rep(o, find, replace, label, times){
  const n = o.text.split(find).length - 1;
  if (n !== (times || 1)){ problems.push(label + ': found ' + n + ' times (need exactly ' + (times || 1) + ') in ' + nm(o)); return; }
  o.text = o.text.split(find).join(replace);
}
function repRe(o, re, replace, label){
  const m = o.text.match(new RegExp(re.source, 'g'));
  if (!m || m.length !== 1){ problems.push(label + ': found ' + (m ? m.length : 0) + ' times (need exactly 1) in ' + nm(o)); return; }
  o.text = o.text.replace(re, function (mm, g1){ return replace.replace('$1', g1 === undefined ? '' : g1); });
}
function seg(o, from, to, replace, label){
  const a = o.text.indexOf(from), b = a < 0 ? -1 : o.text.indexOf(to, a + 1);
  if (a < 0 || b < 0 || o.text.split(from).length !== 2){ problems.push(label + ': could not find the start/end markers in ' + nm(o)); return; }
  o.text = o.text.slice(0, a) + replace + o.text.slice(b);
}

if (fs.existsSync(path.join(root, 'www', 'look2.js'))){ console.log('Already applied (www/look2.js exists). Nothing to do.'); process.exit(0); }
if (!fs.existsSync(path.join(root, 'www', 'motion.js'))){ console.log('Run tools/apply-motion.js first (patch 2a). Nothing was changed.'); process.exit(1); }

// ---- the building blocks, from the older patch file ----
const oldPath = path.join(__dirname, 'apply-look-text.js');
if (!fs.existsSync(oldPath)){ console.log('tools/apply-look-text.js is not there. Put it back next to this script and run again. Nothing was changed.'); process.exit(1); }
let OLD;
try {
  const raw = fs.readFileSync(oldPath, 'utf8'), i = raw.indexOf('const B = '), j = raw.indexOf('\n', i);
  OLD = JSON.parse(raw.slice(i + 10, j).trim().replace(/;$/, ''));
} catch (e) { console.log('Could not read the building blocks from tools/apply-look-text.js (' + e.message + '). Nothing was changed.'); process.exit(1); }
const cut = (s, a, b) => { const x = s.indexOf(a), y = b ? s.indexOf(b) : s.length; return (x < 0 || y < 0) ? null : { from: x, to: y }; };
const B = { look2Js: OLD.look2Js, templatesJs: OLD.templatesJs, css: OLD.css, editorFns: OLD.editorFns };
const pl0 = cut(OLD.projectLook, '// ---------- video effects over a stretch of time');
const ep0 = cut(OLD.editorPanels, '    textanim: {', '    fxpick: {');
['look2Js', 'templatesJs', 'css', 'editorFns'].forEach(k => { if (!B[k]) problems.push('building block ' + k + ' is missing from apply-look-text.js'); });
if (!pl0) problems.push('building block projectLook has a different shape than expected'); else B.projectLook = OLD.projectLook.slice(pl0.from);
if (!ep0 || ep0.from >= ep0.to) problems.push('building block editorPanels has a different shape than expected'); else B.editorPanels = OLD.editorPanels.slice(0, ep0.from) + OLD.editorPanels.slice(ep0.to);
B.engineHelpers = '// ---- video effects ----\n  var fxList = plan.fx || [];\n  \n';

const pj = load('www/project.js'), pl = load('www/plan.js'), ee = load('www/export-engine.js'), wc = load('www/webcodecs-export.js'),
  ed = load('www/editor.js'), css = load('www/editor.css'), ix = load('www/index.html'), sw = load('www/sw.js'), pk = load('package.json');

// ---- project.js ----
rep(pj, '// ---------- undo / redo ----------', B.projectLook + '// ---------- undo / redo ----------', 'project: undo marker');
seg(pj, "['warmth', 'sharpen', 'vignette', 'matte'].forEach(function (k){", 'if (neutral) delete c.filter; else c.filter = f;',
  "var EXTRA_RANGE = { warmth: [-1, 1], sharpen: [0, 1], vignette: [0, 1], matte: [0, 1], highlights: [-1, 1], shadows: [-1, 1], tint: [-1, 1], hue: [-1, 1], grain: [0, 1] };\n" +
  "    Object.keys(EXTRA_RANGE).forEach(function (k){\n      var v = +f[k]; if (isNaN(v)) v = 0;\n      v = r3(Math.max(EXTRA_RANGE[k][0], Math.min(EXTRA_RANGE[k][1], v)));\n      if (Math.abs(v) < 0.001) delete f[k]; else { f[k] = v; neutral = false; }\n    });\n    ", 'project: more look sliders');
rep(pj, "t.role !== 'sfx') || t.clips.length; }", "t.role !== 'sfx' && t.kind !== 'fx') || t.clips.length; }", 'project: empty effect rows go away');
rep(pj, "if (tr.kind === 'text' || tr.kind === 'sticker'){", "if (tr.kind === 'text' || tr.kind === 'sticker' || tr.kind === 'fx'){", 'project: effects stay on through a freeze');
rep(pj, "if (!f || f.clip.type !== 'text' || f.clip.sticker) return p;", "if (!f || f.clip.type !== 'text' || f.clip.sticker || f.clip.fx) return p;", 'project: an effect is not a title');
rep(pj, 'setMotionPreset: setMotionPreset };', 'setMotionPreset: setMotionPreset,\n  addFx: addFx, setFxProps: setFxProps, fxAt: fxAt };', 'project: api list');
repRe(pj, /NakiVersions\['project\.js'\] = '[^']*'/, "NakiVersions['project.js'] = 'look2'", 'project: version');

// ---- plan.js ----
rep(pl, "['warmth', 'sharpen', 'vignette', 'matte'].forEach(function (k) { if (c.filter[k]) sp.filter[k] = c.filter[k]; });", "['warmth', 'sharpen', 'vignette', 'matte', 'highlights', 'shadows', 'tint', 'hue', 'grain'].forEach(function (k) { if (c.filter[k]) sp.filter[k] = c.filter[k]; });", 'plan: look sliders');
rep(pl, 'overlays.sort(function (a, b) { return a.startMs - b.startMs; });',
  "overlays.sort(function (a, b) { return a.startMs - b.startMs; });\n    var fx = [];\n    p.tracks.forEach(function (tr) {\n      if (tr.kind !== 'fx' || tr.hidden) return;\n      tr.clips.forEach(function (c) {\n        var s = Math.max(0, Math.round(c.start)), e = Math.min(total, Math.round(c.start + c.dur));\n        if (c.fx && e > s) fx.push({ startMs: s, durMs: e - s, fx: c.fx, strength: c.strength == null ? 0.5 : c.strength });\n      });\n    });\n    fx.sort(function (a, b) { return a.startMs - b.startMs; });", 'plan: effects list');
rep(pl, 'if (overlays.length) plan.overlays = overlays;', 'if (overlays.length) plan.overlays = overlays;\n    if (fx.length) plan.fx = fx;', 'plan: effects');
repRe(pl, /NakiVersions\['plan\.js'\] = '[^']*'/, "NakiVersions['plan.js'] = 'look2'", 'plan: version');

// ---- export-engine.js (ffmpeg) ----
rep(ee, 'var FPS = 30;', "var _L2 = (typeof module !== 'undefined' && module.exports) ? require('./look2.js') : (typeof window !== 'undefined' ? window.NakiLook2 : null);\nvar FPS = 30;", 'ffmpeg: look library');
rep(ee, '(_LK.ffmpegExtras(f) || []).forEach(function (x) { parts.push(x); });', '(_LK.ffmpegExtras(f) || []).forEach(function (x) { parts.push(x); });\n    if (_L2 && f) _L2.ffmpegAdjust(f).forEach(function (x) { parts.push(x); });', 'ffmpeg: extra sliders');
rep(ee, '/* --- picture --- */', B.engineHelpers + '/* --- picture --- */', 'ffmpeg: effect list');
rep(ee, 'overlayList.filter(function (o) { return o.startMs < sp.sessionEnd && o.startMs + o.durMs > sp.sessionStart; }) : [];',
  'overlayList.filter(function (o) { return o.startMs < sp.sessionEnd && o.startMs + o.durMs > sp.sessionStart; }) : [];\n    var fxs = _L2 ? fxList.filter(function (x) { return x.startMs < sp.sessionEnd && x.startMs + x.durMs > sp.sessionStart; }) : [];', 'ffmpeg: effects in this part');
rep(ee, 'if (!isGraph && !ovs.length && !wm && !over.length && !look && !(speed && speed !== 1)) {', 'if (!isGraph && !ovs.length && !fxs.length && !wm && !over.length && !look && !(speed && speed !== 1)) {', 'ffmpeg: plain path');
rep(ee, "var cur = 'v0';",
  "var cur = 'v0';\n    fxs.forEach(function (x) {\n      var a0 = Math.max(0, (x.startMs - sp.sessionStart) / 1000), b0 = (Math.min(sp.sessionEnd, x.startMs + x.durMs) - sp.sessionStart) / 1000, out = 'v' + (++n);\n      fc.push(_L2.ffmpegFx(x, a0, b0, cur, out, width, height)); cur = out;\n    });", 'ffmpeg: effects in the chain');

// ---- webcodecs-export.js (fast engine) ----
rep(wc, 'return s.transitionIn; })) return false;',
  "return s.transitionIn; })) return false;\n    if ((plan.fx || []).length) return false;   // video effects are made by the ffmpeg engine\n    if ((plan.video || []).some(function (s) { return s.filter && (s.filter.highlights || s.filter.shadows || s.filter.tint || s.filter.hue || s.filter.grain); })) return false;   // so are the extra Adjust sliders\n    ", 'fast: effects and sliders go to ffmpeg');

// ---- index.html, sw.js, package.json ----
rep(ix, '<script src="captions.js"></script>', '<script src="captions.js"></script>\n<script src="look2.js"></script>\n<script src="templates.js"></script>', 'page: scripts');
repRe(ix, /var want = \{[^}]*\};/, "var want = { 'editor.js': 'look2', 'project.js': 'look2', 'plan.js': 'look2', 'anim.js': 'overlay-kf', 'fx.js': 'masks-fx', 'sfx.js': 'sound', 'captions.js': 'sound', 'look2.js': 'look2', 'templates.js': 'look2', 'motion.js': 'motion', 'format.js': 'format-bg', 'stickers.js': 'effects', 'presets.js': 'effects', 'look.js': 'titles-more-adjust', 'reverse.js': 'reverse' };", 'page: version list');
rep(sw, "'./captions.js', ", "'./captions.js', './look2.js', './templates.js', ", 'service worker: file list');
let pkgNote = '';
if (!pk.text.includes('tests/look2.test.js')) {
  if (/("test":\s*"[^"]*)"/.test(pk.text)) pk.text = pk.text.replace(/("test":\s*"[^"]*)"/, (m, g1) => g1 + ' && node tests/look2.test.js"');
  else pkgNote = '\nNote: add  node tests/look2.test.js  to the "test" line in package.json yourself.';
}

// ---- editor.js ----
const NCAPLINE = "var NCAP = (typeof module !== 'undefined' && module.exports) ? require('./captions.js') : (typeof window !== 'undefined' ? window.NakiCaptions : null);";
rep(ed, NCAPLINE, NCAPLINE + "\n  var NL2 = (typeof module !== 'undefined' && module.exports) ? require('./look2.js') : (typeof window !== 'undefined' ? window.NakiLook2 : null);\n  var NTPL = (typeof module !== 'undefined' && module.exports) ? require('./templates.js') : (typeof window !== 'undefined' ? window.NakiTemplates : null);", 'editor: libraries');
rep(ed, "sfx: 'Effects' };", "sfx: 'Effects', fx: 'Video effects' };", 'editor: row name');
rep(ed, "(tr.kind === 'text' || tr.kind === 'sticker') ? 30 : 44", "(tr.kind === 'text' || tr.kind === 'sticker' || tr.kind === 'fx') ? 30 : 44", 'editor: row height');
rep(ed, "return tr.kind === 'sticker' ? (c.glyph || '')", "return tr.kind === 'fx' ? 'FX \u00b7 ' + (NL2 ? NL2.fxLabel(c.fx) : c.fx) : tr.kind === 'sticker' ? (c.glyph || '')", 'editor: effect clip name');
rep(ed, "reset: svg('<path d=\"M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8\"/><path d=\"M3 3v5h5\"/>'),",
  "reset: svg('<path d=\"M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8\"/><path d=\"M3 3v5h5\"/>'),\n    fx: svg('<path d=\"M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z\"/>'),", 'editor: icons');
rep(ed, "go: function (){ openTool('overlay'); } }",
  "go: function (){ openTool('overlay'); } },\n    { name: 'fx', label: 'Effects', icon: svg('<path d=\"M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z\"/>'), go: function (){ openTool('fx'); } }", 'editor: toolbar button');
rep(ed, 'overlay: function (){',
  "fx: function (){\n      var f = E.sel && P.findClip(E.proj, E.sel), isF = !!(f && f.track.kind === 'fx');\n      return [\n" +
  "        { id: 'edAddFx', label: 'Add', icon: G.fx, run: function (){ openPanel('fxpick'); } },\n" +
  "        { id: 'edFxEdit', label: 'Edit', icon: G.pencil, run: function (){ openPanel('fxedit'); }, disabled: !isF },\n" +
  "        { id: 'edFxDup', label: 'Duplicate', icon: G.dup, run: duplicateSel, disabled: !isF },\n" +
  "        { id: 'edFxDel', label: 'Delete', icon: G.trash, run: deleteSel, disabled: !isF }\n      ];\n    },\n    overlay: function (){", 'editor: effects row');
rep(ed, "{ id: 'edAddText', label: 'Add text', icon: G.addText, run: addText },",
  "{ id: 'edAddText', label: 'Add text', icon: G.addText, run: addText },\n        { id: 'edTextTpl', label: 'Templates', icon: G.style, run: function (){ openPanel('templates'); } },", 'editor: text row');
rep(ed, "f.track.kind === 'overlay' ? 'overlay' : 'audio';", "f.track.kind === 'overlay' ? 'overlay' : f.track.kind === 'fx' ? 'fx' : 'audio';", 'editor: dock for effects');
rep(ed, "u.overlaylayer = mk('div', 'ed-overlaylayer'); u.stage.appendChild(u.overlaylayer);",
  "var NSV = 'http://www.w3.org/2000/svg', tsv = document.createElementNS(NSV, 'svg'), tfl = document.createElementNS(NSV, 'filter'), tct = document.createElementNS(NSV, 'feComponentTransfer');\n" +
  "    tsv.setAttribute('width', '0'); tsv.setAttribute('height', '0'); tsv.style.position = 'absolute'; tfl.setAttribute('id', 'nakiTone');\n" +
  "    ['R', 'G', 'B'].forEach(function (ch){ var fn = document.createElementNS(NSV, 'feFunc' + ch); fn.setAttribute('type', 'table'); fn.setAttribute('tableValues', '0 0.25 0.5 0.75 1'); tct.appendChild(fn); u['tone' + ch] = fn; });\n" +
  "    tfl.appendChild(tct); tsv.appendChild(tfl); u.stage.appendChild(tsv);\n" +
  "    u.tint2 = mk('div', 'ed-tint2'); u.grain = mk('div', 'ed-grain'); u.fxflash = mk('div', 'ed-fxflash'); u.picframe.appendChild(u.tint2); u.picframe.appendChild(u.grain); u.picframe.appendChild(u.fxflash);\n" +
  "    u.overlaylayer = mk('div', 'ed-overlaylayer'); u.stage.appendChild(u.overlaylayer);", 'editor: layers');
rep(ed, "var css = (ex.sharpen ? 'url(#nakiSharp) ' : '') +", "var css = lookExtras(look) + (ex.sharpen ? 'url(#nakiSharp) ' : '') +", 'editor: preview of the extra sliders');
rep(ed, 'syncStickers(); syncOverlays(); syncSfx(s); syncTransition(m, s, vc);', 'syncStickers(); syncOverlays(); syncSfx(s); syncFx(); syncTransition(m, s, vc);', 'editor: sync');
rep(ed, 'function layoutTextLayer(){ layoutTextLayerBase(); layoutPicture(); syncStickers(); syncOverlays(); }', B.editorFns.replace(/^  /, '') + '  function layoutTextLayer(){ layoutTextLayerBase(); layoutPicture(); syncStickers(); syncOverlays(); }', 'editor: functions');
rep(ed, "    texts: { title: 'Your texts', build: function (body){", B.editorPanels + "    texts: { title: 'Your texts', build: function (body){", 'editor: panels');
rep(ed, 'NPR.apply(', 'presetPatch(', 'editor: filters reset the new sliders too', 2);
rep(ed, "{ key: 'matte', label: 'Faded', min: 0, max: 100, neutral: 0 }];",
  "{ key: 'matte', label: 'Faded', min: 0, max: 100, neutral: 0 },\n        { key: 'highlights', label: 'Highlights', min: -100, max: 100, neutral: 0 }, { key: 'shadows', label: 'Shadows', min: -100, max: 100, neutral: 0 },\n        { key: 'tint', label: 'Tint', min: -100, max: 100, neutral: 0 }, { key: 'hue', label: 'Hue', min: -100, max: 100, neutral: 0 }, { key: 'grain', label: 'Grain', min: 0, max: 100, neutral: 0 }];", 'editor: Adjust sliders');
rep(ed, 'saturate: 1, warmth: 0, sharpen: 0, vignette: 0, matte: 0 }', 'saturate: 1, warmth: 0, sharpen: 0, vignette: 0, matte: 0, highlights: 0, shadows: 0, tint: 0, hue: 0, grain: 0 }', 'editor: Adjust reset');
repRe(ed, /NakiVersions\['editor\.js'\] = '[^']*'/, "NakiVersions['editor.js'] = 'look2'", 'editor: version');
css.text = css.text.replace(/\s*$/, '\n') + B.css;

if (problems.length){
  console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + problems.join('\n  - '));
  console.log('\nSend me that list (and the file names) and I will adjust.');
  process.exit(1);
}
[pj, pl, ee, wc, ed, css, ix, sw, pk].forEach(save);
fs.writeFileSync(path.join(root, 'www', 'look2.js'), B.look2Js);
fs.writeFileSync(path.join(root, 'www', 'templates.js'), B.templatesJs);
fs.writeFileSync(path.join(root, 'tests', 'look2.test.js'), T2);
console.log('Done. Changed 9 files, added www/look2.js, www/templates.js and tests/look2.test.js.' + pkgNote + '\nNow run:  npm test');