'use strict';
/* Naki export plan, version 2: built from the EDITED timeline (project.js), not the raw recording.
   Pure logic, no page or device code, so it is tested in Node.

   plan = {
     naki:'export-plan', version:2, durationMs,
     movie:{ name, durationMs },
     video:[ {type:'play',  sessionStart, sessionEnd, movieStart}
           | {type:'freeze',sessionStart, sessionEnd, movieAt}
           | {type:'black', sessionStart, sessionEnd} ],          // covers 0..durationMs with no gaps
     audio:[ {src:'movie'|'voice'|'music', startMs, durMs, inMs, points:[[msSinceClipStart, gain],...]} ]
   }
   Each audio clip's points already include track volume, mute, clip volume, ducking and fades,
   so the engines only have to apply the curve. */
var NakiPlan = (function () {
  var P = (typeof module !== 'undefined' && module.exports) ? require('./project.js') : window.NakiProject;
  var C = (typeof module !== 'undefined' && module.exports) ? require('./core.js')
    : { simplifyGain: simplifyGain, LEVEL_STEP_MS: LEVEL_STEP_MS };
  var STEP = 50;
  var ROLE_SRC = { movieSound: 'movie', voice: 'voice', music: 'music' };

  function projectToPlan(p) {
    var total = Math.round(p.durationMs), video = [], cursor = 0;
    var vt = p.tracks.filter(function (t) { return t.kind === 'video'; })[0];
    var vclips = vt && !vt.hidden ? vt.clips.slice().sort(function (a, b) { return a.start - b.start; }) : [];
    vclips.forEach(function (c) {
      var s = Math.round(c.start), e = Math.round(c.start + c.dur);
      if (e <= cursor) return;
      if (s > cursor) video.push({ type: 'black', sessionStart: cursor, sessionEnd: s });
      else s = cursor;
      video.push(c.type === 'freeze'
        ? { type: 'freeze', sessionStart: s, sessionEnd: e, movieAt: c.in }
        : { type: 'play', sessionStart: s, sessionEnd: e, movieStart: c.in + (s - Math.round(c.start)) });
      cursor = e;
    });
    if (cursor < total) video.push({ type: 'black', sessionStart: cursor, sessionEnd: total });

    var audio = [];
    p.tracks.forEach(function (tr) {
      if (tr.kind !== 'audio' || tr.muted) return;
      var src = ROLE_SRC[tr.role]; if (!src) return;
      tr.clips.forEach(function (c) {
        if (!(c.dur > 0)) return;
        var n = Math.ceil(c.dur / STEP) + 1, series = [], any = false;
        for (var i = 0; i < n; i++) {
          var g = P.clipGainAt(tr, c, c.start + Math.min(c.dur, i * STEP));
          if (g > 0.0005) any = true;
          series.push(g);
        }
        if (!any) return;
        audio.push({ src: src, startMs: Math.round(c.start), durMs: Math.round(c.dur), inMs: Math.round(c.in),
          points: C.simplifyGain(series, STEP, 0.01) });
      });
    });
    audio.sort(function (a, b) { return a.startMs - b.startMs; });
    var mv = p.assets && p.assets.movie;
    return { naki: 'export-plan', version: 2, durationMs: total,
      movie: { name: mv && mv.name, durationMs: mv && mv.durMs }, video: video, audio: audio };
  }

  // Which audio clips touch the session window [a,b) in ms.
  function clipsInWindow(plan, a, b) {
    return plan.audio.filter(function (c) { return c.startMs < b && c.startMs + c.durMs > a; });
  }

  // Gain of a clip's curve at ms since the clip started (linear between points).
  function gainOfClip(points, rel) {
    if (!points || !points.length) return 1;
    if (rel <= points[0][0]) return points[0][1];
    for (var i = 1; i < points.length; i++) if (rel <= points[i][0]) {
      var a = points[i - 1], b = points[i];
      return b[0] === a[0] ? b[1] : a[1] + (b[1] - a[1]) * (rel - a[0]) / (b[0] - a[0]);
    }
    return points[points.length - 1][1];
  }

  var api = { projectToPlan: projectToPlan, clipsInWindow: clipsInWindow, gainOfClip: gainOfClip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiPlan = api;
  return api;
})();