// The helpers every tab shares. Behaviour here is pinned twice: once against the
// fixture, once against the tabs that use it, so a change shows up as a tab
// diff rather than as a silent reshaping of every table on the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import {
  catalogActions, detailOf, FACT_FOLD, factValue, kindSelection, listOf, parseSelection, selectRow,
  selectionKey, selectionTail, totalsLine, withFile,
} from '../../ui/tabs/common.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const ROOT = api.meta.root;
const root = solution.files[ROOT];

test('listOf and detailOf reach into a file, and answer empty for what is not there', () => {
  assert.equal(listOf(root, 'table').length, root.catalogs.table.list.length);
  assert.deepEqual(listOf(root, 'nosuchcatalog'), []);
  assert.deepEqual(listOf({}, 'table'), []);
  assert.deepEqual(listOf(undefined, 'table'), []);
  // The id is stringified: fm's ids are numbers, the model's keys are not.
  assert.equal(detailOf(root, 'account', 2).result.name, 'Admin');
  assert.equal(detailOf(root, 'account', '2').result.name, 'Admin');
  assert.equal(detailOf(root, 'account', 99999), undefined);
  assert.equal(detailOf({}, 'account', 1), undefined);
});

test('withFile adds the File column only in a multi-file view', () => {
  const columns = [{ key: 'name', label: 'Name' }];
  assert.deepEqual(withFile(columns, { multiFile: false }), columns);
  assert.deepEqual(withFile(columns, {}), columns);
  assert.deepEqual(withFile(columns, undefined), columns);
  assert.deepEqual(withFile(columns, { multiFile: true }), [{ key: 'file', label: 'File' }, ...columns]);
});

test('selectRow puts the key raw in data-select and marks the selected row', () => {
  const attrs = selectRow('a|b');
  assert.equal(attrs({ key: 'a|b' }), 'data-select="a|b" class="selected"');
  assert.equal(attrs({ key: 'c|d' }), 'data-select="c|d"');
  assert.equal(selectRow(null)({ key: '<b>&"' }), 'data-select="&lt;b&gt;&amp;&quot;"');
});

test('totalsLine escapes its labels and counts', () => {
  assert.equal(totalsLine([['Tables', 3], ['Fields', 40]]),
    '<p class="muted totals">Tables <span class="num">3</span> &middot; Fields <span class="num">40</span></p>');
  assert.match(totalsLine([['<b>', 1]]), /&lt;b&gt;/);
  assert.equal(totalsLine([['n', undefined]]), '<p class="muted totals">n <span class="num">0</span></p>');
});

test('catalogActions names what it re-reads on one file and which file on several', () => {
  const one = catalogActions({ files: { [ROOT]: root } }, 'valueList', { multiFile: false }, 'value lists');
  assert.equal(one, `<button data-reread-catalog="valueList" data-target="${ROOT}">Re-read value lists</button>`);
  const many = catalogActions(solution, 'valueList', { multiFile: true }, 'value lists');
  assert.equal(many.split('</button>').filter(Boolean).length, Object.keys(solution.files).length);
  assert.ok(many.includes('Re-read ooe'));
  assert.ok(many.includes('Re-read BrojDva'));
  // A file fm never named falls back to its target.
  const nameless = catalogActions({ files: { x: { target: 'x', name: null } } }, 'font', { multiFile: true }, 'fonts');
  assert.ok(nameless.includes('Re-read x'));
});

test('selectionKey and parseSelection round-trip the one selection shape', () => {
  assert.equal(selectionKey(ROOT, 'acc', 2), `${ROOT}|acc:2`);
  assert.equal(selectionKey(ROOT, 'TestTable'), `${ROOT}|TestTable`);
  assert.deepEqual(parseSelection(`${ROOT}|acc:2`), { target: ROOT, parts: ['acc', '2'] });
  assert.deepEqual(parseSelection(`${ROOT}|TestTable`), { target: ROOT, parts: ['TestTable'] });
  assert.equal(parseSelection('no-pipe'), null);
  assert.equal(parseSelection(null), null);
  assert.equal(parseSelection(undefined), null);
  // The target itself carries `:` and `/`; only the first `|` divides.
  assert.deepEqual(parseSelection('fmnet://localhost/ooe|to:1065089'),
    { target: 'fmnet://localhost/ooe', parts: ['to', '1065089'] });
});

test('selectionTail hands back the whole tail, colons and all', () => {
  assert.deepEqual(selectionTail(`${ROOT}|My:Table`), { target: ROOT, tail: 'My:Table' });
  assert.deepEqual(selectionTail(`${ROOT}|39#12`), { target: ROOT, tail: '39#12' });
  assert.equal(selectionTail('nope'), null);
});

test('kindSelection accepts only the kinds the tab knows', () => {
  assert.deepEqual(kindSelection(`${ROOT}|acc:2`, ['acc', 'priv']), { target: ROOT, kind: 'acc', id: '2' });
  assert.deepEqual(kindSelection(`${ROOT}|priv:4`, ['acc', 'priv']), { target: ROOT, kind: 'priv', id: '4' });
  assert.equal(kindSelection(`${ROOT}|vl:2`, ['acc', 'priv']), null);
  assert.equal(kindSelection(`${ROOT}|2`, ['acc', 'priv']), null);
  assert.equal(kindSelection(null, ['acc']), null);
  // An id that carries its own colon comes back whole.
  assert.deepEqual(kindSelection(`${ROOT}|cf:a:b`, ['cf']), { target: ROOT, kind: 'cf', id: 'a:b' });
});

test('factValue prints a short fact, folds a document, and says what fm could not read', () => {
  assert.equal(factValue({ value: 'ooe' }), 'ooe');
  assert.equal(factValue({ value: '<b>' }), '&lt;b&gt;');
  assert.match(factValue({ error: { code: 'refused', message: 'no' } }), /class="error">refused: no</);
  assert.match(factValue(undefined), /class="error">unread: </);

  // fm answers Get ( FileLocaleElements ) with a JSON document: unfolded it is
  // twenty lines of one key/value line, and the facts around it are unreadable.
  const long = root.facts['Get ( FileLocaleElements )'];
  assert.ok(long.value.length > FACT_FOLD, 'the fixture carries the long fact');
  const html = factValue(long);
  assert.match(html, /^<details><summary>/);
  assert.match(html, /chars\)<\/span><\/summary><pre>/, 'the whole answer is in a pre, where it can be read and selected');
  assert.match(html.slice(0, 200), /APIVers/, 'the summary opens with the answer itself, escaped');
  assert.equal(factValue({ value: 'x'.repeat(FACT_FOLD) }), 'x'.repeat(FACT_FOLD), 'exactly at the limit does not fold');
});
