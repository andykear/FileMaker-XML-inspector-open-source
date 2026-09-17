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

/** What an emptied table says. A table emptied BY THE FILTER has not found
 *  nothing, it has been narrowed to nothing, and saying "none" there
 *  contradicts the count in the heading above it. */
export const emptyNote = (total, none) => (total ? 'None match the filter' : none);

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

/** The `{kind}:{id}` selections: the kind must be one the tab knows, or the
 *  selection is not this tab's and there is nothing to show. */
export function kindSelection(sel, kinds) {
  const parsed = parseSelection(sel);
  if (!parsed || parsed.parts.length < 2 || !kinds.includes(parsed.parts[0])) return null;
  return { target: parsed.target, kind: parsed.parts[0], id: parsed.parts.slice(1).join(':') };
}
