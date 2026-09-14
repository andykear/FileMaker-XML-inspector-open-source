# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Clockwork Inspector for FileMaker: a single self-contained HTML file (`clockwork-inspector.html`, ~19.5k lines) that parses a FileMaker "Save a Copy as XML" export entirely in the browser and renders a structured analysis report. No build step, no package manager, no tests, no runtime dependencies (the only external fetch is Google Fonts). Keeping it zero-dependency and fully local is a stated project promise in the README; do not introduce bundlers, npm packages, or CDN libraries.

This repo is a fork: `origin` is soliantconsulting, `upstream` is andykear (the original author, Clockwork Creative Technology). Licence is CC BY 4.0.

## Working on it

- **Run:** open `clockwork-inspector.html` in a browser and drop a Save as XML file (or an FM26 split-catalog folder) on the drop zone. There is no other way to exercise the code; verify changes by loading a real export and checking the affected tab and the browser console.
- **Edit with care:** the file has very long lines (some >2k chars) and is ~1 MB. Use targeted `Edit`/`sed` on specific line ranges, never rewrite the whole file. Plain `grep` may print nothing on this file; use `grep -a` (and `LC_ALL=C`) or `awk`.
- **Version bump:** the version string appears in three places in the HTML (the header comment near line 3, the `<h1>` `.version` span, and the drop-screen `.hint` line) plus the Version history table in `README.md`. Update all four together.
- **Comment convention:** every major block is introduced with a banner comment of the form `// ── NAME ─────` (box-drawing dashes). Grep `─{5,}` to get a table of contents. Feature additions are tagged with the version they landed in (`// ── v2.4 ...`).

## File layout

| Lines (approx) | Content |
|---|---|
| 19–3313 | `<style>`: all CSS. Design tokens live in `:root` (light) with a dark-mode override block; use the `--` variables, not hard-coded colours. |
| 3314–3550 | HTML body: five screens toggled by `style.display` — `#drop-screen`, `#loading-screen`, `#report-screen` (sidebar + `#main-tab-content`), `#diff-screen`, `#diff-result-screen`. |
| 3551–19544 | One `<script>` block, all plain global functions (no modules, no classes). Inline `onclick="..."` handlers are used throughout, so any function they call must stay global. |

## Data flow (single-file mode)

1. **Ingest** — `handleFiles()` groups dropped files; `prepareInput()` merges an FM26 split-catalog set into one synthetic `<FMSaveAsXML>` string (header from first file + all inner content), so everything downstream is agnostic to how many catalog files there were.
2. **Sanitise + parse** — `stripIllegalXMLChars()` then `DOMParser`. If parsing fails on a CDATA-looking error, a four-pass repair ladder runs (`repairFileMakerCDATA` → `repairUnclosedCDATA` → `repairAtLineCol` loop → `stripCDATAWrappers`). Repair counts are surfaced to the user.
3. **Analyse** — `analyse(doc, root)` runs ~23 named phases in sequence, yielding to the browser between each so the loading label repaints. Each phase is a `parseXxx(doc, root)` function that returns an object (convention: `{ count, ..., detail: { ... } }`) stored on the stats object `s` (e.g. `s.tables`, `s.graph`, `s.layouts`, `s.scripts`, `s.unrefs`). **Order matters:** `buildDDRTextIndex` runs before `parseDeepAnalysis`, which runs before `parseUnreferenced`; later phases receive `s` and read earlier results.
4. **Render** — `renderResults(file, root, s, elapsed)` builds a `tabDefs` array (`{ id, label, icon, content | contentEl }`), then creates one `.main-pane` per entry and the sidebar nav from it. The sidebar is the single source of navigation truth. Tabs can be conditional (e.g. Persistent Data only if `s.persistent.count > 0`). Tables are drawn with `renderDenseTable({ containerEl, rows, columns, defaultSort, ... })`, usually deferred via `setTimeout(..., 0)` after the pane's DOM exists.

**Duplicated parse ladder:** `handleFile()` (single-file path) and `parseXMLToStats()` (comparison/diff path) each contain their own copy of the sanitise → parse → CDATA-repair → `analyse()` sequence. A change to parsing or repair must be made in both.

## Global state

All cross-cutting state lives on `window.__*` (`__lastRoot` = parsed XML Document, `__lastStats` = analysis object, `__uxUuidMap`, `__cgData`, `__lastDiff`, `__fm26Manifest`, ...). `resetUI()` nulls these on "New file" to release memory (a large DDR Document can be hundreds of MB). Any new `window.__*` you add must be cleared there too.

## Subsystems worth knowing before touching them

- **Reference Explorer / UUID engine** (`uxUuidMap`, `uxFindReferences`, `uxRenderDetail`, `buildUniversalSearchIndex`, the `ux*` family): lazily builds `uuid → [referencing elements]` from `window.__lastRoot` on first drill-down and caches it. Every list tab links into it. The `_<uuid>_<slot>` chunk-tag matching must stay a generic "anything after the first underscore" pattern.
- **FM step ID dictionary** (near the top of the script): built from the FileMaker Script XML paste reference; step detection routes by numeric ID, not by name. Step-content rendering (Set Variable, Set Field, etc.) lives in the step renderer near the "FM26 DDR_INFO TEXT INDEX" section.
- **Unreferenced analysis** uses a tier-aware classifier plus a v2.7 text scan of formulas (hide conditions, conditional formatting, merge fields, custom functions). Dynamic references found by deep analysis suppress false positives here.
- **Relationship graph** is SVG rendered from the TO geometry stored in the file; zoom/pan works via `viewBox`.
- **Wireframe** and **theme mood board** draw layouts and named styles from object bounds and style attributes.
- **Diff engine** (`runDiff`, `renderDiff`, three-pane layout) compares two `stats` objects plus XML roots for step-level script diffs and calc diffs.
- **Saved reports:** `downloadHTML()` serialises the live DOM, so a saved report opens with the report visible but no `window.__*` state. `detectSavedReport()` sets `window.__savedReport`; every interactive entry point must check it and render `savedReportNotice()` rather than failing silently.
- **Escaping:** always pass user/XML-derived text through `esc()` before inserting into HTML. It also escapes `"` because output is used inside attribute values.
- **Dark mode / preferences:** use `lsGet`/`lsSet` (try/catch wrappers around localStorage). Default theme is light regardless of OS preference, deliberately.

## Related repos

The README lists the sibling projects that document FileMaker's clipboard XML formats (script, layout, field/table/value-list skills) and the XML Scrubber. The step ID dictionary and layout object knowledge in this file derive from those.
