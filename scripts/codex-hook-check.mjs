// Account-free lifecycle check in a completely owned Codex home and app-server.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, stat, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startHost } from '../src/host.mjs';
import { installCodex, withCodex } from '../bootstrap/lib/integration.mjs';
import { privateJson } from '../bootstrap/lib/profile.mjs';
import { mcpClient, tool } from './mcp-client.mjs';

const codex = execFileSync('which', ['codex'], { encoding: 'utf8' }).trim();
const root = await mkdtemp(join(tmpdir(), 'rd-hook-'));
const home = join(root, 'codex-home'), workspace = join(root, 'workspace');
await mkdir(home, { mode: 0o700 }); await mkdir(workspace);
await writeFile(join(home, 'config.toml'), '[hooks.state.unrelated]\ntrusted_hash = "preserve-this"\n');
const socket = join(root, 'server.sock'), host = await startHost({ root: join(root, 'runtime') });
const config = { command: codex, home, socket };
await installCodex({ ...config, launcher: process.execPath, args: [resolve('bootstrap/bin/re-desktop.mjs'), 'mcp'], root: host.paths.root, executeCommand: async () => ({ stdout: '' }) });
const server = spawn(codex, ['-c', 'mcp_servers={}', '-c', 'features.apps=false', 'app-server', '--listen', `unix://${socket}`], { env: { ...process.env, CODEX_HOME: home }, stdio: ['ignore', 'ignore', 'pipe'] });
server.stderr.resume();
let client;
const report = { checks: [], inference: false };
try {
  for (let n = 0; n < 100; n++) { try { if ((await stat(socket)).isSocket()) break; } catch {} await delay(50); }
  const inventory = await withCodex(config, request => request('hooks/list', { cwds: [workspace] }));
  const selected = inventory.data.flatMap(d => d.hooks).filter(h => h.statusMessage === 're:desktop session cleanup');
  assert.equal(selected.length, 2);
  assert.deepEqual(selected.map(h => h.eventName).sort(), ['sessionEnd', 'subagentStop']);
  const installed = await installCodex({ ...config, launcher: process.execPath, args: [resolve('bootstrap/bin/re-desktop.mjs'), 'mcp'], root: host.paths.root, executeCommand: async () => ({ stdout: '' }) });
  assert.equal(installed.hook_trust, 'trusted');
  assert.match(await readFile(join(home, 'config.toml'), 'utf8'), /preserve-this/);
  report.checks.push('Native hook discovery finds SessionEnd and SubagentStop; exact reviewed hashes are trusted using the supported configuration API');
  const created = await withCodex(config, request => request('thread/start', { cwd: workspace, sandbox: 'read-only', approvalPolicy: 'never', historyMode: 'legacy' }));
  const id = created.thread.id;
  const proxied = await withCodex(config, request => request('thread/read', { threadId: id, includeTurns: false }), { proxy: true });
  assert.equal(proxied.thread.id, id);
  report.checks.push('The official byte proxy carries the same WebSocket RPC used for the Windows adapter');
  client = await mcpClient(host.paths.root);
  const response = await client.client.callTool({ name: 'desktop_subscribe', arguments: { name: 'Owned hook participant', workspace }, _meta: { threadId: id } });
  assert.equal(response.isError ?? false, false);
  host.coordinator.setBlocked(false); await tool(client.client, 'desktop_take');
  assert.equal(host.coordinator.sessions.size, 1);
  await withCodex(config, request => request('thread/archive', { threadId: id }));
  for (let n = 0; n < 100 && host.coordinator.sessions.size; n++) await delay(50);
  assert.equal(host.coordinator.sessions.size, 0, 'Archiving the owned Codex session must invoke its actual cleanup command');
  assert.deepEqual(await readdir(join(host.paths.root, 'codex-sessions')), []);
  assert.equal(host.server.listening, true);
  const retired = await tool(client.client, 'desktop_take');
  assert.equal(retired.data.error.code, 'SESSION_ENDED');
  report.checks.push('Actual Codex SessionEnd runs after MCP teardown and retires only the mapped participant through local IPC, leaving the shared host alive');
  const hookPath = join(home, 'hooks.json');
  const hooks = JSON.parse(await readFile(hookPath, 'utf8'));
  for (const groups of Object.values(hooks.hooks)) for (const group of groups) group.hooks = group.hooks.filter(h => h.statusMessage !== 're:desktop session cleanup');
  await privateJson(hookPath, hooks);
  const removed = await withCodex(config, request => request('hooks/list', { cwds: [workspace] }));
  assert.equal(removed.data.flatMap(d => d.hooks).filter(h => h.statusMessage === 're:desktop session cleanup').length, 0);
  report.checks.push('Removing only the documented cleanup handlers removes them from native discovery and preserves unrelated configuration');
  report.result = 'passed';
  await import('node:fs/promises').then(fs => fs.writeFile('artifacts/codex-hook-acceptance.json', JSON.stringify(report, null, 2) + '\n'));
  console.log(`Codex lifecycle hook acceptance passed: ${report.checks.length} checks`);
} catch (error) {
  report.result = 'failed'; report.error = error.message; report.rpcError = error.rpcError;
  await import('node:fs/promises').then(fs => fs.writeFile('artifacts/codex-hook-acceptance.json', JSON.stringify(report, null, 2) + '\n'));
  throw error;
} finally {
  await client?.client.close(); server.kill('SIGTERM'); await host.close(); await delay(500);
  await rm(root, { recursive: true, force: true });
}
