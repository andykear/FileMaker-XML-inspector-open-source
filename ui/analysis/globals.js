// ui/analysis/globals.js
// Every `$$` global the solution mentions: where it is set, how often it is
// mentioned at all, and in which files.
//
// A row is { name, sets: [{ target, script:{id,name}, step:{index,stepID} }],
// mentions, files }. The two counts answer different questions and are read
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
import { references } from './refs.js';

/** Why a mention count is a reading of the text and not a fact about the file.
 *  Named here once so a tab can print it next to the number. */
export const GLOBALS_NOTE = 'Mentions are counted by tokenising calculation text: fm reports a formula as'
  + ' text and names none of the references it makes (gap register `calculation-tokens`), so this is what the'
  + ' text says, not what FileMaker resolves. A name built at run time -- Evaluate, a constructed'
  + ' ExecuteSQL, Get ( ScriptParameter ) -- is mentioned nowhere and counted nowhere. And a $$ name'
  + ' containing a space (FileMaker allows `$$SMTP Server`) tokenises as its first word, so such a global is'
  + ' listed twice: once under the full name the Set Variable target gives it, with no mentions, and once'
  + ' under the first word, with them.';

// fm's own step id for Set Variable, the same numbering ui/analysis/scripts.js
// documents (its PSOS_ONLY_STEPS carries the provenance of the id list).
const SET_VARIABLE = 141;

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
        row.sets.push({ target, script: { id: get(detail, 'id'), name: get(detail, 'name') }, step: { index, stepID: get(step, 'stepID') } });
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
