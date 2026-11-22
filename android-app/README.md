# First Milk Venture First Milk Venture Admin — Android 360° 3D Edition

This is the additive Android packaging project for the existing admin portal. The web portal is preserved, and its local static files are staged into a Capacitor 8 Android shell.

## Building

Requirements: Node.js 22+, Java 21, Android SDK / Android Studio and network connectivity to download build dependencies.

Run from `android-app/`:

```sh
npm install
npm run android:prepare
cd android
./gradlew assembleDebug
```

The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions runs the same build on pull requests and publishes a downloadable artifact after success.

## 3D features

The additional `immersive-3d.js` is a self-contained WebGL 3D engine with procedural physical mesh geometry (not a video or static 360 image). Users can rotate 360 degrees, tilt, zoom, choose scenes, and pause automatic rotation. No 3D cloud service, model CDN or paid subscription is needed. 3D is only initialized when the user opens its studio; graphics are capped at 1.7 device pixel ratio and paused when hidden. It respects reduced-motion settings.

## Integration and security

- Existing customer, driver and administrator business workflows remain untouched in the static portal files.
- `scripts/stage.mjs` creates an isolated Android web bundle, without shipping development files, backend code or secrets. The Android copy of `config.js` points to the existing HTTPS backend; the website's config is unchanged.
- CapacitorHttp is configured for native HTTPS fetch/XHR to reduce cross-origin issues when running local WebView resources. **Verify this integration on real Android hardware before production**.
- The current portal includes legacy browser token storage and demo fallbacks; these must be audited and replaced before collecting real credentials through an APK.
- Debug APKs use development signing and are **not production-release signed**. Google Play requires a release-signed Android App Bundle and its own review/testing.
- Verify payment redirects, OTP verification, uploads, offline behavior, notification permission, sign-out and backend access control before publication.
- This build does **not** add offline transaction queuing or data synchronization; those require separate verified backend changes.
- 200 MB is an upper limit, not a target. The 3D procedural assets avoid padding the APK.

## Portals

This app is distinct from the other two applications with package id `com.firstmilkventure.admin`, so all three can be installed on the same phone.
