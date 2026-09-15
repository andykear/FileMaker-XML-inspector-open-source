import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { discover, readFile, siblingPaths, reread } from '../ui/discovery.js';
import { resolveTarget, targetKey } from '../server/targets.mjs';
import { createReplayApi } from './replay-api.mjs';
import { catalogCounts } from '../ui/model.js';
import { FILE_FACTS } from '../ui/read-plan.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/ooe/', import.meta.url));

function fakeApi(log = []) {
  const factValues = {}; // calculation -> value, so a test can make the facts change
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
      // The same root under four spellings: hosted names are case-insensitive,
      // so all four must fold onto the visited root and read nothing.
      externalDataSource: [
        { name: 'Back', id: 1, paths: ['file:ROOT'], sourceType: 'filemaker' },
        { name: 'BackAgain', id: 2, paths: ['file:Root'], sourceType: 'filemaker' },
        { name: 'BackLower', id: 3, paths: ['file:root'], sourceType: 'filemaker' },
        { name: 'BackAbsolute', id: 4, paths: ['fmnet://LOCALHOST/Root'], sourceType: 'filemaker' },
      ],
      table: [{ name: 'C', id: 1 }],
    },
  };
  const fatal = { code: 'open_failed', message: 'no such file', dbError: 802 };
  return {
    log,
    files,
    factValues,
    async context() { return { cli: { version: '0.6.0' }, root: 'fmnet://localhost/root', username: 'admin' }; },
    async read(target, ops) {
      log.push({ target, ops: ops.map((o) => o.op + (o.id ? ':' + o.id : o.table ? ':' + o.table : '')) });
      const f = files[target];
      if (!f) return { results: [], notices: [], summary: null, fatal, exitCode: 2 };
      const results = ops.map((op) => {
        if (op.op === 'evaluate:calculation') return { op: op.op, status: 'ok', result: { kind: 'calculation', value: factValues[op.calculation] ?? target.split('/').pop(), dataType: 'text' } };
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
  // Child names the root back as file:ROOT, file:Root, file:root and
  // fmnet://LOCALHOST/Root. The two reads above are the whole story only if
  // discovery's own key folds case the way server/targets.mjs does.
  const spellings = [
    'fmnet://localhost/root', 'fmnet://localhost/ROOT', 'fmnet://localhost/Root',
    'fmnet://LOCALHOST/Root', 'fmnet://LocalHost/rOOt',
  ];
  for (const t of spellings) assert.equal(targetKey(t), targetKey('fmnet://localhost/root'), `${t} is the same target`);
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

  // the fake's own script list grows between reads
  api.files['fmnet://localhost/root'].script = [{ id: 21, name: 'S', type: 'script' }, { id: 22, name: 'S2', type: 'script' }];
  await reread(api, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'script' });
  assert.deepEqual(api.log.at(-2).ops, ['read:script']);
  assert.deepEqual(api.log.at(-1).ops, ['read:script:21', 'read:script:22']);
  assert.deepEqual(s.files['fmnet://localhost/root'].catalogs.script.list, api.files['fmnet://localhost/root'].script);
  assert.deepEqual(Object.keys(s.files['fmnet://localhost/root'].catalogs.script.detailById).sort(), ['21', '22']);
  assert.equal(s.files['fmnet://localhost/root'].catalogs.script.detailById['21'].result.readCount, 3);

  await reread(api, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'field' });
  assert.deepEqual(api.log.at(-1).ops, ['read:field:A']);

  await reread(api, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'font' });
  assert.deepEqual(api.log.at(-1).ops, ['read:font']);

  const messages = [];
  const s3 = await reread(api, s, { kind: 'solution' }, { onProgress: (m) => messages.push(m) });
  assert.notEqual(s3, s);
  assert.deepEqual(Object.keys(s3.files).sort(), ['fmnet://localhost/Child', 'fmnet://localhost/root']);
  assert.ok(messages.length >= 2, 'solution-grain reread threads hooks through to discover');
});

test('reread of an unknown slot throws', async () => {
  const api = fakeApi();
  const s = await discover(api, 'fmnet://localhost/root');
  await assert.rejects(() => reread(api, s, { kind: 'catalog', target: 'nope', catalog: 'font' }), /nope/);
  await assert.rejects(() => reread(api, s, { kind: 'object', target: 'fmnet://localhost/root', catalog: 'script', key: '999' }), /999/);
});

test('reread throws fm\'s fatal at catalog, table/field and object grain, leaving those slots untouched', async () => {
  const api = fakeApi();
  const s = await discover(api, 'fmnet://localhost/root');
  const file = s.files['fmnet://localhost/root'];
  const beforeScript = structuredClone(file.catalogs.script);
  const beforeTable = structuredClone(file.catalogs.table);
  const beforeField = structuredClone(file.catalogs.field);

  const fatal = { code: 'open_failed', message: 'host gone' };
  const failingApi = { ...api, async read() { return { results: [], fatal }; } };

  await assert.rejects(
    () => reread(failingApi, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'script' }),
    (err) => {
      assert.equal(err.message, 'open_failed: host gone');
      assert.deepEqual(err.fatal, fatal);
      return true;
    },
  );
  assert.deepEqual(file.catalogs.script, beforeScript);

  await assert.rejects(
    () => reread(failingApi, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'table' }),
    /open_failed/,
  );
  assert.deepEqual(file.catalogs.table, beforeTable);
  assert.deepEqual(file.catalogs.field, beforeField);

  await assert.rejects(
    () => reread(failingApi, s, { kind: 'object', target: 'fmnet://localhost/root', catalog: 'script', key: '21' }),
    /open_failed/,
  );
  assert.deepEqual(file.catalogs.script, beforeScript);
});

test('reread of table or field re-reads the table list then field describes for it, dropping stale entries when the list shrinks and adding new ones when it grows', async () => {
  const api = fakeApi();
  const s = await discover(api, 'fmnet://localhost/root');
  const file = s.files['fmnet://localhost/root'];
  assert.deepEqual(Object.keys(file.catalogs.field.detailById), ['table:A']);

  api.files['fmnet://localhost/root'].table = [];
  await reread(api, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'table' });
  assert.deepEqual(file.catalogs.table.list, []);
  assert.deepEqual(file.catalogs.field.detailById, {});

  api.files['fmnet://localhost/root'].table = [{ name: 'B', id: 2 }];
  await reread(api, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'field' });
  assert.deepEqual(file.catalogs.table.list, [{ name: 'B', id: 2 }]);
  assert.deepEqual(Object.keys(file.catalogs.field.detailById), ['table:B']);
  assert.equal(file.catalogs.field.detailById['table:B'].result.items[0].table, 'B');
});

function fatalOnSecondBatchApi(fatal) {
  let calls = 0;
  return {
    async context() { return { cli: { version: '0.6.0' } }; },
    async read(target, ops) {
      calls += 1;
      if (calls === 1) {
        return {
          results: ops.map((op) => {
            if (op.op === 'evaluate:calculation') return { op: op.op, status: 'ok', result: { kind: 'calculation', value: 'root', dataType: 'text' } };
            const c = op.op.replace('read:', '');
            return { op: op.op, status: 'ok', result: { kind: c, items: c === 'table' ? [{ name: 'A', id: 1 }] : [] } };
          }),
        };
      }
      return { results: [], fatal };
    },
    async resolveTarget() { return { target: null, reason: 'n/a' }; },
  };
}

test('a fatal on the describe batch leaves no partial file: readFile returns {fatal}, discover marks it unreachable', async () => {
  const fatal = { code: 'describe_failed', message: 'boom' };

  const r = await readFile(fatalOnSecondBatchApi(fatal), 'fmnet://localhost/root');
  assert.deepEqual(r, { fatal });

  const s = await discover(fatalOnSecondBatchApi(fatal), 'fmnet://localhost/root');
  assert.deepEqual(s.files, {});
  assert.deepEqual(s.unreachable, [{ target: 'fmnet://localhost/root', from: null, via: null, error: fatal }]);
});

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
  assert.ok(!Object.keys(s.files).some((t) => t !== api.meta.root && t.toLowerCase() === api.meta.root.toLowerCase()), 'Self source did not re-read the root');
});

test('object and catalog re-read replay against the recorded ooe', async () => {
  const api = createReplayApi(FIXTURE);
  const s = await discover(api, api.meta.root);
  const root = s.files[api.meta.root];
  const scriptId = String(root.catalogs.script.list.find((i) => i.type === 'script').id);
  const before = root.catalogs.script.detailById[scriptId].readAt;
  const resultBefore = structuredClone(root.catalogs.script.detailById[scriptId].result);
  const keysBefore = Object.keys(root.catalogs.script.detailById);
  await new Promise((r) => setTimeout(r, 2));
  await reread(api, s, { kind: 'object', target: api.meta.root, catalog: 'script', key: scriptId });
  assert.notEqual(root.catalogs.script.detailById[scriptId].readAt, before);
  // The replay hands back the recorded line, so re-reading one script changes
  // when it was read and nothing else.
  assert.deepEqual(root.catalogs.script.detailById[scriptId].result, resultBefore);
  assert.deepEqual(Object.keys(root.catalogs.script.detailById), keysBefore);
  await reread(api, s, { kind: 'catalog', target: api.meta.root, catalog: 'valueList' });
  assert.equal(catalogCounts(root).valueList.described, root.catalogs.valueList.list.length);
});

test('reread at facts grain sends the eight Get() ops and replaces the facts and the name', async () => {
  const api = fakeApi();
  const s = await discover(api, 'fmnet://localhost/root');
  const file = s.files['fmnet://localhost/root'];
  assert.ok(!('facts' in file.catalogs), 'facts is a re-read grain, not a catalog in the model');
  assert.equal(file.facts['Get ( FileSize )'].value, 'root');
  const keysBefore = Object.keys(file.facts);

  api.factValues['Get ( FileSize )'] = '4096';
  api.factValues['Get ( FileName )'] = 'root_renamed';
  const same = await reread(api, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'facts' });
  assert.equal(same, s);
  assert.deepEqual(api.log.at(-1).ops, FILE_FACTS.map(() => 'evaluate:calculation'));
  assert.equal(file.facts['Get ( FileSize )'].value, '4096');
  assert.equal(file.name, 'root_renamed');
  assert.deepEqual(Object.keys(file.facts), keysBefore, 'every fact is asked again, none is dropped');
});

test('a fatal at facts grain leaves the facts and the name untouched', async () => {
  const api = fakeApi();
  const s = await discover(api, 'fmnet://localhost/root');
  const file = s.files['fmnet://localhost/root'];
  const factsBefore = structuredClone(file.facts);
  const fatal = { code: 'open_failed', message: 'host gone' };
  const failingApi = { ...api, async read() { return { results: [], fatal }; } };

  await assert.rejects(
    () => reread(failingApi, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'facts' }),
    (err) => {
      assert.deepEqual(err.fatal, fatal);
      return /open_failed/.test(err.message);
    },
  );
  assert.deepEqual(file.facts, factsBefore);
  assert.equal(file.name, 'root');
});

test('a fatal on the describe half of a catalog re-read leaves list and detailById exactly as they were', async () => {
  const api = fakeApi();
  const s = await discover(api, 'fmnet://localhost/root');
  const file = s.files['fmnet://localhost/root'];
  const slotRef = file.catalogs.script;
  const before = structuredClone(file.catalogs.script);

  // The list op succeeds, the describe batch that follows it fatals.
  const fatal = { code: 'open_failed', message: 'the host went away between batches' };
  let calls = 0;
  const flaky = {
    ...api,
    async read(target, ops) {
      calls += 1;
      return calls === 1 ? api.read(target, ops) : { results: [], notices: [], summary: null, fatal, exitCode: 2 };
    },
  };

  await assert.rejects(
    () => reread(flaky, s, { kind: 'catalog', target: 'fmnet://localhost/root', catalog: 'script' }),
    /open_failed/,
  );
  assert.equal(calls, 2, 'the list read happened, then the describe read fatalled');
  assert.equal(file.catalogs.script, slotRef, 'the staged catalog was never swapped in');
  assert.deepEqual(structuredClone(file.catalogs.script), before);
});

test('an object-grain re-read of one table\'s fields sends only that op and leaves its siblings alone', async () => {
  const api = fakeApi();
  api.files['fmnet://localhost/root'].table = [{ name: 'A', id: 1 }, { name: 'B', id: 2 }];
  const s = await discover(api, 'fmnet://localhost/root');
  const file = s.files['fmnet://localhost/root'];
  const keysBefore = Object.keys(file.catalogs.field.detailById);
  assert.deepEqual(keysBefore, ['table:A', 'table:B']);
  const siblingBefore = structuredClone(file.catalogs.field.detailById['table:B']);
  const logBefore = api.log.length;

  await reread(api, s, { kind: 'object', target: 'fmnet://localhost/root', catalog: 'field', key: 'table:A' });

  assert.equal(api.log.length, logBefore + 1, 'one batch, not a list plus describes');
  assert.deepEqual(api.log.at(-1), { target: 'fmnet://localhost/root', ops: ['read:field:A'] });
  assert.deepEqual(Object.keys(file.catalogs.field.detailById), keysBefore);
  assert.deepEqual(structuredClone(file.catalogs.field.detailById['table:B']), siblingBefore);
  assert.deepEqual(file.catalogs.field.detailById['table:A'].result.items, [{ name: 'f', table: 'A' }]);
});
