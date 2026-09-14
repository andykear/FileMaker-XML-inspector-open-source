# Inspector on the fm CLI: design

Date: 2026-09-14. Status: approved in conversation, pending written review.

## Goal

Replace the inspector's SaXML (Save a Copy as XML) parsing with live reads of a FileMaker file, or a solution of linked files, through the Claris Agentic Development Toolkit `fm` CLI (0.6.0 today, a new build roughly weekly). Keep the analysis and the visual layer the inspector is valued for. Share script rendering and fm plumbing with the fm-ai repo instead of duplicating it. Keep a machine-checkable register of what fm cannot read, so gaps go to Claris and closed gaps come back into the UI.

Principle stated by the owner: favour simplicity over abstraction. Gating and translation layers have caused false positives and negatives before.

## Decisions already made

| Decision | Choice |
|---|---|
| Runtime | Small local Node server that spawns `fm`, serves the page and a read API on localhost, opens the browser. |
| Shared code | New repo, working name `fm-adt-toolkit`, consumed by this repo and fm-ai. |
| Data model | The fm JSON output is the model. Tabs are ported onto it. No adapters into the old XML-derived structures. |
| Missing data | Dropped and recorded in the gap register. No SaXML fallback. |
| Multi-file | Follow each file's externalDataSource catalog. Reuse the root account with `--keychain --prompt`. Unreachable files are recorded, not fatal. |
| Safety net for "did we miss something" | A mechanical inventory of every datum the current code consumes, classified covered / derived / gap before porting. One throwaway count cross-check on the reference solution. |
| Reference solution | `fmnet://localhost/ooe`, account `admin`, one related file (`BrojDva`). Read only, always. |

## 1. Repos and the shared package

### fm-adt-toolkit (new repo)

Plain ESM TypeScript written in erasable syntax (no `enum`, `import type` only) so Node 22 runs the `.ts` source directly, which fm-ai already relies on. Zero runtime dependencies. Dev dependencies: typescript, vitest.

Entry points (package `exports`):

- `fm-adt-toolkit/runner` (Node only): `locateFmCli()`, `parseVersionBanner()`, `runOps(cli, target, ops, opts)`, `parseResultLines(stdout, stderr)`, the `Adt*` result types. Moved from fm-ai `src/main/adt/{locate,runner}.ts` and `src/shared/adt/types.ts`. `runOps` gains two options the inspector needs: `abortOnError: false` and an `opsFile` mode that writes the batch to a temp file and passes the path instead of stdin (fm's documented safe shape for large batches). The stdin mode stays for fm-ai.
- `fm-adt-toolkit/step-display` (browser safe): `stepDisplay(step)`, `stepDisplayText(step)`, `keyLabel()`, `renderStepFromCatalog()`, the `StepRendered` shape with its `gaps`, the catalog types, and the catalog data. Moved from fm-ai `src/shared/adt/step-display*.ts` and `src/catalogs/fm-step-display.json`. The catalog is emitted as a generated `.js` module next to the JSON so a browser can import it without a bundler. The `fm_scripts/` corpus and `scripts/derive-step-display.mjs`, `roundtrip-step-display.mjs`, `measure-step-flags.mjs` move with it, as do their tests and `docs/fm-step-display-backlog.md` and `docs/fm-step-flags-reference.md`.
- `fm-adt-toolkit/gaps`: the register, the check functions, and the `fm-gaps` CLI. Section 4.

### fm-ai changes

Delete the moved files, import from the package, keep everything else. Tests that exercised the moved code move with it. fm-ai's confirmed gaps (backlog section 5) and its 81 opaque step kinds (section 4.1) are seeded into the register.

### Consumption

`npm install github:soliantconsulting/fm-adt-toolkit#v<tag>` in both apps. `npm link` while iterating. A tag per fm build the package was verified against, so an app can say which fm version its catalog and register were measured on.

## 2. Inspector runtime

This repo becomes a small Node project, no bundler:

```
bin/inspector.mjs      entry, arg parsing, opens the browser
server/server.mjs      http server, static files, the three endpoints
server/targets.mjs     target normalisation and sibling resolution
ui/index.html          the page shell (styles carried over from the current file)
ui/*.js                ESM modules: model, discovery, indexes, analyses, tabs, gaps panel
legacy/clockwork-inspector.html   the current file, kept until parity is signed off
```

Start:

```
inspector --file=fmnet://localhost/ooe --username=admin [--port=0] [--no-open]
```

The server always spawns fm with `--username=<account> --keychain --prompt` (fm's own window asks for and offers to save the password), `--abort-on-error=false` (one refused key must not fail a read batch), `--out=<temp file>` (results are read from the file, notices and the summary from stderr), and the ops passed as a temp file path, not stdin. The server never takes a password on its command line or over HTTP.

Endpoints, JSON only, bound to 127.0.0.1:

- `GET /api/context` returns `{ cli: { path, version, contract, engine }, root, username }`.
- `POST /api/read` body `{ target, ops }` returns `{ results, notices, summary, fatal, exitCode }`. Any op that is not read-only is refused with 400 before fm is spawned. Read-only means `read:*`, plus `evaluate:calculation` and `validate:calculation`, which fm's own help guarantees never change a file ("a file's bytes are identical after evaluating"). The formulas the inspector evaluates are fixed strings in its own code, never user input. The check is the toolkit's `assertReadOnly`, shared with `fm-gaps check`; there is no other write path.
- `POST /api/resolve-target` body `{ from, path }` returns `{ target }` or `{ unresolvable, reason }`. `file:Name` resolves to a sibling of `from`: `fmnet://host/Name` for a hosted root, `<dir>/Name.fmp12` for a local one (existence checked). `$$variable`, `odbc:`, `filemac:`/`filewin:` absolute paths and anything else are `unresolvable` with the reason. No fm call.

The page owns the solution model and drives discovery:

1. Read the root file (section 3).
2. For every externalDataSource of type filemaker, and every occurrence whose `table.dataSource` names one, resolve the path list in order until one resolves.
3. Read each resolved target not yet visited; recurse. Visited set keyed on the resolved target string.
4. A target that fails to open (authentication declined, locked, not found) becomes an `unreachable` entry carrying fm's error object. It is shown in the Solution panel and counts as a gap in cross-file resolution, never as a fatal error.

Re-read works at three grains through one function `reread(slot)`. Each model slot stores the ops that produced it and when. Whole solution: rerun discovery. Catalog: rerun that file's ops for that catalog. Object: rerun that describe op. Every tab and detail pane carries the appropriate re-read control.

## 3. Model and read plan

```
solution = {
  root: target,
  cli: { version, contract, engine },
  files: { [target]: FileModel },
  unreachable: [ { target, from, error } ],
  readAt
}
FileModel = {
  target, name,
  catalogs: {
    table:              { list, detailById },
    field:              { byTable: { [tableName]: list } },   // read:field detail:true per table
    tableOccurrence:    { list, detailById },
    relation:           { list, detailById },
    layout:             { list, detailById },                 // detail:true per layout, objects included
    script:             { list, detailById },                 // body per script
    valueList, customFunction, account, privilegeSet, extendedPrivilege,
    customMenu, customMenuSet, externalDataSource, baseDirectory,
    persistentData, font, graphNote, authorization: { list, detailById? }
  }
}
```

Values are fm results verbatim. Nothing is renamed or reshaped on the way in.

File-level facts come from `evaluate:calculation` with `Get()` functions, since fm has no file catalog (verified 2026-09-14 on ooe): `Get ( FileName )`, `Get ( FilePath )`, `Get ( FileSize )`, `Get ( EncryptionState )`, `Get ( PersistentID )`, `Get ( FileLocaleElements )`, `Get ( HostName )`, `Get ( HostApplicationVersion )`. File Options (login mode, saved password, minimum version, hide checkboxes, startup layout, file-level script triggers) have no function and stay in the register. Two engine quirks: under the CLI engine `Get ( SystemVersion )` returns the string `Recover` and `Get ( ApplicationVersion )` returns `1.0`.

Read plan per file, two fm invocations:

1. Lists: the 18 `read:<catalog>` list ops (`flatten:true` for script and layout, `detail:true` for externalDataSource).
2. Describes derived from the lists: `read:field {table, detail:true}` per table; `read:layout {id, detail:true}` per layout; `read:script {id}` per script; `read:tableOccurrence {id}` per occurrence; `read:relation {id}` per relation; `read:valueList {id}`, `read:customFunction {id}`, `read:privilegeSet {id}`, `read:customMenu {id}`, `read:account {id}` per member. About 150 ops on ooe.

Derived views are plain functions in `ui/` over the model, computed after a read and recomputed after any re-read:

- Name and id index: occurrences by name, fields by `TO::field`, scripts, layouts, value lists, custom functions, across files.
- Reference scan: the calculation text of fields (auto-enter, validation, calc), script step values, layout object calculations (hide, tooltip, conditional formatting, placeholders, button actions), custom function bodies, value list sources, relation predicates. Ported from the current deep analysis, but the input is JSON strings not CDATA.
- Unreferenced fields, occurrences, scripts, layouts, value lists, custom functions; broken references; the reference explorer; the field risk score; the step index; the script call graph.

Script bodies render through the shared `stepDisplay(step)`, wrapped in HTML with line numbers and indentation from block extents. Each `StepRendered.gaps` entry is surfaced next to the step and aggregated on the Gaps tab.

### Feature disposition (initial; the inventory confirms it)

Kept: tables, fields, occurrences, relations and graph (node bounds from `graph.bounds`), layouts with wireframe (object bounds), scripts with step index and call graph, value lists, accounts and privilege sets and extended privileges, custom functions, custom menus and sets, external sources, base directories, persistent data, Markdown and Mermaid export.

New, cheap: fonts, graph notes, authorizations (file access pairings).

Dropped, registered: theme mood board and colour palette (no theme catalog; a layout carries only its theme name and an object its style name), file metadata (encryption, minimum version), DDR pre-rendered text index, bit flag catalogue, plugin catalog, modification hotspots (only layouts report `modified`), relation sort specs, the opaque step kinds.

Deferred, not dropped: compare mode (two solution snapshots can be diffed later since the model is JSON), saved report snapshot.

## 4. Gap register and the intake loop

`fm-adt-toolkit/gaps/register.json`, one entry per gap:

```json
{
  "id": "layout-theme-styles",
  "title": "Theme styles are not readable",
  "area": "catalog:layout",
  "description": "read:layout reports a theme name and per-object style names only; no style definitions.",
  "status": "open",
  "firstSeen": "0.6.0",
  "lastChecked": {
    "version": "0.6.0", "build": "29816214", "date": "2026-09-14", "outcome": "open",
    "command": "fm --file=fmnet://localhost/ooe --username=admin --keychain --no-prompt --abort-on-error=false --out=/tmp/fm-gaps-1.out.ndjson /tmp/fm-gaps-1.ops.ndjson",
    "ops": [ { "op": "read:layout", "id": 11, "detail": true } ],
    "batch": { "size": 11, "position": 7 },
    "evidence": "gaps/evidence/0.6.0/5f2a9c1e.ndjson"
  },
  "reportedToClaris": null,
  "blocks": [
    { "app": "inspector", "feature": "theme-moodboard", "where": "ui/tabs/themes.js" }
  ],
  "probe": {
    "target": "reference",
    "ops": [ { "op": "read:layout", "id": 11, "detail": true } ],
    "check": { "kind": "keyPresent", "path": "theme.styles" }
  }
}
```

Evidence is mandatory. `lastChecked.command` is the exact command line the checker ran, including the temp file paths it used, and `lastChecked.ops` is the exact NDJSON batch written to that ops file. `lastChecked.response` is fm's response verbatim: every stdout line and every stderr line as parsed JSON objects, in order, plus the exit code. Nothing is summarised or trimmed; a large result stays large, because the point is that Claris sees exactly what we saw. The checker overwrites this block on every run, and the git history is the record of how each gap behaved across builds. The `fm-gaps report` output includes the command and the response for every open entry.

**Evidence is stored once per distinct probe, not once per entry** (decided 2026-09-14). Many entries share one probe: every opaque step kind probes the same `read:script` on the one-of-everything script, whose result is about 230 KB, and storing it per entry made the register 3.3 MB for eleven entries and would make it about 19 MB for the 81 opaque kinds, rewritten on every weekly check. So `lastChecked.response` on an entry is replaced by `lastChecked.evidence`, the id of a file under `gaps/evidence/<version>/<probe-id>.ndjson` that holds the verbatim response for that probe op (stdout lines, stderr lines, exit code, and the command and ops that produced it). The probe id is a stable hash of the probe op. Evidence files are committed like the register. Nothing is summarised or trimmed: `fm-gaps report` inlines the referenced evidence under every open entry, so Claris still sees exactly what we saw. Entries keep their own `outcome`, `reason`, `version`, `build`, `date`, and `batch` position. The first task of Plan 2 makes this change together with the register reconciliation (one entry per inventory gap id and per opaque step kind).

`status` is `open`, `fixed`, or `wontfix`. `area` is `catalog:<name>`, `step:<step name>`, or `cli`. Check kinds, implemented as small functions in `gaps/checks.mjs`: `keyPresent`, `opAccepted`, `stepNotOpaque`, `valueEquals`. A gap that needs more gets a named function in the same file, not a new mechanism.

Seeded from: fm-ai's backlog (five confirmed gaps; one entry per opaque step kind), the inventory rows classified as gap, the refusals and "not reported" notes in `fm help --json --all`, and `unmodelledCount` or `unresolved` values observed on ooe.

The intake loop per fm build:

1. `fm-gaps check --file=<reference> --username=<account>` runs every probe in one read-only fm invocation, evaluates the checks, writes each entry's `lastChecked` with the command, ops, and verbatim response, prints three lists: still open, newly passing, errored. Newly passing entries print with their `blocks` rows, which is the to-do list for re-enabling features, pointing at the file where each is stubbed.
2. `fm-gaps report` renders the open entries as Markdown for Claris, grouped by area, each with its probe op and the observed output from the last check.
3. The inspector page runs the same probes against the connected root file at startup and evaluates the same check functions. Its Gaps tab shows every register entry with its registered status against the running fm version. A probe that passes live while the entry is still `open` is flagged "readable in this build, feature not yet enabled". Every stubbed feature renders its note from its register entry, so the UI never keeps its own list of what is missing. The direction register-to-HTML is therefore visible before anyone edits the register.

## 5. Inventory, porting order, testing

Inventory first. A script-assisted pass over `legacy/clockwork-inspector.html` produces `docs/saxml-inventory.md`: one row per XML element or attribute a `parseXxx` reads and per `s.<catalog>.<field>` a tab renders, each classified covered (fm catalog and key named), derived, gap, or dropped (a datum the new inspector does not need, by owner decision; not a gap, not reported to Claris). The owner reviews it before any tab is ported. Gap rows become register entries.

Porting order:

1. Extract the shared package; switch fm-ai to it; its tests green.
2. Inspector server, target resolution, discovery, model, read plan; smoke test on ooe.
3. Tabs: tables and fields; occurrences and relations with the graph; scripts with the shared renderer and step index; layouts with wireframe; security; remaining catalogs; then the derived analyses (unreferenced, broken references, risk, reference explorer); then exports and the Gaps tab.
4. Register seeded, `fm-gaps check` and `report` working against ooe.
5. Throwaway count cross-check: old inspector on ooe's SaXML export versus the new one on the live file. Mismatches are either gaps or bugs; resolve each, then discard the comparison.
6. Delete `legacy/` when every inventory row is covered, derived, dropped, or registered.

Testing:

- Shared package: vitest. Recorded NDJSON from the ooe probes as fixtures (results, notices, summary, fatal shapes as fm 0.6.0 emits them). The existing step-display corpus tests move as is.
- Inspector: `node --test`. Server: the read-only guard, target resolution, result parsing against the fixtures. Model and analyses: plain ESM modules run in Node against a recorded ooe solution fixture. One live smoke test gated on an environment variable, reads only.
- Every recorded fixture states the fm version it came from.

## Out of scope

Writing to any FileMaker file. Compare mode and saved reports (deferred). Any theme rendering until fm exposes styles. A packaged desktop app.
