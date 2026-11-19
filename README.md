# re:desktop

A desktop availability indicator for people and cooperating agents, with a native tray/menu bar app and an MCP server. Bend implements access scheduling, lease expiry, and human pause.

The menu shows the current holder, subscribed sessions, workspaces, and a numbered waiting queue. Green means available, solid red means paused by you, and a red ring with a white center means an agent has access. Coordination is voluntary; people retain ordinary desktop control.

The project is experimental. Native previews are unsigned. See [verification](docs/verification.md) for executed checks and platform limits.

## Install a published preview

Requires Node 24 or newer. Qualified targets are macOS arm64, Windows x64, and Linux x64.

```sh
npm install --global @inherent-design/re-desktop@preview
re-desktop setup
```

Setup verifies the exact selected native release and prints MCP configuration with absolute paths. Configure your agent client with that entry. First subscription can start the visible shared tray, initially paused. Choose **Allow agent access** from its menu before desktop work. **Pause agent access** ends held access and prevents new grants. **Quit re:desktop** prevents automatic respawn; open the native app or run `re-desktop start` to resume.

`re-desktop status` reports runtime policy and negotiated APIs. `re-desktop config` prints configuration without starting the tray. `setup --version <exact-version>` selects a release for new connections; `--offline` requires a prepared generation. Existing bridges and hosts stay on their current versions. The bootstrap retains prior verified generations; npm owns bootstrap updates.

Public releases download without credentials. Private previews require an already authenticated `gh` reader. macOS and Windows can require an explicit OS trust decision for unsigned software. Linux requires a desktop indicator and working Chromium sandbox support; the bootstrap never disables sandboxing or requests elevation. [Distribution](docs/distribution.md) describes storage, compatibility, and trust.

## Source build

On macOS or Linux with Node.js 26 and npm:

```sh
npm ci
npm run setup:bend
npm run check
npm start
```

Keep the app running before using its MCP tools. It starts paused; choose **Allow agent access** from the tray menu. **Pause agent access** ends current cooperative access and prevents further grants. Confirmed disconnection releases access immediately, with a 30-second lease covering a bridge that remains alive after its agent stops.

To build the native app:

```sh
npm run package
```

On macOS arm64, open `re-desktop.app` in `dist/builds/<version>/re-desktop-darwin-arm64`. Windows builds consume the matching emitted Bend module from macOS or Linux. Linux requires a supported desktop indicator and Chromium sandbox setup. [Development](docs/development.md) describes the toolchain and platform constraints.

## MCP configuration

Generate the exact TOML for this checkout:

```sh
node scripts/codex-config.mjs
```

Add the output to your Codex MCP configuration, then reload MCP servers or start a new session. The command prints configuration without editing account settings. For a native package, generate configuration using its bundled runtime:

```sh
node scripts/codex-config.mjs --packaged dist/builds/0.2.0-preview.2/re-desktop-darwin-arm64
```

An agent subscribes, takes access immediately before desktop work, proceeds when the non-null holder matches its identity, and releases when finished. It must explicitly renew before its 30-second lease expires. MCP discovery supplies the workflow, described parameters, and typed responses; [protocol](docs/protocol.md) owns the tool and response contracts. Source and standalone ASAR bridges require manual native startup. The installed npm entry manages startup under the saved owner policy.

## Documentation

- [Documentation index](docs/README.md)
- [Desktop behavior](docs/product.md)
- [MCP protocol](docs/protocol.md)
- [Development and Bend](docs/development.md)
- [Verification](docs/verification.md)
- [Distribution design](docs/distribution.md)

Bend implements the running coordinator in [core/access.bend](core/access.bend). [LAWS.bend](LAWS.bend) and [PROOF.bend](PROOF.bend) check six specific invariants. Host, transport, native UI, and compiler behavior require separate execution tests.

Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities through [SECURITY.md](SECURITY.md). The project is maintained at [inherent-design/re-desktop](https://github.com/inherent-design/re-desktop) and licensed under [MIT](LICENSE), with [third-party notices](THIRD_PARTY_NOTICES.md).
