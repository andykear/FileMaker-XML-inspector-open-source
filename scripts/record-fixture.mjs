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
