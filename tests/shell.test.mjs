import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, buildHash } from '../ui/shell.js';

test('parseHash and buildHash round-trip a tab and a selection with reserved characters', () => {
  assert.deepEqual(parseHash(''), { tab: null, selection: null });
  assert.deepEqual(parseHash('#tables'), { tab: 'tables', selection: null });
  assert.deepEqual(parseHash('#tables/fmnet%3A%2F%2Flocalhost%2Fooe%7CContacts'), { tab: 'tables', selection: 'fmnet://localhost/ooe|Contacts' });
  assert.equal(buildHash('tables', 'fmnet://localhost/ooe|Contacts'), '#tables/fmnet%3A%2F%2Flocalhost%2Fooe%7CContacts');
  assert.equal(buildHash('tables', null), '#tables');
});
