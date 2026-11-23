import test from 'node:test';
import assert from 'node:assert/strict';
import { Coordinator } from '../src/coordinator.mjs';
import { Access, list } from '../src/core.mjs';

function fixture() {
  let now = 0;
  const c = new Coordinator({ clock: () => now, blocked: false });
  const a = {}, b = {}, newcomer = {};
  const one = c.call(a, 'subscribe', { name: 'Holder 🔵 & work', workspace: process.cwd() });
  const two = c.call(b, 'subscribe', { name: 'Waiting', workspace: process.cwd() });
  c.call(newcomer, 'subscribe', { name: 'New arrival', workspace: process.cwd() });
  const grant = c.call(a, 'take');
  c.call(b, 'take');
  const holders = [];
  c.on('change', () => holders.push(c.snapshot().holder?.session_id ?? null));
  const setTime = value => { now = value; };
  function advance(target) {
    while (now < target) {
      now = Math.min(now + 10000, target);
      for (const connection of [a, b, newcomer]) if (!connection.retired) c.call(connection, 'presence');
    }
    c.tick();
  }
  return { c, a, b, newcomer, one, two, grant, holders, advance, setTime };
}

test('Pause after preserves only the current grant; new takes cannot acquire or join', () => {
  const f = fixture();
  f.c.pauseAfter();
  const pending = f.c.snapshot();
  assert.equal(pending.access_mode, 'pause_after');
  assert.equal(pending.availability, 'pausing');
  assert.equal(pending.user_blocked, false);
  assert.equal(pending.grants_allowed, false);
  assert.deepEqual(pending.lease, f.grant.lease);
  assert.equal(pending.holder.session_id, f.one.session_id);
  assert.deepEqual(pending.queue.map(x => x.session_id), [f.two.session_id]);
  for (const wait of [false, true]) {
    assert.equal(f.c.call(f.newcomer, 'take', { wait }).you.queue_position, null);
    assert.equal(f.c.call(f.b, 'take', { wait }).you.queue_position, 1);
  }
  f.c.call(f.a, 'take');
  f.c.pauseAfter();
  assert.deepEqual(f.c.snapshot().lease, f.grant.lease);
  assert.throws(() => f.c.call(f.b, 'heartbeat', { lease_token: f.grant.lease.token }), { code: 'NOT_HOLDER' });
  assert.equal(f.c.call(f.b, 'cancel').queue.length, 0);
});

for (const ending of ['release', 'end', 'disconnect', 'unsubscribe', 'cleanup', 'heartbeat expiry', 'presence expiry', 'immediate Pause']) {
  test(`Pause after completes on ${ending}, without an intermediate handoff`, () => {
    const f = fixture();
    f.c.pauseAfter();
    if (ending === 'release') f.c.call(f.a, 'release', { lease_token: f.grant.lease.token });
    if (ending === 'end') f.c.endAccess();
    if (ending === 'disconnect') f.c.disconnect(f.a);
    if (ending === 'unsubscribe') f.c.call(f.a, 'unsubscribe');
    if (ending === 'cleanup') f.c.cleanup({ instance_id: f.one.instance_id, session_id: f.one.session_id, cleanup_token: f.one.cleanup_token });
    if (ending === 'heartbeat expiry') f.advance(900000);
    if (ending === 'presence expiry') {
      f.setTime(29999); f.c.call(f.b, 'presence');
      f.setTime(30000); f.c.tick();
    }
    if (ending === 'immediate Pause') f.c.setBlocked(true);
    const paused = f.c.snapshot();
    assert.equal(paused.access_mode, 'pause');
    assert.equal(paused.availability, 'blocked');
    assert.equal(paused.user_blocked, true);
    assert.equal(paused.grants_allowed, false);
    assert.equal(paused.holder, null);
    assert.equal(paused.lease, null);
    assert.equal(paused.queue[0].session_id, f.two.session_id);
    assert.ok(!f.holders.includes(f.two.session_id), 'No emitted state may give the waiter access');
    if (ending === 'disconnect') {
      const resumed = {};
      const restored = f.c.call(resumed, 'subscribe', { name: 'Restored', workspace: process.cwd(), resume_token: f.one.resume_token });
      assert.equal(restored.session_id, f.one.session_id);
      assert.equal(restored.holder, null);
      assert.throws(() => f.c.call(resumed, 'heartbeat', { lease_token: f.grant.lease.token }), { code: 'NOT_HOLDER' });
    }
    f.c.setBlocked(false);
    assert.equal(f.c.snapshot().holder.session_id, f.two.session_id);
  });
}

test('Allow cancels a pending pause without replacing or renewing held access', () => {
  const f = fixture();
  f.c.pauseAfter(); f.advance(10000);
  const before = f.c.snapshot().lease;
  f.c.setBlocked(false);
  assert.equal(f.c.snapshot().access_mode, 'allow');
  assert.equal(f.c.snapshot().grants_allowed, true);
  assert.deepEqual(f.c.snapshot().lease, before);
  f.c.call(f.a, 'release', { lease_token: f.grant.lease.token });
  assert.equal(f.c.snapshot().holder.session_id, f.two.session_id);
});

test('Pending pause retains explicit renewal and both warning generations', () => {
  const f = fixture(), warnings = [];
  f.c.on('heartbeat-warning', e => warnings.push(e.warning));
  f.c.pauseAfter(); f.advance(720000); f.advance(840000);
  assert.deepEqual(warnings.map(w => w.threshold_ms), [180000, 60000]);
  const renewed = f.c.call(f.a, 'heartbeat', { lease_token: f.grant.lease.token });
  assert.equal(renewed.access_mode, 'pause_after');
  assert.equal(renewed.lease.token, f.grant.lease.token);
  assert.notEqual(renewed.lease.heartbeat_id, f.grant.lease.heartbeat_id);
  f.advance(900000);
  assert.equal(f.c.snapshot().holder.session_id, f.one.session_id);
  f.advance(1560000); f.advance(1680000);
  assert.deepEqual(warnings.map(w => w.threshold_ms), [180000, 60000, 180000, 60000]);
  f.advance(1740000);
  assert.equal(f.c.snapshot().access_mode, 'pause');
  assert.equal(f.c.snapshot().holder, null);
});

test('Selecting Pause after at an expired grant cannot first grant a queued successor', () => {
  const f = fixture();
  f.setTime(30000); // Deliberately do not sweep before the human action.
  f.c.pauseAfter();
  assert.equal(f.c.snapshot().access_mode, 'pause');
  assert.equal(f.c.snapshot().holder, null);
  assert.ok(!f.holders.includes(f.two.session_id));
  const empty = new Coordinator({ blocked: false });
  empty.pauseAfter();
  assert.equal(empty.snapshot().access_mode, 'pause');
});

test('The emitted core preserves waiting order and cannot queue during a pending grant', () => {
  let state = Access.initial(false);
  for (const id of [1, 2, 3]) state = Access.presence(state, id, 0, true);
  state = Access.take(state, 1, true, 0);
  state = Access.take(state, 2, true, 0);
  state = Access.pause_after(state);
  state = Access.take(state, 3, true, 0);
  assert.deepEqual(list(state.queue), [2]);
  assert.deepEqual(Access.release(state, 1, state.epoch - 1), state);
  state = Access.release(state, 1, state.epoch);
  assert.equal(Access.blocked(state), true);
  assert.equal(Access.advance(state, 1).holder, 0);
  assert.equal(Access.allow(state, 1).holder, 2);
});
