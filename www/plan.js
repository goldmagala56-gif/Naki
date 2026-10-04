'use strict';
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
      var sp = c.type === 'freeze'
        ? { type: 'freeze', sessionStart: s, sessionEnd: e, movieAt: c.in }
        : { type: 'play', sessionStart: s, sessionEnd: e, movieStart: c.in + (c.reverse ? 0 : Math.round((s - Math.round(c.start)) * (c.speed || 1))) };
      if (sp.type === 'play' && c.reverse) sp.reverse = true;   // movieStart is then the START of the stretch; the part plays from its end back to it
      if (sp.type === 'play' && c.speed && c.speed !== 1) sp.speed = c.speed;
      if (c.filter){
        sp.filter = { brightness: c.filter.brightness, contrast: c.filter.contrast, saturate: c.filter.saturate };
        ['warmth', 'sharpen', 'vignette', 'matte'].forEach(function (k) { if (c.filter[k]) sp.filter[k] = c.filter[k]; });
      }
      if (c.opacity != null && c.opacity < 1) sp.opacity = c.opacity;
      if (c.transform) sp.transform = { zoom: c.transform.zoom, x: c.transform.x, y: c.transform.y, rot: c.transform.rot, flipH: !!c.transform.flipH };
      if (c.vFadeIn) sp.vFadeIn = c.vFadeIn;
      if (c.vFadeOut) sp.vFadeOut = c.vFadeOut;
      video.push(sp);
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
        var a = { src: src, startMs: Math.round(c.start), durMs: Math.round(c.dur), inMs: Math.round(c.in),
          points: C.simplifyGain(series, STEP, 0.01) };
        if (src === 'movie' && c.speed && c.speed !== 1) a.speed = c.speed;
        if (src === 'movie' && c.reverse) a.reverse = true;
        audio.push(a);
      });
    });
    audio.sort(function (a, b) { return a.startMs - b.startMs; });

    var texts = [];
    p.tracks.forEach(function (tr) {
      if (tr.kind !== 'text' || tr.hidden) return;
      tr.clips.forEach(function (c) {
        if (!(c.dur > 0) || !String(c.text || '').trim()) return;
        var s = Math.max(0, Math.round(c.start)), e = Math.min(total, Math.round(c.start + c.dur));
        if (e > s) texts.push({ startMs: s, durMs: e - s, text: String(c.text), size: c.size, color: c.color, pos: c.pos, weight: c.weight, bg: !!c.bg });
      });
    });
    texts.sort(function (a, b) { return a.startMs - b.startMs; });

    var mv = p.assets && p.assets.movie;
    var plan = { naki: 'export-plan', version: 2, durationMs: total,
      movie: { name: mv && mv.name, durationMs: mv && mv.durMs }, video: video, audio: audio };
    if (texts.length) plan.texts = texts;
    return plan;
  }
  var TEXT_POS = { top: 0.07, center: 0.40, bottom: 0.76 };
  var api = { projectToPlan: projectToPlan, TEXT_POS: TEXT_POS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiPlan = api;
  return api;
})();