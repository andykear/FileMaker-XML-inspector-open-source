// ui/export/mermaid.js
// Two diagrams, as Mermaid text: the relationship graph as an `erDiagram` and
// the script call graph as a `flowchart TD`.
//
// Both are drawn from the same functions the tabs draw from -- `relationRows`
// and `occurrenceRows` of ui/tabs/graph.js, `callGraph` of
// ui/analysis/scripts.js -- so a diagram and the tab beside it cannot disagree
// about what is in the file.
//
// The notation of the erDiagram, stated in the diagram's own header comment
// because a reader of the .mmd has no other place to learn it: FileMaker
// declares no cardinality on a relation. What it does declare is whether
// either side may CREATE a related record, which is the nearest thing the file
// carries to "many", so `||--o{` is a relation where at least one side allows
// creating related records and `||--||` one where neither does. Nothing here
// infers cardinality from keys or from data: this is the schema's own word.
//
// Identifiers: Mermaid allows only `[A-Za-z0-9_]` in one, and a FileMaker name
// allows nearly anything, so every node is a sanitised identifier carrying the
// real name in a label. Two occurrences in two files may share a name, so the
// identifier is allocated per file (ui/export/common.js `mermaidId`).
//
// Pure: no document, no node:, no server/.
import { mermaidId, mermaidLabel } from './common.js';
import { occurrenceRows, relationRows } from '../tabs/graph.js';
import { callGraph, times } from '../analysis/scripts.js';

const SEP = '\u0000';
const filesOf = (solution) => Object.values(solution?.files ?? {});

function header(solution, what) {
  const version = solution?.cli?.version ? `fm ${solution.cli.version}` : 'fm version unknown';
  return `%% Clockwork Inspector: ${what} of ${solution?.root ?? '(no root)'} (${version}, read ${solution?.readAt ?? 'never'})`;
}

// ── The relationship graph ────────────────────────────────────────────

const NOTATION = [
  '%% Notation: FileMaker declares no cardinality on a relation, so none is invented here.',
  '%% `||--o{` is a relation at least one side of which allows creating related records;',
  '%% `||--||` is one where neither side does. The label is the relation\'s own predicates.',
];

/** `erDiagram`: one entity per table occurrence, one line per relation. */
export function mermaidRelationships(solution) {
  const out = ['erDiagram', header(solution, 'relationships'), ...NOTATION];
  const ids = new Map();
  const idOf = (target, name) => mermaidId(name, ids, `${target}${SEP}${name}`);
  const known = new Set();
  const relations = [];
  for (const file of filesOf(solution)) {
    for (const occ of occurrenceRows(file)) {
      const id = idOf(occ.target, occ.name);
      known.add(id);
      out.push(`    ${id}["${mermaidLabel(occ.name)}"]`);
    }
    for (const rel of relationRows(file)) {
      const left = idOf(rel.target, rel.left);
      const right = idOf(rel.target, rel.right);
      // An endpoint that is not one of the listed occurrences would be an
      // entity Mermaid invents from a name this diagram never declared: say so
      // in the diagram rather than draw a line to a box no one can find.
      if (!known.has(left) || !known.has(right)) {
        relations.push(`%%   relation ${rel.id} joins ${rel.left} and ${rel.right}, which this read did not list as occurrences`);
        continue;
      }
      const link = rel.createL || rel.createR ? '||--o{' : '||--||';
      relations.push(`    ${left} ${link} ${right} : "${mermaidLabel(rel.predicates || '(no predicates)')}"`);
    }
  }
  return [...out, ...relations].join('\n') + '\n';
}

// ── The script call graph ─────────────────────────────────────────────

const CALL_NOTATION = [
  '%% A solid arrow is a name that resolved to a script in this read; a dashed one',
  '%% resolved to nothing. The arrow\'s label is where the name was written: a script',
  '%% step, a layout trigger, a button on a layout object, or a custom menu item.',
  '%% One object may name one script many times over: those are one arrow labelled',
  '%% `step x19`, not nineteen arrows Mermaid would draw on top of each other. The',
  '%% call graph itself keeps every site -- the Explorer lists them one by one.',
];

/** The label of a node that is not a script: the object that names one. The id
 *  rides in it because a layout's own name is what fm reports for every object
 *  ON that layout, so two buttons would otherwise be two nodes with one label. */
const originLabel = (o) => (o.name === undefined ? `${o.kind} ${o.id}` : `${o.name} (${o.kind} ${o.id})`);

/** `flowchart TD`: one node per script, plus a node for every other object that
 *  names one and for every name that resolved to nothing; one arrow per
 *  `(from, to, via)`, labelled by where the name was written and carrying `×N`
 *  when N sites of that kind name it.
 *
 *  Why collapse: a script that calls `noop` on 19 of its steps produced 19
 *  identical arrows, drawn on top of each other and readable as one -- so the
 *  diagram showed the 19 and told the reader 1. One arrow that says `step ×19`
 *  tells the truth in the space a diagram has. `callGraph` itself is untouched:
 *  it keeps every site, and the Explorer's Referenced-by table lists each. */
export function mermaidCallGraph(solution) {
  const graph = callGraph(solution);
  const nodes = ['flowchart TD', header(solution, 'script call graph'), ...CALL_NOTATION];
  const ids = new Map();
  const declared = new Set();
  // One declaration per object: an edge's ends are declared by whoever reaches
  // them first, and every later edge to the same key finds the same node.
  const declare = (key, name, label) => {
    const id = mermaidId(name, ids, key);
    if (!declared.has(id)) {
      declared.add(id);
      nodes.push(`    ${id}["${mermaidLabel(label)}"]`);
    }
    return id;
  };
  for (const node of graph.nodes) declare(node.key, node.name, node.name);
  // Insertion order is the order the edges arrive in, so collapsing does not
  // reshuffle the diagram: the first site of a pair is where its arrow sits.
  const arrows = new Map();
  for (const edge of graph.edges) {
    const from = declare(edge.from, edge.origin.name ?? String(edge.origin.id), originLabel(edge.origin));
    const to = edge.resolved
      ? declare(edge.to, edge.name, edge.name)
      : declare(`missing${SEP}${edge.origin.target}${SEP}${edge.name}`, edge.name, `${edge.name} (missing)`);
    const key = `${from}${SEP}${to}${SEP}${edge.via}`;
    const at = arrows.get(key);
    if (at) at.count += 1;
    else arrows.set(key, { from, to, via: edge.via, resolved: edge.resolved, count: 1 });
  }
  const edges = [...arrows.values()].map((a) =>
    `    ${a.from} ${a.resolved ? '-->' : '-.->'}|${mermaidLabel(times(a.via, a.count))}| ${a.to}`);
  return [...nodes, ...edges].join('\n') + '\n';
}
