'use strict';
// node tools/apply-small-additions.js   (from the project folder)
// Small additions, all or nothing:
//   fx.js       4 new effects in "Flash & light": Lens flare, Light leak, Film burn, Light streak
//   colour.js   frameStats() and matchGrade(): measure two pictures and make curves that move one toward the other
//   editor.js   a "Match previous clip" button in the Colour panel (uses the two functions above)
//   stickers.js about 150 more emoji and 24 more colourable symbols
// Film grain, glitch, VHS, RGB split and static noise already exist in Naki, so they are not added again.
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
const fx = load('www/fx.js'), cl = load('www/colour.js'), ed = load('www/editor.js'), st = load('www/stickers.js');
if (fx.text.includes("def('flare'")) { console.log('Already applied. Nothing to do.'); process.exit(0); }

// ---------- fx.js ----------
rep(fx, "    // ----- colour -----\n", `    // ----- lens flare & light (apply-small-additions.js) -----
    // A soft glow added to the picture at a position that moves with time. Coordinates are fractions of the frame, so the same text works for the
    // brightness plane and the (smaller) colour planes of geq.
    function glow(cx, cy, r, k, asp) {
      var dx = '((X/W-(' + cx + '))*' + n(asp) + ')', dy = '(Y/H-(' + cy + '))';
      return n(k) + '*exp(-(' + dx + '*' + dx + '+' + dy + '*' + dy + ')/' + n(r * r) + ')';
    }
    function sweep(T, from, to) { return n(from) + '+(' + n(to - from) + ')*clip((T-' + n(T.a) + ')/' + n(Math.max(0.1, T.b - T.a)) + ',0,1)'; }
    function lightGeq(l, cbv, crv) { return "geq=lum='lum(X,Y)+" + l + "':cb='cb(X,Y)-" + cbv + "':cr='cr(X,Y)+" + crv + "'"; }
    def('flare', 'light', 'Lens flare', { dur: 2500, ff: function (s, T) {
      var asp = T.w / T.h, k = 0.4 + 0.6 * s, cx = sweep(T, 0.15, 0.85), cx2 = '1-(' + cx + ')', r = 0.16 + 0.2 * s;
      return lightGeq(glow(cx, '0.3', r, 150 * k, asp) + '+' + glow(cx2, '0.7', r * 0.5, 60 * k, asp), glow(cx, '0.3', r, 18 * k, asp), glow(cx, '0.3', r, 14 * k, asp));
    }, pv: function (s, u, d) {
      var a = n(0.45 + 0.5 * s), x = Math.round(15 + 70 * c01(u / Math.max(0.1, d)));
      return { tint: tint('radial-gradient(circle at ' + x + '% 30%, rgba(255,246,215,' + a + ') 0%, rgba(255,190,90,' + n(a * 0.45) + ') 16%, rgba(255,150,60,0) 42%), radial-gradient(circle at ' + (100 - x) + '% 70%, rgba(255,210,150,' + n(a * 0.4) + ') 0%, rgba(255,210,150,0) 14%)', 'screen') };
    } });
    def('leak', 'light', 'Light leak', { dur: 2500, ff: function (s, T) {
      var asp = T.w / T.h, k = 0.4 + 0.6 * s, cx = sweep(T, -0.1, 0.45), r = 0.3 + 0.2 * s;
      return lightGeq(glow(cx, '0.5', r, 110 * k, asp), glow(cx, '0.5', r, 30 * k, asp), glow(cx, '0.5', r, 40 * k, asp));
    }, pv: function (s, u, d) {
      var a = n(0.35 + 0.5 * s), p = Math.round(20 + 40 * c01(u / Math.max(0.1, d)));
      return { tint: tint('linear-gradient(100deg, rgba(255,110,60,' + a + ') 0%, rgba(255,190,80,' + n(a * 0.5) + ') ' + p + '%, rgba(255,90,140,0) ' + (p + 35) + '%)', 'screen') };
    } });
    def('burn', 'light', 'Film burn', { dur: 1500, ff: function (s) {
      return wash('orange', 0.08 + 0.25 * s) + ",eq=brightness='" + n(0.1 + 0.3 * s) + "*pow(max(0,sin(t*3.2)),4)':eval=frame";
    }, pv: function (s, u) {
      return { tint: tint('rgba(255,140,40,' + n(0.08 + 0.25 * s) + ')', 'screen'), fl: 'brightness(' + n(1 + (0.1 + 0.3 * s) * Math.pow(Math.max(0, Math.sin(u * 3.2)), 4)) + ')' };
    } });
    def('streak', 'light', 'Light streak', { dur: 2500, ff: function (s) {
      var k = 0.4 + 0.6 * s, cy = '0.5+0.08*sin(T*1.5)', band = 'exp(-((Y/H-(' + cy + '))*(Y/H-(' + cy + ')))/' + n(0.0004) + ')';
      return "geq=lum='lum(X,Y)+" + n(60 * k) + '*' + band + "':cb='cb(X,Y)-" + n(20 * k) + '*' + band + "':cr='cr(X,Y)'";
    }, pv: function (s) {
      return { tint: tint('linear-gradient(0deg, rgba(120,170,255,0) 42%, rgba(150,190,255,' + n(0.35 + 0.45 * s) + ') 50%, rgba(120,170,255,0) 58%)', 'screen') };
    } });

    // ----- colour -----
`, 'fx: new light effects');

// ---------- colour.js ----------
rep(cl, "  var PRESETS = [\n", `  // ----- matching one picture to another (apply-small-additions.js) -----
  // Measures the average and the spread of each colour channel of canvas pixel data (RGBA bytes). Looks at about 4000 pixels. Values are 0..1.
  function frameStats(px) {
    var n = px.length / 4, step = Math.max(1, Math.floor(n / 4000)), s = [0, 0, 0], q = [0, 0, 0], cnt = 0, i, c;
    for (i = 0; i < n; i += step) { for (c = 0; c < 3; c++) { var v = px[i * 4 + c] / 255; s[c] += v; q[c] += v * v; } cnt++; }
    if (!cnt) return { mean: [0.5, 0.5, 0.5], std: [0.2, 0.2, 0.2] };
    var mean = s.map(function (x) { return x / cnt; });
    return { mean: mean.map(r3), std: q.map(function (x, k) { return r3(Math.sqrt(Math.max(0, x / cnt - mean[k] * mean[k]))); }) };
  }
  // Curves (red, green, blue) that move the picture with stats "cur" toward the one with stats "ref". strength 0..1. Returns { r, g, b } where a channel that
  // needs no change is null, ready for merge({ curves: ... }).
  function matchGrade(ref, cur, strength) {
    var s = strength == null ? 1 : clamp01(strength), out = {};
    ['r', 'g', 'b'].forEach(function (k, c) {
      var shift = Math.max(-0.25, Math.min(0.25, (ref.mean[c] - cur.mean[c]) * s));
      var slope = cur.std[c] > 0.01 ? Math.max(0.7, Math.min(1.4, ref.std[c] / cur.std[c])) : 1;
      slope = 1 + (slope - 1) * s;
      var target = cur.mean[c] + shift, pts = [0, 0.25, 0.5, 0.75, 1].map(function (x) { return [x, clamp01(slope * (x - cur.mean[c]) + target)]; });
      out[k] = cleanCurve(pts);
    });
    return out;
  }

  var PRESETS = [
`, 'colour: match functions');
rep(cl, "toCube: toCube, applyToImageData: applyToImageData, sampleLut: sampleLut };", "toCube: toCube, applyToImageData: applyToImageData, sampleLut: sampleLut, frameStats: frameStats, matchGrade: matchGrade };", 'colour: export');

// ---------- editor.js ----------
rep(ed, "  PANELS.grade = { title: 'Colour', build: function (body){",
`  // Colour match: this clip is measured near its start, the clip before it near its end, and red / green / blue curves are made to bring this one toward that one.
  function sampleStats(url, ms){
    return new Promise(function (resolve, reject){
      var vid = document.createElement('video'), done = false;
      function fin(err, val){ if (done) return; done = true; try { vid.removeAttribute('src'); vid.load(); } catch (e){} if (err) reject(err); else resolve(val); }
      vid.muted = true; vid.preload = 'auto'; vid.setAttribute('playsinline', '');
      vid.onerror = function (){ fin(new Error('This clip could not be read.')); };
      vid.onloadedmetadata = function (){ try { vid.currentTime = Math.max(0, Math.min(ms / 1000, (vid.duration || 1e9) - 0.05)); } catch (e){ fin(e); } };
      vid.onseeked = function (){
        try {
          var w = 96, ht = Math.max(2, Math.round(w * (vid.videoHeight || 9) / (vid.videoWidth || 16))), cv = document.createElement('canvas');
          cv.width = w; cv.height = ht; var cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(vid, 0, 0, w, ht);
          fin(null, NCL.frameStats(cx.getImageData(0, 0, w, ht).data));
        } catch (e){ fin(e); }
      };
      setTimeout(function (){ fin(new Error('Reading the clip took too long.')); }, 8000);
      vid.src = url;
    });
  }
  function matchPrevious(c){
    var f = P.findClip(E.proj, c.id); if (!f) return;
    var list = f.track.clips.filter(function (x){ return x.type === 'video' || x.type === 'freeze'; }).sort(function (a, b){ return a.start - b.start; }), i = list.indexOf(c), prev = i > 0 ? list[i - 1] : null;
    if (!prev){ toast('There is no picture clip before this one to match.'); return; }
    var u1 = clipUrl(f.track, prev), u2 = clipUrl(f.track, c);
    if (!u1 || !u2){ toast('The movie file for one of these clips is not loaded.'); return; }
    var t1 = prev.in + Math.max(0, prev.dur * (prev.speed || 1) - 300), t2 = c.in + 200;
    toast('Measuring the two pictures...', 2500);
    Promise.all([sampleStats(u1, t1), sampleStats(u2, t2)]).then(function (stats){
      var m = NCL.matchGrade(stats[0], stats[1], 1);
      if (!m.r && !m.g && !m.b){ toast('These two pictures already look alike.'); return; }
      var q = P.setGrade(E.hist.cur, c.id, { curves: { r: m.r, g: m.g, b: m.b } });
      if (q === E.hist.cur) renderDock(); else commit(q);
      toast('Matched to the clip before. Fine-tune it under Curves.', 5000);
    }, function (err){ toast(err && err.message ? err.message : 'Could not match the colour.', 7000); });
  }
  PANELS.grade = { title: 'Colour', build: function (body){`, 'editor: match functions');
rep(ed, "{ id: 'edGradeAll', label: 'Apply to all',", "{ id: 'edGradeMatch', label: 'Match previous clip', run: function (){ matchPrevious(c); } },\n      { id: 'edGradeAll', label: 'Apply to all',", 'editor: match button');

// ---------- stickers.js ----------
rep(st, "  var SYMBOLS = ['★', '♥', '✔', '✖', '➤', '●', '◆', '✦', '♪', '☀', '❝', '❞'];",
`  // more emoji (Unicode 6 to 10, so every phone draws them) and more symbols that can be coloured
  var MORE = ['😁', '😆', '😉', '😊', '😋', '😘', '🤩', '🤗', '🤭', '😏', '😴', '🤤', '😡', '😤', '😢', '😬', '🙄', '😇', '🤯', '🥶', '🥵', '🤪', '😜', '🤑',
    '👋', '🤝', '✌️', '🤞', '🤟', '🤘', '👌', '👊', '✊', '💅', '🙈', '🙉', '🙊', '💋', '💔', '💕', '💖', '💗', '💙', '💚', '💛', '🧡', '💜', '🖤',
    '🐶', '🐱', '🐼', '🦁', '🐯', '🐸', '🐵', '🦄', '🐝', '🦋', '🐢', '🐙', '🦈', '🐬', '🐔', '🐧',
    '🌸', '🌹', '🌻', '🌴', '🍀', '🍁', '🌍', '🌊', '❄️', '☔', '🌤️', '⛅', '🌪️', '🌋',
    '🍕', '🍔', '🍟', '🍩', '🍰', '🍦', '🍎', '🍓', '🍉', '☕', '🍺', '🍷', '🥂', '🍾',
    '⚽', '🏀', '🏆', '🥇', '🎮', '🎯', '🎤', '🎧', '🎸', '🥁', '📷', '📹', '💡', '📱', '💻', '⌚',
    '🚗', '✈️', '🚲', '🏠', '🗽', '🏝️', '⛺', '🎈', '🎂', '🎄', '🎃', '👑', '💎', '💰', '🔑', '🔔',
    '⏰', '⏳', '🔒', '🔍', '📍', '📢', '💬', '💭', '❓', '❗', '‼️', '➕', '➖', '🔴', '🟢', '🔵', '⬆️', '⬇️', '⬅️', '🔙', '🔜', '🆗', '🆕', '🔞'];
  EMOJI = EMOJI.concat(MORE.filter(function (g, i) { return EMOJI.indexOf(g) < 0 && MORE.indexOf(g) === i; }));
  var SYMBOLS = ['★', '♥', '✔', '✖', '➤', '●', '◆', '✦', '♪', '☀', '❝', '❞', '☆', '♡', '✿', '❀', '✓', '✗', '▲', '▼', '■', '◀', '▶', '→', '←', '↑', '↓', '✚', '※', '♫', '☁', '☂', '☎', '✉', '✂', '✈'];`, 'stickers: more emoji');

if (problems.length) { console.log('NOTHING WAS CHANGED. These spots did not match:\n  - ' + problems.join('\n  - ') + '\nSend me that list.'); process.exit(1); }
[fx, cl, ed, st].forEach(save);
console.log('Done.\nNow run:  node tests/small-additions.test.js   and then   npm test');