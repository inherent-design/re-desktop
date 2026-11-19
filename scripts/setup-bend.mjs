import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const pin = JSON.parse(await readFile(new URL('toolchain.json', root)));
const platform = `${process.platform}-${process.arch}`;
if (!pin.sha256[platform]) throw new Error(`Bend compiler does not support ${platform}. On Windows, use the CI-generated build/access.mjs artifact; see docs/development.md.`);
const dir = await mkdtemp(join(tmpdir(), 're-desktop-bend-'));
try {
  const name = `bend-${pin.bend}-${platform}.tar.gz`;
  const response = await fetch(`https://github.com/bendlang/bend/releases/download/v${pin.bend}/${name}`);
  if (!response.ok) throw new Error(`Bend download: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== pin.sha256[platform]) throw new Error('Bend archive digest mismatch');
  await writeFile(join(dir, name), bytes);
  execFileSync('tar', ['-xzf', join(dir, name), '-C', dir]);
  const destination = new URL('.tools/bend/', root);
  await mkdir(destination, { recursive: true });
  for (const entry of ['bin', 'bend2', 'guide']) await cp(join(dir, 'bend', entry), new URL(entry, destination), { recursive: true });
  console.log(`Bend ${pin.bend} installed and SHA-256 verified (${platform})`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
