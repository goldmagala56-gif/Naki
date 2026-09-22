'use strict';
// Checks whether this computer is ready to run Naki's export tool. No typing needed:
// double-click check-setup.bat (in this same folder) instead of running this directly.
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

function say(line){ console.log(line); }
function run(cmd, args){
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8' });
  return r.error ? null : r;
}

say('Naki setup check');
say('================');
say('');

// Node.js: if this script is running at all, Node.js works. Just show the version.
say('Node.js:  OK, version ' + process.version);
say('');

// ffmpeg: look next to the export tool first, then anywhere on the computer's PATH.
const exportDir = path.join(__dirname, 'export');
const localExe = path.join(exportDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
let found = null;

if (fs.existsSync(localExe)){
  const r = run(localExe, ['-version']);
  if (r && r.status === 0) found = { path: localExe, text: r.stdout.split('\n')[0] };
}
if (!found){
  const r = run('ffmpeg', ['-version']);
  if (r && r.status === 0){
    const where = run(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg']);
    const loc = where && where.status === 0 ? where.stdout.split('\n')[0].trim() : '(on your computer\'s PATH)';
    found = { path: loc, text: r.stdout.split('\n')[0] };
  }
}

if (found){
  say('ffmpeg:   FOUND');
  say('  ' + found.text);
  say('  location: ' + found.path);
  const m = /version\s+n?(\d+)\.(\d+)/.exec(found.text);
  if (m && (+m[1] < 4 || (+m[1] === 4 && +m[2] < 4))){
    say('');
    say('  This copy looks older than version 4.4. Naki export needs 4.4 or newer.');
    say('  It is best to replace it (see the README in tools/export).');
  }
} else {
  say('ffmpeg:   NOT FOUND');
  say('  Naki looked next to the export tool, and on your computer\'s normal search path, and could not find it.');
  say('  If you installed it a month ago, it exists somewhere on this computer, but Naki does not know where.');
  say('  Easiest fix: search File Explorer for "ffmpeg.exe", then copy that one file into:');
  say('    ' + exportDir);
}

say('');
say('================');
say(found ? 'Naki export is ready to use.' : 'Naki export is not ready yet. See the line above.');
