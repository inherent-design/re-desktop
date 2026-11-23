import Base
import ./core/access.bend as Access

# Human pause immediately clears cooperative access for every possible state.
law block_clears_holder:
  for s: Access.State
  {Access.holder(Access.block(s)) == 0n : Nat}

law block_sets_pause:
  for s: Access.State
  {Access.blocked(Access.block(s)) == True{} : Bool}

# Scheduling cannot grant access while the human has paused it.
law paused_schedule:
  for h: Nat
  for e: Nat
  for u: Nat
  for q: +List<Nat>
  for ss: +List<Access.Session>
  for now: Nat
  {Access.holder(Access.schedule(Access.State{Access.Paused{}, h, e, u, q, ss}, now)) == 0n : Nat}

# A rejected identity/epoch comparison cannot change the state.
law stale_release:
  for +s: Access.State
  for +id: Nat
  for +epoch: Nat
  for rejected: {Access.matches(s, id, epoch) == False{} : Bool}
  {Access.release(s, id, epoch) == s : Access.State}

law stale_renew:
  for +s: Access.State
  for +id: Nat
  for +epoch: Nat
  for +now: Nat
  for rejected: {Access.matches(s, id, epoch) == False{} : Bool}
  {Access.renew(s, id, epoch, now) == s : Access.State}

# FIFO: granting the head consumes only that head and increments the epoch.
law fifo_grant:
  for h: Nat
  for e: Nat
  for now: Nat
  for t: +List<Nat>
  for ss: +List<Access.Session>
  {Access.grant(True{}, h, e, now, t, ss) == Access.State{Access.Allowed{}, h, 1n+e, Nat.add(now, Access.heartbeat_timeout()), t, ss} : Access.State}

# An accepted renewal starts a fresh heartbeat window, with no maximum total hold.
law heartbeat_renews:
  for b: Access.Mode
  for h: Nat
  for e: Nat
  for u: Nat
  for q: +List<Nat>
  for ss: +List<Access.Session>
  for now: Nat
  {Access.renew.checked(True{}, Access.State{b, h, e, u, q, ss}, now) == Access.State{b, h, e, Nat.add(now, Access.heartbeat_timeout()), q, ss} : Access.State}

# A deferred pause keeps the current positive grant, including its epoch/deadline.
law pause_after_keeps_grant:
  for m: Access.Mode
  for h: Nat
  for e: Nat
  for u: Nat
  for q: +List<Nat>
  for ss: +List<Access.Session>
  {Access.pause_after(Access.State{m, 1n+h, e, u, q, ss}) == Access.State{Access.PauseAfter{}, 1n+h, e, u, q, ss} : Access.State}

law pause_after_empty_pauses:
  for m: Access.Mode
  for e: Nat
  for u: Nat
  for q: +List<Nat>
  for ss: +List<Access.Session>
  {Access.pause_after(Access.State{m, 0n, e, u, q, ss}) == Access.State{Access.Paused{}, 0n, e, 0n, q, ss} : Access.State}

# No scheduler path may hand a pending grant to another session.
law pending_schedule_keeps_grant:
  for h: Nat
  for e: Nat
  for u: Nat
  for q: +List<Nat>
  for ss: +List<Access.Session>
  for now: Nat
  {Access.schedule(Access.State{Access.PauseAfter{}, 1n+h, e, u, q, ss}, now) == Access.State{Access.PauseAfter{}, 1n+h, e, u, q, ss} : Access.State}

law pending_end_pauses:
  for h: Nat
  for e: Nat
  for u: Nat
  for q: +List<Nat>
  for ss: +List<Access.Session>
  {Access.clear(Access.State{Access.PauseAfter{}, h, e, u, q, ss}) == Access.State{Access.Paused{}, 0n, e, 0n, q, ss} : Access.State}

law pending_release_pauses:
  for h: Nat
  for e: Nat
  for u: Nat
  for q: +List<Nat>
  for ss: +List<Access.Session>
  {Access.release.checked(True{}, Access.State{Access.PauseAfter{}, h, e, u, q, ss}) == Access.State{Access.Paused{}, 0n, e, 0n, q, ss} : Access.State}

# Cancelling Pause after does not replace a still-held grant or renew its clock.
law allow_pending_keeps_grant:
  for h: Nat
  for e: Nat
  for u: Nat
  for q: +List<Nat>
  for ss: +List<Access.Session>
  for now: Nat
  {Access.allow(Access.State{Access.PauseAfter{}, 1n+h, e, u, q, ss}, now) == Access.State{Access.Allowed{}, 1n+h, e, u, q, ss} : Access.State}
