<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/scyl-logo-light.svg">
    <img src="assets/scyl-logo.svg" alt="SCYL circular dial logo" width="144">
  </picture>
</p>

<h1 align="center">SCYL</h1>
<p align="center"><strong>Songs Change Your Life.</strong></p>

A portrait music player built around two circular dials: the song playing now and the song coming next. Build a YouTube listening set from links, search Apple's public music catalog, or select local audio files for Web Audio mixing. Off-white, charcoal, and one orange indicator bring the feel of a classic portable player to the screen.

> YouTube 링크로 곡을 모으고, 자동 믹싱 화면에서 Apple 음악을 검색하거나 기기의 음악 파일을 10% 겹쳐 재생하는 세로형 음악 앱입니다. Apple 검색은 현재 미국 공개 음악 목록을 사용하며 Apple Music 비트매칭은 지원하지 않습니다. SCYL은 **Songs Change Your Life.**의 약자입니다.

**웹과 설치형 앱을 함께 개발합니다.** 웹은 설치 없이 브라우저에서 사용하며, iOS·Android 앱도 같은 재생·믹싱 코드를 사용합니다. 웹 사용에는 TestFlight나 개발자 계정이 필요하지 않습니다. 설치형 앱의 스토어 배포는 별도로 준비 중입니다.

**Development preview, 0.4.14:** YouTube uses the official player and sequential transitions, without beatmatching or audio FX. The automatic-mixing page contains Apple Music search directly above local-file controls, with no nested source tabs or Apple link-paste form. Its current public search uses the US iTunes Store catalog; production MusicKit credentials are absent, so SCYL's Apple account login and subscriber playback are not yet live verified. Local files provide sample-based waveforms, fixed-speed 10% overlapping transitions, and filter/echo processing. Apple Music does not use that local-file processing engine.

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
| Transition | Stop the current player before starting the next | Overlap the final 10% at original playback speed |
| Input | Individual YouTube video URLs | Audio files selected from the device |
| Original video | Visible, separate, and unmasked while playing | No YouTube connection is required |

YouTube sets support reordering, local restoration, repeat, and JSON export. Individual video links can include supported start-time parameters. The first-set counter records up to 14 distinct tracks actually played; there is no paid checkout or enforced usage limit.

## Playback today

SCYL's YouTube mode uses the official iframe player. Where programmatic volume control works, it fades out the current song, stops that player, then starts and fades in the next. This is a **sequential fade**, not a simultaneous crossfade. iPhone uses device volume controls and sequential playback without a promised fade.

The requested automatic 10% YouTube overlap remains unimplemented. YouTube's [automatic and scripted playback requirements](https://developers.google.com/youtube/terms/required-minimum-functionality#autoplay-and-scripted-playbacks) prohibit more than one embedded YouTube player from automatically playing content simultaneously on the same page or screen. SCYL therefore keeps automatic transitions sequential; this does not claim that two manually operated players are technically incapable of playing together.

YouTube ads, buffering, embedding restrictions, and browser autoplay rules can leave a gap. SCYL does not remove YouTube ads, include YouTube Premium, extract audio, or provide background playback.

The YouTube API does not expose audio samples, beat grids, or an audio-effects graph. The separate local-file mode supplies direct audio processing; it does not extract or process YouTube audio.

## Local-file mixing

After `npm start`, open **http://127.0.0.1:4317/mix-lab.html** or follow the source-mode link. Press **음악 파일 선택**, choose files, then press **세트 재생**. The optional **합성 데모 듣기** button uses two original synthesized tracks instead.

Select up to **100 files**, with a maximum of **60 MiB and 12 minutes per file**. Supported formats depend on the browser's decoder; mono and stereo are accepted. SCYL reads local metadata, decodes the current and next tracks into two playback buffers, and analyzes their PCM in a worker for waveform peaks and estimated tempo/beat positions. Files, the file queue, and analysis results are not uploaded or persisted; select the files again after reloading.

Two audio sources share one Web Audio clock. The next file starts at 90% of the current track, and the final 10% overlaps with an equal-power crossfade. A three-minute track starts its transition at 2:42 and overlaps for 18 seconds. Both playback rates stay at 1.0; a shorter or late-ready next track limits the overlap to available audio. Between the dials, two smooth filled curves follow decoded audio and playback position, crossing within the highlighted transition region. Filter and echo controls process the actual audio.

Drag the center curves **left to move forward, right to move backward**. Both tracks follow the same timeline during a transition. Playback continues from the selected position after releasing a drag that began while playing; a paused selection stays silent. The graph also supports Left/Right keys in five-second steps and Home/End. It can seek within the decoded pair, including earlier parts of the current track after a transition; previously released tracks require selecting those files again.

The current file screen preserves tempo and pitch; its fixed 10% overlap does not align different tempos. The engine retains legacy estimated-beat alignment, but that rate-changing path is not the screen's default. Analysis is not guaranteed accurate for every song. Native file selection and playback still require physical-device verification.

Leaving the app or an audio interruption pauses both tracks at their current positions. Returning to the app does not restart sound automatically; press **이어 듣기** to continue. Native playback waits until the app has confirmed it is ready and active.

## Apple Music search

Open **자동 믹싱**, enter a song or artist in the Apple Music search field, press **검색**, and choose **담기**. No Apple share link is required. The current production fallback searches up to 20 songs in the **US public iTunes Store catalog**, displaying title, artist, and album. It is not the full Korean Apple Music catalog or a personal library. The explicit US label reflects that limit; a live `country=kr` test returned no songs while the same US search returned results. Public iTunes artwork and raw preview audio are not used by this interface. See Apple's [Search API documentation](https://performance-partners.apple.com/search-api).

Selected songs appear in a temporary collection of up to 50 songs and open Apple's official embedded player within the page. Selecting a song also requests other songs by its artist and displays them as circular LP cards under **같은 아티스트의 다른 곡**. These are catalog matches, not Apple's personalized recommendations or an Apple-generated autoplay queue. Apple controls preview/full-track availability, region restrictions, and any sign-in inside its player; a loaded frame does not prove subscriber playback. The collection and related-song display are not saved after reload or SCYL account lock. Changing to local playback or leaving the foreground stops the Apple player. See Apple's [embedded-player guidance](https://artists.apple.com/support/1117-apple-music-marketing-tools).

The MusicKit adapter includes developer-token configuration, Apple authorization, storefront catalog search, and single-song playback. **Production has no MusicKit developer key configured**, so SCYL's own Apple login button remains disabled with a preparation message. Live Apple authorization and subscriber playback have not been verified. Personal-library import, Apple playlist synchronization, dual-deck overlap, audio analysis, and Apple Music beatmatching are not implemented. The presence of Apple search inside **자동 믹싱** does not mean Apple audio can be mixed by the local-file engine.

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

Submitting an Apple search sends the query to Apple; typing alone does not send it. Selecting a song also sends its artist name to request other songs by that artist. Public results may be cached in page memory for two minutes; chosen songs and related-song cards remain temporary. Opening a chosen song connects to Apple's embedded player. SCYL does not collect an Apple account password, personal Apple Music library, or original Apple audio files.

Billing, an advertising SDK, and family plans are not connected. The optional MEOW shared-account connection uses Supabase email authentication; see [account setup and validation limits](docs/shared-account.md). SCYL is independent of Apple, Braun, Pacemaker, Spotify, and YouTube.

## Source layout

| Path | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.mjs` | Portrait interface and playback controller |
| `mix-lab.html`, `mix-lab.css`, `mix-lab.mjs` | Automatic-mixing page: Apple search, local-file mixing, and optional synthesized demo |
| `lib/apple-music-*.mjs`, `apple-music.css` | Apple catalog search, MusicKit adapter, official-player panel, and styling |
| `lib/` | URL handling, PCM analysis, Web Audio mixing, native lifecycle, and export |
| `server.mjs` | Local server and optional YouTube oEmbed metadata endpoint |
| `assets/` | Original identity, icons, and third-party notices |
| `tests/` | Node unit tests |
| `android/`, `ios/` | Capacitor platform projects |

## License

A project license has not yet been selected. This source publication is not an open-source license grant. Third-party component notices are in [assets/third-party-notices.txt](assets/third-party-notices.txt).
