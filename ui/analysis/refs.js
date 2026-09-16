// ui/analysis/refs.js
// Every place any object in the solution names another one, in one list.
//
// Two ways a name is found, and the list says which:
//   `named` -- fm itself reports the reference under a key it documents
//              (`script`, `scriptReference`, `callback`, `layout`, `field`,
//              `vectorsField`, `labelsField`, `valueList`, `tableOccurrence`,
//              `context`, `startTable`, `table`, `style`, `from`, `breakField`,
//              `occurrence` + `field` pairs).
//   `text`  -- the name appears inside FileMaker calculation syntax, found by
//              tokenising the string. No key list decides where a formula may
//              live: EVERY string value of every described object goes through
//              `strings()`, whatever its key, and every one that is not a
//              literal name is tokenised.
//
// A Reference is { kind, name, resolved, how, from: { target, kind, id, name,
// where, stepID? } }. Conventions the rest of the analyses rely on:
//   * a `field` reference's `name` is `Occurrence::Field` -- that is what a
//     calculation writes and what the index is keyed on;
//   * a `variable` reference is always `resolved: false`. There is no catalog of
//     variables to resolve against, so the index cannot say; whether a `$$`
//     global is ever set is globals.js's question, not this one's;
//   * `from.stepID` is present exactly when the naming object is a script step,
//     which is the anchor the Scripts tab links to (`#<stepID>`);
//   * an occurrence's fields are the SOURCE file's: `nameIndex` follows
//     `table.dataSource` to the file that source opens, so a field entry's
//     `target` is where the field lives and `occurrenceTarget` where the name
//     that reaches it was written. `nameIndex(solution).unresolvedSources` lists
//     the occurrences whose source cannot be followed, each with a `reason`:
//     `unanswered` (no file in the read is named by it) or `ambiguous` (more
//     than one is, and the entry carries their `candidates`).
//
// `from.id` has four shapes, one per kind of owner:
//   * `field`                -> `BaseTable::Field`. A field belongs to a table,
//                               NOT to an occurrence: this string and a field
//                               reference's `name` look alike and are different
//                               namespaces.
//   * `layoutObject`         -> `<layoutId>.<objectId>`, fm's two numbers.
//   * `layout`, `script`, `valueList`, `customFunction`, `customMenu`,
//     `tableOccurrence`      -> fm's own numeric id for that object.
//   * `relation`             -> fm's numeric relation id; its `from.name` is
//                               `Left <-> Right`, because a relation has no name.
//
// The one thing the field-token rule can get wrong: an occurrence or field name
// containing a space or an operator character cannot be written in the token
// class, so `My TO::Field` in calculation text tokenises as `TO::Field` -- an
// invented name that then resolves to nothing. Measured on ooe: no occurrence,
// table or field name carries such a character, so it costs nothing there. On a
// solution that does, Task 3 would see a dangling name that is not one.
//
// Pure: no document, no node:, no server/. Every fm key read through access.js.
// Memoised through ui/analysis/memo.js, so a tab may ask as often as it likes
// and a re-read at ANY grain recomputes: the memo keys on the catalog slots a
// re-read swaps (`list`, `detailById`) and on `file.facts`, not on the solution
// object, which only a solution-grain re-read replaces. The memoised list and
// each index entry array are frozen: they are shared by every caller.
import { foldKey } from 'fm-adt-toolkit/step-display';
import { get, path } from '../access.js';
import { memoise } from './memo.js';
import { walkObjects } from '../tabs/layouts.js';
import { fieldsOf } from '../tabs/tables.js';

// ── The one string walk ───────────────────────────────────────────────

/** Visit every string value of `obj`, however deep, with its dotted key path,
 *  its own key, and the object it sits on. Array indices are path segments. */
export function strings(obj, visit, prefix = '') {
  if (obj === null || typeof obj !== 'object') return;
  const entries = Array.isArray(obj) ? obj.map((v, i) => [String(i), v]) : Object.entries(obj);
  for (const [key, value] of entries) {
    const at = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') visit(value, at, key, obj);
    else if (value !== null && typeof value === 'object') strings(value, visit, at);
  }
}

// ── The tokeniser ─────────────────────────────────────────────────────

// fm writes calculations as literal FileMaker syntax. A field reference is
// unquoted `Occurrence::Field`; anything inside "…" is data, not a reference.
// The character class is the brief's: everything an operator or a separator
// can be is excluded, which is also why `<Field Missing>` never matches -- fm's
// marker for a reference it could not resolve is angle-bracketed on purpose.
const NAME_CHARS = '[^:;()\\[\\]{}"\\s,+\\-*/&=<>≤≥≠^]+';
const FIELD_RE = new RegExp(`${NAME_CHARS}::${NAME_CHARS}`, 'g');
const VAR_RE = /\$\$?[\p{L}\p{N}_][\p{L}\p{N}_.]*/gu;
const CALL_RE = /([\p{L}_][\p{L}\p{N}_]*)\s*\(/gu;

/** Blank out "…" literals, // line comments and /* *\/ blocks in place, so what
 *  is left is only the code -- the one pass that decides what is data and what
 *  is a name. `quoted` is how many literals were skipped. */
function code(text) {
  let out = '';
  let quoted = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"') {
      quoted += 1;
      out += ' ';
      i += 1;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') { out += ' '; i += 1; }
        out += ' ';
        i += 1;
      }
      out += i < text.length ? ' ' : '';
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\r' && text[i] !== '\n') { out += ' '; i += 1; }
      out += i < text.length ? text[i] : '';
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      out += '  ';
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { out += ' '; i += 1; }
      out += i < text.length ? '  ' : '';
      i += 1;
      continue;
    }
    out += c;
  }
  return { text: out, quoted };
}

const uniq = (list) => [...new Set(list)];

/** The names a FileMaker calculation mentions. `quoted` is how many string
 *  literals were skipped -- the count a caller needs to tell "no references"
 *  from "everything was data". */
export function tokenise(text) {
  if (typeof text !== 'string' || text === '') return { fields: [], variables: [], functions: [], quoted: 0 };
  const { text: bare, quoted } = code(text);
  const fields = bare.match(FIELD_RE) ?? [];
  // Field tokens are blanked before the call scan so `TO::Func (` does not read
  // as a call, and before the variable scan for the same reason.
  let rest = bare;
  for (const f of fields) rest = rest.split(f).join(' '.repeat(f.length));
  const variables = rest.match(VAR_RE) ?? [];
  const functions = [...rest.matchAll(CALL_RE)].map((m) => m[1]);
  return { fields: uniq(fields), variables: uniq(variables), functions: uniq(functions), quoted };
}

// ── The name index ────────────────────────────────────────────────────

function push(map, name, entry) {
  if (typeof name !== 'string' || name === '') return;
  const list = map.get(name);
  if (list) list.push(entry);
  else map.set(name, [entry]);
}

const listOf = (file, catalog) => path(file, `catalogs.${catalog}.list`) ?? [];
const detailsOf = (file, catalog) => Object.values(path(file, `catalogs.${catalog}.detailById`) ?? {})
  .map((d) => get(d, 'result')).filter((r) => r !== undefined && r !== null);

// ── Where an occurrence's fields live ─────────────────────────────────

/** The file a `file:` path names, by the file's own `Get ( FileName )`. fm
 *  writes the path as the user typed it (`file:BrojDva`, `file:../x.fmp12`), so
 *  the last segment without the extension is the name, matched case-insensitively
 *  the way FileMaker matches file names. */
function filesNamed(path_, filesByName) {
  const tail = String(path_).slice(5).split(/[\\/]/).pop() ?? '';
  return filesByName.get(tail.replace(/\.fmp12$/i, '').trim().toLowerCase()) ?? [];
}

/** The file whose tables an occurrence's fields come from, as `{ file }`, or why
 *  it cannot be said, as `{ reason, candidates? }`. A local occurrence reads its
 *  own file. One whose `table.dataSource` names an external source reads the
 *  file that source opens -- the fields of `Inv_Remote::…` are the OTHER file's,
 *  whatever the occurrence is called here.
 *
 *  The first `file:` path that names anything decides, and it has to name ONE
 *  thing: two files in the read calling themselves the same `Get ( FileName )`
 *  is `ambiguous`, and picking either would be a guess printed as a fact. A path
 *  nothing answers (the file is not in the read, an `odbc:` dsn, a `$$variable`)
 *  is `unanswered`. Both mean the same to a caller: nothing can be said about
 *  those fields, which is not the same as saying there are none. */
function sourceFile(file, to, sources, filesByName) {
  const dataSource = path(to, 'table.dataSource');
  if (typeof dataSource !== 'string' || dataSource === '') return { file };
  const eds = sources.get(dataSource.toLowerCase());
  for (const p of get(eds, 'paths') ?? []) {
    if (!String(p).toLowerCase().startsWith('file:')) continue;
    const hits = filesNamed(p, filesByName);
    if (hits.length === 1) return { file: hits[0] };
    if (hits.length > 1) return { reason: 'ambiguous', candidates: hits.map((f) => get(f, 'target')) };
  }
  return { reason: 'unanswered' };
}

/** Every named object of every reached file, by name. A name is not unique
 *  across files (and `TO::Field` is not unique across occurrences of one
 *  table), so a lookup answers with every match.
 *
 *  `unresolvedSources` is the other half of the answer: every occurrence whose
 *  external data source could not be followed, so a caller can tell "no field of
 *  that name" from "nothing was read about that name". */
export const nameIndex = (solution) => memoise(solution, computeNameIndex);

function computeNameIndex(solution) {
  const idx = {
    tables: new Map(), occurrences: new Map(), fields: new Map(), scripts: new Map(),
    layouts: new Map(), valueLists: new Map(), customFunctions: new Map(), themesStyles: new Map(),
  };
  const unresolvedSources = [];
  const files = Object.values(get(solution, 'files') ?? {});
  // A file is found by the name it calls itself, `Get ( FileName )`, which is
  // what an external data source's `file:` path names.
  // Every file of that name, not the first: a name two files share resolves to
  // neither (see sourceFile).
  const filesByName = new Map();
  for (const f of files) {
    const n = get(f, 'name');
    if (typeof n !== 'string' || n === '') continue;
    const at = filesByName.get(n.toLowerCase());
    if (at) at.push(f); else filesByName.set(n.toLowerCase(), [f]);
  }
  for (const file of files) {
    const target = get(file, 'target');
    const sources = new Map(listOf(file, 'externalDataSource').map((eds) => [String(get(eds, 'name')).toLowerCase(), eds]));
    for (const t of listOf(file, 'table')) push(idx.tables, get(t, 'name'), { target, id: get(t, 'id'), name: get(t, 'name') });
    for (const to of listOf(file, 'tableOccurrence')) {
      const name = get(to, 'name');
      const table = path(to, 'table.name');
      const dataSource = path(to, 'table.dataSource');
      push(idx.occurrences, name, { target, id: get(to, 'id'), name, table, dataSource, resolved: path(to, 'table.resolved') !== false });
      // `TO::Field` exists when the occurrence's base table has the field: the
      // index is that cross product, so a field token is one lookup. The fields
      // are the SOURCE file's, which for an external occurrence is another file:
      // `target` says where the field lives, `occurrenceTarget` where the name
      // that reaches it was written.
      const owner = sourceFile(file, to, sources, filesByName);
      if (!owner.file) {
        unresolvedSources.push(owner.candidates
          ? { target, occurrence: name, table, dataSource, reason: owner.reason, candidates: owner.candidates }
          : { target, occurrence: name, table, dataSource, reason: owner.reason });
        continue;
      }
      const ownerTarget = get(owner.file, 'target');
      for (const f of fieldsOf(owner.file, table)) {
        push(idx.fields, `${name}::${get(f, 'name')}`, { target: ownerTarget, occurrenceTarget: target, id: get(f, 'id'), name: `${name}::${get(f, 'name')}`, occurrence: name, table, field: get(f, 'name') });
      }
    }
    for (const [catalog, map] of [['script', idx.scripts], ['layout', idx.layouts], ['valueList', idx.valueLists], ['customFunction', idx.customFunctions]]) {
      // A flattened listing carries the folders FileMaker draws alongside the
      // members; only a member is an object a name can mean.
      const details = path(file, `catalogs.${catalog}.detailById`) ?? {};
      for (const item of listOf(file, catalog)) {
        if (get(item, 'type') !== undefined && get(item, 'type') !== catalog) continue;
        const detail = get(get(details, String(get(item, 'id'))), 'result');
        push(map, get(item, 'name'), {
          target, id: get(item, 'id'), name: get(item, 'name'), folder: get(item, 'folder'),
          arity: get(detail, 'arity'), type: get(detail, 'type') ?? get(item, 'type'),
        });
      }
    }
    for (const theme of listOf(file, 'theme')) {
      // An object wears a style by its display name, so that is the key; the
      // theme it belongs to is what makes the match legal, so it rides along.
      for (const [key, display] of Object.entries(get(theme, 'namedStyleNames') ?? {})) {
        push(idx.themesStyles, String(display), { target, id: get(theme, 'id'), themeId: String(get(theme, 'id')), key, display: String(display), name: String(display) });
      }
    }
  }
  idx.unresolvedSources = Object.freeze(unresolvedSources);
  // Shared by every caller and memoised: frozen, so one tab cannot edit another
  // tab's answer. The maps stay mutable only to this function, which is done.
  for (const map of Object.values(idx)) if (map instanceof Map) for (const list of map.values()) Object.freeze(list);
  return idx;
}

// ── What fm names, and under which key ────────────────────────────────

// A string under one of these keys is a literal name fm reports, not a formula.
// Every other string is a formula candidate and goes to the tokeniser. Keys fm
// gives calculation text under (`scriptName`, `layoutName`, `objectName`,
// `layoutByCalculation`, `fileName`) are deliberately NOT here: measured on the
// ooe fixture every one of their values is calculation syntax (`"Test"`,
// `$LayoutName`, `Get ( ScriptName )`), so the text walk is what reads them.
const NAMED_STRING = {
  script: 'script', layout: 'layout', valueList: 'valueList', style: 'style',
  context: 'occurrence', startTable: 'occurrence', occurrence: 'occurrence',
  // Measured the other way round too -- every value these keys carry on ooe is
  // a literal name, never calculation text: `scriptReference` (Configure Region
  // Monitor Script, Configure Local Notification, Configure NFC Reading),
  // `callback` (Perform Script on Server with Callback), `table` (Save Records
  // as JSONL, Fine-Tune Model; the only string `table` key in the whole model).
  scriptReference: 'script', callback: 'script', table: 'table',
};

// Keys whose value is a field name, bare or `TO::Field`: fm's `field` plus the
// two the regression steps use.
const FIELD_KEYS = new Set(['field', 'vectorsField', 'labelsField']);

// A `{ name, id, … }` object under one of these keys names an object of that
// kind: `field.tableOccurrence`, a trigger's `script`, a relation's
// `left`/`right`, a layout object's `valueList`, a sub-summary part's
// `breakField`. `table` is NOT here: see the scan, where only the occurrence
// that declares a base table counts as naming it.
const NAMED_OBJECT = {
  tableOccurrence: 'occurrence', script: 'script', field: 'field',
  layout: 'layout', valueList: 'valueList', left: 'occurrence', right: 'occurrence',
  breakField: 'field',
};

const owner = (at) => at.split('.').at(-2) ?? '';

// ── The scan ──────────────────────────────────────────────────────────

const INDEX_OF = {
  field: 'fields', table: 'tables', occurrence: 'occurrences', script: 'scripts',
  layout: 'layouts', valueList: 'valueLists', customFunction: 'customFunctions',
};

function resolver(idx) {
  return (kind, name, themeId) => {
    // A style is worn by display name, but only one theme's styles are the
    // layout's to wear, so the theme is half the match. A layout with no theme
    // wears none of them: `themeId` is null there, and null matches nothing.
    if (kind === 'style') return themeId != null && (idx.themesStyles.get(name) ?? []).some((st) => st.themeId === themeId);
    const map = idx[INDEX_OF[kind]];
    return map ? map.has(name) : false; // a variable has no catalog to be in.
  };
}

/** One described object -- a field, a script step, a layout object, a custom
 *  function -- scanned for every name it carries. `src` says who is naming. */
function scanRecord(record, src, out, resolve, idx) {
  const emit = (kind, name, at, how) => {
    if (typeof name !== 'string' || name.trim() === '') return;
    const where = src.prefix ? `${src.prefix}${at ? `.${at}` : ''}` : at;
    const from = { target: src.target, kind: src.kind, id: src.id, name: src.name, where };
    if (src.stepID !== undefined) from.stepID = src.stepID;
    out.push({ kind, name, resolved: kind === 'variable' ? false : resolve(kind, name, src.themeId), how, from });
  };
  strings(record, (value, at, key, parent) => {
    // A record's own name is not a reference to anything. Only a record that
    // HAS a name of its own is skipped here: a script step's root `name` is the
    // variable a Set Variable writes -- an operand, and the set site globals.js
    // reads -- not the step's name, so it goes on to be tokenised.
    if (at === 'name' && src.hasOwnName) return;

    // 1. fm named it outright.
    if (key === 'name') {
      // A base table is named by the one record that declares it, an
      // occurrence's own `table.name`. fm echoes that same object inside every
      // layout, layout object and relation that reaches it; counting the echoes
      // would make "who uses this table" unanswerable, so they stop here.
      if (owner(at) === 'table') {
        if (src.kind === 'tableOccurrence' && at === 'table.name') emit('table', value, at, 'named');
        return;
      }
      const kind = NAMED_OBJECT[owner(at)];
      if (kind) { emit(kind, value, at, 'named'); return; }
    }
    if (FIELD_KEYS.has(key)) {
      // `{ occurrence, field }` (value lists, lookups, summaries), a bare
      // `TO::Field` (Set Field, sort specs, the regression steps), or a
      // table-local field name.
      const oc = get(parent, 'occurrence');
      if (value.includes('::')) emit('field', value, at, 'named');
      else if (typeof oc === 'string') emit('field', `${oc}::${value}`, at, 'named');
      else if (src.occurrences) for (const o of src.occurrences) emit('field', `${o}::${value}`, at, 'named');
      return;
    }
    if (key === 'target') {
      // fm's `target` is a field, a variable, or one of its own words
      // (`currentLayout`, `byName`): only the first two name anything.
      if (value.includes('::')) emit('field', value, at, 'named');
      else if (value.startsWith('$')) emit('variable', value, at, 'named');
      return;
    }
    if (key === 'from') {
      // Go to Related Record's `from` is an occurrence; Insert from Device's,
      // Open PDF's and Append PDF's is one of fm's own source words (`camera`,
      // `file`, `target`). One key, two meanings and nothing in the value's
      // shape to tell them apart, so the index decides: a `from` that names an
      // occurrence is a reference, anything else is a word. The cost is that a
      // Go to Related Record pointing at a DELETED occurrence reads as a word
      // and is never reported dangling -- Task 3 cannot see it here.
      if (idx.occurrences.has(value)) emit('occurrence', value, at, 'named');
      return;
    }
    const named = NAMED_STRING[key];
    // An external value list is fm's `Source::List`: the half after `::` is the
    // list's own name, and the index is solution-wide, so the file half is not
    // what makes the match.
    if (named === 'valueList' && value.includes('::')) { emit('valueList', value.slice(value.indexOf('::') + 2), at, 'named'); return; }
    if (named) { emit(named, value, at, 'named'); return; }
    // `prototype` is fm's rendering of this custom function's own signature
    // (`GFN ( field )`), not calculation text: measured on the fixture it is the
    // only key whose value re-states the object's own name in call form, and
    // tokenising it would make every custom function reference itself.
    if (key === 'prototype') return;

    // 2. Otherwise it is a formula until the tokeniser says otherwise.
    const t = tokenise(value);
    for (const f of t.fields) emit('field', f, at, 'text');
    for (const v of t.variables) emit('variable', v, at, 'text');
    // A built-in function is not a reference; only a custom function is.
    for (const fn of t.functions) if (idx.customFunctions.has(fn)) emit('customFunction', fn, at, 'text');
  });
}

/** A shallow copy minus some keys, matched the way `get` matches: exact
 *  spelling first, then fm's case-and-separator fold, so a build that respells
 *  `objects` does not smuggle a second visit of every child back in. */
const without = (obj, ...keys) => {
  const drop = new Set(keys.map(foldKey));
  const copy = {};
  for (const [k, v] of Object.entries(obj ?? {})) if (!drop.has(foldKey(k))) copy[k] = v;
  return copy;
};

/** Every described object of every file, as a record to scan plus who it is. */
function* sources(solution) {
  for (const file of Object.values(get(solution, 'files') ?? {})) {
    const target = get(file, 'target');

    for (const t of listOf(file, 'table')) {
      const table = get(t, 'name');
      for (const f of fieldsOf(file, table)) {
        const name = `${table}::${get(f, 'name')}`;
        // A summary or a lookup may name a field of its own table with no
        // occurrence: the occurrences of that table are what such a name can mean.
        // An occurrence with a `dataSource` points at another file's table of
        // that name, so it is not what a bare local field name can mean.
        const occurrences = listOf(file, 'tableOccurrence')
          .filter((o) => path(o, 'table.name') === table && path(o, 'table.dataSource') === undefined)
          .map((o) => get(o, 'name'));
        yield { record: get(f, 'options'), target, kind: 'field', id: name, name, prefix: 'options', occurrences };
      }
    }

    for (const detail of detailsOf(file, 'script')) {
      const src = { target, kind: 'script', id: get(detail, 'id'), name: get(detail, 'name') };
      const body = get(detail, 'body') ?? [];
      // A step has no name of its own -- `name` on a step is an operand -- so
      // `hasOwnName` stays false here. `stepID` is what the Scripts tab anchors.
      for (let i = 0; i < body.length; i += 1) yield { ...src, record: body[i], prefix: `body[${i}]`, stepID: get(body[i], 'stepID') };
      // `problems` is fm's own list of what it could not resolve: Task 3's
      // input, not a reference, so it is not scanned here.
    }

    for (const detail of detailsOf(file, 'layout')) {
      const themeId = path(detail, 'theme.id');
      const src = {
        target, kind: 'layout', id: get(detail, 'id'), name: get(detail, 'name'),
        themeId: themeId === undefined || themeId === null ? null : String(themeId),
        hasOwnName: true,
      };
      yield { ...src, record: without(detail, 'contents'), prefix: '' };
      // walkObjects is a callback walk, so its objects are collected, then
      // yielded. Its child keys are dropped from each record: walkObjects
      // visits every child itself, and scanning them again would double-count.
      const objects = [];
      walkObjects(path(detail, 'contents.objects'), (obj) => objects.push(obj));
      for (const obj of objects) {
        // A layout object's `name` IS its own name; its `from.name` is the
        // layout's, which is what a reader needs to find it again.
        yield { ...src, kind: 'layoutObject', id: `${get(detail, 'id')}.${get(obj, 'id')}`, record: without(obj, 'objects', 'panels', 'segments'), prefix: `object[${get(obj, 'id')}]`, hasOwnName: get(obj, 'name') !== undefined };
      }
    }

    for (const catalog of ['customFunction', 'customMenu', 'valueList', 'tableOccurrence', 'relation']) {
      for (const detail of detailsOf(file, catalog)) {
        yield { record: detail, target, kind: catalog, id: get(detail, 'id'), name: relationName(detail) ?? get(detail, 'name') ?? String(get(detail, 'id')), prefix: '', hasOwnName: get(detail, 'name') !== undefined };
      }
    }
  }
}

/** A relation has no name of its own: fm identifies it by the two occurrences
 *  it joins, so that is what `from.name` says. */
function relationName(detail) {
  const left = path(detail, 'left.name');
  const right = path(detail, 'right.name');
  return typeof left === 'string' && typeof right === 'string' ? `${left} \u2194 ${right}` : undefined;
}

/** A relation's predicates name bare field names on either side; which
 *  occurrence they belong to is the relation's own `left`/`right`, so they are
 *  the one reference the generic walk cannot see on its own. */
function predicateRefs(solution, out, resolve) {
  for (const file of Object.values(get(solution, 'files') ?? {})) {
    const target = get(file, 'target');
    for (const detail of detailsOf(file, 'relation')) {
      const from = { target, kind: 'relation', id: get(detail, 'id'), name: relationName(detail) };
      (get(detail, 'predicates') ?? []).forEach((p, i) => {
        for (const [side, key] of [['left', 'leftField'], ['right', 'rightField']]) {
          const oc = path(detail, `${side}.name`);
          const field = get(p, key);
          if (typeof oc !== 'string' || typeof field !== 'string' || field === '') continue;
          const name = field.includes('::') ? field : `${oc}::${field}`;
          out.push({ kind: 'field', name, resolved: resolve('field', name), how: 'named', from: { ...from, where: `predicates.${i}.${key}` } });
        }
      });
    }
  }
}

/** Every reference in the solution, in one list. Memoised through
 *  ui/analysis/memo.js, which keys on the catalog slots a re-read swaps rather
 *  than on the solution object, so a catalog or object re-read recomputes it. */
export const references = (solution) => memoise(solution, computeReferences);

function computeReferences(solution) {
  const idx = nameIndex(solution);
  const resolve = resolver(idx);
  const out = [];
  for (const src of sources(solution)) scanRecord(src.record, src, out, resolve, idx);
  predicateRefs(solution, out, resolve);
  Object.freeze(out);
  return out;
}
