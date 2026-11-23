import test from 'node:test';
import assert from 'node:assert/strict';
import { Access as A, list } from '../src/core.mjs';

const connected = (s, id, now = 0) => A.presence(s, id, now, true);
const setup = () => [1, 2, 3].reduce((s, id) => connected(s, id), A.initial(false));

test('Bend JavaScript ABI preserves booleans, Nat, records, enum and lists', () => {
  const s = setup();
  assert.equal(A.blocked(s), false);
  assert.equal(A.light(s).$, 'Available');
  const next = A.take(s, 1, true, 0);
  assert.equal(next.holder, 1);
  assert.equal(next.epoch, 1);
  assert.equal(next.until, 900000);
  assert.deepEqual(list(next.queue), []);
  assert.equal(A.light(next).$, 'InUse');
  assert.equal(A.light(A.block(next)).$, 'Blocked');
});

test('FIFO ordering, queue deduplication, no-wait behavior and no renewal by take', () => {
  let s = A.take(setup(), 1, true, 0);
  s = A.take(s, 2, false, 5);
  assert.deepEqual(list(s.queue), []);
  s = A.take(s, 2, true, 5);
  s = A.take(s, 3, true, 6);
  s = A.take(s, 2, true, 7);
  s = A.take(s, 1, true, 10000);
  assert.deepEqual(list(s.queue), [2, 3]);
  assert.equal(s.until, 900000);
  s = A.advance(A.release(s, 1, s.epoch), 10000);
  assert.equal(s.holder, 2);
  assert.deepEqual(list(s.queue), [3]);
  assert.equal(s.until, 910000);
});

test('pause revokes a holder, retains waiters and prevents every subsequent grant', () => {
  let s = A.take(setup(), 1, true, 0);
  s = A.take(s, 2, true, 0);
  s = A.block(s);
  assert.equal(s.holder, 0);
  s = A.advance(A.take(s, 3, true, 100), 100);
  assert.equal(s.holder, 0);
  assert.equal(A.blocked(s), true);
  assert.deepEqual(list(s.queue), [2, 3]);
  s = A.allow(s, 100);
  assert.equal(s.holder, 2);
});

test('stale epochs and non-holder identity cannot release or renew later access', () => {
  let s = A.take(setup(), 1, true, 0);
  const oldEpoch = s.epoch;
  s = A.take(s, 2, true, 0);
  s = A.advance(A.release(s, 1, oldEpoch), 100);
  const before = structuredClone(s);
  assert.deepEqual(A.release(s, 1, oldEpoch), before);
  assert.deepEqual(A.renew(s, 1, oldEpoch, 200), before);
  assert.deepEqual(A.release(s, 1, s.epoch), before);
  assert.deepEqual(A.release(s, 2, oldEpoch), before);
  assert.equal(A.renew(s, 2, s.epoch, 1000).until, 901000);
});

test('transport presence does not extend an access lease; exact timeout grants next waiter', () => {
  let s = A.take(setup(), 1, true, 0);
  s = A.take(s, 2, true, 0);
  for (let now = 10000; now < 900000; now += 10000) s = A.advance(connected(connected(s, 1, now), 2, now), now);
  s = A.advance(s, 899999);
  assert.equal(s.holder, 1);
  s = A.advance(s, 900000);
  assert.equal(s.holder, 2);
  assert.equal(s.epoch, 2);
});

test('disconnected queue head keeps its position through grace, then expires', () => {
  let s = setup();
  s = A.block(A.take(s, 1, true, 0));
  s = A.take(s, 2, true, 0);
  s = A.take(s, 3, true, 0);
  s = A.presence(s, 2, 1000, false);
  s = connected(s, 3, 20000);
  s = A.allow(s, 20000);
  assert.equal(s.holder, 0);
  assert.deepEqual(list(s.queue), [2, 3]);
  s = A.take(s, 3, false, 20001);
  assert.deepEqual(list(s.queue), [2, 3]);
  const resumed = connected(s, 2, 25000);
  assert.equal(A.advance(resumed, 25000).holder, 2);
  assert.equal(A.advance(s, 31000).holder, 3);
});

test('cancel and unsubscribe remove a waiter; unsubscribe also clears its access', () => {
  let s = A.take(setup(), 1, true, 0);
  s = A.take(s, 2, true, 0);
  s = A.take(s, 3, true, 0);
  s = A.cancel(s, 2);
  assert.deepEqual(list(s.queue), [3]);
  s = A.advance(A.forget(s, 1), 5);
  assert.equal(s.holder, 3);
  assert.deepEqual(list(s.sessions).map(x => x.id), [2, 3]);
});

test('seeded mixed lifecycle sequences preserve coordination invariants', () => {
  let seed = 7319;
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  let s = setup(), now = 0;
  for (let index = 0; index < 4000; index++) {
    const id = 1 + random(3);
    now += random(300);
    s = A.advance(s, now);
    switch (random(10)) {
      case 0: s = connected(s, id, now); break;
      case 1: s = A.take(s, id, true, now); break;
      case 2: s = A.release(s, id, s.epoch); break;
      case 3: s = A.renew(s, id, s.epoch, now); break;
      case 4: s = A.block(s); break;
      case 5: s = A.allow(s, now); break;
      case 6: s = A.cancel(s, id); break;
      case 7: s = A.forget(s, id); break;
      case 8: s = A.pause_after(s); break;
      case 9: s = A.disconnect(s, id, now); break;
    }
    s = A.advance(s, now);
    const queue = list(s.queue), sessions = list(s.sessions);
    assert.equal(new Set(queue).size, queue.length);
    assert.ok(!queue.includes(s.holder));
    assert.ok(!A.blocked(s) || s.holder === 0);
    assert.ok(s.holder === 0 || sessions.some(x => x.id === s.holder));
    assert.ok(queue.every(id => sessions.some(x => x.id === id)));
    assert.ok(s.holder === 0 || s.until > now);
    assert.ok(s.mode.$ !== 'PauseAfter' || s.holder > 0);
  }
});
