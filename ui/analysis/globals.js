// ui/analysis/globals.js
// Every `$$` global the solution mentions: where it is set, how often it is
// mentioned at all, and in which files.
//
// A row is { name, sets: [{ target, script:{id,name}, step:{index,line,stepID} }],
// mentions, files }. `index` is the step's position in fm's `body` array;
// `line` is `index + 1`, the line number FileMaker prints beside the step, and
// is the one a page shows -- every tab and every export in this repo counts
// lines from 1. The two counts answer different questions and are read
// differently:
//
//   `sets`      every ENABLED `Set Variable` whose `name` key is a `$$` global.
//               That key is the variable the step writes -- fm gives a step no
//               name of its own (see ui/analysis/refs.js) -- so it is the one
//               place a global is definitely written. A disabled step writes
//               nothing, so it is not a set.
//   `mentions`  every `variable` reference Task 1 found with this name,
//               wherever it was written: a script step, a field's
//               auto-enter or validation, a layout object, a custom function,
//               a custom menu. The `Set Variable` target itself is one of
//               them, so `mentions === sets.length` means nothing but the sets
//               mention it -- a global written and never read. Unlike `sets`,
//               this count includes disabled steps: it is Task 1's list, and
//               Task 1 reads the whole file.
//
// A global set nowhere is still listed: a name only ever read is the more
// interesting half of the answer, and the one no catalog can confirm.
//
// FileMaker variable names are case-insensitive, so `$$Log` and `$$log` are one
// row, reported under the first spelling the read reached.
//
// Pure: no document, no node:, no server/. Every fm key read through
// get/path. Memoised through ui/analysis/memo.js, like every other analysis:
// the memo keys on the catalog slots a re-read swaps, not on the solution
// object.
import { get, path } from '../access.js';
import { memoise } from './memo.js';
import { SET_VARIABLE, SET_VARIABLE_BY_NAME, references } from './refs.js';

/** Why a mention count is a reading of the text and not a fact about the file.
 *  Named here once so a tab can print it next to the number. */
export const GLOBALS_NOTE = 'Mentions are counted by tokenising calculation text: fm reports a formula as'
  + ' text and names none of the references it makes (gap register `calculation-tokens`), so this is what the'
  + ' text says, not what FileMaker resolves. A name built at run time -- Evaluate, a constructed'
  + ' ExecuteSQL, Get ( ScriptParameter ) -- is mentioned nowhere and counted nowhere. And a $$ name'
  + ' containing a space (FileMaker allows `$$SMTP Server`) is read whole only where some script sets it:'
  + ' nothing in calculation text says where such a name ends, so the tokeniser matches the names this'
  + ' solution\'s Set Variable steps write. A spaced name no step sets is read as its first word, and is'
  + ' listed twice -- once under the full name, with no mentions, and once under the first word, with them.'
  + ' And fm 0.8.0 added Set Variable by Name, whose variable name is a formula rather than a name:'
  + ' such a step is listed by `calculatedSetSites` and is in no row here, because the name it writes'
  + ' is not knowable without running the file.';

// fm's own step id for Set Variable is refs.js's `SET_VARIABLE`: the tokeniser
// reads the same steps for the names they spell, so the number has one home.

const isGlobal = (name) => typeof name === 'string' && name.startsWith('$$');

const filesOf = (solution) => Object.values(get(solution, 'files') ?? {});
const detailsOf = (file) => Object.values(path(file, 'catalogs.script.detailById') ?? {})
  .map((e) => get(e, 'result')).filter((r) => r !== undefined && r !== null);

/** Every `$$` global, by name, frozen and memoised through
 *  ui/analysis/memo.js, so a re-read at any grain recomputes it. */
export const globals = (solution) => memoise(solution, computeGlobals);

function computeGlobals(solution) {
  const rows = new Map();
  const rowFor = (name) => {
    const key = name.toLowerCase();
    if (!rows.has(key)) rows.set(key, { name, sets: [], mentions: 0, files: new Set() });
    return rows.get(key);
  };

  for (const file of filesOf(solution)) {
    const target = get(file, 'target');
    for (const detail of detailsOf(file)) {
      const body = get(detail, 'body') ?? [];
      body.forEach((step, index) => {
        if (get(step, 'disabled') === true || get(step, 'stepID') !== SET_VARIABLE) return;
        const name = get(step, 'name');
        if (!isGlobal(name)) return;
        const row = rowFor(name);
        row.sets.push({ target, script: { id: get(detail, 'id'), name: get(detail, 'name') }, step: { index, line: index + 1, stepID: get(step, 'stepID') } });
        row.files.add(target);
      });
    }
  }

  for (const ref of references(solution)) {
    if (ref.kind !== 'variable' || !isGlobal(ref.name)) continue;
    const row = rowFor(ref.name);
    row.mentions += 1;
    row.files.add(ref.from.target);
  }

  const out = [...rows.values()]
    .map((row) => ({ ...row, files: [...row.files].sort() }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  Object.freeze(out);
  return out;
}

/** Every enabled `Set Variable by Name` step, whose variable name is a formula.
 *  Not a `$$` row: the name is calculation text, and inventing a global called
 *  `"$$" & $prefix` would be a false positive. It is listed so the answer can
 *  say where it is incomplete -- a global written only by one of these steps is
 *  in no row above, and this is the only record that it exists.
 *
 *  Memoised like every other analysis here. */
export const calculatedSetSites = (solution) => memoise(solution, computeCalculatedSetSites);

function computeCalculatedSetSites(solution) {
  const out = [];
  for (const file of filesOf(solution)) {
    const target = get(file, 'target');
    for (const detail of detailsOf(file)) {
      const body = get(detail, 'body') ?? [];
      body.forEach((step, index) => {
        if (get(step, 'disabled') === true || get(step, 'step') !== SET_VARIABLE_BY_NAME) return;
        out.push({
          target,
          script: { id: get(detail, 'id'), name: get(detail, 'name') },
          step: { index, line: index + 1, step: SET_VARIABLE_BY_NAME },
          name: get(step, 'name'),
        });
      });
    }
  }
  Object.freeze(out);
  return out;
}
