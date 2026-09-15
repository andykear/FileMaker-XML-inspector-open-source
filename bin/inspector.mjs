#!/usr/bin/env node
// bin/inspector.mjs
import { spawn } from 'node:child_process';
import { locateFmCli } from 'fm-adt-toolkit/runner';
import { parseArgs } from '../server/args.mjs';
import { createServer } from '../server/server.mjs';

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(e.message);
  console.error('usage: inspector --file=<target> --username=<account> [--port=0] [--no-open] [--no-prompt]');
  process.exit(2);
}

const cli = await locateFmCli();
if (!cli) {
  console.error('fm CLI not found. Install the Claris ADT plugin, or put fm on PATH.');
  process.exit(2);
}

const server = createServer({ cli, root: args.file, username: args.username, noPrompt: args.noPrompt });
server.on('error', (e) => {
  console.error(`cannot listen on 127.0.0.1:${args.port}: ${e.message}`);
  process.exit(2);
});
server.listen(args.port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`Clockwork Inspector on ${url} (fm ${cli.version}, ${args.file} as ${args.username})`);
  if (args.open) {
    const child = process.platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true })
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  }
});
