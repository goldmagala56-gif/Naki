'use strict';
// node tests/movie-captions.test.js   Captions from the movie's own sound are moved onto the edited timeline.
const assert = require('assert'), fs = require('fs'), path = require('path');
const www = (f) => path.join(__dirname, '..', 'www', f);
const C = require(www('captions.js'));
let n = 0; function t(name, fn) { fn(); n++; console.log('  ok  ' + name); }
const seg = (a, b, x) => ({ startMs: a, endMs: b, text: x || 'hello' });

t('an untouched movie keeps its times', () => {
  const r = C.toTimeline([seg(1000, 3000)], [{ start: 0, dur: 10000, in: 0, speed: 1 }]);
  assert.deepStrictEqual(r, [{ startMs: 1000, endMs: 3000, text: 'hello' }]);
});
t('a clip that starts later on the timeline, and further into the movie', () => {
  const r = C.toTimeline([seg(3000, 4000)], [{ start: 5000, dur: 8000, in: 2000, speed: 1 }]);
  assert.strictEqual(r[0].startMs, 6000); assert.strictEqual(r[0].endMs, 7000);
});
t('speed 2 halves the time', () => {
  const r = C.toTimeline([seg(2000, 4000)], [{ start: 0, dur: 5000, in: 0, speed: 2 }]);
  assert.strictEqual(r[0].startMs, 1000); assert.strictEqual(r[0].endMs, 2000);
});
t('a cut-out part drops the lines in it and moves the later ones up', () => {
  const clips = [{ start: 0, dur: 2000, in: 0, speed: 1 }, { start: 2000, dur: 3000, in: 5000, speed: 1 }];
  const r = C.toTimeline([seg(2500, 4500, 'gone'), seg(6000, 7000, 'kept')], clips);
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].text, 'kept'); assert.strictEqual(r[0].startMs, 3000); assert.strictEqual(r[0].endMs, 4000);
});
t('a line over a split with no gap stays one line', () => {
  const clips = [{ start: 0, dur: 2000, in: 0, speed: 1 }, { start: 2000, dur: 2000, in: 2000, speed: 1 }];
  const r = C.toTimeline([seg(1500, 2500)], clips); assert.deepStrictEqual(r, [{ startMs: 1500, endMs: 2500, text: 'hello' }]);
});
t('a line that is mostly cut away is dropped; half or more is kept', () => {
  assert.strictEqual(C.toTimeline([seg(1000, 5000)], [{ start: 0, dur: 1500, in: 0, speed: 1 }]).length, 0);
  assert.strictEqual(C.toTimeline([seg(1000, 3000)], [{ start: 0, dur: 2000, in: 0, speed: 1 }]).length, 1);
});
t('lines never overlap, and very short ones are dropped', () => {
  const r = C.toTimeline([seg(1000, 3000, 'a'), seg(2500, 4000, 'b')], [{ start: 0, dur: 10000, in: 0, speed: 1 }]);
  assert.strictEqual(r[0].endMs, 2500); assert.strictEqual(r[1].startMs, 2500);
});
t('the editor has the movie-sound option', () => {
  const ed = fs.readFileSync(www('editor.js'), 'utf8');
  assert(ed.includes('function extractMovieAudio') && ed.includes('runAutoCaptionsVoice') && ed.includes("pickChip('acsource')") && ed.includes('runAutoCaptions(cur, src)'));
});
console.log('\n' + n + ' checks passed');
