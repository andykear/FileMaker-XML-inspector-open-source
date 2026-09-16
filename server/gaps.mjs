// The toolkit's coverage register, read for the page and checked against the running fm.
//
// The register is the toolkit's, never this app's: it is read from the installed
// package and nothing here ever writes it back. `runLiveCheck` runs its ~75 distinct
// probes through readOps, so the read-only guard applies to them exactly as it does
// to the page's own reads, and reduces the checker's outcome to ids and attribute
// names -- a page has no use for 302 entries echoed back at it.
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { loadRegister, runChecks } from 'fm-adt-toolkit/gaps';
import { readOps } from './read.mjs';

const execFileAsync = promisify(execFile);

export function registerPath() {
  const pkg = createRequire(import.meta.url).resolve('fm-adt-toolkit/package.json');
  return join(dirname(pkg), 'gaps', 'register.json');
}

/** What a page can use of one attribute. `knownFrom` stays: it is the sentence that
 *  says where the fact was known from, and it is the whole point of the column. */
const attributeSummary = (a) => ({
  name: a.name,
  path: a.path,
  fmKey: a.fmKey ?? null,
  reported: a.reported === true,
  ...(a.wontfix ? { wontfix: a.wontfix } : {}),
  knownFrom: a.knownFrom ?? '',
});

/** The register with every entry reduced. What is dropped is what only the toolkit's
 *  own reporter reads: the evidence pointers, the per-attribute evidence and reasons,
 *  the key lists, `blocks`, `firstSeen`. 4.73 MB of register becomes 3.28 MB, nearly
 *  all of it `knownFrom` prose, which is the part a reader is actually here for. */
export function loadRegisterSummary(path = registerPath()) {
  return loadRegister(path).map((e) => ({
    id: e.id,
    op: e.op,
    kind: e.kind,
    probe: e.probe,
    attributes: (e.attributes ?? []).map(attributeSummary),
    ...(e.expectedError ? { expectedError: e.expectedError } : {}),
    lastChecked: e.lastChecked
      ? { version: e.lastChecked.version, build: e.lastChecked.build, date: e.lastChecked.date }
      : null,
  }));
}

/** fm's build number, from the `0.7.0 (29823677)` banner `--version` prints. The
 *  register is keyed on version AND build -- two builds of one version answer
 *  differently often enough that the pair is the identity -- but `locateFmCli` keeps
 *  only the version, so it is asked for here. Once per fm path per process: the
 *  answer cannot change while that binary sits still, and a check must not pay for
 *  a spawn it already made. */
const buildCache = new Map();
export async function fmBuild(cli, exec = execFileAsync) {
  if (!cli?.path) return 'unknown';
  if (!buildCache.has(cli.path)) {
    buildCache.set(cli.path, exec(cli.path, ['--version'], { timeout: 10_000 })
      .then(({ stdout }) => String(stdout).match(/\(([0-9A-Za-z]+)\)/)?.[1] ?? 'unknown')
      .catch(() => 'unknown'));
  }
  return buildCache.get(cli.path);
}

/** readOps' answer as the checker's `AdtRunResult`. The raw streams stay on the
 *  server (see read.mjs), so `stdout`/`stderr` are empty here rather than absent:
 *  the checker parses stderr for the evidence it writes and would throw on undefined. */
const asRunResult = (r) => ({
  ...r,
  ok: r.exitCode === 0 && !!r.summary && !r.summary.rolledBack,
  stdout: '',
  stderr: '',
});

const entryRef = (e) => ({ id: e.id, ...(e.lastChecked?.reason ? { reason: e.lastChecked.reason } : {}) });
const pairRef = ({ entry, attribute }) => ({ id: entry.id, attribute: attribute.name });

function reduceOutcome(outcome, meta) {
  const errored = outcome.errored.map(entryRef);
  const erroredExpected = outcome.erroredExpected.map(entryRef);
  return {
    entries: outcome.entries.length,
    stillMissing: outcome.stillMissing.map(pairRef),
    newlyReported: outcome.newlyReported.map(pairRef),
    regressed: outcome.regressed.map(pairRef),
    attributeErrors: outcome.attributeErrors.map((a) => ({ id: a.entry.id, attribute: a.attribute.name, reason: a.reason })),
    unexplained: outcome.unexplained.map((u) => ({ id: u.entry.id, keys: u.keys })),
    errored,
    erroredExpected,
    expectedResolved: outcome.expectedResolved.map((e) => ({ id: e.id, expectedError: e.expectedError })),
    // How many entries could not be scored at all this run, either way. Against a
    // solution that is not the reference one nearly every entry lands here -- the
    // register's probes address the reference solution BY ID, so a refused probe
    // (`probe refused: <code>`) and a selector that matched nothing are the same
    // fact: no such object here. Counted rather than read out of the reason text,
    // which is the toolkit's prose and not a contract.
    probeFailures: errored.length + erroredExpected.length,
    ...(outcome.fatal ? { fatal: outcome.fatal } : {}),
    fmVersion: meta.version,
    build: meta.build,
    ranAt: meta.ranAt,
  };
}

/** Run every probe the register names against one live file.
 *
 *  `meta.root` is a throwaway directory, and that is deliberate: `runChecks` writes
 *  one evidence file per probe unconditionally, and the inspector is a reader -- it
 *  must not leave a trail in the toolkit's own evidence tree, where a later
 *  `fm-gaps report` would read it back as the owner's measurement of a solution it
 *  never saw. The directory is removed whether the check succeeds or throws. */
export async function runLiveCheck(ctx, target, { registerFile = registerPath() } = {}) {
  const entries = loadRegister(registerFile);
  const now = new Date();
  const meta = {
    version: ctx.cli?.version ?? 'unknown',
    build: ctx.fmBuild ?? (await fmBuild(ctx.cli)),
    date: now.toISOString().slice(0, 10),
    ranAt: now.toISOString(),
  };
  const root = await mkdtemp(join(tmpdir(), 'inspector-gaps-'));
  try {
    const outcome = await runChecks(entries, async (ops) => asRunResult(await readOps(ctx, target, ops)), {
      ...meta, root, commandFor: (argv) => ['fm', ...argv].join(' '),
    });
    return reduceOutcome(outcome, meta);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
