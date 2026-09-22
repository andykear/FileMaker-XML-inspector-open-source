# Where the time goes in a live read

Measured 2026-09-22 against `fmnet://localhost/ooe` (two files: `ooe` and `BrojDva`), with
fm 0.8.0-beta.0 (29827611) on macOS, four FileMaker plug-ins installed. Every probe read-only.

The short version: **a full analysis runs 268 ops across 6 fm process spawns, and the ops are not
what costs the time.** Roughly 85–90 % of the wall clock is spent before fm has opened anything,
in a window that loads 108 MB of FileMaker plug-ins. The 268 ops themselves come to about 3
seconds of a ~59 s run.

One of those six spawns pays the full startup cost to discover that a file it was told about
cannot be opened, and returns no data at all.

## What an "invocation" means here

The inspector never talks to a long-lived service. `fm` is a batch program: you hand it an
ndjson file of ops and a `--file`, it runs them, writes results and exits. One **invocation** is
one execution of that program, and it always does all of this:

```
process start  →  scan plug-in dirs  →  load plug-ins  →  open --file  →  run the ops  →  write --out  →  exit
```

Nothing in that sequence is optional, and **fm** carries nothing from one invocation to the next:
each is a fresh process, with no session reuse and no in-process cache.

**The machine does cache, though, and that is a different thing** — see "Why cold and warm differ"
below. The two statements are easy to conflate and they are not in tension: fm keeps nothing; the
operating system keeps the plug-in binaries' pages after the first read.

`--file` names a FileMaker **database file** — a `.fmp12`, either a local path or, as here,
`fmnet://host/Name` for one hosted by FileMaker Server. Opening it means establishing a session
with the server and authenticating, not reading a file off disk.

### How many invocations a run actually costs

Counted by instrumenting every spawn in a live run, rather than inferred from the code. The rule:

| when | spawns | opens a file? |
|---|---|---|
| once at startup, to find the CLI | 1 (`--version`) | no |
| per **reachable** file | 2 — list, then describe | yes |
| per file that is **named but cannot be opened** | 1 — the list batch fails at open | attempts |
| per file already visited under another data-source name | **0** | — |
| per data source whose path cannot be resolved locally | **0** | — |

The two batches per reachable file cannot be merged: the describe batch's ops are *derived from*
the list batch's answers, so the second invocation cannot be written until the first has
returned. Two per reachable file is the floor.

For the reference solution that comes to **6 spawns, 5 of which open or try to open a file** —
not the four a two-file solution suggests:

| # | spawn | ops sent | outcome |
|---|---|---|---|
| 1 | `locateFmCli` probe | — | `--version`, ~0.7 s, no file |
| 2 | `ooe` list | 28 | ok |
| 3 | `ooe` describe | 169 | ok |
| 4 | **`Ooe_dev` list** | 28 | **`open_failed`, DBError 802 — full fixed cost, no data** |
| 5 | `BrojDva` list | 28 | ok |
| 6 | `BrojDva` describe | 43 | ok |

`ooe` names five FileMaker external data sources, and only two of them cost a spawn:

| source | path | outcome | spawn |
|---|---|---|---|
| `Ooe_dev` | `file:Ooe_dev` | cannot be opened | **yes, wasted** |
| `TestFile_dev2` | `file:Ooe_dev` | same target, already visited | no |
| `BrojDva` | `file:BrojDva` | read | yes, ×2 |
| `Self` | `file:Ooe` | resolves to `ooe` itself, already visited | no |
| `by_variable` | `$$referenced_file` | path is a variable, unresolvable without running the file | no |

The `visited` set in `ui/discovery.js` is what saves the two duplicates — a second referrer to a
target already read does not spawn fm again to be told the same thing. That dedup is worth ~24 s
on this solution.

Files are walked depth first: `ooe` is fully read, then each of its data sources is resolved and
walked in turn, which is why `Ooe_dev` is attempted before `BrojDva` is reached.

## How many ops the analysis actually does

Two numbers, because they differ:

| file | list batch | describe batch | ops that RAN |
|---|---|---|---|
| `ooe` | 28 | 169 | 197 |
| `BrojDva` | 28 | 43 | 71 |
| `Ooe_dev` | 28 sent | — | **0** — the invocation failed at open, so none executed |
| | | | **268 ran, 296 sent** |

Quote 268 for "how much work the analysis does" and 296 for "how much we ask fm to do", and say
which. The 28-op difference is the batch aimed at a file that cannot be opened.

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

`/usr/bin/time` on the same run: `real 15.31  user 1.54  sys 0.46`. **Only ~2 s of CPU** out of
15 s of wall clock. The cost is almost entirely *waiting*, not computing.

#### Why cold and warm differ, when fm caches nothing

These two facts look contradictory and are not:

- **fm carries nothing between invocations.** No session reuse, no in-process cache; each
  invocation is a fresh process that loads the plug-ins from scratch.
- **The same batch cost 17–30 s early in a measurement session and 11–16 s after several dozen
  invocations.** The decline is monotonic and reproducible: 29.81, 21.27, 17.42 … then settling
  at 11–16 s.

The caching is the **operating system's, not fm's**. fm asks for 108 MB of plug-in binaries; the
first invocation reads them from disk, and subsequent invocations get them from RAM. That is
consistent with the CPU split — 2 s of CPU in a 15 s run is what waiting on I/O looks like, and
what a compute-bound load would not look like.

**What I have not isolated:** which OS-level cache. The page cache is the obvious candidate, but
macOS also caches code-signature validation, and validating a signed 71 MB binary on first load
is not cheap either. Both would produce exactly this curve. Distinguishing them needs a cache
flush between runs (`purge`, which wants root) and was not attempted.

So quote the range and the state, never a single number: **cold 17–30 s, warm 11–16 s.** A user
who opens the inspector as the first FileMaker work of the day sees the cold figure. The
25 s I quoted from the branch work was a mid-warming sample and should not be used.

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

The reference solution, warm:

| | invocations | fixed | ops | total |
|---|---|---|---|---|
| locate the CLI | 1 | ~0.7 s | — | ~0.7 s |
| `ooe` list | 1 | ~12 s | 0.45 s | ~12 s |
| `ooe` describe | 1 | ~12 s | 2.2 s | ~14 s |
| **`Ooe_dev` list — fails at open** | 1 | ~10 s | **0** | **~10 s, no data** |
| `BrojDva` list | 1 | ~12 s | 0.45 s | ~12 s |
| `BrojDva` describe | 1 | ~12 s | 0.6 s | ~13 s |
| | **6** | **~59 s** | **~3.7 s** | **~59 s** |

Measured end to end, this walk took **58.9 s** warm — which is the row above, and confirms the
model. On a cold-ish cache the same walk took 101 s, with per-phase figures of
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

### The unreachable file costs a full invocation, and mostly cannot be avoided

`Ooe_dev` is named by two data sources, cannot be opened, and costs ~10 s of startup to find that
out — about a sixth of the run, for nothing. The honest position is that **you cannot know a file
is unopenable without trying**, so this is not waste in the sense of a bug.

Two things would reduce it, neither free:

- **Try it last.** The walk is depth first over the data-source list, so an unopenable file
  currently blocks the reachable one behind it. Reading the reachable files first would put a
  usable page up sooner and leave the failures to the end. It changes the order the read log
  reports, which is user-visible.
- **Ask more cheaply.** Nothing in fm's surface offers "can this be opened" without the full
  startup. If the target is a hosted file, FileMaker Server's own file list would answer it for
  the price of one query — but that is a different protocol and a dependency this tool does not
  have today.

What should *not* happen is caching the failure across runs. A file that was down five minutes ago
may be up now, and a tool that reports a stale "unreachable" is worse than one that takes ten
seconds to check.

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
