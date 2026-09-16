// tests/export/mermaid.test.mjs
// The two Mermaid exports: the relationship graph as an erDiagram and the
// script call graph as a flowchart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { createFile } from '../../ui/model.js';
import { occurrenceRows, relationRows } from '../../ui/tabs/graph.js';
import { callGraph } from '../../ui/analysis/scripts.js';
import { mermaidCallGraph, mermaidRelationships } from '../../ui/export/mermaid.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const files = Object.values(solution.files);

const lines = (text) => text.split('\n');
const ENTITY = /^ {4}([A-Za-z_][A-Za-z0-9_]*)\["(.*)"\]$/;
const RELATION = /^ {4}([A-Za-z_][A-Za-z0-9_]*) \|\|--(?:o\{|\|\|) ([A-Za-z_][A-Za-z0-9_]*) : "/;
const NODE = /^ {4}([A-Za-z_][A-Za-z0-9_]*)\["(.*)"\]$/;
const EDGE = /^ {4}([A-Za-z_][A-Za-z0-9_]*) (-->|-\.->)\|(.*)\| ([A-Za-z_][A-Za-z0-9_]*)$/;

// ── erDiagram ─────────────────────────────────────────────────────────

test('mermaidRelationships starts with erDiagram and says which notation it chose', () => {
  const out = mermaidRelationships(solution);
  assert.equal(lines(out)[0], 'erDiagram');
  const comments = lines(out).filter((l) => l.startsWith('%%'));
  assert.ok(comments.length >= 2, 'a header comment');
  assert.ok(comments.join(' ').includes('||--o{'), 'the comment states the notation');
  assert.ok(comments.join(' ').includes('||--||'));
});

test('one entity per occurrence and one line per relation, and every relation names declared entities', () => {
  const out = mermaidRelationships(solution);
  const entities = lines(out).map((l) => l.match(ENTITY)).filter(Boolean);
  const occurrences = files.flatMap(occurrenceRows);
  assert.equal(entities.length, occurrences.length);
  assert.deepEqual(entities.map((m) => m[2]).sort(), occurrences.map((o) => o.name).sort());
  const relations = lines(out).map((l) => l.match(RELATION)).filter(Boolean);
  assert.equal(relations.length, files.flatMap(relationRows).length);
  const declared = new Set(entities.map((m) => m[1]));
  for (const r of relations) {
    assert.ok(declared.has(r[1]), r[0]);
    assert.ok(declared.has(r[2]), r[0]);
  }
});

test('the predicates are the relation label, with the quote that would close it removed', () => {
  const out = mermaidRelationships(solution);
  const row = files.flatMap(relationRows).find((r) => r.predicates);
  assert.ok(out.includes(`: "${row.predicates}"`), row.predicates);
  for (const line of lines(out)) {
    if (!line.includes(' : "')) continue;
    assert.equal(line.split(' : ')[1].match(/"/g).length, 2, `one pair of quotes: ${line}`);
  }
});

/** Two occurrences whose names are illegal Mermaid identifiers, joined. */
function oddNames() {
  const file = createFile('file:///x.fmp12');
  file.name = 'x';
  file.catalogs.tableOccurrence.list = [{ id: 1, name: 'My TO' }, { id: 2, name: 'Other::TO' }];
  file.catalogs.relation.list = [{
    id: 1,
    left: { id: 1, name: 'My TO' },
    right: { id: 2, name: 'Other::TO' },
    predicates: [{ leftField: 'a', op: '=', rightField: 'b' }],
    leftToRight: { createRelated: false },
    rightToLeft: { createRelated: false },
  }];
  return { root: 'file:///x.fmp12', cli: { version: '0.7.0' }, files: { 'file:///x.fmp12': file }, unreachable: [], readAt: '2026-01-01T00:00:00Z' };
}

test('an identifier with a space or a :: is sanitised, and the real name stays in the label', () => {
  const out = mermaidRelationships(oddNames());
  assert.ok(out.includes('    My_TO["My TO"]'), out);
  assert.ok(out.includes('    Other__TO["Other::TO"]'), out);
  assert.ok(out.includes('    My_TO ||--|| Other__TO : "My TO::a = Other::TO::b"'), out);
  for (const m of lines(out).map((l) => l.match(ENTITY)).filter(Boolean)) {
    assert.match(m[1], /^[A-Za-z_][A-Za-z0-9_]*$/);
  }
});

test('a relation either side of which can create related records is the crow-foot notation', () => {
  const s = oddNames();
  s.files['file:///x.fmp12'].catalogs.relation.list[0].rightToLeft = { createRelated: true };
  assert.ok(mermaidRelationships(s).includes('My_TO ||--o{ Other__TO'), 'create on one side is ||--o{');
});

// ── flowchart ─────────────────────────────────────────────────────────

test('mermaidCallGraph starts with flowchart TD and declares one node per script', () => {
  const out = mermaidCallGraph(solution);
  assert.equal(lines(out)[0], 'flowchart TD');
  const graph = callGraph(solution);
  const labels = lines(out).map((l) => l.match(NODE)).filter(Boolean).map((m) => m[2]);
  for (const node of graph.nodes) assert.ok(labels.includes(node.name), node.name);
  assert.equal(labels.filter((l) => graph.nodes.some((n) => n.name === l)).length >= graph.nodes.length, true);
});

test('one edge per graph edge, labelled by via, and every edge joins declared nodes', () => {
  const out = mermaidCallGraph(solution);
  const graph = callGraph(solution);
  const edges = lines(out).map((l) => l.match(EDGE)).filter(Boolean);
  assert.equal(edges.length, graph.edges.length);
  const vias = new Set(edges.map((e) => e[3]));
  assert.deepEqual([...vias].sort(), [...new Set(graph.edges.map((e) => e.via))].sort());
  const declared = new Set(lines(out).map((l) => l.match(NODE)).filter(Boolean).map((m) => m[1]));
  for (const e of edges) {
    assert.ok(declared.has(e[1]), e[0]);
    assert.ok(declared.has(e[4]), e[0]);
  }
  assert.equal(edges.filter((e) => e[2] === '-.->').length, graph.edges.filter((e) => !e.resolved).length);
});

/** A hand-made graph: one script calling a name no script answers. The fixture
 *  resolves every call, so the dashed edge has to be made here. */
function unresolvedCall() {
  const file = createFile('file:///x.fmp12');
  file.name = 'x';
  file.catalogs.script.list = [{ id: 1, name: 'Caller', type: 'script', steps: 1 }];
  file.catalogs.script.detailById['1'] = {
    op: {}, readAt: null,
    result: { id: 1, name: 'Caller', body: [{ stepID: 1, step: 'Perform Script', script: 'Gone' }] },
  };
  return { root: 'file:///x.fmp12', cli: { version: '0.7.0' }, files: { 'file:///x.fmp12': file }, unreachable: [], readAt: '2026-01-01T00:00:00Z' };
}

test('a name no script answers is a dashed edge to a node of its own', () => {
  const s = unresolvedCall();
  assert.equal(callGraph(s).edges.filter((e) => !e.resolved).length, 1, 'the hand-made graph has one unresolved edge');
  const out = mermaidCallGraph(s);
  const edges = lines(out).map((l) => l.match(EDGE)).filter(Boolean);
  assert.equal(edges.length, 1);
  assert.equal(edges[0][2], '-.->');
  assert.equal(edges[0][3], 'step');
  const declared = new Map(lines(out).map((l) => l.match(NODE)).filter(Boolean).map((m) => [m[1], m[2]]));
  assert.equal(declared.get(edges[0][1]), 'Caller');
  assert.ok(declared.get(edges[0][4]).includes('Gone'), declared.get(edges[0][4]));
});

test('an empty solution is still a diagram of the right type', () => {
  const empty = { root: 'x', cli: null, files: {}, unreachable: [], readAt: null };
  assert.equal(lines(mermaidRelationships(empty))[0], 'erDiagram');
  assert.equal(lines(mermaidCallGraph(empty))[0], 'flowchart TD');
});
