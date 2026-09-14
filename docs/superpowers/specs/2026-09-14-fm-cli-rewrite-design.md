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

## 4. Coverage register and the intake loop

The register answers one question for Claris, per kind of object: **what does this object have that the fm read op for it does not report?** It is a coverage matrix, not a list of inspector features. Its unit is a *subject*: an fm read op plus a kind under it, because attributes differ by kind. A field layout object, a portal and a tab control share a read op and almost nothing else; a container field and a summary field have different option sets; every script step has its own options.

Subjects, by example: `read:layout · layout`, `read:layout · part`, `read:layout · object:field`, `read:layout · object:portal`, `read:layout · object:tabControl`, `read:layout · object:webViewer` and the other object types; `read:field · type:text`, `read:field · type:container`, `read:field · type:calculation`, `read:field · type:summary`; `read:script · script`, `read:script · step:Import Records` and every other step; `read:relation`, `read:tableOccurrence`, `read:valueList · type:field`, `read:customMenu · item`, `read:account`, and a pseudo-op `none` for objects fm has no read op for at all (File Options, themes and styles, plugins).

### Entry shape

`fm-adt-toolkit/gaps/register.json` holds one entry per subject:

```json
{
  "id": "layout-object-field",
  "op": "read:layout",
  "kind": "object:field",
  "probe": {
    "ops": [ { "op": "read:layout", "name": "File Open", "detail": true } ],
    "select": "contents.objects[type=field]"
  },
  "attributes": [
    { "name": "control style",          "knownFrom": "SaXML Field > Usage @type; Inspector > Data > Control style", "fmKey": "control", "reported": true },
    { "name": "named theme style",      "knownFrom": "SaXML LocalCSS @name; Inspector > Styles",                  "fmKey": "style",   "reported": true },
    { "name": "conditional formatting", "knownFrom": "SaXML ConditionalFormatting; Inspector > Conditional",       "fmKey": null,      "reported": false },
    { "name": "local style overrides",  "knownFrom": "SaXML LocalCSS body",                                        "fmKey": null,      "reported": false }
  ],
  "firstSeen": "0.6.0",
  "reportedToClaris": null,
  "lastChecked": { "version": "0.6.0", "build": "29816214", "date": "2026-09-14",
                   "command": "fm --file=... --keychain --no-prompt --abort-on-error=false --out=... ...",
                   "batch": { "size": 40, "position": 7 },
                   "evidence": "gaps/evidence/0.6.0/5f2a9c1e.ndjson",
                   "attributes": { "conditional formatting": "absent", "local style overrides": "absent" } },
  "blocks": [ { "app": "inspector", "feature": "conditional-formatting-check", "attribute": "conditional formatting" } ]
}
```

- `attributes` is the complete list of what the kind carries, reported or not. `knownFrom` names where the attribute is known to exist: the SaXML element or attribute in the Ooe export first, then the FileMaker Inspector or dialog that shows it. `fmKey` is the key fm reports it under, or `null`.
- `probe.ops` is one read op against the reference solution; `probe.select` picks the instance of the kind inside the result (a JSONPath-like `path[key=value]`, or a step name for scripts). Ooe supplies one instance of every kind; where it lacks one, the owner adds it, as was done for the secure-storage container.
- `fm-gaps check` runs every probe in one read-only invocation, selects the instance, and evaluates every attribute with `keyPresent` on its `fmKey` where one is expected and "any new key" detection otherwise: an attribute with `reported: false` whose `fmKey` is null passes only when a human names the new key, so the checker reports *unexplained new keys* on the instance as a separate list, which is how a closed gap first shows up on a new build. Outcomes are per attribute and land in `lastChecked.attributes`.
- `status` per attribute is derived: reported, missing, or wontfix (set by hand with a reason). There is no entry-level status.
- `blocks` is for the inspector's own intake loop and keys a feature to an attribute; the Claris report never shows it.

### Evidence

Evidence is mandatory and verbatim, stored once per distinct probe (decided 2026-09-14): `gaps/evidence/<version>/<probe-id>.ndjson` holds the command, the ops, every stdout and stderr line, and the exit code for that probe op; entries reference it. Nothing is summarised or trimmed. Evidence files are committed like the register; git history is the record of how each build behaved.

### The attribute reference

"What the object has" is enumerated, not remembered. The primary source is the Save as XML export of Ooe: for each kind, every element and attribute that appears under it, named by its SaXML path. The FileMaker help and the Inspector supply the human names. Andrew Kear's clipboard-format repos (Script XML, Layout XML, field/table/value list definitions) are a cross-check for kinds whose clipboard form is richer than SaXML. The inventory (`docs/saxml-inventory.md`) is a third input: its gap rows are attributes the legacy inspector consumed, so every one of them must appear in some entry's `attributes` with `reported: false`.

### Seeding and reconciliation

Plan 2's first task builds the matrix kind by kind: enumerate the kind's attributes from the Ooe export, read one instance through fm, mark each attribute reported or missing with its `fmKey`, and record evidence. The twelve entries seeded in Plan 1 fold into it (opaque step kinds become `read:script · step:<name>` entries whose every option is missing; the catalog-level gaps become `none` subjects or attribute rows on the kind they belong to). The inventory's 103 gap rows are the acceptance check: each must map to an attribute row.

### The intake loop per fm build

1. `fm-gaps check --file=<reference> --username=<account>` runs all probes, writes evidence and per-attribute outcomes, and prints: attributes still missing, **attributes newly reported** (with the `blocks` rows they unblock), unexplained new keys per instance (candidates for closing a gap once named), and errored probes. It never edits `attributes[].reported` or `fmKey` by itself; a human confirms a newly reported attribute by filling in `fmKey`.
2. `fm-gaps report` renders, per read op and kind, the attributes fm does not report, each with `knownFrom`, and inlines the evidence for that kind's instance so Claris sees fm's actual response next to the list of what is absent. Reported attributes are listed compactly so the reader sees coverage, not only gaps.
3. The inspector page runs the same probes at startup, evaluates the same checks, and its Gaps tab shows the matrix against the running fm version, flagging attributes that are reported live but still marked missing in the register. Every stubbed feature renders its note from the attribute it is keyed to, so the UI keeps no list of its own.

## 5. Inventory, porting order, testing

Inventory first. A script-assisted pass over `legacy/clockwork-inspector.html` produces `docs/saxml-inventory.md`: one row per XML element or attribute a `parseXxx` reads and per `s.<catalog>.<field>` a tab renders, each classified covered (fm catalog and key named), derived, gap, or dropped (a datum the new inspector does not need, by owner decision; not a gap, not reported to Claris). The owner reviews it before any tab is ported. Gap rows become attribute rows in the coverage register (section 4).

Porting order:

1. Extract the shared package; switch fm-ai to it; its tests green.
2. Inspector server, target resolution, discovery, model, read plan; smoke test on ooe.
3. Tabs: tables and fields; occurrences and relations with the graph; scripts with the shared renderer and step index; layouts with wireframe; security; remaining catalogs; then the derived analyses (unreferenced, broken references, risk, reference explorer); then exports and the Gaps tab.
4. Coverage register built kind by kind, `fm-gaps check` and `report` working against ooe.
5. Throwaway count cross-check: old inspector on ooe's SaXML export versus the new one on the live file. Mismatches are either gaps or bugs; resolve each, then discard the comparison.
6. Delete `legacy/` when every inventory row is covered, derived, dropped, or registered.

Testing:

- Shared package: vitest. Recorded NDJSON from the ooe probes as fixtures (results, notices, summary, fatal shapes as fm 0.6.0 emits them). The existing step-display corpus tests move as is.
- Inspector: `node --test`. Server: the read-only guard, target resolution, result parsing against the fixtures. Model and analyses: plain ESM modules run in Node against a recorded ooe solution fixture. One live smoke test gated on an environment variable, reads only.
- Every recorded fixture states the fm version it came from.

## Out of scope

Writing to any FileMaker file. Compare mode and saved reports (deferred). Any theme rendering until fm exposes styles. A packaged desktop app.
