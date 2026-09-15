import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSolution, createFile, applyBatch, catalogCounts } from '../ui/model.js';
import { listOps, describeOps, LIST_CATALOGS } from '../ui/read-plan.js';

const ok = (op, result) => ({ op: op.op, status: 'ok', result });
const err = (op, code) => ({ op: op.op, status: 'error', error: { code, message: code } });

test('createFile has a slot per list catalog plus field and facts', () => {
  const f = createFile('fmnet://localhost/ooe');
  for (const c of [...LIST_CATALOGS, 'field']) assert.ok(f.catalogs[c], c);
  assert.deepEqual(f.catalogs.table, { list: [], listError: null, detailById: {}, ops: [], readAt: null });
  assert.deepEqual(f.facts, {});
  assert.equal(f.name, null);
});

test('applyBatch stores lists, list errors and facts by position', () => {
  const f = createFile('t');
  const ops = listOps();
  const results = ops.map((op) => {
    if (op.op === 'read:table') return ok(op, { kind: 'table', total: 1, returned: 1, items: [{ name: 'A', id: 1 }] });
    if (op.op === 'read:authorization') return err(op, 'unknown_op');
    if (op.op === 'evaluate:calculation') return ok(op, { kind: 'calculation', value: op.calculation === 'Get ( FileName )' ? 'ooe' : '0', dataType: 'text' });
    return ok(op, { kind: 'x', total: 0, returned: 0, items: [] });
  });
  applyBatch(f, ops, { results }, '2026-09-15T10:00:00Z');
  assert.deepEqual(f.catalogs.table.list, [{ name: 'A', id: 1 }]);
  assert.equal(f.catalogs.table.readAt, '2026-09-15T10:00:00Z');
  assert.deepEqual(f.catalogs.table.ops, [{ op: 'read:table' }]);
  assert.deepEqual(f.catalogs.authorization.listError, { code: 'unknown_op', message: 'unknown_op' });
  assert.deepEqual(f.facts['Get ( FileName )'], { value: 'ooe', dataType: 'text' });
  assert.equal(f.name, 'ooe');
});

test('applyBatch stores describes under describeKey, verbatim, errors too', () => {
  const f = createFile('t');
  const ops = describeOps({ table: [{ name: 'A' }], layout: [{ id: 11, type: 'layout' }], script: [{ id: 21, type: 'script' }] });
  const results = [
    ok(ops[0], { kind: 'field', items: [{ name: 'f1', id: 1, type: 'text', options: {}, table: 'A' }] }),
    ok(ops[1], { id: 11, name: 'L', contents: { objects: [] } }),
    err(ops[2], 'not_found'),
  ];
  applyBatch(f, ops, { results }, 'now');
  assert.deepEqual(f.catalogs.field.detailById['table:A'].result.items[0].name, 'f1');
  assert.equal(f.catalogs.layout.detailById['11'].result.name, 'L');
  assert.deepEqual(f.catalogs.script.detailById['21'].error, { code: 'not_found', message: 'not_found' });
  assert.deepEqual(f.catalogs.layout.detailById['11'].op, ops[1]);
  assert.equal(f.catalogs.layout.detailById['11'].readAt, 'now');
});

test('applyBatch with fewer results than ops marks the rest as missing', () => {
  const f = createFile('t');
  const ops = describeOps({ script: [{ id: 1, type: 'script' }, { id: 2, type: 'script' }] });
  applyBatch(f, ops, { results: [ok(ops[0], { id: 1 })] }, 'now');
  assert.equal(f.catalogs.script.detailById['2'].error.code, 'no_result');
});

test('catalogCounts', () => {
  const f = createFile('t');
  f.catalogs.script.list = [{ id: 1, type: 'script' }, { id: 2, type: 'script' }, { id: 3, type: 'folder' }];
  f.catalogs.script.detailById = { 1: { result: {} }, 2: { error: { code: 'x' } } };
  assert.deepEqual(catalogCounts(f).script, { listed: 3, described: 1, errors: 1 });
  assert.deepEqual(catalogCounts(f).font, { listed: 0, described: 0, errors: 0 });
});

test('createSolution', () => {
  assert.deepEqual(createSolution('r', { version: '0.6.0' }), { root: 'r', cli: { version: '0.6.0' }, files: {}, unreachable: [], readAt: null });
});
