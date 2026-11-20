import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { startHost } from '../src/host.mjs';
import { Peer } from '../src/peer.mjs';
import { Coordinator } from '../src/coordinator.mjs';
import { ClientIntegration } from '../src/client.mjs';
import { privateJson } from '../bootstrap/lib/profile.mjs';
import { withCodex } from '../bootstrap/lib/integration.mjs';

for (const mode of ['accepted', 'refused', 'closed', 'renewed-during-delivery']) {
  test(`private Codex warning transport: ${mode}`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'rd-note-'));
    const host = await startHost({ root, coordinator: new Coordinator({ clock: () => 0 }) });
    const peer = new Peer({ root });
    const socket = process.platform === 'win32' ? `\\\\.\\pipe\\rd-note-${randomUUID()}` : join(root, 'notify.sock');
    const server = http.createServer();
    const ws = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, connection, head) => ws.handleUpgrade(request, connection, head, channel => ws.emit('connection', channel)));
    const submitted = [];
    let renew;
    ws.on('connection', channel => channel.on('message', async bytes => {
      const message = JSON.parse(bytes);
      if (message.id === undefined) return;
      let result = {};
      if (message.method === 'thread/read') {
        await renew?.();
        result = { thread: { id: 'owned_thread', status: { type: 'idle' } } };
      }
      if (message.method === 'turn/start') submitted.push(message.params);
      const error = mode === 'refused' && message.method === 'turn/start' ? { code: -32000, message: 'Thread is closed' } : null;
      channel.send(JSON.stringify({ id: message.id, ...(error ? { error } : { result }) }));
    }));
    if (mode !== 'closed') {
      await new Promise(resolve => server.listen(socket, resolve));
      if (process.platform !== 'win32') await chmod(socket, 0o600);
    }
    t.after(async () => {
      await peer.close(); await host.close();
      for (const channel of ws.clients) channel.terminate();
      await new Promise(resolve => ws.close(resolve));
      if (server.listening) await new Promise(resolve => server.close(resolve));
      await rm(root, { recursive: true, force: true });
    });
    await privateJson(join(root, 'codex.json'), { format: 1, command: process.execPath, home: root, socket });
    const integration = new ClientIntegration(peer, { connect: (config, callback) => withCodex(config, callback, { proxy: false }) });
    await integration.context({ _meta: { threadId: 'owned_thread' } });
    await peer.call('subscribe', { name: 'Warning transport', workspace: root });
    host.coordinator.setBlocked(false);
    const before = await peer.call('take');
    if (mode === 'renewed-during-delivery') renew = () => peer.call('heartbeat', { lease_token: before.lease.token });
    const warning = { instance_id: before.instance_id, session_id: before.you.session_id, heartbeat_id: before.lease.heartbeat_id, remaining_ms: 180000 };
    peer.emit('heartbeat-warning', warning);
    await integration.queue;
    assert.equal(integration.status().last_status, mode === 'accepted' ? 'accepted' : mode === 'renewed-during-delivery' ? 'suppressed' : 'failed');
    assert.equal(submitted.length, ['accepted', 'refused'].includes(mode) ? 1 : 0);
    if (submitted.length) {
      assert.equal(submitted[0].threadId, 'owned_thread');
      assert.deepEqual(submitted[0].input, []);
      assert.equal(submitted[0].toolOutput.namespace, 're_desktop');
      assert.equal(submitted[0].toolOutput.name, 'heartbeat_warning');
      assert.match(submitted[0].toolOutput.output, /3 minutes/);
      assert.equal(submitted[0].toolOutput.retain, false);
    }
    const after = await peer.call('status');
    if (mode !== 'renewed-during-delivery') assert.equal(after.lease.heartbeat_id, before.lease.heartbeat_id, 'Delivery must never renew access');
    await peer.call('release', { lease_token: after.lease.token });
    peer.emit('heartbeat-warning', warning);
    await integration.queue;
    assert.equal(integration.status().last_status, 'suppressed');
  });
}
