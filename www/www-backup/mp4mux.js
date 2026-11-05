'use strict';
/* Naki MP4 muxer + video demuxer. Pure logic, no browser code, so it runs in Node tests.
   Mp4Muxer takes WebCodecs-style encoded chunks (H.264 video, AAC audio) and writes a
   "faststart" MP4 (moov before mdat) in memory.
   demuxMp4Video reads the video track back out, which is what the round-trip test needs.
   Limits: one video track + one optional audio track, no B-frames (timestamp is used as
   decode time), total file under 4 GB. */

function cat(list){ var n = 0, i; for (i = 0; i < list.length; i++) n += list[i].length;
  var o = new Uint8Array(n), p = 0; for (i = 0; i < list.length; i++){ o.set(list[i], p); p += list[i].length; } return o; }
function u32(v){ return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }
function u16(v){ return new Uint8Array([(v >> 8) & 255, v & 255]); }
function fcc(s){ return new Uint8Array([s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)]); }
function zeros(n){ return new Uint8Array(n); }
function box(type){ var body = cat([].slice.call(arguments, 1)); return cat([u32(body.length + 8), fcc(type), body]); }
function fbox(type, ver, flags){
  var rest = [].slice.call(arguments, 3);
  return box.apply(null, [type, new Uint8Array([ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255])].concat(rest));
}
var MATRIX = cat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);
var DEFAULT_ASC = new Uint8Array([0x11, 0x90]);   // AAC-LC, 48 kHz, stereo

function Mp4Muxer(width, height){
  this.width = width; this.height = height;
  this.v = { samples: [], desc: null, codec: null };
  this.a = { samples: [], desc: null, sampleRate: 48000, channels: 2 };
}
Mp4Muxer.prototype.addVideoChunk = function (chunk, meta){
  var d = new Uint8Array(chunk.byteLength); chunk.copyTo(d);
  if (meta && meta.decoderConfig){
    if (meta.decoderConfig.description) this.v.desc = new Uint8Array(meta.decoderConfig.description.buffer ? new Uint8Array(meta.decoderConfig.description.buffer, meta.decoderConfig.description.byteOffset, meta.decoderConfig.description.byteLength) : meta.decoderConfig.description);
    if (meta.decoderConfig.codec) this.v.codec = meta.decoderConfig.codec;
  }
  this.v.samples.push({ data: d, ts: chunk.timestamp, dur: chunk.duration || 0, key: chunk.type === 'key' });
};
Mp4Muxer.prototype.addAudioChunk = function (chunk, meta){
  var d = new Uint8Array(chunk.byteLength); chunk.copyTo(d);
  if (meta && meta.decoderConfig){
    var c = meta.decoderConfig;
    if (c.description) this.a.desc = new Uint8Array(c.description.buffer ? new Uint8Array(c.description.buffer, c.description.byteOffset, c.description.byteLength) : c.description);
    if (c.sampleRate) this.a.sampleRate = c.sampleRate;
    if (c.numberOfChannels) this.a.channels = c.numberOfChannels;
  }
  this.a.samples.push({ data: d, ts: chunk.timestamp, dur: chunk.duration || 0, key: true });
};

// decode times in the track's own timescale, rounded from microseconds, and the delta of each sample
function timing(samples, timescale){
  var dts = samples.map(function (s){ return Math.round(s.ts * timescale / 1e6); });
  var delta = dts.map(function (t, i){
    return i + 1 < dts.length ? dts[i + 1] - t : Math.max(1, Math.round((samples[i].dur || (i ? samples[i].ts - samples[i - 1].ts : 33333)) * timescale / 1e6));
  });
  var total = dts.length ? dts[dts.length - 1] + delta[delta.length - 1] : 0;
  return { dts: dts, delta: delta, total: total };
}
function sttsBox(delta){
  var runs = [];
  delta.forEach(function (d){ var l = runs[runs.length - 1]; if (l && l[1] === d) l[0]++; else runs.push([1, d]); });
  var parts = [u32(runs.length)]; runs.forEach(function (r){ parts.push(u32(r[0]), u32(r[1])); });
  return fbox.apply(null, ['stts', 0, 0].concat(parts));
}
function esdsBox(asc){
  var dcd = cat([new Uint8Array([0x40, 0x15, 0, 0, 0]), u32(0), u32(0), new Uint8Array([0x05, asc.length]), asc]);
  var es = cat([u16(1), new Uint8Array([0]), new Uint8Array([0x04, dcd.length]), dcd, new Uint8Array([0x06, 0x01, 0x02])]);
  return fbox('esds', 0, 0, new Uint8Array([0x03, es.length]), es);
}

Mp4Muxer.prototype.finalize = function (){
  var self = this, v = this.v, a = this.a, hasA = a.samples.length > 0;
  if (!v.samples.length) throw new Error('no video');
  if (!v.desc) throw new Error('missing video decoder config (avcC)');
  var VTS = 90000, ATS = a.sampleRate;
  var vt = timing(v.samples, VTS), at = hasA ? timing(a.samples, ATS) : null;
  var vDurMs = Math.round(vt.total * 1000 / VTS), aDurMs = hasA ? Math.round(at.total * 1000 / ATS) : 0;
  var movDur = Math.max(vDurMs, aDurMs);

  // file order of sample data: by time, video first on ties
  var order = [];
  v.samples.forEach(function (s, i){ order.push({ t: s.ts, k: 0, i: i }); });
  if (hasA) a.samples.forEach(function (s, i){ order.push({ t: s.ts, k: 1, i: i }); });
  order.sort(function (x, y){ return x.t - y.t || x.k - y.k || x.i - y.i; });

  function stbl(entry, samples, tm, offsets, keyOnly){
    var kf = []; samples.forEach(function (s, i){ if (s.key) kf.push(i + 1); });
    var parts = [
      fbox('stsd', 0, 0, u32(1), entry),
      sttsBox(tm.delta)
    ];
    if (keyOnly && kf.length !== samples.length) parts.push(fbox.apply(null, ['stss', 0, 0, u32(kf.length)].concat(kf.map(u32))));
    parts.push(
      fbox('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
      fbox.apply(null, ['stsz', 0, 0, u32(0), u32(samples.length)].concat(samples.map(function (s){ return u32(s.data.length); }))),
      fbox.apply(null, ['stco', 0, 0, u32(offsets.length)].concat(offsets.map(u32))));
    return box.apply(null, ['stbl'].concat(parts));
  }
  function trak(id, isVideo, timescale, durUnits, tkDurMs, stblBox){
    var tkhd = fbox('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(tkDurMs), zeros(8), u16(0), u16(0),
      u16(isVideo ? 0 : 0x0100), u16(0), MATRIX, u32(isVideo ? self.width * 65536 : 0), u32(isVideo ? self.height * 65536 : 0));
    var mdhd = fbox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(durUnits), u16(0x55C4), u16(0));
    var hdlr = fbox('hdlr', 0, 0, u32(0), fcc(isVideo ? 'vide' : 'soun'), zeros(12), new Uint8Array([0]));
    var xmhd = isVideo ? fbox('vmhd', 0, 1, zeros(8)) : fbox('smhd', 0, 0, zeros(4));
    var dinf = box('dinf', fbox('dref', 0, 0, u32(1), fbox('url ', 0, 1)));
    return box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', xmhd, dinf, stblBox)));
  }
  function buildMoov(vOff, aOff){
    var vEntry = box('avc1', zeros(6), u16(1), zeros(16), u16(self.width), u16(self.height), u32(0x00480000), u32(0x00480000),
      u32(0), u16(1), zeros(32), u16(0x18), u16(0xFFFF), box('avcC', v.desc));
    var mvhd = fbox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movDur), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(hasA ? 3 : 2));
    var parts = [mvhd, trak(1, true, VTS, vt.total, vDurMs, stbl(vEntry, v.samples, vt, vOff, true))];
    if (hasA){
      var aEntry = box('mp4a', zeros(6), u16(1), zeros(8), u16(a.channels), u16(16), u16(0), u16(0), u32(ATS * 65536), esdsBox(a.desc || DEFAULT_ASC));
      parts.push(trak(2, false, ATS, at.total, aDurMs, stbl(aEntry, a.samples, at, aOff, false)));
    }
    return box.apply(null, ['moov'].concat(parts));
  }

  var ftyp = box('ftyp', fcc('isom'), u32(512), fcc('isom'), fcc('iso2'), fcc('avc1'), fcc('mp41'));
  var zerosV = v.samples.map(function (){ return 0; }), zerosA = a.samples.map(function (){ return 0; });
  var moovLen = buildMoov(zerosV, zerosA).length;
  var pos = ftyp.length + moovLen + 8, vOff = new Array(v.samples.length), aOff = new Array(a.samples.length);
  order.forEach(function (o){
    var s = o.k === 0 ? v.samples[o.i] : a.samples[o.i];
    (o.k === 0 ? vOff : aOff)[o.i] = pos; pos += s.data.length;
  });
  var moov = buildMoov(vOff, aOff);
  var mdatBody = order.map(function (o){ return (o.k === 0 ? v.samples[o.i] : a.samples[o.i]).data; });
  var mdatSize = pos - (ftyp.length + moov.length);
  return cat([ftyp, moov, u32(mdatSize), fcc('mdat')].concat(mdatBody));
};

/* ---------- reading ---------- */
function rd32(b, p){ return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0; }
function rd16(b, p){ return (b[p] << 8) | b[p + 1]; }
function boxes(b, start, end){
  var out = [], p = start;
  while (p + 8 <= end){
    var size = rd32(b, p), type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]), hdr = 8;
    if (size === 1){ size = rd32(b, p + 8) * 4294967296 + rd32(b, p + 12); hdr = 16; }
    else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) break;
    out.push({ type: type, s: p + hdr, e: p + size });
    p += size;
  }
  return out;
}
function child(b, bx, type){ var l = boxes(b, bx.s, bx.e); for (var i = 0; i < l.length; i++) if (l[i].type === type) return l[i]; return null; }

function demuxMp4Video(bytes){
  var b = bytes, top = boxes(b, 0, b.length), moov = null, i;
  for (i = 0; i < top.length; i++) if (top[i].type === 'moov') moov = top[i];
  if (!moov) throw new Error('no moov box');
  var traks = boxes(b, moov.s, moov.e).filter(function (x){ return x.type === 'trak'; }), vt = null;
  traks.forEach(function (t){
    var mdia = child(b, t, 'mdia'), hdlr = mdia && child(b, mdia, 'hdlr');
    if (hdlr && String.fromCharCode(b[hdlr.s + 8], b[hdlr.s + 9], b[hdlr.s + 10], b[hdlr.s + 11]) === 'vide' && !vt) vt = mdia;
  });
  if (!vt) throw new Error('no video track');
  var mdhd = child(b, vt, 'mdhd'), ver = b[mdhd.s], timescale = ver === 1 ? rd32(b, mdhd.s + 20) : rd32(b, mdhd.s + 12);
  var stbl = child(b, child(b, vt, 'minf'), 'stbl');
  var stsd = child(b, stbl, 'stsd'), entry = boxes(b, stsd.s + 8, stsd.e)[0];
  var width = rd16(b, entry.s + 24), height = rd16(b, entry.s + 26);
  var avcC = boxes(b, entry.s + 78, entry.e).filter(function (x){ return x.type === 'avcC'; })[0];
  if (!avcC) throw new Error('no avcC');
  var description = b.slice(avcC.s, avcC.e);
  var hex = function (n){ return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); };
  var codec = 'avc1.' + hex(description[1]) + hex(description[2]) + hex(description[3]);

  var sttsB = child(b, stbl, 'stts'), deltas = [], n, p;
  n = rd32(b, sttsB.s + 4); p = sttsB.s + 8;
  for (i = 0; i < n; i++, p += 8){ var cnt = rd32(b, p), d = rd32(b, p + 4); for (var k = 0; k < cnt; k++) deltas.push(d); }
  var stszB = child(b, stbl, 'stsz'), fixed = rd32(b, stszB.s + 4), count = rd32(b, stszB.s + 8), sizes = [];
  for (i = 0; i < count; i++) sizes.push(fixed || rd32(b, stszB.s + 12 + i * 4));
  var stscB = child(b, stbl, 'stsc'), stsc = [];
  n = rd32(b, stscB.s + 4); p = stscB.s + 8;
  for (i = 0; i < n; i++, p += 12) stsc.push({ first: rd32(b, p), per: rd32(b, p + 4) });
  var chunkOff = [], stco = child(b, stbl, 'stco'), co64 = child(b, stbl, 'co64');
  if (stco){ n = rd32(b, stco.s + 4); for (i = 0; i < n; i++) chunkOff.push(rd32(b, stco.s + 8 + i * 4)); }
  else if (co64){ n = rd32(b, co64.s + 4); for (i = 0; i < n; i++) chunkOff.push(rd32(b, co64.s + 8 + i * 8) * 4294967296 + rd32(b, co64.s + 12 + i * 8)); }
  var keys = null, stss = child(b, stbl, 'stss');
  if (stss){ keys = {}; n = rd32(b, stss.s + 4); for (i = 0; i < n; i++) keys[rd32(b, stss.s + 8 + i * 4)] = true; }

  var samples = [], si = 0, dts = 0;
  for (var c = 0; c < chunkOff.length; c++){
    var per = 1; stsc.forEach(function (e){ if (c + 1 >= e.first) per = e.per; });
    var off = chunkOff[c];
    for (var j = 0; j < per && si < count; j++, si++){
      samples.push({ offset: off, size: sizes[si], timestamp: Math.round(dts * 1e6 / timescale), duration: Math.round(deltas[si] * 1e6 / timescale),
        isKey: keys ? !!keys[si + 1] : true, data: b.subarray(off, off + sizes[si]) });
      off += sizes[si]; dts += deltas[si];
    }
  }
  return { codec: codec, description: description, samples: samples,
    info: { width: width, height: height, timescale: timescale, durationUs: Math.round(dts * 1e6 / timescale) } };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Mp4Muxer: Mp4Muxer, demuxMp4Video: demuxMp4Video };
if (typeof window !== 'undefined') window.NakiMp4 = { Mp4Muxer: Mp4Muxer, demuxMp4Video: demuxMp4Video };