// ui/dom.js
// The few HTML helpers every tab uses. Pure functions to strings; browser safe.
export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** The hash is `#<tab>` or `#<tab>/<selection>`, the selection percent-encoded
 *  once as a whole -- it carries `|`, `:` and `/` of its own. These two live here
 *  rather than in shell.js because `link` builds its href through buildHash, and
 *  ui/dom.js is the layer below the shell. shell.js re-exports them. */
export function parseHash(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (!h) return { tab: null, selection: null };
  const [tab, ...rest] = h.split('/');
  return { tab, selection: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

export function buildHash(tab, selection) {
  return selection ? `#${tab}/${encodeURIComponent(selection)}` : `#${tab}`;
}

export function matches(text, filter) {
  return !filter || String(text).toLowerCase().includes(filter);
}

export function count(n) {
  return `<span class="num">${Number(n) || 0}</span>`;
}

export function badge(text, tone = 'muted') {
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

/** `link('scripts/<target>|39', name)`: everything before the first `/` is the
 *  tab, the rest is the selection, and buildHash is what turns the pair into an
 *  href -- so a link and the hash the shell writes on a click agree by
 *  construction rather than by two encoders that happen to match. */
export function link(hash, label) {
  const at = hash.indexOf('/');
  const tab = at < 0 ? hash : hash.slice(0, at);
  const selection = at < 0 ? null : hash.slice(at + 1);
  return `<a href="${buildHash(tab, selection)}">${esc(label)}</a>`;
}

export function kv(pairs) {
  return `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v ?? ''}</dd>`).join('')}</dl>`;
}

export function section(title, body, opts = {}) {
  return `<section class="panel"><header><h2>${esc(title)}</h2>${opts.actions ?? ''}</header>${body}</section>`;
}

export function table(columns, rows, opts = {}) {
  if (!rows.length) return `<p class="empty">${esc(opts.empty ?? 'None')}</p>`;
  // A column may carry a `title`: the sentence that says what the column's
  // values MEAN, hung on the header where a reader looks for it rather than
  // repeated in prose above the table.
  // Every header says how its column sorts, which is all the shell needs to sort
  // a table it knows nothing else about -- one attribute here makes every table
  // in every tab sortable. A column opts out with `sort: false`: a button column
  // has nothing to sort by. The "Click to sort" hint only goes on a header with
  // no title of its own, because a title that says what the values MEAN is worth
  // more than one that says what a click does.
  const head = columns.map((c) => {
    const sort = c.sort === false ? '' : ` data-sort="${c.num ? 'num' : 'text'}"`;
    const title = c.title ? ` title="${esc(c.title)}"` : (sort ? ' title="Click to sort"' : '');
    return `<th${c.num ? ' class="num"' : ''}${sort}${title}>${esc(c.label)}</th>`;
  }).join('');
  const body = rows.map((r) => {
    const cells = columns.map((c) => {
      const html = c.render ? c.render(r) : esc(r[c.key] ?? '');
      return `<td${c.num ? ' class="num"' : ''}>${html}</td>`;
    }).join('');
    const attrs = opts.rowAttrs ? ' ' + opts.rowAttrs(r) : '';
    return `<tr${attrs}>${cells}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** Case- and accent-insensitive, and built once: a new Intl.Collator per
 *  comparison is the expensive half of sorting a thousand-row table. */
const COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });

/** Sorts rendered rows, not model rows: `rows` is `[{ cells: [text…] }]`, the
 *  textContent of each `<td>`, `index` the column, `kind` the header's
 *  `data-sort` (`num` or `text`) and `direction` `asc` or `desc`. Pure: a new
 *  array of the same row objects, so the caller can move the elements it kept
 *  alongside them. Stable -- equal cells keep the order the tab rendered them
 *  in, which is the tab's own sort and the only order a reader had before. */
export function sortRows(rows, index, kind, direction) {
  const dir = direction === 'desc' ? -1 : 1;
  const textOf = (r) => String(r?.cells?.[index] ?? '');
  // The digits out of whatever the cell rendered around them: count() writes
  // `<span class="num">12</span>`, whose textContent is `12`, and a size cell
  // reads `82.5 MB`. A cell with no digit at all is not a number -- empty, `-`,
  // `n/a` -- and NaN is how that travels to the comparison below.
  const numberOf = (text) => {
    const digits = text.replace(/[^\d.-]/g, '');
    return /\d/.test(digits) ? Number(digits) : NaN;
  };
  // Decorate, sort, undecorate: each row's key is read out of the cell once
  // rather than once per comparison, which for n rows is n reads instead of
  // n log n. Same order, same comparisons -- only the key lookup moves.
  return rows
    .map((row, i) => {
      const text = textOf(row);
      return { row, i, text, num: kind === 'num' ? numberOf(text) : 0 };
    })
    .sort((a, b) => {
      if (kind === 'num') {
        const [x, y] = [a.num, b.num];
        const xBad = Number.isNaN(x);
        const yBad = Number.isNaN(y);
        // Not a number is MISSING, not small: it sits at the bottom whichever
        // way the column points, so a toggle never walks the blanks up through
        // the numbers a reader is looking at.
        if (xBad || yBad) return xBad && yBad ? a.i - b.i : (xBad ? 1 : -1);
        return (x < y ? -1 : x > y ? 1 : 0) * dir || a.i - b.i;
      }
      return COLLATOR.compare(a.text, b.text) * dir || a.i - b.i;
    })
    .map((d) => d.row);
}

/** A re-read slot rides in an attribute the shell parses back with JSON.parse, so it is
 *  serialised as JSON and escaped for a single-quoted attribute (the `"` of JSON must
 *  survive, `'` must not). */
export function slotAttr(slot) {
  return JSON.stringify(slot).replace(/[&<>']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;' }[c]));
}

export function rereadCatalogButton(target, catalog, label = 'Re-read') {
  return `<button data-reread-catalog="${esc(catalog)}" data-target="${esc(target)}">${esc(label)}</button>`;
}

/** `slot` is `{ kind: 'object', target, catalog, key }` — the shape ui/discovery.js reread() takes. */
export function rereadObjectButton(slot, label = 'Re-read') {
  return `<button data-reread-object='${slotAttr(slot)}'>${esc(label)}</button>`;
}
