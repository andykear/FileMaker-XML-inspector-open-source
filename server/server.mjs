// http on 127.0.0.1: static ui/, and the three JSON endpoints. Spec section 2.
import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDirectApi } from './read.mjs';

const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ui');
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
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function serveStatic(res, uiDir, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
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
  const uiDir = opts.uiDir ?? UI_DIR;

  return createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (req.method === 'GET' && url.pathname === '/api/context') {
        return send(res, 200, await api.context());
      }
      if (req.method === 'POST' && url.pathname === '/api/read') {
        const body = await readJson(req);
        if (typeof body.target !== 'string' || !Array.isArray(body.ops)) {
          return send(res, 400, { error: 'body must be { target: string, ops: [] }' });
        }
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
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        return serveStatic(res, uiDir, url.pathname);
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 500, { error: e.message });
    }
  });
}
