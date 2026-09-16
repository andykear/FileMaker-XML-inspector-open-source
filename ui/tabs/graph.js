// ui/tabs/graph.js
// The Relationships tab: every table occurrence, every relation, and the relationship
// graph itself drawn from the geometry fm reports -- no layout algorithm, fm already
// knows where the boxes sit. A pure renderer: no document, every fm key read through
// access.js, every string and every colour escaped before it reaches an attribute.
import { badge, count, esc, kv, link, matches, rereadCatalogButton, rereadObjectButton, section, table } from '../dom.js';
import { get, path } from '../access.js';

const SOURCE_FLAGS = ['local', 'external', 'foreign', 'odbc'];
const SOURCE_TONE = { local: 'muted', external: 'info', foreign: 'warn', odbc: 'warn' };
const FALLBACK_COLOR = '#98a2b3';
const MARGIN = 20;

/** fm's colours are `#rgb`-style strings; anything else is not a colour and must
 *  never reach a fill attribute, whatever fm (or a fixture) says. */
function safeColor(value) {
  return /^#[0-9a-f]{3,8}$/i.test(String(value ?? '')) ? String(value) : FALLBACK_COLOR;
}

function detailOf(file, catalog, id) {
  return get(path(file, `catalogs.${catalog}.detailById`), String(id));
}

function listOf(file, catalog) {
  return path(file, `catalogs.${catalog}.list`) ?? [];
}

const nameOf = (side) => get(side, 'name') ?? '';

/** fm 0.7.0 reports `{left:0,top:0,width:0,height:0}` for some occurrences that do
 *  sit on the graph in FileMaker. A zero-sized box is not geometry: such an
 *  occurrence is listed but not drawn, rather than stacked as a dot on the origin. */
function isPlaced(bounds) {
  return !!bounds && Number(get(bounds, 'width')) > 0 && Number(get(bounds, 'height')) > 0;
}

/** One row per listed occurrence. The describe carries everything; the list item
 *  stands in for it when the describe errored, so a broken read still lists. */
export function occurrenceRows(file) {
  return listOf(file, 'tableOccurrence').map((item) => {
    const entry = detailOf(file, 'tableOccurrence', get(item, 'id'));
    const result = get(entry, 'result');
    const d = result ?? item;
    const base = get(d, 'table');
    const source = get(base, 'dataSource');
    const graph = get(d, 'graph');
    const id = get(d, 'id');
    return {
      target: file.target,
      file: file.name ?? file.target,
      key: `${file.target}|to:${id}`,
      id,
      name: nameOf(d),
      table: [source, nameOf(base)].filter(Boolean).join('::'),
      source: SOURCE_FLAGS.filter((f) => path(d, `source.${f}`) === true),
      related: (get(d, 'related') ?? []).length,
      cascade: get(d, 'hasCascade') === true,
      tags: (get(d, 'tags') ?? []).join(', '),
      color: safeColor(get(graph, 'color')),
      bounds: get(graph, 'bounds') ?? null,
      placed: isPlaced(get(graph, 'bounds')),
      detail: result ?? null,
      error: get(entry, 'error') ?? null,
    };
  });
}

function predicateText(d) {
  const left = nameOf(get(d, 'left'));
  const right = nameOf(get(d, 'right'));
  return (get(d, 'predicates') ?? [])
    .map((p) => `${left}::${get(p, 'leftField')} ${get(p, 'op')} ${right}::${get(p, 'rightField')}`)
    .join('; ');
}

/** `field order` pairs, in the order fm sorts them. */
function sortText(side) {
  return (path(side, 'sortSpec.fields') ?? []).map((f) => `${get(f, 'field')} ${get(f, 'order')}`).join(', ');
}

export function relationRows(file) {
  return listOf(file, 'relation').map((item) => {
    const entry = detailOf(file, 'relation', get(item, 'id'));
    const result = get(entry, 'result');
    const d = result ?? item;
    const l2r = get(d, 'leftToRight');
    const r2l = get(d, 'rightToLeft');
    const id = get(d, 'id');
    return {
      target: file.target,
      file: file.name ?? file.target,
      key: `${file.target}|rel:${id}`,
      id,
      left: nameOf(get(d, 'left')),
      right: nameOf(get(d, 'right')),
      leftId: path(d, 'left.id'),
      rightId: path(d, 'right.id'),
      predicates: predicateText(d),
      createL: get(l2r, 'createRelated') === true,
      createR: get(r2l, 'createRelated') === true,
      cascadeDeleteL: get(l2r, 'cascadeDelete') === true,
      cascadeDeleteR: get(r2l, 'cascadeDelete') === true,
      sortL: get(l2r, 'sortRelated') === true,
      sortR: get(r2l, 'sortRelated') === true,
      sortSpec: [sortText(l2r), sortText(r2l)].filter(Boolean).join('; '),
      detail: result ?? null,
      error: get(entry, 'error') ?? null,
    };
  });
}

const box = (b) => ({
  left: Number(get(b, 'left')) || 0,
  top: Number(get(b, 'top')) || 0,
  width: Number(get(b, 'width')) || 0,
  height: Number(get(b, 'height')) || 0,
});

const centre = (b) => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 });

function viewBoxOf(boxes) {
  if (!boxes.length) return `0 0 ${MARGIN * 2} ${MARGIN * 2}`;
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return `${left - MARGIN} ${top - MARGIN} ${right - left + MARGIN * 2} ${bottom - top + MARGIN * 2}`;
}

/** SVG text does not wrap or clip, so a label wider than its box would smear across
 *  the graph. Trim it to what fits at ~6 user units a character; the occurrence table
 *  and the note list under the graph carry the full text. */
function fit(text, width) {
  const room = Math.floor((width - 12) / 6);
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > room ? `${s.slice(0, Math.max(room - 1, 0))}\u2026` : s;
}

function noteSvg(note) {
  const b = box(get(note, 'bounds'));
  const color = safeColor(get(note, 'backgroundColor'));
  return `<rect class="note" x="${b.left}" y="${b.top}" width="${b.width}" height="${b.height}" fill="${color}" fill-opacity="0.18" stroke="${color}" rx="3"/>`
    + `<text class="note-text" x="${b.left + 6}" y="${b.top + 16}">${esc(fit(get(note, 'text'), b.width))}</text>`;
}

function occurrenceSvg(row, highlight) {
  const b = box(row.bounds);
  const on = highlight !== undefined && highlight !== null && String(highlight) === String(row.id);
  return `<rect data-to="${esc(row.id)}" class="to${on ? ' highlight' : ''}" x="${b.left}" y="${b.top}" width="${b.width}" height="${b.height}"`
    + ` fill="${row.color}" fill-opacity="0.12" stroke="${row.color}" rx="4"/>`
    + `<text class="to-name" x="${b.left + 6}" y="${b.top + 15}">${esc(fit(row.name, b.width))}</text>`;
}

/** The graph as fm drew it: notes behind, then the relation lines, then the boxes.
 *  A relation whose occurrence has no bounds (an errored describe) is skipped --
 *  there is nowhere honest to draw it. */
export function graphSvg(file, opts = {}) {
  const placed = occurrenceRows(file).filter((r) => r.placed);
  const byId = new Map(placed.map((r) => [String(r.id), box(r.bounds)]));
  const notes = listOf(file, 'graphNote').filter((n) => isPlaced(get(n, 'bounds')));
  const lines = relationRows(file).map((r) => {
    const [a, b] = [byId.get(String(r.leftId)), byId.get(String(r.rightId))];
    if (!a || !b) return '';
    const [p, q] = [centre(a), centre(b)];
    return `<line data-rel="${esc(r.id)}" class="rel" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`;
  }).join('');
  const viewBox = viewBoxOf([...placed.map((r) => box(r.bounds)), ...notes.map((n) => box(get(n, 'bounds')))]);
  return `<svg viewBox="${viewBox}" class="graph" role="img" preserveAspectRatio="xMinYMin meet">`
    + notes.map(noteSvg).join('') + lines + placed.map((r) => occurrenceSvg(r, opts.highlight)).join('')
    + '</svg>';
}

export function selectionOf(view) {
  const sel = view?.selection;
  const at = typeof sel === 'string' ? sel.indexOf('|') : -1;
  if (at < 0) return null;
  const m = /^(to|rel):(.+)$/.exec(sel.slice(at + 1));
  return m ? { target: sel.slice(0, at), kind: m[1], id: m[2] } : null;
}

function catalogActions(solution, catalog, multiFile, what) {
  return Object.values(solution.files)
    .map((f) => rereadCatalogButton(f.target, catalog, multiFile ? `Re-read ${f.name ?? f.target}` : `Re-read ${what}`))
    .join(' ');
}

const rowsOf = (solution, of) => Object.values(solution.files).flatMap((f) => of(f));

const lr = (l, r, tone) => [l && badge('L', tone), r && badge('R', tone)].filter(Boolean).join(' ') || '';

const sourceBadges = (row) => row.source.map((s) => badge(s, SOURCE_TONE[s])).join(' ');

/** The File column only earns its width when more than one file was reached. */
const withFile = (multiFile, columns) => (multiFile ? [{ key: 'file', label: 'File' }, ...columns] : columns);

const OCCURRENCE_COLUMNS = [
  { key: 'name', label: 'Occurrence', render: (r) => link(`graph/${r.key}`, r.name) },
  { key: 'table', label: 'Table' },
  { key: 'source', label: 'Source', render: sourceBadges },
  { key: 'related', label: 'Related', num: true, render: (r) => count(r.related) },
  { key: 'cascade', label: 'Cascade', render: (r) => (r.cascade ? badge('cascade', 'warn') : '') },
  { key: 'tags', label: 'Tags' },
  { key: 'error', label: '', render: (r) => (r.error ? `<span class="error">${esc(get(r.error, 'code'))}</span>` : '') },
];

const RELATION_COLUMNS = [
  { key: 'left', label: 'Left', render: (r) => link(`graph/${r.key}`, r.left) },
  { key: 'right', label: 'Right' },
  { key: 'predicates', label: 'Predicates', render: (r) => `<code>${esc(r.predicates)}</code>` },
  { key: 'create', label: 'Create', render: (r) => lr(r.createL, r.createR, 'info') },
  { key: 'cascadeDelete', label: 'Cascade delete', render: (r) => lr(r.cascadeDeleteL, r.cascadeDeleteR, 'bad') },
  { key: 'sort', label: 'Sort', render: (r) => lr(r.sortL, r.sortR, 'good') },
  { key: 'sortSpec', label: 'Sort spec' },
];

function totals(occurrences, relations) {
  const pairs = [
    ['Occurrences', occurrences.length],
    ['Relationships', relations.length],
    ['Unrelated occurrences', occurrences.filter((r) => r.related === 0).length],
    ['Cascading deletes', relations.filter((r) => r.cascadeDeleteL || r.cascadeDeleteR).length],
  ];
  return `<p class="muted totals">${pairs.map(([k, v]) => `${esc(k)} ${count(v)}`).join(' &middot; ')}</p>`;
}

const rowAttrs = (selection) => (r) => `data-select="${esc(r.key)}"${r.key === selection ? ' class="selected"' : ''}`;

/** The totals are the scoreboard for the whole model, so they read the unfiltered rows. */
function renderOccurrences(solution, view, occurrences, relations) {
  const shown = occurrences.filter((r) => matches(r.name, view.filter) || matches(r.table, view.filter));
  const body = totals(occurrences, relations)
    + table(withFile(view.multiFile, OCCURRENCE_COLUMNS), shown, { empty: 'No occurrences', rowAttrs: rowAttrs(view.selection) });
  return section('Occurrences', body, { actions: catalogActions(solution, 'tableOccurrence', view.multiFile, 'occurrences') });
}

function renderRelations(solution, view, rows) {
  const shown = rows.filter((r) => matches(r.left, view.filter) || matches(r.right, view.filter) || matches(r.predicates, view.filter));
  const body = table(withFile(view.multiFile, RELATION_COLUMNS), shown, { empty: 'No relations', rowAttrs: rowAttrs(view.selection) });
  return section('Relationships', body, { actions: catalogActions(solution, 'relation', view.multiFile, 'relations') });
}

function sideKv(label, side) {
  const flags = ['createRelated', 'cascadeDelete', 'cascadeUpdate', 'sortRelated'].filter((f) => get(side, f) === true);
  const sort = sortText(side);
  return [label, [flags.join(', ') || 'none', sort && `sorted by ${sort}`].filter(Boolean).map(esc).join(' &middot; ')];
}

function renderDetail(solution, view, occurrences, relations) {
  const sel = selectionOf(view);
  if (!sel) return '';
  const rows = sel.kind === 'to' ? occurrences : relations;
  const row = rows.find((r) => r.target === sel.target && String(r.id) === sel.id);
  if (!row) return '';
  const catalog = sel.kind === 'to' ? 'tableOccurrence' : 'relation';
  const actions = rereadObjectButton({ kind: 'object', target: row.target, catalog, key: String(row.id) },
    sel.kind === 'to' ? 'Re-read occurrence' : 'Re-read relation');
  if (row.error) {
    return section(`${row.name ?? row.left} (${row.target})`, `<p class="error">${esc(get(row.error, 'code'))}: ${esc(get(row.error, 'message'))}</p>`, { actions });
  }
  const d = row.detail;
  const pairs = sel.kind === 'to' ? [
    ['Name', esc(row.name)], ['Id', esc(row.id)], ['Table', esc(row.table)],
    ['Source', sourceBadges(row) || 'none'], ['Position', esc(get(d, 'position'))],
    ['Related', (get(d, 'related') ?? []).map((r) => esc(nameOf(r))).join(', ') || 'none'],
    ['Cascade', row.cascade ? badge('has cascade', 'warn') : 'none'],
    ['Graph', `${esc(JSON.stringify(row.bounds))} <span class="swatch" style="background:${row.color}"></span> ${esc(row.color)}, view ${esc(path(d, 'graph.view'))}`],
    ['Tags', esc(row.tags) || 'none'],
  ] : [
    ['Left', esc(row.left)], ['Right', esc(row.right)],
    ['Predicates', `<code>${esc(row.predicates)}</code>`],
    sideKv('Left to right', get(d, 'leftToRight')), sideKv('Right to left', get(d, 'rightToLeft')),
    ['Effects', `<ul>${(get(d, 'effects') ?? []).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`],
  ];
  const title = sel.kind === 'to' ? `Occurrence ${row.name}` : `Relation ${row.left} - ${row.right}`;
  return section(view.multiFile ? `${title} (${row.file})` : title, kv(pairs), { actions });
}

function renderGraph(solution, view) {
  const sel = selectionOf(view);
  const body = Object.values(solution.files).map((file) => {
    const highlight = sel && sel.kind === 'to' && sel.target === file.target ? sel.id : null;
    const notes = listOf(file, 'graphNote');
    const list = notes.length
      ? `<ul class="notes">${notes.map((n) => `<li>${esc(get(n, 'text'))}</li>`).join('')}</ul>`
      : '';
    const unplaced = occurrenceRows(file).filter((r) => !r.placed).map((r) => r.name);
    const missing = unplaced.length
      ? `<p class="muted">${count(unplaced.length)} occurrence(s) fm reports without geometry, so not drawn: ${esc(unplaced.join(', '))}</p>`
      : '';
    const title = view.multiFile ? `<h3>${esc(file.name ?? file.target)}</h3>` : '';
    return `${title}<div class="graph-wrap">${graphSvg(file, { highlight })}</div>${missing}${list}`;
  }).join('');
  return section('Graph', body);
}

export const tab = {
  id: 'graph',
  label: 'Relationships',
  render(solution, view = {}) {
    const occurrences = rowsOf(solution, occurrenceRows);
    const relations = rowsOf(solution, relationRows);
    return renderOccurrences(solution, view, occurrences, relations)
      + renderRelations(solution, view, relations)
      + renderDetail(solution, view, occurrences, relations)
      + renderGraph(solution, view);
  },
};
