// Quran Foundation Content API — used only for the page-perfect Mushaf view.
// Provides word-level line_number + code_v1 glyph codes that, combined with
// the matching per-page QCF font, reproduce the exact printed Mushaf layout
// (the regular Hafs/translation reading still uses the lighter alquran.cloud API).
const CLIENT_ID = "fcde18fa-a754-40dd-a475-31c105adb0b3";
const CLIENT_SECRET = "KZKJ5Uq7KXeqiyuBAja9D63alQ";
const TOKEN_URL = "https://oauth2.quran.foundation/oauth2/token";
const API_BASE = "https://apis.quran.foundation/content/api/v4";
const FONT_BASE = "https://static.quran.com/fonts/quran/hafs/v1/woff2";

const TOKEN_CACHE_KEY = "azkar-qf-token-v1";
const PAGE_DATA_CACHE_PREFIX = "azkar-qf-page-";
const FONT_CACHE_NAME = "mes-azkar-mushaf-fonts-v1";

let tokenPromise = null;

async function getAccessToken() {
  try {
    const cached = JSON.parse(localStorage.getItem(TOKEN_CACHE_KEY) || "null");
    if (cached && cached.expiresAt > Date.now() + 30000) {
      return cached.token;
    }
  } catch (e) {
    // ignore corrupt cache
  }
  if (!tokenPromise) {
    tokenPromise = (async () => {
      const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: "grant_type=client_credentials&scope=content",
      });
      if (!res.ok) throw new Error("token request failed");
      const data = await res.json();
      const expiresAt = Date.now() + (data.expires_in || 3300) * 1000;
      try {
        localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify({ token: data.access_token, expiresAt }));
      } catch (e) {
        // storage full or unavailable — token just won't be cached across reloads
      }
      return data.access_token;
    })().finally(() => {
      tokenPromise = null;
    });
  }
  return tokenPromise;
}

async function apiFetch(path) {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "x-auth-token": token, "x-client-id": CLIENT_ID },
  });
  if (!res.ok) throw new Error(`Quran Foundation API error ${res.status}`);
  return res.json();
}

// Returns { chapterNumber, lines: [{ lineNumber, words: [{ code, text }] }] }
// for the given printed Mushaf page, using a local cache so a page already
// viewed once loads instantly and works offline afterwards.
export async function fetchMushafPage(pageNumber) {
  const cacheKey = PAGE_DATA_CACHE_PREFIX + pageNumber;
  try {
    const cached = await window.storage.get(cacheKey, false);
    if (cached && cached.value) return JSON.parse(cached.value);
  } catch (e) {
    // not cached yet
  }

  const data = await apiFetch(
    `/verses/by_page/${pageNumber}?words=true&word_fields=code_v1,line_number,page_number&fields=text_uthmani`
  );
  const verses = data?.verses || [];
  const juzNumber = verses[0] ? verses[0].juz_number : null;

  const lineMap = new Map();
  verses.forEach((v) => {
    const [chapterNumber, verseNumber] = v.verse_key.split(":").map(Number);
    (v.words || []).forEach((w, i) => {
      if (w.char_type_name !== "word" && w.char_type_name !== "end") return;
      const line = w.line_number;
      if (!lineMap.has(line)) lineMap.set(line, []);
      lineMap.get(line).push({
        code: w.code_v1,
        isVerseEnd: w.char_type_name === "end",
        // marks the very first word of a surah, so the renderer can insert
        // the ornamental title + bismillah right before this line
        isSurahStart: verseNumber === 1 && i === 0,
        chapterNumber,
        verseNumber,
      });
    });
  });
  const lines = Array.from(lineMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([lineNumber, words]) => ({
      lineNumber,
      words,
      surahStart: words.find((w) => w.isSurahStart)?.chapterNumber ?? null,
    }));

  const lastLine = lines[lines.length - 1];
  const lastWord = lastLine ? lastLine.words[lastLine.words.length - 1] : null;
  const result = { juzNumber, chapterNumber: lastWord ? lastWord.chapterNumber : null, lines };
  window.storage.set(cacheKey, JSON.stringify(result), false).catch(() => {});
  return result;
}

// Returns the printed Mushaf page a chapter starts on — used so the "Mushaf"
// tab of the per-surah reader can open straight to the right page.
export async function fetchChapterStartPage(chapterNumber) {
  const cacheKey = `azkar-qf-chapter-start-page-${chapterNumber}`;
  try {
    const cached = await window.storage.get(cacheKey, false);
    if (cached && cached.value) return parseInt(cached.value, 10);
  } catch (e) {
    // not cached yet
  }
  const data = await apiFetch(`/chapters/${chapterNumber}`);
  const startPage = data?.chapter?.pages?.[0] || 1;
  window.storage.set(cacheKey, String(startPage), false).catch(() => {});
  return startPage;
}

// Returns which printed Mushaf page a given verse falls on — lets any screen
// that tracks reading/listening progress by surah:ayah (not just the Mushaf
// page view itself) feed the same page-based Bilan count.
export async function fetchVersePage(chapterNumber, ayahNumber) {
  const cacheKey = `azkar-qf-verse-page-${chapterNumber}-${ayahNumber}`;
  try {
    const cached = await window.storage.get(cacheKey, false);
    if (cached && cached.value) return parseInt(cached.value, 10);
  } catch (e) {
    // not cached yet
  }
  const data = await apiFetch(`/verses/by_key/${chapterNumber}:${ayahNumber}?fields=page_number`);
  const page = data?.verse?.page_number || null;
  if (page) window.storage.set(cacheKey, String(page), false).catch(() => {});
  return page;
}

// Loads (and caches offline via the Cache Storage API) the exact font this
// page needs, then registers it under a page-specific font-family name.
export async function loadMushafPageFont(pageNumber) {
  const family = `qcf-page-${pageNumber}`;
  if ([...document.fonts.keys()].some((f) => f.family === family)) return family;

  const url = `${FONT_BASE}/p${pageNumber}.woff2`;
  let blob;
  try {
    const cache = await caches.open(FONT_CACHE_NAME);
    let cachedRes = await cache.match(url);
    if (!cachedRes) {
      const res = await fetch(url);
      if (!res.ok) throw new Error("font fetch failed");
      await cache.put(url, res.clone());
      cachedRes = res;
    }
    blob = await cachedRes.blob();
  } catch (e) {
    // Cache Storage unavailable (older WebView) — fall back to a plain fetch
    const res = await fetch(url);
    if (!res.ok) throw new Error("font fetch failed");
    blob = await res.blob();
  }

  const fontFace = new FontFace(family, await blob.arrayBuffer());
  await fontFace.load();
  document.fonts.add(fontFace);
  return family;
}
