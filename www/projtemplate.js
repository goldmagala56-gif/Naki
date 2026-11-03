'use strict';
/* Naki project templates: save the LOOK AND LAYOUT of an edit (not the footage) as a small .naki-template.json file,
   and put it on another project. Pure helpers on top of project.js: nothing here touches the page, and every function
   returns a NEW project (the old one is left alone), so undo works the way it does for any other edit.

   What a template keeps:  the video shape and background (format), the colour look, titles, stickers, shapes / arrows /
                           spotlights / frames (generated overlays), video effects, voice enhance, the volume of the movie
                           sound / voice / music rows, and the music's own level and fades.
   What it does not keep:  the footage, your voice, pictures or videos you added, sound effects and captions. They belong
                           to one recording. The file says how many were left out so nothing disappears quietly.
   Timing: a start is stored as a share of the whole video (0 to 1), so a title that began a fifth of the way in begins a fifth
           of the way into the next video. Lengths stay in milliseconds; an item that runs to the end of the video still does.

   Template = { naki:'template', version:1, name, durationMs, format?, look?, voice?, volumes?, music?,
                texts:[{at,durMs,toEnd?,text,size,color,pos,weight,bg,font?,outline?,shadow?,anim?}],
                stickers:[{at,durMs,toEnd?,glyph,color,x,y,size,rot}],
                shapes:[{at,durMs,toEnd?,gen,x,y,size,rot,opacity,blend?,mask?,kf?}],
                effects:[{at,durMs,toEnd?,fx,strength}], skipped:{overlays,sounds,videos,captions} } */
var NakiProjTpl = (function () {
  var P = (typeof module !== 'undefined' && module.exports) ? require('./project.js') : (typeof window !== 'undefined' ? window.NakiProject : null);
  var KIND = 'template', VERSION = 1, MAX_ITEMS = 200;
  var TEXT_KEYS = ['text', 'size', 'color', 'pos', 'weight', 'bg', 'font', 'outline', 'shadow'];
  var LOOK_KEYS = ['brightness', 'contrast', 'saturate', 'warmth', 'sharpen', 'vignette', 'matte', 'highlights', 'shadows', 'tint', 'hue', 'grain'];
  var VOLUME_ROLES = ['movieSound', 'voice', 'music'];

  function clone(x){ return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function r4(x){ return Math.round(x * 10000) / 10000; }
  function num(x, d){ if (x === null || x === undefined || x === '') return d; var n = +x; return isFinite(n) ? n : d; }
  function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
  function isObj(x){ return !!x && typeof x === 'object' && !Array.isArray(x); }
  function byAt(a, b){ return a.at - b.at; }
  function byStart(a, b){ return a.start - b.start; }

  // ---------- saving: the look and layout of a project ----------
  function capture(p, name){
    var total = Math.max(1, Math.round(p.durationMs || 0));
    var T = { naki: KIND, version: VERSION, name: String(name == null ? 'Template' : name).trim().slice(0, 60) || 'Template', durationMs: total,
      texts: [], stickers: [], shapes: [], effects: [], skipped: { overlays: 0, sounds: 0, videos: 0, captions: 0 } };
    function when(c, o){ o.at = r4(Math.max(0, c.start) / total); o.durMs = Math.round(c.dur); if (c.start + c.dur >= total - 50) o.toEnd = true; return o; }
    if (p.format) T.format = clone(p.format);
    var lane = p.tracks.filter(function (t){ return t.role === 'movie'; })[0];
    if (lane) lane.clips.slice().sort(byStart).some(function (c){ if (c.filter){ T.look = clone(c.filter); return true; } return false; });
    var vt = p.tracks.filter(function (t){ return t.role === 'voice'; })[0];
    if (vt && vt.enhance) T.voice = clone(vt.enhance);
    var vols = {};
    p.tracks.forEach(function (tr){ if (VOLUME_ROLES.indexOf(tr.role) >= 0 && tr.volume != null && Math.abs(tr.volume - 1) > 0.001) vols[tr.role] = r4(tr.volume); });
    if (Object.keys(vols).length) T.volumes = vols;
    var mt = p.tracks.filter(function (t){ return t.role === 'music'; })[0];
    if (mt && mt.clips[0]) T.music = { volume: mt.clips[0].volume != null ? mt.clips[0].volume : 0.7, fadeIn: mt.clips[0].fadeIn || 0, fadeOut: mt.clips[0].fadeOut || 0 };
    p.tracks.forEach(function (tr){
      if (tr.kind === 'text' && tr.role === 'captions'){ T.skipped.captions += tr.clips.length; return; }
      if (tr.kind === 'text'){
        tr.clips.forEach(function (c){
          var o = when(c, {});
          TEXT_KEYS.forEach(function (k){ if (c[k] !== undefined) o[k] = clone(c[k]); });
          if (c.anim) o.anim = clone(c.anim);
          T.texts.push(o);
        });
      } else if (tr.kind === 'sticker'){
        tr.clips.forEach(function (c){
          T.stickers.push(when(c, { glyph: c.glyph, color: c.color, x: c.x, y: c.y, size: c.size, rot: c.rot || 0 }));
        });
      } else if (tr.kind === 'overlay'){
        tr.clips.forEach(function (c){
          if (!c.gen){ T.skipped.overlays++; return; }
          var o = when(c, { gen: clone(c.gen), x: c.x, y: c.y, size: c.size, rot: c.rot || 0, opacity: c.opacity != null ? c.opacity : 1 });
          if (c.blend) o.blend = c.blend;
          if (c.mask) o.mask = clone(c.mask);
          if (c.kf) o.kf = clone(c.kf);
          T.shapes.push(o);
        });
      } else if (tr.kind === 'fx'){
        tr.clips.forEach(function (c){ T.effects.push(when(c, { fx: c.fx, strength: c.strength == null ? 0.5 : c.strength })); });
      } else if (tr.role === 'sfx') T.skipped.sounds += tr.clips.length;
    });
    Object.keys(p.assets || {}).forEach(function (k){ if (/^v\d+$/.test(k)) T.skipped.videos++; });   // videos added with "Add video"
    ['texts', 'stickers', 'shapes', 'effects'].forEach(function (k){ T[k].sort(byAt); });
    return T;
  }
  function counts(t){ return { texts: t.texts.length, stickers: t.stickers.length, shapes: t.shapes.length, effects: t.effects.length }; }
  function isEmpty(t){
    return !(t.texts.length || t.stickers.length || t.shapes.length || t.effects.length || t.format || t.look || t.voice || t.music || (t.volumes && Object.keys(t.volumes).length));
  }
  function plural(n, one, many){ return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function summary(t){
    var c = counts(t), parts = [];
    if (c.texts) parts.push(plural(c.texts, 'title'));
    if (c.stickers) parts.push(plural(c.stickers, 'sticker'));
    if (c.shapes) parts.push(plural(c.shapes, 'shape or frame', 'shapes and frames'));
    if (c.effects) parts.push(plural(c.effects, 'effect'));
    if (t.format) parts.push('the video shape');
    if (t.look) parts.push('the colour look');
    if (t.voice) parts.push('voice enhance');
    if (t.volumes || t.music) parts.push('sound levels');
    return parts.join(', ');
  }
  function leftOut(sk){
    var bits = [];
    if (sk && sk.overlays) bits.push(plural(sk.overlays, 'picture/video overlay', 'picture/video overlays'));
    if (sk && sk.videos) bits.push(plural(sk.videos, 'added video'));
    if (sk && sk.sounds) bits.push(plural(sk.sounds, 'sound effect'));
    if (sk && sk.captions) bits.push(plural(sk.captions, 'caption line'));
    return bits.join(', ');
  }
  function describeSaved(t){
    var s = 'It holds ' + (summary(t) || 'nothing') + '.', lo = leftOut(t.skipped);
    return s + (lo ? ' Left out (they belong to this recording): ' + lo + '.' : '');
  }
  function fileName(t){
    var slug = String(t && t.name || 'template').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'template';
    return slug + '.naki-template.json';
  }
  function serialize(t){ return JSON.stringify(t, null, 1); }

  // ---------- reading a file: only what we understand gets through ----------
  function listOf(src, fn){
    var out = [];
    (Array.isArray(src) ? src : []).slice(0, MAX_ITEMS).forEach(function (it){
      if (!isObj(it)) return;
      var at = num(it.at, NaN), d = num(it.durMs, NaN); if (!isFinite(at) || !isFinite(d)) return;
      var c = fn(it); if (!c) return;
      c.at = r4(clamp(at, 0, 1)); c.durMs = Math.round(clamp(d, 100, 3600000)); if (it.toEnd === true) c.toEnd = true;
      out.push(c);
    });
    return out.sort(byAt);
  }
  function clean(t){
    if (!isObj(t) || t.naki !== KIND) return null;
    if (!(num(t.version, 0) >= 1) || t.version > VERSION) return null;
    var sk = isObj(t.skipped) ? t.skipped : {};
    var o = { naki: KIND, version: VERSION, name: String(t.name == null ? 'Template' : t.name).trim().slice(0, 60) || 'Template', durationMs: Math.round(num(t.durationMs, 0)),
      texts: listOf(t.texts, function (it){
        if (typeof it.text !== 'string') return null;
        var c = {}; TEXT_KEYS.forEach(function (k){ if (it[k] !== undefined) c[k] = clone(it[k]); });
        if (isObj(it.anim)) c.anim = clone(it.anim);
        return c;
      }),
      stickers: listOf(t.stickers, function (it){
        if (typeof it.glyph !== 'string' || !it.glyph) return null;
        var c = { glyph: it.glyph };
        if (typeof it.color === 'string') c.color = it.color;
        ['x', 'y', 'size', 'rot'].forEach(function (k){ var v = num(it[k], NaN); if (isFinite(v)) c[k] = v; });
        return c;
      }),
      shapes: listOf(t.shapes, function (it){
        if (!isObj(it.gen)) return null;
        var c = { gen: clone(it.gen) };
        ['x', 'y', 'size', 'rot', 'opacity'].forEach(function (k){ var v = num(it[k], NaN); if (isFinite(v)) c[k] = v; });
        if (typeof it.blend === 'string') c.blend = it.blend;
        if (isObj(it.mask)) c.mask = clone(it.mask);
        if (isObj(it.kf)) c.kf = clone(it.kf);
        return c;
      }),
      effects: listOf(t.effects, function (it){
        if (typeof it.fx !== 'string' || !it.fx) return null;
        return { fx: it.fx, strength: clamp(num(it.strength, 0.5), 0, 1) };
      }),
      skipped: { overlays: num(sk.overlays, 0) | 0, sounds: num(sk.sounds, 0) | 0, videos: num(sk.videos, 0) | 0, captions: num(sk.captions, 0) | 0 } };
    if (isObj(t.format) && typeof t.format.ratio === 'string') o.format = { ratio: t.format.ratio, bg: isObj(t.format.bg) ? clone(t.format.bg) : undefined };
    if (isObj(t.look)){ var lk = {}; LOOK_KEYS.forEach(function (k){ var v = num(t.look[k], NaN); if (isFinite(v)) lk[k] = v; }); if (Object.keys(lk).length) o.look = lk; }
    if (isObj(t.voice) && typeof t.voice.preset === 'string') o.voice = { preset: t.voice.preset, amount: clamp(num(t.voice.amount, 0.6), 0, 1) };
    if (isObj(t.volumes)){ var vl = {}; VOLUME_ROLES.forEach(function (k){ var v = num(t.volumes[k], NaN); if (isFinite(v)) vl[k] = clamp(v, 0, 2); }); if (Object.keys(vl).length) o.volumes = vl; }
    if (isObj(t.music)) o.music = { volume: clamp(num(t.music.volume, 0.7), 0, 2), fadeIn: Math.max(0, num(t.music.fadeIn, 0)), fadeOut: Math.max(0, num(t.music.fadeOut, 0)) };
    return o;
  }
  // text from a file -> { template } or { error }
  function parse(text){
    var obj;
    try { obj = JSON.parse(String(text == null ? '' : text).replace(/^\uFEFF/, '')); } catch (e) { return { error: 'That file is not a Naki template (it could not be read).' }; }
    if (isObj(obj) && obj.naki === KIND && num(obj.version, 0) > VERSION) return { error: 'This template was made by a newer version of Naki. Update the app, then try again.' };
    var t = clean(obj);
    if (!t) return { error: 'That file is not a Naki template.' };
    if (isEmpty(t)) return { error: 'This template is empty: there is nothing in it to apply.' };
    return { template: t };
  }

  // ---------- applying: put a template on a project ----------
  // Takes away the things a template brings (titles, stickers, effects, shapes / frames) from rows that are not locked. Your own pictures, videos and sounds stay.
  function removeLayout(p){
    var ids = [];
    p.tracks.forEach(function (tr){
      if (tr.locked) return;
      if ((tr.kind === 'text' && tr.role === 'text') || tr.kind === 'sticker' || tr.kind === 'fx') tr.clips.forEach(function (c){ ids.push(c.id); });
      else if (tr.kind === 'overlay') tr.clips.forEach(function (c){ if (c.gen) ids.push(c.id); });
    });
    var q = p; ids.forEach(function (id){ q = P.deleteClip(q, id); });
    return q;
  }
  // Changes one clip in a copy of the project, for the few things project.js has no edit for (copying keyframes).
  function rawEdit(q, id, fn){
    if (!P.findClip(q, id)) return q;
    var r = Object.assign({}, q, { tracks: clone(q.tracks), assets: clone(q.assets) });
    if (q.format) r.format = clone(q.format);
    fn(P.findClip(r, id).clip);
    return r;
  }
  function startOf(it, total){ return Math.round(it.at * total); }
  function lenOf(it, start, total){ return it.toEnd ? Math.max(100, total - start) : it.durMs; }
  // Moves the end of a clip to where the template wants it (only when that fits; otherwise the clip keeps the length it was made with).
  function setEnd(q, id, it, total){
    var f = P.findClip(q, id); if (!f) return q;
    var end = it.toEnd ? total : Math.min(total, f.clip.start + it.durMs);
    if (end === f.clip.start + f.clip.dur) return q;
    return P.trimClipEnd(q, id, end);
  }

  // opts.replace (default true): first remove your own titles, stickers, effects, shapes and frames. false: add the template's on top of them.
  // out (optional) is filled in: out.error, out.added, out.dropped, out.skipped, out.noMusic. The same project comes back when nothing changed.
  function apply(p, tpl, opts, out){
    opts = opts || {}; out = out || {};
    var t = clean(tpl);
    if (!t){ out.error = 'That is not a Naki template.'; return p; }
    var total = Math.round(p.durationMs || 0);
    if (!(total > 0)){ out.error = 'There is no video to put the template on yet.'; return p; }
    out.added = { texts: 0, stickers: 0, shapes: 0, effects: 0 }; out.dropped = 0; out.skipped = t.skipped;
    var q = (opts.replace !== false) ? removeLayout(p) : p, q2, o;

    if (t.format) q = P.setFormat(q, { ratio: t.format.ratio, bg: t.format.bg });
    if (t.look) q = P.setFilter(q, null, t.look);
    if (t.voice) q = P.setVoiceEnhance(q, t.voice);
    if (t.volumes) VOLUME_ROLES.forEach(function (role){
      if (t.volumes[role] === undefined) return;
      var tr = q.tracks.filter(function (x){ return x.role === role; })[0];
      if (tr) q = P.setTrackProps(q, tr.id, { volume: t.volumes[role] });
    });
    if (t.music){
      var mt = q.tracks.filter(function (x){ return x.role === 'music'; })[0], mc = mt && mt.clips[0];
      if (mc){
        var half = Math.floor(mc.dur / 2);
        q = P.setClipProps(q, mc.id, { volume: t.music.volume, fadeIn: Math.min(t.music.fadeIn, half), fadeOut: Math.min(t.music.fadeOut, half), fadeInOff: 0, fadeOutOff: 0 });
      } else out.noMusic = true;
    }

    t.texts.forEach(function (it){
      var st = startOf(it, total); o = {};
      q2 = P.addTextClip(q, st, lenOf(it, st, total), o);
      if (q2 === q || !o.id){ out.dropped++; return; }
      var patch = {}; TEXT_KEYS.forEach(function (k){ if (it[k] !== undefined) patch[k] = it[k]; });
      q2 = P.setTextProps(q2, o.id, patch);
      if (it.anim) q2 = P.setTextAnim(q2, o.id, it.anim);
      q = q2; out.added.texts++;
    });

    t.stickers.forEach(function (it){
      var st = startOf(it, total); o = {};
      q2 = P.addSticker(q, st, lenOf(it, st, total), it.glyph, o);
      if (q2 === q || !o.id){ out.dropped++; return; }
      var patch = {}; ['color', 'x', 'y', 'size', 'rot'].forEach(function (k){ if (it[k] !== undefined) patch[k] = it[k]; });
      q = P.setStickerProps(q2, o.id, patch); out.added.stickers++;
    });

    t.shapes.forEach(function (it){
      var st = startOf(it, total); o = {};
      q2 = P.addGen(q, st, it.gen, o);
      if (q2 === q || !o.id){ out.dropped++; return; }
      q2 = setEnd(q2, o.id, it, total);
      var cur = P.findClip(q2, o.id).clip;
      ['x', 'y', 'size', 'rot', 'opacity'].forEach(function (k){ if (it[k] !== undefined && it[k] !== cur[k]) q2 = P.setAnimated(q2, o.id, k, it[k], 0); });
      var fxp = {}; if (it.blend) fxp.blend = it.blend; if (it.mask) fxp.mask = it.mask;
      if (Object.keys(fxp).length) q2 = P.setOverlayFx(q2, o.id, fxp);
      if (it.kf){   // keyframes stretch or shrink with the clip, so the movement still fills it
        q2 = rawEdit(q2, o.id, function (c){
          var f = c.dur / Math.max(1, it.durMs), kf = {};
          Object.keys(it.kf).forEach(function (prop){
            var pts = (Array.isArray(it.kf[prop]) ? it.kf[prop] : []).filter(function (pt){ return Array.isArray(pt) && isFinite(+pt[0]) && isFinite(+pt[1]); }).map(function (pt){
              var n = pt.slice(); n[0] = Math.round(clamp(+pt[0] * f, 0, c.dur)); return n;
            }).sort(function (a, b){ return a[0] - b[0]; });
            if (pts.length) kf[prop] = pts;
          });
          if (Object.keys(kf).length) c.kf = kf;
        });
      }
      q = q2; out.added.shapes++;
    });

    t.effects.forEach(function (it){
      var st = startOf(it, total); o = {};
      q2 = P.addFx(q, st, it.fx, o);
      if (q2 === q || !o.id){ out.dropped++; return; }
      q2 = P.setFxProps(q2, o.id, { strength: it.strength });
      q = setEnd(q2, o.id, it, total); out.added.effects++;
    });

    return JSON.stringify(q.tracks) === JSON.stringify(p.tracks) && JSON.stringify(q.format) === JSON.stringify(p.format) ? p : q;
  }
  // one or two sentences for the message after applying
  function describe(out){
    if (out.error) return out.error;
    var a = out.added || {}, parts = [];
    if (a.texts) parts.push(plural(a.texts, 'title'));
    if (a.stickers) parts.push(plural(a.stickers, 'sticker'));
    if (a.shapes) parts.push(plural(a.shapes, 'shape or frame', 'shapes and frames'));
    if (a.effects) parts.push(plural(a.effects, 'effect'));
    var s = 'Template applied' + (parts.length ? ': ' + parts.join(', ') + ' added.' : '.');
    if (out.dropped) s += ' ' + plural(out.dropped, 'item') + ' did not fit and ' + (out.dropped === 1 ? 'was' : 'were') + ' left out.';
    var lo = leftOut(out.skipped);
    if (lo) s += ' Not stored in templates: ' + lo + '.';
    if (out.noMusic) s += ' Add your music first to use the template\u2019s music levels.';
    return s;
  }

  var api = { capture: capture, apply: apply, parse: parse, clean: clean, serialize: serialize, fileName: fileName, isEmpty: isEmpty, counts: counts,
    summary: summary, describe: describe, describeSaved: describeSaved, KIND: KIND, VERSION: VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiProjTpl = api;
  return api;
})();

// Which version of this file is running (the Home screen lists these, so a stale copy is easy to spot).
if (typeof window !== 'undefined'){ window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['projtemplate.js'] = 'templates1'; }