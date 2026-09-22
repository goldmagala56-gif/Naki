NAKI EXPORT
Turns a Naki session into one finished MP4: the movie plays, freezes where you
paused, your voice runs over everything, and the movie sound is lowered whenever
you spoke.

WHAT YOU NEED (one time)
1. Node.js (the LTS version) from nodejs.org.
   Current Node versions need Windows 10 or newer.
2. ffmpeg. Download a Windows build (the "essentials" build is enough), unzip it,
   and copy ffmpeg.exe into THIS folder, next to naki-export.js.
   ffmpeg must be version 4.4 or newer.

EACH TIME YOU WANT A VIDEO
1. In Naki, open your session (Preview) and press "Save for export (plan and voice)".
   This saves two files: NAME_plan.json and NAME_voice.webm.
2. Make a new folder. Put in it:
     - the same movie file you narrated
     - NAME_plan.json
     - NAME_voice.webm
3. Copy naki-export.js, naki-export.bat and ffmpeg.exe into that same folder
   (or keep them in one tools folder and drag your session folder onto naki-export.bat).
4. Double-click naki-export.bat.
5. When it says Done, your video is in the same folder, named NAME_naki.mp4.

OPTIONS (advanced, when running from a command window)
   node naki-export.js . --height 720        sharper picture (default is 480)
   node naki-export.js . --preset ultrafast  faster on a slow computer, bigger file
   node naki-export.js . --crf 28            smaller file, lower quality (default 24)
   node naki-export.js . --voice-gain 3      make your voice 3 dB louder
   node naki-export.js . --keep-temp         keep the working files, for testing

IF SOMETHING GOES WRONG
- "ffmpeg was not found": ffmpeg.exe is not next to naki-export.js.
- "The movie file was not found": the movie must have exactly the same file name as when you narrated it.
- Voice comes early or late: in Naki Preview, move "Voice timing" until it matches, then save the plan again.
- Big sessions take a while on an old laptop. Keep it plugged in and close other programs.
