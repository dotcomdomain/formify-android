# Formify for Android

An Android app for the existing [Formify service](https://getformify.pages.dev/), for Android 8.0 and later.

The app hosts the production mobile website in an Android WebView. It uses the actual cream, forest and clay theme, Young Serif and Bricolage Grotesque typography, and Search, Assistant, Visits and You screens. Business pages and the business dashboard also open inside the app. HTML, base styling and backend APIs load from the live service. The customer module and form renderer are bundled from `public/js/consumer.js` and `public/render.js`, so app interaction fixes can ship without deploying the website. Both were synchronized with the live client before packaging, retaining the current copy and voice-caption behavior. `public/assistant.css` is also packaged for the in-form chat layout. Future code updates to these bundled resources require rebuilding the APK. This is not a separate native rewrite or a bundled offline copy.

## Android integration

- Android back navigation through business pages, check-in forms and tabs.
- Edge-to-edge layout with system bar, display cutout and keyboard insets.
- Native loading and connection-error screens with retry.
- Warm and blue themes also update the system bar backgrounds.
- Packaged motion styles add short directional page entrances, a sliding tab highlight, touch press feedback and clipped tap ripples. They respect reduced-motion preferences and avoid sticky hover movement on touchscreens. Native loading screens fade into the page. The visual layer is installed only on Formify pages, without changing the hosted website.
- Warm/blue changes interpolate the shared palette and background gradients over 340ms; native system-bar backgrounds follow the change. Account mode and appearance selections in You update in place, preserving drafts and scroll instead of rebuilding the page. Reduced motion disables palette animation.
- Text fields use a subtle border and integrated focus glow. Select controls open a themed HTML bottom sheet rather than Android's default selector, preserving native form values and validation. The picker supports disabled options, groups, search for longer lists, multiple selections, keyboard input and Android Back.
- In-form Assistant has a compact header, collapsible progress details and a stable composer. Switching between a partially completed form and chat preserves answers without forcing validation. Navigation moves out of the way when the software keyboard reduces the viewport.
- Persistent WebView cookies and local storage for sessions and saved details. Android app storage is separate from Chrome's storage.
- Voice input asks for Android microphone permission when first used. Typing remains available if permission is denied.
- Card scans use the Android photo/document picker or an installed camera app. Camera capture uses temporary app-cache files; no broad media/storage permission is requested.
- JSON privacy exports open Android's Save As picker, including exports generated as JavaScript blobs. Regular first-party file downloads use Download Manager.
- Only the exact HTTPS Formify origin stays inside the app. External websites, payments, telephone, email and map links open an appropriate external app. Executable URL schemes are blocked.
- Native web messages are restricted to the first-party origin and main frame. Web debugging is enabled in debug builds only; app backup is disabled.
- Formify HTTPS links can open with the app through Android's link handling settings. Automatic verified App Links require publishing `/.well-known/assetlinks.json` on the website with the final package name and release certificate fingerprint; that server change is not included.

Search, AI, sign-in, check-in and queue updates require internet and the existing backend. Saved details do not make online forms available offline. The website's existing Stripe test-mode restrictions still apply.

## Build

Open this `android` directory in Android Studio, or install JDK 17/21 and Android SDK platform 35 / build tools 35.0.0. Set `ANDROID_HOME` or create an untracked `local.properties` containing `sdk.dir=C:/path/to/Android/sdk`.

```powershell
.\gradlew.bat assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`.

```powershell
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell am start -n app.formify.android/.MainActivity
```

For a local emulator, create a Pixel virtual device with an Android 15 / API 35 Google APIs image in Android Studio's Device Manager. The development device created for this project is named `Formify_Pixel`.

```powershell
emulator -avd Formify_Pixel -gpu swiftshader_indirect -no-snapshot
```

The debug APK is signed with the local Android development key. Release/store distribution needs your own signing key and normal store setup. No signing secrets are committed.

## Verification

```powershell
.\gradlew.bat testDebugUnitTest lintDebug assembleDebugAndroidTest
adb -s emulator-5554 install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s emulator-5554 shell am instrument -w app.formify.android.test/app.formify.android.SmokeInstrumentation
```

The unit tests cover trusted-origin boundaries and blocked URL schemes. The device smoke test exercises the live directory, search, business details, Android back, all four tabs, local profile save/reload, both themes, the native bridge, and business sign-in. It creates no customer account, check-in or payment; it writes and then removes a synthetic name in the emulator's local profile. Run it on a fresh test emulator rather than a personal profile.

Also check camera/photo picking, microphone permission denial and granting, JSON Save As, external link handoff, rotation and offline retry on a device. These depend on Android system UI and hardware capabilities.

For focused motion checks on a debug build, forward the running app's WebView devtools socket and run `node scripts/check-motion.mjs <port>`. This exercises press feedback, tab alignment, rapid navigation, ripple cleanup and reduced-motion emulation without editing profile data.

Run `node scripts/check-you.mjs <port>` for the You-screen regression checks. This checks node identity, unsaved drafts, focus/scroll stability, real intermediate theme colors, and reduced motion. Account submissions are intercepted with local mock responses to verify the selected endpoint and single submission without creating an account. Draft fields and theme are restored afterward; stored profile data is not modified.

`node scripts/check-controls.mjs <port> <adb.exe> <serial> real` checks an actual rental-form dropdown plus isolated validation, multi-select, keyboard and Back behavior. `node scripts/check-form-assistant.mjs <port>` checks partial-form handoff, draft retention, progress disclosure, small-screen/keyboard layouts and recovery from a mocked assistant error. Neither submits a check-in; assistant responses are mocked locally.
