'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const C = require('../www/colour.js'), P = require('../www/project.js'), PL = require('../www/plan.js'), E = require('../www/export-engine.js');
const WC = require('../www/webcodecs-export.js').WebCodecsExport;
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const near = (a, b, e, m) => assert(Math.abs(a - b) <= (e || 0.001), (m || '') + ' ' + a + ' vs ' + b);
const vclip = (id, start, dur) => ({ id, type: 'video', asset: 'movie', start, dur, in: start, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
const base = { naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 10000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [vclip('vA', 0, 10000)] }] };
const grade = (p, id) => P.findClip(p, id).clip.grade;

ok('curves: a straight line is dropped, values are kept in range, and the smooth curve goes through its points without overshoot', () => {
  assert.strictEqual(C.cleanCurve([[0.5, 0.5], [0, 0], [1, 1]]), null);
  assert.deepStrictEqual(C.cleanCurve([[0, 0], [0.5, 2], [1, 1]]), [[0, 0], [0.5, 1], [1, 1]]);
  const f = C.curveFn([[0, 0], [0.5, 0.7], [1, 1]]); near(f(0), 0); near(f(0.5), 0.7); near(f(1), 1);
  let prev = -1; for (let i = 0; i <= 100; i++) { const v = f(i / 100); assert(v >= prev - 1e-9 && v >= 0 && v <= 1); prev = v; }
});
ok('a neutral grade is not stored, and the looks are all valid', () => {
  assert.strictEqual(C.cleanGrade({ curves: { m: [[0, 0], [1, 1]] }, hsl: { red: [0, 0, 0] } }), null);
  C.PRESETS.forEach(p => assert(C.cleanGrade(p.grade), p.key));
});
ok('no grade gives the identity table, and the colour mixer changes only the colour it was asked to', () => {
  const id = C.bakeLut(null, 5); near(id[(0 * 25 + 0 * 5 + 4) * 3], 1); near(id[(4 * 25 + 4 * 5 + 4) * 3 + 2], 1); near(id[(0 * 25 + 4 * 5 + 0) * 3 + 1], 1);
  const l = C.bakeLut({ hsl: { red: [0, -1, 0] } }, 17), red = (0 * 289 + 0 * 17 + 16) * 3, blue = (16 * 289) * 3;
  near(l[red], 0.5, 0.01, 'red goes grey'); near(l[red + 1], 0.5, 0.01); near(l[blue + 2], 1, 0.001, 'blue stays'); near(l[blue], 0, 0.001);
});
ok('a master curve brightens the middle', () => {
  const l = C.bakeLut({ curves: { m: [[0, 0], [0.5, 0.7], [1, 1]] } }, 3), mid = (1 * 9 + 1 * 3 + 1) * 3; near(l[mid], 0.7, 0.01);
});
ok('.cube files: round trip, 1D and wrong sizes are refused, domain is read', () => {
  const l = C.bakeLut({ curves: { m: [[0, 0], [0.5, 0.7], [1, 1]] } }, 5), back = C.parseCube(C.toCube(l, 5, 'x'));
  assert.strictEqual(back.size, 5); assert.strictEqual(back.title, 'x'); for (let i = 0; i < l.length; i++) near(back.data[i], l[i], 1e-5);
  assert(C.parseCube('LUT_1D_SIZE 4\n0 0 0').error); assert(C.parseCube('LUT_3D_SIZE 2\n0 0 0').error); assert(C.parseCube('hello').error);
  const dom = C.parseCube('LUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n0 0 0\n2 0 0\n0 2 0\n2 2 0\n0 0 2\n2 0 2\n0 2 2\n2 2 2\n'); near(dom.data[3], 1);
});
ok('a LUT is shrunk, stored as text, read back, and mixed in by its intensity', () => {
  const inv = C.parseCube('LUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0\n');
  const enc = C.encodeLut(inv, 9), t = [0, 0, 0]; assert.strictEqual(enc.size, 9); assert.strictEqual(typeof enc.b64, 'string');
  const full = C.bakeLut({ lut: { name: 'inv', size: enc.size, b64: enc.b64 } }, 9); near(full[0], 1, 0.01); near(full[(8 * 81 + 8 * 9 + 8) * 3], 0, 0.01);
  const half = C.bakeLut({ lut: { name: 'inv', size: enc.size, b64: enc.b64 }, lutAmt: 0.5 }, 9); near(half[0], 0.5, 0.01);
  near(C.sampleLut(C.decodeLut(enc), 9, 1, 0, 0.5, t)[0], 0, 0.01);
});
ok('applying a table to pixels: identity keeps them, an inverting table flips them', () => {
  const px = new Uint8ClampedArray([255, 0, 128, 255, 10, 200, 90, 255]), id = C.bakeLut(null, 17), a = Uint8ClampedArray.from(px);
  C.applyToImageData(a, id, 17); for (let i = 0; i < px.length; i++) assert(Math.abs(a[i] - px[i]) <= 1, i);
  const inv = C.parseCube('LUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0\n'), b = new Uint8ClampedArray([255, 0, 128, 255]);
  C.applyToImageData(b, inv.data, 2); assert(b[0] <= 1 && b[1] >= 254 && Math.abs(b[2] - 127) <= 1);
});
ok('setGrade stores, merges by channel and band, removes, and a neutral change keeps the same project', () => {
  let p = P.setGrade(base, 'vA', { curves: { m: [[0, 0], [0.5, 0.7], [1, 1]] } }); assert(grade(p, 'vA').curves.m);
  p = P.setGrade(p, 'vA', { hsl: { red: [0.2, 0, 0] } }); assert(grade(p, 'vA').curves.m && grade(p, 'vA').hsl.red[0] === 0.2);
  p = P.setGrade(p, 'vA', { curves: { m: null }, hsl: { red: null } }); assert.strictEqual(grade(p, 'vA'), undefined);
  assert.strictEqual(P.setGrade(base, 'vA', { curves: { m: [[0, 0], [1, 1]] } }), base);
  const all = P.setGrade(P.splitAt(base, 5000), null, { replace: C.PRESETS[1].grade }); all.tracks[0].clips.forEach(c => assert(c.grade));
});
ok('a cut keeps the grade, a held picture copies it, and different grades are not joined', () => {
  const g = { curves: { m: [[0, 0], [0.5, 0.7], [1, 1]] } }, p = P.setGrade(base, 'vA', g), s = P.splitAt(p, 4000);
  s.tracks[0].clips.forEach(c => assert.deepStrictEqual(c.grade, grade(p, 'vA')));
  const f = P.insertFreeze(p, 3000, 2000).tracks[0].clips.filter(c => c.type === 'freeze')[0]; assert(f.grade);
  const q = P.setGrade(s, s.tracks[0].clips[1].id, { replace: null }), out = {}; P.joinWithNext(q, q.tracks[0].clips[0].id, out); assert(!out.merged);
});
ok('the grade reaches the plan, and a plan with a grade goes to the ffmpeg engine', () => {
  const p = P.setGrade(base, 'vA', { curves: { m: [[0, 0], [0.5, 0.7], [1, 1]] } }), plan = PL.projectToPlan(p); assert(plan.video[0].grade.curves.m);
  assert.strictEqual(WC.canRender(PL.projectToPlan(base)), true); assert.strictEqual(WC.canRender(plan), false);
});
ok('the ffmpeg job applies one .cube file per different grade, and a plain clip is unchanged', () => {
  const info = { width: 320, height: 180, sar: 1, hasAudio: false, audioMono: false, durationSec: 8 }, g = { curves: { m: [[0, 0], [0.5, 0.7], [1, 1]] } };
  const mk = grades => ({ durationMs: 2000, movie: { name: 'm', durationMs: 8000 }, audio: [],
    video: grades.map((gr, i) => Object.assign({ type: 'play', sessionStart: i * 1000, sessionEnd: i * 1000 + 1000, movieStart: 0 }, gr ? { grade: gr } : {})) });
  const built = E.planToJobs(mk([g, g]), info, { height: 180 }), names = Object.keys(built.gradeFiles);
  assert.strictEqual(names.length, 1, 'same grade, one file'); assert(built.gradeFiles[names[0]].includes('LUT_3D_SIZE 33'));
  const a = built.jobs.filter(j => /^picture/.test(j.label))[0].args.join(' '); assert(a.includes('lut3d=file=' + names[0]), a);
  assert.strictEqual(Object.keys(E.planToJobs(mk([g, { hsl: { red: [0.5, 0, 0] } }]), info, { height: 180 }).gradeFiles).length, 2);
  const plain = E.planToJobs(mk([null, null]), info, { height: 180 }); assert.strictEqual(Object.keys(plain.gradeFiles).length, 0);
  assert(!plain.jobs.filter(j => /^picture/.test(j.label))[0].args.join(' ').includes('lut3d'));
});
ok('the editor, page and service worker know the new file', () => {
  const ed = read('editor.js'); ['PANELS.grade =', 'function syncGrade', 'function importCubeFile', "id: 'edGrade'", 'syncGrade(m, photo ? null : vc, css);'].forEach(s => assert(ed.includes(s), s));
  const ix = read('index.html'); assert(ix.indexOf('src="colour.js"') > 0 && ix.indexOf('src="colour.js"') < ix.indexOf('src="project.js"'));
  new vm.Script(read('sw.js')); assert(read('sw.js').includes("'./colour.js'"));
});
console.log('\n' + n + ' checks passed');