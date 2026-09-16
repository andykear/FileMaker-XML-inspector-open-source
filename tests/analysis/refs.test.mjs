// tests/analysis/refs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { nameIndex, references, strings, tokenise } from '../../ui/analysis/refs.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const ROOT = api.meta.root;

test('tokenise skips quoted literals, line comments and block comments', () => {
  const t = tokenise('Let ( $x = "A::B" ; $x & TestTable::TextField1 )');
  assert.deepEqual(t.fields, ['TestTable::TextField1']);
  assert.deepEqual(t.variables, ['$x']);
  assert.equal(t.quoted, 1);
  assert.ok(!t.functions.includes('A'));
  assert.deepEqual(tokenise('// Contacts::Name\r/* Contacts::ID */ Contacts::Phone').fields, ['Contacts::Phone']);
  assert.deepEqual(tokenise('MyCustomFunction ( 1 ) + Length ( $$g )').functions, ['MyCustomFunction', 'Length']);
  assert.deepEqual(tokenise('MyCustomFunction ( 1 ) + Length ( $$g )').variables, ['$$g']);
  assert.deepEqual(tokenise('"he said \\"A::B\\" loudly"').fields, []);
});

test('a <Field Missing> marker is not a field token', () => {
  assert.deepEqual(tokenise('TestTable::<Field Missing> + 1').fields, []);
  assert.deepEqual(tokenise('/*<Function Missing>( 2 ) + 4*/').functions, []);
});

test('strings visits every string value once, with its key path', () => {
  const seen = [];
  strings({ a: 'one', b: { c: 'two', d: 4 }, e: ['three', { f: 'four' }] }, (v, p) => seen.push([v, p]));
  assert.deepEqual(seen, [['one', 'a'], ['two', 'b.c'], ['three', 'e.0'], ['four', 'e.1.f']]);
});

test('nameIndex carries every kind, keyed by name, values arrays', () => {
  const idx = nameIndex(solution);
  assert.ok(idx.scripts.get('noop')[0].target === ROOT);
  assert.ok(idx.tables.has('TestTable'));
  assert.ok(idx.occurrences.get('TestTable')[0].table === 'TestTable');
  assert.ok(idx.fields.has('TestTable::CalcField1_c'));
  assert.ok(idx.layouts.has('Contacts'));
  assert.ok(idx.valueLists.has('YN'));
  assert.ok(idx.customFunctions.get('MyCustomFunction')[0].arity === 1);
  assert.ok(idx.themesStyles.has('MyCustomStyle_BoldItalicsLabel'));
  assert.equal(nameIndex(solution), idx, 'memoised on the solution object');
});

test('references finds the named script reference of a Perform Script step', () => {
  const rows = references(solution);
  const hit = rows.find((r) => r.kind === 'script' && r.name === 'noop' && r.how === 'named' && r.from.kind === 'script');
  assert.ok(hit, 'a named script reference to noop from a script step');
  assert.equal(hit.resolved, true);
  assert.match(hit.from.where, /^body\[\d+\]\.script$/);
});

test('references finds a named field reference from a layout object', () => {
  const rows = references(solution);
  const hit = rows.find((r) => r.kind === 'field' && r.name === 'TestTable::CalcField1_c' && r.from.kind === 'layoutObject');
  assert.ok(hit);
  assert.equal(hit.how, 'named');
  assert.equal(hit.resolved, true);
});

test('references finds a field named only inside calculation text', () => {
  const rows = references(solution);
  const hit = rows.find((r) => r.kind === 'field' && r.how === 'text' && r.from.kind === 'field');
  assert.ok(hit);
  assert.ok(hit.name.includes('::'));
});

test('a name that is in no index resolves to false', () => {
  const rows = references(solution);
  assert.ok(rows.some((r) => r.resolved === false));
  assert.ok(rows.every((r) => r.kind !== 'field' || !r.name.includes('<Field Missing>')));
});

test('references is memoised on the solution object', () => {
  assert.equal(references(solution), references(solution));
});

// ── Pinned against the ooe fixture (fm 0.7.0, recorded 2026-09-16) ────
// Every number below was printed from the fixture before it was written here.

test('the reference counts by kind on the fixture', () => {
  const rows = references(solution);
  const byKind = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  assert.deepEqual(byKind, {
    variable: 1220, field: 919, occurrence: 293, table: 273,
    script: 52, layout: 16, valueList: 14, style: 7, customFunction: 3,
  });
  assert.equal(rows.length, 2797);
});

test('the reference counts by how, and by the kind of object doing the naming', () => {
  const rows = references(solution);
  const tally = (f) => rows.reduce((o, r) => ({ ...o, [f(r)]: (o[f(r)] ?? 0) + 1 }), {});
  assert.deepEqual(tally((r) => r.how), { text: 1612, named: 1185 });
  assert.deepEqual(tally((r) => r.from.kind), {
    script: 1884, layoutObject: 585, field: 119, layout: 73, relation: 62,
    tableOccurrence: 47, valueList: 17, customMenu: 8, customFunction: 2,
  });
});

test('the name index sizes on the fixture', () => {
  const idx = nameIndex(solution);
  assert.deepEqual(Object.fromEntries(Object.entries(idx).map(([k, m]) => [k, m.size])), {
    tables: 15, occurrences: 24, fields: 268, scripts: 41,
    layouts: 19, valueLists: 9, customFunctions: 9, themesStyles: 60,
  });
  // 41 scripts, not the 54 the two listings carry: the rest are folders.
  const scripts = Object.values(solution.files).reduce((n, f) => n + f.catalogs.script.list.length, 0);
  assert.ok(idx.scripts.size < scripts);
});

test('the only named reference on the fixture that resolves to nothing is the AppleScript source', () => {
  // fm reports `Perform AppleScript`'s AppleScript source under the same `script`
  // key `Perform Script` uses for a script name. It is the one measured false
  // positive of the named-key rule on ooe; Task 3 will see it as a dangling name.
  const dangling = references(solution).filter((r) => r.how === 'named' && !r.resolved && r.kind !== 'variable');
  assert.deepEqual([...new Set(dangling.map((r) => `${r.kind} ${r.name}`))], ['script display dialog "Hello world!"']);
});

test('every layout, value list, field and occurrence the fixture names does resolve', () => {
  const rows = references(solution);
  const named = (kind) => [...new Set(rows.filter((r) => r.kind === kind && r.how === 'named').map((r) => `${r.name}|${r.resolved}`))].sort();
  assert.deepEqual(named('layout'), ['Contacts|true', 'File Open|true', 'My Layout for TestTable|true', 'SaXMLDeliveryExecutionContext|true']);
  // The external lists fm writes as `Self::MyRelatedValueList` / `BrojDva::VL`
  // resolve on the half after `::`, which is the list's own name.
  assert.deepEqual(named('valueList'), ['1|true', 'MyRelatedValueList|true', 'TestTable | TextField1|true', 'VL|true', 'YN|true']);
  assert.ok(rows.filter((r) => r.kind === 'occurrence' && r.how === 'named').every((r) => r.resolved));
});

test('exactly one field named in calculation text on the fixture resolves to nothing', () => {
  const un = references(solution).filter((r) => r.kind === 'field' && r.how === 'text' && !r.resolved);
  assert.equal(un.length, 1);
  assert.equal(un[0].name, 'Customers::ID');
  assert.equal(un[0].from.where, 'options.aiAnnotation');
});

test('script references come from steps, layout triggers, button actions and menu items', () => {
  const rows = references(solution).filter((r) => r.kind === 'script');
  const byFrom = {};
  for (const r of rows) byFrom[r.from.kind] = (byFrom[r.from.kind] ?? 0) + 1;
  assert.deepEqual(byFrom, { layout: 25, script: 20, layoutObject: 5, customMenu: 2 });
  assert.ok(rows.some((r) => r.from.kind === 'layout' && r.from.where.startsWith('scriptTriggers.')));
  assert.ok(rows.some((r) => r.from.kind === 'customMenu' && r.from.where.includes('.action.script')));
  assert.ok(rows.some((r) => r.from.kind === 'layoutObject' && r.from.where.includes('.action.script')));
});

test('a sub-summary part names its break field, and fm names it outright', () => {
  const hit = references(solution).find((r) => r.from.where.endsWith('.breakField.name'));
  assert.equal(hit.kind, 'field');
  assert.equal(hit.how, 'named');
  assert.equal(hit.name, 'TestTable::TextField1');
  assert.equal(hit.from.kind, 'layout');
});

test('a relation names both occurrences and, per predicate, a field on each side', () => {
  const rows = references(solution).filter((r) => r.from.kind === 'relation');
  const first = rows.find((r) => r.from.where === 'left.name');
  assert.equal(first.kind, 'occurrence');
  assert.equal(first.from.name, 'Contacts_TestTable ↔ Contacts');
  const pred = rows.find((r) => r.from.where === 'predicates.0.leftField');
  assert.equal(pred.kind, 'field');
  assert.equal(pred.name, 'Contacts_TestTable::ID');
  assert.equal(pred.how, 'named');
  assert.equal(pred.resolved, true);
});

test('a custom function does not reference itself through fm\'s prototype', () => {
  const rows = references(solution).filter((r) => r.kind === 'customFunction');
  assert.ok(rows.every((r) => r.from.where !== 'prototype'));
  assert.deepEqual([...new Set(rows.map((r) => r.name))].sort(), ['GFN', 'GTN', 'GetExternalContainerPath']);
  // Built-in functions are used everywhere on ooe and are in no list.
  assert.ok(!rows.some((r) => r.name === 'Let' || r.name === 'Get'));
});

// ── Hand-made solutions: the cases ooe does not carry ─────────────────

/** The smallest thing `references` accepts: one file, the catalogs it reads. */
function handMade(catalogs) {
  const empty = { list: [], listError: null, detailById: {}, ops: [], readAt: null };
  const slots = {};
  for (const c of ['table', 'tableOccurrence', 'relation', 'layout', 'script', 'valueList', 'customFunction', 'customMenu', 'theme', 'field']) {
    slots[c] = { ...empty, ...(catalogs[c] ?? {}) };
  }
  return { files: { 'file:///x.fmp12': { target: 'file:///x.fmp12', name: 'x', facts: {}, catalogs: slots } }, unreachable: [] };
}

const detail = (id, result) => ({ [String(id)]: { op: {}, readAt: null, result } });

test('a Perform Script naming a script that is not there resolves to false', () => {
  const sol = handMade({
    script: {
      list: [{ id: 1, name: 'caller', type: 'script' }],
      detailById: detail(1, { id: 1, name: 'caller', body: [{ stepID: 1, step: 'Perform Script', script: 'gone' }] }),
    },
  });
  const hit = references(sol).find((r) => r.kind === 'script');
  assert.deepEqual({ name: hit.name, resolved: hit.resolved, how: hit.how, where: hit.from.where }, { name: 'gone', resolved: false, how: 'named', where: 'body[0].script' });
});

test('a field token resolves only when the occurrence exists and its base table has the field', () => {
  const sol = handMade({
    table: { list: [{ id: 1, name: 'T' }] },
    field: { detailById: { 'table:T': { op: {}, readAt: null, result: { items: [{ id: 1, name: 'A', options: {} }] } } } },
    tableOccurrence: { list: [{ id: 9, name: 'TO', table: { name: 'T', id: 1, resolved: true } }] },
    script: {
      list: [{ id: 1, name: 's', type: 'script' }],
      detailById: detail(1, { id: 1, name: 's', body: [{ stepID: 1, step: 'Set Variable', value: 'TO::A & TO::B & Nope::A' }] }),
    },
  });
  const byName = Object.fromEntries(references(sol).filter((r) => r.kind === 'field').map((r) => [r.name, r.resolved]));
  assert.deepEqual(byName, { 'TO::A': true, 'TO::B': false, 'Nope::A': false });
});

test('a style resolves against the theme its layout wears, not against any theme', () => {
  const themes = [
    { id: 1, name: 'one', namedStyleNames: { k1: 'Mine' } },
    { id: 2, name: 'two', namedStyleNames: { k2: 'Theirs' } },
  ];
  const sol = handMade({
    theme: { list: themes },
    layout: {
      list: [{ id: 5, name: 'L', type: 'layout' }],
      detailById: detail(5, { id: 5, name: 'L', theme: { id: 1 }, contents: { objects: [{ id: 3, type: 'text', style: 'Mine' }, { id: 4, type: 'text', style: 'Theirs' }] } }),
    },
  });
  const styles = Object.fromEntries(references(sol).filter((r) => r.kind === 'style').map((r) => [r.name, r.resolved]));
  assert.deepEqual(styles, { Mine: true, Theirs: false });
});

test('a bare field name with no occurrence (a summary) is read against its own table\'s occurrences', () => {
  const sol = handMade({
    table: { list: [{ id: 1, name: 'T' }] },
    field: {
      detailById: {
        'table:T': {
          op: {},
          readAt: null,
          result: { items: [{ id: 1, name: 'A', options: {} }, { id: 2, name: 'S', options: { fieldType: 'summary', summary: { type: 'total', field: { field: 'A' } } } }] },
        },
      },
    },
    tableOccurrence: { list: [{ id: 9, name: 'TO', table: { name: 'T', id: 1, resolved: true } }, { id: 10, name: 'TO2', table: { name: 'T', id: 1, resolved: true } }] },
  });
  const rows = references(sol).filter((r) => r.kind === 'field' && r.from.id === 'T::S');
  assert.deepEqual(rows.map((r) => r.name).sort(), ['TO2::A', 'TO::A']);
  assert.ok(rows.every((r) => r.resolved && r.how === 'named'));
});

test('a step key holding one of fm\'s own words is not a reference', () => {
  const sol = handMade({
    script: {
      list: [{ id: 1, name: 's', type: 'script' }],
      detailById: detail(1, { id: 1, name: 's', body: [{ stepID: 1, step: 'Go to Layout', target: 'currentLayout' }, { stepID: 2, step: 'Insert Text', target: '$v' }, { stepID: 3, step: 'Set Field', target: 'TO::A' }] }),
    },
  });
  const rows = references(sol).filter((r) => r.from.where.endsWith('.target'));
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.name}`), ['variable:$v', 'field:TO::A']);
});

test('references recomputes for a different solution object', () => {
  const a = handMade({});
  const b = handMade({});
  assert.notEqual(references(a), references(b));
  assert.deepEqual(references(a), []);
});
