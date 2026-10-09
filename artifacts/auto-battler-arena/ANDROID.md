# Fantasy World Arenas: Android test wrapper

## What is ready

A Capacitor 8 Android project in `android/` loads the verified published game over
HTTPS. The game is not copied into a separate mobile implementation. Republishing
the website updates what this **private prototype** loads on its next navigation
or reload. The backend, accounts and inventory remain the existing production
services. Guest/device-local state is separate from a phone's normal browser.

This is **not a Google Play release**. Capacitor's `server.url` configuration is
for live reload/prototyping, not its recommended production configuration.
Do not upload this prototype to a store.

Included:
- Android 7+ (API 24), targeting Android 16 (API 36).
- Portrait and landscape support through the existing game layout.
- Local connection-error screen with a retry link.
- Android Back navigates history, or asks before closing the app.
- An Android-specific user-agent marker, not a query-string flag.
- Native interception blocks creation of Store checkout sessions.
- Matching hosted Store disclosure/disabled buttons after the website is republished.
- No changes to browser purchases, account ownership or payment fulfillment.
- No signing keys, new credentials, new database or app-store publication.

## Build a private test APK with Android Studio

Requires Node 22+, pnpm 10.26.1, Android Studio 2025.2.1+, Java 21 and Android SDK
platform 36. Android Studio supplies its own JDK. No Android toolchain was available
in the Replit workspace when this project was prepared.

From the project root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/auto-battler-arena run android:sync
pnpm --filter @workspace/auto-battler-arena run android:check
pnpm --filter @workspace/auto-battler-arena run android:open
```

In Android Studio, allow Gradle to sync, select a phone/emulator, and run the app.
Use **Build > Generate App Bundles or APKs > Generate APKs** for a debug APK.
Alternatively, with `ANDROID_HOME` and Java configured:

```sh
pnpm --filter @workspace/auto-battler-arena run android:apk
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`.
This is a debug-signed APK for sideloading, not a release-signed Play Store AAB.

## Optional cloud build

The repository includes `.github/workflows/android-prototype.yml`. If this
project is placed in a GitHub repository, run **Actions > Android test APK > Run
workflow**. It compiles the app, runs native policy tests, and provides a
downloadable debug APK. The workflow is manual-only and has not been run here.
It does not publish the website or the app.

## Device checks still required

- Launch, guest fight, signed-in Arena, account inventory and existing rewards.
- Email/password sign-in and session persistence after app restart.
- Google/Apple/social sign-in: do not assume OAuth works in an embedded WebView.
  A production app may need system-browser sign-in plus an approved return flow.
- Actual-device touch, fullscreen, rotation, keyboard, audio and rendering speed.
- Back during a fight, reconnecting, network loss/retry and background/resume.
- Store purchases remain blocked inside the test app.

The source/config checks do not prove that the native app compiles or that these
device journeys work. A successful native build and actual phone checks are
needed before calling the APK verified.

## Before Google Play

1. Replace the remote-test configuration with a production approach: bundle the
   shared web build; configure production API/auth origins and routing.
2. Integrate Google Play Billing for digital purchases, or choose a compliant
   consumption-only distribution model. Check current regional exceptions.
3. Reuse server-side receipt verification and account entitlements without
   trusting a client-reported purchase or importing sandbox rewards.
4. Choose the permanent Android application ID, create final icons/splash screens,
   and add a signing workflow using secrets tooling.
5. Complete privacy policy, Data Safety, content rating, any account-deletion
   requirements, Play testing requirements, and actual-device validation.
6. Build a release-signed AAB, then submit through the owner's Play Console.

## Later iOS

Reuse the same game source and backend with Capacitor's iOS platform. iOS needs a
macOS/Xcode build environment, signing, device testing, Apple-compliant purchases
and App Review. Do not promise all game-code updates can bypass store releases.
No iOS platform was generated in this Android-first step.

If the published hostname changes, update `capacitor.config.ts`, both local HTML
pages and `PrototypePolicy.java` together, then sync and rebuild the wrapper.
