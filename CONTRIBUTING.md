# Contributing to SCYL

SCYL means **Songs Change Your Life.** The current project is a portrait player with two vertically stacked circular dials. YouTube mode provides official-player listening sets; local-file mode provides direct Web Audio mixing.

Bug reports and focused improvements are welcome. A project license has not yet been selected; contribution and reuse terms must be settled before accepting code under an open-source license.

## Choose a focused change

Good starting points include accessible controls, mobile file-loading recovery, URL handling, and reproducible playback or analysis bugs. For a new audio provider, account system, or change to the playback model, open a feature discussion before implementing it.

Keep these product details intact unless the change explicitly addresses them:

- The primary layout is portrait, with one circular dial above the other.
- The logo is a circle-based symbol with an orange indicator, not a letter mark.
- **Songs Change Your Life.** is the brand phrase; do not add another slogan.
- YouTube **fx** buttons explain source limits; file-mode controls apply filter and echo. Keep these capabilities distinct.
- File-mode waveforms come from decoded PCM and follow playback. The YouTube screen has no analyzed waveform; do not restore a static illustration that looks like real analysis.
- YouTube playback uses the visible official player. File mode does not extract or process YouTube audio.
- Local files and their analysis are not uploaded or persisted. Keep decoding bounded to the current and next playback buffers.
- Playback pauses when the app leaves the foreground.
- Tempo correction changes pitch. Do not claim pitch preservation or reliable beatmatching for every track; uncertain analysis must retain an honest fallback.

## Local workflow

Use Node.js 22 or later, then run:

```sh
npm ci
npm start
```

Open the local address printed by the server for YouTube mode, or `/mix-lab.html` for file mixing. File mode also offers an optional original synthesized demo. Before submitting a change, run:

```sh
npm test
npm run check
npm run build:web
```

Run additional checks only when they are relevant to the change. For native changes, follow [the native build guide](docs/native-build.md) and report which platform steps actually succeeded.

## Report evidence precisely

A useful playback report includes the source mode, browser or OS version, device model, reproduction steps, expected behavior, and actual behavior. For a YouTube issue, add a public video URL when needed. For a file issue, report the format, duration, channel count, and size; use a synthetic or shareable sample rather than attaching private audio. Remove private history and account information from screenshots and logs.

For UI or playback changes, distinguish among:

- Unit tests for calculations and state transitions.
- Browser tests using a simulated player.
- Offline rendering of actual Web Audio nodes to PCM, with measured overlap and timing.
- A real YouTube player in a browser.
- Browser playback and analysis of selected local audio files.
- An installed Android or iOS build on a physical device.

Unit tests, offline rendering, and a successful web build do not establish physical-device playback. Do not describe YouTube's sequential fades as beatmatching, gapless playback, or overlapping crossfades. For local mixing, distinguish an estimated beat grid, a scheduled transition, measured PCM alignment, and what was actually heard.

## Keep the repository portable

Do not include credentials, cookies, private playlists, signing files, account-specific deployment details, absolute SDK paths, or generated build output. Android SDK locations and signing settings belong in each contributor's local environment. Never commit a real keystore or a developer account's signing material.

Preserve dependency notices when adding or changing a dependency. Explain the problem, final behavior, and relevant verification in the pull request. Small changes should have small descriptions.
