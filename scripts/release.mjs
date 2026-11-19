import { execFileSync } from 'node:child_process';
import { appendFile, open, readFile, writeFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';

const repository = 'inherent-design/re-desktop';
const pkg = JSON.parse(await readFile('package.json'));
const bootstrap = JSON.parse(await readFile('bootstrap/package.json'));
const tag = `v${pkg.version}`;
const command = process.argv[2];
const gh = args => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 8 * 1048576, timeout: 180000 });
const api = (path, ...options) => JSON.parse(gh(['api', `repos/${repository}/${path}`, ...options]));
const source = process.env.GITHUB_SHA ?? gh(['api', `repos/${repository}/commits/${tag}`, '--jq', '.sha']).trim();
const hash = async file => { const value = createHash('sha256'); for await (const bytes of createReadStream(file)) value.update(bytes); return value.digest('hex'); };
const nativeFiles = target => {
  const archive = `re-desktop-${pkg.version}-${target}.tar.gz`;
  return [archive, `${archive}.json`, `${archive}.sha256`];
};
function release(id = Number(process.env.RELEASE_ID)) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('The draft job must supply a release ID');
  const record = api(`releases/${id}`);
  if (record.id !== id || record.tag_name !== tag || record.target_commitish !== source || !record.prerelease) throw new Error('The release ID does not identify the expected preview and source');
  return record;
}
async function download(asset, file) {
  if (!Number.isSafeInteger(asset?.id) || asset.id < 1 || asset.state !== 'uploaded') throw new Error('Expected a completed release asset');
  const output = await open(file, 'wx', 0o600);
  try {
    execFileSync('gh', ['api', `repos/${repository}/releases/assets/${asset.id}`, '-H', 'Accept: application/octet-stream'], { stdio: ['ignore', output.fd, 'pipe'], timeout: 180000 });
  } finally { await output.close(); }
}
async function upload(file) {
  const current = release();
  const name = basename(file), size = (await stat(file)).size, digest = `sha256:${await hash(file)}`;
  const existing = current.assets.filter(asset => asset.name === name);
  if (existing.length > 1) throw new Error(`Ambiguous release asset ${name}`);
  if (existing.length) {
    if (existing[0].state !== 'uploaded' || existing[0].size !== size) throw new Error(`Refusing incomplete or changed asset ${name}`);
    let storedDigest = existing[0].digest;
    if (!storedDigest) {
      const temporary = await mkdtemp(join(tmpdir(), 'rd-existing-'));
      try { await download(existing[0], join(temporary, name)); storedDigest = `sha256:${await hash(join(temporary, name))}`; }
      finally { await rm(temporary, { recursive: true, force: true }); }
    }
    if (storedDigest !== digest) throw new Error(`Refusing changed immutable asset ${name}`);
    return;
  }
  if (!current.draft) throw new Error('Cannot add assets to an already published immutable release');
  const endpoint = `https://uploads.github.com/repos/${repository}/releases/${current.id}/assets?name=${encodeURIComponent(name)}`;
  const uploaded = JSON.parse(gh(['api', endpoint, '--method', 'POST', '-H', 'Content-Type: application/octet-stream', '--input', file]));
  if (uploaded.name !== name || uploaded.size !== size || uploaded.state !== 'uploaded' || (uploaded.digest && uploaded.digest !== digest)) throw new Error(`Upload verification failed for ${name}`);
  console.log(`Verified upload of ${name}`);
}
if (command === 'preflight') {
  const taggedSource = gh(['api', `repos/${repository}/commits/${tag}`, '--jq', '.sha']).trim();
  if (pkg.version !== bootstrap.version || process.env.GITHUB_REF !== `refs/tags/${tag}` || process.env.GITHUB_SHA !== source || source !== taggedSource) throw new Error('Tag, source, host and bootstrap versions must identify this exact release');
  if (!pkg.version.includes('-preview.')) throw new Error('Only unsigned previews are configured. Signed stable release policy must be implemented first.');
  const runs = api(`actions/workflows/build.yml/runs?head_sha=${source}&status=completed`).workflow_runs;
  if (!runs.some(run => run.conclusion === 'success' && ['dev', 'main'].includes(run.head_branch) && run.head_sha === source)) throw new Error('This exact source has not passed branch CI on dev/main');
  console.log(`Qualified ${tag} at ${source}`);
} else if (command === 'draft') {
  // The published-tag endpoint cannot look up drafts. Later jobs use the numeric ID.
  const listed = gh(['api', `repos/${repository}/releases?per_page=100`, '--paginate', '--jq', `.[] | select(.tag_name == ${JSON.stringify(tag)}) | .id`]).trim();
  const ids = listed ? listed.split(/\s+/).map(Number) : [];
  if (ids.length > 1) throw new Error(`Multiple releases identify ${tag}`);
  const record = ids.length ? release(ids[0]) : api('releases', '--method', 'POST',
    '-f', `tag_name=${tag}`, '-f', `target_commitish=${source}`,
    '-F', 'draft=true', '-F', 'prerelease=true', '-f', 'make_latest=false',
    '-f', `name=re:desktop ${pkg.version}`,
    '-f', 'body=Unsigned preview for macOS arm64, Windows x64, and Linux x64. Install the exact npm bootstrap and run re-desktop setup. The native tray starts paused. Linux requires a desktop indicator and Chromium sandbox support. See the versioned distribution documentation for API and installation details.');
  if (!record.draft || !Number.isSafeInteger(record.id) || record.id < 1 || record.tag_name !== tag || record.target_commitish !== source) throw new Error('The expected draft release is unavailable');
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  await appendFile(process.env.GITHUB_OUTPUT, `release-id=${record.id}\n`);
  console.log(`Prepared draft ${record.id} for ${tag}`);
} else if (command === 'upload-native') {
  for (const file of nativeFiles(`${process.platform}-${process.arch}`)) await upload(resolve('dist', file));
} else if (command === 'publish') {
  const expected = ['darwin-arm64', 'win32-x64', 'linux-x64'];
  const temporary = await mkdtemp(join(tmpdir(), 'rd-release-'));
  try {
    const published = release();
    const contract = JSON.parse(await readFile('api.json'));
    const core = JSON.parse(Buffer.from(process.env.BEND_PROVENANCE ?? '', 'base64').toString('utf8'));
    const records = [];
    for (const target of expected) {
      const files = nativeFiles(target), [name, identity, checksum] = files;
      for (const filename of files) {
        const assets = published.assets.filter(asset => asset.name === filename);
        if (assets.length !== 1) throw new Error(`Incomplete target inventory: ${filename}`);
        const limit = filename === name ? 512 * 1048576 : 1048576;
        if (!Number.isSafeInteger(assets[0].size) || assets[0].size < 1 || assets[0].size > limit) throw new Error(`Invalid asset size: ${filename}`);
        await download(assets[0], join(temporary, filename));
      }
      const record = JSON.parse(await readFile(join(temporary, identity)));
      if (record.source !== source || record.version !== pkg.version || `${record.platform}-${record.arch}` !== target || record.asset.filename !== name || record.asset.sha256 !== await hash(join(temporary, name)) || record.asset.size !== (await stat(join(temporary, name))).size || JSON.stringify(record.api) !== JSON.stringify(contract)) throw new Error(`Release identity/digest mismatch: ${target}`);
      if ((await readFile(join(temporary, checksum), 'utf8')).trim() !== `${record.asset.sha256}  ${name}`) throw new Error('Checksum sidecar mismatch');
      if (JSON.stringify(record.core) !== JSON.stringify(core)) throw new Error(`Target differs from the proved Bend core: ${target}`);
      records.push(record);
    }
    const npm = resolve('dist', `inherent-design-re-desktop-${pkg.version}.tgz`);
    await upload(npm);
    await mkdir('dist', { recursive: true });
    const manifest = { format: 1, repository, version: pkg.version, source, api: contract, bootstrap_api: 1, core,
      qualification: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`, targets: records.map(record => record.asset), npm: { filename: basename(npm), sha256: await hash(npm), size: (await stat(npm)).size } };
    const { validateManifest } = await import('../bootstrap/lib/store.mjs');
    for (const target of expected) validateManifest(manifest, pkg.version, target);
    await writeFile('dist/release.json', JSON.stringify(manifest, null, 2) + '\n');
    await upload(resolve('dist/release.json'));
    const final = release();
    const required = [...expected.flatMap(nativeFiles), basename(npm), 'release.json'].sort();
    if (JSON.stringify(final.assets.map(asset => asset.name).sort()) !== JSON.stringify(required) || final.assets.some(asset => asset.state !== 'uploaded')) throw new Error('Draft contains unexpected or incomplete assets');
    if (final.draft) {
      const result = api(`releases/${final.id}`, '--method', 'PATCH', '-F', 'draft=false', '-F', 'prerelease=true', '-f', 'make_latest=false');
      if (result.id !== final.id || result.draft || result.tag_name !== tag) throw new Error('Publication verification failed');
    }
    console.log(`Published complete ${tag}; manifest uploaded last`);
  } finally { await rm(temporary, { recursive: true, force: true }); }
} else if (command === 'npm') {
  const file = resolve('dist', `inherent-design-re-desktop-${pkg.version}.tgz`);
  const manifest = JSON.parse(await readFile('dist/release.json'));
  if (manifest.source !== source || manifest.version !== pkg.version || manifest.npm.sha256 !== await hash(file)) throw new Error('npm package differs from the verified published release');
  const registry = await fetch(`https://registry.npmjs.org/@inherent-design%2Fre-desktop/${pkg.version}`, { signal: AbortSignal.timeout(20000) });
  if (registry.ok) {
    const metadata = await registry.json(), digest = createHash('sha512');
    for await (const bytes of createReadStream(file)) digest.update(bytes);
    if (metadata.dist?.integrity !== `sha512-${digest.digest('base64')}`) throw new Error('Refusing an npm version that already contains different bytes');
    console.log('Identical npm version is already published');
    process.exit(0);
  }
  if (registry.status !== 404) throw new Error(`npm lookup returned HTTP ${registry.status}`);
  const args = ['publish', file, '--access', 'public', '--tag', 'preview'];
  if (process.env.RELEASE_PUBLIC === 'true') args.push('--provenance');
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { stdio: 'inherit' });
} else throw new Error('Use preflight, draft, upload-native, publish or npm');
