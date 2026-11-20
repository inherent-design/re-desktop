import test from 'node:test';
import assert from 'node:assert/strict';
import { Coordinator } from '../src/coordinator.mjs';

function fixture() {
  let now = 0;
  const c = new Coordinator({ clock: () => now, blocked: false });
  const a = {}, b = {};
  const one = c.call(a, 'subscribe', { name: 'Holder', workspace: process.cwd() });
  const two = c.call(b, 'subscribe', { name: 'Waiting', workspace: process.cwd() });
  const grant = c.call(a, 'take');
  c.call(b, 'take');
  const notices = [];
  c.on('heartbeat-warning', event => notices.push(event));
  function advance(target) {
    while (now < target) {
      now = Math.min(now + 10000, target);
      for (const connection of [a, b]) if (!connection.retired) c.call(connection, 'presence');
    }
    c.tick();
  }
  return { c, a, b, one, two, grant, notices, advance };
}

test('15-minute heartbeat warns once at 3 and 1 minutes, then hands off despite live bridge presence', () => {
  const f = fixture();
  assert.equal(f.grant.heartbeat_timeout_ms, 900000);
  f.advance(719999);
  assert.equal(f.notices.length, 0);
  f.advance(720000);
  assert.equal(f.notices.length, 1);
  assert.equal(f.notices[0].connection, f.a);
  assert.equal(f.notices[0].warning.threshold_ms, 180000);
  assert.equal(f.notices[0].warning.heartbeat_id, f.grant.lease.heartbeat_id);
  f.advance(839999); assert.equal(f.notices.length, 1);
  f.advance(840000); assert.equal(f.notices.length, 2);
  assert.equal(f.notices[1].warning.threshold_ms, 60000);
  f.advance(899999); assert.equal(f.c.snapshot().holder.session_id, f.one.session_id);
  f.advance(900000); assert.equal(f.c.snapshot().holder.session_id, f.two.session_id);
  assert.equal(f.c.snapshot().sessions.every(s => s.connected), true);
  assert.throws(() => f.c.call(f.a, 'heartbeat', { lease_token: f.grant.lease.token }), { code: 'STALE_LEASE' });
});

test('renewal replaces warning identity and deadlines; no fixed total holding time', () => {
  const f = fixture();
  f.advance(720000);
  const firstWarning = f.notices[0].warning;
  const renewed = f.c.call(f.a, 'heartbeat', { lease_token: f.grant.lease.token });
  assert.notEqual(renewed.lease.heartbeat_id, firstWarning.heartbeat_id);
  assert.equal(renewed.lease.token, f.grant.lease.token);
  f.advance(900000);
  assert.equal(f.c.snapshot().holder.session_id, f.one.session_id);
  assert.equal(f.notices.length, 1);
  for (let now = 1320000; now < 4200000; now += 600000) {
    f.advance(now);
    f.c.call(f.a, 'heartbeat', { lease_token: f.grant.lease.token });
  }
  assert.equal(f.c.snapshot().holder.session_id, f.one.session_id);
  assert.equal(f.notices.length, 1, 'Fresh heartbeats suppress old warning timers');
});

test('read, messages, repeat takes and warning delivery do not reset the agent heartbeat', () => {
  const f = fixture();
  f.advance(720000);
  f.c.call(f.a, 'status');
  f.c.call(f.a, 'take');
  f.c.call(f.a, 'message', { to_session_id: f.two.session_id, text: 'Please yield when ready' });
  f.c.call(f.a, 'messages');
  assert.equal(f.c.snapshot().lease.heartbeat_id, f.grant.lease.heartbeat_id);
  f.advance(900000);
  assert.equal(f.c.snapshot().holder.session_id, f.two.session_id);
});

test('pause, disconnect and release invalidate warning work without delaying handoff', () => {
  for (const action of ['pause', 'disconnect', 'release', 'unsubscribe']) {
    const f = fixture();
    f.advance(720000);
    if (action === 'pause') f.c.setBlocked(true);
    else if (action === 'disconnect') { f.c.disconnect(f.a); f.a.retired = true; }
    else f.c.call(f.a, action, action === 'release' ? { lease_token: f.grant.lease.token } : {});
    const after = f.c.snapshot();
    assert.notEqual(after.holder?.session_id, f.one.session_id);
    // Only keep the live waiter present after an actual disconnect/unsubscribe.
    f.a.retired = true;
    f.advance(840000);
    assert.equal(f.notices.filter(n => n.warning.session_id === f.one.session_id).length, 1);
  }
});

test('cleanup requires a private capability, retires only its session and is idempotent', () => {
  const f = fixture();
  assert.throws(() => f.c.cleanup({ instance_id: f.one.instance_id, session_id: f.one.session_id, cleanup_token: f.grant.lease.token }), { code: 'UNAUTHENTICATED' });
  assert.deepEqual(f.c.cleanup({ instance_id: 'old-host', session_id: f.one.session_id, cleanup_token: f.one.cleanup_token }), { ended: false });
  assert.deepEqual(f.c.cleanup({ instance_id: f.one.instance_id, session_id: f.one.session_id, cleanup_token: f.one.cleanup_token }), { ended: true });
  assert.equal(f.c.snapshot().holder.session_id, f.two.session_id);
  assert.equal(f.c.snapshot().sessions.length, 1);
  assert.throws(() => f.c.call(f.a, 'subscribe', { name: 'Revive', workspace: process.cwd() }), { code: 'SESSION_ENDED' });
  assert.deepEqual(f.c.cleanup({ instance_id: f.one.instance_id, session_id: f.one.session_id, cleanup_token: f.one.cleanup_token }), { ended: false });
});
