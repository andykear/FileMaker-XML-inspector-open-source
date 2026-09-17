// Walks a solution: root file, then every FileMaker external data source it
// names, recursively, once each. Re-reads at solution, catalog and object grain.
// Browser safe; `api` is the only door to fm. Spec section 2.
import { listOps, factOps, describeOps, describeKey, catalogOf, DESCRIBED_BY_ID } from './read-plan.js';
import { createSolution, createFile, applyBatch } from './model.js';

function now() {
  return new Date().toISOString();
}

/** Hosted names are case-insensitive: the same rule as server/targets.mjs
 *  targetKey, repeated here because ui/ imports nothing from server/. */
function targetKey(target) {
  return /^fmnet:\/\//i.test(target) ? target.toLowerCase() : target;
}

function listsOf(file) {
  const lists = {};
  for (const [c, slot] of Object.entries(file.catalogs)) lists[c] = slot.list;
  return lists;
}

/** What the list batch came back with: how many catalogs answered with a list
 *  (a catalog whose list op errored has not), and how long those lists are.
 *  Catalogs the batch never asked for (`field`, which is described per table)
 *  have no readAt and do not count. */
function listedCounts(file) {
  let catalogs = 0;
  let entries = 0;
  for (const slot of Object.values(file.catalogs)) {
    if (!slot.readAt || slot.listError) continue;
    catalogs += 1;
    entries += slot.list.length;
  }
  return { catalogs, entries };
}

/** The describe batch by the catalog each op reads: `read:field` counts under
 *  `field` (one op per table), everything else under its own catalog. */
function countByCatalog(ops) {
  const out = {};
  for (const op of ops) {
    const catalog = catalogOf(op);
    out[catalog] = (out[catalog] ?? 0) + 1;
  }
  return out;
}

/** `hooks.onPhase(event)` is told what this file's two batches are about to do
 *  and how long each took, so a caller can draw a read log while fm works.
 *  `hooks.now` overrides the clock the `ms` values are measured with. */
export async function readFile(api, target, hooks = {}) {
  const phase = hooks.onPhase ?? (() => {});
  const clock = hooks.now ?? Date.now;
  const lists = listOps();
  phase({ type: 'list', target, ops: lists.length });
  const listedAt = clock();
  const first = await api.read(target, lists);
  const listMs = clock() - listedAt;
  if (first.fatal) return { fatal: first.fatal };
  const file = createFile(target);
  applyBatch(file, lists, first, now());
  phase({ type: 'listed', target, ms: listMs, ...listedCounts(file) });
  const describes = describeOps(listsOf(file));
  if (describes.length) {
    phase({ type: 'describe', target, ops: describes.length, byCatalog: countByCatalog(describes) });
    const describedAt = clock();
    const second = await api.read(target, describes);
    const describeMs = clock() - describedAt;
    if (second.fatal) return { fatal: second.fatal };
    applyBatch(file, describes, second, now());
    phase({ type: 'described', target, ms: describeMs });
  }
  return { file };
}

export function siblingPaths(file) {
  return file.catalogs.externalDataSource.list
    .filter((s) => s.sourceType === 'filemaker')
    .map((s) => ({ source: s.name, paths: s.paths ?? [] }));
}

function unknownDataSources(file) {
  const names = new Set(file.catalogs.externalDataSource.list.map((s) => s.name));
  const out = [];
  for (const to of file.catalogs.tableOccurrence.list) {
    const ds = to.table?.dataSource;
    if (ds && !names.has(ds)) out.push({ occurrence: to.name, dataSource: ds });
  }
  return out;
}

async function resolveFirst(api, from, paths) {
  const reasons = [];
  for (const path of paths) {
    const r = await api.resolveTarget(from, path);
    if (r.target) return { target: r.target, reasons };
    reasons.push(r.reason);
  }
  return { target: null, reasons };
}

/** Depth first: each sibling is fully read (and its own siblings walked) before
 *  the next sibling in the list is even resolved. This is what makes an
 *  unreachable sibling's own failure appear before a later sibling's
 *  unresolvable/unknown-data-source entries, matching the order fm's own
 *  reads happen in.
 *
 *  `done.ms` is the whole walk, context fetch and sibling resolution included,
 *  so it is larger than the per-file phases add up to. */
export async function discover(api, root, hooks = {}) {
  const progress = hooks.onProgress ?? (() => {});
  const phase = hooks.onPhase ?? (() => {});
  const clock = hooks.now ?? Date.now;
  const startedAt = clock();
  const ctx = await api.context();
  const solution = createSolution(root, ctx.cli);
  const visited = new Set([targetKey(root)]);

  async function walk(target, from, via) {
    progress(`Reading ${target}`);
    const r = await readFile(api, target, hooks);
    if (r.fatal) {
      solution.unreachable.push({ target, from, via, error: r.fatal });
      phase({ type: 'unreachable', target, from, via, code: r.fatal.code });
      return;
    }
    solution.files[target] = r.file;

    for (const { source, paths } of siblingPaths(r.file)) {
      const { target: next, reasons } = await resolveFirst(api, target, paths);
      if (!next) {
        solution.unreachable.push({
          target: paths.join(' | '), from: target, via: source,
          error: { code: 'unresolvable', message: reasons.join('; ') },
        });
        phase({ type: 'unreachable', target: paths.join(' | '), from: target, via: source, code: 'unresolvable' });
        continue;
      }
      // A target that turned out to be unreachable stays in `visited` on
      // purpose: a second referrer must not spawn fm again to be told the same
      // thing. The first referrer's entry in `unreachable` speaks for both.
      if (visited.has(targetKey(next))) continue;
      visited.add(targetKey(next));
      await walk(next, target, source);
    }
    for (const { occurrence, dataSource } of unknownDataSources(r.file)) {
      solution.unreachable.push({
        target: dataSource, from: target, via: occurrence,
        error: { code: 'unknown_data_source', message: `occurrence ${occurrence} names data source ${dataSource}, which the file does not list` },
      });
      phase({ type: 'unreachable', target: dataSource, from: target, via: occurrence, code: 'unknown_data_source' });
    }
  }

  await walk(root, null, null);
  solution.readAt = now();
  const files = Object.keys(solution.files).length;
  progress(`Read ${files} file(s), ${solution.unreachable.length} unreachable`);
  phase({ type: 'done', files, unreachable: solution.unreachable.length, ms: clock() - startedAt });
  return solution;
}

function fileOf(solution, target) {
  const file = solution.files[target];
  if (!file) throw new Error(`no file ${target} in the solution`);
  return file;
}

/** fm's own fatal shape, thrown so a reread never half-applies: the message
 *  names the fatal for `%s`-free callers, the object itself rides `err.fatal`. */
function fatalError(fatal) {
  const err = new Error(`${fatal.code}: ${fatal.message}`);
  err.fatal = fatal;
  return err;
}

/** The only door a reread has to fm. An empty `ops` never spawns fm (skipped,
 *  returns null); a fatal response throws instead of returning, before any
 *  slot has been touched. */
async function readBatch(api, target, ops) {
  if (!ops.length) return null;
  const response = await api.read(target, ops);
  if (response.fatal) throw fatalError(response.fatal);
  return response;
}

function freshCatalogs(...names) {
  const catalogs = {};
  for (const n of names) catalogs[n] = { list: [], listError: null, detailById: {}, ops: [], readAt: null };
  return catalogs;
}

/** Re-read one slot. Solution: a fresh discovery (new object). Catalog: the list
 *  op, then that catalog's describes, staged in a throwaway file and swapped in
 *  only once every read has succeeded — a fatal at either step leaves the real
 *  catalog (list and detailById both) exactly as it was. Object: the one
 *  describe op. Table and field share one pair of reads: table's list, then
 *  field describes for every table in the new list. `facts` is a catalog for
 *  re-read purposes although it is not one in the model: the same eight
 *  `evaluate:calculation` ops discovery sent, staged the same way. */
export async function reread(api, solution, slot, hooks = {}) {
  if (slot.kind === 'solution') return discover(api, solution.root, hooks);

  const file = fileOf(solution, slot.target);

  if (slot.kind === 'catalog' && slot.catalog === 'facts') {
    const ops = factOps();
    const response = await readBatch(api, slot.target, ops);
    const staged = { name: null, facts: {}, catalogs: {} };
    applyBatch(staged, ops, response, now());
    file.facts = staged.facts;
    file.name = staged.name ?? file.name;
    return solution;
  }

  const catalog = file.catalogs[slot.catalog];
  if (!catalog) throw new Error(`no catalog ${slot.catalog}`);

  if (slot.kind === 'catalog') {
    if (slot.catalog === 'table' || slot.catalog === 'field') {
      const listOp = listOps().find((o) => o.op === 'read:table');
      const listResponse = await readBatch(api, slot.target, [listOp]);
      const staged = { facts: {}, catalogs: freshCatalogs('table', 'field') };
      applyBatch(staged, [listOp], listResponse, now());
      const describes = describeOps({ table: staged.catalogs.table.list });
      const describeResponse = await readBatch(api, slot.target, describes);
      if (describes.length) applyBatch(staged, describes, describeResponse, now());
      file.catalogs.table = staged.catalogs.table;
      file.catalogs.field = staged.catalogs.field;
      return solution;
    }

    const listOp = listOps().find((o) => o.op === `read:${slot.catalog}`);
    const listResponse = await readBatch(api, slot.target, listOp ? [listOp] : []);
    const staged = { facts: {}, catalogs: freshCatalogs(slot.catalog) };
    if (listOp) applyBatch(staged, [listOp], listResponse, now());
    const describes = DESCRIBED_BY_ID.includes(slot.catalog)
      ? describeOps({ [slot.catalog]: staged.catalogs[slot.catalog].list })
      : [];
    const describeResponse = await readBatch(api, slot.target, describes);
    if (describes.length) applyBatch(staged, describes, describeResponse, now());
    file.catalogs[slot.catalog] = staged.catalogs[slot.catalog];
    return solution;
  }

  if (slot.kind === 'object') {
    const entry = catalog.detailById[slot.key];
    if (!entry) throw new Error(`no ${slot.catalog} ${slot.key} in ${slot.target}`);
    const response = await readBatch(api, slot.target, [entry.op]);
    applyBatch(file, [entry.op], response, now());
    return solution;
  }
  throw new Error(`unknown slot kind ${slot.kind}`);
}

export { describeKey };
