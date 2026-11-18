const assert = require('assert');
const W = require('../www/webcodecs-export.js').WebCodecsExport;
const plan = { video: [{ filter: {} }], audio: [], fx: [{ startMs: 0, durMs: 1000, fx: 'shake', strength: 0.5 }] };
W._test.setFilterSupport(true);
assert.strictEqual(W.canRender(plan), true, 'effects no longer force the slow engine');
W._test.setFilterSupport(false);
assert.strictEqual(W.canRender(plan), false, 'without canvas filters the slow engine is kept');
console.log('fast-fx ok');
