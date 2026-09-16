// ui/tabs/catalogs.js
// The Catalogs ("More") tab: everything solution-wide that has no tab of its own --
// file facts, value lists, custom functions, custom menus and menu sets, external
// data sources, base directories, persistent data, fonts and graph notes.
// Authorizations already live on the Security tab; this one just points there.
// A pure renderer: no document, every fm key read through access.js, every string
// escaped.
import {
  badge, count, esc, kv, link, matches, rereadCatalogButton, rereadObjectButton, section, table,
} from '../dom.js';
import { get, path } from '../access.js';
import { stepDisplay } from 'fm-adt-toolkit/step-display';

const listOf = (file, catalog) => path(file, `catalogs.${catalog}.list`) ?? [];
const detailOf = (file, catalog, id) => get(path(file, `catalogs.${catalog}.detailById`), String(id));
const rowsOf = (solution, of) => Object.values(solution.files).flatMap((f) => of(f));
// -- Rows: the three catalogs fm describes one by one -----------------------
function describedRow(file, catalog, prefix, item, extra) {
  const id = get(item, 'id');
  const entry = detailOf(file, catalog, id);
  const result = get(entry, 'result');
  const d = result ?? item;
  return {
    target: file.target, file: file.name ?? file.target, key: `${file.target}|${prefix}:${id}`, id,
    ...extra(d, item), detail: result ?? null, error: get(entry, 'error') ?? null,
  };
}

export function valueListRows(file) {
  return listOf(file, 'valueList').map((item) => describedRow(file, 'valueList', 'vl', item, (d) => ({
    name: String(get(d, 'name') ?? ''), type: String(get(d, 'type') ?? ''),
    position: Number(get(d, 'position')) || 0, values: get(d, 'values') ?? [],
    field: get(d, 'field') ?? null, externalRef: String(get(d, 'valueList') ?? ''),
    options: get(d, 'options') ?? {}, shadow: get(d, 'shadow') === true,
    supportsAutoComplete: get(d, 'supportsAutoComplete') === true,
  })));
}

export function customFunctionRows(file) {
  return listOf(file, 'customFunction').map((item) => describedRow(file, 'customFunction', 'cf', item, (d, raw) => ({
    name: String(get(d, 'name') ?? ''), type: String(get(d, 'type') ?? get(raw, 'type') ?? ''),
    folder: String(get(d, 'folder') ?? ''), position: Number(get(d, 'position')) || 0,
    parameters: get(d, 'parameters') ?? [], body: String(get(d, 'body') ?? ''),
    availableToUser: get(d, 'availableToUser') === true, arity: Number(get(d, 'arity')) || 0,
    prototype: String(get(d, 'prototype') ?? ''), comment: String(get(d, 'comment') ?? ''),
  })));
}

export function customMenuRows(file) {
  return listOf(file, 'customMenu').map((item) => describedRow(file, 'customMenu', 'menu', item, (d) => ({
    name: String(get(d, 'name') ?? ''), position: Number(get(d, 'position')) || 0,
    comment: String(get(d, 'comment') ?? ''), baseMenuID: get(d, 'baseMenuID'),
    browseMode: get(d, 'browseMode') === true, findMode: get(d, 'findMode') === true, previewMode: get(d, 'previewMode') === true,
    overrideName: get(d, 'overrideName') === true, inheritedMenu: get(d, 'inheritedMenu') === true,
    macPlatform: get(d, 'macPlatform') === true, winPlatform: get(d, 'winPlatform') === true, linuxPlatform: get(d, 'linuxPlatform') === true,
    titleCalculation: String(get(d, 'titleCalculation') ?? ''), installCalculation: String(get(d, 'installCalculation') ?? ''),
    tags: get(d, 'tags') ?? [], items: get(d, 'items') ?? [],
  })));
}
// -- Rows: the rest, where fm's list item is already the whole row ----------
function simpleRows(file, catalog, extra) {
  return listOf(file, catalog).map((item) => ({ target: file.target, file: file.name ?? file.target, ...extra(item) }));
}

export const customMenuSetRows = (file) => simpleRows(file, 'customMenuSet', (item) => ({
  id: get(item, 'id'), name: String(get(item, 'name') ?? ''),
  builtIn: get(item, 'builtIn') === true, position: Number(get(item, 'position')) || 0,
}));

export const externalDataSourceRows = (file) => simpleRows(file, 'externalDataSource', (item) => ({
  id: get(item, 'id'), name: String(get(item, 'name') ?? ''), sourceType: String(get(item, 'sourceType') ?? ''),
  paths: get(item, 'paths') ?? [], dsn: String(get(item, 'dsn') ?? ''), hasData: get(item, 'hasData') === true,
}));

export const baseDirectoryRows = (file) => simpleRows(file, 'baseDirectory', (item) => ({
  id: get(item, 'id'), path: String(get(item, 'path') ?? ''),
  absolutePath: String(get(item, 'absolutePath') ?? ''), relative: get(item, 'relative') === true,
}));

/** No `id` on this one: fm's persistent-data entries are told apart by key plus
 *  instance, so the row's own index stands in. */
export const persistentDataRows = (file) => listOf(file, 'persistentData').map((item, i) => ({
  target: file.target, file: file.name ?? file.target, id: i, key: String(get(item, 'key') ?? ''),
  instance: String(path(item, 'instance.name') ?? ''), value: String(get(item, 'value') ?? ''),
  dataType: String(get(item, 'dataType') ?? ''),
}));

export const fontRows = (file) => simpleRows(file, 'font', (item) => ({
  id: get(item, 'id'), name: String(get(item, 'name') ?? ''),
  postScriptName: String(get(item, 'postScriptName') ?? ''), codeSet: String(get(item, 'codeSet') ?? ''),
}));

export const graphNoteRows = (file) => simpleRows(file, 'graphNote', (item) => ({
  id: get(item, 'id'), text: String(get(item, 'text') ?? ''),
  collapsed: get(item, 'collapsed') === true, backgroundColor: String(get(item, 'backgroundColor') ?? ''),
}));
// -- Derived ------------------------------------------------------------------
const TRUNCATE_AT = 80;
const truncate = (s) => (s.length > TRUNCATE_AT ? `${s.slice(0, TRUNCATE_AT)}…` : s);

/** custom -> its values, joined and truncated; field -> occurrence::field, with a
 *  related-only badge; external -> the source name fm's `valueList` string carries
 *  before its "::", or "external" when that string is missing. */
export function valueListSource(row) {
  if (row.type === 'custom') return esc(truncate(row.values.join(', ')));
  if (row.type === 'field') {
    const occ = String(get(row.field, 'occurrence') ?? '');
    const fld = String(get(row.field, 'field') ?? '');
    const related = get(row.options, 'showRelatedOnly') ? ` ${badge('related only', 'info')}` : '';
    return `${esc(`${occ}::${fld}`)}${related}`;
  }
  const src = row.externalRef.includes('::') ? row.externalRef.split('::')[0] : row.externalRef;
  return esc(src) || 'external';
}

export function selectionOf(view) {
  const sel = view?.selection;
  const at = typeof sel === 'string' ? sel.indexOf('|') : -1;
  if (at < 0) return null;
  const m = /^(vl|cf|menu):(.+)$/.exec(sel.slice(at + 1));
  return m ? { target: sel.slice(0, at), kind: m[1], id: m[2] } : null;
}
// -- Rendering: shared helpers ------------------------------------------------
const withFile = (multiFile, columns) => (multiFile ? [{ key: 'file', label: 'File' }, ...columns] : columns);
const rowAttrs = (selection) => (r) => `data-select="${esc(r.key)}"${r.key === selection ? ' class="selected"' : ''}`;
const catalogAction = (solution, catalog, multiFile, what) => Object.values(solution.files)
  .map((f) => rereadCatalogButton(f.target, catalog, multiFile ? `Re-read ${f.name ?? f.target}` : `Re-read ${what}`)).join(' ');

function modesBadges(row) {
  return [row.browseMode && badge('browse', 'good'), row.findMode && badge('find', 'good'), row.previewMode && badge('preview', 'good')]
    .filter(Boolean).join(' ');
}
function platformBadges(row) {
  const flags = [row.macPlatform && 'mac', row.winPlatform && 'win', row.linuxPlatform && 'linux'].filter(Boolean);
  return flags.length ? flags.map((f) => badge(f, 'info')).join(' ') : badge('all platforms', 'muted');
}

const AUTH_NOTE = `<p class="muted">Authorizations live on the ${link('security', 'Authorizations')} tab.</p>`;

const VL_COLUMNS = [
  { key: 'name', label: 'Name', render: (r) => link(`catalogs/${r.key}`, r.name) },
  { key: 'type', label: 'Type' },
  { key: 'source', label: 'Source', render: valueListSource },
];
const CF_COLUMNS = [
  { key: 'name', label: 'Name', render: (r) => link(`catalogs/${r.key}`, r.name) },
  { key: 'type', label: 'Kind', render: (r) => (r.type === 'folder' ? badge('folder', 'muted') : 'function') },
  { key: 'prototype', label: 'Prototype' },
  { key: 'arity', label: 'Arity', num: true, render: (r) => count(r.arity) },
  { key: 'availableToUser', label: 'Available to user', render: (r) => (r.availableToUser ? 'yes' : 'no') },
  { key: 'folder', label: 'Folder' },
];
const MENU_COLUMNS = [
  { key: 'name', label: 'Name', render: (r) => link(`catalogs/${r.key}`, r.name) },
  { key: 'baseMenuID', label: 'Base menu', num: true, render: (r) => count(r.baseMenuID) },
  { key: 'modes', label: 'Modes', render: modesBadges },
  { key: 'platforms', label: 'Platforms', render: platformBadges },
  { key: 'items', label: 'Items', num: true, render: (r) => count(r.items.length) },
];
const MENU_SET_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'builtIn', label: 'Built-in', render: (r) => (r.builtIn ? badge('built-in', 'muted') : '') },
  { key: 'position', label: 'Position', num: true, render: (r) => count(r.position) },
];
const EXT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'sourceType', label: 'Type' },
  { key: 'paths', label: 'Paths', render: (r) => r.paths.map((p) => esc(p)).join(', ') },
  { key: 'dsn', label: 'DSN', render: (r) => esc(r.dsn) },
];
const BASEDIR_COLUMNS = [
  { key: 'path', label: 'Path' },
  { key: 'absolutePath', label: 'Absolute path' },
  { key: 'relative', label: 'Relative', render: (r) => (r.relative ? 'yes' : 'no') },
];
const PERSIST_COLUMNS = [
  { key: 'instance', label: 'Instance', render: (r) => esc(r.instance) || '(default)' },
  { key: 'key', label: 'Key' },
  { key: 'dataType', label: 'Data type' },
  { key: 'value', label: 'Value' },
];
const FONT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'postScriptName', label: 'PostScript name' },
  { key: 'codeSet', label: 'Code set' },
];
const NOTE_COLUMNS = [
  { key: 'text', label: 'Text' },
  { key: 'collapsed', label: 'Collapsed', render: (r) => (r.collapsed ? 'yes' : 'no') },
];

/** One entry per catalog table: the source of the rows, its columns, the totals
 *  key it feeds, and whether it gets `data-select` rows for an object detail pane. */
const CATALOGS = [
  { catalog: 'valueList', title: 'Value lists', what: 'value lists', totalsKey: 'valueLists', rows: valueListRows, columns: VL_COLUMNS, filterKeys: ['name'], selectable: true },
  { catalog: 'customFunction', title: 'Custom functions', what: 'custom functions', totalsKey: 'customFunctions', rows: customFunctionRows, columns: CF_COLUMNS, filterKeys: ['name', 'folder'], selectable: true },
  { catalog: 'customMenu', title: 'Custom menus', what: 'custom menus', totalsKey: 'customMenus', rows: customMenuRows, columns: MENU_COLUMNS, filterKeys: ['name'], selectable: true },
  { catalog: 'customMenuSet', title: 'Custom menu sets', what: 'menu sets', totalsKey: 'customMenuSets', rows: customMenuSetRows, columns: MENU_SET_COLUMNS, filterKeys: ['name'] },
  { catalog: 'externalDataSource', title: 'External data sources', what: 'external data sources', totalsKey: 'externalDataSources', rows: externalDataSourceRows, columns: EXT_COLUMNS, filterKeys: ['name', 'dsn'], note: AUTH_NOTE },
  { catalog: 'baseDirectory', title: 'Base directories', what: 'base directories', totalsKey: 'baseDirectories', rows: baseDirectoryRows, columns: BASEDIR_COLUMNS, filterKeys: ['path'] },
  { catalog: 'persistentData', title: 'Persistent data', what: 'persistent entries', totalsKey: 'persistentData', rows: persistentDataRows, columns: PERSIST_COLUMNS, filterKeys: ['key', 'instance'] },
  { catalog: 'font', title: 'Fonts', what: 'fonts', totalsKey: 'fonts', rows: fontRows, columns: FONT_COLUMNS, filterKeys: ['name', 'postScriptName'] },
  { catalog: 'graphNote', title: 'Graph notes', what: 'graph notes', totalsKey: 'graphNotes', rows: graphNoteRows, columns: NOTE_COLUMNS, filterKeys: ['text'] },
];

export function catalogsTotals(solution) {
  const out = {};
  for (const c of CATALOGS) out[c.totalsKey] = rowsOf(solution, c.rows).length;
  return out;
}

function totalsLine(solution) {
  const t = catalogsTotals(solution);
  const pairs = CATALOGS.map((c) => [c.title, t[c.totalsKey]]);
  return `<p class="muted totals">${pairs.map(([k, v]) => `${esc(k)} ${count(v)}`).join(' &middot; ')}</p>`;
}

/** One table section, built from a `CATALOGS` entry. `selectable` wires up
 *  `data-select` rows for the three catalogs that get an object detail pane. */
function renderCatalog(solution, view, entry) {
  const rows = rowsOf(solution, entry.rows);
  const shown = rows.filter((r) => entry.filterKeys.some((k) => matches(r[k], view.filter)));
  const body = (entry.note ?? '') + table(withFile(view.multiFile, entry.columns), shown, {
    empty: `No ${entry.what}`, rowAttrs: entry.selectable ? rowAttrs(view.selection) : undefined,
  });
  return section(entry.title, body, { actions: catalogAction(solution, entry.catalog, view.multiFile, entry.what) });
}

function factValue(v) {
  return v && 'value' in v ? esc(v.value) : `<span class="error">${esc(v?.error?.code ?? 'unread')}: ${esc(v?.error?.message ?? '')}</span>`;
}

function renderFile(file, multiFile) {
  const title = multiFile ? `File (${file.name ?? file.target})` : 'File';
  const body = kv(Object.entries(file.facts).map(([k, v]) => [k, factValue(v)]));
  return section(title, body, { actions: rereadCatalogButton(file.target, 'facts', 'Re-read facts') });
}
// -- Rendering: selected detail (value list, custom function, custom menu) --
function errorSection(title, row, actions, label) {
  const code = esc(get(row.error, 'code') ?? 'unread');
  return section(title, `<p class="error">${code}: ${esc(get(row.error, 'message') ?? `no describe for this ${label}`)}</p>`, { actions });
}

function valueListPairs(row) {
  const pairs = [
    ['Type', esc(row.type)], ['Position', count(row.position)], ['Source', valueListSource(row)],
    ['Shadow', row.shadow ? 'yes' : 'no'], ['Auto-complete', row.supportsAutoComplete ? 'yes' : 'no'],
  ];
  if (row.type === 'custom') pairs.push(['Values', row.values.map((v) => esc(v)).join(', ') || '(none)']);
  return pairs;
}

function renderValueListDetail(file, sel, view) {
  const row = valueListRows(file).find((r) => String(r.id) === sel.id);
  if (!row) return '';
  const title = `Value list ${row.name}${view.multiFile ? ` (${file.name ?? file.target})` : ''}`;
  const actions = rereadObjectButton({ kind: 'object', target: file.target, catalog: 'valueList', key: String(row.id) }, 'Re-read value list');
  if (row.error || !row.detail) return errorSection(title, row, actions, 'value list');
  return section(title, kv(valueListPairs(row)), { actions });
}

function cfPairs(row) {
  return [
    ['Kind', row.type === 'folder' ? badge('folder', 'muted') : 'function'],
    ['Folder', esc(row.folder) || '(root)'], ['Position', count(row.position)],
    ['Parameters', row.parameters.map((p) => esc(p)).join(', ') || '(none)'], ['Arity', count(row.arity)],
    ['Available to user', row.availableToUser ? 'yes' : 'no'],
    ['Prototype', esc(row.prototype)], ['Comment', esc(row.comment) || '(none)'],
  ];
}

function renderCustomFunctionDetail(file, sel, view) {
  const row = customFunctionRows(file).find((r) => String(r.id) === sel.id);
  if (!row) return '';
  const title = `Custom function ${row.name}${view.multiFile ? ` (${file.name ?? file.target})` : ''}`;
  const actions = rereadObjectButton({ kind: 'object', target: file.target, catalog: 'customFunction', key: String(row.id) }, 'Re-read custom function');
  if (row.error || !row.detail) return errorSection(title, row, actions, 'custom function');
  const body = kv(cfPairs(row)) + (row.type === 'folder' ? '' : `<pre>${esc(row.body)}</pre>`);
  return section(title, body, { actions });
}

function menuPairs(row) {
  return [
    ['Base menu', count(row.baseMenuID)], ['Modes', modesBadges(row)], ['Platforms', platformBadges(row)],
    ['Override name', row.overrideName ? 'yes' : 'no'], ['Inherited', row.inheritedMenu ? 'yes' : 'no'],
    ['Comment', esc(row.comment) || '(none)'], ['Tags', row.tags.map((t) => esc(t)).join(', ') || '(none)'],
  ];
}

/** A command's own name unless it wears an override; a submenu names the menu it
 *  opens; a separator has no name at all. `action` (when present) is shaped
 *  exactly like a script step, so fm's own `stepDisplay` names it the same way
 *  scripts.js does. */
function menuItemName(item) {
  const kind = String(get(item, 'kind') ?? '');
  if (kind === 'separator') return '(separator)';
  if (kind === 'submenu') return esc(String(get(item, 'submenuName') ?? ''));
  return get(item, 'overrideName') === true ? esc(String(get(item, 'nameCalculation') ?? '')) : '(default)';
}
function menuItemAction(item) {
  const action = get(item, 'action');
  if (!action) return String(get(item, 'kind') ?? '') === 'submenu' ? `open ${esc(String(get(item, 'submenuName') ?? ''))}` : '';
  const display = stepDisplay(action);
  const name = esc(String(get(display, 'name') ?? ''));
  const detail = get(display, 'detail');
  return detail ? `${name} <span class="detail">${esc(detail)}</span>` : name;
}
const MENU_ITEM_COLUMNS = [
  { key: 'name', label: 'Name / override', render: (i) => `${menuItemName(i)}${get(i, 'overrideName') === true ? ` ${badge('override', 'info')}` : ''}` },
  { key: 'commandID', label: 'Command ID', num: true, render: (i) => count(get(i, 'commandID')) },
  { key: 'action', label: 'Action', render: menuItemAction },
];

function renderCustomMenuDetail(file, sel, view) {
  const row = customMenuRows(file).find((r) => String(r.id) === sel.id);
  if (!row) return '';
  const title = `Custom menu ${row.name}${view.multiFile ? ` (${file.name ?? file.target})` : ''}`;
  const actions = rereadObjectButton({ kind: 'object', target: file.target, catalog: 'customMenu', key: String(row.id) }, 'Re-read custom menu');
  if (row.error || !row.detail) return errorSection(title, row, actions, 'custom menu');
  const body = kv(menuPairs(row))
    + `<h3>Title calculation</h3><pre>${esc(row.titleCalculation) || '(none)'}</pre>`
    + `<h3>Install calculation</h3><pre>${esc(row.installCalculation) || '(none)'}</pre>`
    + '<h3>Items</h3>' + table(MENU_ITEM_COLUMNS, row.items, { empty: 'No items' });
  return section(title, body, { actions });
}

function renderSelected(solution, view) {
  const sel = selectionOf(view);
  const file = sel && solution.files[sel.target];
  if (!file) return '';
  if (sel.kind === 'vl') return renderValueListDetail(file, sel, view);
  if (sel.kind === 'cf') return renderCustomFunctionDetail(file, sel, view);
  return renderCustomMenuDetail(file, sel, view);
}
// -- The tab -------------------------------------------------------------------
export const tab = {
  id: 'catalogs',
  label: 'More',
  render(solution, view = {}) {
    const files = Object.values(solution.files).map((f) => renderFile(f, view.multiFile)).join('');
    const sections = CATALOGS.map((entry) => renderCatalog(solution, view, entry)).join('');
    return totalsLine(solution) + files + sections + renderSelected(solution, view);
  },
};
