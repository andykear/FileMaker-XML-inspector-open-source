// tests/tabs/gaps.test.mjs
// The Gaps tab. Most register numbers come from a hand-made three-entry fixture
// (tests/fixtures/register-summary.json) so they can be reasoned about by hand;
// the drill-down is exercised against the register the page really gets -- the
// toolkit's own, through the same loadRegisterSummary the server serves it with,
// because the shape a reader walks (26 kinds, 302 entries, 8502 attributes) is
// not a shape three hand-made entries have. Those numbers are MEASURED from the
// register in the test and pinned beside the measurement, so a toolkit bump that
// moves one fails on the pin rather than agreeing with itself.
//
// The rendering-gap numbers were MEASURED against tests/fixtures/ooe before they
// were pinned here -- 3482 steps, 67 of a type the catalog has no entry for, 45
// steps carrying 52 gaps in 15 (step type, gap kind) groups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { GAP_LISTS, registerEntries, registerFacts, registerGroups, renderingGaps, statusOf, tab } from '../../ui/tabs/gaps.js';
import { kindSelection, solutionKey } from '../../ui/tabs/common.js';
import { GAP_LISTS as NEUTRAL_LISTS } from '../../ui/analysis/gaps-lists.js';
import { loadRegisterSummary } from '../../server/gaps.mjs';

const REGISTER = JSON.parse(await readFile(new URL('../fixtures/register-summary.json', import.meta.url), 'utf8'));
// The register exactly as the page is served it: every key the summary drops is
// a key no renderer here may read.
const FULL = loadRegisterSummary();
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
  assert.equal(account.attributes, 4, 'the sum of the three, which is every attribute');
  assert.equal(account.key, '*|gap-kind:account', 'the row selects the kind, on the solution');
  assert.equal(layoutObject.entries.length, 1);
  assert.deepEqual([layoutObject.reported, layoutObject.missing, layoutObject.wontfix], [0, 1, 0]);
  assert.equal(layoutObject.attributes, 1);
  // `attributes` is the sum by construction: statusOf answers one of the three
  // for every attribute and never two.
  for (const g of registerGroups(FULL)) assert.equal(g.attributes, g.reported + g.missing + g.wontfix, g.kind);
});

test('registerEntries is one row per entry, with the entry\'s own totals', () => {
  const [account] = registerGroups(REGISTER);
  assert.deepEqual(registerEntries(account), [
    {
      key: '*|gap-entry:account:amazon',
      id: 'account:amazon',
      op: 'read:account',
      attributes: 3,
      reported: 1,
      missing: 1,
      wontfix: 1,
      expectedError: '',
    },
    {
      key: '*|gap-entry:account:google',
      id: 'account:google',
      op: 'read:account',
      attributes: 1,
      reported: 1,
      missing: 0,
      wontfix: 0,
      expectedError: '',
    },
  ]);
  // The one entry of the fixture the register expects fm to refuse.
  const [, layoutObject] = registerGroups(REGISTER);
  assert.equal(registerEntries(layoutObject)[0].expectedError, 'probe refused: 1200');
  assert.deepEqual(registerEntries(undefined), [], 'a kind no group has is no rows, not a throw');
});

test('an entry id keeps its own colon through the selection', () => {
  // `account:filemaker` is an id with a colon in it, and the selection shape
  // joins on colons: kindSelection must hand the whole tail back.
  assert.equal(solutionKey('gap-entry', 'account:filemaker'), '*|gap-entry:account:filemaker');
  assert.deepEqual(kindSelection(solutionKey('gap-entry', 'account:filemaker'), ['gap-kind', 'gap-entry']),
    { target: '*', kind: 'gap-entry', id: 'account:filemaker' });
  assert.deepEqual(kindSelection(solutionKey('gap-kind', 'layout-object'), ['gap-kind', 'gap-entry']),
    { target: '*', kind: 'gap-kind', id: 'layout-object' });
});

test('registerFacts is the build the register was last checked against', () => {
  assert.deepEqual(registerFacts(REGISTER), { version: '0.7.0', build: '29823677', date: '2026-09-16' });
  assert.equal(registerFacts([]), null);
});

test('the register is a kinds table, one row per kind, and nothing is folded away', () => {
  const html = tab.render(bare({ register: FULL }), view);
  assert.match(html, /What fm cannot read yet/);
  const kinds = registerGroups(FULL);
  assert.equal(kinds.length, 26, 'measured on the pinned register');
  // One selectable row per kind, each linking to the kind's own selection.
  for (const g of kinds) {
    assert.ok(html.includes(`data-select="${g.key}"`), `no row for ${g.kind}`);
    assert.ok(html.includes(`href="#gaps/${encodeURIComponent(g.key)}"`), `no link for ${g.kind}`);
  }
  assert.match(html, /href="#gaps\/\*%7Cgap-kind%3Aaccount"/);
  // The totals of the whole register, measured from it.
  assert.match(html, /Kinds <span class="num">26<\/span>/);
  assert.match(html, /Entries <span class="num">302<\/span>/);
  assert.match(html, /Attributes <span class="num">8502<\/span>/);
  assert.equal(FULL.length, 302);
  assert.equal(FULL.reduce((n, e) => n + e.attributes.length, 0), 8502);
  // The tree of <details> the manual test called very bad UI is gone. Nothing
  // else on a script-less, un-checked solution folds, so one assertion does it.
  assert.doesNotMatch(html, /<details/);
  // Nothing is shown until a kind is selected: 302 entries and 8502 attributes
  // are the thing the tables exist to avoid printing at once.
  assert.doesNotMatch(html, /account:filemaker/);
});

test('selecting a kind lists its entries, each a link to itself', () => {
  const account = registerGroups(FULL).find((g) => g.kind === 'account');
  const rows = registerEntries(account);
  assert.equal(rows.length, 8, 'measured on the pinned register');
  const html = tab.render(bare({ register: FULL }), { ...view, selection: account.key });
  assert.match(html, /Kind account/);
  for (const r of rows) {
    assert.ok(html.includes(`href="#gaps/${encodeURIComponent(r.key)}"`), `no link for ${r.id}`);
    assert.ok(html.includes(`data-select="${r.key}"`), `no row for ${r.id}`);
  }
  assert.match(html, /account:filemaker/);
  // A kind's entries render ABOVE the kinds table, which stays for the overview.
  assert.ok(html.indexOf('Kind account') < html.indexOf('What fm cannot read yet'));
  assert.match(html, /href="#gaps\/\*%7Cgap-kind%3Alayout-object"/, 'the kinds table is still there');
  // A kind no register has draws no section rather than an empty one.
  const missing = tab.render(bare({ register: FULL }), { ...view, selection: solutionKey('gap-kind', 'nosuch') });
  assert.doesNotMatch(missing, /Kind nosuch/);
});

test('selecting an entry shows what it is read with and every fact the export carries', () => {
  const entry = FULL.find((e) => e.id === 'account:filemaker');
  const missing = entry.attributes.filter((a) => statusOf(a) === 'missing').length;
  assert.deepEqual([entry.attributes.length, missing], [21, 5], 'measured on the pinned register');
  const html = tab.render(bare({ register: FULL }), { ...view, selection: solutionKey('gap-entry', entry.id) });
  assert.match(html, /Entry account:filemaker/);
  // One status badge per attribute, and the missing ones counted on the line above.
  assert.equal((html.match(/<span class="badge (?:good|muted|bad)">(?:reported|wontfix|missing)<\/span>/g) ?? []).length,
    entry.attributes.length);
  assert.match(html, /Attributes <span class="num">21<\/span> &middot; Reported <span class="num">9<\/span> &middot; Missing <span class="num">5<\/span>/);
  // Every attribute of the entry, by name, and the sentence saying where it was known from.
  for (const a of entry.attributes) assert.ok(html.includes(a.name), `no row for ${a.name}`);
  assert.match(html, /Manage Security|File &gt; Manage &gt; Security/);
  // What fm is handed to read it: the probe's own ops, one per line.
  assert.match(html, /Read with/);
  assert.match(html, /\{&quot;op&quot;:&quot;read:account&quot;,&quot;id&quot;:15\}/);
  // And the way back to the kind it belongs to.
  assert.match(html, /href="#gaps\/\*%7Cgap-kind%3Aaccount"/);
  // An id the register has no entry for draws nothing.
  assert.doesNotMatch(tab.render(bare({ register: FULL }), { ...view, selection: solutionKey('gap-entry', 'account:nope') }),
    /Entry account:nope/);
});

test('the filter narrows each table on what that table shows, and never the totals', () => {
  const all = tab.render(bare({ register: REGISTER }), view);
  const nothing = tab.render(bare({ register: REGISTER }), { ...view, filter: 'zzz-no-such-kind' });
  assert.match(all, /href="#gaps\/\*%7Cgap-kind%3Aaccount"/);
  assert.doesNotMatch(nothing, /href="#gaps\/\*%7Cgap-kind%3Aaccount"/, 'the kinds table filters on the kind name');
  assert.match(nothing, /None match the filter/);
  // Totals are register-wide whatever the filter says: 5 attributes, 2 reported.
  for (const html of [all, nothing]) {
    assert.match(html, /Attributes <span class="num">5<\/span>/);
    assert.match(html, /Reported <span class="num">2<\/span>/);
  }
  // The entries table filters on the entry's id and its op, the attributes table
  // on the attribute's name and export path -- and neither touches its totals.
  const entries = tab.render(bare({ register: REGISTER }), { ...view, selection: solutionKey('gap-kind', 'account'), filter: 'google' });
  assert.match(entries, /account:google/);
  assert.doesNotMatch(entries, /account:amazon/);
  assert.match(entries, /Entries <span class="num">2<\/span>/);
  const attributes = tab.render(bare({ register: REGISTER }), { ...view, selection: solutionKey('gap-entry', 'account:amazon'), filter: 'changepassword' });
  assert.match(attributes, /password change on next login/, 'matched on its export path');
  assert.doesNotMatch(attributes, /account authentication type code/, 'a non-matching attribute row is dropped');
  assert.match(attributes, /Attributes <span class="num">3<\/span> &middot; Reported <span class="num">1<\/span>/);
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

test('the tab\'s lists are the neutral module\'s, with columns attached by key', () => {
  // The names and the prose live in ui/analysis/gaps-lists.js, which the
  // Markdown export reads too; the columns are the only half that draws, and
  // they are this tab's. Same rows, same order, one added key.
  assert.deepEqual(GAP_LISTS.map(({ key, title, note }) => ({ key, title, note })), NEUTRAL_LISTS.map((l) => ({ ...l })));
  for (const l of GAP_LISTS) assert.ok(Array.isArray(l.columns) && l.columns.length, l.key);
  assert.ok(Object.isFrozen(GAP_LISTS));
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
  const solution = bare({ register: hostile, gaps, cli: { version: '<cli>' } });
  // Every level of the drill-down, because each draws strings the other does not:
  // the kinds table, the kind's entries, and the entry's own facts and probe.
  const kinds = tab.render(solution, view);
  const entries = tab.render(solution, { ...view, selection: solutionKey('gap-kind', '<img src=x onerror=alert(1)>') });
  const attributes = tab.render(solution, { ...view, selection: solutionKey('gap-entry', '<img src=x onerror=alert(1)>:evil') });
  for (const html of [kinds, entries, attributes]) {
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<i>here<\/i>/);
    assert.match(html, /&lt;fv&gt;/);
    assert.match(html, /&lt;r&gt;/);
  }
  assert.match(entries, /read:&quot;x&quot;/, 'the op is escaped where the entries table prints it');
  assert.match(attributes, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(attributes, /&lt;b&gt;k&lt;\/b&gt;/, 'the fm key');
  assert.match(attributes, /from &lt;i&gt;here&lt;\/i&gt;/, 'the sentence it was known from');
  assert.match(attributes, /&quot;op&quot;:&quot;read:account&quot;/, 'the probe fm would be handed');
});
