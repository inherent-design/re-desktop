import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startHost } from '../src/host.mjs';
import { mcpClient, tool } from '../scripts/mcp-client.mjs';
import { codexThread, cleanupSession, installCodex, saveBinding } from '../bootstrap/lib/integration.mjs';
import { privateJson } from '../bootstrap/lib/profile.mjs';
import { apiOffer } from '../src/api.mjs';

test('Codex identity comes from client metadata, with bounded path-safe attribution', () => {
  assert.equal(codexThread({ threadId: 'thr_test-123' }), 'thr_test-123');
  assert.equal(codexThread({ 'x-codex-turn-metadata': JSON.stringify({ thread_id: 'thread_2' }) }), 'thread_2');
  assert.equal(codexThread({ 'x-codex-turn-metadata': { thread_id: 'thread_3' } }), 'thread_3');
  for (const value of ['../victim', '/absolute', '', 'a'.repeat(101)]) assert.equal(codexThread({ threadId: value }), null);
  assert.equal(codexThread({ 'x-codex-turn-metadata': '{invalid' }), null);
});

test('real MCP hides cleanup capabilities, binds one Codex thread, and cleans only its holder', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rd-integration-'));
  const host = await startHost({ root });
  const a = await mcpClient(root), b = await mcpClient(root);
  t.after(async () => { await a.client.close(); await b.client.close(); await host.close(); await rm(root, { recursive: true, force: true }); });
  await privateJson(join(root, 'codex.json'), { format: 1, command: process.execPath, home: root });
  const response = await a.client.callTool({ name: 'desktop_subscribe', arguments: { name: 'Scoped A', workspace: root }, _meta: { threadId: 'thread_a' } });
  const one = response.structuredContent;
  assert.equal(response.isError ?? false, false);
  assert.equal('cleanup_token' in one, false);
  assert.equal(JSON.stringify(response).includes('cleanup_token'), false);
  assert.equal(one.notifications.supported, true);
  const bindingPath = join(root, 'codex-sessions/thread_a.json');
  const binding = JSON.parse(await readFile(bindingPath));
  assert.equal(binding.session_id, one.session_id);
  assert.match(binding.cleanup_token, /^[a-f0-9]{64}$/);
  if (process.platform !== 'win32') assert.equal((await stat(bindingPath)).mode & 0o777, 0o600);
  const mismatch = await a.client.callTool({ name: 'desktop_status', arguments: {}, _meta: { threadId: 'thread_b' } });
  assert.equal(mismatch.isError, true);
  assert.match(mismatch.content[0].text, /CLIENT_SESSION_MISMATCH/);
  const two = (await tool(b.client, 'desktop_subscribe', { name: 'Scoped B', workspace: root })).data;
  host.coordinator.setBlocked(false);
  await tool(a.client, 'desktop_take'); await tool(b.client, 'desktop_take');
  assert.deepEqual(await cleanupSession({ hook_event_name: 'SessionEnd', session_id: 'thread_a' }, { root }), { ended: true });
  assert.equal((await tool(b.client, 'desktop_status')).data.holder.session_id, two.session_id);
  assert.equal(host.server.listening, true);
  assert.equal((await readdir(join(root, 'codex-sessions'))).length, 0);
  assert.deepEqual(await cleanupSession({ hook_event_name: 'SessionEnd', session_id: 'thread_a' }, { root }), { ended: false });
  assert.equal((await tool(a.client, 'desktop_take')).data.error.code, 'SESSION_ENDED');
});

test('cleanup without a profile is a no-op and does not start or create anything', async t => {
  const parent = await mkdtemp(join(tmpdir(), 'rd-no-cleanup-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  assert.deepEqual(await cleanupSession({ hook_event_name: 'SessionEnd', session_id: 'known_thread' }, { root: join(parent, 'missing') }), { ended: false });
  assert.deepEqual(await readdir(parent), []);
  await assert.rejects(cleanupSession({ hook_event_name: 'SessionEnd', session_id: '../other' }, { root: parent }), /identity/);
  await assert.rejects(cleanupSession({ hook_event_name: 'PostToolUse', session_id: 'known_thread' }, { root: parent }), /Unsupported/);
});

test('an unavailable optional cleanup store does not turn a successful subscription into an ambiguous failure', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rd-optional-'));
  const host = await startHost({ root });
  const client = await mcpClient(root);
  t.after(async () => { await client.client.close(); await host.close(); await rm(root, { recursive: true, force: true }); });
  await privateJson(join(root, 'codex.json'), { format: 1, command: process.execPath, home: root });
  await writeFile(join(root, 'codex-sessions'), 'unexpected entry', { mode: 0o600 });
  const response = await client.client.callTool({ name: 'desktop_subscribe', arguments: { name: 'Still coordinated', workspace: root }, _meta: { threadId: 'owned_thread' } });
  assert.equal(response.isError ?? false, false);
  assert.ok(response.structuredContent.you.session_id);
  assert.equal(response.structuredContent.notifications.last_status, 'failed');
  assert.equal(JSON.stringify(response).includes('cleanup_token'), false);
});

test('subagent cleanup uses its own identity; false capabilities and public IDs cannot release access', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rd-subagent-'));
  const host = await startHost({ root });
  t.after(async () => { await host.close(); await rm(root, { recursive: true, force: true }); });
  const connection = {}, session = host.coordinator.call(connection, 'subscribe', { name: 'Child', workspace: root });
  await saveBinding(host.paths, 'child_id', session, apiOffer());
  const path = join(root, 'codex-sessions/child_id.json');
  const value = JSON.parse(await readFile(path));
  await privateJson(path, { ...value, cleanup_token: '0'.repeat(64) });
  await assert.rejects(cleanupSession({ hook_event_name: 'SubagentStop', session_id: 'parent_id', agent_id: 'child_id' }, { root }), /refused/);
  assert.equal(host.coordinator.sessions.size, 1);
  await privateJson(path, value);
  assert.deepEqual(await cleanupSession({ hook_event_name: 'SubagentStop', session_id: 'parent_id', agent_id: 'child_id' }, { root }), { ended: true });
});

test('Codex installation preserves other hook groups and is idempotent with literal launch paths', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rd-install-'));
  const home = join(root, 'Codex home ☁'); await mkdir(home);
  t.after(() => rm(root, { recursive: true, force: true }));
  const original = { description: 'Retain me', hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'other-hook' }] }], SessionEnd: [{ hooks: [{ type: 'command', command: 'existing-end' }] }] } };
  await writeFile(join(home, 'hooks.json'), JSON.stringify(original));
  const calls = [], args = [resolve('bootstrap/bin/re-desktop.mjs'), 'mcp'];
  for (let n = 0; n < 2; n++) await installCodex({ command: process.execPath, home, launcher: process.execPath, args, root: join(root, 'profile'), executeCommand: async (...params) => calls.push(params) });
  const result = JSON.parse(await readFile(join(home, 'hooks.json')));
  assert.equal(result.description, original.description);
  assert.deepEqual(result.hooks.PostToolUse, original.hooks.PostToolUse);
  assert.equal(result.hooks.SessionEnd.length, 2);
  assert.equal(result.hooks.SubagentStop.length, 1);
  assert.match(result.hooks.SessionEnd[1].hooks[0].command, /codex-cleanup/);
  assert.equal(result.hooks.SessionEnd[1].hooks[0].timeout, 3);
  assert.deepEqual(calls[0][1], ['mcp', 'add', 're_desktop', '--', process.execPath, ...args]);
  assert.equal(calls[0][2].env.CODEX_HOME, home);
  await installCodex({ command: process.execPath, home, launcher: resolve('mise-launcher'), args: ['-C', home, 'exec', '--', 're-desktop', 'mcp'], cleanupLauncher: process.execPath, cleanupArgs: [resolve('bootstrap/bin/re-desktop.mjs')], root: join(root, 'profile'), executeCommand: async (...params) => calls.push(params) });
  const updated = JSON.parse(await readFile(join(home, 'hooks.json')));
  assert.equal(updated.hooks.SessionEnd.length, 2);
  assert.ok(!updated.hooks.SessionEnd[1].hooks[0].command.includes('mise-launcher'), 'Cleanup must use installed local bytes, without mise auto-install');
  assert.equal(calls.at(-1)[1][4], resolve('mise-launcher'));
});
