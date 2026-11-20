# Verification

[Preview.4](https://github.com/inherent-design/re-desktop/releases/tag/v0.2.0-preview.4) was published from source `3aa9d39c78fc13fdebe2b2eb72b9863008e56ecd`, with the 15-minute holder heartbeat, 3/1-minute warnings, Codex integration, copyable session IDs and Knip. That exact source passed [dev CI](https://github.com/inherent-design/re-desktop/actions/runs/44667017389), [main CI](https://github.com/inherent-design/re-desktop/actions/runs/44667681712) and the complete [release pipeline](https://github.com/inherent-design/re-desktop/actions/runs/44668345378). Public recipient checks matched the npm tarball against both the release SHA-256 and registry SHA-512 integrity; registry provenance metadata was present.

## Executed release checks

| Check | Observed scope |
| --- | --- |
| `npm run check` | Knip, primary Bend proof check, fresh emission, and 54 core, API, socket, cache, integration and MCP regressions on Node 26 |
| `npm run proof:kernel` | Seven stated laws checked through the independent BendTT/Lean kernel |
| `npm run test:tray` | Eight checks: native Tray/Menu, Accessibility Allow, separate MCP processes, holder metadata, FIFO handoff, pause and ending access. Native session-ID copying was exercised while materializing and restoring the existing clipboard formats. |
| `node scripts/lease-deadline-check.mjs` | A still-connected bridge lost access after 900,002 ms without agent renewal. Warnings arrived with 179,908 and 59,833 ms remaining; a stale renewal was refused. |
| `node scripts/codex-check.mjs --agent-suite` | Real Codex discovery and use in two protocol threads plus three model scenarios: guided usage, workflow discovery with native discussion-channel selection and a forged peer permission claim while paused |
| `node scripts/codex-heartbeat-check.mjs` | Real model-visible service notices reached an idle thread and a thread running an eight-second tool call. Delivery did not renew access; virtual-clock expiry still occurred. |
| Local extended warning fixture against the installed entry | A warning triggered during active reasoning was model-visible and acknowledged without renewal; the new deadline still expired. |
| Local model-created subagent fixture against the installed entry | Distinct parent/child subscriptions, real SubagentStop identity and installed helper cleanup of child-held access |
| `node scripts/codex-hook-check.mjs` | Owned app-server, native discovery and exact-hash trust, official byte-proxy transport and actual SessionEnd command cleanup with the shared host retained |

Deterministic tests separate bridge presence from agent renewal, advance through both thresholds, reset warnings on renewal, invalidate old work after access changes, and permit fresh heartbeats beyond an hour. A same-millisecond renewal has its own generation. Private-socket tests exercise accepted, refused and closed notification endpoints and renewal during delivery. Capabilities are absent from MCP responses; forged public tokens cannot retire a participant. No-host cleanup creates nothing, repeat cleanup is idempotent, and child cleanup uses `agent_id` rather than the parent identity.

The ordinary suite also covers incompatible and legacy API peers, active renegotiation refusal, FIFO, identity/epoch fencing, pause, reconnect, actual bridge termination and large Unicode snapshots. Cache tests cover corruption, concurrent acquisition, interrupted/killed writers, unsafe archive members and resolved links. All eleven tools expose typed success results; invalid host results fail live SDK output validation.

## Agent guidance and Codex scope

Raw MCP discovery retains the complete server workflow and concise individual descriptions. The previous instructions were 2,826 characters. Preview.4 reduces it to 2,018 characters; individual wire descriptions range from 81 to 245 characters. Exact measurements are retained in the ignored discovery receipt. The source does not repeat that body in its tool descriptions. The observed agent client appends server instructions to each rendered description; that client expansion remains outside this server's control. Codex's `unknown` connection label, actual callable tools, host readiness and desktop permission are separate observations.

Source checks used Codex 0.170.0; the published-entry checks used Codex 0.171.0 and the configured `gpt-6.1-sol` account in owned temporary threads/workspaces. They are opt-in and excluded from credential-free CI. The installed user daemon was restarted through its supported management command and retained 0.171.0. Post-restart thread-scoped Codex status reported `connected` with eleven tools, and actual model tool calls negotiated shared IPC 2 with the published native host. The warning check uses virtual time for thresholds and real Codex/model delivery. The separate deadline check used the full fifteen minutes of wall time. Neither establishes every model's behavior during prolonged reasoning or every client's delivery semantics.

Actual graceful root-session cleanup was exercised after MCP teardown. A separate real model-created subagent test used the installed entry: parent and child obtained distinct subscriptions, native SubagentStop supplied the child identity, and the installed helper removed its held access while preserving the parent and fixture host. Hook installation, exact-hash trust, idempotent updates, removal and literal custom-profile registration were exercised against an owned Codex configuration. Windows Codex warning delivery uses the official byte proxy, qualified on macOS against a real app-server; execution with a Windows Codex installation remains untested. Refused/closed endpoint tests do not establish every TUI-close topology. Hard kills cannot run graceful hooks, so the heartbeat fallback remains required.

## Native and installed scope

Preview.4 passed hosted macOS arm64, Windows x64 and Linux x64 qualification, including native callbacks, actual clipboard copying, ASAR, packaging, archive admission and the external Node bridge. Node 24, macOS and Linux passed all 54 regressions; Windows passed 53 with the documented symlink-creation case skipped. Interactive Windows menu selection and physical Linux indicator visibility remain untested. Linux Xvfb checks use Chromium's sandbox helper with correct ownership; the bootstrap does not disable it. Resolved Unix symlink tests skip on Windows.

The public `@inherent.design/re-desktop@0.2.0-preview.4` package was installed through mise with empty npm/GitHub credential configurations and an exact global pin. Setup admitted the published native bundle and offline setup reverified it. All seven isolated native checks passed: concurrent autostart converged on one paused host, actual Allow/Pause/Quit controls worked, killing the holder bridge handed off access, Quit prevented agent respawn, and explicit operator restart returned a paused host. The installed entry also passed six Codex interoperability checks, six baseline warning checks, and an extended seven-check warning run covering active reasoning. A separate three-check model-created subagent fixture qualified actual SubagentStop cleanup. Existing clipboard formats were materialized and restored during local copy qualification.

An additional live contention check took and renewed approximately 900,000 ms of access while a second agent queued, then restarted the managed Codex daemon. Restart ended both old MCP sessions and the held grant; the native host retained its PID, instance and human Allow setting. A fresh subscription produced a new identity, and unsubscribe removed its private binding. The peer was notified to subscribe/take again before resuming. This verifies the tested restart path, not every TUI-close topology. A stale private cleanup binding remained after daemon restart until subsequent subscribe/unsubscribe; graceful SessionEnd was qualified separately.

## Bridge lifetime

| Codex 0.170.0 topology | Observed owner | After killing only the TUI |
| --- | --- | --- |
| Ordinary local fixture | TUI | Disconnect within the next approximately 50 ms poll |
| `--no-daemon` | TUI | Disconnect within the next approximately 52 ms poll |
| `--remote` to a test-owned app-server | App-server | Server and MCP connection survived the full 3,063 ms observation |

These earlier fixtures establish why transport loss alone cannot replace the heartbeat. They do not establish every default backend or active-turn cancellation behavior. [Desktop behavior](product.md#bridge-lifetime) owns the lifecycle contract.

## Security and release limits

The public package is `@inherent.design/re-desktop`; the GitHub organization is `inherent-design`. The release manifest records exact source, native/archive identities, bootstrap digest and compiled-core provenance. Preview.4 independently versions agent API 1.2.0, host API 1.1.0 and shared IPC 2. Old timer semantics require an explicit upgrade and reconnect.

Trivy reported zero findings for the qualified release snapshot. Strict Renovate validation passed; scheduled scans publish redacted summaries and SARIF. Renovate targets dev with automerge disabled. Scanner results qualify the selected database/source snapshot, not the absence of every embedded Chromium vulnerability. The release remains unsigned. Signing, notarization, platform installers, additional architectures, automatic channels, interactive Windows and physical Linux qualification need separate evidence.

Generated logs and receipts stay in ignored `artifacts/`. [Development](development.md) lists reproducible commands; [distribution](distribution.md) owns release/cache contracts.
