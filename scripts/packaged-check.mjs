import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { mcpClient, tool } from './mcp-client.mjs';
import { startHost } from '../src/host.mjs';

const execute = promisify(execFile);
const folder = resolve(`dist/re-desktop-${process.platform}-${process.arch}`);
const command = join(folder, process.platform === 'darwin' ? 're-desktop.app/Contents/MacOS/re-desktop' : process.platform === 'win32' ? 're-desktop.exe' : 're-desktop');
const entry = join(folder, process.platform === 'darwin' ? 're-desktop.app/Contents/Resources' : 'resources', 'app.asar/src/mcp.mjs');
const native = process.platform === 'darwin' && !process.argv.includes('--headless');
const root = await mkdtemp(join(tmpdir(), 'rd-pkg-'));
const report = { observedAt: new Date().toISOString(), platform: process.platform, package: folder, nativeHost: native, checks: [] };
let app, host, a, b, appExit, diagnostics = '';
try {
  if (native) {
    const env = { ...process.env, RE_DESKTOP_RUNTIME: root, RE_DESKTOP_TEST_TRACE: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    app = spawn(command, [], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'] });
    appExit = once(app, 'exit');
    app.stderr.on('data', bytes => { diagnostics += bytes; });
  } else host = await startHost({ root });
  a = await mcpClient(root, 'packaged-a', { command, entry });
  b = await mcpClient(root, 'packaged-b', { command, entry });
  assert.equal((await a.client.listTools()).tools.length, 9);
  let ready;
  for (let attempt = 0; attempt < 60; attempt++) {
    ready = await tool(a.client, 'desktop_status');
    if (!ready.result.isError) break;
    await delay(50);
  }
  assert.equal(ready.data.availability, 'blocked');
  report.checks.push('Packaged Electron Node mode loads the ASAR MCP entry and all nine tools without external Node');
  const one = (await tool(a.client, 'desktop_subscribe', { name: 'Packaged A', workspace: root })).data;
  const two = (await tool(b.client, 'desktop_subscribe', { name: 'Packaged B', workspace: root })).data;
  if (native) {
    await execute(resolve('build/macos-menu'), [String(app.pid), 'Allow agent access'], { timeout: 5000 });
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await tool(a.client, 'desktop_status')).data.user_blocked === false) break;
      await delay(50);
    }
    assert.equal((await tool(a.client, 'desktop_status')).data.user_blocked, false, diagnostics);
    report.checks.push('Native packaged tray accepted Allow agent access through verified Accessibility bounds');
  } else host.coordinator.setBlocked(false);
  const access = (await tool(a.client, 'desktop_take')).data;
  assert.equal(access.holder.session_id, one.session_id);
  assert.equal((await tool(b.client, 'desktop_take')).data.you.queue_position, 1);
  await tool(a.client, 'desktop_release', { lease_token: access.lease.token });
  assert.equal((await tool(b.client, 'desktop_status')).data.holder.session_id, two.session_id);
  report.checks.push('Two packaged MCP bridges subscribed, contended and handed off access');
  if (native) {
    await execute(resolve('build/macos-menu'), [String(app.pid), 'Pause agent access'], { timeout: 5000 });
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await tool(a.client, 'desktop_status')).data.user_blocked) break;
      await delay(50);
    }
    assert.equal((await tool(b.client, 'desktop_status')).data.holder, null);
    report.checks.push('Native packaged pause revoked access');
    await execute(resolve('build/macos-menu'), [String(app.pid), 'Quit re:desktop'], { timeout: 5000 });
    const timeout = setTimeout(() => app.kill('SIGKILL'), 5000);
    const [code, signal] = await appExit;
    clearTimeout(timeout);
    assert.equal(code, 0, `Packaged app failed to quit: ${signal ?? diagnostics}`);
    report.checks.push('Native Quit completed cleanly while both MCP clients remained connected');
  } else { await host.close(); host = null; }
  const stopped = await tool(a.client, 'desktop_status');
  assert.equal(stopped.result.isError, true);
  assert.equal(stopped.data.error.code, 'HOST_UNAVAILABLE');
  assert.doesNotMatch(diagnostics, /TypeError|Object has been destroyed|Uncaught Exception/);
  report.checks.push('Surviving packaged bridge reported host unavailability after shutdown');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/packaged-acceptance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`Packaged acceptance passed (${report.checks.length} checks; native host: ${native})`);
} finally {
  await a?.client.close(); await b?.client.close();
  await host?.close();
  if (app && app.exitCode === null && app.signalCode === null) { app.kill('SIGTERM'); await appExit; }
  await rm(root, { recursive: true, force: true });
}
