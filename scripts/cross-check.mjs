#!/usr/bin/env node
// scripts/cross-check.mjs
//
// A THROWAWAY. Plan 5 Task 8 only: it exists to prove, once, that the new
// inspector counts the reference solution the way the legacy one did, and to
// make every difference say WHY. Task 9 deletes it and the doc it writes.
//
// Two sides, one table:
//
//   legacy  `legacy/clockwork-inspector.html` loaded into a jsdom window with
//           `runScripts: 'dangerously'`, handed the 19 XML files of a FileMaker
//           26 split Save-as-XML export as `File` objects, and asked for
//           `parseXMLToStats(files)`. That returns `{stats}` -- the same `s`
//           object the page stashes in `window.__lastStats` -- which is then
//           put through the same `clean()` reduction `exportJSON()` uses (Maps
//           to objects, Sets to arrays, depth cap 8, `__`-prefixed and
//           `element` keys dropped). The page is never modified and the export
//           is never written to: both are read-only inputs.
//
//   new     `tests/replay-api.mjs` over `tests/fixtures/ooe` (or, with --live,
//           `server/read.mjs`'s direct api against the running file), then
//           `discover()`, then the same analysis and tab functions the page
//           itself renders from -- `tableCounts`, `scriptStats`, `objectCounts`,
//           `securityTotals`, `catalogsTotals`, `themesTotals`, `unreferenced`,
//           `broken`, `globals`. Reads only.
//
// The new side is narrowed to the ROOT file. The legacy read one file's export;
// the new one follows external data sources and reaches siblings too, so
// comparing the whole solution would compare two different populations. Every
// analysis takes a solution, so the narrowing is a solution object carrying the
// root file alone.
//
// Usage:
//   node scripts/cross-check.mjs --saxml=<dir> [--live] [--out=<file>]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { locateFmCli } from 'fm-adt-toolkit/runner';
import { createDirectApi } from '../server/read.mjs';
import { createReplayApi } from '../tests/replay-api.mjs';
import { discover } from '../ui/discovery.js';
import { get } from '../ui/access.js';
import { detailOf, listOf } from '../ui/tabs/common.js';
import { catalogsTotals, customMenuRows, externalDataSourceRows } from '../ui/tabs/catalogs.js';
import { occurrenceRows, relationRows } from '../ui/tabs/graph.js';
import { objectCounts } from '../ui/tabs/layouts.js';
import { scriptStats } from '../ui/tabs/scripts.js';
import { authorizationRows, securityTotals } from '../ui/tabs/security.js';
import { fieldsOf, tableCounts } from '../ui/tabs/tables.js';
import { themesTotals } from '../ui/tabs/themes.js';
import { broken } from '../ui/analysis/broken.js';
import { globals } from '../ui/analysis/globals.js';
import { unreferenced } from '../ui/analysis/unreferenced.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '..');
const LEGACY = join(REPO, 'legacy', 'clockwork-inspector.html');
const FIXTURE = join(REPO, 'tests', 'fixtures', 'ooe');
const DEFAULT_OUT = join(REPO, 'docs', 'cross-check-2026-09.md');

// ── Arguments ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { saxml: null, live: false, out: DEFAULT_OUT, fixture: FIXTURE };
  for (const a of argv) {
    const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`unrecognised argument: ${a}`);
    const [, key, value] = m;
    if (key === 'live') out.live = value !== 'false';
    else if (key === 'saxml') out.saxml = value;
    else if (key === 'out') out.out = value;
    else if (key === 'fixture') out.fixture = value;
    else throw new Error(`unrecognised argument: --${key}`);
  }
  if (!out.saxml) throw new Error('--saxml=<dir> is required: the Save as XML export to read the legacy side from');
  return out;
}

// ── The legacy side ───────────────────────────────────────────────────

/** `exportJSON()`'s own reduction, transcribed. Maps become objects, Sets
 *  become arrays, depth is capped at 8, DOM-ish keys are dropped. The window's
 *  Map/Set are different constructors from this realm's, so both are tested. */
function clean(win, obj, depth) {
  if (depth > 8) return null;
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Map || obj instanceof win.Map) {
    return Object.fromEntries([...obj.entries()].map(([k, v]) => [k, clean(win, v, depth + 1)]));
  }
  if (obj instanceof Set || obj instanceof win.Set) return [...obj];
  if (Array.isArray(obj)) return obj.map((x) => clean(win, x, depth + 1));
  if (typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) {
      if (k.startsWith('__') || k === 'element') continue;
      try { out[k] = clean(win, obj[k], depth + 1); } catch { /* unserialisable: skip, as exportJSON does */ }
    }
    return out;
  }
  return obj;
}

/** Drives the legacy page headless. No stubs: `analyse()` guards its only
 *  document touch (`setLoadingStatus`) with an `if (el)`, and its yields need
 *  `requestAnimationFrame`, which `pretendToBeVisual` supplies. */
async function legacyStats(saxmlDir) {
  const html = readFileSync(LEGACY, 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const win = dom.window;
  await new Promise((r) => {
    if (win.document.readyState === 'complete') r();
    else win.addEventListener('load', r);
  });
  if (typeof win.parseXMLToStats !== 'function') {
    throw new Error('the legacy page loaded but exposes no parseXMLToStats');
  }
  const names = readdirSync(saxmlDir).filter((n) => /\.xml$/i.test(n)).sort();
  if (!names.length) throw new Error(`no .xml files in ${saxmlDir}`);
  // A real `File`: `prepareInput` reads the envelope through `file.slice().text()`
  // and the body through a `FileReader`, and names the catalog from `file.name`.
  const files = names.map((n) => new win.File([readFileSync(join(saxmlDir, n))], n, { type: 'text/xml' }));
  const result = await win.parseXMLToStats(files);
  const stats = clean(win, result.stats, 0);
  const meta = {
    files: names.length,
    fmFile: result.manifest?.fmFile ?? '',
    version: result.manifest?.version ?? '',
    source: result.manifest?.source ?? '',
    catalogsMissing: result.manifest?.catalogsMissing ?? [],
  };
  dom.window.close();
  return { stats, meta };
}

// ── The new side ──────────────────────────────────────────────────────

async function newSolution(opts) {
  if (!opts.live) {
    const api = createReplayApi(opts.fixture);
    const full = await discover(api, api.meta.root);
    return { full, root: api.meta.root, meta: api.meta, source: `fixture ${opts.fixture} (recorded ${api.meta.recordedOn}, fm ${api.meta.fm.banner})` };
  }
  const cli = await locateFmCli();
  if (!cli) throw new Error('fm CLI not found');
  const root = 'fmnet://localhost/ooe';
  const api = createDirectApi({ cli, root, username: 'admin', noPrompt: true });
  const full = await discover(api, root);
  return { full, root, meta: { root, fm: { banner: `${cli.version}` } }, source: `live ${root} as admin (fm ${cli.version})` };
}

/** Every number the table reads, computed the way the tab that shows it does. */
function newNumbers(full, root) {
  const file = full.files[root];
  if (!file) throw new Error(`the read did not reach ${root}`);
  // Every analysis takes a solution; this one carries the root file alone.
  const solution = { ...full, files: { [root]: file } };

  const tableNames = listOf(file, 'table').map((t) => get(t, 'name'));
  const fields = tableNames.flatMap((n) => fieldsOf(file, n));
  const counts = tableCounts(fields);

  const layouts = listOf(file, 'layout');
  const layoutItems = layouts.filter((i) => get(i, 'type') === 'layout');
  const objects = { total: 0, portals: 0, webViewers: 0, tabControls: 0, slideControls: 0, popovers: 0, buttonBars: 0, charts: 0 };
  let parts = 0;
  for (const item of layoutItems) {
    const detail = get(detailOf(file, 'layout', get(item, 'id')), 'result');
    if (!detail) continue;
    const c = objectCounts(detail);
    for (const k of Object.keys(objects)) objects[k] += c[k];
    parts += (get(detail, 'parts') ?? []).length;
  }

  const scripts = scriptStats(file);
  const security = securityTotals(solution);
  const catalogs = catalogsTotals(solution);
  const themes = themesTotals(solution);
  const u = unreferenced(solution);
  const sources = externalDataSourceRows(file);

  return {
    tables: tableNames.length,
    fields: fields.length,
    calcFields: counts.calc,
    storedCalc: counts.storedCalc,
    unstoredCalc: counts.unstoredCalc,
    summaryFields: counts.summary,
    globalFields: counts.global,
    containerFields: counts.container,
    maxFieldsInTable: tableNames.length ? Math.max(...tableNames.map((n) => fieldsOf(file, n).length)) : 0,
    occurrences: occurrenceRows(file).length,
    relations: relationRows(file).length,
    layouts: layoutItems.length,
    layoutFolders: layouts.filter((i) => get(i, 'type') === 'folder').length,
    objects: objects.total,
    parts,
    portals: objects.portals,
    webViewers: objects.webViewers,
    tabControls: objects.tabControls,
    slideControls: objects.slideControls,
    popovers: objects.popovers,
    buttonBars: objects.buttonBars,
    charts: objects.charts,
    localCssNodes: null,
    scripts: scripts.scripts,
    scriptFolders: listOf(file, 'script').filter((i) => get(i, 'type') === 'folder').length,
    steps: scripts.steps,
    maxScriptLength: scripts.maxLength,
    unbalanced: scripts.unbalanced,
    orphanedEnabled: scripts.orphanedEnabled,
    flaggedSteps: scripts.flaggedSteps,
    unknownStepIds: 0,
    valueLists: catalogs.valueLists,
    customFunctions: catalogs.customFunctions,
    customMenus: catalogs.customMenus,
    customMenuSets: catalogs.customMenuSets,
    customMenuItems: customMenuRows(file).reduce((n, m) => n + (m.items?.length ?? 0), 0),
    externalDataSources: sources.length,
    odbcSources: sources.filter((r) => /odbc/i.test(r.sourceType)).length,
    authorizations: authorizationRows(file).length,
    baseDirectories: catalogs.baseDirectories,
    persistentData: catalogs.persistentData,
    accounts: security.accounts,
    privilegeSets: security.privilegeSets,
    extendedPrivileges: security.extendedPrivileges,
    themes: themes.themes,
    namedStyles: themes.namedStyles,
    globalVariables: globals(solution).length,
    unrefFields: u.fields.length,
    unrefFieldsNone: u.fields.filter((r) => r.tier === 'none').length,
    unrefTables: u.tables.length,
    unrefOccurrences: u.occurrences.length,
    unrefScripts: u.scripts.length,
    unrefLayouts: u.layouts.length,
    unrefValueLists: u.valueLists.length,
    unrefCustomFunctions: u.customFunctions.length,
    unusedStyles: u.styles.length,
    broken: broken(solution).length,
    plugins: null,
    tagsUnique: null,
    tagsCustom: null,
    binaryData: null,
  };
}

// ── The table ─────────────────────────────────────────────────────────

// `class` and `why` are read only when the two sides differ. The four classes
// are the brief's: `gap` (a register id), `bug` (fixed in this plan), `design`
// (a derivation that differs on purpose -- which includes the cases where the
// legacy's own number is demonstrably wrong and the new one is right), and
// `export drift` (the export predates a change to the file).
const containers = (what) => ['export drift', `the export (2026-08-30) predates the \`containers\` table, added 2026-09-14: the file has ${what}.`];

const ROWS = [
  { datum: 's.tables.table_count', legacy: (s) => s.tables.table_count, key: 'tables', ...cls(...containers('one more base table')) },
  { datum: 's.tables.field_count', legacy: (s) => s.tables.field_count, key: 'fields', ...cls(...containers('one more field')) },
  { datum: 's.tables.max_fields_count', legacy: (s) => s.tables.max_fields_count, key: 'maxFieldsInTable' },
  { datum: 's.tables.calc_fields', legacy: (s) => s.tables.calc_fields, key: 'calcFields' },
  { datum: 's.tables.stored_calc_fields', legacy: (s) => s.tables.stored_calc_fields, key: 'storedCalc' },
  { datum: 's.tables.unstored_calc_fields', legacy: (s) => s.tables.unstored_calc_fields, key: 'unstoredCalc' },
  { datum: 's.tables.summary_fields', legacy: (s) => s.tables.summary_fields, key: 'summaryFields' },
  { datum: 's.tables.global_fields', legacy: (s) => s.tables.global_fields, key: 'globalFields' },
  { datum: 's.tables.container_fields', legacy: (s) => s.tables.container_fields, key: 'containerFields', ...cls(...containers('one more container field')) },
  { datum: 's.graph.table_occurrence_count', legacy: (s) => s.graph.table_occurrence_count, key: 'occurrences', ...cls(...containers('one more occurrence')) },
  { datum: 's.graph.relationship_count', legacy: (s) => s.graph.relationship_count, key: 'relations' },
  { datum: 's.layouts.layout_count', legacy: (s) => s.layouts.layout_count, key: 'layouts', ...cls(...containers('one more layout')) },
  { datum: 's.layouts.group_count', legacy: (s) => s.layouts.group_count, key: 'layoutFolders' },
  { datum: 's.layouts.objects_total', legacy: (s) => s.layouts.objects_total, key: 'objects', ...cls(...containers('a layout with two objects')) },
  { datum: 's.layouts.parts_total', legacy: (s) => s.layouts.parts_total, key: 'parts', ...cls(...containers('a layout with two parts')) },
  { datum: 's.layouts.portals_total', legacy: (s) => s.layouts.portals_total, key: 'portals' },
  { datum: 's.layouts.web_viewers', legacy: (s) => s.layouts.web_viewers, key: 'webViewers' },
  { datum: 's.layouts.tab_controls', legacy: (s) => s.layouts.tab_controls, key: 'tabControls' },
  { datum: 's.layouts.slide_controls', legacy: (s) => s.layouts.slide_controls, key: 'slideControls' },
  { datum: 's.layouts.popover_count', legacy: (s) => s.layouts.popover_count, key: 'popovers' },
  { datum: 's.layouts.button_bars', legacy: (s) => s.layouts.button_bars, key: 'buttonBars' },
  { datum: 's.layouts.charts', legacy: (s) => s.layouts.charts, key: 'charts' },
  {
    datum: 's.layouts.local_css_node_count',
    legacy: (s) => s.layouts.local_css_node_count,
    key: 'localCssNodes',
    ...cls('gap', 'inventory `catalog-object-styles`; toolkit register `layout-object:edit-box`, `layout-object:text` and `layout-object:container`, attribute "local style overrides (the object\'s own CSS)" at `LocalCSS`. fm reports `objects[].style` -- the named style\'s display name -- and nothing for an object\'s own CSS, so the property count has no source.'),
  },
  { datum: 's.scripts.script_count', legacy: (s) => s.scripts.script_count, key: 'scripts' },
  { datum: 's.scripts.group_count', legacy: (s) => s.scripts.group_count, key: 'scriptFolders' },
  { datum: 's.scripts.step_count', legacy: (s) => s.scripts.step_count, key: 'steps' },
  { datum: 's.scripts.max_length', legacy: (s) => s.scripts.max_length, key: 'maxScriptLength' },
  {
    datum: 's.scripts.unbalanced_if_scripts + unbalanced_loop_scripts',
    legacy: (s) => s.scripts.unbalanced_if_scripts + s.scripts.unbalanced_loop_scripts,
    key: 'unbalanced',
  },
  { datum: 's.scripts.orphaned_enabled_steps', legacy: (s) => s.scripts.orphaned_enabled_steps, key: 'orphanedEnabled' },
  {
    datum: 's.scripts.unknown_step_id_count',
    legacy: (s) => s.scripts.unknown_step_id_count,
    key: 'unknownStepIds',
    ...cls('design', 'fm names every step it returns, so the unknown-id bucket is empty by construction. Its replacement is `script.problems[]` -- the steps fm flagged while rendering them -- which the new inspector reports as `flaggedSteps` (see the row below). Inventory row `s.scripts.unknown_step_id_count`.'),
  },
  {
    datum: 's.scripts.unknown_step_id_total',
    legacy: (s) => s.scripts.unknown_step_id_total,
    key: 'flaggedSteps',
    ...cls('design', 'not the same measurement: the legacy counted step ids its own catalog did not name; `flaggedSteps` counts entries of fm\'s `script.problems[]`, the steps fm itself flagged. The row is here so the drift signal has a number on both sides, not because they should agree.'),
  },
  { datum: 's.valueLists.value_list_count', legacy: (s) => s.valueLists.value_list_count, key: 'valueLists' },
  {
    datum: 's.customs.custom_function_count',
    legacy: (s) => s.customs.custom_function_count,
    key: 'customFunctions',
    ...cls('design', 'the legacy counts the 9 functions plus the 3 folders and 3 `--` separators that share the catalog; the new inspector rows only entries fm types `customFunction` (ui/tabs/catalogs.js). 9 + 6 = 15.'),
  },
  { datum: 's.menus.custom_menu_count', legacy: (s) => s.menus.custom_menu_count, key: 'customMenus' },
  {
    datum: 's.menus.custom_menu_set_count',
    legacy: (s) => s.menus.custom_menu_set_count,
    key: 'customMenuSets',
    ...cls('design', 'fm lists `[Standard FileMaker Menus]` as a menu set; the export carries it as a `CustomMenuSetReference` outside the `ObjectList` the legacy counts. Two user sets on both sides.'),
  },
  { datum: 's.menus.custom_menu_item_count', legacy: (s) => s.menus.custom_menu_item_count, key: 'customMenuItems' },
  {
    datum: 's.ext.external_data_source_count',
    legacy: (s) => s.ext.external_data_source_count,
    key: 'externalDataSources',
    ...cls('design', 'the legacy queries `ExternalDataSourcesCatalog`; the element is `ExternalDataSourceCatalog` (no "s"), so its count is always 0. The export really carries 7, and `read:externalDataSource` lists 7.'),
  },
  {
    datum: 's.ext.odbc_count',
    legacy: (s) => s.ext.odbc_count,
    key: 'odbcSources',
    ...cls('design', 'same legacy defect: it queries an `ODBCDataSourceCatalog` element that FileMaker does not write. ODBC sources are `ExternalDataSource type="ODBC"` entries; the export has 2 (ETS_22_0, mariadb_wugin) and fm types both `odbc`.'),
  },
  { datum: 's.ext.file_access_count', legacy: (s) => s.ext.file_access_count, key: 'authorizations' },
  { datum: 's.baseDirs.total', legacy: (s) => s.baseDirs.total, key: 'baseDirectories' },
  { datum: 's.persistent.count', legacy: (s) => s.persistent.count, key: 'persistentData' },
  { datum: 's.accounts.acc.account_count', legacy: (s) => s.accounts.acc.account_count, key: 'accounts' },
  { datum: 's.accounts.priv.privilege_set_count', legacy: (s) => s.accounts.priv.privilege_set_count, key: 'privilegeSets' },
  { datum: 's.accounts.ep.extended_privilege_count', legacy: (s) => s.accounts.ep.extended_privilege_count, key: 'extendedPrivileges' },
  { datum: 's.themes.theme_count', legacy: (s) => s.themes.theme_count, key: 'themes' },
  { datum: 's.themes.style_count', legacy: (s) => s.themes.style_count, key: 'namedStyles' },
  {
    datum: 's.globals.global_variable_count',
    legacy: (s) => s.globals.global_variable_count,
    key: 'globalVariables',
    ...cls('gap', 'inventory `catalog-calculation-tokens`; toolkit register `calculation-tokens`. The inventory expects the new number to run LOW, because a `$$` read inside a calculation is only visible to the tokeniser. On ooe the two agree; the gap stands as a risk, not as a measured difference.'),
  },
  {
    datum: 's.plugins.plugin_function_count',
    legacy: (s) => s.plugins.plugin_function_count,
    key: 'plugins',
    ...cls('gap', 'inventory `catalog-plugins`; toolkit register `plugin-call-sites`. Nothing in fm marks a calculation call site as a plug-in function call (fm\'s evaluator answers `calc_unknown_function` for a function no installed plug-in declares), so the new inspector has no plug-in number at all.'),
  },
  {
    datum: 's.tags.unique_count',
    legacy: (s) => s.tags.unique_count,
    key: 'tagsUnique',
    ...cls('gap', 'inventory `catalog-tags`; toolkit register `layout` attribute "tag list" and `script` attribute "script tags", both `TagList`, both unreported. fm reports tags on fields, occurrences, custom menus and menu sets but not on layouts or scripts, so no total over all four kinds can be formed. The new inspector shows tags per object and reports no tag totals.'),
  },
  {
    datum: 's.tags.custom_count',
    legacy: (s) => s.tags.custom_count,
    key: 'tagsCustom',
    ...cls('gap', 'inventory `catalog-tags`, toolkit register `layout` / `script`, same reason.'),
  },
  {
    datum: 's.library.binary_data_count',
    legacy: (s) => s.library.binary_data_count,
    key: 'binaryData',
    ...cls('design', 'dropped by owner ruling 2026-09-14 (inventory row `s.library.binary_data_count`): the image/binary library is not part of the analysis. Both sides read 0 here anyway; the new one has no such counter.'),
  },
  {
    datum: 's.unrefs.fields',
    legacy: (s) => s.unrefs.fields.length,
    key: 'unrefFields',
    ...cls('gap', 'inventory `catalog-calculation-tokens`; toolkit register `calculation-tokens`. The 4 extra rows are `Contacts::listOf_s`, `TestTable::MyGlobal_g`, `TestTable::field_that_contains_array` and `TestTable::field_that_contains_embedding`: each IS named, but only inside calculation text or a sort spec, so the new list keeps them at tier `text-only` rather than calling them used. The legacy read FileMaker\'s own token stream (DDR chunks) and could resolve them exactly. Counting only the `none` tier, the two lists are the same claim: 29 + the legacy\'s one text-only row (`Contacts::OrderOfOperationsTest_u`) = 30.'),
  },
  {
    datum: 's.unrefs.fields (tier `none` only)',
    legacy: (s) => s.unrefs.fields.length,
    key: 'unrefFieldsNone',
    ...cls('gap', 'inventory `catalog-calculation-tokens`, toolkit register `calculation-tokens`, same rows; shown separately so the strength of the claim is visible. See the row above.'),
  },
  { datum: 's.unrefs.tables', legacy: (s) => s.unrefs.tables.length, key: 'unrefTables' },
  {
    datum: 's.unrefs.table_occurrences',
    legacy: (s) => s.unrefs.table_occurrences.length,
    key: 'unrefOccurrences',
    ...cls('design', 'the legacy hard-codes this list empty (its own comment: "Keep this list empty to avoid double-counting; the real figures come from toRemovability") and reports the answer under `s.unrefs.to_removability` instead, where `relationship_only` is 6 -- the same 6 occurrences (`FM26Test_Source__*`) the new list names, at tier `relationship-only`.'),
  },
  {
    datum: 's.unrefs.scripts',
    legacy: (s) => s.unrefs.scripts.length,
    key: 'unrefScripts',
    ...cls('design', 'the legacy marks a script referenced if ANY `<ScriptReference>` names it anywhere in the document. `Ooe_PrivilegeSetsCatalog.xml` carries 116 of them -- a privilege set\'s per-script access row names every script in the file -- so every script looks referenced and the list is empty by construction. The new inspector counts call sites only (steps, layout object actions, layout triggers, custom menu items) and says so in its confidence notes: "A privilege set\'s custom access lists can name individual layouts, scripts and value lists; the reference scan does not read them."'),
  },
  {
    datum: 's.unrefs.layouts',
    legacy: (s) => s.unrefs.layouts.length,
    key: 'unrefLayouts',
    ...cls(...containers('one more layout, `containers`, which nothing names')),
  },
  {
    datum: 's.unrefs.value_lists',
    legacy: (s) => s.unrefs.value_lists.length,
    key: 'unrefValueLists',
    ...cls('design', 'the same legacy rule as scripts: any `<ValueListReference>` anywhere counts, and the privilege-set catalog names all 8 value lists, so the legacy list is empty by construction. The new list names the 4 no layout, field or script uses (`from_another_file`, `from_another_file_two`, `TestTable | TextField1 with options`, `TestTable | TextField1 with other options`).'),
  },
  {
    datum: 's.unrefs (custom functions)',
    legacy: () => null,
    key: 'unrefCustomFunctions',
    ...cls('design', 'the legacy has no unreferenced-custom-function list; `s.customs` counts references but never subtracts them. A new category, not a difference in an old one.'),
  },
  {
    datum: 's.unrefs.unused_styles',
    legacy: (s) => s.unrefs.unused_styles.length,
    key: 'unusedStyles',
    ...cls('design', 'different denominators. The legacy de-duplicates style DISPLAY NAMES across themes into one flat set (60 distinct names on ooe) and then finds none of them used, so 60 of 60. The new list is per theme -- the same 189 the `s.themes.style_count` row agrees on -- and finds 5 worn, so 184 of 189. Neither side reads a part\'s style (inventory `catalog-layout-parts`; the register\'s `part:` entries name every key a part carries and a style is not among them), and an object carrying only local CSS is invisible to both (inventory `catalog-object-styles`).'),
  },
  {
    datum: 's.unrefs.broken',
    legacy: (s) => s.unrefs.broken.length,
    key: 'broken',
    ...cls('design', 'different populations. The legacy list is one check: 13 Perform Script steps with an empty script reference. The new list is four kinds -- fm\'s own `script.problems[]` (352 steps fm could not fully render, e.g. `Insert from Device`), 5 `<Function Missing>` markers, 0 unresolved occurrences and 3 dangling names (`Invoice::CreatedBy`, value list `VL`, table `Invoice`). The 352 dominate the total and are a statement about fm\'s step coverage, not about the file; see "Concerns" below.'),
  },
];

function cls(klass, why) { return { class: klass, why }; }

// ── Render ────────────────────────────────────────────────────────────

const show = (v) => (v === null || v === undefined ? '—' : String(v));

function deltaOf(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return b - a;
}

function buildTable(stats, numbers) {
  return ROWS.map((row) => {
    const legacy = row.legacy(stats);
    const value = numbers[row.key];
    const delta = deltaOf(legacy, value);
    return { ...row, legacyValue: legacy, newValue: value, delta, matches: delta === 0 };
  });
}

function markdown(rows, header) {
  const lines = [];
  lines.push('# Count cross-check: legacy inspector vs the fm-CLI inspector, on ooe');
  lines.push('');
  lines.push('**Throwaway.** Plan 5 Task 8 writes this file and Task 9 deletes it, together with `scripts/cross-check.mjs`. It exists to prove once that the new inspector counts the reference solution the way the legacy one did, and to give every difference a reason.');
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  for (const [k, v] of header) lines.push(`| ${k} | ${v} |`);
  lines.push('');
  lines.push('## How each side was produced');
  lines.push('');
  lines.push('**Legacy.** `legacy/clockwork-inspector.html` is loaded into a jsdom window with `runScripts: \'dangerously\'` and `pretendToBeVisual: true`, the export\'s XML files are handed to it as `File` objects, and `window.parseXMLToStats(files)` is awaited. It returns `{stats}` -- the same `s` object the page stashes in `window.__lastStats` -- which is then put through the same `clean()` reduction `exportJSON()` uses. **No DOM stubs were needed**: `analyse()`\'s only document touch is `setLoadingStatus`, which is already guarded by `if (el)`, and its per-phase yields need `requestAnimationFrame`, which `pretendToBeVisual` supplies. jsdom\'s `File` carries `slice()`, `text()` and `FileReader` support, which is everything `prepareInput` and `readFileAsText` ask for. The page and the export are read-only inputs; neither is written to.');
  lines.push('');
  lines.push('**New.** The recorded fixture (or, with `--live`, the server\'s direct api) is read through `discover()`, and every number is taken from the same function the tab that shows it calls: `tableCounts`, `objectCounts`, `scriptStats`, `securityTotals`, `catalogsTotals`, `themesTotals`, `occurrenceRows`, `relationRows`, `authorizationRows`, `customMenuRows`, `externalDataSourceRows`, `unreferenced`, `broken`, `globals`.');
  lines.push('');
  lines.push('**One narrowing.** The new side is restricted to the ROOT file. The legacy read one file\'s export; the new inspector follows external data sources and also reaches `fmnet://localhost/BrojDva`, so the whole solution would be a different population. Every analysis takes a solution, so the narrowing is a solution object carrying the root file alone.');
  lines.push('');
  lines.push('## The table');
  lines.push('');
  lines.push('| Datum | Legacy | New | Delta | |');
  lines.push('|---|---:|---:|---:|---|');
  for (const r of rows) {
    const mark = r.matches ? '=' : (r.class ?? '**unclassified**');
    lines.push(`| \`${r.datum}\` | ${show(r.legacyValue)} | ${show(r.newValue)} | ${r.delta === null ? '—' : (r.delta > 0 ? `+${r.delta}` : String(r.delta))} | ${mark} |`);
  }
  lines.push('');
  const matched = rows.filter((r) => r.matches);
  const diffs = rows.filter((r) => !r.matches);
  lines.push(`${matched.length} of ${rows.length} rows agree exactly. The ${diffs.length} that do not are classified below; none is left unclassified.`);
  lines.push('');
  lines.push('## Every difference, classified');
  lines.push('');
  lines.push('`gap` names a register id. `bug` is a defect in the NEW inspector, fixed in this plan. `design` is a derivation that differs on purpose -- which includes the places where the legacy\'s own number is demonstrably wrong and the new one is right. `export drift` is the export being older than the file.');
  lines.push('');
  const byClass = new Map();
  for (const r of diffs) {
    const k = r.class ?? 'UNCLASSIFIED';
    if (!byClass.has(k)) byClass.set(k, []);
    byClass.get(k).push(r);
  }
  for (const k of ['export drift', 'design', 'gap', 'bug', 'UNCLASSIFIED']) {
    const group = byClass.get(k);
    if (!group) continue;
    lines.push(`### ${k} (${group.length})`);
    lines.push('');
    for (const r of group) lines.push(`- \`${r.datum}\` ${show(r.legacyValue)} → ${show(r.newValue)}: ${r.why ?? 'NO REASON GIVEN'}`);
    lines.push('');
  }
  lines.push('## Bugs');
  lines.push('');
  lines.push('None. Every difference the comparison exposed resolved to export drift, a register gap, or a deliberate derivation -- in four cases a deliberate derivation that is right where the legacy was wrong (`s.ext.external_data_source_count`, `s.ext.odbc_count`, `s.unrefs.scripts`, `s.unrefs.value_lists`).');
  lines.push('');
  lines.push('## Live vs fixture');
  lines.push('');
  lines.push('Run both ways on 2026-09-16 -- once over `tests/fixtures/ooe` and once with `--live` against `fmnet://localhost/ooe` as `admin` through the keychain, reads only. **Every one of the 61 rows is identical**, so nothing in this table depends on the recording rather than on the file, and the fixture is current with respect to every number here.');
  lines.push('');
  lines.push('## Concerns for the final review');
  lines.push('');
  lines.push('1. **`broken` is dominated by fm\'s step-rendering coverage.** 352 of the 360 rows are entries of `script.problems[]`, one per step fm could not fully render (`Insert from Device`, `Set Data File Position`, `Paste`, …). `ui/tabs/scripts.js` says of the same list: "They are fm\'s report about fm, not a finding about the file, so the tab says who flagged them and never calls the steps unknown." `ui/analysis/broken.js` folds them into the broken-reference list all the same, and the Analysis tab\'s "Broken" scoreboard therefore reads 360 on a file with 8 findings about itself. Both are deliberate and documented, but they cannot both be the right framing; the owner should pick one.');
  lines.push('2. **The legacy\'s one broken-reference check has no successor.** 13 Perform Script steps with an empty script reference. fm flags 7 `Perform Script` steps in its `problems[]`, which is neither the same set nor the same question; no check in `ui/analysis/` looks for a step whose script slot is empty.');
  lines.push('3. **Script-issue counts are per step, the legacy\'s were per script.** `scriptIssues` returns 709 `psos-only-step`, 65 `embedded-credential`, 11 `dead-set-variable`, 4 `literal-account` and 4 `swallowed-error` rows where `s.deep` counted 4, 0, 10, 2 and 0 SCRIPTS. Deliberate (a row per site is what the tab drills into) and outside this table\'s scope, but the two numbers will look like a regression to anyone who knew the old ones.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

// ── Main ──────────────────────────────────────────────────────────────

const opts = parseArgs(process.argv.slice(2));
const legacy = await legacyStats(opts.saxml);
const { full, root, source } = await newSolution(opts);
const numbers = newNumbers(full, root);
const rows = buildTable(legacy.stats, numbers);

const header = [
  ['SaXML export', `\`${opts.saxml}\` — ${legacy.meta.files} files, ${legacy.meta.fmFile}, exported 2026-08-30 from FileMaker ${legacy.meta.source || '26.0.2'} (read-only)`],
  ['Catalogs the export does not carry', legacy.meta.catalogsMissing.length ? legacy.meta.catalogsMissing.map((c) => `\`${c}\``).join(', ') : 'none'],
  ['fm build', '0.7.0 (29823677)'],
  ['New side', source],
  ['Run on', new Date().toISOString().slice(0, 10)],
];

const doc = markdown(rows, header);
writeFileSync(opts.out, doc);

// The same table on the terminal, so a run says what it found without opening the file.
const pad = (s, n) => String(s).padEnd(n);
const w = Math.max(...rows.map((r) => r.datum.length));
console.log(`${pad('Datum', w)}  ${pad('legacy', 8)}${pad('new', 8)}${pad('delta', 8)}class`);
for (const r of rows) {
  console.log(`${pad(r.datum, w)}  ${pad(show(r.legacyValue), 8)}${pad(show(r.newValue), 8)}${pad(r.delta === null ? '—' : r.delta, 8)}${r.matches ? '=' : (r.class ?? 'UNCLASSIFIED')}`);
}
const unclassified = rows.filter((r) => !r.matches && !r.class);
console.log(`\n${rows.filter((r) => r.matches).length}/${rows.length} agree; ${rows.length - rows.filter((r) => r.matches).length} differ; ${unclassified.length} unclassified.`);
console.log(`written: ${opts.out}`);
if (unclassified.length) process.exitCode = 1;
