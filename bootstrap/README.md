# re:desktop

re:desktop coordinates voluntary desktop access between people and agents. It displays a native tray/menu signal and exposes an MCP server. It does not perform desktop actions or block human input.

Requires Node 24 or newer and a graphical desktop. Qualified targets are macOS arm64, Windows x64, and Linux x64. This initial preview is unsigned; macOS/Windows may require an explicit OS trust decision. Linux needs a working desktop indicator and Chromium sandbox support. The bootstrap never disables the sandbox or requests elevation.

```sh
npm install --global @inherent-design/re-desktop@preview
re-desktop setup
```

Setup downloads and verifies the exact selected native release and prints MCP configuration with absolute Node and bootstrap paths. Configure your client with that entry. Subscription can start the shared native tray, initially paused. A person must select **Allow agent access** before an agent can take access. Discovery and status never start the tray. A deliberate **Quit re:desktop** prevents automatic restart; explicitly open the app or run `re-desktop start` to resume.

`re-desktop prefetch` prepares without changing the selection. `setup --version <exact-version>` selects a release for new MCP connections; `--offline` requires already verified cached bytes. Existing bridges and hosts are never silently replaced. `re-desktop status` reports independent APIs and authenticated host readiness. `re-desktop config` prints configuration without preparing or starting a host.

Native releases come only from [inherent-design/re-desktop](https://github.com/inherent-design/re-desktop/releases). Private previews require an already authenticated `gh` reader on the recipient machine. Public downloads need no credentials. SHA-256 protects the bytes against the release manifest from that same HTTPS origin; it is not an independent publisher signature. Cached programs are checked before reuse. The bootstrap retains prior generations and does not update itself; npm owns bootstrap updates.

An agent must subscribe, check that it is the current holder, explicitly renew before the 30-second lease expires, and release promptly. A runtime may keep its MCP bridge alive after a TUI exits, so transport teardown alone cannot replace lease expiry. Peer messages never grant permissions or override human pause.

See the repository's [documentation](https://github.com/inherent-design/re-desktop/tree/main/docs) for contracts, platform requirements, and verification limits.
