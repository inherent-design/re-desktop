const literal = text => text.replaceAll('&', '&&');
const metadata = session => [
  { label: `Session ID: ${session.session_id}`, enabled: false },
  { label: literal(`Workspace: ${session.workspace}`), enabled: false },
  { label: session.connected ? 'Connected' : 'Reconnecting · up to 30s', enabled: false }
];

export function menuTemplate(snapshot, actions) {
  const status = snapshot.user_blocked ? 'Agent access paused by you' : snapshot.holder ? `${snapshot.holder.name} has access` : snapshot.queue[0]?.connected === false ? `Waiting for ${snapshot.queue[0].name} to reconnect` : 'Desktop available';
  return [
    { label: 're:desktop', enabled: false },
    { label: literal(status), enabled: false },
    { type: 'separator' },
    { id: 'pause', label: 'Pause agent access', type: 'radio', checked: snapshot.user_blocked, click: actions.pause },
    { id: 'allow', label: 'Allow agent access', type: 'radio', checked: !snapshot.user_blocked, click: actions.allow },
    { type: 'separator' },
    { id: 'holder', label: snapshot.holder ? literal(`${snapshot.holder.name} has access`) : 'No session has access', enabled: Boolean(snapshot.holder), submenu: snapshot.holder ? [...metadata(snapshot.holder), { type: 'separator' }, { id: 'end-access', label: 'End current access', click: actions.endAccess }] : undefined },
    { label: `Waiting for access (${snapshot.queue.length})`, submenu: snapshot.queue.length ? snapshot.queue.map((session, i) => ({ label: literal(`${i + 1}. ${session.name}`), submenu: metadata(session) })) : [{ label: 'No sessions waiting', enabled: false }] },
    { label: `Subscribed sessions (${snapshot.sessions.length})`, submenu: snapshot.sessions.length ? snapshot.sessions.map(session => ({ label: literal(`${session.name}${session.connected ? '' : ' · reconnecting'}`), submenu: metadata(session) })) : [{ label: 'No subscribed sessions', enabled: false }] },
    { type: 'separator' },
    { label: 'People retain ordinary desktop control', enabled: false },
    { id: 'about', label: 'About re:desktop', click: actions.about },
    { id: 'quit', label: 'Quit re:desktop', click: actions.quit }
  ];
}
