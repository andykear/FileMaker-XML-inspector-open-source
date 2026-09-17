# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Clockwork Inspector rewrite is complete: the fm CLI inspector is the product. It reads live FileMaker files through the Claris ADT `fm` CLI instead of parsing Save as XML. Design: `docs/superpowers/specs/2026-09-14-fm-cli-rewrite-design.md`. Plans: `docs/superpowers/plans/`. The old single-file Save as XML inspector was retired on 2026-09-16 after every row of `docs/saxml-inventory.md` was covered, derived, dropped by owner decision, or registered as a gap; it remains available in git history.

## Commands

- `npm test`: `node --test 'tests/*.test.mjs'` (the directory form of `node --test` fails on Node 22.19).
- `node bin/inspector.mjs --file=<target> --username=<account> [--port=0] [--no-open] [--no-prompt]` (or `npm start -- …`, the `--` being npm's separator): run the inspector against a live file. The Gaps tab's live check runs its probes on demand, not at startup — reads only.
- `INSPECTOR_LIVE=1 npm test`: also runs the live smoke test against the reference solution (reads only).
- `INSPECTOR_BROWSER=1 npm run test:browser`: the browser pass — headless Chrome walks every tab of the live page (reads only). Needs Chrome installed; `INSPECTOR_CHROME` overrides its path. Screenshots land in `.local/screenshots/`.
- `npm run record -- --file=... --username=admin --out=tests/fixtures/ooe`: re-record the ooe fixture, after ooe changes or a new fm build.
- Read-only probes against the reference solution: `fm --file=fmnet://localhost/ooe --username=admin --keychain --no-prompt --abort-on-error=false --out=<out> <ops.ndjson>`. Only read-only ops, ever: `read:*`, plus `evaluate:calculation` and `validate:calculation` (fm's help guarantees they never change the file).

## Layout

- `bin/` — the entry point: parses args, locates fm, starts the server.
- `server/` — the one fm spawn plus the HTTP endpoints.
- `ui/` — the browser-safe model, discovery and page; no server code.
- `ui/tabs/` — one pure renderer per tab; the shell routes `#tab/selection`.
- `ui/analysis/` — pure analyses over the model, memoised per solution.
- `ui/export/` — Markdown, Mermaid and JSON exporters.
- `tests/fixtures/ooe` — the recorded solution, with `meta.json` naming the fm build.

## Shared code

`fm-adt-toolkit` (installed from the GitHub tag in `package.json`; the sibling checkout at `../fm-adt-toolkit` is where changes are made, then tagged and the pin bumped) supplies `runner` (locate and run fm), `step-display` (script step rendering and its catalog), and `gaps` (the register and `fm-gaps check`/`report`). Anything about fm's wire format, step rendering, or known gaps belongs there, not here.
