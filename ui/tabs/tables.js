// ui/tabs/tables.js
// The Tables tab: every base table of every reached file with its field counts, and --
// when a table is selected -- that table's fields, the five sublists the legacy
// inspector drew, and the button that re-reads just this table's fields. A pure
// renderer: no document, every fm option read through access.js, every string escaped.
import { count, esc, link, matches, rereadObjectButton, section, table } from '../dom.js';
import { get, path } from '../access.js';
import { catalogActions, listOf, selectRow, selectionKey, selectionTail, totalsLine, withFile } from './common.js';

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

/** A table name may itself carry a colon, so the tab takes the whole tail. */
export function selectionOf(view) {
  const parsed = selectionTail(view?.selection);
  return parsed && { target: parsed.target, table: parsed.tail };
}

const num = (key) => ({ key, num: true, render: (r) => count(r[key]) });

function tableColumns(view) {
  return withFile([
    { key: 'name', label: 'Table', render: (r) => link(`tables/${r.key}`, r.name) },
    { ...num('fields'), label: 'Fields' },
    { ...num('calc'), label: 'Calc' },
    { ...num('unstoredCalc'), label: 'Unstored calc' },
    { ...num('global'), label: 'Global' },
    { ...num('container'), label: 'Container' },
    { ...num('summary'), label: 'Summary' },
    { ...num('autoEntry'), label: 'Auto-entry' },
  ], view);
}

function tableRows(solution) {
  const rows = [];
  for (const file of Object.values(solution.files)) {
    for (const t of listOf(file, 'table')) {
      rows.push({
        ...tableCounts(fieldsOf(file, t.name)),
        file: file.name ?? file.target,
        target: file.target,
        name: t.name,
        key: selectionKey(file.target, t.name),
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
  return totalsLine(pairs);
}

function renderTables(solution, view) {
  // The totals are the scoreboard for the whole model, so they read the unfiltered rows.
  const all = tableRows(solution);
  const rows = all.filter((r) => matches(r.name, view.filter));
  const body = totals(all) + table(tableColumns(view), rows, {
    empty: 'No tables', rowAttrs: selectRow(view.selection),
  });
  return section('Base tables', body, { actions: catalogActions(solution, 'table', view, 'tables') });
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
  { key: 'comment', label: 'Comment' },
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
    comment: String(path(field, 'options.comment') ?? ''),
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
  const rows = fields.map(fieldRow)
    .filter((r) => matches(r.name, view.filter) || matches(r.calc, view.filter) || matches(r.comment, view.filter));
  const error = get(entry, 'error');
  const body = error
    ? `<p class="error">${esc(get(error, 'code'))}: ${esc(get(error, 'message'))}</p>`
    : table(FIELD_COLUMNS, rows, { empty: 'No fields' }) + `<div class="sublists">${sublists(rows)}</div>`;
  const title = `Fields of ${sel.table}${view.multiFile ? ` (${file.name ?? file.target})` : ''}`;
  const slot = { kind: 'object', target: file.target, catalog: 'field', key: `table:${sel.table}` };
  return section(title, body, { actions: rereadObjectButton(slot, 'Re-read fields') });
}

export const tab = {
  id: 'tables',
  label: 'Tables',
  render(solution, view = {}) {
    return renderTables(solution, view) + renderFields(solution, view);
  },
};
