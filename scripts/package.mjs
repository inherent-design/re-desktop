import { packager } from '@electron/packager';
import { readFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve, isAbsolute } from 'node:path';
import './check-build.mjs';

const pkg = JSON.parse(await readFile('package.json'));
const api = JSON.parse(await readFile('api.json'));
const source = process.env.RE_DESKTOP_SOURCE ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(source)) throw new Error('A full source revision is required');
const out = resolve('dist/builds', pkg.version);
const stage = join(out, 'stage');
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
// A production allowlist keeps development scripts and private evidence out.
for (const path of ['src', 'core', 'build/access.mjs', 'build/provenance.json', 'api.json', 'LICENSE', 'licenses', 'THIRD_PARTY_NOTICES.md', 'package.json', 'package-lock.json']) {
  await cp(path, join(stage, path), { recursive: true });
}
for (const file of ['profile.mjs', 'integration.mjs']) await cp(join('bootstrap/lib', file), join(stage, 'bootstrap/lib', file), { recursive: true });
const npmCli = process.env.npm_execpath;
if (!npmCli || !isAbsolute(npmCli)) throw new Error('Use npm run package so the npm CLI path is explicit');
execFileSync(process.execPath, [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: stage, stdio: 'inherit' });
const { devDependencies, scripts, ...productionPackage } = pkg;
await writeFile(join(stage, 'package.json'), JSON.stringify(productionPackage, null, 2) + '\n');
const paths = await packager({
  dir: stage, out, name: 're-desktop', executableName: 're-desktop',
  appVersion: pkg.version, appBundleId: 'design.inherent.re-desktop',
  win32metadata: { CompanyName: 'inherent.design', ProductName: 're:desktop' },
  appCopyright: 'Copyright 2026 inherent.design contributors',
  extendInfo: { LSUIElement: true, CFBundleDisplayName: 're:desktop' },
  platform: process.platform, arch: process.arch, asar: true, overwrite: true,
  electronVersion: pkg.devDependencies.electron, prune: false, quiet: true
});
const folder = paths[0], bridge = join(folder, 'bridge');
await mkdir(join(bridge, 'src'), { recursive: true });
for (const file of ['mcp.mjs', 'peer.mjs', 'runtime.mjs', 'api.mjs', 'heartbeat.mjs', 'client.mjs']) await cp(join(stage, 'src', file), join(bridge, 'src', file));
for (const file of ['profile.mjs', 'integration.mjs']) await cp(join('bootstrap/lib', file), join(bridge, 'bootstrap/lib', file), { recursive: true });
for (const file of ['node_modules', 'api.json', 'LICENSE', 'licenses', 'THIRD_PARTY_NOTICES.md']) await cp(join(stage, file), join(bridge, file), { recursive: true, verbatimSymlinks: true });
await writeFile(join(bridge, 'package.json'), JSON.stringify({ name: 're-desktop-bridge', version: pkg.version, type: 'module', license: pkg.license, dependencies: pkg.dependencies }, null, 2) + '\n');
await writeFile(join(folder, 'release.json'), JSON.stringify({ version: pkg.version, source, platform: process.platform, arch: process.arch, api, core: JSON.parse(await readFile('build/provenance.json')) }, null, 2) + '\n');
await rm(stage, { recursive: true, force: true });
console.log(folder);
