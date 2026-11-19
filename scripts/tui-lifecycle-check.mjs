import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { startHost } from '../src/host.mjs';

const report = { version: execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim(), platform: process.platform, started: new Date().toISOString(), modelTurns: 0, cases: [] };
if (process.argv.includes('--remote-only')) {
  const previous = JSON.parse(await readFile('artifacts/tui-lifecycle.json'));
  assert.equal(previous.version, report.version);
  report.cases.push(...previous.cases.filter(c => c.mode !== 'remote-server').map(c => ({ observedAt: previous.started, ...c })));
}
for (const mode of process.argv.includes('--remote-only') ? ['remote-server'] : ['no-daemon', 'default', 'remote-server']) {
  const root = await mkdtemp(join(tmpdir(), 'rd-tui-'));
  const host = await startHost({ root });
  const probe = join(root, 'probe.json');
  const config = `{lifecycle_probe={command=${JSON.stringify(process.execPath)},args=[${JSON.stringify(resolve('scripts/fixtures/lifecycle-bridge.mjs'))}],cwd=${JSON.stringify(process.cwd())},env={RE_DESKTOP_RUNTIME=${JSON.stringify(root)},RE_DESKTOP_PROBE_FILE=${JSON.stringify(probe)},RE_DESKTOP_PROBE_MODE=${JSON.stringify(mode)}}}}`;
  let server;
  const args = ['--no-alt-screen'];
  if (mode === 'remote-server') {
    const socket = join(root, 'codex.sock');
    server = spawn('codex', ['-c', `mcp_servers=${config}`, 'app-server', '--listen', `unix://${socket}`], { stdio: ['ignore', 'ignore', 'ignore'] });
    for (let tries = 0; tries < 100; tries++) {
      try { if ((await stat(socket)).isSocket()) break; } catch {}
      if (server.exitCode !== null) throw new Error('Owned remote app-server exited');
      await delay(50);
    }
    args.push('--remote', `unix://${socket}`);
  } else args.push('-c', `mcp_servers=${config}`);
  if (mode === 'no-daemon') args.unshift('--no-daemon');
  await writeFile(join(root, 'args.json'), JSON.stringify(args));
  const fixture = spawn('python3', ['scripts/fixtures/tui-pty.py', join(root, 'args.json')], { stdio: ['pipe', 'pipe', 'pipe'] });
  let tuiPid, exited = false, instrument, output = '', snapshot, folderTrustAcknowledged = false;
  fixture.stdout.on('data', bytes => {
    output += bytes;
    let end;
    while ((end = output.indexOf('\n')) !== -1) {
      const event = JSON.parse(output.slice(0, end)); output = output.slice(end + 1);
      if (event.event === 'started') tuiPid = event.pid;
      if (event.event === 'exited') exited = true;
      if (event.event === 'snapshot') snapshot = event.text;
    }
  });
  fixture.stderr.resume();
  try {
    for (let tries = 0; tries < 200; tries++) {
      try { instrument = JSON.parse(await readFile(probe, 'utf8')); break; } catch {}
      if (exited) throw new Error(`${mode} TUI exited before MCP initialization`);
      if (tries === 20) {
        fixture.stdin.write('{"snapshot":true}\n');
        await delay(100);
        if (snapshot?.includes('Trust this folder?') && snapshot.includes(process.cwd()) && snapshot.includes('1. Trust and continue')) {
          if (!process.argv.includes('--trust-owned-project')) throw new Error('The new project needs Codex folder trust; inspect it, then explicitly pass --trust-owned-project');
          fixture.stdin.write(JSON.stringify({ input: '\r' }) + '\n');
          folderTrustAcknowledged = true;
        }
      }
      await delay(100);
    }
    if (!instrument) {
      fixture.stdin.write('{"snapshot":true}\n');
      await delay(300);
    }
    assert.ok(instrument, `${mode}: no bridge observed within 20 seconds; owned TUI screen: ${snapshot}`);
    assert.ok(tuiPid);
    const before = host.coordinator.snapshot();
    assert.equal(before.sessions.length, 1);
    assert.equal(before.sessions[0].connected, true);
    const entry = { mode, observedAt: new Date().toISOString(), tuiPid, bridgePid: instrument.pid, bridgeParent: instrument.parent, bridgeParentIsTui: instrument.parent === tuiPid, ownedServerPid: server?.pid, folderTrustAcknowledged };
    const started = performance.now();
    fixture.stdin.write('{"kill":"SIGKILL"}\n');
    for (let tries = 0; tries < 60; tries++) {
      if (!host.coordinator.snapshot().sessions.some(s => s.connected)) break;
      await delay(50);
    }
    entry.disconnectedWithin3Seconds = !host.coordinator.snapshot().sessions.some(s => s.connected);
    entry.observationMs = Math.round(performance.now() - started);
    if (server) entry.serverStillRunning = server.exitCode === null && server.signalCode === null;
    report.cases.push(entry);
    console.log(`${mode}: ${JSON.stringify(entry)}`);
  } finally {
    if (tuiPid && !exited) fixture.stdin.write('{"kill":"SIGKILL"}\n');
    if (fixture.exitCode === null && fixture.signalCode === null) {
      const closed = once(fixture, 'exit');
      const timer = setTimeout(() => fixture.kill('SIGKILL'), 2000);
      await closed; clearTimeout(timer);
    }
    if (instrument) {
      // Only the exact PID from this owned fixture; verify its command before cleanup.
      try {
        const command = execFileSync('ps', ['-p', String(instrument.pid), '-o', 'command='], { encoding: 'utf8' });
        if (command.includes(resolve('scripts/fixtures/lifecycle-bridge.mjs'))) process.kill(instrument.pid, 'SIGTERM');
      } catch {}
    }
    if (server && server.exitCode === null && server.signalCode === null) {
      const stopped = once(server, 'exit');
      server.kill('SIGTERM');
      const timer = setTimeout(() => server.kill('SIGKILL'), 2000);
      await stopped; clearTimeout(timer);
    }
    await host.close();
    await rm(root, { recursive: true, force: true });
  }
}
report.finished = new Date().toISOString();
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/tui-lifecycle.json', JSON.stringify(report, null, 2) + '\n');
