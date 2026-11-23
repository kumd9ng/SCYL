# Product direction

**SCYL — Songs Change Your Life.**

SCYL is intended to make a personal set feel connected from one song to the next. The current input is simple: one YouTube video URL adds one track. The interface is portrait, with two large circular dials stacked vertically.

## Current design

The upper dial represents the current track; the lower dial represents the next. Each shows its video's thumbnail after YouTube connection consent. Center **fx** buttons open support information for that track. Play, pause, track navigation, and set access sit below the dials.

The thin waveform between the dials is a **design preview**. It illustrates the intended visual treatment for transitions, but it is not generated from the video's audio and does not demonstrate a working mix.

The visual identity uses an off-white surface, charcoal controls, and an orange indicator. The original logo contains only a circular dial and an orange point. The name and **Songs Change Your Life.** are separate text, with no additional catchphrase.

## Available behavior

- Add individual YouTube video URLs and supported start-time parameters.
- Arrange, restore, repeat, and export a local listening set.
- Play through the visible official YouTube player.
- Seek with the upper dial's rim or the timeline control.
- Transition sequentially; use volume fades only where the player supports them.
- Pause when the app is no longer in the foreground.

No SCYL account or cloud set service is connected. The 14-track first-set counter is informational; payment, advertisements supplied by SCYL, and family account management are not active.

## Desired listening engine

The intended direction includes beat-aware transitions, overlapping crossfades, and audio effects. Those features require direct access to audio that the application is permitted to process. A YouTube URL embedded through the official iframe API does not provide that processing path.

| Area | Current implementation | Work still required |
| --- | --- | --- |
| Track transition | Fade out, stop, then start the next player | A suitable audio source and an engine for overlapping playback |
| Beatmatching | None | Tempo/beat analysis, synchronization, and measurable alignment |
| FX | A source-support explanation | A permitted audio graph with effects and device-level validation |
| Waveform | Labeled illustration | Real audio analysis connected to the playback timeline |
| Native apps | Platform source projects | Client identity integration, signed builds, and physical-device testing |

A separate audio source has not been selected. The project should not silently replace YouTube input or claim those planned features already work. Discussion of a new source needs to address available audio access, intended user flow, and what can actually be tested.

## Before a wider release

Priorities are reliable mobile startup and recovery, accessible controls, measured transition behavior, and a reproducible native build. A public app release also needs finalized identifiers, publisher/support details, privacy disclosures, signing, and store review. There is no confirmed store release or subscription price.

Useful verification describes the environment and result: mocked player state, actual browser playback, and a physical device are separate evidence. Visual similarity to a mix is not proof of beatmatching.

The technical boundary follows the [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [required player functionality](https://developers.google.com/youtube/terms/required-minimum-functionality), and [developer policies](https://developers.google.com/youtube/terms/developer-policies).
