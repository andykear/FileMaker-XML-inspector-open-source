// The solution model: fm's answers verbatim, one slot per catalog and per
// described object, each remembering the op that produced it and when.
// Browser safe. Spec section 3.
import { LIST_CATALOGS, describeKey, catalogOf } from './read-plan.js';

export function createSolution(root, cli) {
  return { root, cli, files: {}, unreachable: [], readAt: null };
}

function emptyCatalog() {
  return { list: [], listError: null, detailById: {}, ops: [], readAt: null };
}

/** File Options is one block per file, not a catalog: no list, no ids, one
 *  answer. It sits beside `facts`, which is the same kind of thing -- a
 *  file-level slot the catalog machinery does not describe. */
function emptyFileOptions() {
  return { block: null, error: null, ops: [], readAt: null };
}

export function createFile(target) {
  const catalogs = {};
  for (const c of [...LIST_CATALOGS, 'field']) catalogs[c] = emptyCatalog();
  return { target, name: null, facts: {}, fileOptions: emptyFileOptions(), catalogs };
}

const NO_RESULT = { code: 'no_result', message: 'fm returned no result line for this op' };

function isList(op) {
  return op.op.startsWith('read:') && !('id' in op) && op.op !== 'read:field';
}

/** Apply one batch response. `ops` and `response.results` align by position:
 *  fm's result lines carry only the op name. */
export function applyBatch(file, ops, response, readAt) {
  const results = response.results ?? [];
  const fresh = new Map();
  ops.forEach((op, i) => {
    const line = results[i];
    const catalog = catalogOf(op);
    if (catalog === 'facts') {
      file.facts[op.calculation] = line?.status === 'ok'
        ? { value: line.result.value, dataType: line.result.dataType }
        : { error: line?.error ?? NO_RESULT };
      if (op.calculation === 'Get ( FileName )' && line?.status === 'ok') file.name = line.result.value;
      return;
    }
    // Before isList(): `read:fileOptions` carries no `id`, so the list path
    // would claim it and store `result.items ?? []` -- an empty list -- without
    // erroring. Replaced whole rather than mutated, so ui/analysis/memo.js can
    // tell by identity that a re-read landed.
    if (catalog === 'fileOptions') {
      file.fileOptions = line?.status === 'ok'
        ? { block: line.result, error: null, ops: [op], readAt }
        : { block: null, error: line?.error ?? NO_RESULT, ops: [op], readAt };
      return;
    }
    const slot = file.catalogs[catalog] ?? (file.catalogs[catalog] = emptyCatalog());
    if (isList(op)) {
      slot.ops = [op];
      slot.readAt = readAt;
      if (line?.status === 'ok') {
        slot.list = line.result.items ?? [];
        slot.listError = null;
      } else {
        slot.listError = line?.error ?? NO_RESULT;
      }
      return;
    }
    // `detailById` is replaced, never mutated in place. A re-read at catalog
    // grain swaps the whole slot, but a re-read at object grain lands here, and
    // a derived view that caches off the model has to be able to tell that its
    // input changed -- object identity is how it tells. One fresh object per
    // slot per batch, so a batch of n describes is not n copies of the map.
    if (!fresh.has(slot)) fresh.set(slot, { ...slot.detailById });
    fresh.get(slot)[describeKey(op)] = line?.status === 'ok'
      ? { op, readAt, result: line.result }
      : { op, readAt, error: line?.error ?? NO_RESULT };
  });
  for (const [slot, detailById] of fresh) slot.detailById = detailById;
}

export function catalogCounts(file) {
  const out = {};
  for (const [c, slot] of Object.entries(file.catalogs)) {
    const details = Object.values(slot.detailById);
    out[c] = {
      listed: slot.list.length,
      described: details.filter((d) => 'result' in d).length,
      errors: details.filter((d) => 'error' in d).length + (slot.listError ? 1 : 0),
    };
  }
  return out;
}
