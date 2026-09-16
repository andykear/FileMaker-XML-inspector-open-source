// ui/export/json.js
// The whole read as one JSON document: the solution model exactly as the page
// holds it, plus the five analyses the Analysis tab draws from.
//
// Why the model and not a flattened shape: the model IS fm's answers, one slot
// per catalog, and an export that reshaped them would be a third spelling of
// fm's wire format to keep in step with the other two. A reader who wants the
// derived view has the analyses next to it.
//
// What must not reach it: a Map or a Set, which JSON.stringify writes as `{}`
// -- silently, so a consumer would find an empty object where the members were.
// The model carries neither; `ui/analysis/refs.js` `nameIndex` does, which is
// exactly why it is not exported here. The analyses themselves are frozen
// arrays of plain objects (`globals` turns its per-row Set of files into an
// array before it returns), and freezing does not affect serialisation.
//
// Pure: no document, no node:, no server/.
import { unreferenced } from '../analysis/unreferenced.js';
import { broken } from '../analysis/broken.js';
import { callGraph, scriptIssues } from '../analysis/scripts.js';
import { globals } from '../analysis/globals.js';

export { exportFilename } from './common.js';

/** `{ solution, analyses }`, indented two spaces so a diff of two exports of
 *  the same file reads line by line. */
export function jsonExport(solution) {
  return JSON.stringify({
    solution,
    analyses: {
      unreferenced: unreferenced(solution),
      broken: broken(solution),
      scriptIssues: scriptIssues(solution),
      callGraph: callGraph(solution),
      globals: globals(solution),
    },
  }, null, 2);
}
