// ui/app.js
// Boot: the api, the shell, discovery. Everything the page draws comes from a tab
// module; this file owns only the header, the busy guard and window.inspector.
import { createApi } from './api.js';
import { discover, reread } from './discovery.js';
import { createShell } from './shell.js';
import { tab as solutionTab } from './tabs/solution.js';
import { tab as tablesTab } from './tabs/tables.js';
import { tab as graphTab } from './tabs/graph.js';

const TABS = [solutionTab, tablesTab, graphTab];

const api = createApi('');
const $ = (id) => document.getElementById(id);
let solution = null;
let ctx = null;
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
  ctx = await api.context();
  $('context').textContent = `${ctx.root} as ${ctx.username}, fm ${ctx.cli.version}`;
  solution = await discover(api, ctx.root, { onProgress: progress });
}

function render() {
  if (!solution) return;
  $('context').textContent = `${solution.root} as ${ctx?.username ?? '?'}, fm ${solution.cli?.version ?? '?'}, read ${solution.readAt ?? '...'}`;
  shell.setSolution(solution);
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
  mount: { nav: $('nav'), main: $('main'), filter: $('filter'), context: $('context') },
  onReread: rereadSlot,
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
  shell,
};

run('Discovering the solution', discoverSolution);
