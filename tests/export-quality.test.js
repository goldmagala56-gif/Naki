'use strict';
// node tests/export-quality.test.js
// The fast export engine's quality settings: how much video data it spends, what size it exports at, which frame rate it keeps, and that it no longer
// asks the encoder for the low-quality "realtime" mode.
const assert = require('assert'), fs = require('fs'), path = require('path');
const { WebCodecsExport } = require('../www/webcodecs-export.js'), T = WebCodecsExport._test;
let n = 0; const jobs = [];
const ok = (name, fn) => { jobs.push(Promise.resolve(fn()).then(() => { n++; console.log('  ok  ' + name); })); };

ok('bitrate: a movie gets far more than the old presets gave (about 1.5 Mbit/s at 720p), more on "sharper", and never silly amounts', () => {
  const f720 = T.pickBitrate(1280, 720, 'faster', 300, 30), s720 = T.pickBitrate(1280, 720, 'sharper', 300, 30);
  assert(f720 >= 3000000 && f720 <= 4000000, 'faster 720p: ' + f720); assert(s720 > f720 * 1.5, 'sharper 720p: ' + s720);
  const f1080 = T.pickBitrate(1920, 1080, 'faster', 300, 30), s1080 = T.pickBitrate(1920, 1080, 'sharper', 300, 30);
  assert(f1080 >= 7000000 && f1080 <= 8000000, 'faster 1080p: ' + f1080); assert(s1080 > f1080 && s1080 <= 16000000, 'sharper 1080p: ' + s1080);
  assert.strictEqual(T.pickBitrate(1280, 720, undefined, 300, 30), f720, 'no choice means "faster"'); assert(T.pickBitrate(1920, 1080, 'sharper', 60, 60) === 16000000, 'the top is capped');
  assert(T.pickBitrate(1080, 1920, 'faster', 300, 30) === f1080, 'a tall frame has the same number of pixels');
});
ok('bitrate: a very long video gets a lower rate, so the file built in memory stays small', () => {
  const long = T.pickBitrate(1920, 1080, 'sharper', 3600, 30), bytes = (long + 192000) * 3600 / 8;
  assert(long < 1500000 + 1 && long >= 1200000, 'an hour: ' + long); const mid = T.pickBitrate(1920, 1080, 'faster', 1200, 30);
  assert((mid + 192000) * 1200 / 8 <= 450e6 + 1e6, 'twenty minutes stays under about 450 MB: ' + mid); assert(bytes > 0);
  assert.strictEqual(T.pickBitrate(1920, 1080, 'faster', 100000, 30), 1200000, 'a huge video never goes below the floor');
});
ok('size: the movie\'s own size up to 1080 (width for a tall frame), so a 1080p movie is no longer made 720p', () => {
  assert.strictEqual(T.ownTier('original', 1920, 1080), 1080); assert.strictEqual(T.ownTier('original', 1280, 720), 720); assert.strictEqual(T.ownTier('original', 3840, 2160), 1080);
  assert.strictEqual(T.ownTier('9:16', 1920, 1080), 1080, 'tall frame: the width'); assert.strictEqual(T.ownTier('9:16', 1280, 720), 1080, 'a 1280-wide movie fills a 1080-wide tall frame'); assert.strictEqual(T.ownTier('9:16', 640, 360), 640, 'a small movie is not blown up'); assert.strictEqual(T.ownTier('16:9', 1920, 1080), 1080);
  assert.deepStrictEqual(T.targetSize(1080, true, 1920, 1080), { width: 1080, height: 1920 }); assert.deepStrictEqual(T.targetSize(1080, false, 1920, 1080), { width: 1920, height: 1080 });
});
ok('frame rate: a 24 or 25 fps movie keeps its rate; anything else (and anything that cannot be measured) is 30', async () => {
  const mk = (r) => ({ computePacketStats: async () => ({ averagePacketRate: r }) });
  assert.strictEqual(await T.pickFps(mk(23.976)), 24); assert.strictEqual(await T.pickFps(mk(24)), 24); assert.strictEqual(await T.pickFps(mk(25)), 25);
  assert.strictEqual(await T.pickFps(mk(29.97)), 30); assert.strictEqual(await T.pickFps(mk(30)), 30); assert.strictEqual(await T.pickFps(mk(60)), 30);
  assert.strictEqual(await T.pickFps({}), 30); assert.strictEqual(await T.pickFps(null), 30); assert.strictEqual(await T.pickFps({ computePacketStats: async () => { throw new Error('x'); } }), 30);
});
ok('the encoder is asked for a real bitrate and the quality mode, not the old preset and the "realtime" mode', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'www', 'webcodecs-export.js'), 'utf8');
  assert(!/latencyMode:\s*'realtime'/.test(src), 'no realtime mode'); assert(!/QUALITY_MEDIUM/.test(src), 'no medium preset for the video');
  assert(/latencyMode:\s*'quality'/.test(src) && /bitrate:\s*bitrate/.test(src), 'a real bitrate and the quality mode'); assert(/imageSmoothingQuality = 'high'/.test(src), 'good scaling');
});
Promise.all(jobs).then(() => console.log('\n' + n + ' checks passed'));
