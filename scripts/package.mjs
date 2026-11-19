import { packager } from '@electron/packager';
import { readFile } from 'node:fs/promises';
import './check-build.mjs';

const { version } = JSON.parse(await readFile('package.json'));
const paths = await packager({
  dir: '.', out: 'dist', name: 're-desktop', executableName: 're-desktop',
  appVersion: version, appBundleId: 'exe.mannie.re-desktop',
  appCopyright: 'Copyright 2026 mannie-exe',
  extendInfo: { LSUIElement: true, CFBundleDisplayName: 're:desktop' },
  platform: process.platform, arch: process.arch, asar: true, overwrite: true,
  prune: true, ignore: [/^\/(\.git|\.tools|\.github|artifacts|dist|test)(\/|$)/],
  quiet: true
});
console.log(paths.join('\n'));
