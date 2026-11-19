import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import { runtimePaths } from './runtime.mjs';
import { apiError, apiOffer, validateAgreement } from './api.mjs';

export class Peer extends EventEmitter {
  constructor({ root, presenceMs = 10000, offer = apiOffer() } = {}) {
    super();
    this.paths = runtimePaths(root);
    this.presenceMs = presenceMs;
    this.offer = offer;
    this.pending = new Map();
    this.nextId = 1;
    this.closed = false;
    this.lastPresence = 0;
    this.timer = setInterval(() => {
      if (!this.identity || this.closed || this.maintaining) return;
      if (this.socket && Date.now() - this.lastPresence < this.presenceMs) return;
      this.maintaining = true;
      this.call('presence').catch(() => {}).finally(() => { this.maintaining = false; });
    }, Math.min(presenceMs, 1000));
    this.timer.unref();
  }
  async open() {
    if (this.closed) throw new Error('Desktop bridge is closed');
    if (this.connecting) return this.connecting;
    if (this.socket && !this.socket.destroyed) return;
    this.connecting = this.connect().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async connect() {
    try {
      this.auth = await readFile(this.paths.token, 'utf8');
      if (this.closed) throw new Error('Desktop bridge closed during connection setup');
      const socket = net.createConnection(this.paths.socket);
      this.socket = socket;
      let buffer = '';
      const decoder = new StringDecoder('utf8');
      socket.on('data', bytes => {
        buffer += decoder.write(bytes);
        // A full legal queue duplicates subscriber metadata; leave room for its
        // Unicode paths plus a bounded mailbox, while still bounding replies.
        if (Buffer.byteLength(buffer) > 4 * 1048576) { socket.destroy(); return; }
        let end;
        while ((end = buffer.indexOf('\n')) !== -1) {
          const frame = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let message;
          try { message = JSON.parse(frame); } catch { socket.destroy(); return; }
          if (message.event === 'changed') { this.emit('change'); continue; }
          const pending = this.pending.get(message.id);
          if (!pending) continue;
          this.pending.delete(message.id); clearTimeout(pending.timer);
          if (message.error) pending.reject(Object.assign(new Error(message.error.message), { code: message.error.code, details: message.error.details }));
          else pending.resolve(message.result);
        }
      });
      socket.on('error', () => {});
      socket.on('close', () => {
        if (this.socket === socket) { this.socket = null; this.agreement = null; }
        for (const [id, pending] of this.pending) {
          if (pending.socket !== socket) continue;
          clearTimeout(pending.timer);
          pending.reject(Object.assign(new Error('Host connection lost. Read desktop_status to reconcile; the previous operation may have applied.'), { code: 'OUTCOME_UNKNOWN' }));
          this.pending.delete(id);
        }
        this.emit('change');
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.destroy(); reject(new Error('Host connection timed out')); }, 2000);
        socket.once('connect', () => { clearTimeout(timer); resolve(); });
        socket.once('error', error => { clearTimeout(timer); reject(error); });
      });
      if (this.closed) throw new Error('Desktop bridge closed during connection setup');
      try {
        this.agreement = validateAgreement(await this.rpc('hello', this.offer), this.offer);
      } catch (error) {
        if (['NOT_SUBSCRIBED', 'METHOD_NOT_FOUND'].includes(error.code)) throw apiError('API_UPGRADE_REQUIRED', 'This host cannot negotiate an IPC API. Update the host through the configured release policy.', { component: 'host' });
        throw error;
      }
      if (this.identity) {
        try {
          const result = await this.rpc('subscribe', this.identity);
          this.identity.resume_token = result.resume_token;
        } catch (error) {
          if (error.code !== 'SESSION_EXPIRED') throw error;
          const { resume_token, ...fresh } = this.identity;
          const result = await this.rpc('subscribe', fresh);
          this.identity.resume_token = result.resume_token;
        }
      }
      this.lastPresence = Date.now();
    } catch (error) {
      this.socket?.destroy();
      if (error.code?.startsWith('API_') || ['SESSION_CONNECTED', 'OUTCOME_UNKNOWN'].includes(error.code)) throw error;
      throw Object.assign(new Error('re:desktop is unavailable. Start the tray app, then retry. No access has been assumed.'), { code: 'HOST_UNAVAILABLE', cause: error });
    }
  }
  rpc(method, args = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket || socket.destroyed) {
        reject(Object.assign(new Error('Host disconnected before this operation was sent. Retry after reconnecting.'), { code: 'HOST_UNAVAILABLE' }));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error('Desktop reply timed out. Read desktop_status to reconcile before retrying a mutation.'), { code: 'OUTCOME_UNKNOWN' }));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer, socket });
      socket.write(JSON.stringify({ id, auth: this.auth, method, args }) + '\n');
    });
  }
  async call(method, args = {}) {
    await this.open();
    const result = await this.rpc(method, args);
    if (method === 'subscribe') this.identity = { name: args.name, workspace: args.workspace, resume_token: result.resume_token };
    if (method === 'unsubscribe') this.identity = null;
    if (method !== 'status') this.lastPresence = Date.now();
    return result;
  }
  drop() { this.socket?.destroy(); }
  async close() {
    this.closed = true;
    clearInterval(this.timer);
    if (this.socket) {
      const socket = this.socket;
      await new Promise(resolve => { socket.once('close', resolve); socket.destroy(); });
    }
  }
}
