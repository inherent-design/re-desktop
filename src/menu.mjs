const literal = text => text.replaceAll('&', '&&');
const metadata = (session, actions, remainingMs) => [
  { label: literal(`Workspace: ${session.workspace}`), enabled: false },
  { label: session.connected ? 'Connected' : 'Reconnecting…', enabled: false },
  ...(remainingMs === undefined ? [] : [{ label: `Agent check-in due within ${Math.ceil(remainingMs / 60000)} min`, enabled: false }]),
  { type: 'separator' },
  { label: 'Copy session ID', click: () => actions.copySessionId(session.session_id) }
];

export function availabilityLabel(snapshot) {
  return snapshot.user_blocked ? 'Agent access paused' : snapshot.holder ? `${snapshot.holder.name} has access` : snapshot.queue[0]?.connected === false ? `Waiting for ${snapshot.queue[0].name} to reconnect` : 'Desktop available';
}

export function menuTemplate(snapshot, actions) {
  return [
    { label: 're:desktop', enabled: false },
    { id: 'holder', label: literal(availabilityLabel(snapshot)), enabled: Boolean(snapshot.holder), submenu: snapshot.holder ? metadata(snapshot.holder, actions, snapshot.lease.remaining_ms) : undefined },
    { type: 'separator' },
    snapshot.user_blocked ? { id: 'allow', label: 'Allow agent access', click: actions.allow } : { id: 'pause', label: 'Pause agent access', click: actions.pause },
    { id: 'end-access', label: 'End current access', enabled: Boolean(snapshot.holder), click: actions.endAccess },
    { type: 'separator' },
    { label: `Waiting for access (${snapshot.queue.length})`, submenu: snapshot.queue.length ? snapshot.queue.map((session, i) => ({ label: literal(`${i + 1}. ${session.name}`), submenu: metadata(session, actions) })) : [{ label: 'No sessions waiting', enabled: false }] },
    { label: `Sessions (${snapshot.sessions.length})`, submenu: snapshot.sessions.length ? snapshot.sessions.map(session => ({ label: literal(`${session.name}${session.connected ? '' : ' · reconnecting'}`), submenu: metadata(session, actions) })) : [{ label: 'No sessions', enabled: false }] },
    { type: 'separator' },
    { label: 'You can still use your desktop', enabled: false },
    { id: 'about', label: 'About re:desktop', click: actions.about },
    { id: 'quit', label: 'Quit re:desktop', click: actions.quit }
  ];
}
