// ui/tabs/tables.js
// The Tables tab: every base table of every reached file with its field counts, and --
// when a table is selected -- that table's fields, the five sublists the legacy
// inspector drew, and the button that re-reads just this table's fields. A pure
// renderer: no document, every fm option read through access.js, every string escaped.
import { count, esc, link, matches, section, table } from '../dom.js';
import { get, path } from '../access.js';

export function fieldsOf(file, tableName) {
  const detail = get(path(file, 'catalogs.field'), 'detailById');
  return path(get(detail, `table:${tableName}`), 'result.items') ?? [];
}

export function fieldKind(field) {
  // fm's three fieldType values are normal, calculated and summary.
  const type = path(field, 'options.fieldType');
  if (type === 'calculated') return 'calc';
  if (type === 'summary') return 'summary';
  if (path(field, 'options.global')) return 'global';
  if (path(field, 'type') === 'container') return 'container';
  return 'normal';
}

export function fieldStorage(field) {
  if (path(field, 'options.global')) return 'global';
  return path(field, 'options.stored') === false ? 'unstored' : 'stored';
}

/** The source a lookup or a summary points at, as `occurrence::field`. */
function fieldRef(ref) {
  const name = get(ref, 'field');
  if (!name) return '';
  const occurrence = get(ref, 'occurrence');
  return occurrence ? `${occurrence}::${name}` : String(name);
}

export function autoEnterSummary(field) {
  const auto = path(field, 'options.autoEnter');
  const type = get(auto, 'type');
  if (!type || type === 'none') return '';
  const detail = path(auto, 'calculation.text')
    ?? get(auto, 'constant')
    ?? get(auto, 'variable')
    ?? fieldRef(path(auto, 'lookup.source'));
  return detail ? `${type}: ${detail}` : String(type);
}

export function validationSummary(field) {
  const validation = path(field, 'options.validation');
  if (!validation || typeof validation !== 'object') return '';
  return Object.entries(validation).filter(([, on]) => on === true).map(([rule]) => rule).join(', ');
}

/** Calc fields show their calculation; summaries show what they summarise. */
export function calcSummary(field) {
  if (fieldKind(field) === 'calc') return path(field, 'options.calculation.text') ?? '';
  const summary = path(field, 'options.summary');
  if (!summary) return '';
  const of = fieldRef(get(summary, 'field'));
  return [get(summary, 'type'), of && `of ${of}`, get(summary, 'running') && 'running'].filter(Boolean).join(' ');
}

/** The five sublists of the legacy `s.tables.detail.*`, and the table-row counts.
 *  Independent predicates, not one kind each: a global container is both. */
export const FIELD_GROUPS = [
  { id: 'calc', label: 'Calc fields', test: (f) => fieldKind(f) === 'calc' },
  { id: 'summary', label: 'Summary fields', test: (f) => path(f, 'options.fieldType') === 'summary' },
  { id: 'global', label: 'Global fields', test: (f) => !!path(f, 'options.global') },
  { id: 'container', label: 'Container fields', test: (f) => path(f, 'type') === 'container' },
  { id: 'autoEntry', label: 'Auto-entry fields', test: (f) => autoEnterSummary(f) !== '' },
];

export function tableCounts(fields) {
  const counts = { fields: fields.length, unstoredCalc: 0, storedCalc: 0 };
  for (const g of FIELD_GROUPS) counts[g.id] = fields.filter(g.test).length;
  for (const f of fields) {
    if (fieldKind(f) !== 'calc') continue;
    // A global calculation is neither stored nor unstored: it belongs to neither bucket.
    const storage = fieldStorage(f);
    if (storage === 'unstored') counts.unstoredCalc += 1;
    else if (storage === 'stored') counts.storedCalc += 1;
  }
  return counts;
}

export function selectionOf(view) {
  const sel = view?.selection;
  const at = typeof sel === 'string' ? sel.indexOf('|') : -1;
  return at < 0 ? null : { target: sel.slice(0, at), table: sel.slice(at + 1) };
}

function slotAttr(slot) {
  return JSON.stringify(slot).replace(/[&<>']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;' }[c]));
}

function rereadCatalog(target, label) {
  return `<button data-reread-catalog="table" data-target="${esc(target)}">${esc(label)}</button>`;
}

function rereadObject(target, tableName) {
  const slot = { kind: 'object', target, catalog: 'field', key: `table:${tableName}` };
  return `<button data-reread-object='${slotAttr(slot)}'>Re-read fields</button>`;
}

const num = (key) => ({ key, num: true, render: (r) => count(r[key]) });

function tableColumns(multiFile) {
  return [
    ...(multiFile ? [{ key: 'file', label: 'File' }] : []),
    { key: 'name', label: 'Table', render: (r) => link(`tables/${r.key}`, r.name) },
    { ...num('fields'), label: 'Fields' },
    { ...num('calc'), label: 'Calc' },
    { ...num('unstoredCalc'), label: 'Unstored calc' },
    { ...num('global'), label: 'Global' },
    { ...num('container'), label: 'Container' },
    { ...num('summary'), label: 'Summary' },
    { ...num('autoEntry'), label: 'Auto-entry' },
  ];
}

function tableRows(solution) {
  const rows = [];
  for (const file of Object.values(solution.files)) {
    for (const t of path(file, 'catalogs.table.list') ?? []) {
      rows.push({
        ...tableCounts(fieldsOf(file, t.name)),
        file: file.name ?? file.target,
        target: file.target,
        name: t.name,
        key: `${file.target}|${t.name}`,
      });
    }
  }
  return rows;
}

function totals(rows) {
  const sum = (key) => rows.reduce((n, r) => n + r[key], 0);
  const pairs = [
    ['Tables', rows.length],
    ['Fields', sum('fields')],
    ['Calc fields', sum('calc')],
    ['Stored calc', sum('storedCalc')],
    ['Unstored calc', sum('unstoredCalc')],
  ];
  return `<p class="muted totals">${pairs.map(([k, v]) => `${esc(k)} ${count(v)}`).join(' &middot; ')}</p>`;
}

function renderTables(solution, view) {
  // The totals are the scoreboard for the whole model, so they read the unfiltered rows.
  const all = tableRows(solution);
  const rows = all.filter((r) => matches(r.name, view.filter));
  const actions = Object.values(solution.files)
    .map((f) => rereadCatalog(f.target, view.multiFile ? `Re-read ${f.name ?? f.target}` : 'Re-read tables'))
    .join(' ');
  const selected = view.selection;
  const body = totals(all) + table(tableColumns(view.multiFile), rows, {
    empty: 'No tables',
    rowAttrs: (r) => `data-select="${esc(r.key)}"${r.key === selected ? ' class="selected"' : ''}`,
  });
  return section('Base tables', body, { actions });
}

const FIELD_COLUMNS = [
  { key: 'name', label: 'Field' },
  { key: 'type', label: 'Type' },
  { key: 'kind', label: 'Kind' },
  { key: 'storage', label: 'Storage' },
  { key: 'repetitions', label: 'Reps', num: true, render: (r) => count(r.repetitions) },
  { key: 'indexing', label: 'Indexing' },
  { key: 'autoEnter', label: 'Auto-enter' },
  { key: 'validation', label: 'Validation' },
  { key: 'calc', label: 'Calc', render: (r) => (r.calc ? `<code>${esc(r.calc)}</code>` : '') },
  { key: 'tags', label: 'Tags' },
];

function fieldRow(field) {
  return {
    field,
    name: get(field, 'name') ?? '',
    type: get(field, 'type') ?? '',
    kind: fieldKind(field),
    storage: fieldStorage(field),
    repetitions: path(field, 'options.repetitions') ?? 1,
    indexing: path(field, 'options.indexing') ?? '',
    autoEnter: autoEnterSummary(field),
    validation: validationSummary(field),
    calc: calcSummary(field),
    tags: (path(field, 'options.tags') ?? []).join(', '),
  };
}

function sublists(rows) {
  return FIELD_GROUPS.map((g) => {
    const named = rows.filter((r) => g.test(r.field)).map((r) => r.name);
    const body = named.length
      ? `<ul>${named.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
      : '<p class="empty">None</p>';
    return `<details><summary>${esc(g.label)} (${named.length})</summary>${body}</details>`;
  }).join('');
}

function renderFields(solution, view) {
  const sel = selectionOf(view);
  const file = sel && solution.files[sel.target];
  if (!file) return '';
  const fields = fieldsOf(file, sel.table);
  const entry = get(get(path(file, 'catalogs.field'), 'detailById'), `table:${sel.table}`);
  if (!entry) return '';
  const rows = fields.map(fieldRow).filter((r) => matches(r.name, view.filter) || matches(r.calc, view.filter));
  const error = get(entry, 'error');
  const body = error
    ? `<p class="error">${esc(get(error, 'code'))}: ${esc(get(error, 'message'))}</p>`
    : table(FIELD_COLUMNS, rows, { empty: 'No fields' }) + `<div class="sublists">${sublists(rows)}</div>`;
  const title = `Fields of ${sel.table}${view.multiFile ? ` (${file.name ?? file.target})` : ''}`;
  return section(title, body, { actions: rereadObject(file.target, sel.table) });
}

export const tab = {
  id: 'tables',
  label: 'Tables',
  render(solution, view = {}) {
    return renderTables(solution, view) + renderFields(solution, view);
  },
};
