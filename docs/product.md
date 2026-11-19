# Product contract

re:desktop is a shared availability signal for one desktop, its human and cooperating local agent sessions. It does not intercept input, stop another program or enforce an OS lock. Agents take access immediately before desktop interaction and release it when that work finishes. The human can pause agent access at any time.

## Tray experience

| Signal | Meaning | Menu behavior |
| --- | --- | --- |
| Solid green disk | Human allows access; no session currently has it | Show “Desktop available”, or identify a queue head awaiting reconnection |
| Solid red disk | Human paused agent access | Show “Agent access paused by you”; no grant is possible |
| Red ring with white center | A session has access | Show its name, session ID and absolute workspace in a submenu |

The app starts paused. “Allow agent access” clears the human block; “Pause agent access” revokes the current cooperative access and prevents new grants. Pausing retains waiting sessions. The previous holder must take access again after the human allows it. “End current access” releases the current holder and lets scheduling continue. A pause is the action to use when the human wants the desktop back without immediately handing it to a waiter.

The menu also lists subscribed session names and a queue numbered from one. Each entry exposes its session ID, workspace and connection state. Session names and paths are literal text, including Unicode and ampersands. Status text supplements icon color. Artwork intentionally uses color rather than macOS template-image tinting. The app has no ordinary window or Dock icon on macOS. Quit removes the indicator and closes its service. Screen lock or system suspend pauses access; returning does not automatically allow it.

## Sessions and access

One MCP stdio process represents one local agent session. A subscription has a human-readable name, workspace, public UUID and private reconnect capability. The host gives it an internal positive numeric ID for Bend scheduling. The public name is descriptive rather than authenticated identity; this is an owner-local coordination system.

Access has one holder and an epoch token scoped to the current host instance. Every grant increments the epoch. Release and renewal require the holder's current token and its own connection. Old tokens cannot affect a later holder or survive a host restart. A repeated take neither duplicates the queue entry nor renews existing access. A nonwaiting take never jumps the queue.

The queue is FIFO. A grant removes its head. A disconnected waiting session retains its place for at most 30 seconds so its bridge can reconnect. If it is the head, scheduling waits for reconnection or expiry; the menu explains that state. Cancelling a wait removes only that queue entry. Unsubscribing removes the session and immediately releases its access.

Confirmed socket disconnection ends held access immediately. Reconnecting within the presence grace restores session identity, mailbox and queue position, but never restores the old access. The agent must read status and take access again. Expired sessions subscribe anew. A host restart starts paused with no holders or queue; a surviving bridge registers a fresh session without automatically taking access.

Two different clocks address different failures. The bridge automatically refreshes its presence every ten seconds, retaining the session for 30 seconds. Only an explicit agent `desktop_heartbeat` renews its 30-second access lease. Reading status, maintaining the transport and sending messages do not renew access. Every operation expires stale state before acting; a 250 ms background sweep updates the tray during inactivity. OS scheduling can delay a visible update. These are cooperation deadlines, not guarantees that external actions stopped.

## Lifecycle investigation and decision

The owner asked whether reliable MCP teardown could eliminate heartbeats and timeouts. On macOS 26.7.1 with Codex CLI 0.170.0, the instrumented ordinary TUI invocation and `--no-daemon` each owned a separate bridge. Killing those TUIs produced a host disconnect within the next approximately 50 ms observation. Those particular invocations used TUI-owned bridges; this does not establish how every default installation chooses its backend.

With a separate, explicitly owned app-server and a TUI connected through `--remote`, the app-server owned the bridge. Killing the TUI left both server and MCP connection live throughout the three-second observation. The observation proves that TUI exit is not a universal transport-disconnect event; it does not claim how long that runtime would otherwise remain loaded. Per-thread connections existed in a separate two-thread Codex check, but their existence alone does not settle their lifetime.

Therefore the MVP uses immediate release on confirmed disconnect and retains explicit access expiry for a still-connected bridge. An automatic bridge heartbeat alone would not establish that an agent is still using its access. A future trusted integration with the host's actual session-ending events could replace that renewal requirement for a qualified mode. Cancelling a model turn, hanging a process and ending a session remain different events; an actual active-turn cancellation was not exercised.

## Peer communication

Agents can send another subscribed session an access inquiry or a reason to yield. The recipient reads and acknowledges its mailbox. Urgency is metadata and cannot preempt access. Messages never grant authority or wake an idle model. Each mailbox holds at most 50 unacknowledged messages, each at most 2,000 characters, until acknowledgment or session expiry. Messages and sessions are memory-only; restart clears them.

## Acceptance and release boundary

The local MVP must exercise the real tray/menu, the emitted Bend core and independent MCP clients on the observed macOS/Codex versions. Lifecycle checks must cover contention, FIFO, human pause, stale tokens, reconnect and a still-connected bridge that fails to renew. Native UI and protocol evidence are separate. See [verification](verification.md) for executed scope.

Source and pipeline configuration target macOS, Windows and Linux. Packaging uses each native runner and the same emitted Bend module. Configuring CI is not evidence that those runners passed. Distribution signing, macOS notarization, Windows installer/signing, actual Linux desktop indicator coverage and public releases remain polishing gates.
