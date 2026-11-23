<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/scyl-logo-light.svg">
    <img src="assets/scyl-logo.svg" alt="SCYL circular dial logo" width="144">
  </picture>
</p>

<h1 align="center">SCYL</h1>
<p align="center"><strong>Songs Change Your Life.</strong></p>

A portrait music player built around two circular dials: the song playing now and the song coming next. Paste YouTube links to build a personal listening set. Off-white, charcoal, and one orange indicator bring the feel of a classic portable player to the screen.

> YouTube 링크 한 개로 곡 하나를 추가하고, 위아래 두 개의 원형 다이얼로 현재 곡과 다음 곡을 보는 세로형 음악 앱입니다. SCYL은 **Songs Change Your Life.**의 약자입니다.

**Development preview:** YouTube playback and sequential transitions work within the official player. Beatmatching, overlapping crossfades, and audio FX are **not implemented**. The crossing waveform is a labeled design preview, not audio analysis.

## Start listening

Requires **Node.js 22 or later**.

```sh
npm ci
npm start
```

Open **http://127.0.0.1:4317** in a browser. Use the local server rather than opening `index.html` directly.

1. Press **＋** and paste a YouTube video link.
2. Add the next song and arrange your set.
3. Consent to connecting to YouTube, then press Play. On iPhone, the original video's Play button may need a direct tap.

The interface is currently in Korean. Your set is saved locally; no SCYL account is needed. Keep the app visible while listening — leaving the page pauses playback.

## The interface

| Element | What it does |
| --- | --- |
| Upper dial | Shows the current video's thumbnail after consent; dragging its rim seeks within the track |
| Lower dial | Shows the next video's thumbnail after consent |
| Center **fx** buttons | Open source-support information for the selected track; they do not apply effects |
| Crossing waveform | Illustrates the intended transition design; it is not measured sound data |
| Bottom controls | Open the set, add links, play/pause, and move between tracks |
| Original video | Remains a separate, unmasked YouTube player during playback |

Sets support reordering, local restoration, repeat, and JSON export. Individual video links can include supported start-time parameters. The first-set counter records up to 14 distinct tracks actually played; there is no paid checkout or enforced usage limit.

## Playback today

SCYL uses the official YouTube iframe player. Where programmatic volume control works, it fades out the current song, stops that player, then starts and fades in the next. This is a **sequential fade**, not a simultaneous crossfade. iPhone uses device volume controls and sequential playback without a promised fade.

YouTube ads, buffering, embedding restrictions, and browser autoplay rules can leave a gap. SCYL does not remove YouTube ads, include YouTube Premium, extract audio, or provide background playback.

The YouTube API does not expose audio samples, beat grids, or an audio-effects graph. Real beatmatching and FX need a separate source that allows direct audio processing; that source has not been selected. See the [product direction](docs/product-direction.md) for the distinction between the current build and the intended listening experience.

## Development

```sh
npm test
npm run check
npm run build:web
```

The web bundle is written to `www/`. Android and iOS projects are included; the [native build guide](docs/native-build.md) covers local setup and synchronization. These projects are not signed store releases. Physical iPhone and native-device verification remains outstanding.

For a small contribution, start with keyboard access, mobile layout, playback recovery, or a reproducible bug. See [CONTRIBUTING.md](CONTRIBUTING.md). Test results should say whether they cover unit logic, mocked playback, a real YouTube player, or a physical device.

## Identity and data

The original SCYL symbol uses two concentric circular outlines and one orange indicator. It contains no letters. The name **SCYL** and **Songs Change Your Life.** appear separately as text. SVG originals and PNG app icons are in `assets/`.

SCYL stores the set, preferences, and consent choice on the device. After consent, the original player and thumbnails connect to YouTube/Google. The in-app privacy page explains local deletion. Native set export opens the device share sheet; closing that sheet does not confirm another app saved the file.

Billing, an advertising SDK, family accounts, and a SCYL account service are not connected. SCYL is independent of Apple, Braun, Pacemaker, Spotify, and YouTube.

## Source layout

| Path | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.mjs` | Portrait interface and playback controller |
| `lib/` | URL handling, sequential fades, native lifecycle, and export |
| `server.mjs` | Local server and optional YouTube oEmbed metadata endpoint |
| `assets/` | Original identity, icons, and third-party notices |
| `tests/` | Node unit tests |
| `android/`, `ios/` | Capacitor platform projects |

## License

A project license has not yet been selected. This source publication is not an open-source license grant. Third-party component notices are in [assets/third-party-notices.txt](assets/third-party-notices.txt).
