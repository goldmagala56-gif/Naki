// Naki patch: animated frames (pulse, blink, flicker, fades) + "Animate" tab in the frame editor.
// Run from the Naki folder:  node tools/apply-animated-frames.js   then  npm test
// Edits: www/project.js, www/editor.js. All-or-nothing; every anchor must occur exactly once.
const fs = require('fs'), path = require('path');
const root = process.cwd();
function edit(file, pairs){
  const fp = path.join(root, file); let s = fs.readFileSync(fp, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  if (s.includes('setFrameAnim')) { console.log(file + ': already patched, skipped'); return null; }
  for (const [a, b] of pairs){
    const n = s.split(a).length - 1; if (n !== 1) { console.error('STOP: anchor found ' + n + ' times in ' + file + ':\n' + a); process.exit(1); }
    s = s.replace(a, () => b);
  }
  return [fp, crlf ? s.replace(/\n/g, '\r\n') : s];
}
const PROJ = `// ---------- animated frames ----------
// A frame (or any full-picture overlay) can pulse, blink, flicker or fade by keyframing its opacity. key: none | pulse | blink | flicker | breathe | fadein | fadeout | fadeinout.
// speed: slow | normal | fast. The number of points is capped so the exported video stays quick to build.
var FRAME_ANIMS = [{ key: 'none', label: 'None' }, { key: 'pulse', label: 'Pulse' }, { key: 'breathe', label: 'Breathe' }, { key: 'blink', label: 'Blink' }, { key: 'flicker', label: 'Neon flicker' },
  { key: 'fadein', label: 'Fade in' }, { key: 'fadeout', label: 'Fade out' }, { key: 'fadeinout', label: 'Fade in + out' }];
var FRAME_SPEEDS = { slow: 2400, normal: 1200, fast: 600 };
function frameAnimKf(key, dur, speed, base){
  dur = Math.round(dur); base = base > 0 ? Math.min(1, base) : 1;
  if (!(dur > 100) || !key || key === 'none') return null;
  var per = FRAME_SPEEDS[speed] || FRAME_SPEEDS.normal, pts = [], i, t, MAX = 48;
  var step = key === 'blink' ? per / 2 : key === 'flicker' ? per / 6 : per / 2;
  if (dur / step > (key === 'blink' ? MAX / 2 : MAX)) step = dur / (key === 'blink' ? MAX / 2 : MAX);
  var r = 12345; function rnd(){ r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; }
  var fade = Math.min(700, Math.round(dur / 3));
  if (key === 'fadein') pts = [[0, 0], [fade, base]];
  else if (key === 'fadeout') pts = [[Math.max(0, dur - fade), base], [dur, 0]];
  else if (key === 'fadeinout') pts = [[0, 0], [fade, base], [Math.max(fade + 1, dur - fade), base], [dur, 0]];
  else if (key === 'pulse' || key === 'breathe'){
    var lo = key === 'pulse' ? base * 0.3 : base * 0.55, hold = key === 'breathe' ? 1.6 : 1; step *= hold;
    for (t = 0, i = 0; t < dur; t += step, i++) pts.push([Math.round(t), i % 2 ? lo : base]);
  } else if (key === 'blink'){
    for (t = 0, i = 0; t < dur; t += step, i++){ pts.push([Math.round(t), i % 2 ? 0 : base]); pts.push([Math.round(t + step - 30), i % 2 ? 0 : base]); }
  } else if (key === 'flicker'){
    for (t = 0; t < dur; t += step){ var v = rnd(); pts.push([Math.round(t), v < 0.12 ? base * 0.1 : base * (0.55 + 0.45 * rnd())]); }
  } else return null;
  var out = [], last = -1;
  pts.forEach(function (pt){ var tt = Math.max(0, Math.min(dur, pt[0])); if (tt <= last) tt = last + 1; if (tt > dur) return; last = tt; out.push([tt, Math.round(pt[1] * 1000) / 1000]); });
  return out.length > 1 ? out : null;
}
function setFrameAnim(p, id, key, speed){
  var f = findClip(p, id); if (!f || kfKind(f.track) !== 'overlay' || !f.clip.gen) return p;
  var q = cloneProject(p), c = findClip(q, id).clip;
  var cur = c.fanim || { key: 'none', speed: 'normal' }, nk = key || cur.key, ns = speed || cur.speed || 'normal';
  var kf = frameAnimKf(nk, c.dur, ns, c.opacity != null ? c.opacity : 1);
  if (!kf){
    if (!c.fanim && !(c.kf && c.kf.opacity)) return p;
    delete c.fanim; if (c.kf){ delete c.kf.opacity; if (!Object.keys(c.kf).length) delete c.kf; } return finish(q);
  }
  c.fanim = { key: nk, speed: ns }; c.kf = Object.assign({}, c.kf || {}, { opacity: kf });
  return finish(q);
}

`;
const EDW = `      else if (kc === 'frame:anim'){
        var fa = c.fanim || { key: 'none', speed: 'normal' };
        body.appendChild(chips(P.FRAME_ANIMS, fa.key, function (k){ commit(P.setFrameAnim(E.hist.cur, c.id, k, fa.speed)); }));
        if (fa.key !== 'none' && fa.key.indexOf('fade') !== 0) body.appendChild(chips([{ key: 'slow', label: 'Slow' }, { key: 'normal', label: 'Normal' }, { key: 'fast', label: 'Fast' }], fa.speed, function (k){ commit(P.setFrameAnim(E.hist.cur, c.id, fa.key, k)); }));
      }
`;
const a = edit('www/project.js', [
  ['function setMotionPreset(p, id, key){', PROJ + 'function setMotionPreset(p, id, key){'],
  ['setMotionPreset: setMotionPreset,', 'setMotionPreset: setMotionPreset, setFrameAnim: setFrameAnim, frameAnimKf: frameAnimKf, FRAME_ANIMS: FRAME_ANIMS,']
]);
const b = edit('www/editor.js', [
  ["{ key: 'width', label: 'Width' }, { key: 'opacity', label: 'Opacity' }];", "{ key: 'width', label: 'Width' }, { key: 'opacity', label: 'Opacity' }, { key: 'anim', label: 'Animate' }];"],
  ["      else if (kc === 'frame:color') col('Colour', 'color', '#ffffff');", EDW + "      else if (kc === 'frame:color') col('Colour', 'color', '#ffffff');"]
]);
if (a) fs.writeFileSync(a[0], a[1]); if (b) fs.writeFileSync(b[0], b[1]);
console.log('Done. Animate tab added to the frame editor. Now run:  npm test');