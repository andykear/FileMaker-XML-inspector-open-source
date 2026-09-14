import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractParserAccesses,
  extractRenderAccesses,
  buildInventoryMarkdown,
  mergeInventory,
} from '../scripts/saxml-inventory.mjs';

const SAMPLE = `
// ── TABLES & FIELDS ────────────────────────────────────────
function parseTablesAndFields(doc, root) {
  const cat = qs(root, 'BaseTableCatalog');
  for (const t of qsa(cat, ':scope > BaseTable')) {
    const name = attr(t, 'name');
    const fields = t.getElementsByTagName('Field');
    const x = t.querySelector('FieldReference');
    const y = el.getAttribute('id');
  }
  return s;
}
// ── LAYOUTS ────────────────────────────────────────────────
function parseLayouts(doc, root) {
  const lc = qs(root, 'LayoutCatalog');
  return s;
}
// ── RENDER ─────────────────────────────────────────────────
function renderResults(file, root, s, elapsed) {
  const tf = s.tables;
  const lay = s.layouts;
  const n = tf.detail.fields_all.length;
  const m = lay.local_css_objects || [];
  const k = s.scripts.count;
}
// ── DENSE TABLE RENDERER (v1.0) ────────────────────────────
function renderDenseTable(opts) {}
`;

const NESTED_SAMPLE = `
function parseNested(doc, root) {
  const v = attr(qs(menu, ':scope > Base'), 'value');
  const w = qs(qs(root, 'A'), 'B');
  return s;
}
`;

test('extractParserAccesses keys by parser and lists unique XML accesses', () => {
  const m = extractParserAccesses(SAMPLE);
  assert.deepEqual([...m.keys()], ['parseTablesAndFields', 'parseLayouts']);
  assert.deepEqual(m.get('parseTablesAndFields'), [
    "attr:'id'",
    "attr:'name'",
    "qs:'BaseTableCatalog'",
    "qs:'FieldReference'",
    "qsa:':scope > BaseTable'",
    "tag:'Field'",
  ]);
  assert.deepEqual(m.get('parseLayouts'), ["qs:'LayoutCatalog'"]);
});

test('extractParserAccesses uses the first argument only across nested calls', () => {
  const m = extractParserAccesses(NESTED_SAMPLE);
  assert.deepEqual(m.get('parseNested'), [
    "attr:'value'",
    "qs:':scope > Base'",
    "qs:'A'",
    "qs:'B'",
  ]);
});

test('extractRenderAccesses resolves aliases back to s.<catalog>', () => {
  const list = extractRenderAccesses(SAMPLE);
  assert.deepEqual(list, [
    's.layouts.local_css_objects',
    's.scripts.count',
    's.tables.detail.fields_all',
  ]);
});

test('buildInventoryMarkdown emits one row per datum with empty classification', () => {
  const md = buildInventoryMarkdown(
    new Map([['parseLayouts', ["qs:'LayoutCatalog'"]]]),
    ['s.layouts.local_css_objects'],
  );
  assert.match(md, /^# SaXML inventory/m);
  assert.match(md, /\| parseLayouts \| qs:'LayoutCatalog' \| {2}\| {2}\| {2}\|/);
  assert.match(md, /\| render \| s\.layouts\.local_css_objects \| {2}\| {2}\| {2}\|/);
});

const EXISTING = [
  '# SaXML inventory',
  '',
  'One row per datum the legacy inspector reads from Save as XML (parser rows) or renders from the stats object (render rows).',
  'Classification is one of `covered`, `derived`, `gap`. `fm` names the catalog and key that supplies it, or the register id for a gap.',
  '',
  '| Source | Datum | Classification | fm | Notes |',
  '|---|---|---|---|---|',
  "| parseLayouts | qs:'LayoutCatalog' | covered | read:layout listing | Already classified by hand. |",
  "| parseLayouts | qs:'StaleDatum' | gap | catalog-stale | This datum no longer appears in the source. |",
  '| render | s.layouts.local_css_objects | covered | layout.contents.objects[].style |  |',
  '',
  '## Summary',
  '',
  '| Classification | Rows |',
  '|---|---|',
  '| covered | 2 |',
  '| gap | 1 |',
  '',
  '## Gap ids introduced',
  '',
  '- `catalog-stale` (1 row): a stale entry kept only to prove removal.',
].join('\n');

test('mergeInventory keeps a classified row, adds a new one blank, drops a stale one, and preserves trailing sections', () => {
  const parsers = new Map([['parseLayouts', ["qs:'LayoutCatalog'", "qs:'NewDatum'"]]]);
  const renders = ['s.layouts.local_css_objects'];
  const { markdown, kept, added, removed } = mergeInventory(EXISTING, parsers, renders);

  assert.equal(kept, 2);
  assert.equal(added, 1);
  assert.equal(removed, 1);

  // The classified row survives untouched.
  assert.match(markdown, /\| parseLayouts \| qs:'LayoutCatalog' \| covered \| read:layout listing \| Already classified by hand\. \|/);
  assert.match(markdown, /\| render \| s\.layouts\.local_css_objects \| covered \| layout\.contents\.objects\[\]\.style \| {2}\|/);
  // The new datum is appended blank.
  assert.match(markdown, /\| parseLayouts \| qs:'NewDatum' \| {2}\| {2}\| {2}\|/);
  // The stale row is gone.
  assert.doesNotMatch(markdown, /StaleDatum/);
  // Everything after the table survives verbatim, stale-gap prose included:
  // this function does not recompute the Summary or rewrite the gap-id notes.
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /\| covered \| 2 \|/);
  assert.match(markdown, /## Gap ids introduced/);
  assert.match(markdown, /`catalog-stale` \(1 row\): a stale entry kept only to prove removal\./);
});

test('mergeInventory preserves an escaped pipe inside a Notes cell', () => {
  const existing = [
    '# SaXML inventory',
    '',
    'One row per datum...',
    'Classification...',
    '',
    '| Source | Datum | Classification | fm | Notes |',
    '|---|---|---|---|---|',
    "| parseBrokenReferences | qs:':scope > Field > ' | covered | valueList.field + valueList.secondField | Truncated selector for ':scope > Field > PrimaryField\\|SecondaryField'; fm reports both arms. |",
    '',
    '## Summary',
  ].join('\n');
  const parsers = new Map([['parseBrokenReferences', ["qs:':scope > Field > '"]]]);
  const { markdown, kept, added, removed } = mergeInventory(existing, parsers, []);
  assert.equal(kept, 1);
  assert.equal(added, 0);
  assert.equal(removed, 0);
  assert.match(markdown, /PrimaryField\\\|SecondaryField/);
});
