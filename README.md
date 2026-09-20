# Clockwork Inspector for FileMaker

[![Stars](https://img.shields.io/github/stars/andykear/FileMaker-XML-inspector-open-source?style=social)](https://github.com/andykear/FileMaker-XML-inspector-open-source)
[![License](https://img.shields.io/badge/license-CC%20BY%204.0-green)](https://creativecommons.org/licenses/by/4.0/)

**Full solution analysis for FileMaker. Local, in the browser, open. No install, no licence, no cloud.**

**Latest release: 2.8, September 2026.\
In active development.**

Screenshots not yet updated

<img width="855" height="553" alt="Screenshot 2026-09-05 at 14 30 14" src="https://github.com/user-attachments/assets/1d926a42-4e71-4d9d-a777-0ee1cc220d00" />

<img width="855" height="553" alt="Screenshot 2026-09-05 at 14 21 15" src="https://github.com/user-attachments/assets/a21aad56-2a73-4919-b3f7-edd533e84e11" />

<img width="855" height="553" alt="Screenshot 2026-09-05 at 14 23 04" src="https://github.com/user-attachments/assets/5ecd84e2-fab6-4c11-aaba-0a9b9f30bfcb" />

<img width="855" height="553" alt="Screenshot 2026-09-05 at 14 38 11" src="https://github.com/user-attachments/assets/8307084e-961a-4e0c-a2ab-85c63140b48f" />

<img width="855" height="553" alt="Screenshot 2026-09-05 at 14 43 20" src="https://github.com/user-attachments/assets/a1e12ac2-4f12-4bcb-b094-540aebb58e9a" />

<img width="855" height="553" alt="Screenshot 2026-09-05 at 14 43 29" src="https://github.com/user-attachments/assets/b493f114-9baf-4c90-8284-c4db0f471b10" />




A modern alternative to the commercial FileMaker analysis tools that now exceeds most of them on usability, without asking you to install anything, license anything, or send your work to a server. Drop a Save as XML export onto the page and get a full structured analysis in seconds. It is one HTML file with everything inside: no dependencies, no build, nothing to wire up.

It analyses around a million lines of XML per second on a reasonably capable computer, so even a large enterprise solution is parsed and reported about as fast as you can open the file. It reads Save as XML, FileMaker's native object export.

Along the way it does things FileMaker itself does not offer: a complete visual mood board of any theme with every named style drawn as the object it styles, an interactive relationship graph laid out from the real TO geometry in the file, layout wireframes, field performance risk scoring, universal reference exploration in both directions, and two file comparison with script and calculation diffs.

Developed by Andrew Kear, owner of [Clockwork Creative Technology](https://www.clockworkct.co.uk), and shared openly with the FileMaker/Claris community.

---

## Why open source, and why local

Local, in the browser, and open is where the platform is heading, and it is a better place to do this work from.

There is nothing to install and nothing to license. It runs in any modern browser, your file is parsed on your own machine and never uploaded, and the source is readable, forkable, and built to be extended or embedded in your own workflows.

It is also the tool we use ourselves. Clockwork runs the Inspector in daily production, in place of the commercial products it replaced.

And open sharing is how the FileMaker community moves the platform forward. Publishing the analysis logic means anyone can see how it works, correct it when it is wrong, and build on it.

---

## What it analyses

Load a FileMaker Save as XML file (exported via Tools → Save a Copy as XML) and the Inspector parses it entirely in your browser. Nothing is uploaded anywhere. Handles UTF-16 and UTF-8 with BOM detection, FileMaker 2026 split catalog folders, and strips (and reports) illegal XML control characters so affected files still parse.

**Schema**
- Base tables, table occurrences, fields: counts, types, storage, validation, auto entry
- Field performance risk: each field scored 1 to 10 from its storage, whether a calculation reaches across relationships, aggregate and SQL calls, how many other calculations it feeds, relationship keys, and layout exposure, so likely cost hotspots surface. A heuristic from schema shape, not a measurement
- **Calculations**: every calculation field as one row: storage, result type, indexed, the same 1 to 10 performance score as the Fields tab (factors on hover), the other tables the formula reaches through relationships, how many calculations depend on it, aggregate, `$$` and dynamic evaluation flags, expensive functions inside unstored calcs, unreferenced status, the warnings for stored calcs that reference globals or related fields (FileMaker silently unstores those), and the formula itself with click to expand and copy
- Relationships: full sortable list with TOs, base tables, and join keys; multiple predicates, sorted, cascade create and delete
- Relationship graph: interactive view rendered from the TO geometry stored in the file, so occurrences sit exactly where they sit in Manage Database; zoom, pan, rightward chain tracing, Edit Relationship detail on click; Graph Health candidate edges drawn dashed on the same geometry
- **Graph Health**: Anchor–Buoy analysis of the relationship graph with a severing work plan for every direct anchor to anchor edge (see the section below)
- Field dependencies and container field usage
- Layouts: count, visibility, themes, triggers, portal usage, object counts; portals and layout controls in their own sortable tables
- **Layout Calcs**: every calculation stored on a layout object in one searchable table: hide conditions, conditional formatting, tooltips, placeholder text, portal filters and web viewer addresses, button labels, button bar segments, panel labels, button action and script trigger parameters, plus portal sort fields. Each row flags `$$` globals, dynamic evaluation (`Evaluate`, `GetField`, `ExecuteSQL`, `GetLayoutObjectAttribute`), references to an occurrence other than the layout's own, and references to unstored calculation fields, the usual reason a portal filter or hide condition is slow. Portal filters and conditional formatting have no read path in live schema tooling, so the export is the only place they can be audited

**Graph Health**

Graph Health measures the relationship graph against the Anchor–Buoy convention, finds every direct anchor to anchor edge, and writes the severing work plan for each one: which buoy to create or reuse, what to repoint, which scripts to confirm, then delete and verify. Crossings are traced across eight categories, from calc fields and script references (with window context and caller triage) to portal filters, merge fields and value lists.

Every card carries Copy work plan (the human brief as markdown), Copy for an agent (the same plan as one JSON operation per line, for an AI agent or a script driving a schema tool), and with more than one candidate, Copy master programme sequences the whole job cheapest first with shared scripts deduplicated. Every plan states what a single export cannot see before step one. It is observations only: the analyser flags, the developer decides.

The full method, with the crossing categories, the triage rules and the honest limits, is inside the product: open the Graph Health tab and click About this method.

---

## Quick start

1. Download `clockwork-inspector.html`
2. Open it in any modern browser
3. Drag and drop your Save as XML file onto the drop zone (or a FileMaker 2026 split catalog folder)

For comparison mode, switch to Compare and load two files.

No installation. No server. Runs entirely locally.

---

## Using with Claude

The Inspector complements AI assisted FileMaker development. Upload the HTML file to a Claude Project or as a skill, and Claude can reason about your solution's structure, cross reference scripts and layouts, and help you identify gaps or opportunities for improvement.

Graph Health's **Copy for an agent** output is written for exactly this: paste a card's operations into an agent session and it has the buoy, the repoints, the scripts to confirm, and the verify step, without re-deriving the trace.

If the file contains API keys, passwords, or internal hostnames, run it through the XML Scrubber first.

---

## The rest of the collection

**[Menu](https://github.com/andykear)**

**Reference skills**

**[FileMaker Second Opinion](https://github.com/andykear/FileMaker-second-opinion)**\
**[FileMaker AI Vocabulary](https://github.com/andykear/FileMaker-AI-vocabulary)**\

**Research / Specialist**

**[FileMaker AI Grammar](https://github.com/andykear/FileMaker-AI-grammar)**

**Generation, paste-ready FileMaker XML**

**[Script XML Skill](https://github.com/andykear/FileMaker-XMLsnippet-Claude-Skill)** (XMSS, XMSC, XMFN)\
**[Layout XML Skill](https://github.com/andykear/FileMaker-XMLsnippet-Layout-Claude-Skill)** (XML2)\
**[Field, Table & Value List Definitions](https://github.com/andykear/FileMaker-XML-field-definitions)** (XMFD, XMTB, XMVL)

**Analyse a FileMaker solution in your browser**

**[Clockwork Inspector](https://github.com/andykear/FileMaker-XML-inspector-open-source)** (SaXML)\
**[XML Scrubber](https://github.com/andykear/FileMaker-XML-scrubber)** (SaXML + others)

---

## Version history

| Version | Notes |
|---|---|
| 2.8 | **New Graph Health tab**: Anchor–Buoy analysis of the relationship graph. Every direct anchor to anchor edge found, traced across eight crossing categories, and given a numbered severing work plan, with a master programme across the graph, the module split figure, and copy as markdown or as JSON operations for an AI agent. **New Layout Calcs tab**: every calculation stored on a layout object, searchable and flagged. **Calculations** rebuilt as a real browser; **Variables** show set against read counts and dead globals; **External Sources** show paths and dependent TOs. Fix to the reference engine plus 30 minor fixes and further UI optimisation. |
| 2.7 | New Persistent Data tab surfaces FileMaker 2026's persistent data store. Script bodies no longer truncate long formulas or drop comment text. Unreferenced Fields/Table Occurrences now catches usage inside formulas: Hide conditions, conditional formatting, dialog text, merge fields, custom functions. Broken Refs now checks hide conditions, tooltips, conditional formatting and portal filters. |
| 2.6 | Visual redesign; script bodies now show line numbers. Minimal functional changes otherwise. |
| 2.5 | New Step Index tab: every step used in the file with usage counts, Commit Records split by dialog on/off, drill down to the scripts using each step, and a content search to find a dialog by its message. Script steps now render their real content (Set Variable, Set Field, Commit, and more). New checks for broken value list sources, dead conditional formatting, and blank name Set Variables. |
| 2.4 | Theme mood board: every named style rendered as the object it styles (button, field, text, portal, part band) from its own fill, border, corners and font, so a theme can be seen whole. Colour palette indexed to the styles using each colour, with WCAG contrast checks. Plus a field performance risk score, clearer Tables to Fields navigation, and more legible wireframe hidden panels. |
| 2.3 | Relationship graph interactive view. Plus more super additions by Darrin from CadenceUX including fix to reference counts throughout the system, and every list tab now links into the Reference Explorer. |
| 2.2 | Layout wireframe view. Plus numerous additions kindly contributed by Darrin Southern from CadenceUX. Highlight is enhanced Impact Analysis, now a clever universal reference explorer. |
| 2.1 | Minor UI improvements, handles illegal XML control characters in the source (strips and reports them) so affected files parse; quoted Mermaid relationship labels (fixes leading underscore key fields) |
| 2.0 | Comparison mode: diff two files with script step and field calculation diffs, plus Markdown/JSON diff export; FileMaker 2026 split catalog folder support; interactive script call graph visualization; impact analysis; field tag pills |
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

We'd love you to get involved. Found something wrong, got a great idea, don't be shy. Let's work together.
