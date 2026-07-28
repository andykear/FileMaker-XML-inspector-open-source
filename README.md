# Clockwork Inspector for FileMaker

[![Stars](https://img.shields.io/github/stars/andykear/FileMaker-XML-inspector-open-source?style=social)](https://github.com/andykear/FileMaker-XML-inspector-open-source)
[![License](https://img.shields.io/badge/license-CC%20BY%204.0-green)](https://creativecommons.org/licenses/by/4.0/)

A single-file, browser-based audit tool for FileMaker Save as XML analysis. Get an instant structured analysis — no installation, no server, no dependencies.

Developed by Andrew Kear, owner of [Clockwork Creative Technology](https://www.clockworkct.co.uk), and shared openly with the FileMaker/Claris community.

---

## Why open source?

There are other XML analysis tools. What makes this different is intent.

Other solutions in this space are commercial, closed, or both. This one is open — the source is readable, forkable, and designed to be absorbed. Specifically, it is structured so that the HTML file can be modified, extended, or embedded in your own workflows.

Open sharing and collaboration is how the FileMaker community drives the platform forward. Publishing the analysis logic means everyone can see how it works, correct it when it's wrong, and build on it.

---

## What it analyses

Load a FileMaker Save as XML file (exported via Tools → Save a Copy as XML) and the Inspector parses it entirely in your browser. Nothing is uploaded anywhere. Handles UTF-16 and UTF-8 with BOM detection, FileMaker 2026 split-catalog folders, and strips (and reports) illegal XML control characters so affected files still parse.

**Schema**
- Base tables, table occurrences, fields — counts, types, storage, validation, auto-entry
- Relationships — full sortable list with TOs, base tables, and join keys; multi-predicate, sorted, cascade create/delete
- Relationship graph — interactive view rendered from the TO geometry stored in the file, so occurrences sit exactly where they sit in Manage Database; zoom, pan, rightward chain tracing, Edit Relationship detail on click
- Field dependencies and container field usage
- Layouts — count, visibility, themes, triggers, portal usage, object counts; portals and layout controls in their own sortable tables
- Wireframe — visual preview of any layout drawn from object bounds: part bands, colour-coded objects, clickable tab panels, portal rows, off-layout zone
- Themes, including unused theme styles

**Scripts**
- Script count and step totals
- Script call tree — recursive parent/child call mapping with circular-reference protection, cross-file and Perform Script on Server detection
- Unbalanced If/Loop detection
- Orphaned enabled steps inside disabled wrappers
- Show Custom Dialog anomalies
- Script issue detection — swallowed errors, PSoS scripts containing client-only steps, dead Set Variables, unbounded loops, unguarded Allow User Abort, hardcoded file/layout names
- Step ID dictionary — localisation-independent, version-independent

**Calculations**
- Function usage tallies across every calculation in the file
- Unstored calcs using expensive functions; stored calcs referencing globals or related fields (semantic errors FileMaker accepts silently)
- Calculations over readability thresholds
- Dynamic reference detection (Evaluate, GetField, merge syntax) — used to suppress false positives in unreferenced analysis

**Catalogs**
- Value lists — static and dynamic, with resolved source fields and reference counts
- Custom functions — definitions, bodies, and accurate reference counts
- Plugin functions — FM 26 aware, with FileMaker's own mistagged Design functions reported separately; dispatcher-style calls such as MBS(...) resolve to the actual function invoked
- Global variables — from calculation references and Set Variable targets, names with spaces handled correctly
- Custom menus

**Reference Explorer**
- Universal search (⌘K / Ctrl+K) across fields, tables, table occurrences, scripts, layouts, value lists, custom functions, plugin functions, and global variables
- Pick any entity to see its definition (calculation, script steps, value-list contents), everything it uses, and every reference to it — grouped by context, all clickable in both directions with a back stack
- Every list tab links straight in, and Back returns you to the tab you came from
- UUID-based reference matching (no name-collision risk) plus calculation-text references recovered from DDR_INFO on FileMaker 26 exports, resolved to the owning field, layout object, script step, or custom function

**Quality signals**
- Critical issues surfaced at the top of the report with click-to-jump
- Observations panel — neutral counts across every analysis category
- Unreferenced fields, layouts, scripts, value lists, tables, TOs
- Unreferenced fields are tiered by confidence (zero references, calc-only dead chains, calc-only live, relationship keys, other) so you can judge what is genuinely safe to remove
- Broken references
- Local CSS overrides
- Classic theme layouts (upgrade candidates)
- Global field density
- Unstored calculation count

**Comparison**
- Diff two versions of a solution — schema, scripts, and layouts, with script step and field calculation diffs
- Export the comparison as Markdown or JSON

**File configuration**
- Security — accounts, privilege sets, extended privileges, cross-linked in both directions
- File options, minimum FM version
- Developer tags, activity timestamps
- Bit flag decoder (behind the Advanced toggle)

**Reporting**
- Markdown report export
- Saved report snapshots — figures and tables preserved for sharing; interactive tools need the original XML
- Mermaid export for the relationship graph and script call tree
- Dark mode

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

## The FileMaker XML suite

One of a set that reverse-engineers FileMaker's clipboard format family end to end — the private type codes FileMaker uses to carry schema and objects through the clipboard. The three generation specs cover all seven codes between them; two tools support the workflow.

**[Script XML Skill](https://github.com/andykear/FileMaker-XMLsnippet-Claude-Skill)** (XMSS, XMSC, XMFN)
The full script step ID dictionary, plus the hidden paste-handler rules that decide whether your XML survives the trip into FileMaker.

**[Layout XML Skill](https://github.com/andykear/FileMaker-XMLsnippet-Layout-Claude-Skill)** (XML2)
All 18 layout object types mapped, every flag decoded, element order confirmed against native output. Verified across 45+ layouts in 10 production files.

**[Field, Table & Value List Definitions](https://github.com/andykear/FileMaker-XML-field-definitions)** (XMFD, XMTB, XMVL) — this repo
Field, table and value list definition XML — auto-enter, validation, storage, calculation options, and the three value list source arms — verified down to the individual option level.

**Analysis — read, audit and clean existing XML**

**[XML Inspector](https://github.com/andykear/FileMaker-XML-inspector-open-source)** (SaXML)
Full-catalog dependency analysis of a Save as XML export, entirely in the browser. Finds unreferenced fields, silent-failure risks, broken references, and diffs two versions of a solution against each other.

**[XML Scrubber](https://github.com/andykear/FileMaker-XML-scrubber)** (SaXML + others)
Strips API keys, passwords and internal hostnames out of FileMaker XML before you hand it to an AI tool.

---

## Version history

| Version | Notes |
|---|---|
| 2.3 | Relationship graph interactive view. Plus more super additions by Darrin from CadenceUX including fix to reference counts throughout the system, and every list tab now links into the Reference Explorer. |
| 2.2 | Layout wireframe view. Plus numerous additions kindly contributed by Darrin Southern from CadenceUX - highlight is enhanced Impact Analysis now a clever universal reference explorer. |
| 2.1 | Minor UI improvements, handles illegal XML control characters in the source (strips and reports them) so affected files parse; quoted Mermaid relationship labels (fixes leading-underscore key fields) |
| 2.0 | Comparison mode: diff two files with script step and field calculation diffs, plus Markdown/JSON diff export; FileMaker 2026 split-catalog folder support; interactive script call-graph visualization; impact analysis; field tag pills |
| 1.5 | Field dependencies, containers section, expanded metrics, better sideways scrolling on dense tables |
| 1.4 | Major UI overhaul and expanded metric coverage |
| 1.3 | Many UI updates, Dark Mode, resolve additional details |
| 1.2 | Relationships tab added |
| 1.1 | Initial public prototype |

---

## Licence

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — free to use, share, and adapt with attribution.

---

## Contributing

We'd love you to get involved. Found something wrong, got a great idea, don't be shy — let's work together.
