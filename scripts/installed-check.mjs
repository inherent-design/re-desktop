import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { mcpClient, tool } from './mcp-client.mjs';
import { ProgramStore } from '../bootstrap/lib/store.mjs';

const execute = promisify(execFile);
const args = process.argv.slice(2);
const cliIndex = args.indexOf('--cli');
if (cliIndex === -1 || !isAbsolute(args[cliIndex + 1] ?? '') || process.platform !== 'darwin') throw new Error('Use --cli /absolute/installed/bin/re-desktop.mjs on macOS with the owned Accessibility helper');
const cli = args[cliIndex + 1], local = args.includes('--local-archive');
const { version } = JSON.parse(await readFile('package.json'));
const root = await mkdtemp(join(tmpdir(), 'rd-e2e-'));
const store = join(root, 'programs with spaces ☁'), runtime = join(root, 'run');
const env = { ...process.env, RE_DESKTOP_STORE: store, RE_DESKTOP_RUNTIME: runtime };
const report = { observedAt: new Date().toISOString(), version, cli, installedFromRelease: !local, platform: process.platform, checks: [] };
let a, b, pid;
const cliCall = (...argv) => execute(process.execPath, [cli, ...argv], { env, timeout: 240000, maxBuffer: 1048576 });
const menu = label => execute(resolve('build/macos-menu'), [String(pid), label], { timeout: 5000 });
const until = async predicate => { const deadline = Date.now() + 8000; while (Date.now() < deadline) { if (await predicate()) return; await delay(50); } throw new Error('Installed smoke condition timed out'); };
const readPid = async () => Number(await readFile(join(runtime, 'host.pid'), 'utf8'));
try {
  if (local) {
    const archive = resolve('dist', `re-desktop-${version}-darwin-arm64.tar.gz`);
    const identity = JSON.parse(await readFile(`${archive}.json`));
    await new ProgramStore({ root: store, acquire: async args => { await cp(archive, args.archive); return { format: 1, repository: 'inherent-design/re-desktop', version, source: identity.source, api: identity.api, targets: [identity.asset] }; } }).prepare(version);
  }
  const config = JSON.parse((await cliCall('setup', '--version', version)).stdout);
  const selected = config.mcpServers['re-desktop'];
  assert.equal(selected.command, process.execPath);
  assert.deepEqual(selected.args, [cli, 'mcp']);
  report.checks.push('CLI setup verified the exact native release and printed literal absolute MCP arguments');
  assert.equal(JSON.parse((await cliCall('status')).stdout).host_running, false);
  a = await mcpClient(runtime, 'installed-a', { args: selected.args, env: { RE_DESKTOP_STORE: store } });
  b = await mcpClient(runtime, 'installed-b', { args: selected.args, env: { RE_DESKTOP_STORE: store } });
  assert.equal((await a.client.listTools()).tools.length, 11);
  assert.equal((await tool(a.client, 'desktop_runtime_status')).data.host_running, false);
  report.checks.push('Installed MCP discovery and runtime status exposed eleven tools without starting a tray');
  const [one, two] = await Promise.all([
    tool(a.client, 'desktop_subscribe', { name: 'Installed A', workspace: root }),
    tool(b.client, 'desktop_subscribe', { name: 'Installed B', workspace: root })
  ]);
  assert.equal(one.data.user_blocked, true);
  assert.equal(two.data.user_blocked, true);
  pid = await readPid();
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  const ready = (await tool(a.client, 'desktop_runtime_status')).data;
  assert.equal(ready.agreement.shared_api, 1);
  assert.equal(ready.agreement.host_version, version);
  report.source = ready.source;
  report.checks.push('Concurrent first subscriptions converged on one authenticated native host, initially paused');
  await menu('Allow agent access');
  await until(async () => !(await tool(a.client, 'desktop_status')).data.user_blocked);
  const access = (await tool(a.client, 'desktop_take')).data;
  assert.equal(access.holder.session_id, one.data.session_id);
  assert.equal((await tool(b.client, 'desktop_take')).data.you.queue_position, 1);
  process.kill(a.transport.pid, 'SIGKILL');
  await until(async () => (await tool(b.client, 'desktop_status')).data.holder?.session_id === two.data.session_id);
  assert.equal(await readPid(), pid);
  report.checks.push('Native Allow granted access; killing the installed holder bridge handed off immediately while the shared tray survived');
  await menu('Pause agent access');
  await until(async () => (await tool(b.client, 'desktop_status')).data.user_blocked);
  assert.equal((await tool(b.client, 'desktop_status')).data.holder, null);
  await menu('Quit re:desktop');
  await until(async () => !(await tool(b.client, 'desktop_runtime_status')).data.host_running);
  assert.equal((await tool(b.client, 'desktop_runtime_prepare')).data.error.code, 'HOST_START_REFUSED');
  assert.equal((await tool(b.client, 'desktop_subscribe', { name: 'Refused restart', workspace: root })).data.error.code, 'HOST_START_REFUSED');
  assert.equal((await tool(b.client, 'desktop_runtime_status')).data.human_quit, true);
  report.checks.push('Native pause revoked access; deliberate Quit stopped the tray and surviving bridges could not respawn it');
  const resumed = JSON.parse((await cliCall('start')).stdout);
  assert.equal(resumed.host_running, true);
  assert.equal(resumed.human_quit, false);
  pid = await readPid();
  const fresh = (await tool(b.client, 'desktop_status')).data;
  assert.equal(fresh.user_blocked, true);
  assert.notEqual(fresh.you.session_id, two.data.session_id);
  assert.equal(fresh.holder, null);
  report.checks.push('Explicit operator start cleared Quit and produced a fresh paused host and session identity');
  await cliCall('setup', '--offline', '--version', version);
  report.checks.push('Installed CLI reused and reverified the prepared generation offline');
  await menu('Quit re:desktop');
  await until(async () => !(await tool(b.client, 'desktop_runtime_status')).data.host_running);
  pid = null;
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/installed-acceptance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`Installed native acceptance passed (${report.checks.length} checks; published: ${!local})`);
} finally {
  await a?.client.close(); await b?.client.close();
  if (pid) { try { process.kill(pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  await rm(root, { recursive: true, force: true });
}
