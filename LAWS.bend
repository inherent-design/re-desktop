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
  {Access.holder(Access.schedule(Access.State{True{}, h, e, u, q, ss}, now)) == 0n : Nat}

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
  {Access.grant(True{}, h, e, now, t, ss) == Access.State{False{}, h, 1n+e, Nat.add(now, Access.heartbeat_timeout()), t, ss} : Access.State}

# An accepted renewal starts a fresh heartbeat window, with no maximum total hold.
law heartbeat_renews:
  for b: Bool
  for h: Nat
  for e: Nat
  for u: Nat
  for q: +List<Nat>
  for ss: +List<Access.Session>
  for now: Nat
  {Access.renew.checked(True{}, Access.State{b, h, e, u, q, ss}, now) == Access.State{b, h, e, Nat.add(now, Access.heartbeat_timeout()), q, ss} : Access.State}
