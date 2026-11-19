import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import electron from 'electron';

await mkdir('artifacts', { recursive: true });
if (process.platform === 'darwin') execFileSync('xcrun', ['swiftc', 'scripts/macos-menu.swift', '-o', 'build/macos-menu']);
const root = await mkdtemp(join(tmpdir(), 'rd-tray-'));
try {
  const env = { ...process.env, RE_DESKTOP_RUNTIME: root, RE_DESKTOP_ARTIFACTS: resolve('artifacts') };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, ['.', '--smoke-test'], { stdio: 'inherit', env });
  const timer = setTimeout(() => child.kill('SIGTERM'), 55000);
  const status = await new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  clearTimeout(timer);
  if (status.code !== 0) throw new Error(`Tray smoke failed: ${JSON.stringify(status)}`);
} finally { await rm(root, { recursive: true, force: true }); }
