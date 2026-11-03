'use strict';
// One-time patch: Project templates (save the look and layout of an edit as a file, and put it on another project).
// Run from the project folder, after copying www/projtemplate.js and tests/projtemplate.test.js into place:
//   node tools/apply-templates.js
// editor.js is checked first: if any spot is not found exactly once, NOTHING is changed and the list is printed.
// index.html and sw.js are changed only when their lines are found exactly once; if not, it tells you the one line to add by hand
// (the editor works without them: it just says the template file is not loaded).
var fs = require('fs'), path = require('path');
var www = path.join(__dirname, '..', 'www');
var edPath = path.join(www, 'editor.js'), htmlPath = path.join(www, 'index.html'), swPath = path.join(www, 'sw.js');

if (!fs.existsSync(path.join(www, 'projtemplate.js'))){
  console.log('www/projtemplate.js is missing. Copy it into the www folder first, then run this again.'); process.exit(1);
}
var ed = fs.readFileSync(edPath, 'utf8');
if (ed.indexOf('projtemplate.js') >= 0){ console.log('editor.js already has project templates. Nothing to do.'); process.exit(0); }

function count(src, s){ return src.split(s).length - 1; }
function L(arr){ return arr.join('\n'); }

var FUNCS = L([
  '// ----- project templates: save the look and layout of this edit as a file, and put it on another project -----',
  '  function tplNeed(){ if (NPT) return true; toast(\'Templates are not loaded. Add <script src="projtemplate.js"></script> to index.html, before editor.js.\'); return false; }',
  '  function saveTemplateFile(){',
  '    if (!tplNeed()) return;',
  '    var nm = prompt(\'Name this template:\', String((E.sess && E.sess.name) || \'My template\').slice(0, 40));',
  '    if (nm === null) return;',
  '    var tpl = NPT.capture(E.hist.cur, nm);',
  '    if (NPT.isEmpty(tpl)){ toast(\'There is nothing to save yet. Add titles, stickers, shapes or effects, or set a look, then save.\'); return; }',
  '    var a = document.createElement(\'a\'), file = NPT.fileName(tpl);',
  '    a.href = URL.createObjectURL(new Blob([NPT.serialize(tpl)], { type: \'application/json\' })); a.download = file;',
  '    document.body.appendChild(a); a.click(); setTimeout(function (){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);',
  '    toast(\'Saved \' + file + \'. \' + NPT.describeSaved(tpl), 9000);',
  '  }',
  '  function loadTemplateFile(){',
  '    if (!tplNeed()) return;',
  '    var inp = document.createElement(\'input\'); inp.type = \'file\'; inp.accept = \'.json,application/json\';',
  '    inp.onchange = function (){',
  '      var f = inp.files && inp.files[0]; if (!f) return;',
  '      (f.text ? f.text() : new Promise(function (res){ var r = new FileReader(); r.onload = function (){ res(r.result); }; r.readAsText(f); })).then(function (text){',
  '        var r = NPT.parse(text); if (r.error){ toast(r.error, 7000); return; }',
  '        var out = {}, q = NPT.apply(E.hist.cur, r.template, { replace: E.chip.tplMode !== \'add\' }, out);',
  '        if (out.error){ toast(out.error, 7000); return; }',
  '        if (q === E.hist.cur){ toast(\'That template did not change anything.\'); return; }',
  '        commit(q); toast(NPT.describe(out), 9000);',
  '      });',
  '    };',
  '    inp.click();',
  '  }',
  '  function addMusic(){'
]);

var PANEL = L([
  'projtpl: { title: \'Layout template\', build: function (body){',
  '      var mode = E.chip.tplMode === \'add\' ? \'add\' : \'replace\';',
  '      body.appendChild(actions([{ id: \'edTplSave\', label: \'Save as template\', run: saveTemplateFile }, { id: \'edTplApply\', label: \'Apply a template file\', run: loadTemplateFile }]));',
  '      body.appendChild(chips([{ key: \'replace\', label: \'Replace my titles and effects\' }, { key: \'add\', label: \'Add to what is there\' }], mode, function (k){ E.chip.tplMode = k; renderDock(); }));',
  '      body.appendChild(mk(\'div\', \'ed-hint\', \'A template keeps the look and layout of this edit (video shape, colour look, titles, stickers, shapes, effects, sound levels) as a small file, without the footage. Apply it to another project and the titles and effects land at the same share of the video. Pictures, videos, sound effects and captions are not stored. Undo brings back what it replaced.\'));',
  '    } },',
  '    speed: { title: \'Speed\', build: function (body){'
]);

var EDITS = [
  { name: 'editor: load the template module',
    find: 'var NTPL = (typeof module',
    put: 'var NPT = (typeof module !== \'undefined\' && module.exports) ? require(\'./projtemplate.js\') : (typeof window !== \'undefined\' ? window.NakiProjTpl : null);\n  var NTPL = (typeof module' },
  { name: 'editor: the Layouts button in the Edit tools',
    find: '{ id: \'edReset\', label: \'Start over\'',
    put: '{ id: \'edProjTpl\', label: \'Layouts\', icon: G.style, run: P2(\'projtpl\') },\n        { id: \'edReset\', label: \'Start over\'' },
  { name: 'editor: the layout template panel',
    find: 'speed: { title: \'Speed\', build: function (body){',
    put: PANEL },
  { name: 'editor: save and apply functions',
    find: 'function addMusic(){',
    put: FUNCS }
];

var bad = [];
EDITS.forEach(function (e){ var n = count(ed, e.find); if (n !== 1) bad.push('  - ' + e.name + ': found ' + n + ' times (need exactly 1) in editor.js'); });
if (bad.length){
  console.log('NOTHING WAS CHANGED. These spots did not match your files:\n' + bad.join('\n') + '\n\nSend me that list (and the file name) and I will adjust.');
  process.exit(1);
}
EDITS.forEach(function (e){ ed = ed.replace(e.find, function (){ return e.put; }); });
fs.writeFileSync(edPath, ed);
console.log('editor.js: project templates added (Edit tools > Layouts).');

// ----- the soft steps -----
var manual = [];
function soft(file, label, fn){
  if (!fs.existsSync(file)){ manual.push(label + ': ' + path.basename(file) + ' was not found.'); return; }
  var src = fs.readFileSync(file, 'utf8'), out = fn(src);
  if (out === null) return;
  if (typeof out === 'object'){ manual.push(label + ': ' + out.msg); return; }
  fs.writeFileSync(file, out); console.log(path.basename(file) + ': ' + label + ' done.');
}
soft(htmlPath, 'script tag', function (src){
  if (src.indexOf('projtemplate.js') >= 0) return null;
  var re = /<script\s+src="editor\.js[^"]*"\s*><\/script>/g, m = src.match(re);
  if (!m || m.length !== 1) return { msg: 'add <script src="projtemplate.js"></script> just BEFORE the editor.js script tag in www/index.html.' };
  return src.replace(re, function (t){ return '<script src="projtemplate.js"></script>\n' + t; });
});
soft(swPath, 'offline cache', function (src){
  if (src.indexOf('projtemplate.js') >= 0) return null;
  var re = /(['"])([^'"]*)editor\.js\1/g, m = src.match(re);
  if (!m || m.length !== 1) return { msg: 'add projtemplate.js next to editor.js in the list of cached files in www/sw.js, and raise the cache version number so phones fetch the new files.' };
  return src.replace(re, function (t, q, pre){ return t + ', ' + q + pre + 'projtemplate.js' + q; });
});
if (manual.length) console.log('\nDo these by hand:\n  - ' + manual.join('\n  - '));
console.log('\nNext: node tests/projtemplate.test.js   (and raise the cache version in sw.js if you use one, so phones pick up the new file)');