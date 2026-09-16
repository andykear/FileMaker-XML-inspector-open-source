// tests/tabs/graph.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { parseHash } from '../../ui/shell.js';
import { tab, occurrenceRows, relationRows, graphSvg } from '../../ui/tabs/graph.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const root = solution.files[api.meta.root];
const ROOT = api.meta.root;
const view = { selection: null, filter: '', multiFile: true };

/** Counts occurrences of a global regexp, the honest way to count SVG nodes. */
const times = (html, re) => (html.match(re) ?? []).length;

test('occurrenceRows describes every occurrence of the file', () => {
  const rows = occurrenceRows(root);
  // The recorded ooe carries 24 table occurrences; 23 local, 1 external (BrojDva::Invoice).
  assert.equal(rows.length, 24);
  const tt = rows.find((r) => r.name === 'TestTable');
  assert.equal(tt.id, 1065089);
  assert.equal(tt.table, 'TestTable');
  assert.deepEqual(tt.source, ['local']);
  assert.equal(tt.related, 1);
  assert.equal(tt.cascade, true);
  assert.equal(tt.color, '#787878');
  assert.deepEqual(tt.bounds, { left: 20, top: 20, width: 131, height: 116 });

  const external = rows.find((r) => r.name === 'Invoice');
  assert.deepEqual(external.source, ['external']);
  assert.equal(external.table, 'BrojDva::Invoice');

  assert.equal(rows.filter((r) => r.related === 0).length, 10);

  // fm 0.7.0 hands back {0,0,0,0} for six of ooe's occurrences: listed, but with
  // no geometry to draw. 18 of the 24 carry a real box.
  assert.equal(rows.filter((r) => r.placed).length, 18);
  assert.deepEqual(rows.filter((r) => !r.placed).map((r) => r.name),
    ['dateTime_calcs', 'LLM_tagged_fields', 'index_languages', 'furigama', 'validation', 'containers']);
  assert.deepEqual(rows.find((r) => r.name === 'validation').bounds, { left: 0, top: 0, width: 0, height: 0 });
});

test('occurrenceRows falls back to the list item when the describe errored', () => {
  const file = {
    target: 'x', name: 'x',
    catalogs: {
      tableOccurrence: {
        list: [{ name: 'Only', id: 7, table: { name: 'T', id: 1 }, position: 0 }],
        detailById: { 7: { error: { code: 'boom', message: 'no' } } },
      },
      relation: { list: [], detailById: {} },
      graphNote: { list: [] },
    },
  };
  const [row] = occurrenceRows(file);
  assert.equal(row.name, 'Only');
  assert.equal(row.table, 'T');
  assert.equal(row.related, 0);
  assert.equal(row.error.code, 'boom');
  assert.equal(row.bounds, null);
});

test('relationRows names both sides, the predicates and the options', () => {
  const rows = relationRows(root);
  // The recorded ooe carries 10 relations; 2 with a cascade delete, 2 with a sort.
  assert.equal(rows.length, 10);
  // Each side is qualified with its own occurrence, the way FileMaker itself
  // spells a predicate (the brief's `/ID = ID_TestTable/` predates that shape).
  assert.match(rows[0].predicates, /::ID = Contacts::ID_TestTable/);
  assert.equal(rows[0].predicates, 'Contacts_TestTable::ID = Contacts::ID_TestTable; Contacts_TestTable::CalcField1_c = Contacts::Name');
  assert.equal(rows[0].left, 'Contacts_TestTable');
  assert.equal(rows[0].right, 'Contacts');
  assert.equal(rows[0].createL, false);
  assert.equal(rows[0].createR, true);
  assert.equal(rows[0].cascadeDeleteL, false);
  assert.equal(rows[0].cascadeDeleteR, true);
  assert.equal(rows[0].sortL, false);
  assert.equal(rows[0].sortR, true);
  assert.match(rows[0].sortSpec, /Contacts_TestTable::TextField1 ascending/);
  assert.equal(rows.filter((r) => r.cascadeDeleteL || r.cascadeDeleteR).length, 2);
  assert.equal(relationRows(solution.files['fmnet://localhost/BrojDva']).length, 0);
});

test('graphSvg draws a rect per occurrence, a line per relation and the notes', () => {
  const svg = graphSvg(root);
  assert.match(svg, /^<svg [^>]*viewBox="-?\d+ -?\d+ \d+ \d+"/);
  // 18 of the 24 occurrences have geometry; all 10 relations join placed ones.
  assert.equal(times(svg, /data-to="/g), 18);
  assert.equal(times(svg, /data-rel="/g), 10);
  assert.ok(!svg.includes('>containers<'), 'an occurrence without geometry is not drawn');
  // A label wider than its box is trimmed: SVG text neither wraps nor clips.
  assert.match(svg, />autoEnter_fields__\u2026</, 'a 24-char name does not fit a 131pt box');
  assert.match(svg, />2nd relationship graph note \(this one is purple on y\u2026</);
  assert.equal(times(svg, /class="note"/g), root.catalogs.graphNote.list.length);
  assert.match(svg, /Relationship graph notes/);
  assert.match(svg, /fill="#787878"/);
  // The first occurrence sits at left 20, top 20, so the 20pt margin puts the box at 0 0.
  assert.match(svg, /viewBox="0 0 /);
  assert.ok(!svg.includes('class="to highlight"'));
});

test('graphSvg highlights the occurrence it is given, and only that one', () => {
  const svg = graphSvg(root, { highlight: 1065089 });
  assert.equal(times(svg, /class="to highlight"/g), 1);
  assert.match(svg, /data-to="1065089" class="to highlight"/);
  assert.equal(graphSvg(root, { highlight: 999999 }).includes('highlight'), false);
});

test('graphSvg skips a relation whose occurrence has no bounds, and empties out', () => {
  const file = {
    target: 'x', name: 'x',
    catalogs: {
      tableOccurrence: { list: [{ name: 'A', id: 1, table: { name: 'A' } }], detailById: {} },
      relation: { list: [{ id: 1 }], detailById: { 1: { result: { id: 1, left: { id: 1 }, right: { id: 2 }, predicates: [], leftToRight: {}, rightToLeft: {} } } } },
      graphNote: { list: [] },
    },
  };
  const svg = graphSvg(file);
  assert.equal(times(svg, /data-rel="/g), 0);
  assert.match(svg, /viewBox="/);
});

test('renders the totals, the occurrence table and the relation table', () => {
  const html = tab.render(solution, view);
  assert.match(html, /Occurrences/);
  assert.match(html, /Relationships/);
  const occurrences = Object.values(solution.files).reduce((n, f) => n + f.catalogs.tableOccurrence.list.length, 0);
  assert.ok(html.includes(`Occurrences <span class="num">${occurrences}</span>`), `expected ${occurrences} occurrences in the totals`);
  assert.ok(html.includes(`Relationships <span class="num">10</span>`));
  assert.match(html, /Unrelated occurrences <span class="num">\d+<\/span>/);
  assert.match(html, /Cascading deletes <span class="num">2<\/span>/);
  assert.ok(html.includes(`data-select="${ROOT}|to:1065089"`));
  assert.ok(html.includes(`data-select="${ROOT}|rel:1"`));
  assert.match(html, /data-reread-catalog="tableOccurrence"/);
  assert.match(html, /data-reread-catalog="relation"/);
  assert.match(html, /ascending/);
  assert.match(html, /<span class="badge [^"]*">external<\/span>/);
});

test('the occurrence name links to the same selection the row carries', () => {
  const html = tab.render(solution, view);
  const href = [...html.matchAll(/href="(#graph[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))[0];
  assert.equal(parseHash(href).tab, 'graph');
  assert.equal(parseHash(href).selection, `${ROOT}|to:1065089`);
});

test('the graph section carries one svg per file and lists the notes', () => {
  const html = tab.render(solution, view);
  assert.equal(times(html, /<svg /g), Object.keys(solution.files).length);
  assert.match(html, /2nd relationship graph note/);
  assert.match(html, /occurrence\(s\) fm reports without geometry/);
});

test('a selected occurrence adds its detail, its re-read and the highlight', () => {
  const html = tab.render(solution, { ...view, selection: `${ROOT}|to:1065089` });
  assert.match(html, /TestTable/);
  assert.match(html, /<dt>Related<\/dt>/);
  assert.match(html, /TestTable_Contacts/);
  assert.match(html, /data-reread-object='\{[^']*"catalog":"tableOccurrence"[^']*"key":"1065089"/);
  assert.equal(times(html, /class="to highlight"/g), 1);
});

test('a selected relation adds its detail and its re-read', () => {
  const html = tab.render(solution, { ...view, selection: `${ROOT}|rel:1` });
  assert.match(html, /<dt>Predicates<\/dt>/);
  assert.match(html, /Contacts_TestTable::ID = Contacts::ID_TestTable/);
  assert.match(html, /data-reread-object='\{[^']*"catalog":"relation"[^']*"key":"1"/);
  assert.match(html, /records can be created/);
});

test('a selection naming nothing in the file falls back to the lists alone', () => {
  const html = tab.render(solution, { ...view, selection: `${ROOT}|to:999999` });
  assert.match(html, /Occurrences/);
  assert.ok(!html.includes('<dt>Related</dt>'));
});

test('the filter narrows the occurrence and relation rows', () => {
  const all = tab.render(solution, view);
  const some = tab.render(solution, { ...view, filter: 'fm26test' });
  assert.ok(some.length < all.length);
  assert.match(some, /FM26Test_Source__cartesian/);
  // The graph still draws (and names) every occurrence; the tables are what narrows.
  assert.ok(!some.includes('>Contacts_TestTable</a>'), 'an occurrence matching neither name nor table is filtered out');
  assert.ok(!some.includes('Contacts_TestTable::ID'), 'a relation matching neither side nor predicate is filtered out');
  assert.equal(times(some, /<svg /g), Object.keys(solution.files).length, 'the graph is never filtered');
});

test('every model string is escaped', () => {
  const evil = {
    target: 'x<y', name: '<img>',
    catalogs: {
      tableOccurrence: {
        list: [{ name: '<b>&"', id: 1, table: { name: '<i>' } }],
        detailById: { 1: { result: { name: '<b>&"', id: 1, table: { name: '<i>' }, source: { local: true }, related: [], tags: ['<t>'], graph: { color: '"><script>', bounds: { left: 0, top: 0, width: 10, height: 10 } } } } },
      },
      relation: { list: [], detailById: {} },
      graphNote: { list: [{ id: 1, text: '<script>alert(1)</script>', bounds: { left: 0, top: 0, width: 9, height: 9 }, backgroundColor: '"onload="x' }] },
    },
  };
  const html = tab.render({ files: { 'x<y': evil }, unreachable: [] }, { selection: null, filter: '', multiFile: false });
  assert.ok(!html.includes('<b>&"'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('onload="x'));
  assert.match(html, /&lt;b&gt;&amp;&quot;/);
});
