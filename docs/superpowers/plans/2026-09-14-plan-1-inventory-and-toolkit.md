# Plan 1: SaXML Inventory, fm-adt-toolkit Extraction, fm-ai Switch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the inventory that gates every later port, stand up the shared `fm-adt-toolkit` package (runner, step-display, gaps register with its check/report CLI), and switch fm-ai to consume it with its tests green.

**Architecture:** Three repos are touched. This repo gains a Node scaffold, the legacy HTML moved aside, and the inventory. A new repo `/Users/wdecorte/GitHub/fm-adt-toolkit` holds the shared ESM TypeScript package. fm-ai deletes the moved files and imports the package. No inspector server or UI is built in this plan; that is Plan 2.

**Tech Stack:** Node 22.19 (type stripping runs `.ts` directly), TypeScript 5.9 with `erasableSyntaxOnly` and `rewriteRelativeImportExtensions`, vitest 4 in the toolkit and fm-ai, `node --test` in this repo. Zero runtime dependencies anywhere.

**Spec:** `docs/superpowers/specs/2026-09-14-fm-cli-rewrite-design.md` (sections 1, 4, 5 are implemented here).

## Global Constraints

- Only `read:` ops are ever sent to `fmnet://localhost/ooe`. Never `create:`, `update:`, `delete:`, never `--create`, never `--dry-run` as a substitute.
- Credentials: `--username=admin --keychain --no-prompt` for scripted runs (the password is already in the keychain under the exact string `fmnet://localhost/ooe`). Never `--password`. Spell the target identically every time.
- Toolkit source is erasable TypeScript: no `enum`, no parameter properties, `import type` for every type-only import, relative imports written with the `.ts` extension.
- Zero runtime dependencies in the toolkit and in this repo.
- Every recorded fixture states the fm version it came from (`0.6.0 (29816214)`).
- Commit after each task. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- The `gh` CLI is not installed. Creating the GitHub remote for the toolkit is a manual step for the owner (Task 7 gives the exact commands); everything else in that task proceeds locally.

---

## File map

### This repo (`/Users/wdecorte/GitHub/FileMaker-inspector-open-source`)

| Path | Responsibility |
|---|---|
| `package.json` | ESM project, `node --test`, engines node >= 22.18, dependency on the toolkit (Task 9) |
| `.gitignore` | `node_modules/`, `.local/` |
| `legacy/clockwork-inspector.html` | The current single-file inspector, moved unchanged |
| `scripts/saxml-inventory.mjs` | Extracts every XML datum the legacy parsers read and every stats field the tabs render; writes the inventory skeleton |
| `tests/saxml-inventory.test.mjs` | Tests for the extraction functions |
| `docs/saxml-inventory.md` | The inventory, generated skeleton then hand-classified |
| `.local/fm-samples/*.ndjson` | Gitignored recorded fm output from ooe used while classifying |
| `CLAUDE.md` | Updated for the new layout |

### Toolkit repo (`/Users/wdecorte/GitHub/fm-adt-toolkit`)

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` | Package scaffold; `exports` for `types`, `runner`, `step-display`, `gaps`; `typesVersions` so node10 resolution (fm-ai's main build) finds the types |
| `src/types.ts` | The fm wire types shared by every consumer: `AdtOp`, `AdtOpError`, `AdtOpResult`, `AdtSummary`, `AdtNotice`, `AdtFatal`, `AdtRunResult`, `FmTarget`, `ScriptDetailStep` |
| `src/runner/locate.ts` | `locateFmCli`, `parseVersionBanner`, `FmCli`, `LocateDeps` (moved from fm-ai) |
| `src/runner/runner.ts` | `runOps`, `parseResultLines`, `opsToNdjson`, `RunOptions`, `buildArgv` (moved, extended) |
| `src/runner/index.ts` | Re-exports |
| `src/step-display/step-display.ts`, `step-display-render.ts`, `step-display-types.ts`, `index.ts` | Moved from fm-ai `src/shared/adt/` |
| `src/catalogs/fm-step-display.json` | Moved. Still the file `derive` and `roundtrip` write |
| `src/catalogs/fm-step-display.js` | Generated `export default {...}` twin of the JSON so a browser imports it without a bundler |
| `scripts/emit-catalog-module.mjs` | Writes the `.js` twin from the JSON |
| `scripts/derive-step-display.mjs`, `roundtrip-step-display.mjs`, `measure-step-flags.mjs`, `fm-script-align.mjs`, `fm-segment-parse.mjs` | Moved from fm-ai, paths updated |
| `fm_scripts/` | Moved corpus and README |
| `docs/fm-step-display-backlog.md`, `docs/fm-step-flags-reference.md` | Moved |
| `src/gaps/register.ts` | Register types, `loadRegister`, `saveRegister` |
| `src/gaps/checks.ts` | `keyPresent`, `opAccepted`, `stepNotOpaque`, `valueEquals`, `stepKeyPresent`, `evaluateCheck` |
| `src/gaps/check.ts` | `runChecks`: one fm invocation for every probe, evaluation, evidence recording, outcome lists |
| `src/gaps/report.ts` | `renderReport`: Markdown for Claris |
| `src/gaps/index.ts` | Re-exports |
| `gaps/register.json` | The register data, seeded |
| `bin/fm-gaps.mjs` | CLI: `check`, `report` |
| `tests/` | Moved tests (`adt-locate`, `adt-runner`, `adt-step-display`, `step-display-catalog`, `fm-script-align`, `fm-segment-parse`) plus new ones (`runner-options`, `gaps-checks`, `gaps-check`, `gaps-report`, `catalog-module`) |
| `tests/helpers/fake-fm-cli.mjs` | Moved and extended for ops-file, `--out`, and `read` mode |
| `tests/fixtures/fm-0.6.0/*.ndjson` | Recorded read output from ooe |

### fm-ai repo (`/Users/wdecorte/GitHub/fm-ai`)

| Path | Change |
|---|---|
| `src/shared/adt/types.ts` | Re-exports the moved types from `fm-adt-toolkit/types`; keeps its own push types |
| `src/shared/adt/ops-builder.ts` | `opsToNdjson` re-exported from the toolkit |
| `src/main/adt/locate.ts`, `src/main/adt/runner.ts` | Deleted |
| `src/shared/adt/step-display*.ts`, `src/catalogs/` | Deleted |
| `src/main/ipc-handlers.ts`, `src/renderer/step-row.ts` | Import paths changed |
| `scripts/*.mjs` (the five moved), `fm_scripts/`, `docs/fm-step-*.md` | Deleted |
| `tests/` | Moved tests deleted; `adt-integration.test.ts` import paths changed |
| `package.json` | Dependency on the toolkit; `derive:step-display` and `roundtrip:step-display` scripts removed |

---

## Reference: fm 0.6.0 read shapes observed on ooe

Used by Task 2 (classification) and Task 6 (probes). Every op below returned `status: ok` on 2026-09-14 against `fmnet://localhost/ooe` unless stated.

| Op | Listing item keys | Describe adds |
|---|---|---|
| `read:table` | `name,id` | `description, fields[{name,id,type}]` |
| `read:field {table}` | `name,id,type,table{name,id}` | with `detail:true` on the listing or by `name`: `options{fieldType,global,stored,primaryKey,indexing,indexLanguage,autoIndex,repetitions,tags[],comment,autoEnter{type,calculation{text,context},serial{next,increment,generate},variable,prohibitModification,alwaysEvaluate,overwriteExisting},validation{notEmpty,unique,strictNumber,validateAlways,validateWhenUnmodified,strict,strictFourDigitYear,strictTimeOfDay,existingValue}}` |
| `read:tableOccurrence` | `name,id,table{name,id,resolved,dataSource?}` | `source{local,external,foreign,odbc}, related[ref], hasCascade, graph{bounds{left,top,width,height},color,view,fieldListHeight,drawnBounds}, tags[]` |
| `read:relation` | `id,left{ref},right{ref}` | `predicates[{leftField,op,rightField}], leftToRight{createRelated,cascadeDelete,cascadeUpdate,sortRelated}, rightToLeft{…}, effects[]` |
| `read:layout {flatten:true}` | `id,name,type(layout/folder),position,hidden,tableOccurrence{ref},folder` | with `detail:true`: `scriptTriggerCount, scriptTriggers[], viewStyles{default,enabled{form,list,table}}, flags{raw,areDefaults,set[]}, geometry{units,baseWidth,tableHeaderSize,layoutType,orientation,clientType,facingPages,bodyHeight}, theme{id,name,displayName,group}, modified{by,account,timestamp}, contents{fieldCount,portalCount,webViewerCount,unmodelledCount,objects[{id,type,bounds,anchors,text?,action?,style?,scriptTriggers?,container?,objects?…}]}` |
| `read:script {flatten:true}` | `id,name,type(script/folder/separator),position,hidden,steps,folder` | by `id`: `runWithFullAccess, siriShortcutVisible, body[{stepID,step,uuid,…}], problems[], token` |
| `read:valueList` | `name,id` | `type, valueList (external ref "File::List"), shadow, supportsAutoComplete`, plus per-type keys |
| `read:customFunction` | `id,name,type,position` | `folder, parameters[], body, availableToUser, arity, prototype, comment, parameterComments[]` |
| `read:account` | `name,id,builtIn` | describe by id |
| `read:privilegeSet` | `name,id,builtIn` | `description, fileOptions{…}, passwordExpirationDays, minPasswordLength, records{access,newTables,tables[]}, layouts{…}, scripts{…}, valueLists{…}, extendedPrivileges[]` |
| `read:extendedPrivilege` | `name,id,builtIn` | |
| `read:customMenu` | `name,id,position` | `comment, baseMenuID, browseMode, findMode, previewMode, overrideName, inheritedMenu, macPlatform, winPlatform, linuxPlatform, titleCalculation, installCalculation, tags[], items[]` |
| `read:customMenuSet` | `name,id,builtIn,position` | |
| `read:externalDataSource {detail:true}` | `name,id,paths[],sourceType(filemaker/odbc/…),hasData,dsn?` | |
| `read:baseDirectory` | `path,id,relative,absolutePath` | |
| `read:persistentData` | `key,instance{name},id,value,dataType` | |
| `read:font` | `name,id,postScriptName,codeSet` | |
| `read:graphNote` | `id,uuid,text,bounds,collapsed,…` | |
| `read:authorization` | `id,type(inbound/…),uuid,filenames[],filenamesRaw,authorizedBy,…` | |

Not accepted: `read:layout` with key `objects` (use `detail:true`); any unknown key fails that op and, without `--abort-on-error=false`, rolls the whole batch back. There is no catalog for themes, styles, file metadata, plugins, or the DDR text index. Cross-file occurrences carry `table.dataSource` naming an externalDataSource; its `paths` are `file:<Name>` relative to the root target.

---

### Task 1: Inspector repo scaffold and inventory extractor

**Files:**
- Create: `package.json`, `.gitignore`, `scripts/saxml-inventory.mjs`, `tests/saxml-inventory.test.mjs`
- Move: `clockwork-inspector.html` → `legacy/clockwork-inspector.html`

**Interfaces:**
- Produces: `extractParserAccesses(source: string): Map<string, string[]>` keyed by parser function name, values are sorted unique XML access strings like `qsa:':scope > Field'`, `attr:'name'`, `tag:'Layout'`.
- Produces: `extractRenderAccesses(source: string): string[]` sorted unique stats accesses like `s.tables.detail.fields_all`, `lay.local_css_objects`.
- Produces: `buildInventoryMarkdown(parsers, renders): string`.

- [ ] **Step 1: Scaffold and move the legacy file**

```bash
cd /Users/wdecorte/GitHub/FileMaker-inspector-open-source
mkdir -p legacy scripts tests docs .local
git mv clockwork-inspector.html legacy/clockwork-inspector.html
cat > package.json <<'EOF'
{
  "name": "fm-inspector",
  "version": "3.0.0-dev",
  "private": true,
  "type": "module",
  "description": "Live FileMaker solution analysis through the Claris ADT fm CLI",
  "engines": { "node": ">=22.18" },
  "scripts": {
    "test": "node --test tests/",
    "inventory": "node scripts/saxml-inventory.mjs"
  },
  "license": "CC-BY-4.0"
}
EOF
cat > .gitignore <<'EOF'
node_modules/
.local/
.DS_Store
EOF
```

- [ ] **Step 2: Write the failing tests**

`tests/saxml-inventory.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractParserAccesses,
  extractRenderAccesses,
  buildInventoryMarkdown,
} from '../scripts/saxml-inventory.mjs';

const SAMPLE = `
// ── TABLES & FIELDS ────────────────────────────────────────
function parseTablesAndFields(doc, root) {
  const cat = qs(root, 'BaseTableCatalog');
  for (const t of qsa(cat, ':scope > BaseTable')) {
    const name = attr(t, 'name');
    const fields = t.getElementsByTagName('Field');
    const x = t.querySelector('FieldReference');
    const y = el.getAttribute('id');
  }
  return s;
}
// ── LAYOUTS ────────────────────────────────────────────────
function parseLayouts(doc, root) {
  const lc = qs(root, 'LayoutCatalog');
  return s;
}
// ── RENDER ─────────────────────────────────────────────────
function renderResults(file, root, s, elapsed) {
  const tf = s.tables;
  const lay = s.layouts;
  const n = tf.detail.fields_all.length;
  const m = lay.local_css_objects || [];
  const k = s.scripts.count;
}
// ── DENSE TABLE RENDERER (v1.0) ────────────────────────────
function renderDenseTable(opts) {}
`;

test('extractParserAccesses keys by parser and lists unique XML accesses', () => {
  const m = extractParserAccesses(SAMPLE);
  assert.deepEqual([...m.keys()], ['parseTablesAndFields', 'parseLayouts']);
  assert.deepEqual(m.get('parseTablesAndFields'), [
    "attr:'id'",
    "attr:'name'",
    "qs:'BaseTableCatalog'",
    "qs:'FieldReference'",
    "qsa:':scope > BaseTable'",
    "tag:'Field'",
  ]);
  assert.deepEqual(m.get('parseLayouts'), ["qs:'LayoutCatalog'"]);
});

test('extractRenderAccesses resolves aliases back to s.<catalog>', () => {
  const list = extractRenderAccesses(SAMPLE);
  assert.deepEqual(list, [
    's.layouts.local_css_objects',
    's.scripts.count',
    's.tables.detail.fields_all',
  ]);
});

test('buildInventoryMarkdown emits one row per datum with empty classification', () => {
  const md = buildInventoryMarkdown(
    new Map([['parseLayouts', ["qs:'LayoutCatalog'"]]]),
    ['s.layouts.local_css_objects'],
  );
  assert.match(md, /^# SaXML inventory/m);
  assert.match(md, /\| parseLayouts \| qs:'LayoutCatalog' \| {2}\| {2}\| {2}\|/);
  assert.match(md, /\| render \| s\.layouts\.local_css_objects \| {2}\| {2}\| {2}\|/);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../scripts/saxml-inventory.mjs'`.

- [ ] **Step 4: Write the extractor**

`scripts/saxml-inventory.mjs`:

```js
#!/usr/bin/env node
/** Inventory of every SaXML datum the legacy inspector consumes.
 *
 *  Two passes over legacy/clockwork-inspector.html:
 *   1. every `function parseXxx(` body: the XML selectors and attribute names it reads;
 *   2. the renderResults body and everything after it up to the dense table
 *      renderer: every `s.<catalog>...` access, with the local aliases
 *      (`tf`, `lay`, …) resolved back to `s.<catalog>`.
 *  The output is a Markdown table with empty classification columns; the
 *  classification is written by hand (see docs/saxml-inventory.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY = path.join(ROOT, 'legacy', 'clockwork-inspector.html');
const OUT = path.join(ROOT, 'docs', 'saxml-inventory.md');

/** Split the source into top-level function bodies keyed by name. A body runs
 *  from its `function name(` line to the line before the next top-level
 *  `function ` or banner comment. Good enough for this file, whose top-level
 *  functions all start at column 0. */
function topLevelFunctions(source) {
  const lines = source.split('\n');
  const starts = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(?:async )?function ([A-Za-z_$][\w$]*)\s*\(/);
    if (m) starts.push({ name: m[1], line: i });
  });
  const bodies = new Map();
  starts.forEach((s, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1].line : lines.length;
    bodies.set(s.name, lines.slice(s.line, end).join('\n'));
  });
  return bodies;
}

const ACCESS_PATTERNS = [
  [/\bqsa\(\s*[^,]+,\s*'([^']+)'/g, 'qsa'],
  [/\bqs\(\s*[^,]+,\s*'([^']+)'/g, 'qs'],
  [/\battr\(\s*[^,]+,\s*'([^']+)'/g, 'attr'],
  [/\.getAttribute\(\s*'([^']+)'/g, 'attr'],
  [/\.getElementsByTagName\(\s*'([^']+)'/g, 'tag'],
  [/\.querySelectorAll\(\s*'([^']+)'/g, 'qsa'],
  [/\.querySelector\(\s*'([^']+)'/g, 'qs'],
];

export function extractParserAccesses(source) {
  const out = new Map();
  for (const [name, body] of topLevelFunctions(source)) {
    if (!/^(parse[A-Z]|buildDDRTextIndex)/.test(name)) continue;
    const found = new Set();
    for (const [re, kind] of ACCESS_PATTERNS) {
      for (const m of body.matchAll(re)) found.add(`${kind}:'${m[1]}'`);
    }
    out.set(name, [...found].sort());
  }
  return out;
}

export function extractRenderAccesses(source) {
  const bodies = topLevelFunctions(source);
  const render = bodies.get('renderResults') || '';
  // Aliases declared as `const tf  = s.tables;` or `const { acc, priv, ep } = s.accounts;`
  const alias = new Map();
  for (const m of render.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*s\.([A-Za-z_$][\w$]*)\s*(?:\|\|\s*\{\})?\s*;/g)) {
    alias.set(m[1], `s.${m[2]}`);
  }
  for (const m of render.matchAll(/const\s*\{([^}]+)\}\s*=\s*s\.([A-Za-z_$][\w$]*)\s*;/g)) {
    for (const part of m[1].split(',')) {
      const key = part.trim().split(':')[0].trim();
      if (key) alias.set(key, `s.${m[2]}.${key}`);
    }
  }
  const found = new Set();
  for (const m of render.matchAll(/\bs\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g)) {
    found.add(trimJsMembers(`s.${m[1]}`));
  }
  for (const [name, target] of alias) {
    const re = new RegExp(`\\b${name}\\.([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)`, 'g');
    for (const m of render.matchAll(re)) found.add(trimJsMembers(`${target}.${m[1]}`));
  }
  // `s.tables` on its own (the alias declaration) says nothing once
  // `s.tables.detail.fields_all` is listed; keep only the most specific paths.
  const all = [...found];
  return all.filter((a) => !all.some((b) => b !== a && b.startsWith(a + '.'))).sort();
}

/** Trailing JavaScript members are not data: `fields_all.length` is the datum
 *  `fields_all`. Trim from the right while the last segment is one of these. */
const JS_MEMBERS = new Set([
  'length', 'map', 'filter', 'forEach', 'slice', 'sort', 'reduce', 'some', 'every', 'find',
  'join', 'keys', 'values', 'entries', 'push', 'includes', 'indexOf', 'toLocaleString',
  'toFixed', 'trim', 'split', 'replace', 'startsWith', 'endsWith', 'toLowerCase',
  'toUpperCase', 'concat', 'flat', 'flatMap', 'size', 'get', 'has', 'set',
]);
function trimJsMembers(access) {
  const parts = access.split('.');
  while (parts.length > 2 && JS_MEMBERS.has(parts[parts.length - 1])) parts.pop();
  return parts.join('.');
}

export function buildInventoryMarkdown(parsers, renders) {
  const lines = [
    '# SaXML inventory',
    '',
    'One row per datum the legacy inspector reads from Save as XML (parser rows) or renders from the stats object (render rows).',
    'Classification is one of `covered`, `derived`, `gap`. `fm` names the catalog and key that supplies it, or the register id for a gap.',
    '',
    '| Source | Datum | Classification | fm | Notes |',
    '|---|---|---|---|---|',
  ];
  for (const [name, list] of parsers) {
    for (const datum of list) lines.push(`| ${name} | ${datum} |  |  |  |`);
  }
  for (const datum of renders) lines.push(`| render | ${datum} |  |  |  |`);
  lines.push('');
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = fs.readFileSync(LEGACY, 'utf8');
  const md = buildInventoryMarkdown(extractParserAccesses(source), extractRenderAccesses(source));
  fs.writeFileSync(OUT, md);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${md.split('\n').length} lines`);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: 3 passing.

- [ ] **Step 6: Generate the skeleton and look at it**

Run: `npm run inventory && wc -l docs/saxml-inventory.md && head -30 docs/saxml-inventory.md`
Expected: several hundred rows; parser names match the banner list in CLAUDE.md (`parseTablesAndFields`, `parseRelationships`, `parseLayouts`, `parseScripts`, ... `parseUnreferenced`). If a parser is missing, its `function` line is not at column 0; fix the regex in `topLevelFunctions`, not the source.

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore legacy scripts tests docs/saxml-inventory.md
git commit -m "Scaffold Node project, move legacy inspector, add SaXML inventory extractor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Record fm samples and classify the inventory

**Files:**
- Create: `.local/fm-samples/lists.ndjson`, `.local/fm-samples/describes.ndjson` (gitignored)
- Modify: `docs/saxml-inventory.md` (fill the three empty columns on every row)

**Interfaces:**
- Produces: the classified inventory. Every row has Classification in {covered, derived, gap} and, for gaps, a register id of the form `catalog-<topic>` or `step-<topic>` that Task 6 or a later plan must create.

- [ ] **Step 1: Record the reference samples**

```bash
cd /Users/wdecorte/GitHub/FileMaker-inspector-open-source
mkdir -p .local/fm-samples
cat > .local/fm-samples/lists.ops.ndjson <<'EOF'
{"op":"read:externalDataSource","detail":true}
{"op":"read:table"}
{"op":"read:tableOccurrence"}
{"op":"read:relation"}
{"op":"read:layout","flatten":true}
{"op":"read:script","flatten":true}
{"op":"read:valueList"}
{"op":"read:customFunction"}
{"op":"read:account"}
{"op":"read:privilegeSet"}
{"op":"read:extendedPrivilege"}
{"op":"read:customMenu"}
{"op":"read:customMenuSet"}
{"op":"read:baseDirectory"}
{"op":"read:persistentData"}
{"op":"read:font"}
{"op":"read:graphNote"}
{"op":"read:authorization"}
EOF
fm --file=fmnet://localhost/ooe --username=admin --keychain --no-prompt --abort-on-error=false \
   --out=.local/fm-samples/lists.ndjson .local/fm-samples/lists.ops.ndjson 2> .local/fm-samples/lists.stderr.ndjson
tail -1 .local/fm-samples/lists.stderr.ndjson
```
Expected: `{"type":"summary","total":18,"ok":18,"errors":0,...}`.

Then build the describe batch from the lists (every table's fields with detail, every layout with detail, every script, every occurrence, every relation, every value list, custom function, privilege set, custom menu, account):

```bash
node --input-type=module - <<'EOF' > .local/fm-samples/describes.ops.ndjson
import fs from 'node:fs';
const lines = fs.readFileSync('.local/fm-samples/lists.ndjson', 'utf8').trim().split('\n').map(JSON.parse);
const items = (op) => lines.find((l) => l.op === op).result.items;
const out = [];
for (const t of items('read:table')) out.push({ op: 'read:field', table: t.name, detail: true });
for (const l of items('read:layout')) if (l.type === 'layout') out.push({ op: 'read:layout', id: l.id, detail: true });
for (const s of items('read:script')) if (s.type === 'script') out.push({ op: 'read:script', id: s.id });
for (const t of items('read:tableOccurrence')) out.push({ op: 'read:tableOccurrence', id: t.id });
for (const r of items('read:relation')) out.push({ op: 'read:relation', id: r.id });
for (const v of items('read:valueList')) out.push({ op: 'read:valueList', id: v.id });
for (const c of items('read:customFunction')) if (c.type === 'customFunction') out.push({ op: 'read:customFunction', id: c.id });
for (const p of items('read:privilegeSet')) out.push({ op: 'read:privilegeSet', id: p.id });
for (const m of items('read:customMenu')) out.push({ op: 'read:customMenu', id: m.id });
for (const a of items('read:account')) out.push({ op: 'read:account', id: a.id });
console.log(out.map((o) => JSON.stringify(o)).join('\n'));
EOF
fm --file=fmnet://localhost/ooe --username=admin --keychain --no-prompt --abort-on-error=false \
   --out=.local/fm-samples/describes.ndjson .local/fm-samples/describes.ops.ndjson 2> .local/fm-samples/describes.stderr.ndjson
tail -1 .local/fm-samples/describes.stderr.ndjson
```
Expected: a summary with `errors` 0. If any op errors, keep going; the error line is itself evidence for a gap row.

- [ ] **Step 2: Classify every row**

Open `docs/saxml-inventory.md` and fill each row using these rules, in this order:

1. **covered** when a key in the reference table above (or visible in `.local/fm-samples/*.ndjson`) carries the same fact. Write the catalog and key path in `fm`, e.g. `field.options.autoEnter.calculation.text`. Use `grep -o '"<key>"' .local/fm-samples/describes.ndjson | head` to confirm a key exists before writing it.
2. **derived** when the fact is computable from covered keys by the page (counts, percentages, cross references between calculation text and the name index, unreferenced detection, risk score, call graph). Write the inputs in `fm`, e.g. `derived from field.options.*.calculation.text + name index`.
3. **gap** otherwise. Write a register id in `fm`: `catalog-theme-styles`, `catalog-file-metadata`, `catalog-ddr-text`, `catalog-bit-flags`, `catalog-plugins`, `catalog-modification-info`, `catalog-relation-sort`, `catalog-layout-parts`, `catalog-object-styles`, or a new `catalog-<topic>` / `step-<topic>` when none fits. One id may cover many rows.

Known starting points, verified on 2026-09-14:
- Everything under `parseThemes` and every render row on `s.themes` is `gap: catalog-theme-styles` (a layout carries only `theme{id,name,displayName,group}`; an object only a `style` name).
- `parseFileMetadata` rows are `gap: catalog-file-metadata`, except the file name (covered: the target string).
- `parseBitFlags` rows are `gap: catalog-bit-flags` (layout `flags.set[]` covers layout flags only; note that on the row).
- `parseModifications` rows are `gap: catalog-modification-info` except layouts, which are covered by `layout.modified`.
- `parsePlugins` rows are `gap: catalog-plugins`.
- `buildDDRTextIndex` rows are `gap: catalog-ddr-text`.
- Relationship rows for sort specs are `gap: catalog-relation-sort`; `sortRelated` booleans are covered.
- Layout part bands: check whether `contents.objects` contains part objects (`type` of `part`, `header`, `body`, or similar) in `.local/fm-samples/describes.ndjson`. If not, every wireframe row that needs part geometry is `gap: catalog-layout-parts`.

Add a final section to the file:

```markdown
## Summary

| Classification | Rows |
|---|---|
| covered | N |
| derived | N |
| gap | N |

## Gap ids introduced

- `catalog-theme-styles`: …one line each…
```

Fill the counts with `grep -c '| covered |' docs/saxml-inventory.md` and the same for the other two.

- [ ] **Step 3: Verify no row is unclassified**

Run: `grep -c '|  |  |  |' docs/saxml-inventory.md`
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add docs/saxml-inventory.md
git commit -m "Classify the SaXML inventory against fm 0.6.0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

The owner reviews this file before Plan 2 starts. Stop here for that review if running unattended; Tasks 3 onward do not depend on it.

---

### Task 3: Toolkit scaffold and shared types

**Files:**
- Create: `/Users/wdecorte/GitHub/fm-adt-toolkit/package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `README.md`, `src/types.ts`, `tests/types.test.ts`

**Interfaces:**
- Produces (from `fm-adt-toolkit/types`):

```ts
export interface AdtOp { op: string; [key: string]: unknown }
export interface AdtOpError { code: string; message: string; details?: Array<{ code: string; path?: string; message: string; token?: string }>; dbError?: number }
export interface AdtOpResult { op: string; status: 'ok' | 'dry-run' | 'error'; result?: Record<string, unknown>; error?: AdtOpError }
export interface AdtSummary { total: number; ok: number; errors: number; dryRun: boolean; rolledBack: boolean }
export interface AdtNotice { type: string; [key: string]: unknown }
export interface AdtFatal { code: string; message: string; suggestions?: string[]; dbError?: number }
export interface AdtRunResult { ok: boolean; exitCode: number; results: AdtOpResult[]; summary: AdtSummary | null; notices: AdtNotice[]; fatal?: AdtFatal; stderr: string; stdout: string; argv: string[] }
export interface FmTarget { file: string; username: string }
export interface ScriptDetailStep { stepID: number; step: string; uuid?: string; name?: string; target?: string; [key: string]: unknown }
```

- [ ] **Step 1: Create the repo**

```bash
mkdir -p /Users/wdecorte/GitHub/fm-adt-toolkit && cd /Users/wdecorte/GitHub/fm-adt-toolkit
git init -b main
mkdir -p src/runner src/step-display src/catalogs src/gaps gaps bin scripts fm_scripts docs tests/helpers tests/fixtures/fm-0.6.0
cat > package.json <<'EOF'
{
  "name": "fm-adt-toolkit",
  "version": "0.1.0",
  "description": "Shared plumbing for tools built on the Claris ADT fm CLI: runner, script step display, gap register",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=22.18" },
  "files": ["dist", "gaps", "bin", "src/catalogs/fm-step-display.json"],
  "bin": { "fm-gaps": "bin/fm-gaps.mjs" },
  "exports": {
    "./types": { "types": "./dist/types.d.ts", "default": "./dist/types.js" },
    "./runner": { "types": "./dist/runner/index.d.ts", "default": "./dist/runner/index.js" },
    "./step-display": { "types": "./dist/step-display/index.d.ts", "default": "./dist/step-display/index.js" },
    "./gaps": { "types": "./dist/gaps/index.d.ts", "default": "./dist/gaps/index.js" },
    "./package.json": "./package.json"
  },
  "typesVersions": {
    "*": {
      "types": ["dist/types.d.ts"],
      "runner": ["dist/runner/index.d.ts"],
      "step-display": ["dist/step-display/index.d.ts"],
      "gaps": ["dist/gaps/index.d.ts"]
    }
  },
  "scripts": {
    "build": "npm run build:catalog && tsc -p tsconfig.json",
    "build:catalog": "node scripts/emit-catalog-module.mjs",
    "prepare": "npm run build",
    "test": "vitest run",
    "lint": "tsc --noEmit -p tsconfig.json",
    "derive:step-display": "node scripts/derive-step-display.mjs",
    "roundtrip:step-display": "node scripts/roundtrip-step-display.mjs && npm run build:catalog"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  }
}
EOF
cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "sourceMap": false,
    "strict": true,
    "skipLibCheck": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "rewriteRelativeImportExtensions": true,
    "allowJs": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
EOF
cat > vitest.config.ts <<'EOF'
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { exclude: ['node_modules/**', 'dist/**'] } });
EOF
cat > .gitignore <<'EOF'
node_modules/
dist/
.superpowers/
.DS_Store
EOF
cat > README.md <<'EOF'
# fm-adt-toolkit

Shared code for tools built on the Claris Agentic Development Toolkit `fm` CLI.

- `fm-adt-toolkit/runner`: locate the CLI, run a batch of NDJSON ops, parse the result lines.
- `fm-adt-toolkit/step-display`: render a script step the way FileMaker's Script Workspace writes it, from the catalog in `src/catalogs/`.
- `fm-adt-toolkit/gaps`: the register of what the CLI cannot read yet, with `fm-gaps check` to re-run every probe against a new build and `fm-gaps report` to write the Markdown for Claris.

Measured against fm 0.6.0 (29816214). Node 22.18 or later.
EOF
npm install
```

- [ ] **Step 2: Write the failing test**

`tests/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { AdtRunResult, FmTarget, ScriptDetailStep } from '../src/types.ts';

describe('types', () => {
  it('shapes compile and carry the runner evidence fields', () => {
    const target: FmTarget = { file: 'fmnet://localhost/ooe', username: 'admin' };
    const step: ScriptDetailStep = { stepID: 89, step: '#', text: 'hi' };
    const run: AdtRunResult = {
      ok: true, exitCode: 0, results: [], summary: null, notices: [],
      stderr: '', stdout: '', argv: ['--file=' + target.file],
    };
    expect(run.argv[0]).toBe('--file=fmnet://localhost/ooe');
    expect(step.step).toBe('#');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/types.test.ts`
Expected: FAIL, cannot resolve `../src/types.ts`.

- [ ] **Step 4: Write `src/types.ts`**

Copy from fm-ai `src/shared/adt/types.ts` the interfaces `AdtOp`, `AdtOpError`, `AdtOpResult`, `AdtSummary`, `AdtNotice`, `AdtFatal`, `AdtRunResult`, `ScriptDetailStep` with their doc comments, then apply these changes:

```ts
/** The file and account a run opens. Never a password. */
export interface FmTarget {
  file: string;
  username: string;
}

export interface AdtRunResult {
  ok: boolean;
  exitCode: number;
  results: AdtOpResult[];
  summary: AdtSummary | null;
  notices: AdtNotice[];
  /** Present only when the CLI reported a run-level failure. */
  fatal?: AdtFatal;
  stderr: string;
  /** Raw stdout, or the contents of --out when the run used one. Kept verbatim so
   *  a gap register entry can record exactly what the CLI said. */
  stdout: string;
  /** The exact argv the runner passed after the binary path. */
  argv: string[];
}
```

Do not copy `AdtStep`, `SET_VARIABLE_STEP_ID`, `INSERT_FROM_URL_STEP_ID`, `InsertPosition`, `PushPlan`, `AdtTarget`, `AdtPushResponse`, `AdtPushRequest`, `AdtLastPlan`, `ScriptListEntry`, `ScriptList`, `ScriptDetail`; those stay in fm-ai.

- [ ] **Step 5: Run the test and the type check**

Run: `npx vitest run tests/types.test.ts && npm run lint`
Expected: PASS, and `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Scaffold fm-adt-toolkit with shared fm wire types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Runner module

**Files:**
- Create: `src/runner/locate.ts`, `src/runner/runner.ts`, `src/runner/index.ts`, `tests/helpers/fake-fm-cli.mjs`, `tests/adt-locate.test.ts`, `tests/adt-runner.test.ts`, `tests/runner-options.test.ts`

**Interfaces:**
- Consumes: `src/types.ts`.
- Produces (from `fm-adt-toolkit/runner`):

```ts
export interface FmCli { path: string; version: string; contract: number | null }
export function parseVersionBanner(output: string): { version: string; contract: number | null } | null
export function locateFmCli(deps?: LocateDeps): Promise<FmCli | null>
export interface RunOptions {
  dryRun: boolean;
  env?: NodeJS.ProcessEnv;
  abortOnError?: boolean;   // default true (fm's default); false keeps ops that succeeded
  opsFile?: boolean;        // default false; true writes the ops to a temp file and passes its path
  outFile?: boolean;        // default false; true passes --out=<temp> and reads it back into result.stdout
  noPrompt?: boolean;       // default false; true passes --no-prompt instead of --prompt
  timeoutSeconds?: number;  // passes --timeout=<n>
}
export function buildArgv(target: FmTarget, opts: RunOptions, paths: { ops?: string; out?: string }): string[]
export function opsToNdjson(ops: AdtOp[]): string
export function parseResultLines(stdout: string, stderr?: string): { results: AdtOpResult[]; summary: AdtSummary | null; notices: AdtNotice[]; fatal: AdtFatal | null }
export function runOps(cli: FmCli, target: FmTarget, ops: AdtOp[], opts: RunOptions): Promise<AdtRunResult>
```

- [ ] **Step 1: Move the existing files and tests**

```bash
cd /Users/wdecorte/GitHub/fm-adt-toolkit
cp /Users/wdecorte/GitHub/fm-ai/src/main/adt/locate.ts src/runner/locate.ts
cp /Users/wdecorte/GitHub/fm-ai/src/main/adt/runner.ts src/runner/runner.ts
cp /Users/wdecorte/GitHub/fm-ai/tests/adt-locate.test.ts tests/adt-locate.test.ts
cp /Users/wdecorte/GitHub/fm-ai/tests/adt-runner.test.ts tests/adt-runner.test.ts
cp /Users/wdecorte/GitHub/fm-ai/tests/helpers/fake-fm-cli.mjs tests/helpers/fake-fm-cli.mjs
```

Edit imports:
- `src/runner/runner.ts`: replace the `./locate` import with `import type { FmCli } from './locate.ts';`, delete the `ops-builder` import, replace the `../../shared/adt/types` import with `import type { AdtOp, AdtOpResult, AdtFatal, AdtRunResult, AdtSummary, AdtNotice, FmTarget } from '../types.ts';`. Replace every `AdtTarget` with `FmTarget`.
- `tests/adt-locate.test.ts`: `from '../src/runner/locate.ts'`.
- `tests/adt-runner.test.ts`: `from '../src/runner/runner.ts'` and `import type { FmTarget } from '../src/types.ts'`; replace `AdtTarget` with `FmTarget` and drop `label` and `lastUsedAt` from every target literal.

Create `src/runner/index.ts`:

```ts
export { locateFmCli, parseVersionBanner } from './locate.ts';
export type { FmCli, LocateDeps } from './locate.ts';
export { runOps, parseResultLines, buildArgv, opsToNdjson } from './runner.ts';
export type { RunOptions } from './runner.ts';
```

- [ ] **Step 2: Run the moved tests to see where they stand**

Run: `npx vitest run tests/adt-locate.test.ts tests/adt-runner.test.ts`
Expected: locate passes. Runner fails to compile: `opsToNdjson` is not defined. Add it to `runner.ts` above `buildArgv`:

```ts
/** One JSON object per line, trailing newline included, which is what fm reads. */
export function opsToNdjson(ops: AdtOp[]): string {
  return ops.map((op) => JSON.stringify(op)).join('\n') + '\n';
}
```

Re-run. Expected: both files pass (the existing runner tests use stdin mode, which is unchanged).

- [ ] **Step 3: Write the failing tests for the new options**

`tests/runner-options.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { buildArgv, runOps } from '../src/runner/runner.ts';
import type { FmTarget } from '../src/types.ts';

const cli = { path: join(process.cwd(), 'tests/helpers/fake-fm-cli.mjs'), version: '0.6.0', contract: 2 };
const target: FmTarget = { file: 'fmnet://localhost/ooe', username: 'admin' };

describe('buildArgv', () => {
  it('defaults match fm-ai: keychain, prompt, no abort flag', () => {
    expect(buildArgv(target, { dryRun: false }, {})).toEqual([
      '--file=fmnet://localhost/ooe', '--username=admin', '--keychain', '--prompt',
    ]);
  });
  it('adds --abort-on-error=false, --no-prompt, --timeout, --out and the ops path', () => {
    expect(buildArgv(target, { dryRun: false, abortOnError: false, noPrompt: true, timeoutSeconds: 600 },
      { ops: '/tmp/x.ops.ndjson', out: '/tmp/x.out.ndjson' })).toEqual([
      '--file=fmnet://localhost/ooe', '--username=admin', '--keychain', '--no-prompt',
      '--abort-on-error=false', '--timeout=600', '--out=/tmp/x.out.ndjson', '/tmp/x.ops.ndjson',
    ]);
  });
  it('omits username and keychain for an unprotected file', () => {
    expect(buildArgv({ file: '/tmp/a.fmp12', username: '' }, { dryRun: true }, {})).toEqual([
      '--file=/tmp/a.fmp12', '--prompt', '--dry-run',
    ]);
  });
});

describe('runOps with opsFile and outFile', () => {
  it('passes the ops as a file and reads results back from --out', async () => {
    const run = await runOps(cli, target, [{ op: 'read:table' }], {
      dryRun: false, opsFile: true, outFile: true, abortOnError: false, noPrompt: true,
      env: { FAKE_FM_MODE: 'read', FAKE_FM_ECHO_ARGV: '1' },
    });
    expect(run.ok).toBe(true);
    expect(run.results).toHaveLength(1);
    expect(run.results[0].op).toBe('read:table');
    expect(run.results[0].result).toEqual({ kind: 'table', total: 1, returned: 1, items: [{ name: 'T', id: 129 }] });
    expect(run.argv).toContain('--abort-on-error=false');
    expect(run.argv.at(-1)).toMatch(/\.ops\.ndjson$/);
    expect(run.stdout).toContain('"read:table"');
    // The echoed argv on stderr proves the fake saw an --out path, so the results
    // above came from the file the runner read back, not from stdout.
    expect(run.stderr).toMatch(/--out=/);
  });
  it('still reports a fatal when the file cannot be opened in file mode', async () => {
    const run = await runOps(cli, target, [{ op: 'read:table' }], {
      dryRun: false, opsFile: true, outFile: true, env: { FAKE_FM_MODE: 'fatal' },
    });
    expect(run.ok).toBe(false);
    expect(run.fatal?.code).toBe('open_failed');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/runner-options.test.ts`
Expected: FAIL: `buildArgv` is not exported; `FAKE_FM_MODE=read` unknown.

- [ ] **Step 5: Extend `runner.ts` and the fake CLI**

Replace `RunOptions`, `buildArgv`, and `runOps` in `src/runner/runner.ts` with:

```ts
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface RunOptions {
  dryRun: boolean;
  /** Extra environment for the child. Used by tests to drive the stub CLI. */
  env?: NodeJS.ProcessEnv;
  /** fm's default is true: one error rolls the batch back. A read batch wants
   *  false, so one refused key does not fail every other read. */
  abortOnError?: boolean;
  /** Write the ops to a temp file and pass its path instead of piping stdin. fm's
   *  documented shape for anything bigger than a couple of ops. */
  opsFile?: boolean;
  /** Pass --out=<temp> and read the result lines back from it into `stdout`. */
  outFile?: boolean;
  /** Pass --no-prompt (never open a credential window) instead of --prompt. */
  noPrompt?: boolean;
  /** Pass --timeout=<seconds>. */
  timeoutSeconds?: number;
}

/** Build the CLI's argv. Never includes --password: it is visible in the
 *  process list, so ADT reads the secret from the keychain instead.
 *
 *  --prompt is the default. fm's own default is --no-prompt, and its help says
 *  --prompt "asks for the account name too if --username was not given", so an
 *  empty account against a protected file is the case that needs the window
 *  most. A caller with nobody in front of it passes noPrompt. --username and
 *  --keychain stay gated on a non-empty account: --keychain has nothing to look
 *  a password up under without one. */
export function buildArgv(
  target: FmTarget,
  opts: RunOptions,
  paths: { ops?: string; out?: string },
): string[] {
  const argv = [`--file=${target.file}`];
  if (target.username) argv.push(`--username=${target.username}`, '--keychain');
  argv.push(opts.noPrompt ? '--no-prompt' : '--prompt');
  if (opts.dryRun) argv.push('--dry-run');
  if (opts.abortOnError === false) argv.push('--abort-on-error=false');
  if (opts.timeoutSeconds !== undefined) argv.push(`--timeout=${opts.timeoutSeconds}`);
  if (paths.out) argv.push(`--out=${paths.out}`);
  if (paths.ops) argv.push(paths.ops);
  return argv;
}

/** Apply ops to a target file, returning every result line the CLI emitted. */
export async function runOps(
  cli: FmCli,
  target: FmTarget,
  ops: AdtOp[],
  opts: RunOptions,
): Promise<AdtRunResult> {
  const dir = opts.opsFile || opts.outFile ? await mkdtemp(join(tmpdir(), 'fm-adt-')) : null;
  const paths = {
    ops: opts.opsFile && dir ? join(dir, 'batch.ops.ndjson') : undefined,
    out: opts.outFile && dir ? join(dir, 'batch.out.ndjson') : undefined,
  };
  if (paths.ops) await writeFile(paths.ops, opsToNdjson(ops));
  const argv = buildArgv(target, opts, paths);

  try {
    const { code, stdout, stderr } = await spawnAndCollect(cli.path, argv, opts, paths.ops ? null : opsToNdjson(ops));
    const outText = paths.out ? await readFile(paths.out, 'utf8').catch(() => '') : '';
    const combinedStdout = outText ? outText + (stdout ? '\n' + stdout : '') : stdout;
    const { results, summary, notices, fatal } = parseResultLines(combinedStdout, stderr);
    return {
      ok: code === 0 && summary !== null && !summary.rolledBack,
      exitCode: code,
      results,
      summary,
      notices,
      ...(fatal ? { fatal } : {}),
      stderr,
      stdout: combinedStdout,
      argv,
    };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

function spawnAndCollect(
  bin: string,
  argv: string[],
  opts: RunOptions,
  stdinText: string | null,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, argv, { env: { ...process.env, ...opts.env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    // A refused target closes stdin before an ops payload larger than the ~64 KB
    // pipe buffer is drained, and an unhandled 'error' on a stdio stream is an
    // uncaught exception. The 'close' handler already reports the exit code and
    // the CLI's own fatal, which is the real diagnosis. Do NOT rethrow here.
    child.stdin.on('error', () => {});
    if (stdinText !== null) child.stdin.write(stdinText);
    child.stdin.end();
  });
}
```

Keep the existing `parseResultLines` unchanged.

In `tests/helpers/fake-fm-cli.mjs`, replace the stdin line and add `--out` and `read` support:

```js
const opsPath = process.argv.slice(2).find((a) => !a.startsWith('--'));
const stdin = mode === 'fatal' ? '' : opsPath ? readFileSync(opsPath, 'utf8') : readFileSync(0, 'utf8');
const outPath = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
const emitResult = (line) => (outPath ? appendFileSync(outPath, line) : process.stdout.write(line));
```

(add `appendFileSync` to the `node:fs` import), route every existing `process.stdout.write(` of a result line through `emitResult(`, and add a mode before `ok`:

```js
} else if (mode === 'read') {
  emitResult(JSON.stringify({ op: 'read:table', status: 'ok',
    result: { kind: 'table', total: 1, returned: 1, items: [{ name: 'T', id: 129 }] } }) + '\n');
  process.stderr.write(JSON.stringify({ type: 'summary', total: 1, ok: 1, errors: 0, dryRun, rolledBack: false }) + '\n');
  process.exit(0);
```

- [ ] **Step 6: Run all runner tests**

Run: `npx vitest run tests/adt-locate.test.ts tests/adt-runner.test.ts tests/runner-options.test.ts && npm run lint`
Expected: all pass; tsc clean.

- [ ] **Step 7: Record a real fm 0.6.0 fixture and parse it**

Task 2 recorded the reference listing. Copy it in as the toolkit's one real fixture:

```bash
cp /Users/wdecorte/GitHub/FileMaker-inspector-open-source/.local/fm-samples/lists.ndjson tests/fixtures/fm-0.6.0/lists.out.ndjson
cp /Users/wdecorte/GitHub/FileMaker-inspector-open-source/.local/fm-samples/lists.stderr.ndjson tests/fixtures/fm-0.6.0/lists.err.ndjson
cat > tests/fixtures/fm-0.6.0/README.md <<'EOF'
Recorded from `fm 0.6.0 (29816214)` against `fmnet://localhost/ooe` on 2026-09-14 with the 18 list ops in the inspector's Plan 1 Task 2. Read ops only. Not regenerated by any script.
EOF
```

`tests/fixture-parse.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseResultLines } from '../src/runner/runner.ts';

const dir = path.resolve(__dirname, 'fixtures/fm-0.6.0');

describe('fm 0.6.0 recorded listing', () => {
  it('parses into 18 ok results and a summary, no fatal', () => {
    const { results, summary, fatal, notices } = parseResultLines(
      fs.readFileSync(path.join(dir, 'lists.out.ndjson'), 'utf8'),
      fs.readFileSync(path.join(dir, 'lists.err.ndjson'), 'utf8'),
    );
    expect(results).toHaveLength(18);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
    expect(results.map((r) => r.op)).toContain('read:externalDataSource');
    expect(summary).toEqual({ total: 18, ok: 18, errors: 0, dryRun: false, rolledBack: false });
    expect(fatal).toBeNull();
    expect(notices.every((n) => n.type !== 'fatal')).toBe(true);
  });
});
```

Run: `npx vitest run tests/fixture-parse.test.ts`. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Add runner: locate, runOps with ops-file, --out, abort-on-error and no-prompt options

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Step-display module, catalog, corpus and scripts

**Files:**
- Create (by move): `src/step-display/step-display.ts`, `step-display-render.ts`, `step-display-types.ts`; `src/catalogs/fm-step-display.json`; `scripts/{derive-step-display,roundtrip-step-display,measure-step-flags,fm-script-align,fm-segment-parse}.mjs`; `fm_scripts/*`; `docs/fm-step-display-backlog.md`, `docs/fm-step-flags-reference.md`; `tests/{adt-step-display,step-display-catalog,fm-script-align,fm-segment-parse}.test.ts`
- Create: `src/step-display/index.ts`, `scripts/emit-catalog-module.mjs`, `src/catalogs/fm-step-display.js`, `tests/catalog-module.test.ts`

**Interfaces:**
- Consumes: `ScriptDetailStep` from `src/types.ts`.
- Produces (from `fm-adt-toolkit/step-display`): `stepDisplay(step): { name: string; detail: string }`, `stepDisplayText(step): string`, `keyLabel(key, stepName?)`, `renderStepFromCatalog`, `renderStepByConvention`, `stepConventions`, `catalogEntry`, `STEP_MASK`, `StepRendered`, `StepDisplayCatalog`, `StepDisplayEntry`, and `CATALOG` (the loaded catalog object).

- [ ] **Step 1: Move everything**

```bash
cd /Users/wdecorte/GitHub/fm-adt-toolkit
A=/Users/wdecorte/GitHub/fm-ai
cp $A/src/shared/adt/step-display.ts $A/src/shared/adt/step-display-render.ts $A/src/shared/adt/step-display-types.ts src/step-display/
cp $A/src/catalogs/fm-step-display.json src/catalogs/
cp $A/scripts/derive-step-display.mjs $A/scripts/roundtrip-step-display.mjs $A/scripts/measure-step-flags.mjs $A/scripts/fm-script-align.mjs $A/scripts/fm-segment-parse.mjs scripts/
cp $A/fm_scripts/* fm_scripts/
cp $A/docs/fm-step-display-backlog.md $A/docs/fm-step-flags-reference.md docs/
cp $A/tests/adt-step-display.test.ts $A/tests/step-display-catalog.test.ts $A/tests/fm-script-align.test.ts $A/tests/fm-segment-parse.test.ts tests/
```

- [ ] **Step 2: Write the catalog module emitter and its test**

`scripts/emit-catalog-module.mjs`:

```js
#!/usr/bin/env node
/** Write src/catalogs/fm-step-display.js, an ES module twin of the JSON catalog,
 *  so a browser page can `import` the catalog with no bundler and no JSON import
 *  attributes. Run after anything that rewrites the JSON (derive, roundtrip). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = path.join(ROOT, 'src', 'catalogs', 'fm-step-display.json');
const JS_PATH = path.join(ROOT, 'src', 'catalogs', 'fm-step-display.js');

export function emitCatalogModule(jsonText) {
  const data = JSON.parse(jsonText);
  return '// GENERATED by scripts/emit-catalog-module.mjs from fm-step-display.json. Do not edit.\n' +
    'export default ' + JSON.stringify(data, null, 1) + ';\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(JS_PATH, emitCatalogModule(fs.readFileSync(JSON_PATH, 'utf8')));
  console.log(`wrote ${path.relative(ROOT, JS_PATH)}`);
}
```

`tests/catalog-module.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import catalogModule from '../src/catalogs/fm-step-display.js';

describe('catalog module twin', () => {
  it('is byte-for-byte the same data as the JSON', () => {
    const json = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/catalogs/fm-step-display.json'), 'utf8'));
    expect(catalogModule).toEqual(json);
  });
});
```

Run: `npx vitest run tests/catalog-module.test.ts`
Expected: FAIL, `fm-step-display.js` missing. Then `npm run build:catalog` and re-run. Expected: PASS.

- [ ] **Step 3: Fix imports in the moved sources**

`src/step-display/step-display.ts`:

```ts
import catalogData from '../catalogs/fm-step-display.js';
import {
  catalogEntry,
  renderStepByConvention,
  renderStepFromCatalog,
  stepConventions,
} from './step-display-render.ts';
import type { StepDisplayCatalog } from './step-display-types.ts';
import type { ScriptDetailStep } from '../types.ts';
```

and add `export const CATALOG` in place of `const CATALOG`.

`src/step-display/step-display-render.ts`: change `import type { ScriptDetailStep } from './types';` to `from '../types.ts'` and the `./step-display-types` import to `./step-display-types.ts`. In the header comments, `src/catalogs/fm-step-display.json` stays true; leave them.

`src/step-display/index.ts`:

```ts
export { stepDisplay, stepDisplayText, keyLabel, CATALOG } from './step-display.ts';
export type { StepDisplay } from './step-display.ts';
export {
  renderStepFromCatalog, renderStepByConvention, stepConventions, catalogEntry,
  segmentID, maskedKeysOf, oneLine, STEP_MASK, ARTEFACT_KEYS,
} from './step-display-render.ts';
export type {
  StepRendered, StepRenderGap, StepRenderGapKind, StepRenderList, StepDisplayConventions,
} from './step-display-render.ts';
export type { StepDisplayCatalog, StepDisplayEntry, StepSegment, StepSlotRef } from './step-display-types.ts';
```

Every name above is exported by the moved files today (verified 2026-09-14 with `grep -n '^export'`).

`allowJs` is on, so tsc emits the `.js` twin into `dist/catalogs/` as well; verify with `npm run build && ls dist/catalogs`.

- [ ] **Step 4: Fix paths in tests and scripts**

Tests: replace `../src/shared/adt/step-display` with `../src/step-display/step-display.ts`, `../src/shared/adt/step-display-render` with `../src/step-display/step-display-render.ts`, `../src/shared/adt/step-display-types` with `../src/step-display/step-display-types.ts`, `../src/shared/adt/types` with `../src/types.ts`. `../src/catalogs/fm-step-display.json` and `../scripts/*.mjs` paths are unchanged because the layout mirrors fm-ai.

Scripts: `roundtrip-step-display.mjs` imports the renderer from `../src/shared/adt/step-display-render.ts`; change to `../src/step-display/step-display-render.ts`. `CATALOG_PATH` constants already point at `src/catalogs/fm-step-display.json`. `REPORT_PATH` under `.superpowers/` stays (gitignored).

- [ ] **Step 5: Run the moved suites**

Run: `npx vitest run tests/adt-step-display.test.ts tests/step-display-catalog.test.ts tests/fm-script-align.test.ts tests/fm-segment-parse.test.ts`
Expected: all pass, including the corpus floor (`BYTE_IDENTICAL_FLOOR = 886` of 1203). If `step-display-catalog.test.ts` fails on `execFileSync` of `git` (it may check the corpus is committed), commit the corpus first with `git add fm_scripts && git commit -m "Add step display corpus"` and re-run.

- [ ] **Step 6: Run the round trip once to prove the scripts work here**

Run: `npm run roundtrip:step-display && git status --short src/catalogs`
Expected: the script prints its four counts; `fm-step-display.json` is either unchanged or only `verified` flags changed; `fm-step-display.js` regenerated. Commit whatever changed.

- [ ] **Step 7: Lint, build, commit**

Run: `npm run lint && npm run build && node -e "import('./dist/step-display/index.js').then(m => console.log(m.stepDisplayText({stepID:141, step:'Set Variable', name:'$x', value:'1', repetition:'1'})))"`
Expected: prints `Set Variable [ $x ; Value: 1 ]` (or the catalog's measured form for that step).

```bash
git add -A && git commit -m "Add step-display: renderer, catalog with ES module twin, corpus, derive and roundtrip scripts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Gap register, checks, `fm-gaps check` and `report`

**Files:**
- Create: `src/gaps/register.ts`, `src/gaps/checks.ts`, `src/gaps/check.ts`, `src/gaps/report.ts`, `src/gaps/index.ts`, `gaps/register.json`, `bin/fm-gaps.mjs`, `tests/gaps-checks.test.ts`, `tests/gaps-check.test.ts`, `tests/gaps-report.test.ts`

**Interfaces:**
- Consumes: `runOps`, `locateFmCli` from `src/runner`; `AdtOp`, `AdtOpResult`, `AdtRunResult` from `src/types.ts`.
- Produces (from `fm-adt-toolkit/gaps`):

```ts
export type GapStatus = 'open' | 'fixed' | 'wontfix';
export type GapCheck =
  | { kind: 'keyPresent'; path: string }                                  // dotted path into results[0].result
  | { kind: 'opAccepted' }                                                // results[0].status === 'ok'
  | { kind: 'stepNotOpaque'; stepName: string }                           // no body step of that name has opaque:true
  | { kind: 'stepKeyPresent'; stepName: string; key: string }             // some body step of that name carries key
  | { kind: 'valueEquals'; path: string; value: unknown };
export interface GapEvidence { version: string; build: string; date: string; outcome: 'open' | 'passed' | 'error'; command: string; ops: AdtOp[]; response: { stdout: unknown[]; stderr: unknown[]; exitCode: number } }
export interface GapEntry { id: string; title: string; area: string; description: string; status: GapStatus; firstSeen: string; lastChecked: GapEvidence | null; reportedToClaris: string | null; blocks: Array<{ app: string; feature: string; where?: string }>; probe: { target: 'reference'; ops: AdtOp[]; check: GapCheck } }
export function loadRegister(path: string): GapEntry[]
export function saveRegister(path: string, entries: GapEntry[]): void
export function evaluateCheck(check: GapCheck, results: AdtOpResult[]): { passed: boolean; reason: string }
export function runChecks(entries: GapEntry[], run: (ops: AdtOp[]) => Promise<AdtRunResult>, meta: { version: string; build: string; date: string; commandFor: (argv: string[]) => string }): Promise<{ entries: GapEntry[]; stillOpen: GapEntry[]; newlyPassing: GapEntry[]; errored: GapEntry[] }>
export function renderReport(entries: GapEntry[]): string
```

- [ ] **Step 1: Write the failing check tests**

`tests/gaps-checks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluateCheck } from '../src/gaps/checks.ts';
import type { AdtOpResult } from '../src/types.ts';

const ok = (result: Record<string, unknown>): AdtOpResult => ({ op: 'read:x', status: 'ok', result });
const err: AdtOpResult = { op: 'read:x', status: 'error', error: { code: 'invalid_op', message: 'no' } };

describe('evaluateCheck', () => {
  it('keyPresent walks a dotted path', () => {
    expect(evaluateCheck({ kind: 'keyPresent', path: 'theme.styles' }, [ok({ theme: { styles: [] } })]).passed).toBe(true);
    expect(evaluateCheck({ kind: 'keyPresent', path: 'theme.styles' }, [ok({ theme: { name: 'x' } })]).passed).toBe(false);
    expect(evaluateCheck({ kind: 'keyPresent', path: 'theme.styles' }, [err]).passed).toBe(false);
  });
  it('opAccepted passes only on ok', () => {
    expect(evaluateCheck({ kind: 'opAccepted' }, [ok({})]).passed).toBe(true);
    expect(evaluateCheck({ kind: 'opAccepted' }, [err]).passed).toBe(false);
    expect(evaluateCheck({ kind: 'opAccepted' }, []).passed).toBe(false);
  });
  it('stepNotOpaque fails when any step of that name is opaque', () => {
    const body = [{ stepID: 42, step: 'Page Setup', opaque: true }, { stepID: 141, step: 'Set Variable', name: '$a' }];
    expect(evaluateCheck({ kind: 'stepNotOpaque', stepName: 'Page Setup' }, [ok({ body })]).passed).toBe(false);
    expect(evaluateCheck({ kind: 'stepNotOpaque', stepName: 'Set Variable' }, [ok({ body })]).passed).toBe(true);
    expect(evaluateCheck({ kind: 'stepNotOpaque', stepName: 'Print' }, [ok({ body })]).reason).toMatch(/no step named/);
  });
  it('stepKeyPresent passes when some step of that name carries the key', () => {
    const body = [{ stepID: 1, step: 'Add Account', name: '"x"' }];
    expect(evaluateCheck({ kind: 'stepKeyPresent', stepName: 'Add Account', key: 'privilege set' }, [ok({ body })]).passed).toBe(false);
    expect(evaluateCheck({ kind: 'stepKeyPresent', stepName: 'Add Account', key: 'name' }, [ok({ body })]).passed).toBe(true);
  });
  it('valueEquals compares with deep equality', () => {
    expect(evaluateCheck({ kind: 'valueEquals', path: 'kind', value: 'table' }, [ok({ kind: 'table' })]).passed).toBe(true);
    expect(evaluateCheck({ kind: 'valueEquals', path: 'kind', value: 'field' }, [ok({ kind: 'table' })]).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure, then write `src/gaps/checks.ts`**

Run: `npx vitest run tests/gaps-checks.test.ts` — expected FAIL (module missing).

```ts
import type { AdtOpResult } from '../types.ts';

export type GapCheck =
  | { kind: 'keyPresent'; path: string }
  | { kind: 'opAccepted' }
  | { kind: 'stepNotOpaque'; stepName: string }
  | { kind: 'stepKeyPresent'; stepName: string; key: string }
  | { kind: 'valueEquals'; path: string; value: unknown };

function walk(obj: unknown, path: string): { found: boolean; value: unknown } {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(part in (cur as Record<string, unknown>))) {
      return { found: false, value: undefined };
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return { found: true, value: cur };
}

function bodySteps(result: Record<string, unknown> | undefined, stepName: string): Record<string, unknown>[] {
  const body = Array.isArray(result?.body) ? (result!.body as Record<string, unknown>[]) : [];
  return body.filter((s) => s.step === stepName);
}

/** Every check reads results[0]; a probe is one op, and a multi-op probe is a
 *  design smell rather than something to support. */
export function evaluateCheck(check: GapCheck, results: AdtOpResult[]): { passed: boolean; reason: string } {
  const first = results[0];
  if (!first) return { passed: false, reason: 'no result line came back for the probe' };
  if (check.kind === 'opAccepted') {
    return first.status === 'ok'
      ? { passed: true, reason: 'op accepted' }
      : { passed: false, reason: `op refused: ${first.error?.code ?? first.status}` };
  }
  if (first.status !== 'ok') return { passed: false, reason: `op refused: ${first.error?.code ?? first.status}` };
  const result = first.result ?? {};
  switch (check.kind) {
    case 'keyPresent': {
      const { found } = walk(result, check.path);
      return { passed: found, reason: found ? `${check.path} present` : `${check.path} absent` };
    }
    case 'valueEquals': {
      const { found, value } = walk(result, check.path);
      const passed = found && JSON.stringify(value) === JSON.stringify(check.value);
      return { passed, reason: passed ? `${check.path} equals expected` : `${check.path} is ${JSON.stringify(value)}` };
    }
    case 'stepNotOpaque': {
      const steps = bodySteps(result, check.stepName);
      if (steps.length === 0) return { passed: false, reason: `no step named ${check.stepName} in the probe script` };
      const opaque = steps.filter((s) => s.opaque === true).length;
      return { passed: opaque === 0, reason: opaque === 0 ? 'no opaque steps' : `${opaque} of ${steps.length} steps opaque` };
    }
    case 'stepKeyPresent': {
      const steps = bodySteps(result, check.stepName);
      if (steps.length === 0) return { passed: false, reason: `no step named ${check.stepName} in the probe script` };
      const hit = steps.some((s) => check.key in s);
      return { passed: hit, reason: hit ? `${check.key} present` : `${check.key} absent on all ${steps.length} steps` };
    }
  }
}
```

Run again: expected PASS.

- [ ] **Step 3: Write the failing check-runner test**

`tests/gaps-check.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runChecks } from '../src/gaps/check.ts';
import type { GapEntry } from '../src/gaps/register.ts';
import type { AdtOp, AdtRunResult } from '../src/types.ts';

const entry = (id: string, check: GapEntry['probe']['check'], status: GapEntry['status'] = 'open'): GapEntry => ({
  id, title: id, area: 'catalog:layout', description: '', status, firstSeen: '0.6.0', lastChecked: null,
  reportedToClaris: null, blocks: [{ app: 'inspector', feature: id }],
  probe: { target: 'reference', ops: [{ op: 'read:layout', name: 'File Open', detail: true }], check },
});

describe('runChecks', () => {
  it('runs every probe in ONE batch, maps results back by position, records evidence', async () => {
    const seen: AdtOp[][] = [];
    const run = async (ops: AdtOp[]): Promise<AdtRunResult> => {
      seen.push(ops);
      return {
        ok: true, exitCode: 0, summary: { total: 2, ok: 2, errors: 0, dryRun: false, rolledBack: false }, notices: [],
        results: [
          { op: 'read:layout', status: 'ok', result: { theme: { name: 'Apex' } } },
          { op: 'read:layout', status: 'ok', result: { theme: { name: 'Apex', styles: [] } } },
        ],
        stdout: '{"op":"read:layout","status":"ok","result":{"theme":{"name":"Apex"}}}\n{"op":"read:layout","status":"ok","result":{"theme":{"name":"Apex","styles":[]}}}\n',
        stderr: '{"type":"summary","total":2,"ok":2,"errors":0,"dryRun":false,"rolledBack":false}\n',
        argv: ['--file=fmnet://localhost/ooe', '--username=admin', '--keychain', '--no-prompt', '--abort-on-error=false', '--out=/tmp/o', '/tmp/i'],
      };
    };
    const out = await runChecks(
      [entry('a', { kind: 'keyPresent', path: 'theme.styles' }), entry('b', { kind: 'keyPresent', path: 'theme.styles' })],
      run,
      { version: '0.6.0', build: '29816214', date: '2026-09-14', commandFor: (argv) => 'fm ' + argv.join(' ') },
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(2);
    expect(out.stillOpen.map((e) => e.id)).toEqual(['a']);
    expect(out.newlyPassing.map((e) => e.id)).toEqual(['b']);
    expect(out.errored).toEqual([]);
    const a = out.entries[0].lastChecked!;
    expect(a.outcome).toBe('open');
    expect(a.command).toBe('fm --file=fmnet://localhost/ooe --username=admin --keychain --no-prompt --abort-on-error=false --out=/tmp/o /tmp/i');
    expect(a.ops).toEqual([{ op: 'read:layout', name: 'File Open', detail: true }]);
    expect(a.response.stdout).toEqual([{ op: 'read:layout', status: 'ok', result: { theme: { name: 'Apex' } } }]);
    expect(a.response.stderr).toEqual([{ type: 'summary', total: 2, ok: 2, errors: 0, dryRun: false, rolledBack: false }]);
    expect(a.response.exitCode).toBe(0);
    expect(out.entries[1].lastChecked!.outcome).toBe('passed');
    // status is NOT flipped automatically; a human marks it fixed after reading the evidence
    expect(out.entries[1].status).toBe('open');
  });

  it('marks an entry errored when its result line is missing and never throws', async () => {
    const run = async (): Promise<AdtRunResult> => ({
      ok: false, exitCode: 2, summary: null, notices: [], results: [], stdout: '',
      stderr: '{"type":"fatal","error":{"code":"open_failed","message":"nope"}}\n',
      fatal: { code: 'open_failed', message: 'nope' }, argv: ['--file=x'],
    });
    const out = await runChecks([entry('a', { kind: 'opAccepted' })], run,
      { version: '0.6.0', build: '1', date: '2026-09-14', commandFor: (argv) => 'fm ' + argv.join(' ') });
    expect(out.errored.map((e) => e.id)).toEqual(['a']);
    expect(out.entries[0].lastChecked!.outcome).toBe('error');
    expect(out.entries[0].lastChecked!.response.stderr[0]).toMatchObject({ type: 'fatal' });
  });
});
```

- [ ] **Step 4: Write `src/gaps/register.ts` and `src/gaps/check.ts`**

`src/gaps/register.ts`:

```ts
import fs from 'node:fs';
import type { AdtOp } from '../types.ts';
import type { GapCheck } from './checks.ts';

export type GapStatus = 'open' | 'fixed' | 'wontfix';

export interface GapEvidence {
  version: string;
  build: string;
  date: string;
  outcome: 'open' | 'passed' | 'error';
  /** The exact command line the checker ran, temp paths included. */
  command: string;
  /** The exact ops written to the ops file for this entry. */
  ops: AdtOp[];
  /** fm's response verbatim: every stdout line and every stderr line as parsed
   *  JSON, in order, plus the exit code. Never summarised or trimmed. */
  response: { stdout: unknown[]; stderr: unknown[]; exitCode: number };
}

export interface GapEntry {
  id: string;
  title: string;
  /** `catalog:<name>`, `step:<step name>`, or `cli`. */
  area: string;
  description: string;
  status: GapStatus;
  firstSeen: string;
  lastChecked: GapEvidence | null;
  reportedToClaris: string | null;
  blocks: Array<{ app: string; feature: string; where?: string }>;
  probe: { target: 'reference'; ops: AdtOp[]; check: GapCheck };
}

export function loadRegister(path: string): GapEntry[] {
  const entries = JSON.parse(fs.readFileSync(path, 'utf8')) as GapEntry[];
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) throw new Error(`duplicate gap id ${e.id}`);
    ids.add(e.id);
    if (e.probe.ops.length !== 1) throw new Error(`gap ${e.id}: a probe is exactly one op`);
    if (!e.probe.ops[0].op.startsWith('read:')) throw new Error(`gap ${e.id}: probe op must be a read`);
  }
  return entries;
}

export function saveRegister(path: string, entries: GapEntry[]): void {
  fs.writeFileSync(path, JSON.stringify(entries, null, 2) + '\n');
}
```

`src/gaps/check.ts`:

```ts
import type { AdtOp, AdtRunResult } from '../types.ts';
import { evaluateCheck } from './checks.ts';
import type { GapEntry, GapEvidence } from './register.ts';

function parseLines(text: string): unknown[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return { unparseable: l }; }
  });
}

/** Run every entry's probe in ONE fm invocation, one op per entry in register
 *  order, so results map back by position. Evidence is recorded on every entry
 *  whatever the outcome. `status` is never changed here: a human reads the
 *  evidence and marks an entry fixed. */
export async function runChecks(
  entries: GapEntry[],
  run: (ops: AdtOp[]) => Promise<AdtRunResult>,
  meta: { version: string; build: string; date: string; commandFor: (argv: string[]) => string },
): Promise<{ entries: GapEntry[]; stillOpen: GapEntry[]; newlyPassing: GapEntry[]; errored: GapEntry[] }> {
  const ops = entries.map((e) => e.probe.ops[0]);
  const result = await run(ops);
  const stdoutLines = parseLines(result.stdout);
  const stderrLines = parseLines(result.stderr);
  const command = meta.commandFor(result.argv);

  const stillOpen: GapEntry[] = [];
  const newlyPassing: GapEntry[] = [];
  const errored: GapEntry[] = [];

  const updated = entries.map((entry, i) => {
    const line = result.results[i];
    const own = line ? [line] : [];
    let outcome: GapEvidence['outcome'];
    if (!line) {
      outcome = 'error';
    } else {
      outcome = evaluateCheck(entry.probe.check, own).passed ? 'passed' : 'open';
    }
    const evidence: GapEvidence = {
      version: meta.version, build: meta.build, date: meta.date, outcome, command,
      ops: entry.probe.ops,
      response: { stdout: line ? [line] : stdoutLines, stderr: stderrLines, exitCode: result.exitCode },
    };
    const next = { ...entry, lastChecked: evidence };
    if (outcome === 'error') errored.push(next);
    else if (outcome === 'passed' && entry.status === 'open') newlyPassing.push(next);
    else if (outcome === 'open') stillOpen.push(next);
    return next;
  });

  return { entries: updated, stillOpen, newlyPassing, errored };
}
```

Run: `npx vitest run tests/gaps-check.test.ts` — expected PASS.

- [ ] **Step 5: Write the failing report test, then `src/gaps/report.ts`**

`tests/gaps-report.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderReport } from '../src/gaps/report.ts';
import type { GapEntry } from '../src/gaps/register.ts';

const e: GapEntry = {
  id: 'catalog-theme-styles', title: 'Theme styles are not readable', area: 'catalog:layout',
  description: 'read:layout reports a theme name only.', status: 'open', firstSeen: '0.6.0',
  lastChecked: {
    version: '0.6.0', build: '29816214', date: '2026-09-14', outcome: 'open',
    command: 'fm --file=fmnet://localhost/ooe --username=admin --keychain --no-prompt --abort-on-error=false --out=/tmp/o /tmp/i',
    ops: [{ op: 'read:layout', name: 'File Open', detail: true }],
    response: { stdout: [{ op: 'read:layout', status: 'ok', result: { theme: { name: 'Apex' } } }],
                stderr: [{ type: 'summary', total: 1, ok: 1, errors: 0, dryRun: false, rolledBack: false }], exitCode: 0 },
  },
  reportedToClaris: null, blocks: [{ app: 'inspector', feature: 'theme-moodboard' }],
  probe: { target: 'reference', ops: [{ op: 'read:layout', name: 'File Open', detail: true }], check: { kind: 'keyPresent', path: 'theme.styles' } },
};

describe('renderReport', () => {
  it('groups open entries by area with command, ops and verbatim response', () => {
    const md = renderReport([e, { ...e, id: 'x', status: 'fixed' }]);
    expect(md).toMatch(/^# fm CLI gaps/m);
    expect(md).toMatch(/## catalog:layout/);
    expect(md).toMatch(/### Theme styles are not readable/);
    expect(md).toContain('fm --file=fmnet://localhost/ooe --username=admin --keychain --no-prompt');
    expect(md).toContain('{"op":"read:layout","name":"File Open","detail":true}');
    expect(md).toContain('"theme": {');
    expect(md).not.toContain('### x');
    expect(md).toMatch(/Checked against fm 0\.6\.0 \(29816214\) on 2026-09-14/);
  });
});
```

`src/gaps/report.ts`:

```ts
import type { GapEntry } from './register.ts';

/** Markdown for Claris: every OPEN entry, grouped by area, each with the exact
 *  command, the ops sent, and the verbatim response from the last check. */
export function renderReport(entries: GapEntry[]): string {
  const open = entries.filter((e) => e.status === 'open');
  const byArea = new Map<string, GapEntry[]>();
  for (const e of open) byArea.set(e.area, [...(byArea.get(e.area) ?? []), e]);
  const out: string[] = ['# fm CLI gaps', ''];
  const first = open.find((e) => e.lastChecked)?.lastChecked;
  if (first) out.push(`Checked against fm ${first.version} (${first.build}) on ${first.date}.`, '');
  out.push(`${open.length} open entries.`, '');
  for (const [area, list] of [...byArea.entries()].sort()) {
    out.push(`## ${area}`, '');
    for (const e of list) {
      out.push(`### ${e.title}`, '', e.description, '', `First seen: ${e.firstSeen}. Register id: \`${e.id}\`.`, '');
      if (e.lastChecked) {
        const c = e.lastChecked;
        out.push(`Last checked: fm ${c.version} (${c.build}) on ${c.date}, outcome **${c.outcome}**.`, '');
        out.push('Command:', '', '```', c.command, '```', '');
        out.push('Ops file:', '', '```json', ...c.ops.map((op) => JSON.stringify(op)), '```', '');
        out.push('Response (stdout, then stderr, exit ' + c.response.exitCode + '):', '', '```json',
          ...c.response.stdout.map((l) => JSON.stringify(l, null, 1)),
          ...c.response.stderr.map((l) => JSON.stringify(l, null, 1)),
          '```', '');
      } else {
        out.push('Not yet checked.', '');
      }
    }
  }
  return out.join('\n');
}
```

Run: `npx vitest run tests/gaps-report.test.ts` — expected PASS.

- [ ] **Step 6: Index, seed the register, write the bin**

`src/gaps/index.ts`:

```ts
export { evaluateCheck } from './checks.ts';
export type { GapCheck } from './checks.ts';
export { loadRegister, saveRegister } from './register.ts';
export type { GapEntry, GapEvidence, GapStatus } from './register.ts';
export { runChecks } from './check.ts';
export { renderReport } from './report.ts';
```

`gaps/register.json`, seeded. Every probe reads ooe; script probes use the script named `All script steps and all options 20260318` (id 55), which contains every step kind. `lastChecked` starts `null` and `reportedToClaris` `null` on every entry:

```json
[
  { "id": "step-opaque-import-records", "title": "Import Records step is opaque", "area": "step:Import Records",
    "description": "read:script reports the step with opaque:true and no options; fm-ai measured 38 such steps in its corpus.",
    "status": "open", "firstSeen": "0.6.0", "lastChecked": null, "reportedToClaris": null,
    "blocks": [ { "app": "fm-ai", "feature": "step-display" }, { "app": "inspector", "feature": "script-step-render" } ],
    "probe": { "target": "reference", "ops": [ { "op": "read:script", "id": 55 } ], "check": { "kind": "stepNotOpaque", "stepName": "Import Records" } } },
  { "id": "step-opaque-export-records", "title": "Export Records step is opaque", "area": "step:Export Records",
    "description": "read:script reports the step with opaque:true and no options.",
    "status": "open", "firstSeen": "0.6.0", "lastChecked": null, "reportedToClaris": null,
    "blocks": [ { "app": "fm-ai", "feature": "step-display" }, { "app": "inspector", "feature": "script-step-render" } ],
    "probe": { "target": "reference", "ops": [ { "op": "read:script", "id": 55 } ], "check": { "kind": "stepNotOpaque", "stepName": "Export Records" } } },
  { "id": "step-opaque-insert-file", "title": "Insert File step is opaque", "area": "step:Insert File",
    "description": "read:script reports the step with opaque:true and no options.",
    "status": "open", "firstSeen": "0.6.0", "lastChecked": null, "reportedToClaris": null,
    "blocks": [ { "app": "fm-ai", "feature": "step-display" }, { "app": "inspector", "feature": "script-step-render" } ],
    "probe": { "target": "reference", "ops": [ { "op": "read:script", "id": 55 } ], "check": { "kind": "stepNotOpaque", "stepName": "Insert File" } } },
  { "id": "step-opaque-print", "title": "Print step is opaque", "area": "step:Print",
    "description": "read:script reports the step with opaque:true and no options.",
    "status": "open", "firstSeen": "0.6.0", "lastChecked": null, "reportedToClaris": null,
    "blocks": [ { "app": "fm-ai", "feature": "step-display" }, { "app": "inspector", "feature": "script-step-render" } ],
    "probe": { "target": "reference", "ops": [ { "op": "read:script", "id": 55 } ], "check": { "kind": "stepNotOpaque", "stepName": "Print" } } },
  { "id": "step-opaque-page-setup", "title": "Page Setup step is opaque", "area": "step:Page Setup",
    "description": "read:script reports {opaque:true, editable:false, reason:\"the page setup is a structured sub-object this CLI cannot read\"}.",
    "status": "open", "firstSeen": "0.6.0", "lastChecked": null, "reportedToClaris": null,
    "blocks": [ { "app": "fm-ai", "feature": "step-display" }, { "app": "inspector", "feature": "script-step-render" } ],
    "probe": { "target": "reference", "ops": [ { "op": "read:script", "id": 55 } ], "check": { "kind": "stepNotOpaque", "stepName": "Page Setup" } } },
  { "id": "step-add-account-privilege-set", "title": "Add Account does not report its privilege set", "area": "step:Add Account",
    "description": "FileMaker displays the privilege set name on the step; the CLI sends no key for it (fm-ai backlog section 5, item 2).",
    "status": "open", "firstSeen": "0.6.0", "lastChecked": null, "reportedToClaris": null,
    "blocks": [ { "app": "fm-ai", "feature": "step-display" } ],
    "probe": { "target": "reference", "ops": [ { "op": "read:script", "id": 55 } ], "check": { "kind": "stepKeyPresent", "stepName": "Add Account", "key": "privilege set" } } },
  { "id": "step-insert-from-device-flash", "title": "Insert from Device does not report the flash setting", "area": "step:Insert from Device",
    "description": "FileMaker displays a flash/flashlight option; the CLI sends no key for it (fm-ai backlog section 5, item 3).",
    "status": "open", "firstSeen": "0.6.0", "lastChecked": null, "reportedToClaris": null,
    "blocks": [ { "app": "fm-ai", "feature": "step-display" } ],
    "probe": { "target": "reference", "ops": [ { "op": "read:script", "id": 55 } ], "check": { "kind": "stepKeyPresent", "stepName": "Insert from Device", "key": "flash" } } },
  { "id": "catalog-theme-styles", "title": "Theme and style definitions are not readable", "area": "catalog:layout",
    "description": "There is no theme catalog. read:layout detail reports theme {id,name,displayName,group} and per-object style names only; no fills, borders, fonts or corners.",
    "status": "open", "firstSeen": "0.6.0", "lastChecked": null, "reportedToClaris": null,
    "blocks": [ { "app": "inspector", "feature": "theme-moodboard", "where": "ui/tabs/themes.js" }, { "app": "inspector", "feature": "colour-palette", "where": "ui/tabs/themes.js" } ],
    "probe": { "target": "reference", "ops": [ { "op": "read:layout", "name": "File Open", "detail": true } ], "check": { "kind": "keyPresent", "path": "theme.styles" } } },
  { "id": "catalog-file-metadata", "title": "No file-level metadata catalog", "area": "cli",
    "description": "Encryption at rest, minimum FileMaker version, default login and file version are not exposed by any read op.",
    "status": "open", "firstSeen": "0.6.0", "lastChecked": null, "reportedToClaris": null,
    "blocks": [ { "app": "inspector", "feature": "file-metadata-card", "where": "ui/tabs/overview.js" } ],
    "probe": { "target": "reference", "ops": [ { "op": "read:file" } ], "check": { "kind": "opAccepted" } } },
  { "id": "catalog-plugins", "title": "No plugin catalog", "area": "cli",
    "description": "Installed plugins and the functions they register are not exposed by any read op.",
    "status": "open", "firstSeen": "0.6.0", "lastChecked": null, "reportedToClaris": null,
    "blocks": [ { "app": "inspector", "feature": "plugins-tab", "where": "ui/tabs/plugins.js" } ],
    "probe": { "target": "reference", "ops": [ { "op": "read:plugin" } ], "check": { "kind": "opAccepted" } } },
  { "id": "catalog-relation-sort", "title": "Relation sort specification is not readable", "area": "catalog:relation",
    "description": "read:relation reports sortRelated booleans per direction but not the sort fields and order; fm help relation declares the sort spec unsupported on every verb.",
    "status": "open", "firstSeen": "0.6.0", "lastChecked": null, "reportedToClaris": null,
    "blocks": [ { "app": "inspector", "feature": "relation-detail-sort", "where": "ui/tabs/relations.js" } ],
    "probe": { "target": "reference", "ops": [ { "op": "read:relation", "id": 1 } ], "check": { "kind": "keyPresent", "path": "rightToLeft.sort" } } }
]
```

Note for the `step-insert-from-device-flash` key: fm-ai's backlog names the missing option; if the backlog records a more precise key name than `flash`, use that.

`bin/fm-gaps.mjs`:

```js
#!/usr/bin/env node
/** fm-gaps check --file=<target> --username=<account> [--register=<path>]
 *  fm-gaps report [--register=<path>] [--out=<path>]
 *
 *  `check` runs every probe in the register against the reference file in one
 *  read-only fm invocation, writes the evidence back into the register, and
 *  prints still-open / newly-passing / errored. It never changes `status`.
 *  `report` renders the open entries as Markdown for Claris. */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { locateFmCli, runOps } from '../dist/runner/index.js';
import { loadRegister, saveRegister, runChecks, renderReport } from '../dist/gaps/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const registerPath = args.register ? path.resolve(args.register) : path.join(ROOT, 'gaps', 'register.json');
const cmd = process.argv[2];

if (cmd === 'report') {
  const md = renderReport(loadRegister(registerPath));
  if (args.out) fs.writeFileSync(path.resolve(args.out), md); else process.stdout.write(md);
  process.exit(0);
}
if (cmd !== 'check' || !args.file) {
  console.error('usage: fm-gaps check --file=<target> --username=<account> [--register=<path>]\n       fm-gaps report [--register=<path>] [--out=<path>]');
  process.exit(2);
}

const cli = await locateFmCli();
if (!cli) { console.error('fm CLI not found'); process.exit(2); }
// `--version` prints `0.6.0 (29816214)`; locate keeps the version, the build number is read here.
const build = execFileSync(cli.path, ['--version']).toString().match(/\((\d+)\)/)?.[1] ?? '';
const entries = loadRegister(registerPath);
const target = { file: args.file, username: args.username ?? '' };
const run = (ops) => runOps(cli, target, ops, { dryRun: false, opsFile: true, outFile: true, abortOnError: false, noPrompt: true });
const out = await runChecks(entries, run, {
  version: cli.version, build, date: new Date().toISOString().slice(0, 10),
  commandFor: (argv) => ['fm', ...argv].join(' '),
});
saveRegister(registerPath, out.entries);
const show = (label, list) => {
  console.log(`\n${label} (${list.length})`);
  for (const e of list) {
    console.log(`  ${e.id}  ${e.title}`);
    if (label.startsWith('Newly')) for (const b of e.blocks) console.log(`      unblocks ${b.app}: ${b.feature}${b.where ? ` (${b.where})` : ''}`);
  }
};
show('Still open', out.stillOpen);
show('Newly passing', out.newlyPassing);
show('Errored', out.errored);
console.log(`\nregister written: ${path.relative(process.cwd(), registerPath)}`);
```

- [ ] **Step 7: Build and run the check for real against ooe (reads only)**

Run: `npm run build && chmod +x bin/fm-gaps.mjs && node bin/fm-gaps.mjs check --file=fmnet://localhost/ooe --username=admin`
Expected: `Still open (11)` or close to it; `Errored (0)` unless `read:file` and `read:plugin` are reported as errored rather than open. Those two probes are expected to return `status: error` with `invalid_op`, which `opAccepted` turns into outcome `open`, not `error`. Then `git diff --stat gaps/register.json` shows every entry gained `lastChecked` with a `command` beginning `fm --file=fmnet://localhost/ooe --username=admin --keychain --no-prompt --abort-on-error=false --out=`.

Run: `node bin/fm-gaps.mjs report --out=/tmp/gaps-report.md && head -40 /tmp/gaps-report.md`
Expected: Markdown with the eleven entries grouped under `cli`, `catalog:layout`, `catalog:relation`, `step:*`.

- [ ] **Step 8: Test, lint, commit**

Run: `npm test && npm run lint`
Expected: all suites pass.

```bash
git add -A && git commit -m "Add gaps: register seeded from fm-ai backlog and known catalog gaps, check and report CLI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Toolkit build verification, tag, and remote

**Files:**
- Modify: `README.md` (usage of `fm-gaps`)

- [ ] **Step 1: Clean build from scratch**

```bash
cd /Users/wdecorte/GitHub/fm-adt-toolkit
rm -rf dist node_modules && npm install && npm test && ls dist/runner dist/step-display dist/gaps dist/catalogs
```
Expected: `npm install` runs `prepare` and produces `dist/` with `.js` and `.d.ts` for every entry point and `dist/catalogs/fm-step-display.js`.

- [ ] **Step 2: Prove a plain Node consumer and a CommonJS consumer can load it**

```bash
cd /tmp && rm -rf tk-consumer && mkdir tk-consumer && cd tk-consumer && npm init -y >/dev/null && npm install /Users/wdecorte/GitHub/fm-adt-toolkit >/dev/null
node --input-type=module -e "import { stepDisplayText } from 'fm-adt-toolkit/step-display'; console.log(stepDisplayText({stepID:89, step:'#', text:'hello'}))"
node -e "const { parseVersionBanner } = require('fm-adt-toolkit/runner'); console.log(parseVersionBanner('0.6.0 (29816214)'))"
```
Expected: `# hello` and `{ version: '0.6.0', contract: null }`. The second line proves `require(esm)` works, which fm-ai's CommonJS main process depends on.

- [ ] **Step 3: README usage and tag**

Append to `README.md`:

```markdown
## Re-checking the register on a new fm build

    npx fm-gaps check --file=fmnet://localhost/ooe --username=admin
    npx fm-gaps report --out=gaps-report.md

`check` sends read ops only. It records the exact command and fm's verbatim response on every entry and never changes an entry's `status`; read the evidence, then set `status` to `fixed` by hand and commit the register.
```

```bash
git add -A && git commit -m "Document fm-gaps usage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git tag v0.1.0
```

- [ ] **Step 4: Remote (manual for the owner)**

The `gh` CLI is not installed. The owner creates the repository on GitHub under `soliantconsulting/fm-adt-toolkit` (private is fine), then:

```bash
cd /Users/wdecorte/GitHub/fm-adt-toolkit
git remote add origin https://github.com/soliantconsulting/fm-adt-toolkit.git
git push -u origin main --tags
```

Tasks 8 and 9 use `file:` dependencies so they do not wait on this.

---

### Task 8: Switch fm-ai to the toolkit

**Files:**
- Modify: `/Users/wdecorte/GitHub/fm-ai/package.json`, `tsconfig.node.json`, `src/shared/adt/types.ts`, `src/main/adt/run-log.ts`, `src/main/ipc-handlers.ts`, `src/renderer/step-row.ts`, `tests/adt-integration.test.ts`, `README.md`, `CLAUDE.md`
- Delete: `src/main/adt/locate.ts`, `src/main/adt/runner.ts`, `src/shared/adt/step-display.ts`, `step-display-render.ts`, `step-display-types.ts`, `src/catalogs/`, `scripts/derive-step-display.mjs`, `roundtrip-step-display.mjs`, `measure-step-flags.mjs`, `fm-script-align.mjs`, `fm-segment-parse.mjs`, `fm_scripts/`, `docs/fm-step-display-backlog.md`, `docs/fm-step-flags-reference.md`, `tests/adt-locate.test.ts`, `tests/adt-runner.test.ts`, `tests/adt-step-display.test.ts`, `tests/step-display-catalog.test.ts`, `tests/fm-script-align.test.ts`, `tests/fm-segment-parse.test.ts`, `tests/helpers/fake-fm-cli.mjs`

**Interfaces:**
- Consumes: `fm-adt-toolkit/types`, `fm-adt-toolkit/runner`, `fm-adt-toolkit/step-display`.

- [ ] **Step 1: Branch and install**

```bash
cd /Users/wdecorte/GitHub/fm-ai && git checkout -b feat/fm-adt-toolkit
npm install --save fm-adt-toolkit@file:../fm-adt-toolkit
```
Note: `file:` is for now; once the GitHub remote exists (Task 7 step 4), change to `"fm-adt-toolkit": "github:soliantconsulting/fm-adt-toolkit#v0.1.0"` and `npm install` again.

- [ ] **Step 2: Rewrite `src/shared/adt/types.ts`**

Replace the moved interfaces with re-exports at the top of the file, keep everything else:

```ts
export type {
  AdtOp, AdtOpError, AdtOpResult, AdtSummary, AdtNotice, AdtFatal, AdtRunResult, ScriptDetailStep,
} from 'fm-adt-toolkit/types';
```

Delete the local definitions of those eight interfaces. `AdtStep`, the two step id constants, `InsertPosition`, `PushPlan`, `AdtTarget`, `AdtPushResponse`, `AdtPushRequest`, `AdtLastPlan`, `ScriptListEntry`, `ScriptList`, `ScriptDetail` stay.

- [ ] **Step 3: `ops-builder.ts`, `ipc-handlers.ts`, `step-row.ts`, integration test**

`src/shared/adt/ops-builder.ts` keeps its own three-line `opsToNdjson`: it is bundled into the renderer, and `fm-adt-toolkit/runner` is Node-only. Leave the file unchanged.

`src/main/adt/run-log.ts`: replace `import { FmCli } from './locate';` with `import type { FmCli } from 'fm-adt-toolkit/runner';`.

`src/main/ipc-handlers.ts`: replace

```ts
import { locateFmCli } from './adt/locate';
import { runOps } from './adt/runner';
```
with
```ts
import { locateFmCli, runOps } from 'fm-adt-toolkit/runner';
```

Any other file importing `./adt/locate` or `./adt/runner` (`grep -rn "adt/locate\|adt/runner" src tests`) gets the same change.

`src/renderer/step-row.ts`: `import { stepDisplay } from 'fm-adt-toolkit/step-display';`.

`tests/adt-integration.test.ts`: `import { locateFmCli, runOps } from 'fm-adt-toolkit/runner'; import type { FmCli } from 'fm-adt-toolkit/runner';`. Where it builds an `AdtTarget` literal to pass to `runOps`, the extra `label` and `lastUsedAt` keys are fine structurally.

- [ ] **Step 4: Delete the moved files and scripts**

```bash
git rm -r src/main/adt/locate.ts src/main/adt/runner.ts src/shared/adt/step-display.ts src/shared/adt/step-display-render.ts src/shared/adt/step-display-types.ts src/catalogs \
  scripts/derive-step-display.mjs scripts/roundtrip-step-display.mjs scripts/measure-step-flags.mjs scripts/fm-script-align.mjs scripts/fm-segment-parse.mjs \
  fm_scripts docs/fm-step-display-backlog.md docs/fm-step-flags-reference.md \
  tests/adt-locate.test.ts tests/adt-runner.test.ts tests/adt-step-display.test.ts tests/step-display-catalog.test.ts tests/fm-script-align.test.ts tests/fm-segment-parse.test.ts tests/helpers/fake-fm-cli.mjs
```

In `package.json` remove the `derive:step-display` and `roundtrip:step-display` scripts. In `tsconfig.node.json` remove `"src/catalogs/**/*"` from `include`.

- [ ] **Step 5: Type check, test, build**

Run: `npm run lint && npm run lint:tests && npm test && npm run build`
Expected: all green. Likely failures and their fixes:
- `Cannot find module 'fm-adt-toolkit/types'` under `tsconfig.node.json` (node10 resolution): the toolkit's `typesVersions` handles it; if it still fails, confirm `node_modules/fm-adt-toolkit/dist/types.d.ts` exists (run `npm run build` in the toolkit).
- esbuild renderer bundle cannot resolve `fm-adt-toolkit/step-display`: esbuild honours `exports`; confirm `dist/step-display/index.js` exists.
- A test that imported a deleted helper: delete or repoint it; the helper now lives in the toolkit's tests only.

- [ ] **Step 6: Smoke the app once**

Run: `npm run dev` and open the read sheet against `fmnet://localhost/ooe` (read only). Expected: the script list and a described script render as before. Quit.

- [ ] **Step 7: Docs and commit**

Update `README.md` sections that pointed at `src/catalogs/`, `scripts/derive-step-display.mjs`, and `fm_scripts/` to say the catalog and corpus now live in `fm-adt-toolkit`. Update `CLAUDE.md` in the same way (and remove its stale `src/ai/` description while there, since it never existed).

```bash
git add -A && git commit -m "Consume fm-adt-toolkit for runner, types and step display; drop the moved sources

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Do not merge to `main` without the owner; leave the branch for review.

---

### Task 9: Inspector depends on the toolkit; CLAUDE.md update

**Files:**
- Modify: `package.json`, `CLAUDE.md`

- [ ] **Step 1: Install**

```bash
cd /Users/wdecorte/GitHub/FileMaker-inspector-open-source
npm install --save fm-adt-toolkit@file:../fm-adt-toolkit
node --input-type=module -e "import { CATALOG } from 'fm-adt-toolkit/step-display'; console.log(Object.keys(CATALOG).length, 'step types')"
```
Expected: `209 step types` (or the current catalog count).

- [ ] **Step 2: Rewrite CLAUDE.md**

Replace the file's body after the mandated header with:

```markdown
## What this is

The Clockwork Inspector is being rewritten to read live FileMaker files through the Claris ADT `fm` CLI instead of parsing Save as XML. Design: `docs/superpowers/specs/2026-09-14-fm-cli-rewrite-design.md`. Plans: `docs/superpowers/plans/`. The old single-file inspector is kept unchanged at `legacy/clockwork-inspector.html` until every row of `docs/saxml-inventory.md` is covered, derived, or registered as a gap.

## Commands

- `npm test`: `node --test tests/`.
- `npm run inventory`: regenerate the skeleton of `docs/saxml-inventory.md` from the legacy file (classification columns are hand-written; re-running overwrites them, so diff before committing).
- Read-only probes against the reference solution: `fm --file=fmnet://localhost/ooe --username=admin --keychain --no-prompt --abort-on-error=false --out=<out> <ops.ndjson>`. Only `read:` ops, ever.

## Shared code

`fm-adt-toolkit` (sibling checkout at `../fm-adt-toolkit`, installed as a `file:` dependency until the GitHub tag is used) supplies `runner` (locate and run fm), `step-display` (script step rendering and its catalog), and `gaps` (the register and `fm-gaps check`/`report`). Anything about fm's wire format, step rendering, or known gaps belongs there, not here.

## Legacy file

`legacy/clockwork-inspector.html` is ~19.5k lines with very long lines; plain `grep` prints nothing on it, use `grep -a`. Its section banners are `// ── NAME ───`. The inventory script relies on every top-level `function` starting at column 0.
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json CLAUDE.md
git commit -m "Depend on fm-adt-toolkit; update CLAUDE.md for the rewrite layout

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## What Plan 2 starts from

- The classified inventory (Task 2), reviewed by the owner.
- `fm-adt-toolkit` with `runner`, `step-display`, `gaps` and eleven seeded register entries with real evidence.
- fm-ai on a review branch consuming the toolkit.
- This repo as an empty Node project with the legacy file aside.

Plan 2 builds the inspector server, target resolution, discovery, and the model with its read plan (spec sections 2 and 3), and adds the inventory's gap rows to the register.
