import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runBend, bend } from './bend.mjs';

await mkdir('build', { recursive: true });
const pin = JSON.parse(await readFile('toolchain.json'));
const version = spawnSync(bend, ['version'], { encoding: 'utf8', env: { ...process.env, BEND_NO_TELEMETRY: '1' } });
if (version.status !== 0 || !version.stdout.includes(pin.bend)) throw new Error(`Expected Bend ${pin.bend}; run npm run setup:bend`);
runBend(['core/access.bend', '-o', 'build/access.mjs']);
const source = await readFile('core/access.bend');
const output = await readFile('build/access.mjs');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await writeFile('build/provenance.json', JSON.stringify({ bend: pin.bend, source: digest(source), output: digest(output) }, null, 2) + '\n');
console.log(`Bend core compiled to build/access.mjs (${output.length} bytes)`);
