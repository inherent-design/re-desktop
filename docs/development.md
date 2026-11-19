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

The build writes SHA-256 provenance for the Bend source and emitted module. `npm run check:build` refuses stale or altered output. Windows consumes the checked build artifact produced by macOS/Linux; it does not use another implementation. The compiler installer currently supports macOS/Linux on arm64 and x64. On Windows, obtain `build/` from the matching CI run or build it on another supported host at the same source revision.

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
| `npm run check` | Bend primary proof check, fresh emission, core invariants, real sockets and actual SDK stdio clients |
| `npm run proof:kernel` | Six stated laws checked through the separate BendTT kernel |
| `npm run test:tray` | Actual Electron Tray/Menu, two independent MCP processes, holder metadata, queue and human controls |
| `npm run test:codex` | Installed Codex app-server, two ephemeral native threads and actual MCP tool calls; no model turns |
| `node scripts/codex-check.mjs --agent-turn` | Opt-in real model turn using the configured Codex account/model; actual host operations verify the workflow |
| `node scripts/tui-lifecycle-check.mjs` | Actual empty TUI process ownership and kill behavior, including a separate server |
| `npm run package` | Native package with checked emitted Bend core and production SDK dependencies |
| `node scripts/archive.mjs` | Native archive and SHA-256 file in `dist/` |

The TUI probe uses a test-only wrapper around the actual MCP peer, not a model or substitute transport. It needs Python 3 and a POSIX PTY. A new untrusted project stops at Codex's native folder-trust prompt; after reviewing the owned checkout, the explicit `--trust-owned-project` option may accept that exact prompt. That saves a local Codex trust decision. It never submits a model prompt or restarts the user's existing daemon. Its remote case creates and stops its own app-server. An empty native test session may be retained by Codex according to Codex's own history behavior.

The macOS native UI probe compiles `scripts/macos-menu.swift` and uses Accessibility to locate only the explicit test app's status item/menu bounds. It opens the status item with native input, presses the owned native menu item through Accessibility and verifies the resulting host state. It restores the pointer if it is still at the test's last location. When Accessibility is unavailable, the report distinguishes invoking actual Electron menu callbacks from native input coverage. Linux indicator visibility depends on the desktop; GNOME commonly requires AppIndicator support. Xvfb construction is not a real desktop-visibility check.

Generated verification captures belong in ignored `artifacts/`. Maintained scope and limitations belong in [verification](verification.md). Personal execution checkpoints remain in Moment, outside the repository.

## Distribution

Electron Packager creates a native package for the current host in `dist/`. The emitted core, application source and production MCP dependencies live in its `app.asar`. Electron's bundled Node mode can run the packaged MCP entry without an additional Node installation. The repository's source-mode MCP entry uses the development Node executable.

The GitHub workflow compiles/proves Bend on Linux, validates the matching artifact on macOS/Windows/Linux, runs protocol and native smoke checks, and packages each native target. A deliberately pushed `v*` tag creates a draft release after the matrix passes. No workflow has been executed remotely merely by adding this file. The source repository's origin must exist and be accessible before pushing. Signing, notarization and polished installers are later release gates.
