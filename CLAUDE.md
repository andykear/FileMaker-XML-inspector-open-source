# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Clockwork Inspector is being rewritten to read live FileMaker files through the Claris ADT `fm` CLI instead of parsing Save as XML. Design: `docs/superpowers/specs/2026-09-14-fm-cli-rewrite-design.md`. Plans: `docs/superpowers/plans/`. The old single-file inspector is kept unchanged at `legacy/clockwork-inspector.html` until every row of `docs/saxml-inventory.md` is covered, derived, dropped by owner decision, or registered as a gap.

## Commands

- `npm test`: `node --test 'tests/*.test.mjs'` (the directory form of `node --test` fails on Node 22.19).
- `npm start -- --file=<target> --username=<account> [--port=0] [--no-open] [--no-prompt]`: run the inspector against a live file.
- `INSPECTOR_LIVE=1 npm test`: also runs the live smoke test against the reference solution (reads only).
- `npm run record -- --file=... --username=admin --out=tests/fixtures/ooe`: re-record the ooe fixture, after ooe changes or a new fm build.
- `npm run inventory`: regenerate the skeleton of `docs/saxml-inventory.md` from the legacy file (classification columns are hand-written; re-running overwrites them, so diff before committing).
- Read-only probes against the reference solution: `fm --file=fmnet://localhost/ooe --username=admin --keychain --no-prompt --abort-on-error=false --out=<out> <ops.ndjson>`. Only read-only ops, ever: `read:*`, plus `evaluate:calculation` and `validate:calculation` (fm's help guarantees they never change the file).

## Layout

- `bin/` — the entry point: parses args, locates fm, starts the server.
- `server/` — the one fm spawn plus the HTTP endpoints.
- `ui/` — the browser-safe model, discovery and page; no server code.
- `tests/fixtures/ooe` — the recorded solution, with `meta.json` naming the fm build.

## Shared code

`fm-adt-toolkit` (installed from the GitHub tag in `package.json`; the sibling checkout at `../fm-adt-toolkit` is where changes are made, then tagged and the pin bumped) supplies `runner` (locate and run fm), `step-display` (script step rendering and its catalog), and `gaps` (the register and `fm-gaps check`/`report`). Anything about fm's wire format, step rendering, or known gaps belongs there, not here.

## Legacy file

`legacy/clockwork-inspector.html` is ~19.5k lines with very long lines; plain `grep` prints nothing on it, use `grep -a`. Its section banners are `// ── NAME ───`. The inventory script relies on every top-level `function` starting at column 0.
