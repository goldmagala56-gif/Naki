'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ed = fs.readFileSync(path.join(__dirname, '..', 'www', 'editor.js'), 'utf8').replace(/\r\n/g, '\n');
new vm.Script(ed, { filename: 'editor.js' });
['function syncMaskHandles()', 'function maskDrag(ev, mode)', "maskDrag(e, 'turn')", "maskDrag(e, 'size')", "maskDrag(e, 'move')", 'var _syncOv0 = syncOverlays;', 'var _renderDock0 = renderDock;']
  .forEach(x => assert(ed.includes(x), 'missing ' + x));
console.log('mask-handles ok');
