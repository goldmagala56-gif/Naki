'use strict';
// Checks the export plan built from the edited timeline.  Run with:  node tests/plan.test.js   (or: npm test)
const assert = require('assert');
const C = require('../www/core.js'), P = require('../www/project.js'), PL = require('../www/plan.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const events = [{ t: 0, type: 'rec_start', movieMs: 0 }, { t: 0, type: 'vol', value: 1 }, { t: 0, type: 'duck', enabled: true, thresholdDb: -40, duckedGain: 0.2 },
  { t: 4000, type: 'play', movieMs: 0 }, { t: 30000, type: 'pause', movieMs: 26000 }, { t: 40000, type: 'play', movieMs: 26000 }, { t: 60000, type: 'rec_stop' }];
const levels = []; for (let i = 0; i < 1201; i++) levels.push(C.dbToByte(-60));
const sess = { events, levels, durationMs: 60000, movieName: 'm.mp4', movieDurMs: 600000, voiceOffsetMs: 100, voiceNudgeMs: 0 };
const base = P.compileFromSession(sess);

ok('an untouched recording gives the plain plan the earlier engines expect (nothing extra in it)', () => {
  const plan = PL.projectToPlan(base);
  assert.strictEqual(plan.version, 2); assert.strictEqual(plan.durationMs, 60000);
  assert.deepStrictEqual(plan.video.map(v => v.type), ['freeze', 'play', 'freeze', 'play']);
  assert.strictEqual('texts' in plan, false);
  plan.video.forEach(v => { ['speed', 'filter', 'vFadeIn', 'vFadeOut'].forEach(k => assert.strictEqual(k in v, false, k)); });
  plan.audio.forEach(a => assert.strictEqual('speed' in a, false));
  let cur = 0; plan.video.forEach(v => { assert.strictEqual(v.sessionStart, cur); cur = v.sessionEnd; }); assert.strictEqual(cur, 60000);
});
ok('speed, filter and fades reach the plan; sound speed only for the movie', () => {
  const c = base.tracks[0].clips.find(x => x.start === 4000);
  let p = P.setClipSpeed(base, c.id, 2); p = P.setFilter(p, c.id, { brightness: 0.8, saturate: 0 }); p = P.setVFade(p, c.id, { vFadeIn: 400, vFadeOut: 600 });
  const plan = PL.projectToPlan(p), v = plan.video.find(x => x.sessionStart === 4000);
  assert.strictEqual(v.speed, 2); assert.deepStrictEqual(v.filter, { brightness: 0.8, contrast: 1, saturate: 0 }); assert.strictEqual(v.vFadeIn, 400); assert.strictEqual(v.vFadeOut, 600);
  assert.strictEqual(v.sessionEnd - v.sessionStart, 13000);
  assert.strictEqual(plan.audio.find(a => a.src === 'movie' && a.startMs === 4000).speed, 2);
  assert(!plan.audio.filter(a => a.src === 'voice').some(a => 'speed' in a));
});
ok('after a speed change the plan still reads the right stretch of the movie', () => {
  const c = base.tracks[0].clips.find(x => x.start === 4000), p = P.rippleDelete(P.setClipSpeed(base, c.id, 2), 6000, 8000);   // cut 2 s of the timeline = 4 s of movie
  const plan = PL.projectToPlan(p), parts = plan.video.filter(v => v.type === 'play' && v.sessionStart < 20000);
  assert.strictEqual(parts.length, 2); assert.strictEqual(parts[0].movieStart, 0); assert.strictEqual(parts[1].movieStart, 8000, 'the second part resumes 8 s into the movie');
});
ok('text goes into the plan, in time order, and empty text is left out', () => {
  const a = {}, b = {}, e = {}; let p = P.addTextClip(base, 20000, 3000, a); p = P.addTextClip(p, 5000, 3000, b); p = P.addTextClip(p, 40000, 2000, e);
  p = P.setTextProps(p, a.id, { text: 'Second', pos: 'top', bg: true }); p = P.setTextProps(p, b.id, { text: 'First', color: '#ff0000' }); p = P.setTextProps(p, e.id, { text: '   ' });
  const plan = PL.projectToPlan(p);
  assert.deepStrictEqual(plan.texts.map(t => t.text), ['First', 'Second']);
  assert.strictEqual(plan.texts[0].startMs, 5000); assert.strictEqual(plan.texts[0].durMs, 3000); assert.strictEqual(plan.texts[1].pos, 'top'); assert.strictEqual(plan.texts[1].bg, true);
});
ok('music and a muted sound track', () => {
  const m = P.ensureMusic(base, { name: 's.mp3', durMs: 30000 }), plan = PL.projectToPlan(m), mu = plan.audio.find(a => a.src === 'music');
  assert(mu && mu.durMs === 30000 && mu.startMs === 0);
  const off = PL.projectToPlan(P.setTrackProps(m, 't-music', { muted: true })); assert(!off.audio.some(a => a.src === 'music'));
});
ok('a held picture (freeze frame) and cut-out gaps give a plan with no holes', () => {
  const p = P.insertFreeze(base, 10000, 2500), plan = PL.projectToPlan(p);
  assert.strictEqual(plan.durationMs, 62500); let cur = 0; plan.video.forEach(v => { assert.strictEqual(v.sessionStart, cur); cur = v.sessionEnd; }); assert.strictEqual(cur, 62500);
  const fz = plan.video.find(v => v.type === 'freeze' && v.sessionStart === 10000); assert(fz && fz.sessionEnd === 12500 && fz.movieAt === 6000);
  const gap = PL.projectToPlan(P.deleteClip(base, base.tracks[0].clips.find(x => x.start === 4000).id)); assert(gap.video.some(v => v.type === 'black'));
});
ok('opacity and zoom / turn / flip reach the plan, and only where they are used', () => {
  const c = base.tracks[0].clips.find(x => x.start === 4000), fz = base.tracks[0].clips[0];
  let p = P.setOpacity(base, c.id, 0.5); p = P.setTransform(p, c.id, { zoom: 2, x: 0.5, y: -0.5, rot: 90, flipH: true }); p = P.setTransform(p, fz.id, { rot: 180 });
  const plan = PL.projectToPlan(p), v = plan.video.find(x => x.sessionStart === 4000), f = plan.video[0];
  assert.strictEqual(v.opacity, 0.5); assert.deepStrictEqual(v.transform, { zoom: 2, x: 0.5, y: -0.5, rot: 90, flipH: true });
  assert.deepStrictEqual(f.transform, { zoom: 1, x: 0, y: 0, rot: 180, flipH: false }); assert.strictEqual('opacity' in f, false);
  const other = plan.video.filter(x => x.sessionStart !== 4000 && x !== f); other.forEach(x => { assert.strictEqual('opacity' in x, false); assert.strictEqual('transform' in x, false); });
  const dup = PL.projectToPlan(P.duplicateClip(p, c.id, {})); assert.strictEqual(dup.video.filter(x => x.opacity === 0.5).length, 2, 'a copy keeps the look');
});

console.log('\n' + n + ' checks passed');