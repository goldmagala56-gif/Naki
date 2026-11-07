'use strict';
// node tools/apply-word-highlight.js   (from the project folder)
// Word highlight for captions: the word being spoken lights up in its own colour (CapCut style), in the preview and in both export engines.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function load(rel) { const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o) { fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const problems = [];
function rep(o, find, replace, label) {
  const n = o.text.split(find).length - 1;
  if (n !== 1) { problems.push(label + ': found ' + n + ' times (need exactly 1) in ' + o.rel); return; }
  o.text = o.text.replace(find, () => replace);
}
const pj = load('www/project.js'), pl = load('www/plan.js'), lk = load('www/look.js'), ed = load('www/editor.js'), wc = load('www/webcodecs-export.js'), ee = load('www/export-engine.js');
if (pj.text.includes('function setCaptionHighlight')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- project.js: when each word is spoken, and the switch ----------
const FUNCS = `// ---------- word highlight (captions) ----------
// A caption clip with clip.hl = '#rrggbb' lights up the word being spoken in that colour. Each word gets a share of the caption's time by its length
// (a pause after a comma or full stop), so it works for any language and for captions you typed. If a clip ever carries clip.words = [[startMs, endMs], ...]
// (times since the caption started, one pair per word) those exact times are used instead.
function wordsOf(text){ return String(text == null ? '' : text).split(/\\s+/).filter(Boolean); }
function wordTimes(c, durMs){
  var words = wordsOf(c && c.text), dur = Math.round(durMs > 0 ? durMs : (c && c.dur) || 0);
  if (!words.length || !(dur > 0)) return [];
  if (c.words && c.words.length === words.length){
    return c.words.map(function (w){ return [Math.max(0, Math.min(dur, Math.round(w[0]))), Math.max(0, Math.min(dur, Math.round(w[1])))]; });
  }
  var wt = words.map(function (x){
    var n = x.replace(/[.,;:!?\\u2026"'()\\-]/g, '').length;
    return Math.max(2, n) + (/[,;:]$/.test(x) ? 2 : 0) + (/[.!?\\u2026]$/.test(x) ? 4 : 0);
  }), tot = wt.reduce(function (a, b){ return a + b; }, 0), out = [], acc = 0, prev = 0;
  wt.forEach(function (w, i){ acc += w; var end = i === wt.length - 1 ? dur : Math.round(dur * acc / tot); out.push([prev, end]); prev = end; });
  return out;
}
// Which word is on at relMs since the caption started.
function wordIndexAt(times, relMs){
  for (var i = 0; i < times.length; i++) if (relMs < times[i][1]) return i;
  return Math.max(0, times.length - 1);
}
// color = '#rrggbb' turns it on for every caption; null turns it off.
function setCaptionHighlight(p, color){
  var tr = captionTrackOf(p); if (!tr || !tr.clips.length) return p;
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return p;
  var q = cloneProject(p);
  captionTrackOf(q).clips.forEach(function (c){ if (color) c.hl = color; else delete c.hl; });
  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);
}

// ---------- adding another video to the picture line ----------`;
rep(pj, '// ---------- adding another video to the picture line ----------', FUNCS, 'project: word highlight functions');
rep(pj, 'setCaptionAnim: setCaptionAnim, setMotionPreset: setMotionPreset,', 'setCaptionAnim: setCaptionAnim, setMotionPreset: setMotionPreset, wordTimes: wordTimes, wordIndexAt: wordIndexAt, setCaptionHighlight: setCaptionHighlight,', 'project: exports');
// new captions (for example from Auto captions run again) keep the highlight the old ones had
rep(pj, "if (opts.replace) tr.clips = [];", "var keepHl = tr.clips.length ? tr.clips[0].hl : null;\n  if (opts.replace) tr.clips = [];", 'project: remember the highlight');
rep(pj, "tr.clips.push(Object.assign({ id: newId('c'), type: 'text', asset: null, start: s0, dur: e0 - s0, in: 0, speed: 1, text: it.t, caption: true }, CAPTION_STYLE));",
  "var nc = Object.assign({ id: newId('c'), type: 'text', asset: null, start: s0, dur: e0 - s0, in: 0, speed: 1, text: it.t, caption: true }, CAPTION_STYLE);\n    if (keepHl) nc.hl = keepHl;\n    tr.clips.push(nc);", 'project: new captions keep the highlight');

// ---------- plan.js: the export plan carries the word times ----------
rep(pl, 'if (c.anim) tx.anim = JSON.parse(JSON.stringify(c.anim));',
  "if (c.anim) tx.anim = JSON.parse(JSON.stringify(c.anim));\n          if (c.hl && P.wordTimes){ var wt = P.wordTimes(c, e - s); if (wt.length){ tx.text = String(c.text).split(/\\s+/).filter(Boolean).join(' '); tx.hl = { color: c.hl, t: wt }; } }   // word highlight", 'plan: word highlight');

// ---------- look.js: one drawing for the preview and both engines ----------
rep(lk, "    lines.forEach(function (l, i){ g.fillText(l, W / 2, y0 + i * lh); });\n    return lines;",
`    if (t.hlWord != null && t.hlColor && g.measureText){
      // word highlight: the word being spoken (t.hlWord, counted from 0 over all the lines) in its own colour, the rest in the title colour
      var wi = 0, base = t.color || '#ffffff', spw = g.measureText(' ').width;
      g.textAlign = 'left';
      lines.forEach(function (l, i){
        var x = W / 2 - g.measureText(l).width / 2;
        l.split(' ').forEach(function (tk){ g.fillStyle = wi === t.hlWord ? t.hlColor : base; g.fillText(tk, x, y0 + i * lh); x += g.measureText(tk).width + spw; wi++; });
      });
      g.textAlign = 'center'; g.fillStyle = base;
    } else lines.forEach(function (l, i){ g.fillText(l, W / 2, y0 + i * lh); });
    return lines;`, 'look: draw the highlighted word');

// ---------- webcodecs-export.js (fast engine): drawn live, so it does not hold a full picture for every word ----------
rep(wc, "var c = makeCanvas(W, H); drawTitle(c.getContext('2d'), t, W, H);\n      return { c: c, a: t.startMs, b: t.startMs + t.durMs, t: t };",
  "if (t.hl && t.hl.t && t.hl.t.length) return { c: null, a: t.startMs, b: t.startMs + t.durMs, t: t, hl: true };   // word highlight: drawn live (see drawHlTitle)\n      var c = makeCanvas(W, H); drawTitle(c.getContext('2d'), t, W, H);\n      return { c: c, a: t.startMs, b: t.startMs + t.durMs, t: t };", 'fast engine: highlighted titles');
rep(wc, "    function drawTitleAnim(ti, tMs) {\n      var an = ti.t.anim, st = (NMO && an) ? NMO.textState(an, tMs - ti.a, ti.b - ti.a) : null;\n      if (!st) { ctx.drawImage(ti.c, 0, 0); return; }",
`    var hlCv = null, hlKey = '';
    function drawHlTitle(ti, tMs) {   // one shared picture, redrawn only when the spoken word changes
      var w = ti.t.hl.t, rel = tMs - ti.a, i = w.length - 1;
      for (var q = 0; q < w.length; q++) if (rel < w[q][1]) { i = q; break; }
      var key = ti.a + ':' + i;
      if (!hlCv) hlCv = makeCanvas(W, H);
      if (hlKey !== key) { var hg = hlCv.getContext('2d'); hg.clearRect(0, 0, W, H); drawTitle(hg, Object.assign({}, ti.t, { hlWord: i, hlColor: ti.t.hl.color }), W, H); hlKey = key; }
      ctx.drawImage(hlCv, 0, 0);
    }
    function drawTitleAnim(ti, tMs) {
      var an = ti.t.anim, st = (NMO && an) ? NMO.textState(an, tMs - ti.a, ti.b - ti.a) : null;
      if (!st) { if (ti.hl) drawHlTitle(ti, tMs); else ctx.drawImage(ti.c, 0, 0); return; }`, 'fast engine: draw the spoken word');

// ---------- export-engine.js (ffmpeg): one picture per word ----------
rep(ee, "if (!segs) { textFiles.push({ name: nm + '.png', clip: t, width: width, height: height }); return; }",
`if (!segs && t.hl && t.hl.t && t.hl.t.length) {   // word highlight: one picture per word, each shown while that word is spoken
      t.hl.t.forEach(function (w, k) { if (w[1] > w[0]) textFiles.push({ name: nm + '_w' + String(k).padStart(3, '0') + '.png', clip: Object.assign({}, t, { startMs: t.startMs + w[0], durMs: w[1] - w[0], hlWord: k, hlColor: t.hl.color }), width: width, height: height }); });
      return;
    }
    if (!segs) { textFiles.push({ name: nm + '.png', clip: t, width: width, height: height }); return; }`, 'ffmpeg engine: one picture per word');

// ---------- editor.js: the button, the panel and the preview ----------
rep(ed, "{ id: 'edCapMark', label: 'Mark speech', run: markSpeech }]));",
  "{ id: 'edCapMark', label: 'Mark speech', run: markSpeech }, { id: 'edCapHl', label: 'Word highlight', run: function (){ openPanel('wordhl'); } }]));", 'editor: button in the Captions panel');
rep(ed, "    captions: { title: 'Captions', build: function (body){",
`    wordhl: { title: 'Word highlight', build: function (body){
      var trc = P.captionTrackOf(E.hist.cur);
      if (!trc || !trc.clips.length){ body.appendChild(mk('div', 'ed-hint', 'Add captions first (Auto captions, an .srt file or Add line here), then pick a colour for the word being spoken.')); return; }
      var COLS = [{ key: 'off', label: 'Off', v: null }, { key: 'yellow', label: 'Yellow', v: '#ffd400' }, { key: 'green', label: 'Green', v: '#2bd96b' }, { key: 'red', label: 'Red', v: '#ff3b3b' },
        { key: 'cyan', label: 'Cyan', v: '#22d3ee' }, { key: 'orange', label: 'Orange', v: '#ff8a1f' }, { key: 'pink', label: 'Pink', v: '#ff5db1' }], now = trc.clips[0].hl || null, cur = 'off';
      COLS.forEach(function (o){ if (o.v === now) cur = o.key; });
      body.appendChild(chips(COLS.map(function (o){ return { key: o.key, label: o.label }; }), cur, function (k){
        var col = null; COLS.forEach(function (o){ if (o.key === k) col = o.v; });
        var q = P.setCaptionHighlight(E.hist.cur, col); if (q === E.hist.cur) renderDock(); else commit(q);
      }));
      body.appendChild(mk('div', 'ed-hint', 'The word being spoken lights up in this colour, on every caption. Each word gets its share of the line by its length, so check the timing against your voice. Not used on captions that have a text animation.'));
    } },
    captions: { title: 'Captions', build: function (body){`, 'editor: Word highlight panel');
rep(ed, "  function renderTexts(list){",
`  // word highlight in the preview: each word is its own span, the spoken one gets the colour
  function hlPreview(d, c, text){
    var words = String(text).split(/\\s+/).filter(Boolean), key = words.join(' ');
    if (d._hlTxt !== key){
      d._sp.textContent = ''; d._hlSp = [];
      words.forEach(function (w, i){ if (i) d._sp.appendChild(document.createTextNode(' ')); var s = mk('span', null, w); d._sp.appendChild(s); d._hlSp.push(s); });
      d._hlTxt = key; d._txt = null;
    }
    var wt = P.wordTimes(c, c.dur), on = P.wordIndexAt(wt, E.t - c.start);
    d._hlSp.forEach(function (s, i){ var col = i === on ? c.hl : ''; if (s._col !== col){ s.style.color = col; s._col = col; } });
  }
  function renderTexts(list){`, 'editor: preview helper');
rep(ed, "if (d._txt !== shownText){ d._sp.textContent = shownText; d._txt = shownText; }",
  "if (c.hl && !stt && P.wordTimes) hlPreview(d, c, shownText);\n      else {\n        if (d._hlSp){ d._hlSp = null; d._hlTxt = null; d._txt = null; }\n        if (d._txt !== shownText){ d._sp.textContent = shownText; d._txt = shownText; }\n      }", 'editor: preview draws the spoken word');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(pj); save(pl); save(lk); save(ed); save(wc); save(ee);
console.log('Done.\nNow run:  node tests/word-highlight.test.js   and then   npm test');