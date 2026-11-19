#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ProgramStore, atomicJson, ownedDirectory, versionPattern, failure } from '../lib/store.mjs';
import { runtimeManager } from '../lib/runtime.mjs';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw failure('NODE_UNSUPPORTED', 're:desktop requires Node 24 or newer.');
  const [command = 'help', ...args] = process.argv.slice(2);
  if (!['help', 'setup', 'prefetch', 'config', 'status', 'start', 'mcp'].includes(command)) throw failure('INVALID_ARGUMENT', 'Use re-desktop help for supported commands.');
  if (command === 'help') {
    console.log('re-desktop setup [--version <exact>] [--offline]\nre-desktop prefetch [--version <exact>] [--offline]\nre-desktop config\nre-desktop status\nre-desktop start\nre-desktop mcp\n\nSetup verifies an exact native release and prints MCP configuration. Start is an explicit human action and clears deliberate Quit. MCP discovery/status never starts the tray; subscription may start it paused.');
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
