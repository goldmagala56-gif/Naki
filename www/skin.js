'use strict';
/* Naki skin: puts the real Lucide icons (icons.js) on the app's buttons, and marks the page so theme.css can give it the CapCut-style look.
   It works from the outside: it watches for buttons, reads each button's name (its aria-label, its title, or its text) and, when the name is one it knows,
   swaps the old hand-drawn icon for the Lucide one (or adds an icon in front of a text-only button). Buttons it does not know are left as they are.
   Put data-noskin on a button to keep it exactly as it is.
   iconFor(label) -> the Lucide icon name for a button name, or null.   start() -> begins; it is called by itself when the page is ready. */
var NakiSkin = (function () {
  var I = (typeof module !== 'undefined' && module.exports) ? require('./icons.js') : (typeof window !== 'undefined' ? window.NakiIcons : null);
  var FILLED = { play: 1, pause: 1 };   // these two are solid, like the player buttons everywhere
  var BY_LABEL = {
    // the editor: the bottom toolbar and the tools of each part
    'add text': 'type', 'text': 'type', 'templates': 'layout-template', 'captions': 'captions', 'auto captions': 'wand-sparkles', 'mark speech': 'mic-vocal', 'add line here': 'plus',
    'import .srt / .vtt': 'file-up', 'save .srt': 'file-down', 'save .vtt': 'file-down', 'remove all captions': 'trash-2',
    'add music': 'music', 'change music': 'music', 'music pack': 'list-music', 'audio': 'music', 'effects': 'sparkles', 'sound effects': 'audio-lines', 'volume': 'volume-2', 'mix': 'sliders-vertical',
    'speed': 'gauge', 'curve': 'spline', 'speed curve': 'spline', 'reverse': 'rewind', 'freeze': 'snowflake', 'freeze frame': 'snowflake', 'adjust': 'sliders-horizontal', 'filters': 'palette', 'filter': 'palette',
    'opacity': 'droplet', 'fade': 'blend', 'replace': 'repeat', 'transition': 'blend', 'transitions': 'blend', 'animate': 'wand-sparkles', 'animation': 'wand-sparkles', 'motion': 'spline',
    'zoom': 'zoom-in', 'rotate': 'rotate-cw', 'turn': 'rotate-cw', 'flip': 'flip-horizontal-2', 'style': 'palette', 'format': 'ratio', 'layout': 'layout-grid',
    'sticker': 'sticker', 'stickers': 'sticker', 'overlay': 'layers', 'shapes': 'shapes', 'arrows': 'arrow-right', 'spotlight': 'spotlight', 'frames': 'frame', 'blend & mask': 'blend', 'video effects': 'wand-sparkles',
    'add video': 'video', 'add': 'plus', 'edit': 'pencil', 'duplicate': 'copy', 'copy': 'copy', 'delete': 'trash-2', 'remove': 'trash-2', 'split': 'split', 'cut': 'scissors', 'trim': 'scissors',
    'join': 'merge', 'close gaps': 'move-horizontal', 'detach audio': 'unlink', 'picture': 'film', 'movie sound': 'volume-2', 'your voice': 'mic', 'voice': 'mic', 'voice timing': 'mic',
    'undo': 'undo-2', 'redo': 'redo-2', 'fit': 'maximize', 'fit the whole video': 'maximize', 'zoom in': 'zoom-in', 'zoom out': 'zoom-out', 'close': 'x', 'back': 'chevron-left', 'done': 'check',
    'export': 'download', 'export the finished video': 'download', 'play': 'play', 'pause': 'pause', 'play session': 'play', 'previous': 'skip-back', 'next': 'skip-forward',
    'crop': 'crop', 'search': 'search', 'more': 'ellipsis', 'menu': 'menu', 'save': 'save', 'upload': 'upload', 'info': 'info', 'help': 'circle-help', 'refresh': 'refresh-cw', 'reset': 'refresh-cw',
    'lock': 'lock', 'unlock': 'lock-open', 'hide': 'eye-off', 'show': 'eye', 'mute': 'volume-x', 'unmute': 'volume-2',
    // the session and the finished-video screen
    'record again': 'mic', 'record': 'mic', 'take back from here': 'undo-2', 'edit video': 'scissors', 'home': 'house', 'landscape': 'rectangle-horizontal', 'vertical (tiktok)': 'rectangle-vertical',
    'faster export': 'zap', 'sharper (slower)': 'sparkles', 'add logo (optional)': 'image', 'settings': 'settings', 'share': 'share-2', 'download': 'download'
  };
  var BY_PREFIX = [['unmute ', 'volume-2'], ['mute ', 'volume-x'], ['unlock ', 'lock-open'], ['lock ', 'lock'], ['show ', 'eye'], ['hide ', 'eye-off'], ['add sticker', 'sticker'], ['add ', 'plus']];

  function norm(s) { return String(s == null ? '' : s).replace(/[\u25c6\u25c7]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function iconFor(label) {
    var k = norm(label); if (!k) return null;
    if (has(BY_LABEL, k)) return BY_LABEL[k];
    for (var i = 0; i < BY_PREFIX.length; i++) if (k.indexOf(BY_PREFIX[i][0]) === 0 && k.length > BY_PREFIX[i][0].length - 1) return BY_PREFIX[i][1];
    return null;
  }
  function labelOf(btn) { return btn.getAttribute('aria-label') || btn.getAttribute('title') || btn.textContent; }
  function sizeOf(btn) { return btn.classList.contains('ed-sq') || btn.classList.contains('ed-lb') ? 18 : 22; }

  // Gives one button its Lucide icon (nothing happens when the name is not known, or it already has the right icon).
  function one(btn) {
    if (!I || !btn || btn.hasAttribute('data-noskin')) return false;
    var name = iconFor(labelOf(btn)); if (!name || !I.has(name)) return false;
    var cur = btn.querySelector('svg'); if (cur && cur.classList.contains('lc-' + name)) return false;
    var html = I.svg(name, { size: sizeOf(btn) }); if (FILLED[name]) html = html.replace('fill="none"', 'fill="currentColor"');
    var t = document.createElement('template'); t.innerHTML = html; var node = t.content.firstChild;
    if (cur) cur.replaceWith(node);
    else {
      var txt = btn.textContent.trim();
      if (txt.length <= 2 && !/[A-Za-z0-9]/.test(txt)) btn.textContent = '';   // a button that was only a symbol, such as + or the minus sign
      btn.insertBefore(node, btn.firstChild); btn.classList.add('skin-inline');
    }
    btn.setAttribute('data-lc', name);
    return true;
  }
  function scan(root) {
    var n = 0, list = [];
    if (root.nodeType !== 1) return 0;
    var self = root.closest ? root.closest('button') : null; if (self) list.push(self);
    if (root.querySelectorAll) list = list.concat([].slice.call(root.querySelectorAll('button')));
    list.forEach(function (b) { if (one(b)) n++; });
    return n;
  }
  var started = false;
  function start() {
    if (started || typeof document === 'undefined' || !document.body) return;
    started = true; document.documentElement.classList.add('naki-skin'); scan(document.body);
    var pending = [], queued = false;
    function flush() { queued = false; var batch = pending; pending = []; batch.forEach(function (nd) { if (nd.isConnected) scan(nd); }); }
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { [].forEach.call(m.addedNodes, function (nd) { if (nd.nodeType === 1) pending.push(nd); }); });
      if (pending.length && !queued) { queued = true; (window.requestAnimationFrame || setTimeout)(flush); }
    }).observe(document.body, { childList: true, subtree: true });
  }
  var api = { iconFor: iconFor, norm: norm, one: one, scan: scan, start: start, BY_LABEL: BY_LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.NakiSkin = api; window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['skin.js'] = 'skin1';
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
  return api;
})();
