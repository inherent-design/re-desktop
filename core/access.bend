import Base

type Session is Data:
  Session{id: Nat, until: Nat, online: Bool}

type State is Data:
  State{blocked: Bool, holder: Nat, epoch: Nat, until: Nat, queue: +List<Nat>, sessions: +List<Session>}

type Light is Data:
  Available{}
  Blocked{}
  InUse{}

# Agent heartbeat window, independent of transport presence and reconnect grace.
def heartbeat_timeout() -> Nat:
  900000n

def initial(blocked: Bool) -> State:
  State{blocked, 0n, 0n, 0n, [], []}

def holder(s: State) -> Nat:
  State{b, h, e, u, q, ss} = s
  h

def blocked(s: State) -> Bool:
  State{b, h, e, u, q, ss} = s
  b

def light.free(h: Nat) -> Light:
  match h:
    case 0n:
      Available{}
    case 1n+p:
      InUse{}

def light(s: State) -> Light:
  match s:
    case State{True{}, h, e, u, q, ss}:
      Blocked{}
    case State{False{}, h, e, u, q, ss}:
      light.free(h)

def contains(xs: +List<Nat>, +id: Nat) -> Bool:
  match xs:
    case Nil{}:
      False{}
    case Con{h, t}:
      Bool.or(Nat.is_eq(h, id), contains(t, id))

def remove(xs: +List<Nat>, +id: Nat) -> +List<Nat>:
  match xs:
    case Nil{}:
      []
    case Con{+h, t}:
      +rest = remove(t, id)
      Bool.pick(+List<Nat>, Nat.is_eq(h, id), rest, h <> rest)

def touch(xs: +List<Session>, +id: Nat, +until: Nat, +online: Bool) -> +List<Session>:
  match xs:
    case Nil{}:
      [Session{id, until, online}]
    case Con{Session{+h, +u, +o}, +t}:
      Bool.pick(+List<Session>, Nat.is_eq(h, id), Session{id, until, online} <> t, Session{h, u, o} <> touch(t, id, until, online))

def live(xs: +List<Session>, +now: Nat) -> +List<Session>:
  match xs:
    case Nil{}:
      []
    case Con{Session{+h, +u, +o}, t}:
      +rest = live(t, now)
      Bool.pick(+List<Session>, Nat.is_gt(u, now), Session{h, u, o} <> rest, rest)

def exists(xs: +List<Session>, +id: Nat) -> Bool:
  match xs:
    case Nil{}:
      False{}
    case Con{Session{h, u, o}, t}:
      Bool.or(Nat.is_eq(h, id), exists(t, id))

def online(xs: +List<Session>, +id: Nat) -> Bool:
  match xs:
    case Nil{}:
      False{}
    case Con{Session{+h, u, o}, t}:
      Bool.pick(Bool, Nat.is_eq(h, id), o, online(t, id))

def trim(xs: +List<Nat>, +ss: +List<Session>) -> +List<Nat>:
  match xs:
    case Nil{}:
      []
    case Con{+h, t}:
      +rest = trim(t, ss)
      Bool.pick(+List<Nat>, exists(ss, h), h <> rest, rest)

def grant(ok: Bool, +h: Nat, e: Nat, now: Nat, t: +List<Nat>, ss: +List<Session>) -> State:
  match ok:
    case False{}:
      State{False{}, 0n, e, 0n, h <> t, ss}
    case True{}:
      State{False{}, h, 1n+e, Nat.add(now, heartbeat_timeout()), t, ss}

def schedule(s: State, now: Nat) -> State:
  match s:
    case State{True{}, h, e, u, q, ss}:
      State{True{}, 0n, e, 0n, q, ss}
    case State{False{}, 0n, e, u, Nil{}, ss}:
      State{False{}, 0n, e, 0n, [], ss}
    case State{False{}, 0n, e, u, Con{+h, t}, +ss}:
      grant(online(ss, h), h, e, now, t, ss)
    case State{False{}, 1n+h, e, u, q, ss}:
      State{False{}, 1n+h, e, u, q, ss}

def expire(s: State, +now: Nat, +ss: +List<Session>) -> State:
  State{b, +h, e, +u, q, old} = s
  valid = Bool.and(Nat.is_gt(u, now), exists(ss, h))
  State{b, Bool.pick(Nat, valid, h, 0n), e, u, trim(q, ss), ss}

def advance(+s: State, +now: Nat) -> State:
  State{b, h, e, u, q, ss} = s
  schedule(expire(s, now, live(ss, now)), now)

def presence(s: State, id: Nat, now: Nat, online: Bool) -> State:
  State{b, h, e, u, q, ss} = s
  State{b, h, e, u, q, touch(ss, id, Nat.add(now, 30000n), online)}

# A confirmed connection loss ends access immediately. Identity/queue grace
# remains available for reconnection, but the old access cannot be resumed.
def disconnect(s: State, +id: Nat, now: Nat) -> State:
  State{b, +h, e, u, q, ss} = s
  State{b, Bool.pick(Nat, Nat.is_eq(h, id), 0n, h), e, u, q, touch(ss, id, Nat.add(now, 30000n), False{})}

def block(s: State) -> State:
  State{b, h, e, u, q, ss} = s
  State{True{}, 0n, e, 0n, q, ss}

def allow(s: State, now: Nat) -> State:
  State{b, h, e, u, q, ss} = s
  schedule(State{False{}, h, e, u, q, ss}, now)

def take.add(s: State, +id: Nat, wait: Bool) -> State:
  State{+b, +h, e, u, +q, +ss} = s
  busy = Bool.or(Nat.is_ne(h, 0n), Bool.or(b, Nat.is_ne(List.length(&2, Nat, q), 0n)))
  eligible = Bool.and(online(ss, id), Bool.and(Nat.is_ne(h, id), Bool.not(contains(q, id))))
  append = Bool.and(eligible, Bool.or(wait, Bool.not(busy)))
  next = Bool.pick(+List<Nat>, append, List.append(&2, Nat, q, [id]), q)
  State{b, h, e, u, next, ss}

def take(s: State, id: Nat, wait: Bool, now: Nat) -> State:
  schedule(take.add(s, id, wait), now)

def matches(s: State, id: Nat, epoch: Nat) -> Bool:
  State{b, h, e, u, q, ss} = s
  Bool.and(Nat.is_eq(h, id), Nat.is_eq(e, epoch))

def release.checked(ok: Bool, s: State) -> State:
  match ok:
    case False{}:
      s
    case True{}:
      State{b, h, e, u, q, ss} = s
      State{b, 0n, e, 0n, q, ss}

def release(+s: State, id: Nat, epoch: Nat) -> State:
  release.checked(matches(s, id, epoch), s)

def renew.checked(ok: Bool, s: State, now: Nat) -> State:
  match ok:
    case False{}:
      s
    case True{}:
      State{b, h, e, u, q, ss} = s
      State{b, h, e, Nat.add(now, heartbeat_timeout()), q, ss}

def renew(+s: State, id: Nat, epoch: Nat, now: Nat) -> State:
  renew.checked(matches(s, id, epoch), s, now)

def cancel(s: State, id: Nat) -> State:
  State{b, h, e, u, q, ss} = s
  State{b, h, e, u, remove(q, id), ss}

def forget.sessions(xs: +List<Session>, +id: Nat) -> +List<Session>:
  match xs:
    case Nil{}:
      []
    case Con{Session{+h, u, o}, t}:
      +rest = forget.sessions(t, id)
      Bool.pick(+List<Session>, Nat.is_eq(h, id), rest, Session{h, u, o} <> rest)

def forget(s: State, +id: Nat) -> State:
  State{b, +h, e, u, q, ss} = s
  State{b, Bool.pick(Nat, Nat.is_eq(h, id), 0n, h), e, u, remove(q, id), forget.sessions(ss, id)}
