import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTarget, targetKey, isHosted } from '../server/targets.mjs';

const hosted = 'fmnet://localhost/ooe';
const local = '/Users/me/Solutions/Root.fmp12';
const existing = new Set(['/Users/me/Solutions/Child.fmp12', '/Users/me/Solutions/sub/Deep.fmp12']);
const deps = { exists: (p) => existing.has(p) };

test('file: sibling of a hosted root becomes fmnet on the same host', () => {
  assert.deepEqual(resolveTarget(hosted, 'file:BrojDva', deps), { target: 'fmnet://localhost/BrojDva' });
});

test('file: sibling of a local root is a .fmp12 in the same directory, only if it exists', () => {
  assert.deepEqual(resolveTarget(local, 'file:Child', deps), { target: '/Users/me/Solutions/Child.fmp12' });
  assert.deepEqual(resolveTarget(local, 'file:sub/Deep', deps), { target: '/Users/me/Solutions/sub/Deep.fmp12' });
  const missing = resolveTarget(local, 'file:Nope', deps);
  assert.equal(missing.unresolvable, true);
  assert.match(missing.reason, /Nope\.fmp12/);
});

test('a directory in a hosted sibling path is unresolvable', () => {
  const r = resolveTarget(hosted, 'file:sub/Child', deps);
  assert.equal(r.unresolvable, true);
  assert.match(r.reason, /director/i);
});

test('absolute fmnet paths resolve without consulting the root', () => {
  assert.deepEqual(resolveTarget(local, 'fmnet:/host.example.com/Other', deps), { target: 'fmnet://host.example.com/Other' });
  assert.deepEqual(resolveTarget(hosted, 'fmnet://host.example.com/Other', deps), { target: 'fmnet://host.example.com/Other' });
});

test('variables, odbc and platform-absolute paths are unresolvable with a reason', () => {
  for (const [path, re] of [
    ['$$referenced_file', /variable/i],
    ['odbc:ets', /odbc/i],
    ['filemac:/Volumes/Data/X.fmp12', /platform/i],
    ['filewin:/C:/Data/X.fmp12', /platform/i],
    ['gibberish', /unrecogni/i],
  ]) {
    const r = resolveTarget(hosted, path, deps);
    assert.equal(r.unresolvable, true, path);
    assert.match(r.reason, re, path);
  }
});

test('targetKey folds case for hosted targets only', () => {
  assert.equal(targetKey('fmnet://LocalHost/Ooe'), 'fmnet://localhost/ooe');
  assert.equal(targetKey('/Users/me/Ooe.fmp12'), '/Users/me/Ooe.fmp12');
  assert.equal(isHosted('fmnet://localhost/ooe'), true);
  assert.equal(isHosted('/Users/me/Ooe.fmp12'), false);
});
