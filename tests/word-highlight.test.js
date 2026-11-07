'use strict';
// node tests/word-highlight.test.js
// Word highlight: each word gets its time, the switch reaches every caption, the plan, the drawing and the three places that show a title.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('../www/project.js'), NP = require('../www/plan.js'), LK = require('../www/look.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 } },
  tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [
    { id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
const withCaps = () => P.addCaptions(base, [{ startMs: 0, endMs: 4000, text: 'Hello big world, again.' }, { startMs: 4000, endMs: 8000, text: 'Second line' }], {});

ok('word times: one pair per word, in order, no gaps, ending exactly at the end of the caption, longer words get longer', () => {
  const t = P.wordTimes({ text: 'a  bb\nccccccc dd', dur: 3000 }, 3000);
  assert.strictEqual(t.length, 4); assert.strictEqual(t[0][0], 0); assert.strictEqual(t[3][1], 3000);
  for (let i = 1; i < t.length; i++) assert.strictEqual(t[i][0], t[i - 1][1]);
  assert(t[2][1] - t[2][0] > t[0][1] - t[0][0], 'the long word gets more time');
  const p2 = P.wordTimes({ text: 'one, two three' }, 3000); assert(p2[0][1] - p2[0][0] > p2[2][1] - p2[2][0] - 1, 'a comma adds a short pause');
  assert.deepStrictEqual(P.wordTimes({ text: '   ' }, 1000), []); assert.deepStrictEqual(P.wordTimes({ text: 'x' }, 0), []);
  assert.deepStrictEqual(P.wordTimes({ text: 'a b', words: [[0, 100], [100, 900]] }, 1000), [[0, 100], [100, 900]], 'exact times are used when a caption carries them');
});
ok('which word is on', () => {
  const t = [[0, 100], [100, 300], [300, 400]];
  assert.strictEqual(P.wordIndexAt(t, 0), 0); assert.strictEqual(P.wordIndexAt(t, 99), 0); assert.strictEqual(P.wordIndexAt(t, 100), 1); assert.strictEqual(P.wordIndexAt(t, 399), 2); assert.strictEqual(P.wordIndexAt(t, 9999), 2);
});
ok('the switch puts the colour on every caption, takes it away, refuses nonsense and does nothing without captions', () => {
  const p = withCaps(), on = P.setCaptionHighlight(p, '#ffd400'), cl = P.captionTrackOf(on).clips;
  assert(cl.length === 2 && cl.every(c => c.hl === '#ffd400')); assert.strictEqual(P.validate(on).length, 0);
  assert.strictEqual(P.setCaptionHighlight(on, '#ffd400'), on, 'already on'); assert.strictEqual(P.setCaptionHighlight(p, 'yellow'), p); assert.strictEqual(P.setCaptionHighlight(base, '#ffd400'), base);
  const off = P.setCaptionHighlight(on, null); assert(P.captionTrackOf(off).clips.every(c => c.hl === undefined));
});
ok('captions made again (for example by Auto captions) keep the highlight', () => {
  const on = P.setCaptionHighlight(withCaps(), '#2bd96b'), again = P.addCaptions(on, [{ startMs: 0, endMs: 3000, text: 'New words here' }], { replace: true });
  assert.strictEqual(P.captionTrackOf(again).clips[0].hl, '#2bd96b');
});
ok('the export plan carries the colour and the word times, with the text tidied to single spaces; plain captions are unchanged', () => {
  const plain = NP.projectToPlan(withCaps()); assert(plain.texts.every(t => !t.hl));
  const on = P.setCaptionHighlight(withCaps(), '#ffd400'), tx = NP.projectToPlan(on).texts[0];
  assert.strictEqual(tx.hl.color, '#ffd400'); assert.strictEqual(tx.hl.t.length, 4); assert.strictEqual(tx.hl.t[3][1], tx.durMs); assert.strictEqual(tx.text, 'Hello big world, again.');
});
ok('drawing: only the chosen word is in the highlight colour, all words are drawn, and a title with no highlight is drawn as before', () => {
  function ctx() {
    const calls = []; const g = { fillStyle: '#fff', textAlign: 'center', measureText: s => ({ width: String(s).length * 10 }), fillRect() {}, strokeText() {},
      fillText(s, x, y) { calls.push({ s, x, fill: g.fillStyle, align: g.textAlign }); } }; return { g, calls };
  }
  const a = ctx(), t = { text: 'one two three four', size: 7, color: '#ffffff', pos: 'bottom' };
  LK.drawTitle(a.g, Object.assign({ hlWord: 2, hlColor: '#ffd400' }, t), 1000, 600);
  assert.deepStrictEqual(a.calls.map(c => c.s), ['one', 'two', 'three', 'four']); assert.deepStrictEqual(a.calls.map(c => c.fill), ['#ffffff', '#ffffff', '#ffd400', '#ffffff']);
  assert(a.calls.every(c => c.align === 'left') && a.g.textAlign === 'center'); assert(a.calls[1].x > a.calls[0].x, 'words go left to right');
  const b = ctx(); LK.drawTitle(b.g, t, 1000, 600); assert.deepStrictEqual(b.calls.map(c => c.s), ['one two three four']);
  const w = ctx(); LK.drawTitle(w.g, Object.assign({ hlWord: 3, hlColor: '#f00', text: 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm nnnn oooo pppp qqqq rrrr ssss tttt uuuu vvvv wwww xxxx' }, { size: 7 }), 1000, 600);
  assert.strictEqual(w.calls.length, 24); assert.strictEqual(w.calls.filter(c => c.fill === '#f00').length, 1, 'wrapped lines count the words in one run');
});
ok('the editor, the fast engine and the ffmpeg engine all handle it, and the edited files still parse', () => {
  const ed = read('editor.js'), wc = read('webcodecs-export.js'), ee = read('export-engine.js');
  ['wordhl:', "id: 'edCapHl'", 'function hlPreview', 'P.setCaptionHighlight'].forEach(s => assert(ed.includes(s), s));
  ['function drawHlTitle', 'hl: true'].forEach(s => assert(wc.includes(s), s)); assert(ee.includes('hlWord: k'));
  ['editor.js', 'webcodecs-export.js', 'export-engine.js', 'look.js', 'plan.js', 'project.js'].forEach(f => new vm.Script(read(f)));
});
console.log('\n' + n + ' checks passed');
