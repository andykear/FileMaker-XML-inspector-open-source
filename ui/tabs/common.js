// ui/tabs/common.js
// The handful of things every tab did for itself: reaching into a file's model,
// the File column of a multi-file view, the selectable row, the totals line, the
// re-read buttons of a catalog, and the one selection-string shape. Pure
// functions to strings and plain objects, like the rest of ui/: no document, no
// server, every fm key through access.js and every model string through esc.
import { count, esc, link, rereadCatalogButton } from '../dom.js';
import { get, path } from '../access.js';

/** A catalog's list, or `[]` when the file has no such catalog (a hand-made
 *  file in a test, a catalog fm's build does not have). */
export const listOf = (file, catalog) => path(file, `catalogs.${catalog}.list`) ?? [];

/** One described object of a catalog, by id. The key is always a string: fm's
 *  ids are numbers and the model's `detailById` keys are not. */
export const detailOf = (file, catalog, id) => get(path(file, `catalogs.${catalog}.detailById`), String(id));

/** What a file calls itself, for the File column and for any prose that names
 *  one; the target when the read never learned a name. */
export const fileName = (solution, target) => get(get(solution, 'files'), target)?.name ?? target;

/** A link when there is a tab that shows the thing, its plain name when there
 *  is not -- a kind no tab routes (a variable, a style with no theme) must read
 *  as text rather than as a link that goes nowhere. */
export const linkOr = (hash, label) => (hash ? link(hash, label) : esc(label));

/** Which tab shows a catalog's rows, as a bare tab id (`'tables'`, not
 *  `'#tables'`) -- the tabs already scope by file when there is more than one,
 *  so a selection per catalog on top of that would be a second scheme for the
 *  same thing. `target` is unused today; it names the file the question is
 *  about, kept in the signature for whatever needs it next. Unknown catalog
 *  -> `null`, which `linkOr` renders as plain text rather than a dead link. */
const CATALOG_TABS = {
  table: 'tables',
  field: 'tables',
  tableOccurrence: 'graph',
  relation: 'graph',
  graphNote: 'graph',
  layout: 'layouts',
  script: 'scripts',
  account: 'security',
  privilegeSet: 'security',
  extendedPrivilege: 'security',
  authorization: 'security',
  theme: 'themes',
  valueList: 'catalogs',
  customFunction: 'catalogs',
  customMenu: 'catalogs',
  customMenuSet: 'catalogs',
  externalDataSource: 'catalogs',
  baseDirectory: 'catalogs',
  persistentData: 'catalogs',
  font: 'catalogs',
};

export function catalogHash(catalog, target) {
  return CATALOG_TABS[catalog] ?? null;
}

/** A byte count the way a reader thinks in it: bare bytes under 1024, then
 *  KB/MB/GB with one decimal, dropping a trailing `.0` (`1048576` -> `'1 MB'`).
 *  Not a finite number (fm's error shape, `undefined`, text) -> `''`, so a
 *  caller can tell "no size" from "zero bytes". The unit is chosen on the
 *  ROUNDED value at each step, not the raw one -- deciding on the raw value
 *  and rounding after lets a value just under a boundary (`1048575`) round up
 *  to `'1024 KB'` instead of stepping up to `'1 MB'`. */
export function byteSize(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  if (num < 1024) return `${num} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = num;
  let unit = 'B';
  for (const u of units) {
    const next = Math.round((value / 1024) * 10) / 10;
    unit = u;
    if (next < 1024 || u === 'GB') { value = next; break; }
    value = value / 1024;
  }
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${unit}`;
}

/** What an emptied table says. A table emptied BY THE FILTER has not found
 *  nothing, it has been narrowed to nothing, and saying "none" there
 *  contradicts the count in the heading above it. */
export const emptyNote = (total, none) => (total ? 'None match the filter' : none);

/** A Get() answer longer than this is a document, not a value, and is folded. fm
 *  returns Get ( FileLocaleElements ) as ~1.5k of JSON: as one key/value line it
 *  buries the twenty facts around it. */
export const FACT_FOLD = 160;

/** One of a file's facts: fm's answer, or fm's error where the answer should be.
 *  A long answer folds into a <details> and is shown for what it is -- text the
 *  file gave us -- inside a <pre>, which is also where a reader can select it. */
export function factValue(v) {
  const value = get(v, 'value');
  if (value === undefined) {
    const error = get(v, 'error');
    return `<span class="error">${esc(get(error, 'code') ?? 'unread')}: ${esc(get(error, 'message') ?? '')}</span>`;
  }
  const text = String(value ?? '');
  if (text.length <= FACT_FOLD) return esc(text);
  return `<details><summary>${esc(text.slice(0, FACT_FOLD))}\u2026 <span class="muted">(${count(text.length)} chars)</span></summary>`
    + `<pre>${esc(text)}</pre></details>`;
}

/** `3 steps`, `1 step`: a count and the word it counts, agreeing. */
export const plural = (n, word) => `${count(n)} ${n === 1 ? word : `${word}s`}`;

/** The File column only earns its width when more than one file was reached. */
export const withFile = (columns, view) => (view?.multiFile ? [{ key: 'file', label: 'File' }, ...columns] : columns);

/** The `rowAttrs` of a selectable table: the row's own key raw in `data-select`
 *  (the shell reads it back verbatim and hands it to buildHash), and `selected`
 *  on the row the view is showing. */
export const selectRow = (selected) => (r) => `data-select="${esc(r.key)}"${r.key === selected ? ' class="selected"' : ''}`;

/** The scoreboard line above a table. Always solution-wide: a filter narrows
 *  what a table lists, never what the totals count. */
export function totalsLine(pairs) {
  return `<p class="muted totals">${pairs.map(([k, v]) => `${esc(k)} ${count(v)}`).join(' &middot; ')}</p>`;
}

/** One re-read button per reached file. With one file the button names what it
 *  re-reads ("Re-read value lists"); with several it names the file instead,
 *  because which file is then the question. */
export function catalogActions(solution, catalog, view, what) {
  return Object.values(solution.files)
    .map((f) => rereadCatalogButton(f.target, catalog, view?.multiFile ? `Re-read ${f.name ?? f.target}` : `Re-read ${what}`))
    .join(' ');
}

/** One selection shape for every tab: the target, a `|`, then the parts the tab
 *  needs joined with `:`. The string rides raw in `data-select` and (encoded
 *  once) in the hash. What the parts mean is the tab's business -- `acc` and an
 *  account id here, a table name there -- so a tab that wants the whole tail
 *  back, colons and all, joins the parts again. */
export function selectionKey(target, ...parts) {
  return `${target}|${parts.join(':')}`;
}

export function parseSelection(sel) {
  const at = typeof sel === 'string' ? sel.indexOf('|') : -1;
  if (at < 0) return null;
  return { target: sel.slice(0, at), parts: sel.slice(at + 1).split(':') };
}

/** The tail of a selection as one string, for the tabs whose part is a name
 *  that may itself carry a colon. */
export function selectionTail(sel) {
  const parsed = parseSelection(sel);
  return parsed && { target: parsed.target, tail: parsed.parts.join(':') };
}

/** `<target>|<id>`, optionally `#<something>` naming a coordinate INSIDE that
 *  object -- a step of a script, an object of a layout. The coordinate rides in
 *  the tab's own part rather than as a second selected thing, because it is not
 *  one: a reader picks the script and lands on a line of it. Two tabs wanted the
 *  same shape under two names, so the caller says which (`step`, `object`) and
 *  gets `{ target, id, [field] }` with the field `null` when there is no `#`. */
export function selectionWithTail(sel, field) {
  const parsed = selectionTail(sel);
  if (!parsed) return null;
  const hash = parsed.tail.indexOf('#');
  return {
    target: parsed.target,
    id: hash < 0 ? parsed.tail : parsed.tail.slice(0, hash),
    [field]: hash < 0 ? null : parsed.tail.slice(hash + 1),
  };
}

/** The `{kind}:{id}` selections: the kind must be one the tab knows, or the
 *  selection is not this tab's and there is nothing to show. */
export function kindSelection(sel, kinds) {
  const parsed = parseSelection(sel);
  if (!parsed || parsed.parts.length < 2 || !kinds.includes(parsed.parts[0])) return null;
  return { target: parsed.target, kind: parsed.parts[0], id: parsed.parts.slice(1).join(':') };
}
