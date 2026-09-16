import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, table, kv, section, link, badge, matches, rereadCatalogButton, rereadObjectButton, slotAttr } from '../ui/dom.js';

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
  assert.match(html, /<th>Name<\/th><th class="num">Count<\/th>/);
  assert.match(html, /<tr data-select="A&lt;"><td>A&lt;<\/td><td class="num">3<\/td><td><b>A&lt;<\/b><\/td>/);
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
