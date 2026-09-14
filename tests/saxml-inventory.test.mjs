import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractParserAccesses,
  extractRenderAccesses,
  buildInventoryMarkdown,
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
