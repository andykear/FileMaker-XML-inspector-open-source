// tests/tabs/solution.test.mjs
// Every count here was measured against tests/fixtures/ooe before it was pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { tab } from '../../ui/tabs/solution.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);

test('the Solution tab lists every catalog with the Entries column, titled only on the flattened three', () => {
  const html = tab.render(solution);
  assert.ok(html.includes('<th class="num" data-sort="num" title="Click to sort">Entries</th>'), 'the column is renamed from Listed to Entries');
  assert.ok(!html.includes('>Listed<'));

  const title = 'list entries including folders and separators';
  // layout, script and customFunction are fm's flattened lists -- folders and
  // separators inflate their count, so the reader gets a tooltip on hover.
  assert.ok(html.includes(`<span title="${title}">23</span>`), 'layout entries carry the title');
  assert.ok(html.includes(`<span title="${title}">50</span>`), 'script entries carry the title');
  assert.ok(html.includes(`<span title="${title}">12</span>`), 'customFunction entries carry the title');

  // A catalog fm does not flatten (e.g. table) gets a plain number, no title.
  assert.ok(!html.includes(`<span title="${title}">14</span>`));
  assert.match(html, /<td class="num">14<\/td>/);
});

test('every model string in the Solution tab is escaped', () => {
  assert.ok(!tab.render(solution).includes('<script>'));
});

test('the file size fact renders as a rounded size, the exact byte count on hover', () => {
  const root = solution.files[api.meta.root];
  const size = root.facts['Get ( FileSize )'];
  assert.equal(size.value, '3727360', 'measured against the fixture before pinning');
  const html = tab.render(solution);
  assert.ok(html.includes('<span title="3727360 bytes">3.6 MB</span>'));
  // The bare number never leaks onto the page unformatted.
  assert.ok(!html.includes('<dd>3727360</dd>'));
});

test('a null file size falls back to the general fact rendering, not a "null bytes" title', () => {
  const fakeSolution = {
    files: { fake: { target: 'fake', name: 'Fake', facts: { 'Get ( FileSize )': { value: null } }, catalogs: {} } },
    unreachable: [],
  };
  const html = tab.render(fakeSolution);
  assert.ok(!html.includes('bytes'));
  assert.match(html, /<dt>Get \( FileSize \)<\/dt><dd><\/dd>/);
});

test('the field row says per table and borrows the table row\'s read time', () => {
  const html = tab.render(solution);
  const rowOf = (catalog) => [...html.matchAll(/<tr>.*?<\/tr>/g)]
    .map((m) => m[0])
    .find((row) => row.includes(`data-reread-catalog="${catalog}" data-target="${api.meta.root}"`));
  const [field, tables] = [rowOf('field'), rowOf('table')];
  assert.ok(field && tables, 'the root file lists both slots');

  // No list op describes fields, so Entries would be a flat 0 beside Described 14.
  assert.match(field, /<span title="fields are read one table at a time; Described counts the tables read">per table<\/span>/);
  assert.ok(!field.includes('<td class="num">0</td>'), 'no bare zero stands in for the list that never ran');
  assert.match(field, /<td class="num">14<\/td>/, 'Described still counts the 14 tables read');

  // The table read is the read that fetched the fields, so both rows date from it.
  const timeOf = (row) => row.match(/<span class="muted">([^<]*)<\/span>/)?.[1];
  assert.ok(timeOf(tables), 'the table row has a read time to borrow');
  assert.equal(timeOf(field), timeOf(tables));
});

test('the Catalog column links to the tab that shows each catalog', () => {
  const html = tab.render(solution);
  assert.match(html, /<a href="#tables">table<\/a>/);
  assert.match(html, /<a href="#graph">relation<\/a>/);
  assert.match(html, /<a href="#security">account<\/a>/);
  assert.match(html, /<a href="#themes">theme<\/a>/);
  assert.match(html, /<a href="#catalogs">valueList<\/a>/);
});
