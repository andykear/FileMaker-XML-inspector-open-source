// ui/tabs/scripts.js
// The Scripts tab: the script tree as FileMaker folds it, one selected script rendered
// step by step through the toolkit's shared renderer, and the step index across every
// file reached. A pure renderer: no document, every fm key read through access.js,
// every string escaped. Nothing here knows how a step is spelled -- stepDisplay does.
//
// A step is anchored on FileMaker's own 1-based line (`#L<line>`), because that
// is the only step coordinate every tab already carries: the Analysis rows, the
// globals set sites and the Explorer's `lineOf` all count `body[i] + 1`. It is
// NOT fm's `stepID`, which is the step TYPE (141 is every Set Variable, 89 every
// comment) and repeats hundreds of times in one script. The identity that would
// survive an edit above it is fm's per-step `uuid`, which every body step
// carries; a later link could anchor on that once an analysis row carries it.
import { badge, count, esc, kv, link, matches, rereadObjectButton, section, table } from '../dom.js';
import { get, path } from '../access.js';
import { stepDisplay } from 'fm-adt-toolkit/step-display';
import { memoise } from '../analysis/memo.js';
import { catalogActions, detailOf, listOf, selectionKey, selectionWithTail, totalsLine } from './common.js';

const scriptsOf = (file) => listOf(file, 'script');
const entryOf = (file, id) => detailOf(file, 'script', id);
const entriesOf = (file) => Object.values(path(file, 'catalogs.script.detailById') ?? {});
const detailsOf = (file) => entriesOf(file).map((e) => get(e, 'result')).filter(Boolean);
const bodyOf = (detail) => get(detail, 'body') ?? [];

/** A folder's own key is its full path, the same spelling a script's `folder` carries.
 *  Folder items seed their group so a folder holding no scripts still shows. fm's third
 *  list type, `separator`, is the divider line FileMaker draws: it has no id worth
 *  selecting and no steps, so the tree passes over it. */
export function scriptTree(file) {
  const groups = new Map();
  const at = (folder) => {
    if (!groups.has(folder)) groups.set(folder, { folder, scripts: [] });
    return groups.get(folder);
  };
  for (const item of scriptsOf(file)) {
    const folder = get(item, 'folder') ?? '';
    const type = get(item, 'type');
    if (type === 'folder') at([folder, get(item, 'name')].filter(Boolean).join('/'));
    else if (type === 'script') at(folder).scripts.push(item);
  }
  return [...groups.values()];
}

/** One pass: an opener raises the depth of every index strictly between its own
 *  `start` and `end`, so nested openers accumulate. A branch or a closer belongs to
 *  its opener's row, not to the block it punctuates, so it is pulled back after. */
export function depths(body) {
  const depth = new Array(body.length).fill(0);
  for (const step of body) {
    const block = get(step, 'block');
    if (get(block, 'role') !== 'opener') continue;
    const end = Math.min(Number(get(block, 'end')), depth.length);
    for (let i = Math.max(Number(get(block, 'start')) + 1, 0); i < end; i += 1) depth[i] += 1;
  }
  body.forEach((step, i) => {
    const block = get(step, 'block');
    const role = get(block, 'role');
    if (role !== 'branch' && role !== 'closer') return;
    const start = Number(get(block, 'start'));
    if (depth[start] !== undefined) depth[i] = depth[start];
  });
  return depth;
}

/** The step part of a selection tail, from the line the analyses hand over. One
 *  spelling, exported, so a tab that links here writes `#${stepPart(line)}` and
 *  this tab reads the same string back out of `selectionOf`. */
export const stepPart = (line) => `L${line}`;

/** The anchor of one step: the script's own id and the step part, so two scripts
 *  on one page never collide and two steps of one TYPE never share an id the way
 *  `stepID` would. `step-` is the prefix the shell scrolls to.
 *
 *  A describe that carried no id (a hand-made record in a test, a read fm
 *  answered without one) drops that half rather than spelling it `undefined`:
 *  one script is on the page at a time, so `step-L83` still names the step, and
 *  an id that reads as a word no script has is worse than no id at all. */
export const stepAnchor = (scriptId, line) => {
  const owner = scriptId === undefined || scriptId === null || scriptId === '' ? '' : `${scriptId}-`;
  return `step-${owner}${stepPart(line)}`;
};

/** The step list itself. `--depth` carries the indent at any nesting; the class is
 *  what a test and a stylesheet match on. `selected` is the `#L<line>` tail of the
 *  selection, so the one step a link named is marked and the shell scrolls to it. */
export function renderScript(detail, selected = null) {
  const body = bodyOf(detail);
  const depth = depths(body);
  const scriptId = get(detail, 'id');
  const rows = body.map((step, i) => {
    const display = stepDisplay(step);
    const d = depth[i];
    const line = i + 1;
    const mine = selected !== null && selected !== undefined && String(selected) === stepPart(line);
    const cls = `depth-${d}${get(step, 'disabled') === true ? ' disabled' : ''}${mine ? ' selected' : ''}`;
    const indent = d > 0 ? ` style="--depth:${d}"` : '';
    const text = get(display, 'detail');
    const tail = text ? ` <span class="detail">${esc(text)}</span>` : '';
    return `<li id="${esc(stepAnchor(scriptId, line))}" data-step="${esc(get(step, 'stepID'))}" class="${cls}"${indent}>`
      + `<span class="ln">${line}</span><b>${esc(get(display, 'name'))}</b>${tail}</li>`;
  }).join('');
  return `<ol class="script">${rows}</ol>`;
}

/** How often each step type is used, and in how many scripts, across every file.
 *  Every step of every script of every file, so it is memoised through
 *  ui/analysis/memo.js, which keys on the catalog slots a re-read swaps at any
 *  grain (`list`, `detailById`) rather than on the solution object. */
export const stepIndex = (solution) => memoise(solution, computeStepIndex);

function computeStepIndex(solution) {
  const counts = new Map();
  for (const file of Object.values(solution?.files ?? {})) {
    for (const detail of detailsOf(file)) {
      const seen = new Set();
      for (const step of bodyOf(detail)) {
        const name = String(get(step, 'step') ?? '');
        if (!counts.has(name)) counts.set(name, { step: name, count: 0, scripts: 0 });
        const row = counts.get(name);
        row.count += 1;
        if (!seen.has(name)) { seen.add(name); row.scripts += 1; }
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.step.localeCompare(b.step));
}

/** An opener whose `end` is not a closer row: fm reported a block it could not close. */
function unbalanced(detail) {
  const body = bodyOf(detail);
  return body.some((step) => {
    const block = get(step, 'block');
    if (get(block, 'role') !== 'opener') return false;
    return get(path(body[Number(get(block, 'end'))] ?? {}, 'block'), 'role') !== 'closer';
  });
}

/** An enabled step sitting strictly inside the block of a *disabled* opener.
 *  FileMaker disables the opener alone -- the steps under it keep running, now
 *  outside the If or Loop they were written under, which is almost never what
 *  was meant. Counted by index, so nested disabled openers never count a step
 *  twice. */
export function orphanedEnabled(detail) {
  const body = bodyOf(detail);
  const orphans = new Set();
  for (const step of body) {
    const block = get(step, 'block');
    if (get(step, 'disabled') !== true || get(block, 'role') !== 'opener') continue;
    const start = Number(get(block, 'start'));
    const end = Math.min(Number(get(block, 'end')), body.length);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (let i = Math.max(start + 1, 0); i < end; i += 1) {
      if (get(body[i], 'disabled') !== true) orphans.add(i);
    }
  }
  return orphans.size;
}

export function scriptStats(file) {
  const scripts = scriptsOf(file).filter((i) => get(i, 'type') === 'script');
  const lengths = scripts.map((i) => Number(get(i, 'steps')) || 0);
  const details = detailsOf(file);
  return {
    scripts: scripts.length,
    steps: lengths.reduce((n, v) => n + v, 0),
    maxLength: lengths.length ? Math.max(...lengths) : 0,
    // fm's own `problems`: the steps it flagged while rendering them from its
    // catalog. They are fm's report about fm, not a finding about the file, so
    // the tab says who flagged them and never calls the steps unknown.
    flaggedSteps: details.reduce((n, d) => n + (get(d, 'problems') ?? []).length, 0),
    unbalanced: details.filter(unbalanced).length,
    orphanedEnabled: details.reduce((n, d) => n + orphanedEnabled(d), 0),
  };
}

/** `<target>|<script id>`, optionally `#L<line>` to land on one step. The step
 *  rides inside the tab's own part, the way the Layouts tab carries an object
 *  id: it is a coordinate within the script, not a second thing to select. */
export const selectionOf = (view) => selectionWithTail(view?.selection, 'step');

function totals(solution) {
  const all = Object.values(solution.files).map(scriptStats);
  const sum = (key) => all.reduce((n, s) => n + s[key], 0);
  const pairs = [
    ['Scripts', sum('scripts')],
    ['Steps', sum('steps')],
    ['Longest script', Math.max(0, ...all.map((s) => s.maxLength))],
    ['Steps fm flagged', sum('flaggedSteps')],
    ['Unbalanced scripts', sum('unbalanced')],
    ['Enabled steps under a disabled opener', sum('orphanedEnabled')],
  ];
  return totalsLine(pairs);
}

/** The badges a tree row can carry. `runWithFullAccess` only exists on the describe,
 *  so a script whose describe errored carries `unread` instead of a wrong `no`. */
function rowBadges(file, item) {
  const entry = entryOf(file, get(item, 'id'));
  return [
    get(item, 'hidden') === true ? badge('hidden', 'muted') : '',
    path(entry, 'result.runWithFullAccess') === true ? badge('full access', 'bad') : '',
    get(entry, 'error') ? badge('unread', 'warn') : '',
  ].filter(Boolean).join(' ');
}

function treeRow(file, item, selection, filter) {
  const name = String(get(item, 'name') ?? '');
  if (!matches(name, filter)) return '';
  const key = selectionKey(file.target, get(item, 'id'));
  const cls = key === selection ? ' class="selected"' : '';
  return `<li data-select="${esc(key)}"${cls}>${link(`scripts/${key}`, name)}`
    + ` ${count(get(item, 'steps'))} ${rowBadges(file, item)}</li>`;
}

function renderTree(solution, view) {
  // The row is marked by the SCRIPT the selection names: a `#L<line>` tail is a
  // coordinate inside the open script, not a different row, so the tree must not
  // lose its highlight the moment a link lands on a step.
  const sel = selectionOf(view);
  const open = sel ? selectionKey(sel.target, sel.id) : null;
  const body = Object.values(solution.files).map((file) => {
    const groups = scriptTree(file).map((group) => {
      // A folder whose name matches shows all of its scripts; otherwise only the
      // matching ones, and a folder left with none drops out of the tree.
      const wanted = matches(group.folder, view.filter) ? '' : view.filter;
      const rows = group.scripts.map((item) => treeRow(file, item, open, wanted)).filter(Boolean);
      if (!rows.length && view.filter) return '';
      const label = group.folder || '(root)';
      return `<details open><summary>${esc(label)} ${count(rows.length)}</summary>`
        + (rows.length ? `<ul class="tree">${rows.join('')}</ul>` : '<p class="empty">No scripts</p>')
        + '</details>';
    }).filter(Boolean).join('');
    const title = view.multiFile ? `<h3>${esc(file.name ?? file.target)}</h3>` : '';
    return title + (groups || '<p class="empty">No scripts</p>');
  }).join('');
  return section('Scripts', totals(solution) + body, { actions: catalogActions(solution, 'script', view, 'scripts') });
}

/** What fm flagged while rendering this script, and the step names it flagged,
 *  once each. */
function problemText(detail) {
  const problems = get(detail, 'problems') ?? [];
  if (!problems.length) return 'none';
  const names = [...new Set(problems.map((p) => String(get(p, 'step') ?? '?')))];
  return `fm reported ${count(problems.length)} problem(s) on these steps: ${esc(names.join(', '))}`;
}

const yesNo = (on, label, tone) => (on === true ? badge(label, tone) : 'no');

function renderSelected(solution, view) {
  const sel = selectionOf(view);
  const file = sel && solution.files[sel.target];
  if (!file) return '';
  const entry = entryOf(file, sel.id);
  if (!entry) return '';
  const detail = get(entry, 'result');
  const item = scriptsOf(file).find((i) => String(get(i, 'id')) === sel.id);
  const name = get(detail ?? item, 'name') ?? sel.id;
  const title = `Script ${name}${view.multiFile ? ` (${file.name ?? file.target})` : ''}`;
  const actions = rereadObjectButton({ kind: 'object', target: file.target, catalog: 'script', key: sel.id }, 'Re-read script');
  const error = get(entry, 'error');
  if (error || !detail) {
    const code = esc(get(error, 'code') ?? 'unread');
    return section(title, `<p class="error">${code}: ${esc(get(error, 'message') ?? 'no describe for this script')}</p>`, { actions });
  }
  const pairs = [
    ['Folder', esc(get(detail, 'folder')) || '(root)'],
    ['Id', esc(get(detail, 'id'))],
    ['Hidden', yesNo(get(detail, 'hidden'), 'hidden', 'muted')],
    ['Full access', yesNo(get(detail, 'runWithFullAccess'), 'runs with full access', 'bad')],
    ['Siri', yesNo(get(detail, 'siriShortcutVisible'), 'shortcut visible', 'info')],
    ['Steps', count(get(detail, 'steps'))],
    ['Problems', problemText(detail)],
  ];
  return section(title, kv(pairs) + renderScript(detail, sel.step), { actions });
}

const INDEX_COLUMNS = [
  { key: 'step', label: 'Step' },
  { key: 'count', label: 'Used', num: true, render: (r) => count(r.count) },
  { key: 'scripts', label: 'Scripts', num: true, render: (r) => count(r.scripts) },
];

function renderIndex(solution, view) {
  const rows = stepIndex(solution).filter((r) => matches(r.step, view.filter));
  const title = view.filter ? 'Step index (filtered)' : 'Step index';
  return section(title, table(INDEX_COLUMNS, rows, { empty: 'No steps' }));
}

export const tab = {
  id: 'scripts',
  label: 'Scripts',
  render(solution, view = {}) {
    return renderTree(solution, view) + renderSelected(solution, view) + renderIndex(solution, view);
  },
};
