// ui/tabs/security.js
// The Security tab: accounts, privilege sets, extended privileges and authorizations
// of every file reached. Accounts and privilege sets are described one by one (fm's
// `read:account`/`read:privilegeSet` with an id); extended privileges and
// authorizations have no describe, so their row is the list item fm already gave us.
// A pure renderer: no document, every fm key read through access.js, every string
// escaped.
import { badge, count, esc, kv, link, matches, rereadCatalogButton, rereadObjectButton, section, table } from '../dom.js';
import { get, path } from '../access.js';

const listOf = (file, catalog) => path(file, `catalogs.${catalog}.list`) ?? [];
const detailOf = (file, catalog, id) => get(path(file, `catalogs.${catalog}.detailById`), String(id));

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

export function accountRows(file) {
  return listOf(file, 'account').map((item) => {
    const id = get(item, 'id');
    const entry = detailOf(file, 'account', id);
    const result = get(entry, 'result');
    const d = result ?? item;
    return {
      target: file.target, file: file.name ?? file.target,
      key: `${file.target}|acc:${id}`, id,
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
      key: `${file.target}|priv:${id}`, id,
      name: String(get(d, 'name') ?? ''),
      description: String(get(d, 'description') ?? ''),
      builtIn: get(d, 'builtIn') === true,
      records: accessSummary(get(d, 'records')),
      layouts: accessSummary(get(d, 'layouts')),
      scripts: accessSummary(get(d, 'scripts')),
      valueLists: accessSummary(get(d, 'valueLists')),
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
    noPassword: accounts.filter((r) => r.hasPassword === false).length,
    disabled: accounts.filter((r) => r.enabled === false).length,
  };
}

export function selectionOf(view) {
  const sel = view?.selection;
  const at = typeof sel === 'string' ? sel.indexOf('|') : -1;
  if (at < 0) return null;
  const m = /^(acc|priv):(.+)$/.exec(sel.slice(at + 1));
  return m ? { target: sel.slice(0, at), kind: m[1], id: m[2] } : null;
}

function totalsLine(solution) {
  const t = securityTotals(solution);
  const pairs = [
    ['Accounts', t.accounts], ['Privilege sets', t.privilegeSets],
    ['Extended privileges', t.extendedPrivileges],
    ['No password', t.noPassword], ['Disabled', t.disabled],
  ];
  return `<p class="muted totals">${pairs.map(([k, v]) => `${esc(k)} ${count(v)}`).join(' &middot; ')}</p>`;
}

const withFile = (multiFile, columns) => (multiFile ? [{ key: 'file', label: 'File' }, ...columns] : columns);
const rowAttrs = (selection) => (r) => `data-select="${esc(r.key)}"${r.key === selection ? ' class="selected"' : ''}`;
const catalogActions = (solution, catalog, multiFile, what) => Object.values(solution.files)
  .map((f) => rereadCatalogButton(f.target, catalog, multiFile ? `Re-read ${f.name ?? f.target}` : `Re-read ${what}`)).join(' ');

const ACCOUNT_COLUMNS = [
  { key: 'name', label: 'Name', render: (r) => link(`security/${r.key}`, r.name) },
  { key: 'userType', label: 'User type' },
  { key: 'privilegeSet', label: 'Privilege set' },
  { key: 'enabled', label: 'Enabled', render: (r) => (r.enabled === false ? badge('disabled', 'warn') : 'yes') },
  { key: 'hasPassword', label: 'Password', render: (r) => (r.hasPassword === false ? badge('none', 'warn') : 'yes') },
  { key: 'forceExpire', label: 'Force expire', render: (r) => (r.forceExpire === true ? badge('forced', 'info') : 'no') },
  { key: 'builtIn', label: 'Built-in', render: (r) => (r.builtIn ? badge('built-in', 'muted') : '') },
];
function renderAccounts(solution, view, rows) {
  const shown = rows.filter((r) => matches(r.name, view.filter) || matches(r.privilegeSet, view.filter));
  const body = totalsLine(solution)
    + table(withFile(view.multiFile, ACCOUNT_COLUMNS), shown, { empty: 'No accounts', rowAttrs: rowAttrs(view.selection) });
  return section('Accounts', body, { actions: catalogActions(solution, 'account', view.multiFile, 'accounts') });
}

const PRIV_COLUMNS = [
  { key: 'name', label: 'Name', render: (r) => link(`security/${r.key}`, r.name) },
  { key: 'description', label: 'Description' },
  { key: 'builtIn', label: 'Built-in', render: (r) => (r.builtIn ? badge('built-in', 'muted') : '') },
  { key: 'records', label: 'Records' },
  { key: 'layouts', label: 'Layouts' },
  { key: 'scripts', label: 'Scripts' },
  { key: 'valueLists', label: 'Value lists' },
  { key: 'extendedPrivileges', label: 'Ext. privileges', num: true, render: (r) => count(r.extendedPrivileges.length) },
];
function renderPrivilegeSets(solution, view, rows) {
  const shown = rows.filter((r) => matches(r.name, view.filter) || matches(r.description, view.filter));
  const body = table(withFile(view.multiFile, PRIV_COLUMNS), shown, { empty: 'No privilege sets', rowAttrs: rowAttrs(view.selection) });
  return section('Privilege sets', body, { actions: catalogActions(solution, 'privilegeSet', view.multiFile, 'privilege sets') });
}

const EXT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'builtIn', label: 'Built-in', render: (r) => (r.builtIn ? badge('built-in', 'muted') : '') },
];
function renderExtendedPrivileges(solution, view, rows) {
  const shown = rows.filter((r) => matches(r.name, view.filter));
  const body = table(withFile(view.multiFile, EXT_COLUMNS), shown, { empty: 'No extended privileges' });
  return section('Extended privileges', body, { actions: catalogActions(solution, 'extendedPrivilege', view.multiFile, 'extended privileges') });
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
  const body = table(withFile(view.multiFile, AUTH_COLUMNS), shown, { empty: 'No authorizations' });
  return section('Authorizations', body, { actions: catalogActions(solution, 'authorization', view.multiFile, 'authorizations') });
}

function accountPairs(row) {
  return [
    ['Description', esc(row.description) || '(none)'],
    ['User type', esc(row.userType)],
    ['Privilege set', esc(row.privilegeSet)],
    ['Enabled', row.enabled === false ? badge('disabled', 'warn') : 'yes'],
    ['Password', row.hasPassword === false ? badge('none', 'warn') : 'yes'],
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
    ['Records', esc(row.records) || '(custom)'],
    ['Layouts', esc(row.layouts) || '(custom)'],
    ['Scripts', esc(row.scripts) || '(custom)'],
    ['Value lists', esc(row.valueLists) || '(custom)'],
    ['Extended privileges', row.extendedPrivileges.map((p) => esc(p)).join(', ') || '(none)'],
    ['File options', trueFlags.map((f) => badge(f, 'info')).join(' ') || '(none)'],
  ];
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
  const body = kv(sel.kind === 'acc' ? accountPairs(row) : privPairs(row));
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
