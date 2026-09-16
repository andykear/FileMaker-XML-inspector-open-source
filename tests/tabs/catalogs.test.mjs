// tests/tabs/catalogs.test.mjs
// Every count here was measured against tests/fixtures/ooe before it was pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { link } from '../../ui/dom.js';
import {
  tab, valueListRows, valueListSource, customFunctionRows, customMenuRows,
  customMenuSetRows, externalDataSourceRows, baseDirectoryRows, persistentDataRows,
  fontRows, graphNoteRows, catalogsTotals, selectionOf,
} from '../../ui/tabs/catalogs.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const root = solution.files[api.meta.root];
const brojDva = solution.files['fmnet://localhost/BrojDva'];
const view = { selection: null, filter: '', multiFile: true };

test('valueListRows: 8 value lists on the root file', () => {
  const rows = valueListRows(root);
  assert.equal(rows.length, 8);
  assert.equal(rows.length, root.catalogs.valueList.list.length);
});

test('valueListSource: custom values joined and truncated, field as occurrence::field with related-only badge, external as the source name', () => {
  const rows = valueListRows(root);

  const yn = rows.find((r) => r.name === 'YN');
  assert.equal(yn.type, 'custom');
  assert.equal(valueListSource(yn), 'Yes, No, 2025-07-14 mkos: Added 3rd option');

  const field = rows.find((r) => r.name === 'TestTable | TextField1');
  assert.equal(field.type, 'field');
  assert.equal(valueListSource(field), 'TestTable::TextField1');

  const related = rows.find((r) => r.name === 'MyRelatedValueList');
  assert.equal(related.type, 'field');
  assert.match(valueListSource(related), /Contacts::ID_TestTable/);
  assert.match(valueListSource(related), /related only/);

  const external = rows.find((r) => r.name === 'from_another_file');
  assert.equal(external.type, 'external');
  assert.equal(valueListSource(external), 'Self');

  const externalTwo = rows.find((r) => r.name === 'from_another_file_two');
  assert.equal(valueListSource(externalTwo), 'BrojDva');
});

test('valueListSource truncates a long custom list to 80 chars with an ellipsis', () => {
  const row = { type: 'custom', values: Array.from({ length: 20 }, (_, i) => `value${i}`) };
  const source = valueListSource(row);
  assert.ok(source.endsWith('…'));
  assert.ok(source.length <= 81);
});

test('customFunctionRows: 4 entries on the root file (one is a folder)', () => {
  const rows = customFunctionRows(root);
  assert.equal(rows.length, 4);
  assert.equal(rows.length, root.catalogs.customFunction.list.length);
  const fn = rows.find((r) => r.name === 'MyCustomFunction');
  assert.equal(fn.type, 'customFunction');
  assert.equal(fn.arity, 1);
  assert.equal(fn.prototype, 'MyCustomFunction ( value )');
  assert.equal(fn.availableToUser, true);
  assert.match(fn.body, /value \+ 1/);
  const folder = rows.find((r) => r.name === 'MyCustomFunctionParentFolder');
  assert.equal(folder.type, 'folder');
});

test('customMenuRows: 25 custom menus on the root file, one custom with 5 items', () => {
  const rows = customMenuRows(root);
  assert.equal(rows.length, 25);
  assert.equal(rows.length, root.catalogs.customMenu.list.length);
  const custom = rows.find((r) => r.name === 'MyCustomMenu');
  assert.equal(custom.items.length, 5);
  assert.equal(custom.inheritedMenu, false);
  assert.equal(custom.browseMode, true);
  const builtIn = rows.find((r) => r.name === '[Format]');
  assert.equal(builtIn.inheritedMenu, true);
  assert.equal(builtIn.items.length, 0);
});

test('customMenuSetRows: 3 menu sets on the root file', () => {
  const rows = customMenuSetRows(root);
  assert.equal(rows.length, 3);
  assert.equal(rows.length, root.catalogs.customMenuSet.list.length);
  assert.ok(rows.find((r) => r.name === '[Standard FileMaker Menus]').builtIn);
});

test('externalDataSourceRows: 7 external sources on the root file, with the odbc dsn', () => {
  const rows = externalDataSourceRows(root);
  assert.equal(rows.length, 7);
  assert.equal(rows.length, root.catalogs.externalDataSource.list.length);
  const odbc = rows.find((r) => r.name === 'ETS_22_0');
  assert.equal(odbc.sourceType, 'odbc');
  assert.equal(odbc.dsn, 'ets');
  const fm = rows.find((r) => r.name === 'Self');
  assert.equal(fm.sourceType, 'filemaker');
  assert.equal(fm.dsn, '');
});

test('baseDirectoryRows: 5 base directories on the root file', () => {
  const rows = baseDirectoryRows(root);
  assert.equal(rows.length, 5);
  assert.equal(rows.length, root.catalogs.baseDirectory.list.length);
  const first = rows.find((r) => r.path === 'Ooe/');
  assert.equal(first.relative, true);
  assert.equal(first.absolutePath, '/Ooe/');
});

test('persistentDataRows: 5 persistent entries on the root file, distinct instances kept apart', () => {
  const rows = persistentDataRows(root);
  assert.equal(rows.length, 5);
  assert.equal(rows.length, root.catalogs.persistentData.list.length);
  const version = rows.find((r) => r.key === 'app.version');
  assert.equal(version.value, '1.0.0');
  assert.equal(version.dataType, 'text');
  const configs = rows.filter((r) => r.key === 'addon.config');
  assert.equal(configs.length, 2);
  assert.notEqual(configs[0].instance, configs[1].instance);
});

test('fontRows: 13 fonts on the root file', () => {
  const rows = fontRows(root);
  assert.equal(rows.length, 13);
  assert.equal(rows.length, root.catalogs.font.list.length);
  const arial = rows.find((r) => r.postScriptName === 'ArialMT');
  assert.equal(arial.name, 'Arial');
  assert.equal(arial.codeSet, 'roman');
});

test('graphNoteRows: 2 graph notes on the root file', () => {
  const rows = graphNoteRows(root);
  assert.equal(rows.length, 2);
  assert.equal(rows.length, root.catalogs.graphNote.list.length);
  assert.equal(rows[0].text, 'Relationship graph notes');
  assert.equal(rows[0].collapsed, false);
});

test('catalogsTotals sums every catalog across every reached file', () => {
  const t = catalogsTotals(solution);
  assert.equal(t.valueLists, valueListRows(root).length + valueListRows(brojDva).length);
  assert.equal(t.customFunctions, customFunctionRows(root).length + customFunctionRows(brojDva).length);
  assert.equal(t.customMenus, customMenuRows(root).length + customMenuRows(brojDva).length);
  assert.equal(t.customMenuSets, customMenuSetRows(root).length + customMenuSetRows(brojDva).length);
  assert.equal(t.externalDataSources, externalDataSourceRows(root).length + externalDataSourceRows(brojDva).length);
  assert.equal(t.baseDirectories, baseDirectoryRows(root).length + baseDirectoryRows(brojDva).length);
  assert.equal(t.persistentData, persistentDataRows(root).length + persistentDataRows(brojDva).length);
  assert.equal(t.fonts, fontRows(root).length + fontRows(brojDva).length);
  assert.equal(t.graphNotes, graphNoteRows(root).length + graphNoteRows(brojDva).length);
});

test('selectionOf reads target and the vl/cf/menu id out of the raw selection string', () => {
  assert.equal(selectionOf({ selection: null }), null);
  assert.deepEqual(selectionOf({ selection: `${api.meta.root}|vl:2` }), { target: api.meta.root, kind: 'vl', id: '2' });
  assert.deepEqual(selectionOf({ selection: `${api.meta.root}|cf:1` }), { target: api.meta.root, kind: 'cf', id: '1' });
  assert.deepEqual(selectionOf({ selection: `${api.meta.root}|menu:26` }), { target: api.meta.root, kind: 'menu', id: '26' });
});

test('the tab renders the File facts, every catalog table, the totals line and re-read controls', () => {
  const html = tab.render(solution, view);
  assert.match(html, /Get \( FileName \)/);
  assert.match(html, /Value lists/);
  assert.match(html, /Custom functions/);
  assert.match(html, /Custom menus/);
  assert.match(html, /Custom menu sets/);
  assert.match(html, /External data sources/);
  assert.match(html, /Base directories/);
  assert.match(html, /Persistent data/);
  assert.match(html, /Fonts/);
  assert.match(html, /Graph notes/);
  const t = catalogsTotals(solution);
  assert.ok(html.includes(`Value lists <span class="num">${t.valueLists}</span>`));
  assert.ok(html.includes(`Graph notes <span class="num">${t.graphNotes}</span>`));
  assert.ok(html.includes('data-reread-catalog="facts"'));
  assert.ok(html.includes('data-reread-catalog="valueList"'));
  assert.ok(html.includes('data-reread-catalog="customFunction"'));
  assert.ok(html.includes('data-reread-catalog="customMenu"'));
  assert.ok(html.includes('data-reread-catalog="customMenuSet"'));
  assert.ok(html.includes('data-reread-catalog="externalDataSource"'));
  assert.ok(html.includes('data-reread-catalog="baseDirectory"'));
  assert.ok(html.includes('data-reread-catalog="persistentData"'));
  assert.ok(html.includes('data-reread-catalog="font"'));
  assert.ok(html.includes('data-reread-catalog="graphNote"'));
  assert.ok(html.includes(link('security', 'Authorizations')));
});

test('the totals are solution-wide: a filter that hides everything leaves the totals line alone', () => {
  const line = (html) => html.match(/<p class="muted totals">.*?<\/p>/)[0];
  const all = line(tab.render(solution, view));
  const filtered = tab.render(solution, { ...view, filter: 'zzzz-no-such-thing' });
  assert.equal(line(filtered), all);
  assert.ok(!filtered.includes('>YN<'));
});

test('selecting a value list shows its kv detail, the values and a re-read control', () => {
  const yn = valueListRows(root).find((r) => r.name === 'YN');
  const html = tab.render(solution, { ...view, selection: `${api.meta.root}|vl:${yn.id}` });
  assert.match(html, /YN/);
  assert.match(html, /2025-07-14 mkos/);
  assert.ok(html.includes('data-reread-object='));
  assert.ok(html.includes('"catalog":"valueList"'));
});

test('selecting a custom function shows its escaped body in a <pre> and a re-read control', () => {
  const fn = customFunctionRows(root).find((r) => r.name === 'MyCustomFunction');
  const html = tab.render(solution, { ...view, selection: `${api.meta.root}|cf:${fn.id}` });
  assert.match(html, /<pre>value \+ 1<\/pre>/);
  assert.ok(html.includes('data-reread-object='));
  assert.ok(html.includes('"catalog":"customFunction"'));
});

test('selecting a custom menu shows its calculations and its items table with the action summary fm reports', () => {
  const menu = customMenuRows(root).find((r) => r.name === 'MyCustomMenu');
  const html = tab.render(solution, { ...view, selection: `${api.meta.root}|menu:${menu.id}` });
  assert.match(html, /MyCustomMenu/);
  assert.match(html, /Contacts::Name \+ 1/);
  assert.match(html, /Hello world/);
  assert.match(html, /Perform Script/);
  assert.ok(html.includes('data-reread-object='));
  assert.ok(html.includes('"catalog":"customMenu"'));
});

test('a selection in the second file reads that file, not the root', () => {
  const menu = customMenuRows(brojDva)[0];
  const html = tab.render(solution, { ...view, selection: `fmnet://localhost/BrojDva|menu:${menu.id}` });
  assert.ok(html.includes(`(${brojDva.name ?? brojDva.target})`));
  assert.ok(html.includes('"target":"fmnet://localhost/BrojDva"'));
});

test('the File column appears in multiFile view', () => {
  const html = tab.render(solution, view);
  assert.ok(html.includes('<th>File</th>'));
});

test('every model string is escaped', () => {
  const evil = {
    target: 'x<y', name: '<img>', facts: {},
    catalogs: {
      valueList: { list: [{ id: 1, name: '<b>&"', type: 'custom', values: ['<i>'] }], listError: null, detailById: {}, ops: [], readAt: null },
      customFunction: { list: [], listError: null, detailById: {}, ops: [], readAt: null },
      customMenu: { list: [], listError: null, detailById: {}, ops: [], readAt: null },
      customMenuSet: { list: [], listError: null, detailById: {}, ops: [], readAt: null },
      externalDataSource: { list: [], listError: null, detailById: {}, ops: [], readAt: null },
      baseDirectory: { list: [], listError: null, detailById: {}, ops: [], readAt: null },
      persistentData: { list: [], listError: null, detailById: {}, ops: [], readAt: null },
      font: { list: [], listError: null, detailById: {}, ops: [], readAt: null },
      graphNote: { list: [], listError: null, detailById: {}, ops: [], readAt: null },
    },
  };
  const html = tab.render({ files: { 'x<y': evil }, unreachable: [] }, { selection: `x<y|vl:1`, filter: '', multiFile: false });
  assert.ok(!html.includes('<b>&"'));
  assert.ok(!html.includes('<i>'));
  assert.match(html, /&lt;b&gt;&amp;&quot;/);
});
