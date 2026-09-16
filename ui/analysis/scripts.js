// ui/analysis/scripts.js
// What a script body says about itself: seven checks, the call graph between
// scripts, and one tree walk for the explorer.
//
// An issue is { target, script:{id,name}, step:{index,stepID,step}, check,
// detail, keys }. `keys` names the fm keys that DECIDED the issue, so a reader
// can go look at the same key fm wrote; `disabled` is read by every check and
// is not repeated there. Every check skips a disabled step: FileMaker does not
// run it, so it is not a finding -- and, the other way round, a mention inside
// a disabled step is not a mention (`dead-set-variable` below).
//
//   dead-set-variable    a `Set Variable` writing a `$local` that no LATER
//                        string of the same script mentions. The scan is over
//                        the RAW string, not the tokeniser's reading of it:
//                        `Evaluate ( "$x" )` is a real read, so a quoted
//                        mention counts. Variable names are case-insensitive in
//                        FileMaker, so the match is. Two things it gets wrong,
//                        both from reading body ORDER and not flow: a loop
//                        counter whose only read is EARLIER in the body (`Set
//                        Variable [$i ; $i + 1]` at the foot of a loop read at
//                        its head) is live and reads as dead; and a later WRITE
//                        is a mention, so a local set twice and never read is
//                        reported once, not twice. A name with a space in it
//                        (`$my var`) tokenises as its first word, so it reads
//                        as never mentioned again; see GLOBALS_NOTE.
//   embedded-credential  any key whose folded name contains `password`,
//                        `apikey`, `secret`, `privatekey` or `clientsecret`
//                        holding a quoted literal instead of a variable or a
//                        field. The literal's TEXT is never reported -- a
//                        secret does not belong in a report about secrets --
//                        only how many characters it is.
//   literal-account      an `account` key holding a quoted literal. The account
//                        name IS reported: it is not a secret, and it is what a
//                        reader needs to find the account. `detail.step` is the
//                        step's own name, because that is what tells a login
//                        from an AI account: `Configure AI Account` and the AI
//                        steps spell their account key `account` too, which is
//                        why this check is named for what it SAW (a literal in
//                        an account key) and not for what it might mean.
//   psos-only-step       a step FileMaker does not run on a server (the list
//                        below). Reported wherever it is, not only under a
//                        `Perform Script on Server`: which scripts are ever
//                        performed on the server is the call graph's question,
//                        and a caller may be added tomorrow.
//   swallowed-error      `Set Error Capture [On]` with no `Get ( LastError )`
//                        in any later string of the script: the errors are
//                        caught and nothing looks at them.
//   unguarded-abort-off  `Allow User Abort [Off]` with no `Set Error Capture`
//                        anywhere in the script: the user cannot stop it and
//                        nothing is watching for the error that should.
//   expensive-in-loop    a step inside a `Loop` block that calls `ExecuteSQL`
//                        or `Evaluate`, or that IS `Insert from URL` -- one
//                        round trip per iteration. A DISABLED `Loop` opener is
//                        not a loop: its steps run once, in order, which is
//                        what ui/tabs/scripts.js `orphanedEnabled` counts.
//
// A step is recognised by fm's `stepID`, FileMaker's own step id, never by the
// `step` name: the id is what fm's catalog is keyed on and it does not change
// with a build's spelling. `block.start`/`block.end` are fm's own block bounds,
// read here directly -- `depths()` in ui/tabs/scripts.js turns the same key
// into an indent, which does not answer "which Loop encloses this step".
//
// The call graph is Task 1's script references, one edge per naming site:
// `step` (a script's own body), `trigger` (a layout), `button` (a layout
// object), `menu` (a custom menu item). Every key is namespaced by the kind of
// object it names, because fm's ids are unique per catalog and not across them.
// A name resolves to the script of the
// CALLING file first -- script names are file-local -- then, when only one file
// in the read has a script of that name, to that one. Two inherited costs:
// `Perform AppleScript` reports its source under the same `script` key `Perform
// Script` uses, so a value carrying a quote or a newline is dropped the way
// ui/analysis/broken.js drops it; and a cross-file `Perform Script` is resolved
// by name alone, fm's `fileName` on such a step being calculation text.
//
// Pure: no document, no node:, no server/. Every fm key read through
// get/path. Memoised per solution in a WeakMap, like every other analysis.
import { foldKey } from 'fm-adt-toolkit/step-display';
import { get, path } from '../access.js';
import { nameIndex, references, strings, tokenise } from './refs.js';

// ── The steps FileMaker does not run on a server ──────────────────────

// Lifted verbatim from legacy/clockwork-inspector.html (`PSOS_INCOMPATIBLE_STEPS`,
// the FM STEP ID DICTIONARY section), which states its own provenance:
//
//   PSoS/Server-incompatible step IDs -- GENERATED from the verified FileMaker
//   AI Vocabulary platform matrix (clockwork_scriptsteps.md,
//   github.com/andykear/FileMaker-AI-vocabulary, FileMaker 26 target).
//   A step is listed when the vocabulary marks it Server:No or Cloud:No.
//   Do not edit by hand -- regenerate from the vocabulary when it updates.
//   83 steps, generated 2026-08-23.
//
// The keys are FileMaker's step ids, which is exactly what fm's `stepID` is,
// so no name ever has to match. The names are the legacy's, kept as the
// documentation of which id is which.
export const PSOS_ONLY_STEPS = Object.freeze({
  11: 'Insert from Index', 18: 'Check Selection', 19: 'Check Record',
  20: 'Check Found Set', 31: 'Adjust Window', 32: 'Open Help',
  33: 'Open File', 34: 'Close File', 37: 'Save a Copy as',
  38: 'Open Manage Database', 41: 'Enter Preview Mode', 43: 'Print',
  56: 'Insert Picture', 57: 'Send Event', 64: 'Send DDE Execute (Windows)',
  65: 'Dial Phone', 66: 'Speak (macOS)', 67: 'Perform AppleScript (macOS)',
  79: 'Freeze Window', 81: 'Scroll Window', 82: 'New File',
  84: 'Set Multi-User', 87: 'Show Custom Dialog', 88: 'Open Script Workspace',
  92: 'Show/Hide Text Ruler', 93: 'Beep', 94: 'Set Use System Formats',
  95: 'Recover File', 96: 'Save a Copy as Add-on Package', 97: 'Set Zoom Level',
  102: 'Flush Cache to Disk', 105: 'Open Settings', 106: 'Correct Word',
  107: 'Spelling Options', 108: 'Select Dictionaries', 109: 'Edit User Dictionary',
  111: 'Open URL', 112: 'Open Manage Value Lists', 113: 'Open Sharing',
  114: 'Open File Options', 115: 'Allow Formatting Bar', 118: 'Open Hosts',
  119: 'Move/Resize Window', 120: 'Arrange All Windows', 128: 'Perform Find/Replace',
  129: 'Open Find/Replace', 131: 'Insert File', 132: 'Export Field Contents',
  138: 'Re-Login', 139: 'Convert File', 140: 'Open Manage Data Sources',
  142: 'Install Menu Set', 143: 'Save Records as Excel', 146: 'Set Web Viewer',
  148: 'Install OnTimer Script', 149: 'Open Edit Saved Finds', 151: 'Open Manage Layouts',
  156: 'Open Manage Containers', 158: 'Insert PDF', 159: 'Insert Audio/Video',
  161: 'Insert from Device', 165: 'Open Manage Themes', 166: 'Show/Hide Menubar',
  167: 'Refresh Object', 169: 'Close Popover', 172: 'Open Upload To Host',
  174: 'Enable Touch Keyboard', 175: 'Perform JavaScript in Web Viewer', 177: 'AVPlayer Play',
  178: 'AVPlayer Set Playback State', 179: 'AVPlayer Set Options', 180: 'Refresh Portal',
  181: 'Get Folder Path', 183: 'Open Favorites', 185: 'Configure Region Monitor Script',
  187: 'Configure Local Notification', 200: 'Set Error Logging', 201: 'Configure NFC Reading',
  202: 'Configure Machine Learning Model', 209: 'Set Dictionary', 210: 'Perform Script On Server with Callback',
  237: 'Flush Web Viewer Cookies', 242: 'Print PDF',
});

// The ids the checks themselves are about, same numbering as the list above.
const LOOP = 71;
const ALLOW_USER_ABORT = 85;
const SET_ERROR_CAPTURE = 86;
const SET_VARIABLE = 141;
const INSERT_FROM_URL = 160;

// A `$local` or a `$$global` as FileMaker writes one; the shape refs.js
// tokenises, matched here against the raw string so a quoted mention counts.
const VAR_RE = /\$\$?[\p{L}\p{N}_][\p{L}\p{N}_.]*/gu;
const LAST_ERROR_RE = /Get\s*\(\s*LastError\s*\)/i;
const LITERAL_RE = /"((?:[^"\\]|\\.)*)"/g;
const CREDENTIAL_WORDS = ['password', 'apikey', 'secret', 'privatekey', 'clientsecret'];

// fm reports `on` only when the state was written into the file; a step left at
// its default carries no `on` key at all and the state rides in `flags` bit
// `0x20000`. Measured two ways: against ooe's SaXML golden master, where four of
// the solution's seven `Allow User Abort [Off]` steps report no `on`; and in
// fm-adt-toolkit's own docs/fm-step-flags-reference.md, which measures `0x20000`
// as `set -> On, clear -> Off` on the step types where the CLI reports no key
// (`Allow Formatting Bar`, `Set Layout Object Animation`) and lists the same bit
// under `on` for the three where it does. The toolkit exposes no reader for it,
// so this is the bit read by hand -- one place, both step types. For the
// register intake: fm reports `on` only when set; the default rides in flags.
const ON_BIT = 0x20000;
const onState = (step) => get(step, 'on') ?? ((Number(get(step, 'flags')) || 0) & ON_BIT) !== 0;
const EXPENSIVE_CALLS = new Set(['executesql', 'evaluate']);

const filesOf = (solution) => Object.values(get(solution, 'files') ?? {});
const detailsOf = (file) => Object.values(path(file, 'catalogs.script.detailById') ?? {})
  .map((e) => get(e, 'result')).filter((r) => r !== undefined && r !== null);

/** The text of the string literals in `value`, when the whole value is
 *  literal: no field, no variable and no function call is left once the
 *  literals are taken out. `null` when something is computed, and also when
 *  every literal is empty -- `""` is not a credential. */
function literalOf(value) {
  const t = tokenise(value);
  if (t.quoted === 0 || t.fields.length || t.variables.length || t.functions.length) return null;
  const text = [...value.matchAll(LITERAL_RE)].map((m) => m[1]).join('');
  return text.trim() === '' ? null : text;
}

const isCredentialKey = (key) => {
  const folded = foldKey(key);
  return CREDENTIAL_WORDS.some((word) => folded.includes(word));
};

/** What this step calls that costs a round trip, or `null`. */
function expensiveCall(step) {
  if (get(step, 'stepID') === INSERT_FROM_URL) return 'Insert from URL';
  let found = null;
  strings(step, (value) => {
    if (found) return;
    for (const fn of tokenise(value).functions) {
      if (EXPENSIVE_CALLS.has(fn.toLowerCase())) { found = fn; return; }
    }
  });
  return found;
}

/** The innermost enabled `Loop` a step sits strictly inside, or undefined. */
const innermostLoop = (loops, index) => loops
  .filter((loop) => loop.start < index && index < loop.end)
  .sort((a, b) => b.start - a.start)[0];

/** One script, every check. Two passes: what the whole body says (which
 *  variable is mentioned last where, whether an error is ever read, where the
 *  loops are), then each step against it. */
function issuesOfScript(target, detail, rows) {
  const body = get(detail, 'body') ?? [];
  const script = { id: get(detail, 'id'), name: get(detail, 'name') };
  const live = [];
  for (let i = 0; i < body.length; i += 1) if (get(body[i], 'disabled') !== true) live.push(i);

  const lastMention = new Map();
  const loops = [];
  let lastErrorRead = -1;
  let hasErrorCapture = false;
  for (const i of live) {
    const step = body[i];
    const id = get(step, 'stepID');
    if (id === SET_ERROR_CAPTURE) hasErrorCapture = true;
    if (id === LOOP && path(step, 'block.role') === 'opener') {
      loops.push({ index: i, stepID: id, start: Number(path(step, 'block.start')), end: Number(path(step, 'block.end')) });
    }
    // `live` ascends, so the last write of each name IS the greatest index.
    strings(step, (value) => {
      for (const m of value.matchAll(VAR_RE)) lastMention.set(m[0].toLowerCase(), i);
      if (LAST_ERROR_RE.test(value)) lastErrorRead = i;
    });
  }

  const add = (i, check, why, keys) => rows.push({
    target,
    script,
    step: { index: i, stepID: get(body[i], 'stepID'), step: get(body[i], 'step') },
    check,
    detail: why,
    keys,
  });

  for (const i of live) {
    const step = body[i];
    const id = get(step, 'stepID');
    // `hasOwn`, not a truthy read: an id is a key of this object or it is
    // nothing, and no inherited `toString` is ever a step name.
    if (Object.hasOwn(PSOS_ONLY_STEPS, id)) add(i, 'psos-only-step', { step: PSOS_ONLY_STEPS[id] }, ['stepID']);
    if (id === SET_VARIABLE) {
      const name = get(step, 'name');
      // `$$` is a global: whether anything reads one is globals.js's question,
      // and the answer is not in this script.
      if (typeof name === 'string' && /^\$[^$]/.test(name) && (lastMention.get(name.toLowerCase()) ?? -1) <= i) {
        add(i, 'dead-set-variable', { variable: name }, ['stepID', 'name']);
      }
    }
    if (id === SET_ERROR_CAPTURE && onState(step) === true && lastErrorRead <= i) {
      add(i, 'swallowed-error', { missing: 'Get ( LastError )' }, ['stepID', 'on', 'flags']);
    }
    if (id === ALLOW_USER_ABORT && onState(step) === false && !hasErrorCapture) {
      add(i, 'unguarded-abort-off', { missing: 'Set Error Capture' }, ['stepID', 'on', 'flags']);
    }
    strings(step, (value, at, key) => {
      const text = literalOf(value);
      if (text === null) return;
      if (isCredentialKey(key)) add(i, 'embedded-credential', { key, where: at, characters: text.length }, [key]);
      else if (foldKey(key) === 'account') add(i, 'literal-account', { key, where: at, account: text, step: get(step, 'step') }, [key]);
    });
    const loop = innermostLoop(loops, i);
    if (loop) {
      const found = expensiveCall(step);
      if (found) add(i, 'expensive-in-loop', { found, loop: { index: loop.index, stepID: loop.stepID } }, ['stepID', 'block']);
    }
  }
}

const issueCache = new WeakMap();

/** Every script issue in the solution, in one frozen list, in body order.
 *  Memoised on the solution object, which a re-read replaces. */
export function scriptIssues(solution) {
  const hit = issueCache.get(solution);
  if (hit) return hit;
  const rows = [];
  for (const file of filesOf(solution)) {
    const target = get(file, 'target');
    for (const detail of detailsOf(file)) issuesOfScript(target, detail, rows);
  }
  Object.freeze(rows);
  if (solution !== null && typeof solution === 'object') issueCache.set(solution, rows);
  return rows;
}

// ── The call graph ────────────────────────────────────────────────────

// The naming site of a script reference, as the graph calls it.
const VIA = { script: 'step', layout: 'trigger', layoutObject: 'button', customMenu: 'menu' };

/** The key a graph end is found by. fm ids are unique per catalog and NOT
 *  across catalogs -- ooe's layout 2 and script 2 are different objects -- so
 *  the KIND is half of every key. Keying both `target|2` made every trigger on
 *  that layout read as a call from that script: 14 layout ids and 11 custom
 *  menu ids collide with script ids on ooe alone. The prefix is the reference's
 *  own `from.kind`, so `edge.from` and `edge.origin.kind` cannot drift apart.
 *  A UI builds its own Scripts-tab selection from a node's `target` and `id`. */
export const graphKey = (kind, target, id) => `${kind}:${target}|${id}`;
export const scriptKey = (target, id) => graphKey('script', target, id);

// A real script name carries neither a quote nor a line break; a value that
// does is `Perform AppleScript`'s source under fm's `script` key (see
// ui/analysis/broken.js, which drops the same shape).
const looksLikeAppleScript = (name) => name.includes('"') || /[\r\n]/.test(name);

const graphCache = new WeakMap();

/** Every script as a node, every place one is named as an edge. Frozen and
 *  memoised, like every other analysis. */
export function callGraph(solution) {
  const hit = graphCache.get(solution);
  if (hit) return hit;
  const scripts = nameIndex(solution).scripts;
  const nodes = [];
  for (const entries of scripts.values()) {
    for (const e of entries) nodes.push({ key: scriptKey(e.target, e.id), target: e.target, id: e.id, name: e.name });
  }
  const edges = [];
  for (const ref of references(solution)) {
    if (ref.kind !== 'script') continue;
    const via = VIA[ref.from.kind];
    if (!via || looksLikeAppleScript(ref.name)) continue;
    const candidates = scripts.get(ref.name) ?? [];
    const to = candidates.find((e) => e.target === ref.from.target) ?? (candidates.length === 1 ? candidates[0] : undefined);
    edges.push({
      from: graphKey(ref.from.kind, ref.from.target, ref.from.id),
      to: to ? scriptKey(to.target, to.id) : null,
      name: ref.name,
      via,
      resolved: Boolean(to),
      origin: ref.from,
    });
  }
  const graph = { nodes: Object.freeze(nodes), edges: Object.freeze(edges) };
  Object.freeze(graph);
  if (solution !== null && typeof solution === 'object') graphCache.set(solution, graph);
  return graph;
}

const indexCache = new WeakMap();

function graphIndex(graph) {
  const hit = indexCache.get(graph);
  if (hit) return hit;
  const index = { nodes: new Map(), out: new Map() };
  for (const node of graph.nodes) index.nodes.set(node.key, node);
  for (const edge of graph.edges) {
    if (!index.out.has(edge.from)) index.out.set(edge.from, []);
    index.out.get(edge.from).push(edge);
  }
  indexCache.set(graph, index);
  return index;
}

function walk(key, depth, seen, index, via) {
  const node = index.nodes.get(key);
  const tree = { key, target: node.target, id: node.id, name: node.name, via, resolved: true, children: [] };
  if (seen.has(key)) { tree.cycle = true; return tree; }
  const out = index.out.get(key) ?? [];
  if (depth <= 0) {
    if (out.length) tree.truncated = true;
    return tree;
  }
  const next = new Set(seen).add(key);
  for (const edge of out) {
    tree.children.push(edge.resolved
      ? walk(edge.to, depth - 1, next, index, edge.via)
      : { key: null, target: edge.origin.target, id: null, name: edge.name, via: edge.via, resolved: false, children: [] });
  }
  return tree;
}

/** What one script calls, and what that calls, `depth` levels down. Only a
 *  script CALLS anything: the walk follows edges out of a `script:` key, so a
 *  layout's trigger or a menu item's action -- an entry point, not a call -- is
 *  in the graph and not in the tree. A node
 *  already on the path back to the root is `cycle` and is not walked again; a
 *  node at the depth limit that still calls something is `truncated`; a name no
 *  script answers is a child with no key. `null` when the key is not a script
 *  of this solution. */
export function callTreeOf(graph, key, depth = 3) {
  const index = graphIndex(graph);
  if (!index.nodes.has(key)) return null;
  return walk(key, depth, new Set(), index, null);
}
