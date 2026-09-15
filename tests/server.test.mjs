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

test('a malformed URL encoding answers 4xx and does not take the server down', async () => {
  await withServer({ cli, root: 'x', username: 'admin', noPrompt: true, runOps: fakeRunOps([]) }, async (base) => {
    const bad = await fetch(base + '/%');
    assert.ok(bad.status >= 400 && bad.status < 500);
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
  });
});

test('POST /api/read with an invalid JSON body is a 400, not a 500, and never reaches fm', async () => {
  const calls = [];
  await withServer({ cli, root: 'fmnet://localhost/ooe', username: 'admin', noPrompt: true, runOps: fakeRunOps(calls) }, async (base) => {
    const res = await fetch(base + '/api/read', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json{{',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'body is not valid JSON');
    assert.equal(calls.length, 0);
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
