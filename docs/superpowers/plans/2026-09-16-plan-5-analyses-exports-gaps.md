# Plan 5: Analyses, Exports, the Gaps Tab, and Retiring the Legacy File

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the rewrite. Build the derived analyses on the Plan 3 model (reference index and scanner, unreferenced objects with confidence, broken references, the reference explorer, script issue checks, the call graph, global variables), the Markdown, Mermaid and JSON exports, the Gaps tab fed by the toolkit's register and by the step renderer, then run the one throwaway count cross-check of the legacy inspector against the new one on ooe, resolve every mismatch, and delete `legacy/`.

**Architecture:** Analyses are pure modules in `ui/analysis/` computing from the solution model and memoised per solution: `refs.js` builds the name indexes and one reference list (every place any object names another, structured or in calculation text), and everything else (`unreferenced.js`, `broken.js`, `scripts.js`, `globals.js`) is a small function over that list. Two new tabs render them (Analysis, Reference Explorer) plus a Gaps tab. Exports are pure functions to strings, downloaded in the page through a Blob. The server gains two endpoints for the Gaps tab: the register, and a live check that runs the toolkit's `runChecks` through the same read-only guard. The cross-check is a throwaway script under `scripts/` that runs the legacy parser under jsdom on the read-only Ooe SaXML export and diffs its stats against the new model's counts; its findings live in one dated doc.

**Tech Stack:** As Plan 4. `jsdom` as a devDependency only for the throwaway cross-check script (removed with the script in the last task). Toolkit v0.5.1: `gaps` (Node, server side: `loadRegister`, `runChecks`), `gaps/checks` (browser safe), `step-display` (`renderStepFromCatalog`, `catalogEntry`, `stepConventions`, `CATALOG` for renderer gaps).

**Spec:** `docs/superpowers/specs/2026-09-14-fm-cli-rewrite-design.md` §3 derived views, §4.3 item 3 (Gaps tab), §5 porting steps 3 (analyses, exports, Gaps tab), 5 (cross-check), 6 (delete legacy). Parity checklist: `docs/saxml-inventory.md` render rows for `s.unrefs`, `s.deep`, `s.globals`, `s.tags`, and the `parseUnreferenced`/`parseDeepAnalysis` rows; gap rows stay with the register.

## Global Constraints

- All of Plan 4's constraints hold: `ui/` imports nothing from `node:`/`server/`; analyses and tabs are pure; every model string through `esc`; every fm key through `get`/`path`; totals solution-wide; selection raw in `data-select`; a test never asserts `rows.length === catalog.list.length`.
- An analysis never guesses at fm's spelling: structured references come from named keys fm reports (`script`, `layout`, `field.name`, `tableOccurrence.name`, `target`, `valueList`, …) read through `get`; text references come from one tokeniser over every string value of an object, recursively, whatever the key. No hand-written key list decides where a formula may live.
- Every derived number carries its derivation in a `knownFrom`-style note visible on the tab (a `title` on the totals cell or a line under the section), so a user can tell a measured fact from a derived one.
- The Gaps tab keeps no list of its own: the register (served from the installed toolkit package) is the only source of what is missing; the step renderer's `gaps` are the only source of rendering gaps.
- Live probes for the Gaps check go through `readOps` (read-only guard), target the root file only, and run only when the user presses the button, never at startup.
- The legacy file is never modified. The cross-check reads the SaXML export at `/Users/wdecorte/GitHub/fmai/Wugin/Plugin/saxml-working/Ooe/` read-only and copies nothing from it into the repo except counts.
- `legacy/` is deleted only after the cross-check doc explains every mismatch and the inventory has no row that is not covered, derived, dropped or a registered gap.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File map

| Path | Responsibility |
|---|---|
| `ui/analysis/refs.js` | Name indexes across files; the reference list (`references(solution)`); the text tokeniser; memoised per solution |
| `ui/analysis/unreferenced.js` | Unreferenced fields (tiered), tables, occurrences (removability), scripts, layouts, value lists, custom functions, styles; confidence tier and reasons |
| `ui/analysis/broken.js` | Broken references: fm's `problems[]`, `<Field Missing>`/`<Table Missing>` markers, unresolved occurrences, named references that resolve to nothing |
| `ui/analysis/scripts.js` | Script issue checks (dead Set Variable, embedded credentials, hardcoded account, PSoS-only client steps, swallowed errors, unguarded abort off, expensive functions in loops), the call graph |
| `ui/analysis/globals.js` | `$$` variables: set sites (Set Variable `name`) and text mentions, with the register note that reads inside formulas are approximate |
| `ui/tabs/analysis.js` | Analysis tab: totals, unreferenced sections, broken references, script issues, globals |
| `ui/tabs/explorer.js` | Reference Explorer: pick any object, see what it references and what references it, both directions, with links |
| `ui/tabs/gaps.js` | Gaps tab: register matrix per kind, live check results, step renderer gaps aggregated |
| `ui/export/markdown.js`, `ui/export/mermaid.js`, `ui/export/json.js` | Pure exporters |
| `ui/shell.js`, `ui/index.html`, `ui/app.js` | Export menu, download through a Blob, register the three tabs |
| `server/server.mjs`, `server/gaps.mjs` | `GET /api/register`, `POST /api/gaps/check` |
| `scripts/cross-check.mjs`, `docs/cross-check-2026-09.md` | Throwaway legacy-vs-new count comparison and its findings |
| `tests/analysis/*.test.mjs`, `tests/tabs/{analysis,explorer,gaps}.test.mjs`, `tests/export/*.test.mjs`, `tests/server.test.mjs` | Tests against the fixture |

## Facts the tasks rely on (fm 0.7.0, ooe fixture)

- Script step keys carrying formulas or references on ooe (measured across every string value): named references `script` (Perform Script; a script name), `layout` / `layoutByCalculation` (Go to Layout), `field` and `target` (`Occurrence::Field`), `valueList`, `objectName`, `scriptName`, `layoutName`, `fileName`; formula text under `value`, `text`, `condition`, `parameter`, `calculation`, `message`, `result`, `model`, `prompt`, `account`, `url`, `request`, `count`, `threshold`, `windowName` and the AI-step keys, plus `slots.<kind>.<n>` for values fm does not name. Formula text is literal FileMaker calculation syntax (`"quoted"` strings, `$var`, `$$var`, `Occurrence::Field`, `Function (`).
- Layout objects: `field{name:'TO::Field', id, tableOccurrence{name,id,table}}` on field objects; `tableOccurrence` on portals; `action{...}` on buttons (script and parameter inside); `webViewer{urlCalculation,...}`; formula-bearing strings `hideCondition`, `tooltip`, `placeholderText`, `titleCalculation`, `entryCalculation`; `style` (display name); conditional formatting where present. Nested under `objects`; Plan 4's `walkObjects` carries the origin.
- Fields: `options.calculation.text/context`, `options.autoEnter.calculation.text/context`, `options.validation.calculation?`, `options.summary.field`, `options.autoEnter.lookup?` (check the fixture for the lookup shape), `options.valueList?`.
- Custom functions: `body`; custom menus: `titleCalculation`, `installCalculation`, items' `nameCalculation`, `action` (step-shaped); value lists: `field{occurrence,field}`, `valueList` (external `Source::List`); relations: `left/right{name}` plus `predicates[]{leftField,rightField}`; layouts: `tableOccurrence.name`, `scriptTriggers[]` (script names), `theme`.
- fm marks a reference it cannot resolve inside calculation text with `<Field Missing>` / `<Table Missing>` and per script under `problems[]`; an occurrence whose table is gone has `table.resolved === false`.
- The toolkit package ships `gaps/register.json` (302 entries, 4.7 MB) at `node_modules/fm-adt-toolkit/gaps/register.json`; `fm-adt-toolkit/gaps` (Node) exports `loadRegister(path)`, `runChecks(entries, run, meta) → CheckOutcome { entries, stillMissing, newlyReported, regressed, unexplained, errored, erroredExpected, expectedResolved }` where `run(ops) → AdtRunResult`; `fm-adt-toolkit/gaps/checks` (browser safe) exports `evaluateCheck`. Register probes name ooe objects; on another solution most probes error with not-found and the tab must say so plainly.
- `renderStepFromCatalog(step, catalogEntry(CATALOG, step.step), stepConventions(CATALOG))` returns `{ text, gaps: [{kind, key, ...}], baseline, contributed }`; `gaps` is the renderer's own record of a measured segment that produced nothing.
- The legacy inspector: `parseXMLToStats(fileOrFiles)` accepts an array of `File` objects (a split export), fills `window.__lastStats` (the `s` object: `s.tables`, `s.graph`, `s.scripts`, `s.layouts`, `s.accounts`, `s.unrefs`, `s.deep`, …); `exportJSON()` serialises it. The Ooe split export is the 19 `Ooe_*Catalog.xml` files plus `Ooe_Metadata.xml` under `/Users/wdecorte/GitHub/fmai/Wugin/Plugin/saxml-working/Ooe/` (read-only; exported from FileMaker 26.0.2 on 2026-08-30, before the `containers` table was added, so a few counts differ by design).

---

### Task 1: The reference index and scanner

**Files:** Create `ui/analysis/refs.js`; test `tests/analysis/refs.test.mjs`.

**Interfaces:**
- `nameIndex(solution) → { tables, occurrences, fields (key 'TO::Field'), scripts, layouts, valueLists, customFunctions, themesStyles }`, each a `Map<name, [{ target, id, name, ... }]>` (a name may exist in more than one file; lookups return the array).
- `tokenise(text) → { fields: ['TO::Field'], variables: ['$$x'|'$x'], functions: ['Name'], quoted: n }` from FileMaker calculation text: skip `"…"` string literals and `//`/`/* */` comments; `Identifier::Identifier` (identifiers allow letters, digits, `_`, spaces inside a name are not allowed here; fm names with spaces appear in `"…"`? No: field references are unquoted; treat `[^:;()\[\]{}"\s,+\-*/&=<>≤≥≠^]+::[^:;()\[\]{}"\s,+\-*/&=<>≤≥≠^]+` as a field token), `$$name`/`$name`, and `Name` immediately followed by optional spaces and `(` as a function call.
- `references(solution) → Reference[]` with `Reference = { kind: 'field'|'table'|'occurrence'|'script'|'layout'|'valueList'|'customFunction'|'style'|'variable'|'function', name, resolved: boolean, from: { target, kind, id, name, where }, how: 'named'|'text' }`. Sources, all read through `get`/`path` and a recursive string walk (`strings(obj, visit)` visiting every string value with its key path):
  - fields: calculation, auto-enter calculation, validation calculation, summary field, lookup, value list (named), plus every string in `options` (text);
  - scripts: named keys `script`, `layout`, `field`, `target`, `valueList`, `objectName`, `scriptName`, `layoutName` on each step; every other string on the step and in `slots` as text;
  - layout objects: `field.name`, `tableOccurrence.name`, `action` (recursively as a step), `style` (kind style, resolved against the layout's theme), every string as text; the layout's own `tableOccurrence.name` and `scriptTriggers[]`;
  - custom functions: `body` as text; custom menus: calcs as text, item actions as steps; value lists: `field.occurrence` + `field.field`, external `valueList`; relations: both occurrences (named) and predicate fields (`Occurrence::Field` named); table occurrences: `table.name` (named, kind table).
  - `resolved` is looked up in `nameIndex`: a field token resolves when the occurrence exists and its base table has the field; a function token resolves when it names a custom function (built-in functions are not references; keep them out of the list unless they are in the custom function index).
- Memoise `nameIndex` and `references` in a `WeakMap` keyed on the solution object.

**Tests (fixture-pinned, measured before pinning):** `tokenise` on a formula with a quoted `"A::B"` inside a string returns no field for it; `references` contains a named `script` reference from the `Perform Script` step naming `noop`; a `field` reference `TestTable::CalcField1_c` from a layout object, `how:'named'`; a text field reference from a calculation; a `<Field Missing>` token is not a reference (it is broken; Task 3); counts by kind pinned; `resolved:false` for a reference to a name not in the index; memoisation returns the same array twice.

Commit: `Reference index and scanner over the whole model`.

---

### Task 2: Unreferenced objects with confidence

**Files:** Create `ui/analysis/unreferenced.js`; test `tests/analysis/unreferenced.test.mjs`.

**Interfaces:** `unreferenced(solution) → { fields: [{ target, table, field, tier: 'none'|'text-only' }], tables, occurrences: [{ …, removability: 'completely-unused'|'relationship-only' }], scripts, layouts, valueLists, customFunctions, styles: [{ theme, key, display }], confidence: { tier: 'high'|'medium'|'low', reasons: [string] } }`. Rules (the inventory's derivations): a field is unreferenced when no reference of kind field resolves to it (tier `none`) or only text references do (tier `text-only` means referenced only in calculation text, which the tokeniser may miss; keep both tiers visible); a table when no occurrence uses it; an occurrence `completely-unused` when no relation, layout, field reference or script names it, `relationship-only` when only relations do; scripts when nothing names them (scripts named by layout triggers, button actions, menu items, other scripts count as referenced; a script named in `layoutByCalculation`-style dynamic keys makes confidence `medium` with a reason); layouts likewise (Go to Layout by calculation lowers confidence); value lists (layout objects' `valueList`, field validation); custom functions (text references); styles (Plan 4's themes `styleUsage`). Confidence reasons: `Evaluate (` / `GetField (` / `ExecuteSQL (` with a non-literal argument / `layoutByCalculation` / `scriptName` by calculation present anywhere → medium; plug-in call sites cannot be told (register `plugin-call-sites`) → note, not a tier change.

Tests: pinned counts per category on the fixture, one named example each (e.g. an unreferenced value list you find), a hand-made solution where a script referenced only by a button action is not listed, confidence reasons when a `GetField (` formula exists.

Commit: `Unreferenced objects, tiered, with the confidence of the answer`.

---

### Task 3: Broken references

**Files:** Create `ui/analysis/broken.js`; test `tests/analysis/broken.test.mjs`.

**Interfaces:** `broken(solution) → [{ target, kind: 'problem'|'missingMarker'|'unresolvedOccurrence'|'danglingName', from: {kind,id,name,where}, detail }]` from: `script.problems[]` verbatim (fm's own list; keep every field fm gives); `<Field Missing>`/`<Table Missing>` tokens in any scanned string (with the surrounding 40 characters); occurrences with `table.resolved === false`; named references from Task 1 with `resolved:false` (scripts, layouts, fields, value lists, occurrences) excluding text references. Counts by kind.

Tests: fixture-pinned counts (ooe has `problems` on several scripts and at least one missing marker: measure); a hand-made unresolved occurrence; a dangling `Perform Script` name.

Commit: `Broken references from fm's problems, the missing markers, and names that resolve to nothing`.

---

### Task 4: Script issues, the call graph, globals

**Files:** Create `ui/analysis/scripts.js`, `ui/analysis/globals.js`; tests.

**Interfaces:**
- `scriptIssues(solution) → [{ target, script: {id,name}, step: {index, stepID, step}, check, detail }]` with checks: `dead-set-variable` (a `Set Variable` whose `name` is a `$local` never mentioned in a later string of the same script), `embedded-credential` (a step whose credential-shaped key — any key whose folded name contains `password`, `apikey`, `secret`, `privatekey`, `clientsecret` — holds a quoted literal rather than a variable or field), `hardcoded-account` (`account` holding a quoted literal), `psos-only-step` (step ids fm/FileMaker document as server-incompatible: keep the list in one constant with the source cited from the legacy's FM step dictionary; measure which appear), `swallowed-error` (`Set Error Capture [On]` with no `Get ( LastError )` in any later string of the script), `unguarded-abort-off` (`Allow User Abort [Off]` with no `Set Error Capture` in the script), `expensive-in-loop` (a `Loop` block containing a step whose strings call `ExecuteSQL (`, `Evaluate (`, or `Insert from URL`). Disabled steps are skipped. Every check names the fm keys it read.
- `callGraph(solution) → { nodes: [{ target, id, name }], edges: [{ from, to, via: 'step'|'trigger'|'button'|'menu', resolved }] }` from Task 1's script references; `callTreeOf(graph, scriptKey, depth)` for the explorer.
- `globals(solution) → [{ name, sets: [{script, step}], mentions: n, files }]` for `$$` variables: sets from `Set Variable` `name`, mentions from text tokens; a note constant `GLOBALS_NOTE` stating reads inside formulas are approximate (register `calculation-tokens`).

Tests: fixture-pinned counts per check (measure; ooe's "Scripts With Everything" folder has deliberate cases), hand-made bodies for each check both ways, call graph edges for `noop`, globals with at least one `$$` from ooe.

Commit: `Script issue checks, the call graph, and global variables`.

---

### Task 5: Analysis and Reference Explorer tabs

**Files:** Create `ui/tabs/analysis.js`, `ui/tabs/explorer.js`; tests `tests/tabs/analysis.test.mjs`, `tests/tabs/explorer.test.mjs`; register in `ui/app.js` after Themes (Analysis, Explorer), before More.

- **Analysis**: totals line (unreferenced by category, broken by kind, issues by check, globals) each with a `title` naming the derivation; sections: Confidence (tier + reasons), Unreferenced (one `<details>` per category with a table and links to the object's tab), Broken references (table, links), Script issues (table grouped by check, links to `#scripts/<sel>` and the step via `#<stepID>`), Globals (table).

> Superseded 2026-09-17: the step anchor is FileMaker's 1-based line, `#L<line>`, not `#<stepID>`. fm's `stepID` is the step TYPE id and repeats through a body, so it cannot address a step. Filter narrows every table.
- **Explorer**: a selection is any object key `kind:<target>|<id>` (or `TO::Field` for fields); the tab renders a search list (every named object across kinds, filtered by the box) and, for the selected object, two tables: "References" (what it names) and "Referenced by" (what names it), each row with kind, name, where (script step index, layout object id, field option), how (named/text), and a link. For a script, also the call tree (outgoing, depth 3) as nested `<ul>`.

Tests: pinned counts; a selected script in the explorer lists `noop` under references; a selected field lists the layout objects that show it; links round-trip through `parseHash`.

Commit: `Analysis and Reference Explorer tabs`.

---

### Task 6: Exports

**Files:** Create `ui/export/markdown.js`, `ui/export/mermaid.js`, `ui/export/json.js`; `ui/shell.js` export menu; tests `tests/export/*.test.mjs`.

- `markdownReport(solution) → string`: the legacy's sections re-derived from the model and the analyses: Headline counts, Confidence, Security observations (no-password FileMaker users, disabled accounts, full-access accounts), Unreferenced counts by category with the field list, Script body observations (issues by check), Calculation fields (stored/unstored by table), Relationships (table), Container fields, Broken references, Gaps summary (from the Gaps tab's data when loaded; else a line saying run the check). Every number the same function the tabs use.
- `mermaidRelationships(solution) → string`: `erDiagram` with one entity per occurrence (name sanitised to Mermaid's identifier rules, original in a label) and one relation line per relation with the predicate as the label; `mermaidCallGraph(solution) → string`: `flowchart TD` with script nodes and edges, unresolved targets dashed.
- `jsonExport(solution) → string`: the model plus the analyses (`{ solution, analyses: { unreferenced, broken, scriptIssues, callGraph, globals } }`), serialisable (no Maps).
- Shell: an "Export" menu in the header (Markdown, Mermaid relationships, Mermaid call graph, JSON) creating a Blob and an object URL, clicking a temporary `<a download>`; filename from the root file name and the date.

Tests: markdown contains the headline counts equal to the tabs' totals; mermaid output parses as lines starting with `erDiagram`/`flowchart TD` and contains one entity per occurrence and one edge per relation; identifiers with spaces are sanitised; JSON round-trips through `JSON.parse` and carries the analyses.

Commit: `Markdown, Mermaid and JSON exports`.

---

### Task 7: The Gaps tab and its endpoints

**Files:** Create `server/gaps.mjs`, `ui/tabs/gaps.js`; modify `server/server.mjs`, `ui/api.js`, `ui/app.js`; tests `tests/server.test.mjs` (two endpoints), `tests/tabs/gaps.test.mjs`.

- `server/gaps.mjs`: `registerPath()` (resolve `fm-adt-toolkit/package.json`, then `gaps/register.json`), `loadRegisterSummary()` → the register with each entry reduced to `{ id, op, kind, probe, attributes: [{name, path, fmKey, reported, wontfix?, knownFrom}], expectedError, lastChecked: {version, build, date} }` (drop evidence pointers and attributeReasons to keep it small; measure the size), and `runLiveCheck(ctx, target)` → `runChecks(entries, (ops) => readOps(ctx, target, ops) shaped as AdtRunResult, meta)` with the outcome reduced to ids and attribute names (no entries echoed back).
- Endpoints: `GET /api/register` → the summary; `POST /api/gaps/check { target }` → the reduced outcome plus `{ fmVersion, ranAt }`. Both pass the Host/Origin/Content-Type guards; the check goes through `readOps` so the read-only guard applies; it never writes the register or evidence.
- `ui/tabs/gaps.js`: sections: "What fm cannot read yet" — per kind group (from `id` prefix before `:`), counts reported / missing / wontfix, expandable per entry to the attribute table (name, path, fmKey, status, knownFrom) filterable; "Live check" — a button (`data-gaps-check`) that calls the endpoint and then shows errored (expected and not), regressed, newly reported (flagged as "reported live but still marked missing in the register", the spec's words), expected-failure-resolved, and a plain note when most probes answered not-found because the solution is not the reference one; "Rendering gaps" — every script step across the solution whose `renderStepFromCatalog(...).gaps` is non-empty, grouped by step type and gap kind with counts and one example (script, step index); "Register facts" — version/build/date the register was last checked against, the running fm version from the context.
- The shell gets a generic `data-action` delegation (`onAction(name, dataset)`) so the tab can trigger the live check; the app wires `gaps-check` to the api and re-renders with the outcome stored on `solution.gaps` (or a side object passed through `view`).

Tests: server endpoints with a fake runOps (register summary loads from the installed package: assert 302 entries and that `theme` is present; the check endpoint calls runOps once with only read ops and returns the outcome shape); the tab renders the matrix from the summary fixture (write a small fixture of three entries) and the rendering-gaps section from the ooe fixture (measure: which step types on ooe produce renderer gaps).

Commit: `Gaps tab: the register's matrix, a live check through the read-only guard, and the renderer's own gaps`.

---

### Task 8: The count cross-check (throwaway)

**Files:** Create `scripts/cross-check.mjs`, `docs/cross-check-2026-09.md`; `package.json` devDependency `jsdom` and script `cross-check`.

- The script: (1) loads `legacy/clockwork-inspector.html` into a jsdom window (`runScripts: 'dangerously'`, `pretendToBeVisual`), builds `File` objects from the 20 XML files of the export directory passed as `--saxml=<dir>` (read-only), calls `window.parseXMLToStats(files)` (await if it returns a promise; inspect the legacy's signature first), and captures `window.__lastStats` through the same `clean()` logic `exportJSON` uses; (2) reads the new model from the fixture (`tests/replay-api.mjs` + `discover`) or, with `--live`, from the server's direct api against `fmnet://localhost/ooe` (reads only); (3) computes the comparable counts on both sides from one table of `[legacy path, new derivation]` pairs covering every `s.<tab>.*_count`/`*_total` row of the inventory plus the unreferenced and broken counts; (4) prints a Markdown table: datum, legacy, new, delta, and writes it to the doc.
- The doc: the table plus one line per mismatch classifying it as `gap` (register id), `bug` (fixed in this plan, commit), `design` (a derivation that differs on purpose, with the reason), or `export drift` (the SaXML predates the `containers` table). No mismatch may be left unclassified.
- Fix the bugs the comparison finds in the same task (small) or list them for a fix round.

Commit: `Count cross-check of the legacy inspector against the new one on ooe`.

---

### Task 9: Retire the legacy file

**Files:** Delete `legacy/`, `scripts/saxml-inventory.mjs`, `tests/saxml-inventory.test.mjs`; keep `docs/saxml-inventory.md` and `docs/inventory-to-register.md` as the historical record with a top note; keep `tests/inventory-register.test.mjs` (it reads the docs and the register, not the legacy file); remove the `inventory` npm script and the jsdom devDependency and the cross-check script (the doc stays); `CLAUDE.md` loses the Legacy file section and the inventory command, gains `ui/analysis/` and `ui/export/` in Layout; `README.md` describes version 3 as the inspector (tabs, analyses, exports, gaps) and drops the SaXML present tense, crediting Andrew Kear's original; spec §5 step 6 marked done with the date.

Gate (assert in a one-off script in the report): every inventory row is `covered`, `derived`, `dropped`, or `gap` with a gap id that maps in `docs/inventory-to-register.md`; the cross-check doc has no unclassified row.

Commit: `Retire the Save as XML inspector; the fm CLI inspector is the product`.

---

## Self-review notes

- Spec §3 derived views: name index and reference scan (T1), unreferenced and broken and explorer and call graph and step index (T2–T5; the step index shipped in Plan 4), field risk is the confidence tier (T2) — the spec's "field risk score" is realised as the confidence tier plus the tiered unreferenced fields, which is what the inventory recorded.
- §4.3 item 3 Gaps tab (T7) runs the probes on demand, not at startup (Global Constraints), a deliberate departure recorded here: startup probes would spawn fm 74 times more per open.
- §5 steps 3, 5, 6 (T5–T6, T8, T9).
- Every Plan 4 parked item that is a rendering matter (clickable wireframe rects, depth padding, "listed" column wording, filtered step index marker, debounce test, themes memo identity test) is folded into T5's or T9's fix scope only if a reviewer raises it; otherwise they stay parked and are listed in the final report.
