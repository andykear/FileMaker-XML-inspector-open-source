// tests/tabs/explorer.test.mjs
// Every count here was measured against tests/fixtures/ooe before it was pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { parseHash } from '../../ui/dom.js';
import { selectionKey } from '../../ui/tabs/common.js';
import { nameIndex, references } from '../../ui/analysis/refs.js';
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

/** The kind a reference's `from` calls the object the Explorer lists under its
 *  own spelling -- the same two-sided naming ui/tabs/explorer.js carries. */
const OWNER_KIND = { occurrence: 'tableOccurrence', rel: 'relation', menu: 'customMenu' };

/** The smallest solution the analyses accept, for the rules ooe cannot measure. */
function handMade(catalogs) {
  const empty = { list: [], listError: null, detailById: {}, ops: [], readAt: null };
  const slots = {};
  for (const c of ['externalDataSource', 'table', 'tableOccurrence', 'relation', 'layout', 'script', 'valueList', 'customFunction', 'customMenu', 'theme', 'field']) {
    slots[c] = { ...empty, ...(catalogs[c] ?? {}) };
  }
  return { root: 'file:///x.fmp12', files: { 'file:///x.fmp12': { target: 'file:///x.fmp12', name: 'x', facts: {}, catalogs: slots } }, unreachable: [] };
}

test('objectEntries: every named object of every reached file, across the nine kinds', () => {
  const entries = objectEntries(solution);
  const byKind = {};
  for (const e of entries) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  assert.deepEqual(byKind, {
    table: 17, occurrence: 27, field: 285, script: 44,
    layout: 20, rel: 10, valueList: 9, customFunction: 9, menu: 49,
  });
  assert.equal(entries.length, 470);
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
  assert.ok(html.includes('>470<'), 'the totals moved with the filter');
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

test("a reference written on a script step shows FileMaker's line beside the key path", () => {
  const sel = selectionOf(viewOf(selectionKey(ROOT, 'script', '55')));
  const rows = outgoing(solution, sel);
  const onSteps = rows.filter((r) => /^body\[\d+\]\./.test(r.where));
  assert.ok(onSteps.length > 0);
  for (const r of onSteps) {
    assert.equal(r.line, Number(/^body\[(\d+)\]/.exec(r.where)[1]) + 1, r.where);
  }
  // A reference written anywhere but a step carries no line rather than a 1.
  const layout = outgoing(solution, selectionOf(viewOf(selectionKey(ROOT, 'layout', '1'))));
  assert.ok(layout.length > 0);
  assert.ok(layout.every((r) => r.line === ''));
  // And the column is on the page, with the sentence that says what it is.
  const html = tab.render(solution, viewOf(selectionKey(ROOT, 'script', '55')));
  const th = /<th class="num" title="([^"]*)">Line<\/th>/.exec(html);
  assert.ok(th, 'no Line column with a title on it');
  assert.match(th[1], /line number/);
});

test('the call tree marks a collapsed branch with the count it stands for', () => {
  const html = tab.render(solution, viewOf(selectionKey(ROOT, 'script', '55')));
  const at = html.indexOf('<h3>Call tree</h3>');
  assert.ok(at > 0);
  const block = html.slice(at);
  // Measured on ooe: script 55 performs `noop` on 19 of its steps, and the
  // tree shows one branch saying so rather than nineteen identical ones.
  assert.ok(block.includes('step &times;19') || block.includes('step ×19'), block.slice(0, 600));
  assert.equal([...block.matchAll(/>noop</g)].length, 1, 'noop appears once in the tree');
});

test('a relation is selectable and lists the occurrences and fields it joins', () => {
  // Measured on ooe: relation 1 joins Contacts_TestTable to Contacts on two
  // predicates and sorts the related records by one more field.
  const entry = objectEntries(solution).find((e) => e.kind === 'rel' && e.id === '1');
  assert.equal(entry.name, 'Contacts_TestTable \u2194 Contacts');
  assert.equal(entry.key, `${ROOT}|rel:1`);
  const sel = selectionOf(viewOf(entry.key));
  assert.deepEqual(sel, { target: ROOT, kind: 'rel', id: '1' });
  const rows = outgoing(solution, sel);
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.name}`).sort(), [
    'field:Contacts::ID_TestTable', 'field:Contacts::Name',
    'field:Contacts_TestTable::CalcField1_c', 'field:Contacts_TestTable::ID',
    'field:Contacts_TestTable::TextField1',
    'occurrence:Contacts', 'occurrence:Contacts_TestTable',
  ]);
  // `ID = ID_TestTable`, the first predicate, one row per side.
  const left = rows.find((r) => r.where === 'predicates.0.leftField');
  const right = rows.find((r) => r.where === 'predicates.0.rightField');
  assert.equal(left.name, 'Contacts_TestTable::ID');
  assert.equal(right.name, 'Contacts::ID_TestTable');
  assert.ok(rows.every((r) => r.how === 'named' && r.resolved));
});

test('a custom menu is selectable and lists the scripts and calculations its items name', () => {
  const entry = objectEntries(solution).find((e) => e.kind === 'menu' && e.name === 'MyCustomMenu');
  assert.equal(entry.key, `${ROOT}|menu:26`);
  const rows = outgoing(solution, selectionOf(viewOf(entry.key)));
  assert.equal(rows.length, 8);
  const scripts = rows.filter((r) => r.kind === 'script');
  assert.deepEqual(scripts.map((r) => r.name).sort(), ['Hello world', 'noop']);
  assert.equal(scripts.find((r) => r.name === 'noop').where, 'items.0.action.script');
  assert.equal(parseHash(`#${scripts[0].hash}`).tab, 'scripts');
  // The calculations its title, its install test and its items carry.
  assert.ok(rows.some((r) => r.kind === 'field' && r.where === 'titleCalculation' && r.how === 'text'));
});

test('a relation and a menu each open on their own tab, and nothing names either', () => {
  for (const [key, own] of [
    [selectionKey(ROOT, 'rel', 1), { tab: 'graph', selection: `${ROOT}|rel:1` }],
    [selectionKey(ROOT, 'menu', 26), { tab: 'catalogs', selection: `${ROOT}|menu:26` }],
  ]) {
    const sel = selectionOf(viewOf(key));
    assert.deepEqual(incoming(solution, sel), [], `${key} has incoming references`);
    const html = tab.render(solution, viewOf(key));
    // The object's own tab, linked above the two tables -- the Graph tab for a
    // relation and the Catalogs tab for a menu, each keyed the way that tab keys it.
    assert.ok(hrefs(html).map(parseHash).some((l) => l.tab === own.tab && l.selection === own.selection),
      `no Open-on-its-own-tab link for ${key}`);
    assert.ok(html.includes('Nothing names a relation or a menu; they name things'), html.slice(html.indexOf('<h3>Referenced by'), html.indexOf('<h3>Referenced by') + 300));
    assert.ok(!html.includes('Nothing names it'), 'the generic note was used for a relation or a menu');
  }
});

test('every reference in the solution is reachable from some selectable object', () => {
  // The Explorer's reach: each reference is owned by one object, and every one
  // of those objects now has a row in the list. A layout owns its objects'
  // references, and a field reference is owned by the table's field, not by the
  // occurrence the name was written through.
  const owners = new Set();
  for (const e of objectEntries(solution)) {
    if (e.kind === 'table') continue; // a table names nothing of its own
    if (e.kind === 'field') owners.add(`field|${e.entry.target}|${e.entry.table}::${e.entry.field}`);
    else owners.add(`${OWNER_KIND[e.kind] ?? e.kind}|${e.target}|${e.id}`);
  }
  const ownerOf = (r) => {
    const id = String(r.from.id);
    return r.from.kind === 'layoutObject'
      ? `layout|${r.from.target}|${id.slice(0, id.indexOf('.'))}`
      : `${r.from.kind}|${r.from.target}|${id}`;
  };
  const all = references(solution);
  const covered = all.filter((r) => owners.has(ownerOf(r)));
  assert.equal(covered.length, all.length, [...new Set(all.filter((r) => !owners.has(ownerOf(r))).map(ownerOf))].join(', '));
  assert.equal(all.length, 2592);
});
