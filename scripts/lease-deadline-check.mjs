import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHost } from '../src/host.mjs';
import { mcpClient, tool } from './mcp-client.mjs';

const root = await mkdtemp(join(tmpdir(), 'rd-lease-'));
const host = await startHost({ root });
const a = await mcpClient(root, 'live-but-idle'), b = await mcpClient(root, 'waiting');
try {
  const one = (await tool(a.client, 'desktop_subscribe', { name: 'Live bridge without agent renewal', workspace: process.cwd() })).data;
  const two = (await tool(b.client, 'desktop_subscribe', { name: 'Waiting agent', workspace: process.cwd() })).data;
  host.coordinator.setBlocked(false);
  const started = performance.now();
  const initial = (await tool(a.client, 'desktop_take')).data;
  await tool(b.client, 'desktop_take');
  const elapsed = await new Promise((resolve, reject) => {
    const changed = () => {
      if (host.coordinator.snapshot().holder?.session_id !== two.session_id) return;
      clearTimeout(timer); host.coordinator.off('change', changed);
      resolve(performance.now() - started);
    };
    const timer = setTimeout(() => { host.coordinator.off('change', changed); reject(new Error('Real-time lease did not hand off within 33 seconds')); }, 33000);
    host.coordinator.on('change', changed);
  });
  const observed = (await tool(b.client, 'desktop_status')).data;
  assert.equal(observed.holder.session_id, two.session_id);
  assert.equal(observed.sessions.find(s => s.session_id === one.session_id).connected, true);
  assert.ok(elapsed >= 29900 && elapsed < 33000);
  const stale = await tool(a.client, 'desktop_heartbeat', { lease_token: initial.lease.token });
  assert.equal(stale.data.error.code, 'STALE_LEASE');
  const report = { observedAt: new Date().toISOString(), node: process.version, platform: process.platform, configuredMs: initial.lease_timeout_ms, handoffMs: Math.round(elapsed), formerBridgeStillConnected: true, staleRenewalRejected: true, agentRenewalsBeforeExpiry: 0 };
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/lease-deadline.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await a.client.close(); await b.client.close(); await host.close();
  await rm(root, { recursive: true, force: true });
}
