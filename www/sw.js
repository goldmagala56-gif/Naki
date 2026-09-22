/* Naki service worker: keeps the app files on the phone so Naki opens and works with no internet.
   BUILD is filled in automatically each time the app is published (tools/stamp.js), so every
   published version gets its own cache and phones update by themselves. You never edit it by hand. */
const BUILD = '__BUILD__';
const DEV = BUILD.indexOf('__') === 0;   // true when running from your own folder: no caching, so edits show at once
const CACHE = 'naki-' + BUILD;
const FILES = ['./', './index.html', './core.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-192-maskable.png', './icon-512-maskable.png', './apple-touch-icon.png', './favicon.ico'];

self.addEventListener('install', (e) => {
  if (DEV) { e.waitUntil(self.skipWaiting()); return; }
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => DEV || k !== CACHE).map((k) => caches.delete(k))))
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
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});
