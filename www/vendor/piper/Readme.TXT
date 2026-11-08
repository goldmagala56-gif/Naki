OFFLINE VOICES FOR TEXT TO SPEECH (Piper)
=========================================

Naki can always LISTEN to text with the browser's own voices. To put speech on the timeline and export it, it needs an offline voice engine
that makes a real audio file. Naki uses Piper (https://github.com/rhasspy/piper) through the npm package @mintplex-labs/piper-tts-web.

Make the engine file once, on a computer with Node:

  mkdir piper-build && cd piper-build
  npm init -y
  npm install @mintplex-labs/piper-tts-web esbuild
  npx esbuild node_modules/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js --bundle --format=esm --outfile=piper-tts-web.mjs

(If the file name inside dist/ is different, open node_modules/@mintplex-labs/piper-tts-web/package.json and use its "module" or "main" entry.)

Then copy piper-tts-web.mjs to  www/vendor/piper/piper-tts-web.mjs  and add  './vendor/piper/piper-tts-web.mjs'  to the file list in sw.js.

What happens the first time:
  - each voice (about 20 to 80 MB) is downloaded once and kept on the device, and
  - by default the package fetches its WebAssembly runtime (onnxruntime and the Piper phonemizer) from a public server. Open the page once with internet and
    use each voice once; after that it works offline as long as the browser keeps its cache. For a fully self-contained setup, download those runtime
    files too, put them under www/vendor/piper/ and point the package's wasm paths at them (see the package README).

Not available: Luganda. There is a Swahili voice (sw_CD-lanfrica-medium). A voice id that does not exist on the server gives an error message in the panel;
edit the VOICES list at the top of www/tts-piper.js to add or remove voices.