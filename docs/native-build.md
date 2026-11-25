# Native builds

The repository includes Capacitor projects for Android and iOS. Synchronizing those projects is supported; successful platform compilation, signing, installation, and physical-device playback have not been established by this source publication.

## Shared setup

Use Node.js 22 or later. From the repository root:

```sh
npm ci
npm test
npm run check
npm run native:sync
```

`native:sync` builds the web bundle into `www/`, copies it into both platform projects, and updates their plugin references. It does not create an APK, AAB, or IPA. Re-run synchronization after web or plugin changes.

The projects use Capacitor 8.6.2 with App, Filesystem, and Share plugins. The configured identifier `com.scyl.app` is provisional. Before distributing your own build, set identifiers and signing details that belong to your project rather than assuming ownership of that identifier.

## Android

The checked-in configuration currently specifies:

| Setting | Value |
| --- | --- |
| Java source and target compatibility | 21 |
| Minimum Android SDK | 24 |
| Compile and target SDK | 36 |
| Android Gradle Plugin | 8.13.0 |
| Gradle wrapper | 8.14.3 |

Install a compatible Android Studio setup, JDK 21, Android SDK Platform 36, and the SDK tools requested by Gradle. Configure the local SDK through Android Studio or your own environment; do not commit a machine-specific SDK path.

From the repository root:

```sh
npm run native:android
npx cap open android
```

Let Android Studio finish Gradle synchronization, select a connected device or emulator, and run the app. To attempt a debug build from a terminal, use the included wrapper:

macOS or Linux:

```sh
cd android
sh gradlew assembleDebug
```

Windows PowerShell:

```powershell
cd android
.\gradlew.bat assembleDebug
```

A successful debug build writes its APK under `android/app/build/outputs/apk/debug/`. A debug APK is not a signed production release. Store signing, release configuration, and listing preparation are separate work.

## iOS

iOS compilation requires macOS and Xcode 26.0 or later, as specified in the [Capacitor 8 iOS documentation](https://capacitorjs.com/docs/ios). The app target currently sets iOS 15.4 as its deployment target. Swift Package Manager supplies Capacitor in this project; local plugin package references are created by `npm ci` and synchronization.

From the repository root on the Mac:

```sh
npm run native:ios
npx cap open ios
```

Allow Xcode to resolve packages. Select the app target, configure your own bundle identifier and signing team, choose a simulator or connected device, and build. Do not add an unrelated team's signing identity to the repository.

An archive or store submission requires a separate release configuration and authorized developer account. This repository does not include an IPA or evidence of a signed iOS release.

## Icons and launch screens

The original dial symbol and PNG sizes are in `assets/`. To copy the current PNGs and regenerate the matching Android vectors and platform launch assets:

```sh
node scripts/install-native-icons.mjs
```

The script verifies hashes of the copied PNGs. This checks asset consistency; it does not compile either app. The script does not rasterize changed SVG source, so regenerate the corresponding PNG sizes first when editing the logo.

## Device verification still needed

On each target device, verify YouTube connection consent, first playback, foreground/background transitions, manual resume, current-to-next transition, thumbnail loading, set restoration, export, and local data deletion. Check a real embeddable video rather than treating a mock-player test as playback evidence.

The native YouTube player must receive a supported client identity. The current iOS custom-scheme WebView setup still needs an appropriate identity integration and real-device verification. A native compile alone does not resolve that playback requirement.

Original video controls remain visible and unmasked. iPhone volume is controlled by the device; the YouTube mode does not promise a volume fade there. YouTube mode does not implement automatic simultaneous mixing, beatmatching, or FX.

The separate local-file mode implements PCM waveforms, estimated beat alignment, overlapping crossfades, and filter/echo with Web Audio. Verify native file selection, metadata decoding, module workers, audio output, and foreground/background interruption on physical devices before release. Playback-rate changes also change pitch. Background playback is not implemented in either mode.

Official references: [Capacitor workflow](https://capacitorjs.com/docs/basics/workflow), [Android development](https://capacitorjs.com/docs/android), [iOS development](https://capacitorjs.com/docs/ios), and [YouTube player requirements](https://developers.google.com/youtube/terms/required-minimum-functionality).
