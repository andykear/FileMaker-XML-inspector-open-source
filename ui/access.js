// ui/access.js
// The one way a tab reads an fm key: exact spelling first, then the case-and-separator
// fold, because fm respells keys between builds (0.7.0 moved every multi-word key to
// camelCase). Word-level renames are the intake's job, not this file's.
import { foldKey } from 'fm-adt-toolkit/step-display';

export function get(obj, key) {
  if (obj === null || typeof obj !== 'object') return undefined;
  if (Object.hasOwn(obj, key)) return obj[key];
  const want = foldKey(key);
  for (const k of Object.keys(obj)) if (foldKey(k) === want) return obj[k];
  return undefined;
}

export function has(obj, key) {
  return get(obj, key) !== undefined;
}

export function path(obj, dotted) {
  let cur = obj;
  for (const seg of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = Array.isArray(cur) ? cur[Number(seg)] : get(cur, seg);
  }
  return cur;
}
