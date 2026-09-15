// The whole offline chain end to end: ui/discovery.js -> ui/api.js -> http ->
// server/server.mjs -> server/read.mjs, with only fm itself faked. Everything
// the page does crosses JSON here, so anything the server drops or reshapes on
// the way out (a fatal above all) fails a test instead of a live read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from '../server/server.mjs';
import { createApi } from '../ui/api.js';
import { discover } from '../ui/discovery.js';
import { catalogCounts } from '../ui/model.js';

const cli = { path: '/stub/fm', version: '0.6.0', contract: 3 };
const ROOT = 'fmnet://localhost/root';
const GONE = 'fmnet://localhost/Gone';

const FATAL = {
  code: 'open_failed',
  message: 'the host has no file named Gone',
  dbError: 802,
  suggestions: ['check the file is open on the host'],
};

const LISTS = {
  [ROOT]: {
    externalDataSource: [{ name: 'Gone', id: 1, paths: ['file:Gone'], sourceType: 'filemaker' }],
    table: [{ name: 'A', id: 1 }, { name: 'B', id: 2 }],
  },
};

/** Stands in for fm: lists from LISTS, a `{id, name}` describe for anything
 *  asked by id, one field per table, and the fatal for the missing sibling. */
function fakeRunOps(calls) {
  return async (cliArg, target, ops) => {
    calls.push({ target: target.file, ops });
    if (target.file === GONE) {
      return { ok: false, exitCode: 2, notices: [], stdout: '', stderr: '', argv: [], results: [], summary: null, fatal: FATAL };
    }
    const lists = LISTS[target.file] ?? {};
    const results = ops.map((op) => {
      if (op.op === 'evaluate:calculation') {
        const value = op.calculation === 'Get ( FileName )' ? 'root' : op.calculation;
        return { op: op.op, status: 'ok', result: { kind: 'calculation', value, dataType: 'text' } };
      }
      if (op.op === 'read:field') return { op: op.op, status: 'ok', result: { kind: 'field', items: [{ name: 'f1', table: op.table }] } };
      if ('id' in op) return { op: op.op, status: 'ok', result: { id: op.id, name: `described ${op.id}` } };
      const c = op.op.replace(/^read:/, '');
      return { op: op.op, status: 'ok', result: { kind: c, items: lists[c] ?? [] } };
    });
    return {
      ok: true, exitCode: 0, notices: [], stdout: '', stderr: '', argv: [],
      results,
      summary: { total: ops.length, ok: ops.length, errors: 0, dryRun: false, rolledBack: false },
    };
  };
}

async function withApi(fn) {
  const calls = [];
  const server = createServer({ cli, root: ROOT, username: 'admin', noPrompt: true, runOps: fakeRunOps(calls) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const api = createApi(`http://127.0.0.1:${server.address().port}`);
  try { await fn(api, calls); } finally { await new Promise((r) => server.close(r)); }
}

test('api.context carries the cli, root and account across http', async () => {
  await withApi(async (api) => {
    assert.deepEqual(await api.context(), { cli, root: ROOT, username: 'admin' });
  });
});

test('discover over http reads the root and describes every table', async () => {
  await withApi(async (api, calls) => {
    const s = await discover(api, ROOT);
    const file = s.files[ROOT];
    assert.ok(file, 'root file read');
    assert.equal(file.name, 'root');
    assert.equal(catalogCounts(file).field.described, 2);
    assert.deepEqual(Object.keys(file.catalogs.field.detailById).sort(), ['table:A', 'table:B']);
    assert.equal(file.facts['Get ( FileName )'].value, 'root');
    assert.deepEqual(calls.filter((c) => c.target === ROOT).length, 2, 'one list batch and one describe batch');
  });
});

test('an fm fatal round-trips through the server and api.js unchanged', async () => {
  await withApi(async (api) => {
    const s = await discover(api, ROOT);
    assert.equal(s.unreachable.length, 1);
    assert.equal(s.unreachable[0].target, GONE);
    assert.equal(s.unreachable[0].via, 'Gone');
    assert.equal(s.unreachable[0].error.code, FATAL.code);
    assert.deepEqual(s.unreachable[0].error, FATAL, 'dbError and suggestions survive the JSON trip');
  });
});

test('a write op is refused by the server and rejects in the page, before fm', async () => {
  await withApi(async (api, calls) => {
    await assert.rejects(() => api.read(ROOT, [{ op: 'create:table', name: 'x' }]), /create:table/);
    assert.ok(!calls.some((c) => c.ops.some((o) => o.op === 'create:table')), 'fm was never handed the write op');
  });
});

test('a non-JSON error response surfaces as the status, not a parse error', async () => {
  const bad = createHttpServer((req, res) => {
    res.writeHead(502, { 'content-type': 'text/html' });
    res.end('<html>bad gateway</html>');
  });
  await new Promise((r) => bad.listen(0, '127.0.0.1', r));
  try {
    const api = createApi(`http://127.0.0.1:${bad.address().port}`);
    await assert.rejects(() => api.read(ROOT, [{ op: 'read:table' }]), /^Error: \/api\/read failed with 502$/);
  } finally {
    await new Promise((r) => bad.close(r));
  }
});
