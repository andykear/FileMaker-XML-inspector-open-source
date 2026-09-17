// tests/analysis/memo.test.mjs
// The memo has one job: notice what a re-read replaces. Only a solution-grain
// re-read builds a new solution object; the catalog, object and facts grains
// mutate the solution on screen, and a memo keyed on the solution object would
// hand a tab the answer to the previous read for the rest of the session.
//
// Every solution here is discovered on its own, because these tests mutate it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover, reread } from '../../ui/discovery.js';
import { fingerprint, memoise } from '../../ui/analysis/memo.js';
import { nameIndex, references } from '../../ui/analysis/refs.js';
import { scriptIssues } from '../../ui/analysis/scripts.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const ROOT = api.meta.root;
const fresh = () => discover(api, ROOT);

/** The longest described script of the root file, so emptying its body is a
 *  change the counts cannot fail to show. Chosen at run time rather than pinned:
 *  the test is about the memo, not about which script ooe's longest one is. */
function aScript(solution) {
  const slot = solution.files[ROOT].catalogs.script;
  const bodyOf = (k) => (slot.detailById[k].result?.body ?? []).length;
  const key = Object.keys(slot.detailById).sort((a, b) => bodyOf(b) - bodyOf(a))[0];
  assert.ok(key && bodyOf(key) > 0, 'the fixture has a described script with a body');
  return { slot, key };
}

test('memoise computes once per solution and hands back the same value', () => {
  const solution = { files: {} };
  let calls = 0;
  const compute = () => { calls += 1; return { n: calls }; };
  const first = memoise(solution, compute);
  assert.equal(memoise(solution, compute), first);
  assert.equal(calls, 1);
});

test('two computes on one solution do not share a slot', () => {
  const solution = { files: {} };
  const a = () => 'a';
  const b = () => 'b';
  assert.equal(memoise(solution, a), 'a');
  assert.equal(memoise(solution, b), 'b');
});

test('a solution that cannot be a WeakMap key is simply computed', () => {
  let calls = 0;
  const compute = () => { calls += 1; return calls; };
  assert.equal(memoise(null, compute), 1);
  assert.equal(memoise(null, compute), 2);
});

test('the fingerprint carries facts, every list and every detailById', async () => {
  const solution = await fresh();
  const before = fingerprint(solution);
  const file = solution.files[ROOT];
  assert.ok(before.includes(file.facts), 'file.facts is watched');
  assert.ok(before.includes(file.catalogs.script.list), 'a catalog list is watched');
  assert.ok(before.includes(file.catalogs.script.detailById), 'a catalog detailById is watched');
  // Mutating a detail IN PLACE is invisible, exactly as it is to the model: the
  // model replaces detailById rather than editing it (ui/model.js applyBatch).
  assert.deepEqual(fingerprint(solution), before);
});

test('replacing one script detail recomputes references and scriptIssues', async () => {
  const solution = await fresh();
  const before = references(solution);
  const beforeIssues = scriptIssues(solution);
  const beforeIndex = nameIndex(solution);
  assert.equal(references(solution), before, 'an untouched solution answers with the identical array');
  assert.equal(scriptIssues(solution), beforeIssues);
  assert.equal(nameIndex(solution), beforeIndex);

  // An object-grain re-read replaces detailById; this is the same replacement,
  // with a body of no steps so the counts have to move.
  const { slot, key } = aScript(solution);
  const entry = slot.detailById[key];
  const dropped = (entry.result.body ?? []).length;
  assert.ok(dropped > 0);
  slot.detailById = { ...slot.detailById, [key]: { ...entry, result: { ...entry.result, body: [] } } };

  const after = references(solution);
  const afterIssues = scriptIssues(solution);
  assert.notEqual(after, before, 'references was recomputed, not served from the memo');
  assert.ok(after.length < before.length, `references fell: ${before.length} -> ${after.length}`);
  assert.ok(afterIssues.length < beforeIssues.length, `scriptIssues fell: ${beforeIssues.length} -> ${afterIssues.length}`);
  assert.equal(references(solution), after, 'and is memoised again at the new fingerprint');
});

test('a catalog re-read returns the same solution object and still recomputes', async () => {
  const solution = await fresh();
  const before = references(solution);
  const beforeIssues = scriptIssues(solution);

  const { slot, key } = aScript(solution);
  const entry = slot.detailById[key];
  slot.detailById = { ...slot.detailById, [key]: { ...entry, result: { ...entry.result, body: [] } } };
  assert.ok(references(solution).length < before.length);

  // The replay api answers the catalog re-read with the recording, so the body
  // the test dropped comes back and the counts return to what they were.
  const same = await reread(api, solution, { kind: 'catalog', target: ROOT, catalog: 'script' });
  assert.equal(same, solution, 'a catalog re-read mutates in place: the same object');

  const restored = references(solution);
  const restoredIssues = scriptIssues(solution);
  assert.equal(restored.length, before.length, 'the re-read restored every reference');
  assert.equal(restoredIssues.length, beforeIssues.length);
  assert.notEqual(restored, before, 'a fresh array, not the stale memo from before the mutation');
  assert.equal(references(solution), restored, 'the same solution untouched returns the identical array');
});

test('a facts re-read is watched too', async () => {
  const solution = await fresh();
  const before = references(solution);
  await reread(api, solution, { kind: 'catalog', target: ROOT, catalog: 'facts' });
  const after = references(solution);
  assert.equal(after.length, before.length, 'facts carry no references, so the answer is the same length');
  assert.notEqual(after, before, 'but file.facts was replaced, so the memo recomputed');
});
