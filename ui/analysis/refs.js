// ui/analysis/refs.js
// Every place any object in the solution names another one, in one list.
//
// Two ways a name is found, and the list says which:
//   `named` -- fm itself reports the reference under a key it documents
//              (`script`, `layout`, `field`, `valueList`, `tableOccurrence`,
//              `context`, `table`, `style`, `occurrence` + `field` pairs).
//   `text`  -- the name appears inside FileMaker calculation syntax, found by
//              tokenising the string. No key list decides where a formula may
//              live: EVERY string value of every described object goes through
//              `strings()`, whatever its key, and every one that is not a
//              literal name is tokenised.
//
// A Reference is { kind, name, resolved, how, from: { target, kind, id, name,
// where } }. Three conventions the rest of the analyses rely on:
//   * a `field` reference's `name` is `Occurrence::Field` -- that is what a
//     calculation writes and what the index is keyed on;
//   * `from.id` for a field SOURCE is `BaseTable::Field`, because a field
//     belongs to a table, not to an occurrence: the two look alike and are not
//     the same namespace;
//   * a `variable` reference is always `resolved: false`. There is no catalog of
//     variables to resolve against, so the index cannot say; whether a `$$`
//     global is ever set is globals.js's question, not this one's.
//
// Pure: no document, no node:, no server/. Every fm key read through access.js.
// Memoised per solution in a WeakMap, so a tab may ask as often as it likes and
// a re-read (which replaces the object) recomputes.
import { get, path } from '../access.js';
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

const indexCache = new WeakMap();

function push(map, name, entry) {
  if (typeof name !== 'string' || name === '') return;
  const list = map.get(name);
  if (list) list.push(entry);
  else map.set(name, [entry]);
}

const listOf = (file, catalog) => path(file, `catalogs.${catalog}.list`) ?? [];
const detailsOf = (file, catalog) => Object.values(path(file, `catalogs.${catalog}.detailById`) ?? {})
  .map((d) => get(d, 'result')).filter((r) => r !== undefined && r !== null);

/** Every named object of every reached file, by name. A name is not unique
 *  across files (and `TO::Field` is not unique across occurrences of one
 *  table), so a lookup answers with every match. */
export function nameIndex(solution) {
  const hit = indexCache.get(solution);
  if (hit) return hit;
  const idx = {
    tables: new Map(), occurrences: new Map(), fields: new Map(), scripts: new Map(),
    layouts: new Map(), valueLists: new Map(), customFunctions: new Map(), themesStyles: new Map(),
  };
  for (const file of Object.values(get(solution, 'files') ?? {})) {
    const target = get(file, 'target');
    for (const t of listOf(file, 'table')) push(idx.tables, get(t, 'name'), { target, id: get(t, 'id'), name: get(t, 'name') });
    for (const to of listOf(file, 'tableOccurrence')) {
      const name = get(to, 'name');
      const table = path(to, 'table.name');
      push(idx.occurrences, name, { target, id: get(to, 'id'), name, table, resolved: path(to, 'table.resolved') !== false });
      // `TO::Field` exists when the occurrence's base table has the field: the
      // index is that cross product, so a field token is one lookup.
      for (const f of fieldsOf(file, table)) {
        push(idx.fields, `${name}::${get(f, 'name')}`, { target, id: get(f, 'id'), name: `${name}::${get(f, 'name')}`, occurrence: name, table, field: get(f, 'name') });
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
  if (solution !== null && typeof solution === 'object') indexCache.set(solution, idx);
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
};

// A `{ name, id, … }` object under one of these keys names an object of that
// kind: `field.tableOccurrence`, an occurrence's `table`, a trigger's `script`,
// a relation's `left`/`right`, a layout object's `valueList`, a sub-summary
// part's `breakField`.
const NAMED_OBJECT = {
  tableOccurrence: 'occurrence', table: 'table', script: 'script', field: 'field',
  layout: 'layout', valueList: 'valueList', left: 'occurrence', right: 'occurrence',
  breakField: 'field',
};

const owner = (at) => at.split('.').at(-2) ?? '';

// ── The scan ──────────────────────────────────────────────────────────

const refsCache = new WeakMap();

const INDEX_OF = {
  field: 'fields', table: 'tables', occurrence: 'occurrences', script: 'scripts',
  layout: 'layouts', valueList: 'valueLists', customFunction: 'customFunctions',
};

function resolver(idx) {
  return (kind, name, themeId) => {
    // A style is worn by display name, but only one theme's styles are the
    // layout's to wear, so the theme is half the match.
    if (kind === 'style') return (idx.themesStyles.get(name) ?? []).some((s) => themeId === undefined || s.themeId === themeId);
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
    out.push({ kind, name, resolved: kind === 'variable' ? false : resolve(kind, name, src.themeId), how, from: { target: src.target, kind: src.kind, id: src.id, name: src.name, where } });
  };
  strings(record, (value, at, key, parent) => {
    // 1. fm named it outright.
    if (key === 'name') {
      const kind = NAMED_OBJECT[owner(at)];
      if (kind) { emit(kind, value, at, 'named'); return; }
    }
    if (key === 'field') {
      // `{ occurrence, field }` (value lists, lookups, summaries), a bare
      // `TO::Field` (Set Field, sort specs), or a table-local field name.
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

const without = (obj, ...keys) => {
  const copy = { ...obj };
  for (const k of keys) delete copy[k];
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
        const occurrences = listOf(file, 'tableOccurrence').filter((o) => path(o, 'table.name') === table).map((o) => get(o, 'name'));
        yield { record: get(f, 'options'), target, kind: 'field', id: name, name, prefix: 'options', occurrences };
      }
    }

    for (const detail of detailsOf(file, 'script')) {
      const src = { target, kind: 'script', id: get(detail, 'id'), name: get(detail, 'name') };
      const body = get(detail, 'body') ?? [];
      for (let i = 0; i < body.length; i += 1) yield { ...src, record: body[i], prefix: `body[${i}]` };
      // `problems` is fm's own list of what it could not resolve: Task 3's
      // input, not a reference, so it is not scanned here.
    }

    for (const detail of detailsOf(file, 'layout')) {
      const src = { target, kind: 'layout', id: get(detail, 'id'), name: get(detail, 'name'), themeId: String(path(detail, 'theme.id')) };
      yield { ...src, record: without(detail, 'contents'), prefix: '' };
      // walkObjects is a callback walk, so its objects are collected, then
      // yielded. Its child keys are dropped from each record: walkObjects
      // visits every child itself, and scanning them again would double-count.
      const objects = [];
      walkObjects(path(detail, 'contents.objects'), (obj) => objects.push(obj));
      for (const obj of objects) {
        yield { ...src, kind: 'layoutObject', id: `${get(detail, 'id')}.${get(obj, 'id')}`, record: without(obj, 'objects', 'panels', 'segments'), prefix: `object[${get(obj, 'id')}]` };
      }
    }

    for (const catalog of ['customFunction', 'customMenu', 'valueList', 'tableOccurrence', 'relation']) {
      for (const detail of detailsOf(file, catalog)) {
        yield { record: detail, target, kind: catalog, id: get(detail, 'id'), name: relationName(detail) ?? get(detail, 'name') ?? String(get(detail, 'id')), prefix: '' };
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

/** Every reference in the solution, in one list. Memoised on the solution
 *  object: a re-read builds a new one (see ui/model.js), so identity is the
 *  cache key that cannot go stale. */
export function references(solution) {
  const hit = refsCache.get(solution);
  if (hit) return hit;
  const idx = nameIndex(solution);
  const resolve = resolver(idx);
  const out = [];
  for (const src of sources(solution)) scanRecord(src.record, src, out, resolve, idx);
  predicateRefs(solution, out, resolve);
  if (solution !== null && typeof solution === 'object') refsCache.set(solution, out);
  return out;
}
