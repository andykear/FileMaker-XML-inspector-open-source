// ui/shell.js
// Sidebar, hash route, filter box, delegated clicks. Tabs are pure renderers; this is the
// only file in ui/ that touches the document besides app.js.
import { buildHash, esc, parseHash, sortRows } from './dom.js';

// The hash functions live in ui/dom.js, one layer down, because `link` builds
// its href with buildHash. They are re-exported here because the shell is where
// a reader looks for them.
export { buildHash, parseHash };

/** Every keystroke in the filter box re-renders the whole tab, and a tab can be
 *  thousands of rows. 120ms is about one fast typist's inter-key gap: long
 *  enough that a burst renders once, short enough that a pause feels immediate. */
export const FILTER_DEBOUNCE_MS = 120;

export function createShell({ tabs, mount, onReread, onExport, onAction }) {
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

  /** The hash the page was last drawn from. `null` until the first render, so
   *  the hash a reader arrived on counts as a change: a link pasted into the
   *  address bar must land on its step like any other. */
  let routedFrom = null;

  function route() {
    if (!solution) return;
    const view = viewOf();
    // Did the HASH bring us here? Only then is there a step to land on. A
    // filter keystroke re-renders the same selection, and scrolling on it would
    // drag the page back to the step on every letter typed -- the one thing a
    // reader filtering a long script is not doing is looking at that step.
    const landed = routedFrom !== location.hash;
    routedFrom = location.hash;
    renderNav(view.tab);
    mount.main.innerHTML = byId.get(view.tab).render(solution, view);
    if (landed) scrollToSelectedStep();
  }

  /** The one DOM action the shell takes beyond rendering. A link from the
   *  Analysis tab or the Explorer lands on a step that can be the 900th `<li>`
   *  of the script, which the browser will not scroll to on its own: the hash
   *  is the tab's selection, not a fragment id. Every capability is optional so
   *  a test's stub mount and an old browser are a no-op, not a blank page. */
  function scrollToSelectedStep() {
    const step = mount.main.querySelector?.('.selected[id^="step-"]');
    step?.scrollIntoView?.({ block: 'center' });
  }

  /** Sorting is a view of the rows that are ON THE PAGE, not state: nothing is
   *  recorded anywhere, the hash never moves, and the next re-render -- a filter
   *  keystroke, a route, a re-read -- draws the tab's own order again. That is
   *  the documented behaviour, not an oversight: a sort a reader can see is a
   *  sort a reader can redo, and a sort remembered across a filter would hide
   *  which order the tab itself puts its rows in.
   *
   *  The rows are MOVED, not rewritten: appendChild takes the same `<tr>`
   *  elements along with their `data-select`, their `class="selected"` and any
   *  listener on them, so a table sorts without losing what the reader picked. */
  function sortByHeader(th) {
    const table = th.closest('table');
    const tbody = table?.tBodies?.[0];
    if (!tbody) return;
    // First click ascending, the same header toggles, another header starts
    // ascending again -- and only one header at a time wears the arrow.
    const direction = th.dataset.dir === 'asc' ? 'desc' : 'asc';
    for (const other of table.querySelectorAll?.('th[data-dir]') ?? []) delete other.dataset.dir;
    th.dataset.dir = direction;
    const rows = Array.from(tbody.rows, (tr) => ({ tr, cells: Array.from(tr.cells, (td) => td.textContent ?? '') }));
    for (const row of sortRows(rows, th.cellIndex, th.dataset.sort, direction)) tbody.appendChild(row.tr);
  }

  mount.filter.addEventListener('input', () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => { filter = mount.filter.value.trim().toLowerCase(); route(); }, FILTER_DEBOUNCE_MS);
  });
  // The Export menu is a menu, not a setting: it fires and returns to its own
  // label, so the same export can be picked twice in a row. What an export IS
  // belongs to app.js, which owns the one Blob and the one temporary <a>.
  mount.export?.addEventListener('change', () => {
    const kind = mount.export.value;
    mount.export.value = '';
    if (kind) onExport?.(kind);
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
    // The generic one: a tab names an action and the app decides what it does.
    // Deliberately after the re-read buttons, which are the same click with a
    // shape of their own, and before row selection, so a button inside a
    // selectable row is the button's click and not the row's.
    const action = ev.target.closest('[data-action]');
    if (action) {
      await onAction?.(action.dataset.action, action.dataset);
      return;
    }
    // A click on a sortable header, before row selection so that a header
    // inside a table of selectable rows sorts rather than selects.
    const header = ev.target.closest('th[data-sort]');
    if (header) {
      sortByHeader(header);
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
