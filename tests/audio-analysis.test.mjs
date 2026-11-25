import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAudio } from '../lib/audio-analysis.mjs';

function clickTrack(bpm, { duration = 24, offset = .137, sampleRate = 8000, amplitude = .8 } = {}) {
  const pcm = new Float32Array(Math.round(duration * sampleRate));
  for (let beat = offset; beat < duration; beat += 60 / bpm) {
    const start = Math.round(beat * sampleRate);
    for (let sample = 0; sample < Math.round(sampleRate * .018) && start + sample < pcm.length; sample++) {
      const time = sample / sampleRate;
      pcm[start + sample] += amplitude * Math.exp(-time / .004) * Math.sin(2 * Math.PI * 880 * time);
    }
  }
  return { channels: [pcm], sampleRate };
}

test('estimates tempo and nonzero beat phase from actual percussive PCM', () => {
  for (const bpm of [60, 84, 120, 137, 174, 180]) {
    const result = analyzeAudio(clickTrack(bpm));
    assert.equal(result.reason, 'estimated', `${bpm} BPM: ${JSON.stringify({ ...result, peaks: undefined })}`);
    assert.ok(Math.abs(result.bpm - bpm) < .8, `expected ${bpm}, got ${result.bpm}`);
    assert.ok(Math.abs(result.beatOffset - .137) < .025, `phase at ${bpm} BPM: ${result.beatOffset}`);
    assert.ok(result.confidence > .6, `confidence at ${bpm} BPM: ${result.confidence}`);
    assert.equal(result.duration, 24);
    assert.equal(result.sampleRate, 8000);
    assert.equal(result.peaks.length, 180);
    assert.ok(result.peaks.some(peak => peak > .5));
  }
});

test('phase follows a different source offset and skips an actual silent intro', () => {
  const first = analyzeAudio(clickTrack(120, { offset: .09 }));
  const later = analyzeAudio(clickTrack(120, { offset: 1.31 }));
  assert.ok(Math.abs(first.beatOffset - .09) < .025);
  assert.ok(Math.abs(later.beatOffset - 1.31) < .025);
  assert.ok(Math.abs(first.bpm - later.bpm) < .1);
});

test('stereo energy analysis does not cancel opposite-polarity channels', () => {
  const pcm = clickTrack(100, { sampleRate: 11025 });
  const opposite = Float32Array.from(pcm.channels[0], sample => -sample);
  const result = analyzeAudio({ channels: [pcm.channels[0], opposite], sampleRate: pcm.sampleRate });
  assert.ok(Math.abs(result.bpm - 100) < .8);
  assert.ok(result.confidence > .6);
  assert.ok(result.peaks.some(peak => peak > .5));
});

test('silence and empty PCM report unknown tempo with real zero waveform', () => {
  for (const length of [0, 160000]) {
    const result = analyzeAudio({ channels: [new Float32Array(length)], sampleRate: 8000 });
    assert.equal(result.bpm, null);
    assert.equal(result.beatInterval, null);
    assert.equal(result.beatOffset, null);
    assert.equal(result.confidence, 0);
    assert.ok(result.peaks.every(peak => peak === 0));
  }
});

test('steady tone and unstructured noise do not receive an invented tempo', () => {
  const sampleRate = 8000, length = sampleRate * 16;
  const tone = Float32Array.from({ length }, (_, index) => .4 * Math.sin(index / sampleRate * Math.PI * 2 * 440));
  let seed = 12345;
  const noise = Float32Array.from({ length }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed / 4294967296 - .5) * .2; });
  for (const channel of [tone, noise]) {
    const result = analyzeAudio({ channels: [channel], sampleRate });
    assert.equal(result.bpm, null, `unstructured signal reported ${result.bpm} BPM (${result.confidence})`);
    assert.equal(result.beatOffset, null);
    assert.ok(result.peaks.some(peak => peak > 0));
  }
});

test('waveform peaks preserve amplitude and analysis rejects malformed input', () => {
  const result = analyzeAudio({ channels: [new Float32Array([.2, -.7, .1, -.4])], sampleRate: 8000 }, { peakCount: 2 });
  assert.ok(Math.abs(result.peaks[0] - .7) < 1e-6);
  assert.ok(Math.abs(result.peaks[1] - .4) < 1e-6);
  assert.equal(result.bpm, null);
  assert.throws(() => analyzeAudio({ channels: [], sampleRate: 8000 }), /channels/);
  assert.throws(() => analyzeAudio({ channels: [new Float32Array(2), new Float32Array(3)], sampleRate: 8000 }), /equal lengths/);
  assert.throws(() => analyzeAudio({ channels: [new Float32Array(2)], sampleRate: 0 }), /sampleRate/);
});
