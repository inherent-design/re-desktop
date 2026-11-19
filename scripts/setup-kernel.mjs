import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';

const version = '4.34.0'; // Required by Bend 2.0.40's separate BendTT kernel.
if (!['darwin', 'linux'].includes(process.platform) || !['arm64', 'x64'].includes(process.arch)) throw new Error('Kernel setup supports macOS and Linux');
const platform = `${process.platform}${process.arch === 'arm64' ? '_aarch64' : ''}`;
const name = `lean-${version}-${platform}`;
if (existsSync(`.tools/${name}/bin/lean`)) {
  console.log(execFileSync(`.tools/${name}/bin/lean`, ['--version'], { encoding: 'utf8' }).trim());
} else {
  const releaseResponse = await fetch(`https://api.github.com/repos/leanprover/lean4/releases/tags/v${version}`);
  if (!releaseResponse.ok) throw new Error(`Lean release metadata: HTTP ${releaseResponse.status}`);
  const release = await releaseResponse.json();
  const asset = release.assets.find(a => a.name === `${name}.tar.zst`);
  if (!asset?.digest?.startsWith('sha256:')) throw new Error('Lean release has no verified digest for this platform');
  await mkdir('.tools', { recursive: true });
  const file = `.tools/${name}.tar.zst`;
  const response = await fetch(asset.browser_download_url);
  if (!response.ok) throw new Error(`Lean download: HTTP ${response.status}`);
  const input = Readable.fromWeb(response.body);
  const hash = createHash('sha256');
  input.on('data', bytes => hash.update(bytes));
  await pipeline(input, createWriteStream(file, { flags: 'wx' }));
  if (`sha256:${hash.digest('hex')}` !== asset.digest) throw new Error('Lean archive digest mismatch');
  execFileSync('tar', ['-xf', file, '-C', '.tools']);
  await rm(file);
  console.log(`Lean ${version} installed; release SHA-256 verified`);
}
