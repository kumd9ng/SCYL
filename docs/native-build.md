# Native builds

The repository includes Capacitor projects for Android and iOS alongside the browser application. At version 0.3.2, commit `2ad1b0a3f18329299925e486dc73e5593d932c5b`, both Android debug APK and unsigned iOS simulator compilation passed in [the native build run](https://github.com/kumd9ng/SCYL/actions/runs/45550972890). Distribution signing, installation on physical devices, and physical-device playback remain unverified. The working browser version does not require native installation or a developer account.

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

## GitHub Actions compilation checks

The [Native build workflow](../.github/workflows/native-build.yml) compiles both native projects independently. Run it from **Actions → Native build → Run workflow**, or push changes to native projects, bundled web source/assets, dependencies, Capacitor configuration, the web build script, or the workflow itself on `main`. Documentation-only changes do not trigger it. A newer run on the same branch cancels the previous run to avoid duplicate builds.

Both jobs use Node.js 22, `npm ci`, and platform-specific synchronization before compiling. The Android job uses `ubuntu-24.04`, selects the runner's Java 21, ensures Android SDK Platform 36 and Build Tools 36.0.0 are present, and runs `bash ./gradlew --no-daemon assembleDebug`. SDK setup runs in a separate step after Java selection, using `$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager` directly because the runner does not expose that command on `PATH`. The iOS job uses `macos-26` with Xcode 26 and builds the `App` scheme for a generic iOS Simulator with code signing disabled. Swift Package Manager resolves the project's dependencies during the build.

Successful jobs publish these downloadable artifacts on the workflow run page, retained for seven days:

| Artifact | Contents and limits |
| --- | --- |
| `scyl-android-debug` | `app-debug.apk`, signed with the runner's temporary Android debug key. It is for testing, not a Play Store release. The key can change between runs, so replacing an existing debug installation may require uninstalling it and losing that installation's local data. |
| `scyl-ios-simulator-unsigned` | `SCYL-ios-simulator-unsigned.zip`, containing `App.app`. The inner ZIP preserves executable permissions. Extract it on a Mac for an iOS Simulator; it cannot be installed on an iPhone or submitted to the App Store. |

The workflow has read-only repository permissions, uses no distribution certificates or signing secrets, and does not publish a store release. Its presence is not evidence of a successful compile: check both jobs for the exact commit being evaluated. Compilation does not verify physical-device playback, background behavior, or store eligibility; the device checks below still apply.

Runner references: [Ubuntu 24.04 tools](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md), [macOS 26 / Xcode tools](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md), and [artifact upload action](https://github.com/actions/upload-artifact).

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
