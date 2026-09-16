// tests/tabs/analysis.test.mjs
// Every count here was measured against tests/fixtures/ooe before it was pinned.
// The check names of the Script issues section are NOT pinned: they are grouped
// from the `check` value each row carries at run time, so a rename in
// ui/analysis/scripts.js moves a heading and breaks nothing here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { parseHash } from '../../ui/dom.js';
import { scriptIssues } from '../../ui/analysis/scripts.js';
import { GLOBALS_NOTE } from '../../ui/analysis/globals.js';
import { analysisTotals, issueGroups, psosByScript, tab } from '../../ui/tabs/analysis.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const ROOT = api.meta.root;
const view = { selection: null, filter: '', multiFile: true };

const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

test('analysisTotals: solution-wide, unfiltered, pinned on ooe', () => {
  const t = analysisTotals(solution);
  assert.deepEqual(t.unreferenced.byCategory, {
    fields: 40, tables: 0, occurrences: 6, scripts: 37,
    layouts: 15, valueLists: 4, customFunctions: 6, styles: 277,
  });
  assert.equal(t.unreferenced.total, 385);

  assert.equal(t.broken.total, 357);
  assert.deepEqual(t.broken.byKind, { problem: 352, missingMarker: 5 });

  assert.equal(t.issues.total, scriptIssues(solution).length);
  assert.equal(t.issues.byCheck['psos-only-step'], 715);

  assert.equal(t.globals.total, 3);
  assert.equal(t.globals.set, 1); // only $$var is written by a Set Variable
});

test('the totals line names the derivation of every item in a title attribute', () => {
  const html = tab.render(solution, view);
  const line = html.slice(html.indexOf('class="muted totals"'), html.indexOf('</p>'));
  const items = [...line.matchAll(/title="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(items.length, 4); // unreferenced, broken, issues, globals
  for (const title of items) assert.ok(title.length > 20, `thin title: ${title}`);
  assert.ok(line.includes('>385<'));
  assert.ok(line.includes('>357<'));
});

test('Confidence: the tier as a badge, every reason and every note', () => {
  const html = tab.render(solution, view);
  assert.ok(html.includes('<h2>Confidence</h2>'));
  assert.ok(/<span class="badge \w+">low<\/span>/.test(html));
  const section = html.slice(html.indexOf('<h2>Confidence</h2>'), html.indexOf('<h2>Unreferenced'));
  assert.equal([...section.matchAll(/<li>/g)].length, 9); // 5 reasons + 4 notes
  assert.ok(section.includes('GetField ( )'));
});

test('Unreferenced: one <details> per category, counts in the summary, links to the object tab', () => {
  const html = tab.render(solution, view);
  const section = html.slice(html.indexOf('<h2>Unreferenced</h2>'), html.indexOf('<h2>Broken references'));
  const summaries = [...section.matchAll(/<summary>(.*?)<\/summary>/g)].map((m) => m[1]);
  assert.equal(summaries.length, 8);
  assert.ok(summaries.some((s) => s.includes('Scripts') && s.includes('>37<')));
  assert.ok(summaries.some((s) => s.includes('Tables') && s.includes('>0<')));

  // An unreferenced script links to the Scripts tab, an unreferenced value list
  // to the Catalogs tab, and both round-trip through parseHash.
  const links = hrefs(section).map(parseHash);
  const script = links.find((l) => l.tab === 'scripts' && l.selection === `${ROOT}|70`);
  assert.ok(script, 'no link to an unreferenced script of the root file');
  assert.ok(links.some((l) => l.tab === 'catalogs' && l.selection === `${ROOT}|vl:5`));
  assert.ok(links.some((l) => l.tab === 'graph' && l.selection === `${ROOT}|to:1065108`));
});

test('Unreferenced styles are grouped by theme, not listed flat', () => {
  const html = tab.render(solution, view);
  const at = html.indexOf('<summary>Styles ');
  const block = html.slice(at, html.indexOf('</details>', at));
  assert.ok(block.includes('Apex Blue'));
  // The theme is a column of its own, so a style row says which theme it is in.
  assert.ok(/<th>Theme<\/th>/.test(block));
});

test('Broken references: grouped by kind, the occurrence/dangling pair adjacent, links round-trip', () => {
  const html = tab.render(solution, view);
  const section = html.slice(html.indexOf('<h2>Broken references</h2>'), html.indexOf('<h2>Script issues'));
  assert.ok(section.includes('problem'));
  assert.ok(section.includes('missingMarker'));
  // fm's own marker word and its context ride through to the page.
  assert.ok(section.includes('&lt;Function Missing&gt;'));
  const links = hrefs(section).map(parseHash);
  assert.ok(links.some((l) => l.tab === 'scripts' && l.selection === `${ROOT}|39`));
  for (const l of links) assert.ok(l.tab && l.selection, 'a broken-reference link with no selection');
});

test('Script issues: groups come from the rows, never from a list this tab owns', () => {
  const groups = issueGroups(solution);
  const fromRows = new Set(scriptIssues(solution).map((r) => r.check));
  assert.deepEqual(new Set(groups.map((g) => g.check)), fromRows);
  assert.equal(groups.reduce((n, g) => n + g.rows.length, 0), scriptIssues(solution).length);
  assert.equal(groups[0].check, 'psos-only-step'); // the biggest group first
  assert.equal(groups[0].rows.length, 715);
});

test('psosByScript: 715 rows become 24 scripts, biggest first', () => {
  const rows = scriptIssues(solution).filter((r) => r.check === 'psos-only-step');
  const per = psosByScript(rows);
  assert.equal(per.length, 24);
  assert.equal(per.reduce((n, g) => n + g.rows.length, 0), 715);
  assert.equal(per[0].script.id, 55);
  assert.equal(per[0].rows.length, 305);
  assert.equal(per[1].script.id, 39);
  assert.equal(per[1].rows.length, 275);
});

test('the psos group renders 24 rows with a count, not 715 rows', () => {
  const html = tab.render(solution, view);
  const at = html.indexOf('psos-only-step');
  const block = html.slice(at, html.indexOf('</details>', html.indexOf('</details>', at) + 1));
  // One <tr> per script plus the header row; nowhere near 715.
  const rows = [...block.matchAll(/<tr/g)].length;
  assert.ok(rows < 40, `psos group rendered ${rows} rows`);
  assert.ok(block.includes('>305<'));
});

test('a step row names the step index, because the Scripts tab has no step anchor yet', () => {
  const html = tab.render(solution, view);
  const at = html.indexOf('dead-set-variable');
  const block = html.slice(at, at + 4000);
  assert.ok(/step 7/.test(block), 'no step index in the dead-set-variable rows');
  assert.ok(!/#\d+"/.test(block.slice(0, 2000)), 'a stepID anchor was linked, which the Scripts tab cannot route');
});

test('Globals: the table, its counts and the note that explains the mention count', () => {
  const html = tab.render(solution, view);
  const section = html.slice(html.indexOf('<h2>Globals</h2>'));
  assert.ok(section.includes('$$my_var_global'));
  assert.ok(section.includes('$$some_global_var'));
  assert.ok(section.includes('$$var'));
  assert.ok(section.includes(GLOBALS_NOTE.slice(0, 40)));
  // $$var is set once, in script 55 of the root file.
  assert.ok(hrefs(section).map(parseHash).some((l) => l.tab === 'scripts' && l.selection === `${ROOT}|55`));
});

test('the filter narrows every table and leaves the totals alone', () => {
  const all = tab.render(solution, view);
  const html = tab.render(solution, { ...view, filter: '$$my_var_global' });
  assert.ok(html.includes('>385<'), 'the totals moved with the filter');
  assert.ok(html.includes('$$my_var_global'));
  assert.ok(!html.includes('$$some_global_var'));
  assert.ok(html.length < all.length);
});

test('every model string goes through esc', () => {
  const evil = '<img src=x onerror=1>';
  const empty = { list: [], listError: null, detailById: {}, ops: [], readAt: null };
  const slots = {};
  for (const c of ['externalDataSource', 'table', 'tableOccurrence', 'relation', 'layout', 'script', 'valueList', 'customFunction', 'customMenu', 'theme', 'field']) slots[c] = { ...empty };
  slots.script = { ...empty, list: [{ id: 1, name: evil, type: 'script' }], detailById: { 1: { op: {}, readAt: null, result: { id: 1, name: evil, body: [] } } } };
  const hand = { root: 'file:///x.fmp12', files: { 'file:///x.fmp12': { target: 'file:///x.fmp12', name: 'x', facts: {}, catalogs: slots } }, unreachable: [] };
  const html = tab.render(hand, { selection: null, filter: '', multiFile: false });
  assert.ok(html.includes('&lt;img src=x onerror=1&gt;'));
  assert.ok(!html.includes('<img src=x'));
});
