# Count cross-check: legacy inspector vs the fm-CLI inspector, on ooe

**The record of a one-off measurement.** Plan 5 Task 8 wrote this file and the script that produced it, `scripts/cross-check.mjs`; Task 9 removed the script, because it read `legacy/clockwork-inspector.html`, which is retired. The numbers below are what that run measured, and this file is the record of them: it proves once that the new inspector counts the reference solution the way the legacy one did, and gives every difference a reason. Nothing regenerates it.

| | |
|---|---|
| SaXML export | `/Users/wdecorte/GitHub/fmai/Wugin/Plugin/saxml-working/Ooe` — 19 files, Ooe.fmp12, exported 2026-08-30 from FileMaker 26.0.2 (read-only) |
| Catalogs the export does not carry | none |
| fm build | 0.7.0 (29823677) |
| New side | fixture /Users/wdecorte/GitHub/FileMaker-inspector-open-source/tests/fixtures/ooe (recorded 2026-09-16, fm 0.7.0 (29823677)) |
| Run on | 2026-09-16 |

## How each side was produced

**Legacy.** `legacy/clockwork-inspector.html` is loaded into a jsdom window with `runScripts: 'dangerously'` and `pretendToBeVisual: true`, the export's XML files are handed to it as `File` objects, and `window.parseXMLToStats(files)` is awaited. It returns `{stats}` -- the same `s` object the page stashes in `window.__lastStats` -- which is then put through the same `clean()` reduction `exportJSON()` uses. **No DOM stubs were needed**: `analyse()`'s only document touch is `setLoadingStatus`, which is already guarded by `if (el)`, and its per-phase yields need `requestAnimationFrame`, which `pretendToBeVisual` supplies. jsdom's `File` carries `slice()`, `text()` and `FileReader` support, which is everything `prepareInput` and `readFileAsText` ask for. The page and the export are read-only inputs; neither is written to.

**New.** The recorded fixture (or, with `--live`, the server's direct api) is read through `discover()`, and every number is taken from the same function the tab that shows it calls: `tableCounts`, `objectCounts`, `scriptStats`, `securityTotals`, `catalogsTotals`, `themesTotals`, `occurrenceRows`, `relationRows`, `authorizationRows`, `customMenuRows`, `externalDataSourceRows`, `unreferenced`, `broken`, `globals`.

**One narrowing.** The new side is restricted to the ROOT file. The legacy read one file's export; the new inspector follows external data sources and also reaches `fmnet://localhost/BrojDva`, so the whole solution would be a different population. Every analysis takes a solution, so the narrowing is a solution object carrying the root file alone.

## The table

| Datum | Legacy | New | Delta | |
|---|---:|---:|---:|---|
| `s.tables.table_count` | 13 | 14 | +1 | export drift |
| `s.tables.field_count` | 178 | 179 | +1 | export drift |
| `s.tables.max_fields_count` | 54 | 54 | 0 | = |
| `s.tables.calc_fields` | 7 | 7 | 0 | = |
| `s.tables.stored_calc_fields` | 5 | 5 | 0 | = |
| `s.tables.unstored_calc_fields` | 2 | 2 | 0 | = |
| `s.tables.summary_fields` | 25 | 25 | 0 | = |
| `s.tables.global_fields` | 1 | 1 | 0 | = |
| `s.tables.container_fields` | 7 | 8 | +1 | export drift |
| `s.graph.table_occurrence_count` | 23 | 24 | +1 | export drift |
| `s.graph.relationship_count` | 10 | 10 | 0 | = |
| `s.layouts.layout_count` | 17 | 18 | +1 | export drift |
| `s.layouts.group_count` | 4 | 4 | 0 | = |
| `s.layouts.objects_total` | 473 | 475 | +2 | export drift |
| `s.layouts.parts_total` | 50 | 52 | +2 | export drift |
| `s.layouts.portals_total` | 4 | 4 | 0 | = |
| `s.layouts.web_viewers` | 2 | 2 | 0 | = |
| `s.layouts.tab_controls` | 4 | 4 | 0 | = |
| `s.layouts.slide_controls` | 4 | 4 | 0 | = |
| `s.layouts.popover_count` | 2 | 2 | 0 | = |
| `s.layouts.button_bars` | 2 | 2 | 0 | = |
| `s.layouts.charts` | 2 | 2 | 0 | = |
| `s.layouts.local_css_node_count` | 495 | — | — | gap |
| `s.scripts.script_count` | 41 | 41 | 0 | = |
| `s.scripts.group_count` | 8 | 8 | 0 | = |
| `s.scripts.step_count` | 3104 | 3104 | 0 | = |
| `s.scripts.max_length` | 1155 | 1155 | 0 | = |
| `s.scripts.unbalanced_if_scripts + unbalanced_loop_scripts` | 0 | 0 | 0 | = |
| `s.scripts.orphaned_enabled_steps` | 0 | 0 | 0 | = |
| `s.scripts.unknown_step_id_count` | 3 | 0 | -3 | design |
| `s.scripts.unknown_step_id_total` | 5 | 352 | +347 | design |
| `s.valueLists.value_list_count` | 8 | 8 | 0 | = |
| `s.customs.custom_function_count` | 15 | 9 | -6 | design |
| `s.menus.custom_menu_count` | 25 | 25 | 0 | = |
| `s.menus.custom_menu_set_count` | 2 | 3 | +1 | design |
| `s.menus.custom_menu_item_count` | 5 | 5 | 0 | = |
| `s.ext.external_data_source_count` | 0 | 7 | +7 | design |
| `s.ext.odbc_count` | 0 | 2 | +2 | design |
| `s.ext.file_access_count` | 5 | 5 | 0 | = |
| `s.baseDirs.total` | 5 | 5 | 0 | = |
| `s.persistent.count` | 5 | 5 | 0 | = |
| `s.accounts.acc.account_count` | 13 | 13 | 0 | = |
| `s.accounts.priv.privilege_set_count` | 7 | 7 | 0 | = |
| `s.accounts.ep.extended_privilege_count` | 12 | 12 | 0 | = |
| `s.themes.theme_count` | 3 | 3 | 0 | = |
| `s.themes.style_count` | 189 | 189 | 0 | = |
| `s.globals.global_variable_count` | 3 | 3 | 0 | = |
| `s.plugins.plugin_function_count` | 1 | — | — | gap |
| `s.tags.unique_count` | 2 | — | — | gap |
| `s.tags.custom_count` | 0 | — | — | gap |
| `s.library.binary_data_count` | 0 | — | — | design |
| `s.unrefs.fields` | 30 | 34 | +4 | gap |
| `s.unrefs.fields (tier `none` only)` | 30 | 29 | -1 | gap |
| `s.unrefs.tables` | 0 | 0 | 0 | = |
| `s.unrefs.table_occurrences` | 0 | 6 | +6 | design |
| `s.unrefs.scripts` | 0 | 36 | +36 | design |
| `s.unrefs.layouts` | 13 | 14 | +1 | export drift |
| `s.unrefs.value_lists` | 0 | 4 | +4 | design |
| `s.unrefs (custom functions)` | — | 6 | — | design |
| `s.unrefs.unused_styles` | 60 | 184 | +124 | design |
| `s.unrefs.broken` | 13 | 360 | +347 | design |

34 of 61 rows agree exactly. The 27 that do not are classified below; none is left unclassified.

## Every difference, classified

`gap` names a register id. `bug` is a defect in the NEW inspector, fixed in this plan. `design` is a derivation that differs on purpose -- which includes the places where the legacy's own number is demonstrably wrong and the new one is right. `export drift` is the export being older than the file.

### export drift (8)

- `s.tables.table_count` 13 → 14: the export (2026-08-30) predates the `containers` table, added 2026-09-14: the file has one more base table.
- `s.tables.field_count` 178 → 179: the export (2026-08-30) predates the `containers` table, added 2026-09-14: the file has one more field.
- `s.tables.container_fields` 7 → 8: the export (2026-08-30) predates the `containers` table, added 2026-09-14: the file has one more container field.
- `s.graph.table_occurrence_count` 23 → 24: the export (2026-08-30) predates the `containers` table, added 2026-09-14: the file has one more occurrence.
- `s.layouts.layout_count` 17 → 18: the export (2026-08-30) predates the `containers` table, added 2026-09-14: the file has one more layout.
- `s.layouts.objects_total` 473 → 475: the export (2026-08-30) predates the `containers` table, added 2026-09-14: the file has a layout with two objects.
- `s.layouts.parts_total` 50 → 52: the export (2026-08-30) predates the `containers` table, added 2026-09-14: the file has a layout with two parts.
- `s.unrefs.layouts` 13 → 14: the export (2026-08-30) predates the `containers` table, added 2026-09-14: the file has one more layout, `containers`, which nothing names.

### design (13)

- `s.scripts.unknown_step_id_count` 3 → 0: fm names every step it returns, so the unknown-id bucket is empty by construction. Its replacement is `script.problems[]` -- the steps fm flagged while rendering them -- which the new inspector reports as `flaggedSteps` (see the row below). Inventory row `s.scripts.unknown_step_id_count`.
- `s.scripts.unknown_step_id_total` 5 → 352: not the same measurement: the legacy counted step ids its own catalog did not name; `flaggedSteps` counts entries of fm's `script.problems[]`, the steps fm itself flagged. The row is here so the drift signal has a number on both sides, not because they should agree.
- `s.customs.custom_function_count` 15 → 9: the legacy counts the 9 functions plus the 3 folders and 3 `--` separators that share the catalog; the new inspector rows only entries fm types `customFunction` (ui/tabs/catalogs.js). 9 + 6 = 15.
- `s.menus.custom_menu_set_count` 2 → 3: fm lists `[Standard FileMaker Menus]` as a menu set; the export carries it as a `CustomMenuSetReference` outside the `ObjectList` the legacy counts. Two user sets on both sides.
- `s.ext.external_data_source_count` 0 → 7: the legacy queries `ExternalDataSourcesCatalog`; the element is `ExternalDataSourceCatalog` (no "s"), so its count is always 0. The export really carries 7, and `read:externalDataSource` lists 7.
- `s.ext.odbc_count` 0 → 2: same legacy defect: it queries an `ODBCDataSourceCatalog` element that FileMaker does not write. ODBC sources are `ExternalDataSource type="ODBC"` entries; the export has 2 (ETS_22_0, mariadb_wugin) and fm types both `odbc`.
- `s.library.binary_data_count` 0 → —: dropped by owner ruling 2026-09-14 (inventory row `s.library.binary_data_count`): the image/binary library is not part of the analysis. Both sides read 0 here anyway; the new one has no such counter.
- `s.unrefs.table_occurrences` 0 → 6: the legacy hard-codes this list empty (its own comment: "Keep this list empty to avoid double-counting; the real figures come from toRemovability") and reports the answer under `s.unrefs.to_removability` instead, where `relationship_only` is 6 -- the same 6 occurrences (`FM26Test_Source__*`) the new list names, at tier `relationship-only`.
- `s.unrefs.scripts` 0 → 36: the legacy marks a script referenced if ANY `<ScriptReference>` names it anywhere in the document. `Ooe_PrivilegeSetsCatalog.xml` carries 116 of them -- a privilege set's per-script access row names every script in the file -- so every script looks referenced and the list is empty by construction. The new inspector counts call sites only (steps, layout object actions, layout triggers, custom menu items) and says so in its confidence notes: "A privilege set's custom access lists can name individual layouts, scripts and value lists; the reference scan does not read them."
- `s.unrefs.value_lists` 0 → 4: the same legacy rule as scripts: any `<ValueListReference>` anywhere counts, and the privilege-set catalog names all 8 value lists, so the legacy list is empty by construction. The new list names the 4 no layout, field or script uses (`from_another_file`, `from_another_file_two`, `TestTable | TextField1 with options`, `TestTable | TextField1 with other options`).
- `s.unrefs (custom functions)` — → 6: the legacy has no unreferenced-custom-function list; `s.customs` counts references but never subtracts them. A new category, not a difference in an old one.
- `s.unrefs.unused_styles` 60 → 184: different denominators. The legacy de-duplicates style DISPLAY NAMES across themes into one flat set (60 distinct names on ooe) and then finds none of them used, so 60 of 60. The new list is per theme -- the same 189 the `s.themes.style_count` row agrees on -- and finds 5 worn, so 184 of 189. Neither side reads a part's style (inventory `catalog-layout-parts`; the register's `part:` entries name every key a part carries and a style is not among them), and an object carrying only local CSS is invisible to both (inventory `catalog-object-styles`).
- `s.unrefs.broken` 13 → 360: different populations. The legacy list is one check: 13 Perform Script steps with an empty script reference. The new list is four kinds -- fm's own `script.problems[]` (352 steps fm could not fully render, e.g. `Insert from Device`), 5 `<Function Missing>` markers, 0 unresolved occurrences and 3 dangling names (`Invoice::CreatedBy`, value list `VL`, table `Invoice`). The 352 dominate the total and are a statement about fm's step coverage, not about the file; see "Concerns" below.

### gap (6)

- `s.layouts.local_css_node_count` 495 → —: inventory `catalog-object-styles`; toolkit register `layout-object:edit-box`, `layout-object:text` and `layout-object:container`, attribute "local style overrides (the object's own CSS)" at `LocalCSS`. fm reports `objects[].style` -- the named style's display name -- and nothing for an object's own CSS, so the property count has no source.
- `s.plugins.plugin_function_count` 1 → —: inventory `catalog-plugins`; toolkit register `plugin-call-sites`. Nothing in fm marks a calculation call site as a plug-in function call (fm's evaluator answers `calc_unknown_function` for a function no installed plug-in declares), so the new inspector has no plug-in number at all.
- `s.tags.unique_count` 2 → —: inventory `catalog-tags`; toolkit register `layout` attribute "tag list" and `script` attribute "script tags", both `TagList`, both unreported. fm reports tags on fields, occurrences, custom menus and menu sets but not on layouts or scripts, so no total over all four kinds can be formed. The new inspector shows tags per object and reports no tag totals.
- `s.tags.custom_count` 0 → —: inventory `catalog-tags`, toolkit register `layout` / `script`, same reason.
- `s.unrefs.fields` 30 → 34: inventory `catalog-calculation-tokens`; toolkit register `calculation-tokens`. The 4 extra rows are `Contacts::listOf_s`, `TestTable::MyGlobal_g`, `TestTable::field_that_contains_array` and `TestTable::field_that_contains_embedding`: each IS named, but only inside calculation text or a sort spec, so the new list keeps them at tier `text-only` rather than calling them used. The legacy read FileMaker's own token stream (DDR chunks) and could resolve them exactly. Counting only the `none` tier, the two lists are the same claim: 29 + the legacy's one text-only row (`Contacts::OrderOfOperationsTest_u`) = 30.
- `s.unrefs.fields (tier `none` only)` 30 → 29: inventory `catalog-calculation-tokens`, toolkit register `calculation-tokens`, same rows; shown separately so the strength of the claim is visible. See the row above.

## Bugs

None. Every difference the comparison exposed resolved to export drift, a register gap, or a deliberate derivation -- in four cases a deliberate derivation that is right where the legacy was wrong (`s.ext.external_data_source_count`, `s.ext.odbc_count`, `s.unrefs.scripts`, `s.unrefs.value_lists`).

## Live vs fixture

Run both ways on 2026-09-16 -- once over `tests/fixtures/ooe` and once with `--live` against `fmnet://localhost/ooe` as `admin` through the keychain, reads only. **Every one of the 61 rows is identical**, so nothing in this table depends on the recording rather than on the file, and the fixture is current with respect to every number here.

## Concerns for the final review

1. **`broken` is dominated by fm's step-rendering coverage.** 352 of the 360 rows are entries of `script.problems[]`, one per step fm could not fully render (`Insert from Device`, `Set Data File Position`, `Paste`, …). `ui/tabs/scripts.js` says of the same list: "They are fm's report about fm, not a finding about the file, so the tab says who flagged them and never calls the steps unknown." `ui/analysis/broken.js` folds them into the broken-reference list all the same, and the Analysis tab's "Broken" scoreboard therefore reads 360 on a file with 8 findings about itself. Both are deliberate and documented, but they cannot both be the right framing; the owner should pick one.
2. **The legacy's one broken-reference check has no successor.** 13 Perform Script steps with an empty script reference. fm flags 7 `Perform Script` steps in its `problems[]`, which is neither the same set nor the same question; no check in `ui/analysis/` looks for a step whose script slot is empty.
3. **Script-issue counts are per step, the legacy's were per script.** `scriptIssues` returns 709 `psos-only-step`, 65 `embedded-credential`, 11 `dead-set-variable`, 4 `literal-account` and 4 `swallowed-error` rows where `s.deep` counted 4, 0, 10, 2 and 0 SCRIPTS. Deliberate (a row per site is what the tab drills into) and outside this table's scope, but the two numbers will look like a regression to anyone who knew the old ones.

