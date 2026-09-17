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
// The register draws as the same three tables every other tab draws: the kinds, one
// kind's entries, one entry's attributes, each row selecting the next. Nothing nests.
//
// A pure renderer, like every other tab: no document, every fm key through access.js,
// every string through esc. What it asks of the shell is a click -- the row selections
// `*|gap-kind:<kind>` and `*|gap-entry:<id>`, and the two `data-action` buttons, which
// ui/app.js turns into a fetch.
import { badge, count, esc, kv, link, matches, section, table } from '../dom.js';
import { CATALOG, catalogEntry, renderStepFromCatalog, stepConventions } from 'fm-adt-toolkit/step-display';
import { get, path } from '../access.js';
import { memoise } from '../analysis/memo.js';
import { GAP_LISTS as NEUTRAL_LISTS } from '../analysis/gaps-lists.js';
import { emptyNote, kindSelection, selectRow, solutionKey, totalsLine } from './common.js';

// ── What fm cannot read yet ───────────────────────────────────────────

/** An attribute is one of three things, and never two: fm reports it, the owner has
 *  ruled it will never be reported (`wontfix`), or it is missing. */
export const statusOf = (a) => (a.reported ? 'reported' : a.wontfix ? 'wontfix' : 'missing');
const TONE = { reported: 'good', wontfix: 'muted', missing: 'bad' };

/** The two things this tab selects: a kind of the register, and one entry of it.
 *  Both are the SOLUTION's (`*`), not a file's -- the register is the toolkit's
 *  measurement of fm, and says nothing about which file is open. */
const REGISTER_KINDS = ['gap-kind', 'gap-entry'];

const registerSelection = (view) => {
  const sel = kindSelection(view?.selection, REGISTER_KINDS);
  // `*` is the only target the register answers for. Another tab's selection is
  // some file's, and this tab has nothing to say about it.
  return sel && sel.target === '*' ? sel : null;
};

/** The register grouped by the kind its id names -- `layout-object:button` is a
 *  layout-object -- with the three counts and their sum, which are the group's
 *  totals and are never narrowed by the filter. `attributes` is
 *  `reported + missing + wontfix` by construction: statusOf answers one of the
 *  three for every attribute and never two. */
export function registerGroups(register) {
  const groups = new Map();
  for (const entry of register ?? []) {
    const kind = String(entry.id ?? '').split(':')[0];
    if (!groups.has(kind)) {
      groups.set(kind, { kind, key: solutionKey('gap-kind', kind), entries: [], attributes: 0, reported: 0, missing: 0, wontfix: 0 });
    }
    const group = groups.get(kind);
    group.entries.push(entry);
    for (const a of entry.attributes ?? []) {
      group[statusOf(a)] += 1;
      group.attributes += 1;
    }
  }
  return [...groups.values()].sort((a, b) => a.kind.localeCompare(b.kind));
}

/** One row per entry of a group, with the entry's own totals. Rows, not entries:
 *  the table draws numbers, and the attributes themselves are a level further
 *  down -- they are what selecting the row shows. */
export function registerEntries(group) {
  return (group?.entries ?? []).map((entry) => {
    const attributes = entry.attributes ?? [];
    const row = {
      key: solutionKey('gap-entry', entry.id ?? ''),
      id: entry.id ?? '',
      op: entry.op ?? '',
      attributes: attributes.length,
      reported: 0,
      missing: 0,
      wontfix: 0,
      expectedError: entry.expectedError ?? '',
    };
    for (const a of attributes) row[statusOf(a)] += 1;
    return row;
  });
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

const KIND_COLUMNS = [
  // The kind is the way in, so it is a link as well as a selectable row: the
  // counts beside it are only useful next to the entries they are spread over.
  { key: 'kind', label: 'Kind', render: (g) => link(`gaps/${g.key}`, g.kind) },
  { key: 'entries', label: 'Entries', num: true, render: (g) => count(g.entries.length) },
  { key: 'attributes', label: 'Attributes', num: true, render: (g) => count(g.attributes) },
  { key: 'reported', label: 'Reported', num: true, render: (g) => count(g.reported) },
  { key: 'missing', label: 'Missing', num: true, render: (g) => count(g.missing) },
  { key: 'wontfix', label: 'Wontfix', num: true, render: (g) => count(g.wontfix) },
];

const ENTRY_COLUMNS = [
  { key: 'id', label: 'Entry', render: (r) => link(`gaps/${r.key}`, r.id) },
  { key: 'op', label: 'Op', render: (r) => (r.op ? `<code>${esc(r.op)}</code>` : '') },
  { key: 'attributes', label: 'Attributes', num: true, render: (r) => count(r.attributes) },
  { key: 'reported', label: 'Reported', num: true, render: (r) => count(r.reported) },
  { key: 'missing', label: 'Missing', num: true, render: (r) => count(r.missing) },
  { key: 'wontfix', label: 'Wontfix', num: true, render: (r) => count(r.wontfix) },
  // The one entry the register expects fm to refuse outright. Empty on every
  // other row rather than a word that would read as a verdict on it.
  { key: 'expectedError', label: 'Expected error', render: (r) => (r.expectedError ? badge(r.expectedError, 'warn') : '') },
];

/** The ops the register's probe names, as the ndjson fm is handed -- one op per
 *  line, which is the form the CLAUDE.md probe command takes and the form a
 *  reader can paste. The summary the page is served drops `lastChecked.command`
 *  (it is a path into a temp directory that no longer exists), so the ops ARE
 *  the exact probe; `select` is the checker's own narrowing of the answer and is
 *  said in words beside them. */
function probeHtml(probe) {
  const ops = probe?.ops;
  if (!Array.isArray(ops) || !ops.length) return '';
  const select = probe?.select;
  return `<pre>${esc(ops.map((op) => JSON.stringify(op)).join('\n'))}</pre>`
    + (select ? `<p class="muted">Narrowed to <code>${esc(select)}</code></p>` : '');
}

/** One kind of the register: its entries, one row each. Filtered on what the row
 *  says -- the entry's id and the op it is read with. */
function kindSection(groups, kind, view) {
  const group = groups.find((g) => g.kind === kind);
  if (!group) return '';
  const rows = registerEntries(group)
    .filter((r) => matches(r.id, view.filter) || matches(r.op, view.filter));
  const body = totalsLine([
    ['Entries', group.entries.length],
    ['Attributes', group.attributes],
    ['Reported', group.reported],
    ['Missing', group.missing],
    ['Wontfix', group.wontfix],
  ])
    + table(ENTRY_COLUMNS, rows, { empty: emptyNote(group.entries.length, 'No entries'), rowAttrs: selectRow(view.selection) });
  return section(`Kind ${kind}`, body);
}

/** One entry of the register: what it is read with, and every fact the export
 *  carries about it. Filtered on everything the row shows a reader -- the
 *  attribute's name, its export path, the fm key it would arrive under, and the
 *  sentence saying where it was known from. */
function entrySection(register, id, view) {
  const entry = (register ?? []).find((e) => (e.id ?? '') === id);
  if (!entry) return '';
  const kind = String(entry.id ?? '').split(':')[0];
  const attributes = entry.attributes ?? [];
  // The same tally the entries table draws, counted by the same function, so the
  // two tables cannot disagree about one entry.
  const [counts] = registerEntries({ entries: [entry] });
  const rows = attributes.filter((a) => matches(a.name ?? '', view.filter) || matches(a.path ?? '', view.filter)
    || matches(a.fmKey ?? '', view.filter) || matches(a.knownFrom ?? '', view.filter));
  // The Kind row is also the way back to the kind's entries: the entry came from
  // that table and a reader wants the neighbouring entries next.
  const pairs = [['Kind', link(`gaps/${solutionKey('gap-kind', kind)}`, kind)
    + (entry.kind ? ` <span class="muted">${esc(entry.kind)}</span>` : '')]];
  if (entry.op) pairs.push(['Op', `<code>${esc(entry.op)}</code>`]);
  const probe = probeHtml(entry.probe);
  if (probe) pairs.push(['Read with', probe]);
  if (entry.expectedError) pairs.push(['Expected error', badge(entry.expectedError, 'warn')]);
  const body = totalsLine([
    ['Attributes', counts.attributes],
    ['Reported', counts.reported],
    ['Missing', counts.missing],
    ['Wontfix', counts.wontfix],
  ])
    + kv(pairs)
    + table(ATTRIBUTE_COLUMNS, rows, { empty: emptyNote(attributes.length, 'No attributes') });
  return section(`Entry ${entry.id ?? id}`, body);
}

/** What the selection is showing, ABOVE the kinds table: a click's answer lands
 *  where the eye already is, and the overview stays under it. */
function registerDetail(solution, view, groups) {
  const register = solution.register;
  const sel = register && registerSelection(view);
  if (!sel) return '';
  return sel.kind === 'gap-kind'
    ? kindSection(groups, sel.id, view)
    : entrySection(register, sel.id, view);
}

function registerSection(solution, view, groups) {
  const register = solution.register;
  if (!register) {
    return section('What fm cannot read yet', '<p class="muted">The coverage register is the toolkit\'s, and it is 3MB of prose: '
      + 'it is fetched the first time this tab is opened rather than with the solution.</p>'
      + '<button data-action="gaps-register">Load the register</button>');
  }
  const body = totalsLine([
    ['Kinds', groups.length],
    ['Entries', register.length],
    ['Attributes', groups.reduce((n, g) => n + g.attributes, 0)],
    ['Reported', groups.reduce((n, g) => n + g.reported, 0)],
    ['Missing', groups.reduce((n, g) => n + g.missing, 0)],
    ['Wontfix', groups.reduce((n, g) => n + g.wontfix, 0)],
  ])
    + '<p class="muted">One row per kind the Save as XML export knows. Select a kind for its entries, an entry for its '
    + 'facts: which fm reports, which it does not, and where each was known from. '
    + 'The filter narrows the table you are looking at: kinds by name, entries by id and op, attributes by name, path, '
    + 'fm key and where they were known from.</p>'
    + table(KIND_COLUMNS, groups.filter((g) => matches(g.kind, view.filter)),
      { empty: emptyNote(groups.length, 'The register is empty'), rowAttrs: selectRow(view.selection) });
  return section('What fm cannot read yet', body);
}

// ── The live check ────────────────────────────────────────────────────

const ID_REASON = [{ key: 'id', label: 'Entry' }, { key: 'reason', label: 'Reason' }];
const ID_ATTRIBUTE = [{ key: 'id', label: 'Entry' }, { key: 'attribute', label: 'Attribute' }];

const ID_KEYS = [{ key: 'id', label: 'Entry' },
  { key: 'keys', label: 'Keys', render: (r) => esc((r.keys ?? []).join(', ')) }];

/** The columns each list is drawn with, by key. The lists themselves -- which
 *  ones there are, what each is called and what each MEANS -- are
 *  ui/analysis/gaps-lists.js's, because ui/export/markdown.js prints the same
 *  answer and must not import a tab to get at it. Columns are the one half that
 *  draws, so they stay here. */
const COLUMNS = {
  errored: ID_REASON,
  erroredExpected: ID_REASON,
  regressed: ID_ATTRIBUTE,
  newlyReported: ID_ATTRIBUTE,
  expectedResolved: [{ key: 'id', label: 'Entry' }, { key: 'expectedError', label: 'Expected error' }],
  attributeErrors: [...ID_ATTRIBUTE, { key: 'reason', label: 'Reason' }],
  unexplained: ID_KEYS,
  nestedUnexplained: ID_KEYS,
  stillMissing: ID_ATTRIBUTE,
};

/** The neutral lists with this tab's columns attached, in the neutral module's
 *  order. A list added there with no columns here falls back to entry-and-reason,
 *  which is the shape of the outcome rows fm's own errors arrive in: a new list
 *  is then drawn plainly rather than not at all. */
export const GAP_LISTS = Object.freeze(NEUTRAL_LISTS.map((l) => Object.freeze({ ...l, columns: COLUMNS[l.key] ?? ID_REASON })));

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
    + GAP_LISTS.map((l) => {
      const rows = outcome[l.key] ?? [];
      const note = `<p class="muted">${esc(l.note)}</p>`;
      const body = table(l.columns, rows, { empty: 'None' });
      // A long list (the register's ~1.6k still-missing attributes on the
      // reference solution) folds shut; the count in the summary line stays.
      return rows.length > 50
        ? `<details><summary>${esc(l.title)} (${rows.length})</summary>${note}${body}</details>`
        : `<h3>${esc(l.title)}</h3>${note}${body}`;
    }).join('');
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
    // Grouped once: the detail above the table and the table itself are two views
    // of the same grouping, and the register is 302 entries of prose.
    const groups = registerGroups(solution.register);
    return registerDetail(solution, view, groups)
      + registerSection(solution, view, groups)
      + liveSection(solution)
      + renderingSection(solution, view)
      + factsSection(solution);
  },
};
