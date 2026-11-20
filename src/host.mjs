import net from 'node:net';
import { mkdir, lstat, chmod, readFile, writeFile, unlink } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Coordinator } from './coordinator.mjs';
import { runtimePaths } from './runtime.mjs';
import { api, apiError, negotiate } from './api.mjs';

const MAX_FRAME = 16384;

async function privateFile(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw new Error('Runtime credential has invalid ownership or type');
  if (process.platform !== 'win32' && (stat.mode & 0o077)) throw new Error('Runtime credential must be private (mode 600)');
  return readFile(path, 'utf8');
}

async function removeStaleSocket(path) {
  if (process.platform === 'win32') return;
  let stat;
  try { stat = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!stat.isSocket() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw new Error('Refusing to replace an unexpected socket path');
  const outcome = await new Promise(resolve => {
    const probe = net.createConnection(path);
    const timer = setTimeout(() => { probe.destroy(); resolve('timeout'); }, 1000);
    probe.once('connect', () => { clearTimeout(timer); probe.destroy(); resolve('live'); });
    probe.once('error', error => { clearTimeout(timer); resolve(error.code); });
  });
  if (outcome !== 'ECONNREFUSED' && outcome !== 'ENOENT') throw new Error('Another host is running, or its state cannot be determined');
  if (outcome === 'ECONNREFUSED') await unlink(path);
}

export async function startHost({ root, coordinator = new Coordinator(), tickMs = 250, apiDescriptor = api } = {}) {
  const paths = runtimePaths(root);
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  const stat = await lstat(paths.root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw new Error('Runtime directory has invalid ownership or type');
  await chmod(paths.root, 0o700);
  try { await writeFile(paths.token, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const token = await privateFile(paths.token);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid runtime credential');
  await removeStaleSocket(paths.socket);
  const connections = new Set();
  let lastChange = '';
  const onChange = () => {
    const snapshot = coordinator.snapshot();
    // A ticking deadline is read on demand; native menus change only with meaning.
    const signature = JSON.stringify({ ...snapshot, lease: snapshot.lease && { token: snapshot.lease.token, heartbeat_id: snapshot.lease.heartbeat_id }, mailboxes: [...coordinator.sessions.values()].map(s => [s.id, s.messages.length, s.messages.at(-1)?.id]) });
    if (signature === lastChange) return;
    lastChange = signature;
    for (const conn of connections) if (conn.authenticated && conn.agreement && !conn.socket.destroyed) conn.socket.write('{"event":"changed"}\n');
  };
  coordinator.on('change', onChange);
  const onWarning = ({ connection, warning }) => {
    if (connection.authenticated && connection.agreement && !connection.socket.destroyed) connection.socket.write(JSON.stringify({ event: 'heartbeat-warning', warning }) + '\n');
  };
  coordinator.on('heartbeat-warning', onWarning);
  const server = net.createServer(socket => {
    const connection = { socket, authenticated: false };
    connections.add(connection);
    let buffer = Buffer.alloc(0);
    socket.on('error', () => {});
    socket.on('close', () => { connections.delete(connection); coordinator.disconnect(connection); });
    socket.on('data', bytes => {
      buffer = Buffer.concat([buffer, bytes]);
      let end;
      while ((end = buffer.indexOf(10)) !== -1) {
        if (end > MAX_FRAME) { socket.destroy(); return; }
        const frame = buffer.subarray(0, end).toString('utf8');
        buffer = buffer.subarray(end + 1);
        let request;
        try {
          request = JSON.parse(frame);
          if (!request || !Number.isSafeInteger(request.id) || request.id < 1 || typeof request.method !== 'string') throw new Error('Malformed frame');
          const presented = Buffer.from(typeof request.auth === 'string' ? request.auth : '');
          const expected = Buffer.from(token);
          if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
            socket.end(JSON.stringify({ id: request.id, error: { code: 'UNAUTHENTICATED', message: 'Invalid host credential' } }) + '\n');
            return;
          }
          connection.authenticated = true;
          let result;
          if (request.method === 'hello') {
            const agreement = negotiate(request.args, apiDescriptor);
            if (connection.session && connection.agreement?.shared_api !== agreement.shared_api) throw apiError('API_RENEGOTIATION_REFUSED', 'An active session must reconnect before changing its IPC API.');
            connection.agreement = agreement;
            result = agreement;
          } else {
            if (!connection.agreement) throw apiError('API_NEGOTIATION_REQUIRED', 'Negotiate a common IPC API with hello before reading or changing desktop state. Upgrade the bridge if it cannot negotiate.');
            result = request.method === 'cleanup' ? coordinator.cleanup(request.args ?? {}) : coordinator.call(connection, request.method, request.args);
          }
          socket.write(JSON.stringify({ id: request.id, result }) + '\n');
        } catch (error) {
          socket.write(JSON.stringify({ id: request?.id ?? null, error: { code: error.code ?? 'INVALID_ARGUMENT', message: error.code ? error.message : 'Invalid desktop protocol frame', ...(error.details ? { details: error.details } : {}) } }) + '\n');
        }
      }
      if (buffer.length > MAX_FRAME) socket.destroy();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(paths.socket, resolve);
  });
  if (process.platform !== 'win32') await chmod(paths.socket, 0o600);
  const timer = setInterval(() => coordinator.tick(), tickMs);
  return {
    coordinator, paths, server,
    async close() {
      clearInterval(timer);
      coordinator.off('change', onChange);
      coordinator.off('heartbeat-warning', onWarning);
      for (const connection of connections) connection.socket.destroy();
      await new Promise(resolve => server.close(resolve));
    }
  };
}
