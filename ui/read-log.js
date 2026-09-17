// ui/read-log.js
// Discovery takes about ten seconds and the page had nothing to show for it.
// This folds discovery's phase events (ui/discovery.js `hooks.onPhase`) into one
// line per file and renders them, so the main area says what fm is reading right
// now. Pure functions to strings, like the rest of ui/: no document, no server.
import { count, esc } from './dom.js';

/** `3 catalogs`, `1 catalog`: a count and the word it counts, agreeing. The tabs
 *  have their own copy in ui/tabs/common.js; two lines are cheaper than a
 *  top-level ui module reaching down into the tabs for them. */
const plural = (n, word) => `${count(n)} ${n === 1 ? word : `${word}s`}`;

/** The singular label of a describe catalog; `plural` adds the `s`. The key is
 *  the catalog the op reads, so a table's fields arrive under `field` and read
 *  as "tables" -- the batch sends one `read:field` per table, not per field.
 *  A catalog not named here is its own name. */
const LABEL = {
  field: 'table',
  tableOccurrence: 'occurrence',
  customFunction: 'custom function',
  customMenu: 'menu',
  privilegeSet: 'privilege set',
  valueList: 'value list',
};

/** The last path segment of a target. The log draws a file before the file has
 *  been read, so the file's own name (Get ( FileName ), which only the list
 *  batch brings back) is never available here. */
function fileName(target) {
  return String(target ?? '').split('/').filter(Boolean).pop() ?? '';
}

const secondsText = (ms) => `${((Number(ms) || 0) / 1000).toFixed(1)} s`;

/** A phase's own time, in brackets after what it did. */
function seconds(ms) {
  return `(${secondsText(ms)})`;
}

/** A phase still running ends with an ellipsis; a finished one carries its
 *  seconds instead. */
function pending(html) {
  return `<span class="pending">${html} …</span>`;
}

function entries(n) {
  return `${count(n)} ${n === 1 ? 'entry' : 'entries'}`;
}

/** `describing 169 objects: 41 scripts, 25 menus, ...` -- the catalogs in
 *  descending order, ties left in the order the batch sends them. */
function describing(ops, byCatalog) {
  const parts = Object.entries(byCatalog ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([catalog, n]) => plural(n, LABEL[catalog] ?? catalog));
  return `describing ${plural(ops, 'object')}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

function fileLine(line) {
  const name = `<b>${esc(line.name)}</b>`;
  if (line.unreachable) {
    const { code, via, from } = line.unreachable;
    // The root itself has no referrer to name.
    const where = via || from ? ` (via ${esc(via)} from ${esc(fileName(from))})` : '';
    return `${name} unreachable: ${esc(code)}${where}`;
  }
  if (!line.listed) return `${name} ${pending('listing')}`;
  const parts = [`listed ${plural(line.listed.catalogs, 'catalog')}, ${entries(line.listed.entries)} ${seconds(line.listed.ms)}`];
  if (line.describe) {
    const text = describing(line.describe.ops, line.describe.byCatalog);
    parts.push(line.described ? `${text} ${seconds(line.described.ms)}` : pending(text));
  }
  return `${name} ${parts.join(' · ')}`;
}

export function createReadLog() {
  const lines = [];           // in the order the events arrived
  const byTarget = new Map(); // target -> the file line, so later events find it

  function fileFor(target) {
    let line = byTarget.get(target);
    if (!line) {
      line = { kind: 'file', name: fileName(target), listed: null, describe: null, described: null, unreachable: null };
      byTarget.set(target, line);
      lines.push(line);
    }
    return line;
  }

  return {
    push(event) {
      const e = event ?? {};
      if (e.type === 'done') {
        lines.push({ kind: 'done', files: e.files, unreachable: e.unreachable, ms: e.ms });
        return;
      }
      const line = fileFor(e.target);
      // A file that fatals was already drawn as "listing": the unreachable
      // event takes over that line rather than adding a second one.
      if (e.type === 'unreachable') line.unreachable = { code: e.code, via: e.via, from: e.from };
      else if (e.type === 'listed') line.listed = { ms: e.ms, catalogs: e.catalogs, entries: e.entries };
      else if (e.type === 'describe') line.describe = { ops: e.ops, byCatalog: e.byCatalog };
      else if (e.type === 'described') line.described = { ms: e.ms };
    },
    html() {
      // The done line is not another file: it is the walk's own total, so it
      // goes under the list as a sentence rather than as a numbered step that
      // would read as one more file being read.
      const files = lines.filter((line) => line.kind !== 'done');
      const done = lines.find((line) => line.kind === 'done');
      const body = files.map((line) => `<li>${fileLine(line)}</li>`).join('');
      const total = done
        ? `<p>Read ${plural(done.files, 'file')}, ${count(done.unreachable)} unreachable, in ${esc(secondsText(done.ms))} overall</p>`
        : '';
      return `<section class="panel read-log"><header><h2>Reading</h2></header><ol>${body}</ol>${total}</section>`;
    },
  };
}
