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
import { badge, count, esc, matches, section, table } from '../dom.js';
import { emptyNote, fileName, linkOr, plural, withFile } from './common.js';
import { refHash } from './explorer.js';
import { unreferenced } from '../analysis/unreferenced.js';
import { PROBLEM_KIND, broken } from '../analysis/broken.js';
import { scriptIssues } from '../analysis/scripts.js';
import { GLOBALS_NOTE, globals } from '../analysis/globals.js';

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

// fm's own `problem` rows are not broken references and must not be added to
// them: they are fm's report about its own RENDERING of a step (352 of them on
// ooe, against 5 real broken references), and one number covering both would
// say the solution is two orders of magnitude more broken than it is.
// `PROBLEM_KIND` is ui/analysis/broken.js's: the file that makes the kinds is
// the one that names them.

/** Every broken-reference kind but fm's own problem steps. Counted as "the rest
 *  of the total" rather than from a list of kinds, so a new kind out of
 *  ui/analysis/broken.js lands here instead of vanishing. */
export const brokenReferenceCount = (t) => t.broken.total - (t.broken.byKind[PROBLEM_KIND] ?? 0);

const TITLES = {
  unreferenced: 'ui/analysis/unreferenced.js: every field, table, occurrence, script, layout, value list, custom function and named style that no reference in the read names.',
  brokenReferences: 'ui/analysis/broken.js: its <Word Missing> markers, occurrences whose base table did not resolve, and named references that resolve to nothing. fm\'s own problem steps are counted beside this, not in it.',
  problems: 'ui/analysis/broken.js, the `problem` kind: fm\'s own script.problems[] entries, which are fm\'s report about its own rendering of a step and not a finding about the file.',
  issues: 'ui/analysis/scripts.js: every step-level check, counted from the `check` each row carries.',
  globals: 'ui/analysis/globals.js: every $$ global named anywhere, with the enabled Set Variable steps that write it.',
};

function totalsLineWithTitles(solution) {
  const t = analysisTotals(solution);
  const items = [
    ['Unreferenced', t.unreferenced.total, TITLES.unreferenced],
    ['Broken references', brokenReferenceCount(t), TITLES.brokenReferences],
    ['fm problem steps', t.broken.byKind[PROBLEM_KIND] ?? 0, TITLES.problems],
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
    + table(withFile(columns, view), shown, { empty: emptyNote(total, `No unreferenced ${label.toLowerCase()}`) })
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
    + table(withFile(STYLE_COLUMNS, view), shownStyles, { empty: emptyNote(styles.length, 'No unused named styles') })
    + '</details>');
  return section('Unreferenced', blocks.join(''));
}

// ── Broken references ─────────────────────────────────────────────────

// The order the kinds are shown in. `unresolvedOccurrence` and `danglingName`
// are adjacent on purpose: one missing table fires both, and a reader who sees
// only one of the pair reads half the answer. A kind not on this list (a new
// one from ui/analysis/broken.js) is appended rather than dropped.
const KIND_ORDER = ['problem', 'missingMarker', 'unresolvedOccurrence', 'danglingName'];

/** fm's own `problems[]` entries ride through unread, and a check's detail may
 *  nest (`expensive-in-loop` carries the loop it found the call in), so a detail
 *  is printed by walking whatever it carries, however deep, rather than by
 *  naming the keys anything has today. A nested object is braced, so its own
 *  separators cannot read as the outer level's. */
const detailValue = (v) => (v !== null && typeof v === 'object' ? `{${detailText(v)}}` : String(v ?? ''));

function detailText(detail) {
  if (detail === null || typeof detail !== 'object') return String(detail ?? '');
  if (Array.isArray(detail)) return detail.map(detailValue).join(', ');
  return Object.entries(detail).map(([k, v]) => `${k}: ${detailValue(v)}`).join(' · ');
}

// The Where column carries two spellings and neither is this file's: a
// `problem` row's is fm's own `path`, a JSON pointer into the step it is about
// (`/3/options/1`, slash-separated and counted from 0); every other row's is
// the dotted key path ui/analysis/refs.js and ui/analysis/broken.js build
// (`body[3].script`). Saying so on the header is cheaper than a reader guessing
// that a `/N` is a line number.
const BROKEN_COLUMNS = [
  { key: 'fromKind', label: 'In' },
  { key: 'name', label: 'Name', render: (r) => linkOr(r.hash, r.name) },
  {
    key: 'where',
    label: 'Where',
    title: 'Where the name was written. A problem row carries fm\'s own path for it, which is fm\'s JSON pointer into the object (/3/options/1, counted from 0), not a line number; every other row carries the key path this tool builds (body[3].script).',
  },
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
      + table(withFile(BROKEN_COLUMNS, view), shown, { empty: emptyNote(mine.length, 'None') })
      + '</details>';
  });
  return section('Broken references and fm problem steps', blocks.join('') || '<p class="empty">Nothing in this read is broken</p>');
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

/** FileMaker's own line number, which is `index + 1` (ui/analysis/scripts.js):
 *  the Scripts tab and the Gaps tab both count from 1, so this one does too. */
const stepText = (r) => `line ${r.step.line} ${r.step.step ?? ''}`.trim();

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
    render: (r) => `<details><summary>${plural(r.rows.length, 'step')}</summary><ul class="notes">`
      + r.rows.map((x) => `<li>${esc(stepText(x))}</li>`).join('') + '</ul></details>',
  },
];

const issueMatches = (r, filter) => matches(r.script.name, filter) || matches(stepText(r), filter) || matches(detailText(r.detail), filter);

function renderIssueGroup(solution, group, view) {
  const rows = group.rows.map((r) => ({ ...r, file: fileName(solution, r.target) }));
  const shown = rows.filter((r) => issueMatches(r, view.filter));
  const head = `<details><summary>${esc(group.check)} ${count(rows.length)}</summary>`;
  if (group.check !== 'psos-only-step') {
    return head + table(withFile(ISSUE_COLUMNS, view), shown, { empty: emptyNote(rows.length, 'No row for this check') }) + '</details>';
  }
  // Both numbers are of `shown`, not one of each: under a filter the sentence
  // has to describe the table printed under it.
  const per = psosByScript(shown).map((g) => ({ ...g, file: fileName(solution, g.target) }));
  return head
    + `<p class="muted">One row per script, not per step: ${plural(shown.length, 'step')} in ${plural(per.length, 'script')}.</p>`
    + table(withFile(PSOS_COLUMNS, view), per, { empty: emptyNote(rows.length, 'No step of this kind') })
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
      ? `<details><summary>${plural(r.sets.length, 'site')}</summary><ul class="notes">${r.sets
        .map((s) => `<li>${linkOr(refHash('script', s.target, s.script.id), s.script.name)} line ${esc(s.step.line)}</li>`)
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
    + table(globalColumns(solution), shown, { empty: emptyNote(rows.length, 'No $$ global is named anywhere') }));
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
