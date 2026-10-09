'use strict';
// Checks, through the editor's own code, that the Voice timing slider no longer throws edits away.
// Run with:  node tests/editor-nudge.test.js
const assert = require('assert');
const C = require('../www/core.js'), P = require('../www/project.js'), NakiEditor = require('../www/editor.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const events = [{ t: 0, type: 'rec_start', movieMs: 0 }, { t: 0, type: 'vol', value: 1 }, { t: 0, type: 'duck', enabled: true, thresholdDb: -40, duckedGain: 0.2 },
  { t: 4000, type: 'play', movieMs: 0 }, { t: 30000, type: 'pause', movieMs: 26000 }, { t: 40000, type: 'play', movieMs: 26000 }, { t: 60000, type: 'rec_stop' }];
const levels = []; for (let i = 0; i < 1201; i++) levels.push(C.dbToByte(-60));
const mkSess = (id, nudge) => ({ id, events, levels, durationMs: 60000, movieName: 'm.mp4', movieDurMs: 600000, voiceOffsetMs: 100, voiceNudgeMs: nudge || 0 });
const voiceOf = (plan) => plan.audio.filter(a => a.src === 'voice').sort((a, b) => a.startMs - b.startMs);
// the same sort of record the editor saves after an edit
const savedWith = (sess, nudge, edit) => {
  const proj = edit(P.compileFromSession(Object.assign({}, sess, { voiceNudgeMs: nudge, voiceDurMs: null })));
  return { sig: [sess.durationMs, sess.events.length, sess.voiceOffsetMs || 0].join('|'), nudge: nudge, project: proj };
};
const addTitle = (p) => P.setTextProps(P.addTextClip(p, 5000, 3000, (savedWith.o = {})), savedWith.o.id, { text: 'Kept' });

ok('an untouched recording follows the Voice timing slider', () => {
  const s = mkSess('a', 0);
  assert.strictEqual(voiceOf(NakiEditor.planFor(s, {}))[0].startMs, 100);
  s.voiceNudgeMs = 200; assert.strictEqual(voiceOf(NakiEditor.planFor(s, {}))[0].startMs, 300);
  s.voiceNudgeMs = -50; assert.strictEqual(voiceOf(NakiEditor.planFor(s, {}))[0].startMs, 50);
});
ok('moving the Voice timing after editing moves the voice and KEEPS the edits', () => {
  const s = mkSess('b', 0), saved = savedWith(s, 0, p => P.rippleDelete(addTitle(p), 20000, 22000));
  const first = NakiEditor.planFor(s, { saved });
  assert.strictEqual(first.durationMs, 58000); assert.strictEqual(first.texts.length, 1); assert.strictEqual(voiceOf(first)[0].startMs, 100);
  s.voiceNudgeMs = 250;   // the person drags the slider in Preview, then opens Export
  const moved = NakiEditor.planFor(s, {});
  assert.strictEqual(moved.durationMs, 58000, 'the cut is still there'); assert.strictEqual(moved.texts.length, 1, 'the title is still there');
  assert.strictEqual(voiceOf(moved)[0].startMs, 350); assert.strictEqual(voiceOf(moved).length, 2);
  s.voiceNudgeMs = 0; assert.strictEqual(voiceOf(NakiEditor.planFor(s, {}))[0].startMs, 100, 'and it moves back');
});
ok('edits saved with one timing and reloaded with another are kept and the voice is moved by the difference', () => {
  const s = mkSess('c', 120), saved = savedWith(s, 0, addTitle);   // saved when the timing was 0
  const plan = NakiEditor.planFor(s, { saved });
  assert.strictEqual(plan.texts.length, 1); assert.strictEqual(voiceOf(plan)[0].startMs, 220);
  const old = savedWith(mkSess('d', 0), 0, addTitle); delete old.nudge;   // an older save with no timing noted
  const s2 = mkSess('d', 80); const p2 = NakiEditor.planFor(s2, { saved: old });
  assert.strictEqual(p2.texts.length, 1); assert.strictEqual(voiceOf(p2)[0].startMs, 100, 'older saves are left as they are');
});
ok('a changed recording (Take back, more footage) still rebuilds from scratch, and hasEdits says so', () => {
  const s = mkSess('e', 0), saved = savedWith(s, 0, addTitle);
  assert.strictEqual(NakiEditor.hasEdits(s, { saved }), true);
  assert.strictEqual(NakiEditor.hasEdits(mkSess('f', 0), {}), false);
  NakiEditor.planFor(s, { saved });
  const shorter = Object.assign({}, s, { durationMs: 50000, events: events.slice(0, 5) });
  const rebuilt = NakiEditor.planFor(shorter, {});
  assert.strictEqual('texts' in rebuilt, false, 'edits made on the old recording are not applied to the new one');
});
console.log('\n' + n + ' checks passed');