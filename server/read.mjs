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
