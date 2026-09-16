// http on 127.0.0.1: static ui/, and the three JSON endpoints. Spec section 2.
import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDirectApi } from './read.mjs';

const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ui');
/** The browser cannot reach node_modules, and ui/ must stay free of a copy of the
 *  toolkit, so the page's import map points `fm-adt-toolkit/step-display` here and
 *  this route serves the installed package's own dist/ -- the same bytes Node loads.
 *  Resolved through the package's exported package.json, so a hoisted or linked
 *  install is found the same way. */
const VENDOR_PREFIX = '/vendor/fm-adt-toolkit/';
const TOOLKIT_DIST = resolve(
  dirname(createRequire(import.meta.url).resolve('fm-adt-toolkit/package.json')),
  'dist',
);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  // A file read off disk is already bytes (a .json file under ui/ would
  // otherwise be JSON.stringify'd into a quoted string).
  res.end(Buffer.isBuffer(body) ? body : type.startsWith('application/json') ? JSON.stringify(body) : body);
}

/** Binding to 127.0.0.1 keeps other machines out; it does not keep another web
 *  page in the user's own browser out. Two headers close that: a Host the
 *  browser only sends for our own loopback origin (so a rebound DNS name is
 *  refused), and an Origin that, when present, must be our own. */
function hostAllowed(host, port) {
  if (typeof host !== 'string') return false;
  const h = host.toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}` || h === '127.0.0.1' || h === 'localhost';
}

function originAllowed(origin, port) {
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

/** Thrown for a client mistake the handler should answer with 400, not 500. */
class BadRequest extends Error {}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequest('body is not valid JSON');
  }
}

async function serveStatic(res, uiDir, urlPath) {
  let rel;
  try {
    rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  } catch {
    return send(res, 400, { error: 'malformed URL encoding' });
  }
  const file = resolve(uiDir, rel);
  if (!file.startsWith(uiDir + sep)) return send(res, 404, { error: 'not found' });
  const type = TYPES[extname(file)];
  if (!type) return send(res, 404, { error: 'not found' });
  try {
    send(res, 200, await readFile(file), type);
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

export function createServer(opts) {
  const api = createDirectApi(opts);
  // resolve() also strips a trailing separator, which the traversal guard below
  // compares against.
  const uiDir = resolve(opts.uiDir ?? UI_DIR);

  return createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const port = req.socket.localPort;
    if (!hostAllowed(req.headers.host, port)) return send(res, 403, { error: 'host not allowed' });
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin !== undefined && !originAllowed(origin, port)) return send(res, 403, { error: 'origin not allowed' });
      // Anything but application/json needs a CORS preflight, which a
      // cross-origin page cannot get from us: we answer no OPTIONS.
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
        return send(res, 415, { error: 'content-type must be application/json' });
      }
    }
    try {
      if (req.method === 'GET' && url.pathname === '/api/context') {
        return send(res, 200, await api.context());
      }
      if (req.method === 'POST' && url.pathname === '/api/read') {
        const body = await readJson(req);
        if (typeof body.target !== 'string' || !Array.isArray(body.ops)) {
          return send(res, 400, { error: 'body must be { target: string, ops: [] }' });
        }
        if (!body.ops.length) return send(res, 400, { error: 'ops must not be empty' });
        let result;
        try {
          result = await api.read(body.target, body.ops);
        } catch (e) {
          if (/not read-only/.test(e.message)) return send(res, 400, { error: e.message });
          throw e;
        }
        return send(res, 200, result);
      }
      if (req.method === 'POST' && url.pathname === '/api/resolve-target') {
        const body = await readJson(req);
        if (typeof body.from !== 'string' || typeof body.path !== 'string') {
          return send(res, 400, { error: 'body must be { from: string, path: string }' });
        }
        return send(res, 200, await api.resolveTarget(body.from, body.path));
      }
      if (req.method === 'GET' && url.pathname.startsWith(VENDOR_PREFIX)) {
        // serveStatic's own resolve()+startsWith confinement keeps this inside dist/.
        return await serveStatic(res, TOOLKIT_DIST, '/' + url.pathname.slice(VENDOR_PREFIX.length));
      }
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        return await serveStatic(res, uiDir, url.pathname);
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      if (e instanceof BadRequest) return send(res, 400, { error: e.message });
      send(res, 500, { error: e.message });
    }
  });
}
