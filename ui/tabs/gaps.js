// ui/tabs/gaps.js
// The Gaps tab: what the toolkit's coverage register says fm cannot read yet, a live
// run of that register's own probes against this file, and the gaps the shared step
// renderer reports on this solution's own script steps.
//
// Three different things are called a gap here and they are kept apart on purpose:
//
//   the register    a fact FileMaker's Save as XML export carries and fm does not
//                   report. Owned by fm-adt-toolkit, measured against the reference
//                   solution, and only ever READ here -- this page never writes it.
//   the live check  the same register's probes run against the file in front of the
//                   user, so a reader can see what THIS build of fm answers rather
//                   than what it answered when the register was last checked.
//   the renderer    an option the step-display catalog cannot phrase the way
//                   FileMaker phrases it. Nothing to do with fm: the value is read
//                   and printed, it is the wording that is not measured.
//
// A pure renderer, like every other tab: no document, every fm key through access.js,
// every string through esc. The one thing it asks of the shell is a click -- the two
// `data-action` buttons, which ui/app.js turns into a fetch.
import { badge, count, esc, kv, matches, section, table } from '../dom.js';
import { CATALOG, catalogEntry, renderStepFromCatalog, stepConventions } from 'fm-adt-toolkit/step-display';
import { get, path } from '../access.js';
import { memoise } from '../analysis/memo.js';
import { emptyNote, plural, totalsLine } from './common.js';

// ── What fm cannot read yet ───────────────────────────────────────────

/** An attribute is one of three things, and never two: fm reports it, the owner has
 *  ruled it will never be reported (`wontfix`), or it is missing. */
export const statusOf = (a) => (a.reported ? 'reported' : a.wontfix ? 'wontfix' : 'missing');
const TONE = { reported: 'good', wontfix: 'muted', missing: 'bad' };

/** The register grouped by the kind its id names -- `layout-object:button` is a
 *  layout-object -- with the three counts, which are the group's totals and are
 *  never narrowed by the filter. */
export function registerGroups(register) {
  const groups = new Map();
  for (const entry of register ?? []) {
    const kind = String(entry.id ?? '').split(':')[0];
    if (!groups.has(kind)) groups.set(kind, { kind, entries: [], reported: 0, missing: 0, wontfix: 0 });
    const group = groups.get(kind);
    group.entries.push(entry);
    for (const a of entry.attributes ?? []) group[statusOf(a)] += 1;
  }
  return [...groups.values()].sort((a, b) => a.kind.localeCompare(b.kind));
}

/** The fm build the register was last checked against: the newest of its entries'
 *  own `lastChecked`, which in a register the owner has just checked is one date. */
export function registerFacts(register) {
  let best = null;
  for (const entry of register ?? []) {
    const lc = entry.lastChecked;
    if (lc?.date && (!best || lc.date > best.date)) best = { version: lc.version, build: lc.build, date: lc.date };
  }
  return best;
}

const ATTRIBUTE_COLUMNS = [
  { key: 'name', label: 'Attribute' },
  { key: 'path', label: 'Export path' },
  { key: 'fmKey', label: 'fm key', render: (a) => (a.fmKey ? `<code>${esc(a.fmKey)}</code>` : '') },
  {
    key: 'status',
    label: 'Status',
    render: (a) => badge(statusOf(a), TONE[statusOf(a)]) + (a.wontfix ? ` <span class="muted">${esc(a.wontfix)}</span>` : ''),
  },
  { key: 'knownFrom', label: 'Known from' },
];

const attributeMatches = (a, filter) => matches(a.name, filter) || matches(a.path, filter)
  || matches(a.fmKey ?? '', filter) || matches(a.knownFrom ?? '', filter);

/** The attribute rows of one entry under the filter: all of them when the filter
 *  names the entry itself, otherwise the ones that match. An entry left with none
 *  is not shown at all. */
function rowsOf(entry, filter) {
  const attributes = entry.attributes ?? [];
  if (!filter || matches(entry.id, filter) || matches(entry.kind, filter) || matches(entry.op, filter)) return attributes;
  return attributes.filter((a) => attributeMatches(a, filter));
}

function entryHtml(entry, filter) {
  const rows = rowsOf(entry, filter);
  if (!rows.length) return '';
  const missing = (entry.attributes ?? []).filter((a) => statusOf(a) === 'missing').length;
  const expected = entry.expectedError ? ` ${badge('expected error: ' + entry.expectedError, 'warn')}` : '';
  return '<details><summary>'
    + `${esc(entry.id)} <span class="muted">${esc(entry.op)}</span> `
    + `${plural(entry.attributes?.length ?? 0, 'attribute')}, ${count(missing)} missing${expected}`
    + `</summary>${table(ATTRIBUTE_COLUMNS, rows)}</details>`;
}

function groupHtml(group, filter) {
  const entries = group.entries.map((e) => entryHtml(e, filter)).filter(Boolean).join('');
  if (!entries) return '';
  return '<details><summary>'
    + `${esc(group.kind)} &middot; ${count(group.entries.length)} ${group.entries.length === 1 ? 'entry' : 'entries'} &middot; `
    + `reported ${count(group.reported)} &middot; missing ${count(group.missing)} &middot; wontfix ${count(group.wontfix)}`
    + `</summary>${entries}</details>`;
}

function registerSection(solution, view) {
  const register = solution.register;
  if (!register) {
    return section('What fm cannot read yet', '<p class="muted">The coverage register is the toolkit\'s, and it is 3MB of prose: '
      + 'it is fetched the first time this tab is opened rather than with the solution.</p>'
      + '<button data-action="gaps-register">Load the register</button>');
  }
  const groups = registerGroups(register);
  const attributes = groups.reduce((n, g) => n + g.reported + g.missing + g.wontfix, 0);
  const body = totalsLine([
    ['Kinds', groups.length],
    ['Entries', register.length],
    ['Attributes', attributes],
    ['Reported', groups.reduce((n, g) => n + g.reported, 0)],
    ['Missing', groups.reduce((n, g) => n + g.missing, 0)],
    ['Wontfix', groups.reduce((n, g) => n + g.wontfix, 0)],
  ])
    + '<p class="muted">One row per fact the Save as XML export carries. Open a kind, then an entry, to see which of its '
    + 'facts fm reports, which it does not, and where each was known from.</p>'
    + (groups.map((g) => groupHtml(g, view.filter)).join('') || `<p class="empty">${esc(emptyNote(register.length, 'The register is empty'))}</p>`);
  return section('What fm cannot read yet', body);
}

// ── The live check ────────────────────────────────────────────────────

const ID_REASON = [{ key: 'id', label: 'Entry' }, { key: 'reason', label: 'Reason' }];
const ID_ATTRIBUTE = [{ key: 'id', label: 'Entry' }, { key: 'attribute', label: 'Attribute' }];

const ID_KEYS = [{ key: 'id', label: 'Entry' },
  { key: 'keys', label: 'Keys', render: (r) => esc((r.keys ?? []).join(', ')) }];

/** Every list a live check's outcome carries, in the order a reader wants them:
 *  what broke, what moved, what closed, what is still open. Each one's `note`
 *  says what the list MEANS, because the name of a list is never enough to act
 *  on, and each one's `title` is the heading both surfaces print.
 *
 *  Exported because ui/export/markdown.js's Gaps section reads the same
 *  outcome: one list of lists, so the page and the report cannot show different
 *  halves of the same answer. A list the toolkit adds appears in both the day
 *  server/gaps.mjs forwards it and its row is added here. */
export const GAP_LISTS = [
  { key: 'errored', title: 'Errored', columns: ID_REASON,
    note: 'The probe failed and no expectedError accepts the failure.' },
  { key: 'erroredExpected', title: 'Errored, and expected to', columns: ID_REASON,
    note: 'The probe failed in the way the register already records.' },
  { key: 'regressed', title: 'Regressed', columns: ID_ATTRIBUTE,
    note: 'The register says fm reports this and it did not report it here.' },
  { key: 'newlyReported', title: 'Newly reported', columns: ID_ATTRIBUTE,
    note: 'An attribute reported live but still marked missing in the register.' },
  { key: 'expectedResolved', title: 'Expected failure resolved',
    columns: [{ key: 'id', label: 'Entry' }, { key: 'expectedError', label: 'Expected error' }],
    note: 'The probe the register expects to fail succeeded: the gap closed.' },
  { key: 'attributeErrors', title: 'Attribute not verified', columns: [...ID_ATTRIBUTE, { key: 'reason', label: 'Reason' }],
    note: 'The attribute\'s own probe or selector failed, so it was scored neither way.' },
  { key: 'unexplained', title: 'Keys no attribute claims', columns: ID_KEYS,
    note: 'fm answered with a key the register does not account for.' },
  { key: 'nestedUnexplained', title: 'Nested keys no attribute claims', columns: ID_KEYS,
    note: 'The same question one level down, and the only list a gap closed by a nested key shows up in.' },
  { key: 'stillMissing', title: 'Still missing', columns: ID_ATTRIBUTE,
    note: 'The register says fm does not report this, and it still did not: the gap is where it was.' },
];

const CHECK_BUTTON = '<button data-action="gaps-check">Run the register\'s probes</button>';

function liveSection(solution) {
  const outcome = solution.gaps;
  if (!outcome) {
    return section('Live check', '<p class="muted">Runs every probe the register names against this file, in one fm '
      + 'invocation, through the same read-only guard as every other read. It reads; it writes nothing.</p>', { actions: CHECK_BUTTON });
  }
  if (outcome.fatal) {
    return section('Live check', `<p class="error">The batch failed: ${esc(get(outcome.fatal, 'message') ?? get(outcome.fatal, 'code'))}</p>`,
      { actions: CHECK_BUTTON });
  }
  // An entry whose probe failed was not scored either way. The register's probes
  // address the reference solution BY ID, so against any other file nearly every
  // one of them fails -- a refused probe and a selector that matched nothing are
  // the same fact, no such object here -- and a page that called that 300 fm bugs
  // would be lying. Half is the line: the reference solution answers 1 of 302.
  // `entries === 0` would make `0 >= 0` true and print "0 of 0 probes could not
  // find their object" about a register that named nothing to probe.
  const foreign = outcome.entries > 0 && outcome.probeFailures >= outcome.entries / 2
    ? `<p class="muted">${count(outcome.probeFailures)} of ${count(outcome.entries)} probes could not find their object. `
      + 'The register\'s probes address the reference solution by id, so most of them could not find their object '
      + 'because this is not the reference solution -- read the errors below as "not here", not as fm faults.</p>'
    : '';
  const body = `<p class="muted">Ran ${esc(outcome.ranAt)} against fm ${esc(outcome.fmVersion)} (${esc(outcome.build)}).</p>`
    + totalsLine([['Entries', outcome.entries], ...GAP_LISTS.map((l) => [l.title, (outcome[l.key] ?? []).length])])
    + foreign
    + GAP_LISTS.map((l) => `<h3>${esc(l.title)}</h3><p class="muted">${esc(l.note)}</p>`
      + table(l.columns, outcome[l.key] ?? [], { empty: 'None' })).join('');
  return section('Live check', body, { actions: CHECK_BUTTON });
}

// ── The renderer's own gaps ───────────────────────────────────────────

/** Every script step of every reached file put through the shared renderer, and every
 *  gap it reports, grouped by step type and gap kind. A step type the catalog has no
 *  entry for is counted apart and not rendered: the catalog says nothing about it, so
 *  it has no gaps -- it is a hole of a different shape.
 *
 *  Memoised through ui/analysis/memo.js, which keys on the catalog slots a re-read
 *  swaps at any grain (`list`, `detailById`) rather than on the solution object.
 *  Keying on the solution object alone would be wrong: only a solution-grain re-read
 *  builds a new one, so re-reading one script would leave the old counts on screen. */
export const renderingGaps = (solution) => memoise(solution, computeRenderingGaps);

function computeRenderingGaps(solution) {
  const conventions = stepConventions(CATALOG);
  const groups = new Map();
  const byKind = {};
  let steps = 0;
  let noCatalogEntry = 0;
  let stepsWithGaps = 0;
  let gaps = 0;
  for (const file of Object.values(solution.files ?? {})) {
    for (const held of Object.values(path(file, 'catalogs.script.detailById') ?? {})) {
      const detail = get(held, 'result');
      const body = get(detail, 'body') ?? [];
      body.forEach((step, i) => {
        steps += 1;
        const name = String(get(step, 'step') ?? '');
        const entry = catalogEntry(CATALOG, get(step, 'step'));
        if (!entry) {
          noCatalogEntry += 1;
          return;
        }
        const rendered = renderStepFromCatalog(step, entry, conventions);
        if (!rendered.gaps.length) return;
        stepsWithGaps += 1;
        for (const gap of rendered.gaps) {
          gaps += 1;
          byKind[gap.gap] = (byKind[gap.gap] ?? 0) + 1;
          const key = JSON.stringify([name, gap.gap]);
          if (!groups.has(key)) {
            groups.set(key, {
              step: name,
              gap: gap.gap,
              count: 0,
              example: {
                target: get(file, 'target'),
                script: String(get(detail, 'name') ?? ''),
                index: i + 1,
                key: gap.key,
                render: gap.render,
              },
            });
          }
          groups.get(key).count += 1;
        }
      });
    }
  }
  const out = {
    steps,
    noCatalogEntry,
    stepsWithGaps,
    gaps,
    byKind,
    groups: [...groups.values()].sort((a, b) => b.count - a.count || a.step.localeCompare(b.step)),
  };
  return out;
}

const RENDER_COLUMNS = [
  { key: 'step', label: 'Step type' },
  { key: 'gap', label: 'Gap' },
  { key: 'count', label: 'Steps', num: true, render: (r) => count(r.count) },
  { key: 'example', label: 'One of them', render: (r) => `${esc(r.example.script)} step ${count(r.example.index)}` },
  { key: 'option', label: 'Option', render: (r) => `<code>${esc(r.example.key)}</code> <span class="muted">${esc(r.example.render)}</span>` },
];

function renderingSection(solution, view) {
  const r = renderingGaps(solution);
  const shown = r.groups.filter((g) => matches(g.step, view.filter) || matches(g.gap, view.filter)
    || matches(g.example.script, view.filter) || matches(g.example.key, view.filter));
  const body = totalsLine([
    ['Steps', r.steps], ['Steps with a gap', r.stepsWithGaps], ['Gaps', r.gaps], ['No catalog entry', r.noCatalogEntry],
    ...Object.entries(r.byKind).sort((a, b) => b[1] - a[1]),
  ])
    + '<p class="muted">Where the step-display catalog cannot phrase an option the way FileMaker phrases it. The value is '
    + 'still printed on the step line -- what is missing is the measured wording, not the data. A step type the catalog has '
    + 'no entry for at all is counted above and not listed: it is rendered by the convention instead.</p>'
    + table(RENDER_COLUMNS, shown, { empty: emptyNote(r.groups.length, 'Every step rendered with no gap') });
  return section('Rendering gaps', body);
}

// ── Register facts ────────────────────────────────────────────────────

function factsSection(solution) {
  const facts = registerFacts(solution.register);
  return section('Register facts', kv([
    ['Register last checked against', facts
      ? `fm ${esc(facts.version)} (${esc(facts.build)}) on ${esc(facts.date)}`
      : '<span class="muted">not loaded</span>'],
    ['Entries in the register', solution.register ? count(solution.register.length) : '<span class="muted">not loaded</span>'],
    ['fm running here', esc(get(solution.cli, 'version') ?? '?')],
    ['Last live check', solution.gaps ? esc(solution.gaps.ranAt) : '<span class="muted">not run</span>'],
  ]));
}

export const tab = {
  id: 'gaps',
  label: 'Gaps',
  render(solution, view = {}) {
    return registerSection(solution, view)
      + liveSection(solution)
      + renderingSection(solution, view)
      + factsSection(solution);
  },
};
