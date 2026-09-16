// ui/tabs/analysis.js
// The Analysis tab: the four derived answers of Plan 5 on one page -- what
// nothing names (ui/analysis/unreferenced.js, with the confidence of that
// list), what is already broken (ui/analysis/broken.js), what the script
// checks found (ui/analysis/scripts.js) and every `$$` global
// (ui/analysis/globals.js).
//
// Nothing here decides what a category or a check IS: the sections are built
// from the rows the analyses hand over, so a renamed check moves a heading and
// a new one appears on its own. The link map lives in ui/tabs/explorer.js
// (`refHash`) and is imported rather than repeated.
//
// A pure renderer: no document, every model string through esc.
import { badge, count, esc, link, matches, section, table } from '../dom.js';
import { withFile } from './common.js';
import { refHash } from './explorer.js';
import { unreferenced } from '../analysis/unreferenced.js';
import { broken } from '../analysis/broken.js';
import { scriptIssues } from '../analysis/scripts.js';
import { GLOBALS_NOTE, globals } from '../analysis/globals.js';

const linkOr = (hash, label) => (hash ? link(hash, label) : esc(label));
const fileName = (solution, target) => solution.files?.[target]?.name ?? target;

// ── Totals ────────────────────────────────────────────────────────────

/** The four numbers of the scoreboard, solution-wide and unfiltered, each with
 *  the sentence that says where it came from. */
export function analysisTotals(solution) {
  const u = unreferenced(solution);
  const byCategory = {};
  for (const [k, v] of Object.entries(u)) if (Array.isArray(v)) byCategory[k] = v.length;
  const brokenRows = broken(solution);
  const byKind = {};
  for (const r of brokenRows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  const byCheck = {};
  const issues = scriptIssues(solution);
  for (const r of issues) byCheck[r.check] = (byCheck[r.check] ?? 0) + 1;
  const g = globals(solution);
  return {
    unreferenced: { byCategory, total: Object.values(byCategory).reduce((n, v) => n + v, 0), confidence: u.confidence },
    broken: { byKind, total: brokenRows.length },
    issues: { byCheck, total: issues.length },
    globals: { total: g.length, set: g.filter((r) => r.sets.length > 0).length },
  };
}

const TITLES = {
  unreferenced: 'ui/analysis/unreferenced.js: every field, table, occurrence, script, layout, value list, custom function and named style that no reference in the read names.',
  broken: 'ui/analysis/broken.js: fm\'s own script problems, its <Word Missing> markers, occurrences whose base table did not resolve, and named references that resolve to nothing.',
  issues: 'ui/analysis/scripts.js: every step-level check, counted from the `check` each row carries.',
  globals: 'ui/analysis/globals.js: every $$ global named anywhere, with the enabled Set Variable steps that write it.',
};

function totalsLineWithTitles(solution) {
  const t = analysisTotals(solution);
  const items = [
    ['Unreferenced', t.unreferenced.total, TITLES.unreferenced],
    ['Broken', t.broken.total, TITLES.broken],
    ['Script issues', t.issues.total, TITLES.issues],
    ['Globals', t.globals.total, TITLES.globals],
  ];
  return `<p class="muted totals">${items
    .map(([k, v, title]) => `<span title="${esc(title)}">${esc(k)} ${count(v)}</span>`)
    .join(' &middot; ')}</p>`;
}

// ── Confidence ────────────────────────────────────────────────────────

const TIER_TONE = { high: 'good', medium: 'warn', low: 'bad' };

function renderConfidence(solution) {
  const c = unreferenced(solution).confidence;
  const list = (items) => (items.length ? `<ul class="notes">${items.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '');
  const body = `<p>${badge(c.tier, TIER_TONE[c.tier] ?? 'muted')} how much of the Unreferenced list can be trusted.</p>`
    + '<h3>Why</h3>'
    + (c.reasons.length ? list(c.reasons) : '<p class="empty">Nothing in this read lowers the tier.</p>')
    + '<h3>Standing limits of the source</h3>'
    + list(c.notes);
  return section('Confidence', body);
}

// ── Unreferenced ──────────────────────────────────────────────────────

// One descriptor per category of unreferenced(): the heading, the label of the
// third column, and the row as this tab shows it. `key` is the field of the
// analysis's own result, so a category it stops returning simply disappears.
const CATEGORIES = [
  ['fields', 'Fields', 'Tier', (r) => ({ name: r.name, hash: refHash('field', r.target, r.name), extra: String(r.tier ?? '') })],
  ['tables', 'Tables', 'Id', (r) => ({ name: r.name, hash: refHash('table', r.target, r.name), extra: String(r.id ?? '') })],
  ['occurrences', 'Table occurrences', 'Base table / removability', (r) => ({ name: r.name, hash: refHash('occurrence', r.target, r.id), extra: `${r.table ?? ''} · ${r.removability ?? ''}` })],
  ['scripts', 'Scripts', 'Folder', (r) => ({ name: r.name, hash: refHash('script', r.target, r.id), extra: String(r.folder ?? '') })],
  ['layouts', 'Layouts', 'Folder', (r) => ({ name: r.name, hash: refHash('layout', r.target, r.id), extra: String(r.folder ?? '') })],
  ['valueLists', 'Value lists', 'Id', (r) => ({ name: r.name, hash: refHash('valueList', r.target, r.id), extra: String(r.id ?? '') })],
  ['customFunctions', 'Custom functions', 'Folder', (r) => ({ name: r.name, hash: refHash('customFunction', r.target, r.id), extra: String(r.folder ?? '') })],
];

const categoryColumns = (extraLabel) => [
  { key: 'name', label: 'Name', render: (r) => linkOr(r.hash, r.name) },
  { key: 'extra', label: extraLabel },
];

/** Styles are the one category whose rows belong to a theme rather than to a
 *  catalog of their own, so the theme is a column and the rows are in theme
 *  order -- a reader reads one theme's unused styles as a block. */
const STYLE_COLUMNS = [
  { key: 'theme', label: 'Theme', render: (r) => linkOr(refHash('theme', r.target, r.themeId), r.theme) },
  { key: 'display', label: 'Style' },
  { key: 'key', label: 'Key' },
];

function detailsBlock(label, total, shown, columns, view) {
  return `<details><summary>${esc(label)} ${count(total)}</summary>`
    + table(withFile(columns, view), shown, { empty: `No unreferenced ${label.toLowerCase()}` })
    + '</details>';
}

function renderUnreferenced(solution, view) {
  const u = unreferenced(solution);
  const blocks = CATEGORIES.map(([key, label, extraLabel, of]) => {
    const rows = (u[key] ?? []).map((r) => ({ ...of(r), target: r.target, file: fileName(solution, r.target) }));
    const shown = rows.filter((r) => matches(r.name, view.filter) || matches(r.extra, view.filter));
    return detailsBlock(label, rows.length, shown, categoryColumns(extraLabel), view);
  });
  const styles = (u.styles ?? []).map((r) => ({ ...r, file: fileName(solution, r.target) }))
    .sort((a, b) => a.file.localeCompare(b.file) || a.theme.localeCompare(b.theme) || a.display.localeCompare(b.display));
  const shownStyles = styles.filter((r) => matches(r.display, view.filter) || matches(r.key, view.filter) || matches(r.theme, view.filter));
  const themes = new Set(styles.map((r) => `${r.target}/${r.themeId}`)).size;
  blocks.push(`<details><summary>Styles ${count(styles.length)} in ${count(themes)} themes</summary>`
    + table(withFile(STYLE_COLUMNS, view), shownStyles, { empty: 'No unused named styles' })
    + '</details>');
  return section('Unreferenced', blocks.join(''));
}

// ── Broken references ─────────────────────────────────────────────────

// The order the kinds are shown in. `unresolvedOccurrence` and `danglingName`
// are adjacent on purpose: one missing table fires both, and a reader who sees
// only one of the pair reads half the answer. A kind not on this list (a new
// one from ui/analysis/broken.js) is appended rather than dropped.
const KIND_ORDER = ['problem', 'missingMarker', 'unresolvedOccurrence', 'danglingName'];

/** fm's own `problems[]` entries ride through unread, so a detail is printed by
 *  walking whatever keys it carries rather than by naming the ones fm has today. */
function detailText(detail) {
  if (detail === null || typeof detail !== 'object') return String(detail ?? '');
  return Object.entries(detail).map(([k, v]) => `${k}: ${v}`).join(' · ');
}

const BROKEN_COLUMNS = [
  { key: 'fromKind', label: 'In' },
  { key: 'name', label: 'Name', render: (r) => linkOr(r.hash, r.name) },
  { key: 'where', label: 'Where' },
  { key: 'detail', label: 'Detail' },
];

function renderBroken(solution, view) {
  const rows = broken(solution).map((r) => ({
    kind: r.kind, target: r.target, file: fileName(solution, r.target),
    fromKind: String(r.from?.kind ?? ''), name: String(r.from?.name ?? ''), where: String(r.from?.where ?? ''),
    detail: detailText(r.detail), hash: refHash(r.from?.kind, r.target, r.from?.id),
  }));
  const kinds = [...new Set(rows.map((r) => r.kind))]
    .sort((a, b) => (KIND_ORDER.indexOf(a) + 1 || 99) - (KIND_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const blocks = kinds.map((kind) => {
    const mine = rows.filter((r) => r.kind === kind);
    const shown = mine.filter((r) => matches(r.name, view.filter) || matches(r.detail, view.filter) || matches(r.where, view.filter));
    return `<details><summary>${esc(kind)} ${count(mine.length)}</summary>`
      + table(withFile(BROKEN_COLUMNS, view), shown, { empty: 'None match the filter' })
      + '</details>';
  });
  return section('Broken references', blocks.join('') || '<p class="empty">Nothing in this read is broken</p>');
}

// ── Script issues ─────────────────────────────────────────────────────

/** The rows of ui/analysis/scripts.js bucketed by the `check` each one carries,
 *  biggest bucket first. No list of checks lives here: a renamed or new check
 *  arrives as a heading. */
export function issueGroups(solution) {
  const by = new Map();
  for (const r of scriptIssues(solution)) {
    if (!by.has(r.check)) by.set(r.check, []);
    by.get(r.check).push(r);
  }
  return [...by.entries()].map(([check, rows]) => ({ check, rows }))
    .sort((a, b) => b.rows.length - a.rows.length || a.check.localeCompare(b.check));
}

/** The one check big enough to need it: 715 rows on ooe is one per step, and a
 *  reader wants the 24 scripts. Biggest first. */
export function psosByScript(rows) {
  const by = new Map();
  for (const r of rows) {
    const key = `${r.target}|${r.script.id}`;
    if (!by.has(key)) by.set(key, { target: r.target, script: r.script, rows: [] });
    by.get(key).rows.push(r);
  }
  return [...by.values()].sort((a, b) => b.rows.length - a.rows.length || String(a.script.name).localeCompare(String(b.script.name)));
}

const stepText = (r) => `step ${r.step.index} ${r.step.step ?? ''}`.trim();

// The Scripts tab routes `#scripts/<target>|<id>` and has no per-step anchor
// yet, so the step is text in the row rather than a link that would not land.
const ISSUE_COLUMNS = [
  { key: 'script', label: 'Script', render: (r) => linkOr(refHash('script', r.target, r.script.id), r.script.name) },
  { key: 'step', label: 'Step', render: (r) => esc(stepText(r)) },
  { key: 'detail', label: 'Detail', render: (r) => esc(detailText(r.detail)) },
];

const PSOS_COLUMNS = [
  { key: 'script', label: 'Script', render: (r) => linkOr(refHash('script', r.target, r.script.id), r.script.name) },
  { key: 'count', label: 'Steps', num: true, render: (r) => count(r.rows.length) },
  {
    key: 'steps',
    label: 'Which',
    render: (r) => `<details><summary>${count(r.rows.length)} ${r.rows.length === 1 ? 'step' : 'steps'}</summary><ul class="notes">`
      + r.rows.map((x) => `<li>${esc(stepText(x))}</li>`).join('') + '</ul></details>',
  },
];

const issueMatches = (r, filter) => matches(r.script.name, filter) || matches(stepText(r), filter) || matches(detailText(r.detail), filter);

function renderIssueGroup(solution, group, view) {
  const rows = group.rows.map((r) => ({ ...r, file: fileName(solution, r.target) }));
  const shown = rows.filter((r) => issueMatches(r, view.filter));
  const head = `<details><summary>${esc(group.check)} ${count(rows.length)}</summary>`;
  if (group.check !== 'psos-only-step') {
    return head + table(withFile(ISSUE_COLUMNS, view), shown, { empty: 'None match the filter' }) + '</details>';
  }
  const per = psosByScript(shown).map((g) => ({ ...g, file: fileName(solution, g.target) }));
  return head
    + `<p class="muted">One row per script, not per step: ${count(rows.length)} steps in ${count(per.length)} scripts.</p>`
    + table(withFile(PSOS_COLUMNS, view), per, { empty: 'None match the filter' })
    + '</details>';
}

function renderIssues(solution, view) {
  const groups = issueGroups(solution);
  const body = groups.map((g) => renderIssueGroup(solution, g, view)).join('')
    || '<p class="empty">No script issues</p>';
  return section('Script issues', body);
}

// ── Globals ───────────────────────────────────────────────────────────

/** The columns close over the solution because the `files` column turns targets
 *  into the names the files call themselves. */
const globalColumns = (solution) => [
  { key: 'name', label: 'Global' },
  { key: 'sets', label: 'Set', num: true, render: (r) => count(r.sets.length) },
  {
    key: 'where',
    label: 'Set where',
    render: (r) => (r.sets.length
      ? `<details><summary>${count(r.sets.length)} ${r.sets.length === 1 ? 'site' : 'sites'}</summary><ul class="notes">${r.sets
        .map((s) => `<li>${linkOr(refHash('script', s.target, s.script.id), s.script.name)} step ${esc(s.step.index)}</li>`)
        .join('')}</ul></details>`
      : '<span class="empty">never set</span>'),
  },
  { key: 'mentions', label: 'Mentions', num: true, render: (r) => count(r.mentions) },
  { key: 'files', label: 'Files', render: (r) => esc(r.files.map((t) => fileName(solution, t)).join(', ')) },
];

function renderGlobals(solution, view) {
  const rows = globals(solution);
  const shown = rows.filter((r) => matches(r.name, view.filter)
    || r.sets.some((s) => matches(s.script.name, view.filter)));
  return section('Globals', `<p class="muted">${esc(GLOBALS_NOTE)}</p>`
    + table(globalColumns(solution), shown, { empty: 'No $$ global is named anywhere' }));
}

export const tab = {
  id: 'analysis',
  label: 'Analysis',
  render(solution, view = {}) {
    return totalsLineWithTitles(solution)
      + renderConfidence(solution)
      + renderUnreferenced(solution, view)
      + renderBroken(solution, view)
      + renderIssues(solution, view)
      + renderGlobals(solution, view);
  },
};
