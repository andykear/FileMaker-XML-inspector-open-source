import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOps, createDirectApi } from '../server/read.mjs';
import { createServer } from '../server/server.mjs';
import { isReadOnlyOp } from 'fm-adt-toolkit/read-only';

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

/** A request with headers `fetch` will not let us forge (Host above all). */
function raw(base, { method = 'GET', path = '/', headers = {}, body = null } = {}) {
  const { port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

test('a request for another Host is refused: DNS rebinding cannot reach the endpoints', async () => {
  const calls = [];
  await withServer({ cli, root: 'fmnet://localhost/ooe', username: 'admin', noPrompt: true, runOps: fakeRunOps(calls) }, async (base) => {
    const res = await raw(base, { path: '/api/context', headers: { host: 'evil.example:1234' } });
    assert.equal(res.status, 403);
    assert.equal(JSON.parse(res.text).error, 'host not allowed');

    const read = await raw(base, {
      method: 'POST', path: '/api/read', headers: { host: 'evil.example:1234', 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'fmnet://localhost/ooe', ops: [{ op: 'read:table' }] }),
    });
    assert.equal(read.status, 403);
    assert.equal(calls.length, 0, 'fm is never spawned for a foreign Host');

    const ours = await raw(base, { path: '/api/context', headers: { host: `localhost:${new URL(base).port}` } });
    assert.equal(ours.status, 200, 'our own loopback names are allowed');
  });
});

test('a POST carrying a foreign Origin is refused before fm', async () => {
  const calls = [];
  await withServer({ cli, root: 'fmnet://localhost/ooe', username: 'admin', noPrompt: true, runOps: fakeRunOps(calls) }, async (base) => {
    const res = await fetch(base + '/api/read', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: JSON.stringify({ target: 'fmnet://localhost/ooe', ops: [{ op: 'read:table' }] }),
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'origin not allowed');
    assert.equal(calls.length, 0);

    const ok = await fetch(base + '/api/read', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${new URL(base).port}` },
      body: JSON.stringify({ target: 'fmnet://localhost/ooe', ops: [{ op: 'read:table' }] }),
    });
    assert.equal(ok.status, 200, 'our own page\'s Origin is allowed');
    assert.equal(calls.length, 1);
  });
});

test('a POST that is not application/json is 415, so a cross-origin page needs a preflight it cannot get', async () => {
  const calls = [];
  await withServer({ cli, root: 'fmnet://localhost/ooe', username: 'admin', noPrompt: true, runOps: fakeRunOps(calls) }, async (base) => {
    const res = await fetch(base + '/api/read', {
      method: 'POST', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ target: 'fmnet://localhost/ooe', ops: [{ op: 'read:table' }] }),
    });
    assert.equal(res.status, 415);
    assert.equal((await res.json()).error, 'content-type must be application/json');
    assert.equal(calls.length, 0);
  });
});

test('POST /api/read with no ops is a 400 and never spawns fm', async () => {
  const calls = [];
  await withServer({ cli, root: 'fmnet://localhost/ooe', username: 'admin', noPrompt: true, runOps: fakeRunOps(calls) }, async (base) => {
    const res = await post(base, '/api/read', { target: 'fmnet://localhost/ooe', ops: [] });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'ops must not be empty');
    assert.equal(calls.length, 0);
  });
});

test('a .json file under the ui directory is served as its own bytes', async () => {
  const dir = fileURLToPath(new URL('./fixtures/static/', import.meta.url));
  await withServer({ cli, root: 'x', username: 'admin', noPrompt: true, uiDir: dir, runOps: fakeRunOps([]) }, async (base) => {
    const res = await fetch(base + '/sample.json');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);
    const text = await res.text();
    assert.equal(text, await readFile(join(dir, 'sample.json'), 'utf8'));
    assert.deepEqual(JSON.parse(text), { note: 'served by the static handler as bytes, not re-encoded', n: 3, list: [1, 2, 3] });
  });
});

test('the toolkit step-display module is served under /vendor', async () => {
  await withServer({ cli, root: 'x', username: 'admin', noPrompt: true, runOps: fakeRunOps([]) }, async (base) => {
    const res = await fetch(base + '/vendor/fm-adt-toolkit/step-display/index.js');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    assert.match(await res.text(), /stepDisplay/);
    const cat = await fetch(base + '/vendor/fm-adt-toolkit/catalogs/fm-step-display.js');
    assert.equal(cat.status, 200);
    const escape = await fetch(base + '/vendor/fm-adt-toolkit/../../package.json');
    assert.equal(escape.status, 404);
  });
});

test('GET /api/register serves the installed register, reduced', async () => {
  await withServer({ cli, root: 'fmnet://localhost/ooe', username: 'admin', noPrompt: true, runOps: fakeRunOps([]) }, async (base) => {
    const res = await fetch(base + '/api/register');
    assert.equal(res.status, 200);
    const text = await res.text();
    const entries = JSON.parse(text);
    assert.equal(entries.length, 302, 'the installed register, every entry');
    assert.ok(entries.some((e) => e.id.startsWith('theme')), 'the theme entry is there');
    // The summary drops what a page cannot use: evidence pointers and per-attribute reasons.
    assert.doesNotMatch(text, /"evidence"/);
    assert.doesNotMatch(text, /"attributeReasons"/);
    const one = entries.find((e) => e.id === 'account:amazon');
    assert.deepEqual(Object.keys(one.lastChecked), ['version', 'build', 'date']);
    assert.ok(one.attributes.every((a) => 'name' in a && 'path' in a && 'fmKey' in a && 'reported' in a && 'knownFrom' in a));
  });
});

test('POST /api/gaps/check runs the register\'s probes once, read-only, and reduces the outcome', async () => {
  const calls = [];
  await withServer({ cli, root: 'fmnet://localhost/ooe', username: 'admin', noPrompt: true, runOps: fakeRunOps(calls) }, async (base) => {
    const res = await post(base, '/api/gaps/check', { target: 'fmnet://localhost/ooe' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(calls.length, 1, 'one fm invocation for the whole register');
    assert.ok(calls[0].ops.length > 50, 'every distinct probe in the one batch');
    assert.ok(calls[0].ops.every(isReadOnlyOp), 'read-only ops only');
    assert.equal(body.entries, 302);
    for (const key of ['stillMissing', 'newlyReported', 'regressed', 'errored', 'erroredExpected', 'expectedResolved', 'unexplained', 'attributeErrors']) {
      assert.ok(Array.isArray(body[key]), key);
    }
    assert.equal(body.fmVersion, '0.6.0');
    assert.equal(typeof body.build, 'string');
    assert.match(body.ranAt, /^\d{4}-\d\d-\d\dT/);
    // Nothing is echoed back whole: an entry is an id, an attribute a name.
    assert.ok(body.errored.every((e) => typeof e.id === 'string' && !('attributes' in e)));
    assert.ok(body.stillMissing.every((m) => typeof m.id === 'string' && typeof m.attribute === 'string'));
  });
});

test('POST /api/gaps/check with no target is a 400 and never spawns fm', async () => {
  const calls = [];
  await withServer({ cli, root: 'fmnet://localhost/ooe', username: 'admin', noPrompt: true, runOps: fakeRunOps(calls) }, async (base) => {
    const res = await post(base, '/api/gaps/check', { target: 42 });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /target/);
    assert.equal(calls.length, 0);
  });
});
