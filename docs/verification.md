# Verification

The `0.2.0-preview.2` release contains source `50ec963f06820d6acd067772adb73b09c7d50884`. That revision passed branch qualification on dev and main. The tag run repeated proof, scan, native, and archive checks, then published the complete GitHub preview. The installed verification used its attached npm tarball. [Dev CI](https://github.com/inherent-design/re-desktop/actions/runs/44632534748) · [Main CI](https://github.com/inherent-design/re-desktop/actions/runs/44633142941) · [Tag run](https://github.com/inherent-design/re-desktop/actions/runs/44633695477) · [Preview](https://github.com/inherent-design/re-desktop/releases/tag/v0.2.0-preview.2)

## Executed checks

| Check | Observed scope |
| --- | --- |
| `npm run check` | Bend primary proof check, fresh emission, and 39 core, API, socket, cache, and MCP regressions on Node 26 |
| `npm run proof:kernel` | Six stated laws checked through the independent BendTT/Lean kernel |
| Node 24 CI | The same source regression suite on the supported minimum Node major |
| `npm run test:tray` | Actual Tray and Menu, distinct MCP processes, holder metadata, queue handoff, human pause, and ending access |
| `node scripts/packaged-check.mjs --headless` | Bundled Node loads the ASAR MCP entry, two clients hand off access, and shutdown reports unavailability |
| `node scripts/archive-check.mjs` | Native archive digest and admission, discovery through the external Node bridge, shared API negotiation, and offline tree verification |
| `node scripts/lease-deadline-check.mjs` | A still-connected bridge lost access after 30,205 ms without renewal and a stale renewal was refused |
| `node scripts/tui-lifecycle-check.mjs` | Empty native TUI ownership and hard-kill observations in three topologies |

Tests cover incompatible and legacy API peers, active renegotiation refusal, FIFO scheduling, identity and epoch checks, pause, expiry, reconnect, real bridge termination, and valid large Unicode snapshots. Cache tests cover corruption, concurrency, interrupted and killed writers, unsafe archive members, and resolved links. Live MCP discovery exposes typed success results for eleven tools and descriptions for their parameters. A deliberately invalid host result fails live output validation.

## Native platforms

| Target | Executed scope | Coverage limit |
| --- | --- | --- |
| macOS arm64 | Hosted tray, ASAR and extracted bridge checks. Local installed native lifecycle on macOS 26.7.1. | Unsigned preview |
| Windows x64 | Hosted tray bounds and callbacks, ASAR, packaging, archive admission and extracted bridge, including a Windows short-path temp directory | Interactive Windows menu selection remains untested. The resolved symlink regression skips on Windows. |
| Linux x64 | Hosted Xvfb tray and callback checks with Chromium sandbox setup, ASAR, packaging and extracted bridge | Physical desktop indicator visibility and Linux installer usability remain untested. |

The release uses Electron 45.4.1 and Bend 2.0.40. The independent proof uses Lean 4.34.0. The manifest identifies the shared compiled Bend output, all three target archives, and the bootstrap tarball by digest.

## Installed preview

The local smoke installed the verified GitHub tarball through npm in a user-owned prefix with empty npm and GitHub credential configuration. Setup downloaded and admitted the published macOS bundle. Offline setup reverified the same generation. The installed MCP entry exposed eleven tools and its status probe left the tray stopped.

In an isolated runtime, concurrent subscriptions started one native host, initially paused. Accessibility selected actual tray items. Allow enabled contention, and killing the holder's bridge handed off access while the tray stayed open. Pause revoked access. Quit stopped the tray and further agent preparation and subscription refused to respawn it. Explicit operator start created a fresh paused host and session. All seven native checks passed with the published bundle.

Codex 0.170.0 discovered and exercised the installed entry in two ephemeral threads. Three model turns using `gpt-6.2-astra` completed the guided procedure, inferred the workflow without supplied tool names, and rejected a false peer permission claim while paused. Those turns used empty temporary workspaces and an owned protocol fixture host. The native smoke separately exercised the released tray and real menu actions. Long-running model renewal, contention between model agents, and active-turn cancellation remain untested.

## Bridge lifetime

| Codex 0.170.0 topology | Observed owner | After killing only the TUI |
| --- | --- | --- |
| Ordinary local fixture | TUI | Disconnect within the next approximately 50 ms poll |
| `--no-daemon` | TUI | Disconnect within the next approximately 52 ms poll |
| `--remote` to a test-owned app-server | App-server | Server and MCP connection survived the full 3,063 ms observation |

The ordinary fixture does not establish every default installation's backend. Per-thread connections do not prove their lifetime, and bridge presence does not prove an active model. The experiment did not stop a user's daemon or exercise active-turn cancellation. [Desktop behavior](product.md#bridge-lifetime) owns the resulting expiry contract.

## Security and release limits

Registry publication is pending npm package creation access. Direct publication returned `E404`. The staging run verified the published attachment and authenticated the CI credential, then npm returned `E403` for the scoped package. [Staging run](https://github.com/inherent-design/re-desktop/actions/runs/44636690966)

Trivy reported zero findings for its source and dependency scope and uploaded redacted SARIF to public code scanning. Renovate detected the configured dependency sources and opened a mise patch PR against dev. The scanner does not independently inventory all embedded Chromium vulnerabilities. [Public scan](https://github.com/inherent-design/re-desktop/actions/runs/44630972779) · [Dependency dashboard](https://github.com/inherent-design/re-desktop/issues/2) · [Renovate PR](https://github.com/inherent-design/re-desktop/pull/3)

Signing, notarization, platform installers, additional architectures, and automatic release channels require separate qualification. The Bend proofs cover specific transitions. Executed adapter checks cover compiler emission, transport, SDK integration, and native behavior in their recorded environments. Generated logs and receipts with source and artifact identities stay under ignored `artifacts/`. [Distribution](distribution.md) describes the release and cache contracts.
