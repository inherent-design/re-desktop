# Product contract

re:desktop is a shared availability signal for one desktop, its human and cooperating local agent sessions. It does not intercept input, stop another program or enforce an OS lock. Agents take access immediately before desktop interaction and release it when that work finishes. The human can pause agent access at any time.

## Tray experience

| Signal | Meaning | Menu behavior |
| --- | --- | --- |
| Solid green disk | Human allows access; no session currently has it | Show “Desktop available”, or identify a queue head awaiting reconnection |
| Solid red disk | Human paused agent access | Show “Agent access paused by you”; no grant is possible |
| Red ring with white center | A session has access | Show its name, session ID and absolute workspace in a submenu |

The app starts paused. “Allow agent access” clears the human block; “Pause agent access” revokes the current cooperative access and prevents new grants. Pausing retains waiting sessions. The previous holder must take access again after the human allows it. “End current access” releases the current holder and lets scheduling continue. A pause is the action to use when the human wants the desktop back without immediately handing it to a waiter.

The menu also lists subscribed session names and a queue numbered from one. Each entry exposes its session ID, workspace and connection state. **Copy session ID** copies that public identity, including from holder, queue and subscriber submenus. The holder submenu shows remaining heartbeat minutes. Session names and paths are literal text, including Unicode and ampersands. Status text supplements icon color. Artwork intentionally uses color rather than macOS template-image tinting. The app has no ordinary window or Dock icon on macOS. Quit removes the indicator, closes its service, and records a deliberate-stop choice for this profile. Agent preparation cannot clear that choice; an explicit native open or operator `re-desktop start` can. Screen lock or system suspend pauses access; returning does not automatically allow it.

## Sessions and access

One MCP stdio process represents one local agent session. A subscription has a human-readable name, workspace, public UUID and private reconnect capability. The host gives it an internal positive numeric ID for Bend scheduling. The public name is descriptive rather than authenticated identity; this is an owner-local coordination system.

Access has one holder and an epoch token scoped to the current host instance. Every grant increments the epoch. Release and renewal require the holder's current token and its own connection. Old tokens cannot affect a later holder or survive a host restart. A repeated take neither duplicates the queue entry nor renews existing access. A nonwaiting take never jumps the queue.

The queue is FIFO. A grant removes its head. A disconnected waiting session retains its place for at most 30 seconds so its bridge can reconnect. If it is the head, scheduling waits for reconnection or expiry; the menu explains that state. Cancelling a wait removes only that queue entry. Unsubscribing removes the session and immediately releases its access.

Confirmed socket disconnection ends held access immediately. Reconnecting within the presence grace restores session identity, mailbox and queue position, but never restores the old access. The agent must read status and take access again. Expired sessions subscribe anew. A host restart starts paused with no holders or queue; a surviving bridge registers a fresh session without automatically taking access.

Two different clocks address different failures. The bridge automatically refreshes its presence every ten seconds, retaining the session for 30 seconds. A grant starts a 15-minute agent heartbeat. Only an explicit holder `desktop_heartbeat` resets that window. This API remains holder-scoped: nonholders cannot renew another participant, and subscribed nonholders retain the separate transport-presence policy. Expiry ends held access and schedules the next waiter; it does not unsubscribe a still-connected participant. Fresh heartbeats allow work beyond 15 minutes without an absolute holding limit. Reading status, repeated takes, automatic presence, messages and warning delivery do not renew it.

With 3 minutes and 1 minute remaining, the service emits an advisory warning once per deadline generation. Renewal resets both warnings; pause, release, disconnect, expiry, unsubscribe and restart invalidate obsolete delivery. An opted-in Codex adapter can submit a fixed service tool message to the matching thread, waking an idle model or reaching an active turn. Accepted delivery is not proof that the model read or acted on it. Without an adapter, agents use the remaining time in normal results. Delivery failure never extends access. Every operation expires stale state before acting; a 250 ms background sweep updates the tray during inactivity. OS scheduling can delay visible updates. These are cooperation deadlines, not guarantees that external actions stopped.

## Bridge lifetime

An agent client's visible interface and its MCP process can have different lifetimes. A Codex TUI can own its bridge directly, or connect to an app-server that retains the bridge after the TUI exits. Per-thread connections alone do not establish ownership or teardown behavior. The [lifetime tests](verification.md#bridge-lifetime) record the observed cases.

Confirmed disconnect releases access immediately; explicit heartbeat expiry covers a bridge that remains connected. Automatic bridge presence does not establish active desktop use. The optional Codex integration uses SessionEnd for graceful root-session cleanup and SubagentStop for a child session. Its local helper retires only the privately mapped participant and never stops the shared host. Session switching, unsubscribing a client view, cancelling a turn and killing a process are different events. Hooks cannot cover hard kills or every TUI close, so the heartbeat fallback remains. [Protocol](protocol.md#codex-integration) owns setup and lifecycle details.

## Peer communication

Agents prefer native inter-agent channels, such as `codex_tui` or the host's supported channel, for task discussion. `desktop_message` is reserved for access inquiries, contention and yield requests. The recipient reads and acknowledges its mailbox. Urgency is metadata and cannot preempt access. Peer messages never grant authority or wake an idle model; service heartbeat delivery is a separate adapter. Each mailbox holds at most 50 unacknowledged messages, each at most 2,000 characters, until acknowledgment or session expiry. Messages and sessions are memory-only; restart clears them.

## Host startup and distribution

The installed Node/npm entry verifies the selected program and loads its per-session bridge in-process. Discovery and status do not start the tray. First subscription or explicit runtime preparation may start the shared visible native host, initially paused, under the owner-selected policy. A compatible running host is reused even when its product version differs. Deliberate Quit prevents automatic respawn. Source and standalone ASAR bridges still require manual native startup. [Distribution](distribution.md) owns program storage, API compatibility, and release acquisition.

Native UI, protocol behavior, and release delivery have separate checks. [Verification](verification.md) owns the executed platform scope and remaining release limits.
