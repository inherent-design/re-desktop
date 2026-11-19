# Verification and release status

Local qualification is on macOS **26.7.1**, build **25G241**, Apple arm64; not macOS 27.2.1. Tool versions observed: Node.js **26.13.1**, Electron **45.4.1**, Bend **2.0.40**, Lean **4.34.0** and Codex CLI **0.170.0**. The native app version is **0.1.0**.

## Executed checks

| Command | Observed scope |
| --- | --- |
| `npm run check` | Primary Bend proof check, fresh JavaScript emission and **23 passing** core/socket/MCP regression checks |
| `npm run proof:kernel` | `ALL PROOFS CHECK` for six laws through the separate BendTT kernel |
| `npm run test:tray` | Seven native development-app checks: real status item, menu state, holder ID/workspace, two MCP processes, queue handoff, pause and ending access |
| `node scripts/lease-deadline-check.mjs` | Real default 30-second expiry handed access over after **30,205 ms** while the former bridge remained connected; stale renewal rejected |
| `node scripts/codex-check.mjs --agent-turn` | Two ephemeral Codex threads discovered nine tools and exercised actual MCP calls; one model turn completed subscription, taking access, release and unsubscribe |
| `node scripts/tui-lifecycle-check.mjs` | Actual empty-TUI process ownership, hard kill and host observation in three topologies; no model turns |
| `npm run package` | Native macOS arm64 app with checked Bend output and production MCP dependencies |
| `node scripts/packaged-check.mjs --headless` | Packaged ASAR MCP entry ran with bundled Electron Node, two clients handed off access, shutdown reported unavailable |
| `node scripts/packaged-check.mjs` | Six checks on the actual packaged app, including native Allow/Pause and clean native Quit while both MCP clients stayed connected |

The regression suite covers emitted Bend ABI representations, FIFO/deduplication, nonwaiting access, human pause, identity/epoch fencing, explicit renewal, exact deadline behavior, reconnect without restoring old access, session expiry, host restart, peer messages and acknowledgment, MCP resources/notifications, offline discovery, invalid arguments, malformed/oversized/unauthenticated frames, private Unix modes, live-socket/path collision refusal, actual bridge SIGKILL, concurrent message bursts, multiple frames per data event, close-during-connect and large valid Unicode subscriber/queue snapshots. A seeded 4,000-step lifecycle test checks coordination invariants rather than duplicating the implementation.

The input-frame and close-during-connect regressions failed before their corrections, then passed. A legal large snapshot also reproduced the original 1 MiB reply-limit failure; the bridge now allows a bounded 4 MiB reply to fit the declared session/path/mailbox limits. The coalesced-frame test deliberately supplies a legal multi-frame data event to the actual host parser because kernel read boundaries vary by platform; separate tests exercise actual sockets and burst traffic.

The opt-in model run observed the configured model **gpt-6.1-sol**. Its actual host operation log confirmed that taking access made the caller the holder, followed by release and unsubscribe. An earlier model probe did not satisfy the expected release trace and did not retain enough diagnostics to establish why. The instrumented repeat passed. That is evidence of one successful natural workflow, not a guarantee that a model always follows instructions. Two model probe turns were started during this investigation; no inference cost or token total was measured.

Native menu automation initially encountered startup/layout timing and ineffective coordinate selection. The development probe opens the context menu through Electron's native Tray API, uses Accessibility to press its owned native menu item, and verifies the resulting service state. The local packaged check also opens the status item with pointer input. A successful action return alone is not accepted as evidence. The packaged check additionally confirmed that quitting with connected clients produced no destroyed-tray exception. A cropped capture of the owned tray bounds was visually inspected; no full desktop capture is retained.

## Hosted qualification

Both the [qualified `dev` run](https://github.com/mannie-exe/re-desktop/actions/runs/44523086727) and the [automatic `main` run](https://github.com/mannie-exe/re-desktop/actions/runs/44524515149) passed at source commit `c7b85676677ea1a1560e5de6ba4407be8b37d6ac`. Main was fast-forwarded only after the candidate passed on `dev`. The final documentation-only commit does not change that tested source snapshot.

| Hosted runner observed | Executed scope |
| --- | --- |
| macOS **26.7.2**, build **25G332**, arm64 | 23 tests, seven native tray checks including Tray API opening plus Accessibility selection, native packaging, three bundled MCP checks and archive creation |
| Windows Server **2025**, **10.0.26100**, x64 | 23 tests, six native tray checks, native packaging, three bundled MCP checks and archive creation |
| Ubuntu **26.04.1**, x64 | 23 tests, six tray checks under Xvfb with the Chromium sandbox helper installed, native packaging, three bundled MCP checks and archive creation |

The preceding Linux Bend job independently checked all six laws through BendTT/Lean, emitted JavaScript and passed the 23 tests. It transferred the small compressed module and provenance through job outputs; every desktop runner verified the source and output hashes before testing. The matrix uses Node.js 26 and the pinned dependencies. It needs no Codex credentials and does not run a model.

The Windows tray check verifies actual tray bounds and menu callbacks; it does not automate pointer selection or establish Windows 11 coverage. The Linux check constructs a tray and exercises the menu callbacks under Xvfb; it does not establish a visible GNOME/KDE indicator or keyboard/menu usability. The packaged CI checks run the actual ASAR MCP entry with Electron's bundled Node, use two clients and verify shutdown through a headless host. Native packaged GUI interaction was additionally checked locally on macOS, as recorded above.

The [first main run](https://github.com/mannie-exe/re-desktop/actions/runs/44520552970) passed the Bend checks but hit GitHub's artifact storage quota during core upload. The job-output handoff removes that dependency for ordinary branch CI. A [subsequent `dev` run](https://github.com/mannie-exe/re-desktop/actions/runs/44521696234) exposed Linux sandbox helper ownership and macOS pointer-opening problems; the qualified commit installs the helper as root with mode 4755 and opens the development test menu through the Tray API. Sandboxing remains enabled. No unrelated artifacts were deleted and no billing settings were changed.

## What the lifetime experiment establishes

| Codex 0.170.0 invocation | Observed bridge owner | After killing only the TUI |
| --- | --- | --- |
| Ordinary local invocation in this fixture | TUI process | Disconnect observed within the next approximately 50 ms poll |
| `--no-daemon` | TUI process | Disconnect observed within the next approximately 52 ms poll |
| `--remote` to a separate owned app-server | App-server process | Server and connection remained alive for the full **3,063 ms** observation |

The ordinary invocation in this fixture selected a TUI-owned bridge. It does not prove that every default installation or configuration does so. Per-thread MCP connections were independently observed, but that does not establish their lifetime. The separate server was test-owned; the user's running daemon was never stopped. The new owned checkout's Codex folder-trust prompt was accepted during TUI setup. Empty native test sessions may be retained according to Codex's own history behavior.

Actual active-turn cancellation, a hung host, Windows process teardown and every other MCP client were not exercised. The product therefore uses confirmed disconnect as a fast release path and explicit lease expiry as the fallback for a bridge that remains connected. A bridge's automatic presence heartbeat is not evidence of an active model.

## Evidence identity

The checked Bend source is `core/access.bend`, SHA-256 `e78e24cde593563b4a424b1efab78455772d421c26098d9d5d5349adc74e0349`. The laws are SHA-256 `8c038cd6d76a4cd3230b6e8fd62c44fade52a263f1752f7991c91e638170e4c3`; their proof is SHA-256 `058da7edc8058e0a210e340fb9aa24dc37e8cd4be865e648b625690d600b5f72`. The build records source/output digests in `build/provenance.json`.

Local generated reports live in ignored `artifacts/`: `tray-acceptance.json`, `lease-deadline.json`, `codex-acceptance.json`, `tui-lifecycle.json`, `packaged-acceptance.json` and the final source/check manifest. Reconnect capabilities, runtime bearer credentials and raw authenticated diagnostics are excluded. These files qualify specific runs, not all future source revisions. The local manifest predates the CI helper changes; those changes did not alter the 16 production runtime files checked against the packaged ASAR. The subsequent hosted results and repeated package-byte comparison are recorded in `hosted-qualification.json`.

## Remaining release gates

Ordinary branch CI builds and verifies native archives without retaining them. Release-tag uploads and draft-release creation were not exercised; the last upload attempt encountered the account's artifact storage quota. Available storage must be confirmed before using that release path. Desktop-specific Linux indicator visibility, Windows 11 interaction, Windows arm64 and additional macOS architectures remain unverified. A Linux tar installation also needs the sandbox helper ownership and mode described in [development](development.md).

Native archives are unsigned development artifacts. Developer ID signing, macOS notarization, Windows signing/installers and public release testing remain polishing work. The private repository [mannie-exe/re-desktop](https://github.com/mannie-exe/re-desktop) was created and `main` pushed with the owner's authorization. The configured origin remains exactly `gh.mannie-exe:mannie-exe/re-desktop.git`. No public release was performed. Substantial rework must be qualified on `dev` before returning to `main`. Documentation-only changes do not automatically rebuild the native matrix; manual dispatch remains available.
