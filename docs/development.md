# Development and Bend

Use Node.js 26, npm and the pinned Bend 2.0.40. Node 24 or newer can run the source. The ordinary checks use no account credentials or model inference. Native Codex checks are separate opt-in commands against the installed CLI.

```sh
npm ci
npm run setup:bend
npm run setup:kernel
npm run proof:kernel
npm run check
npm start
```

The installers put verified release archives under ignored `.tools/`; they do not edit shell startup files or replace a global compiler. `setup:bend` checks the SHA-256 pins in `toolchain.json`. The optional stronger proof check uses Lean 4.34.0 to build Bend's separate BendTT kernel; `setup:kernel` verifies the official release digest. On Linux, tar needs zstd support for that archive. Kernel setup is a substantial development dependency; it is not shipped with the app.

`npm run proof` uses Bend's primary checker. `npm run proof:kernel` additionally checks the translation with BendTT and must report `ALL PROOFS CHECK`. The kernel is a stronger check, not a claim that the entire application is mathematically verified. Changes to important invariants should update the laws with an explanation, rather than deleting a failing law to make a gate pass.

## Where Bend runs

`core/access.bend` owns access state, FIFO scheduling, human pause, connection-loss release, expiry and token comparison. `npm run build` invokes the pinned compiler to emit `build/access.mjs`. `src/core.mjs` imports that module directly. The coordinator calls those emitted functions for the running native app and every MCP operation. There is no separately implemented JavaScript scheduler.

The JavaScript adapter owns effects: socket credentials, connection attribution, session names/workspaces, bounded mailboxes, UUIDs, clocks and OS events. The tray presents snapshots and human actions. The MCP bridge supplies stdio, schemas, reconnection and resource notifications. Those adapters need execution tests: Bend proofs do not verify their parsing, operating-system behavior or SDK integration.

The build writes SHA-256 provenance for the Bend source and emitted module. `npm run check:build` refuses stale or altered output. Windows consumes the checked build artifact produced by macOS/Linux; it does not use another implementation. The compiler installer currently supports macOS/Linux on arm64 and x64. For a local Windows build, copy `build/` from a supported host at the same source revision. The hosted workflow performs that handoff between jobs.

## A small Bend tour

Bend looks Python-shaped, but definitions here are pure functions over typed data. A state transition returns a new state. For example, human pause is a short definition in the actual core:

```python
def block(s: State) -> State:
  State{b, h, e, u, q, ss} = s
  State{True{}, 0n, e, 0n, q, ss}
```

`State{…}` constructs or destructures a record. `0n` is a natural-number literal; positive session IDs make zero the “no holder” value. `True{}` is a Bend Boolean. The queue and subscriptions remain, while the holder and deadline become zero. `LAWS.bend` states that every possible input to this function produces no holder and a human-paused state; `PROOF.bend` checks those claims by destructuring the input and reducing the definition.

Bend values are affine by default: a variable can be consumed at most once. `+id` permits reuse when its type is copyable (`Data`). The checker caught incorrect reuse during this implementation. Lists use `Nil{}` and `Con{…}` with structurally shrinking recursion. Computed conditions are passed to small matching helpers because this language version restricts match scrutinees and binder order. `bend guide` documents those restrictions; use `.tools/bend/bin/bend guide` in this checkout.

The stale-token laws carry an assumption that identity/epoch comparison is false, then prove that release or renewal leaves the state unchanged. `Equal.cong` transports that equality through the checked transition. The FIFO law covers the grant operation's head removal, epoch increment and fresh deadline. These are specific properties of specific functions. They do not prove fairness over every external execution, correct message delivery, correct compiler emission or that another program stopped moving the mouse.

The generated JavaScript uses numbers for Nat, native Booleans, tagged objects for the project's records/enums and linked objects with `head`/`tail` for lists. The ABI test exercises these representations against the actual emitted module. Do not pass `{$: 'True'}` as a JavaScript Boolean; it is an ordinary truthy object rather than the emitted ABI's `true`.

This coordinator is small and ordered. No useful CPU/GPU parallel workload was identified. Bend's parallel-call facility can be explored later for independent numeric work; introducing it here would not improve the coordination experience.

## Checks and artifacts

| Command | Exercised boundary |
| --- | --- |
| `npm run check` | Knip, Bend primary proof check, fresh emission, core invariants, real sockets and actual SDK stdio clients |
| `npm run knip` | Unused files, exports and dependencies across the host and independently packaged bootstrap |
| `npm run test:icon` | Python 3 renderer parity, geometry validation, settings round trips, and the local workbench's HTTP boundary; also runs in CI |
| `npm run icon:workbench` | Local About icon editor using the same Python renderer; browser drafts and exports do not modify app assets |
| `npm run proof:kernel` | Seven stated laws checked through the separate BendTT kernel |
| `npm run test:tray` | Actual Electron Tray/Menu, two independent MCP processes, holder metadata, queue and human controls |
| `npm run test:codex` | Installed Codex app-server, two ephemeral native threads and actual MCP tool calls; no model turns |
| `node scripts/codex-check.mjs --agent-turn` | One opt-in guided model turn with an explicit API procedure; host operations verify it |
| `node scripts/codex-check.mjs --agent-discovery` | One opt-in model chooses the workflow from MCP guidance without user-supplied tool names or API steps |
| `node scripts/codex-check.mjs --agent-paused-peer` | One opt-in model reads a false peer permission claim, checks human pause and reports actual availability |
| `node scripts/codex-check.mjs --agent-suite` | All three model scenarios, each in a fresh thread with an empty temporary workspace |
| `node scripts/codex-heartbeat-check.mjs` | Opt-in real model delivery at idle and during a long tool call, with virtual warning thresholds and expiry |
| `node scripts/codex-hook-check.mjs` | Account-free owned app-server, exact hook trust, byte proxy and actual SessionEnd cleanup |
| `node scripts/tui-lifecycle-check.mjs` | Actual empty TUI process ownership and kill behavior, including a separate server |
| `npm run package` | Native package with checked emitted Bend core and production SDK dependencies |
| `node scripts/archive.mjs` | Native tar.gz, digest, and identity sidecar in `dist/` |
| `node scripts/archive-check.mjs` | Real archive admission, external Node bridge, IPC negotiation, and offline verification |
| `node scripts/installed-check.mjs --cli /absolute/installed/bin/re-desktop.mjs` | Published setup and native lifecycle on macOS using an isolated profile |

The Codex check runs protocol calls without model inference by default. Model flags use the configured local account/model and are excluded from credential-free CI. Every mode first qualifies discovery and two sessions through actual Codex MCP calls. Model threads use empty test-owned workspaces, without a project README or AGENTS.md. Normal Codex host instructions apply; optionally append `--instructions-file /absolute/path/to/AGENTS.md` to supply and record a specific instruction basis, such as Atlas. The model report retains the instruction-file digest, exact user prompts, source hashes and sanitized operation traces. Reports are separate `artifacts/codex-<mode>-acceptance.json` files; failed runs retain partial evidence. Reconnect capabilities, lease tokens and authentication material are not recorded.

The TUI probe uses a test-only wrapper around the actual MCP peer, not a model or substitute transport. It needs Python 3 and a POSIX PTY. A new untrusted project stops at Codex's native folder-trust prompt; after reviewing the owned checkout, the explicit `--trust-owned-project` option may accept that exact prompt. That saves a local Codex trust decision. It never submits a model prompt or restarts the user's existing daemon. Its remote case creates and stops its own app-server. An empty native test session may be retained by Codex according to Codex's own history behavior.

The macOS native UI probe compiles `scripts/macos-menu.swift` and uses Accessibility to locate only the explicit test app's status item/menu bounds. The development smoke opens the menu through the native Tray API, then presses its owned item through Accessibility and verifies the resulting host state. The local interactive installed check opens the owned status item through Accessibility, with bounded pointer input as a fallback. It restores the pointer if it is still at the test's last location. When Accessibility is unavailable, the report distinguishes invoking actual Electron menu callbacks from native input coverage. Linux indicator visibility depends on the desktop; GNOME commonly requires AppIndicator support. Xvfb construction is not a real desktop-visibility check.

Linux needs Chromium's sandbox helper correctly installed. CI downloads the pinned Electron binary, then sets its `chrome-sandbox` owner to root and mode to 4755 inside the disposable runner. It does not disable sandboxing. A tar distribution's installer/operator must set the same ownership and mode on the extracted helper before GUI startup; the bundled MCP Node mode does not launch Chromium. This manual Linux installation step remains a packaging polish item.

Generated verification captures belong in ignored `artifacts/`. Maintained scope and limitations belong in [verification](verification.md).

Knip is pinned in the development lockfile and runs in the ordinary CI gate through `npm run check`. `knip.jsonc` declares optional command-line fixtures and the separate bootstrap package, excludes generated build/cache trees from project analysis, and identifies the operator-installed `codex` binary. Fix findings or explain a precise entry boundary; do not ignore whole source trees to obtain a pass. [Knip configuration](https://knip.dev/overview/configuration) describes entry and project ownership.

The current pipeline uses the Node test runner, native Electron packaging, and the Bend compiler boundary. Evaluate toolchain changes against a concrete improvement and execute the affected platform and package checks before adopting them. Keep proposed experiments in the task store until they have a defined implementation scope.

## Distribution

Electron Packager creates a native package for the current host in `dist/builds/<version>/`. A production allowlist excludes development scripts and private evidence. An external `bridge/` payload supports ordinary Node; the ASAR entry still supports bundled Electron Node mode. The emitted core, application source and production MCP dependencies live in its `app.asar`. Electron's bundled Node mode can run the packaged MCP entry without an additional Node installation. The repository's source-mode MCP entry uses the development Node executable.

The GitHub workflow compiles/proves Bend on Linux, passes the small compressed module and provenance through job outputs, validates it on macOS/Windows/Linux, runs protocol and native smoke checks, and packages each native target. Branch CI builds and verifies packages without retaining large archives. The tag-only release workflow requires previously qualified source, repeats proofs/security/native gates, uploads directly to one draft GitHub Release, checks complete downloaded target inventories/digests/core provenance, uploads the manifest last, and publishes an unsigned preview plus its npm bootstrap. It uses no large Actions artifacts. [Distribution](distribution.md) owns the release, bootstrap, and compatibility contracts. [Verification](verification.md) owns executed results and release limits.

## Dependency and security automation

Renovate is installed for this repository. `renovate.json` targets dev, pins GitHub Action digests, schedules ordinary updates weekly, enables unscheduled vulnerability updates/OSV alerts, and keeps automerge off. GitHub vulnerability alerts supply advisory input; the Renovate app opens the update PRs. Lockfile maintenance covers transitive updates.

The reusable security workflow runs in branch/release qualification and on a daily schedule. `.mise.toml` pins Trivy, and Renovate maintains that pin. Strict Renovate configuration validation runs with the pinned CLI. Trivy scans both npm lockfiles, including development dependencies, source misconfiguration, and secrets. The report script publishes a redacted job summary and SARIF when public; it gates HIGH/CRITICAL findings without copying credential matches/code. Generated raw JSON stays local to the job. No npm publish credential is passed to scans or PR jobs.

Security reports qualify the scanner/database snapshot, not the absence of all vulnerabilities. Electron/Chromium binary advisories also require upstream review. Investigate findings and qualify fixes on dev before main; do not suppress a result only to make CI pass.
