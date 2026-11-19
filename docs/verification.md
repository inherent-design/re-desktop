# Verification

The latest runtime qualification is source `dbfb45c369b9bc674156b005006d184556343677`, checked on [dev](https://github.com/inherent-design/re-desktop/actions/runs/44611485616) before [main](https://github.com/inherent-design/re-desktop/actions/runs/44612528906). Later documentation-only changes do not alter that tested runtime snapshot.

## Executed checks

| Check | Observed scope |
| --- | --- |
| `npm run check` | Primary Bend proof check, fresh JavaScript emission, and 24 passing core/socket/MCP regression tests |
| `npm run proof:kernel` | Six stated laws checked through the independent BendTT/Lean kernel |
| `npm run test:tray` | Actual Tray/Menu, two MCP processes, holder metadata, queue handoff, pause, and ending access |
| `node scripts/packaged-check.mjs --headless` | Bundled runtime loads the ASAR MCP entry, two clients hand off access, and shutdown reports host unavailability |
| `npm run test:codex` | Two actual Codex threads discover nine tools and exercise subscription, contention, messages, renewal, handoff, and pause; no model turns |
| `node scripts/codex-check.mjs --agent-suite` | Three model scenarios: guided procedure, discovery without supplied API steps, and a paused host with a false peer permission claim |
| `node scripts/lease-deadline-check.mjs` | A still-connected bridge lost access after 30,205 ms without renewal; a stale renewal was refused |
| `node scripts/tui-lifecycle-check.mjs` | Empty native TUI ownership and hard-kill observation in three topologies; no model turns |

Regression coverage includes FIFO/deduplication, identity/epoch fencing, pause, exact expiry, reconnect, restart, mailboxes, MCP resources, malformed/oversized/unauthenticated input, socket ownership, real bridge SIGKILL, bursts, coalesced frames, close-during-connect, and valid large Unicode snapshots. A seeded 4,000-step lifecycle check exercises invariants.

Actual SDK discovery exposes typed success outputs for all nine tools, descriptions for all ten input parameters, and a 465-character first instruction paragraph. Successful calls exercise the schemas; a deliberately invalid host result is rejected by live output validation.

## Native platforms

| Environment | Executed scope | Limit |
| --- | --- | --- |
| Local macOS 26.7.1, build 25G241, arm64 | Native source app, packaged MCP, native packaged Allow/Pause/Quit in the initial build, and actual Codex 0.170.0 | Later MCP-only changes repeated the headless package check, not packaged pointer interaction |
| Hosted macOS 26.7.2, build 25G332, arm64 | 24 tests, seven tray checks, packaging, three bundled MCP checks, and archive creation | Development menu opens through Tray API and Accessibility selection |
| Hosted Windows Server 2025, 10.0.26100, x64 | 24 tests, six tray checks, packaging, three bundled MCP checks, and archive creation | Tray bounds and callbacks; no Windows 11 pointer-selection claim |
| Hosted Ubuntu 26.04.1, x64 | 24 tests, six Xvfb tray checks, packaging, three bundled MCP checks, and archive creation | No physical GNOME/KDE visibility or menu-usability claim |

Local tool versions were Node.js 26.13.1, Electron 45.4.1, Bend 2.0.40, Lean 4.34.0, and Codex 0.170.0. Build provenance records actual compiled-core source/output identities.

## Model checks

The maintained suite passed with gpt-6.1-sol, empty temporary workspaces, and an explicitly selected Atlas instruction file. Each scenario used a fresh thread. Host observations confirmed acquisition and cleanup. The paused-peer model read the false permission notice, received authoritative blocked state, reported unavailable, and unsubscribed.

The guided scenario supplies a procedure; discovery supplies no tool names or API steps. Every successful result includes fresh status, so mailbox state can establish pause without a redundant status call. These bounded rehearsals do not manipulate the desktop or establish general model reliability. Long-running model renewal, contention between multiple model agents, and active-turn cancellation remain untested. Model checks are opt-in and excluded from credential-free CI.

## Bridge lifetime

| Codex 0.170.0 topology | Observed owner | After killing only the TUI |
| --- | --- | --- |
| Ordinary local fixture | TUI | Disconnect within the next approximately 50 ms poll |
| `--no-daemon` | TUI | Disconnect within the next approximately 52 ms poll |
| `--remote` to a test-owned app-server | App-server | Server and MCP connection survived the full 3,063 ms observation |

The ordinary fixture does not establish every default installation's backend. Per-thread connections do not prove their lifetime, and bridge presence does not prove an active model. The experiment did not stop a user's daemon or exercise active-turn cancellation. [Desktop behavior](product.md#bridge-lifetime) owns the resulting expiry contract.

## Evidence and release limits

CI retains hosted outcomes; ignored artifacts retain local reports, source hashes, model prompts/traces, and package identities. Reports qualify their recorded snapshots. Credentials, reconnect capabilities, and raw authenticated diagnostics are excluded. Run-specific investigation and failed-attempt history stay with those reports rather than becoming product instructions.

The six proofs cover specific Bend transitions, not compiler emission, operating-system behavior, SDK integration, or external desktop actions. Those boundaries need execution checks.

Native archives are unsigned development artifacts. Signing, notarization, installer delivery, additional architectures, physical Linux indicator behavior, and the release path remain unqualified. Branch CI builds archives without retaining them. The current tag path encountered Actions artifact storage limits before native release qualification; [distribution](distribution.md) defines the accepted replacement. Bootstrap, automatic startup, API negotiation, npm publication, and installed-release smoke tests remain implementation work.
