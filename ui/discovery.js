// Walks a solution: root file, then every FileMaker external data source it
// names, recursively, once each. Re-reads at solution, catalog and object grain.
// Browser safe; `api` is the only door to fm. Spec section 2.
import { listOps, describeOps, describeKey, DESCRIBED_BY_ID } from './read-plan.js';
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

export async function readFile(api, target) {
  const first = await api.read(target, listOps());
  if (first.fatal) return { fatal: first.fatal };
  const file = createFile(target);
  applyBatch(file, listOps(), first, now());
  const describes = describeOps(listsOf(file));
  if (describes.length) {
    const second = await api.read(target, describes);
    if (second.fatal) return { fatal: second.fatal };
    applyBatch(file, describes, second, now());
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
 *  reads happen in. */
export async function discover(api, root, hooks = {}) {
  const progress = hooks.onProgress ?? (() => {});
  const ctx = await api.context();
  const solution = createSolution(root, ctx.cli);
  const visited = new Set([targetKey(root)]);

  async function walk(target, from, via) {
    progress(`Reading ${target}`);
    const r = await readFile(api, target);
    if (r.fatal) {
      solution.unreachable.push({ target, from, via, error: r.fatal });
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
        continue;
      }
      if (visited.has(targetKey(next))) continue;
      visited.add(targetKey(next));
      await walk(next, target, source);
    }
    for (const { occurrence, dataSource } of unknownDataSources(r.file)) {
      solution.unreachable.push({
        target: dataSource, from: target, via: occurrence,
        error: { code: 'unknown_data_source', message: `occurrence ${occurrence} names data source ${dataSource}, which the file does not list` },
      });
    }
  }

  await walk(root, null, null);
  solution.readAt = now();
  progress(`Read ${Object.keys(solution.files).length} file(s), ${solution.unreachable.length} unreachable`);
  return solution;
}

function fileOf(solution, target) {
  const file = solution.files[target];
  if (!file) throw new Error(`no file ${target} in the solution`);
  return file;
}

/** Re-read one slot. Solution: a fresh discovery (new object). Catalog: the list
 *  op, then that catalog's describes. Object: the one describe op. */
export async function reread(api, solution, slot) {
  if (slot.kind === 'solution') return discover(api, solution.root);

  const file = fileOf(solution, slot.target);
  const catalog = file.catalogs[slot.catalog];
  if (!catalog) throw new Error(`no catalog ${slot.catalog}`);

  if (slot.kind === 'catalog') {
    if (slot.catalog === 'field') {
      const ops = describeOps({ table: file.catalogs.table.list });
      applyBatch(file, ops, await api.read(slot.target, ops), now());
      return solution;
    }
    const listOp = listOps().find((o) => o.op === `read:${slot.catalog}`);
    applyBatch(file, [listOp], await api.read(slot.target, [listOp]), now());
    if (DESCRIBED_BY_ID.includes(slot.catalog)) {
      catalog.detailById = {};
      const ops = describeOps({ [slot.catalog]: catalog.list });
      if (ops.length) applyBatch(file, ops, await api.read(slot.target, ops), now());
    }
    return solution;
  }

  if (slot.kind === 'object') {
    const entry = catalog.detailById[slot.key];
    if (!entry) throw new Error(`no ${slot.catalog} ${slot.key} in ${slot.target}`);
    applyBatch(file, [entry.op], await api.read(slot.target, [entry.op]), now());
    return solution;
  }
  throw new Error(`unknown slot kind ${slot.kind}`);
}

export { describeKey };
