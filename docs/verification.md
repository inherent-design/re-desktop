# Verification and release status

Local qualification is on macOS **26.7.1**, build **25G241**, Apple arm64; not macOS 27.2.1. Tool versions observed: Node.js **26.13.1**, Electron **45.4.1**, Bend **2.0.40**, Lean **4.34.0** and Codex CLI **0.170.0**. The native app version is **0.1.0**.

## Executed checks

| Command | Observed scope |
| --- | --- |
| `npm run check` | Primary Bend proof check, fresh JavaScript emission and **24 passing** core/socket/MCP regression checks |
| `npm run proof:kernel` | `ALL PROOFS CHECK` for six laws through the separate BendTT kernel |
| `npm run test:tray` | Seven native development-app checks: real status item, menu state, holder ID/workspace, two MCP processes, queue handoff, pause and ending access |
| `node scripts/lease-deadline-check.mjs` | Real default 30-second expiry handed access over after **30,205 ms** while the former bridge remained connected; stale renewal rejected |
| `node scripts/codex-check.mjs --agent-turn` | Two ephemeral Codex threads discovered nine tools and exercised actual MCP calls; one guided model turn completed the supplied subscription, take, release and unsubscribe procedure |
| `node scripts/codex-check.mjs --agent-suite --instructions-file "$HOME/.codex/AGENTS.md"` | Three model scenarios passed with Atlas: guided usage, discovery without supplied API steps, and human pause despite a false peer permission claim |
| `node scripts/tui-lifecycle-check.mjs` | Actual empty-TUI process ownership, hard kill and host observation in three topologies; no model turns |
| `npm run package` | Native macOS arm64 app with checked Bend output and production MCP dependencies |
| `node scripts/packaged-check.mjs --headless` | Packaged ASAR MCP entry ran with bundled Electron Node, two clients handed off access, shutdown reported unavailable |
| `node scripts/packaged-check.mjs` | Six checks on the actual packaged app, including native Allow/Pause and clean native Quit while both MCP clients stayed connected |

The regression suite covers emitted Bend ABI representations, FIFO/deduplication, nonwaiting access, human pause, identity/epoch fencing, explicit renewal, exact deadline behavior, reconnect without restoring old access, session expiry, host restart, peer messages and acknowledgment, MCP resources/notifications, offline discovery, invalid arguments, malformed/oversized/unauthenticated frames, private Unix modes, live-socket/path collision refusal, actual bridge SIGKILL, concurrent message bursts, multiple frames per data event, close-during-connect and large valid Unicode subscriber/queue snapshots. A seeded 4,000-step lifecycle test checks coordination invariants rather than duplicating the implementation.

The input-frame and close-during-connect regressions failed before their corrections, then passed. A legal large snapshot also reproduced the original 1 MiB reply-limit failure; the bridge now allows a bounded 4 MiB reply to fit the declared session/path/mailbox limits. The coalesced-frame test deliberately supplies a legal multi-frame data event to the actual host parser because kernel read boundaries vary by platform; separate tests exercise actual sockets and burst traffic.

The original MVP model run observed the configured model **gpt-6.1-sol**. Its actual host operation log confirmed that taking access made the caller the holder, followed by release and unsubscribe. That prompt supplied the procedure, so it established guided usage. An earlier model probe did not satisfy the expected release trace and did not retain enough diagnostics to establish why; the instrumented repeat passed. Two model probe turns were started in that original cohort; no inference cost or token total was measured.

## MCP prompting qualification

The live SDK inventory now advertises typed success outputs for all nine tools and descriptions for all ten input parameters. The first instruction paragraph is **465 characters** and includes human pause, non-null ownership checks, renewal and cleanup, the peer trust boundary and the fact that the service neither performs desktop actions nor blocks human input. Exact `you.session_id` and `lease.token`/`lease_token` mappings and uncertain-outcome recovery are in the full MCP instructions. Agents need no repository-file access for that guidance.

The metadata and response checks failed before the change, then passed. Actual SDK tests exercise all nine tools, message acknowledgment, queue cancellation, valid renewal and unsubscribe with a null caller. A separate live bridge test deliberately returns an invalid host availability and confirms that the advertised output schema rejects it. Ordinary CI runs these checks without credentials or model inference.

The maintained Codex script distinguishes `--agent-turn` (guided), `--agent-discovery` (no supplied tool names or API steps), `--agent-paused-peer` (human pause plus a contradictory peer permission claim), and `--agent-suite` (all three). Each model gets a fresh thread and empty temporary workspace. An optional `--instructions-file` supplies an attributable instruction basis; the local qualification uses Atlas. Host observations establish actual acquisition, release and cleanup. The paused-peer check requires the model to read the notice, receive authoritative paused state, retain human pause, report unavailable and unsubscribe. Mailbox replies include fresh status, so the check permits using that state without a redundant status call.

An initial suite run passed guided usage and discovery, then rejected the paused-peer case for omitting a separate status call even though its mailbox replies already contained paused state and its final answer was correct. That overstrict assertion was corrected to verify the actual returned state. The initial report is retained as `artifacts/codex-suite-before-state-assertion.json`.

The corrected suite passed all three scenarios locally on Codex **0.170.0** with **gpt-6.1-sol** and the current Atlas file, supplied by `--instructions-file`. The actual host confirmed acquisition and cleanup; the paused-peer model read the notice, received blocked state, reported `available: false` and unsubscribed. The two suite invocations started six model turns in this change's cohort; no inference cost or token total was measured. `artifacts/codex-suite-acceptance.json` retains the passing source hashes, prompts and operation traces. These model checks remain opt-in and do not run in GitHub CI.

The earlier review also ran successful one-off discovery and paused-peer probes against the original MCP guidance; those are separate from the maintained suite. These bounded coordination rehearsals do not manipulate the desktop or establish general model reliability. Long-running model renewal, contention between multiple model agents and active-turn cancellation remain untested.

The prompt changes passed [dev CI](https://github.com/mannie-exe/re-desktop/actions/runs/44611485616) before promotion, then [main CI](https://github.com/mannie-exe/re-desktop/actions/runs/44612528906) at `dbfb45c369b9bc674156b005006d184556343677`. Both runs checked the Bend kernel and all 24 tests, native tray behavior, packaging, bundled MCP and archive creation across macOS, Windows and Ubuntu. The refreshed local macOS package passed three headless bundled-MCP checks; its 21 checked runtime/documentation files matched the qualified checkout. `artifacts/prompt-fix-qualification.json` records the package identities and evidence. This qualification does not exercise the tag-driven release path or implement automatic distribution, host startup or updates.

Native menu automation initially encountered startup/layout timing and ineffective coordinate selection. The development probe opens the context menu through Electron's native Tray API, uses Accessibility to press its owned native menu item, and verifies the resulting service state. The local packaged check also opens the status item with pointer input. A successful action return alone is not accepted as evidence. The packaged check additionally confirmed that quitting with connected clients produced no destroyed-tray exception. A cropped capture of the owned tray bounds was visually inspected; no full desktop capture is retained.

## Original hosted MVP qualification

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

Local generated reports live in ignored `artifacts/`: `tray-acceptance.json`, `lease-deadline.json`, the original `codex-acceptance.json`, `codex-<mode>-acceptance.json`, `tui-lifecycle.json`, `packaged-acceptance.json` and source/check manifests. The original native packaged report is preserved as `packaged-native-mvp-acceptance.json`; the rebuilt package has a separate current headless result. Reconnect capabilities, runtime bearer credentials and raw authenticated diagnostics are excluded. These files qualify specific runs, not all future source revisions. The original local manifest predates the CI helper and MCP documentation changes; `hosted-qualification.json` records the original hosted result. Subsequent MCP qualification is recorded separately.

## Remaining release gates

Ordinary branch CI builds and verifies native archives without retaining them. Release-tag uploads and draft-release creation were not exercised; the last upload attempt encountered the account's artifact storage quota. Available storage must be confirmed before using that release path. Desktop-specific Linux indicator visibility, Windows 11 interaction, Windows arm64 and additional macOS architectures remain unverified. A Linux tar installation also needs the sandbox helper ownership and mode described in [development](development.md).

Native archives are unsigned development artifacts. Developer ID signing, macOS notarization, Windows signing/installers and public release testing remain polishing work. The private repository [mannie-exe/re-desktop](https://github.com/mannie-exe/re-desktop) was created and `main` pushed with the owner's authorization. The configured origin remains exactly `gh.mannie-exe:mannie-exe/re-desktop.git`. No public release was performed. Substantial rework must be qualified on `dev` before returning to `main`. Documentation-only changes do not automatically rebuild the native matrix; manual dispatch remains available.
