'use strict';
// One-time patch: the main toolbar at the bottom (Edit, Audio, Text, Speed, Adjust, Format, Filters, Stickers, Overlay, Effects) can now scroll sideways,
// with arrows and soft edges at the ends like the other rows. On a narrow phone it used to run off the edge with nothing to show there was more.
// Needs the keyframe bar patch applied first. Run from the project folder:   node tools/apply-toolbar-scroll.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (rel) => { const f = path.join(root, rel), raw = fs.readFileSync(f, 'utf8'); return { f, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; };
const save = (o) => fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text);
const ed = read('www/editor.js'), css = read('www/editor.css');
if (ed.text.includes('cueScroller(tb, false)')){ console.log('Already applied. Nothing to do.'); process.exit(0); }
if (!ed.text.includes('function cueScroller')){ console.log('Apply the keyframe bar patch first (tools/apply-keyframe-bar.js): editor.js has no cueScroller yet.'); process.exit(1); }
const find = "u.toolbar = tb; u.dock = mk('div', 'ed-dock'); u.dock.appendChild(tb);", n = ed.text.split(find).length - 1;
if (n !== 1){ console.log('NOTHING WAS CHANGED: the spot in editor.js was found ' + n + ' times (need exactly 1). Send me the lines around "u.toolbar = tb" in editor.js.'); process.exit(1); }
ed.text = ed.text.replace(find, () => "u.toolbar = cueScroller(tb, false); u.dock = mk('div', 'ed-dock'); u.dock.appendChild(u.toolbar);   // the toolbar scrolls sideways, with arrows");
css.text = css.text.replace(/\s*$/, '\n') + `
/* the main toolbar scrolls sideways when the phone is too narrow for all the tools */
.ed-sw>.ed-toolbar{width:100%}
.ed-toolbar{justify-content:flex-start;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.ed-toolbar::-webkit-scrollbar{display:none}
.ed-toolbar>.ed-tool{flex:1 0 58px}
.ed-toolbar>.ed-tool:first-child{margin-left:auto}
.ed-toolbar>.ed-tool:last-child{margin-right:auto}
`;
save(ed); save(css);
console.log('Done. The toolbar now scrolls with arrows. Reload the page (and close and reopen the installed app once) to see it.');