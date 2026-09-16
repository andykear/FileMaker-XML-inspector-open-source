// ui/tabs/security.js
// The Security tab: accounts, privilege sets, extended privileges and authorizations
// of every file reached. Accounts and privilege sets are described one by one (fm's
// `read:account`/`read:privilegeSet` with an id); extended privileges and
// authorizations have no describe, so their row is the list item fm already gave us.
// A pure renderer: no document, every fm key read through access.js, every string
// escaped.
import { badge, count, esc, kv, link, matches, rereadObjectButton, section, table } from '../dom.js';
import { get } from '../access.js';
import {
  catalogActions, detailOf, kindSelection, listOf, selectRow, selectionKey, totalsLine, withFile,
} from './common.js';

/** A string stands for itself; an object reports either a blanket `access`
 *  (allModifiable, allNoAccess, createEditDelete...) or, once fm has per-item
 *  overrides and drops the blanket key, whichever of its own keys are `true`
 *  (typically just `allowCreation`) -- empty when it has neither, which is honest:
 *  a privilege set with per-table overrides reports no blanket access on `records`. */
export function accessSummary(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  const access = get(value, 'access');
  if (access !== undefined) return String(access);
  return Object.entries(value).filter(([, v]) => v === true).map(([k]) => k).join(', ');
}

/** Where each of the four privilege areas keeps its per-item overrides. */
const OVERRIDE_KEY = { records: 'tables', layouts: 'layouts', scripts: 'scripts', valueLists: 'valueLists' };

/** The per-item overrides fm reports on one area, or `[]` when it reports none. */
export function overridesOf(value, area) {
  const items = get(value, OVERRIDE_KEY[area]);
  return Array.isArray(items) ? items : [];
}

const trueFlags = (value) => (value !== null && typeof value === 'object'
  ? Object.entries(value).filter(([, v]) => v === true).map(([k]) => k)
  : []);

/** One Records/Layouts/Scripts/Value lists cell. A blanket `access` stands for
 *  itself. An area carrying per-item overrides is `custom`, plus whatever
 *  top-level flags are true (`custom · allowCreation`) -- never a bare
 *  `allowCreation` on its own, which says nothing about the overrides that are
 *  the actual access. An object with neither is `custom` too. An area fm never
 *  reported at all (a privilege set whose describe errored, where only the list
 *  item is left) is not custom, it is unread, so it renders as nothing. */
export function accessCell(value, area) {
  if (value === null || value === undefined) return badge('unread', 'muted');
  if (typeof value !== 'object') return esc(String(value));
  const access = get(value, 'access');
  if (access !== undefined) return esc(String(access));
  const flags = trueFlags(value).map((f) => esc(f));
  if (overridesOf(value, area).length) return [badge('custom', 'info'), ...flags].join(' &middot; ');
  return flags.length ? flags.join(', ') : badge('custom', 'info');
}

/** fm's `hasPassword` is about a FileMaker-managed password, and only a
 *  `fileMakerUser` has one: an external, OAuth or Azure account is authenticated
 *  elsewhere and reports `hasPassword: false` because the question does not
 *  apply to it, not because it can be signed into blank. The inventory's
 *  `s.accounts.acc.blank_password` is therefore the pair, not the flag alone. */
export function passwordState(row) {
  if (row.userType === 'fileMakerUser') return row.hasPassword === false ? 'none' : 'yes';
  if (row.userType) return 'external';
  // Neither key means the describe never arrived (the list item carries only
  // name, id, builtIn): fm has said nothing, so neither do we.
  if (row.hasPassword === undefined) return 'unread';
  return row.hasPassword === false ? 'none' : 'yes';
}

const passwordCell = (row) => {
  const state = passwordState(row);
  if (state === 'none') return badge('none', 'warn');
  if (state === 'external') return badge('external', 'muted');
  return state === 'unread' ? badge('unread', 'muted') : 'yes';
};

const enabledCell = (row) => {
  if (row.enabled === false) return badge('disabled', 'warn');
  return row.enabled === undefined ? badge('unread', 'muted') : 'yes';
};

export function accountRows(file) {
  return listOf(file, 'account').map((item) => {
    const id = get(item, 'id');
    const entry = detailOf(file, 'account', id);
    const result = get(entry, 'result');
    const d = result ?? item;
    return {
      target: file.target, file: file.name ?? file.target,
      key: selectionKey(file.target, 'acc', id), id,
      name: String(get(d, 'name') ?? ''),
      description: String(get(d, 'description') ?? ''),
      userType: String(get(d, 'userType') ?? ''),
      privilegeSet: String(get(d, 'privilegeSet') ?? ''),
      enabled: get(d, 'enabled'),
      hasPassword: get(d, 'hasPassword'),
      forceExpire: get(d, 'forceExpire'),
      builtIn: get(d, 'builtIn') === true,
      detail: result ?? null,
      error: get(entry, 'error') ?? null,
    };
  });
}

export function privilegeSetRows(file) {
  return listOf(file, 'privilegeSet').map((item) => {
    const id = get(item, 'id');
    const entry = detailOf(file, 'privilegeSet', id);
    const result = get(entry, 'result');
    const d = result ?? item;
    return {
      target: file.target, file: file.name ?? file.target,
      key: selectionKey(file.target, 'priv', id), id,
      name: String(get(d, 'name') ?? ''),
      description: String(get(d, 'description') ?? ''),
      builtIn: get(d, 'builtIn') === true,
      records: accessSummary(get(d, 'records')),
      layouts: accessSummary(get(d, 'layouts')),
      scripts: accessSummary(get(d, 'scripts')),
      valueLists: accessSummary(get(d, 'valueLists')),
      // fm's own area objects, kept so the cells and the per-item tables read
      // the overrides rather than the flattened summary.
      areas: {
        records: get(d, 'records'), layouts: get(d, 'layouts'),
        scripts: get(d, 'scripts'), valueLists: get(d, 'valueLists'),
      },
      extendedPrivileges: get(d, 'extendedPrivileges') ?? [],
      fileOptions: get(d, 'fileOptions') ?? {},
      passwordExpirationDays: get(d, 'passwordExpirationDays'),
      minPasswordLength: get(d, 'minPasswordLength'),
      detail: result ?? null,
      error: get(entry, 'error') ?? null,
    };
  });
}

/** No describe exists for either catalog: the list item is the whole row. */
export function extendedPrivilegeRows(file) {
  return listOf(file, 'extendedPrivilege').map((item) => ({
    target: file.target, file: file.name ?? file.target,
    id: get(item, 'id'), name: String(get(item, 'name') ?? ''), builtIn: get(item, 'builtIn') === true,
  }));
}

export function authorizationRows(file) {
  return listOf(file, 'authorization').map((item) => ({
    target: file.target, file: file.name ?? file.target,
    id: get(item, 'id'), type: String(get(item, 'type') ?? ''), uuid: String(get(item, 'uuid') ?? ''),
    filenames: get(item, 'filenames') ?? [],
    filenamesRaw: String(get(item, 'filenamesRaw') ?? ''),
    authorizedBy: String(get(item, 'authorizedBy') ?? ''),
    authorizedAt: String(get(item, 'authorizedAt') ?? ''),
    hasHash: get(item, 'hasHash') === true,
    hasToken: get(item, 'hasToken') === true,
  }));
}

const rowsOf = (solution, of) => Object.values(solution.files).flatMap((f) => of(f));

export function securityTotals(solution) {
  const accounts = rowsOf(solution, accountRows);
  return {
    accounts: accounts.length,
    privilegeSets: rowsOf(solution, privilegeSetRows).length,
    extendedPrivileges: rowsOf(solution, extendedPrivilegeRows).length,
    noPassword: accounts.filter((r) => passwordState(r) === 'none').length,
    disabled: accounts.filter((r) => r.enabled === false).length,
  };
}

export const selectionOf = (view) => kindSelection(view?.selection, ['acc', 'priv']);

function securityTotalsLine(solution) {
  const t = securityTotals(solution);
  return totalsLine([
    ['Accounts', t.accounts], ['Privilege sets', t.privilegeSets],
    ['Extended privileges', t.extendedPrivileges],
    ['No password', t.noPassword], ['Disabled', t.disabled],
  ]);
}

const ACCOUNT_COLUMNS = [
  { key: 'name', label: 'Name', render: (r) => link(`security/${r.key}`, r.name) },
  { key: 'userType', label: 'User type' },
  { key: 'privilegeSet', label: 'Privilege set' },
  { key: 'enabled', label: 'Enabled', render: enabledCell },
  { key: 'hasPassword', label: 'Password', render: passwordCell },
  { key: 'forceExpire', label: 'Force expire', render: (r) => (r.forceExpire === true ? badge('forced', 'info') : 'no') },
  { key: 'builtIn', label: 'Built-in', render: (r) => (r.builtIn ? badge('built-in', 'muted') : '') },
];
function renderAccounts(solution, view, rows) {
  const shown = rows.filter((r) => matches(r.name, view.filter) || matches(r.privilegeSet, view.filter));
  const body = securityTotalsLine(solution)
    + table(withFile(ACCOUNT_COLUMNS, view), shown, { empty: 'No accounts', rowAttrs: selectRow(view.selection) });
  return section('Accounts', body, { actions: catalogActions(solution, 'account', view, 'accounts') });
}

const PRIV_COLUMNS = [
  { key: 'name', label: 'Name', render: (r) => link(`security/${r.key}`, r.name) },
  { key: 'description', label: 'Description' },
  { key: 'builtIn', label: 'Built-in', render: (r) => (r.builtIn ? badge('built-in', 'muted') : '') },
  { key: 'records', label: 'Records', render: (r) => accessCell(r.areas.records, 'records') },
  { key: 'layouts', label: 'Layouts', render: (r) => accessCell(r.areas.layouts, 'layouts') },
  { key: 'scripts', label: 'Scripts', render: (r) => accessCell(r.areas.scripts, 'scripts') },
  { key: 'valueLists', label: 'Value lists', render: (r) => accessCell(r.areas.valueLists, 'valueLists') },
  { key: 'extendedPrivileges', label: 'Ext. privileges', num: true, render: (r) => count(r.extendedPrivileges.length) },
];
function renderPrivilegeSets(solution, view, rows) {
  const shown = rows.filter((r) => matches(r.name, view.filter) || matches(r.description, view.filter));
  const body = table(withFile(PRIV_COLUMNS, view), shown, { empty: 'No privilege sets', rowAttrs: selectRow(view.selection) });
  return section('Privilege sets', body, { actions: catalogActions(solution, 'privilegeSet', view, 'privilege sets') });
}

const EXT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'builtIn', label: 'Built-in', render: (r) => (r.builtIn ? badge('built-in', 'muted') : '') },
];
function renderExtendedPrivileges(solution, view, rows) {
  const shown = rows.filter((r) => matches(r.name, view.filter));
  const body = table(withFile(EXT_COLUMNS, view), shown, { empty: 'No extended privileges' });
  return section('Extended privileges', body, { actions: catalogActions(solution, 'extendedPrivilege', view, 'extended privileges') });
}

const AUTH_COLUMNS = [
  { key: 'type', label: 'Type' },
  { key: 'filenamesRaw', label: 'Files' },
  { key: 'authorizedBy', label: 'Authorized by' },
  { key: 'authorizedAt', label: 'Authorized at' },
  { key: 'hasHash', label: 'Hash', render: (r) => (r.hasHash ? badge('hash', 'info') : '') },
  { key: 'hasToken', label: 'Token', render: (r) => (r.hasToken ? badge('token', 'info') : '') },
];
function renderAuthorizations(solution, view, rows) {
  const shown = rows.filter((r) => matches(r.filenamesRaw, view.filter) || matches(r.authorizedBy, view.filter));
  const body = table(withFile(AUTH_COLUMNS, view), shown, { empty: 'No authorizations' });
  return section('Authorizations', body, { actions: catalogActions(solution, 'authorization', view, 'authorizations') });
}

function accountPairs(row) {
  return [
    ['Description', esc(row.description) || '(none)'],
    ['User type', esc(row.userType)],
    ['Privilege set', esc(row.privilegeSet)],
    ['Enabled', enabledCell(row)],
    ['Password', passwordCell(row)],
    ['Force expire', row.forceExpire === true ? 'yes' : 'no'],
    ['Built-in', row.builtIn ? 'yes' : 'no'],
  ];
}

function privPairs(row) {
  const trueFlags = Object.entries(row.fileOptions).filter(([, v]) => v === true).map(([k]) => k);
  return [
    ['Description', esc(row.description) || '(none)'],
    ['Password expiration', count(row.passwordExpirationDays) + ' day(s)'],
    ['Min password length', count(row.minPasswordLength)],
    ['Records', accessCell(row.areas.records, 'records')],
    ['Layouts', accessCell(row.areas.layouts, 'layouts')],
    ['Scripts', accessCell(row.areas.scripts, 'scripts')],
    ['Value lists', accessCell(row.areas.valueLists, 'valueLists')],
    ['Extended privileges', row.extendedPrivileges.map((p) => esc(p)).join(', ') || '(none)'],
    ['File options', trueFlags.map((f) => badge(f, 'info')).join(' ') || '(none)'],
  ];
}

/** The per-item overrides: the tables, layouts, scripts and value lists a
 *  privilege set singles out. fm reports each item's own access plus, on a
 *  record override, the calculations that gate view/edit/delete -- the row shows
 *  a `calc` badge for each one present rather than the calculation text, which
 *  belongs on the object itself. Everything here is fm's own spelling, read
 *  through `get` and escaped. */
const CALC_OF = { view: 'viewCalculation', edit: 'editCalculation', delete: 'deleteCalculation' };

function recordCell(item, key) {
  const value = esc(String(get(item, key) ?? ''));
  const calcKey = CALC_OF[key];
  return calcKey && get(item, calcKey) ? `${value} ${badge('calc', 'info')}` : value;
}

/** `limited · 7 field(s)`: the blanket field access plus how many fields the
 *  table names one by one. */
function recordFieldCell(item) {
  const fields = get(item, 'fields');
  if (fields === undefined || fields === null) return '';
  const access = esc(String(get(fields, 'access') ?? ''));
  const named = get(fields, 'fields');
  const n = Array.isArray(named) ? named.length : 0;
  return n ? `${access} &middot; ${count(n)} field(s)` : access;
}

const RECORD_COLUMNS = [
  { key: 'name', label: 'Table', render: (i) => esc(String(get(i, 'name') ?? '')) },
  { key: 'view', label: 'View', render: (i) => recordCell(i, 'view') },
  { key: 'edit', label: 'Edit', render: (i) => recordCell(i, 'edit') },
  { key: 'create', label: 'Create', render: (i) => recordCell(i, 'create') },
  { key: 'delete', label: 'Delete', render: (i) => recordCell(i, 'delete') },
  { key: 'fields', label: 'Fields', render: recordFieldCell },
];
const NAME_ACCESS_COLUMNS = [
  { key: 'name', label: 'Name', render: (i) => esc(String(get(i, 'name') ?? '')) },
  { key: 'access', label: 'Access', render: (i) => esc(String(get(i, 'access') ?? '')) },
];
const LAYOUT_COLUMNS = [
  ...NAME_ACCESS_COLUMNS,
  { key: 'records', label: 'Records', render: (i) => esc(String(get(i, 'records') ?? '')) },
];

const PER_ITEM_AREAS = [
  { area: 'records', title: 'Records', columns: RECORD_COLUMNS },
  { area: 'layouts', title: 'Layouts', columns: LAYOUT_COLUMNS },
  { area: 'scripts', title: 'Scripts', columns: NAME_ACCESS_COLUMNS },
  { area: 'valueLists', title: 'Value lists', columns: NAME_ACCESS_COLUMNS },
];

export function perItemAccess(row) {
  const blocks = PER_ITEM_AREAS.map(({ area, title, columns }) => {
    const items = overridesOf(row.areas[area], area);
    if (!items.length) return '';
    return `<h4>${esc(title)} ${count(items.length)}</h4>` + table(columns, items, { empty: 'None' });
  }).filter(Boolean);
  if (!blocks.length) return '';
  return `<details open><summary>Per-item access</summary>${blocks.join('')}</details>`;
}

function renderSelected(solution, view) {
  const sel = selectionOf(view);
  const file = sel && solution.files[sel.target];
  if (!file) return '';
  const catalog = sel.kind === 'acc' ? 'account' : 'privilegeSet';
  const rows = sel.kind === 'acc' ? accountRows(file) : privilegeSetRows(file);
  const row = rows.find((r) => String(r.id) === sel.id);
  if (!row) return '';
  const label = sel.kind === 'acc' ? 'Account' : 'Privilege set';
  const title = `${label} ${row.name}${view.multiFile ? ` (${file.name ?? file.target})` : ''}`;
  const actions = rereadObjectButton({ kind: 'object', target: file.target, catalog, key: String(row.id) }, `Re-read ${label.toLowerCase()}`);
  if (row.error || !row.detail) {
    const code = esc(get(row.error, 'code') ?? 'unread');
    return section(title, `<p class="error">${code}: ${esc(get(row.error, 'message') ?? `no describe for this ${label.toLowerCase()}`)}</p>`, { actions });
  }
  const body = sel.kind === 'acc'
    ? kv(accountPairs(row))
    : kv(privPairs(row)) + perItemAccess(row);
  return section(title, body, { actions });
}

export const tab = {
  id: 'security',
  label: 'Security',
  render(solution, view = {}) {
    const accounts = rowsOf(solution, accountRows);
    const privilegeSets = rowsOf(solution, privilegeSetRows);
    const extendedPrivileges = rowsOf(solution, extendedPrivilegeRows);
    const authorizations = rowsOf(solution, authorizationRows);
    return renderAccounts(solution, view, accounts)
      + renderPrivilegeSets(solution, view, privilegeSets)
      + renderExtendedPrivileges(solution, view, extendedPrivileges)
      + renderAuthorizations(solution, view, authorizations)
      + renderSelected(solution, view);
  },
};
