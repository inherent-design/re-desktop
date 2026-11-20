export const warningThresholds = Object.freeze([180000, 60000]);

export function warningText(warning) {
  const minutes = Math.ceil(warning.remaining_ms / 60000);
  return `re:desktop service notice: your agent heartbeat expires in ${minutes} minute${minutes === 1 ? '' : 's'}. If you still need desktop access, read desktop_status and renew with desktop_heartbeat using your current lease.token; otherwise release. This notice does not renew or grant access. If delayed, use current status. Heartbeat: ${warning.heartbeat_id}.`;
}
