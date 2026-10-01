# Clockwork Inspector for FileMaker

[![Stars](https://img.shields.io/github/stars/andykear/FileMaker-XML-inspector-open-source?style=social)](https://github.com/andykear/FileMaker-XML-inspector-open-source)
[![License](https://img.shields.io/badge/license-CC%20BY%204.0-green)](https://creativecommons.org/licenses/by/4.0/)

**Full solution analysis for FileMaker. Local, in the browser, open. No install, no licence, no cloud.**

**Latest release: 2.9, October 2026.\
In active development.**

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

**Files and parsing**
- Reads Save as XML, FileMaker's native object export, entirely in the browser; nothing is uploaded anywhere
- FileMaker 2026 split catalog folders load as one solution
- Around a million lines of XML per second on a reasonably capable computer

**Overview**
- One landing screen: the file described in a few sentences, then what looks wrong, then the element inventory
- Element inventory: every element type in one table with Count, Errors, Unreferenced and Warnings. Every figure opens the exact items it counted, on the tab those items live in, with a filter bar for All, Errors, Unreferenced and Warnings; the totals row opens them all
- The FileMaker version that wrote the export, shown in About and Methodology

**Schema**
- Tables, table occurrences and fields: counts, types, storage, validation, auto entry
- Per table: indexed, auto entry, validated, repeating and documented field counts, and who last changed the table
- Field performance risk: every field scored 1 to 10 from storage, cross relationship reach, aggregates and SQL, dependency fan out and layout exposure. A heuristic from schema shape, not a measurement
- Calculations browser: every calculation field with storage, result type, index state, performance score, cross table reach, dependency counts, silently unstored warnings and the formula itself
- Field dependencies traced in both directions
- Container fields and their storage options
- Relationships: full sortable list with TOs, base tables, join keys, multiple predicates, sort specs and cascade flags
- Relationship graph drawn from the real Manage Database geometry: zoom, pan, chain tracing, click a relation for its detail
- Graph Health: Anchor–Buoy severing analysis with a work plan for every direct anchor to anchor edge, a master programme, and the module split figure (method inside the tab under About this method)
- Graph hygiene: exact duplicate relationships and same predicate buoy pairs

**Layouts and themes**
- Layouts: visibility, themes, portal usage, object counts and parts
- Which views each layout allows, whether QuickFind is on, and which events its triggers fire with the script each one calls
- Portals and layout controls in their own sortable tables, with each portal's filter calculation and its own copy control, the rows it shows and the row it starts at. A filter or sort reads `off` where the formula is still stored but the checkbox is clear, so a filter FileMaker is not applying is not mistaken for one it is
- Tab order, with the number of fields a user can actually type into, so a blank reads as "nobody needed one" rather than "nobody set one"
- Layout Calcs: every calculation stored on a layout object, searchable, with far TO, $$ global, dynamic evaluation and unstored reference flags. Portal filters and conditional formatting have no live read path, so the export is the only place they can be audited
- Wireframe: any layout drawn from its real object bounds, with part bands, hidden panels, popovers and portal rows
- Theme mood board: every named style rendered as the object it styles, from its own fill, border, corners and font
- Which stock theme each custom theme derives from and at which version, which theme a new layout inherits, per theme authorship and edit counts, the named swatch palette, the layout-builder metrics that decide how a theme sizes a new layout — base font size, minimum header, body and footer — and the layouts with no theme recorded at all
- Colour palette per theme, indexed to the styles wearing each colour, with WCAG contrast checks
- Unused theme styles, counted per theme and identified by the style's own tag rather than its display name, because FileMaker reuses a display name across object types within one theme
- Local CSS: every per object style override in the file

**Logic**
- Script tree as FileMaker folds it, with full step rendering
- Step Index: every step used in the file with counts, drill down to the scripts using it, and content search inside step text
- Script Steps: every step of every script in creation order, with its rendered detail and state
- Script issue checks: swallowed errors, dead Set Variables, enabled steps inside disabled guards, PSoS bodies with client only steps checked on the callee, credential keywords in script logic, and more
- Call graph between scripts, interactive and exportable
- Script context resolved through the call graph: a script with no layout context of its own inherits it from the scripts that call it, walked transitively, and a script nothing can start is named as such
- Step Index carries the whole palette with the zeros visible — which of the 217 steps a file has never used
- Perform Script steps with no script chosen, scripts whose only caller is themselves, and layouts sharing a name with a table occurrence
- Variables: every $local and $$global, with read and set counts, the scripts that set each one, case variants, and dead or write only variables called out; names with spaces handled correctly
- Custom functions with usage counts, recursion flagged, and the unreferenced ones — including a function whose only callers are themselves unreferenced
- Value lists including broken sources and show related values only

**Security**
- Accounts with privilege set and state
- Privilege sets with per area overrides
- Extended privileges and who holds them

**Configuration and metadata**
- File Config: file options and triggers
- External Sources: each source's paths and the table occurrences that depend on it
- Plugins referenced by the file
- Persistent Data: FileMaker 2026's persistent data store
- Custom menus and menu sets
- Developer Tags gathered from names and comments
- Activity: modification metadata across the file
- Bit Flag Decoder: every packed options integer in the file decoded to named flags, from a corpus of 238 flags measured by setting each one and reading the number that changed. 47 are inverted — on when the bit is absent — which is not inferable from a file, and the same corpus drives the layout, portal and field option readings elsewhere in the tool. Bits with no name yet are listed rather than hidden

**Analysis**
- Unreferenced fields, table occurrences, scripts, layouts, value lists, custom functions and theme styles, tiered by confidence because dynamic references (Evaluate, GetField, SQL) are visible but not resolvable
- Why each unreferenced script is unreferenced, with the chain of callers behind the answer
- The routes an export cannot see are named on the unreferenced list: another file calling in, a Server schedule, an fmp:// URL, the Data API and WebDirect
- Unreferenced scripts grouped by folder with a ratio, so a removed module reads as one row rather than forty
- Broken references across hide conditions, tooltips, conditional formatting, portal filters and value list sources
- Reference Explorer: pick any object and see both directions at once, what it references and what references it, from every list in the tool

**Comparison**
- Load two exports and diff them: script step diffs, field calculation diffs, and counter changes, exportable as Markdown or JSON

**Outputs**
- Header Export menu: full Markdown report, findings as JSON, CSV tables
- Mermaid export for the relationship graph and the script call graph
- Graph Health copy buttons: work plan as markdown, JSON operations for an AI agent, master programme across every edge
- Copy on every table: what is on screen, filtered and sorted, as TSV
- Copy on every formula, script body and individual step; layout and script objects copy as XML
- Every export reads from the same parsed model the tabs render from, so a report can never disagree with the page it came from

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

An agent should drive the page and query `window.__lastStats` rather than read the HTML (about 250K tokens) or the export (a 7 MB export is about 2M tokens) into context. The analysis runs once in the browser, and a question costs only its answer: about 40 tokens for the headline counts, about 250 for the whole Summary. The Methodology tab compares this with reading the live file through Claris's Agentic Development Toolkit and with the Inspector Pro MCP.

If the file contains API keys, passwords, or internal hostnames, run it through the XML Scrubber first.

---

## The rest of the collection

**[Menu](https://github.com/andykear)**

**Reference skills**

**[FileMaker Second Opinion](https://github.com/andykear/FileMaker-second-opinion)**\
**[FileMaker AI Vocabulary](https://github.com/andykear/FileMaker-AI-vocabulary)**

**Research / Specialist**

**[FileMaker XML bit-flags](https://github.com/andykear/FileMaker-XML-bit-flags)** (SaXML)\
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
| 2.9 | **Transitive caller context**, **Unreferenced custom functions**, **Orphaned modules**, **Bit Flag Decoder** meanings and now used to expose additional metrics in many places, **Themes**: much more detail. **Portal filter calculations**, with a per row copy control. Plus a step census, tab order, layout trigger events, and copy on every table, script body and step. Twenty metrics fixed. Includes a contribution from Darrin Southern, CadenceUX: the **summary metrics**, **back navigation**, **script steps tab**, **table pinning and filtering**, drill downs, additional variables and counts. |
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
