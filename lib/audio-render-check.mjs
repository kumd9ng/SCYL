import { analyzeAudio } from './audio-analysis.mjs';
import { createAudioMixEngine } from './audio-engine.mjs';

function energyIn(samples, sampleRate, start, seconds) {
  let energy = 0, count = 0;
  for (let i = Math.max(0, Math.floor(start * sampleRate)); i < Math.min(samples.length, Math.ceil((start + seconds) * sampleRate)); i++) {
    energy += samples[i] ** 2; count++;
  }
  return { energy, rms: Math.sqrt(energy / Math.max(1, count)) };
}

async function renderFxOutput(Offline, { fixture, effects, sampleRate = 24000 }) {
  // Keep the source longer than the render so engine end cleanup cannot truncate
  // the impulse's delay tail. Every sample comes through the actual engine graph.
  const context = new Offline(1, sampleRate, sampleRate);
  const buffer = context.createBuffer(1, Math.ceil(sampleRate * 1.2), sampleRate);
  fixture(buffer.getChannelData(0), sampleRate);
  const engine = createAudioMixEngine({ context, masterGain: 1 });
  try {
    engine.setTracks([{ id: 'fx-pcm-fixture', title: 'Original FX verification signal', buffer, analysis: { confidence: 0 } }]);
    engine.setFx(0, effects);
    engine.play({ fadeDuration: 0, beatmatch: false });
    const rendered = await context.startRendering();
    return rendered.getChannelData(0);
  } finally { engine.dispose(); }
}

async function verifyFxOutput(Offline, sampleRate) {
  const toneHz = 6000, cutoffHz = 600;
  const tone = (samples, rate) => { for (let i = 0; i < samples.length; i++) samples[i] = .4 * Math.sin(2 * Math.PI * toneHz * i / rate); };
  const bypass = await renderFxOutput(Offline, { sampleRate, fixture: tone, effects: { filterHz: sampleRate * .475, echo: 0 } });
  const filtered = await renderFxOutput(Offline, { sampleRate, fixture: tone, effects: { filterHz: cutoffHz, echo: 0 } });
  const bypassRms = energyIn(bypass, sampleRate, .2, .5).rms;
  const filteredRms = energyIn(filtered, sampleRate, .2, .5).rms;
  const ratio = filteredRms / Math.max(Number.EPSILON, bypassRms);

  const impulseAt = .1, delay = .2, scheduleAhead = .03;
  const impulse = (samples, rate) => { samples[Math.round(impulseAt * rate)] = .8; };
  const dry = await renderFxOutput(Offline, { sampleRate, fixture: impulse, effects: { echo: 0, echoDelay: delay, echoFeedback: .25 } });
  const echoed = await renderFxOutput(Offline, { sampleRate, fixture: impulse, effects: { echo: .4, echoDelay: delay, echoFeedback: .25 } });
  const expectedEchoAt = impulseAt + scheduleAhead + delay;
  const dryDelayedEnergy = energyIn(dry, sampleRate, expectedEchoAt - .01, .04).energy;
  const echoDelayedEnergy = energyIn(echoed, sampleRate, expectedEchoAt - .01, .04).energy;
  const secondEchoEnergy = energyIn(echoed, sampleRate, expectedEchoAt + delay - .01, .04).energy;
  let peak = 0, peakIndex = -1;
  for (let i = Math.floor((expectedEchoAt - .01) * sampleRate); i < Math.ceil((expectedEchoAt + .03) * sampleRate); i++) {
    if (Math.abs(echoed[i]) > peak) { peak = Math.abs(echoed[i]); peakIndex = i; }
  }
  const measuredEchoAt = peakIndex < 0 ? null : peakIndex / sampleRate;
  const echoTimingErrorMs = measuredEchoAt === null ? null : Math.abs(measuredEchoAt - expectedEchoAt) * 1000;
  const feedbackEnergyRatio = secondEchoEnergy / Math.max(Number.EPSILON, echoDelayedEnergy);
  return {
    checks: {
      lowpassAttenuatesActualHighFrequencyPCM: bypassRms > .1 && ratio < .08,
      echoProducesDelayedPCMWhileDryIsSilent: dryDelayedEnergy < 1e-12 && echoDelayedEnergy > 1e-6,
      echoArrivesAtConfiguredDelay: echoTimingErrorMs !== null && echoTimingErrorMs < 5,
      echoFeedbackDecays: feedbackEnergyRatio > .01 && feedbackEnergyRatio < .2,
    },
    evidence: {
      filter: { toneHz, cutoffHz, bypassRms, filteredRms, gainRatio: ratio, gainDb: 20 * Math.log10(Math.max(Number.EPSILON, ratio)) },
      echo: { impulseAt, scheduleAhead, delay, expectedEchoAt, measuredEchoAt, echoTimingErrorMs, dryDelayedEnergy, echoDelayedEnergy, secondEchoEnergy, feedbackEnergyRatio },
    },
  };
}

// Renders actual Web Audio nodes to PCM; this is not a mocked scheduler test.
export async function verifyRenderedMix() {
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Offline) throw new Error('OfflineAudioContext unavailable');
  const sampleRate = 24000;
  const context = new Offline(2, sampleRate * 15, sampleRate);
  function track(id, bpm, phase, channel) {
    const buffer = context.createBuffer(2, 32 * sampleRate, sampleRate);
    const samples = buffer.getChannelData(channel);
    for (let beat = phase; beat < 32; beat += 60 / bpm) {
      const start = Math.round(beat * sampleRate);
      for (let i = 0; i < sampleRate * .09 && start + i < samples.length; i++) samples[start + i] = .6 * Math.exp(-i / sampleRate * 60);
    }
    const analysis = analyzeAudio({ channels: [samples], sampleRate }, { peakCount: 2048 });
    return { id, title: id, buffer, analysis };
  }
  const tracks = [track('left-120', 120, .08, 0), track('right-126', 126, .13, 1)];
  const engine = createAudioMixEngine({ context, masterGain: .65 });
  engine.setTracks(tracks); engine.play({ offset: 20, fadeDuration: 8 });
  const plan = engine.snapshot().plan;
  if (!plan || plan.mode !== 'beatmatched' || plan.startTime < 1 || plan.endTime > 13) { engine.dispose(); throw new Error('Expected a scheduled beatmatched overlap: ' + JSON.stringify(plan)); }
  const rendered = await context.startRendering();
  const channels = [rendered.getChannelData(0), rendered.getChannelData(1)];
  const rms = (channel, start, length) => { let sum = 0, count = 0; for (let i = Math.floor(start * sampleRate); i < Math.min(channel.length, (start + length) * sampleRate); i++) { sum += channel[i] ** 2; count++; } return Math.sqrt(sum / Math.max(1, count)); };
  const before = channels.map(channel => rms(channel, .3, Math.min(1, plan.startTime - .5)));
  const during = channels.map(channel => rms(channel, plan.startTime + plan.fadeDuration / 2 - .4, .8));
  const after = channels.map(channel => rms(channel, plan.endTime + .15, .8));
  function peakTimes(channel) {
    const peaks = [];
    const start = Math.floor((plan.startTime + plan.fadeDuration / 2 - 1.1) * sampleRate);
    const end = Math.floor((plan.startTime + plan.fadeDuration / 2 + 1.1) * sampleRate);
    let max = 0;
    for (let i = start; i < end; i++) max = Math.max(max, Math.abs(channel[i]));
    for (let i = start; i < end; i++) if (Math.abs(channel[i]) > max * .5 && (!peaks.length || i / sampleRate - peaks.at(-1) > .3)) peaks.push(i / sampleRate);
    return peaks;
  }
  const leftBeats = peakTimes(channels[0]), rightBeats = peakTimes(channels[1]);
  const differences = leftBeats.map(left => Math.min(...rightBeats.map(right => Math.abs(left - right))));
  const maxBeatErrorMs = differences.length && rightBeats.length ? Math.max(...differences) * 1000 : Infinity;
  const checks = { firstTrackAudibleBeforeOverlap: before[0] > .005 && before[1] < .00001, bothTracksAudibleDuringOverlap: during.every(value => value > .005), firstTrackSilentAfterFade: after[0] < .0001 && after[1] > .005, measuredBeatAlignment: maxBeatErrorMs < 30 };
  engine.dispose();
  const fx = await verifyFxOutput(Offline, sampleRate);
  Object.assign(checks, fx.checks);
  const result = { kind: 'real-offline-audio-render', passed: Object.values(checks).every(Boolean), checks, maxBeatErrorMs: Number(maxBeatErrorMs.toFixed(3)), estimatedBpms: tracks.map(track => track.analysis.bpm), rate: plan.rate, overlapStart: plan.startTime, overlapEnd: plan.endTime, rms: { before, during, after }, fx: fx.evidence, youtubeAudio: false, physicalDeviceVerified: false };
  if (!result.passed) throw new Error(JSON.stringify(result));
  return result;
}
