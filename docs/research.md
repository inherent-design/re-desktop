# Investigation

Sources inspected on 2026-11-19. This was a bounded search for relevant products and implementation constraints, not an exhaustive novelty survey. The product direction is a small, tool-independent availability channel: the native host shows shared state while each computer-use tool remains responsible for its own actions.

## Related products

| Primary source | Relevant experience | Consequence for re:desktop |
| --- | --- | --- |
| [DeskMCP](https://github.com/edmen12/deskmcp/blob/main/README.md) | Tray control panel, Windows agent-desktop allocation, access leases and a visible control indication | A strong nearby precedent; re:desktop can serve independent tools without supplying desktop automation or virtual desktops |
| [Windows-MCP](https://github.com/haizguyen/windows-mcp) | Ownership status, idle/takeover policy and a visible indicator around computer-use tools | Show ownership explicitly and qualify the difference between cooperation and stopping external actions |
| [Windows Commander MCP](https://github.com/exalsch/windows-commander-mcp) | Visible action indicators and an activity queue alongside Windows automation | Visibility matters independently of the tool performing an action; its action queue is not evidence of this project's session FIFO semantics |
| [Synergy tray and pause controls](https://support.symless.com/hc/en-us/articles/51545616802961-Finding-your-way-around-window-menus-tray-icon-and-pausing-sharing) | Background sharing with tray access and an explicit pause action | Keep pause and quit discoverable; closing an ordinary window should not be necessary |
| [Hammerspoon menubar API](https://www.hammerspoon.org/docs/hs.menubar.html) | A small macOS status item with contextual menu behavior | Useful macOS precedent, but it would require a separate solution for Windows and Linux |

## Language and architecture

The project uses [Bend](https://bend-lang.org/) 2.0.40. Its [guide](https://github.com/bendlang/bend/blob/v2.0.40/guide/GUIDE.md) describes affine values, dependent types, laws/proofs, and JavaScript module emission. This differs materially from historical Bend examples based on the earlier HVM-oriented language. Toolchain setup pins the release and checks archive hashes. The selected installer supports macOS and Linux; Windows consumes the emitted JavaScript.

The chosen integration is a pure Bend state machine compiled to an ES module, called directly by a thin JavaScript host. This gives the running product substantive Bend scheduling, expiry, fencing and human-pause behavior. Windows can consume the same emitted module without installing a compiler. Node and Electron use native JavaScript booleans at this ABI; that detail was verified experimentally rather than inferred from the generic constructor example in the guide.

[Electron Tray](https://www.electronjs.org/docs/latest/api/tray) and [Menu](https://www.electronjs.org/docs/latest/api/menu) provide the native host surfaces. The app creates no BrowserWindow. Electron's distribution is heavier than platform-specific Swift, WinUI and GTK applications, but it gives this experiment one host implementation and direct access to Bend's emitted module. Tauri/Rust and three separate native shells were considered at the architecture level, not benchmarked or implemented. Neither is needed to validate this product experience.

The tiny coordinator has ordered state changes and no substantial independent numeric workload. GPU or parallel execution would add work without helping this task; using Bend does not imply every application needs GPU computation. The proof boundary and a compact language tutorial are in [development](development.md).

## Lifecycle evidence

The MCP [stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) describes a client-launched subprocess; its [lifecycle contract](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) describes closing stdin and escalating process termination during shutdown. Neither establishes which application process owns a particular client's session. [Node socket events](https://nodejs.org/api/net.html#event-close_1) describe transport closure, not logical agent completion.

The [CLI reference](https://learn.chatgpt.com/docs/cli/reference) and installed Codex 0.170.0 help expose both `--no-daemon` and remote-server operation. The [MCP guide](https://learn.chatgpt.com/docs/extend/mcp) explains local subprocess configuration and server instructions. [Verification](verification.md#bridge-lifetime) records actual ownership tests, including a server-owned connection that survived TUI exit.
