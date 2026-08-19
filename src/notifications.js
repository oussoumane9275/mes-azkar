import { LocalNotifications } from "@capacitor/local-notifications";

// Reserved notification-id range for prayer reminders: day 0 (today) uses
// ids 1-5, day 1 uses ids 11-15, etc — fixed ids let us cleanly cancel and
// re-schedule every time settings/location change instead of piling up.
// Covers a week so reminders don't silently stop if the app isn't reopened daily.
const REMINDER_DAYS_AHEAD = 7;
const PRAYERS_FOR_REMINDERS = [
  { key: "fajr", label: "Fajr" },
  { key: "dhuhr", label: "Dohr" },
  { key: "asr", label: "Asr" },
  { key: "maghrib", label: "Maghrib" },
  { key: "isha", label: "Isha" },
];
const DAY_OFFSETS = Array.from({ length: REMINDER_DAYS_AHEAD }, (_, i) => i);
const ALL_NOTIFICATION_IDS = DAY_OFFSETS.flatMap((dayOffset) =>
  PRAYERS_FOR_REMINDERS.map((_, i) => dayOffset * 10 + i + 1)
);

// Seven adhan recordings bundled as Android raw resources (res/raw/adhan_N.mp3)
// so the sound plays even when the app is closed — a remote URL can't be
// used as a notification sound on Android. Labelled generically since we
// can't reliably attribute each recording to a named muezzin. The same files
// are also copied under public/audio/adhan/ purely so the Réglages screen can
// preview them with a normal <audio> element (the res/raw copies are what
// actually get used for the notification sound).
export const ADHAN_VOICES = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  id: `adhan_${n}`,
  label: `Voix ${n}`,
  audio: `/audio/adhan/adhan_${n}.mp3`,
}));
export const DEFAULT_MUEZZIN = ADHAN_VOICES[0].id;

// Android 8+ ties notification sound to the channel, not the individual
// notification, and a channel's sound can't be changed after creation — so
// each voice gets its own fixed channel, created once up front.
let channelsReady = false;
export async function ensureAdhanChannels() {
  if (channelsReady) return;
  await Promise.all(
    ADHAN_VOICES.map((v) =>
      LocalNotifications.createChannel({
        id: `${v.id}_channel`,
        name: `Adhan — ${v.label}`,
        sound: `${v.id}.mp3`,
        importance: 5,
        visibility: 1,
      }).catch(() => {})
    )
  );
  channelsReady = true;
}

function decimalHourToDate(baseDate, decimalHour) {
  const d = new Date(baseDate);
  const h = Math.floor(((decimalHour % 24) + 24) % 24);
  const m = Math.round((decimalHour - Math.floor(decimalHour)) * 60);
  d.setHours(h, m, 0, 0);
  return d;
}

export async function isNotificationPermissionGranted() {
  const { display } = await LocalNotifications.checkPermissions();
  return display === "granted";
}

export async function requestNotificationPermission() {
  const { display } = await LocalNotifications.requestPermissions();
  return display === "granted";
}

// Cancels any previously scheduled prayer reminders (safe to call even if none exist).
export async function cancelPrayerNotifications() {
  await LocalNotifications.cancel({ notifications: ALL_NOTIFICATION_IDS.map((id) => ({ id })) });
}

// (Re)schedules reminders for the next week's five daily prayers, skipping
// any time that has already passed and any prayer switched off individually
// via enabledPrayers (e.g. { fajr: true, dhuhr: false, ... }). muezzinByPrayer
// picks which bundled adhan voice/channel plays for each prayer. Call this on
// app load and whenever the location, calculation method, or per-prayer
// toggles change, so times and the active set stay accurate.
export async function syncPrayerNotifications(computeTimesForDate, enabledPrayers, muezzinByPrayer) {
  await ensureAdhanChannels();
  await cancelPrayerNotifications();
  const now = new Date();
  const notifications = [];

  DAY_OFFSETS.forEach((dayOffset) => {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    const decimals = computeTimesForDate(day);

    PRAYERS_FOR_REMINDERS.forEach((p, i) => {
      if (enabledPrayers && enabledPrayers[p.key] === false) return;
      const at = decimalHourToDate(day, decimals[p.key]);
      if (at <= now) return;
      const voice = (muezzinByPrayer && muezzinByPrayer[p.key]) || DEFAULT_MUEZZIN;
      notifications.push({
        id: dayOffset * 10 + i + 1,
        title: p.label,
        body: `C'est l'heure de la prière de ${p.label}.`,
        schedule: { at },
        sound: `${voice}.mp3`,
        channelId: `${voice}_channel`,
      });
    });
  });

  if (notifications.length) {
    await LocalNotifications.schedule({ notifications });
  }
}
