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
