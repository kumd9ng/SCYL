# Contributing to SCYL

SCYL means **Songs Change Your Life.** The current project is a portrait player for YouTube listening sets, with two vertically stacked circular dials.

Bug reports and focused improvements are welcome. A project license has not yet been selected; contribution and reuse terms must be settled before accepting code under an open-source license.

## Choose a focused change

Good starting points include accessible controls, responsive layout, clearer playback recovery, URL handling, and reproducible mobile bugs. For a new audio provider, account system, or change to the playback model, open a feature discussion before implementing it.

Keep these product details intact unless the change explicitly addresses them:

- The primary layout is portrait, with one circular dial above the other.
- The logo is a circle-based symbol with an orange indicator, not a letter mark.
- **Songs Change Your Life.** is the brand phrase; do not add another slogan.
- Current **fx** buttons explain source support. They do not apply effects.
- The waveform is a labeled design preview. Do not present it as analyzed audio.
- YouTube playback uses the visible official player and stops when the app leaves the foreground.

## Local workflow

Use Node.js 22 or later, then run:

```sh
npm ci
npm start
```

Open the local address printed by the server. Before submitting a change, run:

```sh
npm test
npm run check
npm run build:web
```

Run additional checks only when they are relevant to the change. For native changes, follow [the native build guide](docs/native-build.md) and report which platform steps actually succeeded.

## Report evidence precisely

A useful playback report includes the browser or OS version, device model, reproduction steps, expected behavior, actual behavior, and a public video URL when the issue depends on that video. Remove private history and account information from screenshots and logs.

For UI or playback changes, distinguish among:

- Unit tests for calculations and state transitions.
- Browser tests using a simulated player.
- A real YouTube player in a browser.
- An installed Android or iOS build on a physical device.

Unit tests and a successful web build do not establish real-device playback. Do not describe sequential fades as beatmatching, gapless playback, or overlapping crossfades.

## Keep the repository portable

Do not include credentials, cookies, private playlists, signing files, account-specific deployment details, absolute SDK paths, or generated build output. Android SDK locations and signing settings belong in each contributor's local environment. Never commit a real keystore or a developer account's signing material.

Preserve dependency notices when adding or changing a dependency. Explain the problem, final behavior, and relevant verification in the pull request. Small changes should have small descriptions.
