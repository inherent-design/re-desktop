import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

export function runtimePaths(root = process.env.RE_DESKTOP_RUNTIME ?? join(homedir(), '.re-desktop')) {
  if (!isAbsolute(root)) throw new Error('RE_DESKTOP_RUNTIME must be absolute');
  const identity = createHash('sha256').update(root).digest('hex').slice(0, 24);
  const socket = process.platform === 'win32' ? `\\\\.\\pipe\\re-desktop-${identity}` : join(root, 'host.sock');
  if (process.platform !== 'win32' && Buffer.byteLength(socket) > 100) throw new Error('Runtime path is too long for a Unix socket. Choose a shorter RE_DESKTOP_RUNTIME.');
  return { root, socket, token: join(root, 'host.token') };
}
