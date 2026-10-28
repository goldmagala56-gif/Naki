'use strict';
// node tests/subtitles.test.js
// Reading and writing subtitle files (SRT, VTT), tidying cues, wrapping long lines.
const assert = require('assert');
const S = require('../www/subtitles.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

ok('times: SRT and VTT forms are read, bad ones are refused, and writing gives the same back', () => {
  assert.strictEqual(S.parseTime('00:01:02,500'), 62500); assert.strictEqual(S.parseTime('01:02.500'), 62500); assert.strictEqual(S.parseTime('1:02:03.5'), 3723500);
  assert.strictEqual(S.parseTime('00:00:01,5'), 1500, 'a short fraction is a fraction, not milliseconds'); assert.strictEqual(S.parseTime('00:00:00'), 0);
  assert.strictEqual(S.parseTime('00:61:00,000'), null); assert.strictEqual(S.parseTime('hello'), null); assert.strictEqual(S.parseTime(''), null);
  assert.strictEqual(S.fmtTime(62500, ','), '00:01:02,500'); assert.strictEqual(S.fmtTime(3723005, '.'), '01:02:03.005'); assert.strictEqual(S.fmtTime(-5, ','), '00:00:00,000');
  [0, 1, 999, 1000, 59999, 3600000, 36000000 + 123].forEach(ms => assert.strictEqual(S.parseTime(S.fmtTime(ms, ',')), ms));
});
ok('SRT: numbers, times and text are read; a byte-order mark and Windows line ends do not matter', () => {
  const src = '\uFEFF1\r\n00:00:01,000 --> 00:00:03,500\r\nHello there\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nSecond line one\r\nSecond line two\r\n';
  const r = S.parse(src); assert.strictEqual(r.format, 'srt'); assert.deepStrictEqual(r.warnings, []);
  assert.deepStrictEqual(r.cues, [{ startMs: 1000, endMs: 3500, text: 'Hello there' }, { startMs: 4000, endMs: 6000, text: 'Second line one\nSecond line two' }]);
});
ok('VTT: the header, notes, styles, cue names and settings after the time are ignored', () => {
  const src = 'WEBVTT\n\nNOTE this is a comment\n--> not a cue\n\nSTYLE\n::cue { color: red }\n\nintro\n00:01.000 --> 00:02.500 align:start position:10%\nFirst\n\n00:00:03.000 --> 00:00:04.000\n<v Anna>Second</v>\n';
  const r = S.parse(src); assert.strictEqual(r.format, 'vtt');
  assert.deepStrictEqual(r.cues, [{ startMs: 1000, endMs: 2500, text: 'First' }, { startMs: 3000, endMs: 4000, text: 'Second' }]);
});
ok('markup: tags, style codes and character codes are cleaned; empty cues are dropped', () => {
  const r = S.parse('1\n00:00:01,000 --> 00:00:02,000\n<i>Tom</i> &amp; <b>Jerry</b> {\\an8}\n\n2\n00:00:03,000 --> 00:00:04,000\n<i></i>\n\n3\n00:00:05,000 --> 00:00:06,000\n5 &lt; 6 &#39;ok&#39; &nbsp;fine\n');
  assert.deepStrictEqual(r.cues.map(c => c.text), ['Tom & Jerry', "5 < 6 'ok' fine"]);
});
ok('problems are reported and skipped, never thrown: unreadable times, not a subtitle file, empty input', () => {
  const r = S.parse('1\n00:00:01,000 --> soon\nNope\n\n2\n00:00:02,000 --> 00:00:03,000\nYes\n'); assert.strictEqual(r.cues.length, 1); assert.strictEqual(r.warnings.length, 1); assert(/could not be read/.test(r.warnings[0]));
  const bad = S.parse('just some text'); assert.deepStrictEqual(bad.cues, []); assert.strictEqual(bad.format, 'unknown'); assert.strictEqual(bad.warnings.length, 1);
  assert.deepStrictEqual(S.parse('').cues, []); assert.deepStrictEqual(S.parse('').warnings, []); assert.deepStrictEqual(S.parse(null).cues, []);
});
ok('tidying: sorted, a too-short cue is made 200 ms, clamped to the video, overlaps shortened only when asked', () => {
  const c = [{ startMs: 5000, endMs: 5010, text: 'b' }, { startMs: 1000, endMs: 4000, text: 'a' }, { startMs: 9000, endMs: 12000, text: 'c' }, { startMs: 20000, endMs: 21000, text: 'late' }, { startMs: 100, endMs: 200, text: '  ' }];
  assert.deepStrictEqual(S.normalize(c, { durationMs: 10000 }), [{ startMs: 1000, endMs: 4000, text: 'a' }, { startMs: 5000, endMs: 5200, text: 'b' }, { startMs: 9000, endMs: 10000, text: 'c' }]);
  const o = [{ startMs: 0, endMs: 3000, text: 'x' }, { startMs: 2000, endMs: 4000, text: 'y' }];
  assert.strictEqual(S.normalize(o, {})[0].endMs, 3000, 'left alone'); assert.strictEqual(S.normalize(o, { noOverlap: true })[0].endMs, 2000, 'shortened to where the next starts');
  assert.deepStrictEqual(S.normalize(null, {}), []);
});
ok('writing: SRT is numbered with commas, VTT has the header and dots, and a file written is read back the same', () => {
  const cues = [{ startMs: 1000, endMs: 3500, text: 'Hello' }, { startMs: 4000, endMs: 6000, text: 'Two\nlines' }];
  assert.strictEqual(S.toSrt(cues), '1\n00:00:01,000 --> 00:00:03,500\nHello\n\n2\n00:00:04,000 --> 00:00:06,000\nTwo\nlines\n');
  assert.strictEqual(S.toVtt(cues), 'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHello\n\n00:00:04.000 --> 00:00:06.000\nTwo\nlines\n');
  assert.deepStrictEqual(S.parse(S.toSrt(cues)).cues, cues); assert.deepStrictEqual(S.parse(S.toVtt(cues)).cues, cues);
  assert.strictEqual(S.toVtt([]), 'WEBVTT\n\n'); assert.strictEqual(S.toSrt([]), '\n');
  assert.strictEqual(S.parse(S.toVtt([{ startMs: 0, endMs: 1000, text: 'a < b & c' }])).cues[0].text, 'a < b & c', 'VTT escapes and reads back');
  assert(!/-->.*-->/.test(S.toSrt([{ startMs: 0, endMs: 1000, text: 'a --> b' }]).split('\n')[2] || ''), 'a text can never look like a time line');
});
ok('letters outside English (Luganda, accents, emoji) survive writing and reading', () => {
  const cues = [{ startMs: 0, endMs: 2000, text: 'Oli otya? \u014B\u0263 \u00e9\u00e8 \ud83d\ude00' }];
  assert.deepStrictEqual(S.parse(S.toSrt(cues)).cues, cues); assert.deepStrictEqual(S.parse(S.toVtt(cues)).cues, cues);
});
ok('wrap: breaks at spaces, never inside a word, keeps at most the given number of lines, keeps existing breaks', () => {
  assert.strictEqual(S.wrap('one two three four', 9), 'one two\nthree four', 'the last line takes what does not fit');
  assert.strictEqual(S.wrap('short', 42), 'short'); assert.strictEqual(S.wrap('', 42), '');
  assert.strictEqual(S.wrap('Supercalifragilistic is long', 10), 'Supercalifragilistic\nis long'); assert.strictEqual(S.wrap('a\nb', 42), 'a\nb');
  assert.strictEqual(S.wrap('aaa bbb ccc ddd eee', 7, 3), 'aaa bbb\nccc ddd\neee');
});
ok('titles from an export plan become cues in time order, empty ones left out', () => {
  assert.deepStrictEqual(S.fromTexts([{ startMs: 5000, durMs: 1000, text: 'b' }, { startMs: 1000, durMs: 2000, text: 'a' }, { startMs: 0, durMs: 500, text: '' }]), [{ startMs: 1000, endMs: 3000, text: 'a' }, { startMs: 5000, endMs: 6000, text: 'b' }]);
  assert.deepStrictEqual(S.fromTexts(undefined), []);
});
console.log('\n' + n + ' checks passed');
