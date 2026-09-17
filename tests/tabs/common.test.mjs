// The helpers every tab shares. Behaviour here is pinned twice: once against the
// fixture, once against the tabs that use it, so a change shows up as a tab
// diff rather than as a silent reshaping of every table on the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import {
  byteSize, catalogActions, catalogHash, detailOf, FACT_FOLD, factValue, kindSelection, listOf, parseSelection,
  selectRow, selectionKey, selectionTail, selectionWithTail, totalsLine, withFile,
} from '../../ui/tabs/common.js';
import { selectionOf as scriptSelectionOf, stepAnchor } from '../../ui/tabs/scripts.js';
import { selectionOf as layoutSelectionOf } from '../../ui/tabs/layouts.js';
import { LIST_CATALOGS } from '../../ui/read-plan.js';

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

test('selectionWithTail splits the coordinate inside an object off the object', () => {
  assert.deepEqual(selectionWithTail(`${ROOT}|39#L83`, 'step'), { target: ROOT, id: '39', step: 'L83' });
  assert.deepEqual(selectionWithTail(`${ROOT}|39`, 'step'), { target: ROOT, id: '39', step: null });
  assert.deepEqual(selectionWithTail(`${ROOT}|1#21`, 'object'), { target: ROOT, id: '1', object: '21' });
  // A name with a colon in it is still one id.
  assert.deepEqual(selectionWithTail(`${ROOT}|My:Layout#7`, 'object'), { target: ROOT, id: 'My:Layout', object: '7' });
  assert.equal(selectionWithTail('nope', 'step'), null);
  assert.equal(selectionWithTail(undefined, 'step'), null);
});

test('the Scripts and Layouts tabs read that one shape, under their own two names', () => {
  assert.deepEqual(scriptSelectionOf({ selection: `${ROOT}|39#L83` }), { target: ROOT, id: '39', step: 'L83' });
  assert.deepEqual(layoutSelectionOf({ selection: `${ROOT}|1#21` }), { target: ROOT, id: '1', object: '21' });
  assert.equal(scriptSelectionOf({}), null);
  assert.equal(layoutSelectionOf({}), null);
});

test('stepAnchor drops the script id rather than spelling it undefined', () => {
  assert.equal(stepAnchor(39, 83), 'step-39-L83');
  assert.equal(stepAnchor(undefined, 1), 'step-L1');
  assert.equal(stepAnchor(null, 1), 'step-L1');
  assert.equal(stepAnchor('', 1), 'step-L1');
  // The shell scrolls to `[id^="step-"]`, so every shape still answers to it.
  assert.ok([stepAnchor(39, 83), stepAnchor(undefined, 1)].every((a) => a.startsWith('step-')));
  assert.ok(!stepAnchor(undefined, 1).includes('undefined'));
});

test('factValue reads fm\'s keys through access.js, so a folded spelling still answers', () => {
  // `get` folds case and separators, which is how every other fm key is read.
  assert.equal(factValue({ Value: 'ooe' }), 'ooe');
  // A value fm reports as null is an answer, not an error: the error branch is
  // for a fact that has no value key at all.
  assert.equal(factValue({ value: null }), '');
  assert.match(factValue({}), /class="error">unread: </);
});

test('byteSize renders bytes, KB, MB, GB with one decimal, dropping a trailing .0', () => {
  assert.equal(byteSize(512), '512 B');
  assert.equal(byteSize(1536), '1.5 KB');
  assert.equal(byteSize(1048576), '1 MB');
  assert.equal(byteSize(3727360), '3.6 MB');
  assert.equal(byteSize('abc'), '');
  assert.equal(byteSize(undefined), '');
  assert.equal(byteSize(null), '');
});

test('catalogHash maps every catalog LIST_CATALOGS carries to a real tab, never null', () => {
  for (const catalog of LIST_CATALOGS) {
    assert.ok(catalogHash(catalog), `${catalog} should map to a tab`);
  }
  assert.equal(catalogHash('table'), 'tables');
  assert.equal(catalogHash('field'), 'tables');
  assert.equal(catalogHash('tableOccurrence'), 'graph');
  assert.equal(catalogHash('relation'), 'graph');
  assert.equal(catalogHash('graphNote'), 'graph');
  assert.equal(catalogHash('layout'), 'layouts');
  assert.equal(catalogHash('script'), 'scripts');
  assert.equal(catalogHash('account'), 'security');
  assert.equal(catalogHash('privilegeSet'), 'security');
  assert.equal(catalogHash('extendedPrivilege'), 'security');
  assert.equal(catalogHash('authorization'), 'security');
  assert.equal(catalogHash('theme'), 'themes');
  assert.equal(catalogHash('valueList'), 'catalogs');
  assert.equal(catalogHash('customFunction'), 'catalogs');
  assert.equal(catalogHash('customMenu'), 'catalogs');
  assert.equal(catalogHash('customMenuSet'), 'catalogs');
  assert.equal(catalogHash('externalDataSource'), 'catalogs');
  assert.equal(catalogHash('baseDirectory'), 'catalogs');
  assert.equal(catalogHash('persistentData'), 'catalogs');
  assert.equal(catalogHash('font'), 'catalogs');
  assert.equal(catalogHash('nosuchcatalog'), null);
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
