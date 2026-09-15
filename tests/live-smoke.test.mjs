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
