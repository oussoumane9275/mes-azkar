// cordova-plugin-music-controls2 lives in node_modules (gitignored), so any
// hand-fix to its Java source is normally lost on a fresh `npm install`. This
// plugin needed two real fixes for this app to work on Android 13/14:
//   1. context.registerReceiver() calls in initialize() crashed the app on
//      every single launch on API 33+ without an exported/not-exported flag.
//   2. PendingIntent.getBroadcast() for the play/pause/prev/next/dismiss
//      actions crashed the app the moment Quran playback started on API 34+
//      (FLAG_MUTABLE is disallowed for an implicit Intent as of Android 14).
// This script copies the already-patched source files (tracked in
// native-patches/) back over the plugin's copy in node_modules, every time
// `npm install` runs, via the "postinstall" script in package.json.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PATCH_DIR = path.join(__dirname, "..", "native-patches", "cordova-plugin-music-controls2");
const TARGET_DIR = path.join(__dirname, "..", "node_modules", "cordova-plugin-music-controls2", "src", "android");

if (!fs.existsSync(TARGET_DIR)) {
  console.log("apply-native-patches: cordova-plugin-music-controls2 not installed, skipping.");
  process.exit(0);
}

for (const file of fs.readdirSync(PATCH_DIR)) {
  fs.copyFileSync(path.join(PATCH_DIR, file), path.join(TARGET_DIR, file));
  console.log("apply-native-patches: patched " + file);
}
