import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, buildHash, createShell } from '../ui/shell.js';
import { link } from '../ui/dom.js';

test('parseHash and buildHash round-trip a tab and a selection with reserved characters', () => {
  assert.deepEqual(parseHash(''), { tab: null, selection: null });
  assert.deepEqual(parseHash('#tables'), { tab: 'tables', selection: null });
  assert.deepEqual(parseHash('#tables/fmnet%3A%2F%2Flocalhost%2Fooe%7CContacts'), { tab: 'tables', selection: 'fmnet://localhost/ooe|Contacts' });
  assert.equal(buildHash('tables', 'fmnet://localhost/ooe|Contacts'), '#tables/fmnet%3A%2F%2Flocalhost%2Fooe%7CContacts');
  assert.equal(buildHash('tables', null), '#tables');
});

test('link and buildHash agree, so a click and a link land on the same selection', () => {
  // The four characters a selection really carries: the `/` of a target, the `%`
  // of something already encoded, the `|` between target and parts, and a `#`.
  for (const selection of ['fmnet://localhost/ooe|Contacts', '100%', 'a|b', 'x#12', '/', '%', '|', '#']) {
    assert.equal(link(`tables/${selection}`, 'n'), `<a href="${buildHash('tables', selection)}">n</a>`, selection);
    assert.equal(parseHash(buildHash('tables', selection)).selection, selection, selection);
  }
  assert.equal(link('security', 'Authorizations'), '<a href="#security">Authorizations</a>');
});

/** The smallest DOM the shell actually touches: innerHTML, addEventListener and
 *  the `closest` of a click target. Each element records what it was given. */
function fakeElement() {
  const el = { innerHTML: '', handlers: {}, addEventListener(type, fn) { el.handlers[type] = fn; }, value: '' };
  return el;
}

/** A click whose target answers `closest` from a map of selector -> element. */
function clickOn(matchesBySelector) {
  return { target: { closest: (sel) => matchesBySelector[sel] ?? null } };
}

function stubShell({ render = () => '<p>body</p>' } = {}) {
  const mount = { nav: fakeElement(), main: fakeElement(), filter: fakeElement(), export: fakeElement() };
  const rereads = [];
  const exports = [];
  const actions = [];
  const saved = { window: globalThis.window, location: globalThis.location };
  globalThis.window = { addEventListener() {} };
  globalThis.location = { hash: '' };
  const shell = createShell({
    tabs: [{ id: 'tables', label: 'Tables', render }, { id: 'scripts', label: 'Scripts', render }],
    mount,
    onReread: async (slot) => { rereads.push(slot); },
    onExport: (kind) => { exports.push(kind); },
    onAction: async (name, dataset) => { actions.push([name, dataset]); },
  });
  shell.setSolution({ files: { a: {}, b: {} }, unreachable: [] });
  return { shell, mount, rereads, exports, actions, restore: () => Object.assign(globalThis, saved) };
}

test('the shell renders the nav and the active tab, and view is what the tab was rendered with', () => {
  let seen = null;
  const { shell, mount, restore } = stubShell({ render: (s, v) => { seen = v; return '<p>body</p>'; } });
  try {
    assert.match(mount.nav.innerHTML, /class="nav-item active" href="#tables"/);
    assert.match(mount.nav.innerHTML, /href="#scripts"/);
    assert.equal(mount.main.innerHTML, '<p>body</p>');
    assert.deepEqual(seen, { tab: 'tables', selection: null, filter: '', multiFile: true });
    assert.deepEqual(shell.view, seen, 'shell.view is the object route() built, plus the tab');
    // Nothing read yet is a page with a message on it, nav and all.
    shell.showMessage('<p class="error">Read failed</p>');
    assert.equal(mount.main.innerHTML, '<p class="error">Read failed</p>');
    assert.match(mount.nav.innerHTML, /nav-item active/);
  } finally { restore(); }
});

test('a click on a row selects it, through buildHash', () => {
  const { mount, restore } = stubShell();
  try {
    const row = { dataset: { select: 'fmnet://localhost/ooe|Contacts' } };
    mount.main.handlers.click(clickOn({ '[data-select]': row }));
    assert.equal(globalThis.location.hash, buildHash('tables', 'fmnet://localhost/ooe|Contacts'));
  } finally { restore(); }
});

test('a click on a link inside a row is the link\'s, not the row\'s', () => {
  const { mount, restore } = stubShell();
  try {
    const row = { dataset: { select: 'a|b' } };
    mount.main.handlers.click(clickOn({ '[data-select]': row, a: { href: '#tables/a%7Cb' } }));
    assert.equal(globalThis.location.hash, '', 'the browser follows the href; the shell stays out of it');
  } finally { restore(); }
});

test('a click on a re-read button calls onReread with the parsed slot and selects nothing', async () => {
  const { mount, rereads, restore } = stubShell();
  try {
    const slot = { kind: 'object', target: 'fmnet://localhost/ooe', catalog: 'script', key: '39' };
    const button = { dataset: { rereadObject: JSON.stringify(slot) } };
    const selector = 'button[data-reread-object], button[data-reread-catalog]';
    await mount.main.handlers.click(clickOn({ [selector]: button, '[data-select]': { dataset: { select: 'a|b' } } }));
    assert.deepEqual(rereads, [slot]);
    assert.equal(globalThis.location.hash, '', 'a re-read is not a selection');

    const catalogButton = { dataset: { rereadCatalog: 'valueList', target: 'fmnet://localhost/ooe' } };
    await mount.main.handlers.click(clickOn({ [selector]: catalogButton }));
    assert.deepEqual(rereads[1], { kind: 'catalog', target: 'fmnet://localhost/ooe', catalog: 'valueList' });
  } finally { restore(); }
});

test('a click on a data-action button calls onAction with the name and the dataset, and selects nothing', async () => {
  const { mount, actions, restore } = stubShell();
  try {
    const button = { dataset: { action: 'gaps-check', target: 'fmnet://localhost/ooe' } };
    await mount.main.handlers.click(clickOn({ '[data-action]': button, '[data-select]': { dataset: { select: 'a|b' } } }));
    assert.deepEqual(actions, [['gaps-check', button.dataset]]);
    assert.equal(globalThis.location.hash, '', 'an action is not a selection');
  } finally { restore(); }
});

test('a shell with no onAction ignores an action click rather than throwing', async () => {
  const saved = { window: globalThis.window, location: globalThis.location };
  globalThis.window = { addEventListener() {} };
  globalThis.location = { hash: '' };
  try {
    const mount = { nav: fakeElement(), main: fakeElement(), filter: fakeElement() };
    const shell = createShell({ tabs: [{ id: 'tables', label: 'Tables', render: () => '<p>x</p>' }], mount, onReread: async () => {} });
    shell.setSolution({ files: {}, unreachable: [] });
    await mount.main.handlers.click(clickOn({ '[data-action]': { dataset: { action: 'nope' } } }));
    assert.equal(globalThis.location.hash, '');
  } finally { Object.assign(globalThis, saved); }
});

test('a click on neither a row nor a button changes nothing', () => {
  const { mount, restore } = stubShell();
  try {
    mount.main.handlers.click(clickOn({}));
    assert.equal(globalThis.location.hash, '');
  } finally { restore(); }
});

test('the export menu calls onExport with what was picked and goes back to its own label', () => {
  const { mount, exports, restore } = stubShell();
  try {
    mount.export.value = 'markdown';
    mount.export.handlers.change();
    assert.deepEqual(exports, ['markdown']);
    assert.equal(mount.export.value, '', 'the menu is a menu, not a setting: it resets so the same export can be picked twice');
    // The placeholder option is not an export.
    mount.export.value = '';
    mount.export.handlers.change();
    assert.deepEqual(exports, ['markdown']);
  } finally { restore(); }
});

test('a shell with no export menu still works, so a page without one is not a crash', () => {
  const saved = { window: globalThis.window, location: globalThis.location };
  globalThis.window = { addEventListener() {} };
  globalThis.location = { hash: '' };
  try {
    const mount = { nav: fakeElement(), main: fakeElement(), filter: fakeElement() };
    const shell = createShell({ tabs: [{ id: 'tables', label: 'Tables', render: () => '<p>x</p>' }], mount, onReread: async () => {} });
    shell.setSolution({ files: {}, unreachable: [] });
    assert.equal(mount.main.innerHTML, '<p>x</p>');
  } finally { Object.assign(globalThis, saved); }
});
