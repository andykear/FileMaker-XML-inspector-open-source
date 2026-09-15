// Resolves the path list of an external data source to something fm can open.
// Never calls fm. The spec's rules (section 2, /api/resolve-target).
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function isHosted(target) {
  return /^fmnet:\/\//i.test(target);
}

/** Visited-set key. Hosted names are case-insensitive on the server, so
 *  ooe's own "Self" source (file:Ooe) must map onto the root fmnet://localhost/ooe. */
export function targetKey(target) {
  return isHosted(target) ? target.toLowerCase() : target;
}

function unresolvable(reason) {
  return { unresolvable: true, reason };
}

export function resolveTarget(from, path, deps = {}) {
  const exists = deps.exists ?? existsSync;
  const p = String(path);

  if (p.startsWith('$$')) return unresolvable(`${p} is a $$variable path, resolved at runtime by the file`);
  if (/^odbc:/i.test(p)) return unresolvable(`${p} is an ODBC source, not a FileMaker file`);
  if (/^file(mac|win|linux):/i.test(p)) return unresolvable(`${p} is a platform-absolute path; only file: siblings and fmnet: paths are resolved`);

  const fmnet = p.match(/^fmnet:\/{1,2}(.+)$/i);
  if (fmnet) return { target: `fmnet://${fmnet[1]}` };

  const file = p.match(/^file:(.+)$/i);
  if (!file) return unresolvable(`${p} is an unrecognised external data source path`);
  const name = file[1];

  if (isHosted(from)) {
    if (name.includes('/')) return unresolvable(`${p} names a directory; hosted files have no directories`);
    const host = from.match(/^fmnet:\/\/([^/]+)\//i)?.[1];
    if (!host) return unresolvable(`cannot read the host out of ${from}`);
    return { target: `fmnet://${host}/${name}` };
  }

  const candidate = resolve(dirname(from), /\.fmp12$/i.test(name) ? name : `${name}.fmp12`);
  if (!exists(candidate)) return unresolvable(`${candidate} does not exist`);
  return { target: candidate };
}
