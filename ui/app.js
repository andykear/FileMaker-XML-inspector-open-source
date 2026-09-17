// ui/app.js
// Boot: the api, the shell, discovery. Everything the page draws comes from a tab
// module; this file owns only the header, the busy guard and window.inspector.
import { createApi } from './api.js';
import { esc } from './dom.js';
import { discover, reread } from './discovery.js';
import { createReadLog } from './read-log.js';
import { createShell, parseHash } from './shell.js';
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
import { tab as gapsTab } from './tabs/gaps.js';
import { tab as catalogsTab } from './tabs/catalogs.js';

const TABS = [solutionTab, tablesTab, graphTab, scriptsTab, layoutsTab, securityTab, themesTab, analysisTab, explorerTab, gapsTab, catalogsTab];

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

/** A discovery of the reference solution takes about ten seconds, most of it in
 *  one fm read: the hooks draw a read log in the main area (the page had nothing
 *  there until the first render) and the header keeps its progress line. */
function readHooks() {
  const log = createReadLog();
  return {
    onProgress: progress,
    onPhase: (event) => {
      log.push(event);
      shell.showMessage(log.html());
    },
  };
}

async function run(label, fn) {
  if (busy) {
    guard('Already reading, wait for it to finish');
    return false;
  }
  busy = true;
  $('reread-solution').disabled = true;
  // Every button a tab drew: the re-read buttons and the generic actions (the Gaps
  // tab's two). They are replaced wholesale by the render at the end of this run,
  // which is what enables them again.
  for (const b of document.querySelectorAll('button[data-reread-catalog], button[data-reread-object], button[data-action]')) b.disabled = true;
  progress(label);
  // A read that takes ten seconds has to look like it is still going: the
  // seconds ride on the end of whatever message the read last wrote, and
  // lastProgress is that message without them, so they never accumulate.
  const startedAt = Date.now();
  const ticking = setInterval(() => {
    if (guardShown) return;
    $('progress').textContent = `${lastProgress} · ${Math.round((Date.now() - startedAt) / 1000)} s`;
  }, 500);
  let ok = true;
  try {
    await fn();
  } catch (e) {
    ok = false;
    failure = e.message;
    progress(`Failed: ${e.message}`);
  } finally {
    clearInterval(ticking);
    busy = false;
    // Both the guard's message and the elapsed seconds the interval appended
    // are over the top of the read's own last message: put it back.
    guardShown = false;
    $('progress').textContent = lastProgress;
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
  solution = await discover(api, ctx.root, readHooks());
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
    const previous = solution;
    // A solution-grain re-read is a fresh discovery, so it draws the read log
    // too; the narrower grains send no phase events and the tab stays put.
    solution = await reread(api, solution, slot, readHooks());
    // A full re-read builds a new solution object. The register and the last
    // live check are not read from the file at all, so they survive it -- what
    // fm can report did not change because we read the file again.
    if (previous?.register) solution.register = previous.register;
    if (previous?.gaps) solution.gaps = previous.gaps;
  });
}

/** The coverage register is ~3MB of prose and only the Gaps tab wants it, so it is
 *  fetched when that tab is first shown rather than with the solution. Stored ON the
 *  solution, by mutation: the tabs that memoise on the solution's identity (the
 *  explorer's object list) must not have it replaced under them for a field none of
 *  them reads. */
async function loadRegister() {
  if (!solution) return false;
  if (solution.register) return true;
  return run('Loading the coverage register', async () => {
    solution.register = await api.register();
    progress(`Loaded the coverage register: ${solution.register.length} entries`);
  });
}

/** The register's own probes against the file in front of us. One fm invocation,
 *  every op read-only, and the register is never written back. */
async function runGapsCheck() {
  if (!solution) {
    guard('Nothing read yet, so there is nothing to check');
    return;
  }
  // The register is what the outcome is READ against -- an id and an attribute name
  // mean nothing without it -- so a failed fetch stops the check here, with run()'s
  // own error message on screen rather than a second one over the top of it.
  if (!await loadRegister()) return;
  // The last message a read leaves on screen is the one the reader is left with, so
  // every read says what it DID and not only what it was doing: a line still reading
  // "Running the register's probes" five minutes later reads as a page still working.
  await run('Running the register\'s probes', async () => {
    solution.gaps = await api.gapsCheck(solution.root);
    progress(`Ran ${solution.gaps.entries} of the register's probes`);
  });
}

function onAction(name) {
  if (name === 'gaps-register') return loadRegister();
  if (name === 'gaps-check') return runGapsCheck();
  return undefined;
}

const shell = createShell({
  tabs: TABS,
  mount: { nav: $('nav'), main: $('main'), filter: $('filter'), export: $('export') },
  onReread: rereadSlot,
  onExport: exportAs,
  onAction,
});

// Opening the Gaps tab is what asks for the register; so is landing on it.
window.addEventListener('hashchange', () => {
  if (parseHash(location.hash).tab === gapsTab.id) loadRegister();
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

run('Discovering the solution', discoverSolution).then((ok) => {
  // A page opened straight at #gaps: the hash never changes, so the listener
  // above never fires and the register has to be asked for here.
  if (ok && parseHash(location.hash).tab === gapsTab.id) loadRegister();
});
