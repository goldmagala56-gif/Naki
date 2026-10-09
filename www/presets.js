'use strict';
/* Naki filter presets: ready-made looks. A preset is only a set of numbers for the colour controls the Adjust panel already has
   (brightness, contrast, colour, warmth, vignette, faded), so every preset works in the preview and in both export engines.
   Intensity 0 is the untouched picture, 1 is the full look. */
var NakiPresets = (function () {
  var NEUTRAL = { brightness: 1, contrast: 1, saturate: 1, warmth: 0, vignette: 0, matte: 0 };
  var LIST = [
    { key: 'none', label: 'None', v: {} },
    { key: 'vivid', label: 'Vivid', v: { brightness: 1.05, contrast: 1.15, saturate: 1.35 } },
    { key: 'punch', label: 'Punch', v: { contrast: 1.3, saturate: 1.2 } },
    { key: 'warm', label: 'Warm', v: { brightness: 1.03, contrast: 1.05, saturate: 1.1, warmth: 0.45 } },
    { key: 'cool', label: 'Cool', v: { contrast: 1.05, saturate: 1.05, warmth: -0.4 } },
    { key: 'cinema', label: 'Cinema', v: { brightness: 0.95, contrast: 1.2, saturate: 0.85, warmth: 0.12, vignette: 0.45 } },
    { key: 'bw', label: 'B&W', v: { contrast: 1.15, saturate: 0 } },
    { key: 'retro', label: 'Retro', v: { contrast: 0.95, saturate: 0.8, warmth: 0.3, vignette: 0.25, matte: 0.35 } },
    { key: 'fade', label: 'Fade', v: { brightness: 1.05, contrast: 0.9, saturate: 0.85, matte: 0.5 } },
    { key: 'soft', label: 'Soft', v: { brightness: 1.08, contrast: 0.9, saturate: 1.05, matte: 0.15 } },
    { key: 'night', label: 'Night', v: { brightness: 0.85, contrast: 1.15, saturate: 0.9, warmth: -0.35, vignette: 0.4 } }
  ];
  function find(key) { for (var i = 0; i < LIST.length; i++) if (LIST[i].key === key) return LIST[i]; return null; }
  // The numbers to hand to project.js setFilter for a preset at some intensity (0 to 1). Every control is named, so a new preset
  // replaces the old one completely. Sharpen is always put back to 0: it only exists in the ffmpeg engine.
  function apply(key, amount) {
    var p = find(key), a = amount == null ? 1 : Math.max(0, Math.min(1, +amount)), out = { sharpen: 0 };
    if (isNaN(a)) a = 1;
    Object.keys(NEUTRAL).forEach(function (k) {
      var target = p && p.v[k] != null ? p.v[k] : NEUTRAL[k];
      out[k] = Math.round((NEUTRAL[k] + (target - NEUTRAL[k]) * a) * 1000) / 1000;
    });
    return out;
  }
  var api = { LIST: LIST, NEUTRAL: NEUTRAL, find: find, apply: apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiPresets = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['presets.js'] = 'effects'; }
  return api;
})();
