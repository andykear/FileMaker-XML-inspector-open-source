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
import { PROBLEM_KIND } from '../../ui/analysis/broken.js';
import { analysisTotals, brokenReferenceCount, checkHeading, issueGroups, psosByScript, tab } from '../../ui/tabs/analysis.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const ROOT = api.meta.root;
const view = { selection: null, filter: '', multiFile: true };

const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

/** The smallest solution the analyses accept, for the rules ooe cannot measure. */
function handMade(catalogs) {
  const empty = { list: [], listError: null, detailById: {}, ops: [], readAt: null };
  const slots = {};
  for (const c of ['externalDataSource', 'table', 'tableOccurrence', 'relation', 'layout', 'script', 'valueList', 'customFunction', 'customMenu', 'theme', 'field']) {
    slots[c] = { ...empty, ...(catalogs[c] ?? {}) };
  }
  return { root: 'file:///x.fmp12', files: { 'file:///x.fmp12': { target: 'file:///x.fmp12', name: 'x', facts: {}, catalogs: slots } }, unreachable: [] };
}

const oneScript = (body, name = 'S') => handMade({
  script: { list: [{ id: 1, name, type: 'script' }], detailById: { 1: { op: {}, readAt: null, result: { id: 1, name, body } } } },
});
const handView = { selection: null, filter: '', multiFile: false };

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
  assert.equal(items.length, 5); // unreferenced, broken references, fm problem steps, issues, globals
  for (const title of items) assert.ok(title.length > 20, `thin title: ${title}`);
  assert.ok(line.includes('>385<'));
  // The two halves of what used to be one 357: 352 of fm's own problem steps
  // beside 5 real broken references. Measured on ooe before it was pinned.
  assert.ok(line.includes('Broken references <span class="num">5</span>'), line);
  assert.ok(line.includes('fm problem steps <span class="num">352</span>'), line);
  assert.ok(!line.includes('>357<'), 'the two kinds are no longer added together');
});

test('the headline splits fm problem steps out of broken references', () => {
  const t = analysisTotals(solution);
  assert.equal(t.broken.total, 357);
  assert.equal(brokenReferenceCount(t), 5);
  assert.equal(t.broken.byKind[PROBLEM_KIND], 352);
  // Counted as the rest of the total, so a new kind out of ui/analysis/broken.js
  // lands in "Broken references" rather than vanishing from the headline.
  const invented = { broken: { total: 10, byKind: { problem: 4, somethingNew: 6 } } };
  assert.equal(brokenReferenceCount(invented), 6);
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
  const section = html.slice(html.indexOf('<h2>Broken references and fm problem steps</h2>'), html.indexOf('<h2>Script issues'));
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

test('a step row names FileMaker\'s line number and links to that step in the Scripts tab', () => {
  const html = tab.render(solution, view);
  const at = html.indexOf('dead-set-variable');
  const block = html.slice(at, at + 4000);
  // The dead Set Variable of the Control script is body index 7, which is the
  // line FileMaker prints as 8 -- the number the Scripts tab's own gutter shows.
  assert.ok(/line 8/.test(block), 'no line number in the dead-set-variable rows');
  assert.ok(!/step 7/.test(block), 'the 0-based body index is not what a reader is shown');
  // And the row is a link that lands on that line, not on the top of the script.
  const href = hrefs(block).find((h) => h.endsWith('%23L8'));
  assert.ok(href, 'the step row does not link to the step');
  assert.deepEqual(parseHash(href), { tab: 'scripts', selection: `${ROOT}|20#L8` });
  // Script 20 line 14 is the same step TYPE on another line: a second link.
  assert.ok(hrefs(block).some((h) => parseHash(h).selection === `${ROOT}|20#L14`));
});

test('a globals set site links to the step that writes it', () => {
  const html = tab.render(solution, view);
  const section = html.slice(html.indexOf('<h2>Globals</h2>'));
  const at = section.indexOf('$$var');
  const href = hrefs(section.slice(at, at + 2000)).find((h) => h.includes('%23L'));
  assert.ok(href, '$$var has no link to its Set Variable step');
  assert.deepEqual(parseHash(href), { tab: 'scripts', selection: `${ROOT}|55#L118` });
});

test('Globals: the table, its counts and the note that explains the mention count', () => {
  const html = tab.render(solution, view);
  const section = html.slice(html.indexOf('<h2>Globals</h2>'));
  assert.ok(section.includes('$$my_var_global'));
  assert.ok(section.includes('$$some_global_var'));
  assert.ok(section.includes('$$var'));
  assert.ok(section.includes(GLOBALS_NOTE.slice(0, 40)));
  // $$var is set once, on line 118 of script 55 of the root file.
  assert.ok(hrefs(section).map(parseHash).some((l) => l.tab === 'scripts' && l.selection === `${ROOT}|55#L118`));
});

test('the filter narrows every table and leaves the totals alone', () => {
  const all = tab.render(solution, view);
  const html = tab.render(solution, { ...view, filter: '$$my_var_global' });
  assert.ok(html.includes('>385<'), 'the totals moved with the filter');
  assert.ok(html.includes('$$my_var_global'));
  assert.ok(!html.includes('$$some_global_var'));
  assert.ok(html.length < all.length);
});

test('a nested detail is printed to the bottom, not as [object Object]', () => {
  // `expensive-in-loop` is the one check whose detail nests; ooe has none, so
  // the rule is measured on the smallest body that produces one.
  const html = tab.render(oneScript([
    { stepID: 71, step: 'Loop', block: { role: 'opener', start: 0, end: 2 } },
    { stepID: 141, step: 'Set Variable', name: '$rows', value: 'ExecuteSQL ( "SELECT 1" ; "" ; "" )' },
    { stepID: 72, step: 'End Loop', block: { role: 'closer', start: 0, end: 2 } },
  ]), handView);
  assert.ok(!html.includes('[object Object]'), 'a nested detail rendered as [object Object]');
  assert.ok(html.includes('found: ExecuteSQL'));
  // Braced, so the nested level's separators cannot read as the outer level's.
  assert.ok(html.includes('found: ExecuteSQL \u00b7 loop: {index: 0 \u00b7 stepID: 71}'),
    html.slice(html.indexOf('expensive-in-loop'), html.indexOf('expensive-in-loop') + 500));
});

test('the psos sentence counts the same set the table under it lists', () => {
  const sentence = (html) => {
    const at = html.indexOf('psos-only-step');
    const from = html.indexOf('</summary>', at);
    return html.slice(from, html.indexOf('</p>', from));
  };
  assert.ok(sentence(tab.render(solution, view))
    .includes('<span class="num">715</span> steps in <span class="num">24</span> scripts.'));
  // Filtered to one script: BOTH numbers narrow, and the word agrees with the
  // number. The group's own summary keeps the unfiltered 715, as every total does.
  const one = tab.render(solution, { ...view, filter: 'all script steps and all options 20260318' });
  const block = sentence(one);
  assert.ok(block.includes('<span class="num">305</span> steps in <span class="num">1</span> script.'), block);
  assert.ok(!block.includes('715'), 'the sentence kept the unfiltered step count');
  assert.ok(!/scripts\./.test(block), 'one script was called "scripts"');
});

test('a table the filter emptied says so, instead of contradicting its own heading', () => {
  const html = tab.render(solution, { ...view, filter: 'zzz-nothing-matches-this' });
  // Unreferenced scripts: the summary still counts 37, so the body cannot say none exist.
  const at = html.indexOf('<summary>Scripts ');
  const block = html.slice(at, html.indexOf('</details>', at));
  assert.ok(block.includes('<span class="num">37</span>'));
  assert.ok(block.includes('None match the filter'), block);
  assert.ok(!block.includes('No unreferenced scripts'));
  // The same everywhere a non-empty set was narrowed away: the other seven
  // categories, the globals table and every issue group.
  assert.ok(!html.includes('No unreferenced scripts'));
  assert.ok(!html.includes('No unused named styles'));
  assert.ok(!html.includes('No $$ global is named anywhere'));
  assert.ok(!html.includes('No row for this check'));
  assert.ok(!html.includes('No step of this kind'));
  // ... but a category that IS empty still says so: 0 unreferenced tables on ooe.
  assert.ok(html.includes('No unreferenced tables'));
});

test('a genuinely empty category still says it is empty, filter or no filter', () => {
  const html = tab.render(solution, view);
  const at = html.indexOf('<summary>Tables '); // 0 unreferenced tables on ooe
  const block = html.slice(at, html.indexOf('</details>', at));
  assert.ok(block.includes('<span class="num">0</span>'));
  assert.ok(block.includes('No unreferenced tables'), block);
});

test('every model string goes through esc', () => {
  const evil = '<img src=x onerror=1>';
  const html = tab.render(oneScript([], evil), handView);
  assert.ok(html.includes('&lt;img src=x onerror=1&gt;'));
  assert.ok(!html.includes('<img src=x'));
});

test("the Broken table's Where header says fm's /N paths are fm's own JSON pointers", () => {
  const html = tab.render(solution, view);
  const section = html.slice(html.indexOf('<h2>Broken references and fm problem steps</h2>'), html.indexOf('<h2>Script issues'));
  const th = /<th title="([^"]*)">Where<\/th>/.exec(section);
  assert.ok(th, 'no title on the Where header');
  assert.match(th[1], /JSON pointer/);
  assert.match(th[1], /not a line number/);
  // The two spellings the column really carries, on the page to be read next
  // to the sentence: fm's pointer on a problem row, our key path on the rest.
  assert.ok(section.includes('<td>/4</td>'), "fm's own pointer rides through unread");
  assert.ok(section.includes('<td>body[84].value</td>'), 'and a marker carries the key path');
});

test('a check heading is its id de-kebabbed, with the id itself in the title', () => {
  assert.equal(checkHeading('dead-set-variable'), 'Dead set variable');
  assert.equal(checkHeading('swallowed-error'), 'Swallowed error');
  // Mechanical, so an acronym reads as a word. That is the price of having no
  // label map to keep in step with the checks; the id is on the title.
  assert.equal(checkHeading('psos-only-step'), 'Psos only step');
  assert.equal(checkHeading(''), '');

  const html = tab.render(solution, view);
  // Every group of this read gets a heading built the same way, and every one
  // carries its raw id.
  for (const g of issueGroups(solution)) {
    assert.ok(html.includes(`<summary title="${g.check}">${checkHeading(g.check)} `), g.check);
  }
  assert.ok(html.includes('<summary title="psos-only-step">Psos only step '));
});
