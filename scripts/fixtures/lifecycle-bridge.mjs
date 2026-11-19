// Test-only instrumentation, sharing the product bridge's actual cleanup path.
import { writeFile } from 'node:fs/promises';
import { peer } from '../../src/mcp.mjs';

await peer.call('subscribe', { name: `Lifecycle ${process.env.RE_DESKTOP_PROBE_MODE}`, workspace: process.cwd() });
await writeFile(process.env.RE_DESKTOP_PROBE_FILE, JSON.stringify({ pid: process.pid, parent: process.ppid, thread: process.env.CODEX_THREAD_ID ?? null }), { mode: 0o600 });
