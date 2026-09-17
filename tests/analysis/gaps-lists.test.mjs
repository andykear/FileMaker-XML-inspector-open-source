// tests/analysis/gaps-lists.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAP_LISTS } from '../../ui/analysis/gaps-lists.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('every row is a key, a title and a note, and nothing that draws', () => {
  assert.ok(GAP_LISTS.length > 0);
  for (const l of GAP_LISTS) {
    assert.deepEqual(Object.keys(l).sort(), ['key', 'note', 'title'], l.key);
    assert.equal(typeof l.key, 'string');
    assert.ok(l.title, l.key);
    // The note is what the list MEANS: a sentence, not a restated heading.
    assert.ok(l.note.length > l.title.length, l.key);
  }
  assert.equal(new Set(GAP_LISTS.map((l) => l.key)).size, GAP_LISTS.length, 'keys are unique');
  assert.ok(Object.isFrozen(GAP_LISTS));
});

test('the module draws nothing: no dom, no tab, no column renderer', () => {
  const src = read('ui/analysis/gaps-lists.js');
  assert.ok(!/from '\.\.\/dom\.js'/.test(src), 'a neutral list does not import the renderer');
  assert.ok(!/from '\.\.\/tabs\//.test(src), 'a neutral list does not import a tab');
});

test('no export module imports the Gaps TAB', () => {
  // The point of the neutral module: ui/export/ builds a report, and a report
  // has no columns with HTML renderers in them. markdown.js and mermaid.js do
  // import other tabs -- on purpose, for the count functions the matching tab
  // uses, which is markdown.js's own stated rule -- so what is forbidden here
  // is importing a RENDERING module for a constant, which is the one import
  // this module exists to replace.
  for (const name of fs.readdirSync(path.join(ROOT, 'ui/export'))) {
    if (!name.endsWith('.js')) continue;
    const src = read(path.join('ui/export', name));
    assert.ok(!src.includes('../tabs/gaps.js'), `${name} imports the Gaps tab`);
  }
});
