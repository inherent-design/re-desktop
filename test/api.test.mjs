import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { api, apiOffer, negotiate, validateAgreement } from '../src/api.mjs';
import { startHost } from '../src/host.mjs';
import { Peer } from '../src/peer.mjs';
import { runtimePaths } from '../src/runtime.mjs';

test('negotiation chooses the highest common API independently of product and individual API versions', () => {
  const host = { ...api, product: '7.0.0', host: '4.0.0', shared: { ...api.shared, supported: [1, 2, 3] } };
  const offer = apiOffer({ shared_apis: [2, 1], agent_api: '8.0.0', product_version: '2.0.0-preview.1+build' });
  const result = validateAgreement(negotiate(offer, host), offer);
  assert.equal(result.shared_api, 2);
  assert.equal(result.host_api, '4.0.0');
  assert.equal(result.agent_api, '8.0.0');
});

test('disjoint APIs and missing capabilities identify upgrades; malformed offers and agreements fail', () => {
  assert.throws(() => negotiate(apiOffer({ shared_apis: [2] })), e => e.code === 'API_UPGRADE_REQUIRED' && e.details.component === 'host');
  assert.throws(() => negotiate(apiOffer(), { ...api, shared: { ...api.shared, supported: [2] } }), e => e.code === 'API_UPGRADE_REQUIRED' && e.details.component === 'bridge');
  assert.throws(() => negotiate(apiOffer({ required_capabilities: ['unknown'] })), { code: 'API_CAPABILITY_REQUIRED' });
  for (const offer of [null, [], apiOffer({ shared_apis: [] }), apiOffer({ shared_apis: [1, 1] }), apiOffer({ shared_apis: ['1'] }), apiOffer({ product_version: 'not-semver' }), apiOffer({ extra: true })]) assert.throws(() => negotiate(offer), { code: 'API_INVALID_OFFER' });
  const offer = apiOffer(), result = negotiate(offer);
  for (const bad of [{ ...result, shared_api: 99 }, { ...result, capabilities: [] }, { ...result, host_api: null }, { ...result, agent_api: '99.0.0' }]) assert.throws(() => validateAgreement(bad, offer), { code: 'API_INVALID_AGREEMENT' });
});

test('real peers negotiate before operations; independent host versions work and mismatches do not create sessions', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rd-api-'));
  const host = await startHost({ root, apiDescriptor: { ...api, product: '9.0.0', host: '3.0.0' } });
  const compatible = new Peer({ root }), incompatible = new Peer({ root, offer: apiOffer({ shared_apis: [2] }) });
  t.after(async () => { await compatible.close(); await incompatible.close(); await host.close(); await rm(root, { recursive: true, force: true }); });
  await assert.rejects(incompatible.call('subscribe', { name: 'No access', workspace: process.cwd() }), { code: 'API_UPGRADE_REQUIRED' });
  assert.equal(host.coordinator.sessions.size, 0);
  assert.equal((await compatible.call('status')).availability, 'blocked');
  assert.equal(compatible.agreement.host_version, '9.0.0');
  assert.equal(compatible.agreement.shared_api, 1);
});

test('an authenticated legacy client cannot mutate state without negotiation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rd-api-'));
  const host = await startHost({ root });
  const socket = net.createConnection(host.paths.socket);
  t.after(async () => { socket.destroy(); await host.close(); await rm(root, { recursive: true, force: true }); });
  const reply = await new Promise((resolve, reject) => {
    socket.on('error', reject);
    socket.once('data', bytes => resolve(JSON.parse(bytes.toString())));
    socket.once('connect', async () => socket.write(JSON.stringify({ id: 1, auth: await readFile(host.paths.token, 'utf8'), method: 'subscribe', args: { name: 'Legacy', workspace: process.cwd() } }) + '\n'));
  });
  assert.equal(reply.error.code, 'API_NEGOTIATION_REQUIRED');
  assert.equal(host.coordinator.sessions.size, 0);
});

test('a legacy host yields an actionable upgrade without any attempted subscription', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rd-api-')), paths = runtimePaths(root), methods = [];
  await writeFile(paths.token, randomBytes(32).toString('hex'), { mode: 0o600 });
  const server = net.createServer(socket => {
    let buffer = '';
    socket.on('data', bytes => {
      buffer += bytes;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        methods.push(message.method);
        socket.write(JSON.stringify({ id: message.id, error: { code: 'NOT_SUBSCRIBED', message: 'Subscribe first' } }) + '\n');
      }
    });
  });
  await new Promise(resolve => server.listen(paths.socket, resolve));
  const peer = new Peer({ root });
  t.after(async () => { await peer.close(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  await assert.rejects(peer.call('subscribe', { name: 'Upgrade', workspace: process.cwd() }), e => e.code === 'API_UPGRADE_REQUIRED' && e.details.component === 'host');
  assert.deepEqual(methods, ['hello']);
});

test('an active session cannot renegotiate a different shared API', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rd-api-'));
  const host = await startHost({ root, apiDescriptor: { ...api, shared: { ...api.shared, supported: [1, 2] } } });
  const peer = new Peer({ root });
  t.after(async () => { await peer.close(); await host.close(); await rm(root, { recursive: true, force: true }); });
  const session = await peer.call('subscribe', { name: 'Pinned API', workspace: process.cwd() });
  await assert.rejects(peer.rpc('hello', apiOffer({ shared_apis: [2] })), { code: 'API_RENEGOTIATION_REFUSED' });
  assert.equal((await peer.call('status')).you.session_id, session.session_id);
});
