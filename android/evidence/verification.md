# Device verification

Verified on 2026-10-31 using the Android Emulator with a Pixel 6 profile and Android 15 / API 35 Google APIs image (`Formify_Pixel`, `emulator-5554`).

- Debug APK builds successfully.
- Both unit tests pass, covering HTTPS origin boundaries and executable/private URL scheme blocking.
- Android lint passes with zero errors. Six advisory warnings remain: pinned library versions, intentional JavaScript support, adaptive-icon resource folder/monochrome recommendations, and an explicit legacy backup-setting recommendation (backup is disabled in the manifest).
- All 18 live Android integration checks pass; see `smoke-test.txt`.
- A synthetic JSON export generated through a detached JavaScript blob anchor opened the Android Save As picker and saved the exact JSON bytes to Downloads. The test file was removed afterward.
- Photo upload opened the Android chooser with Camera and Files. Camera capture returned a 72,985-byte JPEG to the WebView file input.
- Microphone permission denial and granting were exercised using the Android system permission dialog. Android reports `RECORD_AUDIO` granted. Actual audio capture returned `NotReadableError` because this emulator was started with `-no-audio`; voice recording/transcription still needs a device with an active microphone.
- Rotation to landscape and back preserves the running activity.
- Disabling both Wi-Fi and mobile data and relaunching shows the native offline screen. Re-enabling connectivity and tapping Try again reloads the live app.

No customer account, visit or payment was created by these checks. External URL classification is unit-tested; a real payment and external-app handoff were not exercised. Hardware scanning accuracy and AI response quality were not evaluated.

Screenshots: `warm-home.png`, `offline.png`, `save-file.png`.

## Connected phone

Installed the same debug APK on the connected Samsung SM-N960F, reporting Android 16 / API 36, on 2026-10-31. All 18 live integration checks passed on the physical phone; see `phone-smoke-test.txt`. The test was updated to accept either existing theme and restore the original local profile and theme after checking persistence. The test helper package was removed afterward and Formify was reopened. No account, check-in or payment was created.

## Motion polish, version 1.0.1

Built and installed on both devices. Android lint passes with zero errors. Seven focused motion checks pass on each device: a single installed stylesheet; press feedback, navigation, indicator alignment and direction for three tab routes; ripple/press cleanup; reduced-motion behavior; and rapid navigation without duplicate highlights. Direction follows the live DOM's tab order. See `phone-motion-checks.json` and `emulator-motion-checks.json`. These checks do not change saved profile data or theme. The final APK is copied to the workspace's `Formify-debug.apk`.

## Theme and You-screen fixes, version 1.0.2

Installed on both the connected phone and emulator. Five focused regression checks pass on each: account modes retain the same DOM, drafts and scroll; each mode submits once to the correct endpoint using mocked responses; theme changes interpolate through intermediate colors without replacing the screen or restarting its entrance animation; the header theme control updates Appearance in place; and reduced motion disables palette animation. The seven existing motion checks also pass on both devices. Lint passes with zero errors. No real account submissions were made. See `phone-you-checks.json` and `emulator-you-checks.json`.

## Custom controls and in-form assistant, version 1.0.5

The final update was tested on the emulator after the physical phone was unplugged. Eight custom-control checks pass: real form opening, quiet field focus, correct form values and event counts, Android Back, keyboard selection, required validation, searchable multi-select and backdrop cleanup. Seven in-form assistant checks pass: partial-form handoff without validation, footer/composer bounds, draft retention, a single mocked reply, a 320px layout, a keyboard-sized viewport and error recovery. See `emulator-controls-checks.json`, `emulator-assistant-checks.json`, `custom-picker.png` and `assistant-after.png`.

The APK installed on the phone before unplugging was version 1.0.3; subsequent keyboard, compatibility and assistant changes are available in the 1.0.5 release APK. No additional physical-phone testing is claimed for those later changes.
