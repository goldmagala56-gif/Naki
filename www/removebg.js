'use strict';
/* Naki Remove Background (photos): finds the person with MediaPipe's selfie segmenter and makes the rest see-through.
   The result is a new PNG that replaces the overlay's file, so the preview and both export engines need no changes. */
var NakiRemoveBg = (function () {
  var VER = '0.10.14', LOCAL = 'vendor/mediapipe/', CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VER + '/';
  var MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
  var MAX_SIDE = 2048, segPromise = null;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function base() { return (typeof document !== 'undefined' && document.baseURI) ? document.baseURI : location.href; }
  function canvas(w, h) { var c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function toBlob(c) { return c.convertToBlob ? c.convertToBlob({ type: 'image/png' }) : new Promise(function (r) { c.toBlob(r, 'image/png'); }); }
  function exists(url) { return fetch(url).then(function (r) { return r.ok; }, function () { return false; }); }

  function load(say) {
    if (segPromise) return segPromise;
    segPromise = (async function () {
      say('Loading the cut-out model...');
      var local = await exists(new URL(LOCAL + 'selfie_segmenter.tflite', base()).href);
      var root = local ? new URL(LOCAL, base()).href : CDN;
      var model = local ? root + 'selfie_segmenter.tflite' : MODEL_CDN;
      var M = await import(/* webpackIgnore: true */ root + 'vision_bundle.mjs');
      var files = await M.FilesetResolver.forVisionTasks(root + 'wasm');
      function make(delegate) {
        return M.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate: delegate }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false });
      }
      try { return await make('GPU'); } catch (e) { return await make('CPU'); }
    })();
    segPromise.catch(function () { segPromise = null; });
    return segPromise;
  }

  // Finds the person. Returns what render() needs (the picture and the 0..1 "person" mask). The mask is turned the right way round
  // by looking at the picture's border: the border is almost always background.
  async function analyze(file, say) {
    say = say || function () {};
    var seg = await load(say);
    say('Reading the picture...');
    var bmp = await createImageBitmap(file), s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    var w = Math.max(2, Math.round(bmp.width * s)), h = Math.max(2, Math.round(bmp.height * s)), cv = canvas(w, h);
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    say('Finding the person...');
    var res = seg.segment(cv), list = res.confidenceMasks || [], m = list.length > 1 ? list[1] : list[0];
    if (!m) throw new Error('the model returned no mask');
    var arr = new Float32Array(m.getAsFloat32Array()), mw = m.width, mh = m.height;
    list.forEach(function (x) { try { x.close(); } catch (e) {} });
    try { if (res.close) res.close(); } catch (e) {}
    var sum = 0, n = 0, i;
    for (i = 0; i < mw; i++) { sum += arr[i] + arr[(mh - 1) * mw + i]; n += 2; }
    for (i = 0; i < mh; i++) { sum += arr[i * mw] + arr[i * mw + mw - 1]; n += 2; }
    return { bmp: bmp, w: w, h: h, mask: arr, mw: mw, mh: mh, flip: (sum / n) > 0.5 };
  }

  // o = { cut: 0.05..0.95 (where person starts), soft: 0.01..0.45 (edge softness), invert }
  function render(an, o) {
    o = o || {};
    var cut = clamp(o.cut == null ? 0.5 : o.cut, 0.05, 0.95), soft = clamp(o.soft == null ? 0.12 : o.soft, 0.01, 0.45), inv = (an.flip !== !!o.invert);
    var lo = cut - soft, hi = cut + soft, mc = canvas(an.mw, an.mh), mg = mc.getContext('2d'), id = mg.createImageData(an.mw, an.mh), d = id.data, i;
    for (i = 0; i < an.mask.length; i++) {
      var p = an.mask[i]; if (inv) p = 1 - p;
      var t = clamp((p - lo) / (hi - lo), 0, 1);
      d[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    mg.putImageData(id, 0, 0);
    var out = canvas(an.w, an.h), g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(an.bmp, 0, 0, an.w, an.h);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(mc, 0, 0, an.w, an.h);
    return toBlob(out);
  }

  // The editor panel. X = { clip, hooks, store, mk, sliderRow, actions, toast, refresh, redraw } (given by editor.js)
  function buildPanel(body, X) {
    var c = X.clip, h = X.hooks;
    function hint(t) { body.appendChild(X.mk('div', 'ed-hint', t)); }
    if (!c || c.gen) { hint('Tap a photo overlay on the timeline first (Overlay, then Add).'); return; }
    if (c.type !== 'freeze') { hint('This works on photos for now. For a video overlay on a plain colour, use Chroma key.'); return; }
    var st = X.store[c.asset] || (X.store[c.asset] = { orig: null, an: null, cut: 50, soft: 12, inv: false, busy: false, done: false, msg: '' });
    var status = X.mk('div', 'ed-hint', st.msg || 'Finds the person in the photo and makes everything else see-through. The first time it loads the cut-out model.');
    st.statusEl = status; body.appendChild(status);
    function say(m) { st.msg = m; if (st.statusEl) st.statusEl.textContent = m; }
    function fail(err) { st.busy = false; st.msg = 'Could not remove the background: ' + (err && err.message ? err.message : err); X.toast(st.msg); X.refresh(); }
    function apply() {
      return render(st.an, { cut: st.cut / 100, soft: st.soft / 100, invert: st.inv }).then(function (blob) {
        var nm = String((st.orig && st.orig.name) || 'photo').replace(/\.[^.]+$/, '').replace(/_cutout$/, '') + '_cutout.png';
        h.setOverlayFile(c.asset, new File([blob], nm, { type: 'image/png' }));
        st.done = true; st.busy = false; st.msg = 'Background removed. Fine-tune the edge below.'; X.redraw(); X.refresh();
      });
    }
    function again() { if (st.busy || !st.an) return; st.busy = true; apply().catch(fail); }
    function run() {
      if (st.busy) return;
      if (st.an) { again(); return; }
      var cur = h.getAssetFile ? h.getAssetFile(c.asset) : null;
      if (!cur) { X.toast('The photo file is missing. Add the overlay again.'); return; }
      if (!st.orig) st.orig = cur;
      st.busy = true; say('Starting...'); X.refresh();
      analyze(st.orig, say).then(function (an) { st.an = an; return apply(); }).catch(fail);
    }
    var acts = [{ id: 'edRemoveBgRun', label: st.busy ? 'Working...' : (st.done ? 'Run again' : 'Remove background'), run: run }];
    if (st.an) acts.push({ id: 'edRemoveBgInvert', label: st.inv ? 'Invert: on' : 'Invert: off', on: st.inv, run: function () { st.inv = !st.inv; again(); } });
    if (st.done && st.orig) acts.push({ id: 'edRemoveBgRestore', label: 'Restore original', run: function () { h.setOverlayFile(c.asset, st.orig); st.done = false; st.msg = 'Original photo restored.'; X.redraw(); X.refresh(); } });
    body.appendChild(X.actions(acts));
    if (st.an) {
      body.appendChild(X.sliderRow('Cut-off', 10, 90, 1, st.cut, function (v) { return v + '%'; }, null, function (v) { st.cut = v; again(); }));
      body.appendChild(X.sliderRow('Edge softness', 2, 40, 1, st.soft, function (v) { return v + '%'; }, null, function (v) { st.soft = v; again(); }));
    }
    hint('The cut-out is a new picture file kept with this session. Undo does not bring the old photo back; use Restore original. If the person is removed instead of the background, tap Invert.');
  }

  var api = { load: load, analyze: analyze, render: render, buildPanel: buildPanel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiRemoveBg = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['removebg.js'] = 'rembg1'; }
  return api;
})();