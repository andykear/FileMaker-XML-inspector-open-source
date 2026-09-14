# Plan 2: Coverage Register

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the toolkit's gap register into the per-kind coverage matrix of spec section 4: for every fm read op and object kind, every attribute the kind has (enumerated from the Save as XML export of Ooe), marked reported or missing with the fm key that carries it, with verbatim evidence stored once per probe, per-attribute outcomes from `fm-gaps check`, and a Claris report organised by kind.

**Architecture:** All work is in `fm-adt-toolkit`. A dependency-free XML walker parses the SaXML export (read only, outside the repo) and an enumerator writes one reference file per kind (attribute paths and counts, never values). A `draft` command reads one instance of the kind through fm, auto-matches SaXML paths to fm keys by normalised name, and writes a register entry a human then reviews. `check` runs every distinct probe once, selects the instance, evaluates each attribute, records evidence per probe, and reports still-missing, newly-reported, regressed, and unexplained keys. `report` renders the matrix for Claris. The mapping itself is knowledge work done kind group by kind group, each group a task.

**Tech Stack:** Node 22 (type stripping), TypeScript 5.9 erasable syntax, vitest 4, zero runtime dependencies. The SaXML export at `/Users/wdecorte/GitHub/fmai/Wugin/Plugin/saxml-working/` (FileMaker 26.0.2, exported 2026-08-30) is a golden master: read only, never copied whole into a repo.

**Spec:** `docs/superpowers/specs/2026-09-14-fm-cli-rewrite-design.md`, section 4 (binding) and section 5.

## Global Constraints

- Only read-only ops ever reach `fmnet://localhost/ooe`: `read:*`, `evaluate:calculation`, `validate:calculation`. `assertReadOnly` from `fm-adt-toolkit/read-only` guards every batch. Credentials: `--username=admin --keychain --no-prompt`; never `--password`.
- The SaXML export directory is read only. Nothing under `/Users/wdecorte/GitHub/fmai/Wugin/Plugin/saxml-working/` is ever written, moved, or renamed. What the toolkit commits from it is attribute names, paths, counts, element and object ids and object names: never field data, never calculation text, never the XML itself.
- Erasable TypeScript: no `enum`, `import type` for type-only imports, relative imports with `.ts`. Zero runtime dependencies. `npm test` = `vitest run && npm run lint && npm run lint:tests`.
- Evidence is verbatim and never trimmed. It is stored once per distinct probe op under `gaps/evidence/<fm version>/<probe-id>.ndjson` and referenced from entries.
- `check` never edits `attributes[].reported` or `fmKey`; humans do, after reading the evidence.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Work on toolkit `main` (the owner pushes and tags).

---

## File map (all in `/Users/wdecorte/GitHub/fm-adt-toolkit`)

| Path | Responsibility |
|---|---|
| `src/gaps/xml-walk.ts` | Dependency-free XML parser producing a tree of `{ tag, attrs, children, text }`; handles prolog, comments, CDATA, entities |
| `src/gaps/kinds.ts` | The kind table: for each subject, which SaXML catalog file and elements define it, which subtrees to skip, and how its fm probe and instance selector are formed |
| `src/gaps/enumerate.ts` | Walks the export and writes `gaps/reference/<label>/<kind-id>.json` (attribute paths, presence counts, instance ids) |
| `src/gaps/select.ts` | `selectInstance(result, selector)`: picks the instance of a kind inside an fm result (`contents.objects[id=21]` with recursive array search, `body[stepID=89]`) |
| `src/gaps/register.ts` | New entry shape (`SubjectEntry`, `Attribute`, `SubjectEvidence`), `loadRegister`, `saveRegister`, validation |
| `src/gaps/evidence.ts` | `probeId(op)`, `writeEvidence`, `readEvidence` |
| `src/gaps/match.ts` | `flattenKeys(instance, depth)`, `normaliseName`, `autoMatch(paths, keys)` |
| `src/gaps/draft.ts` | `draftEntry(reference, instance, kindRule)` |
| `src/gaps/check.ts` | `runChecks` rewritten: distinct probes, per-attribute outcomes, regressions, unexplained keys |
| `src/gaps/report.ts` | `renderReport` rewritten: per op, per kind, missing attributes with `knownFrom`, evidence inline |
| `src/gaps/index.ts`, `src/gaps/checks.ts` | `checks.ts` unchanged (browser-safe); index re-exports the new surface |
| `bin/fm-gaps.mjs` | Subcommands `enumerate`, `draft`, `check`, `report` |
| `gaps/reference/2026-08-30-fm26.0.2/*.json` | Committed reference per kind (names, paths, counts, ids) |
| `gaps/register.json` | The matrix, rebuilt by Tasks 7 to 13 |
| `gaps/evidence/0.6.0/*.ndjson` | Committed evidence per probe |
| `tests/fixtures/saxml-mini/` | A tiny synthetic split-catalog export (a few elements per catalog) for enumerator tests; written by hand, not copied from the golden master |
| `tests/helpers/fake-fm-cli.mjs` | Gains mode `fixture`: replies to every op with the JSON at `FAKE_FM_FIXTURE` |
| `README.md` | The `fm-gaps` workflow for a new fm build |

---

### Task 1: Dependency-free XML walker

**Files:**
- Create: `src/gaps/xml-walk.ts`, `tests/xml-walk.test.ts`

**Interfaces:**
- Produces:

```ts
export interface XmlNode { tag: string; attrs: Record<string, string>; children: XmlNode[]; text: string }
export function parseXml(text: string): XmlNode   // returns the document element
```

- [ ] **Step 1: Write the failing test**

`tests/xml-walk.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseXml } from '../src/gaps/xml-walk.ts';

const DOC = `<?xml version="1.0" encoding="UTF-8"?>
<!-- header comment -->
<FMSaveAsXML version="2.3.0.0" Source="26.0.2" File="Ooe.fmp12">
  <Structure>
    <LayoutCatalog>
      <Layout id="11" name="File &amp; Open" width="740">
        <Options/>
        <Part type="Body" kind="4"><Definition type="Body" size="450" Options="1024"/></Part>
        <Calculation><![CDATA[If ( 1 < 2 ; "a" ; "b" )]]></Calculation>
        <Text>plain &lt;text&gt; here</Text>
      </Layout>
    </LayoutCatalog>
  </Structure>
</FMSaveAsXML>`;

describe('parseXml', () => {
  it('builds the tree with attributes, CDATA, entities and self-closing tags', () => {
    const root = parseXml(DOC);
    expect(root.tag).toBe('FMSaveAsXML');
    expect(root.attrs.Source).toBe('26.0.2');
    const layout = root.children[0].children[0].children[0];
    expect(layout.tag).toBe('Layout');
    expect(layout.attrs.name).toBe('File & Open');
    expect(layout.children.map((c) => c.tag)).toEqual(['Options', 'Part', 'Calculation', 'Text']);
    expect(layout.children[1].children[0].attrs.Options).toBe('1024');
    expect(layout.children[2].text).toBe('If ( 1 < 2 ; "a" ; "b" )');
    expect(layout.children[3].text).toBe('plain <text> here');
  });
  it('rejects a document whose tags do not balance', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(/expected <\/b> but found <\/a>/);
  });
  it('parses a 5 MB document in bounded time', () => {
    const big = '<R>' + '<S id="1"><T x="y">t</T></S>'.repeat(120000) + '</R>';
    const t0 = Date.now();
    const r = parseXml(big);
    expect(r.children).toHaveLength(120000);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/xml-walk.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/gaps/xml-walk.ts`:

```ts
/** A small XML parser for FileMaker's Save as XML export. Node has no XML parser
 *  in core and the toolkit has no runtime dependencies, so this covers exactly
 *  what SaXML uses: a prolog, comments, elements with double-quoted attributes,
 *  self-closing tags, CDATA sections, text with the five predefined entities.
 *  It builds a tree; the largest catalog in the reference export is 5 MB, which
 *  fits comfortably. It is not a general XML parser: no DTD, no namespaces
 *  handling beyond keeping the prefix in the tag name, no processing instructions
 *  inside the body. */
export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return e in ENTITIES ? ENTITIES[e] : m;
  });
}

const ATTR = /([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseXml(text: string): XmlNode {
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  let i = 0;
  const n = text.length;
  const top = (): XmlNode => {
    if (stack.length === 0) throw new Error('text outside the document element');
    return stack[stack.length - 1];
  };
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt === -1) break;
    if (lt > i && stack.length) top().text += decode(text.slice(i, lt));
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end === -1) throw new Error('unterminated comment');
      i = end + 3; continue;
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      if (end === -1) throw new Error('unterminated CDATA');
      top().text += text.slice(lt + 9, end);
      i = end + 3; continue;
    }
    if (text.startsWith('<?', lt) || text.startsWith('<!', lt)) {
      const end = text.indexOf('>', lt);
      if (end === -1) throw new Error('unterminated declaration');
      i = end + 1; continue;
    }
    const gt = text.indexOf('>', lt);
    if (gt === -1) throw new Error('unterminated tag');
    const body = text.slice(lt + 1, gt);
    i = gt + 1;
    if (body[0] === '/') {
      const name = body.slice(1).trim();
      const node = stack.pop();
      if (!node) throw new Error(`unexpected </${name}>`);
      if (node.tag !== name) throw new Error(`expected </${node.tag}> but found </${name}>`);
      continue;
    }
    const selfClosing = body.endsWith('/');
    const head = selfClosing ? body.slice(0, -1) : body;
    const sp = head.search(/[\s]/);
    const tag = (sp === -1 ? head : head.slice(0, sp)).trim();
    const attrs: Record<string, string> = {};
    if (sp !== -1) {
      ATTR.lastIndex = 0;
      let m: RegExpExecArray | null;
      const rest = head.slice(sp);
      while ((m = ATTR.exec(rest)) !== null) attrs[m[1]] = decode(m[2] ?? m[3] ?? '');
    }
    const node: XmlNode = { tag, attrs, children: [], text: '' };
    if (stack.length) top().children.push(node); else root = node;
    if (!selfClosing) stack.push(node);
  }
  if (stack.length) throw new Error(`unclosed <${stack[stack.length - 1].tag}>`);
  if (!root) throw new Error('no document element');
  return root;
}
```

- [ ] **Step 4: Run the test, then the full suite**

Run: `npx vitest run tests/xml-walk.test.ts && npm test`
Expected: PASS; the big-document case well under a second.

- [ ] **Step 5: Prove it on the real export (read only, output discarded)**

```bash
node --input-type=module -e "
import { parseXml } from './src/gaps/xml-walk.ts';
import fs from 'node:fs';
const D = '/Users/wdecorte/GitHub/fmai/Wugin/Plugin/saxml-working/Ooe/';
for (const f of fs.readdirSync(D).filter((x) => x.endsWith('.xml'))) {
  const r = parseXml(fs.readFileSync(D + f, 'utf8'));
  let count = 0; const walk = (x) => { count++; x.children.forEach(walk); }; walk(r);
  console.log(f.padEnd(36), r.tag, r.attrs.Source, count);
}"
```
Expected: 19 lines, root `FMSaveAsXML 26.0.2`, element counts matching the survey (LayoutCatalog 9369, ScriptCatalog 62958). Paste the output in the report.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add a dependency-free XML walker for Save as XML exports

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Kind table and enumerator

**Files:**
- Create: `src/gaps/kinds.ts`, `src/gaps/enumerate.ts`, `tests/enumerate.test.ts`, `tests/fixtures/saxml-mini/Mini_LayoutCatalog.xml`, `Mini_FieldCatalog.xml`, `Mini_ScriptCatalog.xml`, `Mini_RelationshipCatalog.xml`

**Interfaces:**
- Produces:

```ts
// kinds.ts
export interface KindRule {
  id: string;                 // register id prefix, e.g. 'layout-object'
  op: string;                 // fm read op, or 'none'
  kind: string;               // 'layout' | 'part' | 'object' | 'field' | 'step' | ...; grouped kinds get ':<group>' appended by the enumerator
  file: string;               // catalog file suffix: 'LayoutCatalog'
  path: string[];             // element chain from the document element to the kind's elements, e.g. ['Structure','LayoutCatalog','Layout']; '*' matches any depth
  groupBy?: string;           // attribute whose value splits the kind into sub-kinds: 'type' for LayoutObject, 'datatype' for Field
  skip: string[];             // child tags whose subtrees are not attributes of this kind: ['PartsList'] for layout, ['LayoutObject'] for object and part, ['DDRREF'] for step
  idAttr?: string;            // attribute that identifies an instance: 'id'
  probe: (instance: ReferenceInstance) => { ops: AdtOp[]; select?: string };   // how to read this instance through fm
}
export const KINDS: KindRule[]
// enumerate.ts
export interface ReferenceInstance { id: string; name?: string; context: Record<string, string> }  // context: ancestor names, e.g. { layout: 'File Open', table: 'Contacts' }
export interface ReferenceAttribute { path: string; present: number }         // path: 'Bounds@top', 'Field/FieldReference@name', 'Options' (element with text)
export interface Reference { kindId: string; op: string; kind: string; file: string; exportLabel: string; source: string; instances: ReferenceInstance[]; attributes: ReferenceAttribute[] }
export function enumerateKind(root: XmlNode, rule: KindRule, exportLabel: string): Reference[]   // one per group when groupBy is set
export function enumerateExport(dir: string, filePrefix: string, exportLabel: string): Reference[]
export function writeReferences(outDir: string, refs: Reference[]): string[]   // file names written
```

- [ ] **Step 1: Write the mini fixture**

`tests/fixtures/saxml-mini/Mini_LayoutCatalog.xml` (hand-written, two layouts, three object types, a part):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<FMSaveAsXML version="2.3.0.0" Source="26.0.2" File="Mini.fmp12" UUID="00000000-0000-0000-0000-000000000000">
<Structure>
<LayoutCatalog>
<UUID>1</UUID>
<Layout id="11" name="Home" width="740">
  <TableOccurrenceReference id="1065089" name="T"/>
  <Options>0</Options>
  <PartsList>
    <Part type="Body" kind="4">
      <Definition type="Body" kind="4" size="450" absolute="0" Options="1024"/>
      <LayoutObject hash="A" id="21" type="Edit Box" name="" kind="1">
        <Bounds top="316" left="214" bottom="347" right="315"/>
        <Options><Locked>False</Locked></Options>
        <Field><FieldReference id="12" name="T::F"/></Field>
      </LayoutObject>
      <LayoutObject hash="B" id="22" type="Text" name="" kind="2">
        <Bounds top="10" left="10" bottom="20" right="200"/>
        <TextObj><Style/></TextObj>
      </LayoutObject>
      <LayoutObject hash="C" id="23" type="Group" name="g" kind="3">
        <Bounds top="1" left="1" bottom="2" right="2"/>
        <LayoutObject hash="D" id="24" type="Text" name="" kind="2"><Bounds top="1" left="1" bottom="2" right="2"/></LayoutObject>
      </LayoutObject>
    </Part>
  </PartsList>
</Layout>
<Layout id="12" name="List" width="740">
  <TableOccurrenceReference id="1065089" name="T"/>
  <PartsList><Part type="Header" kind="1"><Definition type="Header" kind="1" size="40" absolute="0" Options="0"/></Part></PartsList>
</Layout>
</LayoutCatalog>
</Structure>
</FMSaveAsXML>
```

`Mini_FieldCatalog.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<FMSaveAsXML version="2.3.0.0" Source="26.0.2" File="Mini.fmp12" UUID="0">
<Structure><FieldCatalog>
<BaseTable id="129" name="T">
  <Field id="6" name="F" fieldtype="Normal" datatype="Text" comment=""><UUID>x</UUID><Storage><Index>None</Index></Storage></Field>
  <Field id="7" name="C" fieldtype="Normal" datatype="Container" comment=""><Storage><Container external="True"/></Storage></Field>
</BaseTable>
</FieldCatalog></Structure>
</FMSaveAsXML>
```

`Mini_ScriptCatalog.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<FMSaveAsXML version="2.3.0.0" Source="26.0.2" File="Mini.fmp12" UUID="0">
<Structure><ScriptCatalog>
<Script id="16" name="S" isFolder="False">
  <UUID>y</UUID>
  <StepList>
    <Step hash="E" index="0" id="89" name="# (comment)" enable="True"><UUID>z</UUID><Options>4</Options><DDRREF><_ABC>ignored</_ABC></DDRREF><ParameterValues><Text>hi</Text></ParameterValues></Step>
    <Step hash="F" index="1" id="141" name="Set Variable" enable="True"><ParameterValues><Name>$x</Name><Calculation>1</Calculation></ParameterValues></Step>
  </StepList>
</Script>
</ScriptCatalog></Structure>
</FMSaveAsXML>
```

`Mini_RelationshipCatalog.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<FMSaveAsXML version="2.3.0.0" Source="26.0.2" File="Mini.fmp12" UUID="0">
<Structure><RelationshipCatalog>
<Relationship id="1"><UUID>r</UUID><LeftTable cascadeCreate="False" cascadeDelete="True" name="A"/><RightTable name="B"/><JoinPredicateList><JoinPredicate type="Equal"><LeftField name="ID"/><RightField name="ID_A"/></JoinPredicate></JoinPredicateList></Relationship>
</RelationshipCatalog></Structure>
</FMSaveAsXML>
```

Note: the real export's exact child element names differ in places from this fixture (it is a shape, not a copy); the enumerator is written against the rules, not the fixture, and Task 2 step 6 proves it on the real export.

- [ ] **Step 2: Write the failing test**

`tests/enumerate.test.ts`:

```ts
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { enumerateExport } from '../src/gaps/enumerate.ts';

const DIR = path.resolve(__dirname, 'fixtures/saxml-mini');

describe('enumerateExport', () => {
  const refs = enumerateExport(DIR, 'Mini', 'mini');
  const byKind = Object.fromEntries(refs.map((r) => [r.kindId, r]));

  it('emits one reference per kind and per group', () => {
    expect(Object.keys(byKind).sort()).toEqual([
      'field:container', 'field:text', 'layout', 'layout-object:edit-box', 'layout-object:group', 'layout-object:text',
      'part:body', 'part:header', 'relation', 'script', 'step:141', 'step:89',
    ]);
  });
  it('lists attribute paths relative to the kind element, with presence counts, skipping excluded subtrees', () => {
    const layout = byKind['layout'];
    expect(layout.instances).toHaveLength(2);
    expect(layout.attributes.map((a) => a.path)).toEqual(expect.arrayContaining(['@id', '@name', '@width', 'TableOccurrenceReference@id', 'TableOccurrenceReference@name', 'Options']));
    expect(layout.attributes.find((a) => a.path.startsWith('PartsList'))).toBeUndefined();
    expect(layout.attributes.find((a) => a.path === 'Options')!.present).toBe(1);
    const text = byKind['layout-object:text'];
    expect(text.instances.map((i) => i.id)).toEqual(['22', '24']);       // nested object counted under its own kind
    expect(text.instances[0].context).toEqual({ layout: 'Home', part: 'Body' });
    const group = byKind['layout-object:group'];
    expect(group.attributes.find((a) => a.path.startsWith('LayoutObject'))).toBeUndefined();
  });
  it('skips DDRREF and chunk elements under a step and records the step id as the group', () => {
    const step = byKind['step:89'];
    expect(step.kind).toBe('step:89');
    expect(step.instances[0].context).toEqual({ script: 'S', stepName: '# (comment)' });
    expect(step.attributes.map((a) => a.path)).toEqual(['@enable', '@hash', '@id', '@index', '@name', 'Options', 'ParameterValues/Text', 'UUID']);
  });
  it('groups fields by datatype', () => {
    expect(byKind['field:container'].instances[0].context).toEqual({ table: 'T' });
    expect(byKind['field:container'].attributes.map((a) => a.path)).toContain('Storage/Container@external');
  });
  it('never records attribute values or element text', () => {
    const json = JSON.stringify(refs);
    expect(json).not.toContain('T::F');
    expect(json).not.toContain('"hi"');
  });
});
```

- [ ] **Step 3: Run to verify failure, then implement `kinds.ts`**

`src/gaps/kinds.ts` (the table is the point; every rule is data):

```ts
import type { AdtOp } from '../types.ts';
import type { ReferenceInstance } from './enumerate.ts';

export interface KindRule {
  id: string;
  op: string;
  kind: string;
  file: string;
  path: string[];
  groupBy?: string;
  skip: string[];
  idAttr?: string;
  probe: (instance: ReferenceInstance) => { ops: AdtOp[]; select?: string };
}

/** Turn a SaXML group value into a stable id fragment: 'Edit Box' -> 'edit-box'. */
export function groupSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const layoutProbe = (i: ReferenceInstance) => ({ ops: [{ op: 'read:layout', name: i.context.layout ?? i.name ?? '', detail: true }] });

export const KINDS: KindRule[] = [
  { id: 'layout', op: 'read:layout', kind: 'layout', file: 'LayoutCatalog', path: ['Structure', 'LayoutCatalog', 'Layout'], skip: ['PartsList'], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:layout', name: i.name ?? '', detail: true }] }) },
  { id: 'part', op: 'read:layout', kind: 'part', file: 'LayoutCatalog', path: ['Structure', 'LayoutCatalog', 'Layout', 'PartsList', 'Part'], groupBy: 'type', skip: ['LayoutObject'],
    probe: (i) => ({ ...layoutProbe(i), select: 'contents.parts[type=' + (i.context.part ?? '') + ']' }) },
  { id: 'layout-object', op: 'read:layout', kind: 'object', file: 'LayoutCatalog', path: ['Structure', 'LayoutCatalog', 'Layout', 'PartsList', 'Part', '*', 'LayoutObject'], groupBy: 'type', skip: ['LayoutObject'], idAttr: 'id',
    probe: (i) => ({ ...layoutProbe(i), select: '**objects[id=' + i.id + ']' }) },
  { id: 'field', op: 'read:field', kind: 'field', file: 'FieldCatalog', path: ['Structure', 'FieldCatalog', 'BaseTable', 'Field'], groupBy: 'datatype', skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:field', table: i.context.table ?? '', name: i.name ?? '' }] }) },
  { id: 'table', op: 'read:table', kind: 'table', file: 'BaseTableCatalog', path: ['Structure', 'BaseTableCatalog', 'BaseTable'], skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:table', name: i.name ?? '' }] }) },
  { id: 'table-occurrence', op: 'read:tableOccurrence', kind: 'tableOccurrence', file: 'TableOccurrenceCatalog', path: ['Structure', 'TableOccurrenceCatalog', 'TableOccurrence'], skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:tableOccurrence', id: Number(i.id) }] }) },
  { id: 'relation', op: 'read:relation', kind: 'relation', file: 'RelationshipCatalog', path: ['Structure', 'RelationshipCatalog', 'Relationship'], skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:relation', id: Number(i.id) }] }) },
  { id: 'script', op: 'read:script', kind: 'script', file: 'ScriptCatalog', path: ['Structure', 'ScriptCatalog', 'Script'], skip: ['StepList'], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:script', id: Number(i.id) }] }) },
  { id: 'step', op: 'read:script', kind: 'step', file: 'ScriptCatalog', path: ['Structure', 'ScriptCatalog', 'Script', 'StepList', 'Step'], groupBy: 'id', skip: ['DDRREF'],
    probe: (i) => ({ ops: [{ op: 'read:script', id: Number(i.context.scriptId ?? 0) }], select: 'body[stepID=' + (i.context.stepId ?? '') + ']' }) },
  { id: 'value-list', op: 'read:valueList', kind: 'valueList', file: 'ValueListCatalog', path: ['Structure', 'ValueListCatalog', 'ValueList'], groupBy: 'Source@value', skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:valueList', id: Number(i.id) }] }) },
  { id: 'custom-function', op: 'read:customFunction', kind: 'customFunction', file: 'CustomFunctionsCatalog', path: ['Structure', 'CustomFunctionsCatalog', 'CustomFunction'], skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:customFunction', id: Number(i.id) }] }) },
  { id: 'account', op: 'read:account', kind: 'account', file: 'AccountsCatalog', path: ['Structure', 'AccountsCatalog', 'Account'], groupBy: 'type', skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:account', id: Number(i.id) }] }) },
  { id: 'privilege-set', op: 'read:privilegeSet', kind: 'privilegeSet', file: 'PrivilegeSetsCatalog', path: ['Structure', 'PrivilegeSetsCatalog', 'PrivilegeSet'], skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:privilegeSet', id: Number(i.id) }] }) },
  { id: 'extended-privilege', op: 'read:extendedPrivilege', kind: 'extendedPrivilege', file: 'ExtendedPrivilegesCatalog', path: ['Structure', 'ExtendedPrivilegesCatalog', 'ExtendedPrivilege'], skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:extendedPrivilege', id: Number(i.id) }] }) },
  { id: 'authorization', op: 'read:authorization', kind: 'authorization', file: 'FileAccessCatalog', path: ['Structure', 'FileAccessCatalog', '*', 'Authorization'], skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:authorization', id: Number(i.id) }] }) },
  { id: 'custom-menu', op: 'read:customMenu', kind: 'customMenu', file: 'CustomMenuCatalog', path: ['Structure', 'CustomMenuCatalog', 'CustomMenu'], skip: ['MenuItemList'], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:customMenu', id: Number(i.id) }] }) },
  { id: 'custom-menu-item', op: 'read:customMenu', kind: 'customMenuItem', file: 'CustomMenuCatalog', path: ['Structure', 'CustomMenuCatalog', 'CustomMenu', 'MenuItemList', 'MenuItem'], groupBy: 'type', skip: [],
    probe: (i) => ({ ops: [{ op: 'read:customMenu', id: Number(i.context.menuId ?? 0) }], select: 'items[index=' + (i.context.index ?? '0') + ']' }) },
  { id: 'custom-menu-set', op: 'read:customMenuSet', kind: 'customMenuSet', file: 'CustomMenuSetCatalog', path: ['Structure', 'CustomMenuSetCatalog', 'CustomMenuSet'], skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:customMenuSet', id: Number(i.id) }] }) },
  { id: 'external-data-source', op: 'read:externalDataSource', kind: 'externalDataSource', file: 'ExternalDataSourceCatalog', path: ['Structure', 'ExternalDataSourceCatalog', 'ExternalDataSource'], skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:externalDataSource', id: Number(i.id) }] }) },
  { id: 'base-directory', op: 'read:baseDirectory', kind: 'baseDirectory', file: 'BaseDirectoryCatalog', path: ['Structure', 'BaseDirectoryCatalog', 'BaseDirectory'], skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:baseDirectory', id: Number(i.id) }] }) },
  { id: 'persistent-store', op: 'read:persistentData', kind: 'persistentData', file: 'PersistentStoreCatalog', path: ['Structure', 'PersistentStoreCatalog', 'PersistentStore'], skip: [], idAttr: 'id',
    probe: (i) => ({ ops: [{ op: 'read:persistentData', id: Number(i.id) }] }) },
  { id: 'theme', op: 'none', kind: 'theme', file: 'ThemeCatalog', path: ['Structure', 'ThemeCatalog', 'Theme'], skip: ['CSS', 'Image'], idAttr: 'id',
    probe: () => ({ ops: [{ op: 'read:layout', name: 'File Open', detail: true }], select: 'theme' }) },
  { id: 'file-options', op: 'none', kind: 'fileOptions', file: 'Metadata', path: ['Metadata'], skip: [],
    probe: () => ({ ops: [{ op: 'read:file' }] }) },
];
```

Before writing the table, read (read only) the kind tables the fmai audit-toolkit already derived from the same export: `golden-shapes/<Catalog>/shape-index.json` keys, `fmadt/golden_construct.py` `_LO_TYPE` (26 SaXML `@type` values with their fm `type` and `control`) and `_LO_BY_KIND` (Panel kind 12 = tabPanel, 17 = slidePanel), and the ten Part types with kinds, all listed in the workspace file `fmai-knowledge.md`. Group fields by `datatype` AND `fieldtype` (`groupBy: 'datatype+fieldtype'`, the enumerator joins the two with `/`), since calculation and summary fields have their own option sets. Add to each layout-object reference the fm `type`/`control` pair from `_LO_TYPE` as `fmType` so `draft` can double-check the selected instance's type.

Two rules above have element paths guessed from the survey (`FileAccessCatalog/*/Authorization`, `Metadata`, `CustomMenu/MenuItemList/MenuItem`, `ValueList Source@value` as a group key). Task 2 step 6 corrects them against the real export; correcting a path in this table is expected, inventing a rule that does not match anything is not.

- [ ] **Step 4: Implement `enumerate.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { parseXml } from './xml-walk.ts';
import type { XmlNode } from './xml-walk.ts';
import { KINDS, groupSlug } from './kinds.ts';
import type { KindRule } from './kinds.ts';

export interface ReferenceInstance { id: string; name?: string; context: Record<string, string> }
export interface ReferenceAttribute { path: string; present: number }
export interface Reference {
  kindId: string; op: string; kind: string; file: string; exportLabel: string; source: string;
  instances: ReferenceInstance[]; attributes: ReferenceAttribute[];
}

const CHUNK = /^_[0-9A-Fa-f]{8}-/;   // DDR_INFO chunk elements are named after uuids; never attributes of anything

/** Find every element reached by `chain` from `root`. '*' matches any number of intermediate elements. */
export function findByChain(root: XmlNode, chain: string[]): { node: XmlNode; ancestors: XmlNode[] }[] {
  const out: { node: XmlNode; ancestors: XmlNode[] }[] = [];
  const walk = (node: XmlNode, i: number, ancestors: XmlNode[]) => {
    if (i === chain.length) { out.push({ node, ancestors }); return; }
    const want = chain[i];
    for (const c of node.children) {
      if (want === '*') {
        // '*' may match zero or more elements: try to match the next segment here, and also descend
        if (i + 1 < chain.length && c.tag === chain[i + 1]) walk(c, i + 2, [...ancestors, node]);
        walk(c, i, [...ancestors, node]);
      } else if (c.tag === want) {
        walk(c, i + 1, [...ancestors, node]);
      }
    }
  };
  walk(root, 0, []);
  return out;
}

/** Attribute paths of one instance: '@attr' on the element itself, 'Child@attr', 'Child/Grand@attr',
 *  and 'Child' for an element that carries text. Subtrees named in `skip` and chunk elements are not
 *  descended. Names only: no values are returned. */
export function attributePaths(node: XmlNode, skip: string[]): string[] {
  const out = new Set<string>();
  for (const a of Object.keys(node.attrs)) out.add('@' + a);
  const walk = (el: XmlNode, prefix: string) => {
    for (const c of el.children) {
      if (skip.includes(c.tag) || CHUNK.test(c.tag)) continue;
      const p = prefix ? prefix + '/' + c.tag : c.tag;
      if (c.text.trim() !== '' || c.children.length === 0) out.add(p);
      for (const a of Object.keys(c.attrs)) out.add(p + '@' + a);
      walk(c, p);
    }
  };
  walk(node, '');
  return [...out].sort();
}

function contextOf(rule: KindRule, ancestors: XmlNode[], node: XmlNode): Record<string, string> {
  const ctx: Record<string, string> = {};
  for (const a of ancestors) {
    if (a.tag === 'Layout') ctx.layout = a.attrs.name ?? '';
    if (a.tag === 'Part') ctx.part = a.attrs.type ?? '';
    if (a.tag === 'BaseTable') ctx.table = a.attrs.name ?? '';
    if (a.tag === 'Script') { ctx.script = a.attrs.name ?? ''; ctx.scriptId = a.attrs.id ?? ''; }
    if (a.tag === 'CustomMenu') ctx.menuId = a.attrs.id ?? '';
  }
  if (rule.kind === 'step') { ctx.stepName = node.attrs.name ?? ''; ctx.stepId = node.attrs.id ?? ''; ctx.index = node.attrs.index ?? ''; }
  if (rule.kind === 'customMenuItem') ctx.index = node.attrs.index ?? String(ancestors[ancestors.length - 1].children.indexOf(node));
  return ctx;
}

function groupValue(node: XmlNode, groupBy: string): string {
  const at = groupBy.indexOf('@');
  if (at > 0) {
    const child = node.children.find((c) => c.tag === groupBy.slice(0, at));
    return child?.attrs[groupBy.slice(at + 1)] ?? '';
  }
  return node.attrs[groupBy] ?? '';
}

export function enumerateKind(root: XmlNode, rule: KindRule, exportLabel: string): Reference[] {
  const hits = findByChain(root, rule.path);
  const groups = new Map<string, { node: XmlNode; ancestors: XmlNode[] }[]>();
  for (const h of hits) {
    const g = rule.groupBy ? groupValue(h.node, rule.groupBy) : '';
    groups.set(g, [...(groups.get(g) ?? []), h]);
  }
  const refs: Reference[] = [];
  for (const [g, list] of groups) {
    const kindId = rule.groupBy ? `${rule.id}:${groupSlug(g) || 'none'}` : rule.id;
    const kind = rule.groupBy ? `${rule.kind}:${g}` : rule.kind;
    const counts = new Map<string, number>();
    const instances: ReferenceInstance[] = [];
    for (const { node, ancestors } of list) {
      for (const p of attributePaths(node, rule.skip)) counts.set(p, (counts.get(p) ?? 0) + 1);
      instances.push({
        id: rule.idAttr ? node.attrs[rule.idAttr] ?? '' : String(instances.length),
        ...(node.attrs.name !== undefined ? { name: node.attrs.name } : {}),
        context: contextOf(rule, ancestors, node),
      });
    }
    refs.push({
      kindId, op: rule.op, kind, file: rule.file, exportLabel, source: root.attrs.Source ?? '',
      instances,
      attributes: [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([p, n]) => ({ path: p, present: n })),
    });
  }
  return refs;
}

export function enumerateExport(dir: string, filePrefix: string, exportLabel: string): Reference[] {
  const roots = new Map<string, XmlNode>();
  const rootFor = (file: string): XmlNode => {
    let r = roots.get(file);
    if (!r) { r = parseXml(fs.readFileSync(path.join(dir, `${filePrefix}_${file}.xml`), 'utf8')); roots.set(file, r); }
    return r;
  };
  const refs: Reference[] = [];
  for (const rule of KINDS) {
    const file = path.join(dir, `${filePrefix}_${rule.file}.xml`);
    if (!fs.existsSync(file)) continue;
    refs.push(...enumerateKind(rootFor(rule.file), rule, exportLabel));
  }
  return refs;
}

export function writeReferences(outDir: string, refs: Reference[]): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  for (const r of refs) {
    const f = path.join(outDir, r.kindId.replace(/[^a-z0-9:-]/gi, '-') + '.json');
    fs.writeFileSync(f, JSON.stringify(r, null, 2) + '\n');
    written.push(f);
  }
  return written;
}
```

- [ ] **Step 5: Run the test; iterate until it passes**

Run: `npx vitest run tests/enumerate.test.ts`
Expected: PASS. The fixture's element names are the ones the rules expect; if a rule's path does not hit the fixture, fix the rule or the fixture so both agree with the real export (Step 6 is the arbiter).

- [ ] **Step 6: Enumerate the real export and correct the rules (read only)**

```bash
node --input-type=module -e "
import { enumerateExport } from './src/gaps/enumerate.ts';
const refs = enumerateExport('/Users/wdecorte/GitHub/fmai/Wugin/Plugin/saxml-working/Ooe', 'Ooe', '2026-08-30-fm26.0.2');
for (const r of refs) console.log(r.kindId.padEnd(34), r.op.padEnd(24), String(r.instances.length).padStart(4), 'instances', String(r.attributes.length).padStart(4), 'attribute paths');
console.log(refs.length, 'kinds');"
```
Expected: about 26 layout-object kinds, 6 part kinds, 221 step kinds, field kinds per datatype, and one each for the rest. Any rule that produced zero kinds means its `path` is wrong: inspect the catalog with `node -e` and `parseXml` (print the child tags at each level), fix the rule, re-run. Record every corrected path in the report.

Then write the reference into the repo:

```bash
node --input-type=module -e "
import { enumerateExport, writeReferences } from './src/gaps/enumerate.ts';
const refs = enumerateExport('/Users/wdecorte/GitHub/fmai/Wugin/Plugin/saxml-working/Ooe', 'Ooe', '2026-08-30-fm26.0.2');
console.log(writeReferences('gaps/reference/2026-08-30-fm26.0.2', refs).length, 'files');"
grep -rl '::' gaps/reference | head   # must print nothing: no field data leaked
```

- [ ] **Step 7: Full suite, commit**

Run: `npm test`

```bash
git add -A && git commit -m "Add the kind table and the SaXML enumerator; commit the Ooe reference (names and counts only)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Instance selector, key flattening and auto-match

**Files:**
- Create: `src/gaps/select.ts`, `src/gaps/match.ts`, `tests/select.test.ts`, `tests/match.test.ts`

**Interfaces:**
- Produces:

```ts
export function selectInstance(result: unknown, selector: string | undefined): unknown   // undefined selector = the result itself; returns undefined when nothing matches
export function flattenKeys(value: unknown, depth?: number): string[]                    // dotted key paths of an object up to `depth` (default 3); arrays contribute '[]'
export function normaliseName(s: string): string                                          // 'Bounds@top' -> 'boundstop'; 'hideWhenPrinting' -> 'hidewhenprinting'
export function autoMatch(paths: string[], keys: string[]): Record<string, string | null>  // path -> matching key when exactly one key normalises equal to the path's last segment(s), else null
```

- [ ] **Step 1: Failing tests**

`tests/select.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectInstance } from '../src/gaps/select.ts';

const layout = { name: 'Home', theme: { name: 'Apex' }, contents: { objects: [
  { id: 21, type: 'field' },
  { id: 23, type: 'group', objects: [ { id: 24, type: 'label' } ] },
] } };
const script = { body: [ { stepID: 89, step: '#' }, { stepID: 141, step: 'Set Variable', name: '$x' } ] };

describe('selectInstance', () => {
  it('returns the result itself for an empty selector', () => { expect(selectInstance(layout, undefined)).toBe(layout); });
  it('walks dotted paths', () => { expect(selectInstance(layout, 'theme')).toEqual({ name: 'Apex' }); });
  it('filters arrays by key=value', () => { expect(selectInstance(script, 'body[stepID=141]')).toEqual(script.body[1]); });
  it('searches nested arrays of the same name with ** ', () => { expect(selectInstance(layout, '**objects[id=24]')).toEqual({ id: 24, type: 'label' }); });
  it('returns undefined when nothing matches', () => {
    expect(selectInstance(layout, 'contents.parts[type=Body]')).toBeUndefined();
    expect(selectInstance(layout, '**objects[id=99]')).toBeUndefined();
  });
});
```

`tests/match.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { flattenKeys, normaliseName, autoMatch } from '../src/gaps/match.ts';

describe('flattenKeys', () => {
  it('lists dotted key paths to a bounded depth', () => {
    const keys = flattenKeys({ id: 1, bounds: { left: 2, top: 3 }, scriptTriggers: [ { event: 'x' } ], deep: { a: { b: { c: 1 } } } });
    expect(keys).toEqual(expect.arrayContaining(['id', 'bounds', 'bounds.left', 'bounds.top', 'scriptTriggers', 'scriptTriggers[].event', 'deep.a.b']));
    expect(keys).not.toContain('deep.a.b.c');
  });
});
describe('autoMatch', () => {
  it('matches a SaXML path to exactly one fm key by normalised name', () => {
    const m = autoMatch(['Bounds@top', 'Options/HideWhenPrinting', '@name', 'Field/FieldReference@name'], ['bounds.top', 'hideWhenPrinting', 'name', 'field.name', 'locked']);
    expect(m['Bounds@top']).toBe('bounds.top');
    expect(m['Options/HideWhenPrinting']).toBe('hideWhenPrinting');
    expect(m['@name']).toBe('name');
    expect(m['Field/FieldReference@name']).toBe('field.name');
  });
  it('leaves ambiguous and unmatched paths null', () => {
    const m = autoMatch(['@id'], ['id', 'field.id']);
    expect(m['@id']).toBe('id');                                   // the shorter exact match wins over a nested one
    expect(autoMatch(['Options/Locked'], ['bounds.top'])['Options/Locked']).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

`src/gaps/select.ts`:

```ts
/** A selector is dotted path segments; a segment may be `name[key=value]` to pick one
 *  element of an array; a leading `**` on the first segment means "search every array
 *  of that name at any depth". Values compare as strings. */
export function selectInstance(result: unknown, selector: string | undefined): unknown {
  if (!selector) return result;
  const deep = selector.startsWith('**');
  const segs = (deep ? selector.slice(2) : selector).split('.').filter(Boolean);
  const step = (cur: unknown, seg: string): unknown => {
    const m = seg.match(/^([^[]+)(?:\[([^=\]]+)=([^\]]*)\])?$/);
    if (!m || cur === null || typeof cur !== 'object') return undefined;
    const v = (cur as Record<string, unknown>)[m[1]];
    if (m[2] === undefined) return v;
    if (!Array.isArray(v)) return undefined;
    return v.find((x) => x && typeof x === 'object' && String((x as Record<string, unknown>)[m[2]]) === m[3]);
  };
  if (!deep) return segs.reduce<unknown>((cur, seg) => step(cur, seg), result);
  const first = segs[0];
  const name = first.replace(/\[.*$/, '');
  const found: unknown[] = [];
  const walk = (cur: unknown) => {
    if (found.length || cur === null || typeof cur !== 'object') return;
    const r = step(cur, first);
    if (r !== undefined) { found.push(r); return; }
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v);
      if (found.length) return;
      void k;
    }
  };
  walk(result);
  void name;
  if (!found.length) return undefined;
  return segs.slice(1).reduce<unknown>((cur, seg) => step(cur, seg), found[0]);
}
```

`src/gaps/match.ts`:

```ts
export function flattenKeys(value: unknown, depth = 3): string[] {
  const out: string[] = [];
  const walk = (v: unknown, prefix: string, d: number) => {
    if (d === 0 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      const sample = v.find((x) => x && typeof x === 'object');
      if (sample) walk(sample, prefix + '[]', d);
      return;
    }
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const p = prefix ? `${prefix}.${k}` : k;
      out.push(p);
      walk(x, p, d - 1);
    }
  };
  walk(value, '', depth);
  return out;
}

export function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** For each SaXML path, the fm key whose normalised form equals the normalised path or
 *  the normalised tail of it (last element plus attribute, then attribute alone). One
 *  candidate wins; several candidates of equal length leave the path unmatched. */
export function autoMatch(paths: string[], keys: string[]): Record<string, string | null> {
  const byNorm = new Map<string, string[]>();
  for (const k of keys) {
    const nk = normaliseName(k.replace(/\[\]/g, ''));
    byNorm.set(nk, [...(byNorm.get(nk) ?? []), k]);
  }
  const pick = (cands: string[] | undefined): string | null => {
    if (!cands || cands.length === 0) return null;
    const shortest = Math.min(...cands.map((c) => c.split('.').length));
    const best = cands.filter((c) => c.split('.').length === shortest);
    return best.length === 1 ? best[0] : null;
  };
  const out: Record<string, string | null> = {};
  for (const p of paths) {
    const segs = p.split('/');
    const tail = segs[segs.length - 1];                 // 'FieldReference@name' or '@name' or 'Options'
    const tailNoAt = tail.replace('@', '');
    const attr = tail.includes('@') ? tail.slice(tail.indexOf('@') + 1) : '';
    const candidates = [normaliseName(p), normaliseName(segs.slice(-2).join('')), normaliseName(tailNoAt), attr ? normaliseName(attr) : ''].filter(Boolean);
    let match: string | null = null;
    for (const c of candidates) { match = pick(byNorm.get(c)); if (match) break; }
    out[p] = match;
  }
  return out;
}
```

- [ ] **Step 3: Run tests, commit**

Run: `npx vitest run tests/select.test.ts tests/match.test.ts && npm test`

```bash
git add -A && git commit -m "Add instance selector, key flattening and SaXML-to-fm auto-match

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Register shape, evidence store, check, report, bin

This task replaces the register model. The old `GapEntry` shape and the old `gaps/register.json` content go away; the 12 old entries are re-created by the mapping tasks in the new shape (their evidence lives in git history).

**Files:**
- Modify: `src/gaps/register.ts`, `src/gaps/check.ts`, `src/gaps/report.ts`, `src/gaps/index.ts`, `bin/fm-gaps.mjs`, `tests/gaps-register.test.ts`, `tests/gaps-check.test.ts`, `tests/gaps-report.test.ts`, `tests/helpers/fake-fm-cli.mjs`, `README.md`
- Create: `src/gaps/evidence.ts`, `src/gaps/draft.ts`, `tests/evidence.test.ts`, `tests/draft.test.ts`
- Replace: `gaps/register.json` with `[]`

**Interfaces:**
- Produces:

```ts
export interface Attribute {
  name: string;               // human name, defaults to the SaXML path until a human renames it
  path: string;               // SaXML path from the reference
  knownFrom: string;          // 'SaXML <file> <path>' by default; humans add 'Inspector > ...'
  fmKey: string | null;       // dotted key on the selected instance
  reported: boolean;
  wontfix?: string;           // reason this attribute is not expected from fm (export artifact, deprecated, ...)
}
export interface SubjectEvidence {
  version: string; build: string; date: string;
  command: string;
  batch: { size: number; position: number };
  evidence: string;                                  // relative path of the evidence file
  attributes: Record<string, 'reported' | 'absent' | 'error'>;
  unexplainedKeys: string[];                         // keys on the instance no attribute claims and not in ignoreKeys
  reason?: string;                                   // set when the probe or the selector failed
}
export interface SubjectEntry {
  id: string; op: string; kind: string;
  probe: { ops: AdtOp[]; select?: string };
  attributes: Attribute[];
  ignoreKeys?: string[];                             // instance keys reviewed and declared not attributes (e.g. 'kind', 'id')
  firstSeen: string;
  reportedToClaris: string | null;
  lastChecked: SubjectEvidence | null;
  blocks: Array<{ app: string; feature: string; attribute: string; where?: string }>;
}
export function loadRegister(path: string): SubjectEntry[]     // refuses duplicate ids, non-read-only probe, duplicate attribute names, blocks naming unknown attributes
export function saveRegister(path: string, entries: SubjectEntry[]): void
// evidence.ts
export function probeId(op: AdtOp): string                       // first 8 hex of sha1 over canonical JSON (sorted keys)
export function writeEvidence(root: string, version: string, op: AdtOp, data: { command: string; batch: {size:number; position:number}; stdout: unknown[]; stderr: unknown[]; exitCode: number }): string   // returns relative path 'gaps/evidence/<version>/<id>.ndjson'
export function readEvidence(root: string, rel: string): { meta: Record<string, unknown>; stdout: unknown[]; stderr: unknown[] }
// check.ts
export function runChecks(entries: SubjectEntry[], run: (ops: AdtOp[]) => Promise<AdtRunResult>, meta: { version: string; build: string; date: string; root: string; commandFor: (argv: string[]) => string }): Promise<CheckOutcome>
export interface CheckOutcome { entries: SubjectEntry[]; stillMissing: Array<{ entry: SubjectEntry; attribute: Attribute }>; newlyReported: Array<{ entry: SubjectEntry; attribute: Attribute }>; regressed: Array<{ entry: SubjectEntry; attribute: Attribute }>; unexplained: Array<{ entry: SubjectEntry; keys: string[] }>; errored: SubjectEntry[]; fatal?: AdtFatal }
// draft.ts
export function draftEntry(reference: Reference, instance: ReferenceInstance, probe: { ops: AdtOp[]; select?: string }, fmInstance: unknown, firstSeen: string): SubjectEntry
// report.ts
export function renderReport(entries: SubjectEntry[], root: string): string
```

- [ ] **Step 1: Failing tests for the register and the evidence store**

Replace `tests/gaps-register.test.ts` with tests that: (a) load a valid one-entry register (an attribute with fmKey and one without); (b) refuse duplicate ids; (c) refuse a two-op probe and a `create:` probe; (d) refuse two attributes with the same name; (e) refuse a `blocks` row naming an attribute the entry does not have; (f) save and reload byte-stable with 2-space JSON and one trailing newline.

`tests/evidence.test.ts`:

```ts
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { probeId, writeEvidence, readEvidence } from '../src/gaps/evidence.ts';

describe('evidence store', () => {
  it('derives a stable id from the op regardless of key order', () => {
    expect(probeId({ op: 'read:layout', name: 'File Open', detail: true })).toBe(probeId({ detail: true, name: 'File Open', op: 'read:layout' }));
    expect(probeId({ op: 'read:layout', name: 'File Open', detail: true })).toMatch(/^[0-9a-f]{8}$/);
    expect(probeId({ op: 'read:layout', name: 'Other', detail: true })).not.toBe(probeId({ op: 'read:layout', name: 'File Open', detail: true }));
  });
  it('writes one NDJSON file per probe and reads it back verbatim', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-gaps-ev-'));
    const op = { op: 'read:table' };
    const rel = writeEvidence(root, '0.6.0', op, { command: 'fm --file=x', batch: { size: 3, position: 1 }, stdout: [{ op: 'read:table', status: 'ok', result: { kind: 'table' } }], stderr: [{ type: 'summary', total: 3 }], exitCode: 0 });
    expect(rel).toBe(`gaps/evidence/0.6.0/${probeId(op)}.ndjson`);
    const lines = fs.readFileSync(path.join(root, rel), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ type: 'meta', command: 'fm --file=x', version: '0.6.0', exitCode: 0, op });
    expect(lines[1]).toEqual({ type: 'stdout', line: { op: 'read:table', status: 'ok', result: { kind: 'table' } } });
    expect(lines[2]).toEqual({ type: 'stderr', line: { type: 'summary', total: 3 } });
    const back = readEvidence(root, rel);
    expect(back.stdout).toHaveLength(1); expect(back.stderr).toHaveLength(1);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Implement `register.ts` and `evidence.ts`**

`src/gaps/register.ts`: replace the file. Keep `import { isReadOnlyOp }`; define `Attribute`, `SubjectEvidence`, `SubjectEntry` exactly as the Interfaces block; `loadRegister` validates: unique `id`; `probe.ops.length === 1` and `isReadOnlyOp`; unique `attributes[].name`; every `blocks[].attribute` names an existing attribute. `saveRegister` unchanged.

`src/gaps/evidence.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AdtOp } from '../types.ts';

function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(v);
}

export function probeId(op: AdtOp): string {
  return createHash('sha1').update(canonical(op)).digest('hex').slice(0, 8);
}

export function evidencePath(version: string, op: AdtOp): string {
  return path.posix.join('gaps', 'evidence', version, probeId(op) + '.ndjson');
}

/** One file per probe per fm version: a meta line, then every stdout line, then every
 *  stderr line, all verbatim. Overwritten on every check of that version. */
export function writeEvidence(
  root: string, version: string, op: AdtOp,
  data: { command: string; batch: { size: number; position: number }; stdout: unknown[]; stderr: unknown[]; exitCode: number; build?: string; date?: string },
): string {
  const rel = evidencePath(version, op);
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const lines = [
    JSON.stringify({ type: 'meta', op, version, build: data.build ?? '', date: data.date ?? '', command: data.command, batch: data.batch, exitCode: data.exitCode }),
    ...data.stdout.map((line) => JSON.stringify({ type: 'stdout', line })),
    ...data.stderr.map((line) => JSON.stringify({ type: 'stderr', line })),
  ];
  fs.writeFileSync(abs, lines.join('\n') + '\n');
  return rel;
}

export function readEvidence(root: string, rel: string): { meta: Record<string, unknown>; stdout: unknown[]; stderr: unknown[] } {
  const lines = fs.readFileSync(path.join(root, rel), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { type: string; line?: unknown } & Record<string, unknown>);
  const meta = lines.find((l) => l.type === 'meta') ?? {};
  return { meta, stdout: lines.filter((l) => l.type === 'stdout').map((l) => l.line), stderr: lines.filter((l) => l.type === 'stderr').map((l) => l.line) };
}
```

- [ ] **Step 3: Failing test for `runChecks`, then implement `check.ts`**

Replace `tests/gaps-check.test.ts` with:

```ts
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { runChecks } from '../src/gaps/check.ts';
import type { SubjectEntry } from '../src/gaps/register.ts';
import type { AdtOp, AdtRunResult } from '../src/types.ts';

const probe = { ops: [{ op: 'read:layout', name: 'Home', detail: true }] as AdtOp[], select: '**objects[id=21]' };
const entry = (id: string, attrs: SubjectEntry['attributes'], extra: Partial<SubjectEntry> = {}): SubjectEntry => ({
  id, op: 'read:layout', kind: 'object:Edit Box', probe, attributes: attrs, firstSeen: '0.6.0', reportedToClaris: null, lastChecked: null, blocks: [], ...extra,
});
const layoutResult = { op: 'read:layout', status: 'ok', result: { name: 'Home', contents: { objects: [ { id: 21, type: 'field', bounds: { top: 1 }, locked: false, newThing: 1 } ] } } };
const run = (results: unknown[]) => async (ops: AdtOp[]): Promise<AdtRunResult> => ({
  ok: true, exitCode: 0, results: results as AdtRunResult['results'], summary: { total: ops.length, ok: ops.length, errors: 0, dryRun: false, rolledBack: false }, notices: [],
  stdout: results.map((r) => JSON.stringify(r)).join('\n') + '\n', stderr: '{"type":"summary","total":1,"ok":1,"errors":0,"dryRun":false,"rolledBack":false}\n', argv: ['--file=x', '--out=/tmp/o', '/tmp/i'],
});
const meta = (root: string) => ({ version: '0.6.0', build: '1', date: '2026-09-14', root, commandFor: (a: string[]) => 'fm ' + a.join(' ') });

describe('runChecks', () => {
  it('runs each distinct probe once, evaluates every attribute, records evidence per probe, and finds unexplained keys', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-gaps-chk-'));
    const seen: AdtOp[][] = [];
    const r = async (ops: AdtOp[]) => { seen.push(ops); return run([layoutResult])(ops); };
    const a = entry('a', [
      { name: 'top', path: 'Bounds@top', knownFrom: 'SaXML', fmKey: 'bounds.top', reported: true },
      { name: 'locked', path: 'Options/Locked', knownFrom: 'SaXML', fmKey: 'locked', reported: false },   // marked missing but fm reports it -> newly reported
      { name: 'cond', path: 'ConditionalFormatting', knownFrom: 'SaXML', fmKey: null, reported: false },
      { name: 'gone', path: 'X', knownFrom: 'SaXML', fmKey: 'vanished', reported: true },                   // marked reported but absent -> regressed
    ], { ignoreKeys: ['id', 'type'] });
    const b = entry('b', [{ name: 'top', path: 'Bounds@top', knownFrom: 'SaXML', fmKey: 'bounds.top', reported: true }]);   // same probe as a
    const out = await runChecks([a, b], r, meta(root));
    expect(seen).toHaveLength(1); expect(seen[0]).toHaveLength(1);                     // one distinct probe, run once
    const ea = out.entries[0].lastChecked!;
    expect(ea.attributes).toEqual({ top: 'reported', locked: 'reported', cond: 'absent', gone: 'absent' });
    expect(ea.unexplainedKeys).toEqual(['newThing']);                                   // bounds.top, locked claimed; id, type ignored; 'bounds' parent implied
    expect(ea.evidence).toMatch(/^gaps\/evidence\/0\.6\.0\/[0-9a-f]{8}\.ndjson$/);
    expect(fs.existsSync(path.join(root, ea.evidence))).toBe(true);
    expect(out.entries[1].lastChecked!.evidence).toBe(ea.evidence);
    expect(out.newlyReported.map((x) => x.attribute.name)).toEqual(['locked']);
    expect(out.regressed.map((x) => x.attribute.name)).toEqual(['gone']);
    expect(out.stillMissing.map((x) => x.attribute.name)).toEqual(['cond']);
    expect(out.unexplained).toEqual([{ entry: out.entries[0], keys: ['newThing'] }]);
    expect(out.entries[0].attributes[1].reported).toBe(false);                          // never edited by the checker
    fs.rmSync(root, { recursive: true, force: true });
  });
  it('marks an entry errored when its probe has no result or the selector finds nothing, and surfaces a fatal', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-gaps-chk-'));
    const a = entry('a', [{ name: 'top', path: 'Bounds@top', knownFrom: 'SaXML', fmKey: 'bounds.top', reported: true }], { probe: { ops: probe.ops, select: '**objects[id=99]' } });
    const out = await runChecks([a], run([layoutResult]), meta(root));
    expect(out.errored.map((e) => e.id)).toEqual(['a']);
    expect(out.entries[0].lastChecked!.reason).toMatch(/selector .* matched nothing/);
    expect(out.entries[0].lastChecked!.attributes).toEqual({ top: 'error' });
    const fatalRun = async (): Promise<AdtRunResult> => ({ ok: false, exitCode: 2, results: [], summary: null, notices: [], stdout: '', stderr: '{"type":"fatal","error":{"code":"open_failed","message":"no"}}\n', fatal: { code: 'open_failed', message: 'no' }, argv: ['--file=x'] });
    const out2 = await runChecks([a], fatalRun, meta(root));
    expect(out2.fatal?.code).toBe('open_failed');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
```

`src/gaps/check.ts` (replace):

```ts
import type { AdtFatal, AdtOp, AdtRunResult } from '../types.ts';
import { selectInstance } from './select.ts';
import { flattenKeys } from './match.ts';
import { probeId, writeEvidence } from './evidence.ts';
import type { Attribute, SubjectEntry, SubjectEvidence } from './register.ts';

export interface CheckOutcome {
  entries: SubjectEntry[];
  stillMissing: Array<{ entry: SubjectEntry; attribute: Attribute }>;
  newlyReported: Array<{ entry: SubjectEntry; attribute: Attribute }>;
  regressed: Array<{ entry: SubjectEntry; attribute: Attribute }>;
  unexplained: Array<{ entry: SubjectEntry; keys: string[] }>;
  errored: SubjectEntry[];
  fatal?: AdtFatal;
}

function parseLines(text: string): unknown[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { unparseable: l }; } });
}

function hasKey(instance: unknown, key: string): boolean {
  let cur: unknown = instance;
  for (const part of key.split('.')) {
    if (part.endsWith('[]')) {
      const v = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[part.slice(0, -2)] : undefined;
      if (!Array.isArray(v)) return false;
      cur = v.find((x) => x && typeof x === 'object');
      if (cur === undefined) return false;
      continue;
    }
    if (cur === null || typeof cur !== 'object' || !(part in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return true;
}

/** Every DISTINCT probe op runs once, in one fm invocation. Each entry's instance is
 *  selected from its probe's result; every attribute is evaluated by its fmKey. The
 *  checker never edits `reported` or `fmKey`; it reports what it saw. */
export async function runChecks(
  entries: SubjectEntry[],
  run: (ops: AdtOp[]) => Promise<AdtRunResult>,
  meta: { version: string; build: string; date: string; root: string; commandFor: (argv: string[]) => string },
): Promise<CheckOutcome> {
  const distinct = new Map<string, AdtOp>();
  for (const e of entries) { const op = e.probe.ops[0]; distinct.set(probeId(op), op); }
  const ids = [...distinct.keys()];
  const ops = ids.map((id) => distinct.get(id)!);
  const result = await run(ops);
  const stderrLines = parseLines(result.stderr);
  const command = meta.commandFor(result.argv);
  const out: CheckOutcome = { entries: [], stillMissing: [], newlyReported: [], regressed: [], unexplained: [], errored: [], ...(result.fatal ? { fatal: result.fatal } : {}) };
  if (result.fatal) { out.entries = entries; return out; }

  const evidenceFor = new Map<string, string>();
  ids.forEach((id, i) => {
    const line = result.results[i];
    evidenceFor.set(id, writeEvidence(meta.root, meta.version, ops[i], {
      command, batch: { size: ops.length, position: i }, build: meta.build, date: meta.date,
      stdout: line ? [line] : [], stderr: stderrLines, exitCode: result.exitCode,
    }));
  });

  out.entries = entries.map((entry) => {
    const id = probeId(entry.probe.ops[0]);
    const pos = ids.indexOf(id);
    const line = result.results[pos];
    const evidence = evidenceFor.get(id)!;
    const base = { version: meta.version, build: meta.build, date: meta.date, command, batch: { size: ops.length, position: pos }, evidence };
    let reason: string | undefined;
    let instance: unknown;
    if (!line) reason = `no result line for probe at position ${pos}`;
    else if (line.op !== entry.probe.ops[0].op) reason = `result op ${line.op} does not match probe op ${entry.probe.ops[0].op} at position ${pos}`;
    else if (line.status !== 'ok') reason = `probe refused: ${line.error?.code ?? line.status}`;
    else { instance = selectInstance(line.result, entry.probe.select); if (instance === undefined) reason = `selector ${entry.probe.select ?? '(root)'} matched nothing`; }
    const attributes: SubjectEvidence['attributes'] = {};
    let unexplainedKeys: string[] = [];
    if (reason) {
      for (const a of entry.attributes) attributes[a.name] = 'error';
      out.errored.push({ ...entry, lastChecked: { ...base, attributes, unexplainedKeys, reason } });
    } else {
      const claimed = new Set<string>();
      for (const a of entry.attributes) {
        if (a.fmKey) { claimed.add(a.fmKey); for (const p of a.fmKey.split('.').map((_, i, arr) => arr.slice(0, i + 1).join('.'))) claimed.add(p.replace(/\[\]$/, '')); }
        const seen = a.fmKey ? hasKey(instance, a.fmKey) : false;
        attributes[a.name] = seen ? 'reported' : 'absent';
        if (seen && !a.reported && !a.wontfix) out.newlyReported.push({ entry, attribute: a });
        if (!seen && a.reported) out.regressed.push({ entry, attribute: a });
        if (!seen && !a.reported && !a.wontfix) out.stillMissing.push({ entry, attribute: a });
      }
      const ignore = new Set(entry.ignoreKeys ?? []);
      unexplainedKeys = flattenKeys(instance).filter((k) => !claimed.has(k) && !claimed.has(k.replace(/\[\]/g, '')) && !ignore.has(k) && !k.includes('.') );
      if (unexplainedKeys.length) out.unexplained.push({ entry, keys: unexplainedKeys });
    }
    return { ...entry, lastChecked: { ...base, attributes, unexplainedKeys, ...(reason ? { reason } : {}) } };
  });
  // the errored list must carry the updated entries
  out.errored = out.entries.filter((e) => e.lastChecked?.reason);
  out.unexplained = out.unexplained.map((u) => ({ entry: out.entries.find((e) => e.id === u.entry.id)!, keys: u.keys }));
  return out;
}
```

Note the unexplained-key rule: only top-level keys of the instance count (nested keys under a claimed parent are that attribute's business), a claimed `fmKey` claims all its parents, and `ignoreKeys` silences reviewed ones. Adjust the test's `'bounds'` expectation if the implementation and this rule disagree; the rule wins.

- [ ] **Step 4: Failing test for the report, then implement `report.ts`**

Replace `tests/gaps-report.test.ts`: build one entry with three attributes (one reported, one absent with `knownFrom`, one `wontfix`) whose `lastChecked.evidence` points at a file the test writes with `writeEvidence` in a temp root; assert the Markdown has `## read:layout`, `### object:Edit Box`, a "Not reported" table listing only the absent attribute with its `knownFrom` and path, a compact "Reported" line naming the reported one, no mention of the wontfix one under "Not reported", the probe op, and the verbatim stdout line from the evidence file.

`src/gaps/report.ts` (replace):

```ts
import { readEvidence } from './evidence.ts';
import type { SubjectEntry } from './register.ts';

/** Markdown for Claris, per read op and kind: what the object has that the op does not
 *  report, each with where it is known from, then the op's actual response for that
 *  instance, verbatim from the evidence file. */
export function renderReport(entries: SubjectEntry[], root: string): string {
  const byOp = new Map<string, SubjectEntry[]>();
  for (const e of entries) byOp.set(e.op, [...(byOp.get(e.op) ?? []), e]);
  const out: string[] = ['# fm CLI coverage: what each read op does not report', ''];
  const checked = entries.find((e) => e.lastChecked)?.lastChecked;
  if (checked) out.push(`Checked against fm ${checked.version} (${checked.build}) on ${checked.date}. Reference: the Save as XML export of the Ooe solution.`, '');
  const missingTotal = entries.reduce((n, e) => n + e.attributes.filter((a) => !a.reported && !a.wontfix).length, 0);
  out.push(`${entries.length} kinds, ${missingTotal} attributes not reported.`, '');
  for (const [op, list] of [...byOp.entries()].sort()) {
    out.push(`## ${op === 'none' ? 'No read op exists' : op}`, '');
    for (const e of list.sort((a, b) => a.kind.localeCompare(b.kind))) {
      const missing = e.attributes.filter((a) => !a.reported && !a.wontfix);
      const reported = e.attributes.filter((a) => a.reported);
      out.push(`### ${e.kind}`, '', `Register id: \`${e.id}\`. Probe: \`${JSON.stringify(e.probe.ops[0])}\`${e.probe.select ? ` selecting \`${e.probe.select}\`` : ''}.`, '');
      if (missing.length) {
        out.push('**Not reported**', '', '| Attribute | Known from | SaXML path |', '|---|---|---|');
        for (const a of missing) out.push(`| ${a.name} | ${a.knownFrom} | \`${a.path}\` |`);
        out.push('');
      } else out.push('Every known attribute is reported.', '');
      if (reported.length) out.push(`Reported (${reported.length}): ${reported.map((a) => `\`${a.fmKey}\``).join(', ')}.`, '');
      if (e.lastChecked) {
        const c = e.lastChecked;
        out.push(`Last checked fm ${c.version} (${c.build}) on ${c.date}; probe ${c.batch.position + 1} of ${c.batch.size} in one invocation.`, '');
        out.push('Command:', '', '```', c.command, '```', '');
        try {
          const ev = readEvidence(root, c.evidence);
          out.push(`Response (stdout, then stderr; exit ${String(ev.meta.exitCode)}):`, '', '```json',
            ...ev.stdout.map((l) => JSON.stringify(l, null, 1)), ...ev.stderr.map((l) => JSON.stringify(l, null, 1)), '```', '');
        } catch { out.push(`Evidence file ${c.evidence} is missing.`, ''); }
        if (c.reason) out.push(`Check note: ${c.reason}`, '');
      } else out.push('Not yet checked.', '');
    }
  }
  return out.join('\n');
}
```

- [ ] **Step 5: `draft.ts` and its test**

`tests/draft.test.ts`: given a `Reference` for kind `object:Edit Box` with paths `['@id','@name','Bounds@top','Options/Locked','ConditionalFormatting/Style']`, an instance `{ id: 21, name: '', bounds: { top: 1 }, locked: false, kind: 1 }`, and a probe, `draftEntry` returns an entry whose attributes are, in path order: `@id` → fmKey `id` reported; `@name` → `name` reported; `Bounds@top` → `bounds.top` reported; `Options/Locked` → `locked` reported; `ConditionalFormatting/Style` → null, not reported; `knownFrom` = `SaXML LayoutCatalog <path>`; `name` = a readable form (`id`, `name`, `Bounds top`, `Options Locked`, `ConditionalFormatting Style`); `ignoreKeys` = `[]`; `firstSeen` as given; `id` = `${reference.kindId}`.

`src/gaps/draft.ts`:

```ts
import type { AdtOp } from '../types.ts';
import type { Reference, ReferenceInstance } from './enumerate.ts';
import { autoMatch, flattenKeys } from './match.ts';
import type { SubjectEntry } from './register.ts';

function readable(path: string): string {
  return path.replace(/^@/, '').replace(/[/@]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A first draft of a subject entry: every reference path becomes an attribute, matched to
 *  the fm instance's keys by name where the name is unambiguous. Everything unmatched is
 *  `reported: false` with `fmKey: null` until a human either names the key or confirms
 *  the absence. `name` starts as a readable form of the path and is meant to be edited. */
export function draftEntry(reference: Reference, instance: ReferenceInstance, probe: { ops: AdtOp[]; select?: string }, fmInstance: unknown, firstSeen: string): SubjectEntry {
  const paths = reference.attributes.map((a) => a.path);
  const matches = autoMatch(paths, flattenKeys(fmInstance));
  void instance;
  return {
    id: reference.kindId,
    op: reference.op,
    kind: reference.kind,
    probe,
    attributes: paths.map((p) => ({
      name: readable(p), path: p, knownFrom: `SaXML ${reference.file} ${p}`, fmKey: matches[p], reported: matches[p] !== null,
    })),
    ignoreKeys: [],
    firstSeen,
    reportedToClaris: null,
    lastChecked: null,
    blocks: [],
  };
}
```

- [ ] **Step 6: Index, bin, fake CLI, README, empty register**

`src/gaps/index.ts`:

```ts
export { evaluateCheck } from './checks.ts';
export type { GapCheck } from './checks.ts';
export { loadRegister, saveRegister } from './register.ts';
export type { Attribute, SubjectEntry, SubjectEvidence } from './register.ts';
export { runChecks } from './check.ts';
export type { CheckOutcome } from './check.ts';
export { renderReport } from './report.ts';
export { probeId, writeEvidence, readEvidence, evidencePath } from './evidence.ts';
export { selectInstance } from './select.ts';
export { flattenKeys, normaliseName, autoMatch } from './match.ts';
export { enumerateExport, enumerateKind, writeReferences, attributePaths, findByChain } from './enumerate.ts';
export type { Reference, ReferenceAttribute, ReferenceInstance } from './enumerate.ts';
export { KINDS, groupSlug } from './kinds.ts';
export type { KindRule } from './kinds.ts';
export { draftEntry } from './draft.ts';
```

`bin/fm-gaps.mjs` (replace; four subcommands):

```js
#!/usr/bin/env node
/** fm-gaps enumerate --saxml=<dir> --prefix=<FileName> --label=<export label> [--out=<dir>]
 *  fm-gaps draft --kind=<kind-id>[,<kind-id>...] --file=<target> --username=<account> [--reference=<dir>] [--register=<path>]
 *  fm-gaps check --file=<target> --username=<account> [--register=<path>]
 *  fm-gaps report [--register=<path>] [--out=<path>]
 *
 *  enumerate reads a Save as XML export (never writes to it) and writes one reference
 *  file per kind: attribute paths and counts, no values. draft reads one instance of each
 *  named kind through fm and writes a first-draft entry into the register for a human to
 *  review (an existing entry with that id is left alone). check runs every distinct probe
 *  once and records evidence and per-attribute outcomes; it never edits reported/fmKey.
 *  report renders the matrix for Claris. Every fm batch passes assertReadOnly. */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { locateFmCli, runOps } from '../dist/runner/index.js';
import { assertReadOnly } from '../dist/read-only.js';
import { loadRegister, saveRegister, runChecks, renderReport, enumerateExport, writeReferences, KINDS, draftEntry, selectInstance } from '../dist/gaps/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cmd = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const str = (k) => (typeof args[k] === 'string' && args[k] !== '' ? args[k] : null);
const registerPath = str('register') ? path.resolve(str('register')) : path.join(ROOT, 'gaps', 'register.json');
const USAGE = [
  'usage: fm-gaps enumerate --saxml=<dir> --prefix=<FileName> --label=<export label> [--out=<dir>]',
  '       fm-gaps draft --kind=<kind-id>[,<kind-id>...] --file=<target> --username=<account> [--reference=<dir>] [--register=<path>]',
  '       fm-gaps check --file=<target> --username=<account> [--register=<path>]',
  '       fm-gaps report [--register=<path>] [--out=<path>]',
].join('\n');
const usage = () => { console.error(USAGE); process.exit(2); };

if (cmd === 'enumerate') {
  if (!str('saxml') || !str('prefix') || !str('label')) usage();
  const refs = enumerateExport(path.resolve(str('saxml')), str('prefix'), str('label'));
  const out = str('out') ? path.resolve(str('out')) : path.join(ROOT, 'gaps', 'reference', str('label'));
  const files = writeReferences(out, refs);
  for (const r of refs) console.log(r.kindId.padEnd(36), String(r.instances.length).padStart(4), 'instances', String(r.attributes.length).padStart(4), 'paths');
  console.log(`${files.length} reference files written under ${path.relative(process.cwd(), out)}`);
  process.exit(0);
}
if (cmd === 'report') {
  const md = renderReport(loadRegister(registerPath), ROOT);
  if (str('out')) fs.writeFileSync(path.resolve(str('out')), md); else process.stdout.write(md);
  process.exit(0);
}
if ((cmd !== 'check' && cmd !== 'draft') || !str('file') || !str('username')) usage();

const cli = await locateFmCli();
if (!cli) { console.error('fm CLI not found'); process.exit(2); }
const build = execFileSync(cli.path, ['--version']).toString().match(/\((\d+)\)/)?.[1] ?? '';
const target = { file: str('file'), username: str('username') };
const run = async (ops) => { assertReadOnly(ops); return runOps(cli, target, ops, { dryRun: false, opsFile: true, outFile: true, abortOnError: false, noPrompt: true, killAfterMs: 10 * 60 * 1000 }); };
const date = new Date().toISOString().slice(0, 10);

if (cmd === 'draft') {
  if (!str('kind')) usage();
  const refDir = str('reference') ? path.resolve(str('reference')) : (() => { const d = path.join(ROOT, 'gaps', 'reference'); const labels = fs.readdirSync(d).sort(); return path.join(d, labels[labels.length - 1]); })();
  const entries = fs.existsSync(registerPath) ? loadRegister(registerPath) : [];
  const wanted = str('kind').split(',').map((k) => k.trim()).filter((k) => !entries.some((e) => e.id === k));
  const refs = wanted.map((k) => JSON.parse(fs.readFileSync(path.join(refDir, k + '.json'), 'utf8')));
  const rules = Object.fromEntries(KINDS.map((r) => [r.id, r]));
  const probes = refs.map((r) => { const rule = rules[r.kindId.split(':')[0]]; if (!rule) throw new Error(`no kind rule for ${r.kindId}`); return { ref: r, probe: rule.probe(r.instances[0]) }; });
  const result = await run(probes.map((p) => p.probe.ops[0]));
  if (result.fatal) { console.error(`fatal: ${result.fatal.code}: ${result.fatal.message}`); process.exit(1); }
  probes.forEach(({ ref, probe }, i) => {
    const line = result.results[i];
    const instance = line && line.status === 'ok' ? selectInstance(line.result, probe.select) : undefined;
    if (instance === undefined) { console.error(`${ref.kindId}: probe ${JSON.stringify(probe.ops[0])} ${line ? line.status + (line.error ? ' ' + line.error.code : '') : 'no result'}; selector ${probe.select ?? '(root)'} matched nothing — drafted with every attribute unmatched`); }
    entries.push(draftEntry(ref, ref.instances[0], probe, instance ?? {}, cli.version));
    console.log(`${ref.kindId}: ${ref.attributes.length} attributes, ${instance === undefined ? 0 : Object.values(entries[entries.length - 1].attributes).filter((a) => a.reported).length} auto-matched`);
  });
  saveRegister(registerPath, entries);
  console.log(`register written: ${path.relative(process.cwd(), registerPath)} (${entries.length} entries)`);
  process.exit(0);
}

const entries = loadRegister(registerPath);
const out = await runChecks(entries, run, { version: cli.version, build, date, root: ROOT, commandFor: (argv) => ['fm', ...argv].join(' ') });
if (out.fatal) { console.error(`fatal: ${out.fatal.code}: ${out.fatal.message}`); for (const s of out.fatal.suggestions ?? []) console.error(s); console.error('register not written: the run never opened the file'); process.exit(1); }
saveRegister(registerPath, out.entries);
const show = (label, rows, fmt) => { console.log(`\n${label} (${rows.length})`); for (const r of rows) console.log('  ' + fmt(r)); };
show('Still missing', out.stillMissing, (r) => `${r.entry.id}  ${r.attribute.name}`);
show('Newly reported (set fmKey/reported by hand after reading the evidence)', out.newlyReported, (r) => `${r.entry.id}  ${r.attribute.name} -> ${r.attribute.fmKey}${r.entry.blocks.filter((b) => b.attribute === r.attribute.name).map((b) => `  unblocks ${b.app}: ${b.feature}`).join('')}`);
show('Regressed (was reported, now absent)', out.regressed, (r) => `${r.entry.id}  ${r.attribute.name} (${r.attribute.fmKey})`);
show('Unexplained keys on the instance (candidates for closing a gap)', out.unexplained, (r) => `${r.entry.id}  ${r.keys.join(', ')}`);
show('Errored', out.errored, (e) => `${e.id}  ${e.lastChecked?.reason ?? ''}`);
console.log(`\nregister written: ${path.relative(process.cwd(), registerPath)}; evidence under gaps/evidence/${cli.version}/`);
process.exit(out.errored.length > 0 || out.regressed.length > 0 ? 1 : 0);
```

`tests/helpers/fake-fm-cli.mjs`: add a mode `fixture` before `read`: for every op read from the ops file or stdin, emit `{ op: <op>, status: 'ok', result: <JSON of FAKE_FM_FIXTURE file> }` through `emitResult`, then a summary with `total` = number of ops, exit 0.

`gaps/register.json`: replace its content with `[]` (the old entries are superseded; git keeps them). Remove the `files`-shipped assumption that evidence is inline: add `"gaps"` is already in `files`, so evidence ships too.

`README.md`: replace the "Re-checking the register" section with the four-command workflow and the sentence "check exits 1 on errored probes or regressions; newly reported attributes are printed for a human to confirm by setting `fmKey` and `reported`."

- [ ] **Step 7: Full suite, build, smoke the bin with the fake CLI, commit**

Run: `npm test && npm run build`

Smoke (no real fm): write a fixture `/tmp/fx.json` `{"name":"Home","contents":{"objects":[{"id":21,"type":"field","bounds":{"top":1},"locked":false}]}}`, a reference file for `layout-object:edit-box` under `/tmp/ref/`, then
`FM_CLI_PATH=$PWD/tests/helpers/fake-fm-cli.mjs FAKE_FM_MODE=fixture FAKE_FM_FIXTURE=/tmp/fx.json node bin/fm-gaps.mjs draft --kind=layout-object:edit-box --file=/tmp/x.fmp12 --username=a --reference=/tmp/ref --register=/tmp/reg.json`
then `... check --register=/tmp/reg.json` and `node bin/fm-gaps.mjs report --register=/tmp/reg.json | head -40`. Paste all three outputs in the report. Note `locateFmCli` honours `FM_CLI_PATH` first.

```bash
git add -A && git commit -m "Register becomes a per-kind coverage matrix: subject entries, evidence per probe, per-attribute checks, draft and report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Enumerate the real export and draft every kind (read only)

**Files:**
- Modify: `gaps/register.json` (drafts for every kind), `gaps/evidence/0.6.0/*` (from the first check)

- [ ] **Step 1: Enumerate (already committed in Task 2; re-run to confirm it is current)**

```bash
node bin/fm-gaps.mjs enumerate --saxml=/Users/wdecorte/GitHub/fmai/Wugin/Plugin/saxml-working/Ooe --prefix=Ooe --label=2026-08-30-fm26.0.2
git status --short gaps/reference | wc -l      # expected 0: nothing changed since Task 2
```

- [ ] **Step 2: Draft every kind in batches, read only**

```bash
KINDS=$(ls gaps/reference/2026-08-30-fm26.0.2 | sed 's/\.json$//' | paste -sd, -)
node bin/fm-gaps.mjs draft --kind=$KINDS --file=fmnet://localhost/ooe --username=admin
```
Expected: one line per kind with attribute and auto-match counts; kinds whose probe fails (a kind with no instance in the live file, a `none` op) are drafted with everything unmatched and the reason printed. Paste the full output in the report. Then run the first check so every entry has evidence:

```bash
node bin/fm-gaps.mjs check --file=fmnet://localhost/ooe --username=admin; echo "exit=$?"
ls gaps/evidence/0.6.0 | wc -l
```
Expected: exit 1 is acceptable here only because of errored `none` probes; regressions must be 0 (nothing is marked reported that the draft did not see). Record the counts of still-missing and unexplained keys per entry in the report; they are the work list for Tasks 6 to 12.

- [ ] **Step 3: Commit the drafts**

```bash
git add -A && git commit -m "Draft a coverage entry for every kind in the Ooe reference, with first evidence from fm 0.6.0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Tasks 6 to 12: Review the drafts, kind group by kind group

These are knowledge tasks. Each follows the same procedure on a group of entries; the deliverable is a reviewed register where every attribute has a decided `fmKey`/`reported`/`wontfix`, a human `name`, and a `knownFrom` naming the FileMaker dialog or Inspector pane where the attribute is seen. A reviewer (the controller) checks a sample of each group's decisions against the evidence file and the SaXML reference.

**Start from what fmai already measured.** The audit-toolkit under `/Users/wdecorte/GitHub/fmai/Wugin/Plugin/audit-toolkit` (read only; `PYTHONDONTWRITEBYTECODE=1` if you import a module) already holds, for most kinds, the SaXML-to-fm mapping and the packed-word decodes: `fmadt/shape_map.py` claims, the per-catalog `fmadt/reports/reports/shape-coverage-*.md` verdict tables, `fmadt/layout-object-settings.<sha>.json` (57 layout-object settings: path, bit, polarity), `fmadt/flag-bits.<sha>.json` (step Options bits), and `golden_construct.py` type tables. The workspace file `fmai-knowledge.md` indexes them. For every entry, consult those first and record the source in `knownFrom` (for example `SaXML LayoutCatalog Options bit 512; fmadt layout-object-settings; Inspector > Position > Hide when printing`); fall back to reading the evidence and fm help only for attributes those sources do not cover. Two recorded corrections must be carried: relation flags are stored on the table they apply TO while fm names the direction they apply FROM (LeftTable flags land in `rightToLeft`), and SaXML `Validation@alwaysValidate` is fm's `validateWhenUnmodified` while `Validation@type` drives `validateAlways`.

**Procedure for every entry in the group**

1. Open the entry in `gaps/register.json`, its reference under `gaps/reference/2026-08-30-fm26.0.2/<id>.json`, and its evidence file (`lastChecked.evidence`).
2. For every attribute with `fmKey: null`: search the instance in the evidence for the key that carries it (read the fm help for that op if unsure: `fm help <catalog> read`). If found, set `fmKey` and `reported: true`. If the attribute is an export artifact (`@hash`, `UUID` where fm has no uuid concept for that kind, DDR-only bookkeeping), set `wontfix` with a one-line reason and leave `reported: false`. Otherwise it is a gap: leave `reported: false`, and write `knownFrom` as `SaXML <file> <path>; <FileMaker dialog or Inspector pane where a user sees it>`.
3. For every attribute the draft auto-matched: confirm the key really carries that fact (an auto-match on a name like `type` or `name` can be wrong). Fix or null it.
4. Rename `name` to what a FileMaker developer calls it ("hide when printing", "control style").
5. Where SaXML stores a packed option word, use the fmai decodes (`layout-object-settings` for layout objects, `flag-bits` for steps, the anchor FINDINGS for bits 28-31) to split it; only bits those files do not name need your own reasoning. Where SaXML stores a packed option word (`Options="1024"`, `show="7"`), the word is one SaXML path but several attributes. Split it: add one attribute per bit whose meaning you know, `path` = `<the word's path> bit <n>`, `knownFrom` naming the checkbox in the dialog, and map each to its decoded fm key. Bits you cannot name stay as one attribute `... (undecoded bits)` with `wontfix: "meaning unknown"`.
6. Move every instance key in `lastChecked.unexplainedKeys` to either an attribute (an fm key that carries a SaXML attribute you had missed) or `ignoreKeys` (fm bookkeeping such as `kind`, `id`, `token`).
7. Add `blocks` rows for attributes an inspector feature depends on, using the feature names from `docs/saxml-inventory.md` notes where the row exists.
8. Run `node bin/fm-gaps.mjs check --file=fmnet://localhost/ooe --username=admin` for the whole register; the group's entries must show no `unexplainedKeys` and no errors; commit with the group name in the subject.

**Groups**

| Task | Group | Entries (by id prefix) | Notes |
|---|---|---|---|
| 6 | Layouts | `layout`, `part:*`, `theme`, `file-options` | Parts and themes are wholesale gaps; still enumerate their attributes so Claris sees the full list. `file-options` attributes come from `Metadata`: confirm the Metadata rule's path in Task 2 covered `ScriptTrigger`, `Login`, `Encryption`, `Minimum` and the three hide checkboxes; the inventory's 24 `catalog-file-metadata` rows are the checklist. |
| 7 | Layout objects | `layout-object:*` (about 26) | The samples show fm's `type` names (`field`, `label`, `group`, `portal`, `button`, `tabControl`, `popover`, `webViewer`, ...); the draft's selector by object id finds the instance regardless. Conditional formatting, local styles, tooltips and hide conditions are the known gaps to verify per type. |
| 8 | Fields | `field:*` (per datatype), `table` | Calculation and summary fields carry the most options; container storage is now fully reported (verified 2026-09-14). |
| 9 | Scripts and steps | `script`, `step:*` (221) | Batch by step: the drafts already tell which steps are `opaque`. For those, every option attribute is a gap with `knownFrom` the step's dialog. For the rest, confirm each SaXML `ParameterValues` child against the step's fm keys; the step-display catalog (`src/catalogs/fm-step-display.json`) lists the keys fm reports per step and is the fastest cross-check. |
| 10 | Data model | `table-occurrence`, `relation`, `value-list:*`, `custom-function`, `external-data-source`, `base-directory`, `persistent-store` | Relation sort spec is the known gap. |
| 11 | Security | `account:*`, `privilege-set`, `extended-privilege`, `authorization` | `read:privilegeSet` needs a [Full Access] session; admin has it. |
| 12 | Menus | `custom-menu`, `custom-menu-item:*`, `custom-menu-set` | Menu item display names are computed at runtime; fm reports `nameCalculation`. |

Each task's report must list: entries reviewed, attributes decided (reported / missing / wontfix counts), the `knownFrom` sources used, packed words split, and anything the reviewer should double-check.

---

### Task 13: Reconcile the inventory and publish the first report

**Files:**
- Create in the inspector repo: `docs/inventory-to-register.md`, `tests/inventory-register.test.mjs`
- Create in the toolkit: `gaps/reports/<run date>-fm-0.6.0.md`

- [ ] **Step 1: Map every inventory gap id to register attributes**

`docs/inventory-to-register.md` in the inspector repo: a table `| Gap id | Rows | Register entries and attributes |` with one line per gap id in `docs/saxml-inventory.md` (13 today). Every gap id must name at least one `entry.id` / `attribute.name` pair that exists in the toolkit register with `reported: false`.

- [ ] **Step 2: Test it**

`tests/inventory-register.test.mjs` (node:test): parse the inventory's gap ids, parse the map, load `../fm-adt-toolkit/gaps/register.json` through `node_modules/fm-adt-toolkit`, and assert every gap id is mapped and every mapped pair exists and is `reported: false`. Run `npm test`; commit.

- [ ] **Step 3: Publish the first report**

```bash
cd /Users/wdecorte/GitHub/fm-adt-toolkit && node bin/fm-gaps.mjs check --file=fmnet://localhost/ooe --username=admin; node bin/fm-gaps.mjs report --out=gaps/reports/$(date +%F)-fm-0.6.0.md && git add -A && git commit -m "First coverage report against fm 0.6.0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

The owner reads `gaps/reports/<date>-fm-0.6.0.md` before it goes to Claris.

---

## What Plan 3 starts from

A register that is a complete coverage matrix for the Ooe reference against fm 0.6.0, re-checkable in one command on every new build, with a report Claris can act on. Plan 3 builds the inspector server, target resolution, discovery, model and the Gaps tab (spec sections 2 and 3), consuming `fm-adt-toolkit/gaps/checks` and the register through the server.
