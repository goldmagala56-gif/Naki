'use strict';
// One-time patch (after apply-touch2.js): the left panel of the timeline, the way CapCut's phone app does it.
//   - the eye (Hide) and padlock (Lock) buttons are gone
//   - each row shows ONE icon for what lives on it (picture, sound, voice, music, text, stickers, overlay, effects, layout); the panel is a slim column
//   - on a sound row the icon is also the Mute button: tap it to mute the row (a red slash shows it is muted), tap again to unmute
//   - a row that was already locked or hidden in an older project is let go the first time you tap its icon, so nothing gets stuck
// Run from the project folder:   node tools/apply-labels.js
// It checks that every spot it needs to change is found exactly once BEFORE writing anything, so it does everything or nothing.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

const NEW_LABELS = `function renderLabels(){
    var u = E.ui; u.labels.textContent = ''; u.labels.appendChild(mk('div', 'ed-spacer'));
    E.proj.tracks.forEach(function (tr){
      var nm = ROLE_NAME[tr.role] || tr.role, snd = tr.kind === 'audio', stuck = !!(tr.locked || tr.hidden);
      var l = mk('div', 'ed-label' + (tr.muted ? ' muted' : '') + (tr.hidden ? ' off' : '') + (tr.locked ? ' locked' : '') + (snd || stuck ? ' tap' : ''));
      l.style.height = rowH(tr) + 'px';
      var ic = mk('span', 'ed-lbicon'); ic.innerHTML = roleIcon(tr.role); l.title = nm; l.setAttribute('role', snd ? 'button' : 'img');
      l.setAttribute('aria-label', snd ? (tr.muted ? 'Unmute ' : 'Mute ') + nm : nm); if (snd) l.setAttribute('aria-pressed', String(!!tr.muted));
      l.appendChild(ic);
      if (snd || stuck){
        l.addEventListener('pointerdown', function (ev){ ev.stopPropagation(); });
        l.onclick = function (ev){
          ev.stopPropagation();
          if (stuck){ commit(P.setTrackProps(E.hist.cur, tr.id, { locked: false, hidden: false })); return; }
          commit(P.setTrackProps(E.hist.cur, tr.id, { muted: !tr.muted }));
        };
      }
      u.labels.appendChild(l);
    });
  }
  `;

const CSS = `
/* the left panel, CapCut style: one icon per row, nothing else */
.ed .ed-labels{flex:0 0 44px;width:44px}
@media (pointer:coarse){ .ed .ed-labels{flex:0 0 46px;width:46px} }
.ed-label{position:relative;justify-content:center;padding:0;background:var(--panel-2);border-radius:0 8px 8px 0}
.ed-label .ed-lbicon{width:26px;height:26px}
.ed-label .ed-lbicon svg{width:20px;height:20px}
.ed-label.tap{cursor:pointer;touch-action:manipulation}
.ed-label.tap:active{background:rgba(255,255,255,.1)}
.ed-label.muted .ed-lbicon{color:var(--dim)}
.ed-label.muted::after{content:"";position:absolute;left:11px;right:11px;top:50%;height:2px;margin-top:-1px;border-radius:1px;background:var(--hibiscus);transform:rotate(-40deg);pointer-events:none}
.ed-label.locked .ed-lbicon,.ed-label.off .ed-lbicon{color:var(--mango)}
`;

const EDITS = [
  { label: 'toast text (2 places)', find: `toast('This row is locked. Tap its lock to edit it.')`, count: 2, replace: `toast('This row is locked. Tap its icon on the left to unlock it.')` }
];

function load(rel){ const f = path.join(root, rel); const raw = fs.readFileSync(f, 'utf8'); return { f, rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; }
function save(o){ fs.writeFileSync(o.f, o.crlf ? o.text.replace(/\n/g, '\r\n') : o.text); }
const ed = load('www/editor.js'), css = load('www/editor.css'), problems = [];
if (ed.text.indexOf('ed-label tap') >= 0 || ed.text.indexOf("(snd || stuck ? ' tap' : '')") >= 0){ console.log('Already applied. Nothing to do.'); process.exit(0); }
if (ed.text.indexOf('function roleIcon(') < 0){ console.log('NOTHING WAS CHANGED. Apply tools/apply-touch2.js first (it adds the row icons).'); process.exit(1); }
const a = ed.text.indexOf('function renderLabels(){'), b = ed.text.indexOf('function placeHead(){');
if (a < 0 || b < 0 || b < a || ed.text.split('function renderLabels(){').length !== 2 || ed.text.split('function placeHead(){').length !== 2) problems.push('renderLabels: could not find the start/end markers');
else ed.text = ed.text.slice(0, a) + NEW_LABELS + ed.text.slice(b);
EDITS.forEach(e => {
  const n = ed.text.split(e.find).length - 1;
  if (n !== e.count) { problems.push(e.label + ': found ' + n + ' times (need exactly ' + e.count + ')'); return; }
  ed.text = ed.text.split(e.find).join(e.replace);
});
css.text = css.text.replace(/\s*$/, '\n') + CSS;
if (problems.length){
  console.log('NOTHING WAS CHANGED. These spots did not match your files:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
save(ed); save(css);
console.log('Done. Changed www/editor.js and www/editor.css. Now run:  npm test');