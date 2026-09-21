import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIST_CATALOGS, FILE_FACTS, listOps, factOps, fileOptionsOps, describeOps, describeKey, catalogOf } from '../ui/read-plan.js';

test('listOps is the 19 list ops with their flags, then the file-options block, then the file facts', () => {
  const ops = listOps();
  assert.equal(ops.length, 19 + 1 + 8);
  // The list ops carry their flags: detail:true on EDSes, flatten:true on layout/script/customFunction, bare read:table, detail:true on theme.
  assert.deepEqual(ops[0], { op: 'read:externalDataSource', detail: true });
  assert.deepEqual(ops[4], { op: 'read:layout', flatten: true });
  assert.deepEqual(ops[5], { op: 'read:script', flatten: true });
  assert.deepEqual(ops[1], { op: 'read:table' });
  assert.deepEqual(ops[18], { op: 'read:theme', detail: true });
  assert.equal(LIST_CATALOGS.length, 19);
  assert.equal(LIST_CATALOGS.at(-1), 'theme');
  assert.deepEqual(ops[19], { op: 'read:fileOptions' }, 'no detail: fm reports at full depth either way');
  assert.deepEqual(ops.slice(20), FILE_FACTS.map((calculation) => ({ op: 'evaluate:calculation', calculation })));
  assert.ok(FILE_FACTS.includes('Get ( EncryptionState )'));
  assert.deepEqual(ops.slice(20), factOps(), 'a facts re-read sends exactly what the list batch sent');
  assert.deepEqual(fileOptionsOps(), [{ op: 'read:fileOptions' }], 'a file-options re-read sends exactly what the list batch sent');
  assert.ok(!LIST_CATALOGS.includes('fileOptions'), 'not a catalog: it has no list and no ids');
});

test('catalogOf routes the file-options op to its own slot', () => {
  assert.equal(catalogOf({ op: 'read:fileOptions' }), 'fileOptions');
});

test('describeOps derives one describe per table, layout, script and id-described member, skipping the folders of a flattened listing', () => {
  const lists = {
    table: [{ name: 'A', id: 1 }, { name: 'B', id: 2 }],
    layout: [{ id: 10, type: 'folder', name: 'F' }, { id: 11, type: 'layout', name: 'L' }],
    script: [{ id: 20, type: 'folder', name: 'F' }, { id: 21, type: 'script', name: 'S' }],
    tableOccurrence: [{ id: 30, name: 'A' }],
    relation: [{ id: 40 }],
    valueList: [{ id: 50, name: 'V' }],
    customFunction: [{ id: 59, type: 'folder', name: 'F' }, { id: 60, type: 'customFunction', name: 'cf' }],
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
