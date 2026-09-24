'use strict';
/* Naki core: pure logic with no page or device code.
   Used by the app (loaded in index.html), by the tests, and later by the desktop and Android builds. */
// Pure logic: no page or device code in here, so it can be tested on its own.
var NAKI_VERSION = '0.1.12';
var DB_MIN = -80;
var LEVEL_STEP_MS = 50;

function rmsToDb(r){ return r > 1e-4 ? Math.max(DB_MIN, 20 * Math.log10(r)) : DB_MIN; }
function dbToByte(db){ var c = Math.max(DB_MIN, Math.min(0, db)); return Math.round((c - DB_MIN) / (-DB_MIN) * 255); }
function byteToDb(b){ return DB_MIN + (b / 255) * (-DB_MIN); }

// Lowers the movie while the voice is loud enough. Same code runs live and when building the export.
class Ducker {
  constructor(p){
    this.p = Object.assign({ enabled: true, thresholdDb: -42, duckedGain: 0.06, attackMs: 45, releaseMs: 400, holdMs: 300 }, p || {});
    this.reset();
  }
  reset(){ this.gain = 1; this.holdLeft = 0; }
  step(db, dtMs){
    var p = this.p;
    if (!p.enabled){ this.gain = 1; this.holdLeft = 0; return 1; }
    if (db > p.thresholdDb) this.holdLeft = p.holdMs;
    else this.holdLeft = Math.max(0, this.holdLeft - dtMs);
    var target = this.holdLeft > 0 ? p.duckedGain : 1;
    var tau = target < this.gain ? p.attackMs : p.releaseMs;
    this.gain += (target - this.gain) * (1 - Math.exp(-dtMs / tau));
    return this.gain;
  }
}

// Where is the movie, and is it playing, at session time t?
function stateAt(events, t){
  var playing = false, anchorT = 0, anchorMovie = 0;
  for (var i = 0; i < events.length; i++){
    var e = events[i];
    if (e.t > t) break;
    if (e.type === 'rec_start'){ anchorMovie = e.movieMs; anchorT = e.t; playing = false; }
    else if (e.type === 'play' && !playing){ playing = true; anchorT = e.t; anchorMovie = e.movieMs; }
    else if (e.type === 'pause' && playing){ playing = false; anchorMovie = e.movieMs; anchorT = e.t; }
    else if (e.type === 'jump'){ anchorMovie = e.toMs; anchorT = e.t; }
  }
  return { playing: playing, movieMs: playing ? anchorMovie + (t - anchorT) : anchorMovie };
}

// Turns the event log into "play this part of the movie" and "hold this frame" spans.
function buildVideoSpans(events, durationMs){
  var spans = [], playing = false, spanStart = 0, spanMovie = 0;
  function close(t){
    if (t > spanStart){
      spans.push(playing
        ? { type: 'play', sessionStart: spanStart, sessionEnd: t, movieStart: spanMovie }
        : { type: 'freeze', sessionStart: spanStart, sessionEnd: t, movieAt: spanMovie });
    }
  }
  for (var i = 0; i < events.length; i++){
    var e = events[i];
    if (e.type === 'rec_start'){ spanStart = e.t; spanMovie = e.movieMs; playing = false; }
    else if (e.type === 'play' && !playing){ close(e.t); playing = true; spanStart = e.t; spanMovie = e.movieMs; }
    else if (e.type === 'pause' && playing){ close(e.t); playing = false; spanStart = e.t; spanMovie = e.movieMs; }
    else if (e.type === 'jump'){ close(e.t); spanStart = e.t; spanMovie = e.toMs; }
  }
  close(durationMs);
  return spans;
}

// Movie loudness over the whole session (user volume x auto-lowering), one value per step.
function buildGainSeries(s){
  var levels = s.levels || [], events = s.events || [];
  var n = Math.max(levels.length, Math.ceil((s.durationMs || 0) / LEVEL_STEP_MS)) + 1;
  var d = new Ducker(), vol = 1, ei = 0, out = [];
  for (var i = 0; i < n; i++){
    var t = i * LEVEL_STEP_MS;
    while (ei < events.length && events[ei].t <= t){
      var e = events[ei++];
      if (e.type === 'vol') vol = e.value;
      else if (e.type === 'duck') d.p = Object.assign({}, d.p, { enabled: e.enabled, thresholdDb: e.thresholdDb, duckedGain: e.duckedGain });
    }
    var db = i < levels.length ? byteToDb(levels[i]) : DB_MIN;
    out.push(vol * d.step(db, LEVEL_STEP_MS));
  }
  return out;
}

// Keeps only the points where the loudness really changes.
function simplifyGain(series, stepMs, tol){
  var pts = [], lastVal = null, lastIdx = -1;
  function push(i){ pts.push([i * stepMs, Math.round(series[i] * 1000) / 1000]); lastVal = series[i]; lastIdx = i; }
  for (var i = 0; i < series.length; i++){
    if (lastVal === null){ push(i); continue; }
    if (Math.abs(series[i] - lastVal) >= tol){ if (lastIdx < i - 1) push(i - 1); push(i); }
    else if (i === series.length - 1){ push(i); }
  }
  return pts;
}

function buildExportPlan(s){
  var series = buildGainSeries(s);
  return {
    naki: 'export-plan', version: 1,
    durationMs: s.durationMs,
    movie: { name: s.movieName, durationMs: s.movieDurMs },
    video: buildVideoSpans(s.events, s.durationMs),
    movieGain: { stepMs: LEVEL_STEP_MS, points: simplifyGain(series, LEVEL_STEP_MS, 0.02) },
    voice: { file: 'voice', offsetMs: (s.voiceOffsetMs || 0) + (s.voiceNudgeMs || 0) }
  };
}

function fmt(ms){
  var t = Math.max(0, Math.round(ms / 1000));
  var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(sec).padStart(2, '0');
}

if (typeof module !== 'undefined' && module.exports){
  module.exports = { NAKI_VERSION: NAKI_VERSION, DB_MIN: DB_MIN, LEVEL_STEP_MS: LEVEL_STEP_MS, rmsToDb: rmsToDb, dbToByte: dbToByte, byteToDb: byteToDb,
    Ducker: Ducker, stateAt: stateAt, buildVideoSpans: buildVideoSpans, buildGainSeries: buildGainSeries,
    simplifyGain: simplifyGain, buildExportPlan: buildExportPlan, fmt: fmt };
}
