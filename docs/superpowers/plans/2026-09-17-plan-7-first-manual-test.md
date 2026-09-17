# Plan 7: The First Manual Test

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix everything the owner's first manual test of the page turned up (2026-09-17): a blank body during the read, an unlabelled file size, catalog rows that lead nowhere, tables that do not sort, graph boxes drawn at the wrong height and lines that say nothing, a step index that cannot be drilled into, a detail pane that renders off screen, and a Gaps tab that is a wall of disclosure triangles.

**Architecture:** Same page, same modules, same rules. Discovery gains a structured phase hook and the app draws a read log in the main area from it while the read runs. The shared `table()` helper marks headers sortable and the shell sorts a table's rows in the DOM on a header click (no re-render, no state in the hash). The graph draws fm's `drawnBounds`. The step index and the Gaps register become selectable like everything else, with selections that carry no file because the thing selected spans the solution. Every tab renders its detail pane above its lists.

**Tech Stack:** As before. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-fm-cli-rewrite-design.md` §2 (page and read controls), §3 (derived views). Owner's ruling 2026-09-17: detail above the list is the rule on every tab; key field labels are drawn on the graph lines and dropped only if they crowd ooe's picture.

## Global Constraints

- House rules: `ui/` imports nothing from `node:`/`server/`; tabs are pure renderers (no `document`); `esc` on every string; every fm key read through `get`/`path` from `ui/access.js`; totals lines are never filtered or sorted; selections ride raw in `data-select` and percent-encoded once in the hash; tests measure the fixture before pinning a number; never `rows.length === list.length`; `tests/no-control-characters.test.mjs` stays green; nothing in a test or the page ever sends an op that is not `read:*`, `evaluate:calculation` or `validate:calculation`.
- Reads only against `fmnet://localhost/ooe` as `admin` with the keychain, never `--password`.
- `npm test` stays green without Chrome and without fm. The browser pass (`INSPECTOR_BROWSER=1 npm run test:browser`) is run once at the end (Task 8) and its screenshots looked at.
- Node lives in nvm: `export PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH"` when the shell lacks it.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Measured before writing (2026-09-17, fm 0.7.0 against ooe)

- The list batch (27 ops) takes 2.1 s; the describe batch (169 ops) 2.1 s; BrojDva the same again; the unreachable `Ooe_dev` sibling 1.6 s. A whole discovery is ~10 s during which `#main` is empty.
- Describe ops per catalog on ooe: field 14 (per table), layout 18, script 41, tableOccurrence 24, relation 10, valueList 8, customFunction 9, privilegeSet 7, customMenu 25, account 13.
- Every occurrence's `graph` carries `bounds` (the expanded rectangle) and `drawnBounds` (what FileMaker draws: 18 tall for `view: collapsed`, 38 tall for `view: related`, equal to `bounds` for `view: full`). BrojDva's `Invoice` is collapsed at 21,72 (drawn 131×18, bounds 131×116); ooe's six `FM26Test_Source__*` are related-view at 960,161..486 (drawn 263×38). Six ooe occurrences report 0×0 at 0,0 and stay undrawn.
- `Get ( FileSize )` on ooe is 3727360 (bytes).
- Every table today: `table(columns, rows, opts)` in `ui/dom.js` emits `<th class="num">` for numeric columns and nothing else a sort could hang on.

---

### Task 1: The read log

**Files:** `ui/discovery.js`, `ui/read-log.js` (new), `ui/app.js`, `ui/shell.js` (only if `showMessage` needs a sibling), `ui/inspector.css`, `tests/discovery.test.mjs`, `tests/read-log.test.mjs` (new).

- `readFile(api, target, hooks = {})` and `discover(api, root, hooks)` gain `hooks.onPhase(event)`; `onProgress` stays as it is. Events, in order per file:
  - `{ type: 'list', target, ops: <number of list ops> }` before the list batch;
  - `{ type: 'listed', target, ms, catalogs: <number of catalogs with a list>, entries: <sum of list lengths> }` after it;
  - `{ type: 'describe', target, ops: <number of describe ops>, byCatalog: { field: 14, layout: 18, … } }` before the describe batch (`byCatalog` keyed by the catalog the op reads, `field` for `read:field`);
  - `{ type: 'described', target, ms }` after it;
  - `{ type: 'unreachable', target, from, via, code }` when a file fatals or a sibling cannot be resolved;
  - `{ type: 'done', files, unreachable, ms }` at the end (`ms` for the whole discovery).
  `ms` values come from `Date.now()` around each `api.read`; `hooks.now` may override the clock for tests (default `Date.now`).
- `ui/read-log.js` exports `createReadLog()` returning `{ push(event), html() }`: `push` folds events into lines, `html()` renders `<section class="panel read-log"><header><h2>Reading</h2></header><ol>…</ol></section>`. One `<li>` per file: `<b>ooe</b> listed 19 catalogs, 245 entries (2.1 s) · describing 169 objects: 41 scripts, 25 menus, 24 occurrences, 18 layouts, 14 tables, 13 accounts, 10 relations, 9 custom functions, 8 value lists, 7 privilege sets` — the `byCatalog` counts in descending order with the catalog's plural label (`table`→`tables` because the op is `read:field` per table; `tableOccurrence`→`occurrences`; `customFunction`→`custom functions`; `customMenu`→`menus`; `privilegeSet`→`privilege sets`; `valueList`→`value lists`; the rest the catalog name plus `s`). A phase in flight ends with `…`; a finished one carries its seconds to one decimal in parentheses. A file name is the last path segment of the target until the file is read (the log never has the file's own name). An unreachable target is its own line: `<b>Ooe_dev</b> unreachable: open_failed (via Ooe_dev from ooe)`. The `done` event appends `Read 2 files, 2 unreachable (10.3 s)`. Everything through `esc`.
- `ui/app.js`: `discoverSolution` (and a full-solution re-read through `rereadSlot`) creates a log, passes `onPhase: (e) => { log.push(e); shell.showMessage(log.html()); }`, and the header progress line keeps its current messages. While `busy`, a 500 ms interval appends the elapsed seconds to the header line's message (`Reading fmnet://localhost/ooe · 4 s`); cleared in `run`'s `finally`. The final render replaces the log as it does today.
- Style: `.read-log ol { padding-left: 20px }`, `.read-log li { padding: 3px 0 }`, `.read-log .pending { color: var(--ink-3) }`.
- Tests: `tests/read-log.test.mjs` feeds the event sequence for two files and one unreachable through a fresh log and asserts the exact lines (including the ordering of `byCatalog` and the plural labels, `…` on an in-flight phase, seconds with one decimal); a target with `<` in it is escaped. `tests/discovery.test.mjs`: with the fixture replay api and a stub clock stepping 100 ms per call, `discover` emits `list`/`listed`/`describe`/`described` for ooe and BrojDva in that order, `unreachable` for the two unreachable entries, and `done` last with `files === 2`; `byCatalog.script` for ooe equals the number of `read:script` describe ops the fixture records for ooe (measured: 41).

### Task 2: File size and catalog links on the Solution tab

**Files:** `ui/tabs/common.js`, `ui/tabs/solution.js`, `tests/tabs/common.test.mjs`, `tests/tabs/solution.test.mjs`.

- `common.js` exports `byteSize(n)`: `< 1024` → `"512 B"`; then KB, MB, GB with one decimal, dropping `.0` (`3727360` → `"3.6 MB"`, `1048576` → `"1 MB"`, `1536` → `"1.5 KB"`); non-numeric → `''`. `factValue` stays; the Solution tab renders `Get ( FileSize )` specially: `<span title="3727360 bytes">3.6 MB</span>` (match on the fact key exactly as `file.facts` spells it; a size fact with an error renders as any other errored fact).
- `common.js` exports `catalogHash(catalog, target)` mapping a catalog to the tab that shows it: `table`, `field` → `tables`; `tableOccurrence`, `relation`, `graphNote` → `graph`; `layout` → `layouts`; `script` → `scripts`; `account`, `privilegeSet`, `extendedPrivilege`, `authorization` → `security`; `theme` → `themes`; everything else (`valueList`, `customFunction`, `customMenu`, `customMenuSet`, `externalDataSource`, `baseDirectory`, `persistentData`, `font`) → `catalogs`. Returns the bare tab (no selection) — the tabs already scope by file when there is more than one, and a selection per catalog would be a second scheme. Unknown catalog → `null`.
- Solution tab `Catalog` column: `linkOr(catalogHash(r.catalog), r.catalog)` with the list error badge kept after it.
- Tests: `byteSize` table; `catalogHash` covers every catalog in `LIST_CATALOGS` (import it from `ui/read-plan.js` and assert none returns `null`); the rendered Solution tab has `href="#tables"` on the `table` row and `title="3727360 bytes"` with `3.6 MB` for ooe (measure the fixture's FileSize first, assert on that).

### Task 3: Sortable tables

**Files:** `ui/dom.js`, `ui/shell.js`, `ui/inspector.css`, `tests/dom.test.mjs`, `tests/shell.test.mjs`.

- `table()` emits every header as `<th data-sort="num">` or `data-sort="text"` (`num` when the column has `num: true`), keeps `class="num"` and `title`, and adds `title="Click to sort"` only when the column carries no title of its own. A column may opt out with `sort: false` (used by the Solution tab's re-read button column and any column whose `label` is `''`).
- `dom.js` exports `sortRows(rows, index, kind, direction)`: `rows` is an array of `{ cells: [string…] }` (text content per cell); `num` compares `Number(text.replace(/[^\d.-]/g, ''))` with `NaN` last; `text` compares with `localeCompare` (`sensitivity: 'base'`); `direction` is `'asc'` or `'desc'`; stable; returns a new array.
- Shell: the delegated click handler, before row selection, handles `ev.target.closest('th[data-sort]')`: finds its table, the header's cell index, the current direction from `th.dataset.dir` (`asc` on the first click, toggling after), clears `data-dir` on the sibling headers, sets it on this one, reads each `tbody tr` and its `td` `textContent`s, calls `sortRows`, and appends the rows back in the sorted order (moving the same elements, so `data-select` and `class="selected"` survive). A header click never sets the hash. A re-render (filter, route) drops the sort, which is the documented behaviour: the sort is a view of the rendered rows, not state.
- CSS: `th[data-sort] { cursor: pointer; user-select: none }`, `th[data-dir="asc"]::after { content: " ▲" }`, `th[data-dir="desc"]::after { content: " ▼" }`, small and in `var(--ink-3)`.
- Tests: `sortRows` numeric (`"1,147"`-style thousands do not occur, but `count()` output does: `<span class="num">12</span>` is the HTML, its textContent `12`), text, `NaN` last, stability, toggle direction. Shell test: the stub DOM gains what this needs (a `th` with `dataset`, `closest('table')`, `tBodies[0].rows` or `querySelectorAll('tbody tr')`, `cells`, `appendChild`) — extend `fakeElement` minimally; assert a click on a `num` header reorders the fake rows and sets `data-dir`, a second click reverses, and the hash is untouched. A `th` without `data-sort` does nothing.

### Task 4: The graph draws what FileMaker draws, and its lines say what they join

**Files:** `ui/tabs/graph.js`, `ui/inspector.css`, `tests/tabs/graph.test.mjs`.

- `occurrenceRows`: `bounds` becomes `get(graph, 'drawnBounds') ?? get(graph, 'bounds')`; a new `expanded: get(graph, 'bounds')` field; `placed` tests the drawn rectangle. The occurrence detail's geometry pair says `drawn 131 × 18 at 21, 72 (collapsed; expands to 131 × 116)` when the two differ, and the single `boundsText` when they are equal. `overlapping()` keeps testing the drawn top-left.
- Lines: `<line data-rel="…" data-select="<relation row key>" class="rel">` followed by `<title>` inside a `<g>` — SVG `<line>` may not carry `<title>` as a child in every browser, so wrap: `<g class="rel-group" data-select="…"><title>ID = ID_TestTable</title><line …/></g>`; the title is `row.predicates` (already `Left::a = Right::b; …`). Clicking the line selects the relation through the shell's `[data-select]` delegation, exactly as a box selects its occurrence.
- Key field labels: for each predicate with fields, draw `<text class="key">` with the left field name at the left box's edge and the right field name at the right box's edge, positioned where the line leaves the box (compute the intersection of the centre-to-centre segment with the box rectangle; put the label 4 units outside the box along the line, anchored `start` when the line leaves rightwards and `end` when it leaves leftwards). Several predicates on one relation: one label per predicate, stacked 11 units apart. Font 9px. A cartesian predicate draws the `×` alone in the middle of the line.
- Render the graph once for ooe after this (Task 8's screenshot decides, but do not wait for it): if the FM26Test column's six lines put six labels on top of each other, keep the labels but drop them to the first predicate per occurrence pair and say so in the report; if it is still unreadable, the ruling is hover plus click only and the label code goes (report it, the plan text stands as the owner's fallback).
- CSS: `svg.graph .key { font-size: 9px; fill: var(--ink-2) }`, `svg.graph .rel-group { cursor: pointer }`, `svg.graph .rel-group:hover line { stroke: var(--brand); stroke-width: 2.5 }`.
- Tests: BrojDva's Invoice rect has `height="18"` and its detail says `expands to 131 × 116`; ooe's `FM26Test_Source__cartesian` rect is 38 tall; the relation `<g>` for ooe's relation 1 has `data-select` equal to the Relationships row key and a `<title>` equal to that row's predicates; one `<text class="key">` per predicate field (count the fixture's predicates for one relation and assert that many); the cartesian relation draws one `×` label; the existing "unplaced occurrence is not drawn" test still holds.

### Task 5: The step index drills down

**Files:** `ui/tabs/scripts.js`, `ui/tabs/common.js`, `tests/tabs/scripts.test.mjs`, `tests/tabs/common.test.mjs`.

- A solution-wide selection: `common.js` exports `solutionKey(kind, id)` → `*|<kind>:<id>` and `parseSelection` already yields `target: '*'`; document in `common.js` that `*` is the solution, not a file. `kindSelection` is unchanged.
- `stepIndex` rows gain `key: solutionKey('step', name)` and `uses: [{ target, scriptId, scriptName, line }]` (line 1-based, every occurrence). The index table's `Step` cell is `link('scripts/' + row.key, row.step)` and rows carry `selectRow(view.selection)`.
- `renderSelected` handles a `*|step:<name>` selection: a section `Step <name>` with a totals line (`Used N · Scripts M`) and a table of the scripts using it (`File` when multi-file, `Script` linking to `scripts/<target>|<id>`, `Uses` count, `Lines` as links `#scripts/<target>|<id>#L<line>` joined by `, `, folded past 12 with `… and K more`). The script selection (`<target>|<id>[#L<n>]`) renders as today.
- Tests: the index row for `Set Variable` links to `#scripts/*|step:Set%20Variable` (encoded through `buildHash`; assert via `link`); selecting it renders a section whose script rows sum `Uses` to the index's `count` (measure: `Set Variable` used 190 in 12 scripts on the fixture), each `Lines` link parses back through `parseHash`/`selectionWithTail` to a script id and line; a step name with `<` escapes.

### Task 6: Detail above the list, on every tab

**Files:** `ui/tabs/tables.js`, `ui/tabs/graph.js`, `ui/tabs/scripts.js`, `ui/tabs/layouts.js`, `ui/tabs/security.js`, `ui/tabs/themes.js`, `ui/tabs/catalogs.js`, `ui/tabs/explorer.js` (comment only), their tests.

- Each tab's `render` concatenates its selected-detail section first, then its lists, in the order the lists have today. Tables: fields of the selected table above the base tables list. Graph: the selected occurrence's or relation's detail above the Occurrences list; the SVG stays where it is in the order after that. Scripts: selected script, then the tree, then the step index (the step detail from Task 5 is a selected-detail section and comes first too). Layouts, Security (selected account or privilege set), Themes, More: same. Explorer already does it: its header comment loses the words "the exception" and says this is the rule for every tab.
- `ui/tabs/common.js` gets a one-paragraph comment at the top stating the rule and why (a click's result renders where the eye is; a list can be a thousand rows).
- Tests: for each of the seven tabs, one assertion that with a selection the index of the detail section's `<h2>` text is smaller than the index of the list section's `<h2>` in the rendered HTML (use the tab's own headings; measure them from the current render rather than guessing).

### Task 7: The Gaps tab as tables

**Files:** `ui/tabs/gaps.js`, `tests/tabs/gaps.test.mjs`, `ui/export/markdown.js` only if it imports a changed name (it imports `GAP_LISTS` from `ui/analysis/gaps-lists.js`, so likely untouched).

- `registerGroups` stays (add `attributes: reported + missing + wontfix` and `key: solutionKey('gap-kind', kind)` per group). New `registerEntries(group)` returns one row per entry: `{ key: solutionKey('gap-entry', entry.id), id, op, attributes, reported, missing, wontfix, expectedError }`.
- The register section renders, in order: the totals line (unfiltered), the one-sentence note (rewritten: "One row per kind the Save as XML export knows. Select a kind for its entries, an entry for its facts: which fm reports, which it does not, and where each was known from."), then the KINDS table (`Kind` linking to `gaps/*|gap-kind:<kind>`, `Entries`, `Attributes`, `Reported`, `Missing`, `Wontfix`, all `num`, rows `selectRow`), filtered by kind name.
- Selection `*|gap-kind:<kind>` renders, ABOVE the kinds table (Task 6's rule), a section `Kind <kind>` with the ENTRIES table (`Entry` linking to `gaps/*|gap-entry:<id>`, `Op`, `Attributes`, `Reported`, `Missing`, `Wontfix`, `Expected error` as a badge when set), filtered by entry id/op.
- Selection `*|gap-entry:<id>` renders, above everything, a section `Entry <id>` with a kv (`Kind`, `Op`, `Read with` the exact probe command if the entry carries one — `entry.probe` or whatever the register spells; read the register fixture to see, and render only what is there), then the ATTRIBUTES table with today's `ATTRIBUTE_COLUMNS`, filtered by attribute name/path; and a link back to its kind. The kinds table renders below it too (the reader keeps the overview).
- The live-check section and the rendering-gaps section keep their shape; the `<details>` wrappers of the register go entirely.
- Tests: the kinds table has one row per group with `href="#gaps/*|gap-kind:account"` (encoded); selecting `account` renders its 8 entries with `Entry` links; selecting `account:filemaker` renders its attributes (measure the count) and a `Missing` count equal to the attributes whose `statusOf` is `missing`; the totals line is unchanged by a filter that matches nothing; no `<details>` remains in the register section.

### Task 8: The browser pass and the docs

**Files:** `tests/browser-smoke.test.mjs`, `README.md`, `CLAUDE.md`.

- Browser pass additions: on the Scripts tab click the first step-index row and assert the `Step ` section renders above the tree; on the Gaps tab (after the register loads) click the first kind row, then the first entry row, and assert the entry section renders; on the Tables tab click the `Fields` header and assert the first row changed (or the direction attribute is set); on the Relationships tab assert at least one `.rel-group title` exists; assert `#main` is non-empty within 1 s of page load (the read log). Screenshots as before, plus `read-log.png` taken during discovery (poll `#main` until it contains `Reading`).
- Run `INSPECTOR_BROWSER=1 npm run test:browser` once for real; look at `graph.png` and decide the key-label question per Task 4's rule; look at `gaps.png`, `scripts-selected.png`, `solution.png`; put what you saw in the report.
- README: the "What it analyses" list mentions the sortable tables, the graph's drawn geometry and its labelled lines, and the step index drill-down; nothing else changes. CLAUDE.md: one line under Layout for `ui/read-log.js`.

---

## Self-review notes

- Every note on the owner's screenshots has a task: blank body (T1), file size unit (T2), catalog rows clickable (T2), sortable columns (T3, all tabs at once), the `?` box and the graph's predicates and key fields (T4), step index click-through and sorting (T5, T3), custom function click "does nothing" (T6, the rule), the Gaps tab (T7). T8 verifies it in the browser and updates the docs.
- Selections without a file (`*|kind:id`) are new; T5 introduces the helper and T7 reuses it. `parseSelection` needs no change.
- Not included: Compare mode (after the owner's next test), the toolkit register data work.
