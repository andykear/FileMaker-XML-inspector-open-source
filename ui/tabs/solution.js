// ui/tabs/solution.js
// The Solution tab: one panel per reached file (its facts and its catalog counts, each
// with its re-read button), then the Unreachable list. A pure renderer -- the shell owns
// the clicks, so the buttons only carry the slot they want re-read.
import { esc, kv, link, rereadCatalogButton, section, table } from '../dom.js';
import { catalogCounts } from '../model.js';
import { get, path } from '../access.js';
import { byteSize, catalogHash, factValue, linkOr, selectionKey } from './common.js';

// fm's flattened lists (layout, script, customFunction) carry folders and
// separators alongside the real entries, so their count in this column is not
// "how many layouts/scripts/functions" -- the title says so on hover.
const FLATTENED_CATALOGS = new Set(['layout', 'script', 'customFunction']);
const ENTRIES_TITLE = 'list entries including folders and separators';

// The `field` slot has no list op at all: fm describes fields one table at a
// time, so nothing ever listed them and the count would read a flat 0 beside a
// Described of 14. The cell says what actually happened instead, and the row
// borrows the `table` slot's timestamp -- the read that fetched the fields is
// the table read, so an empty Read at would be the second half of the same lie.
const PER_TABLE_CATALOG = 'field';
const PER_TABLE_SOURCE = 'table';
const PER_TABLE_TITLE = 'fields are read one table at a time; Described counts the tables read';

// `Get ( FileSize )` is bytes as a bare number -- everywhere else on the page
// a reader wants "3.6 MB", so this one fact gets its own rendering, the exact
// byte count kept on hover for whoever needs it precisely.
const FILE_SIZE_KEY = 'Get ( FileSize )';

// The File Options settings, grouped and labelled the way FileMaker's own File
// Options dialog groups and labels them rather than the way fm spells its keys:
// a reader looking for "Log in as" is looking for the dialog they know. Each
// entry is [label, path], read through access.js so a build that drops or
// respells a key renders "not reported" instead of throwing.
const FILE_OPTIONS_GROUPS = [
  ['Open', [
    ['Switch to a layout on open', 'switchToLayout'],
    ['Startup layout', 'layout'],
    ['Log in as', 'login.mode'],
    ['A password is set', 'login.hasPassword'],
    ['Minimum FileMaker version', 'minimumVersion'],
    ['Hide all toolbars', 'hideToolbars'],
  ]],
  ['Security', [
    ['Allow stored credentials', 'allowStoredCredentials'],
    ['Require a device passcode', 'requireDevicePasscode'],
    ['Show sign-in fields', 'showSignInFields'],
    ['Require authorization', 'requireAuthorization'],
  ]],
  ['Spelling and text', [
    ['Underline questionable spellings', 'underlineMisspellings'],
    ['Smart quotes', 'smartQuotes'],
    ['Asian line breaking (kinsoku)', 'asianLineBreaking'],
    ['Roman line breaking on word boundaries', 'romanLineBreaking'],
    ['Date, time and number formats', 'dataEntry'],
  ]],
  ['Containers', [
    ['Generate thumbnails', 'generateThumbnails'],
    ['Thumbnail storage', 'thumbnailStorage'],
  ]],
  ['New tables', [
    ['Give new tables the default fields', 'useDefaultFields'],
  ]],
  ['Icon', [
    ['Icon', 'icon'],
  ]],
];

/** fm never sends the password itself -- `login.hasPassword` is a boolean and
 *  `icon` reports `hasImage` and no bytes -- so the block can be rendered as it
 *  arrived without leaking a credential. */
function optionValue(target, at, value) {
  if (value === undefined || value === null) return '<span class="muted">not reported</span>';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (at === 'minimumVersion') {
    const version = get(value, 'version');
    const raw = get(value, 'value');
    if (version === undefined || version === null) return esc(String(raw ?? ''));
    return `<span title="${esc(`fm reports ${raw}`)}">${esc(version)}</span>`;
  }
  if (at === 'layout') {
    const name = get(value, 'name');
    const id = get(value, 'id');
    if (name === undefined || name === null) return '<span class="muted">none</span>';
    return id === undefined || id === null
      ? esc(String(name))
      : link(`layouts/${selectionKey(target, id)}`, String(name));
  }
  // The icon is three facts on one line: what kind, how it is scaled, and
  // whether a picture came with it. fm sends no image bytes.
  if (at === 'icon') {
    const parts = [get(value, 'type'), get(value, 'scale')].filter((p) => p !== undefined && p !== null);
    if (get(value, 'hasImage') === true) parts.push('has an image');
    return parts.length ? esc(parts.join(', ')) : '<span class="muted">not reported</span>';
  }
  return esc(String(value));
}

const TRIGGER_COLUMNS = [
  { key: 'event', label: 'Event', render: (r) => `<span title="${esc(`fm event id ${r.eventId ?? ''}`)}">${esc(r.event)}</span>` },
  { key: 'script', label: 'Script', render: (r) => {
    // fm reports all six events always; an empty script means no script runs on this event.
    if (!r.script) return '<span class="muted">none</span>';
    return (r.scriptId === undefined || r.scriptId === null
      ? esc(r.script)
      : link(`scripts/${selectionKey(r.target, r.scriptId)}`, String(r.script)));
  } },
];

function renderFileOptions(file) {
  const slot = file.fileOptions ?? {};
  const actions = rereadCatalogButton(file.target, 'fileOptions');
  const error = get(slot, 'error');
  if (error) {
    // fm 0.7.0 and earlier have no such catalog. The panel says so and every
    // other panel on the page is untouched.
    const suggestion = get(error, 'code') === 'unknown_catalog'
      ? '<p class="muted">This fm build has no File Options catalog; fm 0.8.0 is the first that does.</p>'
      : '';
    return section('File Options', `<p class="error">${esc(get(error, 'code'))}: ${esc(get(error, 'message'))}</p>${suggestion}`, { actions });
  }
  const block = get(slot, 'block');
  if (!block) return section('File Options', '<p class="empty">Not read</p>', { actions });

  const groups = FILE_OPTIONS_GROUPS.map(([title, entries]) => {
    const pairs = entries.map(([label, at]) => [label, optionValue(file.target, at, path(block, at))]);
    return `<h3>${esc(title)}</h3>${kv(pairs)}`;
  }).join('');
  const triggers = (get(block, 'triggers') ?? []).map((t) => ({
    event: get(t, 'event'), eventId: get(t, 'eventId'),
    script: get(t, 'script'), scriptId: get(t, 'scriptId'), target: file.target,
  }));
  const readAt = get(slot, 'readAt');
  const when = readAt ? `<p class="muted">Read at ${esc(readAt)}</p>` : '';
  return section('File Options',
    `${when}${groups}<h3>Script triggers</h3>${table(TRIGGER_COLUMNS, triggers, { empty: 'No file script triggers' })}`,
    { actions });
}

function factLine(key, v) {
  if (key !== FILE_SIZE_KEY) return factValue(v);
  const value = get(v, 'value');
  const size = byteSize(value);
  // Anything byteSize can't turn into a size (an error, undefined, null, text)
  // falls back to the general fact rendering, so the fallback stays the rule
  // rather than one carved-out case (undefined) among several.
  if (!size) return factValue(v);
  return `<span title="${esc(`${value} bytes`)}">${esc(size)}</span>`;
}

const COLUMNS = [
  { key: 'catalog', label: 'Catalog', render: (r) => `${linkOr(catalogHash(r.catalog), r.catalog)}${r.listError ? ` <span class="error">${esc(r.listError.code)}</span>` : ''}` },
  {
    key: 'listed',
    label: 'Entries',
    num: true,
    render: (r) => {
      if (r.catalog === PER_TABLE_CATALOG) return `<span title="${esc(PER_TABLE_TITLE)}">per table</span>`;
      return FLATTENED_CATALOGS.has(r.catalog)
        ? `<span title="${esc(ENTRIES_TITLE)}">${esc(r.listed)}</span>`
        : esc(r.listed);
    },
  },
  { key: 'described', label: 'Described', num: true },
  { key: 'errors', label: 'Errors', num: true, render: (r) => `<span class="${r.errors ? 'error' : ''}">${esc(r.errors)}</span>` },
  { key: 'readAt', label: 'Read at', render: (r) => `<span class="muted">${esc(r.readAt ?? '')}</span>` },
  // A column of buttons under a blank header: there is nothing to sort by, so it opts out.
  { key: 'reread', label: '', sort: false, render: (r) => rereadCatalogButton(r.target, r.catalog) },
];

function renderFile(file) {
  const rows = Object.entries(catalogCounts(file)).map(([catalog, c]) => ({
    catalog,
    listed: c.listed,
    described: c.described,
    errors: c.errors,
    readAt: (catalog === PER_TABLE_CATALOG ? file.catalogs[PER_TABLE_SOURCE] : file.catalogs[catalog])?.readAt,
    listError: file.catalogs[catalog].listError,
    target: file.target,
  }));
  const title = `${file.name ?? file.target}`;
  const body = `<p class="muted target">${esc(file.target)}</p>`
    + kv(Object.entries(file.facts).map(([k, v]) => [k, factLine(k, v)]))
    + table(COLUMNS, rows, { empty: 'No catalogs read' });
  return section(title, body, { actions: rereadCatalogButton(file.target, 'facts', 'Re-read facts') })
    + renderFileOptions(file);
}

function renderUnreachable(list) {
  if (!list.length) return '';
  const items = list.map((u) => `<li><code>${esc(u.target)}</code> <span class="muted">from ${esc(u.from ?? '')} via ${esc(u.via ?? '')}</span><br>
    <span class="error">${esc(u.error.code)}${u.error.dbError ? ` (DBError ${esc(u.error.dbError)})` : ''}</span>: ${esc(u.error.message)}
    ${u.error.suggestions?.length ? `<ul>${u.error.suggestions.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</li>`).join('');
  return section('Unreachable', `<ul class="unreachable">${items}</ul>`);
}

export const tab = {
  id: 'solution',
  label: 'Solution',
  render(solution) {
    return Object.values(solution.files).map(renderFile).join('') + renderUnreachable(solution.unreachable);
  },
};
