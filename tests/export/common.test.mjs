// tests/export/common.test.mjs
// The pure helpers every exporter shares: the filename, the Markdown cell and
// the Mermaid identifier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportFilename, mdCell, mermaidId, mermaidLabel } from '../../ui/export/common.js';

test('exportFilename names the root file and the day it was read', () => {
  const solution = {
    root: 'fmnet://localhost/ooe',
    files: { 'fmnet://localhost/ooe': { target: 'fmnet://localhost/ooe', name: 'ooe' } },
    readAt: '2026-09-16T14:55:24.101Z',
  };
  assert.equal(exportFilename(solution, 'md'), 'ooe-2026-09-16.md');
  assert.equal(exportFilename(solution, 'mmd'), 'ooe-2026-09-16.mmd');
});

test('exportFilename falls back to the root path, drops .fmp12, and replaces what a filename may not carry', () => {
  const solution = { root: 'file:///Users/me/My Solution.fmp12', files: {}, readAt: '2026-01-02T03:04:05.000Z' };
  assert.equal(exportFilename(solution, 'json'), 'My_Solution-2026-01-02.json');
  // A file fm named is preferred over the path, and its own separators are replaced too.
  const named = { root: 'x', files: { x: { name: 'a/b:c' } }, readAt: '2026-01-02T00:00:00Z' };
  assert.equal(exportFilename(named, 'md'), 'a_b_c-2026-01-02.md');
});

test('exportFilename uses today when the read carries no time, and never returns an empty name', () => {
  const now = new Date('2026-03-04T05:06:07Z');
  assert.equal(exportFilename({ root: 'fmnet://localhost/ooe', files: {} }, 'md', now), 'ooe-2026-03-04.md');
  assert.equal(exportFilename({ root: '', files: {} }, 'md', now), 'solution-2026-03-04.md');
  assert.equal(exportFilename(null, 'md', now), 'solution-2026-03-04.md');
});

test('mdCell escapes the pipe that would split a table row, and flattens line breaks', () => {
  assert.equal(mdCell('a|b'), 'a\\|b');
  assert.equal(mdCell('one\ntwo\r\nthree'), 'one two three');
  assert.equal(mdCell(null), '');
  assert.equal(mdCell(12), '12');
});

test('mermaidId keeps to [A-Za-z0-9_] and never hands out the same identifier twice', () => {
  const used = new Map();
  assert.equal(mermaidId('My TO', used), 'My_TO');
  assert.equal(mermaidId('Other::TO', used), 'Other__TO');
  // A second name that sanitises the same way must not collide with the first.
  assert.equal(mermaidId('My|TO', used), 'My_TO_2');
  assert.equal(mermaidId('My TO', used), 'My_TO', 'the same name is the same node');
  assert.match(mermaidId('123', used), /^[A-Za-z_][A-Za-z0-9_]*$/, 'an identifier never starts with a digit');
  assert.match(mermaidId('', used), /^[A-Za-z_][A-Za-z0-9_]*$/);
});

test('mermaidLabel keeps a quote out of a quoted label and puts a line break on one line', () => {
  assert.equal(mermaidLabel('say "hi"'), 'say #quot;hi#quot;');
  assert.equal(mermaidLabel('a\nb'), 'a b');
  assert.equal(mermaidLabel(undefined), '');
});
