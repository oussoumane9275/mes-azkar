import { LocalNotifications } from "@capacitor/local-notifications";

// Reserved notification-id range for prayer reminders: day 0 (today) uses
// ids 1-5, day 1 uses ids 11-15, etc — fixed ids let us cleanly cancel and
// re-schedule every time settings/location change instead of piling up.
// Covers a week so reminders don't silently stop if the app isn't reopened daily.
const REMINDER_DAYS_AHEAD = 7;
const PRAYERS_FOR_REMINDERS = [
  { key: "fajr", label: "Fajr", label_ar: "الفجر" },
  { key: "dhuhr", label: "Dohr", label_en: "Dhuhr", label_ar: "الظهر" },
  { key: "asr", label: "Asr", label_ar: "العصر" },
  { key: "maghrib", label: "Maghrib", label_ar: "المغرب" },
  { key: "isha", label: "Isha", label_ar: "العشاء" },
];
function prayerReminderLabel(p, lang) {
  if (lang === "ar" && p.label_ar) return p.label_ar;
  if (lang === "en" && p.label_en) return p.label_en;
  return p.label;
}
function prayerReminderBody(label, lang) {
  if (lang === "en") return `It's time for ${label} prayer.`;
  if (lang === "ar") return `حان الآن وقت صلاة ${label}.`;
  return `C'est l'heure de la prière de ${label}.`;
}
const DAY_OFFSETS = Array.from({ length: REMINDER_DAYS_AHEAD }, (_, i) => i);
const ALL_NOTIFICATION_IDS = DAY_OFFSETS.flatMap((dayOffset) =>
  PRAYERS_FOR_REMINDERS.map((_, i) => dayOffset * 10 + i + 1)
);

// Five adhan recordings bundled as Android raw resources (res/raw/adhan_*.mp3)
// so the sound plays even when the app is closed — a remote URL can't be
// used as a notification sound on Android. Sourced from aladhan.com (the
// prayer-times sibling of the alquran.cloud CDN already used elsewhere in
// this app) and tvquran.com, both of which credit each recording to a named
// muezzin — unlike the original anonymous "Voix 1"–"Voix 7" set. The same
// files are also copied under public/audio/adhan/ purely so the Réglages
// screen can preview them with a normal <audio> element (the res/raw copies
// are what actually get used for the notification sound).
export const ADHAN_VOICES = [
  { id: "alafasy", label: "Mishary Alafasy" },
  { id: "ahmad_al_nafees", label: "Ahmad Al-Nafees" },
  { id: "mustafa_ozcan", label: "Mustafa Özcan" },
  { id: "mansour_al_zahrani", label: "Mansour Al-Zahrani" },
  { id: "nasser_al_qatami", label: "Nasser Al-Qatami" },
].map((v) => ({ ...v, audio: `/audio/adhan/adhan_${v.id}.mp3` }));
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
        sound: `adhan_${v.id}.mp3`,
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
export async function syncPrayerNotifications(computeTimesForDate, enabledPrayers, muezzinByPrayer, lang = "fr") {
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
      const label = prayerReminderLabel(p, lang);
      notifications.push({
        id: dayOffset * 10 + i + 1,
        title: label,
        body: prayerReminderBody(label, lang),
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

// Azkar reminders — anchored to the prayer that starts each azkar window
// (matin: from Fajr, soir: from Asr, coucher: from Isha) rather than a fixed
// clock time, since prayer times shift through the year. Uses a separate id
// range (2000+) so it can be cancelled/rescheduled independently of prayer
// reminders above.
const AZKAR_ID_BASE = 2000;
const AZKAR_REMINDERS = [
  {
    key: "matin",
    anchor: "fajr",
    title: { fr: "Azkar du matin", en: "Morning azkar", ar: "أذكار الصباح" },
    body: {
      fr: "C'est l'heure des azkar du matin.",
      en: "It's time for your morning azkar.",
      ar: "حان الآن وقت أذكار الصباح.",
    },
  },
  {
    key: "soir",
    anchor: "asr",
    title: { fr: "Azkar du soir", en: "Evening azkar", ar: "أذكار المساء" },
    body: {
      fr: "C'est l'heure des azkar du soir.",
      en: "It's time for your evening azkar.",
      ar: "حان الآن وقت أذكار المساء.",
    },
  },
  {
    key: "coucher",
    anchor: "isha",
    title: { fr: "Azkar du coucher", en: "Bedtime azkar", ar: "أذكار النوم" },
    body: {
      fr: "C'est l'heure des azkar avant de dormir.",
      en: "It's time for your bedtime azkar.",
      ar: "حان الآن وقت أذكار النوم.",
    },
  },
];
const ALL_AZKAR_NOTIFICATION_IDS = DAY_OFFSETS.flatMap((dayOffset) =>
  AZKAR_REMINDERS.map((_, i) => AZKAR_ID_BASE + dayOffset * 10 + i + 1)
);

let azkarChannelReady = false;
async function ensureAzkarChannel() {
  if (azkarChannelReady) return;
  await LocalNotifications.createChannel({
    id: "azkar_channel",
    name: "Rappels Azkar",
    importance: 4,
    visibility: 1,
  }).catch(() => {});
  azkarChannelReady = true;
}

export async function cancelAzkarNotifications() {
  await LocalNotifications.cancel({ notifications: ALL_AZKAR_NOTIFICATION_IDS.map((id) => ({ id })) });
}

// (Re)schedules the next week's azkar reminders, one per day per window,
// skipping any anchor time that's already passed and any window switched off
// individually via enabledAzkar (e.g. { matin: true, soir: false, coucher: true }).
export async function syncAzkarNotifications(computeTimesForDate, enabledAzkar, lang = "fr") {
  await ensureAzkarChannel();
  await cancelAzkarNotifications();
  const now = new Date();
  const notifications = [];

  DAY_OFFSETS.forEach((dayOffset) => {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    const decimals = computeTimesForDate(day);

    AZKAR_REMINDERS.forEach((r, i) => {
      if (enabledAzkar && enabledAzkar[r.key] === false) return;
      const at = decimalHourToDate(day, decimals[r.anchor]);
      if (at <= now) return;
      notifications.push({
        id: AZKAR_ID_BASE + dayOffset * 10 + i + 1,
        title: r.title[lang] || r.title.fr,
        body: r.body[lang] || r.body.fr,
        schedule: { at },
        channelId: "azkar_channel",
      });
    });
  });

  if (notifications.length) {
    await LocalNotifications.schedule({ notifications });
  }
}
