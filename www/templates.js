'use strict';
/* Naki text templates: ready-made looks for a title (size, colour, place, font, outline, shadow, box) together with how it comes and goes.
   A template is only a set of the settings a text already has, so it works in the preview and in both export engines. */
var NakiTemplates = (function () {
  var LIST = [
    { key: 'clean', label: 'Clean', text: 'Your text', style: { size: 7, color: '#ffffff', pos: 'bottom', weight: 700, bg: false, font: 'sans', outline: 0, shadow: 1 }, anim: { in: 'fade', out: 'fade', loop: 'none', inMs: 400, outMs: 400 } },
    { key: 'headline', label: 'Headline', text: 'BIG NEWS', style: { size: 12, color: '#ffd400', pos: 'center', weight: 800, bg: false, font: 'bold', outline: 0.6, shadow: 1 }, anim: { in: 'pop', out: 'fade', loop: 'none', inMs: 450, outMs: 400 } },
    { key: 'lower', label: 'Lower third', text: 'Name here', style: { size: 5, color: '#ffffff', pos: 'bottom', weight: 700, bg: true, font: 'sans', outline: 0, shadow: 0 }, anim: { in: 'slideup', out: 'slidedown', loop: 'none', inMs: 450, outMs: 450 } },
    { key: 'neon', label: 'Neon', text: 'Neon', style: { size: 9, color: '#00f0ff', pos: 'center', weight: 700, bg: false, font: 'sans', outline: 0.3, shadow: 1 }, anim: { in: 'fade', out: 'fade', loop: 'pulse', inMs: 500, outMs: 500 } },
    { key: 'comic', label: 'Comic', text: 'WOW!', style: { size: 11, color: '#ffffff', pos: 'center', weight: 800, bg: false, font: 'script', outline: 0.8, shadow: 1 }, anim: { in: 'pop', out: 'pop', loop: 'none', inMs: 350, outMs: 350 } },
    { key: 'quote', label: 'Quote', text: 'A quiet line', style: { size: 6, color: '#f5f0e6', pos: 'center', weight: 400, bg: false, font: 'serif', outline: 0, shadow: 1 }, anim: { in: 'fade', out: 'fade', loop: 'none', inMs: 900, outMs: 900 } },
    { key: 'code', label: 'Terminal', text: '> hello', style: { size: 6, color: '#9dff9d', pos: 'bottom', weight: 700, bg: true, font: 'mono', outline: 0, shadow: 0 }, anim: { in: 'slideup', out: 'fade', loop: 'none', inMs: 400, outMs: 400 } },
    { key: 'impact', label: 'Impact', text: 'IMPACT', style: { size: 14, color: '#ffffff', pos: 'top', weight: 800, bg: false, font: 'bold', outline: 1, shadow: 1 }, anim: { in: 'pop', out: 'pop', loop: 'none', inMs: 300, outMs: 300 } },
    { key: 'subtitle', label: 'Subtitle', text: 'Subtitle', style: { size: 5, color: '#ffffff', pos: 'bottom', weight: 700, bg: true, font: 'sans', outline: 0, shadow: 0 }, anim: { in: 'fade', out: 'fade', loop: 'none', inMs: 250, outMs: 250 } },
    { key: 'float', label: 'Float', text: 'Floating', style: { size: 8, color: '#ffb3d9', pos: 'center', weight: 700, bg: false, font: 'sans', outline: 0.2, shadow: 1 }, anim: { in: 'slidedown', out: 'fade', loop: 'float', inMs: 600, outMs: 500 } }
  ];
  function find(key) { for (var i = 0; i < LIST.length; i++) if (LIST[i].key === key) return LIST[i]; return null; }
  var api = { LIST: LIST, find: find };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.NakiTemplates = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['templates.js'] = 'look2'; }
  return api;
})();
