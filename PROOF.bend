import Base
import ./core/access.bend as Access
import ./LAWS.bend as Laws

def Laws.block_clears_holder(s):
  match s:
    case Access.State{b, h, e, u, q, ss}:
      {==}

def Laws.block_sets_pause(s):
  match s:
    case Access.State{b, h, e, u, q, ss}:
      {==}

def Laws.paused_schedule(h, e, u, q, ss, now):
  {==}

def Laws.stale_release(s, id, epoch, rejected):
  Equal.cong(Bool, Access.State, ok => Access.release.checked(ok, s), Access.matches(s, id, epoch), False{}, rejected)

def Laws.stale_renew(s, id, epoch, now, rejected):
  Equal.cong(Bool, Access.State, ok => Access.renew.checked(ok, s, now), Access.matches(s, id, epoch), False{}, rejected)

def Laws.fifo_grant(h, e, now, t, ss):
  {==}

def Laws.heartbeat_renews(b, h, e, u, q, ss, now):
  {==}

def Laws.pause_after_keeps_grant(m, h, e, u, q, ss):
  {==}

def Laws.pause_after_empty_pauses(m, e, u, q, ss):
  {==}

def Laws.pending_schedule_keeps_grant(h, e, u, q, ss, now):
  {==}

def Laws.pending_end_pauses(h, e, u, q, ss):
  {==}

def Laws.pending_release_pauses(h, e, u, q, ss):
  {==}

def Laws.allow_pending_keeps_grant(h, e, u, q, ss, now):
  {==}
