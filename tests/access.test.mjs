import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, has, path } from '../ui/access.js';

test('get reads the exact key first, then the folded spelling', () => {
  assert.equal(get({ withDialog: 1 }, 'withDialog'), 1);
  assert.equal(get({ 'with dialog': 2 }, 'withDialog'), 2);
  assert.equal(get({ url: 'a', URL: 'b' }, 'URL'), 'b');
  assert.equal(get({ x: 1 }, 'y'), undefined);
  assert.equal(get(null, 'y'), undefined);
});

test('has and path', () => {
  assert.equal(has({ 'create folders': false }, 'createFolders'), true);
  assert.equal(path({ options: { 'auto enter': { type: 'calc' } } }, 'options.autoEnter.type'), 'calc');
  assert.equal(path({ a: [{ b: 1 }] }, 'a.0.b'), 1);
  assert.equal(path({ a: null }, 'a.b'), undefined);
});
