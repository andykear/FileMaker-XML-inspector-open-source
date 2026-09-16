// ui/shell.js
// Sidebar, hash route, filter box, delegated clicks. Tabs are pure renderers; this is the
// only file in ui/ that touches the document besides app.js.
import { esc } from './dom.js';

export function parseHash(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (!h) return { tab: null, selection: null };
  const [tab, ...rest] = h.split('/');
  return { tab, selection: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

export function buildHash(tab, selection) {
  return selection ? `#${tab}/${encodeURIComponent(selection)}` : `#${tab}`;
}

/** Every keystroke in the filter box re-renders the whole tab, and a tab can be
 *  thousands of rows. 120ms is about one fast typist's inter-key gap: long
 *  enough that a burst renders once, short enough that a pause feels immediate. */
export const FILTER_DEBOUNCE_MS = 120;

export function createShell({ tabs, mount, onReread }) {
  let solution = null;
  let filter = '';
  let filterTimer = null;
  const byId = new Map(tabs.map((t) => [t.id, t]));

  function current() {
    const { tab, selection } = parseHash(location.hash);
    return { tab: byId.has(tab) ? tab : tabs[0].id, selection };
  }

  function renderNav(active) {
    mount.nav.innerHTML = tabs.map((t) =>
      `<a class="nav-item${t.id === active ? ' active' : ''}" href="${buildHash(t.id, null)}">${esc(t.label)}</a>`).join('');
  }

  function route() {
    if (!solution) return;
    const { tab, selection } = current();
    renderNav(tab);
    const view = { selection, filter, multiFile: Object.keys(solution.files).length > 1 };
    mount.main.innerHTML = byId.get(tab).render(solution, view);
  }

  mount.filter.addEventListener('input', () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => { filter = mount.filter.value.trim().toLowerCase(); route(); }, FILTER_DEBOUNCE_MS);
  });
  window.addEventListener('hashchange', route);
  mount.main.addEventListener('click', async (ev) => {
    const reread = ev.target.closest('button[data-reread-object], button[data-reread-catalog]');
    if (reread) {
      const slot = reread.dataset.rereadObject
        ? JSON.parse(reread.dataset.rereadObject)
        : { kind: 'catalog', target: reread.dataset.target, catalog: reread.dataset.rereadCatalog };
      await onReread(slot);
      return;
    }
    const row = ev.target.closest('[data-select]');
    if (row && !ev.target.closest('a')) {
      const { tab } = current();
      location.hash = buildHash(tab, row.dataset.select);
    }
  });

  return {
    setSolution(s) { solution = s; route(); },
    route,
    get view() { return { ...current(), filter }; },
  };
}
