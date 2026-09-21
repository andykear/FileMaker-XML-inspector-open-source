// ui/export/markdown.js
// The legacy inspector's report, re-derived from the model and the analyses.
//
// The one rule this file follows: EVERY number in it comes from the function
// the matching tab uses -- `catalogCounts` (ui/model.js), `tableCounts` and
// `fieldsOf` (ui/tabs/tables.js), `scriptStats` (ui/tabs/scripts.js),
// `relationRows` (ui/tabs/graph.js), `accountRows`, `passwordState` and
// `securityTotals` (ui/tabs/security.js), and the four analyses. Nothing is
// counted a second time here, so a report and the page it was exported from
// cannot disagree.
//
// Two lists are summarised rather than printed step by step, because the raw
// list is longer than a report can carry and says less: `psos-only-step` (715
// rows on the reference solution, from 30-odd scripts) is one row per script,
// and fm's own `problems[]` (352 rows) likewise. Every other list is whole.
//
// Escaping is ui/export/common.js's `mdCell`, not ui/dom.js's `esc`: this is
// Markdown, where the pipe and the line break are what break a table and the
// angle bracket is harmless.
//
// Pure: no document, no node:, no server/. Every fm key read through access.js.
import { get, path } from '../access.js';
import { catalogCounts } from '../model.js';
import { mdCell, mdList, mdTable } from './common.js';
import { FIELD_GROUPS, fieldsOf, tableCounts } from '../tabs/tables.js';
import { scriptStats } from '../tabs/scripts.js';
import { relationRows } from '../tabs/graph.js';
import { accountRows, passwordState, securityTotals } from '../tabs/security.js';
import { GAP_LISTS } from '../analysis/gaps-lists.js';
import { unreferenced } from '../analysis/unreferenced.js';
import { PROBLEM_KIND, broken } from '../analysis/broken.js';
import { scriptIssues } from '../analysis/scripts.js';
import { globals } from '../analysis/globals.js';

const filesOf = (solution) => Object.values(get(solution, 'files') ?? {});
const listOf = (file, catalog) => path(file, `catalogs.${catalog}.list`) ?? [];
const nameOf = (file) => file.name ?? file.target;
/** What a file calls itself, from its target: the File column of every table
 *  here names the file the way the page's own File column does. */
const nameIn = (solution, target) => get(get(solution, 'files') ?? {}, target)?.name ?? target;
const tablesOf = (file) => listOf(file, 'table').map((t) => String(get(t, 'name') ?? ''));
const isContainer = FIELD_GROUPS.find((g) => g.id === 'container').test;

/** `[[key, count]]`, biggest first, then by key: the shape every "by" table in
 *  this report has. */
function tally(rows, keyOf) {
  const counts = new Map();
  for (const r of rows) {
    const key = keyOf(r);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

/** The two summarised lists have the same shape: how many rows each named
 *  object in each file carries, biggest first, as `[file, name, count]`. */
function perObject(solution, rows, nameOfRow) {
  return tally(rows, (r) => `${r.target}\n${nameOfRow(r)}`).map(([key, n]) => {
    const [target, name] = key.split('\n');
    return [nameIn(solution, target), name, n];
  });
}

// ── Headline counts ───────────────────────────────────────────────────

const HEADLINE = ['File', 'Tables', 'Fields', 'Occurrences', 'Relations', 'Layouts',
  'Scripts', 'Steps', 'Value lists', 'Custom functions', 'Accounts', 'Themes'];

function headlineCells(file) {
  const c = catalogCounts(file);
  const listed = (catalog) => c[catalog]?.listed ?? 0;
  const stats = scriptStats(file);
  const fields = tablesOf(file).reduce((n, t) => n + tableCounts(fieldsOf(file, t)).fields, 0);
  return [listed('table'), fields, listed('tableOccurrence'), listed('relation'), listed('layout'),
    stats.scripts, stats.steps, listed('valueList'), listed('customFunction'),
    accountRows(file).length, listed('theme')];
}

function headlineCounts(solution) {
  const files = filesOf(solution);
  const rows = files.map((f) => [nameOf(f), ...headlineCells(f)]);
  if (rows.length > 1 || rows.length === 0) {
    const total = HEADLINE.slice(1).map((_, i) => rows.reduce((n, r) => n + r[i + 1], 0));
    rows.push(['**Total**', ...total]);
  }
  const align = HEADLINE.map((_, i) => (i ? 'r' : 'l')).join('');
  return mdTable(HEADLINE, rows, { align, empty: 'No file was read.' });
}

// ── File Options ──────────────────────────────────────────────────────

/** File Options, one block per file. The labels are the Solution tab's, so the
 *  report and the page name the same setting the same way; the values are read
 *  straight off the block because fm sends no password and no image bytes. */
function fileOptions(solution) {
  const parts = [];
  for (const file of filesOf(solution)) {
    const slot = get(file, 'fileOptions') ?? {};
    const error = get(slot, 'error');
    const block = get(slot, 'block');
    parts.push(`### ${mdCell(nameOf(file))}\n`);
    if (error) {
      parts.push(`\`${mdCell(get(error, 'code'))}\`: ${mdCell(get(error, 'message'))}\n`);
      continue;
    }
    if (!block) {
      parts.push('Not read.\n');
      continue;
    }
    const yesNo = (v) => (typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);
    // fm reports both the switch and the layout even when the switch is off, so
    // they render independently: a reader auditing security needs to see what
    // layout is bound even when the switch is off, because the reference index
    // counts it as used and the report must not contradict that claim.
    const layoutName = path(block, 'layout.name');
    const rows = [
      ['Switch to a layout on open', yesNo(get(block, 'switchToLayout'))],
      ['Startup layout', layoutName === undefined || layoutName === null ? 'none' : layoutName],
      ['Minimum FileMaker version', path(block, 'minimumVersion.version') ?? ''],
      ['Log in as', path(block, 'login.mode') ?? ''],
      ['A password is set', yesNo(path(block, 'login.hasPassword'))],
      ['Allow stored credentials', yesNo(get(block, 'allowStoredCredentials'))],
      ['Require a device passcode', yesNo(get(block, 'requireDevicePasscode'))],
      ['Show sign-in fields', yesNo(get(block, 'showSignInFields'))],
      ['Require authorization', get(block, 'requireAuthorization') ?? ''],
      ['Hide all toolbars', yesNo(get(block, 'hideToolbars'))],
      ['Date, time and number formats', get(block, 'dataEntry') ?? ''],
      ['Thumbnail storage', get(block, 'thumbnailStorage') ?? ''],
    ].map(([k, v]) => [k, v === undefined || v === null ? '' : v]);
    parts.push(mdTable(['Setting', 'Value'], rows, { align: 'll' }));
    // fm reports all six events always; an empty script means no script runs on this event.
    const triggers = (get(block, 'triggers') ?? []).map((t) => [get(t, 'event'), get(t, 'script') || 'none']);
    parts.push(`\n**Script triggers**\n\n${mdTable(['Event', 'Script'], triggers, { align: 'll' })}`);
  }
  return parts.join('\n');
}

// ── Confidence ────────────────────────────────────────────────────────

function confidence(solution) {
  const c = unreferenced(solution).confidence;
  return `**${c.tier}** — how far the Unreferenced list below can be trusted.\n\n`
    + '### Why\n\n' + mdList([...c.reasons], 'Nothing in this read lowers the tier.')
    + '\n### Standing limits of the source\n\n' + mdList([...c.notes], 'None.');
}

// ── Security observations ─────────────────────────────────────────────

const FULL_ACCESS = '[Full Access]';

/** The three readings of the Security tab's own rows. "Full access" is the
 *  built-in privilege set by name: a custom set with every flag on is a
 *  different question, and the Security tab is where it is asked. */
function security(solution) {
  const rows = filesOf(solution).flatMap(accountRows);
  const totals = securityTotals(solution);
  const full = rows.filter((r) => r.privilegeSet === FULL_ACCESS);
  const observed = rows.filter((r) => passwordState(r) === 'none' || r.enabled === false || r.privilegeSet === FULL_ACCESS);
  const counts = mdTable(['Observation', 'Count'], [
    ['No-password FileMaker users', totals.noPassword],
    ['Disabled accounts', totals.disabled],
    ['Full-access accounts', full.length],
  ], { align: 'lr' });
  const detail = mdTable(['File', 'Account', 'Privilege set', 'Password', 'Enabled'],
    observed.map((r) => [r.file, r.name, r.privilegeSet, passwordState(r), r.enabled === false ? 'disabled' : 'yes']),
    { empty: 'No account is disabled, without a password, or on full access.' });
  return `${counts}\n### The accounts behind those numbers\n\n${detail}`;
}

// ── Unreferenced ──────────────────────────────────────────────────────

/** The counts per category, then the whole field list -- the one list a
 *  developer acts on directly, and the one the tiers are about. */
function unreferencedSection(solution) {
  const u = unreferenced(solution);
  const counts = Object.entries(u).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]);
  const fields = mdTable(['File', 'Table', 'Field', 'Tier'],
    u.fields.map((f) => [nameIn(solution, f.target), f.table, f.field, f.tier]),
    { empty: 'Every field is named somewhere.' });
  return `${mdTable(['Category', 'Count'], counts, { align: 'lr' })}\n`
    + '### Fields nothing names\n\n'
    + '`none` is a field nothing in the read names at all; `text-only` is one named only by the'
    + ' tokeniser\'s reading of calculation text, which is real evidence from a reader that cannot'
    + ' follow an indirection — look before deleting.\n\n'
    + fields;
}

// ── Script body observations ──────────────────────────────────────────

const PSOS = 'psos-only-step';

function scriptSection(solution) {
  const issues = scriptIssues(solution);
  const byCheck = mdTable(['Check', 'Steps'], tally(issues, (r) => r.check), { align: 'lr', empty: 'No check fired.' });
  const psos = issues.filter((r) => r.check === PSOS);
  const psosTable = mdTable(['File', 'Script', 'Steps'],
    perObject(solution, psos, (r) => r.script.name),
    { align: 'llr', empty: 'No step on the server-incompatible list.' });
  const others = issues.filter((r) => r.check !== PSOS);
  const detail = mdTable(['File', 'Script', 'Line', 'Check', 'Detail'],
    others.map((r) => [nameIn(solution, r.target), r.script.name, r.step.line, r.check, describe(r.detail)]),
    { empty: 'Nothing else fired.' });
  return `${byCheck}\n### ${PSOS}, by script\n\n`
    + 'A step FileMaker does not run on a server, wherever it sits: which scripts are ever'
    + ' performed on the server is the call graph\'s question, and a caller may be added tomorrow.\n\n'
    + `${psosTable}\n### Every other finding\n\n${detail}`;
}

/** An analysis `detail` as one cell. The keys are the analysis's own, so a new
 *  one appears here without this file being told about it. */
function describe(detail) {
  if (detail === null || typeof detail !== 'object') return String(detail ?? '');
  return Object.entries(detail)
    .map(([k, v]) => `${k}: ${v !== null && typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('; ');
}

// ── Calculation fields, relationships, containers ─────────────────────

function calculations(solution) {
  const rows = [];
  for (const file of filesOf(solution)) {
    for (const table of tablesOf(file)) {
      const c = tableCounts(fieldsOf(file, table));
      if (c.calc > 0) rows.push([nameOf(file), table, c.calc, c.storedCalc, c.unstoredCalc]);
    }
  }
  return 'A global calculation is neither stored nor unstored, so the two columns need not add up'
    + ' to the first.\n\n'
    + mdTable(['File', 'Table', 'Calc fields', 'Stored', 'Unstored'], rows,
      { align: 'llrrr', empty: 'No table has a calculation field.' });
}

function relationships(solution) {
  const rows = filesOf(solution).flatMap(relationRows)
    .map((r) => [r.file, r.left, r.right, r.predicates, r.sortSpec]);
  return mdTable(['File', 'Left', 'Right', 'Predicates', 'Sort'], rows, { empty: 'No relation.' });
}

/** How a container keeps its data, from fm's own `options.container`: absent
 *  means the data is embedded in the file. */
function storageOf(field) {
  const c = path(field, 'options.container');
  if (!c) return 'embedded';
  return [get(c, 'external') ? 'external' : 'embedded', get(c, 'encrypted') ? 'encrypted' : 'open'].join(', ');
}

function containers(solution) {
  const rows = [];
  for (const file of filesOf(solution)) {
    for (const table of tablesOf(file)) {
      for (const field of fieldsOf(file, table).filter(isContainer)) {
        const c = path(field, 'options.container');
        rows.push([nameOf(file), table, get(field, 'name'), path(field, 'options.global') ? 'global' : '',
          storageOf(field), [get(c, 'baseDirectory'), path(c, 'location.text')].filter(Boolean).join(' ')]);
      }
    }
  }
  return mdTable(['File', 'Table', 'Field', 'Global', 'Storage', 'Where'], rows, { empty: 'No container field.' });
}

// ── Broken references ─────────────────────────────────────────────────

function brokenSection(solution) {
  const rows = broken(solution);
  const problems = rows.filter((r) => r.kind === PROBLEM_KIND);
  // The same split the Analysis tab's headline makes, and for the same reason:
  // fm's `problem` rows are fm's report about its own rendering of a step, not
  // broken references, and one number covering both would read as a solution
  // two orders of magnitude more broken than it is.
  const totals = mdTable(['Total', 'Count'], [
    ['Broken references', rows.length - problems.length],
    ['fm problem steps', problems.length],
  ], { align: 'lr' })
    + '\nA broken reference is a `<Word Missing>` marker fm wrote, a reference fm reports by raw key'
    + ' because the name no longer resolves, an occurrence whose base table did not resolve, or a named'
    + ' reference that resolves to nothing. An fm problem step is an entry of fm\'s own'
    + ' `script.problems[]`: its report about its own rendering of a step, not a finding about the file.\n';
  const byKind = mdTable(['Kind', 'Count'], tally(rows, (r) => r.kind), { align: 'lr', empty: 'Nothing is broken.' });
  const perScript = mdTable(['File', 'Script', 'Problems'],
    perObject(solution, problems, (r) => r.from.name),
    { align: 'llr', empty: 'fm flagged no step.' });
  const others = rows.filter((r) => r.kind !== PROBLEM_KIND);
  const detail = mdTable(['File', 'Kind', 'Found in', 'Where', 'Detail'],
    others.map((r) => [nameIn(solution, r.target), r.kind, `${r.from.kind} ${r.from.name ?? r.from.id}`, r.from.where ?? '', describe(r.detail)]),
    { empty: 'Nothing else.' });
  return `${totals}\n${byKind}\n### fm's own script problems, by script\n\n`
    + 'These are fm\'s report about its own rendering of a step, not a finding about the file.\n\n'
    + `${perScript}\n### Every other broken reference\n\n${detail}`;
}

// ── Gaps ──────────────────────────────────────────────────────────────

/** The Gaps tab's own result when the page has run the live check; the sentence
 *  that says how to get one when it has not. A gap check reads the running fm,
 *  which an export cannot do for itself.
 *
 *  The lists are `GAP_LISTS`, ui/analysis/gaps-lists.js's: this used to carry a
 *  shorter hand-written list of four, so the report and the page it came from
 *  showed different halves of one answer. One constant, one set of headings,
 *  and each row's note is the note the Gaps tab prints. The constant is neutral
 *  ground rather than the tab's, because the tab's copy carries HTML column
 *  renderers and a report draws no HTML. */
function gaps(solution) {
  const g = get(solution, 'gaps');
  if (!g) return 'Run the live check on the Gaps tab and export again to see the register\'s answer here.\n';
  return mdTable(['Gap', 'Count', 'What it means'],
    GAP_LISTS.map((l) => [l.title, (get(g, l.key) ?? []).length, l.note]), { align: 'lrl' });
}

// ── The report ────────────────────────────────────────────────────────

/** The H2 headings, in order. Exported so a test (and a reader) has the list in
 *  one place rather than reading it out of the output. */
export const SECTIONS = ['Headline counts', 'File Options', 'Confidence', 'Security observations', 'Unreferenced',
  'Script body observations', 'Calculation fields', 'Relationships', 'Container fields',
  'Broken references', 'Gaps'];

const BODY = {
  'Headline counts': headlineCounts,
  'File Options': fileOptions,
  Confidence: confidence,
  'Security observations': security,
  Unreferenced: unreferencedSection,
  'Script body observations': scriptSection,
  'Calculation fields': calculations,
  Relationships: relationships,
  'Container fields': containers,
  'Broken references': brokenSection,
  Gaps: gaps,
};

const title = (solution) => nameIn(solution, get(solution, 'root') ?? '');

/** The whole report as one Markdown string. */
export function markdownReport(solution) {
  const version = path(solution, 'cli.version');
  const head = [
    `# Clockwork Inspector report: ${mdCell(title(solution))}`,
    '',
    `- Root: \`${get(solution, 'root') ?? ''}\``,
    `- Read with fm ${version ?? '(version unknown)'} at ${get(solution, 'readAt') ?? '(not read)'}`,
    `- ${globals(solution).length} \`$$\` globals are named in this solution; the Analysis tab lists them.`,
    '',
    '',
  ].join('\n');
  return head + SECTIONS.map((name) => `## ${name}\n\n${BODY[name](solution)}`).join('\n');
}
