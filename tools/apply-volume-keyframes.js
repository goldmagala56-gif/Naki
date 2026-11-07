'use strict';
// node tools/apply-volume-keyframes.js   (from the project folder)
// Volume keyframes for sound clips (music, voice, movie sound, effects): the volume can rise and fall inside one clip, like CapCut.
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
const an = load('www/anim.js'), pj = load('www/project.js'), ed = load('www/editor.js');
if (pj.text.includes("if (kind === 'audio'){ c.volume = v; return; }")) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- anim.js: a volume has a range and a fixed value ----------
rep(an, 'picture: { zoom: [1, 4], x: [-1, 1], y: [-1, 1] } };', 'picture: { zoom: [1, 4], x: [-1, 1], y: [-1, 1] }, audio: { volume: [0, 2] } };', 'anim: volume range');
rep(an, "if (kind === 'overlay') return c[prop] != null ? c[prop] : OVERLAY[prop];", "if (kind === 'audio') return c.volume != null ? c.volume : 1;\n    if (kind === 'overlay') return c[prop] != null ? c[prop] : OVERLAY[prop];", 'anim: fixed volume');

// ---------- project.js: sound clips take keyframes, and the volume at any moment follows them ----------
rep(pj, "function kfKind(tr){ return tr.kind === 'overlay' ? 'overlay' : (tr.role === 'movie' ? 'picture' : null); }",
  "function kfKind(tr){ return tr.kind === 'overlay' ? 'overlay' : (tr.role === 'movie' ? 'picture' : (tr.kind === 'audio' ? 'audio' : null)); }", 'project: sound clips take keyframes');
rep(pj, "function setStaticProp(c, kind, prop, v){\n  if (kind === 'overlay'){ c[prop] = v; return; }", "function setStaticProp(c, kind, prop, v){\n  if (kind === 'audio'){ c.volume = v; return; }\n  if (kind === 'overlay'){ c[prop] = v; return; }", 'project: fixed volume');
rep(pj, "return kind === 'overlay' ? ['x', 'y', 'size', 'rot', 'opacity'] : ['zoom', 'x', 'y'];", "if (kind === 'audio') return ['volume'];\n  return kind === 'overlay' ? ['x', 'y', 'size', 'rot', 'opacity'] : ['zoom', 'x', 'y'];", 'project: keyframe properties');
rep(pj, "var rel = t - c.start, g = (tr.volume != null ? tr.volume : 1) * (c.volume != null ? c.volume : 1) * gainAt(c.gain, rel);",
  "var rel = t - c.start, vol = (c.kf && c.kf.volume && c.kf.volume.length && _AN) ? _AN.kfValue(c.kf.volume, rel) : (c.volume != null ? c.volume : 1);   // volume keyframes\n  var g = (tr.volume != null ? tr.volume : 1) * vol * gainAt(c.gain, rel);", 'project: volume follows the keyframes');
rep(pj, "var f = findClip(p, id), kind = f && kfKind(f.track); if (!kind || !_MO) return p;", "var f = findClip(p, id), kind = f && kfKind(f.track); if (!kind || kind === 'audio' || !_MO) return p;", 'project: motion presets stay on pictures and overlays');

// ---------- editor.js: the Clip sound panel gets the diamond ----------
rep(ed, "var set = function (v){ var o = {}; if (cur === 'volume') o.volume = v / 100; else { o[cur] = v; o[cur + 'Off'] = 0; } return P.setClipProps(E.hist.cur, c.id, o); };",
  "var set = function (v){ if (cur === 'volume' && c.kf && c.kf.volume && c.kf.volume.length) return P.setAnimated(E.hist.cur, c.id, 'volume', v / 100, relNow(c)); var o = {}; if (cur === 'volume') o.volume = v / 100; else { o[cur] = v; o[cur + 'Off'] = 0; } return P.setClipProps(E.hist.cur, c.id, o); };", 'editor: slider sets a keyframe when there are some');
rep(ed, "Math.round((c.volume != null ? c.volume : 1) * 100), pct, function (v){ live(set(v)); }, function (v){ commit(set(v)); })",
  "Math.round((NANIM ? NANIM.valueOf(c, 'audio', 'volume', relNow(c)) : (c.volume != null ? c.volume : 1)) * 100), pct, function (v){ live(set(v)); }, function (v){ commit(set(v)); })", 'editor: slider shows the volume at the playhead');
rep(ed, ": sliderRow(cur === 'fadeIn' ? 'Fade in' : 'Fade out', 0, half, 100, Math.min(half, c[cur] || 0), secs, function (v){ live(set(v)); }, function (v){ commit(set(v)); }));",
  ": sliderRow(cur === 'fadeIn' ? 'Fade in' : 'Fade out', 0, half, 100, Math.min(half, c[cur] || 0), secs, function (v){ live(set(v)); }, function (v){ commit(set(v)); }));\n      if (cur === 'volume'){\n        body.appendChild(keyframeActions(c, 'volume'));\n        body.appendChild(mk('div', 'ed-hint', 'Move the playhead, tap Add keyframe, then change the volume. The sound glides between keyframes, so you can lower it for a line and bring it back.'));\n      }", 'editor: keyframe buttons for the volume');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
save(an); save(pj); save(ed);
console.log('Done.\nNow run:  node tests/volume-keyframes.test.js   and then   npm test');