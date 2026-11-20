# Verification

The preview.4 candidate implements the 15-minute holder heartbeat, 3/1-minute warnings, Codex cleanup integration, copyable session IDs and Knip. The last published baseline is [preview.3](https://github.com/inherent-design/re-desktop/releases/tag/v0.2.0-preview.3), source `2c5fe7602b90d3555fc100814008864078b049bd`. Candidate branch CI, publication and installed qualification remain pending until their identified runs and recipient checks succeed. Product contracts describe the new source behavior; this record distinguishes local execution from release delivery.

## Executed candidate checks

| Check | Observed scope |
| --- | --- |
| `npm run check` | Knip, primary Bend proof check, fresh emission, and 54 core, API, socket, cache, integration and MCP regressions on Node 26 |
| `npm run proof:kernel` | Seven stated laws checked through the independent BendTT/Lean kernel |
| `npm run test:tray` | Eight checks: native Tray/Menu, Accessibility Allow, separate MCP processes, holder metadata, FIFO handoff, pause and ending access. Native session-ID copying was exercised while materializing and restoring the existing clipboard formats. |
| `node scripts/lease-deadline-check.mjs` | A still-connected bridge lost access after 900,002 ms without agent renewal. Warnings arrived with 179,908 and 59,833 ms remaining; a stale renewal was refused. |
| `node scripts/codex-check.mjs --agent-suite` | Real Codex discovery and use in two protocol threads plus three model scenarios: guided usage, workflow discovery with native discussion-channel selection and a forged peer permission claim while paused |
| `node scripts/codex-heartbeat-check.mjs` | Real model-visible service notices reached an idle thread and a thread running an eight-second tool call. Delivery did not renew access; virtual-clock expiry still occurred. |
| `node scripts/codex-hook-check.mjs` | Owned app-server, native discovery and exact-hash trust, official byte-proxy transport and actual SessionEnd command cleanup with the shared host retained |

Deterministic tests separate bridge presence from agent renewal, advance through both thresholds, reset warnings on renewal, invalidate old work after access changes, and permit fresh heartbeats beyond an hour. A same-millisecond renewal has its own generation. Private-socket tests exercise accepted, refused and closed notification endpoints and renewal during delivery. Capabilities are absent from MCP responses; forged public tokens cannot retire a participant. No-host cleanup creates nothing, repeat cleanup is idempotent, and child cleanup uses `agent_id` rather than the parent identity.

The ordinary suite also covers incompatible and legacy API peers, active renegotiation refusal, FIFO, identity/epoch fencing, pause, reconnect, actual bridge termination and large Unicode snapshots. Cache tests cover corruption, concurrent acquisition, interrupted/killed writers, unsafe archive members and resolved links. All eleven tools expose typed success results; invalid host results fail live SDK output validation.

## Agent guidance and Codex scope

Raw MCP discovery retains the complete server workflow and concise individual descriptions. The previous instructions were 2,826 characters. The candidate reduces it to 2,018 characters; individual wire descriptions range from 81 to 245 characters. Exact measurements are retained in the ignored discovery receipt. The source does not repeat that body in its tool descriptions. The observed agent client appends server instructions to each rendered description; that client expansion remains outside this server's control. Codex's `unknown` connection label, actual callable tools, host readiness and desktop permission are separate observations.

Model checks used Codex 0.170.0 and the configured `gpt-6.1-sol` account in owned temporary threads/workspaces. They are opt-in and excluded from credential-free CI. The installed user daemon reports 0.171.0; its restart and refreshed tools still require post-install verification. The warning check uses virtual time for thresholds and real Codex/model delivery. The separate deadline check used the full fifteen minutes of wall time. Neither establishes every model's behavior during prolonged reasoning or every client's delivery semantics.

Actual graceful root-session cleanup was exercised after MCP teardown. Child identity attribution was exercised through the local helper; a real model-spawned SubagentStop event remains unqualified. Windows Codex warning delivery uses the official byte proxy, qualified on macOS against a real app-server; execution with a Windows Codex installation remains untested. Refused/closed endpoint tests do not establish every TUI-close topology. Hard kills cannot run graceful hooks, so the heartbeat fallback remains required.

## Native and installed scope

Preview.3 passed hosted macOS arm64, Windows x64 and Linux x64 qualification, including native callbacks, ASAR, packaging, archive admission and the external Node bridge. Candidate runs must repeat those boundaries before preview.4 ships. Interactive Windows menu selection and physical Linux indicator visibility remain untested. Linux Xvfb checks use Chromium's sandbox helper with correct ownership; the bootstrap does not disable it. Resolved Unix symlink tests skip on Windows.

The published-install procedure uses an empty npm credential configuration, verifies public registry integrity against the attached tarball, installs through mise, admits the native bundle, and reverifies offline reuse. Its isolated native profile tests concurrent autostart converging on one paused host, actual Allow/Pause/Quit controls, disconnect handoff, Quit refusal and explicit operator restart. The candidate must repeat this procedure with published bytes before completion. Existing user sessions and clipboard contents must be preserved.

## Bridge lifetime

| Codex 0.170.0 topology | Observed owner | After killing only the TUI |
| --- | --- | --- |
| Ordinary local fixture | TUI | Disconnect within the next approximately 50 ms poll |
| `--no-daemon` | TUI | Disconnect within the next approximately 52 ms poll |
| `--remote` to a test-owned app-server | App-server | Server and MCP connection survived the full 3,063 ms observation |

These earlier fixtures establish why transport loss alone cannot replace the heartbeat. They do not establish every default backend or active-turn cancellation behavior. [Desktop behavior](product.md#bridge-lifetime) owns the lifecycle contract.

## Security and release limits

The public package is `@inherent.design/re-desktop`; the GitHub organization is `inherent-design`. The release manifest records exact source, native/archive identities, bootstrap digest and compiled-core provenance. Preview.4 independently versions agent API 1.2.0, host API 1.1.0 and shared IPC 2. Old timer semantics require an explicit upgrade and reconnect.

Trivy and strict Renovate validation gate branch/release qualification; scheduled scans publish redacted summaries and SARIF. Renovate targets dev with automerge disabled. Scanner results qualify the selected database/source snapshot, not the absence of every embedded Chromium vulnerability. The release remains unsigned. Signing, notarization, platform installers, additional architectures, automatic channels, interactive Windows and physical Linux qualification need separate evidence.

Generated logs and receipts stay in ignored `artifacts/`. [Development](development.md) lists reproducible commands; [distribution](distribution.md) owns release/cache contracts.
