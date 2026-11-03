'use strict';
// Tests for project templates (www/projtemplate.js). Run: node tests/projtemplate.test.js
var assert = require('assert');
var P = require('../www/project.js');
var T = require('../www/projtemplate.js');
var FX = null; try { FX = require('../www/fx.js'); } catch (e) { FX = null; }

var passed = 0, failed = 0;
function test(name, fn){
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message ? e.message : e)); }
}

// A small project built by hand (the shape is described at the top of project.js): picture + its sound + a voice, no music.
function base(durationMs){
  var d = durationMs || 20000;
  function row(id, kind, role, clips){ return { id: id, kind: kind, role: role, muted: false, hidden: false, volume: 1, locked: false, clips: clips }; }
  function clip(id, asset, extra){ return Object.assign({ id: id, type: 'video', asset: asset, start: 0, dur: d, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }, extra || {}); }
  return { naki: 'project', version: 1, fps: 30, durationMs: d, levels: [], assets: { movie: { type: 'video', name: 'm.mp4', durMs: d }, voice: { type: 'audio', name: 'voice', durMs: d } },
    tracks: [ row('t-movie', 'video', 'movie', [clip('c1', 'movie', { link: 'l1' })]),
      row('t-moviesound', 'audio', 'movieSound', [clip('c2', 'movie', { type: 'audio', link: 'l1' })]),
      row('t-voice', 'audio', 'voice', [clip('c3', 'voice', { type: 'audio' })]) ] };
}
function find(p, pred){ var out = []; p.tracks.forEach(function (t){ t.clips.forEach(function (c){ if (pred(t, c)) out.push(c); }); }); return out; }

// A project with a bit of everything the template should keep.
function styled(){
  var p = base(20000), o = {};
  p = P.addTextClip(p, 2000, 3000, o); p = P.setTextProps(p, o.id, { text: 'Hello', color: '#ff0000', size: 9 });
  p = P.addSticker(p, 6000, 2000, '\u2b50', {});
  if (FX && FX.gen && FX.gen.SHAPES && FX.gen.SHAPES[0]){
    var k = FX.gen.SHAPES[0].key; p = P.addGen(p, 9000, { kind: 'shape', shape: k, ar: FX.gen.AR[k] }, {});
  }
  var fxKey = (FX && FX.vfx && FX.vfx.KEYS && FX.vfx.KEYS[0]) || 'shake';
  p = P.addFx(p, 12000, fxKey, {});
  p = P.setFormat(p, { ratio: '9:16' });
  p = P.setFilter(p, null, { brightness: 1.2 });
  p = P.setTrackProps(p, 't-voice', { volume: 0.8 });
  return p;
}

console.log('project templates');

test('a plain project has nothing worth saving', function (){
  assert.ok(T.isEmpty(T.capture(base(), 'x')));
});
test('capture keeps titles, stickers, effects, format, look and levels', function (){
  var t = T.capture(styled(), 'My look');
  assert.strictEqual(t.name, 'My look');
  assert.strictEqual(t.texts.length, 1); assert.strictEqual(t.texts[0].text, 'Hello'); assert.strictEqual(t.texts[0].color, '#ff0000');
  assert.strictEqual(t.stickers.length, 1);
  assert.strictEqual(t.effects.length, 1);
  assert.ok(t.format && t.format.ratio === '9:16');
  assert.ok(t.look && t.look.brightness === 1.2);
  assert.strictEqual(t.volumes.voice, 0.8);
  assert.ok(Math.abs(t.texts[0].at - 0.1) < 0.0001);   // 2000 of 20000
});
test('it survives being written to a file and read back', function (){
  var t = T.capture(styled(), 'a'), r = T.parse(T.serialize(t));
  assert.ok(r.template, r.error);
  assert.strictEqual(r.template.texts[0].text, 'Hello');
  assert.strictEqual(T.fileName(t), 'a.naki-template.json');
});
test('garbage and newer files are refused with a clear message', function (){
  assert.ok(T.parse('not json').error);
  assert.ok(T.parse('{"hello":1}').error);
  assert.ok(T.parse(JSON.stringify({ naki: 'template', version: 99 })).error);
  assert.ok(T.parse(JSON.stringify({ naki: 'template', version: 1, texts: [], stickers: [], shapes: [], effects: [] })).error);   // empty
});
test('bad items inside a template are dropped, the rest still loads', function (){
  var t = T.capture(styled(), 'a'); t.texts.push({ at: 'x', durMs: 'y', text: 5 }); t.stickers.push({ at: 0.1, durMs: 1000 });
  var r = T.parse(JSON.stringify(t));
  assert.ok(r.template); assert.strictEqual(r.template.texts.length, 1); assert.strictEqual(r.template.stickers.length, 1);
});
test('applying to a longer video moves the start in proportion and keeps the length', function (){
  var t = T.capture(styled(), 'a'), out = {}, q = T.apply(base(30000), t, {}, out);
  var tx = find(q, function (tr, c){ return c.type === 'text' && c.text === 'Hello'; })[0];
  assert.ok(tx, 'title was added');
  assert.strictEqual(tx.start, 3000); assert.strictEqual(tx.dur, 3000); assert.strictEqual(tx.color, '#ff0000');
  assert.strictEqual(out.added.texts, 1); assert.strictEqual(out.added.stickers, 1); assert.strictEqual(out.added.effects, 1);
});
test('format, look and sound levels come across', function (){
  var q = T.apply(base(), T.capture(styled(), 'a'), {});
  assert.strictEqual(q.format.ratio, '9:16');
  assert.strictEqual(find(q, function (tr, c){ return tr.role === 'movie'; })[0].filter.brightness, 1.2);
  assert.strictEqual(q.tracks.filter(function (t){ return t.role === 'voice'; })[0].volume, 0.8);
});
test('the project it was applied to is not changed (undo stays simple)', function (){
  var b = base(), before = JSON.stringify(b); T.apply(b, T.capture(styled(), 'a'), {});
  assert.strictEqual(JSON.stringify(b), before);
});
test('the result is a valid project', function (){
  var q = T.apply(base(30000), T.capture(styled(), 'a'), {});
  assert.deepStrictEqual(P.validate(q), []);
});
test('replace removes what was there, add keeps it', function (){
  var t = T.capture(styled(), 'a'), once = T.apply(base(), t, {}), titles = function (p){ return find(p, function (tr, c){ return c.type === 'text' && c.text; }).length; };
  assert.strictEqual(titles(T.apply(once, t, { replace: true })), 1);
  assert.strictEqual(titles(T.apply(once, t, { replace: false })), 2);
});
test('your own pictures and sounds are never removed by "replace"', function (){
  var p = base(), q = P.addVideoClip ? P.addVideoClip(p, { name: 'b.mp4', durMs: 4000, w: 640, h: 360 }, {}) : p;
  var after = T.apply(q, T.capture(styled(), 'a'), { replace: true });
  assert.strictEqual(after.assets.v1 ? 1 : 0, q.assets.v1 ? 1 : 0);
});
test('a template with nothing to change gives the same project back', function (){
  var t = { naki: 'template', version: 1, name: 'x', durationMs: 1000, texts: [], stickers: [], shapes: [], effects: [], skipped: {}, volumes: { voice: 1 } };
  var b = base(); assert.strictEqual(T.apply(b, t, {}), b);
});
test('captions, added videos and file overlays are counted as left out, not saved', function (){
  var p = base(); p = P.addCaptions(p, [{ startMs: 1000, endMs: 3000, text: 'hi' }], {}, {});
  var t = T.capture(p, 'c'); assert.strictEqual(t.skipped.captions, 1);
  assert.ok(/caption/.test(T.describeSaved(Object.assign({}, t, { texts: [{}] }))));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);