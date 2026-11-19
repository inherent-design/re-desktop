import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const { version } = JSON.parse(await readFile('package.json'));
const folder = `re-desktop-${process.platform}-${process.arch}`;
const filename = `re-desktop-${version}-${process.platform}-${process.arch}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`;
if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', 'scripts/archive.ps1', '-Source', resolve('dist', folder), '-Destination', resolve('dist', filename)]);
else execFileSync('tar', ['-czf', `dist/${filename}`, '-C', 'dist', folder]);
const hash = createHash('sha256').update(await readFile(`dist/${filename}`)).digest('hex');
await writeFile(`dist/${filename}.sha256`, `${hash}  ${filename}\n`);
console.log(`dist/${filename}`);
