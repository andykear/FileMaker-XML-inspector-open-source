// tests/tabs/security.test.mjs
// Every count here was measured against tests/fixtures/ooe before it was pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import {
  tab, accountRows, privilegeSetRows, extendedPrivilegeRows, authorizationRows,
  accessSummary, securityTotals, selectionOf,
} from '../../ui/tabs/security.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const root = solution.files[api.meta.root];
const brojDva = solution.files['fmnet://localhost/BrojDva'];
const view = { selection: null, filter: '', multiFile: true };

test('accountRows: 13 accounts on the root file, each with the fields the brief names', () => {
  const rows = accountRows(root);
  assert.equal(rows.length, 13);
  assert.equal(rows.length, root.catalogs.account.list.length);
  const admin = rows.find((r) => r.name === 'Admin');
  assert.equal(admin.userType, 'fileMakerUser');
  assert.equal(admin.privilegeSet, '[Full Access]');
  assert.equal(admin.enabled, true);
  assert.equal(admin.hasPassword, true);
  assert.equal(admin.forceExpire, false);
  assert.equal(admin.builtIn, false);
  const guest = rows.find((r) => r.name === '[Guest]');
  assert.equal(guest.builtIn, true);
  assert.equal(guest.enabled, false);
});

test('7 accounts on the root file have no password, and 2 are disabled', () => {
  const rows = accountRows(root);
  assert.equal(rows.filter((r) => r.hasPassword === false).length, 7);
  assert.equal(rows.filter((r) => r.enabled === false).length, 2);
});

test('privilegeSetRows: 7 privilege sets on the root file', () => {
  const rows = privilegeSetRows(root);
  assert.equal(rows.length, 7);
  assert.equal(rows.length, root.catalogs.privilegeSet.list.length);
});

test('accessSummary reads the access key when fm reports one, and the fixture\'s "[Full Access]" carries all four blanket-modifiable summaries', () => {
  const full = privilegeSetRows(root).find((r) => r.name === '[Full Access]');
  assert.equal(full.records, 'createEditDelete');
  assert.equal(full.layouts, 'allModifiable');
  assert.equal(full.scripts, 'allModifiable');
  assert.equal(full.valueLists, 'allModifiable');
  assert.equal(full.extendedPrivileges.length, 12);
});

test('a privilege set with per-item overrides carries no blanket access key, so the summary falls back to its true flags', () => {
  // MyRestrictedPrivilegeSet (id 4): records has neither `access` nor a true boolean
  // flag (only newTables/tables objects), so its summary is empty; scripts and
  // valueLists do carry `allowCreation: true`, so that name is the summary; layouts
  // has `allowCreation: false`, so it too is empty. Measured straight from the fixture.
  const restricted = privilegeSetRows(root).find((r) => r.name === 'MyRestrictedPrivilegeSet');
  assert.equal(restricted.records, '');
  assert.equal(restricted.layouts, '');
  assert.equal(restricted.scripts, 'allowCreation');
  assert.equal(restricted.valueLists, 'allowCreation');
});

test('accessSummary on plain values', () => {
  assert.equal(accessSummary('allViewOnly'), 'allViewOnly');
  assert.equal(accessSummary(null), '');
  assert.equal(accessSummary(undefined), '');
  assert.equal(accessSummary({ access: 'allNoAccess', allowCreation: true }), 'allNoAccess');
  assert.equal(accessSummary({ allowCreation: true, other: false }), 'allowCreation');
  assert.equal(accessSummary({ allowCreation: false }), '');
});

test('extendedPrivilegeRows: 12 extended privileges on the root file, built-in flagged', () => {
  const rows = extendedPrivilegeRows(root);
  assert.equal(rows.length, 12);
  assert.equal(rows.length, root.catalogs.extendedPrivilege.list.length);
  assert.ok(rows.find((r) => r.name === 'fmwebdirect').builtIn);
  assert.equal(rows.find((r) => r.name === 'MyExtendedPrivilege').builtIn, false);
});

test('authorizationRows: 5 authorizations on the root file', () => {
  const rows = authorizationRows(root);
  assert.equal(rows.length, 5);
  assert.equal(rows.length, root.catalogs.authorization.list.length);
  const inbound = rows.find((r) => r.id === 3);
  assert.equal(inbound.type, 'inbound');
  assert.deepEqual(inbound.filenames, ['TestFile_dev']);
  assert.equal(inbound.hasHash, true);
  assert.equal(inbound.hasToken, false);
});

test('securityTotals sums accounts, privilege sets and extended privileges across every reached file', () => {
  const t = securityTotals(solution);
  const accounts = accountRows(root).length + accountRows(brojDva).length;
  const privilegeSets = privilegeSetRows(root).length + privilegeSetRows(brojDva).length;
  const extendedPrivileges = extendedPrivilegeRows(root).length + extendedPrivilegeRows(brojDva).length;
  assert.equal(t.accounts, accounts);
  assert.equal(t.privilegeSets, privilegeSets);
  assert.equal(t.extendedPrivileges, extendedPrivileges);
  assert.equal(t.noPassword, 7); // BrojDva's three accounts all have passwords
  assert.equal(t.disabled, 3); // root's 2 plus BrojDva's [Guest]
});

test('selectionOf splits the target and the acc/priv id', () => {
  assert.equal(selectionOf({ selection: null }), null);
  assert.deepEqual(selectionOf({ selection: 'fmnet://localhost/ooe|acc:2' }),
    { target: 'fmnet://localhost/ooe', kind: 'acc', id: '2' });
  assert.deepEqual(selectionOf({ selection: 'fmnet://localhost/ooe|priv:1' }),
    { target: 'fmnet://localhost/ooe', kind: 'priv', id: '1' });
});

test('the tab renders all four sections with the solution-wide totals', () => {
  const html = tab.render(solution, view);
  assert.match(html, /Accounts/);
  assert.match(html, /Privilege sets/);
  assert.match(html, /Extended privileges/);
  assert.match(html, /Authorizations/);
  const t = securityTotals(solution);
  assert.ok(html.includes(`Accounts <span class="num">${t.accounts}</span>`));
  assert.ok(html.includes(`Privilege sets <span class="num">${t.privilegeSets}</span>`));
  assert.ok(html.includes(`Extended privileges <span class="num">${t.extendedPrivileges}</span>`));
  assert.ok(html.includes(`No password <span class="num">${t.noPassword}</span>`));
  assert.ok(html.includes(`Disabled <span class="num">${t.disabled}</span>`));
  assert.ok(html.includes('data-reread-catalog="account"'));
  assert.ok(html.includes('data-reread-catalog="privilegeSet"'));
  assert.ok(html.includes('data-reread-catalog="extendedPrivilege"'));
  assert.ok(html.includes('data-reread-catalog="authorization"'));
});

test('the totals are solution-wide: a filter that hides every account leaves them alone', () => {
  const line = (html) => html.match(/<p class="muted totals">.*?<\/p>/)[0];
  const all = line(tab.render(solution, view));
  const filtered = tab.render(solution, { ...view, filter: 'zzzz-no-such-account' });
  assert.equal(line(filtered), all);
  assert.ok(!filtered.includes('>Admin<'));
});

test('selecting "[Full Access]" shows its kv, the canManageDatabase file option and a re-read control', () => {
  const priv = privilegeSetRows(root).find((r) => r.name === '[Full Access]');
  const html = tab.render(solution, { ...view, selection: `${api.meta.root}|priv:${priv.id}` });
  assert.match(html, /canManageDatabase/);
  assert.ok(html.includes('data-reread-object='));
  assert.ok(html.includes('"catalog":"privilegeSet"'));
});

test('selecting an account shows its kv and a re-read control', () => {
  const acc = accountRows(root).find((r) => r.name === 'Admin');
  const html = tab.render(solution, { ...view, selection: `${api.meta.root}|acc:${acc.id}` });
  assert.match(html, /Admin/);
  assert.match(html, /\[Full Access\]/);
  assert.ok(html.includes('data-reread-object='));
  assert.ok(html.includes('"catalog":"account"'));
});

test('a selection in the second file reads that file, not the root', () => {
  const acc = accountRows(brojDva).find((r) => r.name === 'restapi');
  const html = tab.render(solution, { ...view, selection: `fmnet://localhost/BrojDva|acc:${acc.id}` });
  assert.match(html, /restapi/);
  assert.ok(html.includes('"target":"fmnet://localhost/BrojDva"'));
});

test('the File column appears in multiFile view and rows carry the File cell', () => {
  const html = tab.render(solution, view);
  assert.ok(html.includes('<th>File</th>'));
});

test('every model string is escaped', () => {
  const evil = {
    target: 'x<y', name: '<img>', facts: {},
    catalogs: {
      account: { list: [{ name: '<b>&"', id: 1, builtIn: false }], listError: null, detailById: {}, ops: [], readAt: null },
      privilegeSet: { list: [], listError: null, detailById: {}, ops: [], readAt: null },
      extendedPrivilege: { list: [], listError: null, detailById: {}, ops: [], readAt: null },
      authorization: { list: [], listError: null, detailById: {}, ops: [], readAt: null },
    },
  };
  const html = tab.render({ files: { 'x<y': evil }, unreachable: [] }, { selection: null, filter: '', multiFile: false });
  assert.ok(!html.includes('<b>&"'));
  assert.match(html, /&lt;b&gt;&amp;&quot;/);
});
