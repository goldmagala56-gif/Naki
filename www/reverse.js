'use strict';
/* Naki reverse: the ffmpeg jobs that play a stretch of the movie backwards. Pure logic, no page code, tested in Node
   (with a real ffmpeg when there is one).

   ffmpeg's `reverse` filter keeps every picture of what it reverses in memory, so a whole clip would not fit on a phone.
   The stretch is cut into pieces of a few seconds, each piece is reversed on its own, and the pieces are joined LAST ONE FIRST.
   The result is one intermediate picture file, already turned / zoomed / fitted to the output size, which the normal picture
   job then reads like any other source (colour, fades, titles and logo are added there). */
var NakiReverse = (function () {
  var FPS = 30;
  var BUDGET = 100e6;   // bytes of pictures ffmpeg may hold for one piece
  function pad(n){ return String(n).padStart(3, '0'); }
  // How many output pictures fit in one piece at this output size (never more than 3 s).
  function chunkFrames(w, h){ return Math.max(8, Math.min(90, Math.floor(BUDGET / (w * h * 1.5)))); }

  // sp: a plan picture part { sessionStart, sessionEnd, movieStart, reverse }, where movieStart is the START of the stretch.
  // o: { id, nFrames, width, height, speed, fitChain, enc, ts, clampSec(ms), chunkFrames? }
  // Returns { jobs, sourceArgs, files, chunks }: run `jobs` first, then read `sourceArgs` (with `files` written beside it) as the picture.
  function reversePicture(sp, o){
    var speed = o.speed && o.speed !== 1 ? o.speed : 1, n = o.nFrames, F = o.chunkFrames || chunkFrames(o.width, o.height), step = speed / FPS;
    var E = sp.movieStart / 1000 + (sp.sessionEnd - sp.sessionStart) / 1000 * speed;   // the end of the stretch, in the movie
    var jobs = [], names = [], parts = Math.ceil(n / F);
    // Output picture k shows the movie at E - (k+1)*step. A piece of output pictures k0..k1-1 therefore reads the movie from E - k1*step.
    for (var j = 0, k0 = 0; k0 < n; j++, k0 += F){
      var k1 = Math.min(n, k0 + F), cn = k1 - k0, name = 'rv' + o.id + '_' + pad(j) + '.ts';
      // aim a quarter of a picture BEFORE the first wanted picture: ffmpeg skips pictures that come before the seek time, so aiming exactly
      // at it (or a hair after, from rounding) would lose the first picture of the piece
      var from = Math.max(0, E - k1 * step - 0.25 * step), ss = o.clampSec ? o.clampSec(from * 1000) : from;
      jobs.push({ label: 'reversing ' + (j + 1) + ' of ' + parts + ' (picture ' + o.id + ')', produces: name,
        args: ['-ss', ss.toFixed(3), '-t', (cn * step + 2 * step).toFixed(3), '-i', 'movie.in', '-an',
          '-vf', o.fitChain + ',setsar=1' + (speed !== 1 ? ',setpts=PTS/' + speed : '') + ',fps=' + FPS + ',trim=end_frame=' + cn + ',reverse,format=yuv420p',
          '-frames:v', String(cn)].concat(o.enc, o.ts, [name]) });
      names.push(name);
    }
    var list = 'rv' + o.id + '.txt', files = {};
    files[list] = new TextEncoder().encode(names.map(function (nm){ return "file '" + nm + "'\n"; }).join(''));
    return { jobs: jobs, sourceArgs: ['-f', 'concat', '-safe', '0', '-i', list], files: files, chunks: names };
  }

  var api = { reversePicture: reversePicture, chunkFrames: chunkFrames, FPS: FPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NakiReverse = api;
  return api;
})();