// ui/app.js
import { createApi } from './api.js';
import { discover, reread } from './discovery.js';
import { catalogCounts } from './model.js';

const api = createApi('');
const $ = (id) => document.getElementById(id);
let solution = null;
let busy = false;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function progress(message) {
  $('progress').textContent = message;
}

async function run(label, fn) {
  if (busy) return;
  busy = true;
  $('reread-solution').disabled = true;
  progress(label);
  try {
    await fn();
  } catch (e) {
    progress(`Failed: ${e.message}`);
  } finally {
    busy = false;
    $('reread-solution').disabled = false;
    render();
  }
}

function renderFile(file) {
  const counts = catalogCounts(file);
  const facts = Object.entries(file.facts).map(([k, v]) =>
    `<dt>${esc(k)}</dt><dd>${'value' in v ? esc(v.value) : `<span class="error">${esc(v.error.code)}: ${esc(v.error.message)}</span>`}</dd>`).join('');
  const rows = Object.entries(counts).map(([catalog, c]) => {
    const slot = file.catalogs[catalog];
    const listErr = slot.listError ? `<span class="error">${esc(slot.listError.code)}</span>` : '';
    return `<tr><td>${esc(catalog)} ${listErr}</td><td class="num">${c.listed}</td><td class="num">${c.described}</td><td class="num ${c.errors ? 'error' : ''}">${c.errors}</td><td class="muted">${esc(slot.readAt ?? '')}</td><td><button data-reread-catalog="${esc(catalog)}" data-target="${esc(file.target)}">Re-read</button></td></tr>`;
  }).join('');
  return `<section>
    <h2>${esc(file.name ?? file.target)} <span class="muted">${esc(file.target)}</span></h2>
    <dl>${facts}</dl>
    <table><thead><tr><th>Catalog</th><th>Listed</th><th>Described</th><th>Errors</th><th>Read at</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function renderUnreachable(list) {
  if (!list.length) return '';
  const items = list.map((u) => `<li><code>${esc(u.target)}</code> <span class="muted">from ${esc(u.from ?? '')} via ${esc(u.via ?? '')}</span><br>
    <span class="error">${esc(u.error.code)}${u.error.dbError ? ` (DBError ${esc(u.error.dbError)})` : ''}</span>: ${esc(u.error.message)}
    ${u.error.suggestions?.length ? `<ul>${u.error.suggestions.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</li>`).join('');
  return `<section><h2>Unreachable</h2><ul>${items}</ul></section>`;
}

function render() {
  if (!solution) return;
  $('context').textContent = `${solution.root}, fm ${solution.cli?.version ?? '?'}, read ${solution.readAt ?? '...'}`;
  $('solution').innerHTML = Object.values(solution.files).map(renderFile).join('') + renderUnreachable(solution.unreachable);
}

$('solution').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-reread-catalog]');
  if (!b) return;
  const slot = { kind: 'catalog', target: b.dataset.target, catalog: b.dataset.rereadCatalog };
  run(`Re-reading ${slot.catalog} of ${slot.target}`, async () => { solution = await reread(api, solution, slot); });
});

$('reread-solution').addEventListener('click', () => {
  run('Re-reading the solution', async () => { solution = await reread(api, solution, { kind: 'solution' }); });
});

window.inspector = {
  get solution() { return solution; },
  reread: (slot) => run(`Re-reading ${slot.kind}`, async () => { solution = await reread(api, solution, slot); }),
};

const ctx = await api.context();
$('context').textContent = `${ctx.root} as ${ctx.username}, fm ${ctx.cli.version}`;
run('Discovering the solution', async () => {
  solution = await discover(api, ctx.root, { onProgress: progress });
});
