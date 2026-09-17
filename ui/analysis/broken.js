// ui/analysis/broken.js
// Broken references: the ones fm's own read already knows are broken, plus
// the named references from Task 1 (ui/analysis/refs.js) that resolve to
// nothing.
//
// Four kinds, one flat list, `{ target, kind, from: {kind,id,name,where}, detail }`:
//   `problem`            -- an entry of fm's own `script.problems[]`, kept
//                            verbatim in `detail`. fm's list, not ours: whatever
//                            fields it carries (today: `path`, `step`) ride
//                            through unread and unchanged.
//   `missingMarker`       -- fm's own family of `<Word Missing>` tokens
//                            (`<Field Missing>`, `<Table Missing>`,
//                            `<Function Missing>`, and whatever other word fm
//                            writes there) inside any string the solution
//                            carries -- fm's own way of marking a reference it
//                            could not resolve when it rendered the object.
//                            `detail.what` is the word fm used (`Field`,
//                            `Function`, …); `detail.context` is 40 characters
//                            on each side of the marker, for a reader who
//                            needs to see it in place without opening the file.
//   `unresolvedOccurrence` -- a table occurrence whose base table did not
//                            resolve (`table.resolved === false`), read from
//                            the occurrence's own detail when there is one,
//                            the flattened list item otherwise.
//   `danglingName`         -- a `how:'named'` reference from `references()`
//                            that resolves to nothing. `variable` is excluded
//                            (Task 1: no catalog of variables exists, so
//                            `resolved` is always false there and means
//                            nothing); `how:'text'` is excluded, because a
//                            token the tokeniser invented is noise, not a name
//                            fm reported. `detail` carries the name that did
//                            not resolve and the kind it was looked up as.
//
// The one false positive this file knows about and suppresses: `Perform
// AppleScript` reports its AppleScript source under the same `script` key
// `Perform Script` uses for a script name (Task 1, measured on ooe: the only
// named reference that resolves to nothing is `display dialog "Hello
// world!"`). A real script name never carries a `"` or a newline, so that
// value shape is the rule this file adopts to drop it -- tested both for the
// quote and for a multi-line script. The cost, stated once here because
// `references()` cannot see it at all: a Go to Related Record naming a
// DELETED occurrence is resolve-gated in Task 1 (one key, two meanings, and
// nothing in the value to tell "occurrence name" from one of fm's own source
// words), so it never becomes a reference and this file never reports it.
//
// Pure: no document, no node:, no server/. Every fm key read through
// get/path. Memoised through ui/analysis/memo.js, like every other analysis:
// the memo keys on the catalog slots a re-read swaps, not on the solution
// object.
import { foldKey } from 'fm-adt-toolkit/step-display';
import { get, path } from '../access.js';
import { fieldsOf } from '../tabs/tables.js';
import { memoise } from './memo.js';
import { references, strings } from './refs.js';

const filesOf = (solution) => Object.values(get(solution, 'files') ?? {});
const listOf = (file, catalog) => path(file, `catalogs.${catalog}.list`) ?? [];
const detailOf = (file, catalog, id) => get(path(file, `catalogs.${catalog}.detailById.${id}`), 'result');
const detailsOf = (file, catalog) => Object.values(path(file, `catalogs.${catalog}.detailById`) ?? {})
  .map((d) => get(d, 'result')).filter((r) => r !== undefined && r !== null);

// ── fm's own `problems[]` ────────────────────────────────────────────────

/** The one kind in this list that is NOT a broken reference: fm's report about
 *  its own rendering of a step. Named here, where the kinds are made, because
 *  two surfaces have to split the total on it -- the Analysis tab's headline and
 *  the Markdown report -- and 352 problem rows beside 5 real broken references
 *  would otherwise read as one number. */
export const PROBLEM_KIND = 'problem';

function scriptProblems(solution) {
  const rows = [];
  for (const file of filesOf(solution)) {
    const target = get(file, 'target');
    for (const detail of detailsOf(file, 'script')) {
      for (const problem of get(detail, 'problems') ?? []) {
        rows.push({
          target, kind: PROBLEM_KIND,
          from: { kind: 'script', id: get(detail, 'id'), name: get(detail, 'name'), where: get(problem, 'path') },
          detail: { ...problem },
        });
      }
    }
  }
  return rows;
}

// ── The `<Word Missing>` marker family ───────────────────────────────────

// A relation has no name of its own -- fm identifies it by the two
// occurrences it joins, the same convention `references()` uses.
function nameOf(catalog, detail) {
  if (catalog !== 'relation') return get(detail, 'name') ?? String(get(detail, 'id'));
  const left = path(detail, 'left.name');
  const right = path(detail, 'right.name');
  return typeof left === 'string' && typeof right === 'string' ? `${left} ↔ ${right}` : String(get(detail, 'id'));
}

/** A shallow copy minus one key, matched the way `get` matches -- exact
 *  spelling first, then fm's case-and-separator fold -- so a build that respells
 *  `body` does not smuggle every step back in under the wrong prefix. The same
 *  helper ui/analysis/refs.js keeps for the same reason. */
const without = (obj, key) => {
  const drop = foldKey(key);
  const copy = {};
  for (const [k, v] of Object.entries(obj ?? {})) if (foldKey(k) !== drop) copy[k] = v;
  return copy;
};

// Every described object the solution carries, as a record to scan, who it is,
// and the prefix its `where` paths hang off. Deliberately coarser than Task 1's
// per-step sources -- a marker's owner is enough context, and `strings()`
// recurses into the children on its own -- with one exception: a script's body
// IS split per step, so a marker's `where` reads `body[84].value`, exactly the
// spelling ui/analysis/refs.js gives a reference on the same step. Two rows
// about one place in two notations is a reader's problem, not a reader's job.
// A field's options carry the `options` prefix for the same reason. What is
// left coarse is the layout walk: refs.js numbers a layout object by fm's own
// id (`object[12]`) and `strings()` numbers it by position, and no marker on
// the reference solution lands there -- when one does, that is the next split.
function* records(solution) {
  for (const file of filesOf(solution)) {
    const target = get(file, 'target');
    for (const t of listOf(file, 'table')) {
      const table = get(t, 'name');
      for (const f of fieldsOf(file, table)) {
        const name = `${table}::${get(f, 'name')}`;
        yield { target, record: get(f, 'options'), kind: 'field', id: name, name, prefix: 'options' };
      }
    }
    for (const catalog of ['script', 'layout', 'valueList', 'customFunction', 'customMenu', 'tableOccurrence', 'relation']) {
      for (const detail of detailsOf(file, catalog)) {
        const src = { target, kind: catalog, id: get(detail, 'id'), name: nameOf(catalog, detail) };
        if (catalog !== 'script') {
          yield { ...src, record: detail, prefix: '' };
          continue;
        }
        const body = get(detail, 'body') ?? [];
        for (let i = 0; i < body.length; i += 1) yield { ...src, record: body[i], prefix: `body[${i}]` };
        // Everything else the script carries -- `problems` above all -- still
        // goes through whole, minus the body already yielded.
        yield { ...src, record: without(detail, 'body'), prefix: '' };
      }
    }
  }
}

// fm's own family: `<Field Missing>`, `<Table Missing>`, `<Function Missing>`,
// and whatever other capitalised word fm writes there -- one marker shape,
// not a hand-written list of the words fm happens to use today.
const MARKER_RE = /<([A-Z][A-Za-z ]*) Missing>/g;
const CONTEXT = 40;

function missingMarkers(solution) {
  const rows = [];
  for (const src of records(solution)) {
    strings(src.record, (value, at) => {
      for (const m of value.matchAll(MARKER_RE)) {
        const start = Math.max(0, m.index - CONTEXT);
        const end = Math.min(value.length, m.index + m[0].length + CONTEXT);
        rows.push({
          target: src.target, kind: 'missingMarker',
          from: { kind: src.kind, id: src.id, name: src.name, where: src.prefix ? `${src.prefix}.${at}` : at },
          detail: { what: m[1], context: value.slice(start, end) },
        });
      }
    });
  }
  return rows;
}

// ── Occurrences whose base table did not resolve ─────────────────────────

function unresolvedOccurrences(solution) {
  const rows = [];
  for (const file of filesOf(solution)) {
    const target = get(file, 'target');
    for (const to of listOf(file, 'tableOccurrence')) {
      const id = get(to, 'id');
      const name = get(to, 'name');
      const detail = detailOf(file, 'tableOccurrence', id);
      const table = get(detail, 'table') ?? get(to, 'table');
      if (get(table, 'resolved') === false) {
        rows.push({
          target, kind: 'unresolvedOccurrence',
          from: { kind: 'tableOccurrence', id, name },
          detail: { table: get(table, 'name') },
        });
      }
    }
  }
  return rows;
}

// ── Named references that resolve to nothing ─────────────────────────────

// A real script name is never written with a quote or a line break; a value
// that has one is `Perform AppleScript`'s source, not a name at all.
const looksLikeAppleScript = (name) => name.includes('"') || /[\r\n]/.test(name);

function danglingNames(solution) {
  const rows = [];
  for (const ref of references(solution)) {
    if (ref.how !== 'named' || ref.resolved !== false || ref.kind === 'variable') continue;
    if (ref.kind === 'script' && looksLikeAppleScript(ref.name)) continue;
    const { target, ...from } = ref.from;
    rows.push({ target, kind: 'danglingName', from, detail: { name: ref.name, refKind: ref.kind } });
  }
  return rows;
}

// ── The analysis ──────────────────────────────────────────────────────────

/** Every reference the solution's own read already shows is broken, in one
 *  frozen list. Memoised through ui/analysis/memo.js, so a re-read at any grain
 *  recomputes it. */
export const broken = (solution) => memoise(solution, computeBroken);

function computeBroken(solution) {
  const out = [
    ...scriptProblems(solution),
    ...missingMarkers(solution),
    ...unresolvedOccurrences(solution),
    ...danglingNames(solution),
  ];
  Object.freeze(out);
  return out;
}
