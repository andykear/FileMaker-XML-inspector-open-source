// tests/analysis/globals.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { GLOBALS_NOTE, globals } from '../../ui/analysis/globals.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const ROOT = api.meta.root;

function oneFile(target, name, catalogs) {
  const empty = { list: [], listError: null, detailById: {}, ops: [], readAt: null };
  const slots = {};
  for (const c of ['externalDataSource', 'table', 'tableOccurrence', 'relation', 'layout', 'script', 'valueList', 'customFunction', 'customMenu', 'theme', 'field']) {
    slots[c] = { ...empty, ...(catalogs[c] ?? {}) };
  }
  return { target, name, facts: {}, catalogs: slots };
}
const handMade = (catalogs) => ({ files: { 'file:///x.fmp12': oneFile('file:///x.fmp12', 'x', catalogs) }, unreachable: [] });
const detail = (id, result) => ({ [String(id)]: { op: {}, readAt: null, result } });
const step = (stepID, stepName, rest = {}) => ({ stepID, step: stepName, uuid: `u${stepID}`, ...rest });
const SET_VARIABLE = 141;
const oneScript = (body, name = 'S', id = 7) => handMade({
  script: { list: [{ id, name, type: 'script' }], detailById: detail(id, { id, name, body }) },
});

test('globals is memoised, frozen and recomputes for another solution', () => {
  assert.equal(globals(solution), globals(solution));
  const a = oneScript([]);
  const b = oneScript([]);
  assert.notEqual(globals(a), globals(b));
  assert.deepEqual(globals(a), []);
  assert.ok(Object.isFrozen(globals(a)));
  assert.throws(() => globals(a).push({}), TypeError);
});

test('the note names the register entry, and the names the tokeniser cannot read whole', () => {
  assert.match(GLOBALS_NOTE, /calculation-tokens/);
  // A `$$` name with a space in it -- FileMaker allows `$$SMTP Server`, and the
  // register's own probe for `calculation-tokens` uses exactly that -- tokenises
  // as its first word, so such a global is listed twice. The note says so.
  assert.match(GLOBALS_NOTE, /space/);
  assert.match(GLOBALS_NOTE, /\$\$SMTP Server/);
});

test('a global set by a Set Variable carries the set site; a local is not a global', () => {
  const sol = oneScript([
    step(SET_VARIABLE, 'Set Variable', { name: '$$g', value: '"one"' }),
    step(SET_VARIABLE, 'Set Variable', { name: '$local', value: '"two"' }),
  ]);
  const rows = globals(sol);
  assert.deepEqual(rows.map((r) => r.name), ['$$g']);
  assert.deepEqual(rows[0].sets, [{
    target: 'file:///x.fmp12', script: { id: 7, name: 'S' }, step: { index: 0, line: 1, stepID: SET_VARIABLE },
  }]);
  assert.deepEqual(rows[0].files, ['file:///x.fmp12']);
});

test('a global nothing sets is still listed, with its mentions', () => {
  const sol = oneScript([step(SET_VARIABLE, 'Set Variable', { name: '$x', value: '$$never_set & "!"' })]);
  const rows = globals(sol);
  assert.deepEqual(rows.map((r) => [r.name, r.sets.length, r.mentions]), [['$$never_set', 0, 1]]);
});

test('a set counts as a mention of its own target, so mentions equal sets when nothing reads it', () => {
  const sol = oneScript([step(SET_VARIABLE, 'Set Variable', { name: '$$g', value: '"one"' })]);
  assert.deepEqual(globals(sol).map((r) => [r.name, r.sets.length, r.mentions]), [['$$g', 1, 1]]);
});

test('one variable however it is spelled, and a disabled step sets nothing', () => {
  const sol = oneScript([
    step(SET_VARIABLE, 'Set Variable', { name: '$$G', value: '"one"' }),
    step(SET_VARIABLE, 'Set Variable', { name: '$$g', value: '"two"', disabled: true }),
    step(SET_VARIABLE, 'Set Variable', { name: '$x', value: '$$g' }),
  ]);
  const rows = globals(sol);
  assert.deepEqual(rows.map((r) => [r.name, r.sets.length]), [['$$G', 1]]);
  assert.deepEqual(rows[0].sets.map((s) => s.step.index), [0]);
});

test('globals are listed by name, once, with every file that mentions one', () => {
  const files = {
    'file:///a.fmp12': oneFile('file:///a.fmp12', 'a', {
      script: { list: [{ id: 1, name: 'sa', type: 'script' }], detailById: detail(1, { id: 1, name: 'sa', body: [step(SET_VARIABLE, 'Set Variable', { name: '$$b', value: '"x"' })] }) },
    }),
    'file:///b.fmp12': oneFile('file:///b.fmp12', 'b', {
      script: { list: [{ id: 1, name: 'sb', type: 'script' }], detailById: detail(1, { id: 1, name: 'sb', body: [step(SET_VARIABLE, 'Set Variable', { name: '$$a', value: '$$b' })] }) },
    }),
  };
  const rows = globals({ files, unreachable: [] });
  assert.deepEqual(rows.map((r) => r.name), ['$$a', '$$b']);
  assert.deepEqual(rows.find((r) => r.name === '$$b').files, ['file:///a.fmp12', 'file:///b.fmp12']);
});

// ── The fixture: measured first, then pinned ──────────────────────────

test('the ooe fixture: three globals, one of them ever set', () => {
  const rows = globals(solution);
  assert.deepEqual(rows.map((r) => [r.name, r.sets.length, r.mentions, r.files]), [
    ['$$my_var_global', 0, 3, [ROOT]],
    ['$$some_global_var', 0, 2, [ROOT]],
    ['$$var', 1, 1, [ROOT]],
  ]);
  // The one set: the Set Variable target fm writes under `name`.
  assert.deepEqual(rows[2].sets, [{
    target: ROOT,
    script: { id: 55, name: 'All script steps and all options 20260318' },
    step: { index: 117, line: 118, stepID: 141 },
  }]);
  // $$var's only mention is that set: written once, read nowhere. The other
  // two are the opposite -- read in three and two calculations, set nowhere in
  // the solution the read reached.
  assert.equal(rows[2].mentions, rows[2].sets.length);
});

test('a set site carries FileMaker\'s own 1-based line beside the body index', () => {
  const sol = oneScript([
    step(1, 'Comment', {}),
    step(SET_VARIABLE, 'Set Variable', { name: '$$g', value: '"one"' }),
  ]);
  assert.deepEqual(globals(sol)[0].sets.map((s) => [s.step.index, s.step.line]), [[1, 2]]);
  // On the fixture too.
  assert.ok(globals(solution).every((r) => r.sets.every((s) => s.step.line === s.step.index + 1)));
});
