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

export function createFile(target) {
  const catalogs = {};
  for (const c of [...LIST_CATALOGS, 'field']) catalogs[c] = emptyCatalog();
  return { target, name: null, facts: {}, catalogs };
}

const NO_RESULT = { code: 'no_result', message: 'fm returned no result line for this op' };

function isList(op) {
  return op.op.startsWith('read:') && !('id' in op) && op.op !== 'read:field';
}

/** Apply one batch response. `ops` and `response.results` align by position:
 *  fm's result lines carry only the op name. */
export function applyBatch(file, ops, response, readAt) {
  const results = response.results ?? [];
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
    // input changed -- object identity is how it tells.
    slot.detailById = {
      ...slot.detailById,
      [describeKey(op)]: line?.status === 'ok'
        ? { op, readAt, result: line.result }
        : { op, readAt, error: line?.error ?? NO_RESULT },
    };
  });
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
