'use strict';
/* Naki thumbs: the filmstrip on picture clips, the way CapCut shows it. Each clip gets a row of small pictures taken from the movie at the moments
   it plays. plan() and paint() are plain maths and drawing (so they are tested); Store is the part that really opens the video and takes the
   pictures, one at a time, on a hidden video element of its own (the preview's video is never touched). */
var NakiThumbs = (function () {
  var BUCKET_MS = 250, MAX_CACHE = 400, SHOT_H = 90;
  function bucketOf(ms) { return Math.max(0, Math.round(ms / BUCKET_MS)); }

  // The tiles across a clip: where each one sits (x, w in css pixels from the left end of the clip) and which moment of the movie it shows (bucket).
  // c = a clip { dur, in, speed, reverse, type }; ppm = pixels per ms; tileW = how wide one picture is.
  function plan(c, widthPx, ppm, tileW) {
    var out = [], n = Math.max(1, Math.ceil(widthPx / tileW - 0.01)), sp = c.speed || 1;
    for (var i = 0; i < n; i++) {
      var x = i * tileW, w = Math.min(tileW, widthPx - x); if (w < 1) break;
      var rel = Math.min(c.dur, (x + w / 2) / ppm), src;
      if (c.type === 'freeze') src = c.in || 0;
      else src = c.reverse ? (c.in || 0) + (c.dur - rel) * sp : (c.in || 0) + rel * sp;
      out.push({ x: x, w: w, bucket: bucketOf(src) });
    }
    return out;
  }
  // Draws one clip's tiles onto g (a W x H canvas; k = canvas pixels per css pixel across). Pictures that are not taken yet are asked for (only the
  // ones inside o.visible = [x0, x1], css pixels from the clip's left end) and drawn as plain blocks until they arrive. Returns how many are missing.
  function paint(g, W, H, c, ppm, o) {
    var tiles = plan(c, c.dur * ppm, ppm, o.tileW), missing = 0;
    g.clearRect(0, 0, W, H); g.fillStyle = o.bg || '#1f4e7d'; g.fillRect(0, 0, W, H);
    tiles.forEach(function (t, i) {
      var key = o.image ? 'img' : t.bucket, img = o.url ? o.store.get(o.url, key) : null, dx = Math.round(t.x * o.k), dw = Math.max(1, Math.round(t.w * o.k));
      if (img) {
        var iw = img.width, ih = img.height, sc = Math.max(dw / iw, H / ih), sw = dw / sc, sh = H / sc;
        g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, dx, 0, dw, H);
        if (i) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(dx, 0, 1, H); }   // a thin line between pictures
      } else {
        g.fillStyle = i % 2 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.12)'; g.fillRect(dx, 0, dw, H);
        var inView = !o.visible || (t.x + t.w >= o.visible[0] && t.x <= o.visible[1]);
        if (o.url && inView) { o.store.request(o.url, key, !!o.image); missing++; }
        else if (o.url) missing++;
      }
    });
    return missing;
  }

  // ---------- the part that takes the pictures (browser only) ----------
  function Store(opts) {
    this.onReady = (opts && opts.onReady) || function () {};
    this.cache = {}; this.order = []; this.pending = {}; this.queue = []; this.vids = {}; this.failed = {}; this.busy = false; this.dead = false;
  }
  Store.prototype.k = function (url, key) { return url + '#' + key; };
  Store.prototype.get = function (url, key) { return this.cache[this.k(url, key)] || null; };
  Store.prototype.request = function (url, key, image) {
    var k = this.k(url, key); if (this.cache[k] || this.pending[k] || this.failed[url] || this.dead) return;
    this.pending[k] = 1; this.queue.push({ url: url, key: key, image: !!image, k: k }); this.pump();
  };
  Store.prototype.put = function (k, cv) {
    this.cache[k] = cv; this.order.push(k);
    while (this.order.length > MAX_CACHE) delete this.cache[this.order.shift()];
  };
  Store.prototype.pump = function () {
    var self = this; if (self.busy || self.dead) return;
    var job = self.queue.pop(); if (!job) return;   // the newest request first: it is what is on screen now
    self.busy = true;
    self.shoot(job).then(function (cv) { if (cv) self.put(job.k, cv); }, function () { self.failed[job.url] = true; }).then(function () {
      delete self.pending[job.k]; self.busy = false;
      if (!self.notify) self.notify = setTimeout(function () { self.notify = 0; if (!self.dead) self.onReady(); }, 60);
      self.pump();
    });
  };
  function toCanvas(src, w, h) {
    var s = Math.min(1, SHOT_H / h), cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s)), cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch; cv.getContext('2d').drawImage(src, 0, 0, cw, ch); return cv;
  }
  Store.prototype.shoot = function (job) {
    var self = this;
    if (job.image) return new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { res(toCanvas(im, im.naturalWidth, im.naturalHeight)); }; im.onerror = function () { rej(new Error('image')); }; im.src = job.url;
    });
    return new Promise(function (res, rej) {
      var v = self.vids[job.url];
      if (!v) {
        v = self.vids[job.url] = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.setAttribute('playsinline', ''); v.src = job.url;
        v._ready = new Promise(function (ok, bad) { v.addEventListener('loadedmetadata', function () { ok(); }); v.addEventListener('error', function () { bad(new Error('video')); }); });
      }
      v._ready.then(function () {
        var t = Math.max(0, Math.min(job.key * BUCKET_MS / 1000, (v.duration || 1e9) - 0.05)), done = false;
        function fin(ok) { if (done) return; done = true; v.removeEventListener('seeked', onSeek); clearTimeout(to); if (ok && v.videoWidth) { try { res(toCanvas(v, v.videoWidth, v.videoHeight)); } catch (e) { rej(e); } } else rej(new Error('seek')); }
        function onSeek() { fin(true); }
        var to = setTimeout(function () { fin(false); }, 5000);
        v.addEventListener('seeked', onSeek);
        if (Math.abs(v.currentTime - t) < 0.001) fin(true); else v.currentTime = t;
      }, rej);
    });
  };
  // lets go of the hidden videos (the pictures already taken are kept)
  Store.prototype.release = function () {
    var self = this; self.queue = []; self.pending = {};
    Object.keys(self.vids).forEach(function (u) { try { self.vids[u].removeAttribute('src'); self.vids[u].load(); } catch (e) {} });
    self.vids = {}; self.busy = false;
  };

  var api = { BUCKET_MS: BUCKET_MS, bucketOf: bucketOf, plan: plan, paint: paint, Store: Store };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiThumbs = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['thumbs.js'] = 'timeline'; }
  return api;
})();
