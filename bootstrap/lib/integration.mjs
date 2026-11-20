import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Duplex } from 'node:stream';
import net from 'node:net';
import WebSocket from 'ws';
import { homedir } from 'node:os';
import { join, isAbsolute, dirname } from 'node:path';
import { readFile, lstat, rm, realpath } from 'node:fs/promises';
import { runtimePaths, privateDirectory, privateRead, privateJson } from './profile.mjs';

const execute = promisify(execFile);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const bindings = paths => join(paths.root, 'codex-sessions');
const bindingPath = (paths, id) => { if (!identifier(id)) throw new Error('Invalid Codex session identity'); return join(bindings(paths), `${id}.json`); };

export function codexThread(meta = {}) {
  let context = meta['x-codex-turn-metadata'];
  if (typeof context === 'string') { try { context = JSON.parse(context); } catch { return null; } }
  const id = meta.threadId ?? context?.thread_id;
  return identifier(id) ? id : null;
}

export async function integrationConfig(paths) {
  await privateDirectory(paths.root);
  const value = JSON.parse(await privateRead(join(paths.root, 'codex.json')));
  if (value.format !== 1 || !isAbsolute(value.command ?? '') || !isAbsolute(value.home ?? '') || (value.socket && !isAbsolute(value.socket))) throw new Error('Invalid Codex integration configuration');
  return value;
}

// Same app-server tool-output primitive as codex_tui, through the local control
// socket. No TUI bearer token or publishing credential is copied.
export async function withCodex(config, callback, { proxy = process.platform === 'win32' } = {}) {
  let path = config.socket ?? join(config.home, 'app-server-control', 'app-server-control.sock');
  if (!isAbsolute(path)) throw new Error('Codex control socket must be absolute');
  if (process.platform !== 'win32') {
    const link = await lstat(path);
    if (link.isSymbolicLink()) {
      if (process.getuid && link.uid !== process.getuid()) throw new Error('Codex socket rendezvous has a foreign owner');
      await privateDirectory(dirname(path));
      path = await realpath(path);
      await privateDirectory(dirname(path));
    }
    const info = await lstat(path);
    if (!info.isSocket() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid()) || (info.mode & 0o077)) throw new Error('Codex control socket must be private and owned by this user');
  }
  // Codex's Windows rendezvous is not a Node named pipe. Its official proxy
  // handles that transport and peer validation; WebSocket still frames the RPC.
  let child;
  const createConnection = () => {
    if (!proxy) return net.createConnection(path);
    child = spawn(config.command, ['app-server', 'proxy', '--sock', path], {
      env: { ...process.env, CODEX_HOME: config.home }, stdio: ['pipe', 'pipe', 'ignore']
    });
    const stream = Duplex.from({ readable: child.stdout, writable: child.stdin });
    child.on('error', error => stream.destroy(error));
    return stream;
  };
  const channel = new WebSocket('ws://localhost/', { createConnection, maxPayload: 1048576, handshakeTimeout: 2500, perMessageDeflate: false });
  const pending = new Map();
  let serial = 0, timer;
  const fail = error => { for (const p of pending.values()) p.reject(error); pending.clear(); };
  channel.on('error', () => fail(new Error('Codex notification endpoint is unavailable')));
  channel.on('close', () => fail(new Error('Codex notification endpoint closed')));
  channel.on('message', bytes => {
    let message;
    try { message = JSON.parse(bytes.toString()); } catch { fail(new Error('Invalid Codex response')); channel.terminate(); return; }
    if (message.method && Object.hasOwn(message, 'id')) channel.send(JSON.stringify({ id: message.id, error: { code: -32601, message: 'This integration only sends heartbeat warnings' } }));
    const p = pending.get(message.id); if (!p) return;
    pending.delete(message.id);
    if (message.error) p.reject(Object.assign(new Error(`Codex rejected ${p.method} (${message.error.code})`), { rpcError: message.error })); else p.resolve(message.result);
  });
  const request = (method, params) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { method, resolve, reject }); channel.send(JSON.stringify({ id, method, params })); });
  try {
    return await Promise.race([
      (async () => {
        await new Promise((resolve, reject) => { channel.once('open', resolve); channel.once('error', reject); });
        await request('initialize', { clientInfo: { name: 're-desktop-notifier', version: '1.0.0' }, capabilities: { experimentalApi: true } });
        channel.send('{"method":"initialized","params":{}}');
        return callback(request);
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Codex heartbeat notification timed out')), 5000); })
    ]);
  } finally { clearTimeout(timer); fail(new Error('Notification connection closed')); channel.terminate(); child?.kill(); }
}

export async function saveBinding(paths, threadId, snapshot, offer) {
  await privateDirectory(paths.root);
  await privateDirectory(bindings(paths), true);
  await privateJson(bindingPath(paths, threadId), { format: 1, instance_id: snapshot.instance_id, session_id: snapshot.session_id, cleanup_token: snapshot.cleanup_token, offer });
}

export async function clearBinding(paths, threadId, sessionId) {
  try { await privateDirectory(bindings(paths)); const path = bindingPath(paths, threadId); const value = JSON.parse(await privateRead(path)); if (value.session_id === sessionId) await rm(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function cleanupSession(input, { root } = {}) {
  const paths = runtimePaths(root);
  if (!input || !['SessionEnd', 'SubagentStop'].includes(input.hook_event_name)) throw new Error('Unsupported Codex cleanup hook event');
  const id = input.hook_event_name === 'SubagentStop' ? input.agent_id : input.session_id;
  if (!identifier(id)) throw new Error('Hook did not provide a valid Codex session identity');
  let binding, token;
  try { await privateDirectory(paths.root); await privateDirectory(bindings(paths)); binding = JSON.parse(await privateRead(bindingPath(paths, id))); token = (await privateRead(paths.token)).trim(); }
  catch (error) { if (error.code === 'ENOENT') return { ended: false }; throw error; }
  if (binding.format !== 1 || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid local cleanup binding');
  const socket = net.createConnection(paths.socket), pending = new Map();
  let seq = 0, buffer = '';
  const request = (method, args) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.write(JSON.stringify({ id, auth: token, method, args }) + '\n'); });
  const failed = error => { for (const p of pending.values()) p.reject(error); pending.clear(); };
  socket.on('data', bytes => {
    buffer += bytes;
    if (buffer.length > 65536) { socket.destroy(new Error('Cleanup response exceeded its bound')); return; }
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      let message;
      try { message = JSON.parse(buffer.slice(0, end)); } catch { socket.destroy(new Error('Invalid cleanup response')); return; }
      buffer = buffer.slice(end + 1);
      const p = pending.get(message.id); if (!p) continue;
      pending.delete(message.id);
      if (message.error) p.reject(new Error('Session cleanup was refused')); else p.resolve(message.result);
    }
  });
  socket.on('error', failed);
  socket.on('close', () => failed(new Error('Cleanup connection closed')));
  socket.setTimeout(700, () => socket.destroy(new Error('Session cleanup timed out')));
  let outcome;
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    await request('hello', binding.offer);
    outcome = await request('cleanup', { instance_id: binding.instance_id, session_id: binding.session_id, cleanup_token: binding.cleanup_token });
  } catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error; outcome = { ended: false }; }
  finally { socket.destroy(); }
  await clearBinding(paths, id, binding.session_id);
  return outcome;
}

const shellQuote = value => {
  if (process.platform === 'win32') {
    if (/["%!\r\n]/.test(value)) throw new Error('This Windows hook path needs a custom launcher without quotes, percent signs, exclamation marks or newlines');
    return `"${value}"`;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
};
export async function installCodex({ command, home = process.env.CODEX_HOME ?? join(homedir(), '.codex'), socket, launcher, args, cleanupLauncher = launcher, cleanupArgs = args?.slice(0, -1), root, executeCommand = execute } = {}) {
  if (!isAbsolute(command ?? '') || !isAbsolute(home) || !isAbsolute(launcher ?? '') || !isAbsolute(cleanupLauncher ?? '') || (socket && !isAbsolute(socket))) throw new Error('Codex, launcher, home and optional socket paths must be absolute');
  if (!Array.isArray(args) || args.at(-1) !== 'mcp' || !args.every(arg => typeof arg === 'string') || !Array.isArray(cleanupArgs) || !cleanupArgs.every(arg => typeof arg === 'string')) throw new Error('Expected literal MCP and cleanup launcher arguments');
  const paths = runtimePaths(root);
  await privateDirectory(paths.root, true);
  // Codex owns its directory policy; only our capability files require 0700.
  const homeStat = await lstat(home);
  if (!homeStat.isDirectory() || homeStat.isSymbolicLink() || (process.getuid && homeStat.uid !== process.getuid())) throw new Error('Codex home must be an owned directory');
  const hookPath = join(home, 'hooks.json');
  let hooks = {};
  try { const stat = await lstat(hookPath); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1048576 || (process.getuid && stat.uid !== process.getuid())) throw new Error('Unexpected Codex hook configuration'); hooks = JSON.parse(await readFile(hookPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  hooks.hooks ??= {};
  const cleanup = [cleanupLauncher, ...cleanupArgs, 'codex-cleanup', '--runtime', paths.root].map(shellQuote).join(' ');
  for (const event of ['SessionEnd', 'SubagentStop']) {
    const groups = hooks.hooks[event] ?? [];
    if (!Array.isArray(groups)) throw new Error(`Invalid ${event} hook groups`);
    hooks.hooks[event] = groups.map(group => ({ ...group, hooks: group.hooks.filter(h => h.statusMessage !== 're:desktop session cleanup') })).filter(group => group.hooks.length);
    hooks.hooks[event].push({ hooks: [{ type: 'command', command: cleanup, timeout: 3, statusMessage: 're:desktop session cleanup' }] });
  }
  await executeCommand(command, ['mcp', 'add', 're_desktop', '--', launcher, ...args], { env: { ...process.env, CODEX_HOME: home }, timeout: 15000, maxBuffer: 65536 });
  await privateJson(hookPath, hooks);
  const config = { format: 1, command, home, ...(socket ? { socket } : {}) };
  await privateJson(join(paths.root, 'codex.json'), config);
  // The operator chose this fixed cleanup command. Trust only its exact native
  // hashes; never bypass Codex trust or approve unrelated hooks.
  let hookTrust = 'review-required';
  try { await trustCodexHooks(config, hookPath, cleanup); hookTrust = 'trusted'; } catch {}
  return { configured: true, notifications: 'codex-app-server', hooks: ['SessionEnd', 'SubagentStop'], hook_trust: hookTrust, restart_required: true };
}

async function trustCodexHooks(config, hookPath, command) {
  const expected = await realpath(hookPath);
  return withCodex(config, async request => {
    const inventory = await request('hooks/list', { cwds: [config.home] });
    const selected = [];
    for (const hook of inventory.data.flatMap(item => item.hooks)) {
      if (!['sessionEnd', 'subagentStop'].includes(hook.eventName) || hook.statusMessage !== 're:desktop session cleanup' || hook.command !== command || !hook.currentHash) continue;
      if (await realpath(hook.sourcePath) === expected) selected.push(hook);
    }
    if (selected.length !== 2 || new Set(selected.map(hook => hook.eventName)).size !== 2) throw new Error('Codex did not discover both exact cleanup hooks');
    const value = Object.fromEntries(selected.map(hook => [hook.key, { trusted_hash: hook.currentHash }]));
    await request('config/batchWrite', { edits: [{ keyPath: 'hooks.state', value, mergeStrategy: 'upsert' }], reloadUserConfig: true });
  });
}
