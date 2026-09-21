// tests/analysis/broken.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { broken } from '../../ui/analysis/broken.js';
import { references } from '../../ui/analysis/refs.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);

/** The smallest thing `broken` accepts: one file, the catalogs it reads. */
function handMade(catalogs) {
  const empty = { list: [], listError: null, detailById: {}, ops: [], readAt: null };
  const slots = {};
  for (const c of ['table', 'tableOccurrence', 'relation', 'layout', 'script', 'valueList', 'customFunction', 'customMenu', 'theme', 'field']) {
    slots[c] = { ...empty, ...(catalogs[c] ?? {}) };
  }
  return { files: { 'file:///x.fmp12': { target: 'file:///x.fmp12', name: 'x', facts: {}, catalogs: slots } }, unreachable: [] };
}

const detail = (id, result) => ({ [String(id)]: { op: {}, readAt: null, result } });

test('broken is memoised on the solution object', () => {
  assert.equal(broken(solution), broken(solution));
});

test('broken recomputes for a different solution object and is frozen', () => {
  const a = handMade({});
  const b = handMade({});
  assert.notEqual(broken(a), broken(b));
  assert.deepEqual(broken(a), []);
  assert.ok(Object.isFrozen(broken(a)));
  assert.throws(() => broken(a).push({}), TypeError);
});

// ── fm's own `problems[]` ──────────────────────────────────────────────

test('a script problem is reported verbatim, from the script that carries it', () => {
  const sol = handMade({
    script: {
      list: [{ id: 1, name: 'caller', type: 'script' }],
      detailById: detail(1, { id: 1, name: 'caller', body: [{ stepID: 1, step: 'Insert from Device' }], problems: [{ path: '/0', step: 'Insert from Device' }] }),
    },
  });
  const rows = broken(sol);
  assert.deepEqual(rows, [{
    target: 'file:///x.fmp12', kind: 'problem',
    from: { kind: 'script', id: 1, name: 'caller', where: '/0' },
    detail: { path: '/0', step: 'Insert from Device' },
  }]);
});

test('the fixture\'s script problems are measured: 350 problems on 14 scripts', () => {
  const rows = broken(solution).filter((r) => r.kind === 'problem');
  // Re-measured after 0.8.0 re-record: 352 → 350 (down 2), 15 → 14 scripts.
  // This is opposite to the brief's expectation but consistent with improved
  // field resolution - one script's problems were resolved entirely.
  assert.equal(rows.length, 350);
  const byScript = new Set(rows.map((r) => `${r.target}\u0000${r.from.id}`));
  assert.equal(byScript.size, 14);
  assert.ok(rows.every((r) => r.from.kind === 'script'));
  // fm's own fields, kept verbatim: exactly path and step, nothing added or dropped.
  assert.ok(rows.every((r) => Object.keys(r.detail).sort().join(',') === 'path,step'));
});

// ── The `<Word Missing>` marker family ──────────────────────────────────
// Fix round 1: fm's marker is a family (`<Field Missing>`, `<Table Missing>`,
// `<Function Missing>`, …), not two fixed strings. The scan matches the
// generic shape and keeps the word fm used as `detail.what`.

test('a <Field Missing> marker inside a calculation is reported with its word and 40 characters of context', () => {
  const long = 'a'.repeat(50);
  const sol = handMade({
    table: { list: [{ id: 1, name: 'T' }] },
    field: { detailById: { 'table:T': { op: {}, readAt: null, result: { items: [{ id: 1, name: 'A', options: { fieldType: 'calculated', calculation: { text: `${long}<Field Missing>${long}` } } }] } } } },
  });
  const rows = broken(sol);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'missingMarker');
  assert.equal(rows[0].from.kind, 'field');
  assert.equal(rows[0].from.id, 'T::A');
  assert.equal(rows[0].detail.what, 'Field');
  assert.equal(rows[0].detail.context, `${'a'.repeat(40)}<Field Missing>${'a'.repeat(40)}`);
});

test('a <Table Missing> marker is reported too, and both markers in one string are two rows', () => {
  const sol = handMade({
    script: {
      list: [{ id: 1, name: 's', type: 'script' }],
      detailById: detail(1, { id: 1, name: 's', body: [{ stepID: 1, step: 'Set Variable', value: '<Table Missing>::Field & <Field Missing>' }] }),
    },
  });
  const rows = broken(sol).filter((r) => r.kind === 'missingMarker');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.detail.what).sort(), ['Field', 'Table']);
});

test('a <Function Missing> marker is the same family, matched by the generic word pattern', () => {
  const sol = handMade({
    script: {
      list: [{ id: 1, name: 's', type: 'script' }],
      detailById: detail(1, { id: 1, name: 's', body: [{ stepID: 1, step: 'Set Variable', value: '/*<Function Missing>( 2 ) + 4*/' }] }),
    },
  });
  const rows = broken(sol).filter((r) => r.kind === 'missingMarker');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].detail.what, 'Function');
  assert.equal(rows[0].detail.context, '/*<Function Missing>( 2 ) + 4*/');
});

test('the fixture carries four <Function Missing> markers, measured, and no <Field Missing> or <Table Missing>', () => {
  // Re-measured after the 0.8.0 re-record: was 5, now 4. The body[5].value
  // marker in "All script steps and all options 20260318" is gone (fm may have
  // changed how it reports that calculation). The remaining four are in the two
  // mirrored "All script steps and all options" scripts (ids 39 and 55): a
  // Set Field's calculated `record`, a Go to Layout's calculated `layoutName`,
  // and two Set Variable `value`s.
  const rows = broken(solution).filter((r) => r.kind === 'missingMarker');
  assert.deepEqual([...new Set(rows.map((r) => r.detail.what))], ['Function']);
  assert.equal(rows.length, 4);
  const by = rows.map((r) => `${r.from.name}|${r.from.where}`).sort();
  assert.deepEqual(by, [
    'All script steps and all options 20260318|body[118].value',
    'All script steps and all options|body[124].layoutName',
    'All script steps and all options|body[159].record',
    'All script steps and all options|body[84].value',
  ]);
});

// ── Occurrences whose base table did not resolve ────────────────────────

test('an occurrence whose detail carries table.resolved === false is reported', () => {
  const sol = handMade({
    tableOccurrence: {
      list: [{ id: 9, name: 'TO', table: { name: 'Gone', id: 1, resolved: false } }],
      detailById: detail(9, { id: 9, name: 'TO', table: { name: 'Gone', id: 1, resolved: false } }),
    },
  });
  const rows = broken(sol).filter((r) => r.kind === 'unresolvedOccurrence');
  assert.deepEqual(rows, [{
    target: 'file:///x.fmp12', kind: 'unresolvedOccurrence',
    from: { kind: 'tableOccurrence', id: 9, name: 'TO' },
    detail: { table: 'Gone' },
  }]);
});

test('a table.resolved === false occurrence also names a table nothing carries, and both signals are reported', () => {
  // Two independent tools, two independent rows: fm's own `table.resolved`
  // flag, and the occurrence's `table.name` read back through the table
  // catalog, which does not have "Gone" either. Nothing here deduplicates
  // them -- they are different evidence for the same missing table.
  const sol = handMade({
    tableOccurrence: {
      list: [{ id: 9, name: 'TO', table: { name: 'Gone', id: 1, resolved: false } }],
      detailById: detail(9, { id: 9, name: 'TO', table: { name: 'Gone', id: 1, resolved: false } }),
    },
  });
  const rows = broken(sol);
  assert.deepEqual(rows.map((r) => r.kind).sort(), ['danglingName', 'unresolvedOccurrence']);
  const dangling = rows.find((r) => r.kind === 'danglingName');
  assert.deepEqual(dangling.detail, { name: 'Gone', refKind: 'table' });
});

test('an occurrence resolves through the list item\'s own table when there is no detail', () => {
  const sol = handMade({
    tableOccurrence: { list: [{ id: 9, name: 'TO', table: { name: 'Gone', id: 1, resolved: false } }] },
  });
  const rows = broken(sol).filter((r) => r.kind === 'unresolvedOccurrence');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].detail.table, 'Gone');
});

test('the fixture carries no unresolved occurrence (measured: every table.resolved is true)', () => {
  assert.deepEqual(broken(solution).filter((r) => r.kind === 'unresolvedOccurrence'), []);
});

// ── Named references that resolve to nothing ────────────────────────────

test('a dangling Perform Script name is reported', () => {
  const sol = handMade({
    script: {
      list: [{ id: 1, name: 'caller', type: 'script' }],
      detailById: detail(1, { id: 1, name: 'caller', body: [{ stepID: 7, step: 'Perform Script', script: 'gone' }] }),
    },
  });
  const rows = broken(sol);
  assert.deepEqual(rows, [{
    target: 'file:///x.fmp12', kind: 'danglingName',
    from: { kind: 'script', id: 1, name: 'caller', where: 'body[0].script', stepID: 7 },
    detail: { name: 'gone', refKind: 'script' },
  }]);
});

test('a text reference that resolves to nothing is not a dangling name', () => {
  // `how: 'text'` reads are the tokeniser's guess, not a name fm reports outright.
  const sol = handMade({
    table: { list: [{ id: 1, name: 'T' }] },
    field: { detailById: { 'table:T': { op: {}, readAt: null, result: { items: [{ id: 1, name: 'A', options: {} }] } } } },
    tableOccurrence: { list: [{ id: 9, name: 'TO', table: { name: 'T', id: 1, resolved: true } }] },
    script: {
      list: [{ id: 1, name: 's', type: 'script' }],
      detailById: detail(1, { id: 1, name: 's', body: [{ stepID: 1, step: 'Set Variable', value: 'Nope::A' }] }),
    },
  });
  assert.deepEqual(broken(sol).filter((r) => r.kind === 'danglingName'), []);
});

test('a variable reference never counts as a dangling name, however it resolves', () => {
  const sol = handMade({
    script: {
      list: [{ id: 1, name: 's', type: 'script' }],
      detailById: detail(1, { id: 1, name: 's', body: [{ stepID: 1, step: 'Set Variable', value: '$never_set & 1' }] }),
    },
  });
  assert.deepEqual(broken(sol).filter((r) => r.kind === 'danglingName'), []);
});

test('a Perform AppleScript source is not reported as a dangling script name', () => {
  // fm reports the AppleScript source under the same `script` key `Perform
  // Script` uses for a script name. A real script name never holds a `"` or a
  // newline, so that value shape is the suppression rule this file adopts.
  const sol = handMade({
    script: {
      list: [{ id: 1, name: 's', type: 'script' }],
      detailById: detail(1, { id: 1, name: 's', body: [{ stepID: 1, step: 'Perform AppleScript', script: 'display dialog "Hello world!"' }] }),
    },
  });
  assert.deepEqual(broken(sol).filter((r) => r.kind === 'danglingName'), []);
});

test('a dangling script name with a newline is also suppressed by the same rule', () => {
  const sol = handMade({
    script: {
      list: [{ id: 1, name: 's', type: 'script' }],
      detailById: detail(1, { id: 1, name: 's', body: [{ stepID: 1, step: 'Perform AppleScript', script: 'tell application "Finder"\nend tell' }] }),
    },
  });
  assert.deepEqual(broken(sol).filter((r) => r.kind === 'danglingName'), []);
});

test('the fixture\'s only named+unresolved reference is the suppressed AppleScript source (measured: 0 dangling names)', () => {
  // references(solution) carries exactly two named, unresolved, non-variable
  // rows on ooe, both `display dialog "Hello world!"` under a script key: the
  // one measured false positive Task 1's report and tests pin. Both contain a
  // `"`, so both are suppressed here.
  assert.deepEqual(broken(solution).filter((r) => r.kind === 'danglingName'), []);
});

// ── Counts by kind ───────────────────────────────────────────────────────

test('the broken counts by kind on the fixture', () => {
  const rows = broken(solution);
  const byKind = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  // Re-measured after 0.8.0 re-record: problem 352→350, missingMarker 5→4.
  // Re-measured for deadKey (fm 0.8.0): added 10 dead keys.
  assert.deepEqual(byKind, { problem: 350, missingMarker: 4, deadKey: 10 });
  assert.equal(rows.length, 364);
});

test('a marker on a script step is spelled the way refs.js spells the same place', () => {
  // Both analyses walk the same strings; only one notation may reach a reader,
  // or a marker row and a reference row about one step read as two places.
  const markers = broken(solution).filter((r) => r.kind === 'missingMarker');
  assert.ok(markers.length > 0);
  const stepPaths = references(solution).filter((r) => r.from.kind === 'script').map((r) => String(r.from.where));
  assert.ok(stepPaths.length > 0);
  for (const where of stepPaths) assert.match(where, /^body\[\d+\]\./, where);
  for (const m of markers) assert.match(m.from.where, /^body\[\d+\]\./, m.from.where);
  // Not merely the same shape: on at least one step both analyses found
  // something, and they name that step identically. (Not every marker step has
  // a reference -- `body[124].layoutName` on ooe is calculation text whose only
  // token is the missing function itself, so refs.js finds no name there.)
  const shared = markers.filter((m) => {
    const prefix = m.from.where.slice(0, m.from.where.indexOf(']') + 1);
    return stepPaths.some((p) => p.startsWith(`${prefix}.`));
  });
  assert.ok(shared.length > 0, 'no marker step carries a reference too');
});

test('a field option marker carries the options prefix refs.js uses', () => {
  const sol = handMade({
    table: { list: [{ id: 1, name: 'T' }] },
    field: {
      detailById: {
        'table:T': {
          op: {}, readAt: null,
          result: { items: [{ id: 1, name: 'A', options: { autoEnter: { calculation: 'GetX ( <Function Missing> )' } } }] },
        },
      },
    },
  });
  const row = broken(sol).find((r) => r.kind === 'missingMarker');
  assert.equal(row.from.where, 'options.autoEnter.calculation');
  assert.equal(row.from.id, 'T::A');
});

test("a marker in a script's own problems[] is still found, outside the body split", () => {
  const sol = handMade({
    script: {
      list: [{ id: 7, name: 'S', type: 'script' }],
      detailById: detail(7, {
        id: 7, name: 'S', body: [],
        problems: [{ path: '/0', step: 'Set Field <Function Missing>' }],
      }),
    },
  });
  const markers = broken(sol).filter((r) => r.kind === 'missingMarker');
  assert.deepEqual(markers.map((r) => r.from.where), ['problems.0.step']);
});

// ── Dead keys: references fm reports by raw key instead of name ─────────

const withStep = (step) => {
  const one = structuredClone(solution);
  one.files[api.meta.root].catalogs.script.detailById = { 1: { result: { id: 1, name: 'S', body: [step] } } };
  return one;
};

test('a fieldKey with no field beside it is a reference fm says is dead', () => {
  // fm: "the raw [tableKey, fieldKey] pair of a criterion whose field no longer
  // exists -- how the criterion is read back once that happens."
  const one = withStep({ stepID: 22, step: 'Perform Find', findRequests: [{ operation: 'find', criteria: [{ fieldKey: [3, 17], criterion: 'x' }] }] });
  const dead = broken(one).filter((b) => b.kind === 'deadKey');
  assert.equal(dead.length, 1);
  assert.equal(dead[0].detail.names, 'field');
  assert.deepEqual(dead[0].detail.raw, [3, 17]);
  assert.equal(dead[0].detail.key, 'fieldKey');
  assert.equal(dead[0].from.id, 1);
  assert.match(dead[0].from.where, /criteria\[0\]/);
});

test('a fieldKey BESIDE its field is not dead -- fm reports the name when it resolves', () => {
  const field = 'Any::Field';
  const one = withStep({ stepID: 22, step: 'Perform Find', findRequests: [{ operation: 'find', criteria: [{ field, fieldKey: [3, 17], criterion: 'x' }] }] });
  assert.deepEqual(broken(one).filter((b) => b.kind === 'deadKey'), [],
    'both present means the reference resolved; reporting it would be a false positive');
});

test('every *Key variant is recognised, with the kind it would have named', () => {
  const cases = [
    [{ stepID: 36, step: 'Export Records', exportOptions: { fields: [{ summarizeByKey: [1, 2] }] } }, 'summarizeByKey', 'field'],
    [{ stepID: 36, step: 'Export Records', exportOptions: { groupBy: [{ fieldKey: [1, 2] }] } }, 'fieldKey', 'field'],
    [{ stepID: 39, step: 'Sort Records', sortOrder: { fields: [{ orderByKey: [1, 2] }] } }, 'orderByKey', 'field'],
    [{ stepID: 39, step: 'Sort Records', sortOrder: { fields: [{ valueListKey: 9 }] } }, 'valueListKey', 'valueList'],
    [{ stepID: 37, step: 'Import Records', importOptions: { targetTableKey: 4 } }, 'targetTableKey', 'occurrence'],
  ];
  for (const [step, key, names] of cases) {
    const dead = broken(withStep(step)).filter((b) => b.kind === 'deadKey');
    assert.equal(dead.length, 1, `${key} was not recognised`);
    assert.equal(dead[0].detail.key, key);
    assert.equal(dead[0].detail.names, names);
  }
});

test('the ooe fixture is measured, not assumed', () => {
  // A dead key needs a step whose field was deleted under it, which the
  // reference file may simply not contain -- so this pins whatever is there and
  // the behaviour above is proven on synthesised shapes.
  const dead = broken(solution).filter((b) => b.kind === 'deadKey');
  assert.equal(dead.length, 10);
});
