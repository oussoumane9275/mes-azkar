// Exports/imports every piece of user data the app stores locally (progress,
// history, settings, tasbih, personal invocations, Quran progress) as a
// single JSON file — the only way to carry data across a phone change,
// since everything otherwise lives only in this device's local storage.
const BACKUP_KEYS = [
  "azkar-progress-v1",
  "azkar-history-v1",
  "azkar-settings-v1",
  "azkar-tasbih-v1",
  "azkar-personal-invocations-v1",
  "azkar-quran-progress-v1",
  "azkar-quran-mushaf-page-v1",
];

export async function exportBackup() {
  const data = {};
  for (const key of BACKUP_KEYS) {
    try {
      const res = await window.storage.get(key, false);
      if (res && res.value) data[key] = res.value;
    } catch (e) {
      // key not set yet — skip
    }
  }
  return JSON.stringify({ app: "mes-azkar", version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

export async function importBackup(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("Ce fichier n'est pas une sauvegarde valide.");
  }
  if (!parsed || typeof parsed !== "object" || !parsed.data || typeof parsed.data !== "object") {
    throw new Error("Ce fichier n'est pas une sauvegarde valide.");
  }
  for (const key of BACKUP_KEYS) {
    if (typeof parsed.data[key] === "string") {
      await window.storage.set(key, parsed.data[key], false);
    }
  }
}

export function downloadBackupFile(jsonText) {
  const blob = new Blob([jsonText], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `mes-azkar-sauvegarde-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
