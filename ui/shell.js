// ui/shell.js
// Sidebar, hash route, filter box, delegated clicks. Tabs are pure renderers; this is the
// only file in ui/ that touches the document besides app.js.
import { buildHash, esc, parseHash } from './dom.js';

// The hash functions live in ui/dom.js, one layer down, because `link` builds
// its href with buildHash. They are re-exported here because the shell is where
// a reader looks for them.
export { buildHash, parseHash };

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

  /** The one view object: what every tab is rendered with, and what `shell.view`
   *  hands back, so a caller reasoning about the page reasons about the same
   *  thing the page was drawn from. */
  function viewOf() {
    const { tab, selection } = current();
    return { tab, selection, filter, multiFile: Object.keys(solution?.files ?? {}).length > 1 };
  }

  function route() {
    if (!solution) return;
    const view = viewOf();
    renderNav(view.tab);
    mount.main.innerHTML = byId.get(view.tab).render(solution, view);
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
    /** Nothing to render yet -- the nav still draws, so a failed first read is a
     *  page with a message on it rather than a blank rectangle. */
    showMessage(html) {
      renderNav(viewOf().tab);
      mount.main.innerHTML = html;
    },
    get view() { return viewOf(); },
  };
}
