const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const h = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const i = h.indexOf('Naki:boot-guard'); assert(i > 0, 'guard present');
const start = h.lastIndexOf('<script>', i) + 8, end = h.indexOf('</script>', i);
new vm.Script(h.slice(start, end));
assert(h.indexOf('src="core.js"') < i && i < h.indexOf('src="reverse.js"'), 'the guard sits right after core.js');
console.log('boot-guard ok');
