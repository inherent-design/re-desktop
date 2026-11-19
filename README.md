# re:desktop

A shared desktop availability light for people and cooperating agents, built with Bend. A native tray/menu bar app shows who has access; independent MCP sessions share a queue and can talk about yielding.

Green means available. Solid red means paused by you. A red ring with a white center means a session has access. The menu shows session names, IDs, workspaces and the numbered waiting queue. Access is voluntary; people retain ordinary desktop control.

## Run locally

On macOS or Linux with Node.js 26 and npm:

```sh
npm ci
npm run setup:bend
npm run check
npm start
```

The app starts paused. Choose **Allow agent access** from its tray menu. **Pause agent access** revokes current cooperative access. Confirmed disconnection releases access immediately; a 30-second lease also handles a bridge that remains alive after its agent stops. Reconnection never silently restores old access.

To build the native app:

```sh
npm run package
```

On macOS, open `dist/re-desktop-darwin-arm64/re-desktop.app` (or the x64 package). Windows uses the same emitted Bend module from a matching macOS/Linux build; see [development](docs/development.md). Linux needs a desktop with tray support.

## Connect Codex

Generate the exact TOML for this checkout:

```sh
node scripts/codex-config.mjs
```

Add that output to your Codex MCP configuration, then reload MCP servers or start a new session. This prints configuration; it does not edit your account settings. For a standalone native package, generate its bundled-runtime configuration instead:

```sh
node scripts/codex-config.mjs --packaged dist/re-desktop-darwin-arm64
```

An agent subscribes with `desktop_subscribe`, checks `desktop_status`, then calls `desktop_take` just before desktop work. It proceeds when `holder.session_id` matches `you.session_id`, renews using `desktop_heartbeat` before 30 seconds, and releases with `desktop_release`. Every grant provides its own `lease.token`. Waiting agents get a one-based queue position. Peer messages can ask a holder to yield but never preempt it. [Protocol](docs/protocol.md) describes the nine tools and reconnect behavior.

## Explore

- [Product and UX contract](docs/product.md), including the measured TUI/server lifetime distinction.
- [Related products and architecture investigation](docs/research.md).
- [Bend tutorial, proof boundaries and development commands](docs/development.md).
- [Executed checks and remaining platform/release gates](docs/verification.md).

Bend implements the running coordinator in [core/access.bend](core/access.bend). [LAWS.bend](LAWS.bend) and [PROOF.bend](PROOF.bend) state and check six specific invariants. The native host and MCP adapters have separate runtime checks; the proof does not cover the whole operating system or other desktop tools.

Project origin: `gh.mannie-exe:mannie-exe/re-desktop.git`. Personal investigation/implementation intent lives in Moment at `~/.moment/intents/re-desktop.md`; the repository owns the product specifications above.
