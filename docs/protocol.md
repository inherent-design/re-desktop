# Agent and host protocol

The agent-facing transport is MCP stdio, implemented with `@modelcontextprotocol/sdk` 1.32.2. Standard output contains MCP messages only. Discovery works with the tray app offline; operations report `HOST_UNAVAILABLE` until it starts. Server instructions explain subscription, ownership checks, expiry and prompt release.

## MCP tools

| Tool | Arguments | Result or effect |
| --- | --- | --- |
| `desktop_subscribe` | `name`, absolute `workspace`, optional `resume_token` | Bind the bridge; return `session_id` and private reconnect token |
| `desktop_status` | None | Availability, holder, token/deadline remaining, subscribers, numbered queue and caller identity |
| `desktop_take` | Optional Boolean `wait`, default true | Take free access or join the FIFO queue; false does not join |
| `desktop_heartbeat` | `lease_token` | Renew the caller's current access for 30 seconds |
| `desktop_release` | `lease_token` | End the caller's current access and schedule the next eligible waiter |
| `desktop_cancel_wait` | None | Leave the queue while remaining subscribed |
| `desktop_message` | `to_session_id`, `text`, optional Boolean `urgent` | Enqueue peer-authored data in the recipient's mailbox |
| `desktop_messages` | Optional nonnegative `ack_through` | Acknowledge through an observed message ID, then read remaining messages |
| `desktop_unsubscribe` | None | Remove the caller, its queue entry and any held access |

Successful tool results include the current status snapshot. `you.session_id` identifies the caller; proceed only if it matches `holder.session_id`. `lease.token` is the exact value to pass as `lease_token`. `lease.remaining_ms` is measured at the host and is not a promise that a long external action will finish before expiry. A queue position is one-based, or null when not queued. A holder has no queue position.

Tool errors use `isError: true` with JSON `{ "error": { "code": "…", "message": "…" } }`. Relevant codes include `NOT_SUBSCRIBED`, `NOT_HOLDER`, `STALE_LEASE`, `SESSION_EXPIRED`, `SESSION_CONNECTED`, `INVALID_ARGUMENT`, `NOT_FOUND`, `CAPACITY`, `MAILBOX_FULL`, `HOST_UNAVAILABLE` and `OUTCOME_UNKNOWN`. MCP schema validation separately rejects malformed tool arguments. An uncertain reply does not prove that a mutation failed: read current state before retrying. The bridge never blindly replays a mutation.

`redesktop://desktop/status` is a JSON resource supporting MCP resource subscriptions. Semantic state changes notify subscribers to reread it; elapsed countdown milliseconds alone do not generate notifications. Poll tools when a client does not consume resource notifications. Delivery of a notification does not activate a model turn.

## Reconnect and teardown

Each bridge holds one private connection to the native host. It maintains presence automatically and reconnects after transport loss, using its in-memory resume token. Reconnection does not repeat a take or restore revoked access. A restarted host refuses the old resume token; the bridge registers a new session, then returns the resulting identity in `you`. A stale token from a previous grant or host instance is still invalid.

EOF on the bridge's stdin and SIGINT/SIGTERM close its host connection. A killed bridge loses its socket through OS process cleanup. This says nothing about a TUI exit when another process still owns the bridge; the [lifecycle investigation](product.md#lifecycle-investigation-and-decision) qualifies that distinction. A bridge with a live connection does not automatically renew desktop access.

## Local host boundary

The tray app alone owns human pause/allow/end controls. Its private IPC uses newline-delimited UTF-8 JSON with request IDs and a 256-bit local bearer token. Unix hosts use an owner-private directory and socket; Windows uses a named pipe plus the same token. The default runtime directory is `~/.re-desktop`; `RE_DESKTOP_RUNTIME` selects an absolute isolated directory for tests or a second installation. It is not a network listener.

The host bounds input frames to 16 KiB, active/grace sessions to 128, names to 100 characters and workspace paths to 2,048 characters. Paths are descriptive metadata and never opened or executed. Frame parsing/authentication happens before a domain operation. Ordinary files and live sockets are not silently replaced during startup. Unix runtime directory, token and socket modes are 700, 600 and 600 respectively. Windows confidentiality relies on the current user's profile directory ACLs and bearer-token custody; hardening against hostile same-account processes is outside this cooperative MVP.

Connection attribution prevents another subscribed session from releasing a holder merely by knowing its public token. A reconnect capability is private and omitted from other sessions' snapshots, menus and verification reports. Same-account processes with access to the runtime credentials are within the local trust boundary. Neither the protocol nor its token creates a sandbox or an OS desktop lock.
