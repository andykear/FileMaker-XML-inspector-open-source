// ui/api.js
// The page's only door to the server. Works in Node too (native fetch).
export function createApi(baseUrl = '') {
  async function call(path, init) {
    const res = await fetch(baseUrl + path, init);
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) throw new Error(body?.error ?? `${path} failed with ${res.status}`);
    return body;
  }
  const post = (path, body) => call(path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return {
    context: () => call('/api/context'),
    read: (target, ops) => post('/api/read', { target, ops }),
    resolveTarget: (from, path) => post('/api/resolve-target', { from, path }),
    // The toolkit's coverage register, reduced, and one run of its own probes
    // against a live file. The run goes through the server's read-only guard
    // like every other read; nothing about it writes.
    register: () => call('/api/register'),
    gapsCheck: (target) => post('/api/gaps/check', { target }),
  };
}
