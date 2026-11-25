# Audio validation · 0.3.0

Checked on 25 November 2026 in desktop Chrome on Windows. These results concern local-file audio, not YouTube mixing or a physical mobile device.

## Actual rendered audio

`lib/audio-render-check.mjs` renders the real engine through `OfflineAudioContext`. It does not mock the audio output.

- Original 120/126 BPM pulse fixtures overlap for 7.5 seconds.
- Output PCM contains only A before the overlap, both A and B during it, and only B after the fade.
- Measured beat-onset difference: at most 1.292 ms for these fixtures.
- A 600 Hz low-pass filter attenuates the 6 kHz test tone by approximately 44.16 dB.
- Echo creates output during the dry fixture's silence, arrives at its configured 200 ms delay, and decays on repetition.
- All eight output checks passed.

## Actual browser file flow

The production web bundle was exercised with three original WAV files at 120, 126, and 124 BPM, lasting 18, 20, and 22 seconds. The test used real `File` selection, metadata loading, decoding, analysis workers, and a physical first Play click.

All 12 browser checks passed, including both overlapping transitions before track end, continuous playback positions when B and C become current, queue completion, moving/frozen curve pixels, a 390 px layout without horizontal overflow, and Stop cancelling a delayed resume continuation.

## Other checks and limits

All 64 unit tests, syntax checks, the web build, and Android/iOS asset synchronization passed. Synchronization is not native compilation or store submission.

These synthesized fixtures do not establish mixing quality or tempo-analysis accuracy for arbitrary music. Playback-rate changes also change pitch. Physical iPhone/Android playback, native file selection, and musical listening evaluation remain unverified.
