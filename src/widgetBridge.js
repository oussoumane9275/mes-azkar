import { registerPlugin } from "@capacitor/core";

// Local, native-only plugin (no npm package) — see android/app/src/main/java/
// com/oussoumane/azkar/WidgetBridgePlugin.java. Pushes prayer-time inputs and
// today's azkar completion into SharedPreferences so the home-screen widget
// can read them; a no-op on platforms without the native side (web preview).
const WidgetBridge = registerPlugin("WidgetBridge");

export default WidgetBridge;
