# Formify Android demo

A roughly 50-second portrait demo filmed from the running Android 15 emulator with app version 1.0.2. The final export is `Formify-Demo.mp4`, also copied to the workspace root for sharing.

The walkthrough shows discovery, searching for ski rentals, browsing a business's forms, previewing a form, Assistant, in-place account-mode switching, and warm/blue palette transitions. No account or check-in is submitted, and no personal information is entered. Business information shown is the existing public demo content.

The edit uses the project's cream, forest and clay palette, Young Serif and Bricolage Grotesque typefaces, burned-in captions, crossfades, and an original locally synthesized ambient soundtrack. Font licenses are in `fonts/`. No third-party music or microphone recording is used.

`record-demo.mjs` drives the real app through its debug WebView and records the emulator screen with adb. `shots.json` contains the actual recorded timing. `edit-demo.mjs` crops Android's system bars, frames the footage on a branded 1080×1920 canvas, adds title/closing cards and captions, generates the original music bed, and exports H.264/AAC MP4 with fast-start metadata. `edit.json` records the final edit timing and encoding.

To reproduce, open the debug app on `emulator-5554`, forward its WebView devtools socket to localhost port 9222, and run from this directory:

```powershell
node record-demo.mjs C:/path/to/adb.exe emulator-5554
node edit-demo.mjs C:/path/to/ffmpeg.exe
```

The editor currently reads font sources from the local Formify tool directory before copying them into `fonts/`; adjust those two source paths if reproducing on another machine.
