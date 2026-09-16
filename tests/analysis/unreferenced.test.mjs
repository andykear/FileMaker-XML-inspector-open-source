// tests/analysis/unreferenced.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { unreferenced } from '../../ui/analysis/unreferenced.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);

// ── Hand-made solutions: one rule per test ────────────────────────────

/** The smallest thing the analyses accept: one file and the catalogs it read. */
function handMade(catalogs, extra = {}) {
  const empty = { list: [], listError: null, detailById: {}, ops: [], readAt: null };
  const slots = {};
  for (const c of ['table', 'tableOccurrence', 'relation', 'layout', 'script', 'valueList', 'customFunction', 'customMenu', 'theme', 'field']) {
    slots[c] = { ...empty, ...(catalogs[c] ?? {}) };
  }
  return { files: { 'file:///x.fmp12': { target: 'file:///x.fmp12', name: 'x', facts: {}, catalogs: slots } }, unreachable: [], ...extra };
}

const detail = (id, result) => ({ [String(id)]: { op: {}, readAt: null, result } });
const table = (name, items) => ({
  table: { list: [{ id: 1, name }] },
  field: { detailById: { [`table:${name}`]: { op: {}, readAt: null, result: { items } } } },
});

test('a script referenced only by a button action is not unreferenced', () => {
  const sol = handMade({
    script: { list: [{ id: 7, name: 'pressed', type: 'script' }, { id: 8, name: 'nobody calls me', type: 'script' }], detailById: { ...detail(7, { id: 7, name: 'pressed', body: [] }), ...detail(8, { id: 8, name: 'nobody calls me', body: [] }) } },
    layout: {
      list: [{ id: 5, name: 'L', type: 'layout' }],
      detailById: detail(5, { id: 5, name: 'L', contents: { objects: [{ id: 3, type: 'button', action: { step: 'Perform Script', script: 'pressed' } }] } }),
    },
  });
  assert.deepEqual(unreferenced(sol).scripts.map((r) => r.name), ['nobody calls me']);
});

test('a script that only calls itself is still unreferenced', () => {
  const sol = handMade({
    script: { list: [{ id: 7, name: 'loops', type: 'script' }], detailById: detail(7, { id: 7, name: 'loops', body: [{ stepID: 1, step: 'Perform Script', script: 'loops' }] }) },
  });
  assert.deepEqual(unreferenced(sol).scripts.map((r) => r.name), ['loops']);
});

test('a field referenced only in calculation text is text-only, one nothing names is none', () => {
  const sol = handMade({
    ...table('T', [{ id: 1, name: 'A', options: {} }, { id: 2, name: 'B', options: {} }, { id: 3, name: 'C', options: {} }]),
    tableOccurrence: { list: [{ id: 9, name: 'TO', table: { name: 'T', id: 1, resolved: true } }] },
    script: { list: [{ id: 7, name: 's', type: 'script' }], detailById: detail(7, { id: 7, name: 's', body: [{ stepID: 1, step: 'Set Variable', value: 'TO::B' }] }) },
    layout: {
      list: [{ id: 5, name: 'L', type: 'layout' }],
      detailById: detail(5, { id: 5, name: 'L', contents: { objects: [{ id: 3, type: 'field', field: { name: 'TO::C' } }] } }),
    },
  });
  assert.deepEqual(unreferenced(sol).fields.map((r) => `${r.table}::${r.field} ${r.tier}`), ['T::A none', 'T::B text-only']);
});

test('a field is unreferenced per table, not per occurrence', () => {
  // `TO2::A` names the same field `T::A` as `TO::A` does: one use, not one per occurrence.
  const sol = handMade({
    ...table('T', [{ id: 1, name: 'A', options: {} }]),
    tableOccurrence: { list: [{ id: 9, name: 'TO', table: { name: 'T', id: 1, resolved: true } }, { id: 10, name: 'TO2', table: { name: 'T', id: 1, resolved: true } }] },
    layout: {
      list: [{ id: 5, name: 'L', type: 'layout' }],
      detailById: detail(5, { id: 5, name: 'L', contents: { objects: [{ id: 3, type: 'field', field: { name: 'TO2::A' } }] } }),
    },
  });
  assert.deepEqual(unreferenced(sol).fields, []);
});

test('a calculation field that only names itself is unreferenced', () => {
  const sol = handMade({
    ...table('T', [{ id: 1, name: 'A', options: { fieldType: 'calculated', calculation: { text: 'TO::A + 1' } } }]),
    tableOccurrence: { list: [{ id: 9, name: 'TO', table: { name: 'T', id: 1, resolved: true } }] },
  });
  assert.deepEqual(unreferenced(sol).fields.map((r) => `${r.field} ${r.tier}`), ['A none']);
});

test('an occurrence used only by relations is relationship-only, one nothing names is completely-unused', () => {
  const sol = handMade({
    ...table('T', [{ id: 1, name: 'A', options: {} }]),
    tableOccurrence: {
      list: [{ id: 9, name: 'Left', table: { name: 'T', id: 1, resolved: true } }, { id: 10, name: 'Right', table: { name: 'T', id: 1, resolved: true } }, { id: 11, name: 'Lonely', table: { name: 'T', id: 1, resolved: true } }, { id: 12, name: 'OnALayout', table: { name: 'T', id: 1, resolved: true } }],
    },
    relation: { list: [{ id: 2 }], detailById: detail(2, { id: 2, left: { name: 'Left', id: 9 }, right: { name: 'Right', id: 10 }, predicates: [{ leftField: 'A', rightField: 'A', operator: 'equal' }] }) },
    layout: { list: [{ id: 5, name: 'L', type: 'layout' }], detailById: detail(5, { id: 5, name: 'L', tableOccurrence: { name: 'OnALayout', id: 12 }, contents: { objects: [] } }) },
  });
  const rows = unreferenced(sol).occurrences.map((r) => `${r.name} ${r.removability}`);
  assert.deepEqual(rows, ['Left relationship-only', 'Lonely completely-unused', 'Right relationship-only']);
});

test('a table is unreferenced when no occurrence uses it', () => {
  const sol = handMade({
    table: { list: [{ id: 1, name: 'Used' }, { id: 2, name: 'Orphan' }] },
    tableOccurrence: { list: [{ id: 9, name: 'TO', table: { name: 'Used', id: 1, resolved: true } }] },
  });
  assert.deepEqual(unreferenced(sol).tables.map((r) => r.name), ['Orphan']);
});

test('a value list used by a layout object and a custom function used in a calc are not unreferenced', () => {
  const sol = handMade({
    ...table('T', [{ id: 1, name: 'A', options: { calculation: { text: 'Used ( 1 )' } } }]),
    valueList: { list: [{ id: 1, name: 'Shown', type: 'valueList' }, { id: 2, name: 'Forgotten', type: 'valueList' }], detailById: { ...detail(1, { id: 1, name: 'Shown' }), ...detail(2, { id: 2, name: 'Forgotten' }) } },
    customFunction: { list: [{ id: 1, name: 'Used', type: 'customFunction' }, { id: 2, name: 'Unused', type: 'customFunction' }], detailById: { ...detail(1, { id: 1, name: 'Used', prototype: 'Used ( n )' }), ...detail(2, { id: 2, name: 'Unused', prototype: 'Unused ( n )' }) } },
    layout: {
      list: [{ id: 5, name: 'L', type: 'layout' }],
      detailById: detail(5, { id: 5, name: 'L', contents: { objects: [{ id: 3, type: 'field', valueList: { name: 'Shown', id: 1 } }] } }),
    },
  });
  const out = unreferenced(sol);
  assert.deepEqual(out.valueLists.map((r) => r.name), ['Forgotten']);
  assert.deepEqual(out.customFunctions.map((r) => r.name), ['Unused']);
});

test('a use of one kind is not a use of another kind with the same id', () => {
  // fm ids are unique per catalog, not across catalogs: script 1 and custom
  // function 1 are different objects and one being called says nothing about
  // the other.
  const sol = handMade({
    script: { list: [{ id: 1, name: 'called', type: 'script' }, { id: 2, name: 'caller', type: 'script' }], detailById: { ...detail(1, { id: 1, name: 'called', body: [] }), ...detail(2, { id: 2, name: 'caller', body: [{ stepID: 1, step: 'Perform Script', script: 'called' }] }) } },
    customFunction: { list: [{ id: 1, name: 'CF', type: 'customFunction' }], detailById: detail(1, { id: 1, name: 'CF', prototype: 'CF ( n )', body: '1' }) },
    valueList: { list: [{ id: 1, name: 'VL', type: 'valueList' }], detailById: detail(1, { id: 1, name: 'VL' }) },
    layout: { list: [{ id: 1, name: 'L', type: 'layout' }], detailById: detail(1, { id: 1, name: 'L', contents: { objects: [] } }) },
  });
  const out = unreferenced(sol);
  assert.deepEqual(out.scripts.map((r) => r.name), ['caller']);
  assert.deepEqual(out.customFunctions.map((r) => r.name), ['CF']);
  assert.deepEqual(out.valueLists.map((r) => r.name), ['VL']);
  assert.deepEqual(out.layouts.map((r) => r.name), ['L']);
});

test('a named style no object wears is unreferenced, with its theme and its key', () => {
  const sol = handMade({
    theme: { list: [{ id: 1, name: 'one', displayName: 'Theme One', namedStyleNames: { k1: 'Worn', k2: 'Never worn' } }] },
    layout: {
      list: [{ id: 5, name: 'L', type: 'layout' }],
      detailById: detail(5, { id: 5, name: 'L', theme: { id: 1 }, contents: { objects: [{ id: 3, type: 'text', style: 'Worn' }] } }),
    },
  });
  assert.deepEqual(unreferenced(sol).styles, [{ target: 'file:///x.fmp12', theme: 'Theme One', themeId: '1', key: 'k2', display: 'Never worn' }]);
});

test('a layout named only by a script trigger on another layout is not unreferenced', () => {
  const sol = handMade({
    layout: {
      list: [{ id: 5, name: 'Home', type: 'layout' }, { id: 6, name: 'Detail', type: 'layout' }, { id: 7, name: 'folder', type: 'folder' }],
      detailById: {
        ...detail(5, { id: 5, name: 'Home', contents: { objects: [{ id: 3, type: 'button', action: { step: 'Go to Layout', layout: 'Detail' } }] } }),
        ...detail(6, { id: 6, name: 'Detail', contents: { objects: [] } }),
      },
    },
  });
  assert.deepEqual(unreferenced(sol).layouts.map((r) => r.name), ['Home']);
});

// ── Confidence ────────────────────────────────────────────────────────

test('confidence is high when nothing in the file names anything at run time', () => {
  const sol = handMade({
    script: { list: [{ id: 7, name: 's', type: 'script' }], detailById: detail(7, { id: 7, name: 's', body: [{ stepID: 1, step: 'Set Variable', value: 'Length ( $x )' }] }) },
  });
  const c = unreferenced(sol).confidence;
  assert.equal(c.tier, 'high');
  assert.deepEqual(c.reasons, []);
  assert.ok(c.notes.some((n) => n.includes('plugin-call-sites')), 'the plug-in gap is a note, not a reason');
});

test('a GetField ( ) formula makes confidence medium and says so', () => {
  const sol = handMade({
    script: { list: [{ id: 7, name: 's', type: 'script' }], detailById: detail(7, { id: 7, name: 's', body: [{ stepID: 1, step: 'Set Variable', value: 'GetField ( $name ) & GetField ( "TO::A" )' }] }) },
  });
  const c = unreferenced(sol).confidence;
  assert.equal(c.tier, 'medium');
  assert.equal(c.reasons.length, 1);
  assert.match(c.reasons[0], /^GetField \( \) .*2 places.*1 with a non-literal argument/);
});

test('Evaluate ( ), a constructed ExecuteSQL and a name built by calculation each lower confidence', () => {
  const sol = handMade({
    script: {
      list: [{ id: 7, name: 's', type: 'script' }],
      detailById: detail(7, {
        id: 7,
        name: 's',
        body: [
          { stepID: 1, step: 'Set Variable', value: 'Evaluate ( $calc )' },
          { stepID: 2, step: 'Set Variable', value: 'ExecuteSQL ( "SELECT a FROM b" ; "" ; "" ) & ExecuteSQL ( $q ; "" ; "" )' },
          { stepID: 3, step: 'Go to Layout', layoutByCalculation: '$LayoutName' },
        ],
      }),
    },
  });
  const c = unreferenced(sol).confidence;
  assert.equal(c.tier, 'medium');
  assert.equal(c.reasons.length, 3, c.reasons.join(' | '));
  assert.ok(c.reasons.some((r) => r.startsWith('Evaluate ( )')));
  assert.ok(c.reasons.some((r) => r.startsWith('ExecuteSQL ( )') && r.includes('1 place')), c.reasons.join(' | '));
  assert.ok(c.reasons.some((r) => r.includes('layoutByCalculation')), c.reasons.join(' | '));
});

test('confidence is low when the model itself is incomplete', () => {
  const unread = handMade({ script: { listError: { code: 'x', message: 'no' } } });
  const low = unreferenced(unread).confidence;
  assert.equal(low.tier, 'low');
  assert.ok(low.reasons.some((r) => r.includes('could not be read')), low.reasons.join(' | '));

  const unreachable = handMade({}, { unreachable: [{ target: 'file:///y.fmp12', reason: 'not found' }] });
  assert.equal(unreferenced(unreachable).confidence.tier, 'low');

  const failed = handMade({ script: { list: [{ id: 7, name: 's', type: 'script' }], detailById: { 7: { op: {}, readAt: null, error: { code: 'x', message: 'no' } } } } });
  assert.equal(unreferenced(failed).confidence.tier, 'low');
});

test('unreferenced is memoised on the solution object and recomputes for another', () => {
  const a = handMade({});
  assert.equal(unreferenced(a), unreferenced(a));
  assert.notEqual(unreferenced(a), unreferenced(handMade({})));
  assert.equal(unreferenced(solution), unreferenced(solution));
});

// ── Pinned against the ooe fixture (fm 0.7.0, recorded 2026-09-16) ────
// Every number below was printed from the fixture before it was written here.

test('the count of unreferenced objects per kind on the fixture', () => {
  const out = unreferenced(solution);
  const sizes = Object.fromEntries(['fields', 'tables', 'occurrences', 'scripts', 'layouts', 'valueLists', 'customFunctions', 'styles'].map((k) => [k, out[k].length]));
  assert.deepEqual(sizes, {
    fields: 40, tables: 0, occurrences: 6, scripts: 37,
    layouts: 15, valueLists: 4, customFunctions: 6, styles: 277,
  });
  // Two files, and each list carries rows from both.
  assert.deepEqual(out.fields.reduce((o, r) => ({ ...o, [r.target]: (o[r.target] ?? 0) + 1 }), {}), {
    'fmnet://localhost/ooe': 34, 'fmnet://localhost/BrojDva': 6,
  });
});

test('the fixture\'s unreferenced fields split 34 with no reference at all, 6 named only in calculation text', () => {
  const out = unreferenced(solution);
  assert.deepEqual(out.fields.reduce((o, r) => ({ ...o, [r.tier]: (o[r.tier] ?? 0) + 1 }), {}), { none: 34, 'text-only': 6 });
  // Nothing anywhere names this one: not a layout, not a script, not a calc.
  assert.deepEqual(out.fields.find((r) => r.field === 'field_hindi'), {
    target: 'fmnet://localhost/ooe', table: 'index_languages', field: 'field_hindi',
    name: 'index_languages::field_hindi', id: 47, tier: 'none',
  });
  // A global whose only appearances are inside other fields' formulas.
  assert.equal(out.fields.find((r) => r.name === 'TestTable::MyGlobal_g').tier, 'text-only');
  assert.deepEqual(out.fields.filter((r) => r.tier === 'text-only').map((r) => r.name), [
    'Invoice::InvoiceNumber', 'Contacts::listOf_s', 'Contacts::OrderOfOperationsTest_u',
    'TestTable::field_that_contains_array', 'TestTable::field_that_contains_embedding', 'TestTable::MyGlobal_g',
  ]);
});

test('every base table on the fixture has an occurrence, and six occurrences are relationship-only', () => {
  const out = unreferenced(solution);
  assert.deepEqual(out.tables, []);
  assert.deepEqual(out.occurrences.map((r) => `${r.name} ${r.removability}`), [
    'FM26Test_Source__cartesian relationship-only',
    'FM26Test_Source__greaterThan relationship-only',
    'FM26Test_Source__greaterThanOrEqual relationship-only',
    'FM26Test_Source__lessThan relationship-only',
    'FM26Test_Source__lessThanOrEqual relationship-only',
    'FM26Test_Source__notEqual relationship-only',
  ]);
  // They join the graph on every operator but `=`, and nothing reads through them.
  assert.equal(out.occurrences[0].table, 'FM26Test_Source');
  assert.ok(out.occurrences.every((r) => r.removability !== 'completely-unused'));
});

test('one named example of each remaining kind on the fixture', () => {
  const out = unreferenced(solution);
  const named = (rows, name) => rows.find((r) => r.name === name);
  assert.deepEqual(named(out.scripts, 'New Script'), { target: 'fmnet://localhost/ooe', id: 60, name: 'New Script', folder: 'Script from fmSyntaxColorizer' });
  assert.deepEqual(named(out.layouts, 'index_languages'), { target: 'fmnet://localhost/ooe', id: 29, name: 'index_languages', folder: '' });
  assert.deepEqual(named(out.valueLists, 'from_another_file_two'), { target: 'fmnet://localhost/ooe', id: 7, name: 'from_another_file_two', folder: undefined });
  assert.deepEqual(named(out.customFunctions, 'MyCustomFunction'), { target: 'fmnet://localhost/ooe', id: 1, name: 'MyCustomFunction', folder: '' });
  assert.ok(out.styles.some((r) => r.theme === 'MyCustomTheme' && r.display === 'Alternating' && r.key === 'alternating_part'));
  // What IS used stays out of every list: three custom functions, a style an
  // object wears, the scripts a trigger and a step name.
  assert.ok(!named(out.customFunctions, 'GFN') && !named(out.customFunctions, 'GTN') && !named(out.customFunctions, 'GetExternalContainerPath'));
  assert.ok(!out.styles.some((r) => r.display === 'MyCustomStyle_BoldItalicsLabel'));
  assert.ok(!named(out.scripts, 'noop') && !named(out.layouts, 'Contacts'));
});

test('confidence on the fixture is low, because two files could not be reached', () => {
  const c = unreferenced(solution).confidence;
  assert.equal(c.tier, 'low');
  assert.deepEqual(c.reasons, [
    '2 files could not be reached, so a reference from another file cannot be seen.',
    'GetField ( ) / GetFieldName ( ) in 10 places (10 with a non-literal argument): the field is named by text the reference scan does not follow.',
    'ExecuteSQL ( ) with a constructed query in 1 place: an identifier built from variables cannot be read.',
    'A script, layout or object named by calculation in 63 places (fileName, layoutByCalculation, layoutName, objectName, scriptName): fm reports these keys as calculation text, so the name is not a name the scan can match.',
  ]);
  // The 63 calculated names are the same 63 keys Task 1 measured and chose not
  // to read as names: the two modules agree about what fm does not say.
  assert.equal(solution.unreachable.length, 2);
  assert.equal(c.notes.length, 3);
});

test('every row says which file it came from', () => {
  const out = unreferenced(solution);
  for (const key of ['fields', 'tables', 'occurrences', 'scripts', 'layouts', 'valueLists', 'customFunctions', 'styles']) {
    assert.ok(out[key].every((r) => typeof r.target === 'string' && r.target.length > 0), `${key} rows carry a target`);
  }
});
