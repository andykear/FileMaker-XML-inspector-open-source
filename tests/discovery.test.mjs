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
