import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

export async function mcpClient(root, name = 'acceptance', { command = process.execPath, entry = resolve('src/mcp.mjs'), args = [entry], env = {} } = {}) {
  const transport = new StdioClientTransport({ command, args, env: { ...env, RE_DESKTOP_RUNTIME: root, ELECTRON_RUN_AS_NODE: '1' }, stderr: 'pipe' });
  const client = new Client({ name, version: '1.0.0' }, { capabilities: {} });
  let diagnostics = '';
  transport.stderr?.on('data', bytes => { diagnostics += bytes; });
  try { await client.connect(transport); }
  catch (error) { await client.close(); throw new Error(`MCP connection failed: ${error.message}\n${diagnostics}`, { cause: error }); }
  return { client, transport, diagnostics: () => diagnostics };
}

export async function tool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const data = result.structuredContent ?? JSON.parse(result.content.find(c => c.type === 'text').text);
  return { result, data };
}
