<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/scyl-logo-light.svg">
    <img src="assets/scyl-logo.svg" alt="SCYL circular dial logo" width="144">
  </picture>
</p>

<h1 align="center">SCYL</h1>
<p align="center"><strong>Songs Change Your Life.</strong></p>

A portrait music player built around two circular dials: the song playing now and the song coming next. Build a YouTube listening set from links, or select local audio files for Web Audio mixing. Off-white, charcoal, and one orange indicator bring the feel of a classic portable player to the screen.

> YouTube 링크로 곡을 모으거나, 기기의 음악 파일로 자동 믹싱하는 세로형 음악 앱입니다. 위아래 두 개의 원형 다이얼은 현재 곡과 다음 곡을 나타냅니다. SCYL은 **Songs Change Your Life.**의 약자입니다.

**웹과 설치형 앱을 함께 개발합니다.** 웹은 설치 없이 브라우저에서 사용하며, iOS·Android 앱도 같은 재생·믹싱 코드를 사용합니다. 웹 사용에는 TestFlight나 개발자 계정이 필요하지 않습니다. 설치형 앱의 스토어 배포는 별도로 준비 중입니다.

**Development preview:** the two source modes have different capabilities. YouTube uses the official player and sequential transitions, without beatmatching or audio FX. Local-file mode provides sample-based waveforms, overlapping transitions, and filter/echo processing. The former static waveform illustration has been removed from the YouTube screen.

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

The interface is currently in Korean. Your YouTube set is saved locally. A build configured with the shared MEOW authentication project requires email sign-in; an unconfigured local open-source build runs without that account connection. The source-mode link opens local-file mixing, described below. Keep the app visible while listening — leaving the page pauses playback.

## The interface

| Element | YouTube mode | Local-file mode |
| --- | --- | --- |
| Upper/lower dials | Current and next video thumbnails after consent | Current and next decoded tracks |
| **fx** controls | Explain source limitations; no effects are applied | Apply a low-pass filter and echo |
| Center graph | No audio-analysis display | Two smooth filled curves; drag them left/right to move both tracks along their shared timeline |
| Transition | Stop the current player before starting the next | Overlap tracks; align estimated beats when suitable |
| Input | Individual YouTube video URLs | Audio files selected from the device |
| Original video | Visible, separate, and unmasked while playing | No YouTube connection is required |

YouTube sets support reordering, local restoration, repeat, and JSON export. Individual video links can include supported start-time parameters. The first-set counter records up to 14 distinct tracks actually played; there is no paid checkout or enforced usage limit.

## Playback today

SCYL's YouTube mode uses the official iframe player. Where programmatic volume control works, it fades out the current song, stops that player, then starts and fades in the next. This is a **sequential fade**, not a simultaneous crossfade. iPhone uses device volume controls and sequential playback without a promised fade.

YouTube ads, buffering, embedding restrictions, and browser autoplay rules can leave a gap. SCYL does not remove YouTube ads, include YouTube Premium, extract audio, or provide background playback.

The YouTube API does not expose audio samples, beat grids, or an audio-effects graph. The separate local-file mode supplies direct audio processing; it does not extract or process YouTube audio.

## Local-file mixing

After `npm start`, open **http://127.0.0.1:4317/mix-lab.html** or follow the source-mode link. Press **음악 파일 선택**, choose files, then press **세트 재생**. The optional **합성 데모 듣기** button uses two original synthesized tracks instead.

Select up to **100 files**, with a maximum of **60 MiB and 12 minutes per file**. Supported formats depend on the browser's decoder; mono and stereo are accepted. SCYL reads local metadata, decodes the current and next tracks into two playback buffers, and analyzes their PCM in a worker for waveform peaks and estimated tempo/beat positions. Files, the file queue, and analysis results are not uploaded or persisted; select the files again after reloading.

Two audio sources share one Web Audio clock and overlap with an equal-power crossfade. Between the dials, two smooth filled curves follow decoded audio and playback position, crossing within the highlighted transition region. Filter and echo controls process the actual audio. Reliable estimated beat grids allow alignment; uncertain grids or unsuitable tempo ratios fall back to a plain crossfade.

Drag the center curves **left to move forward, right to move backward**. Both tracks follow the same timeline during a transition. Playback continues from the selected position after releasing a drag that began while playing; a paused selection stays silent. The graph also supports Left/Right keys in five-second steps and Home/End. It can seek within the decoded pair, including earlier parts of the current track after a transition; previously released tracks require selecting those files again.

Tempo adjustment uses playback rate, so **pitch changes too**; there is no pitch-preserving time-stretching. Analysis is not guaranteed accurate for every song. Native file selection and playback still require physical-device verification.

Leaving the app or an audio interruption pauses both tracks at their current positions. Returning to the app does not restart sound automatically; press **이어 듣기** to continue. Native playback waits until the app has confirmed it is ready and active.

## Development

```sh
npm test
npm run check
npm run build:web
```

The web bundle is written to `www/`. Android and iOS projects are included; the [native build guide](docs/native-build.md) covers local setup and synchronization. These projects are not signed store releases. Physical iPhone and native-device verification remains outstanding.

See the [audio validation notes](docs/audio-validation.md) for actual rendered output and browser file-playback checks, including their limits.

For a small contribution, start with keyboard access, mobile layout, playback recovery, or a reproducible bug. See [CONTRIBUTING.md](CONTRIBUTING.md). Test results should say whether they cover unit logic, mocked playback, a real YouTube player, or a physical device.

## Identity and data

The original SCYL symbol uses two concentric circular outlines and one orange indicator. It contains no letters. The name **SCYL** and **Songs Change Your Life.** appear separately as text. SVG originals and PNG app icons are in `assets/`.

SCYL stores the YouTube set, preferences, and consent choice on the device. After consent, the original player and thumbnails connect to YouTube/Google. Local audio files and their analysis stay in memory and are not uploaded or saved by SCYL. The in-app privacy page explains local deletion. Native YouTube-set export opens the device share sheet; closing that sheet does not confirm another app saved the file.

Billing, an advertising SDK, and family plans are not connected. The optional MEOW shared-account connection uses Supabase email authentication; see [account setup and validation limits](docs/shared-account.md). SCYL is independent of Apple, Braun, Pacemaker, Spotify, and YouTube.

## Source layout

| Path | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.mjs` | Portrait interface and playback controller |
| `mix-lab.html`, `mix-lab.css`, `mix-lab.mjs` | Local-file mixing and optional synthesized demo |
| `lib/` | URL handling, PCM analysis, Web Audio mixing, native lifecycle, and export |
| `server.mjs` | Local server and optional YouTube oEmbed metadata endpoint |
| `assets/` | Original identity, icons, and third-party notices |
| `tests/` | Node unit tests |
| `android/`, `ios/` | Capacitor platform projects |

## License

A project license has not yet been selected. This source publication is not an open-source license grant. Third-party component notices are in [assets/third-party-notices.txt](assets/third-party-notices.txt).
