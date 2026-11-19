import { appendFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';

if (process.argv[2] === 'export') {
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  const module = gzipSync(await readFile('build/access.mjs')).toString('base64');
  const provenance = (await readFile('build/provenance.json')).toString('base64');
  if (module.length + provenance.length > 60000) throw new Error('Core output exceeds the intended small job-output handoff');
  await appendFile(process.env.GITHUB_OUTPUT, `module=${module}\nprovenance=${provenance}\n`);
  console.log(`Exported the compressed Bend core and provenance (${module.length + provenance.length} characters)`);
} else if (process.argv[2] === 'import') {
  const decode = value => {
    if (!value || value.length > 60000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Missing or invalid core job output');
    const bytes = Buffer.from(value, 'base64');
    if (bytes.toString('base64') !== value) throw new Error('Noncanonical core job output');
    return bytes;
  };
  const module = gunzipSync(decode(process.env.BEND_MODULE), { maxOutputLength: 262144 });
  const provenance = decode(process.env.BEND_PROVENANCE);
  JSON.parse(provenance.toString('utf8'));
  await mkdir('build', { recursive: true });
  await writeFile('build/access.mjs', module);
  await writeFile('build/provenance.json', provenance);
  console.log('Imported Bend output; check:build verifies source and output digests next');
} else throw new Error('Use export or import');
