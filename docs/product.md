# Product contract

re:desktop is a shared availability signal for one desktop, its human and cooperating local agent sessions. It does not intercept input, stop another program or enforce an OS lock. Agents take access immediately before desktop interaction and release it when that work finishes. The human can pause agent access at any time.

## Tray experience

| Signal | Meaning | Menu behavior |
| --- | --- | --- |
| Solid green disk | Human allows access; no session currently has it | Show “Desktop available”, or identify a queue head awaiting reconnection |
| Solid red disk | Agent access is paused | Show “Agent access paused”; no grant is possible |
| Solid blue disk | Pause after current access is selected | Identify the holder whose grant remains valid; no next grant is possible |
| Solid orange-yellow disk | A session has access | Show its name once, with details and a session ID copy action in its submenu |

The app starts paused. **Pause agent access** immediately revokes the current cooperative access and prevents new grants. It remains the default for startup, screen lock, suspend, and restart. Pausing retains waiting sessions. The previous holder must take access again after the person allows it.

**Pause after current access** preserves only the current grant and prevents its next handoff. When that grant ends through release, End, disconnect, expiry, unsubscribe, or cleanup, the service becomes fully paused before any waiter can receive access. With no holder, it pauses immediately. Existing waiters retain their order; new take calls do not add queue entries while Pause after is pending. Reconnection cannot restore the old grant. Immediate Pause remains available throughout.

**Allow agent access** permits ordinary FIFO scheduling or cancels a pending pause without replacing or renewing the holder's grant. **End current access** normally hands access to the next eligible waiter; while Pause after is pending, its label becomes **End current access and pause**, and no handoff occurs. It is disabled with no holder. Only the person selects these modes; the MCP has no mode-setting tool.

The menu shows all three choices with their selected state. Pending status identifies the current holder and explains that no next session will receive access. Blue takes indicator priority over the ordinary orange-yellow held state. The status and tooltip use the same wording, including when a queue head is waiting to reconnect. Pause attribution stays neutral because startup, screen lock, and suspend also pause access. The blue is inherent.design's brand accent `#2563EB`, from `packages/brand/styles/styles.css` and `packages/brand/typst/lib/colors.typ` at brand repository revision `5e94f3b03568e2f33f803a727f9c69f3fe034743`.

The menu lists session names and a queue numbered from one. Each entry shows its full workspace and connection state. **Copy session ID** copies the complete public identity from holder, queue, and session submenus. The holder submenu says “Agent check-in due within N min” for the remaining renewable heartbeat window. “Reconnecting…” identifies a retained disconnected session without implying a fresh 30 seconds remain. Session names and paths are literal text, including Unicode and ampersands. Status text supplements icon color. Artwork intentionally uses color rather than macOS template-image tinting. The app has no ordinary window or Dock icon on macOS.

About explains access controls, check-ins, Quit, and indicator colors before support versions. Quit removes the indicator, closes its service, and records a deliberate-stop choice for this profile. Agent preparation cannot clear that choice; an explicit native open or operator `re-desktop start` can. Screen lock or system suspend pauses access; returning does not automatically allow it.

The About mark sits on a white rounded-square tile. Its antialiased corners are transparent outside the tile; the ink colors and fades retain their reviewed white backdrop. The generator and workbench share RGBA compositing and settings. Background corner radius is adjustable from square to circular; the selected radius is 14 units on the 64-unit canvas. Checkerboard, light, dark, and blue preview surfaces are display-only. Fully transparent artwork remains an explicit workbench option. Legacy settings without a corner radius retain their square background.

## Sessions and access

One MCP stdio process represents one local agent session. A subscription has a human-readable name, workspace, public UUID, and private reconnect capability. Names can repeat; the UUID identifies the participant. The host gives it an internal positive numeric ID for Bend scheduling. The public name is descriptive rather than authenticated identity; this is an owner-local coordination system.

Access has one holder and an epoch token scoped to the current host instance. Every grant increments the epoch. Release and renewal require the holder's current token and its own connection. Old tokens cannot affect a later holder or survive a host restart. A repeated take neither duplicates the queue entry nor renews existing access. A nonwaiting take never jumps the queue.

The queue is FIFO. A grant removes its head. A disconnected waiting session retains its place for at most 30 seconds so its bridge can reconnect. If it is the head, scheduling waits for reconnection or expiry; the menu explains that state. Cancelling a wait removes only that queue entry. Unsubscribing removes the session and immediately releases its access.

Confirmed socket disconnection ends held access immediately. Reconnecting within the presence grace restores session identity, mailbox and queue position, but never restores the old access. The agent must read status and take access again. Expired sessions subscribe anew. A host restart starts paused with no holders or queue; a surviving bridge registers a fresh session without automatically taking access.

Two different clocks address different failures. The bridge automatically refreshes its presence every ten seconds, retaining the session for 30 seconds. A grant starts a 15-minute agent heartbeat. Only an explicit holder `desktop_heartbeat` resets that window. This API remains holder-scoped: nonholders cannot renew another participant, and subscribed nonholders retain the separate transport-presence policy. Expiry ends held access and schedules the next waiter; it does not unsubscribe a still-connected participant. Fresh heartbeats allow work beyond 15 minutes without an absolute holding limit, including while Pause after is pending. Pause after neither renews nor truncates this window; explicit renewals can postpone the eventual pause indefinitely. Choose immediate Pause to end access now. Reading status, repeated takes, automatic presence, messages and warning delivery do not renew it.

With 3 minutes and 1 minute remaining, the service emits an advisory warning once per deadline generation. Renewal resets both warnings; pause, release, disconnect, expiry, unsubscribe and restart invalidate obsolete delivery. An opted-in Codex adapter can submit a fixed service tool message to the matching thread, waking an idle model or reaching an active turn. Accepted delivery is not proof that the model read or acted on it. Without an adapter, agents use the remaining time in normal results. Delivery failure never extends access. Every operation expires stale state before acting; a 250 ms background sweep updates the tray during inactivity. OS scheduling can delay visible updates. These are cooperation deadlines, not guarantees that external actions stopped.

## Bridge lifetime

An agent client's visible interface and its MCP process can have different lifetimes. A Codex TUI can own its bridge directly, or connect to an app-server that retains the bridge after the TUI exits. Per-thread connections alone do not establish ownership or teardown behavior. The [lifetime tests](verification.md#bridge-lifetime) record the observed cases.

Confirmed disconnect releases access immediately; explicit heartbeat expiry covers a bridge that remains connected. Automatic bridge presence does not establish active desktop use. The optional Codex integration uses SessionEnd for graceful root-session cleanup and SubagentStop for a child session. Its local helper retires only the privately mapped participant and never stops the shared host. Session switching, unsubscribing a client view, cancelling a turn and killing a process are different events. Hooks cannot cover hard kills or every TUI close, so the heartbeat fallback remains. [Protocol](protocol.md#codex-integration) owns setup and lifecycle details.

## Peer communication

Agents prefer native inter-agent channels, such as `codex_tui` or the host's supported channel, for task discussion. `desktop_message` is reserved for access inquiries, contention and yield requests. The recipient reads and acknowledges its mailbox. Urgency is metadata and cannot preempt access. Peer messages never grant authority or wake an idle model; service heartbeat delivery is a separate adapter. Each mailbox holds at most 50 unacknowledged messages, each at most 2,000 characters, until acknowledgment or session expiry. Messages and sessions are memory-only; restart clears them.

## Host startup and distribution

The installed Node/npm entry verifies the selected program and loads its per-session bridge in-process. Discovery and status do not start the tray. First subscription or explicit runtime preparation may start the shared visible native host, initially paused, under the owner-selected policy. A compatible running host is reused even when its product version differs. Deliberate Quit prevents automatic respawn. Source and standalone ASAR bridges still require manual native startup. [Distribution](distribution.md) owns program storage, API compatibility, and release acquisition.

Native UI, protocol behavior, and release delivery have separate checks. [Verification](verification.md) owns the executed platform scope and remaining release limits.
