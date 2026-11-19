import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function checkBuild() {
  const provenance = JSON.parse(await readFile('build/provenance.json'));
  const pin = JSON.parse(await readFile('toolchain.json'));
  const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
  if (provenance.bend !== pin.bend || provenance.source !== await digest('core/access.bend') || provenance.output !== await digest('build/access.mjs')) throw new Error('Bend build is missing, stale or changed. Run npm run build on macOS/Linux.');
  console.log(`Verified Bend ${pin.bend} build provenance`);
}
await checkBuild();
