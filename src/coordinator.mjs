import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { isAbsolute } from 'node:path';
import { Access, list } from './core.mjs';
import { warningThresholds } from './heartbeat.mjs';

class DomainError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new DomainError(code, message); };
const text = (value, max, name) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail('INVALID_ARGUMENT', `Invalid ${name}`);
  return value;
};

export class Coordinator extends EventEmitter {
  constructor({ clock = () => performance.now(), blocked = true } = {}) {
    super();
    this.clock = clock;
    this.instance = randomUUID();
    this.state = Access.initial(blocked);
    this.sessions = new Map();
    this.nextId = 1;
    this.messageId = 0;
    this.heartbeatGeneration = 0;
    this.warningKey = null;
    this.warned = new Set();
  }
  now() { return Math.floor(this.clock()); }
  tick() {
    this.state = Access.advance(this.state, this.now());
    const alive = new Set(list(this.state.sessions).map(s => s.id));
    for (const [id] of this.sessions) if (!alive.has(id)) this.sessions.delete(id);
    const key = this.heartbeatId();
    if (key !== this.warningKey) { this.warningKey = key; this.warned.clear(); }
    const holder = this.sessions.get(this.state.holder);
    const remaining = this.state.until - this.now();
    const due = warningThresholds.filter(ms => remaining > 0 && remaining <= ms && !this.warned.has(ms));
    if (holder?.connection && due.length) {
      due.forEach(ms => this.warned.add(ms));
      this.emit('heartbeat-warning', { connection: holder.connection, warning: {
        instance_id: this.instance, session_id: holder.publicId, heartbeat_id: key,
        threshold_ms: Math.min(...due), remaining_ms: remaining
      } });
    }
    this.emit('change');
  }
  heartbeatId() { return this.state.holder ? `${this.instance}:${this.state.epoch}:${this.state.until}:${this.heartbeatGeneration}` : null; }
  session(connection) {
    const session = this.sessions.get(connection.session);
    if (!session || session.connection !== connection) fail('NOT_SUBSCRIBED', 'Subscribe to this desktop first. An expired session must subscribe again.');
    return session;
  }
  subscribe(connection, args) {
    const name = text(args.name, 100, 'session name');
    const workspace = text(args.workspace, 2048, 'workspace');
    if (!isAbsolute(workspace)) fail('INVALID_ARGUMENT', 'Workspace must be an absolute directory path');
    if (connection.session) {
      const current = this.sessions.get(connection.session);
      if (current?.connection === connection) return { session_id: current.publicId, resume_token: current.token, cleanup_token: current.cleanupToken };
    }
    let session;
    if (args.resume_token !== undefined) {
      text(args.resume_token, 128, 'resume token');
      session = [...this.sessions.values()].find(s => {
        const a = Buffer.from(s.token), b = Buffer.from(args.resume_token);
        return a.length === b.length && timingSafeEqual(a, b);
      });
      if (!session) fail('SESSION_EXPIRED', 'Session expired or this host restarted. Subscribe without the old resume token.');
      if (session.connection && session.connection !== connection) fail('SESSION_CONNECTED', 'That session is already connected');
    } else {
      if (this.sessions.size >= 128) fail('CAPACITY', 'This desktop supports up to 128 live sessions');
      session = { id: this.nextId++, publicId: randomUUID(), token: randomBytes(32).toString('hex'), cleanupToken: randomBytes(32).toString('hex'), name, workspace, messages: [] };
      this.sessions.set(session.id, session);
    }
    Object.assign(session, { name, workspace, connection });
    connection.session = session.id;
    this.state = Access.presence(this.state, session.id, this.now(), true);
    return { session_id: session.publicId, resume_token: session.token, cleanup_token: session.cleanupToken };
  }
  disconnect(connection) {
    const session = this.sessions.get(connection.session);
    if (session?.connection !== connection) return;
    session.connection = null;
    this.state = Access.disconnect(this.state, session.id, this.now());
    this.tick();
  }
  setBlocked(value) {
    this.tick();
    this.state = value ? Access.block(this.state) : Access.allow(this.state, this.now());
    this.emit('change');
  }
  endAccess() {
    this.tick();
    this.state = Access.release(this.state, this.state.holder, this.state.epoch);
    this.tick();
  }
  cleanup(args) {
    this.tick();
    if (args.instance_id !== this.instance) return { ended: false };
    const session = [...this.sessions.values()].find(s => s.publicId === args.session_id);
    if (!session) return { ended: false };
    const supplied = Buffer.from(typeof args.cleanup_token === 'string' ? args.cleanup_token : '');
    const expected = Buffer.from(session.cleanupToken);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) fail('UNAUTHENTICATED', 'Invalid session cleanup capability');
    if (session.connection) { session.connection.retired = true; session.connection.session = undefined; }
    this.state = Access.forget(this.state, session.id);
    this.sessions.delete(session.id);
    this.tick();
    return { ended: true };
  }
  snapshot(connection) {
    const { state } = this;
    const waiting = list(state.queue);
    const encode = session => session && ({ session_id: session.publicId, name: session.name, workspace: session.workspace, connected: Boolean(session.connection), queue_position: waiting.includes(session.id) ? waiting.indexOf(session.id) + 1 : null });
    const you = this.sessions.get(connection?.session);
    const light = Access.light(state).$;
    return {
      instance_id: this.instance,
      availability: { Available: 'available', Blocked: 'blocked', InUse: 'in_use' }[light],
      user_blocked: state.blocked,
      holder: encode(this.sessions.get(state.holder)) ?? null,
      lease: state.holder ? { token: `${this.instance}:${state.epoch}`, remaining_ms: Math.max(0, state.until - this.now()), heartbeat_id: this.heartbeatId() } : null,
      queue: waiting.map(id => encode(this.sessions.get(id))),
      sessions: [...this.sessions.values()].map(encode),
      you: encode(you) ?? null,
      unread_messages: you?.messages.length ?? 0,
      lease_timeout_ms: Access.heartbeat_timeout(),
      heartbeat_timeout_ms: Access.heartbeat_timeout(),
      heartbeat_warning_ms: [...warningThresholds],
      presence_timeout_ms: 30000,
      coordination: 'Voluntary signal. People retain ordinary desktop control.'
    };
  }
  epoch(token) {
    if (typeof token !== 'string' || token !== `${this.instance}:${this.state.epoch}`) fail('STALE_LEASE', 'Access changed or expired. Read desktop_status before continuing.');
    return this.state.epoch;
  }
  call(connection, method, args = {}) {
    this.tick();
    if (connection.retired) fail('SESSION_ENDED', 'This agent session ended; create a new client session before participating again.');
    if (!args || typeof args !== 'object' || Array.isArray(args)) fail('INVALID_ARGUMENT', 'Arguments must be an object');
    let extra = {};
    if (method === 'subscribe') extra = this.subscribe(connection, args);
    else if (method === 'status') { /* Reading status does not renew access. */ }
    else {
      const session = this.session(connection);
      this.state = Access.presence(this.state, session.id, this.now(), true);
      switch (method) {
        case 'presence': break;
        case 'take':
          if (args.wait !== undefined && typeof args.wait !== 'boolean') fail('INVALID_ARGUMENT', 'wait must be a boolean');
          this.state = Access.take(this.state, session.id, args.wait ?? true, this.now());
          break;
        case 'heartbeat':
        case 'release': {
          const epoch = this.epoch(args.lease_token);
          if (this.state.holder !== session.id) fail('NOT_HOLDER', 'This session no longer has access');
          this.state = method === 'heartbeat' ? Access.renew(this.state, session.id, epoch, this.now()) : Access.release(this.state, session.id, epoch);
          if (method === 'heartbeat') this.heartbeatGeneration++;
          break;
        }
        case 'cancel': this.state = Access.cancel(this.state, session.id); break;
        case 'unsubscribe':
          this.state = Access.forget(this.state, session.id);
          this.sessions.delete(session.id);
          connection.session = undefined;
          break;
        case 'message': {
          const target = [...this.sessions.values()].find(s => s.publicId === args.to_session_id);
          if (!target) fail('NOT_FOUND', 'Recipient session is no longer subscribed');
          if (args.urgent !== undefined && typeof args.urgent !== 'boolean') fail('INVALID_ARGUMENT', 'urgent must be a boolean');
          if (target.messages.length >= 50) fail('MAILBOX_FULL', 'Recipient has 50 unacknowledged messages');
          const body = text(args.text, 2000, 'message');
          target.messages.push({ id: ++this.messageId, from_session_id: session.publicId, from_name: session.name, text: body, urgent: args.urgent ?? false });
          extra.sent = true;
          break;
        }
        case 'messages': {
          if (args.ack_through !== undefined && (!Number.isSafeInteger(args.ack_through) || args.ack_through < 0)) fail('INVALID_ARGUMENT', 'ack_through must be a nonnegative integer');
          if (args.ack_through !== undefined) session.messages = session.messages.filter(m => m.id > args.ack_through);
          extra.messages = [...session.messages];
          break;
        }
        default: fail('METHOD_NOT_FOUND', 'Unknown desktop operation');
      }
    }
    this.tick();
    return { ...this.snapshot(connection), ...extra };
  }
}
