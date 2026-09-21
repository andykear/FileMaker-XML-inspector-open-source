// tests/export/markdown.test.mjs
// The Markdown report: the sections the brief names, in order, with every
// number taken from the function the matching tab uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { catalogCounts, createFile } from '../../ui/model.js';
import { fieldsOf, tableCounts } from '../../ui/tabs/tables.js';
import { scriptStats } from '../../ui/tabs/scripts.js';
import { relationRows } from '../../ui/tabs/graph.js';
import { accountRows, securityTotals } from '../../ui/tabs/security.js';
import { unreferenced } from '../../ui/analysis/unreferenced.js';
import { scriptIssues } from '../../ui/analysis/scripts.js';
import { broken } from '../../ui/analysis/broken.js';
import { GAP_LISTS } from '../../ui/analysis/gaps-lists.js';
import { markdownReport, SECTIONS } from '../../ui/export/markdown.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const report = markdownReport(solution);
const files = Object.values(solution.files);
const sum = (of) => files.reduce((n, f) => n + of(f), 0);
const fieldsIn = (file) => (file.catalogs.table.list ?? [])
  .reduce((n, t) => n + tableCounts(fieldsOf(file, t.name)).fields, 0);

test('the header names the root, the fm version and the read time', () => {
  assert.match(report, /^# Clockwork Inspector report: ooe\n/);
  assert.ok(report.includes('`fmnet://localhost/ooe`'), 'the root target');
  assert.ok(report.includes('fm 0.8.0-beta.0'), 'the fm version from solution.cli');
  assert.ok(report.includes(solution.readAt), 'the read time');
});

test('the sections are the ones the brief names, in order, and nothing else is an H2', () => {
  const headings = [...report.matchAll(/^## .+$/gm)].map((m) => m[0].slice(3));
  assert.deepEqual(headings, SECTIONS);
  assert.deepEqual(SECTIONS, [
    'Headline counts', 'File Options', 'Confidence', 'Security observations', 'Unreferenced',
    'Script body observations', 'Calculation fields', 'Relationships',
    'Container fields', 'Broken references', 'Gaps',
  ]);
});

test('the headline totals are catalogCounts, tableCounts, scriptStats and securityTotals, not a second count', () => {
  const total = [
    sum((f) => catalogCounts(f).table.listed),
    sum(fieldsIn),
    sum((f) => catalogCounts(f).tableOccurrence.listed),
    sum((f) => catalogCounts(f).relation.listed),
    sum((f) => catalogCounts(f).layout.listed),
    sum((f) => scriptStats(f).scripts),
    sum((f) => scriptStats(f).steps),
    sum((f) => catalogCounts(f).valueList.listed),
    sum((f) => catalogCounts(f).customFunction.listed),
    securityTotals(solution).accounts,
    sum((f) => catalogCounts(f).theme.listed),
  ];
  assert.ok(report.includes(`| **Total** | ${total.join(' | ')} |`), `total row of ${total.join(', ')}`);
  // And one row per file, so a multi-file read says which file carries what.
  const ooe = solution.files['fmnet://localhost/ooe'];
  assert.ok(report.includes(`| ooe | ${catalogCounts(ooe).table.listed} | ${fieldsIn(ooe)} |`), 'the ooe row');
  assert.ok(report.includes(`| BrojDva | ${catalogCounts(solution.files['fmnet://localhost/BrojDva']).table.listed} |`));
});

test('Confidence prints the tier, every reason and every standing limit', () => {
  const { confidence } = unreferenced(solution);
  assert.ok(report.includes(`**${confidence.tier}**`), 'the tier');
  for (const reason of confidence.reasons) assert.ok(report.includes(`- ${reason}`), reason.slice(0, 40));
  for (const note of confidence.notes) assert.ok(report.includes(`- ${note}`), note.slice(0, 40));
});

test('Security observations are the securityTotals / accountRows readings, with the accounts named', () => {
  const t = securityTotals(solution);
  const rows = files.flatMap(accountRows);
  const full = rows.filter((r) => r.privilegeSet === '[Full Access]');
  assert.ok(report.includes(`| No-password FileMaker users | ${t.noPassword} |`));
  assert.ok(report.includes(`| Disabled accounts | ${t.disabled} |`));
  assert.ok(report.includes(`| Full-access accounts | ${full.length} |`));
  assert.ok(full.length > 0 && report.includes(full[0].name), 'a full-access account is named');
  const disabled = rows.find((r) => r.enabled === false);
  assert.ok(report.includes(disabled.name), 'a disabled account is named');
});

test('Unreferenced prints a count per category and the whole field list', () => {
  const u = unreferenced(solution);
  for (const [category, rows] of Object.entries(u)) {
    if (Array.isArray(rows)) assert.ok(report.includes(`| ${category} | ${rows.length} |`), category);
  }
  for (const f of u.fields) assert.ok(report.includes(`| ${f.table} | ${f.field} | ${f.tier} |`), f.name);
});

test('Script body observations count every check, and summarise psos-only per script instead of per step', () => {
  const issues = scriptIssues(solution);
  const byCheck = {};
  for (const r of issues) byCheck[r.check] = (byCheck[r.check] ?? 0) + 1;
  for (const [check, n] of Object.entries(byCheck)) assert.ok(report.includes(`| ${check} | ${n} |`), check);
  const psos = issues.filter((r) => r.check === 'psos-only-step');
  const perScript = new Map();
  for (const r of psos) perScript.set(r.script.name, (perScript.get(r.script.name) ?? 0) + 1);
  assert.ok(perScript.size < psos.length, 'the fixture has more psos steps than scripts carrying them');
  const worst = [...perScript.entries()].sort((a, b) => b[1] - a[1])[0];
  assert.ok(report.includes(`| ${worst[0]} | ${worst[1]} |`), `${worst[0]} summarised as ${worst[1]} steps`);
});

test('Calculation fields are tableCounts stored/unstored, per table, and only where there are any', () => {
  const ooe = solution.files['fmnet://localhost/ooe'];
  const counts = tableCounts(fieldsOf(ooe, 'TestTable'));
  assert.ok(report.includes(`| TestTable | ${counts.calc} | ${counts.storedCalc} | ${counts.unstoredCalc} |`));
  assert.ok(!report.includes('| index_languages | 0 | 0 | 0 |'), 'a table with no calculation is not a row');
});

test('Relationships and Container fields come from relationRows and the fields the Tables tab reads', () => {
  const rows = files.flatMap(relationRows);
  for (const r of rows) assert.ok(report.includes(`| ${r.left} | ${r.right} |`), `${r.left} -> ${r.right}`);
  const first = rows.find((r) => r.predicates);
  assert.ok(report.includes(first.predicates.replaceAll('|', '\\|')), 'the predicates ride in the row');
  const containers = files.flatMap((f) => (f.catalogs.table.list ?? []).flatMap((t) =>
    fieldsOf(f, t.name).filter((x) => x.type === 'container').map((x) => [t.name, x.name])));
  assert.ok(containers.length > 0);
  for (const [table, field] of containers) assert.ok(report.includes(`| ${table} | ${field} |`), `${table}::${field}`);
  // fm's own `options.container` says where the data lives; a field without it
  // keeps its data in the file.
  assert.ok(report.includes('| ContainerField1_RC |  | external, open | Ooe/'), 'an external container says so, with its base directory');
  assert.ok(report.includes('| ContainerField1 |  | embedded |'), 'a container with no external storage is embedded');
});

test("Broken references are counted by kind and fm's own script problems are summarised per script", () => {
  const rows = broken(solution);
  const byKind = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  for (const [kind, n] of Object.entries(byKind)) assert.ok(report.includes(`| ${kind} | ${n} |`), kind);
  const marker = rows.find((r) => r.kind === 'missingMarker');
  assert.ok(report.includes(marker.from.name), 'a marker names the object it was found in');
  const problems = rows.filter((r) => r.kind === 'problem');
  const perScript = new Map();
  for (const r of problems) perScript.set(r.from.name, (perScript.get(r.from.name) ?? 0) + 1);
  const worst = [...perScript.entries()].sort((a, b) => b[1] - a[1])[0];
  assert.ok(report.includes(`| ${worst[0]} | ${worst[1]} |`), `${worst[0]} summarised as ${worst[1]} problems`);
});

test('the Broken references section splits fm problem steps out of broken references', () => {
  const rows = broken(solution);
  const problems = rows.filter((r) => r.kind === 'problem').length;
  assert.ok(report.includes(`| Broken references | ${rows.length - problems} |`), 'the broken-reference total');
  assert.ok(report.includes(`| fm problem steps | ${problems} |`), 'fm\'s own problem steps, counted apart');
  assert.ok(!report.includes(`| Broken references | ${rows.length} |`), 'the two are not added together');
  assert.ok(report.includes("its report about its own rendering of a step"), 'and the report says why');
});

test('a script-issue row names FileMaker\'s line, not the 0-based body index', () => {
  const rows = scriptIssues(solution).filter((r) => r.check !== 'psos-only-step');
  assert.ok(rows.length > 0);
  const at = report.indexOf('### Every other finding');
  const block = report.slice(at, report.indexOf('\n## ', at));
  assert.ok(block.includes('| File | Script | Line | Check | Detail |'), 'the column is the line');
  for (const r of rows.slice(0, 5)) {
    assert.ok(block.includes(`| ${r.script.name} | ${r.step.line} | ${r.check} |`), `${r.script.name} line ${r.step.line}`);
  }
});

test('Gaps says to run the check when the solution carries none, and the counts when it does', () => {
  assert.ok(report.includes('Run the live check on the Gaps tab'));
  const withGaps = { ...solution, gaps: { stillMissing: [1, 2], newlyReported: [1], regressed: [], errored: [1, 2, 3] } };
  const r2 = markdownReport(withGaps);
  assert.ok(r2.includes('| Still missing | 2 |'));
  assert.ok(r2.includes('| Newly reported | 1 |'));
  assert.ok(r2.includes('| Regressed | 0 |'));
  assert.ok(r2.includes('| Errored | 3 |'));
  // The report's lists are the Gaps tab's own, so the page a reader looked at
  // and the report they exported from it cannot show different halves.
  for (const l of GAP_LISTS) {
    assert.ok(r2.includes(`| ${l.title} | `), `the report does not carry ${l.key}`);
    assert.ok(r2.includes(l.note), `the report does not carry the note for ${l.key}`);
  }
  assert.ok(!r2.includes('Run the live check on the Gaps tab'));
});

// ── Hand-made solutions: one rule per test ────────────────────────────

/** One file carrying one table whose name and whose field's name both carry the
 *  character that would otherwise split a Markdown row. */
function pipeSolution() {
  const file = createFile('file:///x.fmp12');
  file.name = 'x';
  file.catalogs.table.list = [{ id: 1, name: 'Pipe|Table' }];
  file.catalogs.field.detailById['table:Pipe|Table'] = {
    op: {}, readAt: null,
    result: { items: [{ id: 1, name: 'Odd|Field', type: 'container' }] },
  };
  return { root: 'file:///x.fmp12', cli: { version: '0.7.0' }, files: { 'file:///x.fmp12': file }, unreachable: [], readAt: '2026-01-01T00:00:00Z' };
}

/** A row's cells, counted the way a Markdown reader counts them: an escaped
 *  pipe is not a cell boundary. */
const cellCount = (line) => line.split(/(?<!\\)\|/).length;

test('a pipe in a name is escaped, so the table it sits in still has its columns', () => {
  const md = markdownReport(pipeSolution());
  assert.ok(md.includes('| Pipe\\|Table | Odd\\|Field |'), 'both names escaped in the container row');
  assert.ok(!/\| Pipe\|Table \|/.test(md), 'no raw pipe survives into a row');
  let checked = 0;
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    checked += 1;
    assert.ok(cellCount(line) >= 2, line);
  }
  assert.ok(checked > 10, 'there are rows to check');
});

test('every table in the fixture report has rows as wide as its header', () => {
  let run = [];
  const check = () => {
    if (run.length >= 3) for (const l of run) assert.equal(cellCount(l), cellCount(run[0]), l);
    run = [];
  };
  for (const line of report.split('\n')) {
    if (line.startsWith('|')) run.push(line);
    else check();
  }
  check();
});

test('a solution with nothing read is still a report, with every section on it', () => {
  const empty = { root: 'file:///e.fmp12', cli: null, files: {}, unreachable: [], readAt: null };
  const md = markdownReport(empty);
  const headings = [...md.matchAll(/^## .+$/gm)].map((m) => m[0].slice(3));
  assert.deepEqual(headings, SECTIONS);
});

test('File Options is a section with all 19 settings from FILE_OPTIONS_GROUPS, naming the startup layout and the triggers', () => {
  assert.ok(SECTIONS.includes('File Options'));
  assert.match(report, /^## File Options$/m);
  // The report carries every setting from FILE_OPTIONS_GROUPS, which is exported
  // from ui/tabs/solution.js and shared by both the page and the report.
  const settingLabels = [
    'Switch to a layout on open', 'Startup layout', 'Log in as', 'A password is set',
    'Minimum FileMaker version', 'Hide all toolbars',
    'Allow stored credentials', 'Require a device passcode', 'Show sign-in fields', 'Require authorization',
    'Underline questionable spellings', 'Smart quotes', 'Asian line breaking (kinsoku)',
    'Roman line breaking on word boundaries', 'Date, time and number formats',
    'Generate thumbnails', 'Thumbnail storage',
    'Give new tables the default fields',
    'Icon',
  ];
  for (const label of settingLabels) {
    assert.ok(report.includes(label), `setting "${label}" is in the report`);
  }
  assert.ok(report.includes('File Open'), 'the startup layout');
  assert.ok(report.includes('OnFirstWindowOpen'), 'a file script trigger');
  // A boolean reads the way the page reads it, not as `true`.
  assert.ok(!/\| true \|/.test(report));
});

test('a file whose fm has no file-options catalog says so in the report', () => {
  const broken = structuredClone(solution);
  broken.files[api.meta.root].fileOptions = { block: null, error: { code: 'unknown_catalog', message: 'no such catalog' }, ops: [], readAt: null };
  assert.ok(markdownReport(broken).includes('unknown_catalog'));
});
