// ui/analysis/unreferenced.js
// What nothing in the solution names -- fields, tables, occurrences, scripts,
// layouts, value lists, custom functions and named styles -- with how far the
// answer can be trusted.
//
// It is a filter over `references(solution)`: a catalog object is unreferenced
// when no reference of its kind resolves to it. Two rules shape the answer:
//
//   * an object never references ITSELF. A script that only calls itself, a
//     calculation field that only names itself, a recursive custom function are
//     all still unused; a self-call is not a user of the thing.
//   * a field belongs to a TABLE, not to an occurrence. `TO1::A` and `TO2::A`
//     are the same field, so one use through any occurrence of the table is a
//     use of the field.
//
// Two tiers say how strong a claim each row is, because what a developer does
// with this list is delete:
//   fields       `none` nothing names it at all; `text-only` the only thing
//                naming it is the tokeniser's reading of calculation text --
//                real evidence, but from the same reader that cannot follow an
//                indirection, so a human should look before deleting.
//   occurrences  `completely-unused` nothing names it; `relationship-only`
//                only relations do -- it is in the graph, but nothing reads or
//                writes through it.
//
// A third rule: an occurrence's fields are the SOURCE file's. `Inv_Remote::X`
// on an occurrence whose `table.dataSource` is external is a field of the file
// that source opens, whatever the occurrence is called here -- and when no file
// in the read answers that source, a field of that name is not judged at all.
//
// `confidence` qualifies the WHOLE list: `high` when every reference path this
// tool knows was readable and nothing in the file names an object at run time;
// `medium` when something does (Evaluate, GetField, a constructed ExecuteSQL, a
// script or layout named by calculation, an external source only the running
// file can resolve), so a listed object may still be used by code no static
// reader can follow; `low` when a read FAILED -- an unread listing or describe,
// a file that could not be opened -- because then the list is a claim about the
// read, not about the file, and another run could answer differently.
//
// Pure: no document, no node:, no server/. Every fm key read through access.js.
// Memoised per solution in a WeakMap, like every other analysis.
import { foldKey } from 'fm-adt-toolkit/step-display';
import { get, path } from '../access.js';
import { fieldsOf } from '../tabs/tables.js';
import { styleUsage } from '../tabs/themes.js';
import { nameIndex, references, strings } from './refs.js';

const listOf = (file, catalog) => path(file, `catalogs.${catalog}.list`) ?? [];
const filesOf = (solution) => Object.values(get(solution, 'files') ?? {});
const byName = (a, b) => String(a.target).localeCompare(String(b.target)) || String(a.name).localeCompare(String(b.name));

// ── Who uses what ─────────────────────────────────────────────────────

// The index a reference of each kind is answered from. `table` is not here on
// purpose: fm embeds the whole occurrence object into every layout object and
// relation, so a base table looks "named" wherever its occurrence appears. A
// table's users are its occurrences, which is a different question.
const INDEX_OF = {
  field: 'fields', occurrence: 'occurrences', script: 'scripts',
  layout: 'layouts', valueList: 'valueLists', customFunction: 'customFunctions',
};

// The key a use is recorded under. fm ids are unique per catalog and NOT across
// catalogs -- script 1 and custom function 1 are different objects -- so the
// kind is half of every key. A field is keyed by its table and a table
// occurrence by its name, because that is the identity each one is used under.
const KEY_OF = {
  field: (e) => `${e.table}::${e.field}`,
  occurrence: (e) => e.name,
};
const keyOf = (kind, e) => `${kind}\u0000${e.target}\u0000${(KEY_OF[kind] ?? ((x) => x.id))(e)}`;

/** Is this reference the object naming itself? A script that calls itself, a
 *  calc field in its own formula, a recursive custom function: none of them is
 *  a user of the thing, and without this rule every one would look used. */
function isSelf(kind, from, entry) {
  if (from.target !== entry.target) return false;
  if (kind === 'field') return from.kind === 'field' && from.id === `${entry.table}::${entry.field}`;
  if (kind === 'occurrence') return from.kind === 'tableOccurrence' && from.name === entry.name;
  // A layout object's id is `<layoutId>.<objectId>`: an object on the layout is
  // still the layout naming itself.
  if (kind === 'layout') return (from.kind === 'layout' || from.kind === 'layoutObject') && String(from.id).split('.')[0] === String(entry.id);
  if (kind === 'script' || kind === 'customFunction' || kind === 'valueList') return from.kind === kind && String(from.id) === String(entry.id);
  return false;
}

/** key -> the references naming the object there, self-references dropped. A
 *  name can match objects in more than one file and the index cannot say which
 *  was meant, so every match counts as used: over-listing a use costs a missed
 *  deletion, under-listing one costs a broken file. */
function usageByKey(solution) {
  const idx = nameIndex(solution);
  const used = new Map();
  const mark = (key, ref) => {
    const at = used.get(key);
    if (at) at.push(ref);
    else used.set(key, [ref]);
  };
  for (const ref of references(solution)) {
    const map = idx[INDEX_OF[ref.kind]];
    if (!map) continue;
    for (const entry of map.get(ref.name) ?? []) {
      if (!isSelf(ref.kind, ref.from, entry)) mark(keyOf(ref.kind, entry), ref);
      // A field reference is written `Occurrence::Field`: naming the field
      // names the occurrence it is read through.
      if (ref.kind === 'field') {
        // `target` is where the field lives; for an external occurrence the
        // occurrence itself lives in the file that named it.
        const occ = { target: entry.occurrenceTarget ?? entry.target, name: entry.occurrence };
        if (!isSelf('occurrence', ref.from, occ)) mark(keyOf('occurrence', occ), ref);
      }
    }
  }
  return used;
}

// ── The lists ─────────────────────────────────────────────────────────

/** `none` when nothing names it, `text-only` when the only thing that does is
 *  the tokeniser's reading of calculation text, `undefined` when it is used. */
function tierOf(uses) {
  if (!uses || uses.length === 0) return 'none';
  return uses.every((r) => r.how === 'text') ? 'text-only' : undefined;
}

/** Field names reached through an occurrence whose external data source could
 *  not be followed. The occurrence's fields are in a file this read never saw,
 *  so a field of that name anywhere may be the one it means: it cannot be
 *  judged, and a list that cannot judge a row must not print it as unused. */
function unjudgeable(solution) {
  const names = new Set();
  const unresolved = new Set((nameIndex(solution).unresolvedSources ?? []).map((u) => `${u.target}\u0000${u.occurrence}`));
  if (unresolved.size === 0) return names;
  for (const ref of references(solution)) {
    if (ref.kind !== 'field' || ref.resolved) continue;
    const at = ref.name.indexOf('::');
    if (at > 0 && unresolved.has(`${ref.from.target}\u0000${ref.name.slice(0, at)}`)) names.add(ref.name.slice(at + 2));
  }
  return names;
}

function unreferencedFields(solution, used) {
  const rows = [];
  const cannotJudge = unjudgeable(solution);
  for (const file of filesOf(solution)) {
    const target = get(file, 'target');
    for (const t of listOf(file, 'table')) {
      const table = get(t, 'name');
      for (const f of fieldsOf(file, table)) {
        const field = get(f, 'name');
        const tier = tierOf(used.get(keyOf('field', { target, table, field })));
        if (tier && !cannotJudge.has(field)) rows.push({ target, table, field, name: `${table}::${field}`, id: get(f, 'id'), tier });
      }
    }
  }
  return rows.sort((a, b) => byName(a, b) || String(a.field).localeCompare(String(b.field)));
}

/** A base table's users are its occurrences: nothing else in FileMaker points
 *  at a table directly. No occurrence, no way to reach the data. */
function unreferencedTables(solution) {
  const rows = [];
  for (const file of filesOf(solution)) {
    const target = get(file, 'target');
    const used = new Set(listOf(file, 'tableOccurrence').map((to) => path(to, 'table.name')));
    for (const t of listOf(file, 'table')) {
      if (!used.has(get(t, 'name'))) rows.push({ target, id: get(t, 'id'), name: get(t, 'name') });
    }
  }
  return rows.sort(byName);
}

function unreferencedOccurrences(solution, used) {
  const rows = [];
  for (const file of filesOf(solution)) {
    const target = get(file, 'target');
    for (const to of listOf(file, 'tableOccurrence')) {
      const name = get(to, 'name');
      const uses = used.get(keyOf('occurrence', { target, name })) ?? [];
      const sources = new Set(uses.map((r) => r.from.kind));
      const removability = sources.size === 0 ? 'completely-unused'
        : [...sources].every((k) => k === 'relation') ? 'relationship-only' : undefined;
      if (removability) rows.push({ target, id: get(to, 'id'), name, table: path(to, 'table.name'), removability });
    }
  }
  return rows.sort(byName);
}

/** The catalog kinds whose rule is simply "nothing names it". The index is the
 *  universe, not the listing: it has already dropped the folders and separators
 *  FileMaker draws alongside the real objects. */
function unreferencedByIndex(solution, used, kind) {
  const rows = [];
  for (const entry of [...nameIndex(solution)[INDEX_OF[kind]].values()].flat()) {
    const uses = used.get(keyOf(kind, entry)) ?? [];
    if (uses.length === 0) rows.push({ target: entry.target, id: entry.id, name: entry.name, folder: entry.folder });
  }
  return rows.sort(byName);
}

/** A named style nothing wears, per theme. The count is the Themes tab's own
 *  `styleUsage`, so the two tabs cannot disagree about what "used" means. */
function unusedStyles(solution) {
  const rows = [];
  for (const file of filesOf(solution)) {
    const target = get(file, 'target');
    for (const theme of listOf(file, 'theme')) {
      const name = String(get(theme, 'displayName') ?? get(theme, 'name') ?? '');
      for (const style of styleUsage(file, theme)) {
        if (style.used === 0) rows.push({ target, theme: name, themeId: String(get(theme, 'id')), key: style.key, display: style.display });
      }
    }
  }
  return rows.sort((a, b) => String(a.target).localeCompare(String(b.target)) || a.theme.localeCompare(b.theme) || a.display.localeCompare(b.display));
}

// ── How far the answer can be trusted ─────────────────────────────────

// Names built at run time, the legacy inspector's patterns: Evaluate always,
// ExecuteSQL when its query is not a literal. Every GetField counts, with the
// non-literal ones counted separately in the reason, because the tokeniser
// skips quoted text and so cannot see a literal name either. Case-insensitive,
// because FileMaker function names are.
const EVALUATE = /\bEvaluate\s*\(/gi;
const GET_FIELD = /\b(?:GetField|GetFieldName)\s*\(/gi;
const GET_FIELD_DYNAMIC = /\b(?:GetField|GetFieldName)\s*\(\s*[^"\s)]/gi;
const SQL_CALL = /\bExecuteSQLe?\s*\(/gi;
const SQL_LITERAL_ARG = /^\s*"(?:\\.|[^"\\])*"\s*[;)]/;

// fm reports the name under these keys as calculation text, not as a literal
// name (measured: every value on the fixture is `$Var`, `Get ( ScriptName )` or
// a quoted string), so a script or layout named this way is invisible to the
// named path whatever the scan does.
const CALCULATED_NAME_KEYS = new Map(['scriptName', 'layoutName', 'layoutByCalculation', 'objectName', 'fileName'].map((k) => [foldKey(k), k]));

const places = (n) => (n === 1 ? '1 place' : `${n} places`);
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function signals(solution) {
  const s = { evaluate: 0, getField: 0, getFieldDynamic: 0, sql: 0, calculatedName: 0, keys: new Set() };
  const hits = (text, re) => (text.match(re) ?? []).length;
  for (const file of filesOf(solution)) {
    // Every string of every catalog, whatever its key: a formula is not only
    // where a key list says it is.
    strings(get(file, 'catalogs'), (value, at, key) => {
      const calculated = CALCULATED_NAME_KEYS.get(foldKey(key));
      if (calculated) { s.calculatedName += 1; s.keys.add(calculated); }
      s.evaluate += hits(value, EVALUATE);
      s.getField += hits(value, GET_FIELD);
      s.getFieldDynamic += hits(value, GET_FIELD_DYNAMIC);
      for (const call of value.matchAll(SQL_CALL)) {
        if (!SQL_LITERAL_ARG.test(value.slice(call.index + call[0].length))) s.sql += 1;
      }
    });
  }
  return s;
}

/** What was asked for and not answered: a list built on a partial read has to
 *  say so. */
function unread(solution) {
  const out = [];
  let listErrors = 0;
  let detailErrors = 0;
  for (const file of filesOf(solution)) {
    for (const slot of Object.values(get(file, 'catalogs') ?? {})) {
      if (get(slot, 'listError')) listErrors += 1;
      detailErrors += Object.values(get(slot, 'detailById') ?? {}).filter((d) => get(d, 'error') !== undefined).length;
    }
  }
  // An unreachable file is two different facts. A read that FAILED (the host has
  // no such file, the account cannot open it) is a hole in this read, and
  // another run could fill it. A path only the running file can resolve (a
  // `$$variable`) is a permanent property of the solution: no read ever gets it,
  // so it lowers the answer but does not make it provisional.
  const failed = (get(solution, 'unreachable') ?? []).filter((u) => path(u, 'error.code') !== 'unresolvable').length;
  if (listErrors) out.push(`${count(listErrors, 'catalog listing', 'catalog listings')} could not be read, so part of the solution was never scanned.`);
  if (detailErrors) out.push(`${count(detailErrors, 'described object', 'described objects')} could not be read, so the names carried there are unknown.`);
  if (failed) out.push(`${count(failed, 'file', 'files')} could not be read, so a reference from another file cannot be seen.`);
  return out;
}

/** The limits this solution carries whatever is read: a file named by a path
 *  only the running file resolves, and an occurrence whose external source
 *  cannot be followed to a file in this read. */
function runtimePaths(solution) {
  const out = [];
  const byVariable = (get(solution, 'unreachable') ?? []).filter((u) => path(u, 'error.code') === 'unresolvable');
  if (byVariable.length) {
    out.push(`${count(byVariable.length, 'external data source names', 'external data sources name')} a file by a path the running file resolves (${byVariable.map((u) => `${get(u, 'via')} -> ${get(u, 'target')}`).join(', ')}): what that file references cannot be seen.`);
  }
  for (const u of nameIndex(solution).unresolvedSources ?? []) {
    out.push(`The occurrence ${get(u, 'occurrence')} reads table ${get(u, 'table')} through the external data source ${get(u, 'dataSource')}, which no file in this read answers: a field named through it cannot be judged and is not listed.`);
  }
  return out;
}

// What no read of this solution can see, whatever it contains. These are
// standing limits of the source, not properties of the file, so they are notes
// and never move the tier: a tier that is always lowered says nothing.
const NOTES = [
  'Plug-in function call sites cannot be told from built-in ones (toolkit gap plugin-call-sites), so a field or script name passed to a plug-in is not counted as a reference.',
  'fm has no file-options read (toolkit gap file-options), so the file\'s startup layout and its opening and closing scripts are invisible: an object used only there is listed here.',
  'A privilege set\'s custom access lists can name individual layouts, scripts and value lists; the reference scan does not read them, so an object reachable only through one is listed here.',
  'fm 0.7.0 reports no style on a layout part (the register\'s part: entries name every key a part carries, and a style is not among them), so a named style worn only by a part is listed here as unused.',
];

function confidenceOf(solution) {
  const incomplete = unread(solution);
  const s = signals(solution);
  const reasons = [...incomplete, ...runtimePaths(solution)];
  if (s.evaluate) reasons.push(`Evaluate ( ) in ${places(s.evaluate)}: it runs a calculation built at run time, which can name anything.`);
  if (s.getField) reasons.push(`GetField ( ) / GetFieldName ( ) in ${places(s.getField)} (${s.getFieldDynamic} with a non-literal argument): the field is named by text the reference scan does not follow.`);
  if (s.sql) reasons.push(`ExecuteSQL ( ) with a constructed query in ${places(s.sql)}: an identifier built from variables cannot be read.`);
  if (s.calculatedName) reasons.push(`A script, layout or object named by calculation in ${places(s.calculatedName)} (${[...s.keys].sort().join(', ')}): fm reports these keys as calculation text, so the name is not a name the scan can match.`);
  const tier = incomplete.length ? 'low' : reasons.length ? 'medium' : 'high';
  return Object.freeze({ tier, reasons: Object.freeze(reasons), notes: Object.freeze([...NOTES]) });
}

// ── The analysis ──────────────────────────────────────────────────────

const cache = new WeakMap();

/** Everything nothing names, per kind, plus the confidence of the whole list.
 *  Memoised on the solution object, which a re-read replaces (ui/model.js). */
export function unreferenced(solution) {
  const hit = cache.get(solution);
  if (hit) return hit;
  const used = usageByKey(solution);
  const out = {
    fields: unreferencedFields(solution, used),
    tables: unreferencedTables(solution),
    occurrences: unreferencedOccurrences(solution, used),
    scripts: unreferencedByIndex(solution, used, 'script'),
    layouts: unreferencedByIndex(solution, used, 'layout'),
    valueLists: unreferencedByIndex(solution, used, 'valueList'),
    customFunctions: unreferencedByIndex(solution, used, 'customFunction'),
    styles: unusedStyles(solution),
    confidence: confidenceOf(solution),
  };
  // One answer, shared by every caller and memoised: frozen, so a tab that
  // filters cannot leave the next one a shorter list.
  for (const rows of Object.values(out)) if (Array.isArray(rows)) Object.freeze(rows);
  Object.freeze(out);
  if (solution !== null && typeof solution === 'object') cache.set(solution, out);
  return out;
}
