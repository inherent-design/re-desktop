import { app, Tray, Menu, nativeImage, dialog, powerMonitor } from 'electron';
import { startHost } from './host.mjs';
import { menuTemplate } from './menu.mjs';
import { iconPng } from './icon.mjs';
import { runtimePaths } from './runtime.mjs';
import { writeFile, rm, mkdir } from 'node:fs/promises';

if (process.argv.includes('--smoke-test') && (!process.env.RE_DESKTOP_RUNTIME || !process.env.RE_DESKTOP_ARTIFACTS)) throw new Error('Use npm run test:tray with an isolated runtime and artifact directory');
// Keep filesystem/application identity portable; visible tray labels use re:desktop.
app.setName('re-desktop');
const paths = runtimePaths();
app.setPath('userData', paths.root);
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  app.dock?.hide();
  let host;
  let tray;
  let closing = false;
  let humanQuit = false;
  try {
    await mkdir(paths.root, { recursive: true, mode: 0o700 });
    // Only an explicit native open or operator CLI start clears a person's Quit.
    if (!process.env.RE_DESKTOP_AUTOSTART) await rm(paths.humanQuit, { force: true });
    host = await startHost();
    await writeFile(`${paths.root}/host.pid`, String(process.pid), { mode: 0o600 });
    tray = new Tray(nativeImage.createFromBuffer(iconPng('blocked'), { scaleFactor: 2 }), 'f7c25f43-f233-4609-8c84-fa2c8cad8ac6');
    let signature;
    let menu;
    const humanAction = (name, apply) => () => {
      apply();
      if (process.env.RE_DESKTOP_RUNTIME && process.env.RE_DESKTOP_TEST_TRACE) console.error(JSON.stringify({ action: name, blocked: host.coordinator.state.blocked }));
    };
    const actions = {
      pause: humanAction('pause', () => host.coordinator.setBlocked(true)),
      allow: humanAction('allow', () => host.coordinator.setBlocked(false)),
      endAccess: () => host.coordinator.endAccess(),
      about: () => dialog.showMessageBox({ type: 'info', title: 're:desktop', message: 'A shared desktop availability light', detail: `re:desktop ${app.getVersion()}\nBend 2.0.40 · MCP\n\nGreen: available\nSolid red: paused by you\nRed ring, white center: a session has access\n\nAccess expires after 30 seconds without explicit renewal. People retain ordinary desktop control.` }),
      quit: () => { humanQuit = true; app.quit(); }
    };
    const render = () => {
      const snapshot = host.coordinator.snapshot();
      const next = JSON.stringify({ ...snapshot, lease: snapshot.lease && { token: snapshot.lease.token } });
      if (signature === next) return;
      signature = next;
      const image = nativeImage.createFromBuffer(iconPng(snapshot.availability), { scaleFactor: 2 });
      image.setTemplateImage(false);
      tray.setImage(image);
      tray.setToolTip(`re:desktop · ${snapshot.user_blocked ? 'Paused by you' : snapshot.holder ? `${snapshot.holder.name} has access` : 'Available'}`);
      menu = Menu.buildFromTemplate(menuTemplate(snapshot, actions));
      tray.setContextMenu(menu);
    };
    host.coordinator.on('change', render);
    powerMonitor.on('suspend', actions.pause);
    powerMonitor.on('lock-screen', actions.pause);
    render();
    app.on('before-quit', event => {
      if (closing) return;
      event.preventDefault();
      closing = true;
      host.coordinator.setBlocked(true);
      host.coordinator.off('change', render);
      tray.destroy();
      (async () => {
        if (humanQuit) await writeFile(paths.humanQuit, JSON.stringify({ at: new Date().toISOString() }) + '\n', { mode: 0o600 });
        await host.close();
        await rm(`${paths.root}/host.pid`, { force: true });
      })().catch(error => console.error(error.message)).finally(() => app.quit());
    });
    if (process.argv.includes('--smoke-test')) {
      const { smokeTray } = await import('../scripts/tray-acceptance.mjs');
      try {
        await smokeTray({ host, tray, getMenu: () => menu, actions, app });
        app.quit();
      } catch (error) {
        console.error(error);
        await host.close(); tray.destroy(); app.exit(1);
      }
    }
  } catch (error) {
    console.error(error.message);
    if (!process.argv.includes('--smoke-test')) dialog.showErrorBox('re:desktop could not start', error.message);
    tray?.destroy();
    await host?.close();
    app.exit(1);
  }
});
