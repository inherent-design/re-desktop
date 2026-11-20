#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ProgramStore, atomicJson, ownedDirectory, versionPattern, failure } from '../lib/store.mjs';
import { runtimeManager } from '../lib/runtime.mjs';
import { cleanupSession, installCodex } from '../lib/integration.mjs';
import { homedir } from 'node:os';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw failure('NODE_UNSUPPORTED', 're:desktop requires Node 24 or newer.');
  const [command = 'help', ...args] = process.argv.slice(2);
  if (!['help', 'setup', 'prefetch', 'config', 'status', 'start', 'mcp', 'codex-install', 'codex-cleanup'].includes(command)) throw failure('INVALID_ARGUMENT', 'Use re-desktop help for supported commands.');
  if (command === 'codex-cleanup') {
    if (args.length && (args.length !== 2 || args[0] !== '--runtime')) throw failure('INVALID_ARGUMENT', 'Use codex-cleanup [--runtime <absolute>]');
    let input = '';
    for await (const bytes of process.stdin) { input += bytes; if (input.length > 65536) throw failure('INVALID_ARGUMENT', 'Hook input exceeded its bound'); }
    console.log(JSON.stringify(await cleanupSession(JSON.parse(input), { root: args[1] })));
    return;
  }
  if (command === 'codex-install') {
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--codex', '--home', '--socket', '--mise'].includes(args[i]) || !args[i + 1]) throw failure('INVALID_ARGUMENT', 'Use codex-install --codex <absolute> [--home <absolute>] [--socket <absolute>] [--mise <absolute>]');
      options[args[i].slice(2)] = args[i + 1];
    }
    const launcher = options.mise ?? process.execPath;
    const launchArgs = options.mise ? ['-C', homedir(), 'exec', '--', 're-desktop', 'mcp'] : [resolve(fileURLToPath(import.meta.url)), 'mcp'];
    // Cleanup uses this already-installed local CLI directly. A mise exec hook
    // could auto-install a missing tool before the helper's bounded IPC begins.
    console.log(JSON.stringify(await installCodex({ command: options.codex, home: options.home, socket: options.socket, launcher, args: launchArgs, cleanupLauncher: process.execPath, cleanupArgs: [resolve(fileURLToPath(import.meta.url))] }), null, 2));
    return;
  }
  if (command === 'help') {
    console.log('re-desktop setup [--version <exact>] [--offline]\nre-desktop prefetch [--version <exact>] [--offline]\nre-desktop config\nre-desktop status\nre-desktop start\nre-desktop mcp\nre-desktop codex-install --codex <absolute> [--home <absolute>] [--socket <absolute>] [--mise <absolute>]\nre-desktop codex-cleanup [--runtime <absolute>]\n\nSetup verifies an exact native release and prints MCP configuration. Start is an explicit human action and clears deliberate Quit. MCP discovery/status never starts the tray; subscription may start it paused.');
    return;
  }
  let requested, offline = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--offline' && ['setup', 'prefetch'].includes(command)) offline = true;
    else if (args[i] === '--version' && ['setup', 'prefetch'].includes(command) && versionPattern.test(args[i + 1] ?? '')) requested = args[++i];
    else throw failure('INVALID_ARGUMENT', 'Unexpected option. Only setup/prefetch accept --version and --offline.');
  }
  const store = new ProgramStore();
  await ownedDirectory(store.root);
  let selection;
  try { selection = JSON.parse(await readFile(join(store.root, 'selection.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const version = requested ?? selection?.version ?? pkg.version;
  if (!versionPattern.test(version)) throw failure('RELEASE_INVALID', 'The saved release pin is invalid. Run setup with an exact version.');
  const config = () => console.log(JSON.stringify({ mcpServers: { 're-desktop': { command: process.execPath, args: [resolve(fileURLToPath(import.meta.url)), 'mcp'] } } }, null, 2));
  if (command === 'config') { config(); return; }
  const generation = await store.prepare(version, { offline });
  if (command === 'prefetch') { console.log(`Prepared re:desktop ${version} (${store.target})`); return; }
  if (command === 'setup') { await atomicJson(join(store.root, 'selection.json'), { version }); config(); return; }
  const runtime = await runtimeManager(generation);
  if (command === 'status') { console.log(JSON.stringify(await runtime.status(), null, 2)); return; }
  if (command === 'start') { console.log(JSON.stringify(await runtime.prepare({ operator: true }), null, 2)); return; }
  const { runMcp } = await import(pathToFileURL(join(generation.program, generation.asset.bridge)).href);
  await runMcp({ runtime });
}
main().catch(error => { process.stderr.write(`re:desktop: ${error.code ?? 'ERROR'}: ${error.message}\n`); process.exitCode = 1; });
