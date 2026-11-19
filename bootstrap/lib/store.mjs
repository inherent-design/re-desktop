import { mkdir, lstat, readFile, writeFile, rename, rm, readdir, readlink, chmod } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, posix, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as tar from 'tar';

const execute = promisify(execFile);
export const repository = 'inherent-design/re-desktop';
export const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
export const limits = { manifest: 1048576, archive: 512 * 1048576, unpacked: 2 * 1024 ** 3, files: 20000 };
export function failure(code, message) { return Object.assign(new Error(message), { code }); }
export function storePath() {
  return process.env.RE_DESKTOP_STORE ?? join(process.platform === 'darwin' ? join(homedir(), 'Library/Application Support') : process.platform === 'win32' ? process.env.LOCALAPPDATA ?? join(homedir(), 'AppData/Local') : process.env.XDG_DATA_HOME ?? join(homedir(), '.local/share'), 're-desktop', 'programs');
}
export async function ownedDirectory(path) {
  if (!isAbsolute(path)) throw failure('STORE_INVALID', 'The program store must be an absolute path.');
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw failure('STORE_INVALID', 'Program directory has unexpected ownership or type.');
  if (process.platform !== 'win32') await chmod(path, 0o700);
}
export async function atomicJson(path, data) {
  const candidate = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(candidate, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); await rename(candidate, path); }
  finally { await rm(candidate, { force: true }); }
}
export async function withLock(path, action, timeout = 190000) {
  const deadline = Date.now() + timeout, nonce = randomUUID();
  while (true) {
    try { await mkdir(path, { mode: 0o700 }); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw failure('STORE_INVALID', 'Unexpected lock path.');
    // Serialize stale-writer recovery, then recheck the current owner. Without
    // this gate two waiters could remove a newly acquired lock after a crash.
    const recovery = `${path}.recovery`;
    let recovering = false;
    try { await mkdir(recovery, { mode: 0o700 }); recovering = true; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (recovering) {
      try {
        let owner, current;
        try { current = await lstat(path); owner = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        let alive = true;
        if (Number.isSafeInteger(owner?.pid) && owner.pid > 0) {
          try { process.kill(owner.pid, 0); } catch (error) { alive = error.code !== 'ESRCH'; }
        } else alive = current && Date.now() - current.mtimeMs < 10000;
        if (!alive && current) await rm(path, { recursive: true, force: true });
      } finally { await rm(recovery, { recursive: true, force: true }); }
    }
    if (Date.now() >= deadline) throw failure('STORE_BUSY', 'Another preparation is still running. Retry after it completes.');
    await delay(100);
  }
  await atomicJson(join(path, 'owner.json'), { pid: process.pid, nonce });
  try { return await action(); }
  finally {
    const owner = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8'));
    if (owner.nonce === nonce) await rm(path, { recursive: true, force: true });
  }
}
const hashFile = async path => {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
};
const safePath = path => typeof path === 'string' && path.length > 0 && path.length <= 2048 && !path.includes('\\') && !path.includes('\0') && !path.includes(':') && !path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part));
export async function inventory(root, prefix = '') {
  const result = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (!safePath(path)) throw failure('ARCHIVE_INVALID', 'Invalid program member path.');
    const stat = await lstat(join(root, path));
    if (stat.isSymbolicLink()) {
      const link = await readlink(join(root, path));
      if (isAbsolute(link) || link.includes('\\') || !safePath(posix.normalize(posix.join(posix.dirname(path), link)))) throw failure('ARCHIVE_INVALID', 'A program link escapes its generation.');
      result.push({ path, link });
    } else if (stat.isDirectory()) result.push({ path, directory: true }, ...await inventory(root, path));
    else if (stat.isFile()) result.push({ path, size: stat.size, sha256: await hashFile(join(root, path)), executable: process.platform !== 'win32' && !!(stat.mode & 0o111) });
    else throw failure('ARCHIVE_INVALID', 'Unexpected special program member.');
  }
  return result;
}
async function inspectArchive(path) {
  const names = new Set(); let size = 0, bytes = 0, invalid;
  const parser = tar.t({ strict: true, onReadEntry(entry) {
    const path = entry.path.replace(/\/$/, '');
    if (!safePath(path) || names.has(path) || names.size >= limits.files || !['File', 'Directory', 'SymbolicLink'].includes(entry.type)) invalid ??= 'Invalid, duplicate, excessive, or special archive member.';
    names.add(path); size += entry.size;
    if (size > limits.unpacked) invalid ??= 'Program archive exceeds its unpacked limit.';
    if (entry.type === 'SymbolicLink' && (entry.linkpath.startsWith('/') || entry.linkpath.includes('\\') || !safePath(posix.normalize(posix.join(posix.dirname(path), entry.linkpath))))) invalid ??= 'Archive link escapes its generation.';
  } });
  await pipeline(createReadStream(path), createGunzip(), new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length;
    callback(bytes > limits.unpacked ? failure('ARCHIVE_INVALID', 'Expanded archive exceeds its limit.') : null, chunk);
  } }), parser);
  if (invalid) throw failure('ARCHIVE_INVALID', invalid);
  // Reject writes through a symlink even when its final destination is internal.
  const links = [];
  await tar.t({ file: path, strict: true, onReadEntry(entry) { if (entry.type === 'SymbolicLink') links.push(entry.path); } });
  for (const name of names) if (links.some(link => name.startsWith(link + '/'))) throw failure('ARCHIVE_INVALID', 'Archive writes through a link.');
}
export function validateManifest(manifest, version, target) {
  if (!versionPattern.test(version) || manifest?.format !== 1 || manifest.version !== version || manifest.repository !== repository || !/^[a-f0-9]{40}$/.test(manifest.source) || !Array.isArray(manifest.targets) || manifest.targets.length > 12) throw failure('RELEASE_INVALID', 'Release identity is invalid.');
  const api = manifest.api;
  if (!api || !versionPattern.test(api.agent) || !versionPattern.test(api.host) || !Array.isArray(api.shared?.supported) || api.shared.supported.length > 16 || api.shared.supported.some(v => !Number.isSafeInteger(v) || v < 1) || !api.shared.supported.includes(1) || !Array.isArray(api.shared.capabilities) || api.shared.capabilities.length > 32 || api.shared.capabilities.some(c => typeof c !== 'string' || !/^[a-z0-9.-]{1,64}$/.test(c))) throw failure('API_UPGRADE_REQUIRED', 'This bootstrap requires a release supporting shared IPC API 1. Upgrade the bootstrap for another API.');
  const selected = manifest.targets.filter(item => `${item.platform}-${item.arch}` === target);
  if (selected.length !== 1) throw failure('TARGET_UNSUPPORTED', `Release ${version} has no unique qualified target ${target}.`);
  const asset = selected[0];
  const expectedHost = asset.platform === 'darwin' ? 're-desktop.app/Contents/MacOS/re-desktop' : asset.platform === 'win32' ? 're-desktop.exe' : 're-desktop';
  if (asset.filename !== `re-desktop-${version}-${target}.tar.gz` || asset.host !== expectedHost || asset.bridge !== 'bridge/src/mcp.mjs' || asset.signing !== 'unsigned-preview' || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > limits.archive) throw failure('RELEASE_INVALID', 'Release asset metadata is invalid; this bootstrap currently admits unsigned previews only.');
  return asset;
}
async function publicFetch(url) {
  for (let redirect = 0; redirect < 6; redirect++) {
    const location = new URL(url);
    if (location.protocol !== 'https:' || !['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(location.hostname)) throw failure('RELEASE_INVALID', 'Unexpected release redirect.');
    const response = await fetch(location, { redirect: 'manual', signal: AbortSignal.timeout(180000), headers: { 'User-Agent': 'inherent-design-re-desktop', Accept: 'application/vnd.github+json' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { url = new URL(response.headers.get('location'), location); await response.body?.cancel(); continue; }
    return response;
  }
  throw failure('RELEASE_INVALID', 'Too many release redirects.');
}
async function limitedText(response, limit) {
  let bytes = 0; const chunks = [];
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes > limit) throw failure('RELEASE_INVALID', 'Release metadata exceeds its limit.'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}
async function releaseMetadata(version) {
  const path = `repos/${repository}/releases/tags/v${version}`;
  const response = await publicFetch(`https://api.github.com/${path}`);
  if (response.ok) return { data: JSON.parse(await limitedText(response, limits.manifest * 4)), privateReader: false };
  if (![401, 403, 404].includes(response.status)) throw failure('DOWNLOAD_FAILED', `GitHub release lookup returned HTTP ${response.status}.`);
  // gh owns its existing credentials; they are never copied into the store or logs.
  try { return { data: JSON.parse((await execute('gh', ['api', path], { timeout: 20000, maxBuffer: limits.manifest * 4 })).stdout), privateReader: true }; }
  catch { throw failure('DOWNLOAD_FAILED', 'Release is unavailable. Private previews require an already authenticated gh reader; offline use requires a prepared generation.'); }
}
async function download(data, asset, destination, privateReader, maximum) {
  if (privateReader) {
    await new Promise((resolve, reject) => {
      const child = spawn('gh', ['api', `repos/${repository}/releases/assets/${asset.id}`, '-H', 'Accept: application/octet-stream'], { stdio: ['ignore', 'pipe', 'ignore'] });
      const timer = setTimeout(() => { child.kill(); reject(failure('DOWNLOAD_FAILED', 'Release download timed out.')); }, 180000);
      let count = 0;
      const exit = new Promise((res, rej) => { child.once('error', rej); child.once('exit', code => code === 0 ? res() : rej(failure('DOWNLOAD_FAILED', 'Authenticated release download failed.'))); });
      const copy = pipeline(child.stdout, new Transform({ transform(chunk, enc, cb) { count += chunk.length; cb(count > maximum ? failure('RELEASE_INVALID', 'Download exceeds its limit.') : null, chunk); } }), createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
      Promise.all([copy, exit]).then(resolve, reject).finally(() => { clearTimeout(timer); if (child.exitCode === null) child.kill(); });
    });
  } else {
    const response = await publicFetch(`https://github.com/${repository}/releases/download/${encodeURIComponent(data.tag_name)}/${encodeURIComponent(asset.name)}`);
    if (!response.ok) throw failure('DOWNLOAD_FAILED', `Release download returned HTTP ${response.status}.`);
    let count = 0;
    await pipeline(response.body, new Transform({ transform(chunk, enc, cb) { count += chunk.length; cb(count > maximum ? failure('RELEASE_INVALID', 'Download exceeds its limit.') : null, chunk); } }), createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
  }
}
export class ProgramStore {
  constructor({ root = storePath(), target = `${process.platform}-${process.arch}`, acquire } = {}) { this.root = root; this.target = target; this.acquire = acquire; }
  async cached(version) {
    let receipt;
    try { receipt = JSON.parse(await readFile(join(this.root, version, this.target, 'ready.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw failure('CACHE_INVALID', 'Unreadable ready record. Prepare a new generation or repair this owned store.'); }
    const asset = validateManifest(receipt.manifest, version, this.target);
    const program = join(this.root, version, this.target, 'program');
    if (!Array.isArray(receipt.inventory) || JSON.stringify(await inventory(program)) !== JSON.stringify(receipt.inventory)) throw failure('CACHE_INVALID', 'Cached program bytes changed. Refusing to execute them; repair the owned generation or select another release.');
    await this.checkProgram(program, receipt.manifest, asset);
    return { program, manifest: receipt.manifest, asset };
  }
  async checkProgram(program, manifest, asset) {
    const identity = JSON.parse(await readFile(join(program, 'release.json'), 'utf8'));
    if (identity.version !== manifest.version || identity.source !== manifest.source || identity.platform !== asset.platform || identity.arch !== asset.arch || JSON.stringify(identity.api) !== JSON.stringify(manifest.api)) throw failure('RELEASE_INVALID', 'Extracted program identity differs from its release.');
    for (const entry of [asset.host, asset.bridge]) {
      const stat = await lstat(join(program, entry));
      if (!stat.isFile() || stat.isSymbolicLink()) throw failure('RELEASE_INVALID', 'Release entry point is missing or not a regular file.');
    }
  }
  async prepare(version, { offline = false } = {}) {
    if (!versionPattern.test(version)) throw failure('RELEASE_INVALID', 'Select an exact release version.');
    await ownedDirectory(this.root);
    const cached = await this.cached(version);
    if (cached) return cached;
    if (offline) throw failure('CACHE_MISS', `Release ${version} is not prepared for ${this.target}.`);
    return withLock(join(this.root, '.acquire-lock'), async () => {
      const ready = await this.cached(version); if (ready) return ready;
      const stage = join(this.root, `.candidate-${randomUUID()}`);
      await mkdir(stage, { mode: 0o700 });
      try {
        const archive = join(stage, 'program.tar.gz'); let manifest;
        if (this.acquire) manifest = await this.acquire({ version, target: this.target, archive });
        else {
          process.stderr.write(`re:desktop: preparing ${version} for ${this.target}\n`);
          const { data, privateReader } = await releaseMetadata(version);
          if (data.draft || data.tag_name !== `v${version}` || !Array.isArray(data.assets)) throw failure('RELEASE_INVALID', 'Only an exact published release can be prepared.');
          const candidates = data.assets.filter(asset => asset.name === 'release.json');
          if (candidates.length !== 1 || candidates[0].size > limits.manifest) throw failure('RELEASE_INVALID', 'Release manifest is missing or ambiguous.');
          const file = join(stage, 'manifest.json');
          await download(data, candidates[0], file, privateReader, limits.manifest);
          manifest = JSON.parse(await readFile(file, 'utf8'));
          const selected = validateManifest(manifest, version, this.target);
          const assets = data.assets.filter(asset => asset.name === selected.filename);
          if (assets.length !== 1 || assets[0].size !== selected.size) throw failure('RELEASE_INVALID', 'Expected native asset is missing or changed.');
          await download(data, assets[0], archive, privateReader, selected.size);
        }
        const asset = validateManifest(manifest, version, this.target);
        if ((await lstat(archive)).size !== asset.size || await hashFile(archive) !== asset.sha256) throw failure('DIGEST_MISMATCH', 'Native asset size or SHA-256 differs from the release manifest.');
        await inspectArchive(archive);
        const admitted = join(stage, 'admitted'), program = join(admitted, 'program');
        await mkdir(program, { recursive: true, mode: 0o700 });
        await tar.x({ file: archive, cwd: program, strict: true, preserveOwner: false, noChmod: false });
        await this.checkProgram(program, manifest, asset);
        await atomicJson(join(admitted, 'ready.json'), { manifest, inventory: await inventory(program) });
        await ownedDirectory(join(this.root, version));
        await rename(admitted, join(this.root, version, this.target));
        return await this.cached(version);
      } finally { await rm(stage, { recursive: true, force: true }); }
    });
  }
}
