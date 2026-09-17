# Plan 6: Polish and the Browser Pass

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every parked inspector item from Plans 4 and 5 that a user would meet while testing, then walk the whole page in a real browser against ooe with a gated headless test that stays in the repo.

**Architecture:** Same page, same modules. The Explorer gains relations and custom menus as selectable kinds by extending the name index. The Scripts tab gains per-step anchors so links from Analysis and Explorer land on the step. `GAP_LISTS` moves to a neutral module. The tokeniser resolves `$$` names with spaces against the names Set Variable actually sets. Wireframe rects become selectable. The browser pass is `tests/browser-smoke.test.mjs`: it launches the installed Chrome headless through `puppeteer-core` (devDependency, no browser download), starts the inspector server against ooe with `--no-prompt`, waits for discovery, visits every tab and one selection per tab, fails on any console error or on the strings `undefined`, `[object Object]`, `NaN` appearing in rendered text, and writes screenshots under `.local/screenshots/`. Gated on `INSPECTOR_BROWSER=1`.

**Tech Stack:** As before, plus `puppeteer-core` as a devDependency (talks to the Chrome at `/Applications/Google Chrome.app`; the path is overridable with `INSPECTOR_CHROME`).

**Spec:** `docs/superpowers/specs/2026-09-14-fm-cli-rewrite-design.md` §2 (re-read controls on every pane), §3 derived views. Parked items ledgered in Plans 4 and 5.

## Global Constraints

- All house rules hold: `ui/` imports nothing from `node:`/`server/`; pure renderers; `esc` everywhere; fm keys through `get`/`path`; totals unfiltered; selection raw in `data-select`; tests measure before pinning; no `rows.length === list.length`; the control-character test stays green.
- Reads only against `fmnet://localhost/ooe` as `admin` with the keychain; the browser test starts the server with `--no-prompt` and never sends a write op.
- `npm test` stays green without Chrome and without fm; the browser test is skipped unless `INSPECTOR_BROWSER=1`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Relations and custom menus in the Explorer

**Files:** `ui/analysis/refs.js` (nameIndex), `ui/tabs/explorer.js`, `ui/tabs/common.js` (link targets), tests.

- `nameIndex` gains `relations` (name `Left ↔ Right` as `relationRows` spells it, entries `{target, id, name}`) and `customMenus` (name, entries `{target, id, name}`); they are index kinds only, not new reference kinds.
- The Explorer's object list includes both kinds; selection `rel:<target>|<id>` and `menu:<target>|<id>`; "References" for a relation lists its two occurrences and predicate fields (the references whose `from.kind === 'relation'`); for a menu, the scripts and calcs its items name (`from.kind === 'customMenu'`); "Referenced by" is empty by construction and says so ("Nothing names a relation or a menu; they name things").
- Links: `refHash` maps `relation` → `#graph/<target>|rel:<id>` and `customMenu` → `#catalogs/<target>|menu:<id>`.
- Tests: ooe's 10 relations and 25 menus appear in the list; selecting relation 1 lists its occurrences and `ID = ID_TestTable`; selecting `MyCustomMenu` lists the script it performs; the Explorer's reach now covers every reference (assert the count of references whose owner kind has a selectable entry equals `references(solution).length`).

### Task 2: Per-step anchors in the Scripts tab

**Files:** `ui/tabs/scripts.js`, `ui/tabs/analysis.js`, `ui/tabs/explorer.js`, `ui/shell.js`, `ui/app.js`, tests.

**Ruling as built (2026-09-17):** the anchor is FileMaker's own 1-based line, `#L<line>`, not `#<stepID>`. fm's `stepID` is the step TYPE id -- 141 is every `Set Variable`, 89 every comment -- so it repeats hundreds of times in one body and cannot name a step. The line is `body[<index>] + 1`, which every tab already carries. The paragraphs below read with `#L<line>` for `#<stepID>` throughout; `stepID` stays on a row and on `from` as the step's type, never as its address. (The identity that would survive an edit above it is fm's per-step `uuid`; a later link could anchor on that once an analysis row carries it.)

- A step `<li>` gets `id="step-<scriptId>-L<line>"` and `data-step` (the type id). The Scripts selection accepts a `#L<line>` tail (`<target>|<id>#L<line>`, parsed like layouts' object tail); the selected step's `<li>` gets class `selected`.
- The shell scrolls the first `.selected[id^="step-"]` into view (`scrollIntoView({block:'center'})`) when present; this is the one DOM action the shell adds. As built it fires when the hash brought the page here -- a `hashchange` or the first render -- not on every route, because a filter keystroke re-renders the same selection.
- Analysis (script issues, globals set sites) and Explorer (references from script steps, `where` starting `body[i]`) link to `#scripts/<target>|<id>#L<line>` using the row's line (issues carry `step.line`; references derive it from `from.where`).
- Tests: the rendered script contains the ids; a selection with a step tail marks that `<li>` selected; an Analysis issue link round-trips through `parseHash` to the step tail.

### Task 3: `GAP_LISTS` home and the `$$` tokeniser

**Files:** `ui/analysis/gaps-lists.js` (new), `ui/tabs/gaps.js`, `ui/export/markdown.js`, `ui/analysis/refs.js`, `ui/analysis/globals.js`, tests.

- `ui/analysis/gaps-lists.js` exports `GAP_LISTS = [{key, title, note}]`; `ui/tabs/gaps.js` attaches columns by key; `markdown.js` imports the neutral module. No tab import in `ui/export/`.
- Tokeniser: `tokenise(text, { variables })` accepts the set of variable names Set Variable sets across the solution (from `globals`' set sites and every `Set Variable` `name`, `$` and `$$`); when a `$`/`$$` token is followed by a space and the longer text matches a known name (longest match wins), the whole name is the token. `references()` passes the set. `GLOBALS_NOTE` says reads of a spaced name resolve only when some script sets it. Test with `$$SMTP Server` set in one script and read in another formula; and a `$$x y` never set stays `$$x`.

### Task 4: Plan 4 leftovers

**Files:** `ui/tabs/layouts.js`, `ui/tabs/solution.js`, `ui/tabs/scripts.js`, `ui/tabs/themes.js` test, `ui/inspector.css`, tests.

- Wireframe `<rect class="obj …">` carries `data-select="<target>|<layout id>#<object id>"` so clicking the picture selects the object (the shell's row delegation already handles any `[data-select]`).
- Objects table: nesting depth becomes a `depth` field rendered with `style="--depth:n"` padding, not NBSP in the type cell.
- Solution tab: the `listed` column is renamed `entries` with a title "list entries including folders and separators" for the three flattened catalogs (layout, script, customFunction).
- Themes memo test asserts identity (`notEqual`) after replacing a layout's detail, like the layouts test.
- Tests for each.

### Task 5: The browser pass

**Files:** `tests/browser-smoke.test.mjs` (new), `package.json` (`puppeteer-core` devDependency; script `test:browser`), `CLAUDE.md`, `.gitignore` (`.local/` already ignored).

- Gated on `INSPECTOR_BROWSER=1`; skipped otherwise. Chrome path from `INSPECTOR_CHROME` or the macOS default; skips with a message when neither exists.
- Starts `createServer` in-process against `INSPECTOR_FILE ?? fmnet://localhost/ooe`, `noPrompt: true`, port 0; launches headless Chrome; collects `console.error`, `pageerror` and failed requests; opens `/`, waits until the header context line no longer says "connecting" and the progress line reports "Read N file(s)"; for each tab in the sidebar: click it, wait for `#main` to settle, assert the tab's `<h2>` exists, assert the rendered `innerText` contains none of `undefined`, `[object Object]`, `NaN` outside `<code>`/`<pre>` blocks (calculation text may legitimately contain them: exclude those elements), click the first `[data-select]` row if any and re-check, screenshot to `.local/screenshots/<tab>.png`; on the Gaps tab click the live-check button and wait for the outcome (reads only; ~75 probes); on the header Export select, trigger the Markdown export and assert a download was initiated (puppeteer's download behaviour set to a temp dir; assert the file appears and starts with `# `); assert zero console errors at the end and print the collected warnings.
- Run it once for real (`INSPECTOR_BROWSER=1 node --test tests/browser-smoke.test.mjs`) and put the findings in the report: any assertion that fails is either fixed in this task (small) or listed for the final review with the screenshot.
- CLAUDE.md: `INSPECTOR_BROWSER=1 npm run test:browser` documented next to the live test.

---

## Self-review notes

- Every Plan 4/5 parked user-facing item has a task: Explorer reach (T1), step anchors (T2), `GAP_LISTS` home and spaced `$$` names (T3), wireframe clicks, depth padding, `listed` wording, themes memo test (T4). The browser pass (T5) is the verification the owner asked for before manual testing.
- Not included on purpose: the toolkit register's parked data work; Compare mode (its own plan after the owner's manual test).
