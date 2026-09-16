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

/** For every named style fm reports on this theme, how many objects -- walked
 *  recursively across every layout on this file that wears this theme -- carry
 *  it. `style` on an object is the style's display name, not its key. */
export function styleUsage(file, theme) {
  const themeId = String(get(theme, 'id'));
  const names = get(theme, 'namedStyleNames') ?? {};
  const counts = {};
  for (const item of layoutListOf(file)) {
    if (get(item, 'type') !== 'layout') continue;
    const entry = get(path(file, 'catalogs.layout.detailById'), String(get(item, 'id')));
    const detail = get(entry, 'result');
    if (!detail || String(path(detail, 'theme.id')) !== themeId) continue;
    walkObjects(path(detail, 'contents.objects'), (obj) => {
      const style = get(obj, 'style');
      if (style) counts[style] = (counts[style] ?? 0) + 1;
    });
  }
  return Object.entries(names)
    .map(([key, display]) => ({ key, display: String(display), used: counts[String(display)] ?? 0 }))
    .sort((a, b) => b.used - a.used || a.display.localeCompare(b.display));
}

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
  { key: 'layoutsUsing', label: 'Layouts using', num: true, render: (r) => count(r.layoutsUsing) },
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

/** A layout name from the theme's own `layouts` list, turned into a link when
 *  it names an actual layout on this file -- the list also carries the folder
 *  and separator markers fm's flattened layout catalog uses, which never match
 *  a layout by that name and so render plain. */
function layoutLink(file, name) {
  const item = layoutListOf(file).find((i) => get(i, 'type') === 'layout' && String(get(i, 'name')) === String(name));
  return item ? link(`layouts/${selectionKey(file.target, get(item, 'id'))}`, name) : esc(name);
}

function themePairs(row) {
  return [
    ['Internal name', esc(row.name)],
    ['Group', esc(row.group)],
    ['Custom', row.isCustom ? 'yes' : 'no'],
    ['Deprecated', row.isDeprecated ? badge('deprecated', 'warn') : 'no'],
    ['Default', row.isDefault ? badge('default', 'good') : 'no'],
    ['Layouts using', count(row.layoutsUsing)],
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
  const layoutNames = get(theme, 'layouts') ?? [];
  const layouts = layoutNames.map((n) => layoutLink(file, n)).join(', ') || '(none)';
  const css = String(get(theme, 'css') ?? '');
  const body = kv(themePairs(row))
    + `<div class="swatches">${paletteSwatches(theme)}</div>`
    + '<h3>Named styles</h3>' + table(STYLE_COLUMNS, usage, { empty: 'No named styles' })
    + '<h3>Layouts using</h3>' + `<p>${layouts}</p>`
    + `<details><summary>CSS (${count(css.length)} chars)</summary><pre>${esc(css)}</pre></details>`;
  return section(title, body, { actions });
}

export const tab = {
  id: 'themes',
  label: 'Themes',
  render(solution, view = {}) {
    return renderThemes(solution, view) + renderSelected(solution, view);
  },
};
