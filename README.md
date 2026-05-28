# Clockwork Inspector for FileMaker

A single-file, browser-based audit tool for FileMaker Database Design Reports (DDR / SaveAsXML). Drop in a DDR, get an instant structured analysis — no installation, no server, no dependencies.

Developed by Andrew Kear owner of [Clockwork Creative Technology](https://www.clockworkct.co.uk) and shared openly with the FileMaker/Claris community.

> **This is a prototype.** It is actively developed, has known gaps, and is shared in the spirit of open collaboration rather than as a finished product. Contributions, corrections, and counter-examples are welcomed.

---

## Why open source?

There are other DDR analysis tools. What makes this different is intent.

Other solutions in this space are commercial, closed, or both. This one is open the source is readable, forkable, and designed to be absorbed. Specifically, it is structured so that the HTML file can be uploaded directly to Claude as a skill or project document, allowing Claude to understand your FileMaker solution's structure and assist with development work in context.

We believe open sharing and collaboration is how the FileMaker community drives the platform forward. Publishing the analysis logic means everyone can see how it works, correct it when it's wrong, and build on it.

---

## What it analyses

Load a FileMaker DDR XML file (exported via Tools → Save a Copy as XML) and the Inspector parses it entirely in your browser. Nothing is uploaded anywhere.

**Schema**
- Base tables, table occurrences, fields — counts, types, storage, validation, auto-entry
- Relationships — full sortable list with TOs, base tables, and join keys; multi-predicate, sorted, cascade create/delete
- Layouts — count, visibility, themes, triggers, portal usage, object counts

**Scripts**
- Script count and step totals
- Unbalanced If/Loop detection
- Orphaned enabled steps inside disabled wrappers
- Show Custom Dialog anomalies
- Step ID dictionary — localisation-independent, version-independent

**Quality signals**
- Unreferenced fields, layouts, scripts, value lists, tables, TOs
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

1. Download `clockwork-inspector-x.html`
2. Open it in any modern browser
3. Drag and drop your DDR XML file onto the drop zone

No installation. No server. Runs entirely locally.

---

## Using with Claude

The Inspector is designed to complement AI-assisted FileMaker development. Upload the HTML file to a Claude Project or as a skill — Claude can then reason about your solution's structure, cross-reference scripts against schema, and assist with refactoring work informed by what the Inspector surfaces.

For generating pasteable FileMaker script XML, see the companion [FileMaker XML Skill](https://github.com/andykear/FileMaker-XMLsnippet-Claude-Skill) repo.

---

## Current limitations (known prototype gaps)

- Verified against FileMaker Pro 2025 / FM 2024 DDR format. Earlier versions may parse with minor differences.
- Script step analysis uses a ~200-entry step ID dictionary — steps not in the dictionary report as `unknown`. The dictionary is updated as new steps are confirmed.
- Relationship duplicate detection is not yet implemented — planned for a future version once the definition is nailed down.
- Layout object analysis covers common object types; some edge cases (web viewer configurations, complex button bar scripts) are partially parsed.
- Windows and cross-platform DDR variations have not been systematically tested.

---

## Version history

| Version | Notes |
|---|---|
| 1.3 | Many UI updates, Dark Mode, Resolve additional details |
| 1.2 | Relationships tab added — full sortable table with TO and base table display |
| 1.1 | Initial public prototype |

---

## Licence

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — free to use, share, and adapt with attribution.

---

## Contributing

Found a parsing error? A step ID that's wrong? A DDR structure we don't handle? Open an issue or PR. The analysis logic improves through real-world DDR testing — that's how it was built.
