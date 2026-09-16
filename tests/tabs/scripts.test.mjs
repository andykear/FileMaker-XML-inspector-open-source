// tests/tabs/scripts.test.mjs
// Every count here was measured against tests/fixtures/ooe before it was pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { parseHash } from '../../ui/shell.js';
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
  assert.match(html, /<li data-step="141" class="depth-0"><span class="ln">6<\/span><b>Set Variable<\/b> <span class="detail">\[ \$MBS_Command_Results ;/);
  // A comment carries its text as the detail; a step with no options has no detail span.
  assert.ok(html.includes('<b>#</b> <span class="detail">Note: This script is used to check the output of fmCheckMates Print function</span>'));
  assert.ok(html.includes('<b>End If</b></li>'));

  // The two disabled steps ooe carries (both Set Web Viewer, body 932 and 933).
  assert.equal((html.match(/ disabled"/g) ?? []).length, 2);
  assert.ok(html.includes('<li data-step="146" class="depth-0 disabled"><span class="ln">933</span><b>Set Web Viewer</b>'
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
  assert.deepEqual(index[0], { step: '#', count: 1147, scripts: 33 });
  assert.deepEqual(index[1], { step: 'Set Variable', count: 190, scripts: 12 });
  // A tie in count is broken by name: End If before If, both 81.
  assert.deepEqual(index.slice(2, 4).map((r) => r.step), ['End If', 'If']);
  assert.ok(index[0].count > 0);
  for (let i = 1; i < index.length; i += 1) assert.ok(index[i - 1].count >= index[i].count);
  assert.deepEqual(stepIndex({ files: {} }), []);
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
  // Every selection the tree offers routes to a script the tab can show.
  const keys = [...html.matchAll(/data-select="([^"]+)"/g)].map((m) => m[1]);
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
  assert.ok(!index.includes('<td>Set Variable</td>'));
  // The index header says so when what it lists is a filtered subset.
  assert.match(index, /<h2>Step index \(filtered\)<\/h2>/);
});

test('selecting a script shows its detail, its steps and the object re-read', () => {
  const html = tab.render(solution, { ...view, selection: `${ROOT}|39` });
  assert.match(html, /All script steps and all options/);
  assert.match(html, /data-reread-object='\{[^']*"catalog":"script"[^']*"key":"39"/);
  assert.match(html, /<dt>Folder<\/dt><dd>Script from fmSyntaxColorizer<\/dd>/);
  assert.match(html, /<ol class="script">/);
  assert.equal((html.match(/<li data-step=/g) ?? []).length, 952);
  // fm flagged 180 of this script's steps while rendering them from its catalog.
  assert.match(html, /fm reported <span class="num">180<\/span> problem\(s\) on these steps:/);
  // An unknown selection draws no detail section.
  assert.ok(!tab.render(solution, { ...view, selection: `${ROOT}|nope` }).includes('<ol class="script">'));
  assert.ok(!tab.render(solution, { ...view, selection: 'no-such-file|39' }).includes('<ol class="script">'));
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
