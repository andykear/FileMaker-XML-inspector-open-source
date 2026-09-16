// A scripted edit has, three times in this plan, written a literal NUL byte (or
// another stray control character) into a source file instead of the escape
// sequence it meant to write. Node and every editor involved happily carry the
// byte through unnoticed -- it does not show up in a diff review, only in
// stray "invalid character" reports much later. This test walks the source
// tree once and fails loudly on any control character that has no business
// being there.
//
// Tab, newline and carriage return are legitimate file content; every other
// byte in the C0 range (0x00-0x1F) plus DEL (0x7F) is not, in any of the text
// formats this repo writes by hand or by script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['ui', 'server', 'bin', 'scripts', 'tests'];
const EXTENSIONS = new Set(['.js', '.mjs', '.html', '.css', '.md']);

// eslint-disable-next-line no-control-regex -- the whole point is to find these
const BAD_CONTROL_CHARACTER = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function findBadCharacters(text) {
  const hits = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (BAD_CONTROL_CHARACTER.test(text[i])) {
      hits.push({ index: i, code });
    }
  }
  return hits;
}

test('no stray control characters in ui/, server/, bin/, scripts/ or tests/', () => {
  const files = DIRS
    .map((d) => path.join(ROOT, d))
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => walk(d, []));
  assert.ok(files.length > 0, 'expected to find source files to scan');

  const offenders = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const hits = findBadCharacters(text);
    if (hits.length > 0) {
      const rel = path.relative(ROOT, file);
      offenders.push(`${rel}: ${hits.length} bad byte(s), first 0x${hits[0].code.toString(16).padStart(2, '0')} at offset ${hits[0].index}`);
    }
  }

  assert.deepEqual(offenders, [], `stray control characters found:\n${offenders.join('\n')}`);
});
