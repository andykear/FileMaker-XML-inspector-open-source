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
server.listen(args.port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`Clockwork Inspector on ${url} (fm ${cli.version}, ${args.file} as ${args.username})`);
  if (args.open) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  }
});
