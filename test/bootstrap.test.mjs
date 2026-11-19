import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { create } from 'tar';
import { ProgramStore, validateManifest } from '../bootstrap/lib/store.mjs';
import api from '../api.json' with { type: 'json' };
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rd-cache-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, 'input'), version = '0.2.0-preview.1', target = `${process.platform}-${process.arch}`;
  const host = process.platform === 'darwin' ? 're-desktop.app/Contents/MacOS/re-desktop' : process.platform === 'win32' ? 're-desktop.exe' : 're-desktop';
  await mkdir(join(input, host, '..'), { recursive: true });
  await mkdir(join(input, 'bridge/src'), { recursive: true });
  await writeFile(join(input, host), 'native executable', { mode: 0o755 });
  await writeFile(join(input, 'bridge/src/mcp.mjs'), 'bridge');
  const identity = { version, source: 'a'.repeat(40), platform: process.platform, arch: process.arch, api };
  await writeFile(join(input, 'release.json'), JSON.stringify(identity));
  if (process.platform !== 'win32') await symlink('src', join(input, 'bridge/current'));
  const file = join(root, 'fixture.tar.gz');
  await create({ file, cwd: input, gzip: true, portable: true }, await readdir(input));
  const bytes = await readFile(file);
  const asset = { platform: process.platform, arch: process.arch, filename: `re-desktop-${version}-${target}.tar.gz`, host, bridge: 'bridge/src/mcp.mjs', sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, signing: 'unsigned-preview' };
  const manifest = { format: 1, repository: 'inherent-design/re-desktop', version, source: identity.source, api, targets: [asset] };
  let acquired = 0;
  const acquire = async ({ archive }) => { acquired++; await cp(file, archive); return manifest; };
  return { root, file, manifest, asset, version, target, acquire, count: () => acquired };
}

test('cold acquisition admits complete bytes; concurrent and offline clients reuse verified generation and links', async t => {
  const f = await fixture(t), root = join(f.root, 'store');
  const a = new ProgramStore({ root, acquire: f.acquire }), b = new ProgramStore({ root, acquire: f.acquire });
  const [one, two] = await Promise.all([a.prepare(f.version), b.prepare(f.version)]);
  assert.equal(f.count(), 1);
  assert.equal(one.program, two.program);
  const offline = await new ProgramStore({ root, acquire: () => { throw new Error('network used'); } }).prepare(f.version, { offline: true });
  assert.equal(offline.program, one.program);
  if (process.platform !== 'win32') assert.equal(await readFile(join(one.program, 'bridge/current/mcp.mjs'), 'utf8'), 'bridge');
  await writeFile(join(one.program, 'bridge/src/mcp.mjs'), 'corrupted');
  await assert.rejects(a.prepare(f.version), { code: 'CACHE_INVALID' });
  assert.equal(f.count(), 1);
});

test('missing, unsupported and incompatible releases fail without committing a generation', async t => {
  const f = await fixture(t);
  await assert.rejects(new ProgramStore({ root: join(f.root, 'offline') }).prepare(f.version, { offline: true }), { code: 'CACHE_MISS' });
  assert.throws(() => validateManifest(f.manifest, f.version, 'unsupported-target'), { code: 'TARGET_UNSUPPORTED' });
  assert.throws(() => validateManifest({ ...f.manifest, api: { ...api, shared: { supported: [2] } } }, f.version, f.target), { code: 'API_UPGRADE_REQUIRED' });
  const bad = new ProgramStore({ root: join(f.root, 'bad'), acquire: async args => { await f.acquire(args); return { ...f.manifest, targets: [{ ...f.asset, sha256: '0'.repeat(64) }] }; } });
  await assert.rejects(bad.prepare(f.version), { code: 'DIGEST_MISMATCH' });
  assert.deepEqual(await readdir(bad.root), []);
});

test('interrupted acquisition preserves prior generation and a later retry succeeds', async t => {
  const f = await fixture(t), root = join(f.root, 'store');
  await new ProgramStore({ root, acquire: f.acquire }).prepare(f.version);
  const broken = new ProgramStore({ root, target: 'linux-x64', acquire: async ({ archive }) => { await writeFile(archive, 'partial'); throw new Error('interrupted'); } });
  await assert.rejects(broken.prepare('0.3.0-preview.1'), /interrupted/);
  assert.ok(await new ProgramStore({ root }).prepare(f.version, { offline: true }));
  assert.deepEqual((await readdir(root)).sort(), [f.version]);
  const retry = join(f.root, 'retry');
  await assert.rejects(new ProgramStore({ root: retry, acquire: () => { throw new Error('interrupted'); } }).prepare(f.version), /interrupted/);
  assert.ok(await new ProgramStore({ root: retry, acquire: f.acquire }).prepare(f.version));
});

test('unsafe member names and escaping symlinks are rejected before extraction', async t => {
  const f = await fixture(t);
  for (const kind of ['parent', 'link']) {
    if (kind === 'link' && process.platform === 'win32') continue;
    const dir = join(f.root, kind); await mkdir(dir);
    await writeFile(join(dir, 'file'), 'escape');
    if (kind === 'link') await symlink('../outside', join(dir, 'escape'));
    const file = join(f.root, `${kind}.tar.gz`);
    await create({ file, cwd: dir, gzip: true, ...(kind === 'parent' ? { prefix: '../escape' } : {}) }, await readdir(dir));
    const bytes = await readFile(file), asset = { ...f.asset, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    const store = new ProgramStore({ root: join(f.root, `store-${kind}`), acquire: async ({ archive }) => { await cp(file, archive); return { ...f.manifest, targets: [asset] }; } });
    await assert.rejects(store.prepare(f.version), { code: 'ARCHIVE_INVALID' });
    assert.deepEqual(await readdir(store.root), []);
  }
});

test('a killed cache writer leaves no executable generation and the next preparation recovers its lock', async t => {
  const f = await fixture(t), root = join(f.root, 'store');
  await mkdir(root);
  const code = `import { withLock } from ${JSON.stringify(pathToFileURL(resolve('bootstrap/lib/store.mjs')).href)}; await withLock(process.argv[1], async () => { process.stdout.write('locked\\n'); setInterval(() => {}, 1000); await new Promise(() => {}); });`;
  const writer = spawn(process.execPath, ['--input-type=module', '-e', code, join(root, '.acquire-lock')], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (writer.exitCode === null && writer.signalCode === null) writer.kill('SIGKILL'); });
  await once(writer.stdout, 'data');
  const exit = once(writer, 'exit'); writer.kill('SIGKILL'); await exit;
  const store = new ProgramStore({ root, acquire: f.acquire });
  assert.equal(await store.cached(f.version), null);
  assert.ok(await store.prepare(f.version));
  assert.equal(f.count(), 1);
});
