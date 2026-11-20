import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const { name, version } = JSON.parse(await readFile('bootstrap/package.json', 'utf8'));
const filename = `${name.slice(1).replace('/', '-')}-${version}.tgz`;
const tarball = await readFile(resolve('dist', filename));
const expected = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
const url = `https://registry.npmjs.org/${name.replace('/', '%2F')}`;
const deadline = Date.now() + 20 * 60000;
let lastStatus = 'not checked';

console.log(`Waiting for ${name}@${version} to become available after npm scanning.`);
while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
    lastStatus = `HTTP ${response.status}`;
    if (response.ok) {
      const metadata = await response.json();
      const published = metadata.versions?.[version];
      if (metadata.name !== name || (published && (published.name !== name || published.version !== version || published.dist?.integrity !== expected))) {
        throw Object.assign(new Error('Registry package identity or integrity differs from the published tarball'), { permanent: true });
      }
      if (published) {
        console.log(`Verified public registry metadata and integrity for ${name}@${version}`);
        process.exit(0);
      }
      lastStatus = 'package metadata does not yet contain this version';
    } else {
      await response.body?.cancel();
      if (![404, 408, 425, 429].includes(response.status) && response.status < 500) {
        throw Object.assign(new Error(`Registry availability check failed with ${lastStatus}`), { permanent: true });
      }
    }
  } catch (error) {
    if (error.permanent) throw error;
    lastStatus = error.message;
  }
  await delay(Math.min(15000, Math.max(0, deadline - Date.now())));
}
throw new Error(`npm has not exposed ${name}@${version} within 20 minutes (${lastStatus}). Inspect the npm publish-time scan before retrying publication.`);
