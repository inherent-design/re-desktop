import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, cp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { ProgramStore } from '../bootstrap/lib/store.mjs';
import { startHost } from '../src/host.mjs';
import { mcpClient, tool } from './mcp-client.mjs';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(await readFile('package.json'));
const file = resolve('dist', `re-desktop-${version}-${process.platform}-${process.arch}.tar.gz`);
const identity = JSON.parse(await readFile(`${file}.json`));
const root = await mkdtemp(join(tmpdir(), 'rd-admit-'));
let host, client;
try {
  const store = new ProgramStore({ root: join(root, 'programs'), acquire: async ({ archive }) => {
    await cp(file, archive);
    return { format: 1, repository: 'inherent-design/re-desktop', version, source: identity.source, api: identity.api, targets: [identity.asset] };
  } });
  const generation = await store.prepare(version);
  host = await startHost({ root: join(root, 'runtime') });
  if (process.platform === 'win32') execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { realpath } from 'node:fs/promises';
    import { pathToFileURL } from 'node:url';
    const requested = pathToFileURL(process.argv[1]).href;
    const resolved = import.meta.resolve(requested);
    const native = pathToFileURL(await realpath(process.argv[1])).href;
    console.log(JSON.stringify({ requested, resolved, native, oldEntryCheck: resolved === native }));
  `, join(generation.program, generation.asset.bridge)], { stdio: 'inherit' });
  client = await mcpClient(host.paths.root, 'extracted-node-bridge', { entry: join(generation.program, generation.asset.bridge) });
  assert.equal((await client.client.listTools()).tools.length, 11);
  assert.equal((await tool(client.client, 'desktop_subscribe', { name: 'Admitted native archive', workspace: root })).data.user_blocked, true);
  const status = (await tool(client.client, 'desktop_runtime_status')).data;
  assert.equal(status.agreement.shared_api, 1);
  assert.equal(status.agreement.host_version, version);
  assert.ok(await store.prepare(version, { offline: true }));
  const report = { version, source: identity.source, target: store.target, checks: ['Archive digest, safe extraction, complete tree and entry identities verified', 'Extracted bridge discovered eleven tools through external Node', 'Extracted bridge negotiated shared IPC 1 with a paused source host', 'Warm offline program tree reverified'], nativeHost: false };
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/archive-acceptance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`Archive admission passed (${report.checks.length} checks)`);
} finally { await client?.client.close(); await host?.close(); await rm(root, { recursive: true, force: true }); }
