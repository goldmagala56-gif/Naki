# Naki roadmap

We go one step at a time. Each step ends with something you can run and check.

## Done
- [x] Blueprint (`docs/blueprint.md`)
- [x] Studio: record your voice while the movie plays, pause and keep talking, auto-lowering of the movie sound
- [x] Session log, autosave and recovery, Preview, Device check
- [x] Core logic in its own file (`www/core.js`) with automatic tests
- [x] Desktop export tool: finished MP4 with frozen pictures during pauses (`tools/export`)
- [x] Installable and offline (manifest and service worker), install button, automatic update notice
- [x] Project tests, automatic build ids, publishing workflow, Git and phone-test guides

## Steps
1. [x] One project folder on your computer (this folder).
2. [ ] Git and GitHub, pushed together. Publish the app to GitHub Pages (in progress).
3. [ ] Phone test round: Check this device, record with headphones, test offline. Fix what breaks.
4. [ ] Phone polish: controls, weak-phone speed, storage and battery warnings.
5. [ ] One-tap export inside the desktop app (desktop shell with ffmpeg included).
6. [x] In-app export using ffmpeg.wasm — works entirely offline in the browser/installed app, no computer needed (supersedes the original "Android native export" plan; Play Store packaging is now optional polish, not a blocker)
7. [x] Prepare movie screen — converts files that will not play, using the same in-app video engine
8. [ ] Luganda text and a short in-app guide.
9. [ ] "Take back": redo just the last few seconds without re-recording the whole session.
10. [ ] Finish v1: all edge cases from the blueprint, test on several phones, release.

## Later
Take-back re-recording, captions, TikTok vertical format, sound effects, intro and outro, logo watermark, iPhone and Mac, one-tap share to TikTok and WhatsApp.

## v1 is complete when
- A full narrated session records and replays on a 2 GB phone with no internet.
- The finished video exports on the phone, with pauses frozen and voice and movie sound balanced.
- Crashes, calls and full storage never lose a session.
- Files that will not play get a clear "convert" path.
- The app works in English and Luganda.
