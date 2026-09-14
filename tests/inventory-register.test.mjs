import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegister } from 'fm-adt-toolkit/gaps';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY_PATH = path.join(ROOT, 'docs', 'saxml-inventory.md');
const MAP_PATH = path.join(ROOT, 'docs', 'inventory-to-register.md');
const REGISTER_PATH = path.join(ROOT, 'node_modules', 'fm-adt-toolkit', 'gaps', 'register.json');

// Gap ids for which the map is allowed to record "OPEN ITEM" instead of a real
// register pair, because no eligible (reported: false, no wontfix) attribute
// exists for that gap in the register today. See docs/inventory-to-register.md
// for the reasoning behind each one. Any other gap id must resolve to at least
// one real pair.
const DOCUMENTED_OPEN_ITEMS = new Set(['catalog-calculation-tokens']);

function parseInventoryGapIds(markdown) {
  const section = markdown.split('## Gap ids introduced')[1];
  assert.ok(section, 'inventory is missing its "## Gap ids introduced" section');
  const ids = [...section.matchAll(/^- `([a-z-]+)`/gm)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'no gap ids found in the "Gap ids introduced" section');
  return ids;
}

function parseInventoryGapIdsFromRows(markdown) {
  // Cross-check: every gap id named on a `| gap |` classified row must also be
  // introduced in the "Gap ids introduced" section, and vice versa.
  const ids = new Set();
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    // ['', Source, Datum, Classification, fm, Notes, '']
    if (cells.length >= 6 && cells[3] === 'gap') {
      ids.add(cells[4]);
    }
  }
  return ids;
}

function parseMap(markdown) {
  const rows = new Map();
  for (const line of markdown.split('\n')) {
    const m = line.match(/^\|\s*`([a-z-]+)`\s*\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*$/);
    if (!m) continue;
    const [, gapId, rowCount, cell] = m;
    rows.set(gapId, { rowCount: Number(rowCount), cell });
  }
  return rows;
}

function parsePairs(cell) {
  // Matches `entryId` / "attribute name" pairs anywhere in the cell's prose.
  const pairs = [];
  const re = /`([^`]+)`\s*\/\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(cell))) {
    pairs.push({ entryId: m[1], attrName: m[2] });
  }
  return pairs;
}

test('every inventory gap id is mapped, and every mapped pair is a real register gap', () => {
  const inventory = fs.readFileSync(INVENTORY_PATH, 'utf8');
  const mapMarkdown = fs.readFileSync(MAP_PATH, 'utf8');
  const register = loadRegister(REGISTER_PATH);
  const byId = new Map(register.map((e) => [e.id, e]));

  const gapIdsFromSection = parseInventoryGapIds(inventory);
  const gapIdsFromRows = parseInventoryGapIdsFromRows(inventory);
  assert.deepEqual(
    [...gapIdsFromRows].sort(),
    [...gapIdsFromSection].sort(),
    'the "Gap ids introduced" section and the gap-classified rows must name the same set of gap ids',
  );

  const map = parseMap(mapMarkdown);

  for (const gapId of gapIdsFromSection) {
    const row = map.get(gapId);
    assert.ok(row, `gap id ${gapId} is not mapped in docs/inventory-to-register.md`);

    if (row.cell.startsWith('OPEN ITEM')) {
      assert.ok(
        DOCUMENTED_OPEN_ITEMS.has(gapId),
        `${gapId} is recorded as an OPEN ITEM but is not one of the documented exceptions (${[...DOCUMENTED_OPEN_ITEMS].join(', ')})`,
      );
      continue;
    }

    const pairs = parsePairs(row.cell);
    assert.ok(pairs.length > 0, `gap id ${gapId} names no \`entry\` / "attribute" pairs`);

    for (const { entryId, attrName } of pairs) {
      const entry = byId.get(entryId);
      assert.ok(entry, `${gapId}: register has no entry with id "${entryId}"`);
      const attr = entry.attributes.find((a) => a.name === attrName);
      assert.ok(
        attr,
        `${gapId}: entry "${entryId}" has no attribute named "${attrName}"`,
      );
      assert.equal(
        attr.reported,
        false,
        `${gapId}: ${entryId} / "${attrName}" is reported: true in the register, so it is not a gap`,
      );
      assert.ok(
        !attr.wontfix,
        `${gapId}: ${entryId} / "${attrName}" carries a wontfix, so it is not a gap for Claris`,
      );
    }
  }

  // Every documented exception must actually appear as a gap id and actually be
  // recorded as OPEN ITEM -- catches a stale exception left in the allow-list
  // after the map is fixed to name a real pair.
  for (const gapId of DOCUMENTED_OPEN_ITEMS) {
    assert.ok(gapIdsFromSection.includes(gapId), `documented exception ${gapId} is not an inventory gap id`);
    assert.ok(map.get(gapId)?.cell.startsWith('OPEN ITEM'), `documented exception ${gapId} is not recorded as OPEN ITEM in the map`);
  }
});
