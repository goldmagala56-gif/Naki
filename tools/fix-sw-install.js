'use strict';
// Stops "ERR_INSUFFICIENT_RESOURCES" and "could not keep ... for offline use" in the console.
// The service worker asked the phone for about 150 files at the same moment, so the phone ran out of connections and even
// fonts.css / editor.css / theme.css failed to load. Now the offline copy is saved a few files at a time, the app's own
// files first and the fonts last.   Only www/sw.js changes.   node tools/fix-sw-install.js   then   npm test
const fs = require('fs'), path = require('path'), file = path.join(__dirname, '..', 'www', 'sw.js');
const raw = fs.readFileSync(file, 'utf8'), crlf = raw.indexOf('\r\n') >= 0; let s = raw.replace(/\r\n/g, '\n');
if (s.indexOf('Naki:batches') >= 0) { console.log('Already applied.'); process.exit(0); }
const a = "Promise.all(FILES.map((f) => c.add(f).catch(() => console.warn('Naki: could not keep', f, 'for offline use'))))";
const n = s.split(a).length - 1; if (n !== 1) { console.error('STOPPED, nothing changed: the install line was found ' + n + ' times (needs 1). Paste me lines 10-20 of www/sw.js.'); process.exit(1); }
const b = `(function(){   // Naki:batches - six files at a time, the app first and the fonts last
      var isFont = function (f){ return f.indexOf('/fonts/') >= 0 && f.indexOf('fonts.css') < 0; }, order = FILES.filter(function (f){ return !isFont(f); }).concat(FILES.filter(isFont)), i = 0;
      function next(){
        if (i >= order.length) return Promise.resolve();
        var part = order.slice(i, i + 6); i += 6;
        return Promise.all(part.map((f) => c.add(f).catch(() => console.warn('Naki: could not keep', f, 'for offline use')))).then(next);
      }
      return next();
    })()`;
s = s.replace(a, () => b);
fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('sw.js updated: files are now saved six at a time. Publish, then reload Naki twice. Now run: npm test');