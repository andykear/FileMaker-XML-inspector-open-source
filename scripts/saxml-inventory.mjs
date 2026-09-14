#!/usr/bin/env node
/** Inventory of every SaXML datum the legacy inspector consumes.
 *
 *  Two passes over legacy/clockwork-inspector.html:
 *   1. every `function parseXxx(` body: the XML selectors and attribute names it reads;
 *   2. the renderResults body and everything after it up to the dense table
 *      renderer: every `s.<catalog>...` access, with the local aliases
 *      (`tf`, `lay`, …) resolved back to `s.<catalog>`.
 *  The output is a Markdown table with empty classification columns; the
 *  classification is written by hand (see docs/saxml-inventory.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY = path.join(ROOT, 'legacy', 'clockwork-inspector.html');
const OUT = path.join(ROOT, 'docs', 'saxml-inventory.md');

/** Split the source into top-level function bodies keyed by name. A body runs
 *  from its `function name(` line to the line before the next top-level
 *  `function ` or banner comment. Good enough for this file, whose top-level
 *  functions all start at column 0. */
function topLevelFunctions(source) {
  const lines = source.split('\n');
  const starts = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(?:async )?function ([A-Za-z_$][\w$]*)\s*\(/);
    if (m) starts.push({ name: m[1], line: i });
  });
  const bodies = new Map();
  starts.forEach((s, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1].line : lines.length;
    bodies.set(s.name, lines.slice(s.line, end).join('\n'));
  });
  return bodies;
}

// One level of nested parentheses is allowed in a call's first argument, so
// `attr(qs(menu, ':scope > Base'), 'value')` doesn't stop at the comma
// *inside* `qs(...)` and misread the CSS selector as the attribute name.
const NESTED_ARG = "(?:[^,()]|\\([^()]*\\))+";

// `qs`, `qsa` and `attr` calls can nest inside one another (including inside
// themselves: `qs(qs(root, 'A'), 'B')`). A single matchAll pass over a call
// pattern only ever finds the outermost call at a given position - matching
// the outer call's first argument consumes the inner call's text too, so the
// inner call's own start position is never tried. To find every call,
// including nested ones, first collect every occurrence of the bare call
// head (`qs(`, `qsa(`, `attr(`), then, independently at each of those
// positions, match the full first-argument-aware pattern anchored (sticky)
// to that exact position.
const CALL_PATTERNS = [
  ['qsa', /\bqsa\(/g, new RegExp(`\\bqsa\\(\\s*${NESTED_ARG},\\s*'([^']+)'`, 'y')],
  ['qs', /\bqs\(/g, new RegExp(`\\bqs\\(\\s*${NESTED_ARG},\\s*'([^']+)'`, 'y')],
  ['attr', /\battr\(/g, new RegExp(`\\battr\\(\\s*${NESTED_ARG},\\s*'([^']+)'`, 'y')],
];

// These patterns capture a string literal that is itself the call's own
// argument (no sibling argument to skip past first), so they have no
// nested-call ambiguity and a plain matchAll is enough.
const SIMPLE_PATTERNS = [
  [/\.getAttribute\(\s*'([^']+)'/g, 'attr'],
  [/\.getElementsByTagName\(\s*'([^']+)'/g, 'tag'],
  [/\.querySelectorAll\(\s*'([^']+)'/g, 'qsa'],
  [/\.querySelector\(\s*'([^']+)'/g, 'qs'],
];

function addCallAccesses(body, found) {
  for (const [kind, headRe, argRe] of CALL_PATTERNS) {
    for (const head of body.matchAll(headRe)) {
      argRe.lastIndex = head.index;
      const m = argRe.exec(body);
      if (m) found.add(`${kind}:'${m[1]}'`);
    }
  }
}

export function extractParserAccesses(source) {
  const out = new Map();
  for (const [name, body] of topLevelFunctions(source)) {
    if (!/^(parse[A-Z]|buildDDRTextIndex)/.test(name)) continue;
    const found = new Set();
    addCallAccesses(body, found);
    for (const [re, kind] of SIMPLE_PATTERNS) {
      for (const m of body.matchAll(re)) found.add(`${kind}:'${m[1]}'`);
    }
    out.set(name, [...found].sort());
  }
  return out;
}

export function extractRenderAccesses(source) {
  const bodies = topLevelFunctions(source);
  const render = bodies.get('renderResults') || '';
  // Aliases declared as `const tf  = s.tables;` or `const { acc, priv, ep } = s.accounts;`
  const alias = new Map();
  for (const m of render.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*s\.([A-Za-z_$][\w$]*)\s*(?:\|\|\s*\{\})?\s*;/g)) {
    alias.set(m[1], `s.${m[2]}`);
  }
  for (const m of render.matchAll(/const\s*\{([^}]+)\}\s*=\s*s\.([A-Za-z_$][\w$]*)\s*;/g)) {
    for (const part of m[1].split(',')) {
      const key = part.trim().split(':')[0].trim();
      if (key) alias.set(key, `s.${m[2]}.${key}`);
    }
  }
  const found = new Set();
  for (const m of render.matchAll(/\bs\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g)) {
    found.add(trimJsMembers(`s.${m[1]}`));
  }
  for (const [name, target] of alias) {
    const re = new RegExp(`\\b${name}\\.([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)`, 'g');
    for (const m of render.matchAll(re)) found.add(trimJsMembers(`${target}.${m[1]}`));
  }
  // `s.tables` on its own (the alias declaration) says nothing once
  // `s.tables.detail.fields_all` is listed; keep only the most specific paths.
  const all = [...found];
  return all.filter((a) => !all.some((b) => b !== a && b.startsWith(a + '.'))).sort();
}

/** Trailing JavaScript members are not data: `fields_all.length` is the datum
 *  `fields_all`. Trim from the right while the last segment is one of these. */
const JS_MEMBERS = new Set([
  'length', 'map', 'filter', 'forEach', 'slice', 'sort', 'reduce', 'some', 'every', 'find',
  'join', 'keys', 'values', 'entries', 'push', 'includes', 'indexOf', 'toLocaleString',
  'toFixed', 'trim', 'split', 'replace', 'startsWith', 'endsWith', 'toLowerCase',
  'toUpperCase', 'concat', 'flat', 'flatMap', 'size', 'get', 'has', 'set',
]);
function trimJsMembers(access) {
  const parts = access.split('.');
  while (parts.length > 2 && JS_MEMBERS.has(parts[parts.length - 1])) parts.pop();
  return parts.join('.');
}

export function buildInventoryMarkdown(parsers, renders) {
  const lines = [
    '# SaXML inventory',
    '',
    'One row per datum the legacy inspector reads from Save as XML (parser rows) or renders from the stats object (render rows).',
    'Classification is one of `covered`, `derived`, `gap`. `fm` names the catalog and key that supplies it, or the register id for a gap.',
    '',
    '| Source | Datum | Classification | fm | Notes |',
    '|---|---|---|---|---|',
  ];
  for (const [name, list] of parsers) {
    for (const datum of list) lines.push(`| ${name} | ${datum} |  |  |  |`);
  }
  for (const datum of renders) lines.push(`| render | ${datum} |  |  |  |`);
  lines.push('');
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = fs.readFileSync(LEGACY, 'utf8');
  const md = buildInventoryMarkdown(extractParserAccesses(source), extractRenderAccesses(source));
  fs.writeFileSync(OUT, md);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${md.split('\n').length} lines`);
}
