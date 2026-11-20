// Real Codex app-server, private WebSocket and model-visible warnings.
// Uses an owned runtime/socket. Never stops the user's daemon or manipulates UI.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, readdir, chmod } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startHost } from '../src/host.mjs';
import { Coordinator } from '../src/coordinator.mjs';
import { privateJson } from '../bootstrap/lib/profile.mjs';
import { withCodex, cleanupSession } from '../bootstrap/lib/integration.mjs';

const codex = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['codex'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
const root = await mkdtemp(join(tmpdir(), 'rd-codex-hb-'));
const workspace = join(root, 'workspace'); await mkdir(workspace);
const socket = join(root, 'codex.sock');
let now = 0;
const coordinator = new Coordinator({ clock: () => now, blocked: false });
const host = await startHost({ root, coordinator });
const operations = [], original = coordinator.call.bind(coordinator);
coordinator.call = (connection, method, args) => { operations.push({ method, at: now }); return original(connection, method, args); };
const config = { format: 1, command: codex, home: process.env.CODEX_HOME ?? join(homedir(), '.codex'), socket };
await privateJson(join(root, 'codex.json'), config);
let entry = resolve('src/mcp.mjs');
const entryArgs = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--entry') entry = process.argv[++i];
  else if (process.argv[i] === '--entry-arg') entryArgs.push(process.argv[++i]);
  else throw new Error('Use --entry /absolute/entry --entry-arg mcp if checking an installed bootstrap');
}
const mcp = `{re_desktop={command=${JSON.stringify(process.execPath)},args=[${[entry, ...entryArgs].map(JSON.stringify).join(',')}],env={RE_DESKTOP_RUNTIME=${JSON.stringify(root)}${process.env.RE_DESKTOP_STORE ? `,RE_DESKTOP_STORE=${JSON.stringify(process.env.RE_DESKTOP_STORE)}` : ''}}}}`;
const server = spawn(codex, ['-c', `mcp_servers=${mcp}`, '-c', 'features.apps=false', 'app-server', '--listen', `unix://${socket}`], { stdio: ['ignore', 'ignore', 'pipe'] });
let serverDiagnostic = ''; server.stderr.on('data', bytes => { serverDiagnostic = (serverDiagnostic + bytes).slice(-1500); });
let client;
const report = { version: execFileSync(codex, ['--version'], { encoding: 'utf8' }).trim(), entry, modelTurns: 0, checks: [] };
try {
  for (let n = 0; n < 200; n++) { try { if ((await stat(socket)).isSocket()) break; } catch {} if (server.exitCode !== null) throw new Error('Owned Codex exited'); await delay(50); }
  await chmod(socket, 0o600);
  client = new WebSocket('ws://localhost/', { createConnection: () => net.createConnection(socket), maxPayload: 4 * 1048576, perMessageDeflate: false });
  const events = [], pending = new Map();
  let serial = 0;
  client.on('message', bytes => {
    const message = JSON.parse(bytes.toString());
    if (message.method && Object.hasOwn(message, 'id')) client.send(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Outside this owned test' } }));
    else if (Object.hasOwn(message, 'id')) {
      const p = pending.get(message.id); if (!p) return;
      clearTimeout(p.timer); pending.delete(message.id);
      if (message.error) p.reject(new Error(JSON.stringify(message.error))); else p.resolve(message.result);
    } else events.push(message);
  });
  const failPending = () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Owned Codex connection closed')); } pending.clear(); };
  client.on('close', failPending); client.on('error', failPending);
  await new Promise((resolve, reject) => { client.once('open', resolve); client.once('error', reject); });
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); client.send(JSON.stringify({ id, method, params }) + '\n');
  });
  await call('initialize', { clientInfo: { name: 're-desktop-heartbeat-qualification', version: '1.0.0' }, capabilities: { experimentalApi: true } });
  client.send('{"method":"initialized","params":{}}\n');
  const a = await call('thread/start', { cwd: workspace, ephemeral: true, sandbox: 'read-only', approvalPolicy: 'never', historyMode: 'legacy' });
  const id = a.thread.id;
  report.model = a.model;
  await withCodex(config, async request => assert.equal((await request('thread/read', { threadId: id, includeTurns: false })).thread.id, id));
  report.checks.push('Private local WebSocket addresses the exact owned Codex thread');
  const tool = async (name, args = {}) => {
    const response = await call('mcpServer/tool/call', { threadId: id, server: 're_desktop', tool: name, arguments: args });
    const value = response.result ?? response;
    assert.equal(value.isError ?? false, false, value.content?.[0]?.text);
    return value.structuredContent ?? JSON.parse(value.content[0].text);
  };
  for (let n = 0; n < 100; n++) { const s = await call('mcpServerStatus/list', { threadId: id, serverName: 're_desktop' }); if (Object.keys(s.data[0]?.tools ?? {}).length === 11) break; await delay(100); }
  await tool('desktop_subscribe', { name: 'Heartbeat model', workspace });
  const grant = await tool('desktop_take');
  assert.equal(grant.heartbeat_timeout_ms, 900000);
  const waitFor = async (predicate, label, ms = 120000) => { const deadline = performance.now() + ms; while (performance.now() < deadline) { const value = predicate(); if (value) return value; await delay(100); } throw new Error(`${label} was not observed`); };
  const texts = () => events.filter(e => e.method === 'item/completed' && e.params.item.type === 'agentMessage').map(e => e.params.item.text);
  const start = prompt => call('turn/start', { threadId: id, input: [{ type: 'text', text: prompt }] });
  const initial = await start('This is an owned re:desktop heartbeat test using a simulated clock. Read desktop_status once, then reply WAITING. Keep the fixture subscription and grant intact. On later re:desktop heartbeat warnings, read desktop_status and explicitly acknowledge the remaining 3 or 1 minutes. Never renew, release, unsubscribe, send peer messages, manipulate the desktop or change files: the test controller owns cleanup.');
  await waitFor(() => events.some(e => e.method === 'turn/completed' && e.params.turn.id === initial.turn.id), 'initial model turn');
  assert.ok((await readdir(join(root, 'codex-sessions'))).includes(`${id}.json`), 'Real model metadata must bind its own Codex thread');
  assert.equal((await tool('desktop_status')).notifications.supported, true);
  report.checks.push('Actual model request metadata creates a private per-thread cleanup binding');
  const advance = target => {
    while (now < target) { now = Math.min(target, now + 10000); for (const session of coordinator.sessions.values()) if (session.connection) coordinator.call(session.connection, 'presence'); }
    coordinator.tick();
  };
  const before = texts().length;
  advance(720000);
  await waitFor(() => texts().length > before && texts().slice(before).some(t => /3|three/i.test(t)), 'idle model receiving the 3-minute service warning');
  report.checks.push('Expiry warning wakes the idle owned model and it acknowledges 3 minutes remaining');
  assert.equal((await tool('desktop_status')).lease.heartbeat_id, grant.lease.heartbeat_id);
  const beforeBusy = texts().length;
  const busy = await start('Continue the owned test: run sleep 8 once as a foreground shell tool. When the next re:desktop warning arrives, read status and acknowledge it. Continue to leave renewal, release and cleanup to the controller; do not manipulate the desktop or files.');
  await waitFor(() => events.some(e => e.method === 'item/started' && e.params.turnId === busy.turn.id && e.params.item.type === 'commandExecution'), 'long-running model tool');
  advance(840000);
  await waitFor(() => texts().slice(beforeBusy).some(t => /1 minute|one minute|60000|60 seconds/i.test(t)), 'active model receiving the 1-minute service warning');
  report.checks.push('Second service warning reaches an active thread running a long tool call');
  assert.equal(operations.some(o => o.method === 'heartbeat'), false, 'Delivery must not renew the heartbeat');
  assert.equal((await tool('desktop_status')).lease.heartbeat_id, grant.lease.heartbeat_id);
  advance(900000);
  assert.equal(coordinator.snapshot().holder, null);
  report.checks.push('Warnings never renew; the connected model loses access at the original 15-minute deadline');
  assert.deepEqual(await cleanupSession({ hook_event_name: 'SessionEnd', session_id: id }, { root }), { ended: true });
  assert.equal(coordinator.sessions.size, 0);
  report.checks.push('Bounded local SessionEnd cleanup works independently of the MCP connection');
  report.outputs = texts();
  report.modelTurns = new Set(events.filter(event => event.method === 'turn/started').map(event => event.params.turn.id)).size;
  report.result = 'passed';
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/codex-heartbeat-acceptance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`Codex heartbeat acceptance passed: ${report.checks.length} checks`);
} catch (error) {
  report.result = 'failed'; report.error = error.message; report.serverDiagnostic = serverDiagnostic;
  await writeFile('artifacts/codex-heartbeat-acceptance.json', JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  client?.terminate(); server.kill('SIGTERM');
  await host.close();
  await delay(500);
  await rm(root, { recursive: true, force: true });
}
