'use strict';
// Serves the app on your own computer:  node tools/serve.js   then open  http://localhost:8080
// (localhost is treated as secure by the browser, so the microphone and offline mode work.)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'www'), port = process.env.PORT || 8080;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(d);
  });
}).listen(port, () => console.log('Naki is running at http://localhost:' + port + '  (press Ctrl+C to stop)'));
