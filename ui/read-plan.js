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

/** The one file-level block fm answers with a single object rather than a list.
 *  It is deliberately NOT in LIST_CATALOGS: that constant drives listOp(), the
 *  Solution tab's catalog-counts table and the per-catalog model slots, and a
 *  block with no list and no ids fits none of the three.
 *
 *  `detail` is not sent. fm's help says it is "accepted only as true: this
 *  report is at full depth either way", so sending it buys nothing and implies
 *  a choice that does not exist. */
export const FILE_OPTIONS_OP = { op: 'read:fileOptions' };

/** The file-options half of a list batch, on its own so a re-read sends exactly
 *  what discovery sent -- the same contract factOps() has. A fresh object each
 *  call: a caller must not be able to mutate the exported constant. */
export function fileOptionsOps() {
  return [{ ...FILE_OPTIONS_OP }];
}

/** Catalogs whose members are described one by one with {id}. Layouts add detail:true. */
export const DESCRIBED_BY_ID = [
  'layout', 'script', 'tableOccurrence', 'relation', 'valueList', 'customFunction',
  'privilegeSet', 'customMenu', 'account',
];

function listOp(catalog) {
  const op = { op: `read:${catalog}` };
  if (catalog === 'externalDataSource') op.detail = true;
  // The three catalogs FileMaker folds into folders. `flatten:true` is what fm
  // calls the shape where every member at every depth arrives in one array,
  // each carrying the `folder` path it sits in -- without it a listing is a
  // tree and everything inside a folder is out of reach of a flat reader.
  if (catalog === 'layout' || catalog === 'script' || catalog === 'customFunction') op.flatten = true;
  if (catalog === 'theme') op.detail = true;
  return op;
}

/** The file-facts half of a list batch, on its own so a facts re-read sends
 *  exactly the ops discovery sent. */
export function factOps() {
  return FILE_FACTS.map((calculation) => ({ op: 'evaluate:calculation', calculation }));
}

export function listOps() {
  return [...LIST_CATALOGS.map(listOp), ...fileOptionsOps(), ...factOps()];
}

/** A flattened listing carries the folders (and, for scripts and layouts, the
 *  separator FileMaker draws) alongside the members. Only a member is described. */
const MEMBER_TYPE = { layout: 'layout', script: 'script', customFunction: 'customFunction' };

function isMember(catalog, item) {
  const type = MEMBER_TYPE[catalog];
  return type === undefined || item.type === type;
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
