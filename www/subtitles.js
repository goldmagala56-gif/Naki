'use strict';
/* Naki subtitles: read and write subtitle files (SRT and WebVTT) and tidy a list of cues. Pure maths and text, no browser needed, so it is tested.
   A cue is { startMs, endMs, text }; line breaks inside a cue are "\n".
   - parse(text)            reads an SRT or VTT file: { cues, format, warnings }. Tags (<i>, <b>, {\an8}) are removed and &amp; style codes are turned back into letters.
   - toSrt(cues), toVtt(cues)   write a file (cues are sorted, numbered and cleaned first)
   - normalize(cues, o)     sorts, drops empty cues, clamps to the video length, and (noOverlap) shortens a cue that runs into the next one
   - wrap(text, maxChars)   breaks a long line at spaces, at most `maxLines` lines (the usual subtitle rule is about 42 letters a line, 2 lines)
   - fromTexts(texts)       turns the titles / captions of an export plan ({ startMs, durMs, text }) into cues */
var NakiSubs = (function () {
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', lrm: '', rlm: '' };

  // "00:01:02,500", "01:02.500", "1:02:03.5" -> milliseconds, or null when it is not a time
  function parseTime(s) {
    var m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,}))?\s*$/.exec(String(s));
    if (!m) return null;
    var h = m[1] ? +m[1] : 0, mi = +m[2], se = +m[3], ms = m[4] ? Math.round(+('0.' + m[4]) * 1000) : 0;
    if (mi > 59 || se > 59) return null;
    return ((h * 60 + mi) * 60 + se) * 1000 + ms;
  }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function fmtTime(ms, sep) {
    ms = Math.max(0, Math.round(ms));
    var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, f = ms % 1000;
    return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + sep + pad(f, 3);
  }
  function decode(t) {
    return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (all, g) {
      if (g[0] === '#') { var n = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
      var k = g.toLowerCase(); return Object.prototype.hasOwnProperty.call(ENT, k) ? ENT[k] : all;
    });
  }
  // takes the markup out of one cue's text, keeps its line breaks
  function cleanText(lines) {
    var out = [];
    lines.forEach(function (l) {
      l = l.replace(/\{\\[^}]*\}/g, '').replace(/<[^>]*>/g, '');   // {\an8} style codes and <i>, <b>, <c.red>, <00:01.000> tags
      l = decode(l).replace(/[ \t\u00a0]{2,}/g, ' ').replace(/\\N/g, '\n').replace(/\\n/g, '\n');
      l.split('\n').forEach(function (p) { p = p.replace(/\s+$/, '').replace(/^\s+/, ''); if (p) out.push(p); });
    });
    return out.join('\n');
  }

  function parse(src) {
    var warnings = [], cues = [];
    var t = String(src == null ? '' : src).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var format = /^\s*WEBVTT/.test(t) ? 'vtt' : (t.indexOf('-->') >= 0 ? 'srt' : 'unknown');
    if (format === 'unknown') { if (t.trim()) warnings.push('This does not look like an SRT or VTT file (no "-->" lines found).'); return { cues: [], format: format, warnings: warnings }; }
    t.split(/\n{2,}/).forEach(function (block, bi) {
      var lines = block.split('\n').filter(function (l, i, a) { return !(i === 0 && l === '' && a.length > 1); });
      if (!lines.length || /^\s*(NOTE|STYLE|REGION)\b/.test(lines[0]) || /^\s*WEBVTT/.test(lines[0]) && lines.every(function (l) { return l.indexOf('-->') < 0; })) return;
      var ai = -1; for (var i = 0; i < lines.length; i++) if (lines[i].indexOf('-->') >= 0) { ai = i; break; }
      if (ai < 0) return;
      var parts = lines[ai].split('-->'), a = parseTime(parts[0]), b = parseTime((parts[1] || '').trim().split(/\s+/)[0]);   // after the end time a VTT line can carry settings (align:start)
      if (a == null || b == null) { warnings.push('Cue ' + (bi + 1) + ': the time "' + lines[ai].trim() + '" could not be read, so it was skipped.'); return; }
      var text = cleanText(lines.slice(ai + 1));
      if (!text) return;
      cues.push({ startMs: a, endMs: b, text: text });
    });
    return { cues: normalize(cues, {}), format: format, warnings: warnings };
  }

  // o: { durationMs, minMs (shortest a cue may be, default 200), noOverlap }
  function normalize(cues, o) {
    o = o || {}; var minMs = o.minMs == null ? 200 : o.minMs, out = [];
    (cues || []).forEach(function (c) {
      if (!c) return;
      var text = String(c.text == null ? '' : c.text).split('\n').map(function (l) { return l.trim(); }).filter(Boolean).join('\n');
      var a = Math.max(0, Math.round(+c.startMs)), b = Math.round(+c.endMs);
      if (!text || isNaN(a) || isNaN(b)) return;
      if (b < a + minMs) b = a + minMs;
      if (o.durationMs > 0) { if (a >= o.durationMs) return; if (b > o.durationMs) b = o.durationMs; if (b - a < Math.min(minMs, 50)) return; }
      out.push({ startMs: a, endMs: b, text: text });
    });
    out.sort(function (x, y) { return x.startMs - y.startMs || x.endMs - y.endMs; });
    if (o.noOverlap) for (var i = 0; i + 1 < out.length; i++) if (out[i].endMs > out[i + 1].startMs) out[i].endMs = Math.max(out[i].startMs + 1, out[i + 1].startMs);
    return out;
  }

  function toSrt(cues) {
    return normalize(cues, {}).map(function (c, i) {
      return (i + 1) + '\n' + fmtTime(c.startMs, ',') + ' --> ' + fmtTime(c.endMs, ',') + '\n' + c.text.replace(/-->/g, '\u2192');
    }).join('\n\n') + '\n';
  }
  function toVtt(cues) {
    var body = normalize(cues, {}).map(function (c) {
      return fmtTime(c.startMs, '.') + ' --> ' + fmtTime(c.endMs, '.') + '\n' + c.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/-->/g, '\u2192');
    }).join('\n\n');
    return 'WEBVTT\n\n' + body + (body ? '\n' : '');
  }

  // Breaks text at spaces so no line is longer than maxChars (a single longer word stays whole), and joins what does not fit into maxLines lines
  // by letting the last line run long. Existing line breaks are kept as they are.
  function wrap(text, maxChars, maxLines) {
    maxChars = maxChars || 42; maxLines = maxLines || 2;
    var lines = [];
    String(text || '').split('\n').forEach(function (para) {
      var cur = '';
      para.split(/\s+/).filter(Boolean).forEach(function (w) {
        if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
      });
      if (cur) lines.push(cur);
    });
    if (lines.length > maxLines) { var head = lines.slice(0, maxLines - 1); head.push(lines.slice(maxLines - 1).join(' ')); lines = head; }
    return lines.join('\n');
  }

  function fromTexts(texts) {
    return normalize((texts || []).map(function (t) { return { startMs: t.startMs, endMs: t.startMs + (t.durMs || 0), text: t.text }; }), {});
  }

  var api = { parseTime: parseTime, fmtTime: fmtTime, parse: parse, normalize: normalize, toSrt: toSrt, toVtt: toVtt, wrap: wrap, fromTexts: fromTexts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiSubs = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['subtitles.js'] = 'subs'; }
  return api;
})();
