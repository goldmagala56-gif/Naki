'use strict';
// Gives this copy of the app a unique build id, so phones know when a new version is published.
// The publishing workflow runs it automatically:  node tools/stamp.js <commit id>
// You do not need to run it by hand. (Running it on your own folder would stop the development mode.)
const fs = require('fs'), path = require('path');
const id = String(process.argv[2] || Date.now().toString(36)).replace(/[^\w.-]/g, '').slice(0, 7) || 'build';
const root = process.argv[3] ? path.resolve(process.argv[3]) : path.join(__dirname, '..', 'www');
['sw.js', 'index.html'].forEach((name) => {
  const f = path.join(root, name), text = fs.readFileSync(f, 'utf8');
  if (!text.includes('__BUILD__')) { console.error('stamp: no __BUILD__ placeholder in ' + name); process.exit(1); }
  fs.writeFileSync(f, text.split('__BUILD__').join(id));
});
console.log('stamped build ' + id);
