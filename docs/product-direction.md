# Product direction

**SCYL — Songs Change Your Life.**

SCYL is intended to make a personal set feel connected from one song to the next. Version 0.3 provides two source modes: YouTube links for official-player listening sets, and local audio files for direct audio processing. The interface is portrait, with two large circular dials stacked vertically.

## Web and installed apps

The product has two parallel delivery targets: a website used directly in a browser, and installed iOS/Android apps. Browser use must not require installing SCYL, joining TestFlight, or having a developer account. Native packaging must not replace or postpone the working web version.

Both targets share the same player, local-file analysis, automatic mixing, waveform transport, and FX code. New playback changes must be checked in the browser and included in the native bundle. Native compilation and physical-device playback remain separate checks. The hosted preview keeps its existing required login; changing delivery targets does not authorize removing authentication or widening access.

## Current design

The upper dial represents the current track; the lower dial represents the next. In YouTube mode, the dials show video thumbnails after connection consent, and their **fx** buttons explain source limitations. In local-file mode, the controls apply a low-pass filter and echo to decoded audio.

Local-file mode displays waveform peaks calculated from the selected audio's PCM, scrolling with playback position. The former static waveform illustration has been removed from the YouTube screen. A source-mode link lets the listener choose the appropriate playback path.

The visual identity uses an off-white surface, charcoal controls, and an orange indicator. The original logo contains only a circular dial and an orange point. The name and **Songs Change Your Life.** are separate text, with no additional catchphrase.

## YouTube listening sets

- Add individual YouTube video URLs and supported start-time parameters.
- Arrange, restore, repeat, and export a local listening set.
- Play through the visible official YouTube player.
- Seek with the upper dial's rim or keyboard controls. There is no separate SCYL seek bar.
- Transition sequentially; use volume fades only where the player supports them.
- Pause when the app is no longer in the foreground.

The YouTube set is stored locally. Its 14-track first-set counter is informational; no payment or usage gate is enforced. Configured builds use the same email identity as MEOW. Cloud sets, advertisements supplied by SCYL, and family account management are not connected. Authentication setup and remaining operational verification are documented in shared-account.md.

## Local-file mixing

The listener can select up to 100 local files, each no larger than 60 MiB or longer than 12 minutes. File metadata is checked locally, and a worker analyzes decoded PCM for waveform peaks and estimated tempo/beat positions. Current and next tracks use two decoded playback buffers; a queue of files does not mean decoding the whole set at once.

| Area | YouTube mode | Local-file mode |
| --- | --- | --- |
| Track transition | Fade out, stop, then start the next player where volume control works | Scheduled overlap with equal-power fades |
| Beat alignment | Not supported | Align estimated beat grids when confidence and tempo-ratio checks pass |
| FX | Source-support information only | Low-pass filter and echo |
| Waveform | No audio-analysis display | PCM-derived curves; drag left/right to seek both tracks on their shared timeline |
| Retention | Set and preferences restored from local storage | Files, file queue, and analysis are not persisted |

Selected files and their analysis are not uploaded. Reloading requires selecting files again. An optional synthesized demo provides two original tracks for trying the engine without importing a file. Neither path extracts or processes YouTube audio.

Tempo correction currently uses playback rate, which changes pitch as well as speed. Pitch-preserving time-stretching is not implemented. Beat positions and BPM are estimates, not guarantees for every recording; uncertain grids or unsuitable tempo ratios use an ordinary crossfade. Unsupported formats or slow decoding can interrupt a set, and real-device behavior still needs verification.

## Before a wider release

Priorities are reliable browser and mobile file loading and recovery, accessible controls, measured beat alignment on varied music, and reproducible native builds. Version 0.3.2 passed browser file playback and waveform transport checks plus Android debug/iOS simulator compilation. Native YouTube client identity and physical-device validation remain outstanding. A public app release also needs finalized identifiers, publisher/support details, privacy disclosures, signing, and store review. There is no confirmed store release or subscription price.

Useful verification describes the environment and result: mocked scheduling, offline PCM rendering, actual browser playback, and a physical device are separate evidence. A moving waveform alone is not proof of beat alignment or an audible crossfade.

The technical boundary follows the [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [required player functionality](https://developers.google.com/youtube/terms/required-minimum-functionality), and [developer policies](https://developers.google.com/youtube/terms/developer-policies).
