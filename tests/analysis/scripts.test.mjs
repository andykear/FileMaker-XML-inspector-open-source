// tests/analysis/scripts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { references } from '../../ui/analysis/refs.js';
import { PSOS_ONLY_STEPS, callGraph, callTreeOf, scriptIssues, scriptKey } from '../../ui/analysis/scripts.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const ROOT = api.meta.root;

// ── Hand-made solutions: one rule per test ────────────────────────────

/** The smallest thing the analyses accept: one file and the catalogs it read. */
function oneFile(target, name, catalogs) {
  const empty = { list: [], listError: null, detailById: {}, ops: [], readAt: null };
  const slots = {};
  for (const c of ['externalDataSource', 'table', 'tableOccurrence', 'relation', 'layout', 'script', 'valueList', 'customFunction', 'customMenu', 'theme', 'field']) {
    slots[c] = { ...empty, ...(catalogs[c] ?? {}) };
  }
  return { target, name, facts: {}, catalogs: slots };
}

function handMade(catalogs) {
  return { files: { 'file:///x.fmp12': oneFile('file:///x.fmp12', 'x', catalogs) }, unreachable: [] };
}

const detail = (id, result) => ({ [String(id)]: { op: {}, readAt: null, result } });

/** One script, one body: the shape every check is measured on. */
function oneScript(body, name = 'S', id = 7) {
  return handMade({
    script: { list: [{ id, name, type: 'script' }], detailById: detail(id, { id, name, body }) },
  });
}

const checksOf = (sol, check) => scriptIssues(sol).filter((r) => r.check === check);
const step = (stepID, stepName, rest = {}) => ({ stepID, step: stepName, uuid: `u${stepID}`, ...rest });

// The step ids the hand-made bodies use, fm's own numbering (see PSOS_ONLY_STEPS).
const PERFORM_SCRIPT = 1;
const LOOP = 71;
const END_LOOP = 73;
const ALLOW_USER_ABORT = 85;
const SET_ERROR_CAPTURE = 86;
const SET_VARIABLE = 141;
const SET_WEB_VIEWER = 146; // on the PSoS-incompatible list
const INSERT_FROM_URL = 160;
const COMMIT = 75; // not on the list

// ── The list itself ───────────────────────────────────────────────────

test('scriptIssues is memoised, frozen and recomputes for another solution', () => {
  assert.equal(scriptIssues(solution), scriptIssues(solution));
  const a = oneScript([]);
  const b = oneScript([]);
  assert.notEqual(scriptIssues(a), scriptIssues(b));
  assert.deepEqual(scriptIssues(a), []);
  assert.ok(Object.isFrozen(scriptIssues(a)));
  assert.throws(() => scriptIssues(a).push({}), TypeError);
});

test('every issue says which script, which step and which fm keys decided it', () => {
  const rows = scriptIssues(oneScript([step(SET_WEB_VIEWER, 'Set Web Viewer', { objectName: '"wv"' })]));
  assert.deepEqual(rows, [{
    target: 'file:///x.fmp12',
    script: { id: 7, name: 'S' },
    step: { index: 0, line: 1, stepID: SET_WEB_VIEWER, step: 'Set Web Viewer' },
    check: 'psos-only-step',
    detail: { step: 'Set Web Viewer' },
    keys: ['stepID'],
  }]);
});

// ── dead-set-variable ─────────────────────────────────────────────────

test('a local set and never mentioned again is dead; one mentioned later is not', () => {
  const dead = oneScript([
    step(SET_VARIABLE, 'Set Variable', { name: '$x', value: '"one"' }),
    step(COMMIT, 'Commit Records/Requests'),
  ]);
  assert.deepEqual(checksOf(dead, 'dead-set-variable').map((r) => r.detail), [{ variable: '$x' }]);
  const alive = oneScript([
    step(SET_VARIABLE, 'Set Variable', { name: '$x', value: '"one"' }),
    step(SET_VARIABLE, 'Set Variable', { name: '$y', value: '$x & "!"' }),
    step(COMMIT, 'Commit Records/Requests'),
  ]);
  assert.deepEqual(checksOf(alive, 'dead-set-variable').map((r) => r.detail), [{ variable: '$y' }]);
});

test('a local mentioned only inside a quoted literal is not called dead', () => {
  const sol = oneScript([
    step(SET_VARIABLE, 'Set Variable', { name: '$x', value: '"one"' }),
    step(SET_VARIABLE, 'Set Variable', { name: '$y', value: 'Evaluate ( "$x" )' }),
  ]);
  assert.deepEqual(checksOf(sol, 'dead-set-variable').map((r) => r.detail.variable), ['$y']);
});

test('a global is never a dead local, and case does not hide a mention', () => {
  const sol = oneScript([
    step(SET_VARIABLE, 'Set Variable', { name: '$$g', value: '"one"' }),
    step(SET_VARIABLE, 'Set Variable', { name: '$X', value: '"two"' }),
    step(COMMIT, 'Commit Records/Requests', { name: '$x' }),
  ]);
  assert.deepEqual(checksOf(sol, 'dead-set-variable'), []);
});

test('a mention that only a disabled step makes is not a mention', () => {
  const sol = oneScript([
    step(SET_VARIABLE, 'Set Variable', { name: '$x', value: '"one"' }),
    step(COMMIT, 'Commit Records/Requests', { name: '$x', disabled: true }),
  ]);
  assert.deepEqual(checksOf(sol, 'dead-set-variable').map((r) => r.detail.variable), ['$x']);
});

test('a disabled Set Variable is not reported at all', () => {
  const sol = oneScript([step(SET_VARIABLE, 'Set Variable', { name: '$x', value: '"one"', disabled: true })]);
  assert.deepEqual(scriptIssues(sol), []);
});

// ── embedded-credential ───────────────────────────────────────────────

test('a credential key holding a literal is reported; one holding a variable or a field is not', () => {
  const sol = oneScript([
    step(189, 'Send Mail', { smtpPassword: '"hunter2"' }),
    step(189, 'Send Mail', { smtpPassword: '$password' }),
    step(189, 'Send Mail', { smtpPassword: 'Contacts::Secret' }),
    step(189, 'Send Mail', { smtpPassword: 'Get ( ScriptParameter )' }),
    step(189, 'Send Mail', { smtpPassword: '""' }),
  ]);
  const rows = checksOf(sol, 'embedded-credential');
  assert.deepEqual(rows.map((r) => r.step.index), [0]);
  assert.deepEqual(rows[0].detail, { key: 'smtpPassword', where: 'smtpPassword', characters: 7 });
  assert.deepEqual(rows[0].keys, ['smtpPassword']);
});

test('every credential-shaped key counts, however deep and however spelled', () => {
  const sol = oneScript([
    step(1, 'Insert from URL', { curlOptions: '"--user x:y"', apiKey: '"sk-1"' }),
    step(1, 'Configure AI Account', { options: { clientSecret: '"cs"', oauthPrivateKey: '"pk"' } }),
  ]);
  const rows = checksOf(sol, 'embedded-credential');
  assert.deepEqual(rows.map((r) => r.detail.where), ['apiKey', 'options.clientSecret', 'options.oauthPrivateKey']);
});

// ── literal-account ───────────────────────────────────────────────────

test('an account name written as a literal is reported, with the step that wrote it', () => {
  const sol = oneScript([
    step(134, 'Add Account', { account: '"admin"', password: '$pw' }),
    step(134, 'Add Account', { account: '$Kontoname', password: '$pw' }),
    step(222, 'Configure AI Account', { account: '"my-ai"', apiKey: '$key' }),
  ]);
  const rows = checksOf(sol, 'literal-account');
  assert.deepEqual(rows.map((r) => r.step.index), [0, 2]);
  assert.deepEqual(rows[0].detail, { key: 'account', where: 'account', account: 'admin', step: 'Add Account' });
  // The step name is the whole point of the rename: the same key on an AI step
  // is an AI account, not a login, and the row says so without guessing.
  assert.deepEqual(rows[1].detail, { key: 'account', where: 'account', account: 'my-ai', step: 'Configure AI Account' });
});

// ── psos-only-step ────────────────────────────────────────────────────

test('the PSoS list is fm step ids and only server-incompatible ones', () => {
  assert.equal(PSOS_ONLY_STEPS[SET_WEB_VIEWER], 'Set Web Viewer');
  assert.equal(PSOS_ONLY_STEPS[PERFORM_SCRIPT], undefined);
  assert.equal(Object.keys(PSOS_ONLY_STEPS).length, 83);
  assert.ok(Object.isFrozen(PSOS_ONLY_STEPS));
});

test('a step on the list is reported by id, a step off it is not, a disabled one is not', () => {
  const sol = oneScript([
    step(SET_WEB_VIEWER, 'Set Web Viewer'),
    step(COMMIT, 'Commit Records/Requests'),
    step(SET_WEB_VIEWER, 'Set Web Viewer', { disabled: true }),
  ]);
  assert.deepEqual(checksOf(sol, 'psos-only-step').map((r) => r.step.index), [0]);
});

// ── swallowed-error ───────────────────────────────────────────────────

test('Set Error Capture [On] with no later Get ( LastError ) is swallowed', () => {
  const swallowed = oneScript([
    step(SET_ERROR_CAPTURE, 'Set Error Capture', { on: true }),
    step(COMMIT, 'Commit Records/Requests'),
  ]);
  assert.deepEqual(checksOf(swallowed, 'swallowed-error').map((r) => r.step.index), [0]);
  assert.deepEqual(checksOf(swallowed, 'swallowed-error')[0].detail, { missing: 'Get ( LastError )' });
  const checked = oneScript([
    step(SET_ERROR_CAPTURE, 'Set Error Capture', { on: true }),
    step(SET_VARIABLE, 'Set Variable', { name: '$e', value: 'Get(LastError)' }),
  ]);
  assert.deepEqual(checksOf(checked, 'swallowed-error'), []);
});

test('an error read BEFORE the capture is turned on does not count, and [Off] is not a swallow', () => {
  const before = oneScript([
    step(SET_VARIABLE, 'Set Variable', { name: '$e', value: 'Get ( LastError )' }),
    step(SET_ERROR_CAPTURE, 'Set Error Capture', { on: true }),
  ]);
  assert.deepEqual(checksOf(before, 'swallowed-error').map((r) => r.step.index), [1]);
  const off = oneScript([step(SET_ERROR_CAPTURE, 'Set Error Capture', { on: false })]);
  assert.deepEqual(checksOf(off, 'swallowed-error'), []);
});

// ── unguarded-abort-off ───────────────────────────────────────────────

test('Allow User Abort [Off] with no Set Error Capture anywhere is unguarded', () => {
  const unguarded = oneScript([
    step(ALLOW_USER_ABORT, 'Allow User Abort', { on: false }),
    step(COMMIT, 'Commit Records/Requests'),
  ]);
  assert.deepEqual(checksOf(unguarded, 'unguarded-abort-off').map((r) => r.step.index), [0]);
  assert.deepEqual(checksOf(unguarded, 'unguarded-abort-off')[0].detail, { missing: 'Set Error Capture' });
  const guarded = oneScript([
    step(ALLOW_USER_ABORT, 'Allow User Abort', { on: false }),
    step(SET_ERROR_CAPTURE, 'Set Error Capture', { on: true }),
    step(SET_VARIABLE, 'Set Variable', { name: '$e', value: 'Get ( LastError )' }),
  ]);
  assert.deepEqual(checksOf(guarded, 'unguarded-abort-off'), []);
});

test('Allow User Abort [On] is not an unguarded abort', () => {
  const sol = oneScript([step(ALLOW_USER_ABORT, 'Allow User Abort', { on: true })]);
  assert.deepEqual(checksOf(sol, 'unguarded-abort-off'), []);
});

// ── the state fm does not report ──────────────────────────────────────

test('with no `on` key the state is flags bit 0x20000, and [Off] is the absence of it', () => {
  // fm writes `on` only when the state was written into the file. Both checks
  // read the bit, so both see a step fm reported no state for.
  const off = oneScript([
    step(ALLOW_USER_ABORT, 'Allow User Abort'),
    step(ALLOW_USER_ABORT, 'Allow User Abort', { flags: 65536 }),
  ]);
  assert.deepEqual(checksOf(off, 'unguarded-abort-off').map((r) => r.step.index), [0, 1]);
  const on = oneScript([step(ALLOW_USER_ABORT, 'Allow User Abort', { flags: 196608 })]);
  assert.deepEqual(checksOf(on, 'unguarded-abort-off'), []);

  const captured = oneScript([step(SET_ERROR_CAPTURE, 'Set Error Capture', { flags: 131072 })]);
  assert.deepEqual(checksOf(captured, 'swallowed-error').map((r) => r.step.index), [0]);
  const notCaptured = oneScript([step(SET_ERROR_CAPTURE, 'Set Error Capture', { flags: 65536 })]);
  assert.deepEqual(checksOf(notCaptured, 'swallowed-error'), []);
  // An `on` fm DID report wins over the bit, whatever the bit says.
  const explicit = oneScript([step(SET_ERROR_CAPTURE, 'Set Error Capture', { on: false, flags: 131072 })]);
  assert.deepEqual(checksOf(explicit, 'swallowed-error'), []);
});

// ── expensive-in-loop ─────────────────────────────────────────────────

const loopOf = (inner) => [
  step(LOOP, 'Loop', { block: { role: 'opener', start: 0, end: inner.length + 1 } }),
  ...inner,
  step(END_LOOP, 'End Loop', { block: { role: 'closer', start: 0, end: inner.length + 1 } }),
];

test('an ExecuteSQL, an Evaluate and an Insert from URL inside a Loop are reported', () => {
  const sol = oneScript(loopOf([
    step(SET_VARIABLE, 'Set Variable', { name: '$a', value: 'ExecuteSQL ( "SELECT 1" ; "" ; "" )' }),
    step(SET_VARIABLE, 'Set Variable', { name: '$b', value: 'Evaluate ( $a )' }),
    step(INSERT_FROM_URL, 'Insert from URL', { url: '"https://example.com"' }),
    step(SET_VARIABLE, 'Set Variable', { name: '$c', value: 'EvaluationError ( $a )' }),
  ]));
  const rows = checksOf(sol, 'expensive-in-loop');
  assert.deepEqual(rows.map((r) => [r.step.index, r.detail.found]), [[1, 'ExecuteSQL'], [2, 'Evaluate'], [3, 'Insert from URL']]);
  assert.deepEqual(rows[0].detail.loop, { index: 0, stepID: LOOP });
});

test('the same steps outside a Loop, or under a disabled Loop, are not reported', () => {
  const outside = oneScript([
    step(SET_VARIABLE, 'Set Variable', { name: '$a', value: 'ExecuteSQL ( "SELECT 1" ; "" ; "" )' }),
    step(INSERT_FROM_URL, 'Insert from URL', { url: '"https://example.com"' }),
  ]);
  assert.deepEqual(checksOf(outside, 'expensive-in-loop'), []);
  const disabledLoop = oneScript(loopOf([step(INSERT_FROM_URL, 'Insert from URL', { url: '"https://example.com"' })])
    .map((s, i) => (i === 0 ? { ...s, disabled: true } : s)));
  assert.deepEqual(checksOf(disabledLoop, 'expensive-in-loop'), []);
});

test('a step inside a nested Loop names the innermost one', () => {
  const inner = [
    step(LOOP, 'Loop', { block: { role: 'opener', start: 1, end: 4 } }),
    step(INSERT_FROM_URL, 'Insert from URL', { url: '"https://example.com"' }),
    step(END_LOOP, 'End Loop', { block: { role: 'closer', start: 1, end: 4 } }),
  ];
  const sol = oneScript([
    step(LOOP, 'Loop', { block: { role: 'opener', start: 0, end: 5 } }),
    ...inner,
    step(END_LOOP, 'End Loop', { block: { role: 'closer', start: 0, end: 5 } }),
  ]);
  const rows = checksOf(sol, 'expensive-in-loop');
  assert.deepEqual(rows.map((r) => r.step.index), [2]);
  assert.equal(rows[0].detail.loop.index, 1);
});

// ── The call graph ────────────────────────────────────────────────────

test('callGraph is memoised, frozen, and its nodes are every script', () => {
  const graph = callGraph(solution);
  assert.equal(callGraph(solution), graph);
  assert.ok(Object.isFrozen(graph.nodes));
  assert.ok(Object.isFrozen(graph.edges));
  const sol = oneScript([]);
  assert.deepEqual(callGraph(sol).nodes, [{ key: 'script:file:///x.fmp12|7', target: 'file:///x.fmp12', id: 7, name: 'S' }]);
});

test('a step call, a trigger, a button and a menu item are four vias', () => {
  const sol = handMade({
    script: {
      list: [{ id: 1, name: 'target', type: 'script' }, { id: 2, name: 'caller', type: 'script' }],
      detailById: {
        ...detail(1, { id: 1, name: 'target', body: [] }),
        ...detail(2, { id: 2, name: 'caller', body: [step(PERFORM_SCRIPT, 'Perform Script', { script: 'target' })] }),
      },
    },
    layout: {
      list: [{ id: 5, name: 'L', type: 'layout' }],
      detailById: detail(5, {
        id: 5, name: 'L',
        scriptTriggers: [{ event: 'OnLayoutEnter', script: { id: 1, name: 'target' } }],
        contents: { objects: [{ id: 3, type: 'button', action: { step: 'Perform Script', script: 'target' } }] },
      }),
    },
    customMenu: {
      list: [{ id: 9, name: 'M' }],
      detailById: detail(9, { id: 9, name: 'M', items: [{ name: 'Go', action: { step: 'Perform Script', script: 'target' } }] }),
    },
  });
  const graph = callGraph(sol);
  const to = 'script:file:///x.fmp12|1';
  assert.deepEqual(graph.edges.map((e) => e.via).sort(), ['button', 'menu', 'step', 'trigger']);
  assert.ok(graph.edges.every((e) => e.to === to && e.resolved === true));
  assert.equal(graph.edges.find((e) => e.via === 'step').from, 'script:file:///x.fmp12|2');
  assert.equal(graph.edges.find((e) => e.via === 'trigger').from, 'layout:file:///x.fmp12|5');
  assert.equal(graph.edges.find((e) => e.via === 'button').from, 'layoutObject:file:///x.fmp12|5.3');
  assert.equal(graph.edges.find((e) => e.via === 'menu').from, 'customMenu:file:///x.fmp12|9');
  assert.equal(graph.edges.find((e) => e.via === 'trigger').origin.kind, 'layout');
  assert.equal(graph.edges.find((e) => e.via === 'button').origin.kind, 'layoutObject');
  assert.equal(graph.edges.find((e) => e.via === 'menu').origin.name, 'M');
});

test('a name no script answers is an unresolved edge, and AppleScript source is not an edge', () => {
  const sol = handMade({
    script: {
      list: [{ id: 2, name: 'caller', type: 'script' }],
      detailById: detail(2, {
        id: 2, name: 'caller',
        body: [
          step(PERFORM_SCRIPT, 'Perform Script', { script: 'gone' }),
          step(67, 'Perform AppleScript', { script: 'display dialog "Hello world!"' }),
        ],
      }),
    },
  });
  const edges = callGraph(sol).edges;
  assert.deepEqual(edges.map((e) => [e.name, e.to, e.resolved]), [['gone', null, false]]);
});

test('a call names the script of the calling file when both files have that name', () => {
  const files = {
    'file:///a.fmp12': oneFile('file:///a.fmp12', 'a', {
      script: {
        list: [{ id: 1, name: 'shared', type: 'script' }, { id: 2, name: 'caller', type: 'script' }],
        detailById: {
          ...detail(1, { id: 1, name: 'shared', body: [] }),
          ...detail(2, { id: 2, name: 'caller', body: [step(PERFORM_SCRIPT, 'Perform Script', { script: 'shared' })] }),
        },
      },
    }),
    'file:///b.fmp12': oneFile('file:///b.fmp12', 'b', {
      script: { list: [{ id: 1, name: 'shared', type: 'script' }], detailById: detail(1, { id: 1, name: 'shared', body: [] }) },
    }),
  };
  const edges = callGraph({ files, unreachable: [] }).edges;
  assert.deepEqual(edges.map((e) => e.to), ['script:file:///a.fmp12|1']);
});

// ── callTreeOf ────────────────────────────────────────────────────────

test('callTreeOf walks the callers-to-called direction to a depth and stops at a cycle', () => {
  const sol = handMade({
    script: {
      list: [{ id: 1, name: 'a', type: 'script' }, { id: 2, name: 'b', type: 'script' }],
      detailById: {
        ...detail(1, { id: 1, name: 'a', body: [step(PERFORM_SCRIPT, 'Perform Script', { script: 'b' })] }),
        ...detail(2, { id: 2, name: 'b', body: [step(PERFORM_SCRIPT, 'Perform Script', { script: 'a' })] }),
      },
    },
  });
  const graph = callGraph(sol);
  const tree = callTreeOf(graph, scriptKey('file:///x.fmp12', 1), 3);
  assert.equal(tree.name, 'a');
  assert.equal(tree.children[0].name, 'b');
  assert.equal(tree.children[0].children[0].name, 'a');
  assert.equal(tree.children[0].children[0].cycle, true);
  assert.deepEqual(tree.children[0].children[0].children, []);
  const shallow = callTreeOf(graph, scriptKey('file:///x.fmp12', 1), 1);
  assert.equal(shallow.children[0].name, 'b');
  assert.deepEqual(shallow.children[0].children, []);
  assert.equal(shallow.children[0].truncated, true);
  assert.equal(callTreeOf(graph, scriptKey('file:///x.fmp12', 99), 2), null);
});

test('a layout whose id equals a script\'s does not put its trigger in that script\'s tree', () => {
  // fm ids are unique per catalog, not across them. Keyed by `target|id` alone,
  // layout 7's trigger read as a call FROM script 7, and the tree walk followed
  // it -- on ooe that gave "Hello world" twelve children it does not call.
  const sol = handMade({
    script: {
      list: [{ id: 7, name: 'fired', type: 'script' }],
      detailById: detail(7, { id: 7, name: 'fired', body: [] }),
    },
    layout: {
      list: [{ id: 7, name: 'L', type: 'layout' }],
      detailById: detail(7, { id: 7, name: 'L', scriptTriggers: [{ event: 'OnLayoutEnter', script: { id: 7, name: 'fired' } }] }),
    },
  });
  const graph = callGraph(sol);
  const [edge] = graph.edges;
  assert.deepEqual([edge.via, edge.from, edge.to], ['trigger', 'layout:file:///x.fmp12|7', 'script:file:///x.fmp12|7']);
  assert.notEqual(edge.from, edge.to);
  // The edge is in the graph -- a trigger IS how that script is reached -- and
  // not in the tree, because a layout calls nothing.
  assert.deepEqual(callTreeOf(graph, scriptKey('file:///x.fmp12', 7), 3).children, []);
});

// ── The fixture: measured first, then pinned ──────────────────────────

const ooe = (name) => scriptIssues(solution).filter((r) => r.check === name);

test('the ooe fixture: how many of each check, and one named example of each', () => {
  const counts = {};
  for (const row of scriptIssues(solution)) counts[row.check] = (counts[row.check] ?? 0) + 1;
  assert.deepEqual(counts, {
    'dead-set-variable': 12,
    'embedded-credential': 65,
    'literal-account': 4,
    'psos-only-step': 715,
    'swallowed-error': 4,
  });
  // `expensive-in-loop` and `unguarded-abort-off` find nothing on ooe, and the
  // file says why: its six Loops hold one step each (an Exit Loop If), and all
  // seven `Allow User Abort [Off]` steps -- four of them [Off] only by the flags
  // bit, fm reporting no `on` -- sit in scripts that do set error capture. Both
  // are covered by the hand-made bodies above.
  assert.equal(scriptIssues(solution).length, 800);

  const dead = ooe('dead-set-variable')[0];
  assert.deepEqual([dead.script.name, dead.step.index, dead.detail.variable], ['Control', 7, '$some_var_with_repetitions']);
  const credential = ooe('embedded-credential')[0];
  assert.deepEqual([credential.script.name, credential.step.step, credential.detail], ['Capture_AICaptions', 'Configure AI Account', { key: 'apiKey', where: 'apiKey', characters: 3 }]);
  const byStep = {};
  for (const row of ooe('embedded-credential')) byStep[row.step.step] = (byStep[row.step.step] ?? 0) + 1;
  assert.deepEqual(byStep, { 'Create PDF': 56, 'Open PDF': 4, 'Append PDF': 3, 'Configure AI Account': 1, 'Print PDF': 1 });
  // All four are AI account references, which is why the check is named for the
  // literal it found and the detail carries the step that carried it.
  const accounts = ooe('literal-account');
  assert.deepEqual(accounts.map((r) => [r.detail.step, r.detail.account]), [
    ['Insert Image Caption', 'account'],
    ['Insert Image Caption', 'account'],
    ['Insert Image Captions in Found Set', 'account'],
    ['Perform RAG Action', 'test-rag'],
  ]);
  const swallowed = ooe('swallowed-error')[0];
  assert.deepEqual([swallowed.script.name, swallowed.step.index], ['Constrain without indexes', 1]);
  assert.equal(swallowed.target, ROOT);
});

test('the fixture proves a disabled step is skipped: 11 Set Web Viewer steps, 9 reported', () => {
  let present = 0;
  for (const file of Object.values(solution.files)) {
    for (const entry of Object.values(file.catalogs.script.detailById)) {
      for (const step of entry.result?.body ?? []) if (step.stepID === SET_WEB_VIEWER) present += 1;
    }
  }
  assert.equal(present, 11);
  assert.equal(ooe('psos-only-step').filter((r) => r.step.stepID === SET_WEB_VIEWER).length, 9);
});

test('every step on the PSoS list appears somewhere on ooe, in 22 scripts', () => {
  const rows = ooe('psos-only-step');
  assert.equal(new Set(rows.map((r) => r.detail.step)).size, 83);
  assert.equal(new Set(rows.map((r) => r.script.name)).size, 22);
});

test('the ooe call graph: every script a node, every naming site an edge', () => {
  const graph = callGraph(solution);
  assert.equal(graph.nodes.length, 44);
  assert.equal(graph.edges.length, 62);
  assert.equal(graph.edges.filter((e) => e.resolved).length, 62);
  const via = {};
  for (const edge of graph.edges) via[edge.via] = (via[edge.via] ?? 0) + 1;
  assert.deepEqual(via, { step: 30, trigger: 25, button: 5, menu: 2 });
});

test('the two script references ooe does not resolve are AppleScript source, and are not edges', () => {
  const named = references(solution).filter((r) => r.kind === 'script');
  assert.equal(named.length, 64);
  assert.deepEqual(named.filter((r) => !r.resolved).map((r) => r.from.name), ['All script steps and all options', 'All script steps and all options 20260318']);
  assert.equal(callGraph(solution).edges.length, named.length - 2);
});

test('noop is what ooe calls: 47 edges in, three kinds of site, nothing out', () => {
  const graph = callGraph(solution);
  const noop = graph.nodes.find((n) => n.name === 'noop');
  assert.equal(noop.key, scriptKey(ROOT, 2));
  const into = graph.edges.filter((e) => e.to === noop.key);
  const via = {};
  for (const edge of into) via[edge.via] = (via[edge.via] ?? 0) + 1;
  assert.deepEqual(via, { step: 21, trigger: 25, menu: 1 });
  assert.equal(into.length, 47);
  // noop calls nothing: its one step is a comment. The layout named `Contacts`
  // carries id 2 as well and has one trigger edge -- that edge is the graph's,
  // not noop's, and keeping the two apart is what the namespaced key is for.
  assert.equal(graph.edges.filter((e) => e.from === noop.key).length, 0);
  assert.equal(graph.edges.filter((e) => e.from === `layout:${ROOT}|2`).length, 1);
  assert.deepEqual(callTreeOf(graph, noop.key, 3).children, []);
});

test('ooe has no script that calls itself, directly or round a ring', () => {
  const graph = callGraph(solution);
  const out = new Map();
  for (const edge of graph.edges) {
    if (edge.via !== 'step' || !edge.resolved) continue;
    if (!out.has(edge.from)) out.set(edge.from, new Set());
    out.get(edge.from).add(edge.to);
  }
  // Three scripts call another script at all, six distinct pairs between them.
  assert.equal(out.size, 3);
  assert.equal([...out.values()].reduce((n, set) => n + set.size, 0), 6);
  const colour = new Map();
  const cycles = [];
  const walk = (key) => {
    colour.set(key, 'open');
    for (const next of out.get(key) ?? []) {
      if (colour.get(next) === 'open') cycles.push(`${key} -> ${next}`);
      else if (!colour.has(next)) walk(next);
    }
    colour.set(key, 'done');
  };
  for (const node of graph.nodes) if (!colour.has(node.key)) walk(node.key);
  // So the cycle the tree walk stops at is covered by a hand-made graph only:
  // the fixture's `Circular Reference` script calls nothing.
  assert.deepEqual(cycles, []);
});

test('the ooe ids that collide across catalogs, which is why a key carries its kind', () => {
  const file = solution.files[ROOT];
  const scripts = new Set(file.catalogs.script.list.filter((i) => i.type === 'script').map((i) => String(i.id)));
  const layouts = file.catalogs.layout.list.filter((i) => i.type !== 'folder').map((i) => String(i.id));
  const menus = file.catalogs.customMenu.list.map((i) => String(i.id));
  assert.equal(layouts.filter((id) => scripts.has(id)).length, 14);
  assert.equal(menus.filter((id) => scripts.has(id)).length, 11);
  assert.deepEqual([...new Set(callGraph(solution).edges.map((e) => e.from.split(':')[0]))].sort(),
    ['customMenu', 'layout', 'layoutObject', 'script']);
});

test('every issue carries FileMaker\'s own 1-based line beside the 0-based body index', () => {
  const rows = scriptIssues(oneScript([
    step(SET_WEB_VIEWER, 'Set Web Viewer', { objectName: '"a"' }),
    step(SET_WEB_VIEWER, 'Set Web Viewer', { objectName: '"b"' }),
  ]));
  assert.deepEqual(rows.map((r) => [r.step.index, r.step.line]), [[0, 1], [1, 2]]);
  // On the fixture too: whatever the index is, the line is one more.
  assert.ok(scriptIssues(solution).every((r) => r.step.line === r.step.index + 1));
});
