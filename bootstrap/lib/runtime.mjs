import { rm, mkdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { withLock, failure } from './store.mjs';

export async function runtimeManager(generation, { root = process.env.RE_DESKTOP_RUNTIME } = {}) {
  const load = file => import(pathToFileURL(join(generation.program, 'bridge/src', file)).href);
  const { Peer } = await load('peer.mjs');
  const { runtimePaths } = await load('runtime.mjs');
  const paths = runtimePaths(root);
  const marker = join(paths.root, 'human-quit.json');
  const policy = { version: generation.manifest.version, source: generation.manifest.source, target: `${generation.asset.platform}-${generation.asset.arch}`, startup: 'on-subscribe', updates: 'exact-pin', signing: generation.asset.signing };
  async function probe() {
    const peer = new Peer({ root: paths.root });
    try { await peer.call('status'); return { running: true, agreement: peer.agreement }; }
    catch (error) { if (error.code === 'HOST_UNAVAILABLE') return { running: false }; throw error; }
    finally { await peer.close(); }
  }
  async function quitRequested() {
    try {
      const stat = await lstat(marker);
      if (!stat.isFile() || stat.isSymbolicLink()) throw failure('HOST_START_REFUSED', 'Unexpected human Quit marker.');
      return true;
    } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  async function status() {
    const state = await probe();
    return { ...policy, api: generation.manifest.api, host_running: state.running, human_quit: await quitRequested(), agreement: state.agreement ?? null, restart_required: false };
  }
  async function prepare({ operator = false } = {}) {
    await mkdir(paths.root, { recursive: true, mode: 0o700 });
    const rootStat = await lstat(paths.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (process.getuid && rootStat.uid !== process.getuid())) throw failure('HOST_START_REFUSED', 'Unexpected runtime directory.');
    return withLock(join(paths.root, '.start-lock'), async () => {
      if (operator) await rm(marker, { force: true });
      if ((await probe()).running) return status();
      if (await quitRequested()) throw failure('HOST_START_REFUSED', 'The person quit re:desktop. Ask them to open it or run re-desktop start; agent preparation cannot clear this choice.');
      if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw failure('DESKTOP_UNAVAILABLE', 'No graphical desktop session is available for the tray.');
      // The shared tray inherits neither MCP handles nor session lifetime.
      const env = { ...process.env, RE_DESKTOP_RUNTIME: paths.root, RE_DESKTOP_AUTOSTART: '1' };
      delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(join(generation.program, generation.asset.host), [], { env, detached: true, stdio: 'ignore', windowsHide: false });
      let failed;
      child.once('error', error => { failed = error; });
      child.once('exit', (code, signal) => { failed ??= new Error(`Native host exited (${signal ?? code})`); });
      child.unref();
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if ((await probe()).running) return status();
        if (failed) throw failure('HOST_START_FAILED', 'The native tray could not start. Open it directly to inspect OS permission, signing, desktop indicator, or Chromium sandbox requirements.');
        await delay(100);
      }
      throw failure('HOST_START_FAILED', 'The native tray did not become ready within 20 seconds. No desktop access was granted.');
    }, 30000);
  }
  return { status, prepare, paths };
}
