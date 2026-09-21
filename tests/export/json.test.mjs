// tests/export/json.test.mjs
// The JSON export: the model and the five analyses, round-tripping through
// JSON.parse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { unreferenced } from '../../ui/analysis/unreferenced.js';
import { broken } from '../../ui/analysis/broken.js';
import { callGraph, scriptIssues } from '../../ui/analysis/scripts.js';
import { globals } from '../../ui/analysis/globals.js';
import { jsonExport } from '../../ui/export/json.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const parsed = JSON.parse(jsonExport(solution));

test('the export round-trips and carries the solution the page was drawn from', () => {
  assert.equal(parsed.solution.root, solution.root);
  assert.equal(parsed.solution.cli.version, '0.8.0-beta.0');
  assert.deepEqual(Object.keys(parsed.solution.files), Object.keys(solution.files));
  assert.equal(parsed.solution.files['fmnet://localhost/ooe'].catalogs.table.list.length, 14);
});

test('the five analyses are there, each the same length as the analysis itself', () => {
  assert.deepEqual(Object.keys(parsed.analyses).sort(),
    ['broken', 'callGraph', 'globals', 'scriptIssues', 'unreferenced'].sort());
  assert.equal(parsed.analyses.broken.length, broken(solution).length);
  assert.equal(parsed.analyses.scriptIssues.length, scriptIssues(solution).length);
  assert.equal(parsed.analyses.globals.length, globals(solution).length);
  assert.equal(parsed.analyses.callGraph.nodes.length, callGraph(solution).nodes.length);
  assert.equal(parsed.analyses.callGraph.edges.length, callGraph(solution).edges.length);
  assert.equal(parsed.analyses.unreferenced.fields.length, unreferenced(solution).fields.length);
  assert.equal(parsed.analyses.unreferenced.confidence.tier, unreferenced(solution).confidence.tier);
});

test('nothing a Map or a Set reaches the file: a globals row carries its files as an array', () => {
  const row = parsed.analyses.globals[0];
  assert.ok(Array.isArray(row.files), 'files is an array, not a Set rendered as {}');
  assert.ok(Array.isArray(row.sets));
  // A Set or a Map would serialise as `{}`; nothing in the export may be an
  // empty object where the analysis has members.
  assert.equal(JSON.stringify(row.files), JSON.stringify(globals(solution)[0].files));
});

test('it is indented, so a diff of two exports reads', () => {
  const text = jsonExport(solution);
  assert.ok(text.startsWith('{\n  "solution": {'), text.slice(0, 40));
});

test('an empty solution exports the same shape', () => {
  const out = JSON.parse(jsonExport({ root: 'x', cli: null, files: {}, unreachable: [], readAt: null }));
  assert.deepEqual(out.solution.files, {});
  assert.deepEqual(out.analyses.broken, []);
  assert.deepEqual(out.analyses.callGraph.nodes, []);
});

test('the JSON export carries the File Options block, because it carries the model', () => {
  const root = parsed.solution.files['fmnet://localhost/ooe'];
  assert.deepEqual(root.fileOptions, solution.files['fmnet://localhost/ooe'].fileOptions);
  assert.equal(root.fileOptions.block.layout.name, 'File Open', 'measured against the fixture');
  assert.equal(root.fileOptions.block.triggers.length, 6);
});
