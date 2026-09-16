// Which ops the inspector sends, and nothing else. Browser safe. Spec section 3.

export const LIST_CATALOGS = [
  'externalDataSource', 'table', 'tableOccurrence', 'relation', 'layout', 'script',
  'valueList', 'customFunction', 'account', 'privilegeSet', 'extendedPrivilege',
  'customMenu', 'customMenuSet', 'baseDirectory', 'persistentData', 'font',
  'graphNote', 'authorization', 'theme',
];

/** File-level facts: fm has no file catalog, so these come from Get(). */
export const FILE_FACTS = [
  'Get ( FileName )', 'Get ( FilePath )', 'Get ( FileSize )', 'Get ( EncryptionState )',
  'Get ( PersistentID )', 'Get ( FileLocaleElements )', 'Get ( HostName )',
  'Get ( HostApplicationVersion )',
];

/** Catalogs whose members are described one by one with {id}. Layouts add detail:true. */
export const DESCRIBED_BY_ID = [
  'layout', 'script', 'tableOccurrence', 'relation', 'valueList', 'customFunction',
  'privilegeSet', 'customMenu', 'account',
];

function listOp(catalog) {
  const op = { op: `read:${catalog}` };
  if (catalog === 'externalDataSource') op.detail = true;
  if (catalog === 'layout' || catalog === 'script') op.flatten = true;
  if (catalog === 'theme') op.detail = true;
  return op;
}

/** The file-facts half of a list batch, on its own so a facts re-read sends
 *  exactly the ops discovery sent. */
export function factOps() {
  return FILE_FACTS.map((calculation) => ({ op: 'evaluate:calculation', calculation }));
}

export function listOps() {
  return [...LIST_CATALOGS.map(listOp), ...factOps()];
}

function isMember(catalog, item) {
  if (catalog === 'layout') return item.type === 'layout';
  if (catalog === 'script') return item.type === 'script';
  return true;
}

export function describeOps(lists) {
  const ops = [];
  for (const t of lists.table ?? []) ops.push({ op: 'read:field', table: t.name, detail: true });
  for (const catalog of DESCRIBED_BY_ID) {
    for (const item of lists[catalog] ?? []) {
      if (!isMember(catalog, item)) continue;
      const op = { op: `read:${catalog}`, id: item.id };
      if (catalog === 'layout') op.detail = true;
      ops.push(op);
    }
  }
  return ops;
}

export function describeKey(op) {
  return op.op === 'read:field' ? `table:${op.table}` : String(op.id);
}

export function catalogOf(op) {
  if (op.op === 'evaluate:calculation') return 'facts';
  return op.op.replace(/^read:/, '');
}
