'use strict';
// node tests/sw-cache.test.js
// An old service worker kept serving the FIRST copy of export-engine.js it ever saved (from the vendor cache),
// so engine updates never reached a phone that had exported once. These checks keep that from coming back.
const assert = require('assert'), fs = require('fs'), path = require('path');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const sw = fs.readFileSync(path.join(__dirname, '..', 'www', 'sw.js'), 'utf8');
ok('the service worker looks in THIS build\'s cache first, not in every cache oldest-first', () =>
  assert(/caches\.open\(CACHE\)\.then\(\(?c\)?\s*=>\s*c\.match\(req/.test(sw), 'fetch handler still uses caches.match(req...), which can return an old copy from the vendor cache'));
ok('export-engine.js is shipped with every build (so it updates)', () => assert(/FILES\s*=\s*\[[^\]]*['"]\.\/export-engine\.js['"]/.test(sw), "add './export-engine.js' to FILES in sw.js"));
ok('an old copy of export-engine.js left in the vendor cache is thrown away on update', () => assert(/VENDOR_CACHE\)[\s\S]{0,200}\.delete\(/.test(sw)));
console.log('\n' + n + ' checks passed');