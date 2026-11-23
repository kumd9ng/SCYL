/** Sequential volume fades only; no overlapping players or beat matching. */
export const TRANSITION_MODES = Object.freeze({
  gentle: Object.freeze({ fadeOut: 5, fadeIn: 5 }),
  balanced: Object.freeze({ fadeOut: 3, fadeIn: 3 }),
  quick: Object.freeze({ fadeOut: 1.2, fadeIn: 1.2 }),
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Cosine easing from silence to full gain; invalid progress starts at zero. */
export function fadeGain(progress) {
  const safeProgress = typeof progress === 'number' && !Number.isNaN(progress)
    ? clamp(progress, 0, 1) : 0;
  return (1 - Math.cos(Math.PI * safeProgress)) / 2;
}

/** Start a fade only during valid, active playback with a queued next track. */
export function shouldStartTransition({ currentTime, duration, fadeOut, hasNext, playing } = {}) {
  if (!hasNext || !playing
    || !Number.isFinite(currentTime) || currentTime < 0
    || !Number.isFinite(duration) || duration <= 0
    || !Number.isFinite(fadeOut) || fadeOut <= 0) return false;
  const remaining = duration - currentTime;
  return remaining > 0 && remaining <= fadeOut;
}

/** Return normalized volume gain for one fade, always bounded by 0 and 1. */
export function gainForFade({ elapsed, duration, from, to } = {}) {
  const start = typeof from === 'number' && !Number.isNaN(from) ? clamp(from, 0, 1) : 0;
  const end = typeof to === 'number' && !Number.isNaN(to) ? clamp(to, 0, 1) : 0;
  // Invalid clocks cannot advance a fade. A finite nonpositive duration is instant.
  if (!Number.isFinite(duration)) return start;
  if (duration <= 0) return end;
  const progress = typeof elapsed === 'number' && !Number.isNaN(elapsed)
    ? elapsed / duration : 0;
  return start + (end - start) * fadeGain(progress);
}
