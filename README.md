# Clockwork Inspector for FileMaker

[![Stars](https://img.shields.io/github/stars/andykear/FileMaker-XML-inspector-open-source?style=social)](https://github.com/andykear/FileMaker-XML-inspector-open-source)
[![License](https://img.shields.io/badge/license-CC%20BY%204.0-green)](https://creativecommons.org/licenses/by/4.0/)

A single-file, browser-based audit tool for FileMaker Save as XML analysis. Get an instant structured analysis — no installation, no server, no dependencies.

Developed by Andrew Kear, owner of [Clockwork Creative Technology](https://www.clockworkct.co.uk), and shared openly with the FileMaker/Claris community.

> **A working tool, actively developed.** It is used in actual consultancy work and handles production files, it is being rapidly iterated through real world feedback so check often for new versions.

---

## Why open source?

There are other XML analysis tools. What makes this different is intent.

Other solutions in this space are commercial, closed, or both. This one is open — the source is readable, forkable, and designed to be absorbed. Specifically, it is structured so that the HTML file can be modified, extended, or embedded in your own workflows.

Open sharing and collaboration is how the FileMaker community drives the platform forward. Publishing the analysis logic means everyone can see how it works, correct it when it's wrong, and build on it.

---

## What it analyses

Load a FileMaker Save as XML file (exported via Tools → Save a Copy as XML) and the Inspector parses it entirely in your browser. Nothing is uploaded anywhere.

**Schema**
- Base tables, table occurrences, fields — counts, types, storage, validation, auto-entry
- Relationships — full sortable list with TOs, base tables, and join keys; multi-predicate, sorted, cascade create/delete
- Layouts — count, visibility, themes, triggers, portal usage, object counts
- Wireframe — visual preview of any layout drawn from object bounds: part bands, colour-coded objects, clickable tab panels, portal rows, off-layout zone

**Scripts**
- Script count and step totals
- Script call tree — recursive parent/child call mapping with circular-reference protection, cross-file and Perform Script on Server detection
- Unbalanced If/Loop detection
- Orphaned enabled steps inside disabled wrappers
- Show Custom Dialog anomalies
- Step ID dictionary — localisation-independent, version-independent

**Reference Explorer**
- Universal search (⌘K / Ctrl+K) across fields, tables, table occurrences, scripts, layouts, value lists, and custom functions
- Pick any entity to see its definition (calculation, script steps, value-list contents), everything it uses, and every reference to it — grouped by context, all clickable in both directions with a back stack
- UUID-based reference matching (no name-collision risk) plus calculation-text references recovered from DDR_INFO on FileMaker 26 exports

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

- Script step analysis uses a step ID dictionary of roughly 200 entries — steps not in the dictionary report as `unknown`. The dictionary is updated as new steps are confirmed.
- Relationship duplicate detection is not yet implemented — planned once the definition is nailed down.
- Layout object analysis covers common object types; some edge cases (web viewer configurations, complex button bar scripts) are partially parsed.
- The comparison diff caps very long script bodies and calculations (around 400 lines) for performance; where a calculation exceeds that, the diff says so rather than silently hiding later changes.
- Windows and cross-platform XML variations have not been systematically tested.
- Custom function references are matched by name inside calculation text, so their reference lists are sparser than UUID-matched types.
- Dynamic references (Evaluate(), GetField() with non-literal arguments, constructed SQL) are invisible to static analysis throughout the tool.

---

## Version history

| Version | Notes |
|---|---|
| 2.2 | Layout wireframe view. Plus numerous additions kindly contributed by Darrin Southern from CadenceUX - highlight is enhanced Impact Analysis now a clever universal reference explorer. |
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

We'd love you to get involved. Found something wrong, got a great idea, don't be shy — let's work together.
