// Local protocol check; --agent-turn opts into one actual model workflow.
// No copied auth or global configuration edits.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { startHost } from '../src/host.mjs';

const version = execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim();
const root = await mkdtemp(join(tmpdir(), 'rd-codex-'));
const host = await startHost({ root });
let modelPhase = false;
const operations = [];
const dispatch = host.coordinator.call.bind(host.coordinator);
host.coordinator.call = (connection, method, args) => {
  const before = host.coordinator.sessions.get(connection.session);
  const result = dispatch(connection, method, args);
  const name = result.you?.name ?? before?.name;
  if (modelPhase && name === 'Codex acceptance agent' && method !== 'presence') operations.push({ method, availability: result.availability, heldByCaller: Boolean(result.holder && result.holder.session_id === result.you?.session_id), remainingMs: result.lease?.remaining_ms ?? null });
  return result;
};
const config = `{re_desktop={command=${JSON.stringify(process.execPath)},args=[${JSON.stringify(resolve('src/mcp.mjs'))}],env={RE_DESKTOP_RUNTIME=${JSON.stringify(root)}}}}`;
const child = spawn('codex', ['-c', `mcp_servers=${config}`, '-c', 'features.apps=false', 'app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'pipe'] });
const pending = new Map();
let sequence = 0, buffer = '', diagnosticBytes = 0;
const events = [];
child.stderr.on('data', bytes => { diagnosticBytes += bytes.length; });
child.stdout.on('data', bytes => {
  buffer += bytes.toString('utf8');
  let end;
  while ((end = buffer.indexOf('\n')) !== -1) {
    const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    if (message.method && Object.hasOwn(message, 'id')) {
      child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Outside this local protocol qualification' } }) + '\n');
    } else if (Object.hasOwn(message, 'id')) {
      const item = pending.get(message.id);
      if (!item) continue;
      clearTimeout(item.timer); pending.delete(message.id);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.code} ${message.error.message}`));
      else item.resolve(message.result);
    } else if (['item/completed', 'turn/completed'].includes(message.method)) events.push(message);
  }
});
const call = (method, params) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Codex timed out: ${method}`)); }, 15000);
  pending.set(id, { resolve, reject, timer, method });
  child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
});
const report = { codex: version, node: process.version, platform: process.platform, started: new Date().toISOString(), modelTurns: 0, globalConfigurationChanged: false, checks: [] };
try {
  await call('initialize', { clientInfo: { name: 're-desktop-qualification', version: '0.1.0' }, capabilities: { experimentalApi: true } });
  child.stdin.write('{"method":"initialized","params":{}}\n');
  const start = () => call('thread/start', { cwd: process.cwd(), ephemeral: true, sandbox: 'read-only', approvalPolicy: 'never', historyMode: 'legacy', baseInstructions: 'Local MCP protocol qualification only. No model turn is requested.' });
  const a = (await start()).thread.id, b = (await start()).thread.id;
  for (const threadId of [a, b]) {
    let server;
    for (let attempt = 0; attempt < 100; attempt++) {
      const status = await call('mcpServerStatus/list', { threadId, serverName: 're_desktop' });
      server = status.data.find(s => s.name === 're_desktop');
      if (server && Object.keys(server.tools).length === 9) break;
      if (child.exitCode !== null) throw new Error('Owned Codex app-server exited');
      await delay(100);
    }
    assert.equal(Object.keys(server?.tools ?? {}).length, 9);
    assert.equal(server.serverInfo.name, 're-desktop');
  }
  report.checks.push('Two actual Codex ephemeral threads discovered all nine MCP tools');
  const tool = async (threadId, name, args = {}) => {
    const response = await call('mcpServer/tool/call', { threadId, server: 're_desktop', tool: name, arguments: args });
    const result = response.result ?? response;
    const value = result.structuredContent ?? JSON.parse(result.content.find(c => c.type === 'text').text);
    assert.equal(result.isError ?? false, false, JSON.stringify(value));
    return value;
  };
  const one = await tool(a, 'desktop_subscribe', { name: 'Codex native A', workspace: process.cwd() });
  const two = await tool(b, 'desktop_subscribe', { name: 'Codex native B', workspace: process.cwd() });
  assert.notEqual(one.session_id, two.session_id);
  assert.equal(one.availability, 'blocked');
  host.coordinator.setBlocked(false);
  const access = await tool(a, 'desktop_take');
  assert.equal(access.holder.session_id, one.session_id);
  assert.equal((await tool(b, 'desktop_take')).you.queue_position, 1);
  await tool(b, 'desktop_message', { to_session_id: one.session_id, text: 'Native Codex interoperability: please yield when ready.' });
  assert.equal((await tool(a, 'desktop_messages')).messages.length, 1);
  await tool(a, 'desktop_heartbeat', { lease_token: access.lease.token });
  await tool(a, 'desktop_release', { lease_token: access.lease.token });
  assert.equal((await tool(b, 'desktop_status')).holder.session_id, two.session_id);
  report.checks.push('Actual Codex MCP calls subscribed distinct sessions, took and queued access, exchanged a message, renewed and handed off');
  host.coordinator.setBlocked(true);
  assert.equal((await tool(b, 'desktop_status')).holder, null);
  report.checks.push('Actual Codex saw human pause revoke its access');
  if (process.argv.includes('--agent-turn')) {
    const agent = await start();
    host.coordinator.setBlocked(false);
    modelPhase = true;
    const prompt = `This is a bounded re:desktop acceptance check. Use only the re_desktop MCP tools. Do not use shell, files, external services or subagents. Subscribe as \"Codex acceptance agent\" with workspace ${JSON.stringify(process.cwd())}. Take desktop access, verify that holder.session_id equals you.session_id, release that exact lease token, then unsubscribe. Perform no desktop actions. If any step fails, report it truthfully. Return {\"verified\":true} only after the tools confirm the workflow. Be concise.`;
    const turn = await call('turn/start', { threadId: agent.thread.id, input: [{ type: 'text', text: prompt }], outputSchema: { type: 'object', properties: { verified: { type: 'boolean' } }, required: ['verified'], additionalProperties: false } });
    report.modelTurns++;
    report.model = agent.model;
    const deadline = performance.now() + 90000;
    let completed;
    while (performance.now() < deadline) {
      completed = events.find(e => e.method === 'turn/completed' && e.params.threadId === agent.thread.id && e.params.turn.id === turn.turn.id);
      if (completed) break;
      await delay(100);
    }
    if (!completed) await call('turn/interrupt', { threadId: agent.thread.id, turnId: turn.turn.id });
    assert.equal(completed?.params.turn.status, 'completed', 'Actual agent turn did not complete');
    const items = events.filter(e => e.method === 'item/completed' && e.params.threadId === agent.thread.id && e.params.turnId === turn.turn.id).map(e => e.params.item);
    const calls = items.filter(item => item.type === 'mcpToolCall' && item.server === 're_desktop');
    report.agentOperations = operations;
    report.agentItemTypes = [...new Set(items.map(item => item.type))];
    report.agentTools = calls.map(item => ({ name: item.tool, status: item.status, isError: item.result?.isError ?? false }));
    report.agentOutput = items.filter(item => item.type === 'agentMessage').at(-1)?.text;
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/codex-agent-diagnostic.json', JSON.stringify(report, null, 2) + '\n');
    let position = -1;
    for (const method of ['subscribe', 'take', 'release', 'unsubscribe']) {
      const next = operations.findIndex((o, index) => index > position && o.method === method);
      assert.ok(next >= 0, `Actual agent did not complete ${method}; see artifacts/codex-agent-diagnostic.json`);
      position = next;
    }
    assert.equal(operations.find(o => o.method === 'take').heldByCaller, true);
    assert.deepEqual(JSON.parse(items.filter(item => item.type === 'agentMessage').at(-1).text), { verified: true });
    modelPhase = false;
    report.checks.push('One actual model turn naturally used the MCP subscription, take, release and unsubscribe workflow');
    assert.equal(host.coordinator.snapshot().holder, null);
  }
  report.finished = new Date().toISOString();
  report.diagnosticBytes = diagnosticBytes;
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/codex-acceptance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`Codex interoperability passed: ${version}; ${report.checks.length} checks; model turns: ${report.modelTurns}`);
} finally {
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Qualification closed')); }
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    await exited; clearTimeout(timer);
  }
  await host.close();
  await rm(root, { recursive: true, force: true });
}
