import React, { useState, useEffect, useRef, useCallback } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { StatusBar, Style as StatusBarStyle } from "@capacitor/status-bar";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { BackgroundMode } from "@anuradev/capacitor-background-mode";
import WidgetBridge from "./widgetBridge.js";
import { t, LANGUAGES, currentLanguage, setCurrentLanguage, isRTL, trField, detectSystemLanguage } from "./i18n.js";
import { exportBackup, importBackup, downloadBackupFile } from "./backup.js";
import { fetchMushafPage, loadMushafPageFont, fetchChapterStartPage, fetchVersePage } from "./quranFoundation.js";
import {
  isNotificationPermissionGranted,
  requestNotificationPermission,
  syncPrayerNotifications,
  cancelPrayerNotifications,
  ADHAN_VOICES,
  DEFAULT_MUEZZIN,
} from "./notifications.js";

/* ------------------------------------------------------------------ */
/* Design tokens — light/dark themes                                   */
/* ------------------------------------------------------------------ */
const LIGHT_COLORS = {
  bg: "#FBF7EC",
  surfaceTint: "#F1E6CC",
  parchment: "#FFFDF7",
  parchmentDark: "#E7DABB",
  ink: "#2B2314",
  inkSoft: "#7C6F55",
  inkFaint: "#AFA48A",
  gold: "#8C6329",
  goldLight: "#B3813A",
  indigo: "#3B4B6B",
  indigoLight: "#7A8CB0",
  clay: "#B5654A",
  clayLight: "#C98872",
  violet: "#5B4B7A",
  violetLight: "#8574A3",
};
const DARK_COLORS = {
  bg: "#17140F",
  surfaceTint: "#2B251C",
  parchment: "#221D16",
  parchmentDark: "#3A3226",
  ink: "#F4EDDD",
  inkSoft: "#B4A996",
  inkFaint: "#75695A",
  gold: "#DDB46A",
  goldLight: "#F0CE8C",
  indigo: "#8C9DC2",
  indigoLight: "#B0BEDD",
  clay: "#DC9575",
  clayLight: "#E7B69D",
  violet: "#B4A0D9",
  violetLight: "#CFC2E8",
};

// Alternate accent hues — each swaps in for gold/goldLight on top of the
// light/dark base palette, so the rest of the design (parchment, ink,
// category colors) stays untouched no matter which one is picked.
const ACCENT_PALETTES = {
  gold: { light: { gold: "#8C6329", goldLight: "#B3813A" }, dark: { gold: "#DDB46A", goldLight: "#F0CE8C" } },
  rouge: { light: { gold: "#A3453A", goldLight: "#C65B52" }, dark: { gold: "#E08478", goldLight: "#F2B0A6" } },
  rose: { light: { gold: "#A34578", goldLight: "#C15B94" }, dark: { gold: "#E084B8", goldLight: "#F2B0D6" } },
  bleu: { light: { gold: "#3A5F9A", goldLight: "#4A72B5" }, dark: { gold: "#7CA0DE", goldLight: "#A8C2ED" } },
  vert: { light: { gold: "#3D7A55", goldLight: "#4E8C6B" }, dark: { gold: "#7BC298", goldLight: "#A8DABE" } },
  lavande: { light: { gold: "#5E4D9E", goldLight: "#8B7BC4" }, dark: { gold: "#B0A0E0", goldLight: "#CFC3ED" } },
  turquoise: { light: { gold: "#2A7A73", goldLight: "#3FA8A0" }, dark: { gold: "#5FC9C0", goldLight: "#92DED8" } },
  corail: { light: { gold: "#A85536", goldLight: "#D97B5C" }, dark: { gold: "#EDA085", goldLight: "#F4C2AE" } },
  miel: { light: { gold: "#8A6B1A", goldLight: "#D9A93F" }, dark: { gold: "#EFC96A", goldLight: "#F5DB9E" } },
  taupe: { light: { gold: "#5C574C", goldLight: "#8A8377" }, dark: { gold: "#B0AA9C", goldLight: "#CFC9BC" } },
};
const ACCENT_LABELS_BY_LANG = {
  fr: { gold: "Doré", rouge: "Rouge", rose: "Rose", bleu: "Bleu", vert: "Vert", lavande: "Lavande", turquoise: "Turquoise", corail: "Corail", miel: "Miel", taupe: "Taupe" },
  en: { gold: "Gold", rouge: "Red", rose: "Pink", bleu: "Blue", vert: "Green", lavande: "Lavender", turquoise: "Turquoise", corail: "Coral", miel: "Honey", taupe: "Taupe" },
  ar: { gold: "ذهبي", rouge: "أحمر", rose: "وردي", bleu: "أزرق", vert: "أخضر", lavande: "أرجواني", turquoise: "فيروزي", corail: "مرجاني", miel: "عسلي", taupe: "بني رمادي" },
};
function accentLabels() {
  return ACCENT_LABELS_BY_LANG[currentLanguage] || ACCENT_LABELS_BY_LANG.fr;
}
// Like trField(item, "label"), but also supports a genuine Arabic override
// (item.label_ar) for UI-chrome labels — unlike scripture/azkar content,
// category names like "Sommeil" or "Mariage" should read in Arabic too when
// the app is in Arabic mode, not fall back to French.
function localField(item, field) {
  const arKey = `${field}_ar`;
  if (currentLanguage === "ar" && item[arKey]) return item[arKey];
  return trField(item, field);
}

function localLabel(item) {
  return localField(item, "label");
}

// A mutable, shared object — components read `COLORS.xxx` at render time, so
// swapping its contents (instead of reassigning the binding) is enough to
// re-theme the whole tree once something triggers a re-render.
const COLORS = { ...LIGHT_COLORS };
let currentTheme = "light";
let currentAccent = "gold";
const themeListeners = new Set();

function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function applyTheme(theme) {
  currentTheme = theme;
  Object.assign(COLORS, theme === "dark" ? DARK_COLORS : LIGHT_COLORS);
  const accentPalette = ACCENT_PALETTES[currentAccent] || ACCENT_PALETTES.gold;
  Object.assign(COLORS, theme === "dark" ? accentPalette.dark : accentPalette.light);
  // Explicitly assert which scheme is active — otherwise some Android
  // WebViews/browsers "helpfully" force-invert a page they assume is
  // light-only when the OS is in dark mode, muddying our own palette.
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.style.colorScheme = theme;
  }
  themeListeners.forEach((fn) => fn());
}
function applyAccent(accent) {
  currentAccent = ACCENT_PALETTES[accent] ? accent : "gold";
  applyTheme(currentTheme);
}
if (prefersDark()) applyTheme("dark");

// Global on/off switch for the light haptic tap feedback (tasbih, bead
// ring) — read by the bare tapHaptic() function below, which is called
// directly from dozens of places rather than through a hook.
let hapticsEnabledFlag = true;
function setHapticsEnabledFlag(enabled) {
  hapticsEnabledFlag = enabled;
}

// Keeps the native status bar's icon color and background in sync with the
// active theme — a no-op on web where the plugin has nothing to control.
function syncStatusBar(theme) {
  const colors = theme === "dark" ? DARK_COLORS : LIGHT_COLORS;
  StatusBar.setStyle({ style: theme === "dark" ? StatusBarStyle.Light : StatusBarStyle.Dark }).catch(() => {});
  StatusBar.setBackgroundColor({ color: colors.bg }).catch(() => {});
}

// Light tap feedback for repetitive counters (tasbih, azkar bead ring) —
// a no-op on platforms/browsers without a haptics engine.
function tapHaptic() {
  if (!hapticsEnabledFlag) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

// Keeps Quran/azkar audio playing after the app is backgrounded — a WebView
// audio element alone gets suspended by Android once the app loses focus.
// BackgroundMode.enable() starts a foreground service (with its own small
// persistent notification) that keeps the JS/audio alive; reference-counted
// so overlapping play calls don't fight over enabling/disabling it.
let activeAudioCount = 0;
function notifyAudioStart() {
  activeAudioCount += 1;
  if (activeAudioCount === 1) {
    BackgroundMode.enable().catch(() => {});
  }
}
function notifyAudioStop() {
  activeAudioCount = Math.max(0, activeAudioCount - 1);
  if (activeAudioCount === 0) {
    BackgroundMode.disable().catch(() => {});
  }
}

// Registers playback with the OS-level Media Session — this is what actually
// keeps Android/Chrome from silently suspending an <audio> element once the
// screen locks (the foreground service above keeps the process alive, but a
// media session is what tells the WebView "this is real, ongoing media
// playback, don't throttle it"). It also draws the lock-screen playback
// controls for free.
function updateMediaSession({ title, artist, playing, onPause, onNext }) {
  if (typeof navigator === "undefined" || !navigator.mediaSession) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || "Mes Azkar",
      artist: artist || "Mes Azkar",
    });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("pause", onPause || null);
    navigator.mediaSession.setActionHandler("stop", onPause || null);
    navigator.mediaSession.setActionHandler("nexttrack", onNext || null);
  } catch (e) {
    // Media Session unsupported on this WebView — non-critical
  }
}
function clearMediaSession() {
  if (typeof navigator === "undefined" || !navigator.mediaSession) return;
  try {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.setActionHandler("play", null);
    navigator.mediaSession.setActionHandler("pause", null);
    navigator.mediaSession.setActionHandler("stop", null);
    navigator.mediaSession.setActionHandler("nexttrack", null);
  } catch (e) {
    // non-critical
  }
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}
// rgba() of the *current* theme's ink color at a given opacity — used for
// subtle card backgrounds/borders/inactive-state tints so they adapt too.
function inkA(opacity) {
  const { r, g, b } = hexToRgb(COLORS.ink);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const FONT_STYLE = `
.font-arabic { font-family: 'Amiri', serif; }
.font-display { font-family: 'Manrope', sans-serif; }
.font-ui { font-family: 'Manrope', sans-serif; }
@keyframes beadPulse { 0% { transform: scale(1); } 40% { transform: scale(1.08); } 100% { transform: scale(1); } }
.bead-pulse { animation: beadPulse 0.28s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.fade-in { animation: fadeIn 0.35s ease; }
@keyframes tourIconPop { 0% { opacity: 0; transform: scale(0.6) rotate(-8deg); } 60% { transform: scale(1.08) rotate(2deg); } 100% { opacity: 1; transform: scale(1) rotate(0deg); } }
.tour-icon-pop { animation: tourIconPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes tourSlideIn { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: translateX(0); } }
.tour-slide-in { animation: tourSlideIn 0.35s ease; }
@keyframes tourGlow { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.tour-glow { animation: tourGlow 2.4s ease-in-out infinite; }
`;

/* ------------------------------------------------------------------ */
/* Prayer times — configurable location + calculation method           */
/* ------------------------------------------------------------------ */
const DEFAULT_LOCATION = { label: "Boulogne-Billancourt", lat: 48.8375, lng: 2.2429, source: "default" };

// Angle presets for the main calculation authorities, plus a free-form
// "custom" entry so anyone can dial in their own Fajr/Isha angle.
const CALC_METHODS = {
  gmp: {
    label: "Grande Mosquée de Paris",
    label_en: "Grand Mosque of Paris",
    fajrAngle: 16,
    ishaAngle: 15,
    // Small safety margins the Grande Mosquée de Paris applies on top of the raw astronomical times
    offsetMin: { fajr: 0, sunrise: 0, dhuhr: 5, asr: 1, maghrib: 4, isha: 0 },
  },
  mwl: { label: "Ligue Islamique Mondiale", label_en: "Muslim World League", fajrAngle: 18, ishaAngle: 17, offsetMin: {} },
  isna: { label: "ISNA (Amérique du Nord)", label_en: "ISNA (North America)", fajrAngle: 15, ishaAngle: 15, offsetMin: {} },
  egyptian: { label: "Autorité égyptienne", label_en: "Egyptian Authority", fajrAngle: 19.5, ishaAngle: 17.5, offsetMin: {} },
  karachi: { label: "Université de Karachi", label_en: "University of Karachi", fajrAngle: 18, ishaAngle: 18, offsetMin: {} },
  ummalqura: { label: "Umm al-Qura (La Mecque)", label_en: "Umm al-Qura (Mecca)", fajrAngle: 18.5, ishaMinutesAfterMaghrib: 90, offsetMin: {} },
  custom: { label: "Personnalisée", label_en: "Custom", fajrAngle: null, ishaAngle: null, offsetMin: {} },
};
const DEFAULT_PRAYER_METHOD = "gmp";
const CUSTOM_ANGLE_DEFAULTS = { fajrAngle: 16, ishaAngle: 15 };
const CUSTOM_ANGLE_MIN = 10;
const CUSTOM_ANGLE_MAX = 20;
// Per-prayer minute nudge on top of the astronomical calculation — lets
// someone calibrate the custom method to match their mosque's posted times
// exactly, once, and have it keep advancing correctly every day afterwards
// (the same offset is just re-applied to each new day's raw calculation).
// Calibrated once against la mosquée L'Olivier (Boulogne-Billancourt) —
// Fajr 05:23, Chourouk 06:49, Dhuhr 14:00, Asr 17:48, Maghrib 21:01, Isha
// 22:28 on 19/08/2026 — so the custom method matches it out of the box.
// Whether the adhan reminder is on for each individual prayer — toggled
// directly from the bell under each prayer time on the home screen, not just
// a single global on/off switch.
const NOTIFY_PRAYERS_DEFAULT = { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true };
const MUEZZIN_BY_PRAYER_DEFAULT = {
  fajr: DEFAULT_MUEZZIN,
  dhuhr: DEFAULT_MUEZZIN,
  asr: DEFAULT_MUEZZIN,
  maghrib: DEFAULT_MUEZZIN,
  isha: DEFAULT_MUEZZIN,
};
const CUSTOM_OFFSET_DEFAULTS = { fajr: 22, sunrise: -1, dhuhr: 5, asr: -1, maghrib: 1, isha: -12 };
const CUSTOM_OFFSET_MIN = -30;
const CUSTOM_OFFSET_MAX = 30;
// Minutes between adhan and iqama (start of the congregational prayer) —
// purely informational, shown as "+N" next to the adhan time, independent of
// the calculation method. Defaults match la mosquée L'Olivier.
const IQAMA_OFFSET_DEFAULTS = { fajr: 10, dhuhr: 10, asr: 10, maghrib: 5, isha: 10 };
const IQAMA_OFFSET_MIN = 0;
const IQAMA_OFFSET_MAX = 60;

// Resolves a stored { method, customFajrAngle, customIshaAngle, customOffsets }
// settings object into the { fajrAngle, ishaAngle, offsetMin } shape
// computePrayerTimesDecimal needs
function resolveCalcConfig(prayerSettings) {
  const method = (prayerSettings && prayerSettings.method) || DEFAULT_PRAYER_METHOD;
  if (method === "custom") {
    return {
      fajrAngle: prayerSettings.customFajrAngle ?? CUSTOM_ANGLE_DEFAULTS.fajrAngle,
      ishaAngle: prayerSettings.customIshaAngle ?? CUSTOM_ANGLE_DEFAULTS.ishaAngle,
      offsetMin: { ...CUSTOM_OFFSET_DEFAULTS, ...(prayerSettings.customOffsets || {}) },
    };
  }
  return CALC_METHODS[method] || CALC_METHODS[DEFAULT_PRAYER_METHOD];
}

const _fixAngle = (a) => { a = a - 360 * Math.floor(a / 360); return a < 0 ? a + 360 : a; };
const _fixHour = (a) => { a = a - 24 * Math.floor(a / 24); return a < 0 ? a + 24 : a; };
const _dsin = (d) => Math.sin((d * Math.PI) / 180);
const _dcos = (d) => Math.cos((d * Math.PI) / 180);
const _dtan = (d) => Math.tan((d * Math.PI) / 180);
const _darcsin = (x) => (Math.asin(Math.max(-1, Math.min(1, x))) * 180) / Math.PI;
const _darccos = (x) => (Math.acos(Math.max(-1, Math.min(1, x))) * 180) / Math.PI;
const _darctan2 = (y, x) => (Math.atan2(y, x) * 180) / Math.PI;
const _darccot = (x) => _darctan2(1, x);

function _julianDate(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}
function _sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = _fixAngle(357.529 + 0.98560028 * D);
  const q = _fixAngle(280.459 + 0.98564736 * D);
  const L = _fixAngle(q + 1.915 * _dsin(g) + 0.02 * _dsin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = _darctan2(_dcos(e) * _dsin(L), _dcos(L)) / 15;
  const eqt = q / 15 - _fixHour(RA);
  const decl = _darcsin(_dsin(e) * _dsin(L));
  return { declination: decl, eqt };
}
function _hourAngle(angle, lat, decl) {
  const val = (-_dsin(angle) - _dsin(lat) * _dsin(decl)) / (_dcos(lat) * _dcos(decl));
  return _darccos(val) / 15;
}
function _asrHourAngle(lat, decl, factor) {
  const angle = -_darccot(factor + _dtan(Math.abs(lat - decl)));
  return _hourAngle(angle, lat, decl);
}

// Returns { fajr, sunrise, dhuhr, asr, maghrib, isha } as decimal hours (local time) for the given Date
function computePrayerTimesDecimal(date, { lat, lng } = DEFAULT_LOCATION, calc = CALC_METHODS[DEFAULT_PRAYER_METHOD]) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const tz = -date.getTimezoneOffset() / 60; // local UTC offset, DST-aware
  const jd = _julianDate(year, month, day) - lng / (15 * 24);
  const { declination: decl, eqt } = _sunPosition(jd + 0.5);
  const dhuhr = _fixHour(12 - eqt);
  const fajrT = _hourAngle(calc.fajrAngle, lat, decl);
  const sunsetT = _hourAngle(0.833, lat, decl);
  const asrT = _asrHourAngle(lat, decl, 1);
  const tzAdjust = tz - lng / 15;
  const adj = (t) => t + tzAdjust;
  const offset = calc.offsetMin || {};

  const maghrib = adj(dhuhr + sunsetT) + (offset.maghrib || 0) / 60;
  const isha =
    calc.ishaMinutesAfterMaghrib != null
      ? maghrib + calc.ishaMinutesAfterMaghrib / 60
      : adj(dhuhr + _hourAngle(calc.ishaAngle, lat, decl)) + (offset.isha || 0) / 60;

  return {
    fajr: adj(dhuhr - fajrT) + (offset.fajr || 0) / 60,
    sunrise: adj(dhuhr - sunsetT) + (offset.sunrise || 0) / 60,
    dhuhr: adj(dhuhr) + (offset.dhuhr || 0) / 60,
    asr: adj(dhuhr + asrT) + (offset.asr || 0) / 60,
    maghrib,
    isha,
  };
}

const _fmtHour = (t) => {
  t = ((t % 24) + 24) % 24;
  let totalMinutes = Math.round(t * 60) % (24 * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const PRAYER_LABELS = [
  { key: "fajr", label: "Fajr", label_ar: "الفجر" },
  { key: "sunrise", label: "Chourouk", label_en: "Sunrise", label_ar: "الشروق" },
  { key: "dhuhr", label: "Dohr", label_en: "Dhuhr", label_ar: "الظهر" },
  { key: "asr", label: "Asr", label_ar: "العصر" },
  { key: "maghrib", label: "Maghrib", label_ar: "المغرب" },
  { key: "isha", label: "Isha", label_ar: "العشاء" },
];
function prayerLabel(p) {
  if (currentLanguage === "ar" && p.label_ar) return p.label_ar;
  if (currentLanguage === "en" && p.label_en) return p.label_en;
  return p.label;
}

// Today's prayer times as formatted strings, plus which one is next
function usePrayerTimes(location, prayerSettings) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const calc = resolveCalcConfig(prayerSettings);
  const decimals = computePrayerTimesDecimal(now, location || DEFAULT_LOCATION, calc);
  const nowDecimal = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  let nextKey = null;
  let nextDecimal = null;
  for (const p of PRAYER_LABELS) {
    if (decimals[p.key] > nowDecimal) {
      nextKey = p.key;
      nextDecimal = decimals[p.key];
      break;
    }
  }
  if (!nextKey) {
    // After Isha, the next event is tomorrow's Fajr — recompute for tomorrow's
    // date since angles/DST can shift it slightly from today's value.
    nextKey = "fajr";
    const tomorrow = new Date(now.getTime() + 86400000);
    nextDecimal = computePrayerTimesDecimal(tomorrow, location || DEFAULT_LOCATION, calc).fajr + 24;
  }
  const minutesRemaining = Math.max(0, Math.round((nextDecimal - nowDecimal) * 60));

  const times = PRAYER_LABELS.map((p) => ({ ...p, label: prayerLabel(p), time: _fmtHour(decimals[p.key]) }));
  return { times, nextKey, minutesRemaining };
}

function formatCountdown(mins) {
  if (mins < 1) return t("less_than_1_min");
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} ${t("min_short")}`;
  return `${h} ${t("hour_short")} ${String(m).padStart(2, "0")} ${t("min_short")}`;
}

// Wraps text to fit maxWidth on the given 2D context, splitting on spaces —
// works for both Latin and Arabic since both scripts use spaces between words.
function wrapCanvasText(ctx, text, maxWidth) {
  const words = (text || "").split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Renders an azkar/verse card to a PNG and hands it to the OS share sheet —
// lets someone send a verse straight to WhatsApp/Instagram instead of just
// copying text. Falls back to opening the image in a new tab (savable via
// long-press) on WebViews that don't support navigator.share with files.
async function shareAzkarAsImage({ title, arabic, translation }) {
  try {
    await document.fonts.ready;
  } catch (e) {
    // proceed anyway with whatever fonts are already available
  }

  const W = 1080;
  const PAD = 90;
  const contentWidth = W - PAD * 2;

  // Measurement pass on a throwaway canvas to know how tall the real one needs to be.
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = "52px Amiri, serif";
  const arabicLines = wrapCanvasText(measure, arabic, contentWidth);
  let translationLines = [];
  if (translation) {
    measure.font = "italic 30px Lora, serif";
    translationLines = wrapCanvasText(measure, translation, contentWidth - 40);
  }

  const titleY = 150;
  const arabicStartY = titleY + 110;
  const arabicLineHeight = 92;
  const afterArabicY = arabicStartY + arabicLines.length * arabicLineHeight;
  const translationLineHeight = 46;
  const translationBlockHeight = translationLines.length ? 50 + translationLines.length * translationLineHeight : 0;
  const H = Math.max(720, afterArabicY + translationBlockHeight + 160);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#FCFAF5";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#D9A94A";
  ctx.lineWidth = 4;
  ctx.strokeRect(28, 28, W - 56, H - 56);

  if (title) {
    ctx.fillStyle = "#B8863A";
    ctx.font = "600 32px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.direction = "ltr";
    ctx.fillText(title.toUpperCase(), W / 2, titleY);
  }

  ctx.fillStyle = "#23291F";
  ctx.font = "52px Amiri, serif";
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  let y = arabicStartY;
  arabicLines.forEach((line) => {
    ctx.fillText(line, W / 2, y);
    y += arabicLineHeight;
  });

  if (translationLines.length) {
    y = afterArabicY + 50;
    ctx.fillStyle = "#6B6558";
    ctx.font = "italic 30px Lora, serif";
    ctx.direction = "ltr";
    translationLines.forEach((line) => {
      ctx.fillText(line, W / 2, y);
      y += translationLineHeight;
    });
  }

  ctx.fillStyle = "#D9A94A";
  ctx.font = "600 26px Inter, sans-serif";
  ctx.direction = "ltr";
  ctx.fillText("أذكاري · Mes Azkar", W / 2, H - 55);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return false;

  if (navigator.share) {
    try {
      const file = new File([blob], "azkar.png", { type: "image/png" });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: title || "Mes Azkar" });
        return true;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return false; // user cancelled the share sheet
      // fall through to the new-tab fallback below
    }
  }
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  return false;
}

/* ------------------------------------------------------------------ */
/* Content — Hisnul Muslim style azkar (morning / evening / after prayer) */
/* ------------------------------------------------------------------ */
// Ayat al-Kursi and the last 3 sourates are actual Quran text, so their audio
// comes straight from the same reciter CDN the Coran section uses (Alafasy,
// a well-known reciter) rather than a recorded voice note.
const AL_IKHLAS = {
  title: "Sourate Al-Ikhlās",
  title_en: "Surah Al-Ikhlas",
  arabic:
    "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ قُلْ هُوَ اللَّهُ أَحَدٌ ﴿١﴾ اللَّهُ الصَّمَدُ ﴿٢﴾ لَمْ يَلِدْ وَلَمْ يُولَدْ ﴿٣﴾ وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ ﴿٤﴾",
  translation:
    "Dis : Il est Allah, Unique. Allah, Le Suffisant, Celui dont tout dépend. Il n'a pas engendré et n'a pas été engendré, et rien ni personne ne Lui est comparable.",
  translation_en:
    "Say, He is Allah, [who is] One, Allah, the Eternal Refuge. He neither begets nor is born, nor is there to Him any equivalent.",
  audio: "https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/112.mp3",
};
const AL_FALAQ = {
  title: "Sourate Al-Falaq",
  title_en: "Surah Al-Falaq",
  arabic:
    "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ﴿١﴾ مِنْ شَرِّ مَا خَلَقَ ﴿٢﴾ وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ ﴿٣﴾ وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ﴿٤﴾ وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ ﴿٥﴾",
  translation:
    "Dis : Je cherche protection auprès du Seigneur de l'aube naissante, contre le mal de ce qu'Il a créé, contre le mal de l'obscurité quand elle s'installe, contre le mal de celles qui soufflent sur les nœuds, et contre le mal de l'envieux quand il envie.",
  translation_en:
    "Say, I seek refuge in the Lord of daybreak, from the evil of that which He created, and from the evil of darkness when it settles, and from the evil of the blowers in knots, and from the evil of an envier when he envies.",
  audio: "https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/113.mp3",
};
const AN_NAS = {
  title: "Sourate An-Nās",
  title_en: "Surah An-Nas",
  arabic:
    "قُلْ أَعُوذُ بِرَبِّ النَّاسِ ﴿١﴾ مَلِكِ النَّاسِ ﴿٢﴾ إِلَٰهِ النَّاسِ ﴿٣﴾ مِنْ شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ﴿٤﴾ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ ﴿٥﴾ مِنَ الْجِنَّةِ وَالنَّاسِ ﴿٦﴾",
  translation:
    "Dis : Je cherche protection auprès du Seigneur des hommes, le Souverain des hommes, le Dieu des hommes, contre le mal du murmure furtif — celui qui souffle le mal dans les cœurs des hommes — qu'il vienne des djinns ou des hommes.",
  translation_en:
    "Say, I seek refuge in the Lord of mankind, the Sovereign of mankind, the God of mankind, from the evil of the retreating whisperer who whispers [evil] into the breasts of mankind, from among the jinn and mankind.",
  audio: "https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/114.mp3",
};
const AYAT_AL_KURSI = {
  title: "Āyat al-Kursī",
  title_en: "Ayat al-Kursi (the Throne Verse)",
  arabic:
    "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَن ذَا الَّذِي يَشْفَعُ عِندَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ",
  translation:
    "Allah, il n'y a de divinité que Lui, le Vivant, Celui qui subsiste par Lui-même. Ni somnolence ni sommeil ne Le saisissent. À Lui appartient tout ce qui est dans les cieux et sur la terre. Qui peut intercéder auprès de Lui sans Sa permission ? Il connaît leur passé et leur avenir, et nul n'embrasse de Sa science que ce qu'Il veut. Son Trône s'étend sur les cieux et la terre, dont la garde ne Lui coûte aucune peine. Et Il est le Très-Haut, l'Immense.",
  translation_en:
    "Allah - there is no deity except Him, the Ever-Living, the Sustainer of [all] existence. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth. Who is it that can intercede with Him except by His permission? He knows what is [presently] before them and what will be after them, and they encompass not a thing of His knowledge except for what He wills. His Kursi extends over the heavens and the earth, and their preservation tires Him not. And He is the Most High, the Most Great.",
  audio: "https://cdn.islamic.network/quran/audio/128/ar.alafasy/262.mp3",
};
const SAYYID_ISTIGHFAR = {
  title: "Sayyid al-Istighfār",
  title_en: "Sayyid al-Istighfar (the master supplication for forgiveness)",
  arabic:
    "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَىٰ عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ",
  translation:
    "Ô Allah, Tu es mon Seigneur, il n'y a de divinité que Toi. Tu m'as créé et je suis Ton serviteur. Je m'efforce de tenir mon engagement envers Toi autant que je le peux. Je cherche refuge auprès de Toi contre le mal que j'ai commis. Je reconnais devant Toi Tes bienfaits sur moi et je reconnais mon péché : pardonne-moi, car nul ne pardonne les péchés sinon Toi.",
  translation_en:
    "O Allah, You are my Lord, none has the right to be worshipped except You. You created me and I am Your servant, and I abide to Your covenant and promise as best I can. I take refuge in You from the evil of which I have committed. I acknowledge Your favour upon me and I acknowledge my sin, so forgive me, for verily none can forgive sin except You.",
};
const HASBIYALLAH = {
  title: "Allah me suffit",
  title_en: "Allah is sufficient for me",
  arabic: "حَسْبِيَ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ، عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ",
  translation:
    "Allah me suffit, il n'y a de divinité que Lui. En Lui je place ma confiance, et Il est le Seigneur du Trône immense.",
  translation_en:
    "Allah is sufficient for me, none has the right to be worshipped except Him, upon Him I rely and He is Lord of the exalted throne.",
};
const AFINI = {
  title: "Santé et protection",
  title_en: "Health and well-being",
  arabic:
    "اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَٰهَ إِلَّا أَنْتَ. اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْكُفْرِ وَالْفَقْرِ، وَأَعُوذُ بِكَ مِنْ عَذَابِ الْقَبْرِ، لَا إِلَٰهَ إِلَّا أَنْتَ",
  translation:
    "Ô Allah, accorde-moi la santé dans mon corps, dans mon ouïe, dans ma vue. Il n'y a de divinité que Toi. Ô Allah, je cherche protection auprès de Toi contre la mécréance, la pauvreté, et le châtiment de la tombe. Il n'y a de divinité que Toi.",
  translation_en:
    "O Allah, grant my body health, O Allah, grant my hearing health, O Allah, grant my sight health. None has the right to be worshipped except You. O Allah, I take refuge with You from disbelief and poverty, and I take refuge with You from the punishment of the grave. None has the right to be worshipped except You.",
};
const LA_ILAHA = {
  title: "Attestation d'unicité",
  title_en: "Testimony of Allah's oneness",
  arabic:
    "لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
  translation:
    "Il n'y a de divinité qu'Allah, Seul, sans associé. À Lui le règne, à Lui la louange, et Il est capable de toute chose.",
  translation_en:
    "None has the right to be worshipped except Allah, alone, without partner, to Him belongs all sovereignty and praise, and He is over all things omnipotent.",
};
const SUBHANALLAHI_BIHAMDIHI = {
  title: "Gloire et louange à Allah",
  title_en: "Glory and praise be to Allah",
  arabic: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ",
  translation: "Gloire et pureté à Allah, et louange à Lui.",
  translation_en: "How perfect Allah is and I praise Him.",
};
const USHHIDUKA = {
  title: "Prendre Allah à témoin",
  title_en: "Calling Allah to witness",
  arabic:
    "اللَّهُمَّ إِنِّي أَصْبَحْتُ أُشْهِدُكَ، وَأُشْهِدُ حَمَلَةَ عَرْشِكَ، وَمَلَائِكَتَكَ، وَجَمِيعَ خَلْقِكَ، أَنَّكَ أَنْتَ اللَّهُ لَا إِلَٰهَ إِلَّا أَنْتَ وَحْدَكَ لَا شَرِيكَ لَكَ، وَأَنَّ مُحَمَّدًا عَبْدُكَ وَرَسُولُكَ",
  translation:
    "Ô Allah, je Te prends à témoin, ainsi que les porteurs de Ton Trône, Tes anges et toute Ta création, que Tu es Allah, il n'y a de divinité que Toi, Seul, sans associé, et que Muhammad est Ton serviteur et Ton messager.",
  translation_en:
    "O Allah, verily I have reached the morning and call on You, the bearers of Your throne, Your angels, and all of Your creation to witness that You are Allah, none has the right to be worshipped except You, alone, without partner, and that Muhammad is Your servant and Messenger.",
};
const NIMAH = {
  title: "Reconnaissance des bienfaits",
  title_en: "Acknowledging Allah's blessings",
  arabic:
    "اللَّهُمَّ مَا أَصْبَحَ بِي مِنْ نِعْمَةٍ أَوْ بِأَحَدٍ مِنْ خَلْقِكَ فَمِنْكَ وَحْدَكَ لَا شَرِيكَ لَكَ، فَلَكَ الْحَمْدُ وَلَكَ الشُّكْرُ",
  translation:
    "Ô Allah, tout bienfait dont je jouis ce matin, ou dont jouit l'une de Tes créatures, vient de Toi Seul, sans associé. À Toi la louange et à Toi la gratitude.",
  translation_en:
    "O Allah, what blessing I or any of Your creation have risen upon, is from You alone, without partner, so for You is all praise and unto You all thanks.",
};
const AFWU_AFIYA = {
  title: "Pardon et protection",
  title_en: "Pardon and well-being",
  arabic:
    "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ، اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي دِينِي وَدُنْيَايَ وَأَهْلِي وَمَالِي، اللَّهُمَّ احْفَظْنِي مِنْ بَيْنِ يَدَيَّ وَمِنْ خَلْفِي وَعَنْ يَمِينِي وَعَنْ شِمَالِي وَمِنْ فَوْقِي، وَأَعُوذُ بِعَظَمَتِكَ أَنْ أُغْتَالَ مِنْ تَحْتِي",
  translation:
    "Ô Allah, je Te demande le pardon et la préservation en cette vie et dans l'au-delà, dans ma religion, mon existence, ma famille et mes biens. Ô Allah, protège-moi de devant moi, de derrière moi, de ma droite, de ma gauche et d'au-dessus de moi. Et je cherche protection en Ta grandeur contre le fait d'être surpris par le mal venant d'en dessous.",
  translation_en:
    "O Allah, I ask You for pardon and well-being in this life and the next. O Allah, I ask You for pardon and well-being in my religious and worldly affairs, and my family and my wealth. O Allah, preserve me from the front and from behind and on my right and on my left and from above, and I take refuge with You lest I be swallowed up by the earth.",
};
const ALIM_GHAYB = {
  title: "Connaisseur de l'invisible",
  title_en: "Knower of the unseen",
  arabic:
    "اللَّهُمَّ عَالِمَ الْغَيْبِ وَالشَّهَادَةِ، فَاطِرَ السَّمَاوَاتِ وَالْأَرْضِ، رَبَّ كُلِّ شَيْءٍ وَمَلِيكَهُ، أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا أَنْتَ، أَعُوذُ بِكَ مِنْ شَرِّ نَفْسِي، وَمِنْ شَرِّ الشَّيْطَانِ وَشِرْكِهِ",
  translation:
    "Ô Allah, Connaisseur de l'invisible et du visible, Créateur des cieux et de la terre, Seigneur et Souverain de toute chose, j'atteste qu'il n'y a de divinité que Toi. Je cherche protection auprès de Toi contre le mal de mon âme, et contre le mal du diable et de ses pièges.",
  translation_en:
    "O Allah, Knower of the unseen and the seen, Creator of the heavens and the earth, Lord and Sovereign of all things, I bear witness that none has the right to be worshipped except You. I take refuge in You from the evil of my soul and from the evil and shirk of the devil.",
};
const BISMILLAH_YADURRU = {
  title: "Rien ne peut nuire",
  title_en: "Nothing can cause harm",
  arabic:
    "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ",
  translation:
    "Au nom d'Allah, avec le Nom duquel rien ne peut nuire ni sur terre ni dans le ciel, et Il est l'Audient, l'Omniscient.",
  translation_en:
    "In the name of Allah, with whose name nothing is harmed on earth nor in the heavens, and He is the All-Hearing, the All-Knowing.",
};
const RADITU = {
  title: "Satisfait d'Allah",
  title_en: "Pleased with Allah",
  arabic: "رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا",
  translation:
    "Je suis satisfait d'Allah comme Seigneur, de l'Islam comme religion, et de Muhammad ﷺ comme prophète.",
  translation_en: "I am pleased with Allah as a Lord, and Islam as a religion, and Muhammad ﷺ as a Prophet.",
};
const YA_HAYYU_QAYYUM = {
  title: "Ô Vivant, Ô Subsistant",
  title_en: "O Ever-Living, O Self-Subsisting",
  arabic: "يَا حَيُّ يَا قَيُّومُ، بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ، وَلَا تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ",
  translation:
    "Ô Toi le Vivant, Ô Toi le Subsistant par Toi-même, c'est par Ta miséricorde que j'implore secours. Améliore toute ma situation, et ne me laisse pas à moi-même, ne serait-ce que le temps d'un clin d'œil.",
  translation_en:
    "O Ever-Living, O Self-Subsisting and Supporter of all, by Your mercy I seek assistance, rectify for me all of my affairs and do not leave me to myself, even for the blink of an eye.",
};
const ISTIGHFAR100 = {
  title: "Demande de pardon",
  title_en: "Seeking Allah's forgiveness",
  arabic: "أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ",
  translation: "Je demande pardon à Allah et je me repens à Lui.",
  translation_en: "I seek the forgiveness of Allah and repent to Him.",
};
const SALAWAT = {
  title: "Prière sur le Prophète",
  title_en: "Sending prayers upon the Prophet",
  arabic: "اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَىٰ نَبِيِّنَا مُحَمَّدٍ",
  translation: "Ô Allah, prie et accorde le salut à notre Prophète Muhammad.",
  translation_en: "O Allah, send prayers and peace upon our Prophet Muhammad.",
};

const BISMIKA_AMUTU = {
  title: "Avant de s'endormir",
  title_en: "Before sleeping",
  arabic: "بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا",
  translation: "En Ton nom, ô Allah, je meurs et je vis.",
  translation_en: "In Your name, O Allah, I live and die.",
};
const BAQARA_LAST_VERSES = {
  title: "Derniers versets d'Al-Baqara",
  title_en: "The last two verses of Al-Baqarah",
  arabic:
    "آمَنَ الرَّسُولُ بِمَا أُنْزِلَ إِلَيْهِ مِنْ رَبِّهِ وَالْمُؤْمِنُونَ ۚ كُلٌّ آمَنَ بِاللَّهِ وَمَلَائِكَتِهِ وَكُتُبِهِ وَرُسُلِهِ لَا نُفَرِّقُ بَيْنَ أَحَدٍ مِنْ رُسُلِهِ ۖ وَقَالُوا سَمِعْنَا وَأَطَعْنَا ۖ غُفْرَانَكَ رَبَّنَا وَإِلَيْكَ الْمَصِيرُ. لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا ۚ لَهَا مَا كَسَبَتْ وَعَلَيْهَا مَا اكْتَسَبَتْ ۗ رَبَّنَا لَا تُؤَاخِذْنَا إِنْ نَسِينَا أَوْ أَخْطَأْنَا ۚ رَبَّنَا وَلَا تَحْمِلْ عَلَيْنَا إِصْرًا كَمَا حَمَلْتَهُ عَلَى الَّذِينَ مِنْ قَبْلِنَا ۚ رَبَّنَا وَلَا تُحَمِّلْنَا مَا لَا طَاقَةَ لَنَا بِهِ ۖ وَاعْفُ عَنَّا وَاغْفِرْ لَنَا وَارْحَمْنَا ۚ أَنْتَ مَوْلَانَا فَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ",
  translation:
    "Le Messager a cru en ce qu'on a fait descendre vers lui venant de son Seigneur, et les croyants aussi ; tous ont cru en Allah, en Ses anges, à Ses livres et en Ses messagers, sans faire de distinction entre Ses messagers. Et ils ont dit : « Nous avons entendu et obéi. Seigneur, nous implorons Ton pardon, c'est vers Toi que sera le retour final. » Allah n'impose à aucune âme une charge supérieure à sa capacité. Elle sera récompensée du bien qu'elle aura fait, punie du mal qu'elle aura fait. Seigneur, ne nous châtie pas s'il nous arrive d'oublier ou de commettre une erreur. Seigneur, ne nous charge pas d'un fardeau lourd comme Tu l'as imposé à ceux qui vécurent avant nous. Seigneur, ne nous impose pas ce que nous ne pouvons supporter, efface nos fautes, pardonne-nous et fais-nous miséricorde. Tu es notre Maître, accorde-nous la victoire sur les peuples mécréants.",
  translation_en:
    "The Messenger has believed in what was revealed to him from his Lord, and [so have] the believers. All of them have believed in Allah and His angels and His books and His messengers, [saying], We make no distinction between any of His messengers. And they say, We hear and we obey. [We seek] Your forgiveness, our Lord, and to You is the [final] destination. Allah does not charge a soul except with that within its capacity. Our Lord, do not impose blame upon us if we forget or make a mistake. Our Lord, and lay not upon us a burden like that which You laid upon those before us. Our Lord, and burden us not with that which we have no ability to bear. And pardon us, forgive us, and have mercy upon us. You are our protector, so give us victory over the disbelieving people.",
};
const WADATU_JANBI = {
  title: "En posant le flanc",
  title_en: "Upon lying down",
  arabic:
    "بِاسْمِكَ رَبِّي وَضَعْتُ جَنْبِي، وَبِكَ أَرْفَعُهُ، فَإِنْ أَمْسَكْتَ نَفْسِي فَارْحَمْهَا، وَإِنْ أَرْسَلْتَهَا فَاحْفَظْهَا بِمَا تَحْفَظُ بِهِ عِبَادَكَ الصَّالِحِينَ",
  translation:
    "En Ton nom, mon Seigneur, je pose mon flanc, et c'est par Toi que je le relève. Si Tu retiens mon âme, fais-lui miséricorde ; et si Tu la renvoies, préserve-la comme Tu préserves Tes serviteurs vertueux.",
  translation_en:
    "In Your name my Lord, I lie down and in Your name I rise, so if You should take my soul then have mercy upon it, and if You should return my soul then protect it in the manner You do so with Your righteous servants.",
};
const RABBAS_SAMAWAT = {
  title: "Seigneur des sept cieux",
  title_en: "Lord of the seven heavens",
  arabic:
    "اللَّهُمَّ رَبَّ السَّمَاوَاتِ السَّبْعِ وَرَبَّ الْأَرْضِ، وَرَبَّ الْعَرْشِ الْعَظِيمِ، رَبَّنَا وَرَبَّ كُلِّ شَيْءٍ، فَالِقَ الْحَبِّ وَالنَّوَى، وَمُنْزِلَ التَّوْرَاةِ وَالْإِنْجِيلِ وَالْفُرْقَانِ، أَعُوذُ بِكَ مِنْ شَرِّ كُلِّ ذِي شَرٍّ أَنْتَ آخِذٌ بِنَاصِيَتِهِ، اللَّهُمَّ أَنْتَ الْأَوَّلُ فَلَيْسَ قَبْلَكَ شَيْءٌ، وَأَنْتَ الْآخِرُ فَلَيْسَ بَعْدَكَ شَيْءٌ، وَأَنْتَ الظَّاهِرُ فَلَيْسَ فَوْقَكَ شَيْءٌ، وَأَنْتَ الْبَاطِنُ فَلَيْسَ دُونَكَ شَيْءٌ، اقْضِ عَنَّا الدَّيْنَ وَأَغْنِنَا مِنَ الْفَقْرِ",
  translation:
    "Ô Allah, Seigneur des sept cieux, Seigneur de la terre, Seigneur de l'immense Trône, notre Seigneur et Seigneur de toute chose, Toi qui fends la graine et le noyau, Toi qui as révélé la Torah, l'Évangile et le Discernement, je cherche refuge auprès de Toi contre le mal de tout être malfaisant que Tu tiens par le toupet. Ô Allah, Tu es le Premier, rien n'est avant Toi ; Tu es le Dernier, rien n'est après Toi ; Tu es l'Apparent, rien n'est au-dessus de Toi ; Tu es le Caché, rien n'est en deçà de Toi. Acquitte notre dette et préserve-nous de la pauvreté.",
  translation_en:
    "O Allah, Lord of the seven heavens and Lord of the exalted throne, our Lord and Lord of all things, Splitter of the seed and the date stone, Revealer of the Tawrah, the Injeel and the Furqan, I take refuge in You from the evil of all things You shall seize by the forelock. O Allah, You are The First so there is nothing before You and You are The Last so there is nothing after You. You are Ath-Thahir so there is nothing above You and You are Al-Batin so there is nothing closer than You. Settle our debt for us and spare us from poverty.",
};
const QINI_ADHABAKA = {
  title: "Protection au Jour du Jugement",
  title_en: "Protection on the Day of Judgement",
  arabic: "اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ",
  translation: "Ô Allah, protège-moi de Ton châtiment le jour où Tu ressusciteras Tes serviteurs.",
  translation_en: "O Allah, protect me from Your punishment on the day Your servants are resurrected.",
};
const ASLAMTU_NAFSI = {
  title: "Remise de soi à Allah",
  title_en: "Submitting oneself to Allah",
  arabic:
    "اللَّهُمَّ أَسْلَمْتُ نَفْسِي إِلَيْكَ، وَفَوَّضْتُ أَمْرِي إِلَيْكَ، وَأَلْجَأْتُ ظَهْرِي إِلَيْكَ، رَغْبَةً وَرَهْبَةً إِلَيْكَ، لَا مَلْجَأَ وَلَا مَنْجَا مِنْكَ إِلَّا إِلَيْكَ، آمَنْتُ بِكِتَابِكَ الَّذِي أَنْزَلْتَ، وَبِنَبِيِّكَ الَّذِي أَرْسَلْتَ",
  translation:
    "Ô Allah, je me suis remis à Toi, j'ai confié mon affaire à Toi, j'ai adossé mon dos à Toi, par désir et par crainte de Toi. Il n'y a de refuge ni de salut de Toi si ce n'est auprès de Toi. Je crois en Ton Livre que Tu as révélé et en Ton Prophète que Tu as envoyé.",
  translation_en:
    "O Allah, I submit my soul unto You, and I entrust my affair unto You, and I turn my face towards You, and I totally rely on You, in hope and fear of You. Verily there is no refuge nor safe haven from You except with You. I believe in Your Book which You have revealed and in Your Prophet whom You have sent.",
};

// Sleep azkar, following the order used in Hisn al-Muslim's «أذكار النوم» chapter
const SOMMEIL_ITEMS = [
  { id: "d1", count: 1, ...BISMIKA_AMUTU },
  { id: "d2", count: 1, ...AYAT_AL_KURSI },
  { id: "d3", count: 1, ...BAQARA_LAST_VERSES },
  { id: "d4", count: 3, ...AL_IKHLAS },
  { id: "d5", count: 3, ...AL_FALAQ },
  { id: "d6", count: 3, ...AN_NAS },
  { id: "d7", count: 33, title: "Gloire à Allah", title_en: "Glory be to Allah", arabic: "سُبْحَانَ اللَّهِ", translation: "Gloire à Allah.", translation_en: "How perfect Allah is." },
  { id: "d8", count: 33, title: "Louange à Allah", title_en: "Praise be to Allah", arabic: "الْحَمْدُ لِلَّهِ", translation: "La louange est à Allah.", translation_en: "All praise is due to Allah." },
  { id: "d9", count: 34, title: "Allah est le plus Grand", title_en: "Allah is the Greatest", arabic: "اللَّهُ أَكْبَرُ", translation: "Allah est le plus Grand.", translation_en: "Allah is the greatest." },
  { id: "d10", count: 1, ...WADATU_JANBI },
  { id: "d11", count: 1, ...RABBAS_SAMAWAT },
  { id: "d12", count: 3, ...QINI_ADHABAKA },
  { id: "d13", count: 1, ...ASLAMTU_NAFSI },
];

const MATIN_ITEMS = [
  { id: "m1", count: 1, ...AYAT_AL_KURSI },
  { id: "m2", count: 3, ...AL_IKHLAS },
  { id: "m3", count: 3, ...AL_FALAQ },
  { id: "m4", count: 3, ...AN_NAS },
  {
    id: "m5",
    count: 1,
    title: "Formule du matin",
    title_en: "Morning formula",
    arabic:
      "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ. رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَٰذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَٰذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ",
    translation:
      "Nous voici au matin, et avec nous le règne appartient à Allah. Louange à Allah, il n'y a de divinité qu'Allah, Seul, sans associé. À Lui le règne, à Lui la louange, et Il est capable de toute chose. Seigneur, je Te demande le bien de ce jour et le bien de ce qui le suit, et je cherche protection contre le mal de ce jour et le mal de ce qui le suit. Seigneur, je cherche protection contre la paresse et la mauvaise vieillesse, et contre un châtiment dans le Feu et dans la tombe.",
    translation_en:
      "We have reached the morning and at this very time unto Allah belongs all sovereignty, and all praise is for Allah. None has the right to be worshipped except Allah, alone, without partner, to Him belongs all sovereignty and praise and He is over all things omnipotent. My Lord, I ask You for the good of this day and the good of what follows it and I take refuge in You from the evil of this day and the evil of what follows it. My Lord, I take refuge in You from laziness and senility. My Lord, I take refuge in You from torment in the Fire and punishment in the grave.",
    audio: "/audio/matin/m5-formule-du-matin.ogg",
  },
  {
    id: "m6",
    count: 1,
    title: "Par Toi nous entrons dans le matin",
    title_en: "By You we enter the morning",
    arabic: "اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ وَإِلَيْكَ النُّشُورُ",
    translation:
      "Ô Allah, c'est par Toi que nous entrons dans le matin, par Toi que nous entrons dans le soir, par Toi que nous vivons, par Toi que nous mourrons, et vers Toi est la résurrection.",
    translation_en:
      "O Allah, by You we enter the morning and by You we enter the evening, by You we live and by You we die, and unto You is the resurrection.",
    audio: "/audio/matin/m6-par-toi-nous-entrons-dans-le-matin.ogg",
  },
  { id: "m7", count: 1, ...SAYYID_ISTIGHFAR, audio: "/audio/matin/m7-sayyid-al-istighfar.ogg" },
  { id: "m8", count: 4, ...USHHIDUKA, audio: "/audio/matin/m8-je-te-prends-a-temoin.ogg" },
  { id: "m9", count: 1, ...NIMAH, audio: "/audio/matin/m9-reconnaissance-des-bienfaits.ogg" },
  { id: "m10", count: 3, ...AFINI, audio: "/audio/matin/m10-accorde-moi-la-sante.ogg" },
  { id: "m11", count: 7, ...HASBIYALLAH, audio: "/audio/matin/m11-hasbiyallah.ogg" },
  { id: "m12", count: 1, ...AFWU_AFIYA, audio: "/audio/matin/m12-pardon-et-sante.ogg" },
  { id: "m13", count: 1, ...ALIM_GHAYB, audio: "/audio/matin/m13-connaisseur-de-linvisible.ogg" },
  { id: "m14", count: 3, ...BISMILLAH_YADURRU, audio: "/audio/matin/m14-bismillah-protection.ogg" },
  { id: "m15", count: 3, ...RADITU, audio: "/audio/matin/m15-je-suis-satisfait-dallah.ogg" },
  { id: "m16", count: 1, ...YA_HAYYU_QAYYUM, audio: "/audio/matin/m16-ya-hayyu-ya-qayyum.ogg" },
  {
    id: "m17",
    count: 1,
    title: "Sur la nature originelle de l'Islam",
    title_en: "Upon the natural religion of Islam",
    arabic:
      "أَصْبَحْنَا عَلَى فِطْرَةِ الْإِسْلَامِ، وَعَلَى كَلِمَةِ الْإِخْلَاصِ، وَعَلَى دِينِ نَبِيِّنَا مُحَمَّدٍ ﷺ، وَعَلَى مِلَّةِ أَبِينَا إِبْرَاهِيمَ حَنِيفًا مُسْلِمًا، وَمَا كَانَ مِنَ الْمُشْرِكِينَ",
    translation:
      "Nous voici au matin sur la nature originelle de l'Islam, sur la parole du monothéisme pur, sur la religion de notre Prophète Muhammad ﷺ, et sur la voie de notre père Abraham, exclusivement voué à Allah, et qui n'était pas du nombre des polythéistes.",
    translation_en:
      "We have reached the morning upon the natural religion of Islam, the word of sincere devotion, the religion of our Prophet Muhammad ﷺ, and the faith of our father Abraham, who was upright in submission to Allah and was not amongst the polytheists.",
    audio: "/audio/matin/m17-nature-originelle-de-lislam.ogg",
  },
  { id: "m18", count: 100, ...SUBHANALLAHI_BIHAMDIHI, audio: "/audio/matin/m18-subhanallahi-wa-bihamdihi.ogg" },
  { id: "m19", count: 10, ...LA_ILAHA, audio: "/audio/matin/m19-la-ilaha-illallah.ogg" },
  {
    id: "m20",
    count: 3,
    title: "Gloire à Allah, autant que...",
    title_en: "Glory be to Allah, as much as...",
    arabic: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ عَدَدَ خَلْقِهِ، وَرِضَا نَفْسِهِ، وَزِنَةَ عَرْشِهِ، وَمِدَادَ كَلِمَاتِهِ",
    translation:
      "Gloire et louange à Allah, autant que le nombre de Ses créatures, autant que Son agrément, autant que le poids de Son Trône, et autant que l'encre de Ses paroles.",
    translation_en:
      "How perfect Allah is and I praise Him, by the multitude of His creation, by His pleasure, by the weight of His throne, and by the extent of His words.",
    audio: "/audio/matin/m20-gloire-a-allah-autant-que.ogg",
  },
  {
    id: "m21",
    count: 1,
    title: "Science utile (après al-Fajr)",
    title_en: "Beneficial knowledge (after Fajr)",
    arabic: "اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا، وَرِزْقًا طَيِّبًا، وَعَمَلًا مُتَقَبَّلًا",
    translation:
      "Ô Allah, je Te demande une science utile, une subsistance bonne, et une œuvre acceptée.",
    translation_en:
      "O Allah, I ask You for beneficial knowledge, good provision, and acceptable deeds.",
    audio: "/audio/matin/m21-science-utile.ogg",
  },
  { id: "m22", count: 100, ...ISTIGHFAR100, audio: "/audio/matin/m22-istighfar.ogg" },
  { id: "m23", count: 10, ...SALAWAT, audio: "/audio/matin/m23-salawat.ogg" },
];

const SOIR_ITEMS = [
  { id: "s1", count: 1, ...AYAT_AL_KURSI },
  { id: "s2", count: 3, ...AL_IKHLAS },
  { id: "s3", count: 3, ...AL_FALAQ },
  { id: "s4", count: 3, ...AN_NAS },
  {
    id: "s5",
    count: 1,
    title: "Formule du soir",
    title_en: "Evening formula",
    arabic:
      "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ. رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَٰذِهِ اللَّيْلَةِ وَخَيْرَ مَا بَعْدَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَٰذِهِ اللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ",
    translation:
      "Nous voici au soir, et avec nous le règne appartient à Allah. Louange à Allah, il n'y a de divinité qu'Allah, Seul, sans associé. À Lui le règne, à Lui la louange, et Il est capable de toute chose. Seigneur, je Te demande le bien de cette nuit et le bien de ce qui la suit, et je cherche protection contre le mal de cette nuit et le mal de ce qui la suit. Seigneur, je cherche protection contre la paresse et la mauvaise vieillesse, et contre un châtiment dans le Feu et dans la tombe.",
    translation_en:
      "We have reached the evening and at this very time unto Allah belongs all sovereignty, and all praise is for Allah. None has the right to be worshipped except Allah, alone, without partner, to Him belongs all sovereignty and praise and He is over all things omnipotent. My Lord, I ask You for the good of this night and the good of what follows it and I take refuge in You from the evil of this night and the evil of what follows it. My Lord, I take refuge in You from laziness and senility. My Lord, I take refuge in You from torment in the Fire and punishment in the grave.",
  },
  {
    id: "s6",
    count: 1,
    title: "Par Toi nous entrons dans le soir",
    title_en: "By You we enter the evening",
    arabic: "اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ وَإِلَيْكَ الْمَصِيرُ",
    translation:
      "Ô Allah, c'est par Toi que nous entrons dans le soir, par Toi que nous entrons dans le matin, par Toi que nous vivons, par Toi que nous mourrons, et vers Toi est le retour.",
    translation_en:
      "O Allah, by You we enter the evening and by You we enter the morning, by You we live and by You we die, and unto You is our return.",
  },
  { id: "s7", count: 1, ...SAYYID_ISTIGHFAR, audio: "/audio/matin/m7-sayyid-al-istighfar.ogg" },
  { id: "s8", count: 4, ...USHHIDUKA, audio: "/audio/matin/m8-je-te-prends-a-temoin.ogg" },
  {
    id: "s9",
    count: 1,
    title: "Reconnaissance des bienfaits",
    title_en: "Acknowledging Allah's blessings",
    arabic:
      "اللَّهُمَّ مَا أَمْسَى بِي مِنْ نِعْمَةٍ أَوْ بِأَحَدٍ مِنْ خَلْقِكَ فَمِنْكَ وَحْدَكَ لَا شَرِيكَ لَكَ، فَلَكَ الْحَمْدُ وَلَكَ الشُّكْرُ",
    translation:
      "Ô Allah, tout bienfait dont je jouis ce soir, ou dont jouit l'une de Tes créatures, vient de Toi Seul, sans associé. À Toi la louange et à Toi la gratitude.",
    translation_en:
      "O Allah, what blessing I or any of Your creation have reached this evening, is from You alone, without partner, so for You is all praise and unto You all thanks.",
  },
  { id: "s10", count: 3, ...AFINI, audio: "/audio/matin/m10-accorde-moi-la-sante.ogg" },
  { id: "s11", count: 7, ...HASBIYALLAH, audio: "/audio/matin/m11-hasbiyallah.ogg" },
  { id: "s12", count: 1, ...AFWU_AFIYA, audio: "/audio/matin/m12-pardon-et-sante.ogg" },
  { id: "s13", count: 1, ...ALIM_GHAYB, audio: "/audio/matin/m13-connaisseur-de-linvisible.ogg" },
  { id: "s14", count: 3, ...BISMILLAH_YADURRU, audio: "/audio/matin/m14-bismillah-protection.ogg" },
  { id: "s15", count: 3, ...RADITU, audio: "/audio/matin/m15-je-suis-satisfait-dallah.ogg" },
  { id: "s16", count: 1, ...YA_HAYYU_QAYYUM, audio: "/audio/matin/m16-ya-hayyu-ya-qayyum.ogg" },
  {
    id: "s17",
    count: 1,
    title: "Sur la nature originelle de l'Islam",
    title_en: "Upon the natural religion of Islam",
    arabic:
      "أَمْسَيْنَا عَلَى فِطْرَةِ الْإِسْلَامِ، وَعَلَى كَلِمَةِ الْإِخْلَاصِ، وَعَلَى دِينِ نَبِيِّنَا مُحَمَّدٍ ﷺ، وَعَلَى مِلَّةِ أَبِينَا إِبْرَاهِيمَ حَنِيفًا مُسْلِمًا، وَمَا كَانَ مِنَ الْمُشْرِكِينَ",
    translation:
      "Nous voici au soir sur la nature originelle de l'Islam, sur la parole du monothéisme pur, sur la religion de notre Prophète Muhammad ﷺ, et sur la voie de notre père Abraham, exclusivement voué à Allah, et qui n'était pas du nombre des polythéistes.",
    translation_en:
      "We have reached the evening upon the natural religion of Islam, the word of sincere devotion, the religion of our Prophet Muhammad ﷺ, and the faith of our father Abraham, who was upright in submission to Allah and was not amongst the polytheists.",
  },
  { id: "s18", count: 100, ...SUBHANALLAHI_BIHAMDIHI, audio: "/audio/matin/m18-subhanallahi-wa-bihamdihi.ogg" },
  { id: "s19", count: 10, ...LA_ILAHA, audio: "/audio/matin/m19-la-ilaha-illallah.ogg" },
  {
    id: "s20",
    count: 3,
    title: "Gloire à Allah, autant que...",
    title_en: "Glory be to Allah, as much as...",
    arabic: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ عَدَدَ خَلْقِهِ، وَرِضَا نَفْسِهِ، وَزِنَةَ عَرْشِهِ، وَمِدَادَ كَلِمَاتِهِ",
    translation:
      "Gloire et louange à Allah, autant que le nombre de Ses créatures, autant que Son agrément, autant que le poids de Son Trône, et autant que l'encre de Ses paroles.",
    translation_en:
      "How perfect Allah is and I praise Him, by the multitude of His creation, by His pleasure, by the weight of His throne, and by the extent of His words.",
    audio: "/audio/matin/m20-gloire-a-allah-autant-que.ogg",
  },
  { id: "s21", count: 100, ...ISTIGHFAR100, audio: "/audio/matin/m22-istighfar.ogg" },
  { id: "s22", count: 10, ...SALAWAT, audio: "/audio/matin/m23-salawat.ogg" },
];

function buildApresItems(enhanced) {
  const qulCount = enhanced ? 3 : 1;
  const tahlilCount = enhanced ? 10 : 1;
  return [
    {
      id: "a1",
      count: 3,
      title: "Demande de pardon",
      title_en: "Seeking forgiveness",
      arabic: "أَسْتَغْفِرُ اللَّهَ",
      translation: "Je demande pardon à Allah.",
      translation_en: "I seek the forgiveness of Allah.",
    },
    {
      id: "a2",
      count: 1,
      title: "Tu es la Paix",
      title_en: "You are Peace",
      arabic: "اللَّهُمَّ أَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ، تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ",
      translation:
        "Ô Allah, Tu es la Paix, et de Toi vient la paix. Tu es béni, ô Toi le Plein de Majesté et de Munificence.",
      translation_en:
        "O Allah, You are Peace and from You comes peace, blessed are You, O Owner of majesty and honour.",
    },
    { id: "a3", count: 1, ...AYAT_AL_KURSI },
    { id: "a4", count: qulCount, ...AL_IKHLAS },
    { id: "a5", count: qulCount, ...AL_FALAQ },
    { id: "a6", count: qulCount, ...AN_NAS },
    { id: "a7", count: 33, title: "Gloire à Allah", title_en: "Glory be to Allah", arabic: "سُبْحَانَ اللَّهِ", translation: "Gloire à Allah.", translation_en: "How perfect Allah is." },
    { id: "a8", count: 33, title: "Louange à Allah", title_en: "Praise be to Allah", arabic: "الْحَمْدُ لِلَّهِ", translation: "La louange est à Allah.", translation_en: "All praise is due to Allah." },
    { id: "a9", count: 33, title: "Allah est le plus Grand", title_en: "Allah is the Greatest", arabic: "اللَّهُ أَكْبَرُ", translation: "Allah est le plus Grand.", translation_en: "Allah is the greatest." },
    { id: "a10", count: tahlilCount, ...LA_ILAHA },
  ];
}

// Fajr and Maghrib carry the enhanced repetitions (3x for the protective sourates, 10x for the tahlīl)
const APRES_PRAYERS = [
  { id: "fajr", label: "Fajr", label_ar: "الفجر", enhanced: true },
  { id: "dhuhr", label: "Dohr", label_en: "Dhuhr", label_ar: "الظهر", enhanced: false },
  { id: "asr", label: "Asr", label_ar: "العصر", enhanced: false },
  { id: "maghrib", label: "Maghrib", label_ar: "المغرب", enhanced: true },
  { id: "isha", label: "Isha", label_ar: "العشاء", enhanced: false },
];

const APRES_BY_PRAYER = Object.fromEntries(APRES_PRAYERS.map((p) => [p.id, buildApresItems(p.enhanced)]));

const CATEGORIES = [
  {
    id: "matin",
    label: "Azkar du matin",
    label_en: "Morning azkar",
    shortLabel: "Azkar matin",
    shortLabel_en: "Morning azkar",
    arabicLabel: "أذكار الصباح",
    time: "De l'aube au lever du soleil",
    time_en: "From dawn to sunrise",
    accent: COLORS.gold,
    accentLight: COLORS.goldLight,
    icon: "sun",
    items: MATIN_ITEMS,
  },
  {
    id: "soir",
    label: "Azkar du soir",
    label_en: "Evening azkar",
    shortLabel: "Azkar soir",
    shortLabel_en: "Evening azkar",
    arabicLabel: "أذكار المساء",
    time: "De l'après-midi au coucher du soleil",
    time_en: "From afternoon to sunset",
    accent: COLORS.indigo,
    accentLight: COLORS.indigoLight,
    icon: "moon",
    items: SOIR_ITEMS,
  },
  {
    id: "apres",
    label: "Après la prière",
    label_en: "After prayer",
    shortLabel: "Azkar après-prière",
    shortLabel_en: "After-prayer azkar",
    arabicLabel: "أذكار بعد الصلاة",
    time: "Après chaque prière obligatoire",
    time_en: "After each obligatory prayer",
    accent: COLORS.clay,
    accentLight: COLORS.clayLight,
    icon: "hands",
    hasPrayers: true,
  },
  {
    id: "sommeil",
    label: "Azkar avant de dormir",
    label_en: "Bedtime azkar",
    shortLabel: "Azkar du coucher",
    shortLabel_en: "Bedtime azkar",
    arabicLabel: "أذكار النوم",
    time: "Avant de s'endormir",
    time_en: "Before falling asleep",
    accent: COLORS.violet,
    accentLight: COLORS.violetLight,
    icon: "bed",
    items: SOMMEIL_ITEMS,
  },
];

/* ------------------------------------------------------------------ */
/* Invocations library — situational duas, organized into logical groups */
/* (content grounded in Hisnul Muslim / authentic hadith and Qur'an)   */
/* ------------------------------------------------------------------ */
const INVOCATION_TOPICS = {
  sommeil: {
    label: "Sommeil",
    label_en: "Sleep",
    label_ar: "النوم",
    emoji: "🌙",
    items: [
      {
        title: "Avant de dormir",
        title_en: "Before sleeping",
        arabic: "بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا",
        translation: "En Ton nom, ô Allah, je meurs et je vis.",
        translation_en: "In Your name, O Allah, I live and die.",
      },
      {
        title: "Au réveil",
        title_en: "Upon waking",
        arabic: "الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ",
        translation:
          "Louange à Allah qui nous a rendus à la vie après nous avoir fait mourir, et vers Lui est la résurrection.",
        translation_en:
          "All praise is for Allah who gave us life after having taken it from us and unto Him is the resurrection.",
      },
    ],
  },
  ablutions: {
    label: "Ablutions",
    label_en: "Ablutions",
    label_ar: "الوضوء",
    emoji: "💧",
    items: [
      { title: "Avant les ablutions", title_en: "Before ablutions", arabic: "بِسْمِ اللَّهِ", translation: "Au nom d'Allah.", translation_en: "In the name of Allah." },
      {
        title: "Après les ablutions",
        title_en: "After ablutions",
        arabic:
          "أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ، اللَّهُمَّ اجْعَلْنِي مِنَ التَّوَّابِينَ وَاجْعَلْنِي مِنَ الْمُتَطَهِّرِينَ",
        translation:
          "J'atteste qu'il n'y a de divinité qu'Allah, Seul sans associé, et j'atteste que Muhammad est Son serviteur et Son messager. Ô Allah, fais de moi l'un de ceux qui se repentent et l'un de ceux qui se purifient.",
        translation_en:
          "I bear witness that none has the right to be worshipped except Allah, alone, without partner, and I bear witness that Muhammad is His servant and Messenger. O Allah, make me among those who repent and make me among those who purify themselves.",
      },
    ],
  },
  maison: {
    label: "Maison",
    label_en: "Home",
    label_ar: "المنزل",
    emoji: "🏠",
    items: [
      {
        title: "En entrant",
        title_en: "Entering the home",
        arabic: "بِسْمِ اللَّهِ وَلَجْنَا، وَبِسْمِ اللَّهِ خَرَجْنَا، وَعَلَى اللَّهِ رَبِّنَا تَوَكَّلْنَا",
        translation: "Au nom d'Allah nous entrons, au nom d'Allah nous sortons, et en Allah notre Seigneur nous plaçons notre confiance.",
        translation_en: "In the name of Allah we enter, and in the name of Allah we leave, and upon our Lord we place our trust.",
      },
      {
        title: "En sortant",
        title_en: "Leaving the home",
        arabic: "بِسْمِ اللَّهِ، تَوَكَّلْتُ عَلَى اللَّهِ، وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ",
        translation: "Au nom d'Allah, je place ma confiance en Allah, il n'y a de force ni de puissance qu'en Allah.",
        translation_en: "In the name of Allah, I place my trust in Allah, there is no power and no strength except with Allah.",
      },
    ],
  },
  habits: {
    label: "Habits",
    label_en: "Clothing",
    label_ar: "الملابس",
    emoji: "👕",
    items: [
      {
        title: "En portant un nouveau vêtement",
        title_en: "Wearing a new garment",
        arabic:
          "اللَّهُمَّ لَكَ الْحَمْدُ أَنْتَ كَسَوْتَنِيهِ، أَسْأَلُكَ مِنْ خَيْرِهِ وَخَيْرِ مَا صُنِعَ لَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّهِ وَشَرِّ مَا صُنِعَ لَهُ",
        translation:
          "Ô Allah, à Toi la louange, c'est Toi qui me l'as donné à porter. Je Te demande son bien et le bien de ce pour quoi il a été fait, et je cherche protection contre son mal.",
        translation_en:
          "O Allah, for You is all praise, You have clothed me with it. I ask You for its good and the good for which it was made, and I take refuge in You from its evil and the evil for which it was made.",
      },
      {
        title: "En se déshabillant",
        title_en: "Undressing",
        arabic: "بِسْمِ اللَّهِ",
        translation: "Au nom d'Allah.",
        translation_en: "In the name of Allah.",
        merit: "Le Prophète ﷺ a enseigné de dire Bismillah en se dévêtant, pour se voiler du regard des djinns. Rapporté par at-Tirmidhî (hadith hasan).",
        merit_en: "The Prophet ﷺ taught saying Bismillah while undressing, as a screen between the eyes of the jinn and the nakedness of the children of Adam. Narrated by at-Tirmidhi (hasan).",
      },
    ],
  },
  toilettes: {
    label: "Toilettes",
    label_en: "Restroom",
    label_ar: "الخلاء",
    emoji: "🚪",
    items: [
      {
        title: "En entrant",
        title_en: "Entering",
        arabic: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْخُبُثِ وَالْخَبَائِثِ",
        translation: "Ô Allah, je cherche protection auprès de Toi contre les démons mâles et femelles.",
        translation_en: "O Allah, I take refuge in You from the male and female devils.",
      },
      { title: "En sortant", title_en: "Leaving", arabic: "غُفْرَانَكَ", translation: "Je Te demande pardon.", translation_en: "I ask You (Allah) for forgiveness." },
    ],
  },
  nourriture: {
    label: "Nourriture",
    label_en: "Food",
    label_ar: "الطعام",
    emoji: "🍽️",
    items: [
      { title: "Avant de manger", title_en: "Before eating", arabic: "بِسْمِ اللَّهِ", translation: "Au nom d'Allah.", translation_en: "In the name of Allah." },
      {
        title: "Après avoir mangé",
        title_en: "After eating",
        arabic: "الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنِي هَذَا وَرَزَقَنِيهِ مِنْ غَيْرِ حَوْلٍ مِنِّي وَلَا قُوَّةٍ",
        translation: "Louange à Allah qui m'a nourri de ceci et me l'a accordé sans force ni puissance de ma part.",
        translation_en: "All praise is for Allah who fed me this and provided it for me without any power or might on my part.",
      },
    ],
  },
  mosquee: {
    label: "Mosquée",
    label_en: "Mosque",
    label_ar: "المسجد",
    emoji: "🕌",
    items: [
      {
        title: "En entrant",
        title_en: "Entering",
        arabic: "اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ",
        translation: "Ô Allah, ouvre-moi les portes de Ta miséricorde.",
        translation_en: "O Allah, open the gates of Your mercy for me.",
      },
      {
        title: "En sortant",
        title_en: "Leaving",
        arabic: "اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ",
        translation: "Ô Allah, je Te demande de Ta grâce.",
        translation_en: "O Allah, I ask You for Your favour.",
      },
    ],
  },
  priere: {
    label: "Avant la prière",
    label_en: "Before prayer",
    label_ar: "قبل الصلاة",
    emoji: "🤲",
    items: [
      {
        title: "Entre l'appel et la prière",
        title_en: "Between the call to prayer and the prayer",
        arabic:
          "اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ وَالصَّلَاةِ الْقَائِمَةِ، آتِ مُحَمَّدًا الْوَسِيلَةَ وَالْفَضِيلَةَ، وَابْعَثْهُ مَقَامًا مَحْمُودًا الَّذِي وَعَدْتَهُ",
        translation:
          "Ô Allah, Seigneur de cet appel parfait et de la prière qui va être accomplie, accorde à Muhammad al-Wasīlah et la faveur, et élève-le au rang louable que Tu lui as promis.",
        translation_en:
          "O Allah, Lord of this perfect call and established prayer, grant Muhammad the intercession and favour, and raise him to the praiseworthy station You have promised him.",
      },
      {
        title: "Doa d'ouverture (Istiftâh)",
        title_en: "Opening supplication (Istiftah)",
        arabic: "سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، وَتَبَارَكَ اسْمُكَ، وَتَعَالَى جَدُّكَ، وَلَا إِلَٰهَ غَيْرُكَ",
        translation:
          "Gloire et louange à Toi, ô Allah. Béni soit Ton Nom, exalté soit Ton pouvoir, et il n'y a de divinité que Toi.",
        translation_en:
          "How perfect You are, O Allah, and praise be to You. Blessed is Your name, and exalted is Your majesty, and none has the right to be worshipped except You.",
        merit: "Dite au tout début de la prière, après le premier Takbîr. Rapportée par Abû Dâwûd et at-Tirmidhî.",
        merit_en: "Said at the very start of the prayer, after the opening Takbir. Narrated by Abu Dawud and at-Tirmidhi.",
      },
    ],
  },
  istikhara: {
    label: "Prière de consultation (Istikhâra)",
    label_en: "Prayer of guidance (Istikhara)",
    label_ar: "صلاة الاستخارة",
    emoji: "🧭",
    items: [
      {
        title: "Après 2 rakât surérogatoires, en nommant son affaire",
        title_en: "After 2 voluntary rak'ahs, naming the matter",
        arabic:
          "اللَّهُمَّ إِنِّي أَسْتَخِيرُكَ بِعِلْمِكَ، وَأَسْتَقْدِرُكَ بِقُدْرَتِكَ، وَأَسْأَلُكَ مِنْ فَضْلِكَ الْعَظِيمِ، فَإِنَّكَ تَقْدِرُ وَلَا أَقْدِرُ، وَتَعْلَمُ وَلَا أَعْلَمُ، وَأَنْتَ عَلَّامُ الْغُيُوبِ، اللَّهُمَّ إِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ خَيْرٌ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي، فَاقْدُرْهُ لِي وَيَسِّرْهُ لِي، ثُمَّ بَارِكْ لِي فِيهِ، وَإِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ شَرٌّ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي، فَاصْرِفْهُ عَنِّي وَاصْرِفْنِي عَنْهُ، وَاقْدُرْ لِيَ الْخَيْرَ حَيْثُ كَانَ، ثُمَّ أَرْضِنِي بِهِ",
        translation:
          "Ô Allah, je Te consulte par Ta science, je Te demande de m'accorder la capacité par Ton pouvoir, et je Te sollicite de Ton immense grâce, car Tu es capable et je ne le suis pas, Tu sais et je ne sais pas, et Tu es Celui qui connaît parfaitement l'invisible. Ô Allah, si Tu sais que cette affaire [la nommer] est un bien pour moi dans ma religion, ma vie et l'issue de mes affaires, alors décide-la et facilite-la moi, puis bénis-la moi. Et si Tu sais que cette affaire est un mal pour moi dans ma religion, ma vie et l'issue de mes affaires, alors éloigne-la de moi et éloigne-moi d'elle, et décide pour moi le bien où qu'il se trouve, puis rends-moi satisfait de cela.",
        translation_en:
          "O Allah, I seek Your guidance by virtue of Your knowledge, and I seek ability by virtue of Your power, and I ask You of Your great bounty. You have power, I have none, and You know, I know not, and You are the Knower of hidden things. O Allah, if in Your knowledge this matter [name it] is good for me in my religion, my livelihood and the outcome of my affairs, then ordain it for me, make it easy for me, and bless it for me. And if in Your knowledge this matter is bad for me in my religion, my livelihood and the outcome of my affairs, then turn it away from me and turn me away from it, and ordain for me the good wherever it may be, and make me pleased with it.",
      },
    ],
  },
  hajj: {
    label: "Hajj / Omra",
    label_en: "Hajj / Umrah",
    label_ar: "الحج والعمرة",
    emoji: "🕋",
    items: [
      {
        title: "La Talbiya",
        title_en: "The Talbiyah",
        arabic: "لَبَّيْكَ اللَّهُمَّ لَبَّيْكَ، لَبَّيْكَ لَا شَرِيكَ لَكَ لَبَّيْكَ، إِنَّ الْحَمْدَ وَالنِّعْمَةَ لَكَ وَالْمُلْكَ، لَا شَرِيكَ لَكَ",
        translation:
          "Me voici, ô Allah, me voici. Me voici, Tu n'as pas d'associé, me voici. La louange, le bienfait et le règne T'appartiennent, Tu n'as pas d'associé.",
        translation_en:
          "Here I am, O Allah, here I am. Here I am, You have no partner, here I am. Verily all praise, favour and sovereignty are Yours. You have no partner.",
      },
      {
        title: "Entre le coin yéménite et la Pierre noire (tawaf)",
        title_en: "Between the Yemeni corner and the Black Stone (tawaf)",
        arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
        translation:
          "Notre Seigneur, accorde-nous belle part ici-bas et belle part dans l'au-delà, et préserve-nous du châtiment du Feu.",
        translation_en:
          "Our Lord, grant us good in this world and good in the hereafter, and save us from the punishment of the Fire.",
        merit: "L'invocation la plus fréquente du Prophète ﷺ, répétée entre le coin yéménite et la Pierre noire durant le tawaf (Sourate Al-Baqara, 201). Rapportée par al-Bukhari et Muslim.",
        merit_en: "The Prophet's ﷺ most frequent supplication, repeated between the Yemeni corner and the Black Stone during tawaf (Surah Al-Baqarah, 201). Narrated by al-Bukhari and Muslim.",
      },
    ],
  },
  ramadan: {
    label: "Ramadan",
    label_en: "Ramadan",
    label_ar: "رمضان",
    emoji: "🌙",
    items: [
      {
        title: "En rompant le jeûne",
        title_en: "Breaking the fast",
        arabic: "ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ",
        translation: "La soif s'en est allée, les veines se sont humidifiées, et la récompense est confirmée, si Allah le veut.",
        translation_en: "The thirst is gone, the veins are moist, and the reward is confirmed, if Allah wills.",
      },
      {
        title: "En voyant le croissant lunaire",
        title_en: "Sighting the new moon",
        arabic: "اللَّهُمَّ أَهِلَّهُ عَلَيْنَا بِالْأَمْنِ وَالْإِيمَانِ، وَالسَّلَامَةِ وَالْإِسْلَامِ، رَبِّي وَرَبُّكَ اللَّهُ",
        translation:
          "Ô Allah, fais que cette nouvelle lune se lève sur nous avec la sécurité, la foi, la préservation et l'islam. Mon Seigneur et le tien est Allah.",
        translation_en:
          "O Allah, bring this moon upon us with security and faith, with safety and Islam. My Lord and your Lord is Allah.",
        merit: "Rapportée par at-Tirmidhî (hadith hasan), dite par le Prophète ﷺ à la vue de chaque nouvelle lune.",
        merit_en: "Narrated by at-Tirmidhi (hasan), said by the Prophet ﷺ upon sighting every new moon.",
      },
    ],
  },
  louange: {
    label: "Louange",
    label_en: "Praise",
    label_ar: "الحمد",
    emoji: "🙌",
    items: [
      {
        title: "Louange générale",
        title_en: "General praise",
        arabic: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
        translation: "La louange est à Allah, Seigneur des mondes.",
        translation_en: "All praise is for Allah, Lord of the worlds.",
      },
      {
        title: "Grande louange",
        title_en: "Abundant praise",
        arabic: "الْحَمْدُ لِلَّهِ حَمْدًا كَثِيرًا طَيِّبًا مُبَارَكًا فِيهِ",
        translation: "Louange à Allah, une louange abondante, excellente et bénie.",
        translation_en: "Praise be to Allah, praise in abundance, good and blessed.",
        merit: "Formule prononcée par un compagnon durant la prière ; le Prophète ﷺ rapporta que douze anges s'étaient empressés de l'inscrire. Rapportée par al-Bukhari.",
        merit_en: "Said by a companion during prayer; the Prophet ﷺ reported that twelve angels rushed to record it. Narrated by al-Bukhari.",
      },
    ],
  },
  repentir: {
    label: "Repentir",
    label_en: "Repentance",
    label_ar: "التوبة",
    emoji: "🕊️",
    items: [
      {
        title: "Demande de pardon et de repentir",
        title_en: "Seeking forgiveness and repentance",
        arabic: "رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ",
        translation: "Seigneur, pardonne-moi et accepte mon repentir, Tu es Celui qui accepte le repentir, le Très Miséricordieux.",
        translation_en: "My Lord, forgive me and accept my repentance, You are the Ever-Relenting, the Merciful.",
      },
      {
        title: "Formule complète de repentir",
        title_en: "Complete formula of repentance",
        arabic: "أَسْتَغْفِرُ اللَّهَ الَّذِي لَا إِلَٰهَ إِلَّا هُوَ الْحَيَّ الْقَيُّومَ وَأَتُوبُ إِلَيْهِ",
        translation:
          "Je demande pardon à Allah, en dehors de qui il n'y a de divinité, le Vivant, Celui qui subsiste par Lui-même, et je me repens à Lui.",
        translation_en:
          "I seek the forgiveness of Allah, besides whom there is no deity, the Ever-Living, the Self-Subsisting, and I repent to Him.",
        merit: "Le Prophète ﷺ a enseigné que quiconque la prononce, Allah lui pardonne même s'il a fui le combat. Rapportée par Abû Dâwûd et at-Tirmidhî (hadith hasan sahîh).",
        merit_en: "The Prophet ﷺ taught that whoever says it, Allah forgives him even if he had fled from battle. Narrated by Abu Dawud and at-Tirmidhi (hasan sahih).",
      },
    ],
  },
  rabbana: {
    label: "Invocations du Coran",
    label_en: "Quranic supplications",
    label_ar: "أدعية قرآنية",
    emoji: "📖",
    dynamic: true,
  },
  tristesse: {
    label: "Tristesse",
    label_en: "Sadness",
    label_ar: "الحزن",
    emoji: "😔",
    items: [
      {
        title: "Contre le chagrin et l'anxiété",
        title_en: "Against grief and anxiety",
        arabic:
          "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْجُبْنِ وَالْبُخْلِ، وَضَلَعِ الدَّيْنِ وَغَلَبَةِ الرِّجَالِ",
        translation:
          "Ô Allah, je cherche protection auprès de Toi contre le souci et la tristesse, l'incapacité et la paresse, la lâcheté et l'avarice, le poids des dettes et la domination des hommes.",
        translation_en:
          "O Allah, I take refuge in You from anxiety and sorrow, weakness and laziness, cowardice and miserliness, the burden of debts and being overpowered by men.",
      },
      {
        title: "Allah nous suffit",
        title_en: "Allah is sufficient for us",
        arabic: "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ",
        translation: "Allah nous suffit, Il est le meilleur garant.",
        translation_en: "Allah is sufficient for us, and He is the best disposer of affairs.",
        merit: "Parole des croyants face à l'épreuve (Sourate Âl 'Imrân, 173), reprise par le Prophète ﷺ. Rapportée par al-Bukhari.",
        merit_en: "Words of the believers facing trial (Surah Aal 'Imran, 173), repeated by the Prophet ﷺ. Narrated by al-Bukhari.",
      },
    ],
  },
  joie: {
    label: "Joie",
    label_en: "Joy",
    label_ar: "الفرح",
    emoji: "😊",
    items: [
      {
        title: "En cas de joie",
        title_en: "In times of joy",
        arabic: "الْحَمْدُ لِلَّهِ الَّذِي بِنِعْمَتِهِ تَتِمُّ الصَّالِحَاتُ",
        translation: "Louange à Allah, par la grâce de qui les bonnes œuvres s'accomplissent.",
        translation_en: "All praise is for Allah, by whose grace good deeds are completed.",
      },
    ],
  },
  doute: {
    label: "Doute",
    label_en: "Doubt",
    label_ar: "الشك",
    emoji: "🤔",
    items: [
      {
        title: "Contre les pensées intrusives",
        title_en: "Against intrusive thoughts",
        arabic: "آمَنْتُ بِاللَّهِ وَرُسُلِهِ",
        translation: "Je crois en Allah et en Ses messagers.",
        translation_en: "I believe in Allah and His messengers.",
      },
    ],
  },
  colere: {
    label: "Colère",
    label_en: "Anger",
    label_ar: "الغضب",
    emoji: "😠",
    items: [
      {
        title: "En cas de colère",
        title_en: "In times of anger",
        arabic: "أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ",
        translation: "Je cherche protection auprès d'Allah contre le diable banni.",
        translation_en: "I take refuge in Allah from the accursed devil.",
      },
    ],
  },
  tentation: {
    label: "Tentation",
    label_en: "Temptation",
    label_ar: "الفتنة",
    emoji: "🛡️",
    items: [
      {
        title: "Guidée et chasteté",
        title_en: "Guidance and chastity",
        arabic: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالتُّقَى وَالْعَفَافَ وَالْغِنَى",
        translation: "Ô Allah, je Te demande la guidée, la piété, la chasteté et la suffisance.",
        translation_en: "O Allah, I ask You for guidance, piety, chastity and self-sufficiency.",
      },
      {
        title: "Contre les suggestions du diable",
        title_en: "Against the whispers of the devil",
        arabic: "رَبِّ أَعُوذُ بِكَ مِنْ هَمَزَاتِ الشَّيَاطِينِ وَأَعُوذُ بِكَ رَبِّ أَنْ يَحْضُرُونِ",
        translation:
          "Seigneur, je cherche protection auprès de Toi contre les incitations des démons, et je cherche protection auprès de Toi, Seigneur, contre leur présence.",
        translation_en:
          "My Lord, I seek refuge in You from the incitements of the devils, and I seek refuge in You, my Lord, lest they be present with me.",
        merit: "Sourate Al-Mu'minûn, versets 97-98.",
        merit_en: "Surah Al-Mu'minun, verses 97-98.",
      },
    ],
  },
  protection: {
    label: "Protection",
    label_en: "Protection",
    label_ar: "الحماية",
    emoji: "🔰",
    items: [
      {
        title: "Contre tout mal",
        title_en: "Against all evil",
        arabic: "أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ",
        translation: "Je cherche protection dans les paroles parfaites d'Allah contre le mal de ce qu'Il a créé.",
        translation_en: "I take refuge in the perfect words of Allah from the evil of what He has created.",
      },
    ],
  },
  mariage: {
    label: "Mariage",
    label_en: "Marriage",
    label_ar: "الزواج",
    emoji: "💍",
    items: [
      {
        title: "Pour un nouveau marié",
        title_en: "For a newly married person",
        arabic: "بَارَكَ اللَّهُ لَكَ، وَبَارَكَ عَلَيْكَ، وَجَمَعَ بَيْنَكُمَا فِي خَيْرٍ",
        translation: "Qu'Allah te bénisse, répande Sa bénédiction sur toi, et vous unisse tous deux dans le bien.",
        translation_en: "May Allah bless you, and shower His blessings upon you, and join you both in goodness.",
      },
      {
        title: "Le mari, en épousant sa femme",
        title_en: "The husband, upon marrying his wife",
        arabic:
          "اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَهَا وَخَيْرَ مَا جَبَلْتَهَا عَلَيْهِ، وَأَعُوذُ بِكَ مِنْ شَرِّهَا وَشَرِّ مَا جَبَلْتَهَا عَلَيْهِ",
        translation:
          "Ô Allah, je Te demande son bien et le bien de la nature sur laquelle Tu l'as façonnée, et je cherche protection auprès de Toi contre son mal et le mal de la nature sur laquelle Tu l'as façonnée.",
        translation_en:
          "O Allah, I ask You for the good in her and the good You made her disposed to, and I take refuge in You from the evil in her and the evil You made her disposed to.",
        merit: "Formule que le mari prononce en posant la main sur le front de son épouse. Rapportée par Abû Dâwûd et Ibn Mâjah (hadith hasan).",
        merit_en: "Said by the husband while placing his hand on his wife's forehead. Narrated by Abu Dawud and Ibn Majah (hasan).",
      },
    ],
  },
  enfants: {
    label: "Enfants",
    label_en: "Children",
    label_ar: "الأطفال",
    emoji: "👶",
    items: [
      {
        title: "Protection d'un enfant",
        title_en: "Protecting a child",
        arabic:
          "أُعِيذُكَ بِكَلِمَاتِ اللَّهِ التَّامَّةِ مِنْ كُلِّ شَيْطَانٍ وَهَامَّةٍ، وَمِنْ كُلِّ عَيْنٍ لَامَّةٍ",
        translation:
          "Je te place sous la protection des paroles parfaites d'Allah, contre tout diable, toute bête venimeuse, et tout œil malveillant.",
        translation_en:
          "I seek protection for you in the perfect words of Allah, from every devil and every poisonous creature, and from every evil eye.",
        merit: "Formule que le Prophète ﷺ récitait pour protéger ses petits-fils Hassan et Husayn. Rapporté par al-Bukhari.",
        merit_en: "Said by the Prophet ﷺ to protect his grandsons Hassan and Husayn. Narrated by al-Bukhari.",
      },
    ],
  },
  parents: {
    label: "Parents",
    label_en: "Parents",
    label_ar: "الوالدان",
    emoji: "👨‍👩‍👧",
    items: [
      {
        title: "Pour ses parents",
        title_en: "For one's parents",
        arabic: "رَبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا",
        translation: "Seigneur, fais-leur miséricorde comme ils m'ont élevé tout petit.",
        translation_en: "My Lord, have mercy upon them as they raised me when I was small.",
      },
      {
        title: "Demande de pardon pour ses parents",
        title_en: "Asking forgiveness for one's parents",
        arabic: "رَبِّ اغْفِرْ لِي وَلِوَالِدَيَّ وَلِلْمُؤْمِنِينَ يَوْمَ يَقُومُ الْحِسَابُ",
        translation: "Seigneur, pardonne-moi, ainsi qu'à mes parents et aux croyants, le jour où sera dressé le compte.",
        translation_en: "My Lord, forgive me and my parents and the believers on the Day the reckoning is established.",
        merit: "Sourate Ibrâhîm, verset 41.",
        merit_en: "Surah Ibrahim, verse 41.",
      },
    ],
  },
  maladie: {
    label: "Maladie",
    label_en: "Illness",
    label_ar: "المرض",
    emoji: "🤒",
    items: [
      {
        title: "Pour un malade",
        title_en: "For a sick person",
        arabic: "أَذْهِبِ الْبَأْسَ رَبَّ النَّاسِ، اشْفِ أَنْتَ الشَّافِي، لَا شِفَاءَ إِلَّا شِفَاؤُكَ، شِفَاءً لَا يُغَادِرُ سَقَمًا",
        translation:
          "Éloigne le mal, Seigneur des hommes, guéris, Tu es Celui qui guérit, il n'y a de guérison que la Tienne, une guérison qui ne laisse aucune maladie.",
        translation_en:
          "Remove the harm, Lord of mankind, and heal, You are the Healer, there is no healing but Your healing, a healing that leaves no illness behind.",
      },
      {
        title: "En visitant un malade",
        title_en: "Visiting a sick person",
        arabic: "أَسْأَلُ اللَّهَ الْعَظِيمَ رَبَّ الْعَرْشِ الْعَظِيمِ أَنْ يَشْفِيَكَ",
        translation: "Je demande à Allah l'Immense, Seigneur du Trône immense, de te guérir.",
        translation_en: "I ask Allah the Mighty, Lord of the mighty throne, to heal you.",
        merit: "À répéter sept fois auprès d'un malade dont le terme n'est pas arrivé. Rapporté par at-Tirmidhî (hadith hasan).",
        merit_en: "To be repeated seven times by a sick person whose time has not come. Narrated by at-Tirmidhi (hasan).",
      },
    ],
  },
  deces: {
    label: "Décès",
    label_en: "Death",
    label_ar: "الوفاة",
    emoji: "🤍",
    items: [
      {
        title: "Pour un défunt",
        title_en: "For the deceased",
        arabic: "اللَّهُمَّ اغْفِرْ لَهُ وَارْحَمْهُ وَعَافِهِ وَاعْفُ عَنْهُ",
        translation: "Ô Allah, pardonne-lui, fais-lui miséricorde, préserve-le, et efface ses fautes.",
        translation_en: "O Allah, forgive him, have mercy upon him, keep him safe, and pardon him.",
      },
      {
        title: "En cas de deuil ou d'épreuve",
        title_en: "In grief or trial",
        arabic: "إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ، اللَّهُمَّ أْجُرْنِي فِي مُصِيبَتِي وَأَخْلِفْ لِي خَيْرًا مِنْهَا",
        translation:
          "Certes nous appartenons à Allah et c'est à Lui que nous retournons. Ô Allah, récompense-moi dans mon épreuve et accorde-moi mieux en échange.",
        translation_en:
          "Truly, to Allah we belong and truly, to Him we shall return. O Allah, reward me for my affliction and compensate me with something better than it.",
        merit: "Sourate Al-Baqara, verset 156, complétée par l'invocation du Prophète ﷺ rapportée par Muslim (hadith d'Umm Salama).",
        merit_en: "Surah Al-Baqarah, verse 156, completed by the Prophet's ﷺ supplication narrated by Muslim (hadith of Umm Salamah).",
      },
    ],
  },
  societe: {
    label: "Société",
    label_en: "Society",
    label_ar: "المجتمع",
    emoji: "🤝",
    items: [
      {
        title: "Le salut entre croyants",
        title_en: "The greeting between believers",
        arabic: "السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ",
        translation: "Que la paix, la miséricorde d'Allah et Ses bénédictions soient sur vous.",
        translation_en: "May peace, the mercy of Allah, and His blessings be upon you.",
      },
      {
        title: "En réponse à celui qui éternue",
        title_en: "Replying to someone who sneezes",
        arabic: "يَرْحَمُكَ اللَّهُ",
        translation: "Qu'Allah te fasse miséricorde.",
        translation_en: "May Allah have mercy on you.",
        merit: "Réponse prescrite lorsqu'une personne dit « Al-hamdu lillah » après avoir éternué. Rapportée par al-Bukhari.",
        merit_en: "The prescribed reply when a person says 'Al-hamdu lillah' after sneezing. Narrated by al-Bukhari.",
      },
    ],
  },
  voyage: {
    label: "Voyage",
    label_en: "Travel",
    label_ar: "السفر",
    emoji: "✈️",
    items: [
      {
        title: "En montant en voiture",
        title_en: "Getting into a vehicle",
        arabic:
          "بِسْمِ اللَّهِ، الْحَمْدُ لِلَّهِ، سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ، وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ",
        translation:
          "Au nom d'Allah. Louange à Allah. Gloire à Celui qui a mis ceci à notre service, nous n'aurions pu le maîtriser par nous-mêmes, et c'est vers notre Seigneur que nous retournerons.",
        translation_en:
          "In the name of Allah. All praise is for Allah. How perfect He is, the One who has placed this at our service, and we ourselves would not have been capable of that, and unto our Lord we shall return.",
      },
      {
        title: "En prenant la route (long voyage)",
        title_en: "Setting off (long journey)",
        arabic:
          "اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، اللَّهُمَّ إِنَّا نَسْأَلُكَ فِي سَفَرِنَا هَذَا الْبِرَّ وَالتَّقْوَى، وَمِنَ الْعَمَلِ مَا تَرْضَى، اللَّهُمَّ هَوِّنْ عَلَيْنَا سَفَرَنَا هَذَا وَاطْوِ عَنَّا بُعْدَهُ، اللَّهُمَّ أَنْتَ الصَّاحِبُ فِي السَّفَرِ، وَالْخَلِيفَةُ فِي الْأَهْلِ",
        translation:
          "Allah est le plus Grand (×3). Ô Allah, nous Te demandons, en ce voyage, la piété et la crainte révérencielle, et les œuvres qui T'agréent. Ô Allah, facilite-nous ce voyage et raccourcis-en la distance. Ô Allah, Tu es le Compagnon du voyage et le Gardien de la famille restée en arrière.",
        translation_en:
          "Allah is the greatest (×3). O Allah, we ask You for righteousness and piety on this journey of ours, and for deeds that please You. O Allah, make this journey easy for us and shorten its distance. O Allah, You are our Companion on the road and the One in whose care we leave our family.",
      },
    ],
  },
  pluie: {
    label: "Pluie",
    label_en: "Rain",
    label_ar: "المطر",
    emoji: "🌧️",
    items: [
      {
        title: "En voyant la pluie",
        title_en: "Upon seeing the rain",
        arabic: "اللَّهُمَّ صَيِّبًا نَافِعًا",
        translation: "Ô Allah, fais que ce soit une pluie bénéfique.",
        translation_en: "O Allah, make it a beneficial rain.",
      },
      {
        title: "Après la pluie",
        title_en: "After the rain",
        arabic: "مُطِرْنَا بِفَضْلِ اللَّهِ وَرَحْمَتِهِ",
        translation: "Nous avons été arrosés par la grâce et la miséricorde d'Allah.",
        translation_en: "We have been given rain by the grace and mercy of Allah.",
        merit: "Formule qui exprime la foi correcte face à la pluie. Rapportée par al-Bukhari et Muslim.",
        merit_en: "The expression of correct faith when facing rain. Narrated by al-Bukhari and Muslim.",
      },
    ],
  },
  animaux: {
    label: "Animaux",
    label_en: "Animals",
    label_ar: "الحيوانات",
    emoji: "🐑",
    items: [
      {
        title: "En montant une monture",
        title_en: "Mounting a ride",
        arabic: "بِسْمِ اللَّهِ",
        translation: "Au nom d'Allah.",
        translation_en: "In the name of Allah.",
      },
    ],
  },
  richesse: {
    label: "Richesse",
    label_en: "Wealth",
    label_ar: "الرزق",
    emoji: "💰",
    items: [
      {
        title: "Pour la subsistance licite",
        title_en: "For lawful provision",
        arabic: "اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ، وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ",
        translation:
          "Ô Allah, suffis-moi par ce qui est licite loin de ce qui est illicite, et rends-moi riche par Ta grâce, me passant de tout autre que Toi.",
        translation_en:
          "O Allah, suffice me with what You have allowed instead of what You have forbidden, and make me independent of all others besides You by Your grace.",
      },
    ],
  },
  savoir: {
    label: "Savoir",
    label_en: "Knowledge",
    label_ar: "العلم",
    emoji: "📚",
    items: [
      {
        title: "Demande de science",
        title_en: "Asking for knowledge",
        arabic: "رَبِّ زِدْنِي عِلْمًا",
        translation: "Seigneur, accroît mon savoir.",
        translation_en: "My Lord, increase me in knowledge.",
      },
      {
        title: "Science bénéfique",
        title_en: "Beneficial knowledge",
        arabic: "اللَّهُمَّ انْفَعْنِي بِمَا عَلَّمْتَنِي، وَعَلِّمْنِي مَا يَنْفَعُنِي، وَزِدْنِي عِلْمًا",
        translation: "Ô Allah, fais-moi profiter de ce que Tu m'as enseigné, enseigne-moi ce qui m'est utile, et accroît mon savoir.",
        translation_en: "O Allah, benefit me with what You have taught me, and teach me what will benefit me, and increase me in knowledge.",
        merit: "Rapportée par Ibn Mâjah et authentifiée par l'imam al-Albânî.",
        merit_en: "Narrated by Ibn Majah and authenticated by Imam al-Albani.",
      },
    ],
  },
  bienfaits: {
    label: "Bienfaits",
    label_en: "Blessings",
    label_ar: "النعم",
    emoji: "🎁",
    items: [
      {
        title: "En voyant une personne éprouvée",
        title_en: "Upon seeing someone afflicted",
        arabic:
          "الْحَمْدُ لِلَّهِ الَّذِي عَافَانِي مِمَّا ابْتَلَاكَ بِهِ، وَفَضَّلَنِي عَلَى كَثِيرٍ مِمَّنْ خَلَقَ تَفْضِيلًا",
        translation:
          "Louange à Allah qui m'a préservé de ce dont Il t'a éprouvé, et m'a favorisé par rapport à beaucoup de Ses créatures.",
        translation_en:
          "All praise is for Allah who has kept me safe from what He has afflicted you with, and favoured me above much of what He has created.",
        merit: "À dire discrètement, sans que la personne éprouvée l'entende. Rapporté par at-Tirmidhi.",
        merit_en: "To be said quietly, without the afflicted person hearing it. Narrated by at-Tirmidhi.",
      },
    ],
  },
};

// Intelligent grouping — thematic, not a flat grid
const INVOCATION_GROUPS = [
  { id: "quotidien", label: "Moments du quotidien", label_en: "Daily moments", label_ar: "لحظات يومية", topics: ["sommeil", "ablutions", "maison", "habits", "toilettes", "nourriture"] },
  { id: "culte", label: "Actes d'adoration", label_en: "Acts of worship", label_ar: "أعمال العبادة", topics: ["mosquee", "priere", "istikhara", "hajj", "ramadan", "louange", "repentir", "rabbana"] },
  { id: "coeur", label: "États du cœur", label_en: "States of the heart", label_ar: "أحوال القلب", topics: ["tristesse", "joie", "doute", "colere", "tentation", "protection"] },
  { id: "relations", label: "Étapes et relations", label_en: "Life stages and relationships", label_ar: "المراحل والعلاقات", topics: ["mariage", "enfants", "parents", "maladie", "deces", "societe"] },
  { id: "monde", label: "Dans le monde", label_en: "Out in the world", label_ar: "في الحياة", topics: ["voyage", "pluie", "animaux", "richesse", "savoir"] },
  { id: "perso", label: "Personnel", label_en: "Personal", label_ar: "شخصي", topics: ["bienfaits"] },
];

const PERSONAL_INVOCATIONS_KEY = "azkar-personal-invocations-v1";

/* ------------------------------------------------------------------ */
/* Quran reader — surah metadata (number, Arabic name, transliteration, */
/* French meaning, verse count). Verse text itself is fetched live.    */
/* ------------------------------------------------------------------ */
const QURAN_SURAHS_RAW = [
  [1, "الفاتحة", "Al-Fatiha", "L'Ouverture", 7, "The Opening"],
  [2, "البقرة", "Al-Baqara", "La Vache", 286, "The Cow"],
  [3, "آل عمران", "Aali Imran", "La Famille d'Imran", 200, "The Family of Imran"],
  [4, "النساء", "An-Nisa", "Les Femmes", 176, "The Women"],
  [5, "المائدة", "Al-Ma'ida", "La Table servie", 120, "The Table Spread"],
  [6, "الأنعام", "Al-An'am", "Les Bestiaux", 165, "The Cattle"],
  [7, "الأعراف", "Al-A'raf", "Les Murailles", 206, "The Heights"],
  [8, "الأنفال", "Al-Anfal", "Le Butin", 75, "The Spoils of War"],
  [9, "التوبة", "At-Tawba", "Le Repentir", 129, "The Repentance"],
  [10, "يونس", "Yunus", "Jonas", 109, "Jonah"],
  [11, "هود", "Hud", "Hud", 123, "Hud"],
  [12, "يوسف", "Yusuf", "Joseph", 111, "Joseph"],
  [13, "الرعد", "Ar-Ra'd", "Le Tonnerre", 43, "The Thunder"],
  [14, "ابراهيم", "Ibrahim", "Abraham", 52, "Abraham"],
  [15, "الحجر", "Al-Hijr", "Al-Hijr", 99, "The Rocky Tract"],
  [16, "النحل", "An-Nahl", "Les Abeilles", 128, "The Bee"],
  [17, "الإسراء", "Al-Isra", "Le Voyage nocturne", 111, "The Night Journey"],
  [18, "الكهف", "Al-Kahf", "La Caverne", 110, "The Cave"],
  [19, "مريم", "Maryam", "Marie", 98, "Mary"],
  [20, "طه", "Ta-Ha", "Ta-Ha", 135, "Ta-Ha"],
  [21, "الأنبياء", "Al-Anbiya", "Les Prophètes", 112, "The Prophets"],
  [22, "الحج", "Al-Hajj", "Le Pèlerinage", 78, "The Pilgrimage"],
  [23, "المؤمنون", "Al-Mu'minun", "Les Croyants", 118, "The Believers"],
  [24, "النور", "An-Nur", "La Lumière", 64, "The Light"],
  [25, "الفرقان", "Al-Furqan", "Le Discernement", 77, "The Criterion"],
  [26, "الشعراء", "Ash-Shu'ara", "Les Poètes", 227, "The Poets"],
  [27, "النمل", "An-Naml", "Les Fourmis", 93, "The Ant"],
  [28, "القصص", "Al-Qasas", "Le Récit", 88, "The Story"],
  [29, "العنكبوت", "Al-Ankabut", "L'Araignée", 69, "The Spider"],
  [30, "الروم", "Ar-Rum", "Les Romains", 60, "The Romans"],
  [31, "لقمان", "Luqman", "Luqman", 34, "Luqman"],
  [32, "السجدة", "As-Sajda", "La Prosternation", 30, "The Prostration"],
  [33, "الأحزاب", "Al-Ahzab", "Les Coalisés", 73, "The Combined Forces"],
  [34, "سبأ", "Saba", "Saba", 54, "Sheba"],
  [35, "فاطر", "Fatir", "Le Créateur", 45, "Originator"],
  [36, "يس", "Ya-Sin", "Ya-Sin", 83, "Ya-Sin"],
  [37, "الصافات", "As-Saffat", "Les Rangés", 182, "Those Who Set the Ranks"],
  [38, "ص", "Sad", "Sad", 88, "The Letter Saad"],
  [39, "الزمر", "Az-Zumar", "Les Groupes", 75, "The Troops"],
  [40, "غافر", "Ghafir", "Le Pardonneur", 85, "The Forgiver"],
  [41, "فصلت", "Fussilat", "Les Versets détaillés", 54, "Explained in Detail"],
  [42, "الشورى", "Ash-Shura", "La Concertation", 53, "The Consultation"],
  [43, "الزخرف", "Az-Zukhruf", "L'Ornement", 89, "The Ornaments of Gold"],
  [44, "الدخان", "Ad-Dukhan", "La Fumée", 59, "The Smoke"],
  [45, "الجاثية", "Al-Jathiya", "L'Agenouillée", 37, "The Crouching"],
  [46, "الأحقاف", "Al-Ahqaf", "Al-Ahqaf", 35, "The Wind-Curved Sandhills"],
  [47, "محمد", "Muhammad", "Muhammad", 38, "Muhammad"],
  [48, "الفتح", "Al-Fath", "La Victoire éclatante", 29, "The Victory"],
  [49, "الحجرات", "Al-Hujurat", "Les Appartements", 18, "The Rooms"],
  [50, "ق", "Qaf", "Qaf", 45, "The Letter Qaf"],
  [51, "الذاريات", "Adh-Dhariyat", "Qui éparpillent", 60, "The Winnowing Winds"],
  [52, "الطور", "At-Tur", "Le Mont", 49, "The Mount"],
  [53, "النجم", "An-Najm", "L'Étoile", 62, "The Star"],
  [54, "القمر", "Al-Qamar", "La Lune", 55, "The Moon"],
  [55, "الرحمن", "Ar-Rahman", "Le Tout Miséricordieux", 78, "The Most Merciful"],
  [56, "الواقعة", "Al-Waqi'a", "L'Événement", 96, "The Inevitable"],
  [57, "الحديد", "Al-Hadid", "Le Fer", 29, "The Iron"],
  [58, "المجادلة", "Al-Mujadila", "La Discussion", 22, "The Pleading Woman"],
  [59, "الحشر", "Al-Hashr", "L'Exode", 24, "The Exile"],
  [60, "الممتحنة", "Al-Mumtahina", "L'Éprouvée", 13, "She That Is To Be Examined"],
  [61, "الصف", "As-Saff", "Le Rang", 14, "The Ranks"],
  [62, "الجمعة", "Al-Jumu'a", "Le Vendredi", 11, "Friday"],
  [63, "المنافقون", "Al-Munafiqun", "Les Hypocrites", 11, "The Hypocrites"],
  [64, "التغابن", "At-Taghabun", "La Grande Perte", 18, "Mutual Disillusion"],
  [65, "الطلاق", "At-Talaq", "Le Divorce", 12, "The Divorce"],
  [66, "التحريم", "At-Tahrim", "L'Interdiction", 12, "The Prohibition"],
  [67, "الملك", "Al-Mulk", "La Royauté", 30, "The Sovereignty"],
  [68, "القلم", "Al-Qalam", "La Plume", 52, "The Pen"],
  [69, "الحاقة", "Al-Haqqa", "Celle qui montre la vérité", 52, "The Reality"],
  [70, "المعارج", "Al-Ma'arij", "Les Voies d'ascension", 44, "The Ascending Stairways"],
  [71, "نوح", "Nuh", "Noé", 28, "Noah"],
  [72, "الجن", "Al-Jinn", "Les Djinns", 28, "The Jinn"],
  [73, "المزمل", "Al-Muzzammil", "L'Enveloppé", 20, "The Enshrouded One"],
  [74, "المدثر", "Al-Muddathir", "Le Revêtu d'un manteau", 56, "The Cloaked One"],
  [75, "القيامة", "Al-Qiyama", "La Résurrection", 40, "The Resurrection"],
  [76, "الانسان", "Al-Insan", "L'Homme", 31, "Man"],
  [77, "المرسلات", "Al-Mursalat", "Les Envoyés", 50, "Those Sent Forth"],
  [78, "النبأ", "An-Naba", "La Nouvelle", 40, "The Tidings"],
  [79, "النازعات", "An-Nazi'at", "Les Anges qui arrachent", 46, "Those Who Drag Forth"],
  [80, "عبس", "Abasa", "Il s'est renfrogné", 42, "He Frowned"],
  [81, "التكوير", "At-Takwir", "L'Obscurcissement", 29, "The Overthrowing"],
  [82, "الإنفطار", "Al-Infitar", "La Rupture", 19, "The Cleaving"],
  [83, "المطففين", "Al-Mutaffifin", "Les Fraudeurs", 36, "Defrauding"],
  [84, "الإنشقاق", "Al-Inshiqaq", "La Déchirure", 25, "The Splitting Open"],
  [85, "البروج", "Al-Buruj", "Les Constellations", 22, "The Mansions of the Stars"],
  [86, "الطارق", "At-Tariq", "L'Astre nocturne", 17, "The Morning Star"],
  [87, "الأعلى", "Al-A'la", "Le Très-Haut", 19, "The Most High"],
  [88, "الغاشية", "Al-Ghashiya", "L'Enveloppante", 26, "The Overwhelming"],
  [89, "الفجر", "Al-Fajr", "L'Aube", 30, "The Dawn"],
  [90, "البلد", "Al-Balad", "La Cité", 20, "The City"],
  [91, "الشمس", "Ash-Shams", "Le Soleil", 15, "The Sun"],
  [92, "الليل", "Al-Layl", "La Nuit", 21, "The Night"],
  [93, "الضحى", "Ad-Duha", "Le Jour montant", 11, "The Morning Hours"],
  [94, "الشرح", "Ash-Sharh", "L'Ouverture", 8, "The Relief"],
  [95, "التين", "At-Tin", "Le Figuier", 8, "The Fig"],
  [96, "العلق", "Al-Alaq", "L'Adhérence", 19, "The Clot"],
  [97, "القدر", "Al-Qadr", "La Destinée", 5, "The Power"],
  [98, "البينة", "Al-Bayyina", "La Preuve", 8, "The Clear Proof"],
  [99, "الزلزلة", "Az-Zalzala", "La Secousse", 8, "The Earthquake"],
  [100, "العاديات", "Al-Adiyat", "Les Coursiers", 11, "The Courser"],
  [101, "القارعة", "Al-Qari'a", "Le Fracas", 11, "The Calamity"],
  [102, "التكاثر", "At-Takathur", "La Course aux richesses", 8, "The Rivalry in World Increase"],
  [103, "العصر", "Al-Asr", "Le Temps", 3, "The Declining Day"],
  [104, "الهمزة", "Al-Humaza", "Les Calomniateurs", 9, "The Traducer"],
  [105, "الفيل", "Al-Fil", "L'Éléphant", 5, "The Elephant"],
  [106, "قريش", "Quraysh", "Quraysh", 4, "Quraysh"],
  [107, "الماعون", "Al-Ma'un", "L'Ustensile", 7, "The Small Kindnesses"],
  [108, "الكوثر", "Al-Kawthar", "L'Abondance", 3, "The Abundance"],
  [109, "الكافرون", "Al-Kafirun", "Les Infidèles", 6, "The Disbelievers"],
  [110, "النصر", "An-Nasr", "Le Secours", 3, "The Divine Support"],
  [111, "المسد", "Al-Masad", "Les Fibres", 5, "The Palm Fiber"],
  [112, "الإخلاص", "Al-Ikhlas", "Le Monothéisme pur", 4, "The Sincerity"],
  [113, "الفلق", "Al-Falaq", "L'Aube naissante", 5, "The Daybreak"],
  [114, "الناس", "An-Nas", "Les Hommes", 6, "Mankind"],
];
const QURAN_SURAHS = QURAN_SURAHS_RAW.map(([number, arabic, translit, meaning, ayahCount, meaningEn]) => ({
  number,
  arabic,
  translit,
  meaning,
  meaning_en: meaningEn,
  ayahCount,
}));
const QURAN_TOTAL_AYAHS = QURAN_SURAHS.reduce((sum, s) => sum + s.ayahCount, 0);
const QURAN_PROGRESS_KEY = "azkar-quran-progress-v1";
const QURAN_DAILY_KEY = "azkar-quran-daily-v1";

// Shared by the translation reader and the Mushaf page view so reading
// progress — and the daily count the dashboard shows — updates the same
// way no matter which reading mode was used to reach a given verse.
async function markQuranAyahRead(surahNumber, ayahNumber) {
  let progress = { lastSurah: null, lastAyah: null, readAyahs: {} };
  try {
    const res = await window.storage.get(QURAN_PROGRESS_KEY, false);
    if (res && res.value) progress = JSON.parse(res.value);
  } catch (e) {
    // no progress saved yet
  }
  const prevRead = (progress.readAyahs && progress.readAyahs[surahNumber]) || 0;
  const nextRead = { ...(progress.readAyahs || {}), [surahNumber]: Math.max(prevRead, ayahNumber) };
  const next = { lastSurah: surahNumber, lastAyah: ayahNumber, readAyahs: nextRead };
  try {
    await window.storage.set(QURAN_PROGRESS_KEY, JSON.stringify(next), false);
  } catch (e) {
    // ignore storage failures
  }
  const delta = ayahNumber - prevRead;
  if (delta > 0) {
    try {
      const today = todayKey();
      const res = await window.storage.get(QURAN_DAILY_KEY, false);
      const log = res && res.value ? JSON.parse(res.value) : {};
      log[today] = (log[today] || 0) + delta;
      await window.storage.set(QURAN_DAILY_KEY, JSON.stringify(log), false);
    } catch (e) {
      // ignore storage failures
    }
    // The Bilan's "pages lues" count is Mushaf-page-based — feed it from here
    // too, so listening/reading via the reciter screens counts just as much
    // as reading the Mushaf page view directly, instead of only the latter.
    try {
      const page = await fetchVersePage(surahNumber, ayahNumber);
      if (page) await markMushafPageRead(page);
    } catch (e) {
      // offline or API hiccup — the Mushaf view will still catch it up later
    }
  }
  return next;
}

const QURAN_READ_PAGES_KEY = "azkar-quran-read-pages-v1";
const QURAN_PAGES_DAILY_KEY = "azkar-quran-pages-daily-v1";
const QURAN_PAGES_DAILY_MARKED_KEY = "azkar-quran-pages-daily-marked-v1";

// The Bilan counts Mushaf pages, not verses — simpler to picture and it only
// moves when the reader deliberately taps "Marquer comme lue" at the bottom
// of a page, not just from having it on screen. QURAN_READ_PAGES_KEY (the
// lifetime list) only drives the "already visited" checkmark in the page
// view — it must never gate the daily counter, or re-reading a page on a
// later day would leave that day's Bilan stuck at 0. So today's count is
// deduped separately, against only what was marked today.
async function markMushafPageRead(pageNumber) {
  let readPages = [];
  try {
    const res = await window.storage.get(QURAN_READ_PAGES_KEY, false);
    if (res && res.value) readPages = JSON.parse(res.value);
  } catch (e) {
    // none read yet
  }
  if (!readPages.includes(pageNumber)) {
    readPages.push(pageNumber);
    try {
      await window.storage.set(QURAN_READ_PAGES_KEY, JSON.stringify(readPages), false);
    } catch (e) {
      // ignore storage failures
    }
  }
  const today = todayKey();
  try {
    const markedRes = await window.storage.get(QURAN_PAGES_DAILY_MARKED_KEY, false);
    const markedLog = markedRes && markedRes.value ? JSON.parse(markedRes.value) : {};
    const markedToday = markedLog[today] || [];
    if (markedToday.includes(pageNumber)) return true;
    markedLog[today] = [...markedToday, pageNumber];
    await window.storage.set(QURAN_PAGES_DAILY_MARKED_KEY, JSON.stringify(markedLog), false);
  } catch (e) {
    // ignore storage failures
  }
  try {
    const res = await window.storage.get(QURAN_PAGES_DAILY_KEY, false);
    const log = res && res.value ? JSON.parse(res.value) : {};
    log[today] = (log[today] || 0) + 1;
    await window.storage.set(QURAN_PAGES_DAILY_KEY, JSON.stringify(log), false);
  } catch (e) {
    // ignore storage failures
  }
  return true;
}

const QURAN_API_BASE = "https://api.alquran.cloud/v1/surah";
const QURAN_MUSHAF_PAGE_KEY = "azkar-quran-mushaf-page-v1";
const QURAN_BOOKMARKS_KEY = "azkar-quran-bookmarks-v1";
const QURAN_OFFLINE_FLAG_KEY = "azkar-quran-offline-complete-v1";

// Multiple saved Mushaf pages — distinct from QURAN_MUSHAF_PAGE_KEY (which
// only remembers the single last-viewed page) and from QURAN_PROGRESS_KEY
// (reading progress toward a "page lue" checkmark).
async function loadBookmarks() {
  try {
    const res = await window.storage.get(QURAN_BOOKMARKS_KEY, false);
    if (res && res.value) return JSON.parse(res.value);
  } catch (e) {
    // none saved yet
  }
  return [];
}
async function saveBookmarks(list) {
  try {
    await window.storage.set(QURAN_BOOKMARKS_KEY, JSON.stringify(list), false);
  } catch (e) {
    // ignore storage failures
  }
}
const QURAN_RECITER_KEY = "azkar-quran-reciter-v1";
const QURAN_AYAH_AUDIO_ROOT = "https://cdn.islamic.network/quran/audio";
// Every reciter below was individually verified against the per-ayah CDN —
// each only serves audio at one specific bitrate, so it's recorded per entry.
const RECITERS = [
  { id: "ar.abdulbasitmurattal", name: "Abdul Basit", arabicName: "عبد الباسط عبد الصمد", bitrate: 64 },
  { id: "ar.abdulsamad", name: "Abdul Samad", arabicName: "عبدالباسط عبدالصمد", bitrate: 64 },
  { id: "ar.abdurrahmaansudais", name: "As-Sudais", arabicName: "عبدالرحمن السديس", bitrate: 64 },
  { id: "ar.saoodshuraym", name: "Ash-Shuraym", arabicName: "سعود الشريم", bitrate: 64 },
  { id: "ar.husary", name: "Al-Husary", arabicName: "محمود خليل الحصري", bitrate: 128 },
  { id: "ar.husarymujawwad", name: "Al-Husary (Mujawwad)", arabicName: "الحصري (المجود)", bitrate: 128 },
  { id: "ar.minshawi", name: "Al-Minshawi", arabicName: "محمد صديق المنشاوي", bitrate: 128 },
  { id: "ar.minshawimujawwad", name: "Al-Minshawi (Mujawwad)", arabicName: "المنشاوي (المجود)", bitrate: 64 },
  { id: "ar.mahermuaiqly", name: "Al-Muaiqly", arabicName: "ماهر المعيقلي", bitrate: 128 },
  { id: "ar.hudhaify", name: "Al-Hudhaify", arabicName: "علي بن عبدالرحمن الحذيفي", bitrate: 128 },
  { id: "ar.shaatree", name: "Ash-Shaatree", arabicName: "أبو بكر الشاطري", bitrate: 128 },
  { id: "ar.ahmedajamy", name: "Al-Ajamy", arabicName: "أحمد بن علي العجمي", bitrate: 128 },
  { id: "ar.muhammadayyoub", name: "Muhammad Ayyoub", arabicName: "محمد أيوب", bitrate: 128 },
  { id: "ar.muhammadjibreel", name: "Muhammad Jibreel", arabicName: "محمد جبريل", bitrate: 128 },
  { id: "ar.abdullahbasfar", name: "Abdullah Basfar", arabicName: "عبد الله بصفر", bitrate: 64 },
  { id: "ar.hanirifai", name: "Hani Rifai", arabicName: "هاني الرفاعي", bitrate: 64 },
  { id: "ar.ibrahimakhbar", name: "Ibrahim Akhdar", arabicName: "إبراهيم الأخضر", bitrate: 32 },
  { id: "ar.aymanswoaid", name: "Ayman Sowaid", arabicName: "أيمن سويد", bitrate: 64 },
  { id: "ar.parhizgar", name: "Parhizgar", arabicName: "شهریار پرهیزگار", bitrate: 48 },
];
function reciterAudioUrl(reciterId, ayahNumber) {
  const r = RECITERS.find((x) => x.id === reciterId) || RECITERS[0];
  return `${QURAN_AYAH_AUDIO_ROOT}/${r.bitrate}/${r.id}/${ayahNumber}.mp3`;
}

// A handful of newer/popular reciters (incl. current Haramain imams) that
// mp3quran.net hosts only as one continuous file per surah, not split by
// ayah like the CDN above — so they get their own simple "listen straight
// through" screen instead of the verse-by-verse reader, rather than being
// mixed into RECITERS where the per-ayah reading flow would 404 on them.
const FULL_SURAH_RECITERS = [
  { id: "luhaidan", name: "Muhammad Al-Luhaidan", arabicName: "محمد اللحيدان", server: "https://server8.mp3quran.net/lhdan/" },
  { id: "dosari", name: "Yasser Al-Dosari", arabicName: "ياسر الدوسري", server: "https://server11.mp3quran.net/yasser/" },
  { id: "baleela", name: "Bandar Baleela", arabicName: "بندر بليلة", server: "https://server6.mp3quran.net/balilah/" },
];
function fullSurahAudioUrl(reciter, surahNumber) {
  return `${reciter.server}${String(surahNumber).padStart(3, "0")}.mp3`;
}
const QURAN_TOTAL_PAGES = 604;
// Standard Madani Mushaf (604 pages) — printed page each of the 30 Juz starts on.
const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462,
  482, 502, 522, 542, 562, 582,
];

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */
function CategoryIcon({ type, color, size = 26 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none" };
  if (type === "sun") {
    return (
      <svg {...common}>
        <circle cx="12" cy="16" r="4.5" stroke={color} strokeWidth="1.6" />
        <path d="M12 3v3M4.5 8.5 6.6 10.6M19.5 8.5 17.4 10.6M2.5 16h3M18.5 16h3" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "moon") {
    return (
      <svg {...common}>
        <path d="M18.5 14.5A7.5 7.5 0 1 1 9.5 5.2a6 6 0 0 0 9 9.3Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="16" cy="8" r="0.9" fill={color} />
        <circle cx="18.2" cy="11.4" r="0.6" fill={color} />
      </svg>
    );
  }
  if (type === "hands") {
    return (
      <svg {...common}>
        <path d="M12 3v11.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M6 21c0-3.5 2.6-5.5 6-5.5s6 2 6 5.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M6.5 9c0 2.2 1.4 4 2.8 5.5M17.5 9c0 2.2-1.4 4-2.8 5.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  // "bed" — used for the sleep azkar, kept visually distinct from "moon"
  return (
    <svg {...common}>
      <path d="M3 18v-6.5a2 2 0 0 1 2-2h3.5a2 2 0 0 1 2 2V13" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 13v-1.5a2 2 0 0 1 2-2h3.5a2 2 0 0 1 2 2V18" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 18h18M3.5 18v2.5M20.5 18v2.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// One consistent line-icon per invocation topic — replaces the old emoji
// (which rendered in whatever colorful style the OS font shipped, clashing
// with the rest of the app's single-color stroke icons) with the same
// minimal 24x24 stroke language used everywhere else, tinted with the
// current accent color like every other icon in the app.
function InvocationIcon({ type, color, size = 20 }) {
  const c = { width: size, height: size, viewBox: "0 0 24 24", fill: "none" };
  const s = { stroke: color, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (type) {
    case "sommeil":
      return <CategoryIcon type="bed" color={color} size={size} />;
    case "ramadan":
      return <CategoryIcon type="moon" color={color} size={size} />;
    case "priere":
    case "hajj":
      return <CategoryIcon type="hands" color={color} size={size} />;
    case "ablutions":
      return (
        <svg {...c}>
          <path d="M12 2.5C12 2.5 6.5 10 6.5 14.5a5.5 5.5 0 0 0 11 0C17.5 10 12 2.5 12 2.5Z" {...s} />
        </svg>
      );
    case "maison":
      return (
        <svg {...c}>
          <path d="M3 11 12 3l9 8" {...s} />
          <path d="M5 10v10h14V10" {...s} />
        </svg>
      );
    case "habits":
      return (
        <svg {...c}>
          <path d="M8 4 4 7l2.5 3L8 8.5V20h8V8.5L17.5 10 20 7l-4-3q-2 2-4 2t-4-2Z" {...s} />
        </svg>
      );
    case "toilettes":
      return (
        <svg {...c}>
          <path d="M6 21V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17" {...s} />
          <path d="M4 21h16" {...s} />
          <circle cx="14.5" cy="12" r="0.9" fill={color} />
        </svg>
      );
    case "nourriture":
      return (
        <svg {...c}>
          <path d="M4 12a8 8 0 0 0 16 0" {...s} />
          <path d="M4 12h16M12 4v5" {...s} />
        </svg>
      );
    case "mosquee":
      return (
        <svg {...c}>
          <path d="M4 21h16M6 21v-8a6 6 0 0 1 12 0v8" {...s} />
          <path d="M12 13V5M9.5 6H14.5" {...s} />
          <path d="M12 2.5 13.4 5H10.6Z" fill={color} stroke="none" />
        </svg>
      );
    case "istikhara":
      return (
        <svg {...c}>
          <path
            d="M12 3 13.6 8.6 19.4 9.2 15 13 16.4 18.7 12 15.4 7.6 18.7 9 13 4.6 9.2 10.4 8.6Z"
            {...s}
          />
        </svg>
      );
    case "louange":
    case "repentir":
      return (
        <svg {...c}>
          <path d="M6 20C6 12 7.5 8 7.5 4M18 20C18 12 16.5 8 16.5 4" {...s} />
        </svg>
      );
    case "rabbana":
    case "savoir":
      return <BookIcon color={color} size={size} />;
    case "tristesse":
    case "pluie":
      return (
        <svg {...c}>
          <path d="M7 16a4 4 0 0 1 .4-8 5.5 5.5 0 0 1 10.1-1.6A4.5 4.5 0 0 1 17 16H7Z" {...s} />
          {type === "pluie" && <path d="M9 19.5 8 21.5M13 19.5 12 21.5M17 19.5 16 21.5" {...s} />}
        </svg>
      );
    case "joie":
      return <StarIcon color={color} size={size} filled={false} />;
    case "doute":
      return (
        <svg {...c}>
          <path d="M9.2 9a3 3 0 1 1 4.2 2.7c-.8.4-1.4 1-1.4 2v.5" {...s} />
          <path d="M12 17.2h.01" {...s} />
        </svg>
      );
    case "colere":
      return (
        <svg {...c}>
          <path d="M4 8h5.5a2.5 2.5 0 1 0-2.5-2.5" {...s} />
          <path d="M4 13h9.5a2.5 2.5 0 1 1-2.5 2.5" {...s} />
          <path d="M4 18h6.5a2.5 2.5 0 1 1-2.5 2.5" {...s} />
        </svg>
      );
    case "tentation":
      return (
        <svg {...c}>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" {...s} />
          <path d="M8.5 8.5 16.5 16" {...s} />
        </svg>
      );
    case "protection":
      return (
        <svg {...c}>
          <path d="M12 3 19.5 6v5.5c0 5-3.4 8.4-7.5 9.5-4.1-1.1-7.5-4.5-7.5-9.5V6Z" {...s} />
        </svg>
      );
    case "mariage":
      return (
        <svg {...c}>
          <circle cx="9" cy="14" r="4" {...s} />
          <circle cx="15" cy="14" r="4" {...s} />
        </svg>
      );
    case "enfants":
      return (
        <svg {...c}>
          <circle cx="12" cy="6.5" r="3" {...s} />
          <path d="M6 21c0-4.5 2.5-7.5 6-7.5s6 3 6 7.5" {...s} />
        </svg>
      );
    case "parents":
      return (
        <svg {...c}>
          <circle cx="7.5" cy="6.5" r="2.6" {...s} />
          <circle cx="16.5" cy="6.5" r="2.6" {...s} />
          <path d="M2.5 21c0-3.8 2-6.5 5-6.5s5 2.7 5 6.5M11.5 21c0-3.8 2-6.5 5-6.5s5 2.7 5 6.5" {...s} />
        </svg>
      );
    case "maladie":
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" {...s} />
          <path d="M12 8v8M8 12h8" {...s} />
        </svg>
      );
    case "deces":
      return (
        <svg {...c}>
          <path d="M12 2c-5 6-5 13 0 20 5-7 5-14 0-20Z" {...s} />
          <path d="M12 6v14" {...s} />
        </svg>
      );
    case "societe":
      return (
        <svg {...c}>
          <circle cx="8" cy="8" r="2.6" {...s} />
          <circle cx="16" cy="8" r="2.6" {...s} />
          <path d="M3 20c0-3.5 2.2-6 5-6s5 2.5 5 6M11 20c0-3.5 2.2-6 5-6s5 2.5 5 6" {...s} />
        </svg>
      );
    case "voyage":
      return (
        <svg {...c}>
          <rect x="4" y="8" width="16" height="12" rx="2" {...s} />
          <path d="M9 8V6a3 3 0 0 1 3-3v0a3 3 0 0 1 3 3v2" {...s} />
          <path d="M4 13h16" {...s} />
        </svg>
      );
    case "animaux":
      return (
        <svg {...c}>
          <circle cx="7" cy="9" r="1.6" fill={color} />
          <circle cx="12" cy="6.5" r="1.6" fill={color} />
          <circle cx="17" cy="9" r="1.6" fill={color} />
          <path d="M12 12c-3 0-5 2-5 4.5S9 20 12 20s5-1 5-3.5S15 12 12 12Z" {...s} />
        </svg>
      );
    case "richesse":
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" {...s} />
          <path d="M12 7v10M9.3 9.6c0-1.1 1.2-1.6 2.7-1.6s2.7.5 2.7 1.6-1.2 1.4-2.7 1.4-2.7.3-2.7 1.4 1.2 1.6 2.7 1.6 2.7-.5 2.7-1.6" {...s} />
        </svg>
      );
    case "bienfaits":
      return (
        <svg {...c}>
          <rect x="4" y="9" width="16" height="11" {...s} />
          <path d="M4 9h16M12 9v11" {...s} />
          <path d="M12 9c-1-3.5-6-3.5-6-1s3 1 6 1c3 0 6 1.5 6-1s-5-2.5-6 1Z" {...s} />
        </svg>
      );
    default:
      return (
        <svg {...c}>
          <path d="M12 21c-4-3-8-6-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 5-4 8-8 11Z" {...s} />
        </svg>
      );
  }
}

function BackIcon({ color }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M15 5 8 12l7 7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChevronIcon({ dir, color, size = 20 }) {
  const d = dir === "left" ? "M14 6 8 12l6 6" : "M10 6l6 6-6 6";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d={d} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon({ color, size = 46 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" stroke={color} strokeWidth="1.4" />
      <path d="M7.5 12.5 10.3 15.3 16.5 9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ResetIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M20 12a8 8 0 1 1-2.6-5.9" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M20 4v4h-4" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PlayIcon({ color, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7 4.5v15l13-7.5-13-7.5Z" fill={color} />
    </svg>
  );
}
function PauseIcon({ color, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="6" y="4.5" width="4" height="15" rx="1" fill={color} />
      <rect x="14" y="4.5" width="4" height="15" rx="1" fill={color} />
    </svg>
  );
}
function AudioPlayButton({ src, color, size = 30 }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (playing) {
        notifyAudioStop();
        clearMediaSession();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(src);
      audioRef.current.addEventListener("ended", () => {
        setPlaying(false);
        notifyAudioStop();
        clearMediaSession();
      });
      audioRef.current.addEventListener("waiting", () => setLoading(true));
      audioRef.current.addEventListener("playing", () => setLoading(false));
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      notifyAudioStop();
      clearMediaSession();
    } else {
      setLoading(true);
      audioRef.current.play().catch(() => setLoading(false));
      setPlaying(true);
      notifyAudioStart();
      updateMediaSession({
        title: "Mes Azkar",
        playing: true,
        onPause: () => {
          if (audioRef.current) audioRef.current.pause();
          setPlaying(false);
          notifyAudioStop();
          clearMediaSession();
        },
      });
    }
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center active:opacity-60 flex-shrink-0"
      style={{ width: size, height: size, borderRadius: 99, background: "rgba(0,0,0,0.05)" }}
      aria-label={playing ? t("pause_recitation") : t("play_recitation")}
    >
      {loading ? (
        <span
          className="animate-spin"
          style={{
            width: size * 0.4,
            height: size * 0.4,
            borderRadius: 99,
            border: `2px solid ${color}`,
            borderTopColor: "transparent",
          }}
        />
      ) : playing ? (
        <PauseIcon color={color} size={size * 0.45} />
      ) : (
        <PlayIcon color={color} size={size * 0.45} />
      )}
    </button>
  );
}
function FlameIcon({ color, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2c1 3-3 4.5-3 8a3 3 0 0 0 6 0c1 1 1.5 2.3 1.5 3.5A4.5 4.5 0 0 1 12 22a4.5 4.5 0 0 1-4.5-8.5C8.5 10 9 6 12 2Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill={color}
        fillOpacity="0.15"
      />
    </svg>
  );
}
function HistoryIcon({ color, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="5" width="16" height="15" rx="3" stroke={color} strokeWidth="1.6" />
      <path d="M4 9.5h16" stroke={color} strokeWidth="1.6" />
      <path d="M8 3v3.5M16 3v3.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <rect x="7.3" y="12" width="2.6" height="2.6" rx="0.6" fill={color} />
      <rect x="11.7" y="12" width="2.6" height="2.6" rx="0.6" fill={color} opacity="0.4" />
    </svg>
  );
}
function SettingsIcon({ color, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.6" />
      <path
        d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.5a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H4.5a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 6.15 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 8.58 4.14l.06.06a1.7 1.7 0 0 0 1.87.34H10.6a1.7 1.7 0 0 0 1.04-1.56V2.5a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V8.6a1.7 1.7 0 0 0 1.56 1.04h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z"
        stroke={color}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function QuranIcon({ color, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 5.2c0-.9.73-1.6 1.6-1.6H12v16.4H5.6A1.6 1.6 0 0 1 4 18.4V5.2Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M20 5.2c0-.9-.73-1.6-1.6-1.6H12v16.4h6.4a1.6 1.6 0 0 0 1.6-1.6V5.2Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="7.5" r="1.1" fill={color} />
    </svg>
  );
}
function HomeIcon({ color, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 11.5 12 4l8 7.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v8.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V10" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 20v-5.5h4V20" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function QiblaIcon({ color, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" />
      <path d="M12 6.5 14.6 13 12 17.5 9.4 13Z" fill={color} fillOpacity="0.85" />
      <circle cx="12" cy="12" r="1.2" fill={color} />
    </svg>
  );
}
function GlobeIcon({ color, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.8 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.8-3.8-9S9.5 5.5 12 3Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function SunriseIcon({ color, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 6.5a5.5 5.5 0 0 1 5.5 5.5H6.5A5.5 5.5 0 0 1 12 6.5Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 3v2M4.5 8 6 9.3M19.5 8 18 9.3" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2.5 15h19M4.5 18.5h15" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 12.5 12 9.5l3 3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BookIcon({ color, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 5.5c0-.83.67-1.5 1.5-1.5H11v15H5.5A1.5 1.5 0 0 1 4 17.5v-12Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H13v15h5.5a1.5 1.5 0 0 0 1.5-1.5v-12Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 4v15" stroke={color} strokeWidth="1.2" opacity="0.4" />
    </svg>
  );
}
function ChartIcon({ color, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 20V10M11 20V4M18 20v-7" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M3 20h18" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
function MicIcon({ color, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke={color} strokeWidth="1.5" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 18v3M9 21h6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function SearchIcon({ color, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth="1.6" />
      <path d="M20 20l-4.3-4.3" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function BellIcon({ color, size = 20, muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 10.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14.5 6 10.5Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 19a2 2 0 0 0 4 0" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      {muted && <path d="M3.5 20.5 19.5 4.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}
function PinIcon({ color, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="9.5" r="2.4" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}
function ClockIcon({ color, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.6" />
      <path d="M12 7.5V12l3 2" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function DownloadIcon({ color, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 4v11M8 11.5l4 4 4-4" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 19.5h15" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function InfoIcon({ color, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.6" />
      <path d="M12 11v5.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1" fill={color} />
    </svg>
  );
}
function StarIcon({ color, filled, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3.5 14.6 9 20.5 9.9 16.3 14 17.3 20 12 17.1 6.7 20 7.7 14 3.5 9.9 9.4 9 12 3.5Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill={filled ? color : "none"}
      />
    </svg>
  );
}
function TrashIcon({ color, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 7h14M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 7 7.3 19.2A1.6 1.6 0 0 0 8.9 20.7h6.2a1.6 1.6 0 0 0 1.6-1.5L17.5 7" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function LayersIcon({ color, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3.5 3 8.5 12 13.5 21 8.5 12 3.5Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 12.5 12 17.5 21 12.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 16.5 12 21.5 21 16.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TasbihIcon({ color, size = 24 }) {
  // A small string of prayer beads
  const beadPositions = [
    [12, 4], [17.5, 6.5], [20.5, 12], [17.5, 17.5], [12, 20], [6.5, 17.5], [3.5, 12], [6.5, 6.5],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z" stroke={color} strokeWidth="0.8" opacity="0.25" />
      {beadPositions.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i === 0 ? 2.1 : 1.5} fill={color} opacity={i === 0 ? 1 : 0.8} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Bead ring — the signature interaction                               */
/* ------------------------------------------------------------------ */
// The warm parchment "disc" behind every tap-to-count ring (azkar reps,
// free tasbih) — a wood-like radial gradient with soft inset/outer shadows,
// theme-aware but not accent-tinted (the ring stroke itself carries the
// accent color, the disc is just the neutral surface it sits on).
function discSurfaceStyle() {
  const isDark = currentTheme === "dark";
  return {
    background: isDark
      ? "radial-gradient(circle at 34% 28%, #35301F 0%, #211C15 72%)"
      : "radial-gradient(circle at 34% 28%, #FFFDF7 0%, #F1E6CC 78%)",
    boxShadow: isDark
      ? "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -14px 26px rgba(0,0,0,0.35), 0 16px 34px rgba(0,0,0,0.45)"
      : "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -12px 22px rgba(80,60,20,0.08), 0 16px 32px rgba(80,60,20,0.15)",
    border: `1px solid ${COLORS.parchmentDark}`,
  };
}
// Soft ambient glow just outside the disc, tinted with the active accent.
function discGlowBackground() {
  return `radial-gradient(circle, ${COLORS.goldLight}24 0%, transparent 70%)`;
}

function BeadRing({ current, target, color, colorLight, pulse, size = 176 }) {
  const scale = size / 176;
  const stroke = 11 * scale;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(current / target, 1);
  const dash = c * pct;
  const complete = current >= target;

  return (
    <div className={`relative ${pulse ? "bead-pulse" : ""}`} style={{ width: size, height: size, position: "relative" }}>
      <div style={{ position: "absolute", inset: -12 * scale, borderRadius: "50%", background: discGlowBackground() }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", ...discSurfaceStyle() }} />
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.parchmentDark} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={complete ? colorLight : color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.25s ease, stroke 0.25s ease" }}
        />
      </svg>
      <div className="flex flex-col items-center justify-center" style={{ position: "absolute", inset: 0 }}>
        {complete ? (
          <CheckIcon color={colorLight} size={46 * scale} />
        ) : (
          <>
            <span className="font-ui font-semibold" style={{ fontSize: 34 * scale, color: COLORS.ink, lineHeight: 1 }}>
              {current}
            </span>
            <span className="font-ui" style={{ fontSize: Math.max(11, 13 * scale), color: COLORS.inkSoft, marginTop: 2 * scale }}>
              {t("label_of")} {target}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Storage helpers                                                     */
/* ------------------------------------------------------------------ */
// todayKey() decides "which day" a piece of progress (azkar taps, Quran
// pages, tasbih count, history) belongs to. This used to roll over at
// Maghrib instead of midnight to mirror the Islamic calendar day — but that
// meant azkar/tasbih/Quran reading done the same evening, after Maghrib,
// silently got filed under what the app considered a brand-new "day", so the
// Bilan looked like it hadn't moved even though it had, and re-foregrounding
// the app after Maghrib could wipe the evening's in-progress taps entirely.
// Using the plain calendar day (local midnight) matches what "today" means
// everywhere else in the app (the history grid, the day-by-day Bilan
// browser) and is what a user checking "did I finish today" actually expects.
const todayKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const dateKey = (d) => d.toISOString().slice(0, 10);
// A plain Date anchored at noon on the current Islamic day (see todayKey) —
// lets calendar-day math (streaks, history, day-browsing) walk backward from
// "today" without re-doing the Maghrib check at every step, since past days
// are already closed buckets by the time they're being looked at.
const todayAnchorDate = () => new Date(`${todayKey()}T12:00:00`);

// Hijri (Umm al-Qura) date, e.g. "3 Ramadan 1447 AH" — relies on the ICU data
// bundled with the device's browser engine, present on modern Android/iOS.
// Manual Gregorian→Hijri conversion (tabular/"Kuwaiti algorithm", civil
// calendar). We compute this ourselves instead of relying on the browser's
// Intl "islamic-umalqura" calendar support: that turned out to be missing or
// buggy on some Android WebViews/browsers (garbled month names, a stray
// Gregorian-style "av. J.-C." era marker) — this arithmetic version gives
// consistent, correct results on every device, typically within a day of the
// astronomically-adjusted Umm al-Qura calendar.
const HIJRI_MONTHS = [
  "Mouharram",
  "Safar",
  "Rabî' al-awwal",
  "Rabî' ath-thânî",
  "Joumâda al-oûla",
  "Joumâda al-âkhira",
  "Rajab",
  "Cha'bân",
  "Ramadan",
  "Chawwal",
  "Dhou al-Qi'da",
  "Dhou al-Hijja",
];
const HIJRI_MONTHS_EN = [
  "Muharram",
  "Safar",
  "Rabi' al-awwal",
  "Rabi' al-thani",
  "Jumada al-awwal",
  "Jumada al-thani",
  "Rajab",
  "Sha'ban",
  "Ramadan",
  "Shawwal",
  "Dhu al-Qi'dah",
  "Dhu al-Hijjah",
];
const HIJRI_MONTHS_AR = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
];
function hijriMonthName(month) {
  const list = currentLanguage === "en" ? HIJRI_MONTHS_EN : currentLanguage === "ar" ? HIJRI_MONTHS_AR : HIJRI_MONTHS;
  return list[month - 1];
}
function hijriEraSuffix() {
  return currentLanguage === "en" ? "AH" : currentLanguage === "ar" ? "هـ" : "H";
}

function gregorianToHijri(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const a = Math.floor((m - 14) / 12);
  const jd =
    Math.floor((1461 * (y + 4800 + a)) / 4) +
    Math.floor((367 * (m - 2 - 12 * a)) / 12) -
    Math.floor((3 * Math.floor((y + 4900 + a) / 100)) / 4) +
    d -
    32075;
  let l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

function getHijriLabel(date) {
  const { day, month, year } = gregorianToHijri(date);
  return `${day} ${hijriMonthName(month)} ${year} ${hijriEraSuffix()}`;
}

// Returns just the Hijri day-of-month number (e.g. "14") for a given Gregorian date.
function getHijriDay(date) {
  return String(gregorianToHijri(date).day);
}

function getHijriMonthYearLabel(date) {
  const { month, year } = gregorianToHijri(date);
  return `${hijriMonthName(month)} ${year}`;
}

const GREGORIAN_LOCALES = { fr: "fr-FR", en: "en-US", ar: "ar-EG" };
function gregorianLocale() {
  return GREGORIAN_LOCALES[currentLanguage] || GREGORIAN_LOCALES.fr;
}

const gregorianFormatters = {};
function getGregorianLabel(date) {
  try {
    const locale = gregorianLocale();
    if (!gregorianFormatters[locale]) {
      gregorianFormatters[locale] = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }
    const label = gregorianFormatters[locale].format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch (e) {
    return null;
  }
}

const gregorianMonthYearFormatters = {};
function getGregorianMonthYearLabel(date) {
  try {
    const locale = gregorianLocale();
    if (!gregorianMonthYearFormatters[locale]) {
      gregorianMonthYearFormatters[locale] = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
    }
    const label = gregorianMonthYearFormatters[locale].format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch (e) {
    return "";
  }
}

const STORAGE_KEY = "azkar-progress-v1";
const HISTORY_KEY = "azkar-history-v1";
const HISTORY_DAYS_KEPT = 90;
const SETTINGS_KEY = "azkar-settings-v1";
// Flips the calculation method to "custom" with the mosque-calibrated
// offsets exactly once, the first time the app runs after this calibration
// was added — so it applies immediately without overriding a method the
// user might deliberately switch to afterwards.
const MOSQUE_CALIBRATION_KEY = "azkar-mosque-calibration-v1";
const ONBOARDING_KEY = "azkar-onboarding-v1";
const THEME_PREFERENCE_KEY = "azkar-theme-preference-v1";
const ACCENT_THEME_KEY = "azkar-accent-theme-v1";
const HAPTICS_KEY = "azkar-haptics-enabled-v1";
const LANGUAGE_KEY = "azkar-language-v1";
const APP_VERSION = "1.0.0";
const CONTACT_EMAIL = "oussoumanedoucoure12@gmail.com";
const ARABIC_SIZES = { sm: 19, md: 24, lg: 29, xl: 35 };
const ARABIC_SIZE_LABELS_BY_LANG = {
  fr: { sm: "Petit", md: "Moyen", lg: "Grand", xl: "Très grand" },
  en: { sm: "Small", md: "Medium", lg: "Large", xl: "Very large" },
  ar: { sm: "صغير", md: "متوسط", lg: "كبير", xl: "كبير جدًا" },
};
function arabicSizeLabels() {
  return ARABIC_SIZE_LABELS_BY_LANG[currentLanguage] || ARABIC_SIZE_LABELS_BY_LANG.fr;
}
const DEFAULT_ARABIC_SIZE = "md";
const emptyCat = () => ({ index: 0, counts: {} });
const emptyApresProgress = () => Object.fromEntries(APRES_PRAYERS.map((p) => [p.id, emptyCat()]));
const emptyProgress = () => ({
  date: todayKey(),
  matin: emptyCat(),
  soir: emptyCat(),
  apres: emptyApresProgress(),
});

// Reads/writes a category's { index, counts } regardless of whether it's a flat
// category (matin/soir) or a per-prayer one (apres, keyed by prayer id)
const getCatProgress = (prog, catId, subId) => {
  if (catId === "apres") return (prog.apres && prog.apres[subId]) || emptyCat();
  return prog[catId] || emptyCat();
};
const getCatItems = (cat, subId) => (cat.hasPrayers ? APRES_BY_PRAYER[subId] || [] : cat.items);

// Given a progress object, returns { matin: bool, soir: bool, apres: bool } for that day.
// "apres" is only true once every prayer's after-prayer azkar are complete.
const computeDoneFlags = (prog) => {
  const flags = {};
  CATEGORIES.forEach((cat) => {
    if (cat.hasPrayers) {
      flags[cat.id] = APRES_PRAYERS.every((p) => {
        const items = APRES_BY_PRAYER[p.id];
        const subProg = (prog.apres && prog.apres[p.id]) || emptyCat();
        return items.every((it) => (subProg.counts[it.id] || 0) >= it.count);
      });
    } else {
      const catProg = prog[cat.id] || emptyCat();
      flags[cat.id] = cat.items.every((it) => (catProg.counts[it.id] || 0) >= it.count);
    }
  });
  return flags;
};

const isFullyDone = (flags) => !!flags && CATEGORIES.every((cat) => flags[cat.id]);

// Trim history to the most recent N days to keep storage light
const trimHistory = (history) => {
  const entries = Object.entries(history).sort(([a], [b]) => (a < b ? 1 : -1));
  return Object.fromEntries(entries.slice(0, HISTORY_DAYS_KEPT));
};

// Current streak: consecutive fully-completed days, counting back from today.
// If today isn't finished yet, it doesn't break a streak built on prior days.
const computeStreak = (history) => {
  let streak = 0;
  const cursor = todayAnchorDate();
  if (!isFullyDone(history[dateKey(cursor)])) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (isFullyDone(history[dateKey(cursor)])) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

// Last N days (oldest → newest) with a completion level 0-CATEGORIES.length
const lastDaysLevels = (history, days = 28) => {
  const out = [];
  const cursor = todayAnchorDate();
  cursor.setDate(cursor.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const ds = dateKey(cursor);
    const flags = history[ds];
    const level = flags ? CATEGORIES.filter((cat) => flags[cat.id]).length : 0;
    out.push({ date: ds, level });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

// Screens that show the persistent bottom tab bar — everything else is a
// sub-screen reached by drilling in, with its own back button.
const TAB_SCREENS = ["home", "quran-list", "tasbih", "invocations", "dashboard", "settings"];
const NAV_TABS = [
  { screen: "home", labelKey: "nav_home", Icon: HomeIcon },
  { screen: "quran-list", labelKey: "nav_quran", Icon: QuranIcon },
  { screen: "tasbih", labelKey: "nav_tasbih", Icon: TasbihIcon },
  { screen: "invocations", labelKey: "nav_invocations", Icon: BookIcon },
  { screen: "dashboard", labelKey: "nav_dashboard", Icon: ChartIcon },
  { screen: "settings", labelKey: "nav_settings", Icon: SettingsIcon },
];

function BottomNav({ active, onNavigate }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 flex items-stretch"
      style={{
        background: COLORS.bg,
        borderTop: `1px solid ${COLORS.parchmentDark}`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        zIndex: 20,
      }}
    >
      {NAV_TABS.map(({ screen, labelKey, Icon }) => {
        const isActive = active === screen;
        return (
          <button
            key={screen}
            onClick={() => onNavigate(screen)}
            className="flex-1 flex flex-col items-center justify-center gap-1 active:opacity-70"
            style={{ padding: "9px 4px 8px" }}
          >
            <Icon color={isActive ? COLORS.goldLight : COLORS.inkSoft} size={22} />
            <span
              className="font-ui"
              style={{
                fontSize: 10.5,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? COLORS.goldLight : COLORS.inkSoft,
              }}
            >
              {t(labelKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                  */
/* ------------------------------------------------------------------ */
function AzkarApp() {
  const [screen, setScreen] = useState("home"); // 'home' | 'apres-picker' | 'category' | 'done' | 'history' | 'tasbih' | 'settings'
  const [activeCatId, setActiveCatId] = useState(null);
  const [activeSubId, setActiveSubId] = useState(null); // prayer id, only used when activeCatId === 'apres'
  const [activeTopicId, setActiveTopicId] = useState(null);
  const [activeSurahNumber, setActiveSurahNumber] = useState(null);
  const [activeReciterId, setActiveReciterId] = useState(null);
  const [activeFullReciterId, setActiveFullReciterId] = useState(null);
  const [progress, setProgress] = useState(emptyProgress());
  const [history, setHistory] = useState({});
  const [arabicSize, setArabicSize] = useState(DEFAULT_ARABIC_SIZE);
  const [prayerSettings, setPrayerSettings] = useState({
    method: DEFAULT_PRAYER_METHOD,
    customFajrAngle: CUSTOM_ANGLE_DEFAULTS.fajrAngle,
    customIshaAngle: CUSTOM_ANGLE_DEFAULTS.ishaAngle,
    customOffsets: CUSTOM_OFFSET_DEFAULTS,
    iqamaOffsets: IQAMA_OFFSET_DEFAULTS,
    location: null,
    notificationsEnabled: false,
    notifyPrayers: NOTIFY_PRAYERS_DEFAULT,
    muezzinByPrayer: MUEZZIN_BY_PRAYER_DEFAULT,
  });
  const [locationStatus, setLocationStatus] = useState("idle"); // 'idle' | 'loading' | 'error'
  const [notificationStatus, setNotificationStatus] = useState("idle"); // 'idle' | 'requesting' | 'denied'
  const [loaded, setLoaded] = useState(false);
  const [pulseId, setPulseId] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const advanceTimer = useRef(null);

  const replayOnboarding = useCallback(() => {
    setScreen("home");
    setShowOnboarding(true);
  }, []);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    setScreen("home");
    window.storage.set(ONBOARDING_KEY, "1", false).catch(() => {});
  }, []);

  // Theme: 'system' follows the OS, or the user can force 'light'/'dark' from
  // Réglages. Re-applies whenever the preference or the OS setting changes.
  const [themePreference, setThemePreference] = useState("system"); // 'system' | 'light' | 'dark'
  const [, forceThemeRerender] = useState(0);
  const themePreferenceRef = useRef(themePreference);
  useEffect(() => {
    themePreferenceRef.current = themePreference;
  }, [themePreference]);

  const applyThemeFromPreference = useCallback((preference) => {
    const next = preference === "system" ? (prefersDark() ? "dark" : "light") : preference;
    applyTheme(next);
    syncStatusBar(next);
    forceThemeRerender((n) => n + 1);
  }, []);

  const handleSetThemePreference = useCallback(
    (preference) => {
      setThemePreference(preference);
      applyThemeFromPreference(preference);
      window.storage.set(THEME_PREFERENCE_KEY, preference, false).catch(() => {});
    },
    [applyThemeFromPreference]
  );

  useEffect(() => {
    syncStatusBar(currentTheme);
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (themePreferenceRef.current === "system") applyThemeFromPreference("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [applyThemeFromPreference]);

  // Accent color (gold/emerald/sapphire/ruby) — layered on top of light/dark
  // the same way the theme itself is, so switching one never resets the other.
  const [accentTheme, setAccentThemeState] = useState("gold");
  const handleSetAccentTheme = useCallback(
    (accent) => {
      setAccentThemeState(accent);
      applyAccent(accent);
      forceThemeRerender((n) => n + 1);
      window.storage.set(ACCENT_THEME_KEY, accent, false).catch(() => {});
    },
    []
  );

  // App language. 'system' follows the phone's own locale (like the theme's
  // "Système" option); otherwise the user's explicit fr/en/ar choice is used
  // as-is. Arabic also flips the whole app to RTL.
  const [language, setLanguageState] = useState("fr");
  const [languagePref, setLanguagePref] = useState("system"); // 'system' | 'fr' | 'en' | 'ar'
  const handleSetLanguage = useCallback((pref) => {
    const effective = pref === "system" ? detectSystemLanguage() : pref;
    setLanguagePref(pref);
    setCurrentLanguage(effective);
    setLanguageState(effective);
    window.storage.set(LANGUAGE_KEY, pref, false).catch(() => {});
  }, []);

  // Haptic feedback on/off (tasbih + bead-ring taps)
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const handleToggleHaptics = useCallback((enabled) => {
    setHapticsEnabled(enabled);
    setHapticsEnabledFlag(enabled);
    window.storage.set(HAPTICS_KEY, enabled ? "1" : "0", false).catch(() => {});
  }, []);

  // Full factory reset — wipes every key this app has ever written (progress,
  // history, tasbih, personal invocations, Quran progress, cached Quran
  // Foundation data, settings) and reloads from a clean slate.
  const handleFactoryReset = useCallback(async () => {
    try {
      localStorage.clear();
    } catch (e) {
      // ignore
    }
    try {
      await caches.delete("mes-azkar-mushaf-fonts-v1");
    } catch (e) {
      // Cache Storage unavailable — nothing to clean up
    }
    window.location.reload();
  }, []);

  // Hardware/gesture back button (Android): navigate up through the app's
  // screens instead of the OS default of exiting immediately from any screen.
  const screenRef = useRef(screen);
  const activeCatIdRef = useRef(activeCatId);
  useEffect(() => {
    screenRef.current = screen;
    activeCatIdRef.current = activeCatId;
  }, [screen, activeCatId]);

  useEffect(() => {
    let listenerHandle;
    CapacitorApp.addListener("backButton", () => {
      const s = screenRef.current;
      const catId = activeCatIdRef.current;
      if (TAB_SCREENS.includes(s)) {
        if (s !== "home") {
          setScreen("home");
        } else {
          CapacitorApp.exitApp().catch(() => {});
        }
        return;
      }
      if (s === "invocation-topic" || s === "invocation-personal") {
        setScreen("invocations");
      } else if (s === "privacy") {
        setScreen("settings");
      } else if (s === "quran-reciter-space") {
        setScreen("quran-reciters");
      } else if (s === "quran-reader" || s === "quran-mushaf" || s === "quran-reciters" || s === "quran-surahs") {
        setScreen("quran-list");
      } else if (s === "category" || s === "done") {
        setScreen(catId === "apres" ? "apres-picker" : "home");
      } else {
        // invocations, apres-picker, history
        setScreen("home");
      }
    }).then((h) => {
      listenerHandle = h;
    });
    return () => {
      if (listenerHandle) listenerHandle.remove();
    };
  }, []);

  // Load persisted progress + history + settings
  useEffect(() => {
    (async () => {
      let loadedProgress = emptyProgress();
      let loadedHistory = {};
      let loadedArabicSize = DEFAULT_ARABIC_SIZE;
      let loadedPrayerSettings = {
        method: DEFAULT_PRAYER_METHOD,
        customFajrAngle: CUSTOM_ANGLE_DEFAULTS.fajrAngle,
        customIshaAngle: CUSTOM_ANGLE_DEFAULTS.ishaAngle,
        customOffsets: CUSTOM_OFFSET_DEFAULTS,
        iqamaOffsets: IQAMA_OFFSET_DEFAULTS,
        location: null,
        notificationsEnabled: false,
        notifyPrayers: NOTIFY_PRAYERS_DEFAULT,
        muezzinByPrayer: MUEZZIN_BY_PRAYER_DEFAULT,
      };
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          loadedProgress = parsed.date === todayKey() ? parsed : emptyProgress();
        }
      } catch (e) {
        // no stored progress yet — start fresh
      }
      try {
        const res = await window.storage.get(HISTORY_KEY, false);
        if (res && res.value) {
          loadedHistory = JSON.parse(res.value);
        }
      } catch (e) {
        // no stored history yet — start fresh
      }
      try {
        const res = await window.storage.get(SETTINGS_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.arabicSize && ARABIC_SIZES[parsed.arabicSize]) {
            loadedArabicSize = parsed.arabicSize;
          }
          if (parsed.prayerMethod && CALC_METHODS[parsed.prayerMethod]) {
            loadedPrayerSettings.method = parsed.prayerMethod;
          }
          if (typeof parsed.customFajrAngle === "number") {
            loadedPrayerSettings.customFajrAngle = parsed.customFajrAngle;
          }
          if (typeof parsed.customIshaAngle === "number") {
            loadedPrayerSettings.customIshaAngle = parsed.customIshaAngle;
          }
          if (parsed.customOffsets && typeof parsed.customOffsets === "object") {
            loadedPrayerSettings.customOffsets = { ...CUSTOM_OFFSET_DEFAULTS, ...parsed.customOffsets };
          }
          if (parsed.iqamaOffsets && typeof parsed.iqamaOffsets === "object") {
            loadedPrayerSettings.iqamaOffsets = { ...IQAMA_OFFSET_DEFAULTS, ...parsed.iqamaOffsets };
          }
          if (parsed.location && typeof parsed.location.lat === "number" && typeof parsed.location.lng === "number") {
            loadedPrayerSettings.location = parsed.location;
          }
          if (typeof parsed.notificationsEnabled === "boolean") {
            loadedPrayerSettings.notificationsEnabled = parsed.notificationsEnabled;
          }
          if (parsed.notifyPrayers && typeof parsed.notifyPrayers === "object") {
            loadedPrayerSettings.notifyPrayers = { ...NOTIFY_PRAYERS_DEFAULT, ...parsed.notifyPrayers };
          }
          if (parsed.muezzinByPrayer && typeof parsed.muezzinByPrayer === "object") {
            loadedPrayerSettings.muezzinByPrayer = { ...MUEZZIN_BY_PRAYER_DEFAULT, ...parsed.muezzinByPrayer };
          }
        }
      } catch (e) {
        // no stored settings yet — use default
      }
      let alreadyCalibrated = false;
      try {
        const res = await window.storage.get(MOSQUE_CALIBRATION_KEY, false);
        alreadyCalibrated = !!(res && res.value === "1");
      } catch (e) {
        // not calibrated yet
      }
      if (!alreadyCalibrated) {
        loadedPrayerSettings.method = "custom";
        loadedPrayerSettings.customOffsets = CUSTOM_OFFSET_DEFAULTS;
        loadedPrayerSettings.iqamaOffsets = IQAMA_OFFSET_DEFAULTS;
        window.storage
          .set(
            SETTINGS_KEY,
            JSON.stringify({
              arabicSize: loadedArabicSize,
              prayerMethod: loadedPrayerSettings.method,
              customFajrAngle: loadedPrayerSettings.customFajrAngle,
              customIshaAngle: loadedPrayerSettings.customIshaAngle,
              customOffsets: loadedPrayerSettings.customOffsets,
              iqamaOffsets: loadedPrayerSettings.iqamaOffsets,
              location: loadedPrayerSettings.location,
              notificationsEnabled: loadedPrayerSettings.notificationsEnabled,
            }),
            false
          )
          .catch(() => {});
        window.storage.set(MOSQUE_CALIBRATION_KEY, "1", false).catch(() => {});
      }
      let seenOnboarding = false;
      try {
        const res = await window.storage.get(ONBOARDING_KEY, false);
        seenOnboarding = !!(res && res.value === "1");
      } catch (e) {
        // never seen it — show onboarding
      }
      let loadedThemePreference = "system";
      try {
        const res = await window.storage.get(THEME_PREFERENCE_KEY, false);
        if (res && ["system", "light", "dark"].includes(res.value)) {
          loadedThemePreference = res.value;
        }
      } catch (e) {
        // no saved preference — default to following the system
      }
      let loadedAccentTheme = "gold";
      try {
        const res = await window.storage.get(ACCENT_THEME_KEY, false);
        if (res && ACCENT_PALETTES[res.value]) loadedAccentTheme = res.value;
      } catch (e) {
        // no saved accent — default to gold
      }
      currentAccent = loadedAccentTheme;
      setAccentThemeState(loadedAccentTheme);

      let loadedLanguagePref = "system";
      try {
        const res = await window.storage.get(LANGUAGE_KEY, false);
        if (res && res.value && (res.value === "system" || LANGUAGES.some((l) => l.id === res.value))) {
          loadedLanguagePref = res.value;
        }
      } catch (e) {
        // no saved preference — default to following the system
      }
      const effectiveLanguage = loadedLanguagePref === "system" ? detectSystemLanguage() : loadedLanguagePref;
      setLanguagePref(loadedLanguagePref);
      setCurrentLanguage(effectiveLanguage);
      setLanguageState(effectiveLanguage);

      let loadedHaptics = true;
      try {
        const res = await window.storage.get(HAPTICS_KEY, false);
        if (res && res.value === "0") loadedHaptics = false;
      } catch (e) {
        // no saved preference — default to on
      }
      setHapticsEnabled(loadedHaptics);
      setHapticsEnabledFlag(loadedHaptics);

      setThemePreference(loadedThemePreference);
      applyThemeFromPreference(loadedThemePreference);
      setProgress(loadedProgress);
      setHistory(loadedHistory);
      setArabicSize(loadedArabicSize);
      setPrayerSettings(loadedPrayerSettings);
      setShowOnboarding(!seenOnboarding);
      setLoaded(true);
    })();
  }, []);

  // Re-check the day whenever the app comes back to the foreground —
  // Android often keeps the app's state alive across a midnight rollover
  // when it's only backgrounded (not force-closed), so the mount-time date
  // check alone would miss the reset and yesterday's azkar would still show
  // as completed.
  useEffect(() => {
    let listenerHandle;
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      setProgress((prev) => (prev.date === todayKey() ? prev : emptyProgress()));
    }).then((h) => {
      listenerHandle = h;
    });
    return () => {
      if (listenerHandle) listenerHandle.remove();
    };
  }, []);

  // Persists the full settings blob (arabic size + prayer method/angles/location)
  // so any individual setter can update its slice without clobbering the rest.
  const persistSettings = useCallback((size, ps) => {
    window.storage
      .set(
        SETTINGS_KEY,
        JSON.stringify({
          arabicSize: size,
          prayerMethod: ps.method,
          customFajrAngle: ps.customFajrAngle,
          customIshaAngle: ps.customIshaAngle,
          customOffsets: ps.customOffsets,
          iqamaOffsets: ps.iqamaOffsets,
          location: ps.location,
          notificationsEnabled: ps.notificationsEnabled,
          notifyPrayers: ps.notifyPrayers,
          muezzinByPrayer: ps.muezzinByPrayer,
        }),
        false
      )
      .catch(() => {});
  }, []);

  const persist = useCallback(async (next) => {
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
    } catch (e) {
      // ignore storage failures — app still works in-memory
    }
  }, []);

  const persistHistory = useCallback(async (next) => {
    try {
      await window.storage.set(HISTORY_KEY, JSON.stringify(next), false);
    } catch (e) {
      // ignore storage failures — app still works in-memory
    }
  }, []);

  // Manual escape hatch for progress that got stuck marked "done" — mainly
  // useful for anyone who hit the pre-fix background/midnight bug and is
  // still seeing yesterday's completed state. Only touches today's tap
  // counts (what the Home tiles read) — history/streak/dashboard are left
  // alone so this can't erase a day that was genuinely completed.
  const handleResetToday = useCallback(() => {
    const next = emptyProgress();
    setProgress(next);
    persist(next);
  }, [persist]);

  const handleSetArabicSize = useCallback(
    (size) => {
      setArabicSize(size);
      persistSettings(size, prayerSettings);
    },
    [persistSettings, prayerSettings]
  );

  const handleSetPrayerMethod = useCallback(
    (method) => {
      setPrayerSettings((prev) => {
        const next = { ...prev, method };
        persistSettings(arabicSize, next);
        return next;
      });
    },
    [persistSettings, arabicSize]
  );

  const handleSetCustomAngle = useCallback(
    (key, value) => {
      const clamped = Math.min(CUSTOM_ANGLE_MAX, Math.max(CUSTOM_ANGLE_MIN, value));
      setPrayerSettings((prev) => {
        const next = { ...prev, [key]: clamped };
        persistSettings(arabicSize, next);
        return next;
      });
    },
    [persistSettings, arabicSize]
  );

  const handleSetCustomOffset = useCallback(
    (prayerKey, minutes) => {
      const clamped = Math.min(CUSTOM_OFFSET_MAX, Math.max(CUSTOM_OFFSET_MIN, minutes));
      setPrayerSettings((prev) => {
        const nextOffsets = { ...CUSTOM_OFFSET_DEFAULTS, ...prev.customOffsets, [prayerKey]: clamped };
        const next = { ...prev, customOffsets: nextOffsets };
        persistSettings(arabicSize, next);
        return next;
      });
    },
    [persistSettings, arabicSize]
  );

  const handleSetIqamaOffset = useCallback(
    (prayerKey, minutes) => {
      const clamped = Math.min(IQAMA_OFFSET_MAX, Math.max(IQAMA_OFFSET_MIN, minutes));
      setPrayerSettings((prev) => {
        const nextOffsets = { ...IQAMA_OFFSET_DEFAULTS, ...prev.iqamaOffsets, [prayerKey]: clamped };
        const next = { ...prev, iqamaOffsets: nextOffsets };
        persistSettings(arabicSize, next);
        return next;
      });
    },
    [persistSettings, arabicSize]
  );

  const handleUseMyLocation = useCallback(async () => {
    setLocationStatus("loading");
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      let label = `Ma position (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`
        );
        const data = await res.json();
        const city =
          data?.address?.city || data?.address?.town || data?.address?.village || data?.address?.municipality;
        if (city) label = city;
      } catch (e) {
        // reverse geocoding is a nice-to-have — keep the coordinate label if it fails
      }
      const nextLocation = { label, lat, lng, source: "geo" };
      setPrayerSettings((prev) => {
        const next = { ...prev, location: nextLocation };
        persistSettings(arabicSize, next);
        return next;
      });
      setLocationStatus("idle");
    } catch (e) {
      setLocationStatus("error");
    }
  }, [persistSettings, arabicSize]);

  const handleResetLocation = useCallback(() => {
    setPrayerSettings((prev) => {
      const next = { ...prev, location: null };
      persistSettings(arabicSize, next);
      return next;
    });
    setLocationStatus("idle");
  }, [persistSettings, arabicSize]);

  const handleToggleNotifications = useCallback(
    async (enabled) => {
      if (enabled) {
        setNotificationStatus("requesting");
        const granted = await requestNotificationPermission().catch(() => false);
        if (!granted) {
          setNotificationStatus("denied");
          return;
        }
        setNotificationStatus("idle");
      } else {
        await cancelPrayerNotifications().catch(() => {});
      }
      setPrayerSettings((prev) => {
        const next = { ...prev, notificationsEnabled: enabled };
        persistSettings(arabicSize, next);
        return next;
      });
    },
    [persistSettings, arabicSize]
  );

  // Tapping a bell directly under a prayer time — turns that one prayer's
  // reminder on/off, requesting permission first if notifications haven't
  // been granted yet at all.
  const handleToggleNotifyPrayer = useCallback(
    async (prayerKey) => {
      if (!prayerSettings.notificationsEnabled) {
        setNotificationStatus("requesting");
        const granted = await requestNotificationPermission().catch(() => false);
        if (!granted) {
          setNotificationStatus("denied");
          return;
        }
        setNotificationStatus("idle");
      }
      setPrayerSettings((prev) => {
        const currentlyOn = (prev.notifyPrayers && prev.notifyPrayers[prayerKey]) ?? true;
        const nextNotify = { ...NOTIFY_PRAYERS_DEFAULT, ...prev.notifyPrayers, [prayerKey]: !currentlyOn };
        const next = { ...prev, notificationsEnabled: true, notifyPrayers: nextNotify };
        persistSettings(arabicSize, next);
        return next;
      });
    },
    [prayerSettings.notificationsEnabled, persistSettings, arabicSize]
  );

  const handleSetMuezzin = useCallback(
    (prayerKey, voiceId) => {
      setPrayerSettings((prev) => {
        const nextVoices = { ...MUEZZIN_BY_PRAYER_DEFAULT, ...prev.muezzinByPrayer, [prayerKey]: voiceId };
        const next = { ...prev, muezzinByPrayer: nextVoices };
        persistSettings(arabicSize, next);
        return next;
      });
    },
    [persistSettings, arabicSize]
  );

  // Keep the next two days of scheduled prayer reminders in sync with the
  // current location/calculation method — re-runs whenever either changes.
  useEffect(() => {
    if (!loaded) return;
    if (!prayerSettings.notificationsEnabled) return;
    (async () => {
      const granted = await isNotificationPermissionGranted().catch(() => false);
      if (!granted) return;
      const location = prayerSettings.location || DEFAULT_LOCATION;
      const calc = resolveCalcConfig(prayerSettings);
      syncPrayerNotifications(
        (date) => computePrayerTimesDecimal(date, location, calc),
        prayerSettings.notifyPrayers,
        prayerSettings.muezzinByPrayer,
        language
      ).catch(() => {});
    })();
  }, [
    loaded,
    prayerSettings.notificationsEnabled,
    prayerSettings.notifyPrayers,
    prayerSettings.muezzinByPrayer,
    prayerSettings.method,
    prayerSettings.customFajrAngle,
    prayerSettings.customIshaAngle,
    prayerSettings.customOffsets,
    prayerSettings.location,
    language,
  ]);

  // Push prayer-calc inputs to the native home-screen widget whenever they
  // change — the widget can't read the WebView's localStorage directly, and
  // recomputes the times itself natively so it stays accurate all day.
  useEffect(() => {
    if (!loaded) return;
    const location = prayerSettings.location || DEFAULT_LOCATION;
    const calc = resolveCalcConfig(prayerSettings);
    const offset = calc.offsetMin || {};
    const iqama = prayerSettings.iqamaOffsets || {};
    const notify = prayerSettings.notifyPrayers || {};
    WidgetBridge.update({
      lat: location.lat,
      lng: location.lng,
      locationLabel: location.label,
      accentTheme,
      fajrAngle: calc.fajrAngle,
      ishaAngle: calc.ishaAngle,
      ishaMinutesAfterMaghrib: calc.ishaMinutesAfterMaghrib ?? undefined,
      fajrOffset: offset.fajr || 0,
      sunriseOffset: offset.sunrise || 0,
      dhuhrOffset: offset.dhuhr || 0,
      asrOffset: offset.asr || 0,
      maghribOffset: offset.maghrib || 0,
      ishaOffset: offset.isha || 0,
      iqamaFajr: iqama.fajr ?? 0,
      iqamaDhuhr: iqama.dhuhr ?? 0,
      iqamaAsr: iqama.asr ?? 0,
      iqamaMaghrib: iqama.maghrib ?? 0,
      iqamaIsha: iqama.isha ?? 0,
      notifyFajr: notify.fajr !== false,
      notifyDhuhr: notify.dhuhr !== false,
      notifyAsr: notify.asr !== false,
      notifyMaghrib: notify.maghrib !== false,
      notifyIsha: notify.isha !== false,
    }).catch(() => {});
  }, [
    loaded,
    prayerSettings.location,
    prayerSettings.method,
    prayerSettings.customFajrAngle,
    prayerSettings.customIshaAngle,
    prayerSettings.customOffsets,
    prayerSettings.iqamaOffsets,
    prayerSettings.notifyPrayers,
    accentTheme,
  ]);

  const updateCategory = useCallback(
    (catId, subId, updater) => {
      setProgress((prev) => {
        let next;
        if (catId === "apres") {
          const prevSub = (prev.apres && prev.apres[subId]) || emptyCat();
          const nextSub = updater(prevSub);
          next = { ...prev, date: todayKey(), apres: { ...(prev.apres || {}), [subId]: nextSub } };
        } else {
          const nextCat = updater(prev[catId] || emptyCat());
          next = { ...prev, date: todayKey(), [catId]: nextCat };
        }
        persist(next);

        // Keep today's history entry in sync with the freshest progress
        const flags = computeDoneFlags(next);
        setHistory((prevHist) => {
          const nextHist = trimHistory({ ...prevHist, [todayKey()]: flags });
          persistHistory(nextHist);
          return nextHist;
        });

        return next;
      });
    },
    [persist, persistHistory]
  );

  const streak = computeStreak(history);

  const openCategory = (catId, subId = null) => {
    setActiveCatId(catId);
    setActiveSubId(subId);
    setScreen("category");
  };

  const openApresPicker = () => setScreen("apres-picker");

  const category = CATEGORIES.find((c) => c.id === activeCatId);
  const catProgress = activeCatId ? getCatProgress(progress, activeCatId, activeSubId) : null;
  const items = category ? getCatItems(category, activeSubId) : [];
  const index = catProgress ? Math.min(catProgress.index, items.length - 1) : 0;
  const item = items[index];
  const current = item && catProgress ? catProgress.counts[item.id] || 0 : 0;
  const activeApresPrayer = activeCatId === "apres" ? APRES_PRAYERS.find((p) => p.id === activeSubId) : null;
  const activePrayerLabel = activeApresPrayer ? localLabel(activeApresPrayer) : null;

  const goToIndex = (i) => {
    updateCategory(activeCatId, activeSubId, (cat) => ({ ...cat, index: i }));
  };

  const handleTap = () => {
    if (!item || current >= item.count) return;
    tapHaptic();
    setPulseId(item.id);
    clearTimeout(advanceTimer.current);
    updateCategory(activeCatId, activeSubId, (cat) => {
      const nextCount = (cat.counts[item.id] || 0) + 1;
      const nextCounts = { ...cat.counts, [item.id]: nextCount };
      return { ...cat, counts: nextCounts };
    });
  };

  // Handle auto-advance once an item reaches its target
  useEffect(() => {
    if (!item || screen !== "category") return;
    if (current >= item.count) {
      advanceTimer.current = setTimeout(() => {
        setPulseId(null);
        if (index < items.length - 1) {
          goToIndex(index + 1);
        } else {
          setScreen("done");
        }
      }, 700);
    }
    return () => clearTimeout(advanceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, item, index, items.length, screen]);

  const resetItem = () => {
    updateCategory(activeCatId, activeSubId, (cat) => ({
      ...cat,
      counts: { ...cat.counts, [item.id]: 0 },
    }));
  };

  // Overall completion (0-1) for a category card on the home screen.
  // For "apres" this aggregates across all 5 prayers.
  const catCompletion = (catId) => {
    const cats = CATEGORIES.find((c) => c.id === catId);
    if (!cats) return 0;
    if (cats.hasPrayers) {
      let done = 0;
      let total = 0;
      APRES_PRAYERS.forEach((p) => {
        const subItems = APRES_BY_PRAYER[p.id];
        const subProg = (progress.apres && progress.apres[p.id]) || emptyCat();
        total += subItems.length;
        done += subItems.filter((it) => (subProg.counts[it.id] || 0) >= it.count).length;
      });
      return total ? done / total : 0;
    }
    const cat = progress[catId];
    if (!cat) return 0;
    const done = cats.items.filter((it) => (cat.counts[it.id] || 0) >= it.count).length;
    return done / cats.items.length;
  };

  // Completion (0-1) for a single prayer's after-prayer azkar, used on the picker screen
  const prayerCompletion = (prayerId) => {
    const items = APRES_BY_PRAYER[prayerId];
    const subProg = (progress.apres && progress.apres[prayerId]) || emptyCat();
    const done = items.filter((it) => (subProg.counts[it.id] || 0) >= it.count).length;
    return done / items.length;
  };

  if (!loaded) {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100vh" }} className="flex items-center justify-center">
        <style>{FONT_STYLE}</style>
        <span className="font-ui" style={{ color: COLORS.ink, opacity: 0.7 }}>
          {t("loading")}
        </span>
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh" }} className="font-ui" dir={isRTL(language) ? "rtl" : "ltr"}>
      <style>{FONT_STYLE}</style>

      {screen === "home" && (
        <HomeScreen
          progress={progress}
          catCompletion={catCompletion}
          onOpen={openCategory}
          onOpenApresPicker={openApresPicker}
          streak={streak}
          onOpenHistory={() => setScreen("history")}
          onOpenQibla={() => setScreen("qibla")}
          onOpenCalendar={() => setScreen("calendar")}
          onOpenMushaf={() => setScreen("quran-mushaf")}
          onOpenRamadan={() => setScreen("ramadan")}
          onToggleTheme={() => handleSetThemePreference(currentTheme === "dark" ? "light" : "dark")}
          location={prayerSettings.location || DEFAULT_LOCATION}
          prayerSettings={prayerSettings}
          onToggleNotifyPrayer={handleToggleNotifyPrayer}
          onReplayOnboarding={replayOnboarding}
          languagePref={languagePref}
          onSetLanguage={handleSetLanguage}
        />
      )}

      {screen === "qibla" && (
        <QiblaScreen location={prayerSettings.location || DEFAULT_LOCATION} onBack={() => setScreen("home")} />
      )}

      {screen === "ramadan" && (
        <RamadanScreen
          location={prayerSettings.location || DEFAULT_LOCATION}
          prayerSettings={prayerSettings}
          onBack={() => setScreen("home")}
          arabicSize={arabicSize}
        />
      )}

      {screen === "invocations" && (
        <InvocationsLibraryScreen
          onSelectTopic={(topicId) => {
            setActiveTopicId(topicId);
            setScreen("invocation-topic");
          }}
          onOpenPersonal={() => setScreen("invocation-personal")}
        />
      )}

      {screen === "invocation-topic" && (
        <InvocationTopicScreen
          topicId={activeTopicId}
          arabicSize={ARABIC_SIZES[arabicSize]}
          onBack={() => setScreen("invocations")}
        />
      )}

      {screen === "invocation-personal" && (
        <PersonalInvocationsScreen onBack={() => setScreen("invocations")} />
      )}

      {screen === "quran-list" && (
        <QuranHomeScreen
          onOpenSurahs={() => setScreen("quran-surahs")}
          onOpenMushaf={() => setScreen("quran-mushaf")}
          onOpenReciters={() => setScreen("quran-reciters")}
          onResumeReading={(number) => {
            setActiveSurahNumber(number);
            setScreen("quran-reader");
          }}
        />
      )}

      {screen === "quran-surahs" && (
        <SurahListScreen
          onBack={() => setScreen("quran-list")}
          onSelectSurah={(number) => {
            setActiveSurahNumber(number);
            setScreen("quran-reader");
          }}
        />
      )}

      {screen === "quran-mushaf" && <QuranMushafScreen onBack={() => setScreen("quran-list")} />}

      {screen === "quran-reciters" && (
        <RecitersScreen
          onBack={() => setScreen("quran-list")}
          onOpenReciterSpace={(id) => {
            setActiveReciterId(id);
            setScreen("quran-reciter-space");
          }}
          onOpenFullSurahReciter={(id) => {
            setActiveFullReciterId(id);
            setScreen("quran-full-reciter");
          }}
        />
      )}

      {screen === "quran-reciter-space" && (
        <ReciterSpaceScreen
          reciterId={activeReciterId}
          onBack={() => setScreen("quran-reciters")}
          onSelectSurah={(number) => {
            setActiveSurahNumber(number);
            setScreen("quran-reader");
          }}
        />
      )}

      {screen === "quran-full-reciter" && (
        <FullSurahReciterScreen reciterId={activeFullReciterId} onBack={() => setScreen("quran-reciters")} />
      )}

      {screen === "quran-reader" && (
        <QuranReaderScreen
          surahNumber={activeSurahNumber}
          arabicSize={ARABIC_SIZES[arabicSize]}
          onBack={() => setScreen("quran-list")}
          onChangeSurah={(number) => setActiveSurahNumber(number)}
          onOpenReciters={() => setScreen("quran-reciters")}
        />
      )}

      {screen === "apres-picker" && (
        <ApresPickerScreen
          prayerCompletion={prayerCompletion}
          onBack={() => setScreen("home")}
          onSelectPrayer={(prayerId) => openCategory("apres", prayerId)}
        />
      )}

      {screen === "history" && (
        <HistoryScreen history={history} streak={streak} onBack={() => setScreen("home")} />
      )}

      {screen === "calendar" && <HijriCalendarScreen onBack={() => setScreen("home")} />}

      {screen === "tasbih" && <TasbihScreen arabicSize={ARABIC_SIZES[arabicSize]} />}

      {screen === "dashboard" && <DashboardScreen history={history} streak={streak} />}

      {screen === "settings" && (
        <SettingsScreen
          arabicSize={arabicSize}
          onSetArabicSize={handleSetArabicSize}
          prayerSettings={prayerSettings}
          onSetPrayerMethod={handleSetPrayerMethod}
          onSetCustomAngle={handleSetCustomAngle}
          onSetCustomOffset={handleSetCustomOffset}
          onSetIqamaOffset={handleSetIqamaOffset}
          onSetMuezzin={handleSetMuezzin}
          onUseMyLocation={handleUseMyLocation}
          onResetLocation={handleResetLocation}
          locationStatus={locationStatus}
          onToggleNotifications={handleToggleNotifications}
          notificationStatus={notificationStatus}
          themePreference={themePreference}
          onSetThemePreference={handleSetThemePreference}
          onResetToday={handleResetToday}
          accentTheme={accentTheme}
          onSetAccentTheme={handleSetAccentTheme}
          hapticsEnabled={hapticsEnabled}
          onToggleHaptics={handleToggleHaptics}
          onFactoryReset={handleFactoryReset}
          onOpenPrivacy={() => setScreen("privacy")}
          onReplayOnboarding={replayOnboarding}
          language={language}
          languagePref={languagePref}
          onSetLanguage={handleSetLanguage}
        />
      )}

      {screen === "privacy" && <PrivacyPolicyScreen onBack={() => setScreen("settings")} />}

      {screen === "category" && category && item && (
        <CategoryScreen
          category={category}
          items={items}
          index={index}
          item={item}
          current={current}
          catProgress={catProgress}
          pulseId={pulseId}
          prayerLabel={activePrayerLabel}
          onBack={() => setScreen(activeCatId === "apres" ? "apres-picker" : "home")}
          onTap={handleTap}
          onPrev={() => index > 0 && goToIndex(index - 1)}
          onNext={() => index < items.length - 1 && goToIndex(index + 1)}
          onGoto={goToIndex}
          onReset={resetItem}
          arabicSize={ARABIC_SIZES[arabicSize]}
        />
      )}

      {screen === "done" && category && (
        <DoneScreen
          category={category}
          prayerLabel={activePrayerLabel}
          onHome={() => setScreen(activeCatId === "apres" ? "apres-picker" : "home")}
        />
      )}

      {TAB_SCREENS.includes(screen) && <BottomNav active={screen} onNavigate={setScreen} />}

      {showOnboarding && (
        <OnboardingOverlay
          onNavigate={setScreen}
          onEnableNotifications={async () => {
            await handleToggleNotifications(true);
            dismissOnboarding();
          }}
          onDismiss={dismissOnboarding}
        />
      )}
    </div>
  );
}

// A live guided tour — each step actually navigates to the real screen it's
// describing (behind a light scrim) instead of a static wall of bullet
// points on one modal, so a first-time user sees exactly where every
// feature lives, not just reads that it exists.
const TOUR_SLIDES = [
  {
    screen: "home",
    accent: "gold",
    icon: "🕌",
    title: "Bienvenue dans Mes Azkar",
    title_en: "Welcome to Mes Azkar",
    title_ar: "مرحبًا بك في أذكاري",
    body: "Un compagnon complet pour tes azkar, ton tasbih, ta lecture du Coran et tes invocations — visite rapide de ce qui t'attend.",
    body_en: "A complete companion for your azkar, your tasbih, your Quran reading and your invocations — a quick tour of what's ahead.",
    body_ar: "رفيق شامل لأذكارك، تسبيحك، قراءتك للقرآن وأدعيتك — جولة سريعة على ما ينتظرك.",
  },
  {
    screen: "home",
    accent: "gold",
    icon: "🕐",
    title: "Horaires calés sur ta mosquée",
    title_en: "Prayer times matched to your mosque",
    title_ar: "أوقات مضبوطة على مسجدك",
    body: "Ajuste chaque prière minute par minute pour coller aux horaires réels, règle l'iqama et la voix du muezzin, et active un rappel prière par prière d'un tap sur la cloche. Ajoute même un widget sur ton écran d'accueil.",
    body_en: "Adjust each prayer minute by minute to match the real times, set the iqama and the muezzin's voice, and turn on a reminder prayer by prayer with a tap on the bell. You can even add a widget to your home screen.",
    body_ar: "اضبط كل صلاة دقيقة بدقيقة لتطابق الأوقات الحقيقية، اضبط الإقامة وصوت المؤذن، وفعّل تذكيرًا لكل صلاة بلمسة على الجرس. يمكنك حتى إضافة أداة على شاشتك الرئيسية.",
  },
  {
    screen: "quran-list",
    accent: "indigo",
    icon: "📖",
    title: "Le Coran, deux espaces distincts",
    title_en: "The Quran, two distinct spaces",
    title_ar: "القرآن، في مساحتين مختلفتين",
    body: "Récitation pour écouter en suivant le texte avec le récitateur de ton choix, et Mushaf pour la lecture page par page fidèle à l'imprimé.",
    body_en: "Recitation to listen while following the text with the reciter of your choice, and Mushaf for page-by-page reading true to the printed copy.",
    body_ar: "التلاوة للاستماع مع متابعة النص بصوت القارئ الذي تختاره، والمصحف للقراءة صفحة بصفحة مطابقة للنسخة المطبوعة.",
  },
  {
    screen: "quran-mushaf",
    accent: "indigo",
    icon: "🔖",
    title: "Le Mushaf, en détail",
    title_en: "The Mushaf, in detail",
    title_ar: "المصحف، بالتفصيل",
    body: "Saute directement à un juz ou une sourate, pose des signets, et télécharge tout le Coran pour le lire hors connexion.",
    body_en: "Jump straight to a juz or a surah, place bookmarks, and download the whole Quran to read it offline.",
    body_ar: "انتقل مباشرة إلى جزء أو سورة، ضع إشارات مرجعية، وحمّل القرآن كاملاً لقراءته دون اتصال بالإنترنت.",
  },
  {
    screen: "tasbih",
    accent: "violet",
    icon: "📿",
    title: "Tasbih",
    title_en: "Tasbih",
    title_ar: "التسبيح",
    body: "Un compteur de dhikr libre et sans limite. Le mieux reste de compter sur les phalanges, comme l'a enseigné le Prophète ﷺ — l'appli le rappelle à l'ouverture.",
    body_en: "A free, unlimited dhikr counter. It's still best to count on your finger joints, as the Prophet ﷺ taught — the app reminds you of this when you open it.",
    body_ar: "عداد ذكر حر وبلا حدود. يبقى الأفضل هو العد على عُقد الأصابع، كما علّم النبي ﷺ — يذكّرك التطبيق بذلك عند فتحه.",
  },
  {
    screen: "invocations",
    accent: "clay",
    icon: "🤲",
    title: "Invocations",
    title_en: "Invocations",
    title_ar: "الأدعية",
    body: "Une invocation authentique pour chaque moment de la vie, classée par thème, plus un espace pour garder les tiennes.",
    body_en: "An authentic invocation for every moment of life, organized by topic, plus a space to keep your own.",
    body_ar: "دعاء صحيح لكل لحظة من لحظات الحياة، مصنّف حسب الموضوع، بالإضافة إلى مساحة لحفظ أدعيتك الخاصة.",
  },
  {
    screen: "dashboard",
    accent: "gold",
    icon: "📊",
    title: "Bilan",
    title_en: "Summary",
    title_ar: "الملخص",
    body: "Le résumé de ta journée — et tu peux remonter jour par jour dans l'historique pour voir ce qui a été fait la veille.",
    body_en: "Your day's summary — and you can go back day by day through the history to see what was done the day before.",
    body_ar: "ملخص يومك — ويمكنك التنقل يومًا بيوم في السجل لمعرفة ما تم إنجازه في الأيام السابقة.",
  },
  {
    screen: "settings",
    accent: "indigo",
    icon: "⚙️",
    title: "Réglages",
    title_en: "Settings",
    title_ar: "الإعدادات",
    body: "Thèmes de couleur, méthode de calcul, iqama, muezzin, sauvegarde de tes données — tout se personnalise ici.",
    body_en: "Color themes, calculation method, iqama, muezzin, backing up your data — everything is customized here.",
    body_ar: "الألوان، طريقة الحساب، الإقامة، المؤذن، نسخ بياناتك احتياطيًا — كل شيء قابل للتخصيص من هنا.",
  },
];

function OnboardingOverlay({ onNavigate, onEnableNotifications, onDismiss }) {
  const [step, setStep] = useState(0);
  const isLast = step === TOUR_SLIDES.length - 1;
  const slide = TOUR_SLIDES[step];
  const accent = COLORS[slide.accent] || COLORS.goldLight;
  const accentLight = COLORS[`${slide.accent}Light`] || COLORS.goldLight;
  const touchStartXRef = useRef(null);

  useEffect(() => {
    onNavigate(slide.screen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const goNext = () => setStep((s) => Math.min(TOUR_SLIDES.length - 1, s + 1));
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(deltaX) < 50) return;
    if (deltaX < 0 && !isLast) goNext();
    else if (deltaX > 0 && step > 0) goPrev();
  };

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-end fade-in"
      style={{ background: "rgba(10,14,12,0.45)", backdropFilter: "blur(1px)", zIndex: 50 }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Story-style segmented progress bar, tappable to jump to any step */}
      <div
        className="flex items-center gap-1.5 w-full"
        style={{ padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 0" }}
      >
        {TOUR_SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            aria-label={`${t("go_to_step")} ${i + 1}`}
            style={{ flex: 1, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.28)", overflow: "hidden" }}
          >
            <div
              style={{
                height: "100%",
                width: i <= step ? "100%" : "0%",
                borderRadius: 99,
                background: accentLight,
                transition: "width 0.3s ease, background 0.3s ease",
              }}
            />
          </button>
        ))}
      </div>

      <div className="w-full flex justify-end" style={{ padding: "10px 16px 0" }}>
        <button onClick={onDismiss} className="active:opacity-70" style={{ padding: "6px 10px" }}>
          <span className="font-ui font-semibold" style={{ color: "rgba(255,255,255,0.85)", fontSize: 12.5 }}>
            {t("skip")} ✕
          </span>
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <div
        className="w-full px-6 pt-7"
        style={{
          background: COLORS.bg,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
          maxWidth: 480,
          boxShadow: "0 -12px 40px rgba(0,0,0,0.25)",
        }}
      >
        <div key={step} className="text-center tour-slide-in" style={{ minHeight: 200 }}>
          <div
            key={`icon-${step}`}
            className="tour-icon-pop flex items-center justify-center mx-auto"
            style={{
              width: 76,
              height: 76,
              borderRadius: 24,
              background: `radial-gradient(circle at 30% 25%, ${accentLight}, ${accent})`,
              boxShadow: `0 10px 26px ${accent}55`,
            }}
          >
            <span style={{ fontSize: 34 }}>{slide.icon}</span>
          </div>
          <h2 className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 19, marginTop: 16 }}>
            {localField(slide, "title")}
          </h2>
          <p className="font-ui mt-2.5" style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.65, padding: "0 4px" }}>
            {localField(slide, "body")}
          </p>
        </div>

        {isLast ? (
          <>
            <button
              onClick={onEnableNotifications}
              className="mt-6 w-full active:scale-[0.98] transition"
              style={{
                background: `linear-gradient(135deg, ${accentLight}, ${accent})`,
                color: COLORS.bg,
                padding: "13px 20px",
                borderRadius: 16,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {t("tour_enable_notifications")}
            </button>
            <button onClick={onDismiss} className="mt-3 w-full active:opacity-70" style={{ padding: "8px 20px" }}>
              <span className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 13 }}>
                {t("tour_later")}
              </span>
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 mt-6">
            {step > 0 && (
              <button
                onClick={goPrev}
                className="flex items-center justify-center active:opacity-70"
                style={{ width: 44, height: 44, borderRadius: 99, background: inkA(0.06), flexShrink: 0 }}
                aria-label={t("nav_previous")}
              >
                <ChevronIcon dir="left" color={COLORS.ink} size={16} />
              </button>
            )}
            <button
              onClick={goNext}
              className="flex-1 active:scale-[0.98] transition"
              style={{
                background: `linear-gradient(135deg, ${accentLight}, ${accent})`,
                color: COLORS.bg,
                padding: "13px 20px",
                borderRadius: 16,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {t("next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Home screen                                                         */
/* ------------------------------------------------------------------ */
function HomeScreen({ progress, catCompletion, onOpen, onOpenApresPicker, streak, onOpenHistory, onOpenQibla, onOpenCalendar, onOpenMushaf, onOpenRamadan, onToggleTheme, location, prayerSettings, onToggleNotifyPrayer, onReplayOnboarding, languagePref, onSetLanguage }) {
  const { times, nextKey, minutesRemaining } = usePrayerTimes(location, prayerSettings);
  const today = new Date();
  const hijriLabel = getHijriLabel(today);
  const gregorianLabel = getGregorianLabel(today);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-28 fade-in">
      {/* Top bar: quick theme + language toggles (left), tutorial + history
          (right) — Tasbih/Coran/Invocations/Réglages already live in the
          bottom tab bar. */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1 -ml-2">
          <button onClick={onToggleTheme} className="p-2.5 active:opacity-60" aria-label={t("toggle_theme")}>
            <CategoryIcon type={currentTheme === "dark" ? "sun" : "moon"} color={COLORS.ink} size={20} />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowLanguageMenu((v) => !v)}
              className="p-2.5 active:opacity-60"
              aria-label={t("settings_language")}
            >
              <GlobeIcon color={COLORS.ink} size={20} />
            </button>
            {showLanguageMenu && (
              <>
                <div className="fixed inset-0" style={{ zIndex: 40 }} onClick={() => setShowLanguageMenu(false)} />
                <div
                  className="absolute left-0 top-full mt-1 flex flex-col gap-1 fade-in"
                  style={{
                    background: COLORS.parchment,
                    border: `1px solid ${COLORS.parchmentDark}`,
                    borderRadius: 14,
                    padding: 6,
                    minWidth: 180,
                    zIndex: 41,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  }}
                >
                  {[{ id: "system", label: t("lang_system") }, ...LANGUAGES].map((l) => {
                    const active = languagePref === l.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => {
                          onSetLanguage(l.id);
                          setShowLanguageMenu(false);
                        }}
                        className="flex items-center justify-between active:opacity-70"
                        style={{
                          background: active ? `${COLORS.goldLight}29` : "transparent",
                          borderRadius: 9,
                          padding: "8px 10px",
                          textAlign: "left",
                        }}
                      >
                        <span className="font-ui font-semibold" style={{ color: active ? COLORS.goldLight : COLORS.ink, fontSize: 12.5 }}>
                          {l.label}
                        </span>
                        {active && <CheckIcon color={COLORS.goldLight} size={14} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 -mr-2">
          <button onClick={onReplayOnboarding} className="p-2.5 active:opacity-60" aria-label={t("tour_replay")}>
            <InfoIcon color={COLORS.ink} size={20} />
          </button>
          <button onClick={onOpenHistory} className="p-2.5 active:opacity-60" aria-label={t("title_history")}>
            <HistoryIcon color={COLORS.ink} size={20} />
          </button>
        </div>
      </div>

      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2">
          <span className="font-arabic" style={{ color: COLORS.goldLight, fontSize: 22, letterSpacing: 0.5 }}>
            أذكاري
          </span>
          <span className="font-display" style={{ color: COLORS.ink, fontSize: 17 }}>
            Mes Azkar
          </span>
        </div>
      </div>

      <PrayerTimesCard
        times={times}
        nextKey={nextKey}
        minutesRemaining={minutesRemaining}
        locationLabel={(location || DEFAULT_LOCATION).label}
        iqamaOffsets={prayerSettings.iqamaOffsets}
        notifyPrayers={prayerSettings.notifyPrayers}
        onToggleNotifyPrayer={onToggleNotifyPrayer}
      />

      <div style={{ height: 16 }} />

      {/* Compact 4-tile grid — replaces the old full-width cards so everything
          fits above the fold without scrolling on most phones. */}
      <div className="grid grid-cols-4 gap-2">
        {CATEGORIES.map((cat) => {
          const pct = catCompletion(cat.id);
          const done = pct >= 1;
          return (
            <button
              key={cat.id}
              onClick={() => (cat.hasPrayers ? onOpenApresPicker() : onOpen(cat.id))}
              className="flex flex-col items-center active:scale-95 transition"
              style={{
                background: COLORS.parchment,
                borderRadius: 16,
                padding: "10px 4px",
                border: `1px solid ${COLORS.parchmentDark}`,
                textAlign: "center",
              }}
            >
              <div className="flex items-center justify-center" style={{ width: 38, height: 38, position: "relative" }}>
                <MiniRing pct={pct} color={cat.accent} done={false} size={38} />
                <div className="flex items-center justify-center" style={{ position: "absolute", inset: 0 }}>
                  {done ? <CheckIcon color={cat.accent} size={16} /> : <CategoryIcon type={cat.icon} color={cat.accent} size={16} />}
                </div>
              </div>
              <p className="font-display font-semibold mt-1.5" style={{ color: COLORS.ink, fontSize: 9.5, lineHeight: 1.2 }}>
                {currentLanguage === "ar" && cat.arabicLabel ? cat.arabicLabel : trField(cat, "shortLabel") || trField(cat, "label")}
              </p>
            </button>
          );
        })}
      </div>

      <button
        onClick={onOpenQibla}
        className="flex items-center gap-3 active:scale-[0.98] transition mt-2.5"
        style={{
          width: "100%",
          background: COLORS.parchment,
          borderRadius: 16,
          padding: "10px 14px",
          border: `1px solid ${COLORS.parchmentDark}`,
          textAlign: "left",
        }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 38, height: 38, borderRadius: 12, background: `${COLORS.goldLight}24` }}
        >
          <QiblaIcon color={COLORS.goldLight} size={20} />
        </div>
        <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
          {t("qibla_direction_mecca")}
        </p>
      </button>

      <button
        onClick={onOpenRamadan}
        className="flex items-center gap-3 active:scale-[0.98] transition mt-2.5"
        style={{
          width: "100%",
          background: COLORS.parchment,
          borderRadius: 16,
          padding: "10px 14px",
          border: `1px solid ${COLORS.parchmentDark}`,
          textAlign: "left",
        }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(139,124,177,0.16)" }}
        >
          <CategoryIcon type="moon" color={COLORS.violetLight} size={20} />
        </div>
        <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
          {t("ramadan_mode")}
        </p>
      </button>

      <ContinueReadingHomeCard onOpen={onOpenMushaf} />

      {(hijriLabel || gregorianLabel) && (
        <div
          role="button"
          tabIndex={0}
          onClick={onOpenCalendar}
          onKeyDown={(e) => e.key === "Enter" && onOpenCalendar()}
          className="flex items-center justify-between mt-2.5 active:opacity-80"
          style={{
            background: COLORS.parchment,
            border: `1px solid ${COLORS.parchmentDark}`,
            borderRadius: 16,
            padding: "10px 14px",
          }}
        >
          <div className="flex items-center gap-2">
            <CategoryIcon type="moon" color={COLORS.goldLight} size={16} />
            <div>
              {hijriLabel && (
                <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 13 }}>
                  {hijriLabel}
                </p>
              )}
              {gregorianLabel && (
                <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11 }}>
                  {gregorianLabel}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenHistory();
            }}
            className="flex items-center gap-1 active:opacity-70"
          >
            <FlameIcon color={streak > 0 ? COLORS.goldLight : inkA(0.35)} size={13} />
            <span className="font-ui font-semibold" style={{ color: COLORS.inkSoft, fontSize: 11 }}>
              {streak}
            </span>
          </button>
        </div>
      )}

      <VerseOfDayCard />

      <div className="mt-auto">
      </div>
    </div>
  );
}

// Home-screen shortcut straight into the Mushaf, wherever reading was left
// off — the actual page restore is handled by MushafPageView's persistKey,
// this card just reads QURAN_PROGRESS_KEY to show a friendly label.
function ContinueReadingHomeCard({ onOpen }) {
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(QURAN_PROGRESS_KEY, false);
        if (res && res.value) setProgress(JSON.parse(res.value));
      } catch (e) {
        // no progress saved yet
      }
    })();
  }, []);

  if (!progress || !progress.lastSurah) return null;
  const meta = QURAN_SURAHS.find((s) => s.number === progress.lastSurah);
  if (!meta) return null;

  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-3 active:scale-[0.98] transition mt-2.5"
      style={{
        width: "100%",
        background: COLORS.parchment,
        borderRadius: 16,
        padding: "10px 14px",
        border: `1px solid ${COLORS.parchmentDark}`,
        textAlign: "left",
      }}
    >
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: 38, height: 38, borderRadius: 12, background: `${COLORS.goldLight}24` }}
      >
        <BookIcon color={COLORS.goldLight} size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-ui font-semibold" style={{ color: COLORS.goldLight, fontSize: 9.5, letterSpacing: 0.4, textTransform: "uppercase" }}>
          {t("resume_reading")}
        </p>
        <p className="font-display font-semibold truncate" style={{ color: COLORS.ink, fontSize: 14 }}>
          {t("surah_label")} {meta.translit} — {t("verse_label")} {progress.lastAyah}
        </p>
      </div>
      <ChevronIcon dir="right" color={COLORS.inkSoft} />
    </button>
  );
}

const VERSE_OF_DAY_KEY = "azkar-verse-of-day-v1";
function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

// A different, deterministic verse each day (same for everyone, changes at
// midnight local time), with its French translation — cached so it only
// needs the network once per day.
function VerseOfDayCard() {
  const [verse, setVerse] = useState(null);
  const [status, setStatus] = useState("loading"); // 'loading' | 'ready' | 'error'

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dateKey = todayKey();
      const lang = currentLanguage;
      const cacheKey = `${VERSE_OF_DAY_KEY}-${lang}`;
      try {
        const res = await window.storage.get(cacheKey, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.date === dateKey && parsed.verse) {
            setVerse(parsed.verse);
            setStatus("ready");
            return;
          }
        }
      } catch (e) {
        // no cached verse yet for today
      }
      try {
        const globalAyah = (dayOfYear(new Date()) % QURAN_TOTAL_AYAHS) + 1;
        const editions = lang === "ar" ? "quran-uthmani" : `quran-uthmani,${lang === "en" ? "en.sahih" : "fr.hamidullah"}`;
        const res = await fetch(`https://api.alquran.cloud/v1/ayah/${globalAyah}/editions/${editions}`).then((r) =>
          r.json()
        );
        if (cancelled) return;
        const data = res?.data;
        if (!Array.isArray(data) || (lang !== "ar" && data.length < 2)) throw new Error("bad response");
        const surahMeta = QURAN_SURAHS.find((s) => s.number === data[0].surah.number);
        const v = {
          arabic: data[0].text,
          translation: lang === "ar" ? "" : data[1].text,
          surahTranslit: surahMeta ? surahMeta.translit : data[0].surah.englishName,
          ayahNumber: data[0].numberInSurah,
        };
        setVerse(v);
        setStatus("ready");
        window.storage.set(cacheKey, JSON.stringify({ date: dateKey, verse: v }), false).catch(() => {});
      } catch (e) {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentLanguage]);

  if (status === "error") return null;

  return (
    <div
      className="mt-2.5"
      style={{ background: COLORS.parchment, border: `1px solid ${COLORS.parchmentDark}`, borderRadius: 16, padding: "10px 14px" }}
    >
      <div className="flex items-center justify-between mb-1">
        <p
          className="font-ui font-semibold"
          style={{ color: COLORS.inkSoft, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" }}
        >
          {t("verse_of_day")}
        </p>
        {verse && (
          <p className="font-ui" style={{ color: COLORS.goldLight, fontSize: 10.5 }}>
            {verse.surahTranslit} {verse.ayahNumber}
          </p>
        )}
      </div>
      {status === "loading" || !verse ? (
        <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 12 }}>
          {t("loading")}
        </p>
      ) : (
        <>
          <p dir="rtl" className="font-arabic text-right" style={{ color: COLORS.ink, fontSize: 18, lineHeight: 1.8 }}>
            {verse.arabic}
          </p>
          {currentLanguage !== "ar" && (
            <>
              <div style={{ height: 1, background: COLORS.parchmentDark, margin: "10px 0" }} />
              <p className="font-display" style={{ color: COLORS.inkSoft, fontSize: 13, fontStyle: "italic", lineHeight: 1.5 }}>
                {verse.translation}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

// Ticks every second so the header always shows the phone's actual current
// time, not just the prayer countdown derived from it.
function LiveClock({ color, size = 12.5 }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  return (
    <span className="font-ui font-semibold" style={{ color, fontSize: size, fontVariantNumeric: "tabular-nums" }}>
      {time}
    </span>
  );
}

function PrayerTimesCard({ times, nextKey, minutesRemaining, locationLabel, iqamaOffsets, notifyPrayers, onToggleNotifyPrayer }) {
  const nextLabel = times.find((t) => t.key === nextKey)?.label || "";
  const sunrise = times.find((t) => t.key === "sunrise");
  const prayerTimes = times.filter((t) => t.key !== "sunrise");
  return (
    <div
      className="mb-6"
      style={{
        background: COLORS.parchment,
        border: `1px solid ${COLORS.parchmentDark}`,
        borderRadius: 22,
        padding: "16px 14px 14px 14px",
      }}
    >
      <div className="flex items-center justify-between px-1" style={{ marginBottom: 8 }}>
        <p className="font-ui" style={{ color: COLORS.inkFaint, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
          {locationLabel}
        </p>
        <LiveClock color={COLORS.ink} />
      </div>
      {minutesRemaining != null && (
        <div className="flex justify-center" style={{ marginBottom: 14 }}>
          <p
            className="font-ui font-semibold"
            style={{ color: COLORS.gold, background: `${COLORS.goldLight}29`, fontSize: 12, padding: "6px 14px", borderRadius: 30 }}
          >
            {nextLabel} {t("countdown_in")} {formatCountdown(minutesRemaining)}
          </p>
        </div>
      )}
      <div className="flex items-stretch justify-between px-1" style={{ borderTop: `1px solid ${COLORS.parchmentDark}`, paddingTop: 14, paddingBottom: 12 }}>
        {prayerTimes.map((p) => {
          const active = p.key === nextKey;
          return (
            <div
              key={p.key}
              className="flex flex-col items-center flex-1"
              style={active ? { background: `${COLORS.goldLight}22`, borderRadius: 12, margin: "-4px 0", paddingTop: 4, paddingBottom: 4 } : undefined}
            >
              <span
                className="font-ui"
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: active ? COLORS.gold : COLORS.inkFaint,
                }}
              >
                {p.label}
              </span>
              <span
                className="font-ui mt-1"
                style={{
                  fontSize: 14,
                  fontWeight: active ? 800 : 700,
                  color: active ? COLORS.gold : COLORS.ink,
                }}
              >
                {p.time}
              </span>
              {iqamaOffsets && iqamaOffsets[p.key] != null && (
                <span className="font-ui" style={{ fontSize: 9.5, color: COLORS.inkFaint, marginTop: 1 }}>
                  +{iqamaOffsets[p.key]}
                </span>
              )}
              {onToggleNotifyPrayer && (
                <button
                  onClick={() => onToggleNotifyPrayer(p.key)}
                  className="active:opacity-60"
                  style={{ padding: 4, marginTop: 2 }}
                  aria-label={`${p.label} : ${
                    notifyPrayers && notifyPrayers[p.key] === false ? t("enable_reminder") : t("disable_reminder")
                  }`}
                >
                  <BellIcon
                    color={notifyPrayers && notifyPrayers[p.key] === false ? inkA(0.3) : COLORS.goldLight}
                    muted={notifyPrayers && notifyPrayers[p.key] === false}
                    size={14}
                  />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {sunrise && (
        <div
          className="flex items-center justify-center gap-1.5"
          style={{ borderTop: `1px solid ${COLORS.parchmentDark}`, paddingTop: 10 }}
        >
          <SunriseIcon color={sunrise.key === nextKey ? COLORS.gold : COLORS.inkFaint} size={13} />
          <span
            className="font-ui"
            style={{ fontSize: 11, color: sunrise.key === nextKey ? COLORS.gold : COLORS.inkFaint, fontWeight: 700 }}
          >
            {sunrise.label} {sunrise.time}
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Qibla — compass bearing towards the Kaaba                           */
/* ------------------------------------------------------------------ */
const KAABA = { lat: 21.4225, lng: 39.8262 };

function qiblaBearing(lat, lng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const phi1 = toRad(lat);
  const phi2 = toRad(KAABA.lat);
  const deltaLambda = toRad(KAABA.lng - lng);
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function distanceToKaabaKm(lat, lng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(KAABA.lat - lat);
  const dLng = toRad(KAABA.lng - lng);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(KAABA.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const supportsCompassPermissionRequest =
  typeof window !== "undefined" &&
  typeof window.DeviceOrientationEvent !== "undefined" &&
  typeof window.DeviceOrientationEvent.requestPermission === "function";

function QiblaScreen({ location, onBack }) {
  const [heading, setHeading] = useState(null);
  const [permission, setPermission] = useState(supportsCompassPermissionRequest ? "idle" : "granted");

  const bearing = qiblaBearing(location.lat, location.lng);
  const distanceKm = distanceToKaabaKm(location.lat, location.lng);

  useEffect(() => {
    if (permission !== "granted") return undefined;
    const handleOrientation = (event) => {
      if (typeof event.webkitCompassHeading === "number") {
        setHeading(event.webkitCompassHeading);
      } else if (event.absolute && typeof event.alpha === "number") {
        setHeading((360 - event.alpha) % 360);
      }
    };
    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handleOrientation, true);
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, [permission]);

  const handleEnableCompass = async () => {
    try {
      const result = await window.DeviceOrientationEvent.requestPermission();
      setPermission(result === "granted" ? "granted" : "denied");
    } catch (e) {
      setPermission("denied");
    }
  };

  const needleRotation = heading != null ? bearing - heading : bearing;

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-28 fade-in">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("title_qibla")}
        </p>
        <div className="w-9" />
      </div>

      <p className="font-ui text-center mb-8" style={{ color: COLORS.inkSoft, fontSize: 12.5, lineHeight: 1.5 }}>
        {heading != null ? t("qibla_flat_hint") : `${t("qibla_direction_from")} ${location.label}`}
      </p>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative" style={{ width: 240, height: 240 }}>
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: COLORS.parchment, border: `1px solid ${COLORS.parchmentDark}` }}
          />
          {["Qibla", ...(currentLanguage === "ar" ? ["ش", "ج", "غ"] : currentLanguage === "en" ? ["E", "S", "W"] : ["E", "S", "O"])].map((label, i) => (
            <span
              key={label}
              className="font-ui font-semibold absolute"
              style={{
                color: COLORS.inkSoft,
                fontSize: 12,
                top: i === 0 ? 12 : i === 2 ? undefined : "50%",
                bottom: i === 2 ? 12 : undefined,
                left: i === 3 ? 14 : i === 1 ? undefined : "50%",
                right: i === 1 ? 14 : undefined,
                transform: i === 0 || i === 2 ? "translateX(-50%)" : "translateY(-50%)",
              }}
            >
              {label}
            </span>
          ))}
          <div
            className="absolute"
            style={{
              inset: 0,
              transform: `rotate(${needleRotation}deg)`,
              transition: "transform 0.15s linear",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "16%",
                width: 0,
                height: 0,
                marginLeft: -10,
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderBottom: `26px solid ${COLORS.goldLight}`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 3,
                height: "34%",
                marginLeft: -1.5,
                background: COLORS.goldLight,
                opacity: 0.5,
              }}
            />
          </div>
          <div
            className="absolute rounded-full"
            style={{
              width: 12,
              height: 12,
              left: "50%",
              top: "50%",
              marginLeft: -6,
              marginTop: -6,
              background: COLORS.ink,
            }}
          />
        </div>

        <p className="font-ui font-semibold mt-8" style={{ color: COLORS.ink, fontSize: 14 }}>
          {currentLanguage === "en"
            ? `${Math.round(bearing)}° from North`
            : currentLanguage === "ar"
            ? `${Math.round(bearing)}° من الشمال`
            : `${Math.round(bearing)}° depuis le Nord`}
        </p>
        <p className="font-ui mt-1" style={{ color: COLORS.inkSoft, fontSize: 12.5 }}>
          {currentLanguage === "en"
            ? `${distanceKm.toLocaleString("en-US")} km from the Kaaba`
            : currentLanguage === "ar"
            ? `${distanceKm.toLocaleString("ar-EG")} كم من الكعبة`
            : `${distanceKm.toLocaleString("fr-FR")} km de la Kaaba`}
        </p>

        {permission === "idle" && (
          <button
            onClick={handleEnableCompass}
            className="mt-8 active:scale-95 transition"
            style={{
              background: COLORS.parchment,
              color: COLORS.ink,
              padding: "12px 24px",
              borderRadius: 99,
              fontWeight: 600,
              fontSize: 13,
              border: `1px solid ${COLORS.parchmentDark}`,
            }}
          >
            {t("enable_compass")}
          </button>
        )}
        {permission === "denied" && (
          <p className="font-ui text-center mt-6" style={{ color: COLORS.clay, fontSize: 11.5, lineHeight: 1.5 }}>
            {t("compass_denied")}
          </p>
        )}
        {permission === "granted" && heading == null && (
          <p className="font-ui text-center mt-6" style={{ color: COLORS.inkSoft, fontSize: 11.5, lineHeight: 1.5 }}>
            {t("compass_unavailable")}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ramadan mode — Suhoor/Iftar countdown, works any day of the year but   */
/* labels itself against the current Hijri month when it really is       */
/* Ramadan; the astronomical Fajr/Maghrib countdown is identical either   */
/* way, so this doubles as a fasting-day timer outside Ramadan too.       */
/* ------------------------------------------------------------------ */
function RamadanScreen({ location, prayerSettings, onBack, arabicSize }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const loc = location || DEFAULT_LOCATION;
  const calc = resolveCalcConfig(prayerSettings);
  const times = computePrayerTimesDecimal(now, loc, calc);
  const nowDecimal = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const hijri = gregorianToHijri(now);
  const isRamadan = hijri.month === 9;

  let phase, minutesRemaining;
  if (nowDecimal < times.fajr) {
    phase = "before-fajr";
    minutesRemaining = Math.max(0, Math.round((times.fajr - nowDecimal) * 60));
  } else if (nowDecimal < times.maghrib) {
    phase = "fasting";
    minutesRemaining = Math.max(0, Math.round((times.maghrib - nowDecimal) * 60));
  } else {
    phase = "after-iftar";
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tTimes = computePrayerTimesDecimal(tomorrow, loc, calc);
    minutesRemaining = Math.max(0, Math.round((tTimes.fajr + 24 - nowDecimal) * 60));
  }

  const phaseMessage =
    phase === "before-fajr" ? t("ramadan_before_fajr") : phase === "fasting" ? t("ramadan_fasting") : t("ramadan_after_iftar");
  const ramadanItems = (INVOCATION_TOPICS.ramadan && INVOCATION_TOPICS.ramadan.items) || [];

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-10 fade-in">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("ramadan_mode")}
        </p>
        <div className="w-9" />
      </div>

      <p className="font-ui text-center mb-1" style={{ color: COLORS.inkSoft, fontSize: 11.5 }}>
        {isRamadan ? `${t("ramadan_day")} ${hijri.day}` : getHijriMonthYearLabel(now)}
      </p>

      <div
        className="text-center mt-3"
        style={{ background: inkA(0.07), border: `1px solid ${inkA(0.14)}`, borderRadius: 18, padding: "20px 16px" }}
      >
        <p className="font-ui font-semibold" style={{ color: COLORS.violetLight, fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase" }}>
          {phaseMessage}
        </p>
        <p className="font-display font-semibold mt-1.5" style={{ color: COLORS.ink, fontSize: 28 }}>
          {formatCountdown(minutesRemaining)}
        </p>
      </div>

      <div className="flex gap-2.5 mt-4">
        <div
          className="flex-1 text-center"
          style={{ background: COLORS.parchment, border: `1px solid ${COLORS.parchmentDark}`, borderRadius: 16, padding: "12px 8px" }}
        >
          <p className="font-ui font-semibold" style={{ color: COLORS.inkSoft, fontSize: 10.5, letterSpacing: 0.3, textTransform: "uppercase" }}>
            {t("ramadan_suhoor_end")}
          </p>
          <p className="font-display font-semibold mt-1" style={{ color: COLORS.ink, fontSize: 17 }}>
            {_fmtHour(times.fajr)}
          </p>
        </div>
        <div
          className="flex-1 text-center"
          style={{ background: COLORS.parchment, border: `1px solid ${COLORS.parchmentDark}`, borderRadius: 16, padding: "12px 8px" }}
        >
          <p className="font-ui font-semibold" style={{ color: COLORS.inkSoft, fontSize: 10.5, letterSpacing: 0.3, textTransform: "uppercase" }}>
            {t("ramadan_iftar")}
          </p>
          <p className="font-display font-semibold mt-1" style={{ color: COLORS.ink, fontSize: 17 }}>
            {_fmtHour(times.maghrib)}
          </p>
        </div>
      </div>

      {!isRamadan && (
        <p className="font-ui text-center mt-3" style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 1.5 }}>
          {t("ramadan_outside_hint")}
        </p>
      )}

      {ramadanItems.length > 0 && (
        <div className="flex flex-col gap-3 mt-6">
          {ramadanItems.map((it, i) => (
            <div
              key={i}
              style={{ background: COLORS.parchment, borderRadius: 20, padding: "18px 20px", border: `1px solid ${COLORS.parchmentDark}` }}
            >
              <p className="font-ui font-semibold" style={{ color: COLORS.clay, fontSize: 12, letterSpacing: 0.3, textTransform: "uppercase" }}>
                {trField(it, "title")}
              </p>
              <p
                dir="rtl"
                className="font-arabic text-right mt-3"
                style={{ color: COLORS.ink, fontSize: arabicSize || ARABIC_SIZES.md, lineHeight: 1.8 }}
              >
                {it.arabic}
              </p>
              {currentLanguage !== "ar" && (
                <>
                  <div style={{ height: 1, background: COLORS.parchmentDark, margin: "12px 0" }} />
                  <p className="font-display" style={{ color: COLORS.inkSoft, fontSize: 13.5, fontStyle: "italic" }}>
                    {trField(it, "translation")}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniRing({ pct, color, done, size = 34 }) {
  const stroke = size <= 20 ? 3 : 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * Math.min(pct, 1);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.parchmentDark} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {done && (
        <div className="flex items-center justify-center" style={{ position: "absolute", inset: 0 }}>
          <div style={{ width: size <= 20 ? 4 : 7, height: size <= 20 ? 4 : 7, borderRadius: 99, background: color }} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Category screen                                                     */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Après la prière — prayer picker (level 2)                           */
/* ------------------------------------------------------------------ */
function ApresPickerScreen({ prayerCompletion, onBack, onSelectPrayer }) {
  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-8 fade-in">
      <div className="flex items-center justify-between mb-2">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("after_prayer_title")}
        </p>
        <div className="w-9" />
      </div>

      <p className="font-ui text-center mb-7" style={{ color: COLORS.inkSoft, fontSize: 12.5, lineHeight: 1.5 }}>
        {t("choose_prayer_done")}
      </p>

      <div className="flex flex-col gap-3">
        {APRES_PRAYERS.map((p) => {
          const pct = prayerCompletion(p.id);
          const done = pct >= 1;
          return (
            <button
              key={p.id}
              onClick={() => onSelectPrayer(p.id)}
              className="active:scale-[0.98] transition"
              style={{
                background: COLORS.parchment,
                borderRadius: 18,
                padding: "16px 18px",
                border: `1px solid ${COLORS.parchmentDark}`,
                textAlign: "left",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center"
                    style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(0,0,0,0.03)" }}
                  >
                    <CategoryIcon type="hands" color={COLORS.clay} size={22} />
                  </div>
                  <div>
                    <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 15 }}>
                      {localLabel(p)}
                    </p>
                    {p.enhanced && (
                      <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 1 }}>
                        {t("surahs_enhanced")}
                      </p>
                    )}
                  </div>
                </div>
                <MiniRing pct={pct} color={COLORS.clay} done={done} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategoryScreen({
  category,
  items,
  index,
  item,
  current,
  catProgress,
  pulseId,
  prayerLabel,
  onBack,
  onTap,
  onPrev,
  onNext,
  onGoto,
  onReset,
  arabicSize,
}) {
  const complete = current >= item.count;

  return (
    <div className="flex flex-col px-5 pt-6 fade-in" style={{ height: "100vh" }}>
      {/* Header — stays put */}
      <div className="flex items-center justify-between mb-3" style={{ flexShrink: 0 }}>
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <div className="text-center">
          <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
            {prayerLabel
              ? `${t("label_after")} ${prayerLabel}`
              : currentLanguage === "ar" && category.arabicLabel
              ? category.arabicLabel
              : trField(category, "label")}
          </p>
        </div>
        <button onClick={onReset} className="p-2.5 -mr-2 active:opacity-60" aria-label={t("reset_progress")}>
          <ResetIcon color={COLORS.ink} />
        </button>
      </div>

      {/* Progress bar — fixed alongside the header, same reasoning as the
          counter below: it shouldn't shift position depending on how long
          the current item's text happens to be. */}
      <div style={{ marginBottom: 14, paddingLeft: 4, paddingRight: 4, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span className="font-ui font-semibold" style={{ color: category.accent, fontSize: 11.5 }}>
            {trField(item, "title")}
          </span>
          <span className="font-ui font-semibold" style={{ color: COLORS.inkSoft, fontSize: 11.5 }}>
            {index + 1} {t("label_of")} {items.length}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {items.map((it, i) => {
            const done = (catProgress.counts[it.id] || 0) >= it.count;
            const isCurrent = i === index;
            return (
              <button
                key={it.id}
                onClick={() => onGoto(i)}
                style={{
                  height: 5,
                  flex: 1,
                  borderRadius: 4,
                  background: isCurrent ? category.accent : done ? category.accentLight : COLORS.parchmentDark,
                  transition: "background 0.2s ease",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Scrollable: just the azkar text — this is the part that can grow
          or shrink with content length. The header/progress bar above and
          the counter below never move, no matter how long the text is. */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        <div
          style={{
            background: COLORS.parchment,
            borderRadius: 24,
            width: "100%",
            padding: "26px 22px",
            border: `1px solid ${COLORS.parchmentDark}`,
          }}
        >
          <div className="flex items-center justify-center mb-4">
            <div
              className="flex items-center gap-2"
              style={{ background: `${category.accent}1F`, padding: item.audio ? "5px 14px 5px 5px" : "6px 14px", borderRadius: 30 }}
            >
              {item.audio && <AudioPlayButton key={item.id} src={item.audio} color={category.accent} size={24} />}
              <span className="font-ui font-semibold" style={{ color: category.accent, fontSize: 11.5, letterSpacing: 0.5, textTransform: "uppercase" }}>
                {trField(item, "title")}
              </span>
            </div>
          </div>

          <p
            dir="rtl"
            className="font-arabic text-right mt-4"
            style={{ color: COLORS.ink, fontSize: arabicSize || ARABIC_SIZES.md, lineHeight: 1.9 }}
          >
            {item.arabic}
          </p>

          {currentLanguage !== "ar" && (
            <>
              <div style={{ height: 1, background: COLORS.parchmentDark, margin: "18px 0" }} />
              <p className="font-display" style={{ color: COLORS.inkSoft, fontSize: 14, lineHeight: 1.6, fontStyle: "italic" }}>
                {trField(item, "translation")}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Fixed footer — the counter and its label always sit here, in the
          exact same spot on screen, regardless of how the content above scrolls. */}
      <div className="flex flex-col items-center pt-5 pb-6" style={{ flexShrink: 0 }}>
        <button
          onClick={onTap}
          disabled={complete}
          className="flex flex-col items-center gap-3"
          style={{ touchAction: "manipulation" }}
        >
          <BeadRing
            current={current}
            target={item.count}
            color={category.accent}
            colorLight={category.accentLight}
            pulse={pulseId === item.id}
            size={106}
          />
          <span className="font-ui" style={{ color: COLORS.ink, fontSize: 12, opacity: 0.75 }}>
            {complete ? t("label_completed") : t("tap_to_count")}
          </span>
        </button>

        <div className="flex items-center justify-between w-full mt-6 px-2">
          <button
            onClick={onPrev}
            disabled={index === 0}
            className="p-3 rounded-full active:opacity-60"
            style={{ opacity: index === 0 ? 0.25 : 1 }}
            aria-label={t("prev_dhikr")}
          >
            <ChevronIcon dir="left" color={COLORS.ink} />
          </button>
          <p className="font-ui" style={{ color: COLORS.ink, fontSize: 12, opacity: 0.7 }}>
            {index + 1} / {items.length}
          </p>
          <button
            onClick={onNext}
            disabled={index === items.length - 1}
            className="p-3 rounded-full active:opacity-60"
            style={{ opacity: index === items.length - 1 ? 0.25 : 1 }}
            aria-label={t("next_dhikr")}
          >
            <ChevronIcon dir="right" color={COLORS.ink} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Completion screen                                                   */
/* ------------------------------------------------------------------ */
function DoneScreen({ category, prayerLabel, onHome }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 fade-in text-center">
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: 99,
          background: COLORS.parchment,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 22,
        }}
      >
        <CheckIcon color={category.accent} size={40} />
      </div>
      <p className="font-arabic" style={{ color: COLORS.goldLight, fontSize: 26 }}>
        ما شاء الله
      </p>
      <p className="font-display" style={{ color: COLORS.ink, fontSize: 18, marginTop: 10 }}>
        {prayerLabel
          ? currentLanguage === "en"
            ? `${prayerLabel} azkar completed`
            : currentLanguage === "ar"
            ? `اكتملت أذكار بعد ${prayerLabel}`
            : `Azkar après ${prayerLabel} terminés`
          : currentLanguage === "ar" && category.arabicLabel
          ? `اكتملت ${category.arabicLabel}`
          : `${trField(category, "label")} ${t("label_done")}`}
      </p>
      <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
        {t("completion_message")}
      </p>
      <button
        onClick={onHome}
        className="mt-9 active:scale-95 transition"
        style={{
          background: COLORS.parchment,
          color: COLORS.ink,
          padding: "12px 28px",
          borderRadius: 99,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        {prayerLabel ? t("back_to_prayers") : t("back_to_home")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* History screen                                                       */
/* ------------------------------------------------------------------ */
const WEEKDAY_LABELS_BY_LANG = {
  fr: ["L", "M", "M", "J", "V", "S", "D"],
  en: ["M", "T", "W", "T", "F", "S", "S"],
  ar: ["ن", "ث", "ر", "خ", "ج", "س", "ح"],
};
function weekdayLabels() {
  return WEEKDAY_LABELS_BY_LANG[currentLanguage] || WEEKDAY_LABELS_BY_LANG.fr;
}

function HistoryScreen({ history, streak, onBack }) {
  const days = lastDaysLevels(history, 28);
  // Pad the start so the grid always begins on a Monday for a clean 7-column layout
  const firstWeekday = (new Date(days[0].date).getUTCDay() + 6) % 7; // 0 = Monday
  const padded = Array.from({ length: firstWeekday }, () => null).concat(days);

  const levelStyle = (level) => {
    if (level === 0) return { background: "transparent", border: `1.5px solid ${inkA(0.18)}` };
    const opacity = level / CATEGORIES.length;
    return { background: level >= CATEGORIES.length ? COLORS.goldLight : COLORS.gold, opacity, border: "none" };
  };

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-10 fade-in">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("title_history")}
        </p>
        <div className="w-9" />
      </div>

      <div className="flex flex-col items-center mb-8">
        <FlameIcon color={streak > 0 ? COLORS.goldLight : inkA(0.4)} size={34} />
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 30, marginTop: 8 }}>
          {streak}
        </p>
        <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 12, marginTop: 2 }}>
          {streak > 1 ? t("streak_days") : t("streak_day")}
        </p>
      </div>

      <div
        style={{
          background: COLORS.parchment,
          borderRadius: 20,
          border: `1px solid ${COLORS.parchmentDark}`,
          padding: "18px 16px",
        }}
      >
        <p className="font-ui font-semibold text-center mb-4" style={{ color: COLORS.inkSoft, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" }}>
          {t("last_4_weeks")}
        </p>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {weekdayLabels().map((w, i) => (
            <p key={i} className="font-ui text-center" style={{ color: COLORS.inkSoft, fontSize: 10, opacity: 0.6 }}>
              {w}
            </p>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {padded.map((d, i) =>
            d ? (
              <div
                key={d.date}
                title={d.date}
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  borderRadius: 7,
                  ...levelStyle(d.level),
                }}
              />
            ) : (
              <div key={`pad-${i}`} />
            )
          )}
        </div>

        <div className="flex items-center justify-center gap-2 mt-5">
          <span className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 10 }}>
            {t("less_label")}
          </span>
          {Array.from({ length: CATEGORIES.length + 1 }, (_, lvl) => (
            <div key={lvl} style={{ width: 12, height: 12, borderRadius: 4, ...levelStyle(lvl) }} />
          ))}
          <span className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 10 }}>
            {t("more_label")}
          </span>
        </div>
      </div>

      <p className="font-ui text-center mt-6" style={{ color: COLORS.inkSoft, fontSize: 11, lineHeight: 1.6 }}>
        {currentLanguage === "en"
          ? `A full cell = all ${CATEGORIES.length} azkar categories completed that day.`
          : currentLanguage === "ar"
          ? `المربع الممتلئ = اكتملت جميع أذكار اليوم (${CATEGORIES.length}) في ذلك اليوم.`
          : `Une case pleine = les ${CATEGORIES.length} azkar de la journée complétés ce jour-là.`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard — today's summary across azkar, tasbih and Quran reading, */
/* with a message that adapts to how much has actually been done       */
/* ------------------------------------------------------------------ */
function DashboardScreen({ history, streak }) {
  const [tasbihLog, setTasbihLog] = useState({});
  const [quranLog, setQuranLog] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [dayOffset, setDayOffset] = useState(0); // 0 = today, negative = past days

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(TASBIH_DAILY_KEY, false);
        if (res && res.value) setTasbihLog(JSON.parse(res.value));
      } catch (e) {
        // no tasbih logged yet
      }
      try {
        const res = await window.storage.get(QURAN_PAGES_DAILY_KEY, false);
        if (res && res.value) setQuranLog(JSON.parse(res.value));
      } catch (e) {
        // no Quran reading logged yet
      }
      setLoaded(true);
    })();
  }, []);

  const isToday = dayOffset === 0;
  const viewedDate = todayAnchorDate();
  viewedDate.setDate(viewedDate.getDate() + dayOffset);
  const viewedKey = dateKey(viewedDate);

  const flagsToday = history[viewedKey] || {};
  const tasbihToday = tasbihLog[viewedKey] || 0;
  const pagesToday = quranLog[viewedKey] || 0;
  const azkarDone = CATEGORIES.filter((cat) => flagsToday[cat.id]).length;
  const activityCount = azkarDone + (tasbihToday > 0 ? 1 : 0) + (pagesToday > 0 ? 1 : 0);
  const maxActivity = CATEGORIES.length + 2;

  const message = !isToday
    ? activityCount === 0
      ? t("msg_nothing_that_day")
      : activityCount >= maxActivity
      ? t("msg_perfect_day_past")
      : t("msg_summary_that_day")
    : activityCount === 0
    ? t("msg_not_started")
    : activityCount >= maxActivity
    ? t("msg_perfect_day")
    : activityCount >= maxActivity - 1
    ? t("msg_excellent_day")
    : activityCount >= CATEGORIES.length / 2
    ? t("msg_good_progress")
    : t("msg_good_start");

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="font-ui" style={{ color: COLORS.ink, opacity: 0.7 }}>
          {t("loading")}
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-28 fade-in">
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2">
          <span className="font-arabic" style={{ color: COLORS.goldLight, fontSize: 22, letterSpacing: 0.5 }}>
            بِلَان الْيَوْم
          </span>
          <span className="font-display" style={{ color: COLORS.ink, fontSize: 17 }}>
            {isToday ? t("title_dashboard") : t("title_dashboard_short")}
          </span>
        </div>
        <div className="flex items-center justify-center gap-3 mt-1.5">
          <button onClick={() => setDayOffset((o) => o - 1)} className="p-1.5 active:opacity-60" aria-label={t("nav_previous")}>
            <ChevronIcon dir="left" color={COLORS.inkSoft} size={16} />
          </button>
          <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11.5, minWidth: 150, textAlign: "center" }}>
            {isToday ? t("today") : getGregorianLabel(viewedDate)}
          </p>
          <button
            onClick={() => setDayOffset((o) => Math.min(0, o + 1))}
            disabled={isToday}
            className="p-1.5 active:opacity-60"
            style={{ opacity: isToday ? 0.25 : 1 }}
            aria-label={t("nav_next")}
          >
            <ChevronIcon dir="right" color={COLORS.inkSoft} size={16} />
          </button>
        </div>
      </div>

      <div
        className="text-center"
        style={{ background: inkA(0.07), border: `1px solid ${inkA(0.14)}`, borderRadius: 18, padding: "18px 16px" }}
      >
        <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 15, lineHeight: 1.5 }}>
          {message}
        </p>
      </div>

      <div style={{ height: 16 }} />

      <div className="grid grid-cols-4 gap-2">
        {CATEGORIES.map((cat) => {
          const done = !!flagsToday[cat.id];
          return (
            <div
              key={cat.id}
              className="flex flex-col items-center"
              style={{
                background: COLORS.parchment,
                borderRadius: 16,
                padding: "10px 4px",
                border: `1px solid ${done ? cat.accent : COLORS.parchmentDark}`,
                textAlign: "center",
              }}
            >
              <div
                className="flex items-center justify-center"
                style={{ width: 36, height: 36, borderRadius: 11, background: done ? "rgba(0,0,0,0.03)" : "rgba(0,0,0,0.03)" }}
              >
                {done ? <CheckIcon color={cat.accent} size={20} /> : <CategoryIcon type={cat.icon} color={inkA(0.35)} size={18} />}
              </div>
              <p className="font-display font-semibold mt-1.5" style={{ color: COLORS.ink, fontSize: 9.5, lineHeight: 1.2 }}>
                {currentLanguage === "ar" && cat.arabicLabel ? cat.arabicLabel : trField(cat, "shortLabel") || trField(cat, "label")}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 mt-2.5">
        <div
          className="flex items-center gap-3"
          style={{ background: COLORS.parchment, borderRadius: 16, padding: "10px 14px", border: `1px solid ${COLORS.parchmentDark}` }}
        >
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 38, height: 38, borderRadius: 12, background: `${COLORS.goldLight}24` }}>
            <TasbihIcon color={COLORS.goldLight} size={20} />
          </div>
          <div>
            <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
              {currentLanguage === "en"
                ? `${tasbihToday} dhikr recited`
                : currentLanguage === "ar"
                ? `${tasbihToday} ذكر تم ترديده`
                : `${tasbihToday} dhikr récité${tasbihToday > 1 ? "s" : ""}`}
            </p>
            <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11 }}>
              {currentLanguage === "en"
                ? `All phrases combined${isToday ? ", today" : ""}`
                : currentLanguage === "ar"
                ? `جميع الصيغ${isToday ? "، اليوم" : ""}`
                : `Toutes formules confondues${isToday ? ", aujourd'hui" : ""}`}
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-3"
          style={{ background: COLORS.parchment, borderRadius: 16, padding: "10px 14px", border: `1px solid ${COLORS.parchmentDark}` }}
        >
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(59,75,107,0.12)" }}>
            <QuranIcon color={COLORS.indigo} size={20} />
          </div>
          <div>
            <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
              {currentLanguage === "en"
                ? `${pagesToday} page${pagesToday > 1 ? "s" : ""} read`
                : currentLanguage === "ar"
                ? `${pagesToday} صفحة مقروءة`
                : `${pagesToday} page${pagesToday > 1 ? "s" : ""} lue${pagesToday > 1 ? "s" : ""}`}
            </p>
            <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11 }}>
              {currentLanguage === "en"
                ? `Quran progress${isToday ? ", today" : ""}`
                : currentLanguage === "ar"
                ? `التقدم في القرآن${isToday ? "، اليوم" : ""}`
                : `Progression dans le Coran${isToday ? ", aujourd'hui" : ""}`}
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-3"
          style={{ background: COLORS.parchment, borderRadius: 16, padding: "10px 14px", border: `1px solid ${COLORS.parchmentDark}` }}
        >
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 38, height: 38, borderRadius: 12, background: `${COLORS.goldLight}24` }}>
            <FlameIcon color={streak > 0 ? COLORS.goldLight : inkA(0.35)} size={20} />
          </div>
          <div>
            <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
              {currentLanguage === "en"
                ? `${streak} day${streak > 1 ? "s" : ""} in a row`
                : currentLanguage === "ar"
                ? `${streak} يوم متتالٍ`
                : `${streak} jour${streak > 1 ? "s" : ""} d'affilée`}
            </p>
            <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11 }}>
              {t("streak_sublabel")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar — Gregorian month grid with the Hijri day under each cell   */
/* ------------------------------------------------------------------ */
function HijriCalendarScreen({ onBack }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = Monday

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const isToday = (d) => d && d.toDateString() === today.toDateString();

  const goMonth = (delta) => setViewDate(new Date(year, month + delta, 1));
  const goToday = () => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-10 fade-in">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("title_calendar")}
        </p>
        <button onClick={goToday} className="p-2.5 -mr-2 active:opacity-60" aria-label={t("today")}>
          <CategoryIcon type="moon" color={COLORS.goldLight} size={18} />
        </button>
      </div>

      <div className="flex items-center justify-between mb-1 px-1">
        <button onClick={() => goMonth(-1)} className="p-2 active:opacity-60" aria-label={t("nav_previous")}>
          <ChevronIcon dir="left" color={COLORS.ink} />
        </button>
        <div className="text-center">
          <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 16 }}>
            {getGregorianMonthYearLabel(viewDate)}
          </p>
          <p className="font-ui" style={{ color: COLORS.goldLight, fontSize: 11.5, marginTop: 1 }}>
            {getHijriMonthYearLabel(viewDate)}
          </p>
        </div>
        <button onClick={() => goMonth(1)} className="p-2 active:opacity-60" aria-label={t("nav_next")}>
          <ChevronIcon dir="right" color={COLORS.ink} />
        </button>
      </div>

      <div
        className="mt-4"
        style={{
          background: COLORS.parchment,
          borderRadius: 20,
          border: `1px solid ${COLORS.parchmentDark}`,
          padding: "16px 12px",
        }}
      >
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekdayLabels().map((w, i) => (
            <p key={i} className="font-ui text-center" style={{ color: COLORS.inkSoft, fontSize: 10, opacity: 0.6 }}>
              {w}
            </p>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) =>
            d ? (
              <div
                key={i}
                className="flex flex-col items-center justify-center"
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: 10,
                  background: isToday(d) ? COLORS.goldLight : "transparent",
                }}
              >
                <span
                  className="font-ui font-semibold"
                  style={{ color: isToday(d) ? COLORS.bg : COLORS.ink, fontSize: 13 }}
                >
                  {d.getDate()}
                </span>
                <span
                  className="font-ui"
                  style={{ color: isToday(d) ? COLORS.bg : COLORS.inkSoft, fontSize: 9, opacity: isToday(d) ? 0.85 : 0.7 }}
                >
                  {getHijriDay(d)}
                </span>
              </div>
            ) : (
              <div key={i} />
            )
          )}
        </div>
      </div>

      <p className="font-ui text-center mt-6" style={{ color: COLORS.inkSoft, fontSize: 11, lineHeight: 1.6 }}>
        {t("hijri_footnote")}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Free tasbih                                                          */
/* ------------------------------------------------------------------ */
const TASBIH_KEY = "azkar-tasbih-v1";
const TASBIH_DAILY_KEY = "azkar-tasbih-daily-v1";
const TASBIH_FINGER_TIP_KEY = "azkar-tasbih-finger-tip-seen-v1";
const TASBIH_PHRASES = [
  {
    id: "subhanallahi-bihamdihi",
    short: "Subhanallahi wa bihamdihi",
    arabic: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ",
    translation: "Gloire et pureté à Allah, et louange à Lui.",
    translation_en: "How perfect Allah is and I praise Him.",
    merit:
      "Deux paroles légères sur la langue, lourdes dans la balance des bonnes actions et aimées du Tout Miséricordieux. Rapporté par al-Bukhari et Muslim.",
  },
  {
    id: "subhanallah",
    short: "Subhanallah",
    arabic: "سُبْحَانَ اللَّهِ",
    translation: "Gloire à Allah.",
    translation_en: "How perfect Allah is.",
    merit:
      "Fait partie des quatre paroles les plus aimées d'Allah, avec Alhamdulillah, Lā ilāha illallāh et Allahu Akbar. Rapporté par Muslim.",
  },
  {
    id: "alhamdulillah",
    short: "Alhamdulillah",
    arabic: "الْحَمْدُ لِلَّهِ",
    translation: "La louange est à Allah.",
    translation_en: "All praise is due to Allah.",
    merit:
      "Le Prophète ﷺ a enseigné que cette parole remplit la balance des bonnes actions le Jour du Jugement. Rapporté par Muslim.",
  },
  {
    id: "allahuakbar",
    short: "Allahu Akbar",
    arabic: "اللَّهُ أَكْبَرُ",
    translation: "Allah est le plus Grand.",
    translation_en: "Allah is the greatest.",
    merit:
      "L'une des quatre paroles les plus aimées d'Allah parmi tout ce qui peut être dit. Rapporté par Muslim.",
  },
  {
    id: "lailaha",
    short: "Lā ilāha illallāh",
    arabic: "لَا إِلَٰهَ إِلَّا اللَّهُ",
    translation: "Il n'y a de divinité qu'Allah.",
    translation_en: "None has the right to be worshipped except Allah.",
    merit:
      "La meilleure invocation, selon le Prophète ﷺ, est celle qu'il a lui-même prononcée ainsi que les prophètes avant lui : Lā ilāha illallāh. Rapporté par at-Tirmidhi.",
  },
  {
    id: "tahlil-mulk",
    short: "Lā ilāha illallāh wahdahu…",
    arabic: "لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
    translation:
      "Il n'y a de divinité qu'Allah, Seul, sans associé. À Lui le règne, à Lui la louange, et Il est capable de toute chose.",
    translation_en:
      "None has the right to be worshipped except Allah, alone, without partner, to Him belongs all sovereignty and praise, and He is over all things omnipotent.",
    merit:
      "Celui qui la répète cent fois par jour obtient une récompense équivalente à l'affranchissement de dix esclaves, cent bonnes actions sont inscrites, cent péchés effacés, et il est protégé du diable ce jour-là. Rapporté par al-Bukhari et Muslim.",
  },
  {
    id: "hawla-quwwata",
    short: "Lā hawla wa lā quwwata…",
    arabic: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ",
    translation: "Il n'y a de force ni de puissance qu'en Allah.",
    translation_en: "There is no power and no strength except with Allah.",
    merit: "Le Prophète ﷺ l'a désignée comme un trésor parmi les trésors du Paradis. Rapporté par al-Bukhari et Muslim.",
  },
  {
    id: "astaghfirullah",
    short: "Astaghfirullah",
    arabic: "أَسْتَغْفِرُ اللَّهَ",
    translation: "Je demande pardon à Allah.",
    translation_en: "I seek the forgiveness of Allah.",
    merit:
      "Le Prophète ﷺ, pourtant préservé du péché, demandait pardon à Allah plus de soixante-dix fois par jour. Rapporté par al-Bukhari.",
  },
  {
    id: "salawat",
    short: "Salawat sur le Prophète",
    short_en: "Salawat upon the Prophet",
    short_ar: "الصلاة على النبي",
    arabic: "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ",
    translation: "Ô Allah, prie sur Muhammad.",
    translation_en: "O Allah, send prayers upon Muhammad.",
    merit:
      "Quiconque prie une fois sur le Prophète ﷺ, Allah prie dix fois sur lui en retour. Rapporté par Muslim.",
  },
  {
    id: "hasbunallah",
    short: "Hasbunallahu wa ni'mal wakīl",
    arabic: "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ",
    translation: "Allah nous suffit, et quel excellent garant Il est.",
    translation_en: "Allah is sufficient for us, and He is the best disposer of affairs.",
    merit:
      "Parole prononcée par Ibrahim lorsqu'il fut jeté dans le feu, et par les croyants face à leurs ennemis. Rapportée dans le Coran, sourate Āl 'Imrān, verset 173.",
  },
  {
    id: "subhanallahiladhim",
    short: "Subhanallahi-l-'Adhīm…",
    arabic: "سُبْحَانَ اللَّهِ الْعَظِيمِ وَبِحَمْدِهِ",
    translation: "Gloire à Allah l'Immense, et louange à Lui.",
    translation_en: "How perfect Allah, the Almighty, is, and I praise Him.",
    merit: "Celui qui la répète souvent voit un palmier planté pour lui au Paradis. Rapporté par at-Tirmidhi.",
  },
  {
    id: "afuwwun",
    short: "Allahumma innaka 'afuwwun…",
    arabic: "اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي",
    translation: "Ô Allah, Tu es Celui qui pardonne et Tu aimes le pardon, pardonne-moi.",
    translation_en: "O Allah, You are Most Forgiving, and You love forgiveness, so forgive me.",
    merit:
      "Le Prophète ﷺ a enseigné cette invocation à 'Ā'icha pour la Nuit du Destin, mais elle peut être dite à tout moment. Rapporté par at-Tirmidhi.",
  },
  {
    id: "dhunnun",
    short: "Invocation de Yūnus",
    short_en: "Invocation of Yunus",
    short_ar: "دعاء يونس",
    arabic: "لَا إِلَٰهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ",
    translation: "Il n'y a de divinité que Toi, gloire à Toi, j'ai été du nombre des injustes.",
    translation_en: "There is no deity except You; exalted are You. Indeed, I have been of the wrongdoers.",
    merit:
      "L'invocation par laquelle le prophète Yūnus fut délivré du ventre de la baleine. Le Prophète ﷺ a dit qu'aucun musulman ne l'invoque pour une affliction sans qu'Allah ne la lui dissipe. Rapporté par at-Tirmidhi.",
  },
  {
    id: "akbarukabiran",
    short: "Allahu akbaru kabīran…",
    arabic: "اللَّهُ أَكْبَرُ كَبِيرًا، وَالْحَمْدُ لِلَّهِ كَثِيرًا، وَسُبْحَانَ اللَّهِ بُكْرَةً وَأَصِيلًا",
    translation: "Allah est le plus Grand, immensément grand. Louange à Allah, abondamment. Gloire à Allah, matin et soir.",
    translation_en:
      "Allah is the Greatest, greatly. All praise is due to Allah, abundantly. And how perfect Allah is, morning and evening.",
    merit:
      "Le Prophète ﷺ a demandé qui avait prononcé ces mots tant ils lui avaient plu : douze anges se sont empressés de les faire monter au ciel. Rapporté par Muslim.",
  },
  {
    id: "rabbighfirli",
    short: "Rabbi ighfir lī",
    arabic: "رَبِّ اغْفِرْ لِي",
    translation: "Seigneur, pardonne-moi.",
    translation_en: "My Lord, forgive me.",
    merit: "Une demande de pardon simple et directe, que le Prophète ﷺ répétait entre les deux prosternations de la prière.",
  },
];

function FingerCountingTip({ onClose }) {
  return (
    <div className="fixed inset-0 flex items-end justify-center fade-in" style={{ background: "rgba(0,0,0,0.5)", zIndex: 60 }}>
      <div
        className="w-full px-6 pt-7 text-center"
        style={{
          background: COLORS.bg,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
          maxWidth: 480,
        }}
      >
        <span style={{ fontSize: 34 }}>🤲</span>
        <h2 className="font-display" style={{ color: COLORS.ink, fontSize: 18, marginTop: 10 }}>
          {t("finger_tip_title")}
        </h2>
        <p className="font-ui mt-2.5" style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.7 }}>
          {t("finger_tip_body")}
        </p>
        <div
          style={{ background: inkA(0.05), border: `1px solid ${inkA(0.12)}`, borderRadius: 14, padding: "12px 14px", marginTop: 14 }}
        >
          <p dir="rtl" className="font-arabic" style={{ color: COLORS.ink, fontSize: 17, lineHeight: 1.9 }}>
            اعْقِدْنَ بِالْأَنَامِلِ فَإِنَّهُنَّ مَسْئُولَاتٌ مُسْتَنْطَقَاتٌ
          </p>
          <p className="font-ui mt-2" style={{ color: COLORS.inkSoft, fontSize: 12, lineHeight: 1.6 }}>
            {t("finger_tip_quote")}
          </p>
          <p className="font-ui mt-1.5" style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>
            {t("finger_tip_source")}
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full active:scale-[0.98] transition"
          style={{ background: COLORS.goldLight, color: COLORS.bg, padding: "13px 20px", borderRadius: 14, fontWeight: 700, fontSize: 14 }}
        >
          {t("done_button")}
        </button>
      </div>
    </div>
  );
}

function TasbihScreen({ arabicSize }) {
  const [counts, setCounts] = useState({}); // { [phraseId]: number } — each phrase keeps its own tally
  const [phraseId, setPhraseId] = useState(TASBIH_PHRASES[0].id);
  const [loaded, setLoaded] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [showFingerTip, setShowFingerTip] = useState(false);
  const pulseTimer = useRef(null);

  // Shown once automatically, then reachable anytime via the info button —
  // a reminder that counting on the finger joints is the way the Prophet ﷺ
  // taught, not just a modern convenience of tapping a screen.
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(TASBIH_FINGER_TIP_KEY, false);
        if (!res || res.value !== "1") {
          setShowFingerTip(true);
          window.storage.set(TASBIH_FINGER_TIP_KEY, "1", false).catch(() => {});
        }
      } catch (e) {
        setShowFingerTip(true);
      }
    })();
  }, []);

  // The counter shown here is today's tally, not a lifetime total (that's
  // what the Bilan's running streak is for) — so a stored count only loads
  // if it was saved today; anything from a previous day starts back at 0,
  // both on a fresh app launch and when the app is resumed after midnight
  // without ever having been closed.
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(TASBIH_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.date === todayKey()) {
            // Migrate the old single-counter shape ({count, phraseId}) transparently
            if (parsed.counts) {
              setCounts(parsed.counts);
            } else if (typeof parsed.count === "number" && parsed.phraseId) {
              setCounts({ [parsed.phraseId]: parsed.count });
            }
          }
          setPhraseId(parsed.phraseId || TASBIH_PHRASES[0].id);
        }
      } catch (e) {
        // no stored tasbih yet — start fresh
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    const sub = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      window.storage
        .get(TASBIH_KEY, false)
        .then((res) => {
          if (!res || !res.value) return;
          const parsed = JSON.parse(res.value);
          if (parsed.date !== todayKey()) setCounts({});
        })
        .catch(() => {});
    });
    return () => {
      sub.then((h) => h.remove()).catch(() => {});
    };
  }, []);

  const persistTasbih = useCallback(async (nextCounts, nextPhraseId) => {
    try {
      await window.storage.set(TASBIH_KEY, JSON.stringify({ date: todayKey(), counts: nextCounts, phraseId: nextPhraseId }), false);
    } catch (e) {
      // ignore storage failures — counter still works in-memory
    }
  }, []);

  // Same-shape daily log as the azkar history — used by the dashboard tab
  const [dailyLog, setDailyLog] = useState({});
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(TASBIH_DAILY_KEY, false);
        if (res && res.value) setDailyLog(JSON.parse(res.value));
      } catch (e) {
        // no daily log yet
      }
    })();
  }, []);
  const logDailyTap = () => {
    const today = todayKey();
    setDailyLog((prev) => {
      const next = { ...prev, [today]: (prev[today] || 0) + 1 };
      window.storage.set(TASBIH_DAILY_KEY, JSON.stringify(next), false).catch(() => {});
      return next;
    });
  };

  const phrase = TASBIH_PHRASES.find((p) => p.id === phraseId) || TASBIH_PHRASES[0];
  const count = counts[phraseId] || 0;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const handleTap = () => {
    tapHaptic();
    setCounts((prev) => {
      const next = { ...prev, [phraseId]: (prev[phraseId] || 0) + 1 };
      persistTasbih(next, phraseId);
      return next;
    });
    logDailyTap();
    setPulse(true);
    clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulse(false), 280);
  };

  const handleReset = () => {
    setCounts((prev) => {
      const next = { ...prev, [phraseId]: 0 };
      persistTasbih(next, phraseId);
      return next;
    });
  };

  const index = TASBIH_PHRASES.findIndex((p) => p.id === phraseId);

  const goToIndex = (i) => {
    const id = TASBIH_PHRASES[i].id;
    setPhraseId(id);
    persistTasbih(counts, id);
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="font-ui" style={{ color: COLORS.ink, opacity: 0.7 }}>
          {t("loading")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-5 pt-6 fade-in" style={{ height: "100vh" }}>
      {showFingerTip && <FingerCountingTip onClose={() => setShowFingerTip(false)} />}

      <div className="flex items-center justify-between mb-3" style={{ flexShrink: 0 }}>
        <button onClick={() => setShowFingerTip(true)} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("finger_tip")}>
          <InfoIcon color={COLORS.inkSoft} size={18} />
        </button>
        <button onClick={handleReset} className="p-2.5 -mr-2 active:opacity-60" aria-label={t("reset_formula")}>
          <ResetIcon color={COLORS.ink} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2">
          <span className="font-arabic" style={{ color: COLORS.goldLight, fontSize: 22, letterSpacing: 0.5 }}>
            التسبيح
          </span>
          <span className="font-display" style={{ color: COLORS.ink, fontSize: 17 }}>
            {t("title_tasbih")}
          </span>
        </div>
        {total > 0 && (
          <p className="font-ui mt-1" style={{ color: COLORS.inkSoft, fontSize: 11.5 }}>
            {currentLanguage === "en"
              ? `${total} dhikr recited in total`
              : currentLanguage === "ar"
              ? `${total} ذكر تم ترديده بالإجمال`
              : `${total} dhikr récité${total > 1 ? "s" : ""} au total`}
          </p>
        )}
      </div>

      {/* Named chips — every phrase stays visible up front so you pick by
          name rather than blindly stepping through unlabeled dots */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: "none" }}>
        {TASBIH_PHRASES.map((p, i) => {
          const active = i === index;
          const pCount = counts[p.id] || 0;
          return (
            <button
              key={p.id}
              onClick={() => goToIndex(i)}
              className="flex-shrink-0 active:opacity-70 flex items-center gap-1.5"
              style={{
                background: active ? COLORS.goldLight : inkA(0.08),
                border: `1px solid ${active ? COLORS.goldLight : inkA(0.2)}`,
                borderRadius: 99,
                padding: "7px 14px",
              }}
            >
              <span className="font-ui font-semibold" style={{ fontSize: 12.5, color: COLORS.ink, whiteSpace: "nowrap" }}>
                {localField(p, "short")}
              </span>
              {pCount > 0 && (
                <span
                  className="font-ui font-semibold"
                  style={{
                    fontSize: 10.5,
                    color: active ? COLORS.bg : COLORS.inkSoft,
                    background: active ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.06)",
                    borderRadius: 99,
                    padding: "1px 6px",
                  }}
                >
                  {pCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
          style={{
            width: "100%",
            background: COLORS.parchment,
            borderRadius: 20,
            padding: "18px 20px",
            border: `1px solid ${COLORS.parchmentDark}`,
          }}
        >
          <p className="font-ui font-semibold text-center" style={{ color: COLORS.goldLight, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" }}>
            {localField(phrase, "short")}
          </p>
          <p dir="rtl" className="font-arabic text-right mt-3" style={{ color: COLORS.ink, fontSize: arabicSize || ARABIC_SIZES.md, lineHeight: 1.7 }}>
            {phrase.arabic}
          </p>
          {currentLanguage !== "ar" && (
            <>
              <div style={{ height: 1, background: COLORS.parchmentDark, margin: "12px 0" }} />
              <p className="font-display" style={{ color: COLORS.inkSoft, fontSize: 13.5, fontStyle: "italic" }}>
                {trField(phrase, "translation")}
              </p>
            </>
          )}
          {currentLanguage !== "ar" && (
            <div className="flex items-start gap-2 mt-3" style={{ paddingTop: 10, borderTop: `1px dashed ${COLORS.parchmentDark}` }}>
              <MeritIcon color={COLORS.gold} />
              <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 12, lineHeight: 1.55 }}>
                {trField(phrase, "merit")}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center pt-5 pb-6" style={{ flexShrink: 0 }}>
        <button onClick={handleTap} className="flex flex-col items-center gap-3" style={{ touchAction: "manipulation" }}>
          <TasbihButton count={count} pulse={pulse} />
          <span className="font-ui" style={{ color: COLORS.ink, fontSize: 12, opacity: 0.75 }}>
            {t("tap_to_count_unlimited")}
          </span>
        </button>

      <div className="flex items-center justify-between w-full mt-6 px-2">
        <button
          onClick={() => index > 0 && goToIndex(index - 1)}
          disabled={index === 0}
          className="p-3 rounded-full active:opacity-60"
          style={{ opacity: index === 0 ? 0.25 : 1 }}
          aria-label={t("nav_previous")}
        >
          <ChevronIcon dir="left" color={COLORS.ink} />
        </button>
        <p className="font-ui" style={{ color: COLORS.ink, fontSize: 12, opacity: 0.7 }}>
          {index + 1} / {TASBIH_PHRASES.length}
        </p>
        <button
          onClick={() => index < TASBIH_PHRASES.length - 1 && goToIndex(index + 1)}
          disabled={index === TASBIH_PHRASES.length - 1}
          className="p-3 rounded-full active:opacity-60"
          style={{ opacity: index === TASBIH_PHRASES.length - 1 ? 0.25 : 1 }}
          aria-label={t("nav_next")}
        >
          <ChevronIcon dir="right" color={COLORS.ink} />
        </button>
      </div>
      </div>
    </div>
  );
}

// A real misbaha (prayer beads) loops every 33 beads — the ring mirrors that:
// it fills over one lap of 33 taps, then resets while the raw total below
// keeps climbing, so the count stays visibly tied to the physical object
// it stands in for instead of being an arbitrary progress bar.
// A misbaha rendered as a ring of beads with a single bead lit at a time —
// each tap slides the highlight to the next one, exactly like pushing a
// real bead around the string with your thumb. Nothing ever "fills up" or
// completes, so there's no implied goal: the only real count is the number
// in the middle, which keeps climbing with no ceiling.
function TasbihButton({ count, pulse }) {
  const size = 200;
  const beadCount = 33;
  const beadR = 6.5;
  const center = size / 2;
  const ringR = center - beadR - 6;
  const activeIndex = count === 0 ? -1 : (count - 1) % beadCount;

  return (
    <div
      className={`relative flex items-center justify-center ${pulse ? "bead-pulse" : ""}`}
      style={{ width: size, height: size, position: "relative" }}
    >
      <div style={{ position: "absolute", inset: -14, borderRadius: "50%", background: discGlowBackground() }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", ...discSurfaceStyle() }} />
      <svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0 }}>
        {Array.from({ length: beadCount }).map((_, i) => {
          const angle = (i / beadCount) * 2 * Math.PI - Math.PI / 2;
          const cx = center + ringR * Math.cos(angle);
          const cy = center + ringR * Math.sin(angle);
          const active = i === activeIndex;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={active ? beadR * 1.3 : beadR * 0.55}
              fill={active ? COLORS.goldLight : "none"}
              stroke={active ? "none" : inkA(0.2)}
              strokeWidth={active ? 0 : 1.3}
              style={{ transition: "cx 0.2s ease, cy 0.2s ease, r 0.2s ease, fill 0.2s ease" }}
            />
          );
        })}
      </svg>
      <div className="flex flex-col items-center justify-center" style={{ position: "relative" }}>
        <span className="font-ui font-semibold" style={{ fontSize: 44, color: COLORS.ink, lineHeight: 1 }}>
          {count}
        </span>
        <span className="font-ui" style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 6 }}>
          {count > 1 ? t("recited_word_plural") : t("recited_word")}
        </span>
      </div>
    </div>
  );
}

function MeritIcon({ color, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <path
        d="M12 2 14.4 8.6 21.5 9 16 13.4 17.8 20.5 12 16.6 6.2 20.5 8 13.4 2.5 9 9.6 8.6 12 2Z"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill={color}
        fillOpacity="0.18"
      />
    </svg>
  );
}

// Preloads every printed Mushaf page (word data + its dedicated QCF font)
// into the same caches MushafPageView reads from, so the whole Coran becomes
// readable with no connection. Idempotent — already-cached pages are skipped
// automatically by fetchMushafPage/loadMushafPageFont, so re-running is safe.
function OfflineQuranDownloadRow() {
  const [state, setState] = useState("idle"); // 'idle' | 'downloading' | 'done' | 'error'
  const [progress, setProgress] = useState(0);
  const cancelRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(QURAN_OFFLINE_FLAG_KEY, false);
        if (res && res.value === "true") setState("done");
      } catch (e) {
        // not downloaded yet
      }
    })();
  }, []);

  const startDownload = async () => {
    cancelRef.current = false;
    setState("downloading");
    setProgress(0);
    const batchSize = 6;
    let done = 0;
    let hadError = false;
    for (let start = 1; start <= QURAN_TOTAL_PAGES; start += batchSize) {
      if (cancelRef.current) {
        setState("idle");
        return;
      }
      const pages = [];
      for (let p = start; p < start + batchSize && p <= QURAN_TOTAL_PAGES; p++) pages.push(p);
      await Promise.all(
        pages.map((p) =>
          Promise.all([fetchMushafPage(p), loadMushafPageFont(p)]).catch(() => {
            hadError = true;
          })
        )
      );
      done += pages.length;
      setProgress(done);
      await new Promise((r) => setTimeout(r, 250));
    }
    if (cancelRef.current) {
      setState("idle");
      return;
    }
    setState(hadError ? "error" : "done");
    if (!hadError) {
      try {
        await window.storage.set(QURAN_OFFLINE_FLAG_KEY, "true", false);
      } catch (e) {
        // non-critical
      }
    }
  };

  return (
    <div style={{ background: inkA(0.05), border: `1px solid ${inkA(0.14)}`, borderRadius: 12, padding: "12px 14px" }}>
      <div className="flex items-center justify-between">
        <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 13 }}>
          {t("quran_offline")}
        </span>
        {state === "done" && (
          <span className="font-ui" style={{ color: COLORS.goldLight, fontSize: 10.5 }}>
            {t("downloaded_check")}
          </span>
        )}
      </div>
      <p className="font-ui mt-1" style={{ color: COLORS.inkSoft, fontSize: 11, lineHeight: 1.5 }}>
        {state === "downloading"
          ? `${t("downloading_progress")} ${progress} / ${QURAN_TOTAL_PAGES} ${t("pages_label")}`
          : state === "error"
          ? t("download_error")
          : t("download_hint")}
      </p>
      {state === "downloading" && (
        <div style={{ height: 5, borderRadius: 99, background: inkA(0.1), marginTop: 8, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${(progress / QURAN_TOTAL_PAGES) * 100}%`,
              background: COLORS.goldLight,
              transition: "width 0.2s ease",
            }}
          />
        </div>
      )}
      <button
        onClick={state === "downloading" ? () => (cancelRef.current = true) : startDownload}
        className="mt-2.5 active:opacity-80"
        style={{
          background: state === "downloading" ? "transparent" : `${COLORS.goldLight}24`,
          borderRadius: 10,
          padding: "6px 12px",
        }}
      >
        <span className="font-ui font-semibold" style={{ color: state === "downloading" ? COLORS.clay : COLORS.goldLight, fontSize: 12 }}>
          {state === "downloading" ? t("cancel") : state === "done" ? t("redownload") : t("download")}
        </span>
      </button>
    </div>
  );
}

// Lets the reader pick once, from Réglages, which reciter plays across the
// whole Coran section — the per-surah picker still works too, but most
// people just want a favorite (a well-known one, Alafasy, is the default)
// applied everywhere without hunting for the reciter screen each time.
function DefaultReciterRow() {
  const [reciter, setReciter] = useState(RECITERS[0].id);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(QURAN_RECITER_KEY, false);
        if (res && res.value) setReciter(res.value);
      } catch (e) {
        // no preference saved yet — Alafasy stays the default
      }
    })();
  }, []);

  const handleSelect = (id) => {
    setReciter(id);
    window.storage.set(QURAN_RECITER_KEY, id, false).catch(() => {});
  };

  const popular = RECITERS.filter((r) => POPULAR_RECITER_IDS.includes(r.id));

  return (
    <div className="flex flex-col gap-2">
      {popular.map((r) => {
        const active = r.id === reciter;
        return (
          <button
            key={r.id}
            onClick={() => handleSelect(r.id)}
            className="flex items-center gap-3 active:scale-[0.98] transition"
            style={{
              background: COLORS.parchment,
              border: `1px solid ${active ? COLORS.goldLight : COLORS.parchmentDark}`,
              borderRadius: 14,
              padding: "9px 12px",
              textAlign: "left",
            }}
          >
            <ReciterAvatar reciter={r} size={36} fontSize={12} />
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 13 }}>
                {r.name}
              </p>
              <p dir="rtl" className="font-arabic" style={{ color: COLORS.inkSoft, fontSize: 11 }}>
                {r.arabicName}
              </p>
            </div>
            {active && <CheckIcon color={COLORS.goldLight} size={18} />}
          </button>
        );
      })}
      <p className="font-ui text-center mt-1" style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 1.5 }}>
        {t("reciter_applies_hint")}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */
function SettingsScreen({
  arabicSize,
  onSetArabicSize,
  prayerSettings,
  onSetPrayerMethod,
  onSetCustomAngle,
  onSetCustomOffset,
  onSetIqamaOffset,
  onSetMuezzin,
  onUseMyLocation,
  onResetLocation,
  locationStatus,
  onToggleNotifications,
  notificationStatus,
  themePreference,
  onSetThemePreference,
  onResetToday,
  accentTheme,
  onSetAccentTheme,
  hapticsEnabled,
  onToggleHaptics,
  onFactoryReset,
  onOpenPrivacy,
  onReplayOnboarding,
  language,
  languagePref,
  onSetLanguage,
}) {
  const location = prayerSettings.location || DEFAULT_LOCATION;
  const isCustomMethod = prayerSettings.method === "custom";
  const [backupStatus, setBackupStatus] = useState(null); // { type: 'success'|'error', message }
  const [resetDone, setResetDone] = useState(false);
  const [expanded, setExpanded] = useState(null); // which accordion section is open, if any
  const [confirmingFactoryReset, setConfirmingFactoryReset] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const importInputRef = useRef(null);

  const toggleSection = (id) => setExpanded((prev) => (prev === id ? null : id));

  // Quick confirmation flash for settings that save silently in the
  // background (theme, angles, offsets, method…) so every tap gives visible
  // proof the change actually took, not just a UI highlight moving.
  const flashToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  const handleResetTodayClick = () => {
    onResetToday();
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2500);
  };

  const handleExport = async () => {
    try {
      const json = await exportBackup();
      downloadBackupFile(json);
      setBackupStatus({ type: "success", message: t("backup_downloaded") });
    } catch (e) {
      setBackupStatus({ type: "error", message: t("export_failed") });
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      await importBackup(text);
      setBackupStatus({ type: "success", message: t("backup_restored") });
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setBackupStatus({ type: "error", message: err.message || t("invalid_file") });
    }
  };

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-28 fade-in">
      {toast && (
        <div
          className="fixed flex items-center gap-2 fade-in"
          style={{
            left: "50%",
            bottom: 96,
            transform: "translateX(-50%)",
            background: COLORS.ink,
            borderRadius: 99,
            padding: "9px 16px",
            zIndex: 70,
            boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
          }}
        >
          <CheckIcon color={COLORS.goldLight} size={15} />
          <span className="font-ui font-semibold" style={{ color: COLORS.bg, fontSize: 12.5 }}>
            {toast}
          </span>
        </div>
      )}

      <div className="text-center mb-5">
        <div className="flex items-center justify-center gap-2">
          <span className="font-arabic" style={{ color: COLORS.goldLight, fontSize: 22, letterSpacing: 0.5 }}>
            الإعدادات
          </span>
          <span className="font-display" style={{ color: COLORS.ink, fontSize: 17 }}>
            {t("title_settings")}
          </span>
        </div>
      </div>

      {/* Appearance */}
      <SettingsAccordionItem
        id="apparence"
        icon={<CategoryIcon type={currentTheme === "dark" ? "moon" : "sun"} color={COLORS.gold} size={17} />}
        title={t("settings_appearance")}
        expanded={expanded === "apparence"}
        onToggle={() => toggleSection("apparence")}
      >
        <div className="flex gap-2">
          {[
            { key: "system", label: t("theme_system") },
            { key: "light", label: t("theme_light") },
            { key: "dark", label: t("theme_dark") },
          ].map(({ key, label }) => {
            const active = themePreference === key;
            return (
              <button
                key={key}
                onClick={() => {
                  onSetThemePreference(key);
                  flashToast("✓");
                }}
                className="flex-1 active:opacity-80"
                style={{
                  background: active ? `${COLORS.goldLight}29` : inkA(0.05),
                  border: `1px solid ${active ? COLORS.goldLight : inkA(0.14)}`,
                  borderRadius: 12,
                  padding: "10px 8px",
                }}
              >
                <span className="font-ui font-semibold" style={{ color: active ? COLORS.goldLight : COLORS.ink, fontSize: 13 }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <p className="font-ui font-semibold mt-4 mb-2" style={{ color: COLORS.inkSoft, fontSize: 11, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {t("accent_color")}
        </p>
        <div className="grid grid-cols-5 gap-2">
          {Object.keys(ACCENT_PALETTES).map((key) => {
            const active = accentTheme === key;
            const swatch = ACCENT_PALETTES[key][currentTheme === "dark" ? "dark" : "light"].goldLight;
            return (
              <button
                key={key}
                onClick={() => {
                  onSetAccentTheme(key);
                  flashToast("✓");
                }}
                className="flex flex-col items-center gap-1.5 active:opacity-80"
                style={{
                  background: active ? `${COLORS.goldLight}1F` : inkA(0.05),
                  border: `1px solid ${active ? swatch : inkA(0.14)}`,
                  borderRadius: 12,
                  padding: "10px 6px",
                }}
              >
                <div style={{ width: 20, height: 20, borderRadius: 99, background: swatch }} />
                <span className="font-ui" style={{ color: active ? COLORS.ink : COLORS.inkSoft, fontSize: 10.5, fontWeight: active ? 700 : 500 }}>
                  {accentLabels()[key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-4" style={{ background: inkA(0.05), border: `1px solid ${inkA(0.14)}`, borderRadius: 12, padding: "11px 14px" }}>
          <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 13 }}>
            {t("haptics_label")}
          </span>
          <button
            onClick={() => {
              onToggleHaptics(!hapticsEnabled);
              flashToast(!hapticsEnabled ? t("haptics_on") : t("haptics_off"));
            }}
            style={{
              width: 42,
              height: 24,
              borderRadius: 99,
              background: hapticsEnabled ? COLORS.goldLight : inkA(0.2),
              position: "relative",
              flexShrink: 0,
              transition: "background 0.15s ease",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 2,
                left: hapticsEnabled ? 20 : 2,
                width: 20,
                height: 20,
                borderRadius: 99,
                background: "#fff",
                transition: "left 0.15s ease",
              }}
            />
          </button>
        </div>
      </SettingsAccordionItem>

      {/* Language — covers UI chrome, azkar/invocation content, and dynamic
          Quran translations. Arabic mode shows the original text only. */}
      <SettingsAccordionItem
        id="langue"
        icon={<GlobeIcon color={COLORS.gold} size={16} />}
        title={t("settings_language")}
        expanded={expanded === "langue"}
        onToggle={() => toggleSection("langue")}
      >
        <div className="flex flex-col gap-2">
          {[{ id: "system", label: t("lang_system") }, ...LANGUAGES].map((l) => {
            const active = languagePref === l.id;
            return (
              <button
                key={l.id}
                onClick={() => {
                  onSetLanguage(l.id);
                  flashToast("✓");
                }}
                className="flex items-center justify-between active:opacity-80"
                style={{
                  background: active ? `${COLORS.goldLight}29` : inkA(0.05),
                  border: `1px solid ${active ? COLORS.goldLight : inkA(0.14)}`,
                  borderRadius: 12,
                  padding: "11px 14px",
                  textAlign: "left",
                }}
              >
                <span className="font-ui font-semibold" style={{ color: active ? COLORS.goldLight : COLORS.ink, fontSize: 13.5 }}>
                  {l.label}
                </span>
                {active && <CheckIcon color={COLORS.goldLight} size={16} />}
              </button>
            );
          })}
        </div>
        <p className="font-ui text-center mt-3" style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 1.5 }}>
          {t("lang_footnote")}
        </p>
      </SettingsAccordionItem>

      {/* Arabic text size */}
      <SettingsAccordionItem
        id="taille"
        icon={<span className="font-arabic" style={{ color: COLORS.gold, fontSize: 16 }}>أ</span>}
        title={t("settings_text_size")}
        expanded={expanded === "taille"}
        onToggle={() => toggleSection("taille")}
      >
        <div
          style={{ background: "rgba(0,0,0,0.03)", borderRadius: 14, padding: "16px 16px", marginBottom: 12 }}
        >
          <p
            dir="rtl"
            className="font-arabic text-right"
            style={{ color: COLORS.ink, fontSize: ARABIC_SIZES[arabicSize], lineHeight: 1.8, transition: "font-size 0.2s ease" }}
          >
            سُبْحَانَ اللَّهِ وَبِحَمْدِهِ
          </p>
          <div style={{ height: 1, background: COLORS.parchmentDark, margin: "12px 0" }} />
          <p className="font-display" style={{ color: COLORS.inkSoft, fontSize: 13, fontStyle: "italic" }}>
            {t("text_size_preview_translation")}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {Object.keys(ARABIC_SIZES).map((key) => {
            const active = key === arabicSize;
            return (
              <button
                key={key}
                onClick={() => {
                  onSetArabicSize(key);
                  flashToast("✓");
                }}
                className="flex items-center justify-between active:opacity-80"
                style={{
                  background: active ? `${COLORS.goldLight}29` : inkA(0.05),
                  border: `1px solid ${active ? COLORS.goldLight : inkA(0.14)}`,
                  borderRadius: 12,
                  padding: "11px 14px",
                }}
              >
                <span className="font-ui font-semibold" style={{ color: active ? COLORS.goldLight : COLORS.ink, fontSize: 13.5 }}>
                  {arabicSizeLabels()[key]}
                </span>
                <span className="font-arabic" style={{ color: active ? COLORS.goldLight : inkA(0.7), fontSize: 15 }}>
                  أ
                </span>
              </button>
            );
          })}
        </div>
        <p className="font-ui text-center mt-3" style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 1.5 }}>
          {t("text_size_applies_to")}
        </p>
      </SettingsAccordionItem>

      {/* Notifications */}
      <SettingsAccordionItem
        id="notifications"
        icon={<BellIcon color={COLORS.gold} size={16} />}
        title={t("settings_notifications")}
        expanded={expanded === "notifications"}
        onToggle={() => toggleSection("notifications")}
      >
        <button
          onClick={() => onToggleNotifications(!prayerSettings.notificationsEnabled)}
          disabled={notificationStatus === "requesting"}
          className="w-full flex items-center justify-between active:opacity-80"
          style={{
            background: prayerSettings.notificationsEnabled ? `${COLORS.goldLight}29` : inkA(0.05),
            border: `1px solid ${prayerSettings.notificationsEnabled ? COLORS.goldLight : inkA(0.14)}`,
            borderRadius: 12,
            padding: "12px 14px",
          }}
        >
          <div className="text-left">
            <p
              className="font-ui font-semibold"
              style={{ color: prayerSettings.notificationsEnabled ? COLORS.goldLight : COLORS.ink, fontSize: 13.5 }}
            >
              {t("prayer_reminders_label")}
            </p>
            <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 2 }}>
              {notificationStatus === "requesting" ? t("requesting_permission") : t("notification_per_prayer_hint")}
            </p>
          </div>
          <div
            style={{
              width: 42,
              height: 24,
              borderRadius: 99,
              background: prayerSettings.notificationsEnabled ? COLORS.goldLight : inkA(0.2),
              position: "relative",
              flexShrink: 0,
              transition: "background 0.15s ease",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 2,
                left: prayerSettings.notificationsEnabled ? 20 : 2,
                width: 20,
                height: 20,
                borderRadius: 99,
                background: "#fff",
                transition: "left 0.15s ease",
              }}
            />
          </div>
        </button>
        {notificationStatus === "denied" && (
          <p className="font-ui text-center mt-2.5" style={{ color: COLORS.clay, fontSize: 11 }}>
            {t("notif_denied_hint")}
          </p>
        )}
      </SettingsAccordionItem>

      {/* Location */}
      <SettingsAccordionItem
        id="localisation"
        icon={<PinIcon color={COLORS.gold} size={16} />}
        title={t("settings_location")}
        expanded={expanded === "localisation"}
        onToggle={() => toggleSection("localisation")}
      >
        <div style={{ background: "rgba(0,0,0,0.03)", borderRadius: 14, padding: "14px 14px" }}>
          <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
            {location.label}
          </p>
          <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 2 }}>
            {location.source === "geo" ? t("current_position") : t("default_position")}
          </p>
        </div>
        <button
          onClick={onUseMyLocation}
          disabled={locationStatus === "loading"}
          className="w-full active:opacity-80 mt-2.5"
          style={{
            background: `${COLORS.goldLight}29`,
            border: `1px solid ${COLORS.goldLight}`,
            borderRadius: 12,
            padding: "10px 14px",
            opacity: locationStatus === "loading" ? 0.6 : 1,
          }}
        >
          <span className="font-ui font-semibold" style={{ color: COLORS.goldLight, fontSize: 13 }}>
            {locationStatus === "loading" ? t("locating_in_progress") : t("use_my_position")}
          </span>
        </button>
        {locationStatus === "error" && (
          <p className="font-ui text-center mt-2" style={{ color: COLORS.clay, fontSize: 11 }}>
            {t("location_unavailable")}
          </p>
        )}
        {prayerSettings.location && (
          <button onClick={onResetLocation} className="w-full mt-2 active:opacity-70">
            <span className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11.5, textDecoration: "underline" }}>
              {t("back_to")} {DEFAULT_LOCATION.label}
            </span>
          </button>
        )}
      </SettingsAccordionItem>

      {/* Calculation method */}
      <SettingsAccordionItem
        id="methode"
        icon={<ClockIcon color={COLORS.gold} size={16} />}
        title={t("settings_method")}
        expanded={expanded === "methode"}
        onToggle={() => toggleSection("methode")}
      >
        <div style={{ background: `${COLORS.goldLight}1A`, border: `1px solid ${inkA(0.1)}`, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
          <p className="font-ui font-semibold mb-1.5" style={{ color: COLORS.ink, fontSize: 12.5 }}>
            {t("calibrate_mosque_title")}
          </p>
          <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11.5, lineHeight: 1.7 }}>
            {t("calibrate_step1")}
            <br />
            {t("calibrate_step2")}
            <br />
            {t("calibrate_step3")}
            <br />
            {t("calibrate_step4")}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {Object.keys(CALC_METHODS).map((key) => {
            const active = key === prayerSettings.method;
            const m = CALC_METHODS[key];
            return (
              <button
                key={key}
                onClick={() => {
                  onSetPrayerMethod(key);
                  flashToast("✓");
                }}
                className="flex items-center justify-between active:opacity-80"
                style={{
                  background: active ? `${COLORS.goldLight}29` : inkA(0.05),
                  border: `1px solid ${active ? COLORS.goldLight : inkA(0.14)}`,
                  borderRadius: 12,
                  padding: "11px 14px",
                  textAlign: "left",
                }}
              >
                <span className="font-ui font-semibold" style={{ color: active ? COLORS.goldLight : COLORS.ink, fontSize: 13 }}>
                  {trField(m, "label")}
                </span>
                <span className="font-ui" style={{ color: active ? COLORS.goldLight : COLORS.inkSoft, fontSize: 10.5 }}>
                  {key === "custom"
                    ? t("adjustable_label")
                    : m.ishaMinutesAfterMaghrib != null
                    ? `Fajr ${m.fajrAngle}°`
                    : `Fajr ${m.fajrAngle}° · Isha ${m.ishaAngle}°`}
                </span>
              </button>
            );
          })}
        </div>

        {isCustomMethod && (
          <div style={{ background: "rgba(0,0,0,0.03)", borderRadius: 14, padding: "14px 14px", marginTop: 10 }}>
            <AngleSlider
              label={t("angle_fajr")}
              value={prayerSettings.customFajrAngle}
              onChange={(v) => {
                onSetCustomAngle("customFajrAngle", v);
                flashToast("✓");
              }}
            />
            <div style={{ height: 14 }} />
            <AngleSlider
              label={t("angle_isha")}
              value={prayerSettings.customIshaAngle}
              onChange={(v) => {
                onSetCustomAngle("customIshaAngle", v);
                flashToast("✓");
              }}
            />

            <div style={{ height: 1, background: COLORS.parchmentDark, margin: "16px 0 12px" }} />

            <p className="font-ui font-semibold mb-2.5" style={{ color: COLORS.ink, fontSize: 12.5 }}>
              {t("per_prayer_adjustment")}
            </p>
            <div className="flex flex-col gap-2">
              {PRAYER_LABELS.map((p) => (
                <OffsetStepper
                  key={p.key}
                  label={prayerLabel(p)}
                  value={(prayerSettings.customOffsets && prayerSettings.customOffsets[p.key]) ?? 0}
                  onChange={(v) => {
                    onSetCustomOffset(p.key, v);
                    flashToast("✓");
                  }}
                />
              ))}
            </div>
            <p className="font-ui text-center mt-2.5" style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 1.5 }}>
              {t("calibrate_footnote")}
            </p>
          </div>
        )}

        <p className="font-ui text-center mt-3" style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 1.5 }}>
          {t("angle_explainer")}
        </p>
      </SettingsAccordionItem>

      {/* Iqama + muezzin — independent of the calculation method */}
      <SettingsAccordionItem
        id="iqama"
        icon={<BellIcon color={COLORS.gold} size={16} />}
        title={t("settings_iqama")}
        expanded={expanded === "iqama"}
        onToggle={() => toggleSection("iqama")}
      >
        <p className="font-ui mb-3" style={{ color: COLORS.inkSoft, fontSize: 11.5, lineHeight: 1.6 }}>
          {t("iqama_description")}
        </p>
        <div className="flex flex-col gap-2">
          {PRAYER_LABELS.filter((p) => p.key !== "sunrise").map((p) => (
            <OffsetStepper
              key={p.key}
              label={prayerLabel(p)}
              min={IQAMA_OFFSET_MIN}
              max={IQAMA_OFFSET_MAX}
              value={(prayerSettings.iqamaOffsets && prayerSettings.iqamaOffsets[p.key]) ?? 0}
              onChange={(v) => {
                onSetIqamaOffset(p.key, v);
                flashToast("✓");
              }}
            />
          ))}
        </div>

        <div style={{ height: 1, background: COLORS.parchmentDark, margin: "16px 0 12px" }} />

        <p className="font-ui font-semibold mb-1" style={{ color: COLORS.ink, fontSize: 12.5 }}>
          {t("muezzin_per_prayer")}
        </p>
        <p className="font-ui mb-3" style={{ color: COLORS.inkSoft, fontSize: 11, lineHeight: 1.6 }}>
          {t("muezzin_hint")}
        </p>
        <div className="flex flex-col gap-2">
          {PRAYER_LABELS.filter((p) => p.key !== "sunrise").map((p) => (
            <MuezzinPicker
              key={p.key}
              label={prayerLabel(p)}
              voiceId={(prayerSettings.muezzinByPrayer && prayerSettings.muezzinByPrayer[p.key]) || DEFAULT_MUEZZIN}
              onChange={(v) => {
                onSetMuezzin(p.key, v);
                flashToast("✓");
              }}
            />
          ))}
        </div>
      </SettingsAccordionItem>

      {/* Default reciter */}
      <SettingsAccordionItem
        id="recitateur"
        icon={<MicIcon color={COLORS.gold} size={17} />}
        title={t("settings_reciter")}
        expanded={expanded === "recitateur"}
        onToggle={() => toggleSection("recitateur")}
      >
        <DefaultReciterRow />
      </SettingsAccordionItem>

      {/* Backup / restore */}
      <SettingsAccordionItem
        id="donnees"
        icon={<DownloadIcon color={COLORS.gold} size={16} />}
        title={t("settings_data")}
        expanded={expanded === "donnees"}
        onToggle={() => toggleSection("donnees")}
      >
        <div className="flex flex-col gap-2">
          <button
            onClick={handleExport}
            className="flex items-center justify-between active:opacity-80"
            style={{ background: inkA(0.05), border: `1px solid ${inkA(0.14)}`, borderRadius: 12, padding: "12px 14px" }}
          >
            <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 13 }}>
              {t("data_export")}
            </span>
            <span className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>
              {t("json_file")}
            </span>
          </button>
          <button
            onClick={() => importInputRef.current && importInputRef.current.click()}
            className="flex items-center justify-between active:opacity-80"
            style={{ background: inkA(0.05), border: `1px solid ${inkA(0.14)}`, borderRadius: 12, padding: "12px 14px" }}
          >
            <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 13 }}>
              {t("data_import")}
            </span>
          </button>
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: "none" }} />
          <button
            onClick={handleResetTodayClick}
            className="flex items-center justify-between active:opacity-80"
            style={{ background: inkA(0.05), border: `1px solid ${inkA(0.14)}`, borderRadius: 12, padding: "12px 14px" }}
          >
            <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 13 }}>
              {resetDone ? t("today_azkar_reset") : t("data_reset_today")}
            </span>
            <span className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>
              {t("if_stuck_yesterday")}
            </span>
          </button>
          <OfflineQuranDownloadRow />
        </div>
        {backupStatus && (
          <p
            className="font-ui text-center mt-2.5"
            style={{ color: backupStatus.type === "error" ? COLORS.clay : COLORS.goldLight, fontSize: 11.5 }}
          >
            {backupStatus.message}
          </p>
        )}
        <p className="font-ui text-center mt-2.5" style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 1.5 }}>
          {t("data_stays_on_device")}
        </p>

        <div style={{ height: 1, background: COLORS.parchmentDark, margin: "16px 0 12px" }} />

        {confirmingFactoryReset ? (
          <div style={{ background: "rgba(181,101,74,0.1)", border: `1px solid ${COLORS.clay}`, borderRadius: 12, padding: "12px 14px" }}>
            <p className="font-ui font-semibold" style={{ color: COLORS.clay, fontSize: 12.5, lineHeight: 1.5 }}>
              {t("factory_reset_warning")}
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setConfirmingFactoryReset(false)}
                className="flex-1 active:opacity-80"
                style={{ background: inkA(0.06), borderRadius: 10, padding: "9px 0" }}
              >
                <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 12.5 }}>
                  {t("cancel")}
                </span>
              </button>
              <button
                onClick={onFactoryReset}
                className="flex-1 active:opacity-80"
                style={{ background: COLORS.clay, borderRadius: 10, padding: "9px 0" }}
              >
                <span className="font-ui font-semibold" style={{ color: "#fff", fontSize: 12.5 }}>
                  {t("delete_all")}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingFactoryReset(true)}
            className="w-full active:opacity-80"
            style={{ padding: "8px 0" }}
          >
            <span className="font-ui" style={{ color: COLORS.clay, fontSize: 12, textDecoration: "underline" }}>
              {t("data_reset_all")}
            </span>
          </button>
        )}
      </SettingsAccordionItem>

      {/* About */}
      <SettingsAccordionItem
        id="apropos"
        icon={<InfoIcon color={COLORS.gold} size={17} />}
        title={t("settings_about")}
        expanded={expanded === "apropos"}
        onToggle={() => toggleSection("apropos")}
      >
        <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
          Mes Azkar
        </p>
        <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 12, marginTop: 2 }}>
          {t("version_label")} {APP_VERSION}
        </p>

        <p className="font-ui font-semibold mt-4 mb-2" style={{ color: COLORS.inkSoft, fontSize: 11, letterSpacing: 0.3, textTransform: "uppercase" }}>
          {t("sources_label")}
        </p>
        <div className="flex flex-col gap-1.5">
          {[
            currentLanguage === "en"
              ? "Azkar and invocations: Hisn al-Muslim (Sa'id al-Qahtani)"
              : currentLanguage === "ar"
              ? "الأذكار والأدعية: حصن المسلم (سعيد بن علي بن وهف القحطاني)"
              : "Azkar et invocations : Hisn al-Muslim (Sa'id al-Qahtani)",
            currentLanguage === "en"
              ? "Quran translation: Sahih International"
              : currentLanguage === "ar"
              ? "نص القرآن: مصحف المدينة"
              : "Traduction du Coran : Muhammad Hamidullah",
            currentLanguage === "en"
              ? "Quran text and recitations: Quran.com / Quran Foundation"
              : currentLanguage === "ar"
              ? "التلاوات: Quran.com / Quran Foundation"
              : "Texte et récitations du Coran : Quran.com / Quran Foundation",
            currentLanguage === "en"
              ? "Prayer times: astronomical calculation performed on the device"
              : currentLanguage === "ar"
              ? "أوقات الصلاة: حساب فلكي يُجرى على الجهاز"
              : "Horaires de prière : calcul astronomique effectué sur l'appareil",
          ].map((line) => (
            <p key={line} className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11.5, lineHeight: 1.5 }}>
              {line}
            </p>
          ))}
        </div>

        <button
          onClick={onOpenPrivacy}
          className="w-full flex items-center justify-between active:opacity-80 mt-4"
          style={{ background: inkA(0.05), border: `1px solid ${inkA(0.14)}`, borderRadius: 12, padding: "12px 14px" }}
        >
          <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 13 }}>
            {t("title_privacy")}
          </span>
        </button>

        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="w-full flex items-center justify-between active:opacity-80 mt-2"
          style={{ background: inkA(0.05), border: `1px solid ${inkA(0.14)}`, borderRadius: 12, padding: "12px 14px", textDecoration: "none" }}
        >
          <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 13 }}>
            {t("contact_us")}
          </span>
          <span className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>
            {CONTACT_EMAIL}
          </span>
        </a>

        <button
          onClick={onReplayOnboarding}
          className="w-full flex items-center justify-between active:opacity-80 mt-2"
          style={{ background: inkA(0.05), border: `1px solid ${inkA(0.14)}`, borderRadius: 12, padding: "12px 14px" }}
        >
          <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 13 }}>
            {t("tour_replay")}
          </span>
        </button>
      </SettingsAccordionItem>
    </div>
  );
}

function SettingsAccordionItem({ icon, title, expanded, onToggle, children }) {
  return (
    <div
      className="mb-3"
      style={{ background: COLORS.parchment, borderRadius: 18, border: `1px solid ${COLORS.parchmentDark}`, overflow: "hidden" }}
    >
      <button onClick={onToggle} className="w-full flex items-center justify-between active:opacity-80" style={{ padding: "15px 15px" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(0,0,0,0.04)" }}
          >
            {icon}
          </div>
          <span className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
            {title}
          </span>
        </div>
        <span style={{ transform: expanded ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.2s ease" }}>
          <ChevronIcon dir="right" color={COLORS.inkSoft} size={16} />
        </span>
      </button>
      {expanded && <div style={{ padding: "0 15px 15px" }}>{children}</div>}
    </div>
  );
}

const PRIVACY_SECTIONS = [
  {
    title: "Aucune inscription, aucun compte",
    title_en: "No sign-up, no account",
    title_ar: "بدون تسجيل ولا حساب",
    body: "Mes Azkar ne demande ni compte ni inscription. Aucune information permettant de t'identifier (nom, e-mail, numéro de téléphone) n'est jamais collectée par l'application.",
    body_en: "Mes Azkar never asks for an account or sign-up. No information that could identify you (name, email, phone number) is ever collected by the app.",
    body_ar: "لا يطلب تطبيق أذكاري أي حساب أو تسجيل. لا يتم أبدًا جمع أي معلومة قد تحدد هويتك (الاسم، البريد الإلكتروني، رقم الهاتف) من طرف التطبيق.",
  },
  {
    title: "Tes données restent sur ton téléphone",
    title_en: "Your data stays on your phone",
    title_ar: "بياناتك تبقى على هاتفك",
    body: "Ta progression dans les azkar, ton tasbih, tes invocations personnelles, ta progression de lecture du Coran, ta langue choisie et tes réglages (y compris la personnalisation pour ta mosquée) sont stockés uniquement sur ton appareil, dans la mémoire locale de l'application. Rien n'est envoyé vers un serveur : l'application n'a pas de serveur ni de base de données à elle.",
    body_en: "Your azkar progress, your tasbih count, your personal invocations, your Quran reading progress, your chosen language, and your settings (including your mosque's custom prayer-time calibration) are stored only on your device, in the app's local storage. Nothing is sent to a server: the app has no server or database of its own.",
    body_ar: "تقدمك في الأذكار، عداد التسبيح، أدعيتك الشخصية، تقدمك في قراءة القرآن، لغتك المختارة، وإعداداتك (بما في ذلك ضبط أوقات مسجدك) تُخزَّن فقط على جهازك، في الذاكرة المحلية للتطبيق. لا يُرسَل أي شيء إلى خادم: فالتطبيق لا يملك خادمًا ولا قاعدة بيانات خاصة به.",
  },
  {
    title: "Localisation",
    title_en: "Location",
    title_ar: "الموقع الجغرافي",
    body: "Si tu autorises l'accès à ta position, elle sert uniquement à calculer les horaires de prière et la direction de la Qibla directement sur ton téléphone. Cette position n'est transmise à aucun service extérieur et n'est pas conservée au-delà du calcul.",
    body_en: "If you allow access to your location, it is used only to calculate prayer times and the Qibla direction directly on your phone. This location is never sent to any external service and is not kept beyond the calculation.",
    body_ar: "إذا سمحت بالوصول إلى موقعك، فإنه يُستخدم فقط لحساب أوقات الصلاة واتجاه القبلة مباشرة على هاتفك. لا يُرسَل هذا الموقع إلى أي خدمة خارجية ولا يُحفظ بعد إتمام الحساب.",
  },
  {
    title: "Notifications et rappels de prière",
    title_en: "Notifications and prayer reminders",
    title_ar: "الإشعارات وتذكيرات الصلاة",
    body: "Les rappels de prière (et le choix du muezzin pour chacun) sont programmés localement sur ton téléphone, à partir des horaires calculés sur l'appareil. Aucune notification ne transite par un serveur externe.",
    body_en: "Prayer reminders (and the muezzin voice chosen for each) are scheduled locally on your phone, from the times calculated on the device. No notification passes through an external server.",
    body_ar: "تُبرمَج تذكيرات الصلاة (واختيار صوت المؤذن لكل منها) محليًا على هاتفك، انطلاقًا من الأوقات المحسوبة على الجهاز. لا يمر أي إشعار عبر خادم خارجي.",
  },
  {
    title: "Widget d'écran d'accueil",
    title_en: "Home screen widget",
    title_ar: "أداة الشاشة الرئيسية",
    body: "Le widget affiche les horaires de prière directement sur ton écran d'accueil. Il réutilise les mêmes réglages (position, méthode de calcul, personnalisation) stockés localement sur ton appareil, et ne communique avec aucun serveur.",
    body_en: "The widget shows prayer times directly on your home screen. It reuses the same settings (location, calculation method, customization) stored locally on your device, and does not communicate with any server.",
    body_ar: "تعرض هذه الأداة أوقات الصلاة مباشرة على شاشتك الرئيسية. تستخدم نفس الإعدادات (الموقع، طريقة الحساب، التخصيص) المخزنة محليًا على جهازك، ولا تتواصل مع أي خادم.",
  },
  {
    title: "Lecture audio en arrière-plan",
    title_en: "Background audio playback",
    title_ar: "تشغيل الصوت في الخلفية",
    body: "Lorsque tu écoutes une récitation du Coran ou un adhan, la lecture peut continuer même après avoir quitté l'application, via un service audio du système. Aucune donnée n'est collectée à cette occasion.",
    body_en: "When you listen to a Quran recitation or an adhan, playback can continue even after leaving the app, via a system audio service. No data is collected during this.",
    body_ar: "عند الاستماع إلى تلاوة قرآنية أو أذان، يمكن أن يستمر التشغيل حتى بعد مغادرة التطبيق، عبر خدمة صوتية تابعة للنظام. لا تُجمع أي بيانات خلال ذلك.",
  },
  {
    title: "Contenus chargés depuis Internet",
    title_en: "Content loaded from the internet",
    title_ar: "محتوى محمّل من الإنترنت",
    body: "Le texte du Coran, ses traductions et les récitations audio sont récupérés directement depuis des services publics (Quran.com / Quran Foundation, alquran.cloud). Comme pour toute requête Internet, ces services voient l'adresse IP de ton appareil au moment du chargement — l'application elle-même ne leur transmet aucune information sur toi.",
    body_en: "The Quran text, its translations and audio recitations are fetched directly from public services (Quran.com / Quran Foundation, alquran.cloud). As with any internet request, these services see your device's IP address at the moment of loading — the app itself never sends them any information about you.",
    body_ar: "يُسترجَع نص القرآن وترجماته والتلاوات الصوتية مباشرة من خدمات عامة (Quran.com / Quran Foundation، alquran.cloud). كما هو الحال مع أي طلب عبر الإنترنت، تطّلع هذه الخدمات على عنوان IP الخاص بجهازك عند التحميل — لكن التطبيق نفسه لا يرسل إليها أي معلومة عنك.",
  },
  {
    title: "Aucune publicité, aucun traqueur",
    title_en: "No ads, no tracker",
    title_ar: "بدون إعلانات ولا متتبعات",
    body: "L'application ne contient ni publicité ni outil d'analyse ou de suivi (analytics, statistiques d'usage envoyées à un tiers).",
    body_en: "The app contains no advertising and no analytics or tracking tool (no usage statistics are sent to a third party).",
    body_ar: "لا يحتوي التطبيق على أي إعلانات ولا أي أداة تحليل أو تتبع (لا تُرسَل أي إحصائيات استخدام إلى طرف ثالث).",
  },
  {
    title: "Export de tes données",
    title_en: "Exporting your data",
    title_ar: "تصدير بياناتك",
    body: "Tu peux à tout moment exporter une copie de tes données dans un fichier que tu contrôles entièrement, ou tout supprimer depuis Réglages > Données.",
    body_en: "You can export a copy of your data at any time into a file you fully control, or delete everything from Settings > Data.",
    body_ar: "يمكنك في أي وقت تصدير نسخة من بياناتك إلى ملف تتحكم فيه بالكامل، أو حذف كل شيء من الإعدادات > البيانات.",
  },
  {
    title: "Contact",
    title_en: "Contact",
    title_ar: "التواصل",
    body: `Pour toute question sur cette politique de confidentialité, écris à ${CONTACT_EMAIL}.`,
    body_en: `For any question about this privacy policy, write to ${CONTACT_EMAIL}.`,
    body_ar: `لأي سؤال حول سياسة الخصوصية هذه، راسلنا على ${CONTACT_EMAIL}.`,
  },
];

function PrivacyPolicyScreen({ onBack }) {
  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-10 fade-in">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("title_privacy")}
        </p>
        <div className="w-9" />
      </div>

      <p className="font-ui text-center mb-6" style={{ color: COLORS.inkSoft, fontSize: 11.5 }}>
        {t("last_updated")} {t("last_updated_date")}
      </p>

      <div className="flex flex-col gap-4">
        {PRIVACY_SECTIONS.map((s) => (
          <div
            key={s.title}
            style={{ background: COLORS.parchment, borderRadius: 18, border: `1px solid ${COLORS.parchmentDark}`, padding: "16px 16px" }}
          >
            <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
              {localField(s, "title")}
            </p>
            <p className="font-ui mt-2" style={{ color: COLORS.inkSoft, fontSize: 12.5, lineHeight: 1.6 }}>
              {localField(s, "body")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MuezzinPicker({ label, voiceId, onChange }) {
  const index = Math.max(0, ADHAN_VOICES.findIndex((v) => v.id === voiceId));
  const voice = ADHAN_VOICES[index] || ADHAN_VOICES[0];
  const cycle = (delta) => {
    const next = (index + delta + ADHAN_VOICES.length) % ADHAN_VOICES.length;
    onChange(ADHAN_VOICES[next].id);
  };
  return (
    <div className="flex items-center justify-between" style={{ background: inkA(0.04), borderRadius: 12, padding: "8px 10px" }}>
      <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 12.5 }}>
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <AudioPlayButton key={voice.id} src={voice.audio} color={COLORS.goldLight} size={24} />
        <button
          onClick={() => cycle(-1)}
          className="flex items-center justify-center active:opacity-60"
          style={{ width: 24, height: 24, borderRadius: 8, background: inkA(0.08) }}
          aria-label={`${label} : ${t("nav_previous")}`}
        >
          <ChevronIcon dir="left" color={COLORS.ink} size={13} />
        </button>
        <span className="font-ui font-semibold text-center" style={{ color: COLORS.goldLight, fontSize: 12.5, minWidth: 52 }}>
          {voice.label}
        </span>
        <button
          onClick={() => cycle(1)}
          className="flex items-center justify-center active:opacity-60"
          style={{ width: 24, height: 24, borderRadius: 8, background: inkA(0.08) }}
          aria-label={`${label} : ${t("nav_next")}`}
        >
          <ChevronIcon dir="right" color={COLORS.ink} size={13} />
        </button>
      </div>
    </div>
  );
}

function OffsetStepper({ label, value, onChange, min = CUSTOM_OFFSET_MIN, max = CUSTOM_OFFSET_MAX }) {
  const display = value > 0 ? `+${value} min` : `${value} min`;
  return (
    <div className="flex items-center justify-between" style={{ background: inkA(0.04), borderRadius: 12, padding: "8px 10px" }}>
      <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 12.5 }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          className="flex items-center justify-center active:opacity-60"
          style={{ width: 24, height: 24, borderRadius: 8, background: inkA(0.08), opacity: value <= min ? 0.4 : 1 }}
          aria-label={`${label} : ${t("decrease_minute")}`}
        >
          <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 14, lineHeight: 1 }}>
            −
          </span>
        </button>
        <span className="font-ui font-semibold text-center" style={{ color: COLORS.goldLight, fontSize: 12.5, minWidth: 52 }}>
          {display}
        </span>
        <button
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          className="flex items-center justify-center active:opacity-60"
          style={{ width: 24, height: 24, borderRadius: 8, background: inkA(0.08), opacity: value >= max ? 0.4 : 1 }}
          aria-label={`${label} : ${t("increase_minute")}`}
        >
          <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 14, lineHeight: 1 }}>
            +
          </span>
        </button>
      </div>
    </div>
  );
}

function AngleSlider({ label, value, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 13 }}>
          {label}
        </span>
        <span className="font-ui font-semibold" style={{ color: COLORS.goldLight, fontSize: 13 }}>
          {value}°
        </span>
      </div>
      <input
        type="range"
        min={CUSTOM_ANGLE_MIN}
        max={CUSTOM_ANGLE_MAX}
        step={0.5}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: COLORS.goldLight }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invocations library — grouped topic list                            */
/* ------------------------------------------------------------------ */
function InvocationsLibraryScreen({ onSelectTopic, onOpenPersonal }) {
  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-28 fade-in">
      <div className="flex items-center justify-between mb-2">
        <div className="w-9" />
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("title_invocations")}
        </p>
        <div className="w-9" />
      </div>

      <p className="font-ui text-center mb-6" style={{ color: COLORS.inkSoft, fontSize: 12.5, lineHeight: 1.5 }}>
        {t("invocations_subtitle")}
      </p>

      {/* Personal invocations entry, kept separate at the top */}
      <button
        onClick={onOpenPersonal}
        className="active:scale-[0.98] transition mb-6"
        style={{
          background: inkA(0.06),
          border: `1px dashed ${inkA(0.28)}`,
          borderRadius: 18,
          padding: "13px 16px",
          textAlign: "left",
        }}
      >
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 22 }}>✍️</span>
          <div>
            <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14.5 }}>
              {t("my_personal_invocations")}
            </p>
            <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11.5, marginTop: 1 }}>
              {t("add_keep_duas")}
            </p>
          </div>
        </div>
      </button>

      {INVOCATION_GROUPS.map((group) => (
        <div key={group.id} className="mb-7">
          <p
            className="font-ui font-semibold mb-2.5"
            style={{ color: COLORS.goldLight, fontSize: 11.5, letterSpacing: 0.5, textTransform: "uppercase" }}
          >
            {localLabel(group)}
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            {group.topics.map((topicId) => {
              const topic = INVOCATION_TOPICS[topicId];
              if (!topic) return null;
              return (
                <button
                  key={topicId}
                  onClick={() => onSelectTopic(topicId)}
                  className="flex flex-col items-center justify-center gap-1.5 active:scale-95 transition"
                  style={{
                    background: COLORS.parchment,
                    borderRadius: 16,
                    padding: "14px 6px",
                    border: `1px solid ${COLORS.parchmentDark}`,
                  }}
                >
                  <div
                    className="flex items-center justify-center"
                    style={{ width: 36, height: 36, borderRadius: 11, background: `${COLORS.goldLight}24` }}
                  >
                    <InvocationIcon type={topicId} color={COLORS.gold} size={17} />
                  </div>
                  <span
                    className="font-ui font-medium text-center"
                    style={{ color: COLORS.ink, fontSize: 11.5, lineHeight: 1.2 }}
                  >
                    {localLabel(topic)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Invocations found directly in the Qur'an, grouped by theme — fetched live
// from the same Quran API used elsewhere in the app (and cached) rather than
// typed out by hand, so the scripture itself is never at risk of a
// transcription slip. Only well-established, easily verifiable references.
const QURAN_DUA_THEMES = [
  {
    id: "guidance",
    label: "Guidance et droiture du cœur",
    label_en: "Guidance and righteousness of the heart",
    label_ar: "الهداية واستقامة القلب",
    refs: [
      { surah: 2, ayah: 127 },
      { surah: 3, ayah: 8 },
      { surah: 7, ayah: 23 },
    ],
  },
  {
    id: "pardon",
    label: "Pardon et repentir",
    label_en: "Forgiveness and repentance",
    label_ar: "المغفرة والتوبة",
    refs: [
      { surah: 3, ayah: 16 },
      { surah: 3, ayah: 147 },
      { surah: 14, ayah: 41 },
      { surah: 28, ayah: 16 },
      { surah: 60, ayah: 4 },
      { surah: 60, ayah: 5 },
      { surah: 66, ayah: 8 },
    ],
  },
  {
    id: "protection",
    label: "Protection et secours",
    label_en: "Protection and help",
    label_ar: "الحماية والعون",
    refs: [
      { surah: 7, ayah: 89 },
      { surah: 10, ayah: 85 },
      { surah: 10, ayah: 86 },
      { surah: 21, ayah: 87 },
    ],
  },
  {
    id: "famille",
    label: "Famille et descendance",
    label_en: "Family and offspring",
    label_ar: "الأسرة والذرية",
    refs: [
      { surah: 21, ayah: 89 },
      { surah: 25, ayah: 74 },
      { surah: 27, ayah: 19 },
      { surah: 46, ayah: 15 },
    ],
  },
  {
    id: "biens",
    label: "Bien ici-bas et dans l'au-delà",
    label_en: "Good in this life and the hereafter",
    label_ar: "خير الدنيا والآخرة",
    refs: [
      { surah: 2, ayah: 201 },
      { surah: 2, ayah: 250 },
      { surah: 3, ayah: 53 },
      { surah: 18, ayah: 10 },
      { surah: 23, ayah: 109 },
    ],
  },
  {
    id: "science",
    label: "Science et sagesse",
    label_en: "Knowledge and wisdom",
    label_ar: "العلم والحكمة",
    refs: [{ surah: 20, ayah: 114 }],
  },
  {
    id: "epreuve",
    label: "Face à l'épreuve",
    label_en: "Facing hardship",
    label_ar: "عند الشدة والابتلاء",
    refs: [{ surah: 21, ayah: 83 }],
  },
  {
    id: "jugement",
    label: "Le Jour du Jugement",
    label_en: "The Day of Judgment",
    label_ar: "يوم القيامة",
    refs: [
      { surah: 3, ayah: 9 },
      { surah: 3, ayah: 191 },
      { surah: 3, ayah: 192 },
      { surah: 3, ayah: 193 },
      { surah: 3, ayah: 194 },
      { surah: 59, ayah: 10 },
    ],
  },
  {
    id: "divers",
    label: "Autres invocations coraniques",
    label_en: "Other Quranic supplications",
    label_ar: "أدعية قرآنية أخرى",
    refs: [
      { surah: 2, ayah: 128 },
      { surah: 2, ayah: 286 },
      { surah: 5, ayah: 114 },
      { surah: 7, ayah: 126 },
      { surah: 14, ayah: 38 },
      { surah: 25, ayah: 65 },
    ],
  },
];
const QURAN_DUA_REFS = QURAN_DUA_THEMES.flatMap((t) => t.refs);
const QURAN_DUA_CACHE_KEY = "azkar-quran-dua-cache-v1";

function RabbanaContent({ arabicSize }) {
  const [verseMap, setVerseMap] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    const refKey = (r) => `${r.surah}:${r.ayah}`;
    const lang = currentLanguage;
    const editions = lang === "ar" ? "quran-uthmani" : `quran-uthmani,${lang === "en" ? "en.sahih" : "fr.hamidullah"}`;
    const cacheKey = `${QURAN_DUA_CACHE_KEY}-${lang}`;
    (async () => {
      try {
        const cached = await window.storage.get(cacheKey, false);
        if (cached && cached.value) {
          const parsed = JSON.parse(cached.value);
          if (parsed && QURAN_DUA_REFS.every((r) => parsed[refKey(r)])) {
            setVerseMap(parsed);
            setStatus("ready");
            return;
          }
        }
      } catch (e) {
        // not cached yet
      }
      try {
        // The API caps requests at 12/second — firing all of these in
        // parallel would trip that limit and the rejected responses come
        // back without CORS headers, which browsers then misreport as a
        // CORS error. Small sequential batches stay safely under it.
        const results = [];
        const batchSize = 8;
        for (let i = 0; i < QURAN_DUA_REFS.length; i += batchSize) {
          const batch = QURAN_DUA_REFS.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map((r) =>
              fetch(`https://api.alquran.cloud/v1/ayah/${r.surah}:${r.ayah}/editions/${editions}`).then((res) =>
                res.json()
              )
            )
          );
          results.push(...batchResults);
          if (i + batchSize < QURAN_DUA_REFS.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
        if (cancelled) return;
        const map = {};
        results.forEach((res, i) => {
          const r = QURAN_DUA_REFS[i];
          const data = res?.data;
          const arabic = Array.isArray(data) ? data[0]?.text : data?.text;
          const translation = Array.isArray(data) ? data[1]?.text : "";
          const surahMeta = QURAN_SURAHS.find((s) => s.number === r.surah);
          const label = lang === "en" ? "verse" : lang === "ar" ? "آية" : "verset";
          map[refKey(r)] = {
            title: surahMeta ? `${surahMeta.translit} — ${label} ${r.ayah}` : `${label} ${r.ayah}`,
            arabic,
            translation,
          };
        });
        if (Object.values(map).some((v) => !v.arabic)) throw new Error("incomplete response");
        setVerseMap(map);
        setStatus("ready");
        window.storage.set(cacheKey, JSON.stringify(map), false).catch(() => {});
      } catch (e) {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentLanguage]);

  if (status === "loading") {
    return (
      <p className="font-ui text-center mt-10" style={{ color: COLORS.inkSoft, fontSize: 13 }}>
        {t("loading_verses")}
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="font-ui text-center mt-10 px-4" style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.6 }}>
        {t("error_load_verses")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {QURAN_DUA_THEMES.map((theme) => (
        <div key={theme.id}>
          <p
            className="font-ui font-semibold mb-2.5"
            style={{ color: COLORS.goldLight, fontSize: 11.5, letterSpacing: 0.5, textTransform: "uppercase" }}
          >
            {localLabel(theme)}
          </p>
          <div className="flex flex-col gap-4">
            {theme.refs.map((r) => {
              const it = verseMap[`${r.surah}:${r.ayah}`];
              if (!it) return null;
              return (
                <div
                  key={`${r.surah}:${r.ayah}`}
                  style={{
                    background: COLORS.parchment,
                    borderRadius: 20,
                    padding: "18px 20px",
                    border: `1px solid ${COLORS.parchmentDark}`,
                  }}
                >
                  <p className="font-ui font-semibold" style={{ color: COLORS.clay, fontSize: 12, letterSpacing: 0.3, textTransform: "uppercase" }}>
                    {it.title}
                  </p>
                  <p dir="rtl" className="font-arabic text-right mt-3" style={{ color: COLORS.ink, fontSize: arabicSize || ARABIC_SIZES.md, lineHeight: 1.8 }}>
                    {it.arabic}
                  </p>
                  {currentLanguage !== "ar" && (
                    <>
                      <div style={{ height: 1, background: COLORS.parchmentDark, margin: "12px 0" }} />
                      <p className="font-display" style={{ color: COLORS.inkSoft, fontSize: 13.5, fontStyle: "italic" }}>
                        {it.translation}
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invocations library — single topic detail                           */
/* ------------------------------------------------------------------ */
function InvocationTopicScreen({ topicId, arabicSize, onBack }) {
  const topic = INVOCATION_TOPICS[topicId];
  if (!topic) return null;

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-10 fade-in">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <div className="flex items-center gap-2">
          <InvocationIcon type={topicId} color={COLORS.gold} size={16} />
          <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
            {localLabel(topic)}
          </p>
        </div>
        <div className="w-9" />
      </div>

      {topic.dynamic ? (
        <RabbanaContent arabicSize={arabicSize} />
      ) : (
        <div className="flex flex-col gap-4">
          {topic.items.map((it, i) => (
            <div
              key={i}
              style={{
                background: COLORS.parchment,
                borderRadius: 20,
                padding: "18px 20px",
                border: `1px solid ${COLORS.parchmentDark}`,
              }}
            >
              <p className="font-ui font-semibold" style={{ color: COLORS.clay, fontSize: 12, letterSpacing: 0.3, textTransform: "uppercase" }}>
                {trField(it, "title")}
              </p>
              <p
                dir="rtl"
                className="font-arabic text-right mt-3"
                style={{ color: COLORS.ink, fontSize: arabicSize || ARABIC_SIZES.md, lineHeight: 1.8 }}
              >
                {it.arabic}
              </p>
              {currentLanguage !== "ar" && (
                <>
                  <div style={{ height: 1, background: COLORS.parchmentDark, margin: "12px 0" }} />
                  <p className="font-display" style={{ color: COLORS.inkSoft, fontSize: 13.5, fontStyle: "italic" }}>
                    {trField(it, "translation")}
                  </p>
                </>
              )}
              {it.merit && currentLanguage !== "ar" && (
                <div className="flex items-start gap-2 mt-3" style={{ paddingTop: 10, borderTop: `1px dashed ${COLORS.parchmentDark}` }}>
                  <MeritIcon color={COLORS.gold} />
                  <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11.5, lineHeight: 1.5 }}>
                    {trField(it, "merit")}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Personal invocations                                                 */
/* ------------------------------------------------------------------ */
function PersonalInvocationsScreen({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [formError, setFormError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(PERSONAL_INVOCATIONS_KEY, false);
        if (res && res.value) setEntries(JSON.parse(res.value));
      } catch (e) {
        // no personal invocations yet
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persistEntries = useCallback(async (next) => {
    try {
      await window.storage.set(PERSONAL_INVOCATIONS_KEY, JSON.stringify(next), false);
    } catch (e) {
      // ignore storage failures — list still works in-memory
    }
  }, []);

  const handleAdd = () => {
    if (!title.trim() && !text.trim()) {
      setFormError(true);
      return;
    }
    const next = [{ id: `p${Date.now()}`, title: title.trim() || t("untitled"), text: text.trim() }, ...entries];
    setEntries(next);
    persistEntries(next);
    setTitle("");
    setText("");
    setFormError(false);
    setShowForm(false);
  };

  const handleDelete = (id) => {
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    persistEntries(next);
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="font-ui" style={{ color: COLORS.ink, opacity: 0.7 }}>
          {t("loading")}
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-10 fade-in">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("title_my_invocations")}
        </p>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="p-2.5 -mr-2 active:opacity-60"
          aria-label={showForm ? t("close") : t("add_invocation")}
        >
          <span style={{ color: COLORS.goldLight, fontSize: 22, lineHeight: 1 }}>{showForm ? "×" : "+"}</span>
        </button>
      </div>

      {showForm && (
        <div
          className="mb-5"
          style={{ background: COLORS.parchment, borderRadius: 18, padding: "16px 16px", border: `1px solid ${COLORS.parchmentDark}` }}
        >
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setFormError(false);
            }}
            placeholder={t("personal_title_placeholder")}
            className="font-ui w-full"
            style={{
              background: "rgba(0,0,0,0.04)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13.5,
              color: COLORS.ink,
              border: "none",
              outline: "none",
              marginBottom: 8,
            }}
          />
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFormError(false);
            }}
            placeholder={t("personal_text_placeholder")}
            rows={4}
            className="font-ui w-full"
            style={{
              background: "rgba(0,0,0,0.04)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13.5,
              color: COLORS.ink,
              border: "none",
              outline: "none",
              resize: "none",
            }}
          />
          {formError && (
            <p className="font-ui mt-2" style={{ color: COLORS.clay, fontSize: 11.5 }}>
              {t("personal_form_error")}
            </p>
          )}
          <button
            onClick={handleAdd}
            className="mt-3 active:scale-95 transition"
            style={{
              background: COLORS.clay,
              color: "#fff",
              padding: "10px 20px",
              borderRadius: 99,
              fontWeight: 600,
              fontSize: 13,
              width: "100%",
            }}
          >
            {t("save")}
          </button>
        </div>
      )}

      {entries.length === 0 && !showForm && (
        <p className="font-ui text-center mt-10" style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.6 }}>
          {t("personal_empty")}
          {"\n"}{t("personal_empty_hint")}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {entries.map((e) => (
          <div
            key={e.id}
            style={{ background: COLORS.parchment, borderRadius: 16, padding: "14px 16px", border: `1px solid ${COLORS.parchmentDark}` }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
                {e.title}
              </p>
              <button onClick={() => handleDelete(e.id)} className="active:opacity-60 flex-shrink-0" aria-label={t("delete")}>
                <ResetIcon color={COLORS.inkSoft} />
              </button>
            </div>
            <p className="font-ui mt-2" style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {e.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quran reader — list of surahs with progress                         */
/* ------------------------------------------------------------------ */
// The Quran hub — deliberately mirrors the home screen's own DNA (centered
// title, one prominent info card, a compact 3-tile grid, a single-line
// utility card) so the app reads as one coherent design language rather
// than a patchwork of per-section layouts.
// Rotates through the surahs the Sunna specifically attaches to bedtime, so
// the hub's suggestion actually matches what it's labeled as — not just any
// virtuous surah, but ones meant to be recited before sleeping.
const RECOMMENDED_ROTATION = [
  {
    number: 2,
    reason: "Āyat al-Kursī et ses deux derniers versets protègent celui qui les récite la nuit (rapporté par Al-Bukhari et Muslim).",
    reason_en: "Ayat al-Kursi and its last two verses protect whoever recites them at night (narrated by al-Bukhari and Muslim).",
  },
  {
    number: 32,
    reason: "Récitée avec Al-Mulk avant de dormir (rapporté par At-Tirmidhi).",
    reason_en: "Recited with Al-Mulk before sleeping (narrated by at-Tirmidhi).",
  },
  {
    number: 67,
    reason: "Le Prophète ﷺ la récitait chaque soir avant de dormir (rapporté par At-Tirmidhi).",
    reason_en: "The Prophet ﷺ recited it every night before sleeping (narrated by at-Tirmidhi).",
  },
  {
    number: 109,
    reason: "Récitée avant de dormir comme désaveu du polythéisme (rapporté par Abu Dawud et At-Tirmidhi).",
    reason_en: "Recited before sleeping as a disavowal of polytheism (narrated by Abu Dawud and at-Tirmidhi).",
  },
  {
    number: 112,
    reason: "Récitée avec Al-Falaq et An-Nās, soufflée dans les mains et passée sur le corps avant de dormir (rapporté par Al-Bukhari).",
    reason_en: "Recited with Al-Falaq and An-Nas, blown into the hands and wiped over the body before sleeping (narrated by al-Bukhari).",
  },
  {
    number: 113,
    reason: "Récitée avec Al-Ikhlās et An-Nās avant de dormir (rapporté par Al-Bukhari).",
    reason_en: "Recited with Al-Ikhlas and An-Nas before sleeping (narrated by al-Bukhari).",
  },
  {
    number: 114,
    reason: "Récitée avec Al-Ikhlās et Al-Falaq avant de dormir (rapporté par Al-Bukhari).",
    reason_en: "Recited with Al-Ikhlas and Al-Falaq before sleeping (narrated by al-Bukhari).",
  },
];
function getRecommendedSurah() {
  return RECOMMENDED_ROTATION[dayOfYear(new Date()) % RECOMMENDED_ROTATION.length];
}
function QuranHomeScreen({ onOpenSurahs, onOpenMushaf, onOpenReciters, onResumeReading }) {
  const [progress, setProgress] = useState({ lastSurah: null, lastAyah: null, readAyahs: {} });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(QURAN_PROGRESS_KEY, false);
        if (res && res.value) setProgress(JSON.parse(res.value));
      } catch (e) {
        // no progress saved yet
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const totalRead = Object.values(progress.readAyahs || {}).reduce((sum, n) => sum + n, 0);
  const overallPct = QURAN_TOTAL_AYAHS ? totalRead / QURAN_TOTAL_AYAHS : 0;
  const lastSurahMeta = progress.lastSurah ? QURAN_SURAHS.find((s) => s.number === progress.lastSurah) : null;
  const lastSurahPct = lastSurahMeta
    ? (progress.readAyahs?.[lastSurahMeta.number] || 0) / lastSurahMeta.ayahCount
    : 0;
  const recommended = getRecommendedSurah();
  const recommendedMeta = QURAN_SURAHS.find((s) => s.number === recommended.number);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="font-ui" style={{ color: COLORS.ink, opacity: 0.7 }}>
          {t("loading")}
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-28 fade-in">
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2">
          <span className="font-arabic" style={{ color: COLORS.goldLight, fontSize: 22, letterSpacing: 0.5 }}>
            القرآن الكريم
          </span>
          <span className="font-display" style={{ color: COLORS.ink, fontSize: 17 }}>
            {t("title_quran")}
          </span>
        </div>
      </div>

      {lastSurahMeta ? (
        <button
          onClick={() => onResumeReading(lastSurahMeta.number)}
          className="active:scale-[0.98] transition flex items-center gap-3"
          style={{ background: inkA(0.07), border: `1px solid ${inkA(0.14)}`, borderRadius: 18, padding: "13px 14px", textAlign: "left" }}
        >
          <MiniRing pct={lastSurahPct} color={COLORS.goldLight} done={lastSurahPct >= 1} size={40} />
          <div className="flex-1 min-w-0">
            <p className="font-ui font-semibold" style={{ color: COLORS.goldLight, fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase" }}>
              {t("resume_reading")}
            </p>
            <p className="font-display font-semibold mt-0.5 truncate" style={{ color: COLORS.ink, fontSize: 15 }}>
              {lastSurahMeta.translit} — {t("verse_label")} {progress.lastAyah}
            </p>
          </div>
          <ChevronIcon dir="right" color={COLORS.inkSoft} />
        </button>
      ) : (
        <div
          className="text-center"
          style={{ background: inkA(0.07), border: `1px solid ${inkA(0.14)}`, borderRadius: 18, padding: "16px 16px" }}
        >
          <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
            {t("bismillah_start")}
          </p>
          <p className="font-ui mt-1" style={{ color: COLORS.inkSoft, fontSize: 11.5 }}>
            {t("choose_surah_start")}
          </p>
        </div>
      )}

      <div style={{ height: 16 }} />

      <div className="grid grid-cols-3 gap-2.5">
        {[
          { key: "surahs", label: t("title_surahs"), icon: <BookIcon color={COLORS.gold} size={20} />, onClick: onOpenSurahs, pct: overallPct },
          { key: "mushaf", label: t("title_mushaf"), icon: <QuranIcon color={COLORS.indigo} size={20} />, onClick: onOpenMushaf, pct: null },
          { key: "reciters", label: t("title_reciters"), icon: <MicIcon color={COLORS.clay} size={20} />, onClick: onOpenReciters, pct: null },
        ].map((tile) => (
          <button
            key={tile.key}
            onClick={tile.onClick}
            className="flex flex-col items-center active:scale-95 transition"
            style={{ background: COLORS.parchment, borderRadius: 16, padding: "12px 6px", border: `1px solid ${COLORS.parchmentDark}`, textAlign: "center" }}
          >
            <div className="relative">
              <div className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(0,0,0,0.03)" }}>
                {tile.icon}
              </div>
              {tile.pct !== null && (
                <div style={{ position: "absolute", top: -4, right: -4 }}>
                  <MiniRing pct={tile.pct} color={COLORS.gold} done={tile.pct >= 1} size={16} />
                </div>
              )}
            </div>
            <p className="font-display font-semibold mt-2" style={{ color: COLORS.ink, fontSize: 11, lineHeight: 1.25 }}>
              {tile.label}
            </p>
          </button>
        ))}
      </div>

      {recommendedMeta && (
        <button
          onClick={() => onResumeReading(recommended.number)}
          className="active:scale-[0.98] transition flex items-start gap-3 mt-2.5"
          style={{ width: "100%", background: COLORS.parchment, borderRadius: 16, padding: "12px 14px", border: `1px solid ${COLORS.parchmentDark}`, textAlign: "left" }}
        >
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(139,124,177,0.16)" }}
          >
            <CategoryIcon type="bed" color={COLORS.violetLight} size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-ui font-semibold" style={{ color: COLORS.violetLight, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase" }}>
              {t("recommended_bedtime_surah")}
            </p>
            <p className="font-display font-semibold mt-0.5" style={{ color: COLORS.ink, fontSize: 14 }}>
              {recommendedMeta.translit} <span dir="rtl" className="font-arabic">{recommendedMeta.arabic}</span>
            </p>
            {currentLanguage !== "ar" && (
              <p className="font-ui mt-1" style={{ color: COLORS.inkSoft, fontSize: 11, lineHeight: 1.5 }}>
                {trField(recommended, "reason")}
              </p>
            )}
          </div>
        </button>
      )}
    </div>
  );
}

/* Dedicated surah browser — number, name, meaning, live progress ring,   */
/* filterable by translit / meaning / arabic name for quick lookup        */
function SurahListScreen({ onSelectSurah, onBack }) {
  const [progress, setProgress] = useState({ lastSurah: null, lastAyah: null, readAyahs: {} });
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(QURAN_PROGRESS_KEY, false);
        if (res && res.value) setProgress(JSON.parse(res.value));
      } catch (e) {
        // no progress saved yet
      }
    })();
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? QURAN_SURAHS.filter(
        (s) =>
          s.translit.toLowerCase().includes(q) ||
          s.meaning.toLowerCase().includes(q) ||
          (s.meaning_en && s.meaning_en.toLowerCase().includes(q)) ||
          s.arabic.includes(query.trim()) ||
          String(s.number) === q
      )
    : QURAN_SURAHS;

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-10 fade-in">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("title_surahs")}
        </p>
        <div className="w-9" />
      </div>

      <div
        className="flex items-center gap-2 mb-4"
        style={{ background: inkA(0.06), borderRadius: 99, padding: "9px 14px" }}
      >
        <SearchIcon color={COLORS.inkSoft} size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search_surah")}
          className="font-ui flex-1 bg-transparent outline-none"
          style={{ color: COLORS.ink, fontSize: 13 }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((s) => {
          const readCount = (progress.readAyahs && progress.readAyahs[s.number]) || 0;
          const pct = readCount / s.ayahCount;
          return (
            <button
              key={s.number}
              onClick={() => onSelectSurah(s.number)}
              className="flex items-center justify-between active:scale-[0.98] transition"
              style={{ background: COLORS.parchment, borderRadius: 14, padding: "11px 14px", border: `1px solid ${COLORS.parchmentDark}` }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(0,0,0,0.04)" }}
                >
                  <span className="font-ui font-semibold" style={{ fontSize: 11.5, color: COLORS.inkSoft }}>
                    {s.number}
                  </span>
                </div>
                <div className="text-left">
                  <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
                    {s.translit}
                  </p>
                  <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 1 }}>
                    {trField(s, "meaning")} · {s.ayahCount} {t("verses_label")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span dir="rtl" className="font-arabic" style={{ color: COLORS.ink, fontSize: 15 }}>
                  {s.arabic}
                </span>
                {pct > 0 && <MiniRing pct={pct} color={COLORS.gold} done={pct >= 1} />}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="font-ui text-center mt-6" style={{ color: COLORS.inkSoft, fontSize: 12.5 }}>
            {t("no_surah_match")} "{query}"
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reciters — a living space for each voice: browse, preview, then step */
/* into that reciter's own room to read + listen to any surah           */
/* ------------------------------------------------------------------ */
const POPULAR_RECITER_IDS = [
  "ar.abdulbasitmurattal",
  "ar.abdurrahmaansudais",
  "ar.saoodshuraym",
  "ar.husary",
  "ar.minshawi",
  "ar.mahermuaiqly",
  "ar.hudhaify",
];
function reciterInitials(name) {
  const words = name.replace(/\(.*\)/g, "").trim().split(/[\s-]+/);
  return ((words[0]?.[0] || "") + (words[1]?.[0] || "")).toUpperCase();
}
// Every reciter's avatar shares the same accent-colored gradient — stands in
// for a portrait (we don't have photo rights) while staying consistent with
// the rest of the app's single-accent-color design instead of a different
// random hue per card.
function reciterGradient() {
  return `linear-gradient(135deg, ${COLORS.goldLight}, ${COLORS.gold})`;
}

function ReciterAvatar({ reciter, size = 52, fontSize = 16 }) {
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 font-display font-semibold"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        background: reciterGradient(),
        color: "#fff",
        fontSize,
        boxShadow: "0 3px 8px rgba(0,0,0,0.15)",
      }}
    >
      {reciterInitials(reciter.name)}
    </div>
  );
}

function ReciterCard({ r, active, onOpen, previewSrc }) {
  return (
    <button
      onClick={() => onOpen(r.id)}
      className="flex flex-col items-start active:scale-[0.97] transition relative"
      style={{
        background: COLORS.parchment,
        border: `1px solid ${active ? COLORS.goldLight : COLORS.parchmentDark}`,
        borderRadius: 18,
        padding: "14px 12px",
        textAlign: "left",
      }}
    >
      {active && (
        <div className="absolute" style={{ top: 10, right: 10 }}>
          <CheckIcon color={COLORS.goldLight} size={16} />
        </div>
      )}
      <ReciterAvatar reciter={r} />
      <p className="font-display font-semibold mt-2.5 leading-tight" style={{ color: COLORS.ink, fontSize: 13 }}>
        {r.name}
      </p>
      <p dir="rtl" className="font-arabic mt-0.5" style={{ color: COLORS.inkSoft, fontSize: 12 }}>
        {r.arabicName}
      </p>
      <div className="flex items-center justify-between mt-3" style={{ width: "100%" }}>
        <span className="font-ui font-semibold" style={{ color: COLORS.goldLight, fontSize: 10.5 }}>
          {t("listen_to_quran")}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <AudioPlayButton src={previewSrc} color={COLORS.inkSoft} size={26} />
        </div>
      </div>
    </button>
  );
}

function RecitersScreen({ onBack, onOpenReciterSpace, onOpenFullSurahReciter }) {
  const [currentReciter, setCurrentReciter] = useState(RECITERS[0].id);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(QURAN_RECITER_KEY, false);
        if (res && res.value) setCurrentReciter(res.value);
      } catch (e) {
        // no preference saved yet
      }
    })();
  }, []);

  const popular = RECITERS.filter((r) => POPULAR_RECITER_IDS.includes(r.id));
  const others = RECITERS.filter((r) => !POPULAR_RECITER_IDS.includes(r.id));

  const openSpace = (id) => {
    setCurrentReciter(id);
    window.storage.set(QURAN_RECITER_KEY, id, false).catch(() => {});
    onOpenReciterSpace(id);
  };

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-10 fade-in">
      <div className="flex items-center justify-between mb-1">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("title_reciters")}
        </p>
        <div className="w-9" />
      </div>
      <p className="font-ui text-center mb-5 px-2" style={{ color: COLORS.inkSoft, fontSize: 11.5, lineHeight: 1.5 }}>
        {RECITERS.length} {t("reciters_available")}
      </p>

      <p className="font-ui font-semibold mb-2.5" style={{ color: COLORS.goldLight, fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {t("most_followed")}
      </p>
      <div className="grid grid-cols-2 gap-2.5 mb-6">
        {popular.map((r) => (
          <ReciterCard key={r.id} r={r} active={r.id === currentReciter} onOpen={openSpace} previewSrc={reciterAudioUrl(r.id, 1)} />
        ))}
      </div>

      <p className="font-ui font-semibold mb-2.5" style={{ color: COLORS.inkSoft, fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {t("other_reciters")}
      </p>
      <div className="grid grid-cols-2 gap-2.5 mb-6">
        {others.map((r) => (
          <ReciterCard key={r.id} r={r} active={r.id === currentReciter} onOpen={openSpace} previewSrc={reciterAudioUrl(r.id, 1)} />
        ))}
      </div>

      <p className="font-ui font-semibold mb-1.5" style={{ color: COLORS.inkSoft, fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {t("full_surah_reciters")}
      </p>
      <p className="font-ui mb-2.5" style={{ color: COLORS.inkFaint, fontSize: 10.5, lineHeight: 1.4 }}>
        {t("full_surah_reciters_hint")}
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {FULL_SURAH_RECITERS.map((r) => (
          <ReciterCard
            key={r.id}
            r={r}
            active={false}
            onOpen={() => onOpenFullSurahReciter(r.id)}
            previewSrc={fullSurahAudioUrl(r, 1)}
          />
        ))}
      </div>
    </div>
  );
}

/* Reciter space — that reciter's own room: pick any surah to read + listen */
function ReciterSpaceScreen({ reciterId, onBack, onSelectSurah }) {
  const r = RECITERS.find((x) => x.id === reciterId) || RECITERS[0];

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-10 fade-in">
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("reciter_space")}
        </p>
        <div className="w-9" />
      </div>

      <div className="flex flex-col items-center mb-6">
        <ReciterAvatar reciter={r} size={68} fontSize={22} />
        <p className="font-display font-semibold mt-3" style={{ color: COLORS.ink, fontSize: 17 }}>
          {r.name}
        </p>
        <p dir="rtl" className="font-arabic mt-1" style={{ color: COLORS.inkSoft, fontSize: 14 }}>
          {r.arabicName}
        </p>
        <div className="mt-3">
          <AudioPlayButton src={reciterAudioUrl(r.id, 1)} color={COLORS.goldLight} size={36} />
        </div>
        <p className="font-ui mt-2" style={{ color: COLORS.inkSoft, fontSize: 11 }}>
          {t("114_surahs_choose")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {QURAN_SURAHS.map((s) => (
          <button
            key={s.number}
            onClick={() => onSelectSurah(s.number)}
            className="flex items-center justify-between active:scale-[0.98] transition"
            style={{ background: COLORS.parchment, borderRadius: 14, padding: "11px 14px", border: `1px solid ${COLORS.parchmentDark}` }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(0,0,0,0.04)" }}
              >
                <span className="font-ui font-semibold" style={{ fontSize: 11.5, color: COLORS.inkSoft }}>
                  {s.number}
                </span>
              </div>
              <div className="text-left">
                <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
                  {s.translit}
                </p>
                <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 1 }}>
                  {trField(s, "meaning")} · {s.ayahCount} {t("verses_label")}
                </p>
              </div>
            </div>
            <span dir="rtl" className="font-arabic flex-shrink-0" style={{ color: COLORS.ink, fontSize: 15 }}>
              {s.arabic}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Simple continuous playback for reciters only available as one file per
// surah (see FULL_SURAH_RECITERS) — no verse-by-verse sync since there's no
// per-ayah audio to sync against, just a straight-through listen that
// auto-advances surah to surah like a playlist, same as the ayah-by-ayah
// reader does verse to verse.
function FullSurahReciterScreen({ reciterId, onBack }) {
  const reciter = FULL_SURAH_RECITERS.find((r) => r.id === reciterId) || FULL_SURAH_RECITERS[0];
  const [playingSurah, setPlayingSurah] = useState(null);
  const audioRef = useRef(null);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      notifyAudioStop();
    }
    setPlayingSurah(null);
    clearMediaSession();
  }, []);

  const playSurah = (surahNumber, { continuing = false } = {}) => {
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(fullSurahAudioUrl(reciter, surahNumber));
    audioRef.current = audio;
    setPlayingSurah(surahNumber);
    if (!continuing) notifyAudioStart();
    const surahMeta = QURAN_SURAHS.find((s) => s.number === surahNumber);
    const next = surahNumber < 114 ? surahNumber + 1 : null;
    updateMediaSession({
      title: surahMeta ? surahMeta.translit : "",
      artist: reciter.name,
      playing: true,
      onPause: stopPlayback,
      onNext: next ? () => playSurah(next, { continuing: true }) : null,
    });
    audio.addEventListener("ended", () => {
      if (next) playSurah(next, { continuing: true });
      else stopPlayback();
    });
    audio.play().catch(() => {
      notifyAudioStop();
      clearMediaSession();
      setPlayingSurah(null);
    });
  };

  useEffect(() => stopPlayback, [stopPlayback]);

  const toggleSurah = (surahNumber) => {
    if (playingSurah === surahNumber) stopPlayback();
    else playSurah(surahNumber);
  };

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-10 fade-in">
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("reciter_space")}
        </p>
        <div className="w-9" />
      </div>

      <div className="flex flex-col items-center mb-6">
        <ReciterAvatar reciter={reciter} size={68} fontSize={22} />
        <p className="font-display font-semibold mt-3" style={{ color: COLORS.ink, fontSize: 17 }}>
          {reciter.name}
        </p>
        <p dir="rtl" className="font-arabic mt-1" style={{ color: COLORS.inkSoft, fontSize: 14 }}>
          {reciter.arabicName}
        </p>
        <p className="font-ui mt-2" style={{ color: COLORS.inkSoft, fontSize: 11 }}>
          {t("114_surahs_choose")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {QURAN_SURAHS.map((s) => {
          const playing = playingSurah === s.number;
          return (
            <button
              key={s.number}
              onClick={() => toggleSurah(s.number)}
              className="flex items-center justify-between active:scale-[0.98] transition"
              style={{
                background: playing ? `${COLORS.goldLight}1F` : COLORS.parchment,
                borderRadius: 14,
                padding: "11px 14px",
                border: `1px solid ${playing ? COLORS.goldLight : COLORS.parchmentDark}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 30, height: 30, borderRadius: 10, background: playing ? `${COLORS.goldLight}29` : "rgba(0,0,0,0.04)" }}
                >
                  {playing ? <PauseIcon color={COLORS.gold} size={13} /> : <PlayIcon color={COLORS.inkSoft} size={13} />}
                </div>
                <div className="text-left">
                  <p className="font-display font-semibold" style={{ color: playing ? COLORS.gold : COLORS.ink, fontSize: 14 }}>
                    {s.translit}
                  </p>
                  <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 1 }}>
                    {playing ? t("now_playing") : `${trField(s, "meaning")} · ${s.ayahCount} ${t("verses_label")}`}
                  </p>
                </div>
              </div>
              <span dir="rtl" className="font-arabic flex-shrink-0" style={{ color: COLORS.ink, fontSize: 15 }}>
                {s.arabic}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quran reader — verses of a single surah, fetched live               */
/* ------------------------------------------------------------------ */
function QuranReaderScreen({ surahNumber, arabicSize, onBack, onChangeSurah, onOpenReciters }) {
  const [ayahs, setAyahs] = useState(null);
  const [status, setStatus] = useState("loading"); // 'loading' | 'ready' | 'error'
  const [progress, setProgress] = useState({ lastSurah: null, lastAyah: null, readAyahs: {} });
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [reciter, setReciter] = useState(RECITERS[0].id);
  const [showSurahList, setShowSurahList] = useState(false);

  const surahMeta = QURAN_SURAHS.find((s) => s.number === surahNumber);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(QURAN_RECITER_KEY, false);
        if (res && res.value) setReciter(res.value);
      } catch (e) {
        // no preference saved yet
      }
    })();
  }, []);

  const currentReciterMeta = RECITERS.find((r) => r.id === reciter) || RECITERS[0];

  // Sequential ayah-by-ayah playback — the recitation follows the reading:
  // each ayah's audio auto-advances to the next one and highlights/scrolls to it.
  const [playingAyah, setPlayingAyah] = useState(null);
  const playerAudioRef = useRef(null);
  const ayahsRef = useRef([]);
  const ayahNodesRef = useRef(new Map());
  useEffect(() => {
    ayahsRef.current = ayahs;
  }, [ayahs]);

  const stopPlayback = useCallback(() => {
    if (playerAudioRef.current) {
      playerAudioRef.current.pause();
      playerAudioRef.current = null;
      notifyAudioStop();
    }
    setPlayingAyah(null);
    clearMediaSession();
  }, []);

  // `continuing` is true when this call is the auto-advance to the next ayah
  // in the same listening session — it must NOT toggle the background-audio
  // service off and back on, or the brief gap between disable() and the next
  // enable() can let Android suspend the WebView (especially with the screen
  // locked) right as the next ayah is about to start, cutting playback after
  // a single verse instead of continuing through the surah.
  const playAyah = (ayah, { continuing = false } = {}) => {
    if (playerAudioRef.current) {
      playerAudioRef.current.pause();
    }
    const audio = new Audio(reciterAudioUrl(reciter, ayah.number));
    playerAudioRef.current = audio;
    setPlayingAyah(ayah.n);
    if (!continuing) notifyAudioStart();
    const list = ayahsRef.current || [];
    const idx = list.findIndex((x) => x.n === ayah.n);
    const nextForSession = list[idx + 1];
    updateMediaSession({
      title: `${surahMeta ? surahMeta.translit : ""} — ${t("verse_label")} ${ayah.n}`,
      artist: currentReciterMeta.name,
      playing: true,
      onPause: stopPlayback,
      onNext: nextForSession ? () => playAyah(nextForSession, { continuing: true }) : null,
    });
    markQuranAyahRead(surahNumber, ayah.n).then(setProgress);
    const node = ayahNodesRef.current.get(ayah.n);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
    audio.addEventListener("ended", () => {
      const list = ayahsRef.current || [];
      const idx = list.findIndex((x) => x.n === ayah.n);
      const next = list[idx + 1];
      if (next) {
        playAyah(next, { continuing: true });
      } else {
        stopPlayback();
      }
    });
    audio.play().catch(() => {
      notifyAudioStop();
      clearMediaSession();
      setPlayingAyah(null);
    });
  };

  // Stop playback whenever the surah or reciter changes
  useEffect(() => {
    return () => stopPlayback();
  }, [surahNumber, reciter, stopPlayback]);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(QURAN_PROGRESS_KEY, false);
        if (res && res.value) setProgress(JSON.parse(res.value));
      } catch (e) {
        // no progress saved yet
      } finally {
        setProgressLoaded(true);
      }
    })();
  }, []);

  // Fetch the surah's Arabic text (public-domain scripture) and its
  // translation live from a Quran API — nothing is embedded in the app
  // itself. The translation edition follows the app's language (French,
  // English) and is skipped entirely in Arabic mode.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setAyahs(null);
    (async () => {
      try {
        const lang = currentLanguage;
        if (lang === "ar") {
          const arRes = await fetch(`${QURAN_API_BASE}/${surahNumber}/quran-uthmani`).then((r) => r.json());
          if (cancelled) return;
          const arList = arRes?.data?.ayahs || [];
          const merged = arList.map((a) => ({
            n: a.numberInSurah,
            number: a.number,
            arabic: a.text,
            translation: "",
          }));
          setAyahs(merged);
          setStatus("ready");
          return;
        }
        const edition = lang === "en" ? "en.sahih" : "fr.hamidullah";
        const [arRes, trRes] = await Promise.all([
          fetch(`${QURAN_API_BASE}/${surahNumber}/quran-uthmani`).then((r) => r.json()),
          fetch(`${QURAN_API_BASE}/${surahNumber}/${edition}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        const arList = arRes?.data?.ayahs || [];
        const trList = trRes?.data?.ayahs || [];
        const merged = arList.map((a, i) => ({
          n: a.numberInSurah,
          number: a.number,
          arabic: a.text,
          translation: trList[i] ? trList[i].text : "",
        }));
        setAyahs(merged);
        setStatus("ready");
      } catch (e) {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surahNumber, currentLanguage]);

  const markAyah = (ayahNumber) => {
    markQuranAyahRead(surahNumber, ayahNumber).then(setProgress);
  };

  const bookmarkedAyah = progress.lastSurah === surahNumber ? progress.lastAyah : null;

  // Long sourates (Al-Baqara has 286 ayat) made the first paint painfully
  // slow on a real phone if every ayah card rendered at once — render a
  // window that grows as the reader scrolls instead.
  const [visibleCount, setVisibleCount] = useState(25);
  useEffect(() => {
    setVisibleCount(25);
  }, [surahNumber]);
  const loadMoreRef = useRef(null);
  useEffect(() => {
    if (!ayahs || visibleCount >= ayahs.length) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((v) => Math.min(ayahs.length, v + 25));
        }
      },
      { rootMargin: "800px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ayahs, visibleCount]);

  if (!surahMeta) return null;

  return (
    <div className="min-h-screen flex flex-col px-5 pt-6 pb-10 fade-in">
      {showSurahList && (
        <div className="fixed inset-0" style={{ background: COLORS.bg, zIndex: 60 }}>
          <SurahListScreen
            onSelectSurah={(n) => {
              setShowSurahList(false);
              onChangeSurah(n);
            }}
            onBack={() => setShowSurahList(false)}
          />
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <button onClick={onBack} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("back")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <div className="text-center">
          <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 15 }}>
            {surahMeta.translit}
          </p>
          <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11 }}>
            {surahMeta.meaning} · {surahMeta.ayahCount} versets
          </p>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex items-center justify-between mb-4 px-1">
        <button
          onClick={() => surahNumber > 1 && onChangeSurah(surahNumber - 1)}
          disabled={surahNumber <= 1}
          className="p-2.5 active:opacity-60"
          style={{ opacity: surahNumber <= 1 ? 0.3 : 1 }}
          aria-label={t("nav_previous")}
        >
          <ChevronIcon dir="left" color={COLORS.ink} />
        </button>
        <button onClick={() => setShowSurahList(true)} className="flex items-center gap-1 active:opacity-70">
          <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 12 }}>
            {t("surah_label")} {surahNumber} / 114
          </span>
          <ChevronIcon dir="right" color={COLORS.inkSoft} size={11} />
        </button>
        <button
          onClick={() => surahNumber < 114 && onChangeSurah(surahNumber + 1)}
          disabled={surahNumber >= 114}
          className="p-2.5 active:opacity-60"
          style={{ opacity: surahNumber >= 114 ? 0.3 : 1 }}
          aria-label={t("nav_next")}
        >
          <ChevronIcon dir="right" color={COLORS.ink} />
        </button>
      </div>

      {/* Reciter picker + ayah-by-ayah playback that follows the reading */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => {
            if (playingAyah !== null) {
              stopPlayback();
            } else if (ayahs && ayahs.length) {
              playAyah(ayahs[0]);
            }
          }}
          className="flex items-center justify-center active:opacity-60 flex-shrink-0"
          style={{ width: 36, height: 36, borderRadius: 99, background: "rgba(0,0,0,0.05)" }}
          aria-label={playingAyah !== null ? t("pause_recitation") : t("play_surah")}
        >
          {playingAyah !== null ? (
            <PauseIcon color={COLORS.goldLight} size={16} />
          ) : (
            <PlayIcon color={COLORS.goldLight} size={16} />
          )}
        </button>
        <button
          onClick={onOpenReciters}
          className="flex-1 flex items-center justify-between active:opacity-80"
          style={{
            background: inkA(0.06),
            borderRadius: 99,
            padding: "7px 6px 7px 14px",
          }}
        >
          <span className="font-ui font-semibold" style={{ color: COLORS.ink, fontSize: 12.5 }}>
            {currentReciterMeta.name}
          </span>
          <span
            className="font-ui font-semibold flex items-center gap-1"
            style={{ color: COLORS.goldLight, fontSize: 11, padding: "5px 10px", borderRadius: 99, background: `${COLORS.goldLight}29` }}
          >
            {t("change_label")}
            <ChevronIcon dir="right" color={COLORS.goldLight} size={12} />
          </span>
        </button>
      </div>

      <p className="font-ui text-center mb-5" style={{ color: COLORS.inkSoft, fontSize: 11, letterSpacing: 0.3 }}>
        {t("recitation_mushaf_hint")}
      </p>

      {status === "loading" && (
        <p className="font-ui text-center mt-10" style={{ color: COLORS.inkSoft, fontSize: 13 }}>
          {t("loading_surah")}
        </p>
      )}

      {status === "error" && (
        <p className="font-ui text-center mt-10 px-4" style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.6 }}>
          {t("error_load_surah")}
        </p>
      )}

      {status === "ready" && ayahs && (
        <div className="flex flex-col gap-3">
          {ayahs.slice(0, visibleCount).map((a) => {
            const isBookmark = bookmarkedAyah === a.n;
            const isPlaying = playingAyah === a.n;
            return (
              <div
                key={a.n}
                ref={(node) => {
                  if (node) ayahNodesRef.current.set(a.n, node);
                  else ayahNodesRef.current.delete(a.n);
                }}
                style={{
                  background: isPlaying ? `${COLORS.goldLight}24` : COLORS.parchment,
                  borderRadius: 16,
                  padding: "14px 16px",
                  border: `1px solid ${isPlaying ? COLORS.goldLight : isBookmark ? COLORS.gold : COLORS.parchmentDark}`,
                  transition: "background 0.2s ease, border-color 0.2s ease",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-ui font-semibold flex items-center justify-center"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 99,
                        background: "rgba(0,0,0,0.05)",
                        fontSize: 10.5,
                        color: COLORS.inkSoft,
                      }}
                    >
                      {a.n}
                    </span>
                    <button
                      onClick={() => (isPlaying ? stopPlayback() : playAyah(a))}
                      className="flex items-center justify-center active:opacity-60"
                      style={{ width: 22, height: 22, borderRadius: 99, background: "rgba(0,0,0,0.05)" }}
                      aria-label={isPlaying ? t("pause_label") : t("play_from_verse")}
                    >
                      {isPlaying ? (
                        <PauseIcon color={COLORS.goldLight} size={10} />
                      ) : (
                        <PlayIcon color={COLORS.inkSoft} size={10} />
                      )}
                    </button>
                  </div>
                  <button
                    onClick={() => markAyah(a.n)}
                    className="active:opacity-60 flex items-center gap-1"
                    aria-label={isBookmark ? t("remove_bookmark") : t("add_bookmark")}
                  >
                    <BookmarkIcon color={isBookmark ? COLORS.gold : COLORS.parchmentDark} filled={isBookmark} />
                  </button>
                </div>
                <p dir="rtl" className="font-arabic text-right" style={{ color: COLORS.ink, fontSize: arabicSize || ARABIC_SIZES.md, lineHeight: 1.9 }}>
                  {a.arabic}
                </p>
                {a.translation && (
                  <p className="font-display mt-2.5" style={{ color: COLORS.inkSoft, fontSize: 13, fontStyle: "italic", lineHeight: 1.55 }}>
                    {a.translation}
                  </p>
                )}
              </div>
            );
          })}
          {visibleCount < ayahs.length && (
            <div ref={loadMoreRef} className="flex items-center justify-center" style={{ padding: "10px 0" }}>
              <span
                className="animate-spin"
                style={{ width: 18, height: 18, borderRadius: 99, border: `2px solid ${COLORS.inkSoft}`, borderTopColor: "transparent" }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const toArabicDigits = (n) => String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);

function BookmarkIcon({ color, filled, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill={filled ? color : "transparent"}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Independent Mushaf — real page-by-page pagination (Hafs/Uthmani),   */
/* fetched live so the printed layout (604 pages) stays authentic.     */
/* ------------------------------------------------------------------ */
// Thin wrapper: the bottom-tab "Coran" entry point, always restoring/saving
// the last page the user was on, wherever in the Mushaf that was.
function QuranMushafScreen({ onBack }) {
  return <MushafPageView initialPage={1} persistKey={QURAN_MUSHAF_PAGE_KEY} showHeader onBack={onBack} />;
}

// Full-screen "aller à…" picker: jump straight to a Juz (1-30) or a Sourate
// (1-114) instead of typing a raw page number.
function MushafJumpOverlay({ onSelectSurah, onSelectJuz, onSelectBookmark, onDeleteBookmark, bookmarks, initialTab, onClose }) {
  const [tab, setTab] = useState(initialTab || "surah"); // 'surah' | 'juz' | 'bookmarks'
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? QURAN_SURAHS.filter(
        (s) =>
          s.translit.toLowerCase().includes(q) ||
          s.meaning.toLowerCase().includes(q) ||
          (s.meaning_en && s.meaning_en.toLowerCase().includes(q)) ||
          s.arabic.includes(query.trim()) ||
          String(s.number) === q
      )
    : QURAN_SURAHS;

  return (
    <div className="fixed inset-0 flex flex-col fade-in" style={{ background: COLORS.bg, zIndex: 60 }}>
      <div className="flex items-center justify-between px-5 pt-6 pb-3">
        <button onClick={onClose} className="p-2.5 -ml-2 active:opacity-60" aria-label={t("close")}>
          <BackIcon color={COLORS.ink} />
        </button>
        <p className="font-display" style={{ color: COLORS.ink, fontSize: 15 }}>
          {t("go_to_ellipsis")}
        </p>
        <div className="w-9" />
      </div>

      <div className="flex px-5 gap-2 mb-4">
        {[
          { id: "surah", label: t("tab_surah") },
          { id: "juz", label: t("tab_juz") },
          { id: "bookmarks", label: t("tab_bookmarks") },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => setTab(opt.id)}
            className="flex-1 font-ui font-semibold active:opacity-80"
            style={{
              padding: "9px 0",
              borderRadius: 12,
              fontSize: 13,
              background: tab === opt.id ? COLORS.goldLight : inkA(0.06),
              color: tab === opt.id ? COLORS.bg : COLORS.inkSoft,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {tab === "surah" ? (
        <div className="flex-1 flex flex-col px-5 overflow-hidden">
          <div
            className="flex items-center gap-2 mb-3 flex-shrink-0"
            style={{ background: inkA(0.06), borderRadius: 99, padding: "9px 14px" }}
          >
            <SearchIcon color={COLORS.inkSoft} size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search_surah")}
              className="font-ui flex-1 bg-transparent outline-none"
              style={{ color: COLORS.ink, fontSize: 13 }}
            />
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 pb-8">
            {filtered.map((s) => (
              <button
                key={s.number}
                onClick={() => onSelectSurah(s.number)}
                className="flex items-center justify-between active:scale-[0.98] transition"
                style={{ background: COLORS.parchment, borderRadius: 14, padding: "11px 14px", border: `1px solid ${COLORS.parchmentDark}` }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(0,0,0,0.04)" }}
                  >
                    <span className="font-ui font-semibold" style={{ fontSize: 11.5, color: COLORS.inkSoft }}>
                      {s.number}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
                      {s.translit}
                    </p>
                    <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 1 }}>
                      {trField(s, "meaning")} · {s.ayahCount} {t("verses_label")}
                    </p>
                  </div>
                </div>
                <span dir="rtl" className="font-arabic" style={{ color: COLORS.ink, fontSize: 15 }}>
                  {s.arabic}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : tab === "juz" ? (
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          <div className="grid grid-cols-4 gap-2.5">
            {JUZ_START_PAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => onSelectJuz(i + 1)}
                className="flex items-center justify-center active:scale-[0.95] transition"
                style={{
                  aspectRatio: "1",
                  borderRadius: 14,
                  background: COLORS.parchment,
                  border: `1px solid ${COLORS.parchmentDark}`,
                }}
              >
                <span className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 16 }}>
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          {bookmarks.length === 0 ? (
            <p className="font-ui text-center mt-10" style={{ color: COLORS.inkSoft, fontSize: 12.5, lineHeight: 1.6 }}>
              {t("no_bookmarks")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {bookmarks.map((b) => {
                const meta = QURAN_SURAHS.find((s) => s.number === b.chapterNumber);
                return (
                  <div
                    key={b.page}
                    className="flex items-center justify-between"
                    style={{ background: COLORS.parchment, borderRadius: 14, padding: "11px 14px", border: `1px solid ${COLORS.parchmentDark}` }}
                  >
                    <button onClick={() => onSelectBookmark(b.page)} className="flex-1 text-left active:opacity-70">
                      <p className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 14 }}>
                        {t("page_label")} {b.page}
                      </p>
                      {meta && (
                        <p className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 1 }}>
                          {t("surah_label")} {meta.translit}
                        </p>
                      )}
                    </button>
                    <button onClick={() => onDeleteBookmark(b.page)} className="p-2 active:opacity-60" aria-label={t("delete_bookmark")}>
                      <TrashIcon color={COLORS.clay} size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The actual page-by-page, pixel-accurate Mushaf renderer. Reused both by the
// standalone Mushaf screen above and by the per-surah reader's "Mushaf (arabe
// seul)" tab (started at that surah's first printed page, no header of its own
// since it's embedded under the reader's existing header/tabs).
function MushafPageView({ initialPage, persistKey, showHeader = false, onBack }) {
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [pageData, setPageData] = useState(null);
  const [fontFamily, setFontFamily] = useState(null);
  const [status, setStatus] = useState("loading"); // 'loading' | 'ready' | 'error'
  const [pageInput, setPageInput] = useState("");
  const [restoredInitial, setRestoredInitial] = useState(!persistKey);
  const [scale, setScale] = useState(1);
  const [pageMarked, setPageMarked] = useState(false);
  const [jumpOverlayOpen, setJumpOverlayOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const pageContainerRef = useRef(null);
  const pageContentRef = useRef(null);
  const touchStartXRef = useRef(null);
  // Suppresses the belt-and-braces auto-mark timer right after a manual
  // "reset read pages" so it doesn't immediately re-mark the page the
  // reader was looking at when they reset — see the timer's own effect
  // further down for the full explanation.
  const suppressAutoMarkRef = useRef(false);

  // Jump to the surah's first page whenever the caller changes it (e.g. the
  // reader switches surah while the Mushaf tab is active).
  useEffect(() => {
    if (!persistKey) setPageNumber(initialPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPage, persistKey]);

  useEffect(() => {
    loadBookmarks().then(setBookmarks);
  }, []);

  // Keep the screen on for as long as this reading view is mounted, whether
  // it's the standalone full-screen Mushaf or the embedded per-surah tab.
  useEffect(() => {
    KeepAwake.keepAwake().catch(() => {});
    return () => {
      KeepAwake.allowSleep().catch(() => {});
    };
  }, []);

  // Restore last-read page once on mount (only for the persisted/standalone screen)
  useEffect(() => {
    if (!persistKey) return;
    (async () => {
      try {
        const res = await window.storage.get(persistKey, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.page) setPageNumber(parsed.page);
        }
      } catch (e) {
        // no saved page yet, start at 1
      } finally {
        setRestoredInitial(true);
      }
    })();
  }, [persistKey]);

  const persistPage = useCallback(
    async (page) => {
      if (!persistKey) return;
      try {
        await window.storage.set(persistKey, JSON.stringify({ page }), false);
      } catch (e) {
        // ignore storage failures
      }
    },
    [persistKey]
  );

  // Fetch this exact printed page's word-level layout (line numbers + QCF glyph
  // codes) plus its matching per-page font, so the page renders with the exact
  // line breaks of a real printed Mushaf.
  useEffect(() => {
    if (!restoredInitial) return;
    let cancelled = false;
    setStatus("loading");
    setPageData(null);
    setFontFamily(null);
    (async () => {
      try {
        const [data, family] = await Promise.all([fetchMushafPage(pageNumber), loadMushafPageFont(pageNumber)]);
        if (cancelled) return;
        if (!data.lines.length) throw new Error("empty page");
        setPageData(data);
        setFontFamily(family);
        setStatus("ready");
        persistPage(pageNumber);
      } catch (e) {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageNumber, restoredInitial, persistPage]);

  // The last word on the page marks how far into the Qur'an this page took
  // the reader — that's what "marking the page as read" actually records.
  const lastWord = pageData ? pageData.lines[pageData.lines.length - 1]?.words.slice(-1)[0] : null;

  // Reflects whether THIS page was already marked read on a previous visit,
  // so the button shows real state instead of always starting unmarked.
  useEffect(() => {
    setPageMarked(false);
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get(QURAN_READ_PAGES_KEY, false);
        if (cancelled || !res || !res.value) return;
        const pages = JSON.parse(res.value);
        if (pages.includes(pageNumber)) setPageMarked(true);
      } catch (e) {
        // none read yet
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageNumber]);

  const markCurrentPageRead = useCallback(() => {
    if (!lastWord) return;
    markQuranAyahRead(lastWord.chapterNumber, lastWord.verseNumber);
    markMushafPageRead(pageNumber).then(() => setPageMarked(true));
  }, [lastWord?.chapterNumber, lastWord?.verseNumber, pageNumber]);

  // Belt and braces: mark the page automatically a few seconds after it
  // loads (so the Bilan always moves even if the button below goes
  // unnoticed), but the button still gives an instant, deliberate way to
  // mark it right away — by the time someone taps it, it's usually already
  // ticked, which is exactly the confirmation it's meant to give.
  //
  // Deliberately NOT gated on pageMarked: that flag reflects the LIFETIME
  // "ever read this page" list, which drives the checkmark shown below —
  // but re-reading a page you've visited on some earlier day must still
  // count toward *today's* Bilan. Gating the timer on pageMarked meant a
  // familiar page (already checkmarked from a previous day) would never
  // re-trigger the timer at all, so today's count silently never moved for
  // any page that wasn't brand new. markCurrentPageRead/markMushafPageRead
  // already dedupe per day internally, so calling it again here is safe.
  //
  // Resetting clears pageMarked back to false, which — same as loading a
  // fresh page — re-arms this timer. Without suppressAutoMarkRef it would
  // silently re-mark the very page someone just reset a few seconds later,
  // making the reset button look like it did nothing. The suppression only
  // lasts until the reader actually turns the page.
  useEffect(() => {
    if (!lastWord) return;
    const timer = setTimeout(() => {
      if (!suppressAutoMarkRef.current) markCurrentPageRead();
    }, 3000);
    return () => clearTimeout(timer);
  }, [lastWord?.chapterNumber, lastWord?.verseNumber, markCurrentPageRead]);

  useEffect(() => {
    suppressAutoMarkRef.current = false;
  }, [pageNumber]);

  const handleMarkPage = () => {
    tapHaptic();
    markCurrentPageRead();
  };

  // Clears the whole "read pages" trail — both the lifetime list (which
  // pages you've ever marked, driving the checkmark) and the daily counts
  // the Bilan reads from — so a misclick or a deliberate restart doesn't
  // require digging into Réglages > Données, which would also wipe
  // everything else (azkar, tasbih, personal invocations).
  const handleResetReadPages = async () => {
    tapHaptic();
    suppressAutoMarkRef.current = true;
    try {
      await window.storage.delete(QURAN_READ_PAGES_KEY, false);
    } catch (e) {
      // nothing to delete
    }
    try {
      await window.storage.delete(QURAN_PAGES_DAILY_KEY, false);
    } catch (e) {
      // nothing to delete
    }
    try {
      await window.storage.delete(QURAN_PAGES_DAILY_MARKED_KEY, false);
    } catch (e) {
      // nothing to delete
    }
    setPageMarked(false);
  };

  const isBookmarked = bookmarks.some((b) => b.page === pageNumber);
  const handleToggleBookmark = () => {
    tapHaptic();
    setBookmarks((prev) => {
      const next = isBookmarked
        ? prev.filter((b) => b.page !== pageNumber)
        : [...prev, { page: pageNumber, chapterNumber: pageData ? pageData.chapterNumber : null }].sort((a, b) => a.page - b.page);
      saveBookmarks(next);
      return next;
    });
  };
  const handleDeleteBookmark = (page) => {
    setBookmarks((prev) => {
      const next = prev.filter((b) => b.page !== page);
      saveBookmarks(next);
      return next;
    });
  };

  // Reset to full size on every new page, then shrink or grow step by step
  // until the whole page fills the available height without scrolling —
  // mimics turning a physical Mushaf page. Growing (not just shrinking)
  // matters in landscape, where the container is much shorter but plenty
  // wide: without it the text stayed at portrait size, leaving a big empty
  // gap instead of filling the space.
  useEffect(() => {
    setScale(1);
  }, [pageData]);

  // Re-fit whenever the viewport itself changes shape (e.g. rotating the
  // device) — orientation changes don't touch pageData/scale on their own,
  // so without this the fit from before the rotation would just stick.
  useEffect(() => {
    const handleResize = () => setScale(1);
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!pageContentRef.current || !pageContainerRef.current) return;
    const contentH = pageContentRef.current.scrollHeight;
    const containerH = pageContainerRef.current.clientHeight;
    if (contentH > containerH && scale > 0.55) {
      setScale((s) => Math.max(0.55, +(s - 0.04).toFixed(2)));
    } else if (contentH < containerH * 0.94 && scale < 2.2) {
      setScale((s) => Math.min(2.2, +(s + 0.04).toFixed(2)));
    }
  }, [scale, pageData]);

  // The standalone Mushaf screen reads full-screen and immersive — hide the
  // system status bar for as long as it's open, restore it on the way out.
  useEffect(() => {
    if (!showHeader) return;
    StatusBar.hide().catch(() => {});
    return () => {
      StatusBar.show().catch(() => {});
    };
  }, [showHeader]);

  const goToPage = (n) => {
    const clamped = Math.min(Math.max(1, n), QURAN_TOTAL_PAGES);
    setPageNumber(clamped);
  };

  const handleJump = () => {
    const n = parseInt(pageInput, 10);
    if (!Number.isNaN(n)) goToPage(n);
    setPageInput("");
  };

  const handleSelectJuz = (juzNumber) => {
    goToPage(JUZ_START_PAGES[juzNumber - 1]);
    setJumpOverlayOpen(false);
  };

  const handleSelectSurah = (chapterNumber) => {
    setJumpOverlayOpen(false);
    fetchChapterStartPage(chapterNumber).then(goToPage);
  };

  // Swipe navigation: the Mushaf is read right-to-left, so swiping toward the
  // right advances to the next page, mirroring the buttons below.
  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(deltaX) < 60) return;
    if (deltaX > 0) goToPage(pageNumber + 1);
    else goToPage(pageNumber - 1);
  };

  const headerSurahMeta = pageData && pageData.chapterNumber ? QURAN_SURAHS.find((s) => s.number === pageData.chapterNumber) : null;
  const headerSurahTranslit = headerSurahMeta ? headerSurahMeta.translit : "";
  const headerJuz = pageData ? pageData.juzNumber : null;

  return (
    <div
      className={showHeader ? "relative flex flex-col px-4 pt-2 pb-3 fade-in" : "flex flex-col fade-in"}
      style={{ height: showHeader ? "100vh" : "72vh", boxSizing: "border-box" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {jumpOverlayOpen && (
        <MushafJumpOverlay
          onSelectSurah={handleSelectSurah}
          onSelectJuz={handleSelectJuz}
          bookmarks={bookmarks}
          onSelectBookmark={(page) => {
            goToPage(page);
            setJumpOverlayOpen(false);
          }}
          onDeleteBookmark={handleDeleteBookmark}
          onClose={() => setJumpOverlayOpen(false)}
        />
      )}

      {showHeader && (
        <button
          onClick={onBack}
          className="absolute active:opacity-60"
          style={{ top: 8, left: 8, zIndex: 5, padding: 8, borderRadius: 99, background: inkA(0.06) }}
          aria-label={t("back")}
        >
          <BackIcon color={COLORS.ink} />
        </button>
      )}

      <div ref={pageContainerRef} className="flex-1" style={{ overflow: "hidden" }}>
        {status === "loading" && (
          <p className="font-ui text-center mt-16" style={{ color: COLORS.inkSoft, fontSize: 13 }}>
            {t("loading_page")}
          </p>
        )}

        {status === "error" && (
          <p className="font-ui text-center mt-16 px-4" style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.6 }}>
            {t("error_load_page")}
          </p>
        )}

        {status === "ready" && pageData && pageData.lines.length > 0 && (
          <div ref={pageContentRef} className="flex flex-col h-full">
            {/* Running header — surah name (left) / juz (right), plain and minimal */}
            <div
              className="flex items-center justify-between px-1"
              style={{ paddingBottom: 10, paddingLeft: showHeader ? 40 : undefined, borderBottom: `1px solid ${inkA(0.1)}` }}
            >
              <span className="font-display font-semibold" style={{ color: COLORS.ink, fontSize: 15 }}>
                {t("surah_label")} {headerSurahTranslit}
              </span>
              {headerJuz && (
                <span className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 12 }}>
                  Juz {headerJuz}
                </span>
              )}
            </div>

            <div className="flex-1 flex flex-col justify-center px-1" style={{ paddingTop: 14 * scale, paddingBottom: 14 * scale }}>
              {pageData.lines.map((line) => {
                const surahMeta = line.surahStart ? QURAN_SURAHS.find((s) => s.number === line.surahStart) : null;
                const lineText = line.words.map((w) => w.code).join(" ");
                return (
                  <div key={line.lineNumber}>
                    {surahMeta && (
                      <>
                        {/* Ornamental surah title cartouche */}
                        <div
                          className="flex items-center justify-center gap-3"
                          style={{
                            border: `1.5px solid ${COLORS.goldLight}`,
                            borderRadius: 4,
                            padding: `${8 * scale}px ${8 * scale}px`,
                            marginBottom: 16 * scale,
                          }}
                        >
                          <p dir="rtl" className="font-arabic" style={{ color: COLORS.ink, fontSize: 19 * scale }}>
                            سُورَةُ {surahMeta.arabic}
                          </p>
                        </div>
                        {surahMeta.number !== 1 && surahMeta.number !== 9 && (
                          <p dir="rtl" className="font-arabic text-center" style={{ color: COLORS.ink, fontSize: 21 * scale, marginBottom: 16 * scale }}>
                            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                          </p>
                        )}
                      </>
                    )}
                    <p
                      dir="rtl"
                      className="font-arabic"
                      style={{
                        color: COLORS.ink,
                        fontSize: 30 * scale,
                        lineHeight: 2.05,
                        textAlign: "justify",
                        textAlignLast: "justify",
                        fontFamily: fontFamily || undefined,
                      }}
                    >
                      {lineText}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-2.5 mt-1">
              <span className="font-ui" style={{ color: COLORS.inkSoft, fontSize: 12 }}>
                {pageNumber}
              </span>
              <button
                onClick={handleToggleBookmark}
                className="p-1.5 active:opacity-70"
                style={{ borderRadius: 99, background: isBookmarked ? `${COLORS.goldLight}29` : inkA(0.06) }}
                aria-label={isBookmarked ? t("remove_bookmark") : t("add_bookmark")}
              >
                <StarIcon color={isBookmarked ? COLORS.goldLight : COLORS.inkSoft} filled={isBookmarked} size={14} />
              </button>
              <button
                onClick={handleMarkPage}
                className="flex items-center gap-1.5 active:opacity-70"
                style={{
                  background: pageMarked ? `${COLORS.goldLight}29` : inkA(0.06),
                  border: `1px solid ${pageMarked ? COLORS.goldLight : inkA(0.18)}`,
                  borderRadius: 99,
                  padding: "5px 12px",
                }}
                aria-label={t("mark_page_read")}
              >
                {pageMarked ? <CheckIcon color={COLORS.goldLight} size={13} /> : <BookmarkIcon color={COLORS.inkSoft} size={13} />}
                <span className="font-ui font-semibold" style={{ color: pageMarked ? COLORS.goldLight : COLORS.inkSoft, fontSize: 11 }}>
                  {pageMarked ? t("page_read") : t("mark_page_read")}
                </span>
              </button>
              <button
                onClick={handleResetReadPages}
                className="p-1.5 active:opacity-70"
                style={{ borderRadius: 99, background: inkA(0.06) }}
                aria-label={t("reset_read_pages")}
              >
                <ResetIcon color={COLORS.inkSoft} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-2 px-1">
        <button
          onClick={() => goToPage(pageNumber - 1)}
          disabled={pageNumber <= 1}
          className="p-2.5 active:opacity-60"
          style={{ opacity: pageNumber <= 1 ? 0.3 : 1 }}
          aria-label={t("nav_previous")}
        >
          <ChevronIcon dir="left" color={COLORS.ink} />
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setJumpOverlayOpen(true)}
            className="active:opacity-60 flex items-center justify-center"
            style={{ width: 30, height: 30, borderRadius: 10, background: inkA(0.08) }}
            aria-label={t("jump_to_surah_juz")}
          >
            <LayersIcon color={COLORS.ink} size={15} />
          </button>
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleJump()}
            placeholder={`${pageNumber} / ${QURAN_TOTAL_PAGES}`}
            inputMode="numeric"
            className="font-ui text-center"
            style={{
              width: 84,
              background: inkA(0.08),
              border: `1px solid ${inkA(0.2)}`,
              borderRadius: 10,
              padding: "6px 8px",
              fontSize: 12.5,
              color: COLORS.ink,
              outline: "none",
            }}
          />
          <button
            onClick={handleJump}
            className="font-ui font-semibold active:opacity-70"
            style={{ color: COLORS.goldLight, fontSize: 12.5 }}
          >
            Aller
          </button>
        </div>

        <button
          onClick={() => goToPage(pageNumber + 1)}
          disabled={pageNumber >= QURAN_TOTAL_PAGES}
          className="p-2.5 active:opacity-60"
          style={{ opacity: pageNumber >= QURAN_TOTAL_PAGES ? 0.3 : 1 }}
          aria-label={t("nav_next")}
        >
          <ChevronIcon dir="right" color={COLORS.ink} />
        </button>
      </div>
    </div>
  );
}

export default AzkarApp;
