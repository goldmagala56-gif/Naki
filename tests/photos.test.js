'use strict';
// node tests/photos.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const www = f => path.join(__dirname, '..', 'www', f);
const P = require('../www/project.js'), NP = require('../www/plan.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const mkBase = () => ({ naki: 'project', version: 1, fps: 30, durationMs: 10000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } }, tracks: [
  { id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
    { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 10000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] });

ok('a photo goes after the last picture clip, 3 s long, as a picture clip with an image asset; the plan marks it as a photo', () => {
  const o = {}, q = P.addPhotoClip(mkBase(), { name: 'a.jpg', w: 1600, h: 900 }, o), c = P.findClip(q, o.id).clip;
  assert.strictEqual(c.type, 'freeze'); assert.strictEqual(c.start, 10000); assert.strictEqual(c.dur, 3000); assert.strictEqual(q.assets[o.asset].type, 'image');
  assert.strictEqual(q.durationMs, 13000); assert.deepStrictEqual(P.validate(q), []); assert(P.isPhotoAsset(q, o.asset) && !P.isPhotoAsset(q, 'movie'));
  const sp = NP.projectToPlan(q).video, last = sp[sp.length - 1];
  assert.strictEqual(last.type, 'freeze'); assert.strictEqual(last.image, true); assert.strictEqual(last.asset, o.asset); assert.strictEqual(sp[0].image, undefined);
  assert.strictEqual(P.addPhotoClip(mkBase(), {}, {}, 5000).durationMs, 15000, 'a length can be given');
});
ok('the length of a photo moves the clips after it and stretches its Ken Burns keyframes', () => {
  const o1 = {}, o2 = {}; let q = P.addPhotoClip(mkBase(), { name: 'a.jpg', w: 100, h: 100 }, o1); q = P.addPhotoClip(q, { name: 'b.jpg', w: 100, h: 100 }, o2);
  assert.strictEqual(P.findClip(q, o2.id).clip.start, 13000);
  const longer = P.setPhotoDuration(q, o1.id, 5000); assert.strictEqual(P.findClip(longer, o1.id).clip.dur, 5000); assert.strictEqual(P.findClip(longer, o2.id).clip.start, 15000);
  const kb = P.setMotionPreset(longer, o1.id, 'zoomin'), kf = P.findClip(kb, o1.id).clip.kf; assert(kf && kf.zoom && kf.zoom[1][0] === 5000);
  const shorter = P.setPhotoDuration(kb, o1.id, 2500), c = P.findClip(shorter, o1.id).clip; assert.strictEqual(c.dur, 2500); assert.strictEqual(c.kf.zoom[1][0], 2500); assert.strictEqual(P.findClip(shorter, o2.id).clip.start, 12500);
  assert.strictEqual(P.setPhotoDuration(q, o1.id, 3000), q, 'same length: nothing changes'); assert.strictEqual(P.setPhotoDuration(q, 'vA', 5000), q, 'a video clip is not a photo');
  assert(NP.projectToPlan(kb).video.some(s => s.image && s.kf && s.kf.zoom), 'the movement reaches the export plan');
});
ok('a photo can have a transition from the clip before it, and cutting it keeps the picture', () => {
  const o1 = {}, o2 = {}; let q = P.addPhotoClip(mkBase(), { name: 'a.jpg', w: 100, h: 100 }, o1); q = P.addPhotoClip(q, { name: 'b.jpg', w: 100, h: 100 }, o2);
  q = P.setTransition(q, o2.id, { type: 'fade', durMs: 600 });
  const spans = NP.projectToPlan(q).video, b = spans.filter(s => s.asset === o2.asset)[0]; assert(b && b.transitionIn && b.transitionIn.type === 'fade' && b.image === true);
  const cut = P.splitAt(q, 11500), pieces = P.findClip(cut, o1.id) && cut.tracks[0].clips.filter(c => c.asset === o1.asset); assert.strictEqual(pieces.length, 2);
  assert(pieces.every(c => c.type === 'freeze')); assert.deepStrictEqual(P.validate(cut), []);
});
ok('the editor and both export engines handle photos; edited files parse', () => {
  const ed = fs.readFileSync(www('editor.js'), 'utf8'), ee = fs.readFileSync(www('export-engine.js'), 'utf8'), wc = fs.readFileSync(www('webcodecs-export.js'), 'utf8');
  ['editor.js', 'project.js', 'plan.js', 'export-engine.js', 'webcodecs-export.js'].forEach(f => new vm.Script(fs.readFileSync(www(f), 'utf8'), { filename: f }));
  ['function addPhotoFromFile', 'function photoSync', 'function buildSlideshow', 'PANELS.photo = ', 'PANELS.slideshow = ', "id: 'edAddPhoto'", "id: 'edSlideshow'", 'isPhotoClip(c)', 'P.addPhotoClip', 'P.setPhotoDuration'].forEach(s => assert(ed.includes(s), s));
  assert(ee.includes("sp.type === 'freeze' && sp.image") && ee.includes('fileOf(sp)'), 'ffmpeg engine draws photos');
  assert(wc.includes('createImageBitmap(vfiles') && wc.includes('photoBm'), 'fast engine draws photos');
});
console.log('\n' + n + ' checks passed');