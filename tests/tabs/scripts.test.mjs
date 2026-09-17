// tests/tabs/scripts.test.mjs
// Every count here was measured against tests/fixtures/ooe before it was pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { parseHash } from '../../ui/shell.js';
import { link } from '../../ui/dom.js';
import { selectionWithTail, solutionKey } from '../../ui/tabs/common.js';
import { tab, scriptTree, depths, renderScript, stepIndex, scriptStats, orphanedEnabled, selectionOf } from '../../ui/tabs/scripts.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const ROOT = api.meta.root;
const root = solution.files[ROOT];
const view = { selection: null, filter: '', multiFile: true };

const detailOf = (file, id) => file.catalogs.script.detailById[String(id)].result;
/** The fixture's two big "all the steps" scripts, and a deeply nested one. */
const ALL = detailOf(root, 39);           // "All script steps and all options"
const PIPELINE = detailOf(root, 53);      // "saxmlDelivery_runPipeline"

test('scriptTree groups the flattened list by folder, empty folders included', () => {
  const tree = scriptTree(root);
  // ooe has 8 script folders plus the root; EmptyScriptFolder holds no scripts.
  assert.equal(tree.length, 9);
  assert.deepEqual(tree.map((g) => g.folder), [
    'About', '', 'FM26', 'MyScriptFolder', 'MyScriptFolder/EmptyScriptFolder',
    'MyScriptFolder/MyScriptSubfolder', 'Scripts With Everything', 'Script from fmSyntaxColorizer', 'SaXMLDelivery',
  ]);
  assert.deepEqual(tree.find((g) => g.folder === 'About').scripts.map((s) => s.name), ['LICENSE', 'Release Notes']);
  assert.deepEqual(tree.find((g) => g.folder === 'MyScriptFolder/EmptyScriptFolder').scripts, []);
  // The root group holds 5 scripts: fm's `separator` item (the divider line) is not one.
  assert.equal(tree.find((g) => g.folder === '').scripts.length, 5);
  assert.equal(root.catalogs.script.list.filter((i) => i.type === 'separator').length, 1);
  // Every script of the list lands in exactly one group.
  assert.equal(tree.reduce((n, g) => n + g.scripts.length, 0), root.catalogs.script.list.filter((i) => i.type === 'script').length);
});

test('depths raises the depth strictly inside a block; branches and closers sit at the opener', () => {
  // ooe script 39, body 23..29: If / Else If / If / Else If / End If / Else / End If.
  const d = depths(ALL.body);
  assert.equal(d.length, ALL.body.length);
  assert.deepEqual(d.slice(23, 30), [0, 0, 1, 1, 1, 0, 0]);
  assert.equal(Math.max(...d), 1);
  // The pipeline script nests four deep.
  assert.equal(Math.max(...depths(PIPELINE.body)), 4);
  assert.deepEqual(depths([]), []);
});

test('renderScript draws one li per step through stepDisplay, with line numbers and depth', () => {
  const html = renderScript(ALL);
  assert.match(html, /^<ol class="script">/);
  assert.equal((html.match(/<li /g) ?? []).length, ALL.body.length);
  assert.equal(ALL.body.length, 952);

  // A step with options: the name in <b>, stepDisplay's detail in .detail.
  assert.match(html, /<li id="step-39-L6" data-step="141" class="depth-0"><span class="ln">6<\/span><b>Set Variable<\/b> <span class="detail">\[ \$MBS_Command_Results ;/);
  // A comment carries its text as the detail; a step with no options has no detail span.
  assert.ok(html.includes('<b>#</b> <span class="detail">Note: This script is used to check the output of fmCheckMates Print function</span>'));
  assert.ok(html.includes('<b>End If</b></li>'));

  // The two disabled steps ooe carries (both Set Web Viewer, body 932 and 933).
  assert.equal((html.match(/ disabled"/g) ?? []).length, 2);
  assert.ok(html.includes('<li id="step-39-L933" data-step="146" class="depth-0 disabled"><span class="ln">933</span><b>Set Web Viewer</b>'
    + ' <span class="detail">[ Object Name: &quot;wv&quot; ; Action: Reload ]</span></li>'));
});

test('renderScript indents an If opener\'s body at depth-1', () => {
  const html = renderScript(PIPELINE);
  // body 37 is an If opener; 38 is a plain Exit Script inside it.
  assert.equal(PIPELINE.body[37].step, 'If');
  assert.equal(PIPELINE.body[37].block.role, 'opener');
  assert.equal(PIPELINE.body[38].step, 'Exit Script');
  assert.match(html, /class="depth-1" style="--depth:1"><span class="ln">39<\/span><b>Exit Script<\/b>/);
  assert.match(html, /class="depth-4" style="--depth:4"/);
});

test('renderScript escapes everything and survives a body it has never seen', () => {
  const html = renderScript({ body: [{ stepID: 1, step: '<b>&x', block: { role: 'opener', start: 0, end: 9 } }] });
  assert.ok(html.includes('<b>&lt;b&gt;&amp;x</b>'));
  assert.equal(renderScript({}), '<ol class="script"></ol>');
});

test('stepIndex counts every step of every file, by count then name', () => {
  const index = stepIndex(solution);
  // 220 distinct step names across ooe and BrojDva; 3482 steps in all.
  assert.equal(index.length, 220);
  assert.equal(index.reduce((n, r) => n + r.count, 0), 3482);
  const bare = (r) => ({ step: r.step, count: r.count, scripts: r.scripts });
  assert.deepEqual(bare(index[0]), { step: '#', count: 1147, scripts: 33 });
  assert.deepEqual(bare(index[1]), { step: 'Set Variable', count: 190, scripts: 12 });
  // A tie in count is broken by name: End If before If, both 81.
  assert.deepEqual(index.slice(2, 4).map((r) => r.step), ['End If', 'If']);
  assert.ok(index[0].count > 0);
  for (let i = 1; i < index.length; i += 1) assert.ok(index[i - 1].count >= index[i].count);
  assert.deepEqual(stepIndex({ files: {} }), []);
});

test('every index row carries its own solution-wide selection and every occurrence of the step', () => {
  const index = stepIndex(solution);
  // `*` is the solution: a step TYPE is used across every file, so it belongs to none.
  assert.equal(index[1].key, '*|step:Set Variable');
  assert.equal(index[1].key, solutionKey('step', index[1].step));
  assert.equal(index.reduce((n, r) => n + r.uses.length, 0), 3482);

  const uses = index[1].uses;
  // Measured on the fixture: Set Variable is used 190 times in 12 scripts.
  assert.equal(uses.length, 190);
  assert.equal(new Set(uses.map((u) => `${u.target}|${u.scriptId}`)).size, 12);
  // Every occurrence names a script the solution really has, on a line that script has.
  for (const use of uses) {
    const detail = solution.files[use.target].catalogs.script.detailById[use.scriptId].result;
    assert.equal(detail.name, use.scriptName);
    assert.equal(detail.body[use.line - 1].step, 'Set Variable');
  }
  // Body order, per script: script 39's Set Variables start at line 6 and 83.
  assert.deepEqual(uses.filter((u) => u.target === ROOT && u.scriptId === '39').map((u) => u.line),
    [6, 83, 84, 85, 86, 701, 702, 703, 704, 705, 706]);
  // Both files are reached, so a use is only located by target AND script id.
  assert.deepEqual([...new Set(uses.map((u) => u.target))].sort(),
    ['fmnet://localhost/BrojDva', ROOT]);
});

test('the step index links each row to its own drill-down', () => {
  const html = tab.render(solution, view);
  // The href is what buildHash writes, not a hand-spelled one: `|` and `:` are encoded.
  assert.ok(html.includes(link(`scripts/${solutionKey('step', 'Set Variable')}`, 'Set Variable')));
  assert.match(html, /href="#scripts\/\*%7Cstep%3ASet%20Variable"/);
  assert.ok(html.includes('data-select="*|step:Set Variable"'));
  // The row the view is showing is the marked one, and only it.
  const selected = tab.render(solution, { ...view, selection: solutionKey('step', 'Set Variable') });
  assert.ok(selected.includes('<tr data-select="*|step:Set Variable" class="selected">'));
  assert.equal((selected.match(/<tr data-select="[^"]*" class="selected">/g) ?? []).length, 1);
});

/** The step section the tab draws above the tree and the index. */
const stepSection = (html, name) => {
  const at = html.indexOf(`<h2>Step ${name}</h2>`);
  if (at < 0) return '';
  const end = html.indexOf('<section', at);
  return html.slice(at, end < 0 ? html.length : end);
};

test('selecting a step lists the scripts using it, with a link to every line', () => {
  const html = tab.render(solution, { ...view, selection: solutionKey('step', 'Set Variable') });
  const panel = stepSection(html, 'Set Variable');
  assert.ok(panel, 'the step section is drawn');
  assert.match(panel, /Used <span class="num">190<\/span> &middot; Scripts <span class="num">12<\/span>/);
  // A step selection is not a script selection: no script body is drawn.
  assert.ok(!html.includes('<ol class="script">'));

  // One row per script, and the Uses cells add back up to the index's count.
  const rows = panel.slice(panel.indexOf('<tbody>')).split('<tr').slice(1);
  assert.equal(rows.length, 12);
  const uses = rows.map((r) => Number(/<td class="num"><span class="num">(\d+)<\/span><\/td>/.exec(r)[1]));
  assert.equal(uses.reduce((n, v) => n + v, 0), 190);
  // Multi-file view, so the File column says which file each script is in.
  assert.match(panel, /<th[^>]*>File<\/th>/);
  // A list of links is not a value to order rows by, so Lines does not sort.
  assert.ok(panel.includes('<th>Lines</th>'));
  assert.ok(panel.includes('<td>BrojDva</td>'));

  // Every Lines link parses back to a script this tab can open, on a real line.
  const hrefs = [...panel.matchAll(/href="(#scripts\/[^"]*)"/g)].map((m) => m[1]);
  const tails = hrefs.map((h) => selectionWithTail(parseHash(h).selection, 'step')).filter((s) => s.step);
  assert.ok(tails.length >= 12 * 2, 'each script row carries several line links');
  for (const t of tails) {
    const detail = solution.files[t.target].catalogs.script.detailById[t.id].result;
    assert.equal(detail.body[Number(t.step.slice(1)) - 1].step, 'Set Variable');
  }
  // A line link lands on the same step anchor the script view renders.
  assert.ok(panel.includes(link(`scripts/${ROOT}|39#L83`, '83')));
});

test('a script using a step more than twelve times folds the rest of its lines', () => {
  const panel = stepSection(tab.render(solution, { ...view, selection: solutionKey('step', 'Set Variable') }), 'Set Variable');
  // ooe script 53 uses Set Variable 33 times: twelve links, then the count of the rest.
  const pipeline = panel.split('<tr').find((r) => r.includes('%7C53'));
  assert.ok(pipeline, 'the pipeline row is there');
  assert.equal((pipeline.match(/#L\d+/g) ?? []).length, 0, 'the hash is encoded, not raw');
  assert.equal((pipeline.match(/%23L\d+/g) ?? []).length, 12, 'twelve line links, no more');
  assert.ok(pipeline.includes('… and 21 more'));
  // Script 39 uses it 11 times, under the fold: all eleven links, nothing folded.
  const all = panel.split('<tr').find((r) => r.includes('%7C39'));
  assert.equal((all.match(/%23L\d+/g) ?? []).length, 11);
  assert.ok(!all.includes('more'));
});

test('a step name with markup in it is escaped everywhere it is drawn', () => {
  const weird = {
    files: {
      x: {
        target: 'x',
        name: 'x',
        catalogs: {
          script: {
            list: [{ id: 7, name: 'Boom<b>', type: 'script', steps: 2, folder: '' }],
            detailById: { 7: { result: { id: 7, name: 'Boom<b>', steps: 2, problems: [], body: [{ stepID: 1, step: '<b>&x' }, { stepID: 1, step: '<b>&x' }] } } },
          },
        },
      },
    },
  };
  const sel = solutionKey('step', '<b>&x');
  const html = tab.render(weird, { selection: sel, filter: '', multiFile: false });
  assert.ok(html.includes('<h2>Step &lt;b&gt;&amp;x</h2>'));
  assert.ok(!html.includes('<h2>Step <b>'));
  assert.ok(html.includes(link(`scripts/${sel}`, '<b>&x')), 'the index row links to the escaped selection');
  assert.ok(html.includes('data-select="*|step:&lt;b&gt;&amp;x"'));
  assert.ok(html.includes('<td>Boom&lt;b&gt;</td>') || html.includes('>Boom&lt;b&gt;</a>'));
  assert.match(html, /Used <span class="num">2<\/span> &middot; Scripts <span class="num">1<\/span>/);
  // One file, so no File column on the drill-down.
  assert.ok(!/<th[^>]*>File<\/th>/.test(stepSection(html, '&lt;b&gt;&amp;x')));
  // A step no file uses draws no section at all.
  assert.ok(!tab.render(solution, { ...view, selection: solutionKey('step', 'No Such Step') }).includes('<h2>Step No Such Step</h2>'));
});

test('scriptStats counts scripts, steps, the longest, the steps fm flagged, unbalanced blocks and orphaned enabled steps', () => {
  // ooe's two disabled steps are both plain Set Web Viewer steps, not openers, so
  // nothing on either file is orphaned. Measured from the fixture.
  assert.deepEqual(scriptStats(root),
    { scripts: 41, steps: 3104, maxLength: 1155, flaggedSteps: 352, unbalanced: 0, orphanedEnabled: 0 });
  assert.equal(scriptStats(root).scripts, root.catalogs.script.list.filter((i) => i.type === 'script').length);
  assert.deepEqual(scriptStats(solution.files['fmnet://localhost/BrojDva']),
    { scripts: 3, steps: 378, maxLength: 181, flaggedSteps: 0, unbalanced: 0, orphanedEnabled: 0 });
});

test('orphanedEnabled counts the enabled steps left running inside a disabled opener', () => {
  const step = (over) => ({ step: 'Set Variable', ...over });
  // If (disabled) / two enabled steps / End If: both keep running, outside the If.
  assert.equal(orphanedEnabled({
    body: [
      step({ step: 'If', disabled: true, block: { role: 'opener', start: 0, end: 3 } }),
      step({}), step({}),
      step({ step: 'End If', block: { role: 'closer', start: 0, end: 3 } }),
    ],
  }), 2);
  // A disabled step inside the disabled block is not orphaned; nor is the closer.
  assert.equal(orphanedEnabled({
    body: [
      step({ step: 'If', disabled: true, block: { role: 'opener', start: 0, end: 3 } }),
      step({ disabled: true }), step({}),
      step({ step: 'End If', block: { role: 'closer', start: 0, end: 3 } }),
    ],
  }), 1);
  // An enabled opener orphans nothing, whatever is under it.
  assert.equal(orphanedEnabled({
    body: [step({ step: 'If', block: { role: 'opener', start: 0, end: 2 } }), step({}),
      step({ step: 'End If', block: { role: 'closer', start: 0, end: 2 } })],
  }), 0);
  // Nested disabled openers overlap; a step inside both is counted once.
  assert.equal(orphanedEnabled({
    body: [
      step({ step: 'Loop', disabled: true, block: { role: 'opener', start: 0, end: 4 } }),
      step({ step: 'If', disabled: true, block: { role: 'opener', start: 1, end: 3 } }),
      step({}),
      step({ step: 'End If', block: { role: 'closer', start: 1, end: 3 } }),
      step({ step: 'End Loop', block: { role: 'closer', start: 0, end: 4 } }),
    ],
  }), 2);
  assert.equal(orphanedEnabled({}), 0);
});

test('scriptStats calls a block unbalanced when the opener\'s end is not a closer row', () => {
  const file = (body) => ({
    target: 'x',
    catalogs: { script: { list: [{ id: 1, name: 'S', type: 'script', steps: body.length, folder: '' }], detailById: { 1: { result: { id: 1, name: 'S', body, problems: [] } } } } },
  });
  assert.equal(scriptStats(file([{ step: 'If', block: { role: 'opener', start: 0, end: 5 } }])).unbalanced, 1);
  assert.equal(scriptStats(file([
    { step: 'If', block: { role: 'opener', start: 0, end: 1 } },
    { step: 'End If', block: { role: 'closer', start: 0, end: 1 } },
  ])).unbalanced, 0);
  assert.deepEqual(scriptStats({ target: 'x', catalogs: {} }),
    { scripts: 0, steps: 0, maxLength: 0, flaggedSteps: 0, unbalanced: 0, orphanedEnabled: 0 });
});

test('renders the tree, the totals and the step index', () => {
  const html = tab.render(solution, view);
  assert.match(html, /<summary>[^<]*About/);
  assert.match(html, /<details open>/);
  assert.match(html, /Scripts <span class="num">44<\/span>/); // 41 + 3, the whole solution
  assert.match(html, /<h2>Step index<\/h2>/);
  assert.match(html, /Steps fm flagged <span class="num">352<\/span>/);
  assert.match(html, /Enabled steps under a disabled opener <span class="num">0<\/span>/);
  assert.match(html, /data-reread-catalog="script"/);
  assert.ok(html.includes(`data-select="${ROOT}|39"`));
  // Every selection the TREE offers routes to a script the tab can show. The index
  // below it selects step types, which belong to the solution and to no file.
  const keys = [...html.matchAll(/<li data-select="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(keys.length, 44);
  for (const key of keys) {
    const sel = selectionOf({ selection: key });
    assert.ok(solution.files[sel.target], key);
  }
});

test('the tree link routes to the same selection the row carries', () => {
  const html = tab.render(solution, view);
  const hrefs = [...html.matchAll(/href="(#scripts[^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 44);
  assert.equal(parseHash(hrefs.find((h) => h.endsWith('39'))).selection, `${ROOT}|39`);
});

test('the filter narrows the tree and the step index', () => {
  const html = tab.render(solution, { ...view, filter: 'pipeline' });
  assert.ok(html.includes('saxmlDelivery_runPipeline'));
  assert.ok(!html.includes('>Hello world<'));
  const index = tab.render(solution, { ...view, filter: 'set web viewer' });
  assert.ok(index.includes('Set Web Viewer'));
  assert.ok(!index.includes('>Set Variable</a>'));
  // The index header says so when what it lists is a filtered subset.
  assert.match(index, /<h2>Step index \(filtered\)<\/h2>/);
});

test('selecting a script shows its detail, its steps and the object re-read', () => {
  const html = tab.render(solution, { ...view, selection: `${ROOT}|39` });
  assert.match(html, /All script steps and all options/);
  assert.match(html, /data-reread-object='\{[^']*"catalog":"script"[^']*"key":"39"/);
  assert.match(html, /<dt>Folder<\/dt><dd>Script from fmSyntaxColorizer<\/dd>/);
  assert.match(html, /<ol class="script">/);
  assert.equal((html.match(/<li id="step-39-L\d+" data-step=/g) ?? []).length, 952);
  // fm flagged 180 of this script's steps while rendering them from its catalog.
  assert.match(html, /fm reported <span class="num">180<\/span> problem\(s\) on these steps:/);
  // An unknown selection draws no detail section.
  assert.ok(!tab.render(solution, { ...view, selection: `${ROOT}|nope` }).includes('<ol class="script">'));
  assert.ok(!tab.render(solution, { ...view, selection: 'no-such-file|39' }).includes('<ol class="script">'));
});

test('the script detail renders above the tree', () => {
  const html = tab.render(solution, { ...view, selection: `${ROOT}|39` });
  const detail = html.indexOf('<h2>Script All script steps and all options');
  const list = html.indexOf('<h2>Scripts</h2>');
  assert.ok(detail >= 0 && list >= 0);
  assert.ok(detail < list, 'a click\'s result renders where the eye is, above the list');
});

/** The id of the one step li the page marked selected. */
const selectedStep = (html) => (/<li id="(step-[^"]+)"[^>]*class="[^"]*selected"/.exec(html) ?? [])[1];

test('every step carries an anchor on its own line, and a step tail selects exactly that li', () => {
  const html = renderScript(ALL);
  // One anchor per step, and the script's id is in it, so two scripts never collide.
  assert.equal((html.match(/ id="step-39-L\d+"/g) ?? []).length, ALL.body.length);
  assert.ok(html.includes('<li id="step-39-L6" data-step="141" class="depth-0">'));
  // fm's `stepID` is the step TYPE (141 is every Set Variable), so it cannot be
  // the anchor: lines 6 and 83 of script 39 are both stepID 141.
  assert.equal(ALL.body[5].stepID, 141);
  assert.equal(ALL.body[82].stepID, 141);
  assert.ok(html.includes('<li id="step-39-L83" data-step="141"'));

  // The tail is read the way the Layouts tab reads an object id.
  assert.deepEqual(selectionOf({ selection: `${ROOT}|39#L83` }), { target: ROOT, id: '39', step: 'L83' });
  assert.deepEqual(selectionOf({ selection: `${ROOT}|39` }), { target: ROOT, id: '39', step: null });

  // Two lines of the same step type select different lis.
  const six = tab.render(solution, { ...view, selection: `${ROOT}|39#L6` });
  const eightyThree = tab.render(solution, { ...view, selection: `${ROOT}|39#L83` });
  assert.equal(selectedStep(six), 'step-39-L6');
  assert.equal(selectedStep(eightyThree), 'step-39-L83');
  assert.equal((eightyThree.match(/<li id="step-39-L\d+"[^>]*class="[^"]*selected"/g) ?? []).length, 1);
  // No tail, no selected step.
  assert.equal(selectedStep(tab.render(solution, { ...view, selection: `${ROOT}|39` })), undefined);
  // A tail naming a line the script does not have selects nothing and still draws.
  const past = tab.render(solution, { ...view, selection: `${ROOT}|39#L99999` });
  assert.ok(past.includes('<ol class="script">'));
  assert.equal(selectedStep(past), undefined);
});

test('a step tail still marks the script it belongs to in the tree', () => {
  const html = tab.render(solution, { ...view, selection: `${ROOT}|39#L83` });
  assert.ok(html.includes(`<li data-select="${ROOT}|39" class="selected">`), 'the tree lost the open script');
  // The row still selects the script itself, so a click clears the step tail.
  assert.ok(!html.includes(`data-select="${ROOT}|39#L83"`));
});

test('an errored describe shows the error instead of a body', () => {
  const broken = {
    ...solution,
    files: {
      x: {
        target: 'x',
        name: 'x',
        catalogs: { script: { list: [{ id: 7, name: 'Boom', type: 'script', steps: 3, folder: '' }], detailById: { 7: { error: { code: 'boom', message: 'no' } } } } },
      },
    },
  };
  const html = tab.render(broken, { selection: 'x|7', filter: '', multiFile: false });
  assert.match(html, /class="error">boom: no</);
  assert.ok(!html.includes('<ol class="script">'));
});

test('stepIndex is memoised on the solution until a script describe is replaced', () => {
  const first = stepIndex(solution);
  assert.equal(stepIndex(solution), first);
  const slot = root.catalogs.script;
  root.catalogs.script = { ...slot, detailById: { ...slot.detailById } };
  const second = stepIndex(solution);
  assert.notEqual(second, first, 'a re-read of the script catalog invalidates the index');
  assert.deepEqual(second, first, 'and recomputes to the same answer from the same reads');
  root.catalogs.script = slot;
});
