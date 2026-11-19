# Agent and host protocol

The agent-facing transport is MCP stdio, implemented with `@modelcontextprotocol/sdk` 1.32.2. Standard output contains MCP messages only. Discovery works with the tray app offline. Source mode reports `HOST_UNAVAILABLE` until manual native startup. The installed bootstrap may start the tray on subscription or explicit preparation, under the owner policy, initially paused. Discovery and status never launch it. Agents receive server instructions, descriptions for every input parameter and typed success responses through MCP; reading repository files is unnecessary for the workflow. The first instruction paragraph fits within 512 characters and includes the capability and peer-trust boundaries, human pause, ownership checks, renewal and cleanup.

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
| `desktop_runtime_status` | None | Read exact selection, independent APIs, owner policy, human Quit, and authenticated host readiness without launching |
| `desktop_runtime_prepare` | None | Prepare the selected runtime/start its tray if allowed; cannot select versions, clear Quit, restart a live host, or grant access |

Successful coordination tool results include the current status snapshot. `you.session_id` identifies the caller; proceed only if it matches `holder.session_id`. `lease.token` is the exact value to pass as `lease_token`. `lease.remaining_ms` is measured at the host and is not a promise that a long external action will finish before expiry. A queue position is one-based, or null when not queued. A holder has no queue position.

Every tool advertises an `outputSchema` for its successful `structuredContent`; the SDK validates actual replies against it. The same JSON is also returned as text. The common snapshot describes `instance_id`, `availability`, `user_blocked`, `holder`, `lease`, `queue`, `sessions`, `you`, `unread_messages`, `lease_timeout_ms`, `presence_timeout_ms` and `coordination`. A subscription additionally returns `session_id` and private `resume_token`; sending a message adds `sent`; reading messages adds the remaining `messages` with sender, message ID, text and urgency. A successful unsubscribe has `you: null`. Neither two null identities nor a successful take that only queued the caller establishes ownership.

Runtime responses instead describe `version`, `source`, `target`, `startup`, `updates`, `signing`, `api`, `host_running`, `human_quit`, `agreement`, and `restart_required`. Readiness and compatibility do not grant desktop access. This connection stays pinned; operator setup affects new connections. The source bridge reports manual startup and local-source trust.

Domain tool errors use `isError: true` with text JSON `{ "error": { "code": "…", "message": "…", "details": { } } }`, outside the success schema. `details` is optional. Relevant codes include `NOT_SUBSCRIBED`, `NOT_HOLDER`, `STALE_LEASE`, `SESSION_EXPIRED`, `SESSION_CONNECTED`, `INVALID_ARGUMENT`, `NOT_FOUND`, `CAPACITY`, `MAILBOX_FULL`, `HOST_UNAVAILABLE` `OUTCOME_UNKNOWN`, `HOST_START_REFUSED`, `HOST_START_FAILED`, `DESKTOP_UNAVAILABLE`, `API_UPGRADE_REQUIRED`, `API_CAPABILITY_REQUIRED`, `API_NEGOTIATION_REQUIRED`, `API_INVALID_OFFER`, `API_INVALID_AGREEMENT`, and `API_RENEGOTIATION_REFUSED`. MCP schema validation separately rejects malformed tool arguments or invalid host results and may return explanatory text. An uncertain reply does not prove that a mutation failed: read current state before retrying. The bridge never blindly replays a mutation.

`redesktop://desktop/status` is a JSON resource supporting MCP resource subscriptions. Semantic state changes notify subscribers to reread it; elapsed countdown milliseconds alone do not generate notifications. Poll tools when a client does not consume resource notifications. Delivery of a notification does not activate a model turn.

## Reconnect and teardown

Each bridge holds one private connection to the native host. It maintains presence automatically and reconnects after transport loss, using its in-memory resume token. Reconnection does not repeat a take or restore revoked access. A restarted host refuses the old resume token; the bridge registers a new session, then returns the resulting identity in `you`. A stale token from a previous grant or host instance is still invalid.

EOF on the bridge's stdin and SIGINT/SIGTERM close its host connection. A killed bridge loses its socket through OS process cleanup. This says nothing about a TUI exit when another process still owns the bridge; [bridge lifetime](product.md#bridge-lifetime) explains that distinction. A bridge with a live connection does not automatically renew desktop access.

## Local host boundary

The tray app alone owns human pause/allow/end controls. Its private IPC uses newline-delimited UTF-8 JSON with request IDs and a 256-bit local bearer token. Unix hosts use an owner-private directory and socket; Windows uses a named pipe plus the same token. The default runtime directory is `~/.re-desktop`; `RE_DESKTOP_RUNTIME` selects an absolute isolated directory for tests or a second installation. It is not a network listener.

The host bounds input frames to 16 KiB, active/grace sessions to 128, names to 100 characters and workspace paths to 2,048 characters. Paths are descriptive metadata and never opened or executed. Frame parsing/authentication and shared-API negotiation happen before a domain operation. Ordinary files and live sockets are not silently replaced during startup. Unix runtime directory, token and socket modes are 700, 600 and 600 respectively. Windows confidentiality relies on the current user's profile directory ACLs and bearer-token custody; hardening against hostile same-account processes is outside this cooperative MVP.

Connection attribution prevents another subscribed session from releasing a holder merely by knowing its public token. A reconnect capability is private and omitted from other sessions' snapshots, menus and verification reports. Same-account processes with access to the runtime credentials are within the local trust boundary. Neither the protocol nor its token creates a sandbox or an OS desktop lock.

## Independent API negotiation

[`api.json`](../api.json) owns the agent application API, host application API, and supported shared IPC versions/capabilities. Standard MCP wire negotiation remains separate. The authenticated IPC `hello` offer contains `shared_apis`, `required_capabilities`, `agent_api`, and `product_version`. The host selects the highest common IPC API and confirms capabilities plus independent agent/host API and product versions. No session is created during negotiation.

Malformed offers, missing capabilities, disjoint versions, and invalid agreements fail before subscription or mutation. Upgrade errors identify `host`, `bridge`, or `either` when determinable. A legacy host that cannot negotiate requires a host upgrade; a legacy bridge cannot operate against the negotiated host. Active sessions must reconnect to change the selected shared API. Product-version equality is never required.

Agents can request preparation only through the saved owner policy. They cannot provide arbitrary origins, versions, shell commands, or trust settings. A compatible existing host is reused; incompatible hosts are rejected rather than force-restarted. Operator setup selects another exact release for new MCP connections. See [distribution](distribution.md) for the upgrade and restart boundary.
