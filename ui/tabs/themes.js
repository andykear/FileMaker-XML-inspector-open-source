// ui/tabs/themes.js
// The Themes tab: fm's theme catalog, its colour palette, and its named styles
// with where each one is actually used. fm 0.7.0 added this catalog; it is read
// with `detail:true`, so a list item already carries the full describe -- there
// is no per-theme detailById to re-read, only the catalog itself.
// A pure renderer: no document, every fm key read through access.js, every
// string escaped.
import { badge, count, esc, kv, link, matches, rereadCatalogButton, section, table } from '../dom.js';
import { get, path } from '../access.js';
import { walkObjects } from './layouts.js';
import { catalogActions, listOf, selectRow, selectionKey, selectionTail, totalsLine, withFile } from './common.js';

const themeListOf = (file) => listOf(file, 'theme');
const layoutListOf = (file) => listOf(file, 'layout');

export function themeRows(file) {
  return themeListOf(file).map((theme) => {
    const id = get(theme, 'id');
    return {
      target: file.target, file: file.name ?? file.target,
      key: selectionKey(file.target, id), id, theme,
      name: String(get(theme, 'name') ?? ''),
      displayName: String(get(theme, 'displayName') ?? ''),
      group: String(get(theme, 'group') ?? ''),
      isCustom: get(theme, 'isCustom') === true,
      isDeprecated: get(theme, 'isDeprecated') === true,
      isDefault: get(theme, 'isDefault') === true,
      layoutsUsing: Number(get(theme, 'layoutsUsing')) || 0,
      namedStyleCount: Object.keys(get(theme, 'namedStyleNames') ?? {}).length,
    };
  });
}

/** How often each named style is worn, per theme: one walk of every object of
 *  every layout on the file, bucketed by the theme the layout wears. Walking
 *  once for all themes rather than once per theme is the whole point, so it is
 *  memoised per file on the identity of `catalogs.layout.detailById` -- what a
 *  re-read replaces at either grain (see ui/model.js). */
const styleUsageCache = new WeakMap();

/** Exported only so a test can assert on ITS return identity: `styleUsage`
 *  builds a fresh `.map().sort()` array on every call regardless of whether
 *  this walk was recomputed, so the array itself proves nothing about the
 *  cache. This Map is what the WeakMap actually remembers. */
export function styleCountsByTheme(file) {
  const details = path(file, 'catalogs.layout.detailById');
  const hit = styleUsageCache.get(file ?? {});
  if (hit && hit.details === details) return hit.byTheme;
  const byTheme = new Map();
  for (const item of layoutListOf(file)) {
    if (get(item, 'type') !== 'layout') continue;
    const detail = get(get(details, String(get(item, 'id'))), 'result');
    if (!detail) continue;
    const themeId = String(path(detail, 'theme.id'));
    if (!byTheme.has(themeId)) byTheme.set(themeId, {});
    const counts = byTheme.get(themeId);
    walkObjects(path(detail, 'contents.objects'), (obj) => {
      const style = get(obj, 'style');
      if (style) counts[style] = (counts[style] ?? 0) + 1;
    });
  }
  if (file !== null && typeof file === 'object') styleUsageCache.set(file, { details, byTheme });
  return byTheme;
}

/** For every named style fm reports on this theme, how many objects -- across
 *  every layout on this file that wears this theme -- carry it. `style` on an
 *  object is the style's display name, not its key. */
export function styleUsage(file, theme) {
  const names = get(theme, 'namedStyleNames') ?? {};
  const counts = styleCountsByTheme(file).get(String(get(theme, 'id'))) ?? {};
  return Object.entries(names)
    .map(([key, display]) => ({ key, display: String(display), used: counts[String(display)] ?? 0 }))
    .sort((a, b) => b.used - a.used || a.display.localeCompare(b.display));
}

/** fm's own number, said to be fm's own number. It counts the entries of the
 *  theme's `layouts`, which is a slice of the flattened layout listing and so
 *  includes the folder and separator rows FileMaker draws -- on ooe's Apex Blue
 *  it says 24 where the file has 15 layouts on that theme. The page does not
 *  correct it, because it is fm's answer and a reader comparing the two numbers
 *  should see both. */
const LAYOUTS_USING_TITLE = "fm's own count of the entries on this theme's layout list, which also carries the folder and separator rows of FileMaker's flattened layout listing. The list below names the layouts themselves.";

const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
const RGBA_RE = /^rgba?\([\d.,\s%]+\)$/i;
const SWATCH_KEYS = ['swatch1', 'swatch2', 'swatch3', 'swatch4', 'swatch5'];

/** Five spans, always -- a theme with an empty palette (fm's built-in
 *  "Minimalist") still gets five slots, just empty ones. The colour value is
 *  fm's own text; it only becomes a `background` when it looks like a colour,
 *  the same whitelist idea as graph.js's `safeColor`. */
export function paletteSwatches(theme) {
  const palette = get(theme, 'colorPalette') ?? {};
  return SWATCH_KEYS.map((k) => {
    const value = get(palette, k);
    const text = value === undefined || value === null ? '' : String(value);
    const title = esc(`${k}: ${text}`);
    return COLOR_RE.test(text) || RGBA_RE.test(text)
      ? `<span class="swatch" style="background:${esc(text)}" title="${title}"></span>`
      : `<span class="swatch" title="${title}">${esc(text)}</span>`;
  }).join('');
}

export function themesTotals(solution) {
  const rows = Object.values(solution.files).flatMap((f) => themeRows(f));
  return {
    themes: rows.length,
    custom: rows.filter((r) => r.isCustom).length,
    namedStyles: rows.reduce((n, r) => n + r.namedStyleCount, 0),
  };
}

export function selectionOf(view) {
  const parsed = selectionTail(view?.selection);
  return parsed && { target: parsed.target, id: parsed.tail };
}

function flags(row) {
  return [row.isCustom ? badge('custom', 'info') : '',
    row.isDeprecated ? badge('deprecated', 'warn') : '',
    row.isDefault ? badge('default', 'good') : ''].filter(Boolean).join(' ');
}

const THEME_COLUMNS = [
  { key: 'displayName', label: 'Theme', render: (r) => link(`themes/${r.key}`, r.displayName) },
  { key: 'name', label: 'Internal name' },
  { key: 'group', label: 'Group' },
  { key: 'flags', label: 'Flags', render: flags },
  { key: 'layoutsUsing', label: 'Layouts using', num: true, title: LAYOUTS_USING_TITLE, render: (r) => count(r.layoutsUsing) },
  { key: 'namedStyleCount', label: 'Named styles', num: true, render: (r) => count(r.namedStyleCount) },
];

function themesTotalsLine(solution) {
  const t = themesTotals(solution);
  return totalsLine([['Themes', t.themes], ['Custom themes', t.custom], ['Named styles', t.namedStyles]]);
}

function renderThemes(solution, view) {
  const rows = Object.values(solution.files).flatMap((f) => themeRows(f));
  const shown = rows.filter((r) => matches(r.displayName, view.filter) || matches(r.name, view.filter) || matches(r.group, view.filter));
  const body = themesTotalsLine(solution)
    + table(withFile(THEME_COLUMNS, view), shown, { empty: 'No themes', rowAttrs: selectRow(view.selection) });
  return section('Themes', body, { actions: catalogActions(solution, 'theme', view, 'themes') });
}

const STYLE_COLUMNS = [
  { key: 'display', label: 'Style' },
  { key: 'key', label: 'Key' },
  { key: 'used', label: 'Used', num: true, render: (r) => count(r.used) },
];

/** fm's `layouts` on a theme is a slice of its FLATTENED layout listing, so it
 *  carries the folder names and the separator markers (`-`, `--`) FileMaker
 *  draws between layouts alongside the layouts themselves. Only an entry that
 *  names a `type: layout` item of this file's layout list is a layout; the rest
 *  are counted and said to be what they are, never rendered as if a reader could
 *  open them. Measured on ooe's Apex Blue: 24 entries, 15 layouts.
 *
 *  Returns `{ layouts, extra }` -- the matching list items, and how many entries
 *  were not layouts. */
export function layoutsUsing(file, theme) {
  const byName = new Map();
  for (const item of layoutListOf(file)) {
    if (get(item, 'type') !== 'layout') continue;
    const name = String(get(item, 'name'));
    if (!byName.has(name)) byName.set(name, item);
  }
  const layouts = [];
  let extra = 0;
  for (const entry of get(theme, 'layouts') ?? []) {
    const item = byName.get(String(entry));
    if (item) layouts.push(item); else extra += 1;
  }
  return { layouts, extra };
}

const layoutLink = (file, item) => link(`layouts/${selectionKey(file.target, get(item, 'id'))}`, get(item, 'name'));

function themePairs(row) {
  return [
    ['Internal name', esc(row.name)],
    ['Group', esc(row.group)],
    ['Custom', row.isCustom ? 'yes' : 'no'],
    ['Deprecated', row.isDeprecated ? badge('deprecated', 'warn') : 'no'],
    ['Default', row.isDefault ? badge('default', 'good') : 'no'],
    ['Layouts using', `<span title="${esc(LAYOUTS_USING_TITLE)}">${count(row.layoutsUsing)}</span>`],
    ['Named styles', count(row.namedStyleCount)],
  ];
}

function renderSelected(solution, view) {
  const sel = selectionOf(view);
  const file = sel && solution.files[sel.target];
  if (!file) return '';
  const row = themeRows(file).find((r) => String(r.id) === sel.id);
  if (!row) return '';
  const theme = row.theme;
  const title = `Theme ${row.displayName}${view.multiFile ? ` (${file.name ?? file.target})` : ''}`;
  const actions = rereadCatalogButton(file.target, 'theme', 'Re-read themes');
  const usage = styleUsage(file, theme).filter((s) => matches(s.display, view.filter) || matches(s.key, view.filter));
  const using = layoutsUsing(file, theme);
  const layouts = using.layouts.map((item) => layoutLink(file, item)).join(', ') || '(none)';
  const extra = using.extra
    ? `<p class="muted">${count(using.extra)} more entries are folder and separator names fm's flattened layout list carries.</p>`
    : '';
  const css = String(get(theme, 'css') ?? '');
  const body = kv(themePairs(row))
    + `<div class="swatches">${paletteSwatches(theme)}</div>`
    + '<h3>Named styles</h3>'
    + '<p class="muted">Used counts the objects that wear a named style explicitly. The default style of each object kind is not a named style, so an object without one is not unstyled.</p>'
    + table(STYLE_COLUMNS, usage, { empty: 'No named styles' })
    + '<h3>Layouts using</h3>' + `<p>${layouts}</p>${extra}`
    + `<details><summary>CSS (${count(css.length)} chars)</summary><pre>${esc(css)}</pre></details>`;
  return section(title, body, { actions });
}

export const tab = {
  id: 'themes',
  label: 'Themes',
  render(solution, view = {}) {
    return renderSelected(solution, view) + renderThemes(solution, view);
  },
};
