# Clockwork Inspector for FileMaker

A single-file, browser-based audit tool for FileMaker Save as XML analysis. Get an instant structured analysis — no installation, no server, no dependencies.

Developed by Andrew Kear, owner of [Clockwork Creative Technology](https://www.clockworkct.co.uk), and shared openly with the FileMaker/Claris community.

> **A working tool, actively developed.** It is used in real consultancy work and handles production files, though some areas are still being refined and edge cases remain (documented below). Shared openly — contributions, corrections, and counter-examples are welcomed.

---

## Why open source?

There are other XML analysis tools. What makes this different is intent.

Other solutions in this space are commercial, closed, or both. This one is open — the source is readable, forkable, and designed to be absorbed. Specifically, it is structured so that the HTML file can be uploaded directly to Claude as a skill or project document, allowing Claude to understand your FileMaker solution's structure and assist with development work in context.

Open sharing and collaboration is how the FileMaker community drives the platform forward. Publishing the analysis logic means everyone can see how it works, correct it when it's wrong, and build on it.

---

## What it analyses

Load a FileMaker Save as XML file (exported via Tools → Save a Copy as XML) and the Inspector parses it entirely in your browser. Nothing is uploaded anywhere.

**Schema**
- Base tables, table occurrences, fields — counts, types, storage, validation, auto-entry
- Relationships — full sortable list with TOs, base tables, and join keys; multi-predicate, sorted, cascade create/delete
- Layouts — count, visibility, themes, triggers, portal usage, object counts

**Scripts**
- Script count and step totals
- Script call tree — recursive parent/child call mapping with circular-reference protection, cross-file and Perform Script on Server detection
- Unbalanced If/Loop detection
- Orphaned enabled steps inside disabled wrappers
- Show Custom Dialog anomalies
- Step ID dictionary — localisation-independent, version-independent

**Quality signals**
- Unreferenced fields, layouts, scripts, value lists, tables, TOs
- Unreferenced fields are tiered by confidence (zero references, calc-only dead chains, calc-only live, relationship keys, other) so you can judge what is genuinely safe to remove
- Broken references
- Local CSS overrides
- Classic theme layouts (upgrade candidates)
- Global field density
- Unstored calculation count

**File configuration**
- Security, accounts, privilege sets
- File options, minimum FM version
- Developer tags, activity timestamps

---

## New in v2.0

**Comparison mode.** Load two Save as XML files and diff them side by side. A three-pane view (categories → changed items → detail) shows what was added, removed, and modified across schema, scripts, fields, layouts, accounts, and more. Modified scripts show a line-level step diff with deleted steps struck through in place; modified calculation fields show a line-level diff of the calc body. Removed objects that had references in the earlier version are flagged so you can see what a deletion would break.

**Split-catalog support (FileMaker 2026).** Drop a FileMaker 2026 multi-file Save as XML folder and the Inspector stitches the fragments back into a single in-memory structure for analysis.

**Mermaid diagram export.** Generate copy-ready Mermaid.js syntax for script call trees and relationship structures, with options to abbreviate long table-occurrence names and limit to entry points. Paste the result into any Mermaid renderer or Markdown viewer to draw the graph.

**Field tag pills.** Field type, storage, global, validation, and index status now render as scannable coloured chips in the unreferenced-fields view and the diff detail panel, rather than plain table text.

**Impact analysis.** Trace where a field, script, or other object is used across the solution before changing or removing it, so you can see what a change would touch.

---

## Usage

1. Download `clockwork-inspector.html`
2. Open it in any modern browser
3. Drag and drop your Save as XML file onto the drop zone (or a FileMaker 2026 split-catalog folder)

For comparison mode, switch to Compare and load two files.

No installation. No server. Runs entirely locally.

---

## Using with Claude

The Inspector complements AI-assisted FileMaker development. Upload the HTML file to a Claude Project or as a skill — Claude can then reason about your solution's structure, cross-reference scripts against schema, and assist with refactoring work informed by what the Inspector surfaces. The Mermaid exports and structured summaries are a compact way to give an LLM the shape of a solution without pasting raw multi-megabyte XML.

It pairs with three companion Claude skills for generating paste-ready FileMaker XML:

- [FileMaker Script XML Skill](https://github.com/andykear/FileMaker-XMLsnippet-Claude-Skill) — script steps for the SCRIPT Workspace
- [FileMaker Layout XML Skill](https://github.com/andykear/FileMaker-XMLsnippet-Layout-Claude-Skill) — layout objects for LAYOUT mode
- [FileMaker Field Definitions XML Skill](https://github.com/andykear/FileMaker-XML-field-definitions) — field definitions for FIELD Manage Database

---

## Current limitations (known gaps)

- Verified primarily against FileMaker 2024 / 2025 Save as XML format. Earlier versions may parse with minor differences.
- Script step analysis uses a step ID dictionary of roughly 200 entries — steps not in the dictionary report as `unknown`. The dictionary is updated as new steps are confirmed.
- Relationship duplicate detection is not yet implemented — planned once the definition is nailed down.
- Layout object analysis covers common object types; some edge cases (web viewer configurations, complex button bar scripts) are partially parsed.
- The comparison diff caps very long script bodies and calculations (around 400 lines) for performance; where a calculation exceeds that, the diff says so rather than silently hiding later changes.
- Windows and cross-platform XML variations have not been systematically tested.

---

## Version history

| Version | Notes |
|---|---|
| 2.0 | Comparison mode: diff two files with script step and field calculation diffs, plus Markdown/JSON diff export; FileMaker 2026 split-catalog folder support; interactive script call-graph view; impact analysis; Mermaid export for call graphs and relationships; field tag pills; tiered unreferenced-field confidence; self-reference fix in unreferenced-field detection |
| 1.5 | Field dependencies, containers section, expanded metrics, better sideways scrolling on dense tables |
| 1.4 | Major UI overhaul and expanded metric coverage |
| 1.3 | Many UI updates, Dark Mode, resolve additional details |
| 1.2 | Relationships tab added — full sortable table with TO and base table display |
| 1.1 | Initial public prototype |

---

## Licence

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — free to use, share, and adapt with attribution.

---

## Contributing

Found a parsing error? A step ID that's wrong? An XML structure the tool doesn't handle? Open an issue or PR and Andrew will investigate.
