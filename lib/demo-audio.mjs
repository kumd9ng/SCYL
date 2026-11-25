// Original synthesized audio for exercising the engine, never YouTube audio.
export function createDemoAudio({ bpm = 120, duration = 32, sampleRate = 22050, phase = .08, voice = 0 } = {}) {
  if (![bpm, duration, sampleRate, phase].every(Number.isFinite) || bpm < 60 || bpm > 180 || duration < 8 || duration > 60 || sampleRate < 8000 || sampleRate > 48000 || phase < 0 || phase >= 60 / bpm) {
    throw new RangeError('Invalid demo audio parameters');
  }
  const channel = new Float32Array(Math.ceil(duration * sampleRate));
  const beat = 60 / bpm;
  const notes = voice ? [65.406, 77.782, 87.307, 77.782] : [55, 65.406, 73.416, 65.406];
  let noise = 123456 + voice;
  for (let i = 0; i < channel.length; i++) {
    const time = i / sampleRate;
    const local = time - phase;
    if (local < 0) continue;
    const step = Math.floor(local / beat);
    const inBeat = local - step * beat;
    const half = local % (beat / 2);
    noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
    const kick = .56 * Math.exp(-inBeat * 24) * Math.sin(2 * Math.PI * (49 * inBeat + 1.9 * (1 - Math.exp(-inBeat * 38))));
    const hat = .027 * Math.exp(-half * 95) * (noise / 2147483648 - 1);
    const bass = .06 * Math.exp(-inBeat * 5) * Math.sin(2 * Math.PI * notes[Math.floor(step / 4) % notes.length] * local);
    const tone = .025 * Math.sin(2 * Math.PI * (voice ? 392 : 329.628) * local) * Math.exp(-(local % (beat * 2)) * 2);
    const edge = Math.min(1, Math.max(0, (duration - time) / .08));
    channel[i] = (kick + hat + bass + tone) * edge;
  }
  return { channels: [channel], sampleRate, duration: channel.length / sampleRate };
}
