import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, table, kv, section, link, badge, matches, rereadCatalogButton, rereadObjectButton, slotAttr, sortRows, count } from '../ui/dom.js';

test('esc escapes the four characters', () => {
  assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
});

test('table renders columns, numeric alignment, custom render and row attributes', () => {
  const html = table(
    // A column's own render() returns HTML and owns its escaping: the table passes it
    // through untouched (that is what it is for), and only the default path escapes.
    [{ key: 'name', label: 'Name' }, { key: 'n', label: 'Count', num: true }, { key: 'x', label: 'X', render: (r) => `<b>${esc(r.name)}</b>` }],
    [{ name: 'A<', n: 3 }],
    { rowAttrs: (r) => `data-select="${esc(r.name)}"` },
  );
  assert.match(html, /<th data-sort="text" title="Click to sort">Name<\/th><th class="num" data-sort="num" title="Click to sort">Count<\/th>/);
  assert.match(html, /<tr data-select="A&lt;"><td>A&lt;<\/td><td class="num">3<\/td><td><b>A&lt;<\/b><\/td>/);
});

test('every header says how it sorts, keeps a title of its own, and a column can opt out', () => {
  const html = table(
    [
      { key: 'a', label: 'A' },
      { key: 'n', label: 'N', num: true, title: 'What N means' },
      { key: 'b', label: '', sort: false },
    ],
    [{ a: 'x', n: 1, b: '' }],
  );
  // `text` and `num` are the two kinds sortRows knows; the column's own title
  // wins over the hint, because it says what the values MEAN.
  assert.ok(html.includes('<th data-sort="text" title="Click to sort">A</th>'), html);
  assert.ok(html.includes('<th class="num" data-sort="num" title="What N means">N</th>'), html);
  // Opted out: no data-sort, so the shell's handler never sees the click, and
  // no "Click to sort" on a header that does not.
  assert.ok(html.includes('<th></th>'), html);
});

test('sortRows orders by a cell, numerically or by text, stably, without touching the input', () => {
  const rows = [
    { cells: ['b', count(10)], id: 1 },
    { cells: ['A', count(2)], id: 2 },
    { cells: ['a', count(2)], id: 3 },
  ];
  // The cells a caller passes are textContent, which for count() is the number
  // inside the span -- `<span class="num">12</span>` reads back as `12`.
  const text = (r) => r.cells[0];
  assert.deepEqual(sortRows(rows, 0, 'text', 'asc').map(text), ['A', 'a', 'b']);
  assert.deepEqual(sortRows(rows, 0, 'text', 'desc').map(text), ['b', 'A', 'a']);
  // `A` and `a` are equal under sensitivity: 'base', so the original order
  // decides both ways round: the sort is stable.
  assert.deepEqual(sortRows(rows, 0, 'text', 'desc').map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(rows.map(text), ['b', 'A', 'a'], 'the input array is left alone');

  const numeric = [{ cells: ['x', '10'] }, { cells: ['y', '2'] }, { cells: ['z', '9'] }];
  assert.deepEqual(sortRows(numeric, 1, 'num', 'asc').map((r) => r.cells[1]), ['2', '9', '10'], 'numbers, not strings');
  assert.deepEqual(sortRows(numeric, 1, 'num', 'desc').map((r) => r.cells[1]), ['10', '9', '2']);
  // The digits are pulled out of whatever the cell rendered around them.
  assert.deepEqual(
    sortRows([{ cells: ['1,147 KB'] }, { cells: ['-3'] }, { cells: ['82.5 MB'] }], 0, 'num', 'asc').map((r) => r.cells[0]),
    ['-3', '82.5 MB', '1,147 KB'],
  );
});

test('sortRows puts a cell that is not a number last whichever way the column points', () => {
  const rows = [{ cells: ['5'] }, { cells: ['n/a'] }, { cells: ['1'] }, { cells: ['-'] }];
  const cells = (r) => r.cells[0];
  assert.deepEqual(sortRows(rows, 0, 'num', 'asc').map(cells), ['1', '5', 'n/a', '-']);
  assert.deepEqual(sortRows(rows, 0, 'num', 'desc').map(cells), ['5', '1', 'n/a', '-'],
    'a blank is missing, not small: it never walks to the top on a toggle, and the blanks keep their own order');
  // A missing cell reads as empty, which is not a crash.
  assert.deepEqual(sortRows([{ cells: [] }, { cells: ['a'] }], 0, 'text', 'asc').map(cells), [undefined, 'a']);
});

test('table with no rows prints the empty text', () => {
  assert.match(table([{ key: 'a', label: 'A' }], [], { empty: 'nothing here' }), /nothing here/);
});

test('kv, section, link, badge', () => {
  assert.match(kv([['Name', 'v']]), /<dt>Name<\/dt><dd>v<\/dd>/);
  assert.match(section('Title', '<p>b</p>', { actions: '<button>r</button>' }), /<h2>Title<\/h2>.*<button>r<\/button>.*<p>b<\/p>/s);
  assert.equal(link('scripts/x|1', 'Go'), '<a href="#scripts/x%7C1">Go</a>');
  assert.match(badge('on', 'good'), /class="badge good"/);
});

test('matches is a case-insensitive substring test with an empty filter matching all', () => {
  assert.equal(matches('Hello World', 'world'), true);
  assert.equal(matches('Hello', 'x'), false);
  assert.equal(matches('Hello', ''), true);
});

test('the re-read buttons carry the shell\'s data attributes, the slot as JSON', () => {
  assert.equal(
    rereadCatalogButton('fmnet://h/f', 'table', 'Re-read tables'),
    '<button data-reread-catalog="table" data-target="fmnet://h/f">Re-read tables</button>',
  );
  assert.equal(rereadCatalogButton('t', 'script'), '<button data-reread-catalog="script" data-target="t">Re-read</button>');
  // The slot rides in a single-quoted attribute: JSON's own " must survive, ' must not.
  assert.equal(
    rereadObjectButton({ kind: 'object', target: "a'b", catalog: 'script', key: '39' }, 'Re-read script'),
    `<button data-reread-object='{"kind":"object","target":"a&#39;b","catalog":"script","key":"39"}'>Re-read script</button>`,
  );
  assert.deepEqual(
    JSON.parse(slotAttr({ kind: 'object', target: 't', catalog: 'script', key: '1' })),
    { kind: 'object', target: 't', catalog: 'script', key: '1' },
  );
});
