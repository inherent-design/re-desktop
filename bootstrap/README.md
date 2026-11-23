# re:desktop

re:desktop coordinates voluntary desktop access between people and agents. It displays a native tray/menu signal and exposes an MCP server. It does not perform desktop actions or block human input.

Requires Node 24 or newer and a graphical desktop. Qualified targets are macOS arm64, Windows x64, and Linux x64. This initial preview is unsigned; macOS/Windows may require an explicit OS trust decision. Linux needs a working desktop indicator and Chromium sandbox support. The bootstrap never disables the sandbox or requests elevation.

```sh
npm install --global @inherent.design/re-desktop@preview
re-desktop setup
```

Setup downloads and verifies the exact selected native release and prints MCP configuration with absolute Node and bootstrap paths. Configure your client with that entry. Subscription can start the shared native tray, initially paused. A person must select **Allow agent access** before an agent can take access. **Pause agent access** ends current access immediately; **Pause after current access** retains that grant and pauses before its next handoff. Only the current holder may continue or renew during a pending pause. This release requires shared IPC 3; an older active host must be upgraded at a safe boundary. Discovery and status never start the tray. A deliberate **Quit re:desktop** prevents automatic restart; explicitly open the app or run `re-desktop start` to resume.

To register with Codex, run `re-desktop codex-install --codex "$(command -v codex)"`. For a mise installation append `--mise "$(command -v mise)"`. This configures `re_desktop`, per-thread heartbeat notices, and bounded SessionEnd/SubagentStop cleanup hooks while preserving unrelated hooks. It trusts only the exact generated hooks through the local app-server's supported API. If `hook_trust` is `review-required`, review those hooks in Codex or rerun installation with the intended app-server running. Restart the daemon and use a fresh session. Other MCP clients can use the JSON from `re-desktop config`.

`re-desktop prefetch` prepares without changing the selection. `setup --version <exact-version>` selects a release for new MCP connections; `--offline` requires already verified cached bytes. Existing bridges and hosts are never silently replaced. `re-desktop status` reports independent APIs and authenticated host readiness. `re-desktop config` prints configuration without preparing or starting a host.

Native releases come only from [inherent-design/re-desktop](https://github.com/inherent-design/re-desktop/releases). Private previews require an already authenticated `gh` reader on the recipient machine. Public downloads need no credentials. SHA-256 protects the bytes against the release manifest from that same HTTPS origin; it is not an independent publisher signature. Cached programs are checked before reuse. The bootstrap retains prior generations and does not update itself; npm owns bootstrap updates.

An agent must subscribe, check that it is the current holder, explicitly renew before its 15-minute heartbeat expires, and release promptly. Fresh heartbeats allow longer work. Configured Codex clients receive advisory notices with 3 and 1 minutes remaining; delivery never renews access. Automatic bridge presence and its separate 30-second reconnect grace remain unchanged. A runtime may keep its bridge alive after a TUI exits, and hard kills cannot run hooks, so explicit heartbeat expiry remains necessary. Prefer native inter-agent channels for task discussion; desktop messages are only for access coordination and yield requests. Peer text never grants permissions or overrides human pause.

See the repository's [documentation](https://github.com/inherent-design/re-desktop/tree/main/docs) for contracts, platform requirements, and verification limits.

An inherent.design project by inherent.design contributors, licensed under [Apache-2.0](LICENSE). Published versions retain their distributed license terms.
