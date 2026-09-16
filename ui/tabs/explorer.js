// ui/tabs/explorer.js
// The Reference Explorer: pick any named object of the solution and see both
// directions at once -- what it names ("References") and what names it
// ("Referenced by") -- with a link that lands on the object's own tab.
//
// Everything here is read from ui/analysis/refs.js: `nameIndex` is the list of
// pickable objects, `references` is both tables. The one piece of knowledge
// this file owns is `refHash`, the map from a reference's kind and id to the
// tab that shows it; ui/tabs/analysis.js imports it rather than repeating it.
//
// A pure renderer: no document, every fm key through access.js, every model
// string through esc.
import { badge, count, esc, link, matches, section, table } from '../dom.js';
import { emptyNote, fileName, kindSelection, linkOr, selectRow, selectionKey, totalsLine, withFile } from './common.js';
import { memoise } from '../analysis/memo.js';
import { nameIndex, references } from '../analysis/refs.js';
import { callGraph, callTreeOf, scriptKey } from '../analysis/scripts.js';

// ── Where a kind is shown ─────────────────────────────────────────────

// The kinds a reference (or a naming record) can have, and the tab selection
// that shows one. `occurrence` is what a reference calls a table occurrence and
// `tableOccurrence` what a naming record calls itself -- the same object, so
// both spellings are here. A `style` needs its theme's id to be found and a
// reference does not carry one, and a `variable` has no catalog at all: both
// land on `null`, which renders as plain text rather than a dead link.
const HASH_OF = {
  script: (t, id) => `scripts/${selectionKey(t, id)}`,
  layout: (t, id) => `layouts/${selectionKey(t, id)}`,
  layoutObject: (t, id) => {
    const at = String(id).indexOf('.');
    return at < 0 ? `layouts/${selectionKey(t, id)}` : `layouts/${selectionKey(t, String(id).slice(0, at))}#${String(id).slice(at + 1)}`;
  },
  table: (t, id) => `tables/${selectionKey(t, id)}`,
  // A field is shown inside its base table, and a field's id is
  // `BaseTable::Field` -- so is a field reference's name, for the occurrence.
  field: (t, id) => `tables/${selectionKey(t, String(id).split('::')[0])}`,
  occurrence: (t, id) => `graph/${selectionKey(t, 'to', id)}`,
  tableOccurrence: (t, id) => `graph/${selectionKey(t, 'to', id)}`,
  relation: (t, id) => `graph/${selectionKey(t, 'rel', id)}`,
  valueList: (t, id) => `catalogs/${selectionKey(t, 'vl', id)}`,
  customFunction: (t, id) => `catalogs/${selectionKey(t, 'cf', id)}`,
  customMenu: (t, id) => `catalogs/${selectionKey(t, 'menu', id)}`,
  theme: (t, id) => `themes/${selectionKey(t, id)}`,
};

/** The tab hash that shows one object, or null when no tab does. */
export function refHash(kind, target, id) {
  const make = HASH_OF[kind];
  return make && id !== undefined && id !== null && id !== '' ? make(target, id) : null;
}

// ── The pickable objects ──────────────────────────────────────────────

// The seven kinds a name can mean, in the order the list shows them. The second
// item is the nameIndex map, the third the label.
const KINDS = [
  ['table', 'tables', 'Table'],
  ['occurrence', 'occurrences', 'Table occurrence'],
  ['field', 'fields', 'Field'],
  ['script', 'scripts', 'Script'],
  ['layout', 'layouts', 'Layout'],
  ['valueList', 'valueLists', 'Value list'],
  ['customFunction', 'customFunctions', 'Custom function'],
];
const LABEL_OF = Object.fromEntries(KINDS.map(([k, , label]) => [k, label]));
const ORDER_OF = Object.fromEntries(KINDS.map(([k], i) => [k, i]));

/** Where the NAME was written. For a field of an external occurrence that is
 *  the file holding the occurrence, not the file holding the field: `TO::Field`
 *  is a name of the first file's making (see ui/analysis/refs.js). */
const nameTarget = (entry) => entry.occurrenceTarget ?? entry.target;

// A table is selected by its name (the Tables tab keys on the name) and a field
// by `Occurrence::Field`; everything else by fm's own id.
const idOf = (kind, entry) => (kind === 'table' || kind === 'field' ? entry.name : String(entry.id));

/** Every named object of every reached file, one row each, sorted by kind then
 *  name. Memoised through ui/analysis/memo.js, which keys on the catalog slots
 *  a re-read swaps rather than on the solution object, so a catalog or object
 *  re-read recomputes the list. */
export const objectEntries = (solution) => memoise(solution, computeObjectEntries);

function computeObjectEntries(solution) {
  const idx = nameIndex(solution);
  const out = [];
  for (const [kind, map] of KINDS) {
    for (const entries of idx[map].values()) {
      for (const entry of entries) {
        const target = nameTarget(entry);
        const id = idOf(kind, entry);
        out.push({
          kind, target, id, entry,
          name: String(entry.name ?? ''),
          file: fileName(solution, target),
          detail: String(entry.table ?? entry.folder ?? ''),
          key: selectionKey(target, kind, id),
        });
      }
    }
  }
  out.sort((a, b) => ORDER_OF[a.kind] - ORDER_OF[b.kind] || a.name.localeCompare(b.name) || a.target.localeCompare(b.target));
  Object.freeze(out);
  return out;
}

/** `<target>|<kind>:<id>`, the id joined back together so a field's `::`
 *  survives the split. */
export const selectionOf = (view) => kindSelection(view?.selection, KINDS.map(([k]) => k));

const entryFor = (solution, sel) => (sel
  ? objectEntries(solution).find((e) => e.kind === sel.kind && e.target === sel.target && e.id === sel.id)
  : undefined);

// ── The two directions ────────────────────────────────────────────────

/** Which reference records belong to this object. A layout owns its objects'
 *  references too: a reader asking what a layout names means the whole layout. */
function isFrom(sel, entry, ref) {
  const from = ref.from;
  const id = String(from.id);
  if (sel.kind === 'layout') {
    if (from.target !== sel.target) return false;
    return (from.kind === 'layout' && id === sel.id) || (from.kind === 'layoutObject' && id.startsWith(`${sel.id}.`));
  }
  if (sel.kind === 'field') {
    // A field's own record lives in the file that owns the FIELD, and its id
    // there is `BaseTable::Field` -- not the `Occurrence::Field` of the key.
    return from.kind === 'field' && from.target === entry.entry.target && id === `${entry.entry.table}::${entry.entry.field}`;
  }
  if (sel.kind === 'table') {
    // A table has no record of its own that names anything; its fields do.
    return from.kind === 'field' && from.target === sel.target && id.startsWith(`${sel.id}::`);
  }
  const kind = sel.kind === 'occurrence' ? 'tableOccurrence' : sel.kind;
  return from.kind === kind && from.target === sel.target && id === sel.id;
}

/** Which of several objects of one name a reference meant: the one in the
 *  naming file, or the only one there is. The rule ui/analysis/scripts.js uses
 *  for the call graph, so a link here and an edge there agree. */
const ownerOf = (entries, ref) =>
  entries.find((e) => nameTarget(e) === ref.from.target) ?? (entries.length === 1 ? entries[0] : undefined);

/** What the selected object names. */
export function outgoing(solution, sel) {
  const entry = entryFor(solution, sel);
  if (!entry) return [];
  const idx = nameIndex(solution);
  return references(solution).filter((ref) => isFrom(sel, entry, ref)).map((ref) => {
    const map = idx[(KINDS.find(([k]) => k === ref.kind) ?? [])[1]];
    const to = map ? ownerOf(map.get(ref.name) ?? [], ref) : undefined;
    return {
      kind: ref.kind, name: ref.name, where: ref.from.where ?? '', how: ref.how, resolved: ref.resolved,
      hash: to ? refHash(ref.kind, nameTarget(to), idOf(ref.kind, to)) : null,
    };
  });
}

/** What names the selected object. */
export function incoming(solution, sel) {
  const entry = entryFor(solution, sel);
  if (!entry) return [];
  const map = nameIndex(solution)[(KINDS.find(([k]) => k === sel.kind) ?? [])[1]];
  const entries = map.get(entry.name) ?? [];
  return references(solution).filter((ref) => ref.kind === sel.kind && ref.name === entry.name
    && ownerOf(entries, ref) === entry.entry).map((ref) => ({
    kind: ref.from.kind, name: String(ref.from.name ?? ''), where: ref.from.where ?? '', how: ref.how,
    target: ref.from.target, hash: refHash(ref.from.kind, ref.from.target, ref.from.id),
  }));
}

// ── Render ────────────────────────────────────────────────────────────

const LIST_COLUMNS = [
  { key: 'kind', label: 'Kind', render: (r) => esc(LABEL_OF[r.kind]) },
  { key: 'name', label: 'Name', render: (r) => link(`explorer/${r.key}`, r.name) },
  { key: 'detail', label: 'Table / folder' },
];

const REF_COLUMNS = [
  { key: 'kind', label: 'Kind' },
  { key: 'name', label: 'Name', render: (r) => linkOr(r.hash, r.name) },
  { key: 'where', label: 'Where' },
  { key: 'how', label: 'How', render: (r) => badge(r.how, r.how === 'named' ? 'good' : 'muted') },
  { key: 'link', label: 'Go to', render: (r) => (r.hash ? link(r.hash, r.hash.slice(0, r.hash.indexOf('/'))) : '') },
];

const refMatches = (r, filter) => matches(r.kind, filter) || matches(r.name, filter) || matches(r.where, filter);

function renderList(solution, view) {
  const rows = objectEntries(solution);
  const shown = rows.filter((r) => matches(r.name, view.filter) || matches(r.kind, view.filter) || matches(r.detail, view.filter));
  const byKind = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  const totals = totalsLine([['Objects', rows.length], ...KINDS.map(([k, , label]) => [label, byKind[k] ?? 0])]);
  const body = totals
    + `<p class="muted">Showing ${count(shown.length)} of ${count(rows.length)}. Pick one to see both directions.</p>`
    + table(withFile(LIST_COLUMNS, view), shown, {
      empty: emptyNote(rows.length, 'Nothing named was read'),
      rowAttrs: selectRow(view.selection),
    });
  return section('Objects', body);
}

/** One `<li>` per node, its children nested inside it. The tree is already
 *  cycle-safe and depth-capped (ui/analysis/scripts.js callTreeOf); this only
 *  says so on the page. */
function treeHtml(node) {
  const label = node.resolved
    ? linkOr(refHash('script', node.target, node.id), node.name)
    : esc(node.name);
  const tags = [
    node.via ? badge(node.via, 'info') : '',
    node.resolved ? '' : badge('unresolved', 'bad'),
    node.cycle ? badge('cycle', 'warn') : '',
    node.truncated ? badge('more below', 'muted') : '',
  ].filter(Boolean).join(' ');
  const kids = node.children.length ? `<ul class="calltree">${node.children.map(treeHtml).join('')}</ul>` : '';
  return `<li>${label} ${tags}${kids}</li>`;
}

function callTreeSection(solution, sel) {
  if (sel.kind !== 'script') return '';
  const tree = callTreeOf(callGraph(solution), scriptKey(sel.target, sel.id), 3);
  if (!tree) return '';
  return '<h3>Call tree</h3>'
    + '<p class="muted">What this script calls, three levels down. A script already on the path is marked and not walked again.</p>'
    + `<ul class="calltree">${treeHtml(tree)}</ul>`;
}

function renderSelected(solution, view) {
  const sel = selectionOf(view);
  if (!sel) return '';
  const entry = entryFor(solution, sel);
  if (!entry) {
    return section('Nothing selected', `<p class="empty">Nothing of that name was read: ${esc(view.selection)}</p>`);
  }
  const allOut = outgoing(solution, sel);
  const allBack = incoming(solution, sel);
  const out = allOut.filter((r) => refMatches(r, view.filter));
  const back = allBack.filter((r) => refMatches(r, view.filter));
  const own = refHash(sel.kind, sel.target, sel.id);
  const title = `${LABEL_OF[sel.kind]} ${entry.name}${view.multiFile ? ` (${entry.file})` : ''}`;
  const body = `<p class="muted">${own ? link(own, 'Open on its own tab') : 'No tab of its own.'}</p>`
    + '<h3>References</h3>'
    + '<p class="muted">What this object names.</p>'
    + table(REF_COLUMNS, out, { empty: emptyNote(allOut.length, 'Names nothing') })
    + '<h3>Referenced by</h3>'
    + '<p class="muted">What names this object.</p>'
    + table(REF_COLUMNS, back, { empty: emptyNote(allBack.length, 'Nothing names it') })
    + callTreeSection(solution, sel);
  return section(title, body);
}

export const tab = {
  id: 'explorer',
  label: 'Explorer',
  render(solution, view = {}) {
    return renderList(solution, view) + renderSelected(solution, view);
  },
};
