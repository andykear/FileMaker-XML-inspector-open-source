// ui/tabs/solution.js
// The Solution tab: one panel per reached file (its facts and its catalog counts, each
// with its re-read button), then the Unreachable list. A pure renderer -- the shell owns
// the clicks, so the buttons only carry the slot they want re-read.
import { esc, kv, section, table } from '../dom.js';
import { catalogCounts } from '../model.js';

function factValue(v) {
  return 'value' in v
    ? esc(v.value)
    : `<span class="error">${esc(v.error.code)}: ${esc(v.error.message)}</span>`;
}

function rereadButton(catalog, target, label) {
  return `<button data-reread-catalog="${esc(catalog)}" data-target="${esc(target)}">${esc(label)}</button>`;
}

const COLUMNS = [
  { key: 'catalog', label: 'Catalog', render: (r) => `${esc(r.catalog)}${r.listError ? ` <span class="error">${esc(r.listError.code)}</span>` : ''}` },
  { key: 'listed', label: 'Listed', num: true },
  { key: 'described', label: 'Described', num: true },
  { key: 'errors', label: 'Errors', num: true, render: (r) => `<span class="${r.errors ? 'error' : ''}">${esc(r.errors)}</span>` },
  { key: 'readAt', label: 'Read at', render: (r) => `<span class="muted">${esc(r.readAt ?? '')}</span>` },
  { key: 'reread', label: '', render: (r) => rereadButton(r.catalog, r.target, 'Re-read') },
];

function renderFile(file) {
  const rows = Object.entries(catalogCounts(file)).map(([catalog, c]) => ({
    catalog,
    listed: c.listed,
    described: c.described,
    errors: c.errors,
    readAt: file.catalogs[catalog].readAt,
    listError: file.catalogs[catalog].listError,
    target: file.target,
  }));
  const title = `${file.name ?? file.target}`;
  const body = `<p class="muted target">${esc(file.target)}</p>`
    + kv(Object.entries(file.facts).map(([k, v]) => [k, factValue(v)]))
    + table(COLUMNS, rows, { empty: 'No catalogs read' });
  return section(title, body, { actions: rereadButton('facts', file.target, 'Re-read facts') });
}

function renderUnreachable(list) {
  if (!list.length) return '';
  const items = list.map((u) => `<li><code>${esc(u.target)}</code> <span class="muted">from ${esc(u.from ?? '')} via ${esc(u.via ?? '')}</span><br>
    <span class="error">${esc(u.error.code)}${u.error.dbError ? ` (DBError ${esc(u.error.dbError)})` : ''}</span>: ${esc(u.error.message)}
    ${u.error.suggestions?.length ? `<ul>${u.error.suggestions.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</li>`).join('');
  return section('Unreachable', `<ul class="unreachable">${items}</ul>`);
}

export const tab = {
  id: 'solution',
  label: 'Solution',
  render(solution) {
    return Object.values(solution.files).map(renderFile).join('') + renderUnreachable(solution.unreachable);
  },
};
