import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReadLog } from '../ui/read-log.js';

const num = (n) => `<span class="num">${n}</span>`;

/** The numbered lines: one per file, and never the done line, which is a `<p>`
 *  under the list rather than one more step in it. */
function items(html) {
  assert.ok(html.startsWith('<section class="panel read-log"><header><h2>Reading</h2></header><ol>'), html);
  assert.ok(html.endsWith('</section>'), html);
  const inner = html.slice(html.indexOf('<ol>') + 4, html.indexOf('</ol>'));
  return inner ? inner.split('</li>').filter(Boolean).map((s) => s.replace(/^<li>/, '')) : [];
}

/** The total under the list, or '' while the walk is still running. */
function total(html) {
  return html.slice(html.indexOf('</ol>') + '</ol>'.length, -'</section>'.length);
}

const OOE = {
  list: { type: 'list', target: 'fmnet://localhost/ooe', ops: 27 },
  listed: { type: 'listed', target: 'fmnet://localhost/ooe', ms: 2100, catalogs: 19, entries: 245 },
  describe: {
    type: 'describe',
    target: 'fmnet://localhost/ooe',
    ops: 169,
    byCatalog: {
      field: 14, layout: 18, script: 41, tableOccurrence: 24, relation: 10,
      valueList: 8, customFunction: 9, privilegeSet: 7, customMenu: 25, account: 13,
    },
  },
  described: { type: 'described', target: 'fmnet://localhost/ooe', ms: 1900 },
};

test('a file in flight says which phase it is in, and closes it with its seconds', () => {
  const log = createReadLog();
  log.push(OOE.list);
  assert.deepEqual(items(log.html()), ['<b>ooe</b> <span class="pending">listing …</span>']);

  log.push(OOE.listed);
  assert.deepEqual(items(log.html()), [
    `<b>ooe</b> listed ${num(19)} catalogs, ${num(245)} entries (2.1 s)`,
  ]);

  const describing = `describing ${num(169)} objects: ${num(41)} scripts, ${num(25)} menus, `
    + `${num(24)} occurrences, ${num(18)} layouts, ${num(14)} tables, ${num(13)} accounts, `
    + `${num(10)} relations, ${num(9)} custom functions, ${num(8)} value lists, ${num(7)} privilege sets`;

  log.push(OOE.describe);
  assert.deepEqual(items(log.html()), [
    `<b>ooe</b> listed ${num(19)} catalogs, ${num(245)} entries (2.1 s) · <span class="pending">${describing} …</span>`,
  ]);

  log.push(OOE.described);
  assert.deepEqual(items(log.html()), [
    `<b>ooe</b> listed ${num(19)} catalogs, ${num(245)} entries (2.1 s) · ${describing} (1.9 s)`,
  ]);
});

test('two files, an unreachable one and the done line, in the order the events arrived', () => {
  const log = createReadLog();
  for (const e of [OOE.list, OOE.listed, OOE.describe, OOE.described]) log.push(e);
  // The fatal file was listed first: its line becomes the unreachable line
  // rather than a second one stuck on "listing".
  log.push({ type: 'list', target: 'fmnet://localhost/Ooe_dev', ops: 27 });
  log.push({
    type: 'unreachable', target: 'fmnet://localhost/Ooe_dev',
    from: 'fmnet://localhost/ooe', via: 'Ooe_dev', code: 'open_failed',
  });
  log.push({ type: 'list', target: 'fmnet://localhost/BrojDva', ops: 27 });
  log.push({ type: 'listed', target: 'fmnet://localhost/BrojDva', ms: 800, catalogs: 19, entries: 60 });
  log.push({
    type: 'describe', target: 'fmnet://localhost/BrojDva', ops: 5,
    byCatalog: { field: 3, script: 1, valueList: 1 },
  });
  log.push({ type: 'described', target: 'fmnet://localhost/BrojDva', ms: 500 });
  log.push({
    type: 'unreachable', target: '$$referenced_file',
    from: 'fmnet://localhost/ooe', via: 'Referenced', code: 'unresolvable',
  });
  log.push({ type: 'done', files: 2, unreachable: 2, ms: 10300 });

  const lines = items(log.html());
  // Four files walked; the done line is under the list, not numbered inside it.
  assert.equal(lines.length, 4);
  assert.equal(lines[1], '<b>Ooe_dev</b> unreachable: open_failed (via Ooe_dev from ooe)');
  assert.equal(
    lines[2],
    `<b>BrojDva</b> listed ${num(19)} catalogs, ${num(60)} entries (0.8 s) · `
      + `describing ${num(5)} objects: ${num(3)} tables, ${num(1)} script, ${num(1)} value list (0.5 s)`,
  );
  assert.equal(lines[3], '<b>$$referenced_file</b> unreachable: unresolvable (via Referenced from ooe)');
  assert.equal(total(log.html()), `<p>Read ${num(2)} files, ${num(2)} unreachable, in 10.3 s overall</p>`);
});

test('a root that fatals has no referrer to name, and one entry is not plural', () => {
  const log = createReadLog();
  log.push({ type: 'list', target: 'fmnet://localhost/ooe', ops: 27 });
  log.push({ type: 'unreachable', target: 'fmnet://localhost/ooe', from: null, via: null, code: 'open_failed' });
  log.push({ type: 'done', files: 0, unreachable: 1, ms: 300 });
  assert.deepEqual(items(log.html()), ['<b>ooe</b> unreachable: open_failed']);
  assert.equal(total(log.html()), `<p>Read ${num(0)} files, ${num(1)} unreachable, in 0.3 s overall</p>`);

  const one = createReadLog();
  one.push({ type: 'list', target: 'fmnet://localhost/one', ops: 27 });
  one.push({ type: 'listed', target: 'fmnet://localhost/one', ms: 100, catalogs: 1, entries: 1 });
  assert.deepEqual(items(one.html()), [`<b>one</b> listed ${num(1)} catalog, ${num(1)} entry (0.1 s)`]);
  // Nothing is written under the list until the walk is done.
  assert.equal(total(one.html()), '');
});

test('every string the log draws goes through esc', () => {
  const log = createReadLog();
  log.push({ type: 'list', target: 'fmnet://localhost/a<b', ops: 27 });
  log.push({
    type: 'unreachable', target: 'fmnet://localhost/a<b',
    from: 'fmnet://localhost/r"t', via: '<script>', code: '<bad>',
  });
  const html = log.html();
  assert.ok(html.includes('<b>a&lt;b</b> unreachable: &lt;bad&gt; (via &lt;script&gt; from r&quot;t)'), html);
  assert.ok(!html.includes('<script>'));
});
