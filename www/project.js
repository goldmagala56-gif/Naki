'use strict';
/* Naki project model: the editable timeline. Pure logic, no page or device code.
   A recording (event log) is compiled ONCE into a Project; after that, every edit works on the
   Project and never touches the event log. All edit functions return a NEW project (the old one is
   left alone), so undo/redo is just keeping the old ones. Times are whole milliseconds.

   Project = { naki:'project', version:1, fps, durationMs, levels:[bytes], assets:{id:{type,name,durMs}},
               tracks:[ { id, kind:'video'|'audio', role, muted, hidden, volume, locked, clips:[Clip] } ] }
   Clip    = { id, type:'video'|'freeze'|'audio', asset, start, dur, in, speed, volume, gain:[[relMs,g]],
               fadeIn, fadeOut, link }   (start/dur are timeline time, in is source time) */
var _C = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : {
  buildVideoSpans: buildVideoSpans, buildGainSeries: buildGainSeries, simplifyGain: simplifyGain,
  LEVEL_STEP_MS: LEVEL_STEP_MS, byteToDb: byteToDb, DB_MIN: DB_MIN };

var _FM = (typeof module !== 'undefined' && module.exports) ? require('./format.js') : (typeof window !== 'undefined' ? window.NakiFormat : null);
var _idn = 0;
function newId(p){ _idn++; return p + _idn.toString(36) + Math.random().toString(36).slice(2, 6); }
function r3(x){ return Math.round(x * 1000) / 1000; }
function clipEnd(c){ return c.start + c.dur; }

// ---------- volume curves (points are [msSinceClipStart, gain]) ----------
function gainAt(points, t){
  if (!points || !points.length) return 1;
  if (t <= points[0][0]) return points[0][1];
  for (var i = 1; i < points.length; i++){
    if (t <= points[i][0]){
      var a = points[i - 1], b = points[i];
      return b[0] === a[0] ? b[1] : a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
    }
  }
  return points[points.length - 1][1];
}
function gainSlice(points, from, to){   // curve for [from,to), re-based so "from" becomes 0
  if (!points || !points.length) return [];
  var out = [[0, r3(gainAt(points, from))]];
  points.forEach(function (p){ if (p[0] > from && p[0] < to) out.push([p[0] - from, p[1]]); });
  out.push([to - from, r3(gainAt(points, to))]);
  return out;
}

// ---------- project basics ----------
function cloneProject(p){   // tracks/assets are copied; the big levels array is shared (never edited in place)
  return { naki: p.naki, version: p.version, fps: p.fps, durationMs: p.durationMs, levels: p.levels,
    assets: JSON.parse(JSON.stringify(p.assets)), tracks: JSON.parse(JSON.stringify(p.tracks)),
    format: p.format ? JSON.parse(JSON.stringify(p.format)) : undefined };
}
function finish(p){
  var d = 0;
  p.tracks.forEach(function (tr){
    tr.clips = tr.clips.filter(function (c){ return c.dur > 0; }).sort(function (a, b){ return a.start - b.start; });
    tr.clips.forEach(function (c){ d = Math.max(d, clipEnd(c)); });
  });
  p.durationMs = d;
  p.tracks = p.tracks.filter(function (t){ return t.kind !== 'sticker' || t.clips.length; });   // an empty sticker row goes away
  return p;
}
function findClip(p, id){
  for (var i = 0; i < p.tracks.length; i++)
    for (var j = 0; j < p.tracks[i].clips.length; j++)
      if (p.tracks[i].clips[j].id === id) return { track: p.tracks[i], clip: p.tracks[i].clips[j] };
  return null;
}
function sliceClip(c, from, to){   // the part of clip c covering timeline [from,to)
  from = Math.max(from, c.start); to = Math.min(to, clipEnd(c));
  var n = JSON.parse(JSON.stringify(c));
  n.id = newId('c'); n.start = from; n.dur = to - from;
  if (c.type !== 'freeze' && c.type !== 'text')   // a reversed clip plays its stretch of the movie backwards, so a piece taken from its end reads the movie from the start
    n.in = c.reverse ? c.in + Math.round((clipEnd(c) - to) * (c.speed || 1)) : c.in + Math.round((from - c.start) * (c.speed || 1));
  if (c.gain && c.gain.length) n.gain = gainSlice(c.gain, from - c.start, to - c.start);
  // fades belong to the original clip's ends: remember how much of each fade a piece has already used up
  if (from > c.start){ n.fadeInOff = (c.fadeInOff || 0) + (from - c.start); if (n.fadeInOff >= (c.fadeIn || 0)){ n.fadeIn = 0; n.fadeInOff = 0; } delete n.vFadeIn; delete n.transition; }
  if (to < clipEnd(c)){ n.fadeOutOff = (c.fadeOutOff || 0) + (clipEnd(c) - to); if (n.fadeOutOff >= (c.fadeOut || 0)){ n.fadeOut = 0; n.fadeOutOff = 0; } delete n.vFadeOut; }
  return n;
}

// ---------- recording -> project ----------
function compileFromSession(s){
  var dur = s.durationMs, vol = s.movieVolume != null ? s.movieVolume : 1;
  var p = { naki: 'project', version: 1, fps: 30, durationMs: dur, levels: (s.levels || []).slice(),
    assets: { movie: { type: 'video', name: s.movieName, durMs: s.movieDurMs },
              voice: { type: 'audio', name: 'voice', durMs: s.voiceDurMs || null } },
    tracks: [
      { id: 't-movie', kind: 'video', role: 'movie', muted: false, hidden: false, volume: 1, locked: false, clips: [] },
      { id: 't-moviesound', kind: 'audio', role: 'movieSound', muted: false, hidden: false, volume: 1, locked: false, clips: [] },
      { id: 't-voice', kind: 'audio', role: 'voice', muted: false, hidden: false, volume: 1, locked: false, clips: [] }
    ] };
  var series = _C.buildGainSeries(s).map(function (g){ return g * vol; });
  var pts = _C.simplifyGain(series, _C.LEVEL_STEP_MS, 0.02);
  _C.buildVideoSpans(s.events, dur).forEach(function (sp){
    var link = newId('l'), len = sp.sessionEnd - sp.sessionStart;
    if (len <= 0) return;
    if (sp.type === 'play'){
      p.tracks[0].clips.push({ id: newId('c'), type: 'video', asset: 'movie', start: sp.sessionStart, dur: len, in: sp.movieStart, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: link });
      p.tracks[1].clips.push({ id: newId('c'), type: 'audio', asset: 'movie', start: sp.sessionStart, dur: len, in: sp.movieStart, speed: 1, volume: 1,
        gain: gainSlice(pts, sp.sessionStart, sp.sessionEnd), fadeIn: 0, fadeOut: 0, link: link });
    } else {
      p.tracks[0].clips.push({ id: newId('c'), type: 'freeze', asset: 'movie', start: sp.sessionStart, dur: len, in: sp.movieAt, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: link });
    }
  });
  var off = Math.round((s.voiceOffsetMs || 0) + (s.voiceNudgeMs || 0));
  var vStart = Math.max(0, off), vIn = Math.max(0, -off), vDur = Math.max(0, dur - vStart);
  if (s.voiceDurMs) vDur = Math.min(vDur, s.voiceDurMs - vIn);
  p.tracks[2].clips.push({ id: newId('c'), type: 'audio', asset: 'voice', start: vStart, dur: vDur, in: vIn, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 });
  if (s.music){
    p.assets.music = { type: 'audio', name: 'music', durMs: s.music.durMs || null };
    var mStart = s.music.startMs || 0, mDur = Math.max(0, dur - mStart);
    if (s.music.durMs) mDur = Math.min(mDur, s.music.durMs);
    p.tracks.push({ id: 't-music', kind: 'audio', role: 'music', muted: false, hidden: false, volume: 1, locked: false, clips: [
      { id: newId('c'), type: 'audio', asset: 'music', start: mStart, dur: mDur, in: 0, speed: 1, volume: s.music.volume != null ? s.music.volume : 0.7,
        fadeIn: s.music.fadeInMs || 0, fadeOut: s.music.fadeOutMs || 0 }] });
  }
  return finish(p);
}

// ---------- editing ----------
// Cut every clip that crosses time t into two (video and its linked sound stay in step).
function splitAt(p, t){
  var q = cloneProject(p), rightLink = {};
  q.tracks.forEach(function (tr){
    var out = [];
    tr.clips.forEach(function (c){
      if (!(c.start < t && t < clipEnd(c))) { out.push(c); return; }
      var left = sliceClip(c, c.start, t), right = sliceClip(c, t, clipEnd(c));
      left.id = c.id;
      if (c.link){ rightLink[c.link] = rightLink[c.link] || newId('l'); right.link = rightLink[c.link]; }
      out.push(left, right);
    });
    tr.clips = out;
  });
  return finish(q);
}

// Remove the time range [a,b) from EVERY track and close the gap (later content moves earlier).
function rippleDelete(p, a, b){
  a = Math.round(a); b = Math.round(b);
  if (!(b > a) || a < 0) return p;
  var q = cloneProject(p), gap = b - a, rightLink = {};
  q.tracks.forEach(function (tr){
    var out = [];
    tr.clips.forEach(function (c){
      var e = clipEnd(c);
      if (e <= a) { out.push(c); return; }
      if (c.start >= b) { c.start -= gap; out.push(c); return; }
      if (c.start < a){ var l = sliceClip(c, c.start, a); l.id = c.id; out.push(l); }
      if (e > b){
        var r = sliceClip(c, b, e); r.start -= gap;
        if (c.link){ rightLink[c.link] = rightLink[c.link] || newId('l'); r.link = rightLink[c.link]; }
        if (c.start >= a) r.id = c.id;
        out.push(r);
      }
    });
    tr.clips = out;
  });
  if (p.levels && p.levels.length){
    var s0 = Math.round(a / _C.LEVEL_STEP_MS), n = Math.round(gap / _C.LEVEL_STEP_MS);
    q.levels = p.levels.slice(0, s0).concat(p.levels.slice(s0 + n));
  }
  return finish(q);
}
function rippleDeleteRanges(p, ranges){   // several cuts at once; done last-to-first so positions stay valid
  return ranges.slice().sort(function (x, y){ return y.start - x.start; })
    .reduce(function (acc, r){ return rippleDelete(acc, r.start, r.end); }, p);
}

function linkedIds(p, id){
  var f = findClip(p, id); if (!f) return [];
  var ids = [id];
  if (f.clip.link) p.tracks.forEach(function (tr){ tr.clips.forEach(function (c){ if (c.link === f.clip.link && c.id !== id) ids.push(c.id); }); });
  return ids;
}
// The clip and its linked partner (a movie clip and its sound), as { track, clip } pairs.
function linkedClips(p, id){ return linkedIds(p, id).map(function (cid){ return findClip(p, cid); }); }
function deleteClip(p, id){   // removes the clip and its linked partner, leaving a gap
  var ids = linkedIds(p, id); if (!ids.length) return p;
  var q = cloneProject(p);
  q.tracks.forEach(function (tr){ tr.clips = tr.clips.filter(function (c){ return ids.indexOf(c.id) < 0; }); });
  return finish(q);
}
function maxDur(p, c){   // how long this clip could be at most, given its source
  if (c.type === 'freeze' || c.type === 'text') return Infinity;
  if (c.reverse) return Math.floor((c.in + c.dur * (c.speed || 1)) / (c.speed || 1));   // lengthening it reads the movie further back, down to 0
  var d = p.assets[c.asset] && p.assets[c.asset].durMs;
  return d ? Math.floor((d - c.in) / (c.speed || 1)) : Infinity;
}
function trimClipEnd(p, id, newEnd){
  var q = cloneProject(p);
  linkedIds(q, id).forEach(function (cid){
    var c = findClip(q, cid).clip, nd = Math.min(Math.round(newEnd) - c.start, maxDur(q, c));
    if (nd <= 0) return;
    if (c.gain && c.gain.length){
      if (nd < c.dur) c.gain = gainSlice(c.gain, 0, nd); else if (nd > c.dur) c.gain.push([nd, c.gain[c.gain.length - 1][1]]);
    }
    c.fadeOutOff = 0;
    if (c.reverse && c.type !== 'freeze') c.in = Math.max(0, c.in + Math.round((c.dur - nd) * (c.speed || 1)));
    c.dur = nd;
  });
  return validate(q).length ? p : finish(q);
}
function trimClipStart(p, id, newStart){
  var q = cloneProject(p);
  linkedIds(q, id).forEach(function (cid){
    var c = findClip(q, cid).clip, delta = Math.round(newStart) - c.start, sp = c.speed || 1;
    if (delta >= c.dur || c.start + delta < 0) return;
    if (c.type !== 'freeze' && c.type !== 'text'){
      if (c.reverse){ var D = q.assets[c.asset] && q.assets[c.asset].durMs; if (delta < 0 && D && c.in + (c.dur - delta) * sp > D) return; }
      else { if (c.in + delta * sp < 0) return; c.in += Math.round(delta * sp); }
    }
    if (c.gain && c.gain.length){
      if (delta > 0) c.gain = gainSlice(c.gain, delta, c.dur);
      else if (delta < 0) c.gain = [[0, c.gain[0][1]]].concat(c.gain.map(function (pt){ return [pt[0] - delta, pt[1]]; }));
    }
    c.fadeInOff = 0;
    c.start += delta; c.dur -= delta;
  });
  return validate(q).length ? p : finish(q);
}
function moveClip(p, id, newStart){   // moves the clip and its linked partner; refuses if it would overlap another clip
  var ids = linkedIds(p, id), f = findClip(p, id); if (!f) return p;
  var delta = Math.round(newStart) - f.clip.start;
  if (f.clip.start + delta < 0) return p;
  var q = cloneProject(p);
  ids.forEach(function (cid){ findClip(q, cid).clip.start += delta; });
  return validate(q).length ? p : finish(q);
}
function setClipProps(p, id, patch){
  var ok = ['volume', 'fadeIn', 'fadeOut', 'fadeInOff', 'fadeOutOff', 'gain', 'speed'], q = cloneProject(p), f = findClip(q, id); if (!f) return p;
  ok.forEach(function (k){ if (patch[k] !== undefined) f.clip[k] = patch[k]; });
  return finish(q);
}
function setTrackProps(p, trackId, patch){
  var ok = ['muted', 'hidden', 'volume', 'locked'], q = cloneProject(p);
  var tr = q.tracks.filter(function (t){ return t.id === trackId; })[0]; if (!tr) return p;
  ok.forEach(function (k){ if (patch[k] !== undefined) tr[k] = patch[k]; });
  return q;
}

// ---------- reading ----------
function clipGainAt(tr, c, t){
  if (tr.muted) return 0;
  var rel = t - c.start, g = (tr.volume != null ? tr.volume : 1) * (c.volume != null ? c.volume : 1) * gainAt(c.gain, rel);
  if (c.fadeIn > 0){ var xi = rel + (c.fadeInOff || 0); if (xi < c.fadeIn) g *= xi / c.fadeIn; }
  if (c.fadeOut > 0){ var xo = c.dur + (c.fadeOutOff || 0) - rel; if (xo < c.fadeOut) g *= Math.max(0, xo / c.fadeOut); }
  return g;
}
// What is on screen and what is audible at timeline time t.
function sourceAt(p, t){
  var out = { video: null, audio: [] };
  p.tracks.forEach(function (tr){
    tr.clips.forEach(function (c){
      if (!(c.start <= t && t < clipEnd(c))) return;
      var srcMs = c.type === 'freeze' ? c.in : c.reverse ? c.in + (c.dur - (t - c.start)) * (c.speed || 1) : c.in + (t - c.start) * (c.speed || 1);
      if (tr.kind === 'video'){ if (!tr.hidden) out.video = { clip: c, type: c.type, movieMs: srcMs }; }
      else if (tr.kind === 'audio') out.audio.push({ role: tr.role, clip: c, sourceMs: srcMs, gain: clipGainAt(tr, c, t) });
    });
  });
  return out;
}
function validate(p){
  var errs = [];
  p.tracks.forEach(function (tr){
    var cs = tr.clips.slice().sort(function (a, b){ return a.start - b.start; });
    cs.forEach(function (c, i){
      if (!(c.dur > 0)) errs.push(tr.id + ': clip ' + c.id + ' has no length');
      if (c.start < 0) errs.push(tr.id + ': clip ' + c.id + ' starts before 0');
      if (c.type !== 'text' && !p.assets[c.asset]) errs.push(tr.id + ': clip ' + c.id + ' uses missing asset ' + c.asset);
      if (i > 0 && cs[i - 1].start + cs[i - 1].dur > c.start) errs.push(tr.id + ': clips overlap at ' + c.start);
    });
  });
  return errs;
}
function snapTime(p, t, thresholdMs, extra, skipIds){   // nearest clip edge (or extra point such as the playhead) within the threshold; skipIds = clips to ignore (the one being dragged)
  var best = t, bd = thresholdMs + 1;
  var pts = (extra || []).concat([0]);
  p.tracks.forEach(function (tr){ tr.clips.forEach(function (c){ if (skipIds && skipIds.indexOf(c.id) >= 0) return; pts.push(c.start, clipEnd(c)); }); });
  pts.forEach(function (x){ var d = Math.abs(x - t); if (d < bd){ bd = d; best = x; } });
  return bd <= thresholdMs ? best : t;
}

// ---------- automatic cutting ----------
// Stretches where the microphone stayed quiet. padMs keeps a little breathing room at each end.
function findSilentRanges(levels, o){
  o = Object.assign({ thresholdDb: -45, minMs: 700, padMs: 150 }, o || {});
  var step = _C.LEVEL_STEP_MS, out = [], runStart = -1;
  function close(endIdx){
    if (runStart < 0) return;
    var s0 = runStart * step, e0 = endIdx * step;
    if (e0 - s0 >= o.minMs && e0 - s0 - 2 * o.padMs > 0) out.push({ start: s0 + o.padMs, end: e0 - o.padMs });
    runStart = -1;
  }
  for (var i = 0; i < levels.length; i++){
    if (_C.byteToDb(levels[i]) < o.thresholdDb){ if (runStart < 0) runStart = i; } else close(i);
  }
  close(levels.length);
  return out;
}
function freezeRanges(p){   // where the picture is held (no movie playing)
  var out = [];
  p.tracks.forEach(function (tr){ if (tr.kind === 'video') tr.clips.forEach(function (c){ if (c.type === 'freeze') out.push({ start: c.start, end: clipEnd(c) }); }); });
  return out.sort(function (a, b){ return a.start - b.start; });
}
function intersectRanges(A, B){
  var out = [];
  A.forEach(function (a){ B.forEach(function (b){ var s0 = Math.max(a.start, b.start), e0 = Math.min(a.end, b.end); if (e0 > s0) out.push({ start: s0, end: e0 }); }); });
  return out.sort(function (a, b){ return a.start - b.start; });
}

// ---------- text, speed, fades, filters, freeze frames, music ----------
// Text lives on its own track (kind 'text'). Text clips split, trim, move and cut like any other clip.
var TEXT_DEFAULTS = { text: 'Your text', size: 7, color: '#ffffff', pos: 'bottom', weight: 700, bg: false };
function textTrackOf(p){ return p.tracks.filter(function (t){ return t.kind === 'text' && t.role === 'text'; })[0] || null; }
function addTextClip(p, t, dur, out){
  t = Math.round(t); dur = Math.round(dur || 3000);
  var total = p.durationMs; if (!(total > 0)) return p;
  var q = cloneProject(p), tr = textTrackOf(q);
  if (!tr){ tr = { id: 't-text', kind: 'text', role: 'text', muted: false, hidden: false, volume: 1, locked: false, clips: [] }; q.tracks.push(tr); }
  var start = Math.max(0, Math.min(t, total)), moved = true;
  while (moved){ moved = false; tr.clips.forEach(function (c){ if (start >= c.start && start < clipEnd(c)){ start = clipEnd(c); moved = true; } }); }
  var d = Math.min(dur, total - start), nextStart = null;
  tr.clips.forEach(function (c){ if (c.start >= start && (nextStart === null || c.start < nextStart)) nextStart = c.start; });
  if (nextStart !== null) d = Math.min(d, nextStart - start);
  if (d < 300) return p;
  var clip = Object.assign({ id: newId('c'), type: 'text', asset: null, start: start, dur: d, in: 0, speed: 1 }, TEXT_DEFAULTS);
  tr.clips.push(clip); if (out) out.id = clip.id;
  return finish(q);
}
var TEXT_FONTS = ['sans', 'serif', 'mono', 'bold', 'script'];
// Changes the look of one text clip (in place). size 3 to 16 (% of the picture height), font, outline 0 to 1 and shadow 0 to 1
// (shadow 1 is the look titles always had, so it is not stored; outline 0 is not stored either).
function applyTextPatch(clip, patch){
  ['text', 'size', 'color', 'pos', 'weight', 'bg'].forEach(function (k){ if (patch[k] !== undefined) clip[k] = patch[k]; });
  clip.size = Math.max(3, Math.min(16, +clip.size || 7));
  if (patch.font !== undefined){ if (patch.font && patch.font !== 'sans' && TEXT_FONTS.indexOf(patch.font) >= 0) clip.font = patch.font; else delete clip.font; }
  if (patch.outline !== undefined){ var o = r3(Math.max(0, Math.min(1, +patch.outline || 0))); if (o > 0) clip.outline = o; else delete clip.outline; }
  if (patch.shadow !== undefined){ var sh = r3(Math.max(0, Math.min(1, isNaN(+patch.shadow) ? 1 : +patch.shadow))); if (sh < 1) clip.shadow = sh; else delete clip.shadow; }
}
function setTextProps(p, id, patch){
  var q = cloneProject(p), f = findClip(q, id);
  if (!f || f.clip.type !== 'text') return p;
  applyTextPatch(f.clip, patch || {});
  return finish(q);
}
function textsAt(p, t){
  var out = [];
  p.tracks.forEach(function (tr){ if (tr.kind !== 'text' || tr.hidden) return; tr.clips.forEach(function (c){ if (c.start <= t && t < clipEnd(c)) out.push(c); }); });
  return out;
}

// Speed of a movie clip (0.25x to 4x). Its linked sound changes with it, and the movie clips after it
// move up or back so the picture stays in one piece. Voice, music and text stay where they are.
function setClipSpeed(p, id, speed){
  speed = Math.round(Math.max(0.25, Math.min(4, +speed || 1)) * 100) / 100;
  var f = findClip(p, id); if (!f || f.clip.type !== 'video') return p;
  var old = f.clip.speed || 1; if (Math.abs(old - speed) < 0.001) return p;
  var q = cloneProject(p), ids = linkedIds(q, id), c0 = findClip(q, id).clip;
  var oldDur = c0.dur, newDur = Math.max(1, Math.round(oldDur * old / speed)), delta = newDur - oldDur, ratio = newDur / oldDur, anchor = c0.start + oldDur;
  ids.forEach(function (cid){
    var c = findClip(q, cid).clip; c.speed = speed; c.dur = newDur;
    if (c.gain && c.gain.length) c.gain = c.gain.map(function (pt){ return [Math.round(pt[0] * ratio), pt[1]]; });
    c.fadeInOff = Math.round((c.fadeInOff || 0) * ratio); c.fadeOutOff = Math.round((c.fadeOutOff || 0) * ratio);
    c.fadeIn = Math.min(c.fadeIn || 0, Math.floor(newDur / 2)); c.fadeOut = Math.min(c.fadeOut || 0, Math.floor(newDur / 2));
    if (c.vFadeIn) c.vFadeIn = Math.min(c.vFadeIn, Math.floor(newDur / 2)); if (c.vFadeOut) c.vFadeOut = Math.min(c.vFadeOut, Math.floor(newDur / 2));
  });
  q.tracks.forEach(function (tr){
    if (tr.role !== 'movie' && tr.role !== 'movieSound') return;
    tr.clips.forEach(function (c){ if (ids.indexOf(c.id) < 0 && c.start >= anchor) c.start += delta; });
  });
  return validate(q).length ? p : finish(q);
}

// "Fade through black" at the start and/or end of a picture clip (ms). Sound is not touched.
function setVFade(p, id, patch){
  var q = cloneProject(p), f = findClip(q, id); if (!f || f.track.kind !== 'video') return p;
  var maxF = Math.min(1500, Math.floor(f.clip.dur / 2));
  ['vFadeIn', 'vFadeOut'].forEach(function (k){ if (patch[k] !== undefined){ var v = Math.max(0, Math.min(maxF, Math.round(+patch[k] || 0))); if (v) f.clip[k] = v; else delete f.clip[k]; } });
  return finish(q);
}

// Brightness / contrast / colour for one picture clip, or for all of them when id is null. The "More adjust" looks
// (warmth, sharpen, vignette, matte; see look.js) live in the same object and are only stored when they are not zero.
function setFilter(p, id, patch){
  var q = cloneProject(p), targets = [];
  q.tracks.forEach(function (tr){ if (tr.kind === 'video') tr.clips.forEach(function (c){ if (id === null || c.id === id) targets.push(c); }); });
  if (!targets.length) return p;
  targets.forEach(function (c){
    var f = Object.assign({ brightness: 1, contrast: 1, saturate: 1 }, c.filter || {}, patch || {});
    f.brightness = Math.max(0.4, Math.min(1.6, +f.brightness || 1)); f.contrast = Math.max(0.4, Math.min(1.6, +f.contrast || 1)); f.saturate = Math.max(0, Math.min(2, f.saturate == null ? 1 : +f.saturate));
    var neutral = Math.abs(f.brightness - 1) < 0.001 && Math.abs(f.contrast - 1) < 0.001 && Math.abs(f.saturate - 1) < 0.001;
    ['warmth', 'sharpen', 'vignette', 'matte'].forEach(function (k){
      var v = +f[k]; if (isNaN(v)) v = 0;
      v = r3(Math.max(k === 'warmth' ? -1 : 0, Math.min(1, v)));
      if (Math.abs(v) < 0.001) delete f[k]; else { f[k] = v; neutral = false; }
    });
    if (neutral) delete c.filter; else c.filter = f;
  });
  return finish(q);
}

// Holds the picture still at time t for dur ms. Everything after t (picture, movie sound, voice, text) moves
// later by dur so nothing slips out of step; the voice simply has a silent gap there. Music keeps playing.
// The held picture keeps the look (colour, opacity, zoom / turn / flip) of the clip it is cut out of.
function insertFreeze(p, t, dur){
  t = Math.round(t); dur = Math.round(dur);
  if (!(dur > 0)) return p;
  var s = sourceAt(p, t); if (!s.video) return p;
  var inFreeze = s.video.type === 'freeze', movieMs = Math.round(s.video.movieMs);
  var look = {};
  ['filter', 'opacity', 'transform'].forEach(function (k){ if (s.video.clip[k] !== undefined) look[k] = JSON.parse(JSON.stringify(s.video.clip[k])); });
  var q = cloneProject(p), rightLink = {};
  q.tracks.forEach(function (tr){
    if (tr.role === 'music') return;
    var out = [];
    tr.clips.forEach(function (c){
      var e = clipEnd(c);
      if (tr.kind === 'text' || tr.kind === 'sticker'){ if (c.start >= t) c.start += dur; else if (e > t) c.dur += dur; out.push(c); return; }
      if (inFreeze && tr.role === 'movie' && c.start <= t && t < e){ c.dur += dur; out.push(c); return; }
      if (c.start >= t){ c.start += dur; out.push(c); return; }
      if (e <= t){ out.push(c); return; }
      var left = sliceClip(c, c.start, t), right = sliceClip(c, t, e); left.id = c.id; right.start += dur;
      if (c.link){ rightLink[c.link] = rightLink[c.link] || newId('l'); right.link = rightLink[c.link]; }
      out.push(left, right);
    });
    if (tr.role === 'movie' && !inFreeze)
      out.push(Object.assign({ id: newId('c'), type: 'freeze', asset: 'movie', start: t, dur: dur, in: movieMs, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, link: newId('l') }, look));
    tr.clips = out;
  });
  if (p.levels && p.levels.length){
    var at = Math.min(p.levels.length, Math.round(t / _C.LEVEL_STEP_MS)), n = Math.round(dur / _C.LEVEL_STEP_MS), gap = [];
    for (var i = 0; i < n; i++) gap.push(0);
    q.levels = p.levels.slice(0, at).concat(gap, p.levels.slice(at));
  }
  return finish(q);
}

// ---------- opacity, zoom / rotate / flip, duplicate ----------
// The picture clips an edit should work on: the one with this id, or all of them when id is null.
function pictureClips(q, id){
  var out = [];
  q.tracks.forEach(function (tr){ if (tr.kind === 'video') tr.clips.forEach(function (c){ if (id === null || c.id === id) out.push(c); }); });
  return out;
}
// Opacity (0 to 1) of a picture clip, or of every picture clip when id is null. 1 means "normal" and is not stored.
function setOpacity(p, id, v){
  var q = cloneProject(p), list = pictureClips(q, id); if (!list.length) return p;
  v = Math.max(0, Math.min(1, +v)); if (isNaN(v)) return p;
  list.forEach(function (c){ if (v > 0.999) delete c.opacity; else c.opacity = r3(v); });
  return finish(q);
}
// Zoom (1x to 4x), where the zoomed window sits (x, y from -1 to 1), turns in steps of 90 degrees, and flip.
// The default look is not stored. Rotation and flip come first, then zoom works on what you see.
// id null = every picture clip (each keeps the parts of its framing the patch does not mention).
var TRANSFORM_DEFAULT = { zoom: 1, x: 0, y: 0, rot: 0, flipH: false };
function setTransform(p, id, patch){
  var q = cloneProject(p), list = pictureClips(q, id); if (!list.length) return p;
  list.forEach(function (c){
    var t = Object.assign({}, TRANSFORM_DEFAULT, c.transform || {}, patch || {});
    t.zoom = r3(Math.max(1, Math.min(4, +t.zoom || 1)));
    t.x = t.zoom === 1 ? 0 : r3(Math.max(-1, Math.min(1, +t.x || 0))); t.y = t.zoom === 1 ? 0 : r3(Math.max(-1, Math.min(1, +t.y || 0)));
    t.rot = (((Math.round((+t.rot || 0) / 90) * 90) % 360) + 360) % 360; t.flipH = !!t.flipH;
    if (t.zoom === 1 && t.rot === 0 && !t.flipH) delete c.transform; else c.transform = t;
  });
  return finish(q);
}
// Copies a clip right after itself. A movie clip and its sound are copied together and the movie clips after
// them move later (voice, music and text stay put). Voice, music and text copies go into the next free space.
function duplicateClip(p, id, out){
  var f = findClip(p, id); if (!f) return p;
  var q = cloneProject(p), role = f.track.role, base = findClip(q, id), c0 = base.clip, end0 = clipEnd(c0), dur = c0.dur;
  if (role === 'movie' || role === 'movieSound'){
    var ids = linkedIds(q, id), link = newId('l'), mine = null;
    q.tracks.forEach(function (tr){
      if (tr.role !== 'movie' && tr.role !== 'movieSound') return;
      tr.clips.forEach(function (c){ if (c.start >= end0) c.start += dur; });
    });
    ids.forEach(function (cid){
      var f2 = findClip(q, cid), copy = JSON.parse(JSON.stringify(f2.clip));
      copy.id = newId('c'); copy.start = end0; if (copy.link) copy.link = link;
      f2.track.clips.push(copy); if (cid === id) mine = copy.id;
    });
    if (out) out.id = mine;
    return finish(q);
  }
  var total = p.durationMs, track = base.track, start = end0, moved = true;
  while (moved){ moved = false; track.clips.forEach(function (c){ if (start < clipEnd(c) && start + dur > c.start){ start = clipEnd(c); moved = true; } }); }
  var d = Math.min(dur, total - start); if (d < 300) return p;
  var copy = JSON.parse(JSON.stringify(c0)); copy.id = newId('c'); copy.start = start; copy.dur = d; delete copy.link;
  if (copy.gain && copy.gain.length) copy.gain = gainSlice(c0.gain, 0, d);
  if (d < dur){ copy.fadeOut = 0; copy.fadeOutOff = 0; }
  track.clips.push(copy); if (out) out.id = copy.id;
  return finish(q);
}

// ---------- reverse ----------
// Plays a movie clip backwards: the same stretch of the movie, last picture first. Its linked movie sound is
// reversed with it. A paused picture has nothing to play backwards. on = true / false, or leave out to switch.
function setReverse(p, id, on){
  var f = findClip(p, id); if (!f || f.track.kind !== 'video' || f.clip.type !== 'video') return p;
  var want = on === undefined ? !f.clip.reverse : !!on;
  if (want === !!f.clip.reverse) return p;
  var q = cloneProject(p);
  linkedIds(q, id).forEach(function (cid){ var c = findClip(q, cid).clip; if (want) c.reverse = true; else delete c.reverse; });
  return finish(q);
}

// ---------- replacing the movie file ----------
// How far into the movie file the edits reach (ms): the latest stretch of the movie any picture clip uses.
function movieNeeded(p){
  var need = 0;
  p.tracks.forEach(function (tr){
    if (tr.kind !== 'video') return;
    tr.clips.forEach(function (c){ need = Math.max(need, c.type === 'freeze' ? c.in : c.in + c.dur * (c.speed || 1)); });
  });
  return Math.round(need);
}
// Points the project at a different movie file (same movie, another copy): only the name and length change,
// so every cut, title and look stays. info = { name, durMs }
function setMovieAsset(p, info){
  var q = cloneProject(p); if (!q.assets.movie) return p;
  if (info && info.name) q.assets.movie.name = info.name;
  q.assets.movie.durMs = (info && info.durMs) || null;
  return q;
}

// ---------- captions (subtitles) ----------
// Captions are text clips on a track of their own, so they cut, move and trim like any clip and your titles stay separate.
// Their times are on the timeline of the edited video.
var CAPTION_STYLE = { size: 5, color: '#ffffff', pos: 'bottom', weight: 700, bg: true };
function captionTrackOf(p){ return p.tracks.filter(function (t){ return t.kind === 'text' && t.role === 'captions'; })[0] || null; }
function ensureCaptionTrack(q){
  var tr = captionTrackOf(q);
  if (!tr){ tr = { id: 't-captions', kind: 'text', role: 'captions', muted: false, hidden: false, volume: 1, locked: false, clips: [] }; q.tracks.push(tr); }
  return tr;
}
// items = [{ startMs, endMs, text }]. Lines that run into the next one are shortened to end where it starts; lines that
// start after the end of the video, are shorter than 0.2 s, or land on an existing caption are skipped (counted in out.skipped).
// opts.replace = true removes the captions you already have first.
function addCaptions(p, items, opts, out){
  opts = opts || {};
  var total = p.durationMs; if (!(total > 0)) return p;
  var q = cloneProject(p), tr = ensureCaptionTrack(q), added = 0, skipped = 0;
  if (opts.replace) tr.clips = [];
  var list = (items || []).map(function (it){ return { s: Math.round(+it.startMs), e: Math.round(+it.endMs), t: String(it.text == null ? '' : it.text).trim() }; })
    .filter(function (it){ return it.t && isFinite(it.s) && isFinite(it.e); }).sort(function (a, b){ return a.s - b.s; });
  list.forEach(function (it, i){
    var s0 = Math.max(0, it.s), e0 = Math.min(total, it.e), next = list[i + 1];
    if (next && next.s < e0) e0 = Math.max(s0, next.s);
    var clash = tr.clips.some(function (c){ return s0 < clipEnd(c) && e0 > c.start; });
    if (e0 - s0 < 200 || clash){ skipped++; return; }
    tr.clips.push(Object.assign({ id: newId('c'), type: 'text', asset: null, start: s0, dur: e0 - s0, in: 0, speed: 1, text: it.t, caption: true }, CAPTION_STYLE));
    added++;
  });
  if (out){ out.added = added; out.skipped = skipped; }
  if (!added && !opts.replace) return p;
  return finish(q);
}
// One caption line at time t (it moves past a caption that is already there, and stops where the next one starts).
function addCaptionLine(p, t, dur, out){
  t = Math.round(t); dur = Math.round(dur || 2500);
  var total = p.durationMs; if (!(total > 0)) return p;
  var q = cloneProject(p), tr = ensureCaptionTrack(q), start = Math.max(0, Math.min(t, total)), moved = true;
  while (moved){ moved = false; tr.clips.forEach(function (c){ if (start >= c.start && start < clipEnd(c)){ start = clipEnd(c); moved = true; } }); }
  var d = Math.min(dur, total - start), nextStart = null;
  tr.clips.forEach(function (c){ if (c.start >= start && (nextStart === null || c.start < nextStart)) nextStart = c.start; });
  if (nextStart !== null) d = Math.min(d, nextStart - start);
  if (d < 300) return p;
  var clip = Object.assign({ id: newId('c'), type: 'text', asset: null, start: start, dur: d, in: 0, speed: 1, text: 'Caption', caption: true }, CAPTION_STYLE);
  tr.clips.push(clip); if (out) out.id = clip.id;
  return finish(q);
}
function captionList(p){
  var tr = captionTrackOf(p);
  return tr ? tr.clips.slice().sort(function (a, b){ return a.start - b.start; }).map(function (c){ return { id: c.id, start: c.start, end: clipEnd(c), text: c.text || '' }; }) : [];
}
// Gives every caption the same look (size, colour, position, weight, box, font, outline, shadow).
function setCaptionStyle(p, patch){
  var tr = captionTrackOf(p); if (!tr || !tr.clips.length) return p;
  var q = cloneProject(p), style = {};
  ['size', 'color', 'pos', 'weight', 'bg', 'font', 'outline', 'shadow'].forEach(function (k){ if (patch[k] !== undefined) style[k] = patch[k]; });
  captionTrackOf(q).clips.forEach(function (c){ applyTextPatch(c, style); });
  return finish(q);
}
function removeCaptions(p){
  if (!captionTrackOf(p)) return p;
  var q = cloneProject(p); q.tracks = q.tracks.filter(function (t){ return !(t.kind === 'text' && t.role === 'captions'); });
  return finish(q);
}
// ----- .srt files -----
function parseSrt(text){
  var out = [], s = String(text == null ? '' : text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!s) return out;
  var T = '(?:(\\d{1,2}):)?(\\d{1,2}):(\\d{2})[,.](\\d{1,3})', re = new RegExp('^\\s*' + T + '\\s*-->\\s*' + T);
  function ms(h, m, sec, fr){ return (((+h || 0) * 60 + (+m)) * 60 + (+sec)) * 1000 + (+((fr + '00').slice(0, 3))); }
  s.split(/\n{2,}/).forEach(function (block){
    var lines = block.split('\n'), i = 0;
    if (lines.length > 1 && /^\d+$/.test(lines[0].trim()) && lines[1].indexOf('-->') >= 0) i = 1;
    var m = re.exec(lines[i] || ''); if (!m) return;
    var txt = lines.slice(i + 1).join('\n').replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').trim();
    if (txt) out.push({ startMs: ms(m[1], m[2], m[3], m[4]), endMs: ms(m[5], m[6], m[7], m[8]), text: txt });
  });
  return out;
}
function srtTime(ms){
  ms = Math.max(0, Math.round(ms)); var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000;
  function z(n, w){ return String(n).padStart(w, '0'); }
  return z(h, 2) + ':' + z(m, 2) + ':' + z(s, 2) + ',' + z(r, 3);
}
// The captions as an .srt file. With no captions, the titles are written instead, so something is always saved.
function toSrt(p){
  var items = captionList(p);
  if (!items.length) p.tracks.forEach(function (tr){ if (tr.kind === 'text') tr.clips.forEach(function (c){ items.push({ start: c.start, end: clipEnd(c), text: c.text || '' }); }); });
  items.sort(function (a, b){ return a.start - b.start; });
  return items.map(function (it, i){ return (i + 1) + '\n' + srtTime(it.start) + ' --> ' + srtTime(it.end) + '\n' + it.text + '\n'; }).join('\n');
}

// ---------- detach audio ----------
// Lets a movie clip and its sound go their own ways: afterwards the sound can be moved, trimmed or deleted without the picture
// (and the picture without the sound). They still cut together; a speed change no longer reaches the detached sound.
function detachAudio(p, id){
  var ids = linkedIds(p, id); if (ids.length < 2) return p;
  var q = cloneProject(p);
  ids.forEach(function (cid){ delete findClip(q, cid).clip.link; });
  return finish(q);
}

// ---------- voice timing ----------
// Moves the voice track by deltaMs (positive = later) without touching anything else, so the "Voice timing"
// slider can change after edits were made. The same result as building the project again with the new timing:
// the voice never starts before 0, never runs past the end of the video, and a voice that reached the end
// before is carried back out to the end when it moves earlier (as far as the recording has sound).
function shiftVoice(p, deltaMs){
  deltaMs = Math.round(deltaMs);
  if (!deltaMs) return p;
  var q = cloneProject(p), end = p.durationMs, vd = p.assets.voice && p.assets.voice.durMs;
  q.tracks.forEach(function (tr){
    if (tr.role !== 'voice') return;
    tr.clips.forEach(function (c){
      var wasAtEnd = clipEnd(c) >= end - 1, s = c.start + deltaMs, oldDur = c.dur;
      if (s < 0){
        var cut = -s;
        c.in += cut; c.dur -= cut; s = 0; c.fadeInOff = 0;
        if (c.gain && c.gain.length && c.dur > 0) c.gain = gainSlice(c.gain, cut, oldDur);
      }
      c.start = s;
      if (deltaMs < 0 && wasAtEnd && c.dur > 0){
        var want = Math.min(c.dur - deltaMs, end - c.start);
        if (vd) want = Math.min(want, vd - c.in);
        if (want > c.dur){
          if (c.gain && c.gain.length) c.gain.push([want, c.gain[c.gain.length - 1][1]]);
          c.dur = want; c.fadeOutOff = 0;
        }
      }
      if (c.start + c.dur > end){
        var nd = end - c.start;
        if (c.gain && c.gain.length && nd > 0) c.gain = gainSlice(c.gain, 0, nd);
        c.dur = nd; c.fadeOutOff = 0;
      }
    });
  });
  return finish(q);
}

// Background music: adds the music track (or swaps the file behind the existing one). info = { name, durMs }
function ensureMusic(p, info){
  var q = cloneProject(p), dm = (info && info.durMs) || null;
  q.assets.music = { type: 'audio', name: (info && info.name) || 'music', durMs: dm };
  var tr = q.tracks.filter(function (t){ return t.role === 'music'; })[0];
  if (tr && tr.clips.length){
    tr.clips.forEach(function (c){ if (dm) c.dur = Math.max(1, Math.min(c.dur, dm - c.in)); });
    return finish(q);
  }
  var total = q.durationMs, d = dm ? Math.min(dm, total) : total;
  if (!(d > 0)) return p;
  if (!tr){ tr = { id: 't-music', kind: 'audio', role: 'music', muted: false, hidden: false, volume: 1, locked: false, clips: [] }; q.tracks.splice(3, 0, tr); }
  tr.clips.push({ id: newId('c'), type: 'audio', asset: 'music', start: 0, dur: d, in: 0, speed: 1, volume: 0.7, fadeIn: 0, fadeOut: Math.min(1500, Math.floor(d / 2)) });
  return finish(q);
}
function removeMusic(p){
  var q = cloneProject(p);
  q.tracks = q.tracks.filter(function (t){ return t.role !== 'music'; }); delete q.assets.music;
  return finish(q);
}

// ---------- moving, joining and closing gaps (CapCut style) ----------
function byStart(a, b){ return a.start - b.start; }
// Where a dropped clip lands. Like CapCut's main track: the clip goes where you drop it when there is room. If it would land on other
// clips it is placed before or after them (whichever side its middle is nearer) and the clips behind it are pushed later, just far
// enough. A drop never cuts another clip in two. A clip's linked partner (a movie clip and its sound) always moves with it.
function planPlace(p, id, newStart){
  var f = findClip(p, id); if (!f) return null;
  var ids = linkedIds(p, id), L = f.clip.dur, S = Math.max(0, Math.round(newStart));
  var rest = f.track.clips.filter(function (c){ return ids.indexOf(c.id) < 0; }).sort(byStart), idx = 0;
  while (idx < rest.length && rest[idx].start + rest[idx].dur / 2 < S + L / 2) idx++;
  var start = Math.max(S, idx ? clipEnd(rest[idx - 1]) : 0), cursor = start + L, shifts = {}, pushed = false;
  for (var j = idx; j < rest.length; j++){
    if (rest[j].start >= cursor) break;
    shifts[rest[j].id] = cursor - rest[j].start; cursor += rest[j].dur; pushed = true;
  }
  return { start: start, shifts: shifts, pushed: pushed };
}
function placeClip(p, id, newStart){
  var f = findClip(p, id), pl = f && planPlace(p, id, newStart); if (!pl) return p;
  var delta = pl.start - f.clip.start; if (!delta && !pl.pushed) return p;
  var q = cloneProject(p), ids = linkedIds(q, id);
  ids.forEach(function (cid){ findClip(q, cid).clip.start += delta; });
  Object.keys(pl.shifts).forEach(function (rid){
    linkedIds(q, rid).forEach(function (cid){ if (ids.indexOf(cid) < 0) findClip(q, cid).clip.start += pl.shifts[rid]; });
  });
  return validate(q).length ? p : finish(q);
}

// Closes the empty space between picture clips (and their sound) so they touch, starting at 0. Voice, music and text stay where they are.
// atMs given: only the gap that contains that moment is closed. Nothing to close: the same project comes back.
function closeGaps(p, atMs){
  var lane = p.tracks.filter(function (t){ return t.role === 'movie'; })[0]; if (!lane) return p;
  var sorted = lane.clips.slice().sort(byStart), cursor = 0, acc = 0, moves = [];
  sorted.forEach(function (c){
    var gap = c.start - cursor;
    if (gap > 0 && (atMs == null || (atMs >= cursor && atMs < c.start))) acc += gap;
    if (acc) moves.push([c.id, acc]);
    cursor = clipEnd(c);
  });
  if (!moves.length) return p;
  var q = cloneProject(p);
  moves.forEach(function (m){ linkedIds(q, m[0]).forEach(function (cid){ findClip(q, cid).clip.start -= m[1]; }); });
  return validate(q).length ? p : finish(q);
}

// Can b (the clip right after a) become part of a? True when it is the same movie, the same speed and look, and it carries on exactly
// where a stopped (so it is the same as before a split).
function canMerge(a, b){
  if (a.type !== b.type || a.asset !== b.asset || a.type === 'text' || a.reverse || b.reverse || clipEnd(a) !== b.start) return false;
  var sp = a.speed || 1;
  if (sp !== (b.speed || 1) || (a.volume != null ? a.volume : 1) !== (b.volume != null ? b.volume : 1)) return false;
  if (a.type === 'freeze'){ if (a.in !== b.in) return false; }
  else if (Math.abs(a.in + a.dur * sp - b.in) > 2) return false;
  if (JSON.stringify([a.filter || null, a.opacity, a.transform || null]) !== JSON.stringify([b.filter || null, b.opacity, b.transform || null])) return false;
  if (a.vFadeOut || b.vFadeIn) return false;
  if (a.fadeOut > 0 && !(a.fadeOutOff > 0)) return false;
  if (b.fadeIn > 0 && !(b.fadeInOff > 0)) return false;
  return true;
}
function mergeInto(a, b){
  var ga = a.gain && a.gain.length ? a.gain : null, gb = b.gain && b.gain.length ? b.gain : null;
  if (ga || gb){
    ga = ga || [[0, 1], [a.dur, 1]]; gb = gb || [[0, 1], [b.dur, 1]];
    a.gain = ga.concat(gb.map(function (pt){ return [pt[0] + a.dur, pt[1]]; }));
  }
  a.fadeOut = b.fadeOut || 0; a.fadeOutOff = b.fadeOutOff || 0;
  if (b.vFadeOut) a.vFadeOut = b.vFadeOut; else delete a.vFadeOut;
  a.dur += b.dur;
}
// Join: pulls the next clip up against this one when there is a gap, and when the two carry on from each other (a split that was
// never changed) makes them one clip again. out.msg says what happened; out.merged is true when they became one clip.
function joinWithNext(p, id, out){
  out = out || {};
  var f = findClip(p, id); if (!f) return p;
  var q = cloneProject(p), qf = findClip(q, id), a = qf.clip, sorted = qf.track.clips.slice().sort(byStart), i = sorted.indexOf(a), nx = sorted[i + 1];
  if (!nx){ out.msg = 'There is nothing after this clip to join with.'; return p; }
  var gap = nx.start - clipEnd(a), closed = false;
  if (gap > 0){
    var mv = {}; sorted.slice(i + 1).forEach(function (c){ linkedIds(q, c.id).forEach(function (cid){ mv[cid] = true; }); });
    Object.keys(mv).forEach(function (cid){ findClip(q, cid).clip.start -= gap; });
    closed = true;
  }
  var aIds = linkedIds(q, a.id), bIds = linkedIds(q, nx.id), pairs = [], ok = aIds.length === bIds.length;
  if (ok) aIds.forEach(function (x){
    var fx = findClip(q, x), mate = bIds.map(function (y){ return findClip(q, y); }).filter(function (g){ return g.track === fx.track; })[0];
    if (mate && canMerge(fx.clip, mate.clip)) pairs.push([fx.clip, mate.clip]); else ok = false;
  });
  if (ok && pairs.length){
    pairs.forEach(function (pr){ mergeInto(pr[0], pr[1]); });
    q.tracks.forEach(function (tr){ tr.clips = tr.clips.filter(function (c){ return !pairs.some(function (pr){ return pr[1] === c; }); }); });
    out.merged = true; out.msg = 'Joined into one clip.';
  } else if (closed) out.msg = 'Gap closed. These two parts come from different places in the movie, so they stay as two clips side by side.';
  else { out.msg = 'These two are already side by side, but they come from different places, so they cannot become one clip.'; return p; }
  return validate(q).length ? p : finish(q);
}

// ---------- format (the shape of the video) and background ----------
// patch = { ratio: 'original' | '9:16' | '16:9' | '1:1' | '4:5' | '4:3' | '3:4', bg: { type: 'navy' | 'color' | 'blur', color: '#rrggbb' } }; either part may be left out.
// The default (original shape, dark background) is not stored, so projects that never use this look exactly as before.
function setFormat(p, patch){
  patch = patch || {};
  var cur = p.format || {}, ratio = patch.ratio !== undefined ? patch.ratio : (cur.ratio || 'original');
  if (!_FM || !_FM.isRatio(ratio)) return p;
  var bg = _FM.normalizeBg(Object.assign({}, cur.bg || {}, patch.bg || {}));
  var q = cloneProject(p);
  if (ratio === 'original' && bg.type === 'navy') delete q.format; else q.format = { ratio: ratio, bg: bg };
  return JSON.stringify(q.format) === JSON.stringify(p.format) ? p : q;
}

// ---------- transitions (between two picture clips that touch) ----------
// A transition is stored on the clip that comes AFTER the cut: clip.transition = { type, durMs }. It takes half of its length from the end of the
// clip before and half from the start of this one (using the movie that carries on past each cut), so the video does not get longer or shorter.
var TRANSITION_TYPES = ['fade', 'fadeblack', 'wipeleft', 'slideleft', 'zoomin', 'circleopen'];
function pictureLane(p){ return p.tracks.filter(function (t){ return t.role === 'movie'; })[0] || null; }
function transitionOk(a, b){
  return !!(a && b && (a.type === 'video' || a.type === 'freeze') && (b.type === 'video' || b.type === 'freeze') && !a.reverse && !b.reverse && clipEnd(a) === b.start);
}
// Every transition that can really happen: { at, durMs, type, aId, bId }. Lengths are cut down so a clip never gives away more than it has.
function transitionList(p){
  var lane = pictureLane(p); if (!lane) return [];
  var cs = lane.clips.slice().sort(byStart), out = [];
  for (var i = 1; i < cs.length; i++){
    var a = cs[i - 1], b = cs[i], tr = b.transition;
    if (!tr || !transitionOk(a, b)) continue;
    out.push({ at: b.start, durMs: Math.min(Math.round(tr.durMs || 0), a.dur - 100, b.dur - 100), type: tr.type, aId: a.id, bId: b.id });
  }
  out.forEach(function (x, k){   // a clip with a transition at both ends: the two halves together must still leave 100 ms of the clip
    var nx = out[k + 1];
    if (nx && nx.aId === x.bId){
      var c = lane.clips.filter(function (y){ return y.id === x.bId; })[0], total = (x.durMs + nx.durMs) / 2, room = c.dur - 100;
      if (total > room && total > 0){ var f = room / total; x.durMs = Math.floor(x.durMs * f); nx.durMs = Math.floor(nx.durMs * f); }
    }
  });
  return out.filter(function (x){ return x.durMs >= 100; });
}
function srcAtTime(c, t){ return c.type === 'freeze' ? c.in : Math.max(0, Math.round(c.in + (t - c.start) * (c.speed || 1))); }
// If time t is inside a transition: how far through it we are (0 to 1), which side of the cut, and where each picture is in the movie.
function transitionAt(p, t){
  var list = transitionList(p);
  for (var i = 0; i < list.length; i++){
    var x = list[i], h1 = Math.floor(x.durMs / 2), s0 = x.at - h1;
    if (t >= s0 && t < s0 + x.durMs){
      var a = findClip(p, x.aId).clip, b = findClip(p, x.bId).clip;
      return { type: x.type, p: (t - s0) / x.durMs, before: t < x.at, a: a, b: b, aMs: srcAtTime(a, t), bMs: srcAtTime(b, t) };
    }
  }
  return null;
}
// patch = { type: 'none' | one of TRANSITION_TYPES, durMs: 200 to 2000 }. Set on the clip that follows the cut.
function setTransition(p, id, patch){
  patch = patch || {};
  var f = findClip(p, id); if (!f || f.track.role !== 'movie' || (f.clip.type !== 'video' && f.clip.type !== 'freeze')) return p;
  var q = cloneProject(p), c = findClip(q, id).clip, cur = c.transition || {};
  var type = patch.type !== undefined ? patch.type : cur.type;
  if (!type || type === 'none'){ if (!c.transition) return p; delete c.transition; return finish(q); }
  if (TRANSITION_TYPES.indexOf(type) < 0) return p;
  var d = Math.round(Math.max(200, Math.min(2000, patch.durMs !== undefined ? +patch.durMs : (cur.durMs || 600))));
  if (isNaN(d) || (cur.type === type && cur.durMs === d)) return p;
  c.transition = { type: type, durMs: d };
  return finish(q);
}

// ---------- stickers ----------
// A sticker is a clip on a "sticker" row: it can sit anywhere in the picture (x, y as a fraction of the frame), has a size (a fraction of the
// frame height) and a turn in degrees. Stickers that overlap in time go on separate rows.
var STICKER_DEFAULTS = { glyph: '⭐', color: '#ffffff', x: 0.5, y: 0.5, size: 0.2, rot: 0 };
function addSticker(p, t, dur, glyph, out){
  var total = p.durationMs; if (!(total > 0)) return p;
  var start = Math.max(0, Math.min(Math.round(t), total - 300)), d = Math.min(Math.round(dur || 3000), total - start); if (d < 300) return p;
  var q = cloneProject(p), rows = q.tracks.filter(function (x){ return x.kind === 'sticker'; }), tr = null;
  for (var i = 0; i < rows.length && !tr; i++) if (!rows[i].clips.some(function (c){ return start < clipEnd(c) && start + d > c.start; })) tr = rows[i];
  if (!tr){ tr = { id: 't-stk' + (rows.length + 1), kind: 'sticker', role: 'stickers', muted: false, hidden: false, volume: 1, locked: false, clips: [] }; q.tracks.push(tr); }
  var clip = Object.assign({ id: newId('c'), type: 'text', sticker: true, asset: null, start: start, dur: d, in: 0, speed: 1 }, STICKER_DEFAULTS);
  if (glyph) clip.glyph = String(glyph);
  tr.clips.push(clip); if (out) out.id = clip.id;
  return finish(q);
}
function setStickerProps(p, id, patch){
  patch = patch || {};
  var q = cloneProject(p), f = findClip(q, id); if (!f || !f.clip.sticker) return p;
  var c = f.clip;
  if (patch.glyph) c.glyph = String(patch.glyph);
  if (patch.color !== undefined){ var m = /^#?([0-9a-f]{6})$/i.exec(String(patch.color)); if (m) c.color = '#' + m[1].toLowerCase(); }
  ['x', 'y'].forEach(function (k){ if (patch[k] !== undefined) c[k] = r3(Math.max(0, Math.min(1, +patch[k] || 0))); });
  if (patch.size !== undefined) c.size = r3(Math.max(0.04, Math.min(0.9, +patch.size || 0.2)));
  if (patch.rot !== undefined) c.rot = ((Math.round(+patch.rot || 0) % 360) + 540) % 360 - 180;
  return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) ? p : finish(q);
}
function stickersAt(p, t){
  var out = [];
  p.tracks.forEach(function (tr){ if (tr.kind !== 'sticker' || tr.hidden) return; tr.clips.forEach(function (c){ if (c.start <= t && t < clipEnd(c)) out.push(c); }); });
  return out;
}

// ---------- undo / redo ----------
// Edit functions return new projects, so history only has to remember the earlier ones.
function EditHistory(limit){ this.limit = limit || 100; this.reset(null); }
EditHistory.prototype.reset = function (p){ this.cur = p; this.past = []; this.future = []; return p; };
EditHistory.prototype.commit = function (p){
  if (p === this.cur) return this.cur;
  this.past.push(this.cur); if (this.past.length > this.limit) this.past.shift();
  this.future = []; this.cur = p; return p;
};
EditHistory.prototype.undo = function (){ if (this.past.length){ this.future.push(this.cur); this.cur = this.past.pop(); } return this.cur; };
EditHistory.prototype.redo = function (){ if (this.future.length){ this.past.push(this.cur); this.cur = this.future.pop(); } return this.cur; };
// Applies the same change to the current project and every undo / redo step, for changes that are not edits
// (such as the voice timing), so undoing never brings back the old setting.
EditHistory.prototype.mapAll = function (fn){
  var f = function (p){ return p ? fn(p) : p; };
  this.past = this.past.map(f); this.future = this.future.map(f); this.cur = f(this.cur);
  return this.cur;
};

var _api = { compileFromSession: compileFromSession, splitAt: splitAt, rippleDelete: rippleDelete, rippleDeleteRanges: rippleDeleteRanges,
  deleteClip: deleteClip, trimClipStart: trimClipStart, trimClipEnd: trimClipEnd, moveClip: moveClip, setClipProps: setClipProps, setTrackProps: setTrackProps,
  sourceAt: sourceAt, validate: validate, snapTime: snapTime, findSilentRanges: findSilentRanges, freezeRanges: freezeRanges, intersectRanges: intersectRanges,
  gainAt: gainAt, gainSlice: gainSlice, clipGainAt: clipGainAt, findClip: findClip, EditHistory: EditHistory,
  addTextClip: addTextClip, setTextProps: setTextProps, textsAt: textsAt, setClipSpeed: setClipSpeed, setVFade: setVFade, setFilter: setFilter,
  insertFreeze: insertFreeze, ensureMusic: ensureMusic, removeMusic: removeMusic,
  setOpacity: setOpacity, setTransform: setTransform, duplicateClip: duplicateClip, shiftVoice: shiftVoice, movieNeeded: movieNeeded, setMovieAsset: setMovieAsset, setReverse: setReverse, linkedClips: linkedClips,
  addCaptions: addCaptions, addCaptionLine: addCaptionLine, captionList: captionList, setCaptionStyle: setCaptionStyle, removeCaptions: removeCaptions,
  parseSrt: parseSrt, toSrt: toSrt, detachAudio: detachAudio, captionTrackOf: captionTrackOf,
  placeClip: placeClip, planPlace: planPlace, closeGaps: closeGaps, joinWithNext: joinWithNext, setFormat: setFormat,
  transitionList: transitionList, transitionAt: transitionAt, setTransition: setTransition, TRANSITION_TYPES: TRANSITION_TYPES,
  addSticker: addSticker, setStickerProps: setStickerProps, stickersAt: stickersAt };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') window.NakiProject = _api;

// Which version of this file is running (the Home screen lists these, so a stale copy is easy to spot).
if (typeof window !== 'undefined'){ window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['project.js'] = 'effects'; }
