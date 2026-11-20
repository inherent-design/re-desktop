import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { mcpClient, tool } from './mcp-client.mjs';
import { iconPng } from '../src/icon.mjs';
import { clipboard, ClipboardItem } from 'electron';

const execute = promisify(execFile);
export async function smokeTray({ host, tray, getMenu, actions, app }) {
  const report = { platform: process.platform, os: process.getSystemVersion(), electron: process.versions.electron, bend: '2.0.40', app: app.getVersion(), started: new Date().toISOString(), checks: [] };
  const out = process.env.RE_DESKTOP_ARTIFACTS;
  assert.equal(tray.isDestroyed(), false);
  if (process.platform !== 'linux') {
    for (let attempt = 0; attempt < 60 && (tray.getBounds().width === 0 || tray.getBounds().height === 0); attempt++) await delay(50);
    report.bounds = tray.getBounds();
    assert.ok(report.bounds.width > 0 && report.bounds.height > 0, `OS tray did not become visible: ${JSON.stringify(report.bounds)}`);
    report.checks.push('OS tray item has nonzero bounds');
  } else report.checks.push('Linux Tray created; desktop environment determines indicator visibility');
  assert.equal(getMenu().getMenuItemById('pause').checked, true);
  report.checks.push('Native Menu built with paused startup state');
  if (process.platform === 'darwin') {
    try {
      await execute(resolve('build/macos-menu'), ['--check-accessibility'], { timeout: 5000 });
      const selection = execute(resolve('build/macos-menu'), [String(process.pid), 'Allow agent access', '--select-only'], { timeout: 5000 });
      tray.popUpContextMenu(getMenu());
      const native = await selection;
      report.accessibility = native.stdout.trim();
      for (let attempt = 0; attempt < 20 && host.coordinator.snapshot().user_blocked; attempt++) await delay(50);
      assert.equal(host.coordinator.snapshot().user_blocked, false, native.stdout);
      report.checks.push('Native Tray API opened the context menu and Accessibility pressed its owned Allow agent access item');
    } catch (error) {
      if (error.code !== 3) throw error;
      report.accessibility = 'unavailable; native menu action invoked through Electron';
      getMenu().getMenuItemById('allow').click();
    }
  } else getMenu().getMenuItemById('allow').click();
  assert.equal(host.coordinator.snapshot().availability, 'available');
  for (const state of ['available', 'blocked', 'in_use']) await writeFile(join(out, `icon-${state}.png`), iconPng(state, 128));
  const a = await mcpClient(host.paths.root, 'tray-a'), b = await mcpClient(host.paths.root, 'tray-b');
  try {
    const one = (await tool(a.client, 'desktop_subscribe', { name: 'Atlas · native smoke', workspace: process.cwd() })).data;
    const two = (await tool(b.client, 'desktop_subscribe', { name: 'Second session', workspace: process.cwd() })).data;
    const access = (await tool(a.client, 'desktop_take')).data;
    assert.equal(access.holder.session_id, one.session_id);
    const queued = (await tool(b.client, 'desktop_take')).data;
    assert.equal(queued.you.queue_position, 1);
    const holder = getMenu().getMenuItemById('holder');
    assert.match(holder.label, /Atlas.*has access/);
    assert.ok(holder.submenu.items.some(i => i.label.includes(one.session_id)));
    assert.ok(holder.submenu.items.some(i => i.label.includes(process.cwd())));
    report.checks.push('Two independent MCP processes update actual native holder metadata and numbered queue');
    const copy = holder.submenu.items.find(i => i.label.startsWith('Copy session ID:'));
    assert.ok(copy.enabled);
    const originalClipboard = [];
    // Materialize all native formats before copying, including rich/custom data.
    // The current async Clipboard API round-trips these through ClipboardItem.
    for (const item of await clipboard.read()) {
      if (!item.types.length) continue; // An empty native clipboard can have one zero-format item.
      const data = {};
      for (const type of item.types) {
        const value = await item.getType(type);
        data[type] = value instanceof Blob ? new Blob([await value.arrayBuffer()], { type: value.type }) : value;
      }
      originalClipboard.push(new ClipboardItem(data));
    }
    try {
      await copy.click();
      assert.equal(await clipboard.readText(), one.session_id);
      report.checks.push('Enabled native session-ID action copies the exact identity to the clipboard');
      console.log('Native session-ID clipboard copy passed');
    } finally {
      // Do not overwrite a new copy made by the person during this short check.
      if (await clipboard.readText() === one.session_id) {
        if (originalClipboard.length) await clipboard.write(originalClipboard);
        else clipboard.clear();
      }
    }
    if (process.platform === 'darwin') {
      const { x, y, width, height } = tray.getBounds();
      try {
        await execute('screencapture', ['-x', '-R', `${x},${y},${width},${height}`, join(out, 'native-tray.png')], { timeout: 5000 });
        report.screenshot = 'native-tray.png (only the owned tray bounds)';
      } catch { report.screenshot = 'Screen capture unavailable'; }
    }
    await tool(a.client, 'desktop_release', { lease_token: access.lease.token });
    assert.equal((await tool(b.client, 'desktop_status')).data.holder.session_id, two.session_id);
    report.checks.push('Release hands actual native tray access to the queued session');
    getMenu().getMenuItemById('pause').click();
    assert.equal((await tool(b.client, 'desktop_status')).data.holder, null);
    assert.equal(getMenu().getMenuItemById('pause').checked, true);
    report.checks.push('Native pause action revokes the current access and shows paused state');
    getMenu().getMenuItemById('allow').click();
    await tool(b.client, 'desktop_take');
    getMenu().getMenuItemById('end-access').click();
    assert.equal((await tool(b.client, 'desktop_status')).data.holder, null);
    report.checks.push('Native End current access action clears the holder');
    actions.pause();
    await delay(20);
  } finally { await a.client.close(); await b.client.close(); }
  report.finished = new Date().toISOString();
  await writeFile(join(out, 'tray-acceptance.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Native tray acceptance passed (${report.checks.length} checks)`);
}
