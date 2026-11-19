import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
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
const api = path => JSON.parse(gh(['api', `repos/${repository}/${path}`]));
const source = process.env.GITHUB_SHA ?? gh(['api', `repos/${repository}/commits/${tag}`, '--jq', '.sha']).trim();
const hash = async file => { const value = createHash('sha256'); for await (const bytes of createReadStream(file)) value.update(bytes); return value.digest('hex'); };
const release = () => api(`releases/tags/${tag}`);
async function upload(file) {
  const name = basename(file), existing = release().assets.filter(asset => asset.name === name);
  if (existing.length > 1) throw new Error(`Ambiguous release asset ${name}`);
  if (existing.length) {
    if (existing[0].size !== (await stat(file)).size) throw new Error(`Refusing changed asset ${name}`);
    let digest = existing[0].digest;
    if (!digest) {
      const temporary = await mkdtemp(join(tmpdir(), 'rd-existing-'));
      try { gh(['release', 'download', tag, '--repo', repository, '--pattern', name, '--dir', temporary]); digest = `sha256:${await hash(join(temporary, name))}`; }
      finally { await rm(temporary, { recursive: true, force: true }); }
    }
    if (digest !== `sha256:${await hash(file)}`) throw new Error(`Refusing changed immutable asset ${name}`);
    return;
  }
  if (!release().draft) throw new Error('Cannot add assets to an already published immutable release');
  gh(['release', 'upload', tag, file, '--repo', repository]);
}
if (command === 'preflight') {
  const taggedSource = gh(['api', `repos/${repository}/commits/${tag}`, '--jq', '.sha']).trim();
  if (pkg.version !== bootstrap.version || process.env.GITHUB_REF !== `refs/tags/${tag}` || process.env.GITHUB_SHA !== source || source !== taggedSource) throw new Error('Tag, source, host and bootstrap versions must identify this exact release');
  if (!pkg.version.includes('-preview.')) throw new Error('Only unsigned previews are configured. Signed stable release policy must be implemented first.');
  const runs = api(`actions/workflows/build.yml/runs?head_sha=${source}&status=completed`).workflow_runs;
  if (!runs.some(run => run.conclusion === 'success' && ['dev', 'main'].includes(run.head_branch) && run.head_sha === source)) throw new Error('This exact source has not passed branch CI on dev/main');
  console.log(`Qualified ${tag} at ${source}`);
} else if (command === 'draft') {
  let existing;
  try { existing = release(); } catch (error) { if (!error.stderr?.toString().includes('404')) throw error; }
  if (existing) { if (!existing.draft) throw new Error('Release is already published; retry only failed publish steps'); }
  else gh(['release', 'create', tag, '--repo', repository, '--verify-tag', '--draft', '--prerelease', '--title', `re:desktop ${pkg.version}`, '--notes', 'Unsigned preview. Native macOS arm64, Windows x64 and Linux x64 payloads with an exact-version npm bootstrap. Human pause and deliberate Quit remain in control. Linux requires desktop indicator and Chromium sandbox support; no automatic elevation or sandbox disabling. See the versioned distribution documentation for API, trust and installation limits.']);
} else if (command === 'upload-native') {
  const file = resolve('dist', `re-desktop-${pkg.version}-${process.platform}-${process.arch}.tar.gz`);
  for (const path of [file, `${file}.sha256`, `${file}.json`]) await upload(path);
} else if (command === 'publish') {
  const expected = ['darwin-arm64', 'win32-x64', 'linux-x64'];
  const temporary = await mkdtemp(join(tmpdir(), 'rd-release-'));
  try {
    const published = release();
    const contract = JSON.parse(await readFile('api.json'));
    const records = [];
    for (const target of expected) {
      const name = `re-desktop-${pkg.version}-${target}.tar.gz`;
      for (const filename of [name, `${name}.json`, `${name}.sha256`]) {
        if (published.assets.filter(asset => asset.name === filename).length !== 1) throw new Error(`Incomplete target inventory: ${filename}`);
        gh(['release', 'download', tag, '--repo', repository, '--pattern', filename, '--dir', temporary]);
      }
      const record = JSON.parse(await readFile(join(temporary, `${name}.json`)));
      if (record.source !== source || record.version !== pkg.version || `${record.platform}-${record.arch}` !== target || record.asset.filename !== name || record.asset.sha256 !== await hash(join(temporary, name)) || record.asset.size !== (await stat(join(temporary, name))).size || JSON.stringify(record.api) !== JSON.stringify(contract)) throw new Error(`Release identity/digest mismatch: ${target}`);
      if ((await readFile(join(temporary, `${name}.sha256`), 'utf8')).trim() !== `${record.asset.sha256}  ${name}`) throw new Error('Checksum sidecar mismatch');
      if (records.length && JSON.stringify(record.core) !== JSON.stringify(records[0].core)) throw new Error('Targets contain different Bend provenance');
      records.push(record);
    }
    const npm = resolve('dist', `inherent-design-re-desktop-${pkg.version}.tgz`);
    await upload(npm);
    await mkdir('dist', { recursive: true });
    const manifest = { format: 1, repository, version: pkg.version, source, api: contract, bootstrap_api: 1, core: records[0].core,
      qualification: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`, targets: records.map(record => record.asset), npm: { filename: basename(npm), sha256: await hash(npm), size: (await stat(npm)).size } };
    await writeFile('dist/release.json', JSON.stringify(manifest, null, 2) + '\n');
    await upload(resolve('dist/release.json'));
    if (published.draft) gh(['release', 'edit', tag, '--repo', repository, '--draft=false', '--prerelease']);
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
