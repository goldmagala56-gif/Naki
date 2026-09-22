# Changelog

Newest first. When you change the version in `package.json` and `www/core.js`, add a line here too (the tests check this).

## 0.1.9 - 2026-09-22
- Cleaned up the Preview screen: there is now exactly one clearly-labelled "Export" button that produces your finished video. Everything else (raw plan/voice downloads, the computer-based tool) moved into a collapsed "Advanced" section, since those are only needed for troubleshooting or the separate computer export tool, not normal use.

## 0.1.8 - 2026-09-22
- New (beta): "Export video" button right in Preview. Builds the finished MP4 on-device using ffmpeg.wasm (the no-special-server-needed build), so no computer, no command line, no separate program. First use downloads its ~30MB video engine once; after that it works fully offline.
- The computer-based export tool is still there as a fallback (now tucked under "Computer-based export instead"), since it's faster on a full computer and more proven so far.

## 0.1.7 - 2026-09-22
- Fixed: .gitignore had quietly lost its ffmpeg.exe / session-export exclusions in an earlier update, which could let a 100MB+ file back into a commit. Restored it, and added an automatic test that fails the build if this ever regresses again.

## 0.1.6 - 2026-09-22
- If you tap Record but never tap Play, the movie stays frozen for the whole session (this was already correct behaviour, just easy to miss). Naki now gives a one-time reminder a few seconds in: "Tip: tap Play to start the movie moving under your narration."

## 0.1.5 - 2026-09-22
- Icon refinement: the top-right corner of the N is now cut with a curve, and the orange dot sits exactly in that cut, so the letter flows into the dot with no gap or seam.

## 0.1.4 - 2026-09-22
- Fixed the app icon: the vector rebuild in 0.1.3 had drifted from the original (thinner letter, rounded background, dot pulled inward). Rebuilt it to match the original design exactly, at every size, including the Android adaptive icon.

## 0.1.3 - 2026-09-22
- New vector app icon, crisp at every size, plus a proper Android adaptive icon (icon-*-maskable.png) with a safe margin so it doesn't get clipped by round, squircle or teardrop launcher shapes.
- Added a scalable SVG favicon (icon.svg) and a classic favicon.ico, so the browser tab icon no longer 404s.

## 0.1.2 - 2026-09-22
- Added `tools/check-setup.bat`: double-click to check whether Node.js and ffmpeg are ready, with no typing needed. Reports the ffmpeg version and exactly where it was found, or where to put it if it wasn't found.

## 0.1.1 - 2026-09-22
- The movie now ducks much further under your voice by default (about 6% left, was 20%), reacts a touch faster, and recovers slightly faster too.
- Quick preset buttons for the duck depth: Mute, Almost mute, Light, Subtle.
- Mic trigger level default adjusted to -42 dB to match.

## 0.1.0 - 2026-09-22
- First version.
- Studio: record your voice while the movie plays, pause and keep talking, movie sound lowers under your voice.
- Session log with autosave and recovery, Preview with voice-timing fix, Device check.
- Desktop export tool: one finished MP4 with frozen pictures during pauses.
- Installable and works offline. Install button on the home screen, update notice.
- Project structure, automatic tests, publishing to GitHub Pages.
