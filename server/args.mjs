export function parseArgs(argv) {
  const out = { file: null, username: null, port: 0, open: true, noPrompt: false };
  const seen = new Set();
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) throw new Error(`unexpected argument ${a}`);
    const [, key, value] = m;
    if (seen.has(key)) throw new Error(`flag --${key} given twice`);
    seen.add(key);
    switch (key) {
      case 'file': out.file = value; break;
      case 'username': out.username = value; break;
      case 'port': out.port = Number(value); break;
      case 'no-open': out.open = false; break;
      case 'no-prompt': out.noPrompt = true; break;
      case 'password': throw new Error('--password is never accepted; fm reads the password from the keychain or asks in its own window');
      default: throw new Error(`unknown flag --${key}`);
    }
  }
  if (!out.file) throw new Error('--file=<fmnet://host/Name or /path/Name.fmp12> is required');
  if (!out.username) throw new Error('--username=<account> is required');
  if (!Number.isInteger(out.port) || out.port < 0 || out.port > 65535) throw new Error('--port must be an integer between 0 and 65535');
  return out;
}
