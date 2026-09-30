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
    assets: JSON.parse(JSON.stringify(p.assets)), tracks: JSON.parse(JSON.stringify(p.tracks)) };
}
function finish(p){
  var d = 0;
  p.tracks.forEach(function (tr){
    tr.clips = tr.clips.filter(function (c){ return c.dur > 0; }).sort(function (a, b){ return a.start - b.start; });
    tr.clips.forEach(function (c){ d = Math.max(d, clipEnd(c)); });
  });
  p.durationMs = d;
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
  if (c.type !== 'freeze') n.in = c.in + Math.round((from - c.start) * (c.speed || 1));
  if (c.gain && c.gain.length) n.gain = gainSlice(c.gain, from - c.start, to - c.start);
  // fades belong to the original clip's ends: remember how much of each fade a piece has already used up
  if (from > c.start){ n.fadeInOff = (c.fadeInOff || 0) + (from - c.start); if (n.fadeInOff >= (c.fadeIn || 0)){ n.fadeIn = 0; n.fadeInOff = 0; } }
  if (to < clipEnd(c)){ n.fadeOutOff = (c.fadeOutOff || 0) + (clipEnd(c) - to); if (n.fadeOutOff >= (c.fadeOut || 0)){ n.fadeOut = 0; n.fadeOutOff = 0; } }
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
function deleteClip(p, id){   // removes the clip and its linked partner, leaving a gap
  var ids = linkedIds(p, id); if (!ids.length) return p;
  var q = cloneProject(p);
  q.tracks.forEach(function (tr){ tr.clips = tr.clips.filter(function (c){ return ids.indexOf(c.id) < 0; }); });
  return finish(q);
}
function maxDur(p, c){   // how long this clip could be at most, given its source
  if (c.type === 'freeze') return Infinity;
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
    c.dur = nd;
  });
  return validate(q).length ? p : finish(q);
}
function trimClipStart(p, id, newStart){
  var q = cloneProject(p);
  linkedIds(q, id).forEach(function (cid){
    var c = findClip(q, cid).clip, delta = Math.round(newStart) - c.start, sp = c.speed || 1;
    if (delta >= c.dur || c.start + delta < 0) return;
    if (c.type !== 'freeze'){ if (c.in + delta * sp < 0) return; c.in += Math.round(delta * sp); }
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
      var srcMs = c.type === 'freeze' ? c.in : c.in + (t - c.start) * (c.speed || 1);
      if (tr.kind === 'video'){ if (!tr.hidden) out.video = { clip: c, type: c.type, movieMs: srcMs }; }
      else out.audio.push({ role: tr.role, clip: c, sourceMs: srcMs, gain: clipGainAt(tr, c, t) });
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
      if (!p.assets[c.asset]) errs.push(tr.id + ': clip ' + c.id + ' uses missing asset ' + c.asset);
      if (i > 0 && cs[i - 1].start + cs[i - 1].dur > c.start) errs.push(tr.id + ': clips overlap at ' + c.start);
    });
  });
  return errs;
}
function snapTime(p, t, thresholdMs, extra){   // nearest clip edge (or extra point such as the playhead) within the threshold
  var best = t, bd = thresholdMs + 1;
  var pts = (extra || []).concat([0]);
  p.tracks.forEach(function (tr){ tr.clips.forEach(function (c){ pts.push(c.start, clipEnd(c)); }); });
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

var _api = { compileFromSession: compileFromSession, splitAt: splitAt, rippleDelete: rippleDelete, rippleDeleteRanges: rippleDeleteRanges,
  deleteClip: deleteClip, trimClipStart: trimClipStart, trimClipEnd: trimClipEnd, moveClip: moveClip, setClipProps: setClipProps, setTrackProps: setTrackProps,
  sourceAt: sourceAt, validate: validate, snapTime: snapTime, findSilentRanges: findSilentRanges, freezeRanges: freezeRanges, intersectRanges: intersectRanges,
  gainAt: gainAt, gainSlice: gainSlice, clipGainAt: clipGainAt, findClip: findClip, EditHistory: EditHistory };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') window.NakiProject = _api;
