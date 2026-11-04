'use strict';
// Tests for the cover maker (www/cover.js). Run: node tests/cover.test.js
// It needs no browser: the canvas and the page are small stand-ins that record what was asked of them.
var assert = require('assert');
var C = require('../www/cover.js');

var passed = 0, failed = 0, queue = [];
function test(name, fn){ queue.push([name, fn]); }   // run one after another at the end, so tests that return a promise are waited for
function report(name, e){
  if (e){ failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message ? e.message : e)); } else { passed++; console.log('  ok   ' + name); }
}
function near(a, b, tol){ assert.ok(Math.abs(a - b) <= (tol || 0.01), a + ' is not close to ' + b); }

// A canvas that records its drawing calls. Text is as wide as 0.5 x its font size per letter.
function fakeCanvas(){
  var calls = [], g = { filter: 'none', font: '10px x', calls: calls };
  ['save', 'restore', 'clearRect', 'fillRect', 'drawImage', 'fillText', 'strokeText'].forEach(function (m){
    g[m] = function (){ calls.push({ m: m, a: [].slice.call(arguments), font: g.font, filter: g.filter, fill: g.fillStyle }); };
  });
  g.measureText = function (s){ var px = parseFloat((/(\d+(?:\.\d+)?)px/.exec(g.font) || [0, 10])[1]); return { width: String(s).length * px * 0.5 }; };
  return { width: 0, height: 0, getContext: function (){ return g; }, g: g, calls: calls,
    toBlob: function (cb, type, q){ cb({ size: Math.round((q == null ? 1 : q) * 3000000), type: type }); } };
}
var snap = { canvas: {}, w: 1920, h: 1080 };

console.log('cover maker');

test('the sizes are the ones the sites ask for', function (){
  assert.deepStrictEqual([C.sizeOf('youtube').w, C.sizeOf('youtube').h], [1280, 720]);
  assert.deepStrictEqual([C.sizeOf('tiktok').w, C.sizeOf('tiktok').h], [1080, 1920]);
  assert.deepStrictEqual([C.sizeOf('square').w, C.sizeOf('square').h], [1080, 1080]);
  assert.strictEqual(C.sizeOf('nope').key, 'youtube');   // anything unknown falls back to YouTube
});
test('filling a tall shape from a wide picture crops the sides, around the middle', function (){
  var r = C.coverRect(1920, 1080, 1080, 1920, 1, 0.5, 0.5);
  near(r.sh, 1080); near(r.sw, 607.5); near(r.sx, 656.25); near(r.sy, 0);
});
test('left and right moves the crop to either edge, never past it', function (){
  var a = C.coverRect(1920, 1080, 1080, 1920, 1, 0, 0.5), b = C.coverRect(1920, 1080, 1080, 1920, 1, 1, 0.5);
  near(a.sx, 0); near(b.sx + b.sw, 1920);
  var c = C.coverRect(1920, 1080, 1080, 1920, 1, -5, 9); assert.ok(c.sx >= 0 && c.sy >= 0);
});
test('zoom looks at a smaller part of the picture', function (){
  var a = C.coverRect(1920, 1080, 1280, 720, 1, 0.5, 0.5), b = C.coverRect(1920, 1080, 1280, 720, 2, 0.5, 0.5);
  near(b.sw, a.sw / 2); near(b.sh, a.sh / 2);
});
test('the whole picture fits inside a box, centred', function (){
  var r = C.containRect(1920, 1080, 1080, 1920);
  near(r.w, 1080); near(r.h, 607.5); near(r.x, 0); near(r.y, 656.25);
});
test('words wrap, new lines stay, and a long word is broken', function (){
  var m = function (s){ return s.length * 10; };
  assert.deepStrictEqual(C.wrapLines(m, 'hello world foo', 100), ['hello', 'world foo']);
  assert.deepStrictEqual(C.wrapLines(m, 'one\ntwo', 100), ['one', 'two']);
  assert.deepStrictEqual(C.wrapLines(m, 'abcdefghijklmnop', 100), ['abcdefghij', 'klmnop']);
  assert.deepStrictEqual(C.wrapLines(m, '', 100), ['']);
});
test('too many lines are cut with an ellipsis', function (){
  var r = C.wrapLines(function (s){ return s.length * 10; }, 'aaa bbb ccc ddd eee fff', 40, 2);
  assert.strictEqual(r.length, 2); assert.ok(/\u2026$/.test(r[1]));
});

test('drawing sets the canvas to the chosen size and paints the picture once', function (){
  var cv = fakeCanvas(), p = C.defaults('');
  C.draw(cv, snap, p, 'serif'); assert.deepStrictEqual([cv.width, cv.height], [1280, 720]);
  assert.strictEqual(cv.calls.filter(function (c){ return c.m === 'drawImage'; }).length, 1);
  p.size = 'tiktok'; C.draw(cv, snap, p, 'serif'); assert.deepStrictEqual([cv.width, cv.height], [1080, 1920]);
});
test('no title and no subtitle means no text is drawn', function (){
  var cv = fakeCanvas(); C.draw(cv, snap, C.defaults(''), 'serif');
  assert.strictEqual(cv.calls.filter(function (c){ return c.m === 'fillText'; }).length, 0);
});
test('a title is drawn with its outline first, then filled, in the colour chosen', function (){
  var cv = fakeCanvas(), p = C.defaults('Hello'); p.color = '#ff0000'; C.draw(cv, snap, p, 'Impact');
  var s = cv.calls.filter(function (c){ return c.m === 'strokeText'; }), f = cv.calls.filter(function (c){ return c.m === 'fillText'; });
  assert.strictEqual(f.length, 1); assert.strictEqual(s.length, 1); assert.strictEqual(f[0].a[0], 'Hello'); assert.strictEqual(f[0].fill, '#ff0000');
  assert.ok(/Impact/.test(f[0].font), 'the font family is used');
  assert.ok(cv.calls.indexOf(s[0]) < cv.calls.indexOf(f[0]), 'outline is drawn under the fill');
});
test('a subtitle is drawn smaller and below the title', function (){
  var cv = fakeCanvas(), p = C.defaults('Big'); p.sub = 'small'; C.draw(cv, snap, p, 'serif');
  var f = cv.calls.filter(function (c){ return c.m === 'fillText'; });
  assert.strictEqual(f.length, 2); assert.ok(f[1].a[2] > f[0].a[2], 'subtitle is lower'); assert.ok(parseFloat(/(\d+)px/.exec(f[1].font)[1]) < parseFloat(/(\d+)px/.exec(f[0].font)[1]));
});
test('a very long title gets smaller instead of running off the picture', function (){
  var cv = fakeCanvas(), short = C.defaults('Hi'), long = C.defaults(new Array(60).join('word ')); C.draw(cv, snap, short, 'serif');
  var a = parseFloat(/(\d+)px/.exec(cv.calls.filter(function (c){ return c.m === 'fillText'; })[0].font)[1]);
  var cv2 = fakeCanvas(); C.draw(cv2, snap, long, 'serif');
  var f2 = cv2.calls.filter(function (c){ return c.m === 'fillText'; }), b = parseFloat(/(\d+)px/.exec(f2[0].font)[1]);
  assert.ok(b < a, 'text shrank'); assert.ok(f2.length <= 5, 'at most 5 lines');
  f2.forEach(function (c){ assert.ok(c.a[2] >= 0 && c.a[2] <= 720, 'every line is on the picture'); });
});
test('"whole picture on blur" draws the picture twice, and the top / bottom choice moves the text', function (){
  var cv = fakeCanvas(), p = C.defaults('T'); p.fit = 'blur'; C.draw(cv, snap, p, 'serif');
  assert.strictEqual(cv.calls.filter(function (c){ return c.m === 'drawImage'; }).length, 2);
  var y = function (pos){ var c = fakeCanvas(), q = C.defaults('T'); q.pos = pos; C.draw(c, snap, q, 'serif'); return c.calls.filter(function (k){ return k.m === 'fillText'; })[0].a[2]; };
  assert.ok(y('top') < y('center') && y('center') < y('bottom'));
});
test('the dark band is drawn behind the text', function (){
  var cv = fakeCanvas(), p = C.defaults('T'); p.band = true; C.draw(cv, snap, p, 'serif');
  var bandAt = -1; cv.calls.forEach(function (c, i){ if (c.m === 'fillRect' && /rgba\(0,0,0,0\.55\)/.test(c.fill) && bandAt < 0) bandAt = i; });
  assert.ok(bandAt >= 0 && bandAt < cv.calls.indexOf(cv.calls.filter(function (c){ return c.m === 'fillText'; })[0]));
});
test('with no picture yet it still draws (dark background and the title)', function (){
  var cv = fakeCanvas(); C.draw(cv, null, C.defaults('Hello'), 'serif');
  assert.strictEqual(cv.calls.filter(function (c){ return c.m === 'drawImage'; }).length, 0);
  assert.strictEqual(cv.calls.filter(function (c){ return c.m === 'fillText'; }).length, 1);
});

test('JPG is made smaller step by step until it is under the limit', function (){
  var cv = fakeCanvas(), done;
  C.encode(cv, 'jpg', 2000000).then(function (r){ done = r; });
  return new Promise(function (res){ setImmediate(res); }).then(function (){
    assert.ok(done.blob.size <= 2000000, 'size ' + done.blob.size); assert.ok(done.quality < 0.92 && done.quality >= 0.5);
  });
});
test('PNG is made once, and a canvas that cannot make an image says so', function (){
  var cv = fakeCanvas(), n = 0; cv.toBlob = function (cb, type){ n++; cb({ size: 5, type: type }); };
  var ok = C.encode(cv, 'png', 0).then(function (r){ assert.strictEqual(n, 1); assert.strictEqual(r.blob.type, 'image/png'); });
  var bad = fakeCanvas(); bad.toBlob = function (cb){ cb(null); };
  return ok.then(function (){ return C.encode(bad, 'jpg', 0).then(function (){ throw new Error('should have failed'); }, function (e){ assert.ok(/could not be made/.test(e.message)); }); });
});

// ----- the screen, on a stand-in page -----
function fakeEl(tag){
  var e = { tag: tag, style: { cssText: '' }, children: [], listeners: {}, attrs: {}, textContent: '', value: '', parentNode: null,
    appendChild: function (c){ c.parentNode = e; e.children.push(c); return c; },
    removeChild: function (c){ e.children = e.children.filter(function (x){ return x !== c; }); c.parentNode = null; },
    addEventListener: function (ev, fn){ (e.listeners[ev] = e.listeners[ev] || []).push(fn); },
    setAttribute: function (k, v){ e.attrs[k] = v; }, remove: function (){ if (e.parentNode) e.parentNode.removeChild(e); },
    click: function (){ (e.listeners.click || []).forEach(function (f){ f(); }); } };
  Object.defineProperty(e, 'textContent', { get: function (){ return e._t || ''; }, set: function (v){ e._t = v; if (v === '') e.children = []; } });
  if (tag === 'canvas'){ var cv = fakeCanvas(); e.getContext = cv.getContext; e.toBlob = cv.toBlob; }
  return e;
}
function findAll(root, pred, out){ out = out || []; if (pred(root)) out.push(root); root.children.forEach(function (c){ findAll(c, pred, out); }); return out; }
test('without a page it returns nothing instead of failing', function (){
  assert.strictEqual(typeof document, 'undefined'); assert.strictEqual(C.open({}), null);
});
test('the screen builds, loads the picture, offers the controls, and closes cleanly', function (){
  var body = fakeEl('body'), keys = [];
  global.document = { createElement: fakeEl, body: body, fonts: null, addEventListener: function (e, f){ keys.push(f); }, removeEventListener: function (){ keys.length = 0; } };
  global.requestAnimationFrame = function (f){ setImmediate(f); return 1; };
  var asked = [], closed = false, handle = C.open({ durationMs: 60000, startMs: 5000, title: 'My trip', fileBase: 'trip', fonts: [{ key: 'sans', label: 'Sans' }, { key: 'bebas', label: 'Bebas' }],
    fontFamily: function (k){ return k === 'bebas' ? '"Bebas Neue", sans-serif' : ''; }, frameAt: function (ms){ asked.push(ms); return Promise.resolve(snap); }, onClose: function (){ closed = true; } });
  return new Promise(function (res){ setImmediate(res); }).then(function (){
    assert.strictEqual(body.children.length, 1, 'the screen is on the page'); assert.deepStrictEqual(asked, [5000]);
    var root = body.children[0], buttons = findAll(root, function (e){ return e.tag === 'button'; }).map(function (b){ return b.textContent; });
    ['Download', 'Share / save to gallery', 'YouTube', 'TikTok / Shorts / Reels', 'Square', 'Fill the shape', 'JPG (smaller)'].forEach(function (t){ assert.ok(buttons.indexOf(t) >= 0, 'missing the "' + t + '" button'); });
    var tiktok = findAll(root, function (e){ return e.tag === 'button' && e.textContent === 'TikTok / Shorts / Reels'; })[0]; tiktok.click();
    return new Promise(function (res){ setImmediate(res); }).then(function (){
    var cv = findAll(root, function (e){ return e.tag === 'canvas'; })[0]; assert.strictEqual(cv.height, 1920, 'the picture is now tall');
    var bebas = findAll(root, function (e){ return e.tag === 'button' && e.textContent === 'Bebas'; })[0]; bebas.click();
    return new Promise(function (res){ setImmediate(res); }); }).then(function (){
    handle.close(); assert.strictEqual(body.children.length, 0); assert.ok(closed);
    delete global.document; delete global.requestAnimationFrame;
    });
  });
});

queue.reduce(function (chain, t){
  return chain.then(function (){
    try { return Promise.resolve(t[1]()).then(function (){ report(t[0]); }, function (e){ report(t[0], e || new Error('failed')); }); }
    catch (e) { report(t[0], e); }
  });
}, Promise.resolve()).then(function (){
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
});