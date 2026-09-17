// tests/tabs/themes.test.mjs
// Every count here was measured against tests/fixtures/ooe before it was pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createReplayApi } from '../replay-api.mjs';
import { discover } from '../../ui/discovery.js';
import { link } from '../../ui/dom.js';
import {
  tab, themeRows, styleUsage, styleCountsByTheme, paletteSwatches, themesTotals, selectionOf,
} from '../../ui/tabs/themes.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/ooe/', import.meta.url));
const api = createReplayApi(FIXTURE);
const solution = await discover(api, api.meta.root);
const root = solution.files[api.meta.root];
const brojDva = solution.files['fmnet://localhost/BrojDva'];
const view = { selection: null, filter: '', multiFile: true };

test('themeRows: 3 themes on the root file, the default one flagged', () => {
  const rows = themeRows(root);
  assert.equal(rows.length, 3);
  assert.equal(rows.length, root.catalogs.theme.list.length);

  const apex = rows.find((r) => r.displayName === 'Apex Blue');
  assert.equal(apex.name, 'com.filemaker.theme.custom.A2E1567C_3C83_4902_AE0C_8DF012467D56');
  assert.equal(apex.group, 'custom');
  assert.equal(apex.isCustom, true);
  assert.equal(apex.isDeprecated, false);
  assert.equal(apex.isDefault, true);
  assert.equal(apex.layoutsUsing, 24);
  assert.equal(apex.namedStyleCount, 94);

  const custom = rows.find((r) => r.displayName === 'MyCustomTheme');
  assert.equal(custom.isDefault, false);
  assert.equal(custom.isCustom, true);
  assert.equal(custom.layoutsUsing, 2);
  assert.equal(custom.namedStyleCount, 95);

  const minimalist = rows.find((r) => r.displayName === 'Minimalist');
  assert.equal(minimalist.group, 'Basic');
  assert.equal(minimalist.isCustom, false);
  assert.equal(minimalist.isDefault, false);
  assert.equal(minimalist.layoutsUsing, 1);
  assert.equal(minimalist.namedStyleCount, 0);

  // Exactly one default theme on this file.
  assert.equal(rows.filter((r) => r.isDefault).length, 1);
});

test('themesTotals: solution-wide across both reached files, unfiltered', () => {
  const t = themesTotals(solution);
  assert.equal(t.themes, 5); // 3 on root + 2 on BrojDva
  assert.equal(t.custom, 2); // both custom themes live on root only
  assert.equal(t.namedStyles, 282); // root 94+95+0, BrojDva 93+0
});

test('styleUsage on the default theme: at least one style is used, and every named style shows up (even unused)', () => {
  const theme = root.catalogs.theme.list.find((t) => t.displayName === 'Apex Blue');
  const usage = styleUsage(root, theme);
  assert.equal(usage.length, 94);
  const used = usage.filter((s) => s.used > 0);
  assert.ok(used.length >= 1);
  const custom = usage.find((s) => s.display === 'MyCustomStyleInApexBlue');
  assert.equal(custom.used, 1);
  const alternating = usage.find((s) => s.key === 'alternating_part');
  assert.ok(alternating);
  assert.equal(alternating.display, 'Alternating');
  assert.equal(alternating.used, 0);
  // Sorted by used desc then display.
  assert.equal(usage[0].display, 'MyCustomStyleInApexBlue');
});

test('styleUsage on a theme used by two layouts counts objects across both, sorted used desc then display', () => {
  const theme = root.catalogs.theme.list.find((t) => t.displayName === 'MyCustomTheme');
  const usage = styleUsage(root, theme);
  assert.equal(usage.length, 95);
  // Two named styles (large_filled, large_filled_button) share the display name
  // "Large Filled", so both keys carry the same used count.
  const topFour = usage.slice(0, 4).map((s) => [s.key, s.display, s.used]);
  assert.deepEqual(topFour, [
    ['large_filled', 'Large Filled', 2],
    ['large_filled_button', 'Large Filled', 2],
    ['FM-38B338BC-4795-4BF4-902F-3D14983EC456', 'MyCustomStyle_BoldItalicsLabel', 2],
    ['FM-413A4E13-09BF-4799-B66D-27BE078F05E7', 'MyCustomStyleInApexBlue', 2],
  ]);
  assert.ok(usage.slice(4).every((s) => s.used === 0));
});

test('styleUsage on a theme with no named styles is empty', () => {
  const theme = root.catalogs.theme.list.find((t) => t.displayName === 'Minimalist');
  assert.deepEqual(styleUsage(root, theme), []);
});

test('paletteSwatches always renders 5 spans, backgrounds only for values that look like colours', () => {
  const apex = root.catalogs.theme.list.find((t) => t.displayName === 'Apex Blue');
  const html = paletteSwatches(apex);
  assert.equal((html.match(/class="swatch"/g) ?? []).length, 5);
  assert.match(html, /style="background:#181818"/);
  assert.match(html, /style="background:#0091CE"/i);

  const minimalist = root.catalogs.theme.list.find((t) => t.displayName === 'Minimalist');
  const emptyHtml = paletteSwatches(minimalist);
  assert.equal((emptyHtml.match(/class="swatch"/g) ?? []).length, 5);
  assert.ok(!emptyHtml.includes('background:'));
});

test('paletteSwatches never puts an unsafe value into the style attribute', () => {
  const evil = { colorPalette: { swatch1: 'red;}</style><script>alert(1)</script>{background:red', swatch2: '#abc' } };
  const html = paletteSwatches(evil);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /style="background:#abc"/);
});

test('selectionOf reads target and theme id out of the raw selection string', () => {
  assert.equal(selectionOf({ selection: null }), null);
  const sel = selectionOf({ selection: `${api.meta.root}|1` });
  assert.deepEqual(sel, { target: api.meta.root, id: '1' });
});

test('the Themes table lists every theme with a data-select row and a re-read control', () => {
  const html = tab.render(solution, view);
  assert.match(html, /Apex Blue/);
  assert.match(html, /MyCustomTheme/);
  assert.match(html, /Minimalist/);
  assert.ok(html.includes(`data-select="${api.meta.root}|1"`));
  assert.ok(html.includes('data-reread-catalog="theme"'));
  assert.ok(html.includes('<th>File</th>'));
});

test('selecting a theme shows kv, swatches, named styles, layouts using as links, and the CSS in an escaped <pre>', () => {
  const apex = root.catalogs.theme.list.find((t) => t.displayName === 'Apex Blue');
  const html = tab.render(solution, { ...view, selection: `${api.meta.root}|${apex.id}` });
  assert.match(html, /Apex Blue/);
  assert.equal((html.match(/class="swatch"/g) ?? []).length, 5);
  assert.match(html, /MyCustomStyleInApexBlue/);
  // "File Open" is a real layout (id 11) that uses this theme: it must be a link.
  assert.ok(html.includes(link(`layouts/${api.meta.root}|11`, 'File Open')));
  // The theme's own layouts array also carries folder/separator markers that are
  // not layouts by that name: they render as plain, unlinked text.
  assert.ok(html.includes('MyLayoutFolder'));
  assert.ok(!/<a[^>]*>MyLayoutFolder<\/a>/.test(html));
  assert.ok(html.includes('<details>'));
  assert.match(html, /<pre>/);
  assert.ok(html.includes('background-color'));
});

test('a selection in the second file reads that file, not the root', () => {
  const apex = brojDva.catalogs.theme.list.find((t) => t.displayName === 'Apex Blue');
  const html = tab.render(solution, { ...view, selection: `fmnet://localhost/BrojDva|${apex.id}` });
  assert.match(html, /Apex Blue \(BrojDva\)/);
  assert.ok(html.includes('data-target="fmnet://localhost/BrojDva"'));
});

test('the named styles table is filterable', () => {
  const apex = root.catalogs.theme.list.find((t) => t.displayName === 'Apex Blue');
  const html = tab.render(solution, {
    ...view, selection: `${api.meta.root}|${apex.id}`, filter: 'mycustomstyleinapexblue',
  });
  assert.match(html, /MyCustomStyleInApexBlue/);
  assert.ok(!html.includes('Alternating<'));
});

test('every model string is escaped', () => {
  const evil = {
    target: 'x<y', name: '<img>',
    catalogs: {
      theme: {
        list: [{
          id: 1, name: '<b>&"', displayName: '<i>evil</i>', group: '<g>',
          isCustom: false, isDeprecated: false, isDefault: false, layoutsUsing: 0,
          css: '<style>bad</style>', colorPalette: {}, namedStyleNames: {}, layouts: ['<x>'],
        }],
        listError: null, detailById: {}, ops: [], readAt: null,
      },
      layout: { list: [], listError: null, detailById: {}, ops: [], readAt: null },
    },
  };
  const html = tab.render({ files: { 'x<y': evil }, unreachable: [] }, { selection: `x<y|1`, filter: '', multiFile: false });
  assert.ok(!html.includes('<i>evil</i>'));
  assert.ok(!html.includes('<style>bad</style>'));
  assert.match(html, /&lt;i&gt;evil&lt;\/i&gt;/);
  assert.match(html, /&lt;style&gt;bad&lt;\/style&gt;/);
});

test('styleUsage walks every layout once for all themes, and gives consistent answers', () => {
  const theme = themeRows(root).find((r) => r.namedStyleCount > 0);
  const first = styleUsage(root, theme.theme);
  const again = styleUsage(root, theme.theme);
  // styleUsage itself builds a fresh `.map().sort()` array on every call --
  // that array's identity proves nothing about the cache below it, only its
  // values can be compared here. The cache itself is pinned separately, on
  // styleCountsByTheme's own return identity.
  assert.deepEqual(again, first);
  // Two themes of the same file share one walk; the answers still differ.
  const other = themeRows(root).find((r) => r.id !== theme.id && r.namedStyleCount > 0);
  assert.notDeepEqual(styleUsage(root, other.theme), first);
});

test('styleCountsByTheme memoises the walk per file until a layout re-read replaces detailById', () => {
  // The memo styleUsage rests on: same input, same Map back by identity, the
  // way tests/tabs/layouts.test.mjs pins layoutRows.
  const first = styleCountsByTheme(root);
  assert.equal(styleCountsByTheme(root), first);

  // A layout re-read invalidates the walk: model.js replaces `detailById` at
  // either grain (see ui/model.js), which is exactly what the memo keys on.
  const slot = root.catalogs.layout;
  root.catalogs.layout = { ...slot, detailById: { ...slot.detailById } };
  const afterReread = styleCountsByTheme(root);
  assert.notEqual(afterReread, first, 'a layout re-read must invalidate the cached walk');
  assert.equal(styleCountsByTheme(root), afterReread, 'the new walk is itself now cached');
  root.catalogs.layout = slot;
});
