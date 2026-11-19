// Usage: npm i --no-save playwright && npx playwright install chromium && npm run build && npx vite preview --port 4173 & node scripts/appstore-screenshots.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.env.OUT_DIR ?? "store-assets/ios");
const RAW = path.resolve(process.env.RAW_DIR ?? "store-assets/.raw");

const DEVICES = [
  { dir: "iphone-6.9", kind: "iphone", vw: 440, vh: 956, dsf: 3, W: 1320, H: 2868, phoneW: 1000, top: 470, head: 84 },
  { dir: "ipad-13", kind: "ipad", vw: 1032, vh: 1376, dsf: 2, W: 2064, H: 2752, phoneW: 1560, top: 430, head: 90 },
  { dir: "iphone-6.3", kind: "iphone", vw: 402, vh: 874, dsf: 3, W: 1206, H: 2622, phoneW: 913, top: 430, head: 77 },
  { dir: "iphone-duo-outer", kind: "ipad", side: true, vw: 466, vh: 678, dsf: 3, W: 1398, H: 2034, phoneW: 1062, top: 300, head: 66 },
  { dir: "iphone-duo-inner", kind: "ipad", vw: 669, vh: 951, dsf: 3, W: 2007, H: 2853, phoneW: 1606, top: 400, head: 92 },
];

const SCREENS = [
  { key: "accueil", headline: "Horaires de prière, Qibla et azkar réunis chaque jour" },
  { key: "azkar", headline: "Tes azkar : texte arabe, traduction et compteur" },
  { key: "tasbih", headline: "Un tasbih simple, fidèle à la sunna" },
  { key: "invocations", headline: "Une invocation pour chaque moment de ta vie" },
  { key: "jardin", headline: "Ton jardin pour le Paradis, jour après jour" },
];

async function clickText(page, text, exact = false) {
  const el = page.getByText(text, { exact }).first();
  await el.waitFor({ state: "visible", timeout: 8000 });
  await el.click();
}

async function capture(browser, d) {
  const ctx = await browser.newContext({
    viewport: { width: d.vw, height: d.vh },
    deviceScaleFactor: d.dsf,
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:4173", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  if (d.kind === "iphone") {
    await page.addStyleTag({ content: ".fixed.bottom-0.left-0.right-0{padding-bottom:30px !important;padding-left:18px !important;padding-right:18px !important}button[aria-label=\"Assistant\"]{bottom:100px !important}" });
  }
  if (d.side) {
    // iPhone Duo, closed: Dynamic Island, status bar and tab bar stack on the trailing edge (Apple HIG, "Vertical controls").
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".fixed.bottom-0.left-0.right-0") ?? document.body).backgroundColor);
    await page.addStyleTag({
      content: `
body{padding-right:84px !important}
.fixed.bottom-0.left-0.right-0{top:0 !important;left:auto !important;width:84px !important;flex-direction:column !important;justify-content:flex-end !important;border-top:none !important;border-left:1px solid rgba(140,99,41,.18) !important;padding:0 0 22px !important}
.fixed.bottom-0.left-0.right-0 > button{flex:0 0 auto !important;padding:12px 2px 10px !important}
button[aria-label="Assistant"]{right:98px !important;bottom:26px !important}
#duo-top{position:fixed;top:0;right:0;width:84px;height:200px;background:${bg};z-index:21;display:flex;flex-direction:column;align-items:center;gap:14px;padding-top:14px;box-sizing:border-box;font:600 15px/1 -apple-system,'SF Pro Text','Helvetica Neue',Arial,sans-serif;color:#111;border-left:1px solid rgba(140,99,41,.18)}
#duo-top .pill{width:28px;height:64px;background:#000;border-radius:99px}
#duo-top .bat{transform:rotate(90deg);margin-top:8px}`,
    });
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.id = "duo-top";
      el.innerHTML =
        '<div class="pill"></div><span>9:41</span>' +
        '<svg width="24" height="17" viewBox="0 0 17 12"><path d="M8.5 2.4c2.3 0 4.4.9 6 2.4l1.1-1.2A10.3 10.3 0 0 0 8.5.7 10.3 10.3 0 0 0 1.4 3.6l1.1 1.2a8.6 8.6 0 0 1 6-2.4Z" fill="#111"/><path d="M8.5 6c1.3 0 2.5.5 3.4 1.3l1.1-1.2a7 7 0 0 0-9 0l1.1 1.2c.9-.8 2.1-1.3 3.4-1.3Z" fill="#111"/><path d="M8.5 9.5c.6 0 1.1.2 1.5.6L8.5 11.7 7 10.1c.4-.4.9-.6 1.5-.6Z" fill="#111"/></svg>' +
        '<svg width="22" height="16" viewBox="0 0 19 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#111"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="#111"/><rect x="10" y="3" width="3" height="9" rx="1" fill="#111"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#111"/></svg>' +
        '<svg class="bat" width="30" height="14" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="22" height="12" rx="3.5" fill="none" stroke="#111" opacity=".4"/><rect x="2" y="2" width="19" height="9" rx="2.2" fill="#111"/><path d="M24 4.5v4c.9-.3 1.6-1.2 1.6-2s-.7-1.7-1.6-2Z" fill="#111" opacity=".5"/></svg>';
      document.body.appendChild(el);
    });
  }
  try { await clickText(page, "Passer"); await page.waitForTimeout(500); } catch {}

  const raws = {};
  const shot = async (key) => {
    const ok = page.getByText("J'ai compris", { exact: false }).first();
    if (await ok.count()) { await ok.dispatchEvent("click"); await page.waitForTimeout(500); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);
    raws[key] = await page.screenshot();
  };
  const nav = async (label) => {
    await page.getByText(label, { exact: true }).first().dispatchEvent("click");
    await page.waitForTimeout(600);
  };

  await shot("accueil");
  await clickText(page, "Azkar matin");
  await shot("azkar");
  await page.locator('button[aria-label="Retour"]').first().click();
  await page.waitForTimeout(500);
  await nav("Tasbih");
  await shot("tasbih");
  await nav("Invocations");
  await shot("invocations");
  await nav("Jardin");
  await shot("jardin");
  await ctx.close();
  return raws;
}

const SIGNAL = (s) => `<svg width="${s * 1.25}" height="${s}" viewBox="0 0 19 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#111"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="#111"/><rect x="10" y="3" width="3" height="9" rx="1" fill="#111"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#111"/></svg>`;
const WIFI = (s) => `<svg width="${s * 1.4}" height="${s}" viewBox="0 0 17 12"><path d="M8.5 2.4c2.3 0 4.4.9 6 2.4l1.1-1.2A10.3 10.3 0 0 0 8.5.7 10.3 10.3 0 0 0 1.4 3.6l1.1 1.2a8.6 8.6 0 0 1 6-2.4Z" fill="#111"/><path d="M8.5 6c1.3 0 2.5.5 3.4 1.3l1.1-1.2a7 7 0 0 0-9 0l1.1 1.2c.9-.8 2.1-1.3 3.4-1.3Z" fill="#111"/><path d="M8.5 9.5c.6 0 1.1.2 1.5.6L8.5 11.700 7 10.100c.4-.4.9-.6 1.500-.6Z" fill="#111"/></svg>`;
const BATT = (s) => `<svg width="${s * 2.3}" height="${s}" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="22" height="12" rx="3.5" fill="none" stroke="#111" opacity=".4"/><rect x="2" y="2" width="19" height="9" rx="2.2" fill="#111"/><path d="M24 4.500v4c.9-.3 1.600-1.200 1.600-2s-.7-1.700-1.600-2Z" fill="#111" opacity=".5"/></svg>`;

function html(d, headline, b64) {
  const iphone = d.kind === "iphone";
  const ring = iphone ? 7 : 6;
  const bez = iphone ? 14 : 24;
  const outerR = iphone ? Math.round(d.phoneW * 0.145) : Math.round(d.phoneW * 0.045);
  const innerW = d.phoneW - 2 * (ring + bez);
  const sbH = Math.round(innerW * (d.sb ?? (iphone ? 0.118 : 0.04)));
  const fs = Math.round(innerW * (d.fsr ?? (iphone ? 0.043 : 0.0155)));
  const ic = Math.round(fs * 0.72);
  const screenR = outerR - ring - bez;

  const island = iphone
    ? `<div style="position:absolute;top:${Math.round(innerW * 0.028)}px;left:50%;transform:translateX(-50%);width:${Math.round(innerW * 0.32)}px;height:${Math.round(innerW * 0.094)}px;background:#000;border-radius:99px;z-index:3"></div>`
    : `<div style="position:absolute;top:${Math.round(bez / 2 - 5)}px;left:50%;transform:translateX(-50%);width:10px;height:10px;background:#1d1d20;border-radius:50%;z-index:3"></div>`;

  const status = iphone
    ? `<div style="height:${sbH}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${Math.round(innerW * 0.085)}px 0 ${Math.round(innerW * 0.115)}px;font:600 ${fs}px/1 -apple-system,'SF Pro Text','Helvetica Neue',Arial,sans-serif;color:#111;background:#FBF7EC"><span>9:41</span><span style="display:flex;gap:${Math.round(fs * 0.3)}px;align-items:center">${SIGNAL(ic)}${WIFI(ic)}${BATT(ic)}</span></div>`
    : `<div style="height:${sbH}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${Math.round(innerW * 0.025)}px;font:600 ${fs}px/1 -apple-system,'SF Pro Text','Helvetica Neue',Arial,sans-serif;color:#111;background:#FBF7EC"><span>9:41&nbsp;&nbsp;&nbsp;<span style="font-weight:500">jeu. 19 nov.</span></span><span style="display:flex;gap:${Math.round(fs * 0.5)}px;align-items:center">${WIFI(ic)}<span style="font-weight:500">100&nbsp;%</span>${BATT(ic)}</span></div>`;

  const homeBar = `<div style="position:absolute;left:50%;bottom:${Math.round(innerW * (iphone ? 0.014 : 0.0085))}px;transform:translateX(-50%);width:${Math.round(innerW * (iphone ? 0.34 : 0.17))}px;height:${Math.round(innerW * (iphone ? 0.0125 : 0.0055))}px;background:#111;border-radius:99px;z-index:3"></div>`;

  const btn = (side, top, h) => `<div style="position:absolute;${side}:-5px;top:${top}px;width:6px;height:${h}px;background:linear-gradient(90deg,#6a6a6f,#9b9ba0);border-radius:3px"></div>`;
  const buttons = iphone
    ? btn("left", 330, 70) + btn("left", 470, 120) + btn("left", 620, 120) + btn("right", 520, 190)
    : btn("right", 160, 110) + btn("right", 300, 60) + btn("right", 380, 60);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&display=swap" rel="stylesheet">
<style>
html,body{margin:0;padding:0}
.c{width:${d.W}px;height:${d.H}px;position:relative;overflow:hidden;
background:radial-gradient(${d.W * 0.65}px ${d.W * 0.46}px at 88% 8%,rgba(233,190,110,.55),transparent 60%),radial-gradient(${d.W * 0.85}px ${d.W * 0.65}px at 10% 95%,rgba(140,99,41,.18),transparent 60%),linear-gradient(160deg,#FBF7EC 0%,#F3E9D3 55%,#ECDBB4 100%)}
.h{position:absolute;top:${Math.round(d.H * 0.04)}px;left:${Math.round(d.W * 0.07)}px;right:${Math.round(d.W * 0.07)}px;font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:${d.head}px;line-height:1.12;color:#3A2D18;letter-spacing:-.01em}
.p{position:absolute;left:50%;top:${d.top}px;transform:translateX(-50%);width:${d.phoneW}px;border-radius:${outerR}px;background:linear-gradient(145deg,#a5a5aa,#4c4c51 50%,#8e8e93);padding:${ring}px;box-sizing:border-box;box-shadow:0 50px 90px rgba(60,40,10,.35),0 10px 24px rgba(60,40,10,.18)}
.b{background:#0a0a0b;border-radius:${outerR - ring}px;padding:${bez}px;box-sizing:border-box}
.s{position:relative;width:${innerW}px;border-radius:${screenR}px;overflow:hidden;background:#FBF7EC}
.s img{width:100%;display:block}
</style></head><body><div class="c"><div class="h">${headline}</div>
<div class="p">${buttons}<div class="b"><div class="s">${d.side ? "" : island}${d.side ? "" : status}<img src="data:image/png;base64,${b64}">${iphone || d.side ? "" : `<div style="height:${Math.round(innerW * 0.026)}px;background:#FBF7EC"></div>`}${homeBar}</div></div></div></div></body></html>`;
}

const browser = await chromium.launch();
for (const d of DEVICES) {
  const rawDir = path.join(RAW, d.dir);
  fs.mkdirSync(rawDir, { recursive: true });
  let raws = {};
  if (SCREENS.every((s) => fs.existsSync(path.join(rawDir, s.key + ".png")))) {
    for (const s of SCREENS) raws[s.key] = fs.readFileSync(path.join(rawDir, s.key + ".png"));
  } else {
    raws = await capture(browser, d);
    for (const s of SCREENS) fs.writeFileSync(path.join(rawDir, s.key + ".png"), raws[s.key]);
  }
  const dir = path.join(OUT, d.dir);
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: d.W, height: d.H }, deviceScaleFactor: 1 });
  let i = 1;
  for (const s of SCREENS) {
    await page.setContent(html(d, s.headline, raws[s.key].toString("base64")), { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const file = path.join(dir, `0${i}-${s.key}.png`);
    await page.screenshot({ path: file });
    console.log("saved", file);
    i++;
  }
  await page.close();
}
await browser.close();
