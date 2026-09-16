// tests/tabs/explorer.test.mjs
// Every count here was measured against tests/fixtures/ooe before it was pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { parseHash } from '../../ui/dom.js';
import { selectionKey } from '../../ui/tabs/common.js';
import { nameIndex } from '../../ui/analysis/refs.js';
import {
  objectEntries, selectionOf, outgoing, incoming, refHash, tab,
} from '../../ui/tabs/explorer.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const ROOT = api.meta.root;
const view = { selection: null, filter: '', multiFile: true };

const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const viewOf = (key, filter = '') => ({ selection: key, filter, multiFile: true });

/** The smallest solution the analyses accept, for the rules ooe cannot measure. */
function handMade(catalogs) {
  const empty = { list: [], listError: null, detailById: {}, ops: [], readAt: null };
  const slots = {};
  for (const c of ['externalDataSource', 'table', 'tableOccurrence', 'relation', 'layout', 'script', 'valueList', 'customFunction', 'customMenu', 'theme', 'field']) {
    slots[c] = { ...empty, ...(catalogs[c] ?? {}) };
  }
  return { root: 'file:///x.fmp12', files: { 'file:///x.fmp12': { target: 'file:///x.fmp12', name: 'x', facts: {}, catalogs: slots } }, unreachable: [] };
}

test('objectEntries: every named object of every reached file, across the seven kinds', () => {
  const entries = objectEntries(solution);
  const byKind = {};
  for (const e of entries) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  assert.deepEqual(byKind, {
    table: 17, occurrence: 27, field: 285, script: 44,
    layout: 20, valueList: 9, customFunction: 9,
  });
  assert.equal(entries.length, 411);
  // Built from nameIndex, so its own totals are the ones above.
  const idx = nameIndex(solution);
  let fields = 0;
  for (const v of idx.fields.values()) fields += v.length;
  assert.equal(byKind.field, fields);
});

test('a selection key round-trips, even for a field whose id carries the `::`', () => {
  const key = selectionKey(ROOT, 'field', 'TestTable::TextField1');
  assert.equal(key, `${ROOT}|field:TestTable::TextField1`);
  assert.deepEqual(selectionOf(viewOf(key)), { target: ROOT, kind: 'field', id: 'TestTable::TextField1' });
  assert.equal(selectionOf(viewOf(null)), null);
  assert.equal(selectionOf(viewOf(`${ROOT}|nonsense:1`)), null);
});

test('a selected script lists what it names: script 9 references noop', () => {
  const sel = { target: ROOT, kind: 'script', id: '9' };
  const rows = outgoing(solution, sel);
  const noop = rows.find((r) => r.kind === 'script' && r.name === 'noop');
  assert.ok(noop, 'noop is not in the references of Decode base64 image');
  assert.equal(noop.how, 'named');
  assert.equal(noop.where, 'body[3].script');
  assert.equal(parseHash(`#${noop.hash}`.replace('#', '#')).tab, 'scripts');
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.name}`).sort(), [
    'field:TestTable::ContainerField1', 'field:TestTable::TextField1', 'script:noop',
  ]);
});

test('a selected script lists what names it, and the Explorer renders both tables', () => {
  const key = selectionKey(ROOT, 'script', 2); // noop
  const rows = incoming(solution, { target: ROOT, kind: 'script', id: '2' });
  assert.equal(rows.length, 47);
  assert.ok(rows.some((r) => r.kind === 'script' && r.name === 'Decode base64 image'));
  const html = tab.render(solution, viewOf(key));
  assert.ok(html.includes('<h3>References</h3>'));
  assert.ok(html.includes('<h3>Referenced by</h3>'));
});

test('a selected field lists the layout objects that show it', () => {
  const rows = incoming(solution, { target: ROOT, kind: 'field', id: 'TestTable::TextField1' });
  assert.equal(rows.length, 23);
  const objects = rows.filter((r) => r.kind === 'layoutObject');
  assert.equal(objects.length, 15);
  const one = objects.find((r) => r.where === 'object[35].field.name');
  assert.equal(one.name, 'My Layout for TestTable');
  // The link carries the layout id and the object id, the Layouts tab's shape.
  assert.deepEqual(parseHash(`#${one.hash.replace('layouts/', 'layouts/')}`), {
    tab: 'layouts', selection: `${ROOT}|1#35`,
  });
  const byKind = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  assert.deepEqual(byKind, { field: 1, script: 2, layout: 2, layoutObject: 15, valueList: 3 });
});

test('refHash: one hash per kind, every one of them routable', () => {
  assert.equal(refHash('script', ROOT, 9), `scripts/${ROOT}|9`);
  assert.equal(refHash('layout', ROOT, 1), `layouts/${ROOT}|1`);
  assert.equal(refHash('layoutObject', ROOT, '1.35'), `layouts/${ROOT}|1#35`);
  assert.equal(refHash('table', ROOT, 'TestTable'), `tables/${ROOT}|TestTable`);
  assert.equal(refHash('field', ROOT, 'TestTable::TextField1'), `tables/${ROOT}|TestTable`);
  assert.equal(refHash('tableOccurrence', ROOT, 4), `graph/${ROOT}|to:4`);
  assert.equal(refHash('relation', ROOT, 3), `graph/${ROOT}|rel:3`);
  assert.equal(refHash('valueList', ROOT, 5), `catalogs/${ROOT}|vl:5`);
  assert.equal(refHash('customFunction', ROOT, 16), `catalogs/${ROOT}|cf:16`);
  assert.equal(refHash('customMenu', ROOT, 2), `catalogs/${ROOT}|menu:2`);
  assert.equal(refHash('nothing-fm-has', ROOT, 1), null);
});

test('every link the Explorer draws round-trips through parseHash', () => {
  const html = tab.render(solution, viewOf(selectionKey(ROOT, 'field', 'TestTable::TextField1')));
  const links = hrefs(html).map(parseHash);
  assert.ok(links.length > 20);
  for (const l of links) {
    assert.ok(['explorer', 'scripts', 'layouts', 'tables', 'graph', 'catalogs', 'themes'].includes(l.tab), `stray tab ${l.tab}`);
    assert.ok(l.selection, `no selection on a ${l.tab} link`);
  }
});

test('the object list is filtered by the box and the totals are not', () => {
  const all = tab.render(solution, view);
  const html = tab.render(solution, { ...view, filter: 'textfield1' });
  assert.ok(html.includes('TestTable::TextField1'));
  assert.ok(!html.includes('Decode base64 image'));
  assert.ok(html.length < all.length);
  assert.ok(html.includes('>411<'), 'the totals moved with the filter');
});

test('a selected script also gets its outgoing call tree, nested', () => {
  const html = tab.render(solution, viewOf(selectionKey(ROOT, 'script', 9)));
  const at = html.indexOf('Call tree');
  assert.ok(at > 0, 'no call tree for a script');
  const block = html.slice(at);
  assert.ok(block.includes('Decode base64 image'));
  assert.ok(block.includes('noop')); // the one script it calls
  const tree = block.slice(block.indexOf('<ul'), block.indexOf('</section>'));
  assert.ok([...tree.matchAll(/<ul/g)].length >= 2, 'the tree is not nested');
  assert.ok(tree.includes('<span class="badge info">step</span>'), 'the naming site is not shown');
});

test('the call tree marks a cycle instead of walking it again', () => {
  // ooe has no script cycle to measure, so the rule is measured on the smallest
  // solution that has one: A calls B, B calls A.
  const step = (name) => ({ stepID: 1, step: 'Perform Script', script: name });
  const hand = handMade({
    script: {
      list: [{ id: 1, name: 'A', type: 'script' }, { id: 2, name: 'B', type: 'script' }],
      detailById: {
        1: { op: {}, readAt: null, result: { id: 1, name: 'A', body: [step('B')] } },
        2: { op: {}, readAt: null, result: { id: 2, name: 'B', body: [step('A')] } },
      },
    },
  });
  const html = tab.render(hand, { selection: 'file:///x.fmp12|script:1', filter: '', multiFile: false });
  const tree = html.slice(html.indexOf('Call tree'));
  assert.ok(tree.includes('<span class="badge warn">cycle</span>'), 'the cycle is not marked');
  assert.equal([...tree.matchAll(/<ul/g)].length, 3); // A, then B, then A again -- and stop
});

test('a selected non-script has no call tree', () => {
  const html = tab.render(solution, viewOf(selectionKey(ROOT, 'field', 'TestTable::TextField1')));
  assert.ok(!html.includes('Call tree'));
});

test('a selection that names nothing says so instead of throwing', () => {
  const html = tab.render(solution, viewOf(`${ROOT}|script:999999`));
  assert.ok(html.includes('Nothing of that name was read') || html.includes('no such object'), html.slice(0, 200));
});

test('a table the filter emptied says so, not that the object names nothing', () => {
  const key = selectionKey(ROOT, 'field', 'TestTable::TextField1');
  const html = tab.render(solution, viewOf(key, 'zzz-nothing-matches-this'));
  // 23 references in and 0 out: the filter empties one table and the other was
  // already empty, and the two must not read the same.
  assert.ok(html.includes('None match the filter'), html.slice(html.indexOf('<h3>Referenced by'), html.indexOf('<h3>Referenced by') + 300));
  assert.ok(html.includes('Names nothing'), 'a genuinely empty direction stopped saying so');
  assert.ok(!html.includes('Nothing names it'), 'a narrowed table claimed nothing names the field');
});

test('the object list rows are the house selectable row', () => {
  const key = selectionKey(ROOT, 'script', 2);
  const html = tab.render(solution, viewOf(key));
  const row = html.slice(html.indexOf(`data-select="${ROOT}|script:2"`) - 4);
  assert.ok(row.startsWith(`<tr data-select="${ROOT}|script:2" class="selected"`), row.slice(0, 120));
  // Raw in the attribute -- the shell reads it back verbatim and encodes once.
  assert.ok(html.includes(`data-select="${ROOT}|field:TestTable::TextField1"`));
});

test('every model string goes through esc', () => {
  const evil = '<img src=x onerror=1>';
  const hand = handMade({
    script: { list: [{ id: 1, name: evil, type: 'script' }], detailById: { 1: { op: {}, readAt: null, result: { id: 1, name: evil, body: [] } } } },
  });
  const html = tab.render(hand, { selection: 'file:///x.fmp12|script:1', filter: '', multiFile: false });
  assert.ok(html.includes('&lt;img src=x onerror=1&gt;'));
  assert.ok(!html.includes('<img src=x'));
});
