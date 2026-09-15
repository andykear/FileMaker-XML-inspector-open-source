# Plan 3: Inspector Server, Discovery and Model

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new inspector runtime of spec section 2 and the solution model of section 3: a local Node server that reads live FileMaker files through fm, a page that discovers every file of a solution and holds the model, re-read at three grains, and one live smoke test on ooe. No tabs yet (Plan 4); the page shows the Solution panel only.

**Architecture:** `bin/inspector.mjs` locates fm and starts `server/server.mjs`, an http server on 127.0.0.1 serving `ui/` and three JSON endpoints. Every fm call goes through one function in `server/read.mjs` that fixes the credential and batching flags and refuses anything that is not read-only. The page (`ui/`) owns the model: `read-plan.js` says which ops to send, `model.js` stores fm's answers verbatim, `discovery.js` walks external data sources across files and re-reads slots. The same modules run in Node against a recorded ooe fixture, and once live against ooe when `INSPECTOR_LIVE=1`.

**Tech Stack:** Node 22.19 (`node --test`, native `fetch`, `node:http`), plain ESM JavaScript, no bundler, no runtime dependency except `fm-adt-toolkit` (v0.4.0 from GitHub: `runner`, `read-only`, `types`).

**Spec:** `docs/superpowers/specs/2026-09-14-fm-cli-rewrite-design.md`, sections 2 and 3 (binding), section 5 testing.

## Global Constraints

- Only read-only ops ever reach any FileMaker file: `read:*`, `evaluate:calculation`, `validate:calculation`. `assertReadOnly` from `fm-adt-toolkit/read-only` guards the one place fm is spawned (`server/read.mjs`); there is no other spawn. Live runs use `fmnet://localhost/ooe`, account `admin`, keychain, never `--password`, never a write op, never `--create`.
- fm is always spawned with `--username=<account> --keychain`, `--abort-on-error=false`, the ops as a temp file, results via `--out`. `--prompt` by default; `--no-prompt` only when the server was started with `--no-prompt` (unattended runs and the live test).
- Values from fm are stored verbatim in the model. Nothing is renamed or reshaped on the way in.
- Browser-safe modules (`ui/*.js`) import nothing from `node:` and nothing from `server/`. They run unchanged in Node tests.
- The server binds `127.0.0.1` only. `/api/read` refuses a non-read-only op with HTTP 400 before fm is spawned.
- `npm test` = `node --test 'tests/*.test.mjs'` and must pass without fm installed and without network. The live test is skipped unless `INSPECTOR_LIVE=1`.
- Every recorded fixture states the fm version and build it came from.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File map

| Path | Responsibility |
|---|---|
| `bin/inspector.mjs` | Entry: parse args, locate fm, start the server, print the URL, open the browser |
| `server/args.mjs` | `parseArgs(argv)`: `--file`, `--username`, `--port`, `--no-open`, `--no-prompt` |
| `server/targets.mjs` | `resolveTarget(from, path, deps)` and `targetKey(target)`: sibling resolution, no fm call |
| `server/read.mjs` | `readOps({cli, username, noPrompt, runOps}, target, ops)`: the one fm spawn, fixed flags, read-only guard |
| `server/server.mjs` | `createServer(opts)`: static `ui/`, `GET /api/context`, `POST /api/read`, `POST /api/resolve-target` |
| `ui/api.js` | `createApi(baseUrl)`: fetch wrappers for the three endpoints (works in Node) |
| `ui/read-plan.js` | Pure: `listOps()`, `describeOps(lists)`, `FILE_FACTS`, `describeKey(op)` |
| `ui/model.js` | Pure: `createSolution`, `createFile`, `applyBatch`, `catalogCounts` |
| `ui/discovery.js` | `discover(api, root, hooks)`, `readFile(api, target)`, `reread(api, solution, slot)`, `siblingPaths(file)` |
| `ui/app.js` | Boot the page: context, discover, render the Solution panel, re-read buttons |
| `ui/index.html` | The page shell (Solution panel only in this plan) |
| `scripts/record-fixture.mjs` | Records a solution read from a live file into `tests/fixtures/<name>/` |
| `tests/fixtures/ooe/` | Recorded ooe reads: `meta.json`, `calls.ndjson` |
| `tests/replay-api.mjs` | Test helper: an `api` that answers from a recorded fixture |
| `tests/*.test.mjs` | One test file per module, plus `live-smoke.test.mjs` |

Package additions: `"bin": {"inspector": "bin/inspector.mjs"}`, `"scripts.start": "node bin/inspector.mjs"`, `"scripts.record": "node scripts/record-fixture.mjs"`.

## Facts the tasks rely on (measured on fm 0.6.0 build 29816214 against ooe, 2026-09-14/15)

- List ops return `{ kind, total, returned, items }`. `read:layout` and `read:script` with `flatten:true` list folders too: items carry `type: "layout" | "folder"` and `type: "script" | "folder"`. `read:externalDataSource` needs `detail:true` to include `paths`.
- The ooe root lists 7 external data sources: `Ooe_dev` and `TestFile_dev2` (`paths: ["file:Ooe_dev"]`), `BrojDva` (`["file:BrojDva"]`), `Self` (`["file:Ooe"]`), `by_variable` (`["$$referenced_file"]`), and two `odbc:` sources. `fmnet://localhost/Ooe_dev` is not hosted (fatal `open_failed`, dbError 802). `fmnet://localhost/BrojDva` is hosted but has no stored password (fatal `authentication_failed`, dbError 212 under `--no-prompt`). So a live discovery from ooe yields one readable file and two unreachable targets unless a password for BrojDva is stored.
- A run that cannot open the file returns `fatal: { code, message, suggestions?, dbError? }`, `results: []`, exit code 2.
- `evaluate:calculation` returns `result: { kind: "calculation", value: <string>, dataType }`. `value` is always a string.
- `read:field` takes `{ table: <name>, detail: true }` and returns `{ kind, total, returned, items }`. Describes by id: `read:layout {id, detail:true}`, `read:script {id}`, `read:tableOccurrence {id}`, `read:relation {id}`, `read:valueList {id}`, `read:customFunction {id}`, `read:privilegeSet {id}`, `read:customMenu {id}`, `read:account {id}`; each returns the object itself (keys like `id`, `name`, ...).
- Result lines carry only `op`, not the op's arguments, so results are matched to ops by position within a batch.
- Toolkit API (`fm-adt-toolkit/runner`): `locateFmCli() → Promise<FmCli|null>` with `FmCli = { path, version, contract }`; `runOps(cli, { file, username }, ops, opts) → Promise<AdtRunResult>` with `opts = { dryRun, abortOnError, opsFile, outFile, noPrompt, timeoutSeconds, killAfterMs }` and `AdtRunResult = { ok, exitCode, results, summary, notices, fatal?, stderr, stdout, argv }`. `fm-adt-toolkit/read-only` exports `assertReadOnly(ops)` (throws) and `isReadOnlyOp(op)`.

---

### Task 1: Target resolution

**Files:**
- Create: `server/targets.mjs`
- Test: `tests/targets.test.mjs`

**Interfaces:**
- Produces: `resolveTarget(from, path, deps = { exists }) → { target } | { unresolvable: true, reason }`; `targetKey(target) → string` (the visited-set key: lower-cased for `fmnet://` targets, unchanged otherwise, because hosted file names are case-insensitive and ooe's `Self` source `file:Ooe` must not re-read the root `fmnet://localhost/ooe`); `isHosted(target) → boolean`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/targets.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTarget, targetKey, isHosted } from '../server/targets.mjs';

const hosted = 'fmnet://localhost/ooe';
const local = '/Users/me/Solutions/Root.fmp12';
const existing = new Set(['/Users/me/Solutions/Child.fmp12', '/Users/me/Solutions/sub/Deep.fmp12']);
const deps = { exists: (p) => existing.has(p) };

test('file: sibling of a hosted root becomes fmnet on the same host', () => {
  assert.deepEqual(resolveTarget(hosted, 'file:BrojDva', deps), { target: 'fmnet://localhost/BrojDva' });
});

test('file: sibling of a local root is a .fmp12 in the same directory, only if it exists', () => {
  assert.deepEqual(resolveTarget(local, 'file:Child', deps), { target: '/Users/me/Solutions/Child.fmp12' });
  assert.deepEqual(resolveTarget(local, 'file:sub/Deep', deps), { target: '/Users/me/Solutions/sub/Deep.fmp12' });
  const missing = resolveTarget(local, 'file:Nope', deps);
  assert.equal(missing.unresolvable, true);
  assert.match(missing.reason, /Nope\.fmp12/);
});

test('a directory in a hosted sibling path is unresolvable', () => {
  const r = resolveTarget(hosted, 'file:sub/Child', deps);
  assert.equal(r.unresolvable, true);
  assert.match(r.reason, /director/i);
});

test('absolute fmnet paths resolve without consulting the root', () => {
  assert.deepEqual(resolveTarget(local, 'fmnet:/host.example.com/Other', deps), { target: 'fmnet://host.example.com/Other' });
  assert.deepEqual(resolveTarget(hosted, 'fmnet://host.example.com/Other', deps), { target: 'fmnet://host.example.com/Other' });
});

test('variables, odbc and platform-absolute paths are unresolvable with a reason', () => {
  for (const [path, re] of [
    ['$$referenced_file', /variable/i],
    ['odbc:ets', /odbc/i],
    ['filemac:/Volumes/Data/X.fmp12', /platform/i],
    ['filewin:/C:/Data/X.fmp12', /platform/i],
    ['gibberish', /unrecogni/i],
  ]) {
    const r = resolveTarget(hosted, path, deps);
    assert.equal(r.unresolvable, true, path);
    assert.match(r.reason, re, path);
  }
});

test('targetKey folds case for hosted targets only', () => {
  assert.equal(targetKey('fmnet://LocalHost/Ooe'), 'fmnet://localhost/ooe');
  assert.equal(targetKey('/Users/me/Ooe.fmp12'), '/Users/me/Ooe.fmp12');
  assert.equal(isHosted('fmnet://localhost/ooe'), true);
  assert.equal(isHosted('/Users/me/Ooe.fmp12'), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/targets.test.mjs`
Expected: FAIL, cannot find module `server/targets.mjs`.

- [ ] **Step 3: Implement**

```js
// server/targets.mjs
// Resolves the path list of an external data source to something fm can open.
// Never calls fm. The spec's rules (section 2, /api/resolve-target).
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function isHosted(target) {
  return /^fmnet:\/\//i.test(target);
}

/** Visited-set key. Hosted names are case-insensitive on the server, so
 *  ooe's own "Self" source (file:Ooe) must map onto the root fmnet://localhost/ooe. */
export function targetKey(target) {
  return isHosted(target) ? target.toLowerCase() : target;
}

function unresolvable(reason) {
  return { unresolvable: true, reason };
}

export function resolveTarget(from, path, deps = {}) {
  const exists = deps.exists ?? existsSync;
  const p = String(path);

  if (p.startsWith('$$')) return unresolvable(`${p} is a $$variable path, resolved at runtime by the file`);
  if (/^odbc:/i.test(p)) return unresolvable(`${p} is an ODBC source, not a FileMaker file`);
  if (/^file(mac|win|linux):/i.test(p)) return unresolvable(`${p} is a platform-absolute path; only file: siblings and fmnet: paths are resolved`);

  const fmnet = p.match(/^fmnet:\/{1,2}(.+)$/i);
  if (fmnet) return { target: `fmnet://${fmnet[1]}` };

  const file = p.match(/^file:(.+)$/i);
  if (!file) return unresolvable(`${p} is not a recognised external data source path`);
  const name = file[1];

  if (isHosted(from)) {
    if (name.includes('/')) return unresolvable(`${p} names a directory; hosted files have no directories`);
    const host = from.match(/^fmnet:\/\/([^/]+)\//i)?.[1];
    if (!host) return unresolvable(`cannot read the host out of ${from}`);
    return { target: `fmnet://${host}/${name}` };
  }

  const candidate = resolve(dirname(from), /\.fmp12$/i.test(name) ? name : `${name}.fmp12`);
  if (!exists(candidate)) return unresolvable(`${candidate} does not exist`);
  return { target: candidate };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/targets.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/targets.mjs tests/targets.test.mjs
git commit -m "Resolve external data source paths to fm targets without calling fm

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The read plan

**Files:**
- Create: `ui/read-plan.js`
- Test: `tests/read-plan.test.mjs`

**Interfaces:**
- Produces: `LIST_CATALOGS` (the 18 catalogs in list order), `FILE_FACTS` (the 8 `Get()` formulas), `DESCRIBED_BY_ID` (the 9 catalogs described per member by id), `listOps() → AdtOp[]` (18 list ops followed by 8 evaluate ops), `describeOps(lists) → AdtOp[]` where `lists` is `{ [catalog]: items[] }`, `describeKey(op) → string` (`"table:<name>"` for `read:field`, `String(id)` otherwise), `catalogOf(op) → string` (`"field"` for `read:field`, the catalog after `read:` otherwise, `"facts"` for `evaluate:calculation`).

- [ ] **Step 1: Write the failing tests**

```js
// tests/read-plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIST_CATALOGS, FILE_FACTS, listOps, describeOps, describeKey, catalogOf } from '../ui/read-plan.js';

test('listOps is the 18 list ops with their flags, then the file facts', () => {
  const ops = listOps();
  assert.equal(ops.length, 18 + 8);
  assert.deepEqual(ops[0], { op: 'read:externalDataSource', detail: true });
  assert.deepEqual(ops.find((o) => o.op === 'read:layout'), { op: 'read:layout', flatten: true });
  assert.deepEqual(ops.find((o) => o.op === 'read:script'), { op: 'read:script', flatten: true });
  assert.deepEqual(ops.find((o) => o.op === 'read:table'), { op: 'read:table' });
  assert.equal(LIST_CATALOGS.length, 18);
  assert.deepEqual(ops.slice(18), FILE_FACTS.map((calculation) => ({ op: 'evaluate:calculation', calculation })));
  assert.ok(FILE_FACTS.includes('Get ( EncryptionState )'));
});

test('describeOps derives one describe per table, layout, script and id-described member', () => {
  const lists = {
    table: [{ name: 'A', id: 1 }, { name: 'B', id: 2 }],
    layout: [{ id: 10, type: 'folder', name: 'F' }, { id: 11, type: 'layout', name: 'L' }],
    script: [{ id: 20, type: 'folder', name: 'F' }, { id: 21, type: 'script', name: 'S' }],
    tableOccurrence: [{ id: 30, name: 'A' }],
    relation: [{ id: 40 }],
    valueList: [{ id: 50, name: 'V' }],
    customFunction: [{ id: 60, name: 'cf' }],
    privilegeSet: [{ id: 70, name: '[Full Access]' }],
    customMenu: [{ id: 80, name: 'M' }],
    account: [{ id: 90, name: 'admin' }],
    font: [{ id: 99, name: 'Helvetica' }],
  };
  const ops = describeOps(lists);
  assert.deepEqual(ops, [
    { op: 'read:field', table: 'A', detail: true },
    { op: 'read:field', table: 'B', detail: true },
    { op: 'read:layout', id: 11, detail: true },
    { op: 'read:script', id: 21 },
    { op: 'read:tableOccurrence', id: 30 },
    { op: 'read:relation', id: 40 },
    { op: 'read:valueList', id: 50 },
    { op: 'read:customFunction', id: 60 },
    { op: 'read:privilegeSet', id: 70 },
    { op: 'read:customMenu', id: 80 },
    { op: 'read:account', id: 90 },
  ]);
});

test('describeOps tolerates missing lists', () => {
  assert.deepEqual(describeOps({}), []);
});

test('describeKey and catalogOf', () => {
  assert.equal(describeKey({ op: 'read:field', table: 'A', detail: true }), 'table:A');
  assert.equal(describeKey({ op: 'read:layout', id: 11, detail: true }), '11');
  assert.equal(catalogOf({ op: 'read:field', table: 'A' }), 'field');
  assert.equal(catalogOf({ op: 'read:tableOccurrence' }), 'tableOccurrence');
  assert.equal(catalogOf({ op: 'evaluate:calculation', calculation: 'Get ( FileName )' }), 'facts');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/read-plan.test.mjs`
Expected: FAIL, cannot find module `ui/read-plan.js`.

- [ ] **Step 3: Implement**

```js
// ui/read-plan.js
// Which ops the inspector sends, and nothing else. Browser safe. Spec section 3.

export const LIST_CATALOGS = [
  'externalDataSource', 'table', 'tableOccurrence', 'relation', 'layout', 'script',
  'valueList', 'customFunction', 'account', 'privilegeSet', 'extendedPrivilege',
  'customMenu', 'customMenuSet', 'baseDirectory', 'persistentData', 'font',
  'graphNote', 'authorization',
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
  return op;
}

export function listOps() {
  return [
    ...LIST_CATALOGS.map(listOp),
    ...FILE_FACTS.map((calculation) => ({ op: 'evaluate:calculation', calculation })),
  ];
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/read-plan.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add ui/read-plan.js tests/read-plan.test.mjs
git commit -m "Read plan: the list, fact and describe ops the inspector sends

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The server

**Files:**
- Create: `server/read.mjs`, `server/server.mjs`
- Test: `tests/server.test.mjs`
- Modify: `package.json` (no new deps; nothing else in this task)

**Interfaces:**
- Consumes: `resolveTarget` (Task 1); `runOps`, `assertReadOnly` from the toolkit.
- Produces: `readOps(ctx, target, ops) → Promise<{ results, notices, summary, fatal?, exitCode, argv }>` where `ctx = { cli, username, noPrompt, runOps? }` (`runOps` injectable for tests; defaults to the toolkit's). `createServer({ cli, root, username, noPrompt, runOps?, uiDir? }) → http.Server` (not yet listening). `createDirectApi(ctx) → { context(), read(target, ops), resolveTarget(from, path) }`: the same three operations without http, used by the recorder in Task 5 and by the endpoints.

- [ ] **Step 1: Write the failing tests**

```js
// tests/server.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOps, createDirectApi } from '../server/read.mjs';
import { createServer } from '../server/server.mjs';

const cli = { path: '/stub/fm', version: '0.6.0', contract: 3 };

function fakeRunOps(calls) {
  return async (cliArg, target, ops, opts) => {
    calls.push({ cliArg, target, ops, opts });
    return {
      ok: true, exitCode: 0, notices: [], stderr: '', stdout: '', argv: ['--file=' + target.file],
      results: ops.map((o) => ({ op: o.op, status: 'ok', result: { kind: 'x' } })),
      summary: { total: ops.length, ok: ops.length, errors: 0, dryRun: false, rolledBack: false },
    };
  };
}

test('readOps spawns fm with the fixed flags and the account, never a password', async () => {
  const calls = [];
  const ctx = { cli, username: 'admin', noPrompt: false, runOps: fakeRunOps(calls) };
  const r = await readOps(ctx, 'fmnet://localhost/ooe', [{ op: 'read:table' }]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].target, { file: 'fmnet://localhost/ooe', username: 'admin' });
  const o = calls[0].opts;
  assert.equal(o.dryRun, false);
  assert.equal(o.abortOnError, false);
  assert.equal(o.opsFile, true);
  assert.equal(o.outFile, true);
  assert.equal(o.noPrompt, false);
  assert.ok(o.timeoutSeconds > 0);
  assert.ok(o.killAfterMs > o.timeoutSeconds * 1000);
  assert.equal(r.results.length, 1);
  assert.equal(r.exitCode, 0);
  assert.ok(!('stdout' in r) && !('stderr' in r), 'raw streams stay on the server');
});

test('readOps refuses a non-read-only op before spawning', async () => {
  const calls = [];
  const ctx = { cli, username: 'admin', noPrompt: true, runOps: fakeRunOps(calls) };
  await assert.rejects(
    () => readOps(ctx, 'fmnet://localhost/ooe', [{ op: 'read:table' }, { op: 'delete:table', name: 'X' }]),
    /delete:table/,
  );
  assert.equal(calls.length, 0);
});

test('readOps passes noPrompt through', async () => {
  const calls = [];
  await readOps({ cli, username: 'admin', noPrompt: true, runOps: fakeRunOps(calls) }, 'x', [{ op: 'read:font' }]);
  assert.equal(calls[0].opts.noPrompt, true);
});

async function withServer(opts, fn) {
  const server = createServer(opts);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise((r) => server.close(r)); }
}

const post = (base, path, body) => fetch(base + path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('GET /api/context returns the cli, root and username', async () => {
  await withServer({ cli, root: 'fmnet://localhost/ooe', username: 'admin', noPrompt: true, runOps: fakeRunOps([]) }, async (base) => {
    const res = await fetch(base + '/api/context');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { cli, root: 'fmnet://localhost/ooe', username: 'admin' });
  });
});

test('POST /api/read runs read-only ops and refuses others with 400 before fm', async () => {
  const calls = [];
  await withServer({ cli, root: 'fmnet://localhost/ooe', username: 'admin', noPrompt: true, runOps: fakeRunOps(calls) }, async (base) => {
    const ok = await post(base, '/api/read', { target: 'fmnet://localhost/ooe', ops: [{ op: 'read:table' }] });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.results[0].op, 'read:table');
    assert.equal(body.summary.ok, 1);
    assert.equal(calls.length, 1);

    const bad = await post(base, '/api/read', { target: 'fmnet://localhost/ooe', ops: [{ op: 'create:table', name: 'X' }] });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /create:table/);
    assert.equal(calls.length, 1);

    const malformed = await post(base, '/api/read', { target: 42 });
    assert.equal(malformed.status, 400);
  });
});

test('POST /api/resolve-target resolves siblings and reports the unresolvable', async () => {
  await withServer({ cli, root: 'fmnet://localhost/ooe', username: 'admin', noPrompt: true, runOps: fakeRunOps([]) }, async (base) => {
    const res = await post(base, '/api/resolve-target', { from: 'fmnet://localhost/ooe', path: 'file:BrojDva' });
    assert.deepEqual(await res.json(), { target: 'fmnet://localhost/BrojDva' });
    const bad = await post(base, '/api/resolve-target', { from: 'fmnet://localhost/ooe', path: 'odbc:ets' });
    const body = await bad.json();
    assert.equal(bad.status, 200);
    assert.equal(body.unresolvable, true);
  });
});

test('static files come from the ui directory and nothing above it', async () => {
  await withServer({ cli, root: 'x', username: 'admin', noPrompt: true, runOps: fakeRunOps([]) }, async (base) => {
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const js = await fetch(base + '/read-plan.js');
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);
    const escape = await fetch(base + '/../package.json');
    assert.equal(escape.status, 404);
    const missing = await fetch(base + '/nope.js');
    assert.equal(missing.status, 404);
  });
});

test('createDirectApi offers the three operations without http', async () => {
  const calls = [];
  const api = createDirectApi({ cli, root: 'fmnet://localhost/ooe', username: 'admin', noPrompt: true, runOps: fakeRunOps(calls) });
  assert.deepEqual(await api.context(), { cli, root: 'fmnet://localhost/ooe', username: 'admin' });
  assert.deepEqual(await api.resolveTarget('fmnet://localhost/ooe', 'file:BrojDva'), { target: 'fmnet://localhost/BrojDva' });
  const r = await api.read('fmnet://localhost/ooe', [{ op: 'read:font' }]);
  assert.equal(r.results[0].op, 'read:font');
});
```

The static-file test needs `ui/index.html` to exist. Create a placeholder in this task (Task 6 replaces it):

```html
<!doctype html>
<meta charset="utf-8">
<title>Clockwork Inspector</title>
<p>Inspector starting. The Solution panel arrives in Plan 3 Task 6.</p>
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/server.test.mjs`
Expected: FAIL, cannot find module `server/read.mjs`.

- [ ] **Step 3: Implement `server/read.mjs`**

```js
// server/read.mjs
// The one place fm is spawned. Fixed flags, read-only guard, no password anywhere.
import { runOps as toolkitRunOps } from 'fm-adt-toolkit/runner';
import { assertReadOnly } from 'fm-adt-toolkit/read-only';
import { resolveTarget } from './targets.mjs';

/** fm's own --timeout, and the Node-side kill a minute later. A describe batch
 *  on ooe is ~150 ops and takes seconds; a large solution takes minutes. */
export const FM_TIMEOUT_SECONDS = 600;
export const KILL_AFTER_MS = (FM_TIMEOUT_SECONDS + 60) * 1000;

export async function readOps(ctx, target, ops) {
  assertReadOnly(ops);
  const run = ctx.runOps ?? toolkitRunOps;
  const r = await run(ctx.cli, { file: target, username: ctx.username }, ops, {
    dryRun: false,
    abortOnError: false,
    opsFile: true,
    outFile: true,
    noPrompt: Boolean(ctx.noPrompt),
    timeoutSeconds: FM_TIMEOUT_SECONDS,
    killAfterMs: KILL_AFTER_MS,
  });
  return {
    results: r.results,
    notices: r.notices,
    summary: r.summary,
    ...(r.fatal ? { fatal: r.fatal } : {}),
    exitCode: r.exitCode,
    argv: r.argv,
  };
}

/** The three operations the page uses, callable without http. The endpoints in
 *  server.mjs and the fixture recorder both go through this. */
export function createDirectApi(ctx) {
  return {
    async context() {
      return { cli: ctx.cli, root: ctx.root, username: ctx.username };
    },
    read(target, ops) {
      return readOps(ctx, target, ops);
    },
    async resolveTarget(from, path) {
      return resolveTarget(from, path);
    },
  };
}
```

- [ ] **Step 4: Implement `server/server.mjs`**

```js
// server/server.mjs
// http on 127.0.0.1: static ui/, and the three JSON endpoints. Spec section 2.
import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDirectApi } from './read.mjs';

const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function serveStatic(res, uiDir, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  const file = resolve(uiDir, rel);
  if (!file.startsWith(uiDir + sep)) return send(res, 404, { error: 'not found' });
  const type = TYPES[extname(file)];
  if (!type) return send(res, 404, { error: 'not found' });
  try {
    send(res, 200, await readFile(file), type);
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

export function createServer(opts) {
  const api = createDirectApi(opts);
  const uiDir = opts.uiDir ?? UI_DIR;

  return createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (req.method === 'GET' && url.pathname === '/api/context') {
        return send(res, 200, await api.context());
      }
      if (req.method === 'POST' && url.pathname === '/api/read') {
        const body = await readJson(req);
        if (typeof body.target !== 'string' || !Array.isArray(body.ops)) {
          return send(res, 400, { error: 'body must be { target: string, ops: [] }' });
        }
        let result;
        try {
          result = await api.read(body.target, body.ops);
        } catch (e) {
          if (/not read-only/.test(e.message)) return send(res, 400, { error: e.message });
          throw e;
        }
        return send(res, 200, result);
      }
      if (req.method === 'POST' && url.pathname === '/api/resolve-target') {
        const body = await readJson(req);
        if (typeof body.from !== 'string' || typeof body.path !== 'string') {
          return send(res, 400, { error: 'body must be { from: string, path: string }' });
        }
        return send(res, 200, await api.resolveTarget(body.from, body.path));
      }
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        return serveStatic(res, uiDir, url.pathname);
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 500, { error: e.message });
    }
  });
}
```

Note on the URL: `new URL('/../package.json', base)` normalises the path to `/package.json`, and `resolve(uiDir, 'package.json')` is inside `ui/`, so the traversal test passes because the file does not exist there; the `startsWith` check is what stops an encoded `%2e%2e` form.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/server.test.mjs`
Expected: PASS, 8 tests. Then `npm test`: all green.

- [ ] **Step 6: Commit**

```bash
git add server/read.mjs server/server.mjs ui/index.html tests/server.test.mjs
git commit -m "Server: the one fm spawn with fixed flags, three JSON endpoints, static ui

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Model and discovery

**Files:**
- Create: `ui/model.js`, `ui/discovery.js`
- Test: `tests/model.test.mjs`, `tests/discovery.test.mjs`

**Interfaces:**
- Consumes: `listOps`, `describeOps`, `describeKey`, `catalogOf`, `LIST_CATALOGS` (Task 2). An `api` object with `context()`, `read(target, ops)`, `resolveTarget(from, path)` (Task 3's shape; Task 5 adds a replay implementation).
- Produces:
  - `createSolution(root, cli) → { root, cli, files: {}, unreachable: [], readAt: null }`
  - `createFile(target) → FileModel` with `catalogs[c] = { list: [], listError: null, detailById: {}, ops: [], readAt: null }` for every list catalog plus `field` (`detailById` keyed `table:<name>`), and `facts = {}`.
  - `applyBatch(file, ops, response, readAt)`: zips `ops` with `response.results` by position; list results fill `list` (or `listError`), facts fill `facts[calculation] = { value, dataType } | { error }`, describes fill `detailById[describeKey(op)] = { op, readAt, result } | { op, readAt, error }`. Values verbatim.
  - `catalogCounts(file) → { [catalog]: { listed, described, errors } }`
  - `discover(api, root, hooks = {}) → Promise<solution>`; `hooks.onProgress(message)`.
  - `readFile(api, target) → Promise<{ file } | { fatal }>`
  - `siblingPaths(file) → [{ source, paths }]` in list order, filemaker sources only.
  - `reread(api, solution, slot)` with `slot` one of `{ kind: 'solution' }`, `{ kind: 'catalog', target, catalog }`, `{ kind: 'object', target, catalog, key }`; returns the (possibly new) solution.
  - `SolutionUnreachable = { target, from, via, error }` where `error` is fm's fatal object, or `{ code: 'unresolvable', message }` listing every path's reason, or `{ code: 'unknown_data_source', message }` for an occurrence naming a source the list does not have.

- [ ] **Step 1: Write the failing model tests**

```js
// tests/model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSolution, createFile, applyBatch, catalogCounts } from '../ui/model.js';
import { listOps, describeOps, LIST_CATALOGS } from '../ui/read-plan.js';

const ok = (op, result) => ({ op: op.op, status: 'ok', result });
const err = (op, code) => ({ op: op.op, status: 'error', error: { code, message: code } });

test('createFile has a slot per list catalog plus field and facts', () => {
  const f = createFile('fmnet://localhost/ooe');
  for (const c of [...LIST_CATALOGS, 'field']) assert.ok(f.catalogs[c], c);
  assert.deepEqual(f.catalogs.table, { list: [], listError: null, detailById: {}, ops: [], readAt: null });
  assert.deepEqual(f.facts, {});
  assert.equal(f.name, null);
});

test('applyBatch stores lists, list errors and facts by position', () => {
  const f = createFile('t');
  const ops = listOps();
  const results = ops.map((op) => {
    if (op.op === 'read:table') return ok(op, { kind: 'table', total: 1, returned: 1, items: [{ name: 'A', id: 1 }] });
    if (op.op === 'read:authorization') return err(op, 'unknown_op');
    if (op.op === 'evaluate:calculation') return ok(op, { kind: 'calculation', value: op.calculation === 'Get ( FileName )' ? 'ooe' : '0', dataType: 'text' });
    return ok(op, { kind: 'x', total: 0, returned: 0, items: [] });
  });
  applyBatch(f, ops, { results }, '2026-09-15T10:00:00Z');
  assert.deepEqual(f.catalogs.table.list, [{ name: 'A', id: 1 }]);
  assert.equal(f.catalogs.table.readAt, '2026-09-15T10:00:00Z');
  assert.deepEqual(f.catalogs.table.ops, [{ op: 'read:table' }]);
  assert.deepEqual(f.catalogs.authorization.listError, { code: 'unknown_op', message: 'unknown_op' });
  assert.deepEqual(f.facts['Get ( FileName )'], { value: 'ooe', dataType: 'text' });
  assert.equal(f.name, 'ooe');
});

test('applyBatch stores describes under describeKey, verbatim, errors too', () => {
  const f = createFile('t');
  const ops = describeOps({ table: [{ name: 'A' }], layout: [{ id: 11, type: 'layout' }], script: [{ id: 21, type: 'script' }] });
  const results = [
    ok(ops[0], { kind: 'field', items: [{ name: 'f1', id: 1, type: 'text', options: {}, table: 'A' }] }),
    ok(ops[1], { id: 11, name: 'L', contents: { objects: [] } }),
    err(ops[2], 'not_found'),
  ];
  applyBatch(f, ops, { results }, 'now');
  assert.deepEqual(f.catalogs.field.detailById['table:A'].result.items[0].name, 'f1');
  assert.equal(f.catalogs.layout.detailById['11'].result.name, 'L');
  assert.deepEqual(f.catalogs.script.detailById['21'].error, { code: 'not_found', message: 'not_found' });
  assert.deepEqual(f.catalogs.layout.detailById['11'].op, ops[1]);
  assert.equal(f.catalogs.layout.detailById['11'].readAt, 'now');
});

test('applyBatch with fewer results than ops marks the rest as missing', () => {
  const f = createFile('t');
  const ops = describeOps({ script: [{ id: 1, type: 'script' }, { id: 2, type: 'script' }] });
  applyBatch(f, ops, { results: [ok(ops[0], { id: 1 })] }, 'now');
  assert.equal(f.catalogs.script.detailById['2'].error.code, 'no_result');
});

test('catalogCounts', () => {
  const f = createFile('t');
  f.catalogs.script.list = [{ id: 1, type: 'script' }, { id: 2, type: 'script' }, { id: 3, type: 'folder' }];
  f.catalogs.script.detailById = { 1: { result: {} }, 2: { error: { code: 'x' } } };
  assert.deepEqual(catalogCounts(f).script, { listed: 3, described: 1, errors: 1 });
  assert.deepEqual(catalogCounts(f).font, { listed: 0, described: 0, errors: 0 });
});

test('createSolution', () => {
  assert.deepEqual(createSolution('r', { version: '0.6.0' }), { root: 'r', cli: { version: '0.6.0' }, files: {}, unreachable: [], readAt: null });
});
```

- [ ] **Step 2: Write the failing discovery tests**

The fake api below is a tiny hand-written solution: root `fmnet://localhost/root` with a `file:Child` source (readable), a `file:Gone` source (fatal), a `$$var` source, and an occurrence pointing at an unlisted source. Child lists `file:Root` (case differs: must not be re-read).

```js
// tests/discovery.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discover, readFile, siblingPaths, reread } from '../ui/discovery.js';
import { resolveTarget } from '../server/targets.mjs';

function fakeApi(log = []) {
  const files = {
    'fmnet://localhost/root': {
      externalDataSource: [
        { name: 'Child', id: 1, paths: ['file:Child'], sourceType: 'filemaker' },
        { name: 'Gone', id: 2, paths: ['$$first', 'file:Gone'], sourceType: 'filemaker' },
        { name: 'Var', id: 3, paths: ['$$var'], sourceType: 'filemaker' },
        { name: 'ets', id: 4, paths: ['odbc:ets'], sourceType: 'odbc' },
      ],
      table: [{ name: 'A', id: 1 }],
      tableOccurrence: [
        { name: 'A', id: 10, table: { name: 'A', id: 1, resolved: true } },
        { name: 'Ghost', id: 11, table: { name: 'G', id: 9, resolved: false, dataSource: 'Missing' } },
      ],
      script: [{ id: 21, name: 'S', type: 'script' }],
    },
    'fmnet://localhost/Child': {
      externalDataSource: [{ name: 'Back', id: 1, paths: ['file:ROOT'], sourceType: 'filemaker' }],
      table: [{ name: 'C', id: 1 }],
    },
  };
  const fatal = { code: 'open_failed', message: 'no such file', dbError: 802 };
  return {
    log,
    async context() { return { cli: { version: '0.6.0' }, root: 'fmnet://localhost/root', username: 'admin' }; },
    async read(target, ops) {
      log.push({ target, ops: ops.map((o) => o.op + (o.id ? ':' + o.id : o.table ? ':' + o.table : '')) });
      const f = files[target];
      if (!f) return { results: [], notices: [], summary: null, fatal, exitCode: 2 };
      const results = ops.map((op) => {
        if (op.op === 'evaluate:calculation') return { op: op.op, status: 'ok', result: { kind: 'calculation', value: target.split('/').pop(), dataType: 'text' } };
        if (op.op === 'read:field') return { op: op.op, status: 'ok', result: { kind: 'field', items: [{ name: 'f', table: op.table }] } };
        if ('id' in op) return { op: op.op, status: 'ok', result: { id: op.id, name: 'described', readCount: (log.filter((l) => l.ops.includes(op.op + ':' + op.id)).length) } };
        const c = op.op.replace('read:', '');
        return { op: op.op, status: 'ok', result: { kind: c, items: f[c] ?? [] } };
      });
      return { results, notices: [], summary: { total: ops.length, ok: ops.length, errors: 0, dryRun: false, rolledBack: false }, exitCode: 0 };
    },
    async resolveTarget(from, path) { return resolveTarget(from, path, { exists: () => false }); },
  };
}

test('siblingPaths lists filemaker sources in order with their path lists', async () => {
  const api = fakeApi();
  const { file } = await readFile(api, 'fmnet://localhost/root');
  assert.deepEqual(siblingPaths(file), [
    { source: 'Child', paths: ['file:Child'] },
    { source: 'Gone', paths: ['$$first', 'file:Gone'] },
    { source: 'Var', paths: ['$$var'] },
  ]);
});

test('readFile sends the list batch then the describe batch, or returns the fatal', async () => {
  const api = fakeApi();
  const r = await readFile(api, 'fmnet://localhost/root');
  assert.equal(r.file.name, 'root');
  assert.equal(api.log.length, 2);
  assert.ok(api.log[1].ops.includes('read:field:A'));
  assert.ok(api.log[1].ops.includes('read:script:21'));
  assert.equal(r.file.catalogs.script.detailById['21'].result.name, 'described');
  const gone = await readFile(api, 'fmnet://localhost/Gone');
  assert.equal(gone.fatal.code, 'open_failed');
});

test('discover walks siblings once, records unreachable and unresolvable, never re-reads the root', async () => {
  const api = fakeApi();
  const messages = [];
  const s = await discover(api, 'fmnet://localhost/root', { onProgress: (m) => messages.push(m) });
  assert.deepEqual(Object.keys(s.files).sort(), ['fmnet://localhost/Child', 'fmnet://localhost/root']);
  assert.equal(s.files['fmnet://localhost/Child'].name, 'Child');
  assert.deepEqual(s.cli, { version: '0.6.0' });
  assert.ok(s.readAt);
  const codes = s.unreachable.map((u) => [u.via, u.error.code]);
  assert.deepEqual(codes, [
    ['Gone', 'open_failed'],
    ['Var', 'unresolvable'],
    ['Ghost', 'unknown_data_source'],
  ]);
  const gone = s.unreachable[0];
  assert.equal(gone.target, 'fmnet://localhost/Gone');
  assert.equal(gone.from, 'fmnet://localhost/root');
  assert.match(s.unreachable[1].error.message, /\$\$var/);
  const reads = api.log.map((l) => l.target);
  assert.equal(reads.filter((t) => t.toLowerCase() === 'fmnet://localhost/root').length, 2, 'root read once (two batches)');
  assert.equal(reads.filter((t) => t === 'fmnet://localhost/Gone').length, 1);
  assert.ok(messages.length >= 2);
});

test('reread at the three grains', async () => {
  const api = fakeApi();
  const s = await discover(api, 'fmnet://localhost/root');
  const before = api.log.length;

  const s2 = await reread(api, s, { kind: 'object', target: 'fmnet://localhost/root', catalog: 'script', key: '21' });
  assert.equal(s2, s);
  assert.deepEqual(api.log.at(-1), { target: 'fmnet://localhost/root', ops: ['read:script:21'] });
  assert.equal(s.files['fmnet://localhost/root'].catalogs.script.detailById['21'].result.readCount, 2);
  assert.equal(api.log.length, before + 1);

  await reread(api, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'script' });
  assert.deepEqual(api.log.at(-2).ops, ['read:script']);
  assert.deepEqual(api.log.at(-1).ops, ['read:script:21']);

  await reread(api, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'field' });
  assert.deepEqual(api.log.at(-1).ops, ['read:field:A']);

  await reread(api, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'font' });
  assert.deepEqual(api.log.at(-1).ops, ['read:font']);

  const s3 = await reread(api, s, { kind: 'solution' });
  assert.notEqual(s3, s);
  assert.deepEqual(Object.keys(s3.files).sort(), ['fmnet://localhost/Child', 'fmnet://localhost/root']);
});

test('reread of an unknown slot throws', async () => {
  const api = fakeApi();
  const s = await discover(api, 'fmnet://localhost/root');
  await assert.rejects(() => reread(api, s, { kind: 'catalog', target: 'nope', catalog: 'font' }), /nope/);
  await assert.rejects(() => reread(api, s, { kind: 'object', target: 'fmnet://localhost/root', catalog: 'script', key: '999' }), /999/);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/model.test.mjs tests/discovery.test.mjs`
Expected: FAIL, cannot find module `ui/model.js`.

- [ ] **Step 4: Implement `ui/model.js`**

```js
// ui/model.js
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
    slot.detailById[describeKey(op)] = line?.status === 'ok'
      ? { op, readAt, result: line.result }
      : { op, readAt, error: line?.error ?? NO_RESULT };
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
```

- [ ] **Step 5: Implement `ui/discovery.js`**

```js
// ui/discovery.js
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

export async function discover(api, root, hooks = {}) {
  const progress = hooks.onProgress ?? (() => {});
  const ctx = await api.context();
  const solution = createSolution(root, ctx.cli);
  const visited = new Set([targetKey(root)]);
  const queue = [{ target: root, from: null, via: null }];

  while (queue.length) {
    const { target, from, via } = queue.shift();
    progress(`Reading ${target}`);
    const r = await readFile(api, target);
    if (r.fatal) {
      solution.unreachable.push({ target, from, via, error: r.fatal });
      continue;
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
      queue.push({ target: next, from: target, via: source });
    }
    for (const { occurrence, dataSource } of unknownDataSources(r.file)) {
      solution.unreachable.push({
        target: dataSource, from: target, via: occurrence,
        error: { code: 'unknown_data_source', message: `occurrence ${occurrence} names data source ${dataSource}, which the file does not list` },
      });
    }
  }
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/model.test.mjs tests/discovery.test.mjs`
Expected: PASS, 11 tests. Then `npm test`: all green.

- [ ] **Step 7: Commit**

```bash
git add ui/model.js ui/discovery.js tests/model.test.mjs tests/discovery.test.mjs
git commit -m "Model and discovery: fm answers verbatim per slot, siblings walked once, re-read at three grains

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Record the ooe fixture and replay it

**Files:**
- Create: `scripts/record-fixture.mjs`, `tests/replay-api.mjs`, `tests/fixtures/ooe/meta.json`, `tests/fixtures/ooe/calls.ndjson`
- Modify: `package.json` (add `"record": "node scripts/record-fixture.mjs"`), `tests/discovery.test.mjs` (append the fixture tests)

**Interfaces:**
- Consumes: `createDirectApi` (Task 3), `discover` (Task 4), `locateFmCli` from the toolkit.
- Produces: `tests/fixtures/ooe/calls.ndjson`, one line per api call: `{ "kind": "read", "target", "ops", "response" }` or `{ "kind": "resolve", "from", "path", "response" }`. `meta.json`: `{ "recordedOn", "root", "username", "fm": { "path", "version", "contract", "banner" }, "files", "unreachable" }` (`banner` is the raw `fm --version` text, which carries the build number). `createReplayApi(dir) → api` answering `read` by matching each op on `(target, JSON.stringify(op))` across every recorded batch, returning a recorded fatal for a target that only ever answered with one, and throwing for an op never recorded; `resolveTarget` uses the real resolver with `exists: () => false`.

- [ ] **Step 1: Write the recorder**

```js
// scripts/record-fixture.mjs
// Records every api call a discovery makes against a live file into a fixture
// directory, so the model and discovery tests replay real fm 0.6.0 answers.
// Read-only by construction: it goes through createDirectApi, which refuses
// anything that is not read:*, evaluate:calculation or validate:calculation.
//
//   node scripts/record-fixture.mjs --file=fmnet://localhost/ooe --username=admin --out=tests/fixtures/ooe
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { locateFmCli } from 'fm-adt-toolkit/runner';
import { createDirectApi } from '../server/read.mjs';
import { discover } from '../ui/discovery.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
if (!args.file || !args.username || !args.out) {
  console.error('usage: record-fixture --file=<target> --username=<account> --out=<dir>');
  process.exit(2);
}

const cli = await locateFmCli();
if (!cli) {
  console.error('fm CLI not found');
  process.exit(2);
}
const banner = (await promisify(execFile)(cli.path, ['--version'])).stdout.trim();

const direct = createDirectApi({ cli, root: args.file, username: args.username, noPrompt: true });
const calls = [];
const recording = {
  context: () => direct.context(),
  async read(target, ops) {
    const response = await direct.read(target, ops);
    calls.push({ kind: 'read', target, ops, response });
    return response;
  },
  async resolveTarget(from, path) {
    const response = await direct.resolveTarget(from, path);
    calls.push({ kind: 'resolve', from, path, response });
    return response;
  },
};

const solution = await discover(recording, args.file, { onProgress: (m) => console.error(m) });

await mkdir(args.out, { recursive: true });
await writeFile(join(args.out, 'calls.ndjson'), calls.map((c) => JSON.stringify(c)).join('\n') + '\n');
await writeFile(join(args.out, 'meta.json'), JSON.stringify({
  recordedOn: new Date().toISOString().slice(0, 10),
  root: args.file,
  username: args.username,
  fm: { path: cli.path, version: cli.version, contract: cli.contract, banner },
  files: Object.keys(solution.files),
  unreachable: solution.unreachable.map((u) => ({ target: u.target, via: u.via, code: u.error.code })),
}, null, 2) + '\n');
console.error(`wrote ${calls.length} calls to ${args.out}`);
```

- [ ] **Step 2: Write the replay api**

```js
// tests/replay-api.mjs
// An api that answers from a recorded fixture. Matches each op by target and
// exact op JSON, so any batch composition (discovery, catalog re-read, object
// re-read) replays from the same recording.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveTarget } from '../server/targets.mjs';

export function createReplayApi(dir) {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const lines = readFileSync(join(dir, 'calls.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const byOp = new Map();   // `${target}\n${opJson}` -> result line
  const fatals = new Map(); // target -> fatal
  for (const c of lines) {
    if (c.kind !== 'read') continue;
    if (c.response.fatal) { fatals.set(c.target, c.response.fatal); continue; }
    c.ops.forEach((op, i) => byOp.set(`${c.target}\n${JSON.stringify(op)}`, c.response.results[i]));
  }
  return {
    meta,
    async context() { return { cli: { version: meta.fm.version, contract: meta.fm.contract, path: meta.fm.path }, root: meta.root, username: meta.username }; },
    async read(target, ops) {
      if (fatals.has(target)) return { results: [], notices: [], summary: null, fatal: fatals.get(target), exitCode: 2 };
      const results = ops.map((op) => {
        const line = byOp.get(`${target}\n${JSON.stringify(op)}`);
        if (!line) throw new Error(`fixture has no recording for ${JSON.stringify(op)} on ${target}`);
        return line;
      });
      const errors = results.filter((r) => r.status === 'error').length;
      return { results, notices: [], summary: { total: ops.length, ok: ops.length - errors, errors, dryRun: false, rolledBack: false }, exitCode: errors ? 1 : 0 };
    },
    async resolveTarget(from, path) { return resolveTarget(from, path, { exists: () => false }); },
  };
}
```

- [ ] **Step 3: Record the fixture from ooe**

Run (read-only; the recorder can only send read ops):

```bash
node scripts/record-fixture.mjs --file=fmnet://localhost/ooe --username=admin --out=tests/fixtures/ooe
```

Expected on stderr: `Reading fmnet://localhost/ooe`, then `Reading fmnet://localhost/Ooe_dev` (fatal 802), `Reading fmnet://localhost/BrojDva` (fatal 212 or, if a password has since been stored, a read), then `Read 1 file(s), 4 unreachable` (or 2 files, 3 unreachable). Check `tests/fixtures/ooe/meta.json`: `fm.banner` is `0.6.0 (29816214)` or newer, `files` includes the root. `calls.ndjson` is around 1.2 MB. Confirm no line contains a password: `grep -c password tests/fixtures/ooe/calls.ndjson` prints 0 (fm never emits one; this is a sanity check).

- [ ] **Step 4: Append the fixture tests to `tests/discovery.test.mjs`**

```js
import { createReplayApi } from './replay-api.mjs';
import { catalogCounts } from '../ui/model.js';

const FIXTURE = new URL('./fixtures/ooe/', import.meta.url).pathname;

test('discovery of the recorded ooe solution', async () => {
  const api = createReplayApi(FIXTURE);
  const s = await discover(api, api.meta.root);
  const root = s.files[api.meta.root];
  assert.ok(root, 'root file read');
  assert.equal(root.name, 'ooe');
  assert.equal(root.facts['Get ( EncryptionState )'].value, '0');
  const counts = catalogCounts(root);
  assert.ok(counts.table.listed >= 13, 'ooe has at least 13 tables');
  assert.equal(counts.field.described, counts.table.listed, 'every table described');
  assert.equal(counts.script.described, root.catalogs.script.list.filter((i) => i.type === 'script').length);
  assert.equal(counts.layout.described, root.catalogs.layout.list.filter((i) => i.type === 'layout').length);
  assert.ok(root.catalogs.layout.detailById[String(root.catalogs.layout.list.find((i) => i.type === 'layout').id)].result.contents, 'layout detail carries contents');
  for (const u of s.unreachable) assert.ok(u.error.code, `unreachable ${u.target} carries an error code`);
  const byVia = Object.fromEntries(s.unreachable.map((u) => [u.via, u.error.code]));
  assert.equal(byVia.by_variable, 'unresolvable');
  assert.ok(['open_failed', 'authentication_failed'].includes(byVia.Ooe_dev) || s.files['fmnet://localhost/Ooe_dev'], 'Ooe_dev read or unreachable with fm\'s code');
  assert.ok(!Object.keys(s.files).some((t) => t !== api.meta.root && t.toLowerCase() === api.meta.root), 'Self source did not re-read the root');
});

test('object and catalog re-read replay against the recorded ooe', async () => {
  const api = createReplayApi(FIXTURE);
  const s = await discover(api, api.meta.root);
  const root = s.files[api.meta.root];
  const scriptId = root.catalogs.script.list.find((i) => i.type === 'script').id;
  const before = root.catalogs.script.detailById[String(scriptId)].readAt;
  await new Promise((r) => setTimeout(r, 2));
  await reread(api, s, { kind: 'object', target: api.meta.root, catalog: 'script', key: String(scriptId) });
  assert.notEqual(root.catalogs.script.detailById[String(scriptId)].readAt, before);
  await reread(api, s, { kind: 'catalog', target: api.meta.root, catalog: 'valueList' });
  assert.equal(catalogCounts(root).valueList.described, root.catalogs.valueList.list.length);
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all green, including the two fixture tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/record-fixture.mjs tests/replay-api.mjs tests/fixtures/ooe tests/discovery.test.mjs package.json
git commit -m "Record the ooe solution read as a fixture and replay it in the discovery tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Entry point, page, live smoke test, docs

**Files:**
- Create: `bin/inspector.mjs`, `server/args.mjs`, `ui/api.js`, `ui/app.js`, `tests/args.test.mjs`, `tests/live-smoke.test.mjs`
- Modify: `ui/index.html` (replace the placeholder), `package.json` (`bin`, `start`), `CLAUDE.md`, `README.md`

**Interfaces:**
- Consumes: `createServer` (Task 3), `discover`, `reread` (Task 4), `catalogCounts` (Task 4), `locateFmCli` from the toolkit.
- Produces: `parseArgs(argv) → { file, username, port, open, noPrompt }` (throws on a missing `--file` or `--username`; `port` defaults to 0; `open` defaults to true; `--no-open` and `--no-prompt` flags); `createApi(baseUrl = '') → { context, read, resolveTarget }` over `fetch`, throwing on a non-2xx with the server's `error` text.

- [ ] **Step 1: Write the failing args test**

```js
// tests/args.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../server/args.mjs';

test('parseArgs defaults and flags', () => {
  assert.deepEqual(parseArgs(['--file=fmnet://localhost/ooe', '--username=admin']),
    { file: 'fmnet://localhost/ooe', username: 'admin', port: 0, open: true, noPrompt: false });
  assert.deepEqual(parseArgs(['--file=/x/y.fmp12', '--username=a', '--port=8080', '--no-open', '--no-prompt']),
    { file: '/x/y.fmp12', username: 'a', port: 8080, open: false, noPrompt: true });
});

test('parseArgs refuses a missing file or username, a password, and unknown flags', () => {
  assert.throws(() => parseArgs(['--username=a']), /--file/);
  assert.throws(() => parseArgs(['--file=x']), /--username/);
  assert.throws(() => parseArgs(['--file=x', '--username=a', '--password=s']), /password/);
  assert.throws(() => parseArgs(['--file=x', '--username=a', '--bogus']), /bogus/);
});
```

- [ ] **Step 2: Implement `server/args.mjs`**

```js
// server/args.mjs
export function parseArgs(argv) {
  const out = { file: null, username: null, port: 0, open: true, noPrompt: false };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) throw new Error(`unexpected argument ${a}`);
    const [, key, value] = m;
    switch (key) {
      case 'file': out.file = value; break;
      case 'username': out.username = value; break;
      case 'port': out.port = Number(value); break;
      case 'no-open': out.open = false; break;
      case 'no-prompt': out.noPrompt = true; break;
      case 'password': throw new Error('--password is never accepted; fm reads the password from the keychain or asks in its own window');
      default: throw new Error(`unknown flag --${key}`);
    }
  }
  if (!out.file) throw new Error('--file=<fmnet://host/Name or /path/Name.fmp12> is required');
  if (!out.username) throw new Error('--username=<account> is required');
  if (!Number.isInteger(out.port) || out.port < 0) throw new Error('--port must be a non-negative integer');
  return out;
}
```

- [ ] **Step 3: Implement `bin/inspector.mjs`**

```js
#!/usr/bin/env node
// bin/inspector.mjs
import { spawn } from 'node:child_process';
import { locateFmCli } from 'fm-adt-toolkit/runner';
import { parseArgs } from '../server/args.mjs';
import { createServer } from '../server/server.mjs';

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(e.message);
  console.error('usage: inspector --file=<target> --username=<account> [--port=0] [--no-open] [--no-prompt]');
  process.exit(2);
}

const cli = await locateFmCli();
if (!cli) {
  console.error('fm CLI not found. Install the Claris ADT plugin, or put fm on PATH.');
  process.exit(2);
}

const server = createServer({ cli, root: args.file, username: args.username, noPrompt: args.noPrompt });
server.listen(args.port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`Clockwork Inspector on ${url} (fm ${cli.version}, ${args.file} as ${args.username})`);
  if (args.open) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  }
});
```

Add to `package.json`: `"bin": { "inspector": "bin/inspector.mjs" }` and `"start": "node bin/inspector.mjs"`. `chmod +x bin/inspector.mjs`.

- [ ] **Step 4: Implement `ui/api.js`**

```js
// ui/api.js
// The page's only door to the server. Works in Node too (native fetch).
export function createApi(baseUrl = '') {
  async function call(path, init) {
    const res = await fetch(baseUrl + path, init);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `${path} failed with ${res.status}`);
    return body;
  }
  const post = (path, body) => call(path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return {
    context: () => call('/api/context'),
    read: (target, ops) => post('/api/read', { target, ops }),
    resolveTarget: (from, path) => post('/api/resolve-target', { from, path }),
  };
}
```

- [ ] **Step 5: Write `ui/index.html` and `ui/app.js`: the Solution panel**

The page shows, for the solution: root, fm version, read time, a "Re-read solution" button, a progress line. Per file: name and target, the facts as a definition list, a catalog table with columns catalog / listed / described / errors and a "Re-read" button per row. Then the unreachable list: target, reached from, via which source, and fm's error code, message and suggestions verbatim. Object-level re-read is exposed as `window.inspector.reread(slot)` for Plan 4's detail panes to call; no UI for it yet.

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clockwork Inspector</title>
<style>
  :root { --ink: #1c1b18; --muted: #6b6760; --line: #ddd8cf; --bg: #faf8f4; --panel: #fff; --accent: #2f5d8a; --bad: #a33; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, sans-serif; }
  header { padding: 12px 20px; border-bottom: 1px solid var(--line); background: var(--panel); display: flex; gap: 16px; align-items: baseline; flex-wrap: wrap; }
  header h1 { font-size: 16px; margin: 0; }
  header .meta { color: var(--muted); }
  main { padding: 20px; display: grid; gap: 20px; max-width: 1100px; }
  section { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; }
  h2 { font-size: 15px; margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 500; }
  td.num { text-align: right; }
  button { font: inherit; padding: 3px 10px; border: 1px solid var(--line); border-radius: 4px; background: var(--bg); cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0 0 10px; }
  dt { color: var(--muted); }
  .error { color: var(--bad); }
  .muted { color: var(--muted); }
  code { font-family: ui-monospace, monospace; font-size: 13px; }
  #progress { color: var(--muted); }
</style>
<header>
  <h1>Clockwork Inspector</h1>
  <span class="meta" id="context">connecting</span>
  <button id="reread-solution" disabled>Re-read solution</button>
  <span id="progress"></span>
</header>
<main id="solution"></main>
<script type="module" src="app.js"></script>
</html>
```

```js
// ui/app.js
import { createApi } from './api.js';
import { discover, reread } from './discovery.js';
import { catalogCounts } from './model.js';

const api = createApi('');
const $ = (id) => document.getElementById(id);
let solution = null;
let busy = false;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function progress(message) {
  $('progress').textContent = message;
}

async function run(label, fn) {
  if (busy) return;
  busy = true;
  $('reread-solution').disabled = true;
  progress(label);
  try {
    await fn();
  } catch (e) {
    progress(`Failed: ${e.message}`);
  } finally {
    busy = false;
    $('reread-solution').disabled = false;
    render();
  }
}

function renderFile(file) {
  const counts = catalogCounts(file);
  const facts = Object.entries(file.facts).map(([k, v]) =>
    `<dt>${esc(k)}</dt><dd>${'value' in v ? esc(v.value) : `<span class="error">${esc(v.error.code)}: ${esc(v.error.message)}</span>`}</dd>`).join('');
  const rows = Object.entries(counts).map(([catalog, c]) => {
    const slot = file.catalogs[catalog];
    const listErr = slot.listError ? `<span class="error">${esc(slot.listError.code)}</span>` : '';
    return `<tr><td>${esc(catalog)} ${listErr}</td><td class="num">${c.listed}</td><td class="num">${c.described}</td><td class="num ${c.errors ? 'error' : ''}">${c.errors}</td><td class="muted">${esc(slot.readAt ?? '')}</td><td><button data-reread-catalog="${esc(catalog)}" data-target="${esc(file.target)}">Re-read</button></td></tr>`;
  }).join('');
  return `<section>
    <h2>${esc(file.name ?? file.target)} <span class="muted">${esc(file.target)}</span></h2>
    <dl>${facts}</dl>
    <table><thead><tr><th>Catalog</th><th>Listed</th><th>Described</th><th>Errors</th><th>Read at</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function renderUnreachable(list) {
  if (!list.length) return '';
  const items = list.map((u) => `<li><code>${esc(u.target)}</code> <span class="muted">from ${esc(u.from ?? '')} via ${esc(u.via ?? '')}</span><br>
    <span class="error">${esc(u.error.code)}${u.error.dbError ? ` (DBError ${esc(u.error.dbError)})` : ''}</span>: ${esc(u.error.message)}
    ${u.error.suggestions?.length ? `<ul>${u.error.suggestions.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</li>`).join('');
  return `<section><h2>Unreachable</h2><ul>${items}</ul></section>`;
}

function render() {
  if (!solution) return;
  $('context').textContent = `${solution.root}, fm ${solution.cli?.version ?? '?'}, read ${solution.readAt ?? '...'}`;
  $('solution').innerHTML = Object.values(solution.files).map(renderFile).join('') + renderUnreachable(solution.unreachable);
}

$('solution').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-reread-catalog]');
  if (!b) return;
  const slot = { kind: 'catalog', target: b.dataset.target, catalog: b.dataset.rereadCatalog };
  run(`Re-reading ${slot.catalog} of ${slot.target}`, async () => { solution = await reread(api, solution, slot); });
});

$('reread-solution').addEventListener('click', () => {
  run('Re-reading the solution', async () => { solution = await reread(api, solution, { kind: 'solution' }); });
});

window.inspector = {
  get solution() { return solution; },
  reread: (slot) => run(`Re-reading ${slot.kind}`, async () => { solution = await reread(api, solution, slot); }),
};

const ctx = await api.context();
$('context').textContent = `${ctx.root} as ${ctx.username}, fm ${ctx.cli.version}`;
run('Discovering the solution', async () => {
  solution = await discover(api, ctx.root, { onProgress: progress });
});
```

- [ ] **Step 6: Write the live smoke test**

```js
// tests/live-smoke.test.mjs
// One live read of the reference solution, reads only. Runs only when
// INSPECTOR_LIVE=1; target and account from INSPECTOR_FILE / INSPECTOR_USERNAME
// (default fmnet://localhost/ooe as admin, password from the keychain, no prompt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locateFmCli } from 'fm-adt-toolkit/runner';
import { createServer } from '../server/server.mjs';
import { createApi } from '../ui/api.js';
import { discover, reread } from '../ui/discovery.js';
import { catalogCounts } from '../ui/model.js';

const live = process.env.INSPECTOR_LIVE === '1';
const root = process.env.INSPECTOR_FILE ?? 'fmnet://localhost/ooe';
const username = process.env.INSPECTOR_USERNAME ?? 'admin';

test('live: discover the reference solution through the server', { skip: !live, timeout: 15 * 60 * 1000 }, async () => {
  const cli = await locateFmCli();
  assert.ok(cli, 'fm CLI located');
  const server = createServer({ cli, root, username, noPrompt: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const api = createApi(`http://127.0.0.1:${server.address().port}`);
    const ctx = await api.context();
    assert.equal(ctx.root, root);
    const s = await discover(api, root, { onProgress: (m) => console.log(m) });
    const file = s.files[root];
    assert.ok(file, `root ${root} was read; unreachable: ${JSON.stringify(s.unreachable.map((u) => [u.target, u.error.code]))}`);
    const counts = catalogCounts(file);
    assert.ok(counts.table.listed > 0);
    assert.equal(counts.field.described, counts.table.listed, 'every table described');
    assert.equal(counts.field.errors, 0);
    assert.equal(counts.script.described, file.catalogs.script.list.filter((i) => i.type === 'script').length);
    assert.equal(counts.layout.described, file.catalogs.layout.list.filter((i) => i.type === 'layout').length);
    assert.ok(file.facts['Get ( FileName )'].value);
    for (const u of s.unreachable) assert.ok(u.error.code, `unreachable ${u.target} carries fm's error`);

    const scriptId = String(file.catalogs.script.list.find((i) => i.type === 'script').id);
    await reread(api, s, { kind: 'object', target: root, catalog: 'script', key: scriptId });
    assert.ok(file.catalogs.script.detailById[scriptId].result);

    const rejected = await fetch(`http://127.0.0.1:${server.address().port}/api/read`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: root, ops: [{ op: 'create:table', name: 'never' }] }),
    });
    assert.equal(rejected.status, 400, 'a write op is refused before fm is spawned');
  } finally {
    await new Promise((r) => server.close(r));
  }
});
```

- [ ] **Step 7: Run the tests, then the live test once**

Run: `npm test` → all green, the live test reported as skipped.
Run: `INSPECTOR_LIVE=1 node --test tests/live-smoke.test.mjs` → PASS (reads only; two batches on ooe plus the failed opens of the siblings, then one object re-read).
Run: `npm start -- --file=fmnet://localhost/ooe --username=admin --no-open --no-prompt --port=4123` in the background, then `curl -s http://127.0.0.1:4123/ | head -3` shows the page and `curl -s http://127.0.0.1:4123/api/context` shows the context; stop the server. (Full browser rendering is checked by the owner.)

- [ ] **Step 8: Docs**

`CLAUDE.md`: under Commands add `npm start -- --file=<target> --username=<account> [--port=0] [--no-open] [--no-prompt]` and `INSPECTOR_LIVE=1 npm test` (live, reads only), and `npm run record -- --file=... --username=admin --out=tests/fixtures/ooe` (re-record after ooe changes or a new fm build). Under a new "Layout" heading, the file map of this plan in four lines: `bin/` entry, `server/` the one fm spawn plus endpoints, `ui/` browser-safe model/discovery/page, `tests/fixtures/ooe` the recorded solution with `meta.json` naming the fm build.

`README.md`: replace the "Drop a Save as XML export onto the page" paragraph and the sentence after it with a short "Version 3 (in progress)" paragraph: reads live files through the Claris ADT fm CLI, `npm install` then `npm start -- --file=... --username=...`, fm asks for the password in its own window and offers to save it in the keychain, reads only. Keep the screenshots and the credits; say the Save as XML version is kept in `legacy/`.

- [ ] **Step 9: Commit**

```bash
git add bin/inspector.mjs server/args.mjs ui/api.js ui/app.js ui/index.html tests/args.test.mjs tests/live-smoke.test.mjs package.json CLAUDE.md README.md
git commit -m "Inspector entry point, Solution panel and live smoke test on ooe

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec §2 endpoints: context (Task 3), read with the 400 guard (Task 3), resolve-target with every path class (Task 1, 3). Discovery steps 1 to 4 (Task 4). Re-read at three grains through one `reread(slot)` (Task 4), wired to the page at solution and catalog grain and exposed for object grain (Task 6).
- Spec §3 model: verbatim values, per-slot ops and time (Task 4). File facts via `Get()` (Task 2). Two invocations per file (Task 4 `readFile`). Derived views are Plan 4.
- Spec §5 testing: server guard, target resolution, result handling against fixtures (Tasks 1, 3, 5); model and discovery in Node against a recorded ooe solution (Task 5); one live smoke test gated on an environment variable (Task 6); the fixture states the fm build (`meta.json`).
- `context` returns `{ cli: { path, version, contract }, root, username }`; the spec's `engine` lives in the facts (`Get ( HostApplicationVersion )`) because `FmCli` has no engine field.
- `targetKey` folds case for hosted targets so ooe's `Self` source does not re-read the root; the spec's "keyed on the resolved target string" is kept for local paths.
