'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const ed = fs.readFileSync(path.join(__dirname, '..', 'www', 'editor.js'), 'utf8');
const P = require('../www/project.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
ok('the editor has the voice-over functions and a button in the Audio row', () => {
  ['function voiceOverStart', 'function voiceOverStop', 'function voiceOverFinish', "id: 'edVoiceOver'"].forEach(s => assert(ed.includes(s), s));
});
ok('a take is an ordinary sound-effect clip at the spot where recording began, and overlapping takes get their own rows', () => {
  const base = { naki: 'project', version: 1, fps: 30, durationMs: 12000, levels: [], assets: { movie: { type: 'video', durMs: 100000 }, voice: { type: 'audio', durMs: 12000 } },
    tracks: [{ id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [{ id: 'vA', type: 'video', asset: 'movie', start: 0, dur: 12000, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 }] }] };
  const o1 = {}, o2 = {}; let p = P.addSfx(base, 2000, { name: 'Voice-over', durMs: 4000 }, o1);
  const c = P.findClip(p, o1.id); assert.strictEqual(c.clip.start, 2000); assert.strictEqual(c.clip.dur, 4000); assert.strictEqual(c.track.role, 'sfx');
  p = P.addSfx(p, 3000, { name: 'Voice-over', durMs: 2000 }, o2); assert.strictEqual(p.tracks.filter(t => t.role === 'sfx').length, 2);
  assert.strictEqual(P.addSfx(base, 5000, { name: 'v', durMs: 99000 }, {}).tracks[1].clips[0].dur, 7000, 'a take that runs past the end is cut to fit');
});
console.log('\n' + n + ' checks passed');