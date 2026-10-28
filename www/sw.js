/* Naki service worker: keeps the app files on the phone so Naki opens and works with no internet.
   BUILD is filled in automatically each time the app is published (tools/stamp.js), so every
   published version gets its own cache and phones update by themselves. You never edit it by hand. */
const BUILD = '__BUILD__';
const DEV = BUILD.indexOf('__') === 0;   // true when running from your own folder: no caching, so edits show at once
const CACHE = 'naki-' + BUILD;
const FILES = ['./', './index.html', './export-engine.js', './core.js', './look.js', './format.js', './stickers.js', './anim.js', './fx.js', './thumbs.js', './peaks.js', './sfx.js', './captions.js', './look2.js', './templates.js', './presets.js', './motion.js', './reverse.js', './project.js', './voice.js', './editor.js', './editor.css', './plan.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-192-maskable.png', './icon-512-maskable.png', './apple-touch-icon.png', './favicon.ico', './webcodecs-export.js', './subtitles.js', './fonts/fonts.css', './fonts/inter-latin-400-normal.woff2', './fonts/inter-latin-ext-400-normal.woff2', './fonts/inter-latin-700-normal.woff2', './fonts/inter-latin-ext-700-normal.woff2', './fonts/inter-latin-800-normal.woff2', './fonts/inter-latin-ext-800-normal.woff2', './fonts/montserrat-latin-400-normal.woff2', './fonts/montserrat-latin-ext-400-normal.woff2', './fonts/montserrat-latin-700-normal.woff2', './fonts/montserrat-latin-ext-700-normal.woff2', './fonts/montserrat-latin-800-normal.woff2', './fonts/montserrat-latin-ext-800-normal.woff2', './fonts/poppins-latin-500-normal.woff2', './fonts/poppins-latin-ext-500-normal.woff2', './fonts/poppins-latin-700-normal.woff2', './fonts/poppins-latin-ext-700-normal.woff2', './fonts/bebas-neue-latin-400-normal.woff2', './fonts/bebas-neue-latin-ext-400-normal.woff2', './fonts/anton-latin-400-normal.woff2', './fonts/anton-latin-ext-400-normal.woff2', './fonts/oswald-latin-700-normal.woff2', './fonts/oswald-latin-ext-700-normal.woff2', './fonts/archivo-black-latin-400-normal.woff2', './fonts/archivo-black-latin-ext-400-normal.woff2', './fonts/bangers-latin-400-normal.woff2', './fonts/bangers-latin-ext-400-normal.woff2', './fonts/righteous-latin-400-normal.woff2', './fonts/righteous-latin-ext-400-normal.woff2', './fonts/playfair-display-latin-700-normal.woff2', './fonts/playfair-display-latin-ext-700-normal.woff2', './fonts/pacifico-latin-400-normal.woff2', './fonts/pacifico-latin-ext-400-normal.woff2', './fonts/lobster-latin-400-normal.woff2', './fonts/lobster-latin-ext-400-normal.woff2', './fonts/caveat-latin-700-normal.woff2', './fonts/caveat-latin-ext-700-normal.woff2', './fonts/dancing-script-latin-700-normal.woff2', './fonts/dancing-script-latin-ext-700-normal.woff2', './pip.js', './speedcurves.js', './music.js', './vendor/mediabunny/mediabunny.min.mjs'];
// export-engine.js and vendor/ffmpeg/* are NOT in the list above on purpose: they're
// ~30MB, so they're only fetched (and cached, into VENDOR_CACHE below) the first time
// someone actually taps Export, instead of every phone downloading them just to install Naki.
const VENDOR_CACHE = 'naki-ffmpeg-vendor-v1';

self.addEventListener('install', (e) => {
  if (DEV) { e.waitUntil(self.skipWaiting()); return; }
  // One file at a time: a file that is missing (say a new one that was not uploaded yet) must NOT stop the whole update,
  // which is what cache.addAll() does. The phone keeps whatever it could get and still moves to the new version.
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => console.warn('Naki: could not keep', f, 'for offline use')))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => DEV || (k !== CACHE && k !== VENDOR_CACHE)).map((k) => caches.delete(k))))
      .then(() => caches.open(VENDOR_CACHE).then((c) => c.delete(new URL('./export-engine.js', self.location.href).href)).catch(() => {}))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (DEV) return;
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
        caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => {
      if (hit) return hit;
      // The video engine (export-engine.js and vendor/ffmpeg/*) caches itself into
      // VENDOR_CACHE the first time Export runs (see export-engine.js) — check there
      // before giving up, so a second export works offline too.
      if (url.pathname.endsWith('/export-engine.js') || url.pathname.includes('/vendor/ffmpeg/')) {
        return caches.open(VENDOR_CACHE).then((c) => c.match(req)).then((vhit) => vhit || fetch(req).catch(() => Response.error()));
      }
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});
