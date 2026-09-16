// ui/app.js
// Boot: the api, the shell, discovery. Everything the page draws comes from a tab
// module; this file owns only the header, the busy guard and window.inspector.
import { createApi } from './api.js';
import { esc } from './dom.js';
import { discover, reread } from './discovery.js';
import { createShell } from './shell.js';
import { markdownReport } from './export/markdown.js';
import { mermaidCallGraph, mermaidRelationships } from './export/mermaid.js';
import { exportFilename, jsonExport } from './export/json.js';
import { tab as solutionTab } from './tabs/solution.js';
import { tab as tablesTab } from './tabs/tables.js';
import { tab as graphTab } from './tabs/graph.js';
import { tab as scriptsTab } from './tabs/scripts.js';
import { tab as layoutsTab } from './tabs/layouts.js';
import { tab as securityTab } from './tabs/security.js';
import { tab as themesTab } from './tabs/themes.js';
import { tab as analysisTab } from './tabs/analysis.js';
import { tab as explorerTab } from './tabs/explorer.js';
import { tab as catalogsTab } from './tabs/catalogs.js';

const TABS = [solutionTab, tablesTab, graphTab, scriptsTab, layoutsTab, securityTab, themesTab, analysisTab, explorerTab, catalogsTab];

/** What the Export menu's four entries are. The exporters are pure functions to
 *  a string (ui/export/); this file is the only one that knows about Blob, an
 *  object URL and a click. */
const EXPORTS = {
  markdown: { ext: 'md', type: 'text/markdown', of: markdownReport },
  relationships: { ext: 'relationships.mmd', type: 'text/vnd.mermaid', of: mermaidRelationships },
  calls: { ext: 'calls.mmd', type: 'text/vnd.mermaid', of: mermaidCallGraph },
  json: { ext: 'json', type: 'application/json', of: jsonExport },
};

const api = createApi('');
const $ = (id) => document.getElementById(id);
let solution = null;
let ctx = null;
let failure = null;
let busy = false;
let lastProgress = '';
let guardShown = false;

function progress(message) {
  lastProgress = message;
  $('progress').textContent = message;
}

/** The busy guard writes over the running read's own message without recording
 *  it, so the read can put its message back when it finishes. */
function guard(message) {
  guardShown = true;
  $('progress').textContent = message;
}

async function run(label, fn) {
  if (busy) {
    guard('Already reading, wait for it to finish');
    return false;
  }
  busy = true;
  $('reread-solution').disabled = true;
  for (const b of document.querySelectorAll('button[data-reread-catalog], button[data-reread-object]')) b.disabled = true;
  progress(label);
  let ok = true;
  try {
    await fn();
  } catch (e) {
    ok = false;
    failure = e.message;
    progress(`Failed: ${e.message}`);
  } finally {
    busy = false;
    if (guardShown) {
      guardShown = false;
      $('progress').textContent = lastProgress;
    }
    $('reread-solution').disabled = false;
    render();
  }
  return ok;
}

/** Fetches (or refetches) the context, then does a full discovery. Used both
 *  for the initial load and to retry from scratch when solution is still null
 *  (the initial context fetch or discovery failed). */
async function discoverSolution() {
  failure = null;
  ctx = await api.context();
  $('context').textContent = `${ctx.root} as ${ctx.username}, fm ${ctx.cli.version}`;
  solution = await discover(api, ctx.root, { onProgress: progress });
}

function render() {
  if (!solution) {
    // The first read never landed: say so where the page is, not only in the
    // header's progress line, and leave the nav drawn so the page looks alive.
    if (failure) {
      shell.showMessage('<section class="panel"><header><h2>Nothing read</h2></header>'
        + `<p class="error">Read failed: ${esc(failure)}. Press Re-read solution.</p></section>`);
    }
    return;
  }
  $('context').textContent = `${solution.root} as ${ctx?.username ?? '?'}, fm ${solution.cli?.version ?? '?'}, read ${solution.readAt ?? '...'}`;
  $('export').disabled = false;
  shell.setSolution(solution);
}

/** Build the file and hand it to the browser. The object URL is revoked well
 *  after the click rather than immediately: a synchronous revoke races the
 *  download the click just started, and a 4MB JSON export of the reference
 *  solution is exactly the size that loses that race. */
function exportAs(kind) {
  const spec = EXPORTS[kind];
  if (!spec) return;
  if (!solution) {
    guard('Nothing read yet, so there is nothing to export');
    return;
  }
  // The solution this export is OF, held so a re-read finishing meanwhile
  // cannot put another read's data behind this one's filename.
  const from = solution;
  const name = exportFilename(from, spec.ext);
  progress(`Writing ${name}`);
  // The exporters are synchronous and the JSON one is a few megabytes: yield
  // once, so the message above is on screen before the page stops to build it.
  setTimeout(() => {
    const url = URL.createObjectURL(new Blob([spec.of(from)], { type: `${spec.type};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    progress(`Exported ${name}`);
  }, 0);
}

function rereadLabel(slot) {
  if (slot.kind === 'catalog') return `Re-reading ${slot.catalog} of ${slot.target}`;
  if (slot.kind === 'solution') return 'Re-reading the solution';
  return `Re-reading ${slot.kind}`;
}

function rereadSlot(slot) {
  return run(rereadLabel(slot), async () => {
    solution = await reread(api, solution, slot, { onProgress: progress });
  });
}

const shell = createShell({
  tabs: TABS,
  mount: { nav: $('nav'), main: $('main'), filter: $('filter'), export: $('export') },
  onReread: rereadSlot,
  onExport: exportAs,
});

$('reread-solution').addEventListener('click', () => {
  if (!solution) {
    run('Discovering the solution', discoverSolution);
    return;
  }
  rereadSlot({ kind: 'solution' });
});

window.inspector = {
  get solution() { return solution; },
  reread: rereadSlot,
  exportAs,
  shell,
};

run('Discovering the solution', discoverSolution);
