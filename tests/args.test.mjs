import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../server/args.mjs';

test('parseArgs defaults and flags', () => {
  assert.deepEqual(parseArgs(['--file=fmnet://localhost/ooe', '--username=admin']),
    { file: 'fmnet://localhost/ooe', username: 'admin', port: 0, open: true, noPrompt: false });
  assert.deepEqual(parseArgs(['--file=/x/y.fmp12', '--username=a', '--port=8080', '--no-open', '--no-prompt']),
    { file: '/x/y.fmp12', username: 'a', port: 8080, open: false, noPrompt: true });
});

test('parseArgs refuses a missing file or username, a password, and unknown flags', () => {
  assert.throws(() => parseArgs(['--username=a']), /--file/);
  assert.throws(() => parseArgs(['--file=x']), /--username/);
  assert.throws(() => parseArgs(['--file=x', '--username=a', '--password=s']), /password/);
  assert.throws(() => parseArgs(['--file=x', '--username=a', '--bogus']), /bogus/);
});

test('parseArgs bounds the port and refuses a repeated flag', () => {
  assert.throws(() => parseArgs(['--file=x', '--username=a', '--port=abc']), /--port/);
  assert.throws(() => parseArgs(['--file=x', '--username=a', '--port=70000']), /--port/);
  assert.throws(() => parseArgs(['--file=x', '--username=a', '--port=-1']), /--port/);
  assert.throws(() => parseArgs(['--file=x', '--username=a', '--file=y']), /flag --file given twice/);
});
