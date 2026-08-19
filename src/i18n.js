// Phase 1 of multi-language support: the app's UI chrome (navigation,
// screen titles, buttons, Réglages) in French/English/Arabic. The azkar,
// invocations, and hadith citations stay French for now — translating
// scripture and hadith text accurately is a separate, more careful pass.
export const LANGUAGES = [
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
  { id: "ar", label: "العربية" },
];

export let currentLanguage = "fr";
export function setCurrentLanguage(lang) {
  currentLanguage = LANGUAGES.some((l) => l.id === lang) ? lang : "fr";
}
export function isRTL(lang = currentLanguage) {
  return lang === "ar";
}

const TRANSLATIONS = {
  fr: {
    // Bottom navigation
    nav_home: "Accueil",
    nav_quran: "Coran",
    nav_tasbih: "Tasbih",
    nav_invocations: "Invocations",
    nav_dashboard: "Bilan",
    nav_settings: "Réglages",

    // Common actions
    back: "Retour",
    next: "Suivant",
    skip: "Passer",
    cancel: "Annuler",
    close: "Fermer",
    save: "Enregistrer",
    reset: "Réinitialiser",
    delete: "Supprimer",
    apply: "Appliquer",
    search: "Rechercher",
    loading: "Chargement…",

    // Screen titles
    title_tasbih: "Tasbih libre",
    title_quran: "Le Coran",
    title_invocations: "Invocations",
    title_dashboard: "Bilan du jour",
    title_dashboard_short: "Bilan",
    title_history: "Historique",
    title_calendar: "Calendrier",
    title_qibla: "Qibla",
    title_settings: "Réglages",
    title_privacy: "Politique de confidentialité",
    title_surahs: "Sourates",
    title_reciters: "Récitateurs",
    title_mushaf: "Mushaf",

    // Settings sections
    settings_appearance: "Apparence",
    settings_text_size: "Taille du texte arabe",
    settings_notifications: "Notifications",
    settings_location: "Localisation",
    settings_method: "Méthode de calcul",
    settings_iqama: "Iqama et muezzin",
    settings_reciter: "Récitateur",
    settings_data: "Données",
    settings_about: "À propos",
    settings_language: "Langue",
    theme_system: "Système",
    theme_light: "Clair",
    theme_dark: "Sombre",

    // Settings — data section
    data_export: "Exporter mes données",
    data_import: "Importer une sauvegarde",
    data_reset_today: "Réinitialiser les azkar du jour",
    data_reset_all: "Réinitialiser toutes les données de l'app",

    // Onboarding
    tour_replay: "Revoir la présentation de l'app",
    tour_enable_notifications: "Activer les rappels de prière",
    tour_later: "Plus tard",
  },
  en: {
    nav_home: "Home",
    nav_quran: "Quran",
    nav_tasbih: "Tasbih",
    nav_invocations: "Invocations",
    nav_dashboard: "Summary",
    nav_settings: "Settings",

    back: "Back",
    next: "Next",
    skip: "Skip",
    cancel: "Cancel",
    close: "Close",
    save: "Save",
    reset: "Reset",
    delete: "Delete",
    apply: "Apply",
    search: "Search",
    loading: "Loading…",

    title_tasbih: "Free Tasbih",
    title_quran: "The Quran",
    title_invocations: "Invocations",
    title_dashboard: "Today's Summary",
    title_dashboard_short: "Summary",
    title_history: "History",
    title_calendar: "Calendar",
    title_qibla: "Qibla",
    title_settings: "Settings",
    title_privacy: "Privacy Policy",
    title_surahs: "Surahs",
    title_reciters: "Reciters",
    title_mushaf: "Mushaf",

    settings_appearance: "Appearance",
    settings_text_size: "Arabic text size",
    settings_notifications: "Notifications",
    settings_location: "Location",
    settings_method: "Calculation method",
    settings_iqama: "Iqama & muezzin",
    settings_reciter: "Reciter",
    settings_data: "Data",
    settings_about: "About",
    settings_language: "Language",
    theme_system: "System",
    theme_light: "Light",
    theme_dark: "Dark",

    data_export: "Export my data",
    data_import: "Import a backup",
    data_reset_today: "Reset today's azkar",
    data_reset_all: "Reset all app data",

    tour_replay: "Replay the app tour",
    tour_enable_notifications: "Enable prayer reminders",
    tour_later: "Later",
  },
  ar: {
    nav_home: "الرئيسية",
    nav_quran: "القرآن",
    nav_tasbih: "التسبيح",
    nav_invocations: "الأدعية",
    nav_dashboard: "الملخص",
    nav_settings: "الإعدادات",

    back: "رجوع",
    next: "التالي",
    skip: "تخطي",
    cancel: "إلغاء",
    close: "إغلاق",
    save: "حفظ",
    reset: "إعادة تعيين",
    delete: "حذف",
    apply: "تطبيق",
    search: "بحث",
    loading: "جارٍ التحميل…",

    title_tasbih: "التسبيح الحر",
    title_quran: "القرآن الكريم",
    title_invocations: "الأدعية",
    title_dashboard: "ملخص اليوم",
    title_dashboard_short: "الملخص",
    title_history: "السجل",
    title_calendar: "التقويم",
    title_qibla: "القبلة",
    title_settings: "الإعدادات",
    title_privacy: "سياسة الخصوصية",
    title_surahs: "السور",
    title_reciters: "القرّاء",
    title_mushaf: "المصحف",

    settings_appearance: "المظهر",
    settings_text_size: "حجم النص العربي",
    settings_notifications: "الإشعارات",
    settings_location: "الموقع",
    settings_method: "طريقة الحساب",
    settings_iqama: "الإقامة والمؤذن",
    settings_reciter: "القارئ",
    settings_data: "البيانات",
    settings_about: "حول التطبيق",
    settings_language: "اللغة",
    theme_system: "النظام",
    theme_light: "فاتح",
    theme_dark: "داكن",

    data_export: "تصدير بياناتي",
    data_import: "استيراد نسخة احتياطية",
    data_reset_today: "إعادة تعيين أذكار اليوم",
    data_reset_all: "إعادة تعيين كل بيانات التطبيق",

    tour_replay: "إعادة عرض التقديم",
    tour_enable_notifications: "تفعيل تذكير الصلاة",
    tour_later: "لاحقًا",
  },
};

export function t(key) {
  const dict = TRANSLATIONS[currentLanguage] || TRANSLATIONS.fr;
  return dict[key] || TRANSLATIONS.fr[key] || key;
}
