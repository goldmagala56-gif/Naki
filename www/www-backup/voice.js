'use strict';
/* Naki voice track: Take Back without trusting the recorder's raw file.

   The recorder's chunks are never cut. Instead we remember which stretches of each recording to KEEP,
   and at the end copy exactly those audio packets (no re-encoding, so no quality loss and it is fast)
   into one clean, gap-free file with correct timestamps.

   pieces = [ { blob, ranges: [[fromSec, toSec|null], ...] } ]
     - blob:   a complete audio file (a finished earlier voice file, or the current recorder's chunks)
     - ranges: stretches of THAT file to keep, in seconds on the file's own clock, in order.
               toSec === null means "until the end of the file" (the live recording, still going).
   The finished voice is all kept stretches laid end to end, in order, with no gaps.

   Pure helpers (cutAt, outLengthSec) are tested in Node; assemble() needs the mediabunny module
   and is tested in Node against real files too. */
var NakiVoice = (function () {

  function clonePieces(pieces) {
    return pieces.map(function (p) { return { blob: p.blob, ranges: p.ranges.map(function (r) { return [r[0], r[1]]; }) }; });
  }

  // Total kept length in seconds. liveNowSec closes any open range (the live recording's length so far).
  function outLengthSec(pieces, liveNowSec) {
    var sum = 0;
    pieces.forEach(function (p) {
      p.ranges.forEach(function (r) { sum += Math.max(0, (r[1] == null ? liveNowSec : r[1]) - r[0]); });
    });
    return sum;
  }

  // "Take back": keep only the first outSec seconds of the finished voice, then carry on recording.
  //   liveNowSec  - how far the live recording is on its own clock right now (closes the open range)
  //   resumeSec   - where on the live recording's clock new audio will be kept from (right after the cut)
  // The live recording is the LAST piece. Returns new pieces; the input is not changed.
  function cutAt(pieces, outSec, liveNowSec, resumeSec) {
    var ps = clonePieces(pieces), last = ps[ps.length - 1];
    if (!last) return ps;
    var lr = last.ranges[last.ranges.length - 1];
    if (lr && lr[1] == null) lr[1] = liveNowSec;
    var acc = 0, done = false;
    for (var i = 0; i < ps.length; i++) {
      var kept = [];
      for (var j = 0; j < ps[i].ranges.length; j++) {
        var r = ps[i].ranges[j], len = Math.max(0, r[1] - r[0]);
        if (done) continue;
        if (acc + len <= outSec + 1e-9) { kept.push(r); acc += len; if (acc >= outSec - 1e-9) done = true; }
        else { kept.push([r[0], r[0] + (outSec - acc)]); acc = outSec; done = true; }
      }
      ps[i].ranges = kept;
    }
    last.ranges.push([resumeSec, null]);
    ps.forEach(function (p) { p.ranges = p.ranges.filter(function (r) { return r[1] == null || r[1] - r[0] > 1e-6; }); });
    return ps;
  }

  // Where a session time lands on the finished voice. The voice file starts voiceOffsetMs into the session;
  // if the cut is earlier than that, nothing before it is kept, so the voice is re-anchored to start at the cut.
  function cutPoint(cutTMs, voiceOffsetMs) {
    var out = (cutTMs - voiceOffsetMs) / 1000;
    return out < 0 ? { outSec: 0, voiceOffsetMs: cutTMs } : { outSec: out, voiceOffsetMs: voiceOffsetMs };
  }

  var MIME = { opus: 'audio/webm', aac: 'audio/mp4' };

  // Copies the kept packets of every piece, in order, into one new file. Returns { blob, mime, durationSec }
  // or null if nothing at all was kept.
  async function assemble(M, pieces) {
    var out = null, source = null, codec = null, config = null, cursor = 0, started = false;

    for (var pi = 0; pi < pieces.length; pi++) {
      var piece = pieces[pi];
      if (!piece.blob || !piece.ranges.length) continue;
      var input = new M.Input({ source: new M.BlobSource(piece.blob), formats: M.ALL_FORMATS });
      var track = await input.getPrimaryAudioTrack();
      if (!track) throw new Error('voice piece has no audio');
      var c = await track.getCodec();
      if (!out) {
        codec = c;
        if (!MIME[codec]) throw new Error('unsupported voice codec: ' + codec);
        var format = codec === 'opus' ? new M.WebMOutputFormat() : new M.Mp4OutputFormat();
        out = new M.Output({ format: format, target: new M.BufferTarget() });
        source = new M.EncodedAudioPacketSource(codec);
        out.addAudioTrack(source);
        await out.start();
        config = await track.getDecoderConfig();
      } else if (c !== codec) {
        throw new Error('voice pieces use different codecs (' + codec + ' and ' + c + ')');
      }

      var sink = new M.EncodedPacketSink(track);
      var ri = 0, rangeFirstTs = null, rangeOutStart = 0, prev = null;
      var ranges = piece.ranges;
      var emit = async function (pkt, dur) {
        var ts = rangeOutStart + (pkt.timestamp - rangeFirstTs);
        await source.add(pkt.clone({ timestamp: ts, duration: dur }), started ? undefined : { decoderConfig: config });
        started = true;
        cursor = Math.max(cursor, ts + dur);
      };
      // One pass over the packets. `prev` is held back one step so a packet with no stored duration can
      // take it from the gap to the next packet.
      for await (var pkt of sink.packets()) {
        if (prev) {
          var d = prev.duration > 0 ? prev.duration : Math.max(0.001, pkt.timestamp - prev.pkt.timestamp);
          if (prev.inRange) await emit(prev.pkt, d);
        }
        while (ri < ranges.length && ranges[ri][1] != null && pkt.timestamp >= ranges[ri][1]) { ri++; rangeFirstTs = null; }
        var inRange = ri < ranges.length && pkt.timestamp >= ranges[ri][0];
        if (inRange && rangeFirstTs === null) { rangeFirstTs = pkt.timestamp; rangeOutStart = cursor; }
        prev = { pkt: pkt, duration: pkt.duration, inRange: inRange };
        if (ri >= ranges.length) { prev = inRange ? prev : null; break; }
      }
      if (prev && prev.inRange) await emit(prev.pkt, prev.duration > 0 ? prev.duration : 0.02);
      if (input.dispose) input.dispose();
    }

    if (!started) return null;
    await out.finalize();
    return { blob: new Blob([out.target.buffer], { type: MIME[codec] }), mime: MIME[codec], durationSec: cursor };
  }

  var api = { cutPoint: cutPoint, cutAt: cutAt, outLengthSec: outLengthSec, assemble: assemble };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiVoice = api;
  return api;
})();