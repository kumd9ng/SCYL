# Product direction

**SCYL — Songs Change Your Life.**

SCYL is intended for building personal music playlists, with the user's requested direction being multiple YouTube playlists. The current YouTube implementation still stores one local set; multiple named playlists and YouTube-account synchronization are not implemented. The two top-level labels are **YouTube 듣기** and **파일로 자동 믹싱**. Apple Music search sits directly inside file mixing, above local-file controls, without another source tab or Apple link-paste field. Local files provide direct audio processing. The interface preserves the portrait dials and shared gray/orange design.

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
- Request the next player at 90% of the current track and overlap its final 10%, keeping original speed; adjust volume only where supported.
- Keep both original players visible during overlap, with a direct Play action if the browser blocks the next player's automatic start.
- Pause when the app is no longer in the foreground.

YouTube overlap uses official player timing rather than audio analysis. A three-minute track requests the next player at 2:42, aiming for 18 seconds of overlap. Ads, buffering, and autoplay restrictions may shorten or prevent that interval, and real iPhone playback requires separate verification. This does not match beats or modify playback speed.

The official [automatic and scripted playback requirements](https://developers.google.com/youtube/terms/required-minimum-functionality#autoplay-and-scripted-playbacks) prohibit multiple YouTube players from automatically playing simultaneously on a page or screen. The timed-overlap implementation does not establish policy compliance. Resolving this conflict is a separate requirement before wider distribution; it is not a claim that two players are technically unable to play together.

The YouTube set is stored locally. Its 14-track first-set counter is informational; no payment or usage gate is enforced. Configured builds use the same email identity as MEOW. Cloud sets, advertisements supplied by SCYL, and family account management are not connected. Authentication setup and remaining operational verification are documented in shared-account.md.

## Local-file mixing

The listener can select up to 100 local files, each no larger than 60 MiB or longer than 12 minutes. File metadata is checked locally, and a worker analyzes decoded PCM for waveform peaks and estimated tempo/beat positions. Current and next tracks use two decoded playback buffers; a queue of files does not mean decoding the whole set at once.

| Area | YouTube mode | Local-file mode |
| --- | --- | --- |
| Track transition | Request the next player at 90%, aiming for 10% overlap at original speed | Scheduled overlap with equal-power fades |
| Beat alignment | Not supported; original playback speed | Estimated beat alignment and bounded tempo adjustment, with an unaligned fallback |
| FX | Source-support information only | Low-pass filter and echo |
| Waveform | No audio-analysis display | PCM-derived curves; drag left/right to seek both tracks on their shared timeline |
| Retention | Set and preferences restored from local storage | Files, file queue, and analysis are not persisted |

Selected files and their analysis are not uploaded. Reloading requires selecting files again. An optional synthesized demo provides two original tracks for trying the engine without importing a file. Neither path extracts or processes YouTube audio.

The file screen enables beatmatching with an eight-second target transition. Reliable estimated beat grids and a suitable tempo ratio allow alignment; weak analysis, an unsuitable ratio, or too little audio falls back to a plain crossfade or cut. Aligned transitions may be shorter than eight seconds to fit whole beats and available audio. Tempo adjustment uses playback rate and changes pitch; pitch-preserving time stretching is not implemented. The engine retains the previous fixed-speed percentage-overlap option, but it is no longer the file screen's default. Unsupported formats or slow decoding can interrupt a set; offline rendering, browser playback, and physical-device testing remain distinct checks.

## Apple Music search and account connection

The automatic-mixing page contains a song/artist search field and a **담기** action. The user searches within SCYL and selects results; there is no Apple link-paste form or nested YouTube/Apple source navigation. Selected songs form a temporary collection of up to 50 songs. Playback and search stop when the SCYL account locks; the collection is cleared. Leaving the foreground pauses playback, while an in-progress Apple sign-in popup may still finish.

With no MusicKit configuration, the production panel uses Apple's public iTunes Search API, requesting up to 20 songs from the US store. The UI identifies this as **미국 공개 음악 목록**, not a complete Korean Apple Music catalog or the user's library. A live 2026-11-26 test returned 20 US results for BTS and IU, while the Korean BTS query returned zero. This fallback displays song, artist, and album metadata without iTunes artwork or raw preview audio. Typing does not start a search; submitting the form does. Successful public results are cached in page memory for two minutes.

Selecting a song also queries its artist name and shows other matching songs as circular LP cards under **같은 아티스트의 다른 곡**. The cards let the user select the next song to add. Results stay in page memory and are discarded on reload or account lock. These are same-artist catalog matches, not Apple's personalized recommendations or the Apple Music autoplay queue. That requested Apple-generated next-song list is not implemented or live verified.

Selecting a public result opens Apple's official embedded player in the same page. Preview length, full-track availability, sign-in within the embed, and region restrictions are controlled by Apple. SCYL does not assert subscriber playback merely because the frame loads. Starting local-file playback, locking SCYL, or leaving the foreground closes the frame. Reloading clears the selected collection.

The MusicKit adapter implements developer-token configuration, explicit Apple authorization, the account storefront's catalog search, and one-song playback. **As of 0.4.14, production has no MusicKit developer key configured.** The Apple login button therefore shows an unavailable/preparation state; real Apple authorization and subscriber playback are not live verified. Successful developer-site sign-in alone does not provision the MusicKit key. Personal-library import and Apple playlist synchronization are not implemented.

Apple Music search and official playback do not provide SCYL with decoded audio, waveform analysis, a dual-deck overlap, or beatmatching. The local-file mixing engine is separate and does not process Apple Music tracks. Apple's approved DJ integrations are distinct and are not implemented in SCYL; this is not a claim that Apple Music can never support DJ software.

References: [Apple Search API](https://performance-partners.apple.com/search-api), [Apple's embed guidance](https://artists.apple.com/support/1117-apple-music-marketing-tools), [MusicKit credentials](https://developer.apple.com/help/account/capabilities/create-a-media-identifier-and-private-key), [approved DJ integrations](https://music.apple.com/gb/curator/dj-with-apple-music/1798261090).

## Before a wider release

Priorities are reliable browser and mobile file loading and recovery, accessible controls, measured beat alignment on varied music, and reproducible native builds. Version 0.3.2 passed browser file playback and waveform transport checks plus Android debug/iOS simulator compilation. Native YouTube client identity and physical-device validation remain outstanding. A public app release also needs finalized identifiers, publisher/support details, privacy disclosures, signing, and store review. There is no confirmed store release or subscription price.

Useful verification describes the environment and result: mocked scheduling, offline PCM rendering, actual browser playback, and a physical device are separate evidence. A moving waveform alone is not proof of beat alignment or an audible crossfade.

The technical boundary follows the [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [required player functionality](https://developers.google.com/youtube/terms/required-minimum-functionality), and [developer policies](https://developers.google.com/youtube/terms/developer-policies).
