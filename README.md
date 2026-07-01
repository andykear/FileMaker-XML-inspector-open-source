# Clockwork Inspector for FileMaker

[![Stars](https://img.shields.io/github/stars/andykear/FileMaker-XML-inspector-open-source?style=social)](https://github.com/andykear/FileMaker-XML-inspector-open-source)
[![License](https://img.shields.io/badge/license-CC%20BY%204.0-green)](https://creativecommons.org/licenses/by/4.0/)

A single-file, browser-based audit tool for FileMaker Save as XML analysis. Get an instant structured analysis — no installation, no server, no dependencies.

Developed by Andrew Kear, owner of [Clockwork Creative Technology](https://www.clockworkct.co.uk), and shared openly with the FileMaker/Claris community.

> **A working tool, actively developed.** It is used in real consultancy work and handles production files, though some areas are still being refined and edge cases remain (documented below). Share feedback via [GitHub Issues](https://github.com/andykear/FileMaker-XML-inspector-open-source/issues).

---

## Why open source?

There are other XML analysis tools. What makes this different is intent.

Other solutions in this space are commercial, closed, or both. This one is open — the source is readable, forkable, and designed to be absorbed. Specifically, it is structured so that the HTML file can be modified, extended, or embedded in your own workflows.

Open sharing and collaboration is how the FileMaker community drives the platform forward. Publishing the analysis logic means everyone can see how it works, correct it when it's wrong, and build on it. That's how it was built in the first place — through community round-trip testing and feedback.

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

## New in v2.1

**Full visual redesign.** The interface has been rebuilt around the Clockwork brand: the real ring-and-tick mark, the brand navy and green, and a consistent card and colour system throughout. Navy carries headings and identity, green marks anything interactive, and grey is reserved for inert data, so the report reads as a precise instrument rather than a wall of equal-weight boxes. Zero-value metrics now recede instead of competing for attention, and the export actions are collected into a single menu in both the single-file and comparison views.

**Handles invalid characters in the source XML.** Some exports carry an invisible control character (often left in a field name, comment, or calculation) that makes the document invalid XML and previously stopped it parsing at all. The Inspector now strips these illegal characters before parsing and shows a notice telling you how many were removed, so the file analyses and you know it needs fixing at source.

**Mermaid relationship labels are now quoted.** Relationship labels that begin with an underscore (common with FileMaker key fields such as `_kp_` and `_ks_`) previously broke the Mermaid erDiagram parser. Labels are now quoted, so they render correctly and keep the real field names intact. Thanks to [albizum](https://github.com/albizum) for the report.

---

## New in v2.0

**Comparison mode.** Load two Save as XML files and diff them side by side. A three-pane view (categories → changed items → detail) shows what was added, removed, and modified across schema, scripts, layouts, relationships, and fields. Export diffs as Markdown or JSON for reports and version control.

**Split-catalog support (FileMaker 2026).** Drop a FileMaker 2026 multi-file Save as XML folder and the Inspector stitches the fragments back into a single in-memory structure for analysis.

**Mermaid diagram export.** Generate copy-ready Mermaid.js syntax for script call trees and relationship structures, with options to abbreviate long table-occurrence names and limit to entry points only. Perfect for documentation and architecture diagrams.

**Field tag pills.** Field type, storage, global, validation, and index status now render as scannable coloured chips in the unreferenced-fields view and the diff detail panel, rather than plain text.

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

The Inspector complements AI-assisted FileMaker development. Upload the HTML file to a Claude Project or as a skill — Claude can then reason about your solution's structure, cross-reference scripts and layouts, and help you identify gaps or opportunities for improvement.

---

## Companion repos

Five open-source resources for the FileMaker/Claris community:

[FileMaker Script XML Skill](https://github.com/andykear/FileMaker-XMLsnippet-Claude-Skill) — script steps for the Script Workspace

[FileMaker Layout XML Skill](https://github.com/andykear/FileMaker-XMLsnippet-Layout-Claude-Skill) — layout objects for Layout mode

[FileMaker Field Definitions XML Skill](https://github.com/andykear/FileMaker-XML-field-definitions) — field definitions for Manage Database

[FileMaker XML Inspector](https://github.com/andykear/FileMaker-XML-inspector-open-source) — browser-based Save as XML analyser

[FileMaker XML Scrubber](https://github.com/andykear/FileMaker-XML-scrubber) — redacts credentials before sharing with AI tools

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
| 2.1 | Minor UI improvements, handles illegal XML control characters in the source (strips and reports them) so affected files parse; quoted Mermaid relationship labels (fixes leading-underscore key fields) |
| 2.0 | Comparison mode: diff two files with script step and field calculation diffs, plus Markdown/JSON diff export; FileMaker 2026 split-catalog folder support; interactive script call-graph visualization; impact analysis; field tag pills |
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
