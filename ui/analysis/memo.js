// ui/analysis/memo.js
// The one memo every derived answer of the page is cached in.
//
// The rule it exists to enforce: a memo must key on WHAT A RE-READ REPLACES,
// not on the solution object. Only a solution-grain re-read builds a new
// solution (ui/discovery.js `reread`, `kind:'solution'`); every finer grain
// mutates the solution that is already on screen:
//
//   catalog grain   `file.catalogs[c]` is swapped for a freshly staged slot, so
//                   both `slot.list` and `slot.detailById` are new objects.
//   object grain    `slot.detailById` is REPLACED, never mutated in place
//                   (ui/model.js `applyBatch`), so its identity is new and the
//                   slot's is not.
//   facts grain     `file.facts` is replaced.
//
// So the fingerprint is exactly those identities: for every file, `file.facts`,
// and for every catalog slot its `list` and its `detailById`, compared by `===`
// in a stable order (file target, then catalog name, both sorted). The names
// ride in the fingerprint beside the objects, so a catalog appearing or
// disappearing cannot line up by accident with the slots either side of it.
//
// A WeakMap keyed on the solution holds one entry per `compute` function, so
// two analyses of one solution never share a slot. `compute` therefore has to
// be a stable function reference -- a module-level function, which is how every
// caller uses it -- and not a closure built per call.
//
// What the fingerprint deliberately does NOT watch: anything a read never
// writes (`solution.register`, `solution.gaps`, `view` state), and the shape of
// a slot's contents. A hand-made solution mutated in place by a test without
// replacing a list or a detailById will read as unchanged; that is the same
// contract the model gives a re-read, and a test that wants a recomputation
// replaces the object the model would replace.
//
// Pure: no document, no node:, no server/. Every key read through access.js.
import { get } from '../access.js';

const memos = new WeakMap();

/** The identities a memo has to watch, in a stable order. */
export function fingerprint(solution) {
  const out = [];
  const files = get(solution, 'files') ?? {};
  for (const target of Object.keys(files).sort()) {
    const file = files[target];
    out.push(target, get(file, 'facts'));
    const catalogs = get(file, 'catalogs') ?? {};
    for (const catalog of Object.keys(catalogs).sort()) {
      const slot = catalogs[catalog];
      out.push(catalog, get(slot, 'list'), get(slot, 'detailById'));
    }
  }
  return out;
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** `compute(solution)`, computed once per solution per fingerprint. A solution
 *  that is not an object cannot be a WeakMap key, so it is simply computed. */
export function memoise(solution, compute) {
  if (solution === null || typeof solution !== 'object') return compute(solution);
  let mine = memos.get(solution);
  if (!mine) {
    mine = new Map();
    memos.set(solution, mine);
  }
  const now = fingerprint(solution);
  const hit = mine.get(compute);
  if (hit && same(hit.fingerprint, now)) return hit.value;
  const value = compute(solution);
  mine.set(compute, { fingerprint: now, value });
  return value;
}
