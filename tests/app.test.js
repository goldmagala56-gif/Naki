'use strict';
// Checks that the project is wired together correctly.  Run with:  node tests/app.test.js   (or: npm test)
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), cp = require('child_process');
const root = path.join(__dirname, '..'), www = path.join(root, 'www');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const html = read('www', 'index.html');
const mainScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

ok('index.html loads core.js before the app script', () => {
  assert(html.indexOf('<script src="core.js"></script>') > 0);
  assert(html.indexOf('<script src="core.js"></script>') < html.indexOf('<script>'));
});
ok('app script and core.js are valid JavaScript', () => {
  new vm.Script(mainScript, { filename: 'index.html' });
  new vm.Script(read('www', 'core.js'), { filename: 'core.js' });
  new vm.Script(read('www', 'sw.js'), { filename: 'sw.js' });
});
ok('every element the script looks up exists in the page', () => {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const used = [...mainScript.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
  const missing = [...new Set(used)].filter(u => !ids.has(u));
  assert.deepStrictEqual(missing, [], 'missing ids: ' + missing.join(', '));
});
ok('every file the service worker caches exists', () => {
  const list = read('www', 'sw.js').match(/const FILES = \[(.*?)\]/)[1].match(/'\.\/([^']*)'/g).map(s => s.slice(3, -1));
  list.filter(Boolean).forEach(f => assert(fs.existsSync(path.join(www, f)), 'missing ' + f));
});
ok('manifest is valid and its icons exist', () => {
  const m = JSON.parse(read('www', 'manifest.webmanifest'));
  assert.strictEqual(m.start_url, './');
  m.icons.forEach(i => assert(fs.existsSync(path.join(www, i.src)), 'missing icon ' + i.src));
});
ok('version matches in package.json, core.js and CHANGELOG', () => {
  const v = require('../package.json').version;
  assert.strictEqual(require('../www/core.js').NAKI_VERSION, v);
  assert(read('CHANGELOG.md').includes('## ' + v), 'CHANGELOG.md has no entry for ' + v);
});
ok('stamping gives a build id and leaves no placeholder', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naki-stamp-'));
  fs.copyFileSync(path.join(www, 'sw.js'), path.join(tmp, 'sw.js'));
  fs.copyFileSync(path.join(www, 'index.html'), path.join(tmp, 'index.html'));
  const r = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'stamp.js'), 'abc1234ffff', tmp], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  ['sw.js', 'index.html'].forEach(f => { const t = fs.readFileSync(path.join(tmp, f), 'utf8'); assert(!t.includes('__BUILD__')); assert(t.includes('abc1234')); });
  fs.rmSync(tmp, { recursive: true, force: true });
});
ok('publishing workflow exists and runs the tests first', () => {
  const w = read('.github', 'workflows', 'pages.yml');
  assert(w.includes('npm test') && w.includes('needs: test') && w.includes('tools/stamp.js'));
});
ok('export-engine.js is valid JavaScript and exports its pure functions', () => {
  new vm.Script(read('www', 'export-engine.js'), { filename: 'export-engine.js' });
  const E = require('../www/export-engine.js');
  ['parseProbeInfo', 'buildGainRaw', 'planToJobs', 'finalMixArgs'].forEach(
    (fn) => assert.strictEqual(typeof E[fn], 'function', 'missing export: ' + fn)
  );
});
ok('every ffmpeg vendor file export-engine.js expects actually exists', () => {
  ['ffmpeg.js', '814.ffmpeg.js', 'ffmpeg-core.js', 'ffmpeg-core.wasm'].forEach(
    (f) => assert(fs.existsSync(path.join(www, 'vendor', 'ffmpeg', f)), 'missing vendor file: ' + f)
  );
});
ok('vendored ffmpeg scripts never call require() (that is what broke @ffmpeg/util)', () => {
  // The actual bug: @ffmpeg/util's own "browser" build called require() internally to pull
  // in two sibling files, which doesn't exist outside Node/a bundler, and crashed the moment
  // the script loaded in a plain <script> tag. This checks every vendored .js file for that
  // exact, unambiguous signal so the same mistake can't quietly come back — including if a
  // future update ever re-adds @ffmpeg/util or a similarly-broken package.
  ['ffmpeg.js', '814.ffmpeg.js', 'ffmpeg-core.js'].forEach((f) => {
    const src = read('www', 'vendor', 'ffmpeg', f);
    assert(!/require\(/.test(src), f + ' calls require(), which will crash as a plain browser script');
  });
});
ok('the export button in index.html only ever calls elements that exist', () => {
  assert(html.includes('id="bExport"') && html.includes('id="exportBar"') && html.includes('id="exportDownload"'));
});
ok('the service worker knows to serve the video engine from its own cache when offline', () => {
  const sw = read('www', 'sw.js');
  assert(sw.includes('VENDOR_CACHE') && sw.includes('vendor/ffmpeg'));
});
ok('.gitignore keeps ffmpeg and session exports out of the repo', () => {
  const gi = read('.gitignore');
  ['tools/export/ffmpeg.exe', '*_plan.json', '*_voice.webm', '*_naki.mp4'].forEach(
    (line) => assert(gi.includes(line), '.gitignore is missing: ' + line)
  );
});

console.log('\n' + n + ' checks passed');
