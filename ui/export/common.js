// ui/export/common.js
// The three escapings an export needs and the one filename it is saved under.
//
// ui/dom.js's `esc` is for HTML and is wrong for all three of these: a Markdown
// table is split by `|`, a Mermaid identifier may only be `[A-Za-z0-9_]`, and a
// Mermaid label is closed by the first `"`. Each destination gets its own
// escape, here, so no exporter invents a second one.
//
// Pure: no document, no node:, no server/.

/** A Markdown table cell. The pipe is what would split the row, so it is
 *  backslash-escaped; a line break would end the row, so it is flattened to a
 *  space. Nothing else is touched -- a report of FileMaker names is read as
 *  text, and half-escaping `*` or `_` would make the names wrong. */
export function mdCell(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s*[\r\n]+\s*/g, ' ');
}

/** One Markdown table: a header row, the separator, and the rows. `align` is
 *  one character per column, `r` for a number column. Returns the "None" line
 *  when there is nothing to put in it, so a section is never a naked header. */
export function mdTable(headers, rows, { align = '', empty = 'None.' } = {}) {
  if (!rows.length) return `${empty}\n`;
  const sep = headers.map((_, i) => (align[i] === 'r' ? '---:' : '---'));
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(sep), ...rows.map((r) => line(r.map(mdCell)))].join('\n') + '\n';
}

/** A Markdown bullet list, or the sentence that says there is nothing to list. */
export function mdList(items, empty) {
  return items.length ? items.map((i) => `- ${i}`).join('\n') + '\n' : `${empty}\n`;
}

/** A Mermaid identifier: `[A-Za-z0-9_]` only, never starting with a digit.
 *  `used` is a key -> identifier map carried across a whole diagram, so the
 *  same object is always the same node and two names that sanitise alike do not
 *  become one (`My TO` and `My|TO` are different occurrences). `key` is what
 *  identifies the object when the name alone does not -- two files may each
 *  have an occurrence called Contacts, and they are two entities. */
export function mermaidId(name, used = new Map(), key = String(name ?? '')) {
  const hit = used.get(key);
  if (hit) return hit;
  let base = String(name ?? '').replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[A-Za-z_]/.test(base)) base = `n_${base}`;
  const taken = new Set(used.values());
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}_${n}`;
  used.set(key, id);
  return id;
}

/** A Mermaid label, which is written inside `"` and ends at the first one.
 *  Mermaid reads HTML entity codes inside a label, so a quote becomes one
 *  rather than being dropped. A line break would end the statement. */
export function mermaidLabel(text) {
  return String(text ?? '').replace(/"/g, '#quot;').replace(/\s*[\r\n]+\s*/g, ' ');
}

/** The root file's own name: fm's `Get ( FileName )` when the read has it,
 *  the last segment of the target otherwise. */
function rootName(solution) {
  const root = solution?.root ?? '';
  const named = solution?.files?.[root]?.name;
  if (named) return String(named);
  const tail = String(root).replace(/\/+$/, '').split('/').pop() ?? '';
  return tail.replace(/\.fmp12$/i, '');
}

const isoDay = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

/** `<root file name>-<YYYY-MM-DD>.<ext>`, the day being the one the solution was
 *  read on -- an export is about a read, not about when it was saved -- falling
 *  back to today when nothing has been read yet. Every character a filename may
 *  not carry becomes `_`, and a name that survives as nothing becomes
 *  `solution`, so the download always has something to be called. */
export function exportFilename(solution, ext, now = new Date()) {
  const read = solution?.readAt ? new Date(solution.readAt) : null;
  const day = isoDay(read && !Number.isNaN(read.getTime()) ? read : now);
  const safe = rootName(solution).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._]+|[._]+$/g, '');
  return `${safe || 'solution'}-${day}.${ext}`;
}
