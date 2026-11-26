const PLAYING = 1, PAUSED = 2, BUFFERING = 3, ENDED = 0;
const clamp = value => Math.max(0, Math.min(1, value));

/** The final tenth of the playable section, excluding a link's start offset. */
export function youtubeOverlapWindow({ duration, startSeconds = 0, isLive = false } = {}) {
  if (isLive || !Number.isFinite(duration) || !Number.isFinite(startSeconds)
    || startSeconds < 0 || duration - startSeconds < 2.5) return null;
  const seconds = (duration - startSeconds) * .1;
  return { start: duration - seconds, end: duration, seconds };
}

export function youtubeOverlapGains(progress) {
  const value = clamp(Number.isFinite(progress) ? progress : 0);
  return { outgoing: value === 1 ? 0 : Math.cos(value * Math.PI / 2), incoming: Math.sin(value * Math.PI / 2) };
}

/**
 * Two real iframe players, with no playback-rate changes. All transitions are
 * driven by the outgoing media clock and confirmed incoming PLAYING state.
 * The adapter supplies current/next { key, id, slot, startSeconds } objects.
 */
export function createYouTubeOverlapController({
  context, read, start, pause, gain, reveal, promote,
  changed = () => {}, notice = () => {}, now = () => performance.now(), waitMs = 8000,
}) {
  let active = null, attempted = null, previous = null, committing = false;
  const suppressed = new Map();
  const pairKey = (current, next) => current && next ? `${current.key}:${next.key}` : null;
  const snapshot = () => active ? { ...active, outgoing: { ...active.outgoing }, incoming: { ...active.incoming } } : null;
  const matching = (item, data) => item && data && data.key === item.key
    && (!data.videoId || data.videoId === item.id);
  const eligible = ctx => ctx.allowed && !ctx.seeking && !ctx.switching;
  const report = reason => notice(reason);

  function cancel(reason = 'cancelled') {
    if (!active) return false;
    const old = active; active = null;
    suppressed.set(old.incoming.slot, old.incoming.key);
    gain(old.incoming.slot, 0);
    pause(old.incoming.slot);
    gain(old.outgoing.slot, 1);
    changed(snapshot());
    if (!['cancelled', 'seek', 'paused', 'queue-changed', 'locked'].includes(reason)) report(reason);
    return true;
  }

  function finish() {
    if (!active) return false;
    const old = active, ctx = context(), incoming = read(old.incoming.slot);
    if (!eligible(ctx) || !matching(old.incoming, incoming) || incoming.state !== PLAYING || !old.confirmed) {
      cancel('incoming-unavailable'); return false;
    }
    active = null; committing = true;
    suppressed.set(old.outgoing.slot, old.outgoing.key);
    gain(old.outgoing.slot, 0); pause(old.outgoing.slot);
    gain(old.incoming.slot, 1);
    // The host only changes ownership; it must not load/play the incoming video again.
    promote(old.outgoing, old.incoming);
    committing = false; previous = null; attempted = null;
    changed(snapshot()); report('promoted');
    return true;
  }

  function confirm() {
    if (!active || active.phase === 'mixing') return;
    const outgoing = read(active.outgoing.slot), incoming = read(active.incoming.slot);
    if (!matching(active.incoming, incoming) || incoming.state !== PLAYING) return;
    if (outgoing.state !== PLAYING && outgoing.state !== ENDED) return;
    active.confirmed = true; active.phase = 'mixing';
    active.mixStart = Math.min(active.end, Math.max(active.start, outgoing.time));
    active.progress = 0;
    changed(snapshot()); report('mixing');
    if (outgoing.state === ENDED || outgoing.time >= active.end) finish();
  }

  function tick() {
    const ctx = context(), outgoing = ctx.current && read(ctx.current.slot);
    if (!ctx.current || !matching(ctx.current, outgoing)) { cancel('queue-changed'); previous = null; return; }
    const window = youtubeOverlapWindow({ ...outgoing, startSeconds: ctx.current.startSeconds });
    const pair = pairKey(ctx.current, ctx.next), time = outgoing.time, timestamp = now();
    // Native iframe seeks have no separate seek event. A discontinuity invalidates
    // the old transition and cannot revive its delayed incoming PLAYING event.
    const elapsed = previous && previous.key === ctx.current.key ? (timestamp - previous.at) / 1000 : null;
    const jumped = elapsed !== null && Number.isFinite(time) &&
      (time < previous.time - .6 || time - previous.time > Math.max(2, elapsed + 1));
    previous = { key: ctx.current.key, time, at: timestamp };
    if (jumped) cancel('seek');
    if (window && time < window.start - .5) attempted = null;
    if (!eligible(ctx)) {
      if (active && !ctx.allowed) pause(active.outgoing.slot);
      cancel(ctx.seeking ? 'seek' : 'locked'); return;
    }
    if (active) {
      if (pair !== active.pair || !window || Math.abs(window.end - active.end) > .5) { cancel('queue-changed'); return; }
      const incoming = read(active.incoming.slot);
      if (!matching(active.incoming, incoming) || incoming.failed) { cancel('incoming-unavailable'); return; }
      if (outgoing.failed || outgoing.state === PAUSED || outgoing.state === BUFFERING) {
        cancel(outgoing.failed ? 'outgoing-error' : 'paused'); return;
      }
      if (incoming.state === PLAYING) confirm();
      if (!active) return;
      if (incoming.state === ENDED || incoming.state === PAUSED && active.confirmed) { cancel('incoming-unavailable'); return; }
      if (incoming.state !== PLAYING) {
        if (active.phase === 'mixing') {
          active.phase = 'waiting'; active.waitStarted = timestamp; active.progress = 0;
          gain(active.outgoing.slot, 1); gain(active.incoming.slot, 0); changed(snapshot());
        }
        if (timestamp - active.waitStarted >= waitMs || outgoing.state === ENDED || time >= active.end) cancel('incoming-timeout');
        return;
      }
      if (outgoing.state === ENDED || time >= active.end) { finish(); return; }
      if (outgoing.state !== PLAYING) return;
      const span = active.end - active.mixStart;
      active.progress = span > 0 ? clamp((time - active.mixStart) / span) : 1;
      const gains = youtubeOverlapGains(active.progress);
      gain(active.outgoing.slot, gains.outgoing); gain(active.incoming.slot, gains.incoming);
      changed(snapshot());
      return;
    }
    if (jumped || !window || !ctx.next || ctx.next.key === ctx.current.key || attempted === pair
      || outgoing.state !== PLAYING || outgoing.failed || !Number.isFinite(time)
      || time < window.start || time >= window.end - .05) return;
    const incoming = read(ctx.next.slot);
    if (!matching(ctx.next, incoming) || !incoming.ready || incoming.failed || ctx.next.slot === ctx.current.slot) return;
    attempted = pair;
    active = { pair, outgoing: { ...ctx.current }, incoming: { ...ctx.next },
      start: window.start, end: window.end, mixStart: time, progress: 0,
      phase: 'waiting', confirmed: false, waitStarted: timestamp };
    suppressed.delete(ctx.next.slot);
    gain(ctx.current.slot, 1); gain(ctx.next.slot, 0);
    changed(snapshot());
    try {
      if (!reveal(ctx.current.slot, ctx.next.slot)) { cancel('not-visible'); return; }
      report('waiting'); start(ctx.next.slot, ctx.next);
    } catch { cancel('incoming-unavailable'); }
  }

  function state(slot, value) {
    if (committing) return true;
    const ctx = context(), data = read(slot);
    // Ignore stale events whose reported state is no longer the player's state.
    if (value !== data.state) return true;
    if (value === PLAYING && !eligible(ctx)) {
      cancel('locked'); pause(slot); return true;
    }
    const expected = ctx.current?.slot === slot ? ctx.current : ctx.next?.slot === slot ? ctx.next : null;
    if (value === PLAYING && (!expected || !matching(expected, data))) {
      pause(slot); return true;
    }
    if (value === PLAYING && suppressed.get(slot) === data.key) {
      gain(slot, 0); pause(slot); return true;
    }
    if (!active) {
      // A blocked/failed attempt gets no automatic second play request at EOF.
      if (value === ENDED && ctx.current?.slot === slot && attempted === pairKey(ctx.current, ctx.next) && attempted) {
        report('ended-unavailable'); return true;
      }
      return false;
    }
    if (slot === active.incoming.slot) {
      if (value === PLAYING) confirm();
      else if (value === PAUSED && active.confirmed || value === ENDED) cancel('incoming-unavailable');
      else if (value === BUFFERING && active.phase === 'mixing') {
        active.phase = 'waiting'; active.waitStarted = now(); active.progress = 0;
        gain(active.outgoing.slot, 1); gain(slot, 0); changed(snapshot()); report('waiting');
      }
      return true;
    }
    if (slot === active.outgoing.slot) {
      if (value === ENDED) {
        if (!finish()) report('ended-unavailable');
        return true;
      }
      if (value === PAUSED || value === BUFFERING) cancel('paused');
      if (value === PLAYING) return true;
    }
    return false;
  }

  return {
    tick, state, cancel, snapshot,
    blocked(slot) { if (active?.incoming.slot !== slot) return false; cancel('autoplay-blocked'); return true; },
    failure(slot) {
      if (!active || ![active.incoming.slot, active.outgoing.slot].includes(slot)) return false;
      const incoming = slot === active.incoming.slot;
      cancel(incoming ? 'incoming-unavailable' : 'outgoing-error'); return incoming;
    },
    release(slot) { suppressed.delete(slot); },
    reset() { cancel(); attempted = null; previous = null; },
    finish,
  };
}
