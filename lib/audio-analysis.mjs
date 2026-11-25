// PCM-only analysis. YouTube iframe audio is never an input to this module.
// Analyze decoded channels from an AudioBuffer, not compressed bytes or a URL.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function pulsePhase(onsets, period) {
  let x = 0, y = 0, weight = 0;
  for (const onset of onsets) {
    const angle = onset.time / period * Math.PI * 2;
    x += Math.cos(angle) * onset.weight;
    y += Math.sin(angle) * onset.weight;
    weight += onset.weight;
  }
  const angle = Math.atan2(y, x);
  return { phase: ((angle / (Math.PI * 2) + 1) % 1) * period, coherence: weight ? Math.hypot(x, y) / weight : 0 };
}

function refinePeriod(onsets, initialPeriod, minPeriod, maxPeriod) {
  let period = initialPeriod;
  for (let iteration = 0; iteration < 2; iteration++) {
    const { phase } = pulsePhase(onsets, period);
    const aligned = onsets.map(onset => ({ ...onset, beat: Math.round((onset.time - phase) / period) }))
      .filter(onset => Math.abs(onset.time - (phase + onset.beat * period)) < period * .2);
    if (aligned.length < 4) break;
    const sum = aligned.reduce((a, onset) => {
      const w = onset.weight;
      a.w += w; a.x += w * onset.beat; a.y += w * onset.time;
      a.xx += w * onset.beat ** 2; a.xy += w * onset.beat * onset.time;
      return a;
    }, { w: 0, x: 0, y: 0, xx: 0, xy: 0 });
    const denominator = sum.w * sum.xx - sum.x ** 2;
    if (denominator <= 0) break;
    const fitted = (sum.w * sum.xy - sum.x * sum.y) / denominator;
    if (!Number.isFinite(fitted) || Math.abs(fitted / period - 1) > .05) break;
    period = clamp(fitted, minPeriod, maxPeriod);
  }
  return period;
}

/**
 * @param {{channels: Array<Float32Array|Float64Array|number[]>, sampleRate:number}} pcm
 * @param {{peakCount?:number, minBpm?:number, maxBpm?:number}} options
 * @returns {{duration:number,sampleRate:number,bpm:number|null,beatOffset:number|null,
 * beatInterval:number|null,confidence:number,peaks:Float32Array,reason:string}}
 * peaks are actual per-bucket absolute amplitudes, clamped to 0..1.
 * beatOffset is the first detected beat-grid point in source-file seconds.
 * Tempo is an onset-based estimate, not a claim of musical downbeat detection.
 * Silence, steady audio, and unclear pulses return null tempo/phase, never a default BPM.
 */
export function analyzeAudio({ channels, sampleRate } = {}, { peakCount = 180, minBpm = 60, maxBpm = 180 } = {}) {
  if (!Array.isArray(channels) || !channels.length || channels.some(channel => !channel || typeof channel.length !== 'number')) throw new TypeError('Decoded PCM channels are required.');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be positive.');
  const length = channels[0].length;
  if (!Number.isSafeInteger(length) || length < 0 || channels.some(channel => channel.length !== length)) throw new RangeError('PCM channels must have equal lengths.');
  if (!Number.isInteger(peakCount) || peakCount < 1 || peakCount > 4096) throw new RangeError('peakCount must be between 1 and 4096.');
  if (!Number.isFinite(minBpm) || !Number.isFinite(maxBpm) || minBpm < 60 || maxBpm > 180 || minBpm >= maxBpm) throw new RangeError('Tempo bounds must fit within 60–180 BPM.');
  const peaks = new Float32Array(peakCount);
  const base = { duration: length / sampleRate, sampleRate, bpm: null, beatOffset: null, beatInterval: null, confidence: 0, peaks };
  if (!length) return { ...base, reason: 'empty' };

  // One scan of PCM; all subsequent rhythm work runs at no more than 200 Hz.
  // Sum channel energies rather than samples so antiphase stereo does not cancel.
  const blockSize = Math.max(1, Math.ceil(sampleRate / 200));
  const envelopeRate = sampleRate / blockSize;
  const envelope = new Float64Array(Math.ceil(length / blockSize));
  let totalEnergy = 0, maxEnergy = 0;
  for (let block = 0; block < envelope.length; block++) {
    const start = block * blockSize, end = Math.min(length, start + blockSize);
    let sum = 0;
    for (let index = start; index < end; index++) {
      let peak = 0;
      for (const channel of channels) {
        const sample = Number.isFinite(channel[index]) ? channel[index] : 0;
        sum += sample * sample; peak = Math.max(peak, Math.abs(sample));
      }
      const bucket = Math.min(peakCount - 1, Math.floor(index * peakCount / length));
      peaks[bucket] = Math.max(peaks[bucket], Math.min(1, peak));
    }
    totalEnergy += sum;
    envelope[block] = Math.sqrt(sum / ((end - start) * channels.length));
    maxEnergy = Math.max(maxEnergy, envelope[block]);
  }
  if (Math.sqrt(totalEnergy / (length * channels.length)) < 1e-6 || maxEnergy < 1e-5) return { ...base, reason: 'silence' };
  if (base.duration < 2) return { ...base, reason: 'too-short' };

  const flux = new Float64Array(envelope.length);
  let mean = 0, maxFlux = 0;
  for (let index = 0; index < flux.length; index++) {
    flux[index] = Math.max(0, envelope[index] - (index ? envelope[index - 1] : 0));
    mean += flux[index]; maxFlux = Math.max(maxFlux, flux[index]);
  }
  mean /= flux.length;
  if (maxFlux < maxEnergy * .015) return { ...base, reason: 'no-clear-pulse' };
  for (let index = 0; index < flux.length; index++) flux[index] = Math.max(0, flux[index] - mean * .35);
  const onset = new Float64Array(flux.length);
  let sum = 0, sumSquares = 0;
  for (let index = 0; index < flux.length; index++) {
    onset[index] = (flux[index - 1] || 0) * .25 + flux[index] * .5 + (flux[index + 1] || 0) * .25;
    sum += onset[index]; sumSquares += onset[index] ** 2;
  }
  const average = sum / onset.length;
  const threshold = average + Math.sqrt(Math.max(0, sumSquares / onset.length - average ** 2)) * .6;
  const onsets = [];
  for (let index = 0; index < onset.length; index++) {
    if (onset[index] < threshold || onset[index] <= (onset[index - 1] || 0) || onset[index] < (onset[index + 1] || 0)) continue;
    let mass = 0, position = 0;
    for (let at = Math.max(0, index - 1); at <= Math.min(flux.length - 1, index + 1); at++) { mass += flux[at]; position += at * flux[at]; }
    const candidate = { time: (mass ? position / mass : index) / envelopeRate, weight: onset[index] };
    const previous = onsets.at(-1);
    if (previous && candidate.time - previous.time < .12) {
      if (candidate.weight > previous.weight) onsets[onsets.length - 1] = candidate;
    } else onsets.push(candidate);
  }
  if (onsets.length < 4) return { ...base, reason: 'not-enough-onsets' };

  const minPeriod = 60 / maxBpm, maxPeriod = 60 / minBpm;
  const firstLag = Math.max(2, Math.floor(minPeriod * envelopeRate) - 1);
  const lastLag = Math.min(onset.length - 2, Math.ceil(maxPeriod * envelopeRate) + 1);
  const scores = new Float64Array(lastLag + 1);
  const energy = new Float64Array(onset.length + 1);
  for (let index = 0; index < onset.length; index++) energy[index + 1] = energy[index] + onset[index] ** 2;
  for (let lag = firstLag; lag <= lastLag; lag++) {
    let correlation = 0;
    for (let index = lag; index < onset.length; index++) correlation += onset[index] * onset[index - lag];
    const denominator = Math.sqrt((energy[onset.length] - energy[lag]) * energy[onset.length - lag]);
    scores[lag] = denominator ? correlation / denominator : 0;
  }
  const candidates = [];
  for (let lag = firstLag + 1; lag < lastLag; lag++) {
    if (scores[lag] >= scores[lag - 1] && scores[lag] >= scores[lag + 1]) candidates.push(lag);
  }
  if (!candidates.length) return { ...base, reason: 'no-clear-pulse' };
  const bestScore = Math.max(...candidates.map(lag => scores[lag]));
  const background = median(Array.from(scores.slice(firstLag, lastLag + 1)));
  let best = null;
  // Integer-lag correlation can favor a two-beat multiple when the true period
  // falls between envelope samples. Compare beat-phase coherence as well, so
  // alternating phases at that multiple do not masquerade as the actual pulse.
  for (const lag of candidates.filter(candidate => scores[candidate] >= bestScore * .7)) {
    const curvature = scores[lag - 1] - 2 * scores[lag] + scores[lag + 1];
    const interpolation = curvature ? clamp(.5 * (scores[lag - 1] - scores[lag + 1]) / curvature, -.5, .5) : 0;
    const initialPeriod = clamp((lag + interpolation) / envelopeRate, minPeriod, maxPeriod);
    const period = refinePeriod(onsets, initialPeriod, minPeriod, maxPeriod);
    const { phase, coherence } = pulsePhase(onsets, period);
    const prominence = clamp((scores[lag] - background) / Math.max(1e-9, 1 - background), 0, 1);
    const aligned = onsets.filter(item => Math.abs(item.time - (phase + Math.round((item.time - phase) / period) * period)) <= period * .15);
    const support = Math.min(1, aligned.length / 8);
    const confidence = clamp((prominence * .65 + coherence * .35) * support, 0, 1);
    if (prominence < .18 || coherence < .22 || aligned.length < 4 || confidence < .35 || aligned.at(-1).time - aligned[0].time < period * 2.5) continue;
    const firstBeat = phase + Math.round((aligned[0].time - phase) / period) * period;
    if (!best || confidence > best.confidence) best = { bpm: 60 / period, beatOffset: Math.max(0, firstBeat), beatInterval: period, confidence };
  }
  return best ? { ...base, ...best, reason: 'estimated' } : { ...base, reason: 'no-clear-pulse' };
}
