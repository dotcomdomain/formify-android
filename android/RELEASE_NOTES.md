# Formify for Android 1.0.6

Download `Formify-Android-v1.0.6-release.apk` for Android 8.0 and later.

- Updated launcher and native loading-screen branding from the supplied Formify SVG.
- Removed the white tile behind the website's browser tab icon.
- Merged the latest website and backend source, including document import, live CRM insights, browser-only demo mode, the unofficial Snow Valley mock form, approval requests and invitations.
- Updated Android's document picker to support PDF, DOCX and the other import formats. Camera capture remains available for image-only inputs.
- Preserved the app's custom controls, theme transitions, draft handling and assistant layout.

This is a release build, signed with a new private release key. The previous 1.0.5
APK used a different debug certificate, so Android cannot update that installation
in place. Export any local information you need before uninstalling the older app.
The new private key and its credentials are stored outside Git and are not included
in the download.

The app continues to use the live Formify website and backend. Saved details are
not an offline copy of online forms. Demo mode uses fictional data and does not
contact customers or charge payments.

Validated with five Android unit tests, release lint, 32 JavaScript tests and seven
Python tests. APK signature and ZIP alignment checks passed. The bundled client
scripts match the merged source. This release has not been tested on a device.

Release certificate SHA-256:
`21630d39f3d15eb84e5382e8c06c8cda3c763575846ca8418f2c88d92eaec51a`
