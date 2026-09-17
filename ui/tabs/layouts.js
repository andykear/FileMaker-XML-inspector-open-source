// ui/tabs/layouts.js
// The Layouts tab: every layout of every reached file as FileMaker folds it, and -- for
// the selected one -- fm's parts and objects drawn as a wireframe at fm's own layout
// coordinates. A pure renderer: no document, every fm key read through access.js, every
// string escaped.
//
// Coordinates: a top-level object's `bounds` are layout coordinates, but a *nested*
// object's are relative to its container. Measured on the ooe fixture: of 52 nested
// objects, 36 report bounds that fall outside their parent's box, and every container
// whose own origin is not 0,0 (popover, portal, tabControl, slideControl, buttonBar,
// group) has children starting near 0,0. So the walk carries an origin and adds it.
import { badge, count, esc, kv, link, matches, rereadObjectButton, section, table } from '../dom.js';
import { get, path } from '../access.js';
import { catalogActions, detailOf, listOf, selectionKey, selectionTail, totalsLine } from './common.js';

const layoutsOf = (file) => listOf(file, 'layout');
const entryOf = (file, id) => detailOf(file, 'layout', id);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const boundsOf = (obj) => {
  const b = get(obj, 'bounds');
  return { left: num(get(b, 'left')), top: num(get(b, 'top')), width: num(get(b, 'width')), height: num(get(b, 'height')) };
};

/** fm nests children under `objects` today; `panels` and `segments` are in the contract
 *  for tab/slide controls and button bars, so the walk descends all three. `fn` is called
 *  with the object, its depth, and the absolute origin its own bounds are relative to. */
const CHILD_KEYS = ['objects', 'panels', 'segments'];

export function walkObjects(objects, fn, depth = 0, origin = { left: 0, top: 0 }) {
  for (const obj of objects ?? []) {
    if (obj === null || typeof obj !== 'object') continue;
    fn(obj, depth, origin);
    const b = boundsOf(obj);
    const inner = { left: origin.left + b.left, top: origin.top + b.top };
    for (const key of CHILD_KEYS) {
      const kids = get(obj, key);
      if (Array.isArray(kids)) walkObjects(kids, fn, depth + 1, inner);
    }
  }
}

/** The named counts are the ones the totals line and the layout table read; `byType`
 *  and `byControl` are the whole truth, so a type ooe does not carry still shows. */
export function objectCounts(detail) {
  const byType = {};
  const byControl = {};
  let total = 0;
  walkObjects(path(detail, 'contents.objects'), (obj) => {
    total += 1;
    const type = String(get(obj, 'type') ?? 'unknown');
    byType[type] = (byType[type] ?? 0) + 1;
    const control = get(obj, 'control');
    if (control) byControl[String(control)] = (byControl[String(control)] ?? 0) + 1;
  });
  const of = (type) => byType[type] ?? 0;
  return {
    total, byType, byControl,
    portals: of('portal'), webViewers: of('webViewer'), tabControls: of('tabControl'),
    slideControls: of('slideControl'), popovers: of('popover'), buttonBars: of('buttonBar'),
    charts: of('chart'),
  };
}

/** Every row walks every object of its layout, and the tab asks for the rows
 *  several times per render (the tree, the totals, the Themes tab). The answer
 *  is memoised per file on the identity of `catalogs.layout.detailById`, which
 *  is what a re-read replaces at either grain: a catalog re-read stages a whole
 *  new slot, and an object re-read replaces `detailById` (see ui/model.js). */
const layoutRowsCache = new WeakMap();

export function layoutRows(file) {
  const details = path(file, 'catalogs.layout.detailById');
  const hit = layoutRowsCache.get(file);
  if (hit && hit.details === details) return hit.rows;
  const rows = computeLayoutRows(file);
  if (file !== null && typeof file === 'object') layoutRowsCache.set(file, { details, rows });
  return rows;
}

/** fm's flattened list carries three types: `layout`, `folder` and `separator` (the
 *  divider FileMaker draws). Only a layout gets a row. */
function computeLayoutRows(file) {
  return layoutsOf(file).filter((item) => get(item, 'type') === 'layout').map((item) => {
    const id = get(item, 'id');
    const entry = entryOf(file, id);
    const detail = get(entry, 'result');
    const counts = objectCounts(detail);
    return {
      id, counts, target: file.target, key: selectionKey(file.target, id), file: file.name ?? file.target,
      name: String(get(detail, 'name') ?? get(item, 'name') ?? ''),
      folder: String(get(item, 'folder') ?? ''),
      hidden: get(item, 'hidden') === true,
      occurrence: String(path(item, 'tableOccurrence.name') ?? path(detail, 'tableOccurrence.name') ?? ''),
      theme: String(path(detail, 'theme.displayName') ?? ''),
      triggers: num(path(detail, 'scriptTriggerCount')),
      objects: counts.total, portals: counts.portals, webViewers: counts.webViewers,
      parts: (path(detail, 'parts') ?? []).length,
      error: get(entry, 'error') ?? null,
    };
  });
}

/** How tall the drawing has to be: the bottom of the last part, fm's own bodyHeight,
 *  and the bottom of the lowest object -- whichever of those is defined and largest. */
function totalHeight(detail) {
  const heights = (path(detail, 'parts') ?? []).map((p) => num(get(p, 'offset')) + num(get(p, 'height')));
  const bodyHeight = Number(path(detail, 'geometry.bodyHeight'));
  if (Number.isFinite(bodyHeight)) heights.push(bodyHeight);
  walkObjects(path(detail, 'contents.objects'), (obj, depth, origin) => {
    const b = boundsOf(obj);
    heights.push(origin.top + b.top + b.height);
  });
  return Math.max(0, ...heights);
}

/** The thing an object shows: a field name, a label's text, an object's own name, a
 *  popover's title, a portal's occurrence -- whichever fm gives it. */
const whatOf = (obj) => path(obj, 'field.name') ?? get(obj, 'text') ?? get(obj, 'name')
  ?? get(obj, 'title') ?? path(obj, 'tableOccurrence.name') ?? '';

/** The tooltip: type, control style when it has one, and what it shows. */
function objectTitle(obj) {
  return [get(obj, 'type'), get(obj, 'control'), whatOf(obj)]
    .filter((p) => p !== undefined && p !== null && p !== '').map((p) => esc(p)).join(' &middot; ');
}

function partSvg(part, width) {
  const [offset, height] = [num(get(part, 'offset')), num(get(part, 'height'))];
  const type = String(get(part, 'type') ?? 'part');
  return `<rect class="part ${esc(type)}" x="0" y="${offset}" width="${width}" height="${height}"/>`
    + `<text class="part-label" x="4" y="${offset + 12}">${esc(get(part, 'name') ?? type)}</text>`;
}

/** `key` is the layout's own `<target>|<id>`, the same string the Objects table
 *  rows carry, so a rect's `data-select` names exactly the row a click on the
 *  picture should select -- the shell's `[data-select]` delegation needs no
 *  SVG-specific handling. Omitted (no `key`) when the caller has none to give,
 *  the way the bare renderer is exercised in tests. */
function objectSvg(obj, origin, highlight, key) {
  const b = boundsOf(obj);
  const id = get(obj, 'id');
  const on = highlight !== null && highlight !== undefined && String(highlight) === String(id);
  const select = key ? ` data-select="${esc(key)}#${esc(id)}"` : '';
  return `<rect class="obj ${esc(get(obj, 'type') ?? 'unknown')}${on ? ' highlight' : ''}" data-object="${esc(id)}"${select}`
    + ` x="${origin.left + b.left}" y="${origin.top + b.top}" width="${b.width}" height="${b.height}">`
    + `<title>${objectTitle(obj)}</title></rect>`;
}

/** The layout as fm reports it: the part bands first, then every object over them, in
 *  fm's own order so a container is painted before what it holds. `opts.key`, when
 *  given, is the layout's own selection key, so every object rect becomes clickable. */
export function wireframeSvg(detail, opts = {}) {
  const width = num(path(detail, 'geometry.baseWidth'));
  const height = totalHeight(detail);
  const bands = (path(detail, 'parts') ?? []).map((p) => partSvg(p, width)).join('');
  let objects = '';
  walkObjects(path(detail, 'contents.objects'), (obj, depth, origin) => {
    objects += objectSvg(obj, origin, opts.highlight, opts.key);
  });
  return `<svg class="wireframe" viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="xMinYMin meet">`
    + bands + objects + '</svg>';
}

/** `<target>|<layout id>`, optionally `#<object id>` to highlight one object.
 *  The object rides inside the tab's own part, because it is a coordinate within
 *  the layout rather than a second thing to select. */
export function selectionOf(view) {
  const parsed = selectionTail(view?.selection);
  if (!parsed) return null;
  const hash = parsed.tail.indexOf('#');
  return {
    target: parsed.target,
    id: hash < 0 ? parsed.tail : parsed.tail.slice(0, hash),
    object: hash < 0 ? null : parsed.tail.slice(hash + 1),
  };
}

function totals(solution) {
  const rows = Object.values(solution.files).flatMap(layoutRows);
  const sum = (key) => rows.reduce((n, r) => n + r.counts[key], 0);
  const pairs = [
    ['Layouts', rows.length],
    ['Objects', sum('total')],
    ['Portals', sum('portals')],
    ['Web viewers', sum('webViewers')],
    ['Tab controls', sum('tabControls')],
    ['Slide controls', sum('slideControls')],
    ['Popovers', sum('popovers')],
    ['Button bars', sum('buttonBars')],
  ];
  return totalsLine(pairs);
}

/** A folder's own key is its full path, the same spelling a layout's `folder` carries,
 *  so a folder holding no layouts still shows. */
function folders(file) {
  const groups = new Map();
  const at = (folder) => {
    if (!groups.has(folder)) groups.set(folder, { folder, rows: [] });
    return groups.get(folder);
  };
  for (const item of layoutsOf(file)) {
    if (get(item, 'type') !== 'folder') continue;
    at([get(item, 'folder'), get(item, 'name')].filter(Boolean).join('/'));
  }
  for (const row of layoutRows(file)) at(row.folder).rows.push(row);
  return [...groups.values()];
}

function treeRow(row, selection, filter) {
  if (!matches(row.name, filter) && !matches(row.occurrence, filter)) return '';
  const cls = row.key === selection ? ' class="selected"' : '';
  const badges = [
    row.hidden ? badge('hidden', 'muted') : '',
    row.error ? badge('unread', 'warn') : '',
    row.portals ? badge(`${row.portals} portal`, 'info') : '',
  ].filter(Boolean).join(' ');
  return `<li data-select="${esc(row.key)}"${cls}>${link(`layouts/${row.key}`, row.name)}`
    + ` <span class="muted">${esc(row.occurrence)} &middot; ${esc(row.theme)}</span>`
    + ` ${count(row.objects)} obj &middot; ${count(row.triggers)} trig ${badges}</li>`;
}

function renderList(solution, view) {
  // The row is marked by the LAYOUT the selection names: a `#<object id>` tail
  // is a coordinate inside the open layout, not a different row, so the tree
  // must not lose its highlight the moment a link lands on an object (the same
  // bug fixed for the Scripts tree in commit a1adfc2).
  const sel = selectionOf(view);
  const open = sel ? selectionKey(sel.target, sel.id) : null;
  const body = Object.values(solution.files).map((file) => {
    const groups = folders(file).map((group) => {
      // A folder whose name matches shows all of its layouts; otherwise only the
      // matching ones, and a folder left with none drops out.
      const wanted = matches(group.folder, view.filter) ? '' : view.filter;
      const rows = group.rows.map((r) => treeRow(r, open, wanted)).filter(Boolean);
      if (!rows.length && view.filter) return '';
      return `<details open><summary>${esc(group.folder || '(root)')} ${count(rows.length)}</summary>`
        + (rows.length ? `<ul class="tree">${rows.join('')}</ul>` : '<p class="empty">No layouts</p>')
        + '</details>';
    }).filter(Boolean).join('');
    const title = view.multiFile ? `<h3>${esc(file.name ?? file.target)}</h3>` : '';
    return title + (groups || '<p class="empty">No layouts</p>');
  }).join('');
  return section('Layouts', totals(solution) + body, { actions: catalogActions(solution, 'layout', view, 'layouts') });
}

const PART_COLUMNS = [
  { key: 'type', label: 'Part' },
  { key: 'name', label: 'Name' },
  { key: 'height', label: 'Height', num: true, render: (r) => count(r.height) },
  { key: 'offset', label: 'Offset', num: true, render: (r) => count(r.offset) },
  { key: 'breakField', label: 'Break field' },
];

function partRows(detail) {
  return (path(detail, 'parts') ?? []).map((p) => ({
    type: String(get(p, 'type') ?? ''), name: String(get(p, 'name') ?? ''),
    height: num(get(p, 'height')), offset: num(get(p, 'offset')),
    breakField: String(path(p, 'breakField.name') ?? ''),
  }));
}

/** The nesting indent rides on `--depth`, the way the script step list carries
 *  its own block depth (ui/tabs/scripts.js), rather than padding characters
 *  baked into the cell's text -- a stylesheet renders it, a test measures the
 *  field directly instead of counting characters. */
const OBJECT_COLUMNS = [
  { key: 'type', label: 'Type', render: (r) => `<span class="obj-type" style="--depth:${r.depth}">${esc(r.type)}</span>` },
  { key: 'control', label: 'Control' },
  { key: 'what', label: 'Name / text' },
  { key: 'bounds', label: 'Bounds' },
  { key: 'style', label: 'Style' },
  { key: 'flags', label: 'Flags', render: (r) => r.flags },
];

function objectRows(detail, key) {
  const rows = [];
  walkObjects(path(detail, 'contents.objects'), (obj, depth, origin) => {
    const b = boundsOf(obj);
    const id = get(obj, 'id');
    rows.push({
      id,
      key: `${key}#${id}`,
      depth,
      type: String(get(obj, 'type') ?? ''),
      control: String(get(obj, 'control') ?? ''),
      what: String(whatOf(obj)),
      bounds: `${origin.left + b.left}, ${origin.top + b.top} · ${b.width}×${b.height}`,
      style: String(get(obj, 'style') ?? ''),
      flags: [get(obj, 'locked') === true ? badge('locked', 'warn') : '',
        get(obj, 'hideWhenPrinting') === true ? badge('no print', 'muted') : '',
        get(obj, 'hideCondition') ? badge('hide when', 'info') : ''].filter(Boolean).join(' '),
    });
  });
  return rows;
}

function legend(counts) {
  const chips = Object.entries(counts.byType).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, n]) => `<li><span class="obj ${esc(type)}"></span>${esc(type)} ${count(n)}</li>`).join('');
  return chips ? `<ul class="legend">${chips}</ul>` : '';
}

function detailPairs(detail, counts) {
  const enabled = Object.entries(path(detail, 'viewStyles.enabled') ?? {}).filter(([, on]) => on === true).map(([v]) => v);
  const g = path(detail, 'geometry') ?? {};
  return [
    ['Id', esc(get(detail, 'id'))],
    ['Folder', esc(get(detail, 'folder')) || '(root)'],
    ['Occurrence', esc(path(detail, 'tableOccurrence.name'))
      + ` <span class="muted">of ${esc(path(detail, 'tableOccurrence.table.name'))}</span>`],
    ['Theme', `${esc(path(detail, 'theme.displayName'))} <span class="muted">(${esc(path(detail, 'theme.group'))})</span>`],
    ['View styles', `${esc(path(detail, 'viewStyles.default'))} <span class="muted">enabled: ${esc(enabled.join(', ')) || 'none'}</span>`],
    ['Flags', path(detail, 'flags.areDefaults') === true ? 'defaults' : esc((path(detail, 'flags.set') ?? []).join(', ')) || 'none'],
    ['Geometry', `${num(get(g, 'baseWidth'))} ${esc(get(g, 'units'))} wide, body ${num(get(g, 'bodyHeight'))}`
      + ` <span class="muted">${esc(get(g, 'layoutType'))}, ${esc(get(g, 'orientation'))}, ${esc(get(g, 'clientType'))}</span>`],
    ['Triggers', count(get(detail, 'scriptTriggerCount'))
      + ` <span class="muted">${esc((get(detail, 'scriptTriggers') ?? []).map((t) => get(t, 'event')).join(', '))}</span>`],
    ['Contents', `${count(counts.total)} objects <span class="muted">fm counts ${esc(path(detail, 'contents.fieldCount'))} fields,`
      + ` ${esc(path(detail, 'contents.portalCount'))} portals, ${esc(path(detail, 'contents.webViewerCount'))} web viewers,`
      + ` ${esc(path(detail, 'contents.unmodelledCount'))} it could not model</span>`],
    ['Modified', `${esc(path(detail, 'modified.timestamp'))} <span class="muted">by ${esc(path(detail, 'modified.account'))}</span>`],
  ];
}

function renderSelected(solution, view) {
  const sel = selectionOf(view);
  const file = sel && solution.files[sel.target];
  if (!file) return '';
  const entry = entryOf(file, sel.id);
  if (!entry) return '';
  const detail = get(entry, 'result');
  const item = layoutsOf(file).find((i) => String(get(i, 'id')) === sel.id);
  const name = get(detail, 'name') ?? get(item, 'name') ?? sel.id;
  const title = `Layout ${name}${view.multiFile ? ` (${file.name ?? file.target})` : ''}`;
  const actions = rereadObjectButton({ kind: 'object', target: file.target, catalog: 'layout', key: String(sel.id) }, 'Re-read layout');
  const error = get(entry, 'error');
  if (error || !detail) {
    return section(title, `<p class="error">${esc(get(error, 'code') ?? 'unread')}: `
      + `${esc(get(error, 'message') ?? 'no describe for this layout')}</p>`, { actions });
  }
  const counts = objectCounts(detail);
  const key = selectionKey(file.target, sel.id);
  const rows = objectRows(detail, key).filter((r) => matches(r.type, view.filter) || matches(r.what, view.filter)
    || matches(r.control, view.filter) || matches(r.style, view.filter));
  const body = kv(detailPairs(detail, counts))
    + '<h3>Parts</h3>' + table(PART_COLUMNS, partRows(detail), { empty: 'No parts' })
    + '<h3>Wireframe</h3>'
    + `<div class="wireframe-wrap">${wireframeSvg(detail, { highlight: sel.object, key })}</div>`
    + legend(counts)
    + '<h3>Objects</h3>' + table(OBJECT_COLUMNS, rows, {
      empty: 'No objects',
      rowAttrs: (r) => `data-select="${esc(r.key)}"${sel.object !== null && String(r.id) === sel.object ? ' class="selected"' : ''}`,
    });
  return section(title, body, { actions });
}

export const tab = {
  id: 'layouts',
  label: 'Layouts',
  render(solution, view = {}) {
    return renderList(solution, view) + renderSelected(solution, view);
  },
};
