import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
let command = process.execPath;
let script = join(root, 'src/mcp.mjs');
let packaged = false;
if (process.argv[2] === '--packaged' && process.argv[3] && !process.argv[4]) {
  const folder = resolve(process.argv[3]);
  command = process.platform === 'darwin' ? join(folder, 're-desktop.app/Contents/MacOS/re-desktop') : join(folder, process.platform === 'win32' ? 're-desktop.exe' : 're-desktop');
  script = join(folder, process.platform === 'darwin' ? 're-desktop.app/Contents/Resources' : 'resources', 'app.asar/src/mcp.mjs');
  if (!existsSync(command)) throw new Error('Packaged executable does not exist');
  packaged = true;
} else if (process.argv.length !== 2) throw new Error('Use no arguments for source mode, or --packaged <native package directory>');
console.log(`[mcp_servers.re_desktop]\ncommand = ${JSON.stringify(command)}\nargs = [${JSON.stringify(script)}]${packaged ? '\nenv = { ELECTRON_RUN_AS_NODE = "1" }' : ''}`);
