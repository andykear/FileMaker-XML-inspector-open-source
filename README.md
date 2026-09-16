# Clockwork Inspector for FileMaker

[![License](https://img.shields.io/badge/license-CC%20BY%204.0-green)](https://creativecommons.org/licenses/by/4.0/)

**Full-solution analysis for FileMaker, read live through Claris ADT's `fm` CLI. Local, reads only, no server to upload your file to.**

Screenshots of version 3 are coming.

**Version 3** reads live FileMaker files directly, through the Claris ADT `fm` CLI, instead of a Save as XML export. It follows a solution's external data sources recursively, so a multi-file solution is inspected as a whole, not one export at a time. Everything it does is a read: `read:*` catalogs, plus `evaluate:calculation` and `validate:calculation` (fm's help guarantees neither ever changes the file) — nothing here writes to the file it inspects.

Run it with `npm install`, then:

```
npm start -- --file=<target> --username=<account>
```

`<target>` is a local `.fmp12` path or an `fmnet://host/file` address. fm asks for the password in its own window and offers to save it in the keychain, so no credential ever passes through this tool's own code. Add `--port=0` to let the OS pick a port, `--no-open` to skip launching a browser tab, or `--no-prompt` for a non-interactive run.

**Tabs**: Solution, Tables, Relationships, Scripts, Layouts, Security, Themes, Analysis, Explorer, Gaps and More (value lists, custom functions, custom menus and menu sets, external data sources, base directories, persistent data, fonts, graph notes, and file facts).

- **Analysis** — the derived views: unreferenced fields, tables, table occurrences, scripts, layouts, value lists and custom functions (tiered by confidence, since a calculation is read as text, not tokens); broken references; script issue checks; every `$$` global.
- **Explorer** — universal search across the solution's named objects, with both directions at once (what an object names, and what names it) and a link that lands on the object's own tab.
- **Gaps** — what the shared coverage register says fm cannot read yet (and why), a live run of that register's own probes against the open file (on demand, reads only — it does not run at startup), and the gaps FileMaker's own step display leaves in how a step is worded. The register is also how gaps get reported to Claris: it is the record of what an inspector like this one still cannot see through `fm`.

**Exports**: Markdown (a full report, numbers taken from the same functions the tabs render from, so a report can never disagree with the page it came from), Mermaid (the relationship graph as an `erDiagram`, the script call graph as a `flowchart`), and JSON (the solution model plus the five analyses, one document).

Along the way it does things FileMaker itself does not offer: a complete visual mood board of any theme with every named style drawn as the object it styles, an interactive relationship graph laid out from the real table-occurrence geometry in the file, layout wireframes, and universal reference exploration in both directions.

Originally developed as a Save as XML inspector by Andrew Kear, owner of [Clockwork Creative Technology](https://www.clockworkct.co.uk), and shared openly with the FileMaker/Claris community. That version is retired; it remains available in this repository's git history. The fm CLI rewrite is by Wim Decorte, [Soliant Consulting](https://www.soliantconsulting.com).

---

## Why open source, and why local

Local, reading the file directly, and open is where the platform is heading, and it is a better place to do this work from.

There is nothing to license. A small Node server spawns `fm` and serves the page to your own browser; your file is read directly by `fm` and never uploaded anywhere. The source is readable, forkable, and built to be extended or embedded in your own workflows.

And open sharing is how the FileMaker community moves the platform forward. Publishing the analysis logic means anyone can see how it works, correct it when it is wrong, and build on it.

---

## What it analyses

Point it at a live file (or a hosted `fmnet://` address) and it reads the solution directly through `fm`, following every external data source it finds so a multi-file solution is inspected whole. Nothing is uploaded anywhere; nothing here writes to the file.

**Schema**
- Base tables, table occurrences, fields — counts, types, storage, validation, auto-entry
- Relationships — full sortable list with TOs, base tables, and join keys; multi-predicate, sort specs
- Relationship graph — interactive view rendered from the table-occurrence geometry fm reports, so occurrences sit exactly where they sit in Manage Database

**Layouts and Themes**
- Layouts — count, triggers, portal usage, object counts, parts
- Wireframe — visual preview of any layout drawn from fm's own object bounds: part bands, colour-coded objects, portal rows
- Themes — a full mood board of any theme. Every named style is rendered as the object it styles (button, field, text, portal, part band) from its own fill, border, corners and font, so a theme can be seen whole without dropping each style onto a layout. The colour palette is indexed to the styles that use each colour, and unused theme styles are flagged

**Scripts**
- Script tree as FileMaker folds it, with step-by-step rendering through the shared step display
- Step index across every file reached, with usage counts and per-step drill-down to the scripts using it
- Script issue checks — swallowed errors, dead Set Variables (a write with no later read), embedded credentials in a quoted literal, and more; each check names the fm key that decided it
- Call graph between scripts

**Analysis** (the derived views, over the whole reached solution)
- Unreferenced fields, tables, table occurrences, scripts, layouts, value lists and custom functions — a calculation is read as text, not FileMaker's own tokens, so the unreferenced-fields list is tiered by confidence rather than asserted flatly
- Broken references — fm's own `problems[]` entries, `<Word Missing>` markers, and named references that resolve to nothing
- Every `$$` global: where it is set, how often it is mentioned, and in which files

**Explorer**
- Universal search across every named object of the reached solution
- Pick any entity to see both directions at once — what it names ("References") and what names it ("Referenced by") — with a link that lands on the object's own tab

**Gaps**
- The shared coverage register's account of what fm cannot read yet, and why
- A live run of that register's own probes against the open file, on demand — reads only, never at startup
- The wording gaps FileMaker's own step display leaves uncovered

**Security and More**
- Accounts, privilege sets, extended privileges, cross-linked in both directions
- Value lists, custom functions, custom menus and menu sets, external data sources, base directories, persistent data, fonts, graph notes, and file facts

**Exports**
- Markdown report, Mermaid diagrams (relationship graph, script call graph) and JSON — every number taken from the same function the matching tab renders from

---

## Quick start

1. `npm install`
2. `npm start -- --file=<target> --username=<account>` — `<target>` is a local `.fmp12` path or an `fmnet://host/file` address
3. fm opens its own password window and offers to save the credential in the keychain
4. The inspector opens in your browser, reading the file live

Reads only, the whole way: `read:*`, `evaluate:calculation` and `validate:calculation`, nothing else.

---

## The FileMaker XML suite

One of a set that reverse-engineers FileMaker's clipboard format family end to end — the private type codes FileMaker uses to carry schema and objects through the clipboard. The three generation specs cover all seven codes between them; two tools support the workflow.

**[Script XML Skill](https://github.com/andykear/FileMaker-XMLsnippet-Claude-Skill)** (XMSS, XMSC, XMFN)
The full script step ID dictionary, plus the hidden paste-handler rules that decide whether your XML survives the trip into FileMaker.

**[Layout XML Skill](https://github.com/andykear/FileMaker-XMLsnippet-Layout-Claude-Skill)** (XML2)
All 18 layout object types mapped, every flag decoded, element order confirmed against native output. Verified across 45+ layouts in 10 production files.

**[Field, Table & Value List Definitions](https://github.com/andykear/FileMaker-XML-field-definitions)** (XMFD, XMTB, XMVL)
Field, table and value list definition XML — auto-enter, validation, storage, calculation options, and the three value list source arms — verified down to the individual option level.

**Analysis — read, audit and clean existing XML**

**[XML Inspector](https://github.com/andykear/FileMaker-XML-inspector-open-source)** (SaXML) — the tool this repository replaced with version 3.0
Did full-catalog dependency analysis of a Save as XML export, entirely in the browser: unreferenced fields, silent-failure risks, broken references, and a diff of two versions of a solution against each other. Retired on 2026-09-16; it remains in this repository's git history, and what replaced it is the fm CLI inspector this README describes.

**[XML Scrubber](https://github.com/andykear/FileMaker-XML-scrubber)** (SaXML + others)
Strips API keys, passwords and internal hostnames out of FileMaker XML before you hand it to an AI tool.

---

## Version history

| Version | Notes |
|---|---|
| 3.0 | Rewrite: reads live FileMaker files (or a hosted `fmnet://` address) through the Claris ADT `fm` CLI instead of a Save as XML export, following external data sources so a multi-file solution is inspected whole. Adds an Analysis tab (unreferenced, broken references, script issues, globals), a Reference Explorer, and a Gaps tab that reports what fm cannot read yet against a shared coverage register, with a live on-demand check. Markdown, Mermaid and JSON exports. The Save as XML version is retired; it remains in git history. Three things version 2 had that this one does not: **Compare mode**, deferred by the design spec (see Out of scope) rather than dropped, because a diff of two live reads is a different feature from a diff of two exports; **plug-in call-site detection**, which is a gap in what fm reports and is registered as `plugin-call-sites` in the coverage register, so a field or script name passed to a plug-in is not counted as a reference; and the **field performance risk score**, which was one number covering several different questions and is now the confidence tier on the Analysis tab, which says what it is uncertain about instead of scoring it. |
| 2.7 | New Persistent Data tab surfaces FileMaker 2026's persistent data store. Script bodies no longer truncate long formulas or drop comment text. Unreferenced Fields/Table Occurrences now catches usage inside formulas — Hide conditions, conditional formatting, dialog text, merge fields, custom functions. Broken Refs now checks hide conditions, tooltips, conditional formatting and portal filters. |
| 2.6 | Visual redesign; script bodies now show line numbers. Minimal functional changes otherwise. |
| 2.5 | New Step Index tab — every step used in the file with usage counts, Commit Records split by dialog on/off, drill-down to the scripts using each step, and a content search to find a dialog by its message. Script steps now render their real content (Set Variable, Set Field, Commit, and more). New checks for broken value list sources, dead conditional formatting, and blank-name Set Variables. |
| 2.4 | Theme mood board — every named style rendered as the object it styles (button, field, text, portal, part band) from its own fill, border, corners and font, so a theme can be seen whole. Colour palette indexed to the styles using each colour, with WCAG contrast checks. Plus a field performance risk score, clearer Tables to Fields navigation, and more legible wireframe hidden panels. |
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
