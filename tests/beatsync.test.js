'use strict';
// Tests for beat sync (www/beatsync.js). Run: node tests/beatsync.test.js
var assert = require('assert');
var P = require('../www/project.js');
var B = require('../www/beatsync.js');

var passed = 0, failed = 0;
function test(name, fn){
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message ? e.message : e)); }
}
function circ(a, b, m){ var d = Math.abs(a - b) % m; return Math.min(d, m - d); }

// A made-up drum loop (the same numbers every time): kick on every beat, snare on the even beats, hats on the eighths, a little hiss.
function drums(bpm, offsetMs, seconds, sr){
  var n = Math.round(seconds * sr), x = new Float32Array(n), beat = 60000 / bpm, s = 12345;
  function rnd(){ s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2147483648 - 1; }
  function hit(tMs, kind, amp){
    var i0 = Math.round(tMs / 1000 * sr), len = Math.round((kind === 'kick' ? 0.12 : kind === 'snare' ? 0.1 : 0.03) * sr), ph = 0;
    for (var k = 0; k < len && i0 + k >= 0 && i0 + k < n; k++){
      var t = k / sr, v;
      if (kind === 'kick'){ ph += 2 * Math.PI * (50 + 100 * Math.exp(-t * 40)) / sr; v = Math.sin(ph) * Math.exp(-t * 25); }
      else if (kind === 'snare') v = rnd() * Math.exp(-t * 30);
      else v = rnd() * Math.exp(-t * 150) * 0.5;
      x[i0 + k] += v * amp;
    }
  }
  var total = Math.floor((seconds * 1000 - offsetMs) / beat) + 1;
  for (var b = 0; b < total; b++){
    var t0 = offsetMs + b * beat;
    hit(t0, 'kick', b % 2 === 0 ? 0.9 : 0.5); if (b % 2 === 1) hit(t0, 'snare', 0.6);
    hit(t0, 'hat', 0.3); hit(t0 + beat / 2, 'hat', 0.3);
  }
  for (var i = 0; i < n; i++) x[i] += rnd() * 0.01;
  return x;
}

// A project: one picture clip with its sound (linked), a voice, and a music clip. `clips` = [[start, dur], ...] for the picture.
function proj(clips, music){
  var total = 0; clips.forEach(function (c){ total = Math.max(total, c[0] + c[1]); });
  function row(id, kind, role, list){ return { id: id, kind: kind, role: role, muted: false, hidden: false, volume: 1, locked: false, clips: list }; }
  var pic = [], snd = [];
  clips.forEach(function (c, i){
    var base = { asset: 'movie', start: c[0], dur: c[1], in: c[0], speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: 'l' + i };
    pic.push(Object.assign({ id: 'p' + i, type: 'video' }, base)); snd.push(Object.assign({ id: 's' + i, type: 'audio' }, base));
  });
  var tracks = [row('t-movie', 'video', 'movie', pic), row('t-moviesound', 'audio', 'movieSound', snd),
    row('t-voice', 'audio', 'voice', [{ id: 'v1', type: 'audio', asset: 'voice', start: 0, dur: total, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }])];
  var assets = { movie: { type: 'video', name: 'm.mp4', durMs: total + 5000 }, voice: { type: 'audio', name: 'voice', durMs: total } };
  if (music){
    assets.music = { type: 'audio', name: 'music', durMs: total };
    tracks.push(row('t-music', 'audio', 'music', [Object.assign({ id: 'm1', type: 'audio', asset: 'music', start: 0, dur: total, in: 0, speed: 1, volume: 0.7, fadeIn: 0, fadeOut: 0 }, music)]));
  }
  return { naki: 'project', version: 1, fps: 30, durationMs: total, levels: [], assets: assets, tracks: tracks };
}
function lane(p){ return p.tracks.filter(function (t){ return t.role === 'movie'; })[0].clips.slice().sort(function (a, b){ return a.start - b.start; }); }
function ends(p){ return lane(p).map(function (c){ return c.start + c.dur; }); }

console.log('beat sync');

// ----- finding the tempo -----
[[90, 0], [100, 237], [120, 400], [128, 60], [140, 180]].forEach(function (c){
  test('finds ' + c[0] + ' BPM with the first beat at ' + c[1] + ' ms', function (){
    var r = B.analyze(drums(c[0], c[1], 40, 22050), 22050);
    assert.ok(r, 'no result');
    assert.ok(Math.abs(r.bpm - c[0]) <= 0.6, 'bpm ' + r.bpm);
    assert.ok(circ(r.offsetMs, c[1], 60000 / c[0]) <= 25, 'offset ' + r.offsetMs);
  });
});
test('too little sound, or silence, gives no answer instead of a wrong one', function (){
  assert.strictEqual(B.analyze(new Float32Array(1000), 22050), null);
  assert.strictEqual(B.analyze(new Float32Array(22050 * 10), 22050), null);
});
test('analyzeBuffer reports the beat in the file\'s own time when it starts part-way in', function (){
  var x = drums(120, 400, 40, 22050), r = B.analyzeBuffer([x, x], 22050, { startMs: 5250, maxMs: 20000 });   // 5250 ms is not on a beat
  assert.ok(Math.abs(r.bpm - 120) <= 0.6);
  assert.ok(circ(r.offsetMs, 400, 500) <= 25, 'offset ' + r.offsetMs);
});

// ----- tapping along -----
test('tap tempo: even taps give the tempo and the beat', function (){
  var taps = []; for (var i = 0; i < 8; i++) taps.push(1230 + i * 500);
  var r = B.tapTempo(taps);
  assert.ok(Math.abs(r.bpm - 120) <= 0.2); assert.ok(circ(r.offsetMs, 1230, 500) <= 2);
});
test('tap tempo: one stray tap is ignored, and fewer than 4 taps is not enough', function (){
  var taps = [1000, 1500, 2000, 2900, 3000, 3500, 4000];   // 2900 is a slip
  assert.ok(Math.abs(B.tapTempo(taps).bpm - 120) <= 1);
  assert.strictEqual(B.tapTempo([1000, 1500, 2000]), null);
});

// ----- the grid on the music clip -----
test('the grid is kept on the music clip, and clearing it takes it away', function (){
  var p = proj([[0, 10000]], {}), q = B.setGrid(p, { bpm: 120, offsetMs: 1250 });
  assert.ok(!B.gridOf(p), 'the old project is not changed');
  var g = B.gridOf(q); assert.strictEqual(g.bpm, 120); assert.strictEqual(g.offsetMs, 250);   // wrapped into one beat
  assert.strictEqual(B.setGrid(q, { bpm: 120, offsetMs: 250 }), q);   // nothing changed: same project back
  assert.ok(!B.gridOf(B.setGrid(q, null)));
});
test('no music means no grid', function (){
  var p = proj([[0, 10000]]); assert.strictEqual(B.setGrid(p, { bpm: 120, offsetMs: 0 }), p);
});
test('beat times follow where the music sits on the timeline', function (){
  var p = B.setGrid(proj([[0, 6000]], { start: 1000, dur: 5000, in: 0 }), { bpm: 120, offsetMs: 0 });
  var t = B.beatTimes(p, 1); assert.strictEqual(t[0], 1000); assert.strictEqual(t[1], 1500);
  assert.deepStrictEqual(B.beatTimes(p, 4).slice(0, 2), [1000, 3000]);
  var q = B.setGrid(proj([[0, 6000]], { start: 0, dur: 6000, in: 250 }), { bpm: 120, offsetMs: 0 });
  assert.strictEqual(B.beatTimes(q, 1)[0], 250);   // the music starts a quarter-beat past a beat, so the first beat is 250 ms in
});
test('the grid survives the music clip being cut in two', function (){
  var p = B.setGrid(proj([[0, 10000]], {}), { bpm: 100, offsetMs: 100 }), q = P.splitAt(p, 4000);
  var m = q.tracks.filter(function (t){ return t.role === 'music'; })[0].clips;
  assert.strictEqual(m.length, 2); assert.ok(m[0].beat && m[1].beat);
  assert.deepStrictEqual(B.beatTimes(q, 1), B.beatTimes(p, 1));
});

// ----- cutting on the beat -----
test('cut every 4 beats at 120 BPM: a cut every 2 s, only the picture and its sound are cut', function (){
  var p = B.setGrid(proj([[0, 10000]], {}), { bpm: 120, offsetMs: 0 }), out = {}, q = B.cutOnBeats(p, { every: 4 }, out);
  assert.deepStrictEqual(ends(q), [2000, 4000, 6000, 8000, 10000]);
  assert.strictEqual(out.cuts, 4);
  assert.strictEqual(q.tracks.filter(function (t){ return t.role === 'movieSound'; })[0].clips.length, 5);
  assert.strictEqual(q.tracks.filter(function (t){ return t.role === 'voice'; })[0].clips.length, 1);
  assert.strictEqual(q.tracks.filter(function (t){ return t.role === 'music'; })[0].clips.length, 1);
  assert.ok(q.tracks.every(function (t){ return !t.locked; }), 'rows are unlocked again');
  assert.deepStrictEqual(P.validate(q), []);
});
test('rows you had locked stay locked', function (){
  var p = B.setGrid(proj([[0, 10000]], {}), { bpm: 120, offsetMs: 0 });
  p = P.setTrackProps(p, 't-voice', { locked: true });
  var q = B.cutOnBeats(p, { every: 4 }, {});
  assert.strictEqual(q.tracks.filter(function (t){ return t.role === 'voice'; })[0].locked, true);
});
test('a second cut on the same beats makes no new cuts', function (){
  var p = B.setGrid(proj([[0, 10000]], {}), { bpm: 120, offsetMs: 0 }), q = B.cutOnBeats(p, { every: 4 }, {}), out = {};
  assert.strictEqual(B.cutOnBeats(q, { every: 4 }, out), q); assert.strictEqual(out.cuts, 0);
});
test('cutting without a grid says so and changes nothing', function (){
  var p = proj([[0, 10000]], {}), out = {}; assert.strictEqual(B.cutOnBeats(p, { every: 1 }, out), p); assert.ok(out.error);
});

// ----- fitting clips to the beat -----
test('fit by trimming: every clip ends on a beat, nothing gets longer, gaps close', function (){
  var p = B.setGrid(proj([[0, 3300], [3300, 3700], [7000, 3000]], {}), { bpm: 120, offsetMs: 0 }), out = {}, q = B.fitToBeats(p, { method: 'trim' }, out);
  assert.deepStrictEqual(ends(q), [3000, 6500, 9500]);
  assert.deepStrictEqual(lane(q).map(function (c){ return c.start; }), [0, 3000, 6500]);
  assert.deepStrictEqual(P.validate(q), []);
});
test('fit by speed: every end lands on a beat (within a few ms)', function (){
  var p = B.setGrid(proj([[0, 3300], [3300, 3700], [7000, 3000]], {}), { bpm: 120, offsetMs: 0 }), q = B.fitToBeats(p, { method: 'speed' }, {});
  ends(q).forEach(function (e){ assert.ok(circ(e, 0, 500) <= 15, 'end ' + e + ' is off the beat'); });
  assert.deepStrictEqual(P.validate(q), []);
});
test('fit to 2 beats: each clip after the first lasts exactly 1 s at 120 BPM', function (){
  var p = B.setGrid(proj([[0, 1500], [1500, 1500], [3000, 1500]], {}), { bpm: 120, offsetMs: 0 }), q = B.fitToBeats(p, { method: 'speed', beats: 2 }, {});
  assert.deepStrictEqual(ends(q).map(function (e){ return Math.round(e / 10) * 10; }), [1000, 2000, 3000]);
});
test('fit without a grid says so and changes nothing', function (){
  var p = proj([[0, 3000]], {}), out = {}; assert.strictEqual(B.fitToBeats(p, {}, out), p); assert.ok(out.error);
});
test('the project fitted is not changed (undo stays simple)', function (){
  var p = B.setGrid(proj([[0, 3300], [3300, 3700]], {}), { bpm: 120, offsetMs: 0 }), before = JSON.stringify(p);
  B.fitToBeats(p, { method: 'trim' }, {}); B.cutOnBeats(p, { every: 1 }, {});
  assert.strictEqual(JSON.stringify(p), before);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
