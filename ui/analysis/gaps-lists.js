// ui/analysis/gaps-lists.js
// Every list a live gap check's outcome carries, in the order a reader wants
// them: what broke, what moved, what closed, what is still open.
//
// Two surfaces print this one answer -- the Gaps tab (ui/tabs/gaps.js) and the
// Markdown report (ui/export/markdown.js) -- so the names and the prose live
// here, in neither of them. Each row's `title` is the heading both surfaces
// print and each row's `note` says what the list MEANS, because the name of a
// list is never enough to act on. A list the toolkit adds appears on both
// surfaces the day server/gaps.mjs forwards it and its row is added here.
//
// A row is `{ key, title, note }` and nothing else: how a list is DRAWN is the
// tab's business, and the tab attaches its columns by key. That is the whole
// reason this module exists -- the report used to import the tab to get at this
// constant, which dragged a page of HTML column renderers into an exporter that
// draws no HTML.
//
// Pure: no document, no node:, no server/, and nothing imported at all.

export const GAP_LISTS = Object.freeze([
  { key: 'errored', title: 'Errored',
    note: 'The probe failed and no expectedError accepts the failure.' },
  { key: 'erroredExpected', title: 'Errored, and expected to',
    note: 'The probe failed in the way the register already records.' },
  { key: 'regressed', title: 'Regressed',
    note: 'The register says fm reports this and it did not report it here.' },
  { key: 'newlyReported', title: 'Newly reported',
    note: 'An attribute reported live but still marked missing in the register.' },
  { key: 'expectedResolved', title: 'Expected failure resolved',
    note: 'The probe the register expects to fail succeeded: the gap closed.' },
  { key: 'attributeErrors', title: 'Attribute not verified',
    note: 'The attribute\'s own probe or selector failed, so it was scored neither way.' },
  { key: 'unexplained', title: 'Keys no attribute claims',
    note: 'fm answered with a key the register does not account for.' },
  { key: 'nestedUnexplained', title: 'Nested keys no attribute claims',
    note: 'The same question one level down, and the only list a gap closed by a nested key shows up in.' },
  { key: 'stillMissing', title: 'Still missing',
    note: 'The register says fm does not report this, and it still did not: the gap is where it was.' },
].map(Object.freeze));
