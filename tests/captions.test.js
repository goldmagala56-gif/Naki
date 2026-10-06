'use strict';
// Checks captions, .srt files, text styles, detach audio, and the shared title drawing.  Run with:  node tests/captions.test.js
const assert = require('assert');
const C = require('../www/core.js'), P = require('../www/project.js'), PL = require('../www/plan.js'), LK = require('../www/look.js'), E = require('../www/export-engine.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const events = [{ t: 0, type: 'rec_start', movieMs: 0 }, { t: 0, type: 'vol', value: 1 }, { t: 0, type: 'duck', enabled: true, thresholdDb: -40, duckedGain: 0.2 },
  { t: 4000, type: 'play', movieMs: 0 }, { t: 30000, type: 'pause', movieMs: 26000 }, { t: 40000, type: 'play', movieMs: 26000 }, { t: 60000, type: 'rec_stop' }];
const levels = []; for (let i = 0; i < 1201; i++) levels.push(C.dbToByte(-60));
const base = P.compileFromSession({ events, levels, durationMs: 60000, movieName: 'm.mp4', movieDurMs: 600000, voiceOffsetMs: 100, voiceNudgeMs: 0 });
const caps = (p) => P.captionList(p), texts = (p) => { const r = []; p.tracks.forEach(t => { if (t.kind === 'text') t.clips.forEach(c => r.push(c)); }); return r; };

ok('an .srt file is read: numbering, CRLF, a byte-order mark, dots instead of commas, tags, several lines, rubbish', () => {
  const srt = '\uFEFF1\r\n00:00:01,000 --> 00:00:03,500\r\nHello <i>there</i>\r\nsecond line\r\n\r\n2\r\n00:00:04.250 --> 00:00:06,000\r\n{\\an8}Top line\r\n\r\nnot a block at all\r\n\r\n00:01:02,5 --> 01:00:00,007\r\nNo number, short fraction\r\n\r\n3\r\n00:00:07,000 --> 00:00:08,000\r\n\r\n';
  assert.deepStrictEqual(P.parseSrt(srt), [
    { startMs: 1000, endMs: 3500, text: 'Hello there\nsecond line' }, { startMs: 4250, endMs: 6000, text: 'Top line' }, { startMs: 62500, endMs: 3600007, text: 'No number, short fraction' }]);
  assert.deepStrictEqual(P.parseSrt(''), []); assert.deepStrictEqual(P.parseSrt(null), []); assert.deepStrictEqual(P.parseSrt('hello world'), []);
});
ok('captions go on a track of their own, with the caption look, and never touch your titles', () => {
  const t = {}; let p = P.addTextClip(base, 5000, 3000, t); const before = JSON.stringify(texts(p));
  const out = {}; p = P.addCaptions(p, [{ startMs: 4000, endMs: 7000, text: 'One' }, { startMs: 8000, endMs: 9000, text: 'Two' }], {}, out);
  assert.deepStrictEqual([out.added, out.skipped], [2, 0]); assert.deepStrictEqual(P.validate(p), []);
  assert.strictEqual(p.tracks.filter(x => x.kind === 'text').length, 2, 'titles and captions are two tracks');
  const c = caps(p); assert.deepStrictEqual(c.map(x => [x.start, x.end, x.text]), [[4000, 7000, 'One'], [8000, 9000, 'Two']]);
  const clip = P.findClip(p, c[0].id).clip; assert.deepStrictEqual([clip.size, clip.pos, clip.bg, clip.caption], [5, 'bottom', true, true]);
  assert.strictEqual(JSON.stringify(P.findClip(p, t.id).clip), JSON.stringify(JSON.parse(before)[0]), 'the title is untouched');
  const t2 = {}; const more = P.addTextClip(p, 4000, 3000, t2); assert.strictEqual(P.findClip(more, t2.id).track.role, 'text', 'a new title still goes on the title track');
});
ok('captions that run together are shortened, and ones that do not fit are skipped and counted', () => {
  const out = {}, p = P.addCaptions(base, [{ startMs: 1000, endMs: 5000, text: 'long' }, { startMs: 3000, endMs: 4000, text: 'inside' }, { startMs: 59000, endMs: 70000, text: 'cut at the end' },
    { startMs: 80000, endMs: 90000, text: 'after the video' }, { startMs: 10000, endMs: 10100, text: 'too short' }, { startMs: 20000, endMs: 21000, text: '   ' }], {}, out);
  assert.deepStrictEqual(caps(p).map(x => [x.start, x.end]), [[1000, 3000], [3000, 4000], [59000, 60000]]); assert.strictEqual(out.added, 3); assert.strictEqual(out.skipped, 2);
  assert.deepStrictEqual(P.validate(p), []);
  const again = P.addCaptions(p, [{ startMs: 3500, endMs: 3900, text: 'lands on one' }], {}, out); assert.strictEqual(again, p, 'nothing added, nothing changed'); assert.strictEqual(out.skipped, 1);
  const swapped = P.addCaptions(p, [{ startMs: 500, endMs: 1500, text: 'new' }], { replace: true }, out); assert.deepStrictEqual(caps(swapped).map(x => x.text), ['new']);
  assert.strictEqual(P.addCaptions({ durationMs: 0, tracks: [], assets: {} }, [{ startMs: 0, endMs: 1000, text: 'x' }]).tracks.length, 0, 'an empty video takes no captions');
});
ok('an .srt file written from the captions reads back the same, and falls back to the titles', () => {
  const items = [{ startMs: 0, endMs: 1500, text: 'First' }, { startMs: 3661007, endMs: 3662000, text: 'Two\nlines' }];
  const p = P.addCaptions({ durationMs: 4000000, tracks: [], assets: {} , levels: []}, items);
  assert.strictEqual(P.toSrt(p), '1\n00:00:00,000 --> 00:00:01,500\nFirst\n\n2\n01:01:01,007 --> 01:01:02,000\nTwo\nlines\n');
  assert.deepStrictEqual(P.parseSrt(P.toSrt(p)), items);
  const t = {}, titled = P.setTextProps(P.addTextClip(base, 2000, 3000, t), t.id, { text: 'My title' }); assert.strictEqual(P.toSrt(titled), '1\n00:00:02,000 --> 00:00:05,000\nMy title\n');
  assert.strictEqual(P.toSrt(base), '');
});
ok('adding a caption line at the playhead moves past one that is there and stops where the next starts', () => {
  let p = P.addCaptions(base, [{ startMs: 1000, endMs: 3000, text: 'a' }, { startMs: 6000, endMs: 8000, text: 'b' }]); const out = {};
  const q = P.addCaptionLine(p, 2000, 2500, out), c = P.findClip(q, out.id).clip; assert.deepStrictEqual([c.start, c.dur, c.text], [3000, 2500, 'Caption']);
  const r = P.addCaptionLine(p, 5000, 2500, out); assert.strictEqual(P.findClip(r, out.id).clip.dur, 1000); assert.deepStrictEqual(P.validate(r), []);
  assert.strictEqual(P.addCaptionLine(P.addCaptions(base, [{ startMs: 1000, endMs: 3000, text: 'a' }, { startMs: 3100, endMs: 4000, text: 'b' }]), 3000, 2500, {}) !== null, true);
});
ok('captions follow your edits: a cut moves later captions earlier, a split keeps the words on both halves', () => {
  const p = P.addCaptions(base, [{ startMs: 10000, endMs: 14000, text: 'cut through me' }, { startMs: 20000, endMs: 22000, text: 'after the cut' }]);
  const cut = P.rippleDelete(p, 12000, 16000); assert.deepStrictEqual(caps(cut).map(x => [x.start, x.end, x.text]), [[10000, 12000, 'cut through me'], [16000, 18000, 'after the cut']]);
  const sp = P.splitAt(p, 12000); assert.deepStrictEqual(caps(sp).map(x => [x.start, x.end, x.text]), [[10000, 12000, 'cut through me'], [12000, 14000, 'cut through me'], [20000, 22000, 'after the cut']]);
  assert.strictEqual(P.toSrt(cut).split('\n\n').length, 2);
});
ok('a caption look can be given to every caption at once, and titles are left alone', () => {
  const t = {}; let p = P.addTextClip(P.addCaptions(base, [{ startMs: 1000, endMs: 2000, text: 'a' }, { startMs: 3000, endMs: 4000, text: 'b' }]), 10000, 3000, t);
  p = P.setCaptionStyle(p, { size: 8, pos: 'top', font: 'serif', outline: 0.5, shadow: 0, color: '#ffff00', bg: false });
  caps(p).forEach(x => { const c = P.findClip(p, x.id).clip; assert.deepStrictEqual([c.size, c.pos, c.font, c.outline, c.shadow, c.color, c.bg], [8, 'top', 'serif', 0.5, 0, '#ffff00', false]); });
  assert.strictEqual(P.findClip(p, t.id).clip.size, 7, 'the title keeps its own look'); assert.strictEqual(P.setCaptionStyle(base, { size: 8 }), base);
  const gone = P.removeCaptions(p); assert.strictEqual(caps(gone).length, 0); assert.strictEqual(texts(gone).length, 1);
});
ok('text styles are kept within range, and the old look is not stored', () => {
  const t = {}, p = P.addTextClip(base, 5000, 3000, t), set = (o) => P.findClip(P.setTextProps(p, t.id, o), t.id).clip;
  assert.deepStrictEqual([set({ outline: 5 }).outline, set({ outline: 0 }).outline, set({ shadow: 1 }).shadow, set({ shadow: 0 }).shadow, set({ shadow: 0.4 }).shadow], [1, undefined, undefined, 0, 0.4]);
  assert.deepStrictEqual([set({ font: 'serif' }).font, set({ font: 'sans' }).font, set({ font: 'comic-nonsense' }).font], ['serif', undefined, undefined]);
  const styled = P.setTextProps(P.setTextProps(p, t.id, { font: 'mono', outline: 0.3 }), t.id, { size: 99 }); const c = P.findClip(styled, t.id).clip; assert.deepStrictEqual([c.font, c.outline, c.size], ['mono', 0.3, 16], 'one setting does not undo another');
});
ok('the export plan carries captions and the new looks, and a plain title is exactly what it was', () => {
  const t = {}; let p = P.setTextProps(P.addTextClip(base, 9000, 2000, t), t.id, { text: 'Plain' });
  const plain = PL.projectToPlan(p).texts[0]; assert.deepStrictEqual(Object.keys(plain).sort(), ['bg', 'color', 'durMs', 'pos', 'size', 'startMs', 'text', 'weight']);
  p = P.addCaptions(p, [{ startMs: 1000, endMs: 2000, text: 'Cap' }]); p = P.setCaptionStyle(p, { font: 'bold', outline: 0.4, shadow: 0 });
  const plan = PL.projectToPlan(p); assert.deepStrictEqual(plan.texts.map(x => x.text), ['Cap', 'Plain'], 'in time order');
  assert.deepStrictEqual([plan.texts[0].font, plan.texts[0].outline, plan.texts[0].shadow, plan.texts[0].bg], ['bold', 0.4, 0, true]);
  assert.strictEqual('font' in plan.texts[1], false);
});
ok('detach audio: the sound and the picture can then be deleted and moved on their own', () => {
  const A = base.tracks[0].clips.find(c => c.start === 4000), snd = base.tracks[1].clips.find(c => c.start === 4000);
  const d = P.detachAudio(base, A.id); assert.strictEqual(P.findClip(d, A.id).clip.link, undefined); assert.strictEqual(P.findClip(d, snd.id).clip.link, undefined);
  assert.strictEqual(P.detachAudio(d, A.id), d, 'already detached'); assert.strictEqual(P.detachAudio(base, base.tracks[0].clips[0].id), base, 'a paused picture has no sound'); assert.strictEqual(P.detachAudio(base, 'nope'), base);
  const noPic = P.deleteClip(d, A.id); assert(P.findClip(noPic, snd.id), 'the sound is still there'); assert(!P.findClip(noPic, A.id));
  const noSnd = P.deleteClip(d, snd.id); assert(P.findClip(noSnd, A.id) && !P.findClip(noSnd, snd.id));
  const moved = P.moveClip(d, snd.id, 4500); assert.strictEqual(P.findClip(moved, snd.id).clip.start, 4500); assert.strictEqual(P.findClip(moved, A.id).clip.start, 4000);
  assert.strictEqual(P.moveClip(base, snd.id, 4500), base, 'before detaching, moving the sound drags the picture into its neighbour, so it is refused');
  const cut = P.splitAt(d, 10000); assert.strictEqual(cut.tracks[0].clips.length, base.tracks[0].clips.length + 1); assert.strictEqual(cut.tracks[1].clips.length, base.tracks[1].clips.length + 1, 'they still cut together');
  assert.deepStrictEqual(P.validate(d), []);
});
// ---- the title drawing ----
function recorder() {   // a fake canvas that writes down every call and every setting, in order
  const log = [], props = {}; const g = new Proxy({}, { set(_, k, v) { log.push(['set', k, v]); props[k] = v; return true; }, get(_, k) {
    if (k === 'log') return log; if (k === 'measureText') return (s) => ({ width: String(s).length * 10 }); if (k in props) return props[k]; return (...a) => { log.push([k].concat(a)); }; } }); return g;
}
function referenceDrawTitle(g, t, W, H) {   // the drawing as it was before outline, shadow and fonts were added
  const TITLE_POS = { top: 0.07, center: 0.40, bottom: 0.76 };
  var px = Math.max(10, Math.round((t.size || 7) / 100 * H));
  g.font = (t.weight || 700) + ' ' + px + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'top';
  var maxW = W * 0.88, lines = [];
  String(t.text || '').split('\n').forEach(function (par) { var line = ''; par.split(' ').forEach(function (w) { var test = line ? line + ' ' + w : w; if (line && g.measureText(test).width > maxW) { lines.push(line); line = w; } else line = test; }); lines.push(line); });
  var lh = Math.round(px * 1.2), y0 = Math.round((TITLE_POS[t.pos] != null ? TITLE_POS[t.pos] : TITLE_POS.bottom) * H);
  if (t.bg) { var widest = 0; lines.forEach(function (l) { widest = Math.max(widest, g.measureText(l).width); }); var bw = Math.min(W, widest + px * 0.8);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(Math.round(W / 2 - bw / 2), Math.round(y0 - px * 0.2), Math.round(bw), Math.round(lines.length * lh + px * 0.4)); }
  g.fillStyle = t.color || '#ffffff';
  g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = Math.max(2, px * 0.08); g.shadowOffsetY = Math.max(1, px * 0.04);
  lines.forEach(function (l, i) { g.fillText(l, W / 2, y0 + i * lh); });
  return lines;
}
ok('titles with no new styling are drawn EXACTLY as before (same calls, same settings, same order)', () => {
  let seed = 99; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff, pick = (a) => a[Math.floor(rnd() * a.length)];
  for (let i = 0; i < 400; i++) {
    const t = { text: pick(['Hi', 'one two three four five six seven eight nine ten eleven', 'a\nb c', '', 'Wörds wíth áccents and a very long unbroken-title-that-keeps-going']), size: pick([undefined, 3, 7, 12, 16]), color: pick([undefined, '#ff0000']),
      pos: pick([undefined, 'top', 'center', 'bottom', 'weird']), weight: pick([undefined, 400, 800]), bg: pick([true, false, undefined]) };
    const W = pick([320, 854, 1280]), H = pick([180, 480, 720]), a = recorder(), b = recorder();
    const la = referenceDrawTitle(a, t, W, H), lb = LK.drawTitle(b, t, W, H);
    assert.deepStrictEqual(lb, la); assert.deepStrictEqual(b.log, a.log, 'title ' + JSON.stringify(t));
  }
});
ok('the ffmpeg engine draws titles through the shared drawing, the same as the fast engine and the preview', () => {
  const t = { text: 'Hello world', size: 9, pos: 'center', color: '#fff', bg: true, font: 'serif', outline: 0.5 }, a = recorder(), b = recorder();
  E.drawTitle(a, t, 854, 480); LK.drawTitle(b, t, 854, 480); assert.deepStrictEqual(a.log, b.log);
  assert(a.log.some(c => c[0] === 'strokeText')); assert(!E.drawTitle(recorder(), { text: 'x' }, 100, 100).some(l => l.includes('<')));
});
ok('outline is drawn first and under the letters; shadow can be switched off; fonts change the font string', () => {
  const g = recorder(); LK.drawTitle(g, { text: 'Hi', size: 10, outline: 1, font: 'mono', shadow: 0 }, 400, 300);
  const kinds = g.log.filter(c => c[0] === 'strokeText' || c[0] === 'fillText').map(c => c[0]); assert.deepStrictEqual(kinds, ['strokeText', 'fillText']);
  const set = (k) => g.log.filter(c => c[0] === 'set' && c[1] === k).map(c => c[2]);
  assert.strictEqual(set('lineWidth')[0], 3.6, 'visible outline 1.8 px at 30 px letters: the stroke is twice that'); assert(/monospace/.test(set('font')[0])); assert.strictEqual(set('shadowBlur').every(v => v === 0), true);
  const s = LK.titleStyle({ text: 'x', size: 10, outline: 1, shadow: 0.5, font: 'serif' }, 300); assert.deepStrictEqual([s.px, s.stroke, /serif/.test(s.fontFamily)], [30, '3.6px #000', true]); assert.notStrictEqual(s.shadow, 'none');
  assert.strictEqual(LK.titleStyle({ shadow: 0 }, 300).shadow, 'none'); assert.strictEqual(LK.titleStyle({}, 300).stroke, '');
  assert.deepStrictEqual(LK.fontList().map(f => f.key), ['sans', 'serif', 'mono', 'bold', 'script']);
});
console.log('\n' + n + ' checks passed');