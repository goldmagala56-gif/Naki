#!/usr/bin/env node
'use strict';
/*
  Naki export: turns a Naki session into one finished MP4.

  Put these three files in one folder:
    1. the movie (the same file you narrated)
    2. NAME_plan.json   (from Naki: Save files > Export plan)
    3. NAME_voice.webm  (from Naki: Save files > Voice)
  Then run:   node naki-export.js .
  You need Node.js and ffmpeg (see README.txt).

  How it works:
    - each "play" part of the plan is cut from the movie and re-encoded small
    - each "pause" part becomes the frozen frame, held for as long as you talked
    - the movie sound is lowered wherever you spoke (the same curve you heard live)
    - your voice is mixed on top, then everything is joined into one MP4
*/
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const FPS = 30;
const SR = 48000;
const GAIN_HZ = 1000;

/* ---------- small helpers ---------- */
function die(msg){ console.error('\nNaki export stopped: ' + msg + '\n'); process.exit(1); }
function say(msg){ console.log(msg); }
function parseArgs(argv){
  const o = { _: [] };
  for (let i = 2; i < argv.length; i++){
    const a = argv[i];
    if (a.startsWith('--')){
      const k = a.slice(2);
      if (k === 'keep-temp') o[k] = true; else o[k] = argv[++i];
    } else o._.push(a);
  }
  return o;
}
function listPath(p){ return "file '" + p.replace(/\\/g, '/').replace(/'/g, "'\\''") + "'"; }

function findFfmpeg(o){
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const cands = [o.ffmpeg, process.env.NAKI_FFMPEG, path.join(__dirname, exe), 'ffmpeg'].filter(Boolean);
  for (const c of cands){
    const r = cp.spawnSync(c, ['-version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0){
      const m = /version\s+n?(\d+)\.(\d+)/.exec(r.stdout);
      return { bin: c, major: m ? +m[1] : 99, minor: m ? +m[2] : 0, text: r.stdout.split('\n')[0] };
    }
  }
  return null;
}

function runFfmpeg(bin, args, onProgress){
  return new Promise((resolve, reject) => {
    const p = cp.spawn(bin, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'].concat(args), { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '', buf = '';
    p.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    p.stdout.on('data', d => {
      if (!onProgress) return;
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0){
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (m) onProgress(Number(m[1]) / 1e6);
      }
    });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg failed (code ' + code + ')\n' + err.trim().split('\n').slice(-8).join('\n'))));
  });
}

function probeMovie(bin, movie){
  const r = cp.spawnSync(bin, ['-hide_banner', '-i', movie], { encoding: 'utf8' });
  const t = (r.stderr || '') + (r.stdout || '');
  const info = { hasAudio: /Stream #\d+:\d+.*Audio:/.test(t), audioMono: /Stream #\d+:\d+[^\n]*Audio:[^\n]*?,\s*mono\b/.test(t), width: 0, height: 0, sar: 1, durationSec: 0 };
  const vm = /Stream #\d+:\d+.*Video:.*?,\s*(\d{2,5})x(\d{2,5})/.exec(t);
  if (vm){ info.width = +vm[1]; info.height = +vm[2]; }
  const sm = /SAR (\d+):(\d+)/.exec(t);
  if (sm && +sm[2] > 0 && +sm[1] > 0) info.sar = +sm[1] / +sm[2];
  const dm = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(t);
  if (dm) info.durationSec = (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]);
  return info;
}

/* ---------- gain curve to raw file ---------- */
function writeGainRaw(file, points, totalMs){
  const n = Math.ceil(totalMs / 1000 * GAIN_HZ) + GAIN_HZ;
  const f = new Float32Array(n * 2);
  let j = 0;
  const pts = (points && points.length) ? points : [[0, 1]];
  for (let k = 0; k < n; k++){
    const t = k * 1000 / GAIN_HZ;
    while (j + 1 < pts.length && pts[j + 1][0] <= t) j++;
    let g;
    if (t <= pts[0][0]) g = pts[0][1];
    else if (j + 1 >= pts.length) g = pts[pts.length - 1][1];
    else {
      const a = pts[j], b = pts[j + 1];
      g = b[0] === a[0] ? b[1] : a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
    }
    f[2 * k] = g; f[2 * k + 1] = g;
  }
  fs.writeFileSync(file, Buffer.from(f.buffer));
}

/* ---------- build the list of small jobs ---------- */
function buildJobs(plan, movie, info, opt, tmp){
  const H = opt.height, W = Math.max(2, Math.round((H * (info.width * info.sar / info.height)) / 2) * 2);
  const R = ms => Math.round(ms * FPS / 1000);
  const Sm = ms => Math.round(ms * SR / 1000);
  const enc = ['-c:v', 'libx264', '-preset', opt.preset, '-crf', String(opt.crf), '-pix_fmt', 'yuv420p',
    '-profile:v', 'main', '-g', String(FPS * 2), '-r', String(FPS)];
  const ts = ['-f', 'mpegts', '-muxdelay', '0', '-muxpreload', '0'];
  const maxMovieSec = Math.max(0, (plan.movie && plan.movie.durationMs ? plan.movie.durationMs / 1000 : info.durationSec) - 0.1);
  const clampSec = ms => Math.max(0, Math.min(ms / 1000, maxMovieSec || ms / 1000));

  const jobs = [], videoList = [], audioList = [];
  plan.video.forEach((sp, i) => {
    const id = String(i).padStart(4, '0');
    const nFrames = R(sp.sessionEnd) - R(sp.sessionStart);
    const nSamples = Sm(sp.sessionEnd) - Sm(sp.sessionStart);
    if (nFrames <= 0 && nSamples <= 0) return;
    const vfile = path.join(tmp, 'v' + id + '.ts'), afile = path.join(tmp, 'a' + id + '.wav');
    const spanSec = (sp.sessionEnd - sp.sessionStart) / 1000;

    if (nFrames > 0){
      if (sp.type === 'play'){
        jobs.push({ label: 'picture', args: ['-ss', clampSec(sp.movieStart).toFixed(3), '-i', movie, '-an',
          '-vf', 'scale=' + W + ':' + H + ':flags=bicubic,setsar=1,fps=' + FPS + ',tpad=stop_mode=clone:stop_duration=' + Math.ceil(spanSec + 1) + ',format=yuv420p',
          '-frames:v', String(nFrames)].concat(enc, ts, [vfile]) });
      } else {
        const png = path.join(tmp, 'f' + id + '.png');
        jobs.push({ label: 'frozen frame', args: ['-ss', clampSec(sp.movieAt).toFixed(3), '-i', movie, '-an', '-frames:v', '1',
          '-vf', 'scale=' + W + ':' + H + ':flags=bicubic,setsar=1', png] });
        jobs.push({ label: 'frozen picture', args: ['-loop', '1', '-framerate', String(FPS), '-i', png, '-an',
          '-vf', 'format=yuv420p', '-frames:v', String(nFrames)].concat(enc, ts, [vfile]) });
      }
      videoList.push(vfile);
    }
    if (nSamples > 0){
      const atrim = 'atrim=end_sample=' + nSamples;
      const tsec = (nSamples / SR + 0.05).toFixed(3);
      if (sp.type === 'play' && info.hasAudio){
        jobs.push({ label: 'movie sound', args: ['-ss', clampSec(sp.movieStart).toFixed(3), '-i', movie, '-vn',
          '-af', (info.audioMono ? 'aresample=' + SR + ',pan=stereo|c0=c0|c1=c0,aformat=sample_fmts=s16'
            : 'aresample=' + SR + ',aformat=sample_fmts=s16:channel_layouts=stereo') + ',apad,' + atrim,
          '-t', tsec, '-c:a', 'pcm_s16le', '-f', 'wav', afile] });
      } else {
        jobs.push({ label: 'silence', args: ['-f', 'lavfi', '-i', 'anullsrc=r=' + SR + ':cl=stereo',
          '-af', 'aformat=sample_fmts=s16:channel_layouts=stereo,' + atrim,
          '-t', tsec, '-c:a', 'pcm_s16le', '-f', 'wav', afile] });
      }
      audioList.push(afile);
    }
  });
  return { jobs, videoList, audioList, W, H };
}

/* ---------- main ---------- */
async function main(){
  const o = parseArgs(process.argv);
  const opt = { height: parseInt(o.height || '480', 10), preset: o.preset || 'veryfast', crf: parseInt(o.crf || '24', 10), voiceGainDb: parseFloat(o['voice-gain'] || '0') };
  if (![240, 360, 480, 540, 720, 1080].includes(opt.height)) die('--height must be 360, 480, 720 or 1080.');

  const ff = findFfmpeg(o);
  if (!ff) die('ffmpeg was not found. Put ffmpeg.exe in the same folder as naki-export.js, or install ffmpeg. See README.txt.');
  say('Using ' + ff.text);

  // find the files
  let planFile = o.plan, folder = o._[0] || '.';
  if (!planFile){
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) die('Folder not found: ' + folder);
    const plans = fs.readdirSync(folder).filter(f => /_plan\.json$/i.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(folder, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    if (!plans.length) die('No file ending in _plan.json was found in ' + path.resolve(folder) + '. In Naki, open the session and press "Export plan".');
    planFile = path.join(folder, plans[0].f);
    if (plans.length > 1) say('Several plans found. Using the newest: ' + plans[0].f);
  } else folder = path.dirname(planFile);

  let plan;
  try { plan = JSON.parse(fs.readFileSync(planFile, 'utf8')); } catch (e) { die('Could not read the plan file: ' + e.message); }
  if (plan.naki !== 'export-plan' || !Array.isArray(plan.video) || !plan.video.length) die('That file is not a Naki export plan.');

  const findIn = (name) => {
    if (!name) return null;
    const direct = path.join(folder, name);
    if (fs.existsSync(direct)) return direct;
    const low = name.toLowerCase(), hit = fs.readdirSync(folder).find(f => f.toLowerCase() === low);
    return hit ? path.join(folder, hit) : null;
  };
  const movie = o.movie || findIn(plan.movie && plan.movie.name);
  if (!movie || !fs.existsSync(movie)) die('The movie file was not found. Copy "' + (plan.movie && plan.movie.name) + '" into ' + path.resolve(folder) + ', or use --movie path.');
  const voice = o.voice || findIn(plan.voice && plan.voice.file);
  if (!voice || !fs.existsSync(voice)) die('The voice file was not found. Expected "' + (plan.voice && plan.voice.file) + '" in ' + path.resolve(folder) + '.');
  const outFile = o.out || path.join(folder, path.basename(planFile).replace(/_plan\.json$/i, '') + '_naki.mp4');

  const info = probeMovie(ff.bin, movie);
  if (!info.width) die('Could not read the movie: ' + movie);
  const totalMs = plan.durationMs;
  say('Movie: ' + path.basename(movie) + ' (' + info.width + 'x' + info.height + (info.hasAudio ? '' : ', no sound') + ')');
  say('Session length: ' + (totalMs / 1000).toFixed(1) + ' s, ' + plan.video.length + ' parts, output ' + opt.height + 'p');

  const tmp = o.temp ? path.resolve(o.temp) : fs.mkdtempSync(path.join(os.tmpdir(), 'naki-'));
  if (o.temp) fs.mkdirSync(tmp, { recursive: true });
  const started = Date.now();
  try {
    const B = buildJobs(plan, movie, info, opt, tmp);
    for (let i = 0; i < B.jobs.length; i++){
      process.stdout.write('\rPreparing pieces ' + (i + 1) + ' of ' + B.jobs.length + ' (' + B.jobs[i].label + ')          ');
      await runFfmpeg(ff.bin, B.jobs[i].args);
    }
    process.stdout.write('\n');

    const vlist = path.join(tmp, 'video.txt'), alist = path.join(tmp, 'audio.txt'), graw = path.join(tmp, 'gain.f32');
    fs.writeFileSync(vlist, B.videoList.map(listPath).join('\n') + '\n');
    fs.writeFileSync(alist, B.audioList.map(listPath).join('\n') + '\n');
    writeGainRaw(graw, plan.movieGain && plan.movieGain.points, totalMs);

    const offMs = Math.round((plan.voice && plan.voice.offsetMs) || 0);
    let voiceChain = 'highpass=f=80,aresample=' + SR + ',aformat=channel_layouts=mono,pan=stereo|c0=c0|c1=c0';
    if (opt.voiceGainDb) voiceChain += ',volume=' + opt.voiceGainDb + 'dB';
    if (offMs > 0) voiceChain += ',adelay=' + offMs + '|' + offMs;
    else if (offMs < 0) voiceChain += ',atrim=start=' + (-offMs / 1000) + ',asetpts=PTS-STARTPTS';
    const newAmix = ff.major > 4 || (ff.major === 4 && ff.minor >= 4);
    const mix = newAmix ? 'amix=inputs=2:duration=longest:dropout_transition=0:normalize=0' : 'amix=inputs=2:duration=longest:dropout_transition=0,volume=2';
    const fc = [
      '[1:a]aresample=' + SR + ',aformat=sample_fmts=fltp:channel_layouts=stereo[m]',
      '[2:a]aresample=' + SR + ',aformat=sample_fmts=fltp:channel_layouts=stereo[g]',
      '[m][g]amultiply[md]',
      '[3:a]' + voiceChain + '[v]',
      '[md][v]' + mix + '[mx]',
      '[mx]alimiter=limit=0.95[aout]'
    ].join(';');
    const finalArgs = ['-progress', 'pipe:1', '-nostats',
      '-f', 'concat', '-safe', '0', '-i', vlist,
      '-f', 'concat', '-safe', '0', '-i', alist,
      '-f', 'f32le', '-ar', String(GAIN_HZ), '-ac', '2', '-i', graw,
      '-i', voice,
      '-filter_complex', fc,
      '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-t', (totalMs / 1000).toFixed(3), '-movflags', '+faststart', outFile];
    let lastPct = -1;
    await runFfmpeg(ff.bin, finalArgs, sec => {
      const pct = Math.min(100, Math.round(sec / (totalMs / 1000) * 100));
      if (pct !== lastPct){ lastPct = pct; process.stdout.write('\rJoining picture and sound: ' + pct + '%   '); }
    });
    process.stdout.write('\n');
    const mb = (fs.statSync(outFile).size / 1048576).toFixed(1);
    say('\nDone in ' + Math.round((Date.now() - started) / 1000) + ' s. Saved ' + outFile + ' (' + mb + ' MB)');
  } catch (e) {
    die(e.message);
  } finally {
    if (!o['keep-temp'] && !o.temp){ try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
  }
}

main();
