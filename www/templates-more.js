'use strict';
/* Naki text templates, more: news, neon, TV and retro, cinema, social, fun. Added to NakiTemplates.LIST (templates.js is not changed).
   Same shape as the first ten: style (what a text already has, plus the text effects grad / arc / glow / bubble / extrude) and anim. */
(function () {
  var T = (typeof module !== 'undefined' && module.exports) ? require('./templates.js') : (typeof window !== 'undefined' ? window.NakiTemplates : null);
  if (!T) return;
  function a(i, o, l, im, om) { return { in: i, out: o, loop: l, inMs: im || 450, outMs: om || 400 }; }
  var MORE = [
    // ----- News -----
    { cat: 'News', key: 'n-breaking', label: 'Breaking news', text: 'BREAKING NEWS', style: { size: 7, color: '#ffffff', pos: 'bottom', weight: 800, bg: true, font: 'oswald', outline: 0, shadow: 0, grad: { c1: '#ffffff', c2: '#ffd0d0', angle: 90 } }, anim: a('slideup', 'slidedown', 'none') },
    { cat: 'News', key: 'n-headline', label: 'Headline', text: 'HEADLINE HERE', style: { size: 8, color: '#ffffff', pos: 'bottom', weight: 800, bg: true, font: 'anton', outline: 0, shadow: 0 }, anim: a('slideup', 'fade', 'none') },
    { cat: 'News', key: 'n-paper', label: 'Newspaper', text: 'EXTRA! EXTRA!', style: { size: 9, color: '#f4ecd8', pos: 'center', weight: 700, bg: true, font: 'abrilfatface', outline: 0, shadow: 0 }, anim: a('pop', 'fade', 'none') },
    { cat: 'News', key: 'n-serifhead', label: 'Print headline', text: 'The Big Story', style: { size: 8, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'playfair', outline: 0.5, shadow: 1 }, anim: a('fade', 'fade', 'none', 700, 600) },
    { cat: 'News', key: 'n-lower', label: 'Lower third', text: 'NAME SURNAME', style: { size: 5, color: '#ffffff', pos: 'bottom', weight: 700, bg: true, font: 'oswald', outline: 0, shadow: 0 }, anim: a('slideup', 'slidedown', 'none') },
    { cat: 'News', key: 'n-ticker', label: 'Ticker', text: 'LIVE  \u2022  Your headline goes here', style: { size: 4, color: '#ffe14d', pos: 'bottom', weight: 700, bg: true, font: 'barlowcondensed', outline: 0, shadow: 0 }, anim: a('slideup', 'slidedown', 'none', 350, 350) },
    { cat: 'News', key: 'n-live', label: 'LIVE tag', text: 'LIVE', style: { size: 5, color: '#ff3b3b', pos: 'top', weight: 800, bg: true, font: 'archivo', outline: 0, shadow: 0 }, anim: a('fade', 'fade', 'pulse', 300, 300) },
    // ----- Neon -----
    { cat: 'Neon', key: 'x-pink', label: 'Neon pink', text: 'Neon', style: { size: 10, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'righteous', outline: 0, shadow: 0, glow: { color: '#ff2fa8', amount: 0.9 } }, anim: a('fade', 'fade', 'pulse', 500, 500) },
    { cat: 'Neon', key: 'x-cyan', label: 'Neon cyan', text: 'OPEN', style: { size: 10, color: '#e6ffff', pos: 'center', weight: 700, bg: false, font: 'bungee', outline: 0, shadow: 0, glow: { color: '#00e5ff', amount: 0.9 } }, anim: a('fade', 'fade', 'pulse', 500, 500) },
    { cat: 'Neon', key: 'x-green', label: 'Neon green', text: 'GO', style: { size: 12, color: '#f0ffe0', pos: 'center', weight: 700, bg: false, font: 'monoton', outline: 0, shadow: 0, glow: { color: '#7cff4d', amount: 0.9 } }, anim: a('pop', 'fade', 'pulse', 400, 400) },
    { cat: 'Neon', key: 'x-sign', label: 'Night sign', text: 'Cafe', style: { size: 11, color: '#fff3c4', pos: 'center', weight: 700, bg: false, font: 'lobster', outline: 0, shadow: 0, glow: { color: '#ff9f1c', amount: 0.85 } }, anim: a('fade', 'fade', 'pulse', 600, 600) },
    // ----- TV and retro -----
    { cat: 'TV', key: 'v-vhs', label: 'VHS play', text: 'PLAY \u25b6', style: { size: 5, color: '#ffffff', pos: 'top', weight: 700, bg: false, font: 'pressstart2p', outline: 0.5, shadow: 1 }, anim: a('fade', 'fade', 'none', 200, 200) },
    { cat: 'TV', key: 'v-channel', label: 'Channel', text: 'CH 03', style: { size: 6, color: '#7dff9a', pos: 'top', weight: 700, bg: false, font: 'pressstart2p', outline: 0.5, shadow: 0, glow: { color: '#2bff6a', amount: 0.5 } }, anim: a('fade', 'fade', 'none', 200, 200) },
    { cat: 'TV', key: 'v-retro3d', label: 'Retro 3D', text: 'RETRO', style: { size: 11, color: '#ffd23f', pos: 'center', weight: 700, bg: false, font: 'bungee', outline: 0.3, shadow: 0, extrude: { color: '#ee4266', depth: 0.8 } }, anim: a('pop', 'pop', 'none', 350, 350) },
    { cat: 'TV', key: 'v-type', label: 'Typewriter', text: 'Dear diary...', style: { size: 6, color: '#f5f0e6', pos: 'bottom', weight: 700, bg: true, font: 'specialelite', outline: 0, shadow: 0 }, anim: a('fade', 'fade', 'none', 500, 400) },
    // ----- Cinema -----
    { cat: 'Cinema', key: 'c-title', label: 'Movie title', text: 'THE JOURNEY', style: { size: 10, color: '#f4e9c8', pos: 'center', weight: 700, bg: false, font: 'cinzel', outline: 0, shadow: 1 }, anim: a('fade', 'fade', 'none', 1200, 1000) },
    { cat: 'Cinema', key: 'c-credit', label: 'Credit', text: 'Directed by', style: { size: 5, color: '#e8e2d0', pos: 'bottom', weight: 400, bg: false, font: 'cormorantgaramond', outline: 0, shadow: 1 }, anim: a('fade', 'fade', 'none', 900, 900) },
    { cat: 'Cinema', key: 'c-gold', label: 'Gold', text: 'GOLD', style: { size: 10, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'marcellus', outline: 0.3, shadow: 1, grad: { c1: '#fff1a8', c2: '#b8860b', angle: 90 } }, anim: a('fade', 'fade', 'none', 900, 800) },
    // ----- Social -----
    { cat: 'Social', key: 's-pop', label: 'Bold caption', text: 'Wait for it', style: { size: 7, color: '#ffffff', pos: 'center', weight: 800, bg: false, font: 'montserrat', outline: 0.7, shadow: 1 }, anim: a('pop', 'fade', 'none', 250, 250) },
    { cat: 'Social', key: 's-sunset', label: 'Sunset', text: 'Sunset', style: { size: 11, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'anton', outline: 0.4, shadow: 1, grad: { c1: '#ff512f', c2: '#f9d423', angle: 90 } }, anim: a('pop', 'fade', 'none', 350, 350) },
    { cat: 'Social', key: 's-hand', label: 'Handwritten', text: 'so cute', style: { size: 8, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'caveat', outline: 0.3, shadow: 1 }, anim: a('fade', 'fade', 'float', 500, 500) },
    // ----- Fun -----
    { cat: 'Fun', key: 'f-fire', label: 'Fire', text: 'HOT', style: { size: 12, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'anton', outline: 0.2, shadow: 0, grad: { c1: '#fff200', c2: '#ff3b00', angle: 90 }, glow: { color: '#ff6a00', amount: 0.7 } }, anim: a('pop', 'fade', 'pulse', 350, 350) },
    { cat: 'Fun', key: 'f-ice', label: 'Ice', text: 'COOL', style: { size: 11, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'montserrat', outline: 0, shadow: 0, grad: { c1: '#ffffff', c2: '#7fd8ff', angle: 90 }, glow: { color: '#4fc3ff', amount: 0.8 } }, anim: a('fade', 'fade', 'float', 500, 500) },
    { cat: 'Fun', key: 'f-bubble', label: 'Bubblegum', text: 'YUM', style: { size: 11, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'luckiestguy', outline: 0, shadow: 1, bubble: { color: '#ff4fa3', width: 0.55 } }, anim: a('pop', 'pop', 'none', 350, 350) },
    { cat: 'Fun', key: 'f-comic', label: 'Comic burst', text: 'POW!', style: { size: 12, color: '#ffe600', pos: 'center', weight: 700, bg: false, font: 'bangers', outline: 1, shadow: 0, extrude: { color: '#000000', depth: 0.45 } }, anim: a('pop', 'pop', 'none', 300, 300) },
    { cat: 'Fun', key: 'f-rainbow', label: 'Rainbow arc', text: 'Hello!', style: { size: 10, color: '#ffffff', pos: 'center', weight: 700, bg: false, font: 'pacifico', outline: 0.3, shadow: 1, arc: 0.6, grad: { c1: '#ff5f6d', c2: '#4facfe', angle: 0 } }, anim: a('pop', 'fade', 'float', 400, 400) }
  ];
  var have = {}; T.LIST.forEach(function (t) { have[t.key] = 1; });
  MORE.forEach(function (t) { if (!have[t.key]) T.LIST.push(t); });
})();
if (typeof window !== 'undefined') { window.NakiVersions = window.NakiVersions || {}; window.NakiVersions['templates-more.js'] = 'tpl1'; }
