// tests/tabs/tables.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { parseHash } from '../../ui/shell.js';
import { tab, fieldsOf, fieldKind, fieldStorage, autoEnterSummary, validationSummary, tableCounts } from '../../ui/tabs/tables.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const root = solution.files[api.meta.root];
const view = { selection: null, filter: '', multiFile: true };

test('fieldsOf, fieldKind, fieldStorage, autoEnterSummary on real fields', () => {
  const fields = fieldsOf(root, 'TestTable');
  assert.ok(fields.length > 5);
  const calc = fields.find((f) => f.options.fieldType === 'calculated');
  assert.equal(fieldKind(calc), 'calc');
  assert.ok(['stored', 'unstored'].includes(fieldStorage(calc)));
  const constant = fieldsOf(root, 'autoEnter_fields').find((f) => f.options.autoEnter.type !== 'none');
  assert.ok(autoEnterSummary(constant).length > 0);
  assert.deepEqual(fieldsOf(root, 'nope'), []);
});

test('fieldKind and fieldStorage classify every kind the fixture carries', () => {
  const tt = fieldsOf(root, 'TestTable');
  const kind = (name) => fieldKind(tt.find((f) => f.name === name));
  assert.equal(kind('CalcField1_c'), 'calc');
  assert.equal(kind('SummaryField1'), 'summary');
  assert.equal(kind('MyGlobal_g'), 'global');
  assert.equal(kind('ContainerField1'), 'container');
  assert.equal(kind('TextField1'), 'normal');
  const storage = (name) => fieldStorage(tt.find((f) => f.name === name));
  assert.equal(storage('CalcField1_c'), 'stored');
  assert.equal(storage('ContactNameList_u'), 'unstored');
  assert.equal(storage('MyGlobal_g'), 'global');
  // fm's fieldType vocabulary, straight from the fixture: nothing else is spelled.
  assert.deepEqual([...new Set(tt.map((f) => f.options.fieldType))].sort(), ['calculated', 'normal', 'summary']);
});

test('a global calculation counts as neither stored nor unstored', () => {
  // ooe has no global calc, so this is the one hand-made field in the file.
  const globalCalc = { name: 'g_calc', type: 'text', options: { fieldType: 'calculated', global: true, stored: true, repetitions: 1, calculation: { text: '1' } } };
  assert.equal(fieldKind(globalCalc), 'calc');
  assert.equal(fieldStorage(globalCalc), 'global');
  const counts = tableCounts([globalCalc]);
  assert.equal(counts.calc, 1);
  assert.equal(counts.storedCalc, 0);
  assert.equal(counts.unstoredCalc, 0);
  assert.equal(counts.global, 1);
});

test('autoEnterSummary and validationSummary name what is set', () => {
  const ae = fieldsOf(root, 'autoEnter_fields');
  const of = (name) => autoEnterSummary(ae.find((f) => f.name === name));
  assert.match(of('txt_fixedValue'), /constant/);
  assert.match(of('txt_fixedValue'), /"value"/);
  assert.match(of('txt_calc_doReplace'), /calc/);
  assert.match(of('txt_calc_doReplace'), /1\+1/);
  assert.equal(autoEnterSummary(fieldsOf(root, 'TestTable').find((f) => f.name === 'TextField1')), '');

  const val = fieldsOf(root, 'validation');
  assert.equal(validationSummary(val.find((f) => f.name === 'numeric_strict')), 'strictNumber');
  assert.equal(validationSummary(fieldsOf(root, 'TestTable').find((f) => f.name === 'TextField1')), '');
});

test('renders every table with its counts and file name', () => {
  const html = tab.render(solution, view);
  assert.match(html, /Base tables/);
  for (const t of root.catalogs.table.list) assert.ok(html.includes(`data-select="${encodeURIComponent(api.meta.root)}|${t.name}"`) || html.includes(`|${t.name}"`), t.name);
  assert.match(html, /BrojDva/);
  assert.match(html, /data-reread-catalog="table"/);
});

test('the name cell link routes to the same selection the row carries', () => {
  const html = tab.render(solution, view);
  const hrefs = [...html.matchAll(/href="(#tables[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  assert.ok(hrefs.length >= root.catalogs.table.list.length);
  assert.equal(parseHash(hrefs[0]).tab, 'tables');
  assert.equal(parseHash(hrefs[0]).selection, `${api.meta.root}|${root.catalogs.table.list[0].name}`);
});

test('the totals line counts tables, fields and calc fields across files', () => {
  const html = tab.render(solution, view);
  const tables = Object.values(solution.files).reduce((n, f) => n + f.catalogs.table.list.length, 0);
  assert.match(html, /class="muted totals">Tables <span class="num">\d+<\/span>/);
  assert.ok(html.includes(`Tables <span class="num">${tables}</span>`), `expected ${tables} tables in the totals`);
  assert.match(html, /Unstored calc <span class="num">\d+<\/span>/);
});

test('the totals are solution-wide: a filter that hides most tables leaves them alone', () => {
  const line = (html) => html.match(/<p class="muted totals">.*?<\/p>/)[0];
  const all = line(tab.render(solution, view));
  const filtered = tab.render(solution, { ...view, filter: 'contacts' });
  assert.equal(line(filtered), all);
  assert.ok(!filtered.includes('>TestTable<'), 'the filter did hide tables');
});

test('a selected table shows its fields, sublists and an object re-read control', () => {
  const html = tab.render(solution, { ...view, selection: `${api.meta.root}|TestTable` });
  assert.match(html, /Fields of TestTable/);
  assert.match(html, /<summary>Calc fields \(\d+\)<\/summary>/);
  assert.match(html, /<summary>Summary fields \(\d+\)<\/summary>/);
  assert.match(html, /<summary>Global fields \(\d+\)<\/summary>/);
  assert.match(html, /<summary>Container fields \(\d+\)<\/summary>/);
  assert.match(html, /<summary>Auto-entry fields \(\d+\)<\/summary>/);
  assert.match(html, /data-reread-object='\{[^']*"catalog":"field"[^']*"key":"table:TestTable"/);
  assert.match(html, /List \( TestTable_Contacts::Name \)/);
});

test('a selected table in the second file reads that file, not the root', () => {
  const html = tab.render(solution, { ...view, selection: 'fmnet://localhost/BrojDva|Invoice' });
  assert.match(html, /Fields of Invoice/);
  assert.match(html, /"target":"fmnet:\/\/localhost\/BrojDva"/);
});

test('the filter narrows the field rows', () => {
  const all = tab.render(solution, { ...view, selection: `${api.meta.root}|TestTable` });
  const some = tab.render(solution, { ...view, selection: `${api.meta.root}|TestTable`, filter: 'zzzz-no-such-field' });
  assert.ok(some.length < all.length);
});

test('the field table shows the developer comment, and the filter matches it', () => {
  const html = tab.render(solution, { ...view, selection: `${api.meta.root}|TestTable` });
  assert.ok(html.includes('<th data-sort="text" title="Click to sort">Comment</th>'));
  // TestTable::ID carries a comment on the fixture; TextField1 carries none.
  assert.ok(html.includes('<td>Unique identifier of each record in this table</td>'));
  const byComment = tab.render(solution, { ...view, selection: `${api.meta.root}|TestTable`, filter: 'unique identifier' });
  assert.match(byComment, /<td>ID<\/td>/);
  assert.ok(!byComment.includes('>TextField1</td>'), 'a field matching neither name, calc nor comment is filtered out');
});

test('the filter matches calculation text as well as the name', () => {
  const byCalc = tab.render(solution, { ...view, selection: `${api.meta.root}|TestTable`, filter: 'testtable_contacts' });
  assert.match(byCalc, /ContactNameList_u/);
  assert.ok(!byCalc.includes('>TextField1<'), 'a field matching neither name nor calc is filtered out');
});

test('a selection naming no table falls back to the table list alone', () => {
  const html = tab.render(solution, { ...view, selection: `${api.meta.root}|nope` });
  assert.match(html, /Base tables/);
  assert.ok(!html.includes('Fields of'));
});

test('every model string is escaped', () => {
  const evil = { target: 'x<y', name: '<img>', facts: {}, catalogs: { table: { list: [{ name: '<b>&"', id: 1, position: 0 }], listError: null, detailById: {}, ops: [], readAt: null }, field: { list: [], listError: null, detailById: {}, ops: [], readAt: null } } };
  const html = tab.render({ files: { 'x<y': evil }, unreachable: [] }, { selection: null, filter: '', multiFile: false });
  assert.ok(!html.includes('<b>&"'));
  assert.match(html, /&lt;b&gt;&amp;&quot;/);
});
