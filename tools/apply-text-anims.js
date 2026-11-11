'use strict';
// One-time patch: more text animations, added beside the ones you have (nothing existing is changed or renamed).
//   In (16 new):   Zoom in, Grow, Drop in, Rise up, Swing, Tilt, Whip left, Whip right, Elastic, Rubber, Spin + zoom, Spin right, Neon flicker, Glitch, Shake, Reveal
//   Out (11 new):  Zoom away, Collapse, Fall, Fly up, Whip left, Whip right, Spin away, Tilt away, Neon off, Glitch, Shake
//   Loop (10 new): Heartbeat, Hop, Swing, Shake, Breathe, Neon flicker, Drift, Spin slow, Blink, Glitch bursts
// They are made only from what the preview and BOTH exports already understand (fade, shift, size, turn, typed letters), so they show in the preview,
// the fast export and the ffmpeg export without touching those. Edits www/motion.js and adds tests/textanim-more.test.js.
// Run from the project folder:   node tools/apply-text-anims.js     then   npm test
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const f = path.join(root, 'www', 'motion.js'), raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
if (s.includes("key: 'whipleft', label: 'Whip left'")){ console.log('Already applied. Nothing to do.'); process.exit(0); }
const bad = [];
function rep(a, b, label){ const n = s.split(a).length - 1; if (n !== 1){ bad.push(label + ': found ' + n + ' times (need exactly 1)'); return; } s = s.replace(a, () => b); }

rep("{ key: 'typewriter', label: 'Typewriter' }];",
  "{ key: 'typewriter', label: 'Typewriter' },\n    { key: 'zoomin', label: 'Zoom in' }, { key: 'grow', label: 'Grow' }, { key: 'drop', label: 'Drop in' }, { key: 'riseup', label: 'Rise up' }, { key: 'swing', label: 'Swing' },\n    { key: 'tilt', label: 'Tilt' }, { key: 'whipleft', label: 'Whip left' }, { key: 'whipright', label: 'Whip right' }, { key: 'elastic', label: 'Elastic' }, { key: 'rubber', label: 'Rubber' },\n    { key: 'spinzoom', label: 'Spin + zoom' }, { key: 'spinright', label: 'Spin right' }, { key: 'flicker', label: 'Neon flicker' }, { key: 'glitch', label: 'Glitch' },\n    { key: 'shake', label: 'Shake' }, { key: 'reveal', label: 'Reveal' }];", 'list: in');
rep("{ key: 'typewriter', label: 'Erase' }];",
  "{ key: 'typewriter', label: 'Erase' },\n    { key: 'zoomout', label: 'Zoom away' }, { key: 'collapse', label: 'Collapse' }, { key: 'drop', label: 'Fall' }, { key: 'flyup', label: 'Fly up' }, { key: 'whipleft', label: 'Whip left' },\n    { key: 'whipright', label: 'Whip right' }, { key: 'spinout', label: 'Spin away' }, { key: 'tiltout', label: 'Tilt away' }, { key: 'flicker', label: 'Neon off' },\n    { key: 'glitch', label: 'Glitch' }, { key: 'shake', label: 'Shake' }];", 'list: out');
rep("{ key: 'wiggle', label: 'Wiggle' }];",
  "{ key: 'wiggle', label: 'Wiggle' },\n    { key: 'heartbeat', label: 'Heartbeat' }, { key: 'hop', label: 'Hop' }, { key: 'swing', label: 'Swing' }, { key: 'shake', label: 'Shake' }, { key: 'breathe', label: 'Breathe' },\n    { key: 'neon', label: 'Neon flicker' }, { key: 'drift', label: 'Drift' }, { key: 'turn', label: 'Spin slow' }, { key: 'blink', label: 'Blink' }, { key: 'glitchloop', label: 'Glitch bursts' }];", 'list: loop');

rep("  // How long the in / out part lasts for a title that shows for durMs",
`  // helpers for the extra animations: a bouncy settle, a repeatable "random" number (the same every time, so preview and export agree), a short bump
  function elasticOut(p) { return p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (Math.PI * 2 / 3)) + 1; }
  function jit(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function bump(x, c, w) { var d = (x - c) / w; return Math.exp(-d * d); }
  // How long the in / out part lasts for a title that shows for durMs`, 'helpers');

rep("    else if (kind === 'typewriter') st.chars = p;",
`    else if (kind === 'typewriter') st.chars = p;
    else if (kind === 'zoomin') { st.scale = 1 + (1 - e) * 2.2; st.alpha = Math.min(1, p * 3); }
    else if (kind === 'grow') { st.scale = Math.max(0.01, e); st.alpha = Math.min(1, p * 3); }
    else if (kind === 'drop') { st.dy = -(1 - bounceOut(p)) * 0.4; st.alpha = Math.min(1, p * 6); }
    else if (kind === 'riseup') { st.dy = (1 - easeOutBack(p)) * 0.3; st.alpha = Math.min(1, p * 4); }
    else if (kind === 'swing') { st.rot = -(1 - elasticOut(p)) * 30; st.alpha = Math.min(1, p * 4); }
    else if (kind === 'tilt') { st.rot = (1 - e) * 14; st.dy = (1 - e) * 0.06; st.alpha = p; }
    else if (kind === 'whipleft') { st.dx = -(1 - easeOutBack(p)) * 0.6; st.alpha = Math.min(1, p * 5); }
    else if (kind === 'whipright') { st.dx = (1 - easeOutBack(p)) * 0.6; st.alpha = Math.min(1, p * 5); }
    else if (kind === 'elastic') { st.scale = Math.max(0.01, elasticOut(p)); st.alpha = Math.min(1, p * 5); }
    else if (kind === 'rubber') { st.scale = 1 + 0.5 * (1 - p) * Math.sin(p * 14); st.alpha = Math.min(1, p * 8); }
    else if (kind === 'spinzoom') { st.rot = (1 - e) * 360; st.scale = Math.max(0.01, e); st.alpha = Math.min(1, p * 3); }
    else if (kind === 'spinright') { st.rot = (1 - e) * 180; st.alpha = Math.min(1, p * 3); }
    else if (kind === 'flicker') { st.alpha = p < 0.15 ? 0 : p > 0.8 ? 1 : (Math.sin(p * 47) + Math.sin(p * 29) > 0.4 ? 1 : 0.08); }
    else if (kind === 'glitch') { var gj = jit(Math.floor(p * 14)); st.dx = p > 0.9 ? 0 : (gj - 0.5) * 0.08 * (1 - p); st.alpha = p > 0.9 ? 1 : (gj > 0.25 ? 1 : 0.3); }
    else if (kind === 'shake') { st.dx = Math.sin(p * 40) * 0.04 * (1 - p); st.alpha = Math.min(1, p * 6); }
    else if (kind === 'reveal') { st.chars = e; st.alpha = Math.min(1, p * 4); }`, 'applyIn');

rep("    else if (kind === 'typewriter') st.chars = 1 - q;",
`    else if (kind === 'typewriter') st.chars = 1 - q;
    else if (kind === 'zoomout') { st.scale *= 1 + e * 2.2; st.alpha *= 1 - q; }
    else if (kind === 'collapse') { st.scale *= Math.max(0.01, 1 - e); st.alpha *= 1 - q * 0.5; }
    else if (kind === 'drop') { st.dy += e * 0.4; st.alpha *= 1 - q; }
    else if (kind === 'flyup') { st.dy += -e * 0.35; st.alpha *= 1 - q; }
    else if (kind === 'whipleft') { st.dx += -e * 0.6; st.alpha *= 1 - e; }
    else if (kind === 'whipright') { st.dx += e * 0.6; st.alpha *= 1 - e; }
    else if (kind === 'spinout') { st.rot += e * 180; st.scale *= Math.max(0.01, 1 - e); }
    else if (kind === 'tiltout') { st.rot += e * 25; st.dy += e * 0.1; st.alpha *= 1 - q; }
    else if (kind === 'flicker') { st.alpha *= q > 0.85 ? 0 : q < 0.2 ? 1 : (Math.sin(q * 55) + Math.sin(q * 31) > 0.2 ? 1 : 0.08); }
    else if (kind === 'glitch') { var oj = jit(Math.floor(q * 14) + 40); if (q > 0.9) st.alpha = 0; else if (q > 0.15) { st.dx += (oj - 0.5) * 0.08 * q; st.alpha *= oj > 0.25 ? 1 : 0.3; } }
    else if (kind === 'shake') { st.dx += Math.sin(q * 40) * 0.04 * q; st.alpha *= 1 - e; }`, 'applyOut');

rep("    else if (kind === 'wiggle') st.rot += 3 * Math.sin(T * rel / 500);",
`    else if (kind === 'wiggle') st.rot += 3 * Math.sin(T * rel / 500);
    else if (kind === 'heartbeat') { var hb = rel % 1100; st.scale *= 1 + 0.1 * (bump(hb, 120, 90) + 0.7 * bump(hb, 340, 90)); }
    else if (kind === 'hop') st.dy -= 0.03 * Math.abs(Math.sin(Math.PI * rel / 700));
    else if (kind === 'swing') st.rot += 8 * Math.sin(T * rel / 1600);
    else if (kind === 'shake') st.dx += 0.006 * Math.sin(T * rel / 220);
    else if (kind === 'breathe') { st.scale *= 1 + 0.04 * Math.sin(T * rel / 2600); st.alpha *= 0.9 + 0.1 * Math.sin(T * rel / 2600 + 1); }
    else if (kind === 'neon') { if (Math.sin(rel / 37) + Math.sin(rel / 91) > 1.6) st.alpha *= 0.35; }
    else if (kind === 'drift') { st.dx += 0.015 * Math.sin(T * rel / 3200); st.dy += 0.01 * Math.sin(T * rel / 2300 + 1); }
    else if (kind === 'turn') st.rot += 360 * ((rel % 6000) / 6000);
    else if (kind === 'blink') { if (rel % 1000 >= 650) st.alpha *= 0.15; }
    else if (kind === 'glitchloop') { if (rel % 2000 < 160) { var lj = Math.floor(rel / 40); st.dx += (jit(lj) - 0.5) * 0.05; if (jit(lj + 9) < 0.3) st.alpha *= 0.35; } }`, 'applyLoop');

if (bad.length){ console.log('NOTHING WAS CHANGED. These spots did not match your motion.js:\n  - ' + bad.join('\n  - ') + '\n\nSend me that list and I will adjust.'); process.exit(1); }
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s);

const TEST = `'use strict';
// node tests/textanim-more.test.js
// The extra text animations: every one gives sane numbers all the way through, starts / ends where the text normally sits, and the old ones are untouched.
const assert = require('assert'), M = require('../www/motion.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const OLD_IN = ['none', 'fade', 'slideup', 'slidedown', 'slideleft', 'slideright', 'pop', 'bounce', 'spin', 'typewriter'], OLD_OUT = ['none', 'fade', 'slideup', 'slidedown', 'slideleft', 'slideright', 'pop', 'typewriter'], OLD_LOOP = ['none', 'pulse', 'float', 'wiggle'];
const keys = l => l.map(x => x.key);
ok('the old animations are still first and in the same order; the new ones are added, with unique names in each list', () => {
  assert.deepStrictEqual(keys(M.TEXT_IN).slice(0, OLD_IN.length), OLD_IN); assert.deepStrictEqual(keys(M.TEXT_OUT).slice(0, OLD_OUT.length), OLD_OUT); assert.deepStrictEqual(keys(M.TEXT_LOOP).slice(0, OLD_LOOP.length), OLD_LOOP);
  [M.TEXT_IN, M.TEXT_OUT, M.TEXT_LOOP].forEach(l => { assert.strictEqual(new Set(keys(l)).size, l.length); assert.strictEqual(new Set(l.map(x => x.label)).size, l.length); });
  assert(M.TEXT_IN.length >= 26 && M.TEXT_OUT.length >= 19 && M.TEXT_LOOP.length >= 14);
});
const sane = (st, what) => { ['alpha', 'dx', 'dy', 'scale', 'rot', 'chars'].forEach(k => assert(Number.isFinite(st[k]), what + ' ' + k)); assert(st.alpha >= 0 && st.alpha <= 1 && st.chars >= 0 && st.chars <= 1 && st.scale > 0, what + ' ' + JSON.stringify(st)); };
const near = (st, what) => { const r = ((st.rot % 360) + 540) % 360 - 180; assert(Math.abs(st.alpha - 1) < 0.02 && Math.abs(st.dx) < 0.02 && Math.abs(st.dy) < 0.02 && Math.abs(st.scale - 1) < 0.06 && Math.abs(r) < 3 && st.chars > 0.97, what + ' should rest at the normal look: ' + JSON.stringify(st)); };
ok('every "in" animation moves smoothly and ends at the normal look; every "out" starts there', () => {
  keys(M.TEXT_IN).filter(k => k !== 'none').forEach(k => { const an = { in: k, inMs: 600 }, d = 3000; for (let t = 0; t <= 600; t += 20) sane(M.textState(an, t, d), 'in ' + k + ' @' + t); near(M.textState(an, 599, d), 'in ' + k + ' end'); near(M.textState(an, 1500, d), 'in ' + k + ' after'); });
  keys(M.TEXT_OUT).filter(k => k !== 'none').forEach(k => { const an = { out: k, outMs: 600 }, d = 3000; near(M.textState(an, 1500, d), 'out ' + k + ' before'); near(M.textState(an, d - 600 + 1, d), 'out ' + k + ' start'); for (let t = d - 600; t <= d; t += 20) sane(M.textState(an, t, d), 'out ' + k + ' @' + t); });
});
ok('every loop stays sane for a long time and never hides the text for good', () => {
  keys(M.TEXT_LOOP).filter(k => k !== 'none').forEach(k => { let seen = 0; for (let t = 0; t < 12000; t += 17) { const st = M.textState({ loop: k }, t, 20000); sane(st, 'loop ' + k + ' @' + t); if (st.alpha > 0.9) seen++; } assert(seen > 100, k + ' is nearly always hidden'); });
});
ok('the ffmpeg engine can make pictures for each one: a short list of stills that cover the text, none of them empty', () => {
  keys(M.TEXT_IN).filter(k => k !== 'none').forEach(k => { const tl = M.textTimeline({ in: k, out: 'fade' }, 3000, 12); assert(tl && tl.length > 0 && tl.length <= 2 * M.MAX_STATES, 'in ' + k + ' ' + (tl && tl.length)); tl.forEach(s => assert(s.b > s.a && s.st.alpha > 0)); });
  keys(M.TEXT_OUT).filter(k => k !== 'none').forEach(k => { const tl = M.textTimeline({ out: k }, 3000, 12); assert(tl && tl.length > 0 && tl.length <= 2 * M.MAX_STATES, 'out ' + k); });
  keys(M.TEXT_LOOP).filter(k => k !== 'none').forEach(k => { const tl = M.textTimeline({ loop: k }, 4000, 12); assert(tl && tl.length > 0 && tl.length <= 2 * M.MAX_STATES, 'loop ' + k); });
});
console.log('\\n' + n + ' checks passed');
`;
fs.mkdirSync(path.join(root, 'tests'), { recursive: true }); fs.writeFileSync(path.join(root, 'tests', 'textanim-more.test.js'), TEST);
console.log('Done. Added 16 in, 11 out and 10 loop text animations to www/motion.js and tests/textanim-more.test.js.\nNow run:  node tests/textanim-more.test.js   and then   npm test');