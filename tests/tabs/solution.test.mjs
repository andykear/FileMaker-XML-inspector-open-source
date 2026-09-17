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
  assert.ok(html.includes('<th class="num">Entries</th>'), 'the column is renamed from Listed to Entries');
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
