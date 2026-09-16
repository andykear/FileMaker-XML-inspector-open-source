// ui/dom.js
// The few HTML helpers every tab uses. Pure functions to strings; browser safe.
export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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

export function link(hash, label) {
  return `<a href="#${hash.split('/').map(encodeURIComponent).join('/')}">${esc(label)}</a>`;
}

export function kv(pairs) {
  return `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v ?? ''}</dd>`).join('')}</dl>`;
}

export function section(title, body, opts = {}) {
  return `<section class="panel"><header><h2>${esc(title)}</h2>${opts.actions ?? ''}</header>${body}</section>`;
}

export function table(columns, rows, opts = {}) {
  if (!rows.length) return `<p class="empty">${esc(opts.empty ?? 'None')}</p>`;
  const head = columns.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('');
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
