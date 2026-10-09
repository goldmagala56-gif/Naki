'use strict';
// node tests/format.test.js
// Format (video shape) and background: sizes, colours, the blur, the preview layout, the project setting and what the ffmpeg engine builds from it.
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const F = require('../www/format.js');
const P = require('../www/project.js');
const E = require('../www/export-engine.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

ok('shapes: the frame size for every ratio (tall shapes use the number as width, wide ones as height)', () => {
  const s = (r) => { const z = F.frameSize(720, r, 1920, 1080, 1); return z.width + 'x' + z.height; };
  assert.deepStrictEqual(['9:16', '16:9', '1:1', '4:5', '4:3', '3:4'].map(s), ['720x1280', '1280x720', '720x720', '720x900', '960x720', '720x960']);
  assert.strictEqual(F.frameSize(720, '9:16').height, Math.max(2, Math.round(720 * 16 / 9 / 2) * 2), 'same as the old vertical size');
  const o = F.frameSize(720, 'original', 1920, 1080, 1); assert.strictEqual(o.width + 'x' + o.height + o.contain, '1280x720false');
  assert.strictEqual(F.frameSize(480, 'original', 720, 576, 64 / 45).width, Math.max(2, Math.round((480 * (720 * (64 / 45) / 576)) / 2) * 2), 'pixel shape is still counted for the original shape');
  ['9:16', '4:5', '1:1', '16:9'].forEach(r => { const z = F.frameSize(481, r); assert(z.width % 2 === 0 || z.width === 481, r); });
});
ok('background settings are cleaned up and the colours come out right', () => {
  assert.deepStrictEqual(F.normalizeBg(null), { type: 'navy', color: '#000000' });
  assert.deepStrictEqual(F.normalizeBg({ type: 'rainbow', color: 'zzz' }), { type: 'navy', color: '#000000' });
  assert.deepStrictEqual(F.normalizeBg({ type: 'color', color: '#ABCDEF' }), { type: 'color', color: '#abcdef' });
  assert.strictEqual(F.fillColor({ type: 'blur', color: '#ff0000' }), F.NAVY, 'a blur has no flat colour');
  assert.strictEqual(F.fillColor({ type: 'color', color: '#ff0000' }), '#ff0000');
  assert.strictEqual(F.ffmpegHex('#abcdef'), '0xabcdef');
  assert.deepStrictEqual(F.yuv('#111b24'), [37, 133, 123], 'the old navy constants are kept');
  assert.deepStrictEqual(F.yuv('#000000'), [16, 128, 128]); assert.deepStrictEqual(F.yuv('#ffffff'), [235, 128, 128]);
});
ok('the picture is fitted inside the frame, and turned or zoomed inside that picture', () => {
  const a = F.containLayout(null, 720, 1280, 1920, 1080);
  assert.strictEqual(Math.round(a.box.w), 720); assert.strictEqual(Math.round(a.box.h), 405); assert.strictEqual(Math.round(a.box.y), 438);
  const r = F.containLayout({ rot: 90 }, 720, 1280, 1920, 1080);
  assert.strictEqual(Math.round(r.box.w), 720); assert.strictEqual(Math.round(r.box.h), 1280, 'turned on its side it fills the tall frame');
  assert.strictEqual(Math.round(r.dw), 1280); assert.strictEqual(Math.round(r.dh), 720, 'and is drawn unturned at the swapped size');
  const z = F.containLayout({ zoom: 2, x: 1, y: -1 }, 720, 1280, 1920, 1080);
  assert.strictEqual(Math.round(z.panX), -360 * 1 * 1 * 1, 'pan moves by half the extra size'); assert.strictEqual(Math.round(z.panY), Math.round(405 * 0.5));
  assert.strictEqual(F.containLayout({ flipH: true }, 100, 100, 50, 50).flip, true);
});
function mockCanvas(w, h) { const calls = []; const g = { calls, fillStyle: '', save() { calls.push('save'); }, restore() { calls.push('restore'); }, fillRect(...a) { calls.push(['fillRect', this.fillStyle, ...a]); }, drawImage(...a) { calls.push(['drawImage', ...a.slice(1)]); } }; return { width: w, height: h, getContext: () => g, g }; }
ok('background painter: flat colours, and a blur made from a tiny copy stretched up', () => {
  const mk = (w, h) => mockCanvas(w, h), img = {};
  let g = mockCanvas(720, 1280).g; F.makeBackgroundPainter(mk, 720, 1280, null)(g, img, 1920, 1080);
  assert.deepStrictEqual(g.calls[0], ['fillRect', '#111b24', 0, 0, 720, 1280], 'no setting = the old navy');
  g = mockCanvas(720, 1280).g; F.makeBackgroundPainter(mk, 720, 1280, { type: 'color', color: '#ff0000' })(g, img, 1920, 1080);
  assert.deepStrictEqual(g.calls[0], ['fillRect', '#ff0000', 0, 0, 720, 1280]);
  g = mockCanvas(720, 1280).g; F.makeBackgroundPainter(mk, 720, 1280, { type: 'blur' })(g, null, 0, 0);
  assert.strictEqual(g.calls[0][0], 'fillRect', 'a blur with no picture (a gap) is the navy');
  let made = 0; const mk2 = (w, h) => { made++; return mockCanvas(w, h); }; g = mockCanvas(720, 1280).g;
  const paint = F.makeBackgroundPainter(mk2, 720, 1280, { type: 'blur' }); paint(g, img, 1920, 1080); paint(g, img, 1920, 1080);
  assert.strictEqual(made, 1, 'the tiny canvas is made once, not for every frame');
  const big = g.calls.filter(c => c[0] === 'drawImage' && c[3] === 720 && c[4] === 1280); assert.strictEqual(big.length, 2, 'it is stretched over the whole frame');
});
ok('project: the format is a setting that survives edits, undo steps and the default is not stored', () => {
  const base = { naki: 'project', version: 1, fps: 30, durationMs: 4000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'v', type: 'video', asset: 'movie', start: 0, dur: 4000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
  assert.strictEqual(P.setFormat(base, {}), base); assert.strictEqual(P.setFormat(base, { ratio: 'original' }), base, 'nothing changes: the same project comes back');
  const a = P.setFormat(base, { ratio: '9:16' }); assert.deepStrictEqual(a.format, { ratio: '9:16', bg: { type: 'navy', color: '#000000' } }); assert.strictEqual(base.format, undefined);
  const b = P.setFormat(a, { bg: { type: 'color', color: '#FF0000' } }); assert.deepStrictEqual(b.format, { ratio: '9:16', bg: { type: 'color', color: '#ff0000' } });
  assert.strictEqual(P.setFormat(b, { ratio: 'bad' }), b, 'an unknown shape is ignored');
  assert.deepStrictEqual(P.setFormat(b, { ratio: '1:1' }).format.bg, b.format.bg, 'changing the shape keeps the background');
  assert.strictEqual(P.setFormat(P.setFormat(a, { ratio: 'original' }), {}).format, undefined, 'back to the original shape and dark: nothing stored');
  const s = P.splitAt(b, 1000); assert.deepStrictEqual(s.format, b.format, 'other edits keep the format');
});
// ---- what the ffmpeg engine builds ----
const info = { hasAudio: false, audioMono: false, width: 640, height: 360, sar: 1, durationSec: 20 };
const plan = (extra) => ({ naki: 'export-plan', version: 2, durationMs: 4000, movie: { durationMs: 20000 }, video: [
  { type: 'play', sessionStart: 0, sessionEnd: 2000, movieStart: 1000 }, { type: 'freeze', sessionStart: 2000, sessionEnd: 3000, movieAt: 4000 }, { type: 'black', sessionStart: 3000, sessionEnd: 4000 }].map(s => Object.assign(s, extra || {})), audio: [] });
const jobs = (o, extra) => E.planToJobs(plan(extra), info, Object.assign({ height: 360 }, o));
const argsOf = (r, label) => r.jobs.find(j => j.label.indexOf(label) === 0).args;
ok('ffmpeg engine: the old vertical setting and the 9:16 shape build exactly the same commands', () => {
  const a = jobs({ vertical: true }), b = jobs({ ratio: '9:16' });
  assert.deepStrictEqual(a.jobs.map(j => j.args), b.jobs.map(j => j.args)); assert.strictEqual(a.width + 'x' + a.height, '360x640');
});
ok('ffmpeg engine: other shapes get the right size, and a colour is used for the bars and for blank parts', () => {
  const sq = jobs({ ratio: '1:1', bg: { type: 'color', color: '#336699' } });
  assert.strictEqual(sq.width + 'x' + sq.height, '360x360');
  assert(argsOf(sq, 'picture').join(' ').includes('pad=360:360:(ow-iw)/2:(oh-ih)/2:color=0x336699'), 'bars use the chosen colour');
  assert(argsOf(sq, 'blank').join(' ').includes('color=c=0x336699:s=360x360'), 'blank parts too');
  const plain = jobs({ ratio: '4:5' }); assert(argsOf(plain, 'picture').join(' ').includes('color=0x111b24'), 'dark is still the navy');
  const op = jobs({ ratio: '1:1', bg: { type: 'color', color: '#ffffff' } }, { opacity: 0.5 });
  assert(argsOf(op, 'picture').join(' ').includes('+' + (235 * 0.5).toFixed(2)), 'opacity mixes the picture toward the background colour');
});
ok('ffmpeg engine: the blurred background builds one filter graph for the picture and the frozen frame', () => {
  const r = jobs({ ratio: '9:16', bg: { type: 'blur' } }), pic = argsOf(r, 'picture'), fz = argsOf(r, 'frozen frame');
  const g = pic[pic.indexOf('-filter_complex') + 1]; assert(/^\[0:v\]split\[bgi\]\[fgi\];/.test(g) && g.includes('boxblur') && g.includes('overlay=(W-w)/2:(H-h)/2[f0];[f0]setsar=1'), g);
  assert(fz.includes('-filter_complex') && fz.includes('-map'), 'the frozen frame is a graph too');
  assert(argsOf(r, 'blank').indexOf('-filter_complex') < 0, 'blank parts have no picture to blur');
  const t = jobs({ ratio: '9:16', bg: { type: 'blur' } }, { transform: { zoom: 2, x: 0, y: 0, rot: 90, flipH: true } }); const gt = argsOf(t, 'picture'); const tg = gt[gt.indexOf('-filter_complex') + 1];
  assert(tg.startsWith('[0:v]hflip,transpose=1,crop='), 'flip, turn and zoom come first: ' + tg);
});
// ---- real ffmpeg, only when this computer has a recent one ----
function ffmpegOk() { const r = cp.spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }); const m = r.status === 0 && /version\s+n?(\d+)/.exec(r.stdout); return !!m && +m[1] >= 5; }
if (ffmpegOk()) {
  ok('real ffmpeg: every shape and background really renders at the size it promises', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-fmt-')), sh = (a, o) => cp.spawnSync('ffmpeg', ['-y', '-v', 'error'].concat(a), Object.assign({ cwd: dir, encoding: 'utf8' }, o || {}));
    const mv = sh(['-f', 'lavfi', '-i', 'testsrc=s=640x360:r=30:d=6', '-pix_fmt', 'yuv420p', 'movie.in.mp4']); assert.strictEqual(mv.status, 0, mv.stderr);
    fs.renameSync(path.join(dir, 'movie.in.mp4'), path.join(dir, 'movie.in'));
    [['1:1', { type: 'navy' }], ['9:16', { type: 'color', color: '#ff0000' }], ['4:5', { type: 'blur' }], ['16:9', { type: 'blur' }]].forEach(([ratio, bg]) => {
      const r = jobs({ ratio, bg }), want = r.width + 'x' + r.height;
      r.jobs.forEach(j => { const a = j.args.map(x => x === 'movie.in' ? 'movie.in' : x); const o = sh(['-f', 'matroska'].slice(0, 0).concat(a)); assert.strictEqual(o.status, 0, ratio + ' ' + bg.type + ' ' + j.label + ': ' + o.stderr); });
      const ts = path.join(dir, 'v0000.ts'), pr = cp.spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', ts], { encoding: 'utf8' });
      assert.strictEqual(pr.stdout.trim().split(/\s+/)[0], want, ratio + ' ' + bg.type);
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });
} else console.log('  --  real-file check skipped (needs ffmpeg 5 or newer on this computer)');
console.log('\n' + n + ' checks passed');
