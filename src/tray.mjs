import { app, Tray, Menu, nativeImage, dialog, powerMonitor, clipboard } from 'electron';
import { startHost } from './host.mjs';
import { availabilityLabel, menuTemplate } from './menu.mjs';
import { iconPng } from './icon.mjs';
import { runtimePaths } from './runtime.mjs';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';

const smokeTest = process.argv.includes('--smoke-test');
const nativeTest = smokeTest || (process.env.RE_DESKTOP_TEST_TRACE === '1' && Boolean(process.env.RE_DESKTOP_RUNTIME));
const displayName = nativeTest ? 're:desktop native test' : 're:desktop';
if (smokeTest && (!process.env.RE_DESKTOP_RUNTIME || !process.env.RE_DESKTOP_ARTIFACTS)) throw new Error('Use npm run test:tray with an isolated runtime and artifact directory');
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
    const aboutImage = nativeImage.createFromBuffer(await readFile(new URL('../assets/about.png', import.meta.url)));
    if (aboutImage.isEmpty()) throw new Error('The About icon is invalid in this program build.');
    const aboutIcon = aboutImage.resize({ width: 128, height: 128, quality: 'best' });
    aboutIcon.setTemplateImage(false);
    // Only an explicit native open or operator CLI start clears a person's Quit.
    if (!process.env.RE_DESKTOP_AUTOSTART) await rm(paths.humanQuit, { force: true });
    host = await startHost();
    await writeFile(`${paths.root}/host.pid`, String(process.pid), { mode: 0o600 });
    tray = new Tray(nativeImage.createFromBuffer(iconPng('blocked'), { scaleFactor: 2 }), 'f7c25f43-f233-4609-8c84-fa2c8cad8ac6');
    let signature;
    let menu;
    const humanAction = (name, apply) => () => {
      apply();
      if (process.env.RE_DESKTOP_RUNTIME && process.env.RE_DESKTOP_TEST_TRACE) console.error(JSON.stringify({ action: name, access_mode: host.coordinator.snapshot().access_mode }));
    };
    const actions = {
      copySessionId: id => clipboard.writeText(id).catch(() => dialog.showErrorBox('Could not copy session ID', 'The system clipboard refused the copy. Try again.')),
      pause: humanAction('pause', () => host.coordinator.setBlocked(true)),
      pauseAfter: humanAction('pause-after', () => host.coordinator.pauseAfter()),
      allow: humanAction('allow', () => host.coordinator.setBlocked(false)),
      endAccess: humanAction('end-access', () => host.coordinator.endAccess()),
      about: () => dialog.showMessageBox({
        type: 'info', title: `About ${displayName}`, message: displayName, buttons: ['Close'], icon: aboutIcon,
        detail: `You can still use your desktop.\n\nPause agent access ends current access immediately and stops new grants. Pause after current access lets the current session keep its access, then pauses before any handoff. With no current session, it pauses immediately. Allow agent access permits further grants.\n\nEnd current access lets the next waiting session take over, unless Pause after is selected; then access stays paused.\n\nAgents must check in within ${Math.ceil(host.coordinator.snapshot().heartbeat_timeout_ms / 60000)} minutes to keep access. Each check-in renews that window, including during Pause after. The current session can keep renewing until you choose immediate Pause.\n\nQuitting closes the service. Agents cannot reopen it until you open re:desktop again.\n\nGreen: available\nRed: agent access paused\nBlue: pause after current access\nOrange-yellow: a session has access\n\nre:desktop ${app.getVersion()}\nBend 2.0.40 · MCP`
      }),
      quit: () => { humanQuit = true; app.quit(); }
    };
    const render = () => {
      const snapshot = host.coordinator.snapshot();
      const next = JSON.stringify({ ...snapshot, lease: snapshot.lease && { token: snapshot.lease.token, heartbeat_id: snapshot.lease.heartbeat_id, minutes: Math.ceil(snapshot.lease.remaining_ms / 60000) } });
      if (signature === next) return;
      signature = next;
      const image = nativeImage.createFromBuffer(iconPng(snapshot.availability), { scaleFactor: 2 });
      image.setTemplateImage(false);
      tray.setImage(image);
      tray.setToolTip(`${displayName} · ${availabilityLabel(snapshot)}`);
      const template = menuTemplate(snapshot, actions);
      template[0].label = displayName;
      menu = Menu.buildFromTemplate(template);
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
    if (smokeTest) {
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
    if (!smokeTest) {
      const next = error.code === 'EADDRINUSE'
        ? 'The local service address is already in use. Run re-desktop status to inspect the selected service before trying again.'
        : ['EACCES', 'EPERM'].includes(error.code)
          ? 'A required local resource could not be accessed. Check the file or socket permissions shown in the details below, then try again.'
          : 'Check the details below before trying again. Include these details if you report the problem.';
      dialog.showErrorBox('re:desktop could not start', `${next}\n\nDetails: ${error.message}`);
    }
    tray?.destroy();
    await host?.close();
    app.exit(1);
  }
});
