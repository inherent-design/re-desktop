import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { startHost } from '../src/host.mjs';
import { Peer } from '../src/peer.mjs';
import { Coordinator } from '../src/coordinator.mjs';

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rd-'));
  const host = await startHost({ root, ...options });
  const peers = [];
  t.after(async () => { for (const p of peers) await p.close(); await host.close(); await rm(root, { recursive: true, force: true }); });
  const peer = () => { const p = new Peer({ root, presenceMs: 600000 }); peers.push(p); return p; };
  return { root, host, peer };
}

test('two real connections share access, messages, queue and human control', async t => {
  const { host, peer } = await fixture(t);
  const a = peer(), b = peer();
  const one = await a.call('subscribe', { name: 'Atlas & A', workspace: process.cwd() });
  const two = await b.call('subscribe', { name: 'β agent', workspace: process.cwd() });
  assert.equal(one.availability, 'blocked');
  host.coordinator.setBlocked(false);
  const access = await a.call('take');
  assert.equal(access.holder.session_id, one.session_id);
  assert.equal((await b.call('take')).you.queue_position, 1);
  await b.call('message', { to_session_id: one.session_id, text: 'Could you yield after this step?', urgent: true });
  let mailbox = await a.call('messages');
  assert.equal(mailbox.messages[0].from_session_id, two.session_id);
  assert.equal(mailbox.messages[0].urgent, true);
  assert.equal((await a.call('messages', { ack_through: mailbox.messages[0].id })).messages.length, 0);
  await assert.rejects(b.call('release', { lease_token: access.lease.token }), { code: 'NOT_HOLDER' });
  await a.call('release', { lease_token: access.lease.token });
  assert.equal((await b.call('status')).holder.session_id, two.session_id);
  await assert.rejects(a.call('heartbeat', { lease_token: access.lease.token }), { code: 'STALE_LEASE' });
  host.coordinator.setBlocked(true);
  assert.equal((await b.call('status')).holder, null);
});

test('a dropped connection resumes identity without reviving access and cannot hijack a live session', async t => {
  const { host, peer } = await fixture(t);
  const a = peer(), intruder = peer();
  const identity = await a.call('subscribe', { name: 'Reconnect', workspace: process.cwd() });
  host.coordinator.setBlocked(false);
  const access = await a.call('take');
  await assert.rejects(intruder.call('subscribe', { name: 'Other', workspace: process.cwd(), resume_token: identity.resume_token }), { code: 'SESSION_CONNECTED' });
  a.drop();
  await delay(25);
  const resumed = await a.call('status');
  assert.equal(resumed.you.session_id, identity.session_id);
  assert.equal(resumed.holder, null);
  await assert.rejects(a.call('heartbeat', { lease_token: access.lease.token }), { code: 'NOT_HOLDER' });
  const fresh = await a.call('take');
  assert.notEqual(fresh.lease.token, access.lease.token);
  await a.call('heartbeat', { lease_token: fresh.lease.token });
});

test('confirmed disconnection immediately hands access to a live waiter', async t => {
  let now = 0;
  const coordinator = new Coordinator({ clock: () => now });
  const { host, peer } = await fixture(t, { coordinator });
  const a = peer(), b = peer();
  await a.call('subscribe', { name: 'Crashing', workspace: process.cwd() });
  const identity = await b.call('subscribe', { name: 'Waiting', workspace: process.cwd() });
  host.coordinator.setBlocked(false);
  const access = await a.call('take');
  await b.call('take');
  await a.close();
  for (let tries = 0; host.coordinator.snapshot().sessions.some(s => s.name === 'Crashing' && s.connected) && tries < 100; tries++) await delay(2);
  assert.equal(host.coordinator.snapshot().sessions.find(s => s.name === 'Crashing').connected, false);
  const immediate = await b.call('status');
  assert.equal(immediate.holder.session_id, identity.session_id);
  now = 20000; await b.call('heartbeat', { lease_token: immediate.lease.token });
  now = 30000;
  const next = await b.call('status');
  assert.equal(next.holder.session_id, identity.session_id);
  assert.equal(next.sessions.length, 1);
  await assert.rejects(b.call('heartbeat', { lease_token: access.lease.token }), { code: 'STALE_LEASE' });
});

test('a still-connected bridge without agent renewal loses access at the exact deadline', async t => {
  let now = 0;
  const coordinator = new Coordinator({ clock: () => now });
  const { host, peer } = await fixture(t, { coordinator });
  const a = peer(), b = peer();
  await a.call('subscribe', { name: 'Idle bridge', workspace: process.cwd() });
  const identity = await b.call('subscribe', { name: 'Waiting', workspace: process.cwd() });
  host.coordinator.setBlocked(false);
  const old = await a.call('take');
  await b.call('take');
  for (now = 10000; now < 900000; now += 10000) { await a.call('presence'); await b.call('presence'); }
  now = 899999; assert.equal((await a.call('status')).holder.name, 'Idle bridge');
  now = 900000;
  const next = await b.call('status');
  assert.equal(next.holder.session_id, identity.session_id);
  assert.equal(next.sessions.find(s => s.name === 'Idle bridge').connected, true);
  await assert.rejects(a.call('heartbeat', { lease_token: old.lease.token }), { code: 'STALE_LEASE' });
});

test('host restart reconnects a bridge as a fresh paused session and invalidates old access', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rd-'));
  let host = await startHost({ root });
  const a = new Peer({ root, presenceMs: 600000 });
  t.after(async () => { await a.close(); await host.close(); await rm(root, { recursive: true, force: true }); });
  const old = await a.call('subscribe', { name: 'Restart', workspace: process.cwd() });
  host.coordinator.setBlocked(false);
  const access = await a.call('take');
  await host.close(); await delay(25);
  await assert.rejects(a.call('status'), { code: 'HOST_UNAVAILABLE' });
  host = await startHost({ root });
  const fresh = await a.call('status');
  assert.equal(fresh.availability, 'blocked');
  assert.notEqual(fresh.you.session_id, old.session_id);
  assert.equal(fresh.holder, null);
  await assert.rejects(a.call('heartbeat', { lease_token: access.lease.token }), { code: 'STALE_LEASE' });
});

test('frequent status reads do not suppress the bridge presence heartbeat', async t => {
  const started = performance.now();
  const coordinator = new Coordinator({ clock: () => (performance.now() - started) * 300 });
  const { root } = await fixture(t, { coordinator });
  const a = new Peer({ root, presenceMs: 20 });
  t.after(() => a.close());
  const initial = await a.call('subscribe', { name: 'Polling', workspace: process.cwd() });
  for (let index = 0; index < 30; index++) {
    const status = await a.call('status');
    assert.equal(status.you?.session_id, initial.session_id);
    await delay(5);
  }
});

test('malformed, oversized and unauthenticated local frames do not mutate access', async t => {
  const { host, peer } = await fixture(t);
  const exchange = frame => new Promise((resolve, reject) => {
    const socket = net.createConnection(host.paths.socket);
    let data = '';
    socket.on('connect', () => socket.write(frame));
    socket.on('data', bytes => { data += bytes; socket.destroy(); });
    socket.on('close', () => resolve(data)); socket.on('error', reject);
  });
  const rejected = JSON.parse(await exchange(JSON.stringify({ id: 1, auth: 'wrong', method: 'subscribe', args: { name: 'X', workspace: process.cwd() } }) + '\n'));
  assert.equal(rejected.error.code, 'UNAUTHENTICATED');
  assert.match(await exchange('{\n'), /INVALID_ARGUMENT/);
  assert.equal(await exchange('x'.repeat(17000)), '');
  const a = peer();
  assert.equal((await a.call('status')).sessions.length, 0);
  await assert.rejects(a.call('subscribe', { name: 'X', workspace: '../relative' }), { code: 'INVALID_ARGUMENT' });
  assert.equal((await a.call('status')).availability, 'blocked');
  if (process.platform !== 'win32') {
    assert.equal((await stat(host.paths.token)).mode & 0o777, 0o600);
    assert.equal((await stat(host.paths.socket)).mode & 0o777, 0o600);
  }
});

test('a second host cannot replace a live socket or an ordinary file', async t => {
  const { root } = await fixture(t);
  if (process.platform !== 'win32') {
    await assert.rejects(startHost({ root }), /Another host/);
    const other = await mkdtemp(join(tmpdir(), 'rd-'));
    t.after(() => rm(other, { recursive: true, force: true }));
    await writeFile(join(other, 'host.sock'), 'preserve me');
    await assert.rejects(startHost({ root: other }), /unexpected socket/);
    assert.equal(await readFile(join(other, 'host.sock'), 'utf8'), 'preserve me');
  }
});

test('independent valid messages can burst across one live connection', async t => {
  const { peer } = await fixture(t);
  const a = peer(), b = peer();
  await a.call('subscribe', { name: 'Sender', workspace: process.cwd() });
  const recipient = await b.call('subscribe', { name: 'Recipient', workspace: process.cwd() });
  a.socket.cork();
  const sent = Promise.all(Array.from({ length: 20 }, (_, index) => a.call('message', { to_session_id: recipient.session_id, text: `${index}:` + 'x'.repeat(1990) })));
  await delay(1);
  a.socket.uncork();
  await sent;
  assert.equal((await b.call('messages')).messages.length, 20);
});

test('multiple valid frames in one data event are bounded individually', async t => {
  const { host, peer } = await fixture(t);
  let incoming;
  host.server.once('connection', socket => { incoming = socket; });
  const a = peer(), b = peer();
  await a.call('subscribe', { name: 'Sender', workspace: process.cwd() });
  const recipient = await b.call('subscribe', { name: 'Recipient', workspace: process.cwd() });
  const frames = Array.from({ length: 10 }, (_, index) => JSON.stringify({ id: 10000 + index, auth: a.auth, method: 'message', args: { to_session_id: recipient.session_id, text: `${index}:` + 'x'.repeat(1990) } }) + '\n').join('');
  assert.ok(Buffer.byteLength(frames) > 16384);
  // Exercise the actual host parser with a legal stream chunk independently of
  // platform-specific kernel read sizes. Each individual frame is below 16 KiB.
  incoming.emit('data', Buffer.from(frames));
  assert.equal((await b.call('messages')).messages.length, 10);
});

test('closing a bridge during connection setup cannot open a new host connection afterward', async t => {
  const coordinator = new Coordinator();
  let calls = 0;
  const dispatch = coordinator.call.bind(coordinator);
  coordinator.call = (...args) => { calls++; return dispatch(...args); };
  const { root } = await fixture(t, { coordinator });
  const a = new Peer({ root });
  t.after(() => a.close());
  const connecting = a.call('status');
  const result = assert.rejects(connecting);
  await a.close();
  await result;
  await delay(10);
  assert.equal(calls, 0);
});

test('a legal large subscriber and queue snapshot fits the reply bound', async t => {
  const coordinator = new Coordinator({ clock: () => 0 });
  const workspace = '/' + '界'.repeat(2047);
  for (let index = 0; index < 128; index++) {
    const connection = {};
    coordinator.call(connection, 'subscribe', { name: `Agent ${index}`, workspace });
    coordinator.call(connection, 'take');
  }
  const { peer } = await fixture(t, { coordinator });
  const status = await peer().call('status');
  assert.equal(status.sessions.length, 128);
  assert.equal(status.queue.length, 128);
  assert.equal(status.sessions[127].workspace, workspace);
});
