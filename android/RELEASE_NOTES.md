# Formify for Android 1.0.5

Download `Formify-Android-v1.0.5.apk` from this release to install or update the app. This is a signed debug APK for direct installation, supporting Android 8.0 and later.

This update replaces the system dropdown selector with a themed bottom sheet, softens text-field focus, and redesigns the in-form assistant with a compact header, collapsible progress and a stable composer. Partial answers are preserved when switching between a form and its assistant. Opening the assistant no longer triggers validation on unfinished fields.

It also includes sliding navigation highlights, press/ripple feedback, smooth warm/blue palette transitions, and in-place account-mode switching in You. Reduced-motion settings are respected.

Validation: the Gradle wrapper build, both unit tests and Android lint pass. The final APK passes 27 focused emulator checks across motion, account/theme state, custom controls and the in-form assistant, including narrow and keyboard-sized layouts. Earlier builds were also tested on the connected Samsung SM-N960F; the final update was tested on the emulator after the phone was unplugged.

Release files:

- `Formify-Android-v1.0.5.apk`: installable Android app.
- `Formify-Demo.mp4`: edited 50-second portrait demo, filmed with version 1.0.2 before the later dropdown and in-form chat refinements.
- `Formify-Demo-Project.zip`: original footage, editable recording/editing scripts, fonts and licenses, caption sources and intermediate production files.
- `SHA256SUMS.txt`: checksums for the downloadable files.

The repository includes the Android source, original web/backend source, build instructions, verification scripts and screenshots. The live website/backend is still used by the app; this release does not deploy or change that hosted service.
