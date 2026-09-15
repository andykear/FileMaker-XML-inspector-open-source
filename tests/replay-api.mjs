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
