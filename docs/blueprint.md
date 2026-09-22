# Naki: Complete Blueprint

*Offline VJ studio for phones and desktops. Play a movie, narrate live, pause for extra explanation, export one finished video.*

This is the plan for the **complete** app, so we build each part once and don't keep reworking versions. Sections 1 to 3 say what Naki is, 4 to 8 say how it looks and is built, 9 to 12 cover the hard technical parts, and 13 to 15 cover order of work and open decisions.

---

## 1. Goal and non-goals

**Goal:** anyone with a cheap phone (2 GB RAM) or a computer can VJ a video: watch it, narrate over it live, pause when they want to explain more, and get a finished video, with no internet.

**Non-goals for v1:**
- No online accounts, cloud sync or social features
- Not a full video editor (no trimming timelines, effects or transitions)
- No built-in movies or downloads; users bring their own files
- No live streaming

---

## 2. Target devices and performance budget

| Item | Target |
|---|---|
| Phones | Android, 2 GB RAM minimum (exact minimum Android version decided after the Phase 0 tests) |
| Desktop | Windows 10+ (test machine: Lenovo T430); Mac later |
| Internet | Never required |
| Live session | Must run smoothly on a 2 GB phone: video plays, mic records, UI stays responsive |
| App size | As small as possible; the export engine is the biggest part |

**Budget rules (apply to every feature):**
1. The UI thread never does heavy work.
2. Nothing large is held in memory: audio is written to disk in small chunks.
3. The movie is used **in place**, not copied.
4. No video re-encoding during a live session.
5. No animations or effects that cost battery for no benefit.
6. Autosave every few seconds so a crash or phone call loses almost nothing.

---

## 3. Main user flow

```
Home -> Pick movie -> (Prepare, if needed) -> Studio: record
     -> Review/Preview -> Export -> Share/Save
```

Secondary flows: reopen a project, re-record from a point ("take back"), change settings, delete projects to free space.

---

## 4. Screen map and layouts

Screens: **Home, Prepare, Studio, Preview, Export, Projects, Settings.**

### 4.1 Home
```
+---------------------------+
|  NAKI                  (gear)
+---------------------------+
|                           |
|   [  + New VJ project  ]  |
|                           |
|   Recent projects         |
|   +---------------------+ |
|   | thumb | Name        | |
|   |       | 12 min, date| |
|   +---------------------+ |
|   | thumb | Name        | |
|   +---------------------+ |
|                           |
|  Storage: 3.2 GB free     |
+---------------------------+
```

### 4.2 Prepare (only when needed)
Shown if the file can't play well (unsupported format or audio).
```
+---------------------------+
| <  Prepare movie          |
+---------------------------+
| File: movie.mkv           |
| Problem: audio format not |
| supported on this phone   |
|                           |
| [ Convert (takes ~X min) ]|
| [ Try anyway ]            |
| Space needed: 1.1 GB      |
+---------------------------+
```

### 4.3 Studio (the main screen)
```
+---------------------------+
| <  Project name     (gear)|
+---------------------------+
|                           |
|        VIDEO AREA         |
|   (tap = show/hide UI)    |
|                           |
+---------------------------+
| 00:12:31 ---o------ 1:40:00|  seek bar (locked while recording)
| REC 00:04:10   mic |||||. |  timer + mic level meter
+---------------------------+
| Movie volume  ----o----   |
| Auto-lower under my voice |
|   [ON]  strength ---o---  |
+---------------------------+
| [<< 10s]  [ PAUSE/PLAY ]  [10s >>] |
|          [ (o) REC / STOP ]        |
+---------------------------+
```

**Studio states:**
1. **Ready:** movie paused at the chosen start point, seek bar unlocked, headphones reminder shown.
2. **Countdown:** 3, 2, 1 after pressing REC.
3. **Recording, playing:** voice recording, movie playing, timer running.
4. **Recording, paused:** picture frozen, **voice keeps recording** (this is the "explain more" moment).
5. **Stopped:** goes to Preview.

**Rules:**
- Pressing REC starts the voice track at session time 0. The movie stays where it is until you press Play, so you can greet your audience first.
- Seek bar is locked while recording (avoids accidents). The 10-second buttons still work and are logged.
- Big, thumb-friendly buttons; works one-handed.
- Desktop hotkeys: Space = play/pause, R = REC/stop, Left/Right = 10s, Up/Down = movie volume.
- Warn if no headphones are detected (movie sound would leak into the mic).

### 4.4 Preview
```
+---------------------------+
| <  Preview                |
+---------------------------+
|        VIDEO AREA         |
+---------------------------+
| session 00:00 ---o--- 8:40|
| [ play ]  [ Re-record from here ] |
+---------------------------+
| [ Export ]                |
+---------------------------+
```
Replays the session exactly as recorded: video, your voice, freezes and the movie volume changes. It does not render anything, so it is instant.

### 4.5 Export
```
+---------------------------+
| <  Export                 |
+---------------------------+
| Quality: (o) 480p ( ) 720p|
| Split into parts: [OFF]   |
|   part length: 60 s       |
| Estimated size: 180 MB    |
| Estimated time: ~12 min   |
| Free space: 3.2 GB        |
|                           |
| [ Start export ]          |
|  ---- progress bar ----   |
|  Keep charger connected   |
+---------------------------+
```
On finish: **Save to gallery / Share / Open folder**.

### 4.6 Projects
List with name, length, size on disk, date. Actions: open, rename, delete (with size shown), export again.

### 4.7 Settings
- Language: English / Luganda
- Voice quality (Low / Normal)
- Default export quality
- Auto-lower defaults (strength, speed)
- Storage location
- About and help (short "how to VJ" guide inside the app)

---

## 5. Architecture

Three layers, so the app can be built once and run on phone and desktop.

```
+--------------------------------------------------+
| UI (HTML, CSS, light JavaScript)                 |
+--------------------------------------------------+
| CORE (pure JavaScript, no device code)           |
|  session log, gain envelope, export plan, i18n   |
+--------------------------------------------------+
| PLATFORM ADAPTERS                                 |
|  files | video player | mic recorder | export    |
|  Android (Capacitor + native) | Desktop (Electron)|
+--------------------------------------------------+
```

- **UI:** one interface for all devices, responsive layout.
- **Core:** all the logic that decides *what the final video should be*. It has no device code, so it is written once and tested on a PC.
- **Adapters:** the parts that differ per device (file picker, video playback, mic, export engine).
- **Packaging:** Capacitor for Android (iPhone later), Electron for Windows/Mac.

**Suggested folders:**
```
naki/
  core/        session.js  events.js  gain-envelope.js  export-plan.js  i18n/
  ui/          screens/  components/  styles/
  platform/    android/  desktop/  web-test/
  engines/     ffmpeg-desktop/  android-native/
  locales/     en.json  lg.json
  tests/       sample clips, session fixtures
```

---

## 6. Data model

**Project folder:**
```
MyProject/
  project.json     name, movie path, movie duration, created date
  session.json     the event log (below)
  voice/           voice track chunks (recorded continuously)
  exports/         finished videos
```

**session.json:**
```json
{
  "version": 1,
  "movie": { "path": "...", "durationMs": 6000000 },
  "voice": { "codec": "opus", "chunks": ["v0001.ogg", "v0002.ogg"] },
  "events": [
    { "t": 0,     "type": "rec_start" },
    { "t": 4200,  "type": "play",  "movieMs": 0 },
    { "t": 31000, "type": "vol",   "value": 0.35 },
    { "t": 65000, "type": "pause", "movieMs": 61000 },
    { "t": 82000, "type": "play",  "movieMs": 61000 },
    { "t": 90000, "type": "jump",  "fromMs": 151000, "toMs": 141000 },
    { "t": 540000, "type": "rec_stop" }
  ]
}
```
`t` is session time (ms since REC). Everything else is derived from it.

**Export plan (built by Core from the session):**
```json
{
  "durationMs": 540000,
  "video": [
    { "type": "play",   "sessionStart": 4200,  "sessionEnd": 65000, "movieStart": 0 },
    { "type": "freeze", "sessionStart": 65000, "sessionEnd": 82000, "movieAt": 61000 },
    { "type": "play",   "sessionStart": 82000, "sessionEnd": 90000, "movieStart": 61000 }
  ],
  "movieGain": [ [0, 1.0], [4200, 0.35], [4300, 0.12] ],
  "voice": "voice/*"
}
```
Every export engine reads this plan, so **all engines behave the same**.

---

## 7. Audio design

- **Mic recording:** mono, low bitrate voice codec, written to disk in small chunks.
- **Echo:** users should use headphones (the app reminds them). Echo cancellation stays on by default.
- **Auto-lower (ducking):** Core computes a movie-volume envelope from the voice track:
  - measure voice loudness in short windows
  - if it is above a threshold, lower the movie to a set level quickly (about 50 ms attack)
  - when the voice stops, bring it back slowly (about 400 ms release)
  - the user's manual movie-volume setting is multiplied on top
- The **same algorithm** runs live (so you hear it while narrating) and in export (as the `movieGain` list), so what you hear matches what is exported.
- Movie audio plays only during play spans. During freezes it is silent and only your voice is heard.

---

## 8. Format handling

- **Plays directly:** MP4 (H.264 video, AAC audio) works almost everywhere.
- **Often problematic:** MKV, AVI, and audio types like AC3/DTS.
- The **Prepare** screen detects problems and offers a one-time conversion, with a clear time and space estimate. On very weak phones it should also offer "prepare on a computer".
- Users are told plainly what will happen before anything long runs.

---

## 9. Export engine

**What it does:** follows the export plan: renders each play span from the movie, each freeze span as a held frame, mixes the movie audio (with `movieGain`) and the voice track, and writes one MP4.

**Engines (same plan, different backend):**
- **Desktop:** FFmpeg.
- **Android:** a native engine (Android's own media tools or an Android FFmpeg library; chosen in Phase 0, see section 13).

**Low-end rules:**
- Use the hardware video encoder where available.
- Process in pieces so memory stays low.
- Run as a background task/service so Android doesn't kill it.
- Show progress, allow cancel, and allow resuming after an interruption.
- Quality presets: 480p (default on weak phones) and 720p.
- Optional auto-split into parts (for TikTok).
- Check free space and battery before starting.

---

## 10. Edge cases the app must handle

| Situation | Behaviour |
|---|---|
| Phone call or notification during recording | Pause the session safely, resume or stop on return |
| App killed or phone dies | Autosave: reopen and recover the session up to the last few seconds |
| Storage nearly full | Warn before recording and before exporting |
| Mic permission denied | Explain and link to settings |
| Headphones unplugged mid-session | Warn (don't stop) |
| Very long movie on a weak phone | Warn about export time, suggest splitting or exporting later |
| Battery low during export | Pause and ask to charge |
| Movie file moved or deleted | Ask user to locate it again |
| Jump back while recording | Logged; the export replays that part of the movie |

---

## 11. Localization

- All text lives in `locales/en.json` and `locales/lg.json`.
- Luganda wording should be reviewed by a native speaker.
- Short in-app "How to VJ with Naki" guide with 4 steps and screenshots.

---

## 12. Testing plan

- Test clips: 30 s, 5 min and 30 min, in MP4, plus an MKV and an AC3-audio file.
- Test devices: at least one real 2 GB phone, one mid-range phone, and the desktop.
- Core tests: session log to export plan, gain envelope, pause and jump handling.
- Checklist per release: record, pause, preview, export, crash recovery, low storage, low battery.

---

## 13. Build order (risk first)

**Phase 0: Risk tests on a real 2 GB phone.** These are the parts most likely to force a redesign, so we test them first:
1. Play a local video and record the mic at the same time inside the Android app wrapper.
2. Freeze-frame plus audio-mix export of a 60-second clip on Android (try the options and pick one).
3. The same export on desktop with FFmpeg.

*Done when:* we know the recording setup works on the phone and have chosen the Android export engine.

**Phase 1: Studio and session log.** Home, Studio, session log, autosave, Preview.
*Done when:* a full narrated session can be recorded and replayed on the phone.

**Phase 2: Core and desktop export.** Gain envelope, export plan, desktop export.
*Done when:* a session exports to a correct MP4 with freezes and matching audio.

**Phase 3: Android export.** Native export engine, background service, progress and resume.
*Done when:* the same session exports correctly on a 2 GB phone.

**Phase 4: Complete the app.** Projects, Prepare/convert, Settings, Luganda, all edge cases.

**Phase 5: Release.** Test matrix, installers, APK, help guide.

**After v1 (backlog):** take-back re-recording, captions, TikTok vertical format, sound effects, intro/outro, logo watermark, iPhone and Mac, one-tap share to TikTok/WhatsApp.

---

## 14. Decisions to confirm

1. Name: **Naki** (confirmed by you)
2. Logo and colours
3. Minimum Android version (decided after Phase 0)
4. Default export quality (suggested 480p on weak phones)
5. Whether Luganda is included in v1 (suggested: yes)
