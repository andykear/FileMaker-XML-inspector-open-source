// tests/tabs/layouts.test.mjs
// Every count here was measured against tests/fixtures/ooe before it was pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { tab, walkObjects, objectCounts, layoutRows, wireframeSvg, selectionOf } from '../../ui/tabs/layouts.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const root = solution.files[api.meta.root];
const view = { selection: null, filter: '', multiFile: true };

const detailOf = (file, id) => file.catalogs.layout.detailById[String(id)].result;
const MY_LAYOUT = detailOf(root, 1); // "My Layout for TestTable"

test('walkObjects visits every object through the nesting, carrying depth', () => {
  const seen = [];
  walkObjects(MY_LAYOUT.contents.objects, (obj, depth) => seen.push({ id: obj.id, type: obj.type, depth }));
  assert.equal(seen.length, 105);
  // The popover holds one label; fm nests it under `objects`.
  const popover = seen.find((o) => o.type === 'popover');
  assert.equal(popover.depth, 0);
  assert.equal(seen.find((o) => o.id === 59).depth, 1);
  // Three levels of groups inside one another on this layout.
  assert.ok(Math.max(...seen.map((o) => o.depth)) >= 3);
  assert.deepEqual([], (() => { const out = []; walkObjects(undefined, (o) => out.push(o)); return out; })());
});

test('walkObjects also descends panels and segments when fm reports them', () => {
  // fm 0.7.0 nests everything under `objects`; these two keys are in the contract, so
  // the walk must not go blind if a later build uses them.
  const objects = [{ id: 1, type: 'tabControl', bounds: { left: 0, top: 0, width: 10, height: 10 }, panels: [{ id: 2, type: 'tabPanel', bounds: { left: 0, top: 0, width: 10, height: 10 } }] },
    { id: 3, type: 'buttonBar', bounds: { left: 0, top: 0, width: 10, height: 10 }, segments: [{ id: 4, type: 'button', bounds: { left: 0, top: 0, width: 5, height: 5 } }] }];
  const seen = [];
  walkObjects(objects, (o, d) => seen.push(`${o.id}@${d}`));
  assert.deepEqual(seen, ['1@0', '2@1', '3@0', '4@1']);
});

test('nested object bounds are relative to their container, not absolute', () => {
  // The finding this tab rests on: the popover sits at 989,409 and its only label
  // reports 43,55 -- a coordinate that is nowhere inside the popover on the layout.
  const popover = MY_LAYOUT.contents.objects.find((o) => o.type === 'popover');
  assert.deepEqual(popover.bounds, { left: 989, top: 409, width: 274, height: 141 });
  assert.deepEqual(popover.objects[0].bounds, { left: 43, top: 55, width: 136, height: 22 });
  assert.ok(popover.objects[0].bounds.left < popover.bounds.left);
  // walkObjects hands, as its third argument, the absolute origin the object's own
  // bounds are relative to -- for the label, the popover's own place on the layout.
  let at = null;
  walkObjects(MY_LAYOUT.contents.objects, (o, d, origin) => { if (o.id === 59) at = origin; });
  assert.deepEqual(at, { left: 989, top: 409 });
  assert.deepEqual(at, { left: popover.bounds.left, top: popover.bounds.top });
});

test('objectCounts on "My Layout for TestTable"', () => {
  const c = objectCounts(MY_LAYOUT);
  assert.equal(c.total, 105);
  assert.ok(c.byType.field > 0);
  assert.equal(c.byType.field, 21);
  assert.equal(c.byType.field, MY_LAYOUT.contents.fieldCount); // fm's own count agrees
  assert.equal(c.byType.label, 48);
  assert.equal(c.byControl.editBox, 14);
  assert.equal(c.byControl.dropDownCalendar, 2);
  assert.equal(c.portals, 2);
  assert.equal(c.webViewers, 1);
  assert.equal(c.tabControls, 2);
  assert.equal(c.slideControls, 2);
  assert.equal(c.popovers, 1);
  assert.equal(c.buttonBars, 1);
  assert.equal(c.charts, 1);
  const empty = objectCounts(undefined);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.byType, {});
});

test('layoutRows lists every layout of the file, folders and separators excluded', () => {
  const rows = layoutRows(root);
  const listed = root.catalogs.layout.list.filter((i) => i.type === 'layout');
  assert.equal(rows.length, listed.length);
  assert.equal(rows.length, 18);
  // The separator fm reports in the list is not a layout and gets no row.
  assert.ok(root.catalogs.layout.list.some((i) => i.type === 'separator'));
  assert.ok(!rows.some((r) => r.name === '-'));

  const mine = rows.find((r) => r.name === 'My Layout for TestTable');
  assert.equal(mine.id, 1);
  assert.equal(mine.folder, '');
  assert.equal(mine.hidden, false);
  assert.equal(mine.occurrence, 'TestTable');
  assert.equal(mine.theme, 'MyCustomTheme');
  assert.equal(mine.triggers, 12);
  assert.equal(mine.objects, 105);
  assert.equal(mine.portals, 2);
  assert.equal(mine.webViewers, 1);
  assert.equal(mine.parts, 10);

  const hidden = rows.filter((r) => r.hidden).map((r) => r.name);
  assert.deepEqual(hidden, ['SaXMLDeliveryExecutionContext']);
  assert.deepEqual([...new Set(rows.map((r) => r.folder))].sort(),
    ['', 'MyLayoutFolder/MyLayoutSubfolder', 'SaXMLDelivery']);
  assert.equal(rows.reduce((n, r) => n + r.objects, 0), 475);
  assert.equal(layoutRows(solution.files['fmnet://localhost/BrojDva']).length, 2);
});

test('wireframeSvg draws the parts and every object at its absolute bounds', () => {
  const svg = wireframeSvg(MY_LAYOUT);
  // baseWidth 1616; the last part ends at offset 1600 + height 41.
  assert.match(svg, /<svg class="wireframe" viewBox="0 0 1616 1641"/);
  assert.match(svg, /<rect class="part body" x="0" y="177" width="1616" height="1319"/);
  assert.match(svg, /<rect class="part topNavigation" x="0" y="0" width="1616" height="44"/);
  assert.equal((svg.match(/<rect class="part /g) ?? []).length, 10);
  assert.ok(svg.includes('>Body</text>'));
  assert.ok(svg.includes('>Sub-summary by TextField1 (Leading)</text>'));

  // One rect per object, each with its id.
  assert.equal((svg.match(/<rect class="obj /g) ?? []).length, 105);
  assert.match(svg, /<rect class="obj field" data-object="21" x="214" y="316" width="101" height="31"/);
  assert.ok(svg.includes('<title>field &middot; editBox &middot; TestTable::CalcField1_c</title>'));
  // The popover's label, drawn at parent origin + its own relative bounds.
  assert.match(svg, /<rect class="obj label" data-object="59" x="1032" y="464" width="136" height="22"/);
  assert.ok(!svg.includes('data-object="59" x="43"'));
});

test('wireframeSvg marks the highlighted object and nothing else', () => {
  const svg = wireframeSvg(MY_LAYOUT, { highlight: 21 });
  assert.match(svg, /<rect class="obj field highlight" data-object="21"/);
  assert.equal((svg.match(/highlight/g) ?? []).length, 1);
  assert.match(wireframeSvg(MY_LAYOUT, { highlight: '21' }), /class="obj field highlight"/);
});

test('wireframeSvg falls back to bodyHeight and survives a layout with nothing on it', () => {
  const bare = { geometry: { baseWidth: 400, bodyHeight: 250 }, parts: [], contents: { objects: [] } };
  assert.match(wireframeSvg(bare), /viewBox="0 0 400 250"/);
  assert.match(wireframeSvg({}), /viewBox="0 0 0 0"/);
  // An object reaching past the last part still fits in the box.
  const tall = { geometry: { baseWidth: 100, bodyHeight: 10 }, parts: [{ type: 'body', offset: 0, height: 10 }],
    contents: { objects: [{ id: 5, type: 'label', bounds: { left: 0, top: 0, width: 20, height: 90 } }] } };
  assert.match(wireframeSvg(tall), /viewBox="0 0 100 90"/);
});

test('wireframeSvg escapes everything fm hands it', () => {
  const nasty = { geometry: { baseWidth: 100, bodyHeight: 50 },
    parts: [{ type: 'body"><script>', offset: 0, height: 50, name: '<b>P</b>' }],
    contents: { objects: [{ id: '9"><script>', type: 'label', bounds: { left: 1, top: 1, width: 2, height: 2 }, text: '<script>x</script>' }] } };
  const svg = wireframeSvg(nasty);
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;b&gt;P&lt;/b&gt;'));
  assert.ok(svg.includes('data-object="9&quot;&gt;&lt;script&gt;"'));
});

test('selectionOf splits the target, the layout and the object', () => {
  assert.equal(selectionOf({ selection: null }), null);
  assert.deepEqual(selectionOf({ selection: 'fmnet://localhost/ooe|1' }),
    { target: 'fmnet://localhost/ooe', id: '1', object: null });
  assert.deepEqual(selectionOf({ selection: 'fmnet://localhost/ooe|1#59' }),
    { target: 'fmnet://localhost/ooe', id: '1', object: '59' });
});

test('the tab renders the list, the totals and the folders', () => {
  const html = tab.render(solution, view);
  assert.match(html, /Layouts <span class="num">20<\/span>/);
  assert.match(html, /Objects <span class="num">503<\/span>/);
  assert.match(html, /Portals <span class="num">4<\/span>/);
  assert.match(html, /Web viewers <span class="num">2<\/span>/);
  assert.match(html, /Tab controls <span class="num">4<\/span>/);
  assert.match(html, /Slide controls <span class="num">4<\/span>/);
  assert.match(html, /Popovers <span class="num">2<\/span>/);
  assert.match(html, /Button bars <span class="num">2<\/span>/);
  assert.ok(html.includes('<details open><summary>MyLayoutFolder/MyLayoutSubfolder'));
  assert.ok(html.includes('<details open><summary>(root)'));
  assert.ok(html.includes('data-reread-catalog="layout"'));
  assert.ok(html.includes(`data-select="${'fmnet://localhost/ooe|1'}"`));
  // multiFile: the second file gets its own heading.
  assert.ok(html.includes('<h3>BrojDva</h3>'));
  assert.ok(!html.includes('<script>'));
});

test('selecting a layout renders its detail, parts, wireframe and objects', () => {
  const html = tab.render(solution, { ...view, selection: 'fmnet://localhost/ooe|1' });
  assert.ok(html.includes('Layout My Layout for TestTable'));
  assert.ok(html.includes('data-reread-object='));
  assert.ok(html.includes('"catalog":"layout"'));
  assert.ok(html.includes('MyCustomTheme'));
  assert.ok(html.includes('1616'));
  assert.ok(html.includes('<svg class="wireframe"'));
  assert.ok(html.includes('<ul class="legend">'));
  // Parts table: ten rows, the break field named.
  assert.ok(html.includes('TestTable::TextField1'));
  assert.ok(html.includes('leadingSubSummary'));
  // One object row per object, each selectable with the # form.
  assert.equal((html.match(/data-select="fmnet:\/\/localhost\/ooe\|1#/g) ?? []).length, 105);
  assert.ok(html.includes('data-select="fmnet://localhost/ooe|1#21"'));
});

test('selecting an object highlights it in the wireframe and its row', () => {
  const html = tab.render(solution, { ...view, selection: 'fmnet://localhost/ooe|1#21' });
  assert.match(html, /<rect class="obj field highlight" data-object="21"/);
  assert.ok(html.includes('data-select="fmnet://localhost/ooe|1#21" class="selected"'));
});

test('the object filter narrows the objects table but not the wireframe', () => {
  const html = tab.render(solution, { ...view, selection: 'fmnet://localhost/ooe|1', filter: 'webviewer' });
  assert.equal((html.match(/<rect class="obj /g) ?? []).length, 105);
  assert.equal((html.match(/data-select="fmnet:\/\/localhost\/ooe\|1#/g) ?? []).length, 1);
});

test('a layout whose describe failed says so instead of drawing', () => {
  const broken = structuredClone(root);
  broken.catalogs.layout.detailById['1'] = { error: { code: 'nope', message: 'no describe' } };
  const one = { ...solution, files: { ...solution.files, 'fmnet://localhost/ooe': broken } };
  const html = tab.render(one, { ...view, selection: 'fmnet://localhost/ooe|1' });
  assert.ok(html.includes('nope: no describe'));
  assert.ok(!html.includes('<svg class="wireframe"'));
  assert.equal(layoutRows(broken).find((r) => r.id === 1).objects, 0);
});
