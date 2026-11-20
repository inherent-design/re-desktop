import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, readFile, writeFile, rename, rm } from 'node:fs/promises';

export function runtimePaths(root = process.env.RE_DESKTOP_RUNTIME ?? join(homedir(), '.re-desktop')) {
  if (!isAbsolute(root)) throw new Error('RE_DESKTOP_RUNTIME must be absolute');
  const identity = createHash('sha256').update(root).digest('hex').slice(0, 24);
  const socket = process.platform === 'win32' ? `\\\\.\\pipe\\re-desktop-${identity}` : join(root, 'host.sock');
  if (process.platform !== 'win32' && Buffer.byteLength(socket) > 100) throw new Error('Runtime path is too long for a Unix socket. Choose a shorter RE_DESKTOP_RUNTIME.');
  return { root, socket, token: join(root, 'host.token'), humanQuit: join(root, 'human-quit.json') };
}

export async function privateDirectory(path, create = false) {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid()) || (process.platform !== 'win32' && (stat.mode & 0o077))) throw new Error('Integration directory must be private and owned by this user');
}

export async function privateRead(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536 || (process.getuid && stat.uid !== process.getuid()) || (process.platform !== 'win32' && (stat.mode & 0o077))) throw new Error('Integration file must be private and owned by this user');
  return readFile(path, 'utf8');
}

export async function privateJson(path, value) {
  const candidate = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(candidate, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); await rename(candidate, path); }
  finally { await rm(candidate, { force: true }); }
}
