const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const positive = value => Number.isFinite(value) && value > 0;

/** Equal-power gains for an overlap: progress 0 = outgoing, 1 = incoming. */
export function equalPowerGains(progress) {
  if (!Number.isFinite(progress)) throw new TypeError('Crossfade progress must be finite.');
  const fraction = clamp(progress, 0, 1);
  if (fraction === 0) return { outgoing: 1, incoming: 0 };
  if (fraction === 1) return { outgoing: 0, incoming: 1 };
  return { outgoing: Math.cos(fraction * Math.PI / 2), incoming: Math.sin(fraction * Math.PI / 2) };
}

/**
 * Plans decoded PCM sources, not YouTube players.
 * currentPosition / offset / outgoingPosition are source-file seconds.
 * now / startTime / endTime use the AudioContext clock; delay and fadeDuration
 * are wall-clock seconds. rate is the incoming source playbackRate.
 * beatmatched requires reliable grids, a bounded tempo adjustment, and at least
 * two beats of overlap. Otherwise the result explicitly says crossfade or cut.
 */
export function planMix({ current, next, currentPosition, now = 0, currentRate = 1, fadeDuration = 8, minConfidence = .55, minRate = .85, maxRate = 1.18 } = {}) {
  if (!current || !next || !positive(current.duration) || !positive(next.duration)) throw new RangeError('Both tracks need a positive duration.');
  if (!Number.isFinite(currentPosition) || !Number.isFinite(now) || now < 0 || !positive(currentRate)) throw new RangeError('Playback position, clock and rate must be valid.');
  if (!Number.isFinite(fadeDuration) || fadeDuration < 0 || !positive(minRate) || !positive(maxRate) || minRate > 1 || maxRate < 1 || minRate > maxRate || !Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) throw new RangeError('Invalid mix settings.');
  const position = clamp(currentPosition, 0, current.duration);
  const remaining = Math.max(0, (current.duration - position) / currentRate);
  const finish = (mode, reason, delay, offset, rate, overlap, beatPeriod = null) => {
    const startTime = now + Math.max(0, delay);
    return { mode, reason, startTime, delay: Math.max(0, delay), offset, rate, fadeDuration: overlap, endTime: startTime + overlap, outgoingPosition: clamp(position + delay * currentRate, 0, current.duration), beatPeriod };
  };
  const fallback = reason => {
    const overlap = Math.max(0, Math.min(fadeDuration, remaining, next.duration));
    return finish(overlap > 0 ? 'crossfade' : 'cut', reason, remaining - overlap, 0, 1, overlap);
  };
  if (!remaining || !fadeDuration) return fallback(!remaining ? 'outgoing-ended' : 'zero-fade');
  const reliable = track => positive(track.bpm) && track.bpm >= 60 && track.bpm <= 180 && Number.isFinite(track.beatOffset) && track.beatOffset >= 0 && track.beatOffset < track.duration && Number.isFinite(track.confidence) && track.confidence >= minConfidence;
  if (!reliable(current) || !reliable(next)) return fallback('uncertain-beat-grid');
  const rate = current.bpm * currentRate / next.bpm;
  if (rate < minRate || rate > maxRate) return fallback('tempo-ratio-out-of-range');
  const period = 60 / (current.bpm * currentRate);
  const incomingAvailable = (next.duration - next.beatOffset) / rate;
  const maximumOverlap = Math.min(fadeDuration, remaining, incomingAvailable);
  if (maximumOverlap + 1e-9 < period * 2) return fallback('not-enough-beats');

  // Start on the first outgoing beat at or after the desired overlap boundary.
  // Starting later shortens the fade rather than scheduling past the track end.
  const desiredPosition = position + Math.max(0, remaining - maximumOverlap) * currentRate;
  const sourcePeriod = 60 / current.bpm;
  const beatNumber = Math.max(0, Math.ceil((desiredPosition - current.beatOffset) / sourcePeriod - 1e-9));
  const startPosition = current.beatOffset + beatNumber * sourcePeriod;
  const delay = Math.max(0, (startPosition - position) / currentRate);
  const available = Math.min(remaining - delay, incomingAvailable, fadeDuration);
  const beats = Math.floor((available + 1e-9) / period);
  if (beats < 2 || delay > remaining) return fallback('not-enough-aligned-beats');
  const overlap = beats * period;
  return finish('beatmatched', 'aligned-beats', delay, next.beatOffset, rate, overlap, period);
}
