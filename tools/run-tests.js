'use strict';
// node tools/run-tests.js [part-of-name]  - runs every tests/*.test.js, keeps going after a failure
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..'), dir = path.join(root, 'tests'), only = process.argv[2];
const files = fs.readdirSync(dir).filter(f => /\.test\.js$/.test(f) && (!only || f.includes(only))).sort();
const failed = [];
files.forEach(f => {
  const r = cp.spawnSync(process.execPath, [path.join(dir, f)], { cwd: root, encoding: 'utf8' });
  console.log((r.status === 0 ? 'PASS ' : 'FAIL ') + f);
  if (r.status !== 0) { failed.push(f); console.log((r.stdout || '').split('\n').slice(-15).join('\n')); console.log(r.stderr || ''); }
});
console.log('\n' + (files.length - failed.length) + ' of ' + files.length + ' test files passed' + (failed.length ? '. Failed: ' + failed.join(', ') : '.'));
process.exit(failed.length ? 1 : 0);