NAKI UPDATE  (editor dock, Reverse, Adjust, Detach, Captions, text styles)

1. Unzip this folder. Copy EVERYTHING inside its "www" folder into your project's "www" folder
   (the folder that contains index.html). Say YES to "replace the files in the destination".
   Copy the two files in "tools" into your project's "tools" folder.
2. The names must be exactly editor.js, project.js ... NOT "editor (1).js" or "editor - Copy.js".
3. In a terminal in your project folder run, once each:
     node tools/patch-export-engine-reverse.js
     node tools/patch-export-engine-titles.js
4. Restart your local server (or publish, if you use the published website).
5. Open the app, press F12, click "Console", type   NakiVersions   and press Enter.
   You should see five entries: editor.js "dock-captions", project.js "captions-detach",
   plan.js "text-styles", look.js "titles-more-adjust", reverse.js "reverse".
   If you see "undefined", the old files are still being served.
