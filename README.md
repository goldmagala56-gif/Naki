# Naki

Narrate a movie live. Pause whenever you want to explain more. Naki records your voice and every pause, works offline, and turns the session into one finished video.

This folder is the single source of truth for the whole app. Everything lives here, and GitHub is only a copy of this folder.

## Folders
| Folder | What is in it |
|---|---|
| `www/` | The app itself. `index.html` (screens), `core.js` (the logic), `sw.js` and `manifest.webmanifest` (install and offline), icons |
| `tools/export/` | Turns a saved session into a finished MP4 on a computer (see its README.txt) |
| `tools/serve.js` | Runs the app on your own computer at http://localhost:8080 |
| `tools/stamp.js` | Used by the publishing workflow to give each published version its own id |
| `tools/check-setup.js` / `.bat` | Double-click to check whether Node.js and ffmpeg are ready for export, and where ffmpeg was found |
| `tests/` | Automatic checks: the core logic, and that the whole project is wired together |
| `docs/` | `blueprint.md` (the full plan), `ROADMAP.md` (what is done and next), `GIT.md`, `PHONE-TEST.md` |
| `.github/workflows/` | Publishes `www/` to GitHub Pages when you push |

## Run it on your computer
- Quickest: open `www/index.html` in Chrome or Edge.
- Better (same as a phone would see it, with offline mode): `node tools/serve.js`, then open http://localhost:8080.

## Check that nothing broke
`npm test`  (or `node tests/core.test.js` and `node tests/app.test.js`)

## Publishing
Push to GitHub and it happens by itself: the tests run, and if they pass the app is published to GitHub Pages with a new build id, so phones update on their own. See `docs/GIT.md`.

## Testing on a phone
See `docs/PHONE-TEST.md`.

## Movies and recordings
Never put movies or recordings in this folder. They are ignored by git on purpose. Sessions are stored inside the app on the device.
