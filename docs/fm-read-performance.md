# Where the time goes in a live read

Measured 2026-09-22 against `fmnet://localhost/ooe` (two files: `ooe` and `BrojDva`), with
fm 0.8.0-beta.0 (29827611) on macOS, four FileMaker plug-ins installed. Every probe read-only.

The short version: **a full analysis is 268 ops across 4 fm invocations, and the ops are not
what costs the time.** Roughly 85–90% of the wall clock is spent before fm has opened anything,
in a window that loads 108 MB of FileMaker plug-ins. The 268 ops themselves come to about 3
seconds.

## What an "invocation" means here

The inspector never talks to a long-lived service. `fm` is a batch program: you hand it an
ndjson file of ops and a `--file`, it runs them, writes results and exits. One **invocation** is
one execution of that program, and it always does all of this:

```
process start  →  scan plug-in dirs  →  load plug-ins  →  open --file  →  run the ops  →  write --out  →  exit
```

Nothing in that sequence is optional or cached between invocations, because there is no
between: each invocation is a fresh process.

`--file` names a FileMaker **database file** — a `.fmp12`, either a local path or, as here,
`fmnet://host/Name` for one hosted by FileMaker Server. Opening it means establishing a session
with the server and authenticating, not reading a file off disk.

The inspector's `ui/discovery.js` spawns **two invocations per file**:

1. the **list batch** — every catalog's membership, plus the file-level facts
2. the **describe batch** — one op per object found in step 1

They cannot be merged: the describe batch's ops are *derived from* the list batch's answers, so
the second invocation cannot be written until the first has returned. Two per file is the floor.

Files are walked depth first: `ooe` is fully read, then its external data sources are resolved
and `BrojDva` is fully read. So a two-file solution is four invocations, run sequentially.

## How many ops the analysis actually does

| file | list batch | describe batch | total |
|---|---|---|---|
| `ooe` | 28 | 169 | 197 |
| `BrojDva` | 28 | 43 | 71 |
| | | | **268 ops** |

The list batch is the same 28 ops for every file: **19** `read:<catalog>` ops, one
`read:fileOptions`, and **8** `evaluate:calculation` ops for the `Get()` facts.

The describe batch is one op per object. For `ooe`: script 41, customMenu 25, tableOccurrence
24, layout 18, field 14 (one per table, not per field), account 13, relation 10,
customFunction 9, valueList 8, privilegeSet 7.

## The cost model

Two numbers, measured separately, explain every timing in this document.

### Fixed cost per invocation: 11–16 s warm, up to 30 s cold

Timestamping each output line against process start, three consecutive runs of a batch
containing **one trivial op** (`evaluate:calculation` of `1`, 108 bytes of output):

| run | `plugins` line emitted | `summary` emitted | process exit |
|---|---|---|---|
| 1 | +12.35 s | +12.54 s | +13.48 s |
| 2 | +10.84 s | +11.97 s | +13.79 s |
| 3 | +9.48 s | +9.78 s | +11.02 s |

The window **before** the `plugins` line — process start, the plug-in directory scan, and
loading the plug-ins — is **9.5–12.4 s**. Everything after it, which is opening the hosted file,
running the op, writing the output and exiting, is **1–4 s**.

`/usr/bin/time` on the same run: `real 15.31  user 1.54  sys 0.46`. **Only ~2 s of CPU.** The
rest is waiting, which is why this cost is so sensitive to the OS page cache: early in a session
the same batch took 17–30 s, and after several dozen invocations it settles at 11–16 s. Both
figures are real; which one a user sees depends on whether the plug-in binaries are already in
cache. Quote the range, not a single number.

### Marginal cost per op: 13–16 ms

Single batches cannot measure this — a 28-op batch and a 1-op batch differ by less than the
run-to-run variance. Repeating the real batches until the signal clears the noise:

| batch | wall clock | output | marginal | per op |
|---|---|---|---|---|
| baseline, 1 trivial op | 28.26 s / 21.97 s | 108 B | — | — |
| 845 describes (the real 169 × 5) | 35.82 s | **12.9 MB** | +10.7 s | **12.7 ms** |
| 280 list ops (the real 28 × 10) | 29.67 s | 4.0 MB | +4.6 s | **16 ms** |

Throughput is roughly **1.2 MB/s** of JSON. Applied to the real workload:

- all 28 list ops ≈ **0.45 s**
- all 169 describes ≈ **2.2 s**
- **all 268 ops of the whole analysis ≈ 3 s**

## Putting it together

A two-file analysis, warm:

| | invocations | fixed | ops | total |
|---|---|---|---|---|
| `ooe` list | 1 | ~13 s | 0.45 s | ~13 s |
| `ooe` describe | 1 | ~13 s | 2.2 s | ~15 s |
| `BrojDva` list | 1 | ~13 s | 0.45 s | ~13 s |
| `BrojDva` describe | 1 | ~13 s | 0.6 s | ~14 s |
| | **4** | **~52 s** | **~3.7 s** | **~55 s** |

Measured end to end on a cold-ish cache the same walk took 101 s, with per-phase figures of
37.2 / 19.8 / 14.7 / 14.7 s. Those four numbers look like structure — as though listing were
twice the work of describing — and they are not. They are four samples of the same fixed cost
fluctuating with cache state, plus one to two seconds of actual work each. **`describe` is not
fast; it is free.** 169 ops returning 2.6 MB add about two seconds to a floor of eleven or more.

## Per-catalog breakdown

Time per catalog is **below the measurement floor**. At 16 ms an op, no single catalog is
separable from several seconds of startup jitter: asked to isolate the heaviest one, the full
list batch *with* the 370 KB theme op (23.61 s) came back faster than the same batch *without*
it (24.14 s). There is no honest per-catalog time table to publish.

What is exact and reproducible is the volume. **`SHARE OF BYTES`** below is each op's fraction of
the list batch's total response, measured from one real batch:

| op | bytes | items | share of bytes | derived time @ 1.2 MB/s |
|---|---|---|---|---|
| `read:theme detail` | 369,930 | 3 | **92.1 %** | ~0.31 s |
| `read:script flatten` | 5,775 | 50 | 1.4 % | ~0.02 s |
| `read:layout flatten` | 4,337 | 23 | 1.1 % | ~0.02 s |
| `read:tableOccurrence` | 2,835 | 24 | 0.7 % | ~0.02 s |
| `read:relation` | 2,303 | 10 | 0.6 % | ~0.02 s |
| `read:customFunction flatten` | 1,418 | 12 | 0.4 % | ~0.02 s |
| `read:authorization` | 1,238 | 5 | 0.3 % | ~0.02 s |
| `read:customMenu` | 1,209 | 25 | 0.3 % | ~0.02 s |
| `read:font` | 1,174 | 13 | 0.3 % | ~0.02 s |
| `read:fileOptions` | 1,097 | 1 | 0.3 % | ~0.02 s |
| `read:externalDataSource detail` | 796 | 7 | 0.2 % | ~0.02 s |
| `read:graphNote` | 783 | 2 | 0.2 % | ~0.02 s |
| `read:account` | 768 | 13 | 0.2 % | ~0.02 s |
| `read:persistentData` | 751 | 5 | 0.2 % | ~0.02 s |
| `read:table` | 736 | 14 | 0.2 % | ~0.02 s |
| `read:extendedPrivilege` | 648 | 12 | 0.2 % | ~0.02 s |
| `read:baseDirectory` | 617 | 5 | 0.2 % | ~0.02 s |
| `read:valueList` | 513 | 8 | 0.1 % | ~0.02 s |
| `read:privilegeSet` | 452 | 7 | 0.1 % | ~0.02 s |
| `read:customMenuSet` | 311 | 3 | 0.1 % | ~0.02 s |
| 8 × `evaluate:calculation` (facts) | 3,817 | 8 | 1.0 % | ~0.13 s |
| **total** | **401,508** | | | **~0.7 s** |

One op dominates the data: `read:theme detail` is 92 % of it, because `detail:true` returns each
theme's whole stylesheet as CSS text. It still only costs about a third of a second.

## The plug-ins

Every invocation scans two directories and loads whatever it finds:

| plug-in | size |
|---|---|
| `MBS.fmplugin` | **71 MB** |
| `BaseElements.fmplugin` | 27 MB |
| `2empowerFM.fmplugin` | 8.0 MB |
| `2empowerFM_Developer_Assistant.fmplugin` | 2.5 MB |
| | **~108 MB** |

`fm --help` lists no flag to skip them. The load is unconditional.

### Scan or load? An honest limit on this measurement

The 9.5–12.4 s window contains process start, the directory scan **and** the load, and fm emits
no output line between them — so **this measurement cannot separate scan from load.** The
attribution to loading is inference, not measurement, resting on two things: a scan of two
directories is a pair of directory listings, which cannot plausibly take seconds; and the CPU
split (`user 1.54  sys 0.46` of a 15 s run) is what reading 108 MB from disk looks like, not what
enumerating two directories looks like. Separating them properly needs either a flag fm does not
have or moving the plug-in files, which is not ours to do.

### The "nonexistent file" test, and what it was for

Pointing fm at `fmnet://localhost/NoSuchFile_zzz` — a name the server does not host — it still
emitted the full `plugins` line naming all four, and only then failed with
`open_failed (DBError 20604)`:

| | real | user | sys |
|---|---|---|---|
| failed open | **10.08 s** | 1.38 s | 0.40 s |
| real open | **15.86 s** | 1.58 s | 0.47 s |

The point is the ordering, not the difference: the cost is paid **before fm knows whether the
file exists**, so it cannot be attributed to reading or opening the database. Opening the real
database adds about 5 s on top, which is FileMaker Server session setup and authentication.

### What loading them actually buys — and why removing them is the wrong fix

Probed live with `validate:calculation` and the new `references: true`:

| formula | `valid` | `references` |
|---|---|---|
| `BE_Version` | **true** | **`[]`** |
| `MBS( "Menubar.Install" )` | **true** | **`[]`** |
| `Contacts::Name & BE_Version` | true | only the field — not the plug-in call |
| `NoSuchPluginFn_zzz( 1 )` | **false** | `calc_unknown_function` (engine 1208) |

So loading a plug-in makes its functions **resolve as valid**. It does **not** make fm report
them as references: a formula calling `BE_Version` validates and still returns `references: []`,
which is why `plugin-call-sites` remains an open gap in the register.

That last row is the reason **"move the plug-ins out" and "add a `--no-plugins` flag" are both
bad answers.** Without the plug-ins loaded, every plug-in call in the solution becomes
`calc_unknown_function` — a formula that is perfectly correct in production would be reported as
invalid. To anyone reading the output that is indistinguishable from broken code and technical
debt, and it would be manufactured entirely by our own read strategy. A findings list that cries
wolf is worse than a slow one.

Note also that these are the user's own FileMaker Pro extension folders. Emptying them breaks
FileMaker Pro itself, not just this tool.

**The right ask is upstream, and it is narrower than a kill switch:** load plug-ins *lazily*,
when the calculation engine first has to resolve a function it does not recognise. Of the 268 ops
in a full analysis, **none needs a plug-in** — 252 are `read:*`, which return stored bytes, and
16 are `evaluate:calculation` of `Get()` built-ins (8 per file). A batch that never asks the engine to resolve
an unknown function should never pay 10 seconds to prepare for the possibility. The Gaps tab's
live check is the one place that *does* send `validate:calculation`, and it is exactly the place
that should trigger the load.

## Optimisations

### The fixed cost inverts the usual advice: fine-grained lazy loading makes it worse

The instinct is to defer work per tab. Here that is actively harmful. Splitting the 169
describes into per-tab batches would turn one invocation into six or seven, each paying 11–16 s
of startup to save ~0.3 s of ops. **Any optimisation that increases the number of invocations
loses.** The only sensible unit of laziness is a whole batch.

### What the first useful screen actually needs

The list batch alone yields every catalog's membership — table, layout, script, account,
privilege-set, menu, value-list and occurrence *names* — plus the file facts and File Options.
That is enough to render:

- the **Solution** tab in full (facts, File Options, catalog counts)
- every list-shaped tab's list: Tables, Layouts, Scripts, Catalogs, Security, Themes

The describe batch is what adds the *contents*: script bodies, layout objects, field options,
relation predicates. Those are needed by the detail panes and by all five analyses (`refs`,
`unreferenced`, `broken`, `scripts`, `globals`), so the Analysis, Explorer and Graph tabs need it.

### Why the user currently waits for everything, and the change worth making

`ui/discovery.js` awaits both batches for a file, then walks its siblings depth first, and only
when the whole walk resolves does `ui/app.js` render. The read log shows progress, but no tab is
usable until the last op of the last file lands.

Nothing forces that. **Render after each file's list batch and let the describe batch fill in
behind it.** The model already supports it: each catalog slot carries its own `readAt`, the tabs
already render a slot that has a list and no details, and the memo recomputes when
`detailById` is replaced. On this solution that puts a usable page up in ~13 s instead of ~55 s,
without adding a single invocation. What it costs is a UI contract: a tab must show clearly that
detail is still arriving, and an analysis must refuse to answer rather than answer from half a
model — an analysis that quietly reports "37 unreferenced scripts" from an incomplete read is
worse than one that says "still reading".

### Read sibling files concurrently

Four sequential invocations at ~13 s is ~52 s; two files read concurrently is ~26 s. Different
files are different `--file` targets and different sessions, so there is no obvious reason it
cannot work.

**One caveat from evidence, not theory:** while measuring for this document I accidentally ran two
fm processes against the same hosted file at once, and nine of the concurrent runs produced an
empty `--out` and returned in 11–15 s — they loaded plug-ins, failed, and wrote nothing. Whatever
that contention is, it is real and it is silent. Concurrency across *distinct* files may well be
safe, but it needs a deliberate spike with failure injection before it goes near the read path.

### Smaller things

- `read:theme detail` is 92 % of the list batch's bytes and only the Themes tab needs the
  stylesheet. Moving it to the describe batch costs nothing and shrinks the first payload by an
  order of magnitude. Worth doing when the split above lands, not before.
- Nothing in the per-op cost justifies pruning ops. At 13–16 ms, dropping a catalog from the
  list batch saves less time than the variance in measuring it.

## Method, and what would change these numbers

- Timings are wall clock around one `fm` process, with `/usr/bin/time` for the CPU split and
  output-line timestamps for the internal breakdown.
- Per-op figures come from repeating the real batches (5× and 10×) so the marginal cost clears
  the startup noise; single batches cannot resolve it.
- The fixed cost is I/O-bound and therefore cache-sensitive. Cold: 17–30 s. Warm: 11–16 s. A
  machine with fewer or smaller plug-ins installed will see a different fixed cost, and that
  variable dominates everything else in this document.
- All measurements are one host, one solution, one plug-in set. The *shape* of the finding — a
  large fixed cost per invocation, negligible per-op cost — should generalise; the magnitudes
  will not.
