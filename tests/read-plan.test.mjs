import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIST_CATALOGS, FILE_FACTS, listOps, factOps, describeOps, describeKey, catalogOf } from '../ui/read-plan.js';

test('listOps is the 18 list ops with their flags, then the file facts', () => {
  const ops = listOps();
  assert.equal(ops.length, 18 + 8);
  assert.deepEqual(ops[0], { op: 'read:externalDataSource', detail: true });
  assert.deepEqual(ops.find((o) => o.op === 'read:layout'), { op: 'read:layout', flatten: true });
  assert.deepEqual(ops.find((o) => o.op === 'read:script'), { op: 'read:script', flatten: true });
  assert.deepEqual(ops.find((o) => o.op === 'read:table'), { op: 'read:table' });
  assert.equal(LIST_CATALOGS.length, 18);
  assert.deepEqual(ops.slice(18), FILE_FACTS.map((calculation) => ({ op: 'evaluate:calculation', calculation })));
  assert.deepEqual(ops.slice(18), factOps(), 'a facts re-read sends exactly what the list batch sent');
  assert.ok(FILE_FACTS.includes('Get ( EncryptionState )'));
});

test('describeOps derives one describe per table, layout, script and id-described member', () => {
  const lists = {
    table: [{ name: 'A', id: 1 }, { name: 'B', id: 2 }],
    layout: [{ id: 10, type: 'folder', name: 'F' }, { id: 11, type: 'layout', name: 'L' }],
    script: [{ id: 20, type: 'folder', name: 'F' }, { id: 21, type: 'script', name: 'S' }],
    tableOccurrence: [{ id: 30, name: 'A' }],
    relation: [{ id: 40 }],
    valueList: [{ id: 50, name: 'V' }],
    customFunction: [{ id: 60, name: 'cf' }],
    privilegeSet: [{ id: 70, name: '[Full Access]' }],
    customMenu: [{ id: 80, name: 'M' }],
    account: [{ id: 90, name: 'admin' }],
    font: [{ id: 99, name: 'Helvetica' }],
  };
  const ops = describeOps(lists);
  assert.deepEqual(ops, [
    { op: 'read:field', table: 'A', detail: true },
    { op: 'read:field', table: 'B', detail: true },
    { op: 'read:layout', id: 11, detail: true },
    { op: 'read:script', id: 21 },
    { op: 'read:tableOccurrence', id: 30 },
    { op: 'read:relation', id: 40 },
    { op: 'read:valueList', id: 50 },
    { op: 'read:customFunction', id: 60 },
    { op: 'read:privilegeSet', id: 70 },
    { op: 'read:customMenu', id: 80 },
    { op: 'read:account', id: 90 },
  ]);
});

test('describeOps tolerates missing lists', () => {
  assert.deepEqual(describeOps({}), []);
});

test('describeKey and catalogOf', () => {
  assert.equal(describeKey({ op: 'read:field', table: 'A', detail: true }), 'table:A');
  assert.equal(describeKey({ op: 'read:layout', id: 11, detail: true }), '11');
  assert.equal(catalogOf({ op: 'read:field', table: 'A' }), 'field');
  assert.equal(catalogOf({ op: 'read:tableOccurrence' }), 'tableOccurrence');
  assert.equal(catalogOf({ op: 'evaluate:calculation', calculation: 'Get ( FileName )' }), 'facts');
});
