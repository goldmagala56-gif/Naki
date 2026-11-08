'use strict';
/* Naki offline voices with Piper (WASM). Loaded on demand by NakiTTS.loadEngine('piper') when the person taps "Load offline voices".

   It expects www/vendor/piper/piper-tts-web.mjs: the @mintplex-labs/piper-tts-web package bundled into one ES module (see vendor/piper/README.txt),
   which offers  predict({ text, voiceId }) -> Blob (WAV),  download(voiceId, onProgress),  stored() -> [voiceId]  (and voices(), remove(), flush()).
   If you swap in another Piper build, only load() and synth() below need to change; the rest of the app only sees the engine contract in tts.js.

   NOTE: this adapter has been written against that package's documented API but could not be run where it was made. Test one voice end to end. */
(function () {
  var VOICES = [
    ['en_US-hfc_female-medium', 'Hannah', 'en-US', 'English (US)'], ['en_US-hfc_male-medium', 'Henry', 'en-US', 'English (US)'],
    ['en_US-amy-medium', 'Amy', 'en-US', 'English (US)'], ['en_US-ryan-high', 'Ryan', 'en-US', 'English (US)'], ['en_US-lessac-medium', 'Lessac', 'en-US', 'English (US)'],
    ['en_GB-alba-medium', 'Alba', 'en-GB', 'English (UK)'], ['en_GB-northern_english_male-medium', 'Northern male', 'en-GB', 'English (UK)'], ['en_GB-jenny_dioco-medium', 'Jenny', 'en-GB', 'English (UK)'],
    ['sw_CD-lanfrica-medium', 'Lanfrica', 'sw-CD', 'Swahili'],
    ['fr_FR-siwis-medium', 'Siwis', 'fr-FR', 'French'], ['es_ES-davefx-medium', 'Dave', 'es-ES', 'Spanish'], ['de_DE-thorsten-medium', 'Thorsten', 'de-DE', 'German'],
    ['pt_BR-faber-medium', 'Faber', 'pt-BR', 'Portuguese (Brazil)'], ['it_IT-paola-medium', 'Paola', 'it-IT', 'Italian'], ['ar_JO-kareem-medium', 'Kareem', 'ar-JO', 'Arabic']
  ].map(function (v) { return { id: v[0], label: v[1], lang: v[2], langLabel: v[3] }; });
  var mod = null;
  function loadModule() {
    if (!mod) mod = import(new URL('vendor/piper/piper-tts-web.mjs', location.href).href);
    return mod;
  }
  var engine = {
    id: 'piper', name: 'Piper (offline)', offline: true, _m: null, _ready: false,
    ready: function () { return this._ready; },
    load: function (onStatus) {
      if (onStatus) onStatus('Loading the voice engine...');
      return loadModule().then(function (m) { engine._m = m; engine._ready = true; return engine; }, function () {
        throw new Error('The voice engine files are missing. Put piper-tts-web.mjs in www/vendor/piper/ (see vendor/piper/README.txt).');
      });
    },
    voices: function () { return VOICES; },
    // One piece of text with one voice. The first time a voice is used it is downloaded and kept on this device.
    synth: function (text, voiceId, onStatus) {
      var m = engine._m;
      return Promise.resolve(m.stored ? m.stored() : []).then(function (have) {
        if (have && have.indexOf(voiceId) >= 0) return;
        if (onStatus) onStatus('Downloading the voice (only the first time)...');
        return m.download(voiceId, function (p) { if (onStatus && p && p.total) onStatus('Downloading the voice... ' + Math.round(p.loaded * 100 / p.total) + '%'); });
      }).then(function () { return m.predict({ text: text, voiceId: voiceId }); })
        .then(function (blob) { return blob.arrayBuffer(); })
        .then(function (ab) { var d = NakiTTS.decodeWav(ab); return { samples: d.samples, sampleRate: d.sampleRate }; });
    }
  };
  NakiTTS.register(engine);
})();