import { codexThread, integrationConfig, saveBinding, clearBinding, withCodex } from '../bootstrap/lib/integration.mjs';
import { warningText } from './heartbeat.mjs';
import { apiError } from './api.mjs';

export class ClientIntegration {
  constructor(peer, { connect = withCodex } = {}) {
    this.peer = peer;
    this.connect = connect;
    this.threadId = null;
    this.config = null;
    this.sessionId = null;
    this.state = 'unsupported';
    this.queue = Promise.resolve();
    peer.on('identity', result => { this.record(result).catch(() => { this.state = 'failed'; }); });
    peer.on('heartbeat-warning', warning => {
      this.queue = this.queue.then(() => this.deliver(warning)).catch(() => { this.state = 'failed'; });
    });
  }
  async context(extra) {
    const thread = codexThread(extra?._meta);
    if (thread && this.threadId && this.threadId !== thread) throw apiError('CLIENT_SESSION_MISMATCH', 'This MCP connection belongs to another Codex thread; use a per-thread connection.');
    if (thread) this.threadId = thread;
    if (!this.config) {
      try { this.config = await integrationConfig(this.peer.paths); this.state = 'ready'; }
      catch (error) { if (error.code !== 'ENOENT') this.state = 'failed'; }
    }
    if (this.threadId && this.config && this.peer.registration && this.sessionId !== this.peer.registration.session_id) await this.record(this.peer.registration);
  }
  status() { return { supported: Boolean(this.threadId && this.config), adapter: this.threadId && this.config ? 'codex' : 'none', last_status: this.state }; }
  async record(result) {
    if (!this.threadId || !this.config || !result.cleanup_token) return;
    try {
      await saveBinding(this.peer.paths, this.threadId, result, this.peer.offer);
      this.sessionId = result.session_id;
    } catch { this.state = 'failed'; }
  }
  async unsubscribe() {
    try { if (this.threadId && this.sessionId) await clearBinding(this.peer.paths, this.threadId, this.sessionId); }
    catch { this.state = 'failed'; }
    this.sessionId = null;
  }
  async current(warning) {
    if (this.peer.closed || !this.config || !this.threadId) return false;
    const status = await this.peer.call('status');
    return Boolean(status.you && status.holder?.session_id === status.you.session_id && status.you.session_id === warning.session_id && status.instance_id === warning.instance_id && status.lease?.heartbeat_id === warning.heartbeat_id && status.lease.remaining_ms > 0);
  }
  async deliver(warning) {
    if (!await this.current(warning)) { if (this.config) this.state = 'suppressed'; return; }
    await this.connect(this.config, async request => {
      const result = await request('thread/read', { threadId: this.threadId, includeTurns: false });
      if (result.thread?.status?.type === 'notLoaded' || !await this.current(warning)) { this.state = 'suppressed'; return; }
      await request('turn/start', { threadId: this.threadId, input: [], toolOutput: { namespace: 're_desktop', name: 'heartbeat_warning', output: warningText(warning), retain: false } });
      this.state = 'accepted';
    });
  }
}
