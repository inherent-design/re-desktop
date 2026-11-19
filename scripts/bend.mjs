import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { delimiter } from 'node:path';

export const bend = fileURLToPath(new URL('../.tools/bend/bin/bend', import.meta.url));
export function runBend(args) {
  const platform = `${process.platform === 'darwin' ? 'darwin' : 'linux'}${process.arch === 'arm64' ? '_aarch64' : ''}`;
  const lean = fileURLToPath(new URL(`../.tools/lean-4.34.0-${platform}/bin`, import.meta.url));
  const env = { ...process.env, BEND_NO_TELEMETRY: '1' };
  if (existsSync(lean)) env.PATH = lean + delimiter + (env.PATH ?? '');
  const result = spawnSync(bend, args, { stdio: 'inherit', env });
  if (result.error) throw new Error('Run npm run setup:bend first', { cause: result.error });
  if (result.status !== 0) throw new Error(`Bend failed (${result.status})`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) runBend(process.argv.slice(2));
