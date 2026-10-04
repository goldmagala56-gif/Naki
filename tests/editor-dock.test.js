'use strict';
// Drives the editor's bottom dock the way a person would (taps, sliders, keys) in a simulated browser.
// Needs jsdom:  npm install --save-dev jsdom      Run with:  node tests/editor-dock.test.js
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { console.log('  (jsdom is not installed, so the dock tests were skipped: npm install --save-dev jsdom)'); process.exit(0); }
const assert = require('assert');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
global.window = dom.window; global.document = dom.window.document; global.confirm = () => true;
const C = require('../www/core.js'), P = require('../www/project.js'), NakiEditor = require('../www/editor.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const events = [{ t: 0, type: 'rec_start', movieMs: 0 }, { t: 0, type: 'vol', value: 1 }, { t: 0, type: 'duck', enabled: true, thresholdDb: -40, duckedGain: 0.2 },
  { t: 4000, type: 'play', movieMs: 0 }, { t: 30000, type: 'pause', movieMs: 26000 }, { t: 40000, type: 'play', movieMs: 26000 }, { t: 60000, type: 'rec_stop' }];
const levels = []; for (let i = 0; i < 1201; i++) levels.push(C.dbToByte(-60));
const sess = { id: 'dock', events, levels, durationMs: 60000, movieName: 'm.mp4', movieDurMs: 600000, voiceOffsetMs: 100, voiceNudgeMs: 0 };
const toasts = [], movie = document.createElement('div'), media = () => ({ paused: true, currentTime: 0, volume: 1, pause() {}, play() { return Promise.resolve(); } });
Object.assign(movie, { videoWidth: 1280, videoHeight: 720, paused: true, currentTime: 0, pause() {}, play() { return Promise.resolve(); } });
NakiEditor.init({ movie, voice: media(), music: media(), ensureAudio() {}, getCtx() { return null; }, setMovieGain() {}, movieReady: () => true, toast: m => toasts.push(m),
  saveProject: () => Promise.resolve(), pickMusic: () => Promise.resolve(null), setMusicFile() {}, simple: true });
NakiEditor.open(sess, {});

const $ = (s) => document.querySelector(s), $$ = (s) => [].slice.call(document.querySelectorAll(s));
const click = (sel) => { const e = typeof sel === 'string' ? $(sel) : sel; assert(e, 'no such button: ' + sel); e.click(); };
const cur = () => NakiEditor.project();
const pics = () => cur().tracks[0].clips, playClip = () => pics().find(c => c.start === 4000);
const slide = (rng, v) => { rng.value = String(v); rng.dispatchEvent(new window.Event('input')); rng.dispatchEvent(new window.Event('change')); };
const chip = (label) => $$('.ed-chip').find(c => c.textContent === label);
const key = (k) => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
const ids = () => $$('.ed-tbtn').map(b => b.id);
const mouse = (el, type) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, clientX: 100 }));

ok('it opens on the main toolbar, and there is no sheet anywhere', () => {
  assert($('.ed-toolbar')); assert.strictEqual($$('.ed-tool').length, 5); assert(!$('.ed-trow') && !$('.ed-panel'));
  assert(!$('.ed-sheet') && !$('.ed-sheetbar'), 'the old slide-up sheet is gone');
});
ok('Edit turns the toolbar into a row of tools with a back arrow, like CapCut', () => {
  click('#edTool_edit'); assert($('.ed-trow') && !$('.ed-toolbar')); assert($('#edBack'));
  ['edSplit', 'edCut', 'edDelete', 'edDuplicate', 'edSpeed', 'edVolume', 'edZoom', 'edRotate', 'edFlip', 'edOpacity', 'edReverse', 'edFreeze', 'edAdjust', 'edFade', 'edReplace', 'edQuiet', 'edReset']
    .forEach(id => assert(ids().includes(id), 'missing tool ' + id));
  click('#edBack'); assert($('.ed-toolbar') && !$('.ed-trow'), 'the back arrow brings the main toolbar back');
});
ok('a tool with settings turns the row into a small panel, and the tick brings the row back', () => {
  NakiEditor.seek(5000); click('#edTool_edit'); click('#edSpeed');
  assert($('.ed-panel') && !$('.ed-trow')); assert.strictEqual($('.ed-ptitle').textContent, 'Speed');
  click(chip('2×')); assert.strictEqual(playClip().speed, 2); assert($('.ed-panel'), 'the panel stays open while you adjust');
  click('#edPanelDone'); assert($('.ed-trow') && !$('.ed-panel'));
  click('#edBack');
});
ok('a tap on a clip brings up the tools for it by itself; Escape puts the toolbar back', () => {
  NakiEditor.select(playClip().id); assert($('.ed-trow') && ids().includes('edReverse'), 'a picture clip gives the edit tools');
  assert($('.ed-clip.sel')); key('Escape'); assert($('.ed-toolbar') && !$('.ed-trow') && !$('.ed-clip.sel'));
  const voice = cur().tracks.find(t => t.role === 'voice').clips[0];
  NakiEditor.select(voice.id); assert(ids().includes('edMix') && ids().includes('edClipAudio'), 'a sound clip gives the audio tools'); key('Escape');
  NakiEditor.select(null);
});
ok('tapping a clip, then tapping it again, lets go of it', () => {
  const el = () => $$('.ed-clip').find(e => e.dataset.id === playClip().id);
  mouse(el(), 'pointerdown'); window.dispatchEvent(new window.MouseEvent('pointerup')); assert($('.ed-clip.sel') && $('.ed-trow'), 'first tap selects');
  mouse(el(), 'pointerdown'); window.dispatchEvent(new window.MouseEvent('pointerup')); assert(!$('.ed-clip.sel') && $('.ed-toolbar'), 'second tap lets go');
});
ok('the back arrow lets go of the clip as well', () => {
  NakiEditor.select(playClip().id); click('#edBack'); assert(!$('.ed-clip.sel') && $('.ed-toolbar'));
});
ok('Reverse is one tap, shows as on, and tells you about the preview once', () => {
  NakiEditor.select(playClip().id); toasts.length = 0; click('#edReverse');
  assert.strictEqual(playClip().reverse, true); assert.strictEqual(cur().tracks[1].clips.find(c => c.start === 4000).reverse, true, 'its sound too');
  assert($('#edReverse').className.includes('on')); assert(toasts.some(t => /choppy/.test(t)));
  click('#edReverse'); assert.strictEqual(playClip().reverse, undefined); assert(!$('#edReverse').className.includes('on')); key('Escape');
  NakiEditor.seek(1000); click('#edTool_edit'); toasts.length = 0; click('#edReverse'); assert(toasts.some(t => /paused picture/.test(t)), 'a paused picture cannot be reversed'); click('#edBack');
});
ok('Adjust works like CapCut: a row of chips and one slider, with Reset and Apply to all', () => {
  NakiEditor.seek(5000); click('#edTool_filter'); assert.strictEqual($('.ed-ptitle').textContent, 'Adjust');
  click(chip('Warmth')); slide($('.ed-panel input[type=range]'), 50); assert.strictEqual(playClip().filter.warmth, 0.5);
  click(chip('Vignette')); slide($('.ed-panel input[type=range]'), 40); assert.strictEqual(playClip().filter.vignette, 0.4); assert.strictEqual(playClip().filter.warmth, 0.5, 'the other looks are kept');
  click('#edFilterAll'); pics().forEach(c => assert.strictEqual(c.filter.vignette, 0.4));
  click('#edFilterReset'); assert.strictEqual(playClip().filter, undefined); click('#edPanelDone'); click('#edBack');
});
ok('Zoom: one slider at a time, pan chips appear once zoomed, Apply to all', () => {
  NakiEditor.seek(5000); click('#edTool_edit'); click('#edZoom'); assert(!chip('Left / right'), 'no pan before zooming');
  slide($('.ed-panel input[type=range]'), 2); assert.strictEqual(playClip().transform.zoom, 2); assert(chip('Left / right') && chip('Up / down'));
  click(chip('Left / right')); slide($('.ed-panel input[type=range]'), 0.5); assert.strictEqual(playClip().transform.x, 0.5);
  click('#edZoomAll'); pics().forEach(c => assert.strictEqual(c.transform.zoom, 2)); click('#edZoomReset'); assert.strictEqual(playClip().transform, undefined);
  click('#edPanelDone'); click('#edBack');
});
ok('Volume changes the movie sound of the clip, Opacity and Fade have their own panels', () => {
  NakiEditor.seek(5000); click('#edTool_edit'); click('#edVolume'); slide($('.ed-panel input[type=range]'), 50);
  assert.strictEqual(cur().tracks[1].clips.find(c => c.start === 4000).volume, 0.5); click('#edPanelDone');
  click('#edOpacity'); slide($('.ed-panel input[type=range]'), 60); assert.strictEqual(playClip().opacity, 0.6); click('#edPanelDone');
  click('#edFade'); click(chip('Fade out')); slide($('.ed-panel input[type=range]'), 700); assert.strictEqual(playClip().vFadeOut, 700); click('#edPanelDone'); click('#edBack');
});
ok('Audio: the volume panel has a chip per track and a mute button', () => {
  click('#edTool_audio'); click('#edMix'); assert(chip('Your voice') && chip('Movie sound'));
  click(chip('Your voice')); slide($('.ed-panel input[type=range]'), 150); assert.strictEqual(cur().tracks.find(t => t.role === 'voice').volume, 1.5);
  click('#edMute'); assert.strictEqual(cur().tracks.find(t => t.role === 'voice').muted, true); click('#edMute'); click('#edPanelDone'); click('#edBack');
});
ok('Text: Add text opens its text box at once, Style has one setting at a time', () => {
  NakiEditor.seek(20000); click('#edTool_text'); assert($('#edTextEdit').disabled, 'nothing to edit yet'); click('#edAddText');
  assert.strictEqual($('.ed-ptitle').textContent, 'Text'); const ti = $('.ed-textin'); ti.value = 'Hello'; ti.dispatchEvent(new window.Event('change'));
  assert.strictEqual(cur().tracks.find(t => t.kind === 'text').clips[0].text, 'Hello'); click('#edPanelDone');
  assert(!$('#edTextStyle').disabled); click('#edTextStyle'); slide($('.ed-panel input[type=range]'), 12); assert.strictEqual(cur().tracks.find(t => t.kind === 'text').clips[0].size, 12);
  click(chip('Dark box')); click('#edTextBox'); assert.strictEqual(cur().tracks.find(t => t.kind === 'text').clips[0].bg, true);
  click('#edPanelDone'); click('#edTextDel'); assert(!cur().tracks.find(t => t.kind === 'text') || !cur().tracks.find(t => t.kind === 'text').clips.length); click('#edBack');
});
ok('Freeze, Split and the other instant tools act right away without opening a panel', () => {
  NakiEditor.seek(10000); click('#edTool_edit'); const before = pics().length; click('#edSplit'); assert.strictEqual(pics().length, before + 1); assert(!$('.ed-panel'));
  click('#edFreeze'); assert.strictEqual($('.ed-ptitle').textContent, 'Freeze frame'); click(chip('1 s')); click('#edFreeze'); assert.strictEqual(cur().durationMs, 61000); click('#edPanelDone');
  click('#edRotate'); assert.strictEqual(pics().find(c => c.transform && c.transform.rot === 90) !== undefined, true); click('#edFlip'); click('#edBack');
});
console.log('\n' + n + ' checks passed');