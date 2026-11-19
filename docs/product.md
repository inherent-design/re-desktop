# Product contract

re:desktop is a shared availability signal for one desktop, its human and cooperating local agent sessions. It does not intercept input, stop another program or enforce an OS lock. Agents take access immediately before desktop interaction and release it when that work finishes. The human can pause agent access at any time.

## Tray experience

| Signal | Meaning | Menu behavior |
| --- | --- | --- |
| Solid green disk | Human allows access; no session currently has it | Show “Desktop available”, or identify a queue head awaiting reconnection |
| Solid red disk | Human paused agent access | Show “Agent access paused by you”; no grant is possible |
| Red ring with white center | A session has access | Show its name, session ID and absolute workspace in a submenu |

The app starts paused. “Allow agent access” clears the human block; “Pause agent access” revokes the current cooperative access and prevents new grants. Pausing retains waiting sessions. The previous holder must take access again after the human allows it. “End current access” releases the current holder and lets scheduling continue. A pause is the action to use when the human wants the desktop back without immediately handing it to a waiter.

The menu also lists subscribed session names and a queue numbered from one. Each entry exposes its session ID, workspace and connection state. Session names and paths are literal text, including Unicode and ampersands. Status text supplements icon color. Artwork intentionally uses color rather than macOS template-image tinting. The app has no ordinary window or Dock icon on macOS. Quit removes the indicator, closes its service, and records a deliberate-stop choice for this profile. Agent preparation cannot clear that choice; an explicit native open or operator `re-desktop start` can. Screen lock or system suspend pauses access; returning does not automatically allow it.

## Sessions and access

One MCP stdio process represents one local agent session. A subscription has a human-readable name, workspace, public UUID and private reconnect capability. The host gives it an internal positive numeric ID for Bend scheduling. The public name is descriptive rather than authenticated identity; this is an owner-local coordination system.

Access has one holder and an epoch token scoped to the current host instance. Every grant increments the epoch. Release and renewal require the holder's current token and its own connection. Old tokens cannot affect a later holder or survive a host restart. A repeated take neither duplicates the queue entry nor renews existing access. A nonwaiting take never jumps the queue.

The queue is FIFO. A grant removes its head. A disconnected waiting session retains its place for at most 30 seconds so its bridge can reconnect. If it is the head, scheduling waits for reconnection or expiry; the menu explains that state. Cancelling a wait removes only that queue entry. Unsubscribing removes the session and immediately releases its access.

Confirmed socket disconnection ends held access immediately. Reconnecting within the presence grace restores session identity, mailbox and queue position, but never restores the old access. The agent must read status and take access again. Expired sessions subscribe anew. A host restart starts paused with no holders or queue; a surviving bridge registers a fresh session without automatically taking access.

Two different clocks address different failures. The bridge automatically refreshes its presence every ten seconds, retaining the session for 30 seconds. Only an explicit agent `desktop_heartbeat` renews its 30-second access lease. Reading status, maintaining the transport and sending messages do not renew access. Every operation expires stale state before acting; a 250 ms background sweep updates the tray during inactivity. OS scheduling can delay a visible update. These are cooperation deadlines, not guarantees that external actions stopped.

## Bridge lifetime

An agent client's visible interface and its MCP process can have different lifetimes. A Codex TUI can own its bridge directly, or connect to an app-server that retains the bridge after the TUI exits. Per-thread connections alone do not establish ownership or teardown behavior. The [lifetime tests](verification.md#bridge-lifetime) record the observed cases.

Confirmed disconnect releases access immediately; explicit lease expiry covers a bridge that remains connected. Automatic bridge presence does not establish active desktop use. Cancelling a model turn, ending a session, and killing a process are different events. A future session-ending integration must qualify its own lifecycle before replacing explicit renewal.

## Peer communication

Agents can send another subscribed session an access inquiry or a reason to yield. The recipient reads and acknowledges its mailbox. Urgency is metadata and cannot preempt access. Messages never grant authority or wake an idle model. Each mailbox holds at most 50 unacknowledged messages, each at most 2,000 characters, until acknowledgment or session expiry. Messages and sessions are memory-only; restart clears them.

## Host startup and distribution

The installed Node/npm entry verifies the selected program and loads its per-session bridge in-process. Discovery and status do not start the tray. First subscription or explicit runtime preparation may start the shared visible native host, initially paused, under the owner-selected policy. A compatible running host is reused even when its product version differs. Deliberate Quit prevents automatic respawn. Source and standalone ASAR bridges still require manual native startup. [Distribution](distribution.md) owns program storage, API compatibility, and release acquisition.

Native UI, protocol behavior, and release delivery have separate checks. [Verification](verification.md) owns the executed platform scope and remaining release limits.
