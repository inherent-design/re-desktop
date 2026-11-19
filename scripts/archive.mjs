import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { create } from 'tar';

const { version } = JSON.parse(await readFile('package.json'));
const folder = resolve('dist/builds', version, `re-desktop-${process.platform}-${process.arch}`);
const filename = `re-desktop-${version}-${process.platform}-${process.arch}.tar.gz`;
const file = resolve('dist', filename);
await create({ cwd: folder, file, gzip: true, portable: true, noMtime: true }, (await readdir(folder)).sort());
const hash = createHash('sha256');
for await (const bytes of createReadStream(file)) hash.update(bytes);
const sha256 = hash.digest('hex');
await writeFile(`${file}.sha256`, `${sha256}  ${filename}\n`);
const identity = JSON.parse(await readFile(join(folder, 'release.json')));
const asset = { platform: process.platform, arch: process.arch, filename, sha256, size: (await stat(file)).size,
  host: process.platform === 'darwin' ? 're-desktop.app/Contents/MacOS/re-desktop' : process.platform === 'win32' ? 're-desktop.exe' : 're-desktop',
  bridge: 'bridge/src/mcp.mjs', signing: 'unsigned-preview' };
await writeFile(`${file}.json`, JSON.stringify({ ...identity, asset }, null, 2) + '\n');
console.log(file);
