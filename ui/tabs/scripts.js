// ui/tabs/scripts.js
// The Scripts tab: the script tree as FileMaker folds it, one selected script rendered
// step by step through the toolkit's shared renderer, and the step index across every
// file reached. A pure renderer: no document, every fm key read through access.js,
// every string escaped. Nothing here knows how a step is spelled -- stepDisplay does.
import { badge, count, esc, kv, link, matches, rereadCatalogButton, rereadObjectButton, section, table } from '../dom.js';
import { get, path } from '../access.js';
import { stepDisplay } from 'fm-adt-toolkit/step-display';

const listOf = (file) => path(file, 'catalogs.script.list') ?? [];
const entryOf = (file, id) => get(path(file, 'catalogs.script.detailById'), String(id));
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
  for (const item of listOf(file)) {
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

/** The step list itself. `--depth` carries the indent at any nesting; the class is
 *  what a test and a stylesheet match on. */
export function renderScript(detail) {
  const body = bodyOf(detail);
  const depth = depths(body);
  const rows = body.map((step, i) => {
    const display = stepDisplay(step);
    const d = depth[i];
    const cls = `depth-${d}${get(step, 'disabled') === true ? ' disabled' : ''}`;
    const indent = d > 0 ? ` style="--depth:${d}"` : '';
    const text = get(display, 'detail');
    const tail = text ? ` <span class="detail">${esc(text)}</span>` : '';
    return `<li data-step="${esc(get(step, 'stepID'))}" class="${cls}"${indent}>`
      + `<span class="ln">${i + 1}</span><b>${esc(get(display, 'name'))}</b>${tail}</li>`;
  }).join('');
  return `<ol class="script">${rows}</ol>`;
}

/** How often each step type is used, and in how many scripts, across every file. */
export function stepIndex(solution) {
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
  const scripts = listOf(file).filter((i) => get(i, 'type') === 'script');
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

export function selectionOf(view) {
  const sel = view?.selection;
  const at = typeof sel === 'string' ? sel.indexOf('|') : -1;
  return at < 0 ? null : { target: sel.slice(0, at), id: sel.slice(at + 1) };
}

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
  return `<p class="muted totals">${pairs.map(([k, v]) => `${esc(k)} ${count(v)}`).join(' &middot; ')}</p>`;
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
  const key = `${file.target}|${get(item, 'id')}`;
  const cls = key === selection ? ' class="selected"' : '';
  return `<li data-select="${esc(key)}"${cls}>${link(`scripts/${key}`, name)}`
    + ` ${count(get(item, 'steps'))} ${rowBadges(file, item)}</li>`;
}

function renderTree(solution, view) {
  const body = Object.values(solution.files).map((file) => {
    const groups = scriptTree(file).map((group) => {
      // A folder whose name matches shows all of its scripts; otherwise only the
      // matching ones, and a folder left with none drops out of the tree.
      const wanted = matches(group.folder, view.filter) ? '' : view.filter;
      const rows = group.scripts.map((item) => treeRow(file, item, view.selection, wanted)).filter(Boolean);
      if (!rows.length && view.filter) return '';
      const label = group.folder || '(root)';
      return `<details open><summary>${esc(label)} ${count(rows.length)}</summary>`
        + (rows.length ? `<ul class="tree">${rows.join('')}</ul>` : '<p class="empty">No scripts</p>')
        + '</details>';
    }).filter(Boolean).join('');
    const title = view.multiFile ? `<h3>${esc(file.name ?? file.target)}</h3>` : '';
    return title + (groups || '<p class="empty">No scripts</p>');
  }).join('');
  const actions = Object.values(solution.files)
    .map((f) => rereadCatalogButton(f.target, 'script', view.multiFile ? `Re-read ${f.name ?? f.target}` : 'Re-read scripts'))
    .join(' ');
  return section('Scripts', totals(solution) + body, { actions });
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
  const item = listOf(file).find((i) => String(get(i, 'id')) === sel.id);
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
  return section(title, kv(pairs) + renderScript(detail), { actions });
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
