// tests/tabs/gaps.test.mjs
// The Gaps tab. The register numbers come from a hand-made three-entry fixture
// (tests/fixtures/register-summary.json) so they can be reasoned about by hand;
// the rendering-gap numbers were MEASURED against tests/fixtures/ooe before they
// were pinned here -- 3482 steps, 67 of a type the catalog has no entry for, 45
// steps carrying 52 gaps in 15 (step type, gap kind) groups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { GAP_LISTS, registerFacts, registerGroups, renderingGaps, tab } from '../../ui/tabs/gaps.js';

const REGISTER = JSON.parse(await readFile(new URL('../fixtures/register-summary.json', import.meta.url), 'utf8'));
const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const ooe = await discover(api, api.meta.root);
const view = { selection: null, filter: '', multiFile: true };

/** The smallest solution the tab renders: no scripts, so only the register and
 *  live sections have anything to say. */
const bare = (extra = {}) => ({
  root: 'file:///x.fmp12',
  cli: { version: '0.7.0' },
  files: { 'file:///x.fmp12': { target: 'file:///x.fmp12', name: 'x', facts: {}, catalogs: {} } },
  unreachable: [],
  ...extra,
});

/** Every list populated, so each one's own rendering is exercised. */
const outcome = () => ({
  entries: 302,
  stillMissing: [{ id: 'account:amazon', attribute: 'password change on next login' }],
  newlyReported: [{ id: 'field:calc', attribute: 'field comment' }],
  regressed: [{ id: 'script:step', attribute: 'step name' }],
  attributeErrors: [{ id: 'custom-menu:item', attribute: 'menu item action', reason: 'selector matched nothing' }],
  unexplained: [{ id: 'table:base', keys: ['newKey'] }],
  nestedUnexplained: [{ id: 'table:base', keys: ['options.newNested'] }],
  errored: [{ id: 'theme:theme', reason: 'probe refused: 1200' }],
  erroredExpected: [{ id: 'layout-object:button', reason: 'probe refused: 1200' }],
  expectedResolved: [{ id: 'persistent-store:store', expectedError: 'probe refused: 3' }],
  probeFailures: 2,
  fmVersion: '0.7.0',
  build: '29823677',
  ranAt: '2026-09-16T10:00:00.000Z',
});

test('registerGroups groups by the id prefix and counts reported, missing and wontfix', () => {
  const groups = registerGroups(REGISTER);
  assert.deepEqual(groups.map((g) => g.kind), ['account', 'layout-object']);
  const [account, layoutObject] = groups;
  assert.equal(account.entries.length, 2);
  assert.deepEqual([account.reported, account.missing, account.wontfix], [2, 1, 1]);
  assert.equal(layoutObject.entries.length, 1);
  assert.deepEqual([layoutObject.reported, layoutObject.missing, layoutObject.wontfix], [0, 1, 0]);
});

test('registerFacts is the build the register was last checked against', () => {
  assert.deepEqual(registerFacts(REGISTER), { version: '0.7.0', build: '29823677', date: '2026-09-16' });
  assert.equal(registerFacts([]), null);
});

test('the register matrix shows every group, every entry and every attribute row', () => {
  const html = tab.render(bare({ register: REGISTER }), view);
  assert.match(html, /What fm cannot read yet/);
  assert.match(html, /account/);
  assert.match(html, /layout-object/);
  assert.match(html, /account:amazon/);
  assert.match(html, /password change on next login/);
  assert.match(html, /Authentication\/@changepassword/);
  // The three statuses each name themselves on the row they belong to.
  assert.match(html, /reported/);
  assert.match(html, /missing/);
  assert.match(html, /wontfix/);
  // knownFrom is the column that says where the fact was known from.
  assert.match(html, /Manage Security &gt; Require password change on next sign in/);
});

test('the filter narrows the attribute rows but never the totals', () => {
  const all = tab.render(bare({ register: REGISTER }), view);
  const filtered = tab.render(bare({ register: REGISTER }), { ...view, filter: 'changepassword' });
  assert.match(all, /account:google/);
  assert.doesNotMatch(filtered, /account:google/, 'an entry no attribute of which matches is dropped');
  assert.match(filtered, /account:amazon/);
  assert.doesNotMatch(filtered, /account authentication type code/, 'a non-matching attribute row is dropped');
  // Totals are solution-wide whatever the filter says: 5 attributes, 2 reported.
  for (const html of [all, filtered]) {
    assert.match(html, /Attributes <span class="num">5<\/span>/);
    assert.match(html, /Reported <span class="num">2<\/span>/);
  }
});

test('the register section says so when nothing has been loaded, and offers the button', () => {
  const html = tab.render(bare(), view);
  assert.match(html, /data-action="gaps-register"/);
  assert.doesNotMatch(html, /account:amazon/);
});

test('the live check is a button until it has been run', () => {
  const html = tab.render(bare({ register: REGISTER }), view);
  assert.match(html, /data-action="gaps-check"/);
  assert.match(html, /Live check/);
  assert.doesNotMatch(html, /Regressed/);
});

test('the live check renders every list, and flags a newly reported attribute in the register\'s words', () => {
  const html = tab.render(bare({ register: REGISTER, gaps: outcome() }), view);
  assert.match(html, /theme:theme/);
  assert.match(html, /probe refused: 1200/);
  assert.match(html, /layout-object:button/);
  assert.match(html, /script:step/);
  assert.match(html, /field:calc/);
  assert.match(html, /reported live but still marked missing in the register/);
  assert.match(html, /persistent-store:store/);
  assert.match(html, /custom-menu:item/);
  assert.match(html, /0\.7\.0/);
  assert.match(html, /29823677/);
  // The button stays, so the check can be run again.
  assert.match(html, /data-action="gaps-check"/);
});

test('a run where most probes could not find their object says so rather than reading as 300 fm bugs', () => {
  // Every probe refused, which is what any file but the reference solution answers:
  // the register addresses its objects by the reference solution's own ids.
  const refused = {
    ...outcome(),
    entries: 302,
    errored: Array.from({ length: 302 }, (_, i) => ({ id: `kind:${i}`, reason: 'probe refused: 105' })),
    erroredExpected: [],
    probeFailures: 302,
  };
  assert.match(tab.render(bare({ register: REGISTER, gaps: refused }), view), /not the reference solution/);
  // The ooe-shaped run: 302 entries, one expected failure and nothing else.
  const ooeShaped = { ...outcome(), entries: 302, errored: [], probeFailures: 0 };
  assert.doesNotMatch(tab.render(bare({ register: REGISTER, gaps: ooeShaped }), view), /not the reference solution/);
});

test('GAP_LISTS covers every list the reduced outcome carries', () => {
  // The tab and the Markdown report both build from this one constant, so a
  // list the server forwards and this does not name is invisible in both.
  const keys = new Set(GAP_LISTS.map((l) => l.key));
  const meta = new Set(['entries', 'probeFailures', 'fmVersion', 'build', 'ranAt', 'fatal']);
  for (const key of Object.keys(outcome())) {
    if (!meta.has(key)) assert.ok(keys.has(key), `GAP_LISTS does not name ${key}`);
  }
  for (const l of GAP_LISTS) {
    assert.ok(l.title && l.note && l.columns?.length, l.key);
  }
});

test('a nested key no attribute claims is on the page', () => {
  const html = tab.render(bare({ register: REGISTER, gaps: outcome() }), view);
  assert.match(html, /Nested keys no attribute claims/);
  assert.match(html, /options\.newNested/);
  assert.match(html, /the only list a gap closed by a nested key shows up in/);
});

test('a check of nothing does not say 0 of 0 probes could not find their object', () => {
  const empty = { ...outcome(), entries: 0, probeFailures: 0 };
  assert.doesNotMatch(tab.render(bare({ register: REGISTER, gaps: empty }), view), /not the reference solution/);
});

test('renderingGaps: measured on the ooe fixture', () => {
  const r = renderingGaps(ooe);
  assert.equal(r.steps, 3482);
  assert.equal(r.noCatalogEntry, 67);
  assert.equal(r.stepsWithGaps, 45);
  assert.equal(r.gaps, 52);
  assert.equal(r.groups.length, 15);
  assert.deepEqual(r.byKind, { noDisplayForm: 50, catalogMarkedMismatch: 2 });
  // The largest group, and the one example a reader is shown for it.
  const top = r.groups[0];
  assert.equal(top.step, 'Save Records as PDF');
  assert.equal(top.gap, 'noDisplayForm');
  assert.equal(top.count, 17);
  assert.equal(top.example.script, 'Records');
  assert.equal(top.example.index, 16);
  assert.equal(top.example.key, 'createFolders');
});

test('renderingGaps is re-measured when one script is re-read, not only the whole solution', () => {
  // A catalog- or object-grain re-read replaces `catalogs.script.detailById` in place
  // and keeps the solution object (ui/discovery.js), so a memo guarded on the solution
  // alone would leave the old counts on screen.
  const step = { stepID: 1, step: 'Save Records as PDF', createFolders: true };
  const withOne = (n) => ({
    root: 'file:///x.fmp12',
    cli: { version: '0.7.0' },
    unreachable: [],
    files: {
      'file:///x.fmp12': {
        target: 'file:///x.fmp12',
        name: 'x',
        facts: {},
        catalogs: { script: { list: [], detailById: { 1: { result: { id: 1, name: 'S', body: Array(n).fill(step) } } } } },
      },
    },
  });
  const solution = withOne(1);
  assert.equal(renderingGaps(solution).gaps, 1);
  solution.files['file:///x.fmp12'].catalogs.script.detailById = withOne(3).files['file:///x.fmp12'].catalogs.script.detailById;
  assert.equal(renderingGaps(solution).gaps, 3, 'the memo followed the re-read');
});

test('the rendering-gaps section names the step types and the counts', () => {
  const html = tab.render(ooe, view);
  assert.match(html, /Rendering gaps/);
  assert.match(html, /Save Records as PDF/);
  assert.match(html, /noDisplayForm/);
  assert.match(html, /<span class="num">52<\/span>/);
  assert.match(html, /<span class="num">67<\/span>/);
});

test('every string the register and the outcome carry is escaped', () => {
  const hostile = [{
    id: '<img src=x onerror=alert(1)>:evil',
    op: 'read:"x"',
    kind: 'evil & co',
    probe: { ops: [{ op: 'read:account' }] },
    attributes: [{
      name: '<script>alert(1)</script>',
      path: 'a"b',
      fmKey: '<b>k</b>',
      reported: false,
      knownFrom: 'from <i>here</i>',
    }],
    lastChecked: { version: '<v>', build: '<b>', date: '<d>' },
  }];
  const gaps = {
    entries: 1,
    stillMissing: [], newlyReported: [{ id: '<x>', attribute: '<y>' }], regressed: [],
    attributeErrors: [{ id: '<a>', attribute: '<b>', reason: '<c>' }],
    unexplained: [{ id: '<u>', keys: ['<k>'] }],
    errored: [{ id: '<e>', reason: '<r>' }], erroredExpected: [], expectedResolved: [{ id: '<p>', expectedError: '<q>' }],
    probeFailures: 0, fmVersion: '<fv>', build: '<fb>', ranAt: '<ra>',
  };
  const html = tab.render(bare({ register: hostile, gaps, cli: { version: '<cli>' } }), view);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<i>here<\/i>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;fv&gt;/);
  assert.match(html, /&lt;r&gt;/);
});
