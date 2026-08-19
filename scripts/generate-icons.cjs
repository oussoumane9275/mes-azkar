// Regenerates the app icon as crisp full-bleed square assets (no baked-in
// rounded corners / no transparency on the flat icon) from a misbaha
// (tasbih prayer-bead) ring design — a nod to the app's Tasbih counter,
// so @capacitor/assets can produce correct iOS/Android icon sets.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "assets");
fs.mkdirSync(outDir, { recursive: true });

const BG = "#0E3E39";
const GOLD = "#D9A94A";
const SIZE = 1024;

// A ring of tasbih beads, with one larger "imam" bead marking the count —
// sized to sit well inside the ~66% safe zone Android adaptive icons need.
function foregroundSvg({ transparent }) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const beadCount = 16;
  const ringR = 260;
  const beadR = 32;
  const imamR = 50;

  const beads = [];
  for (let i = 0; i < beadCount; i++) {
    const angle = (i / beadCount) * 2 * Math.PI - Math.PI / 2;
    const isImam = i === Math.floor(beadCount * 0.75); // bottom bead
    const r = isImam ? ringR + 6 : ringR;
    const bx = cx + r * Math.cos(angle);
    const by = cy + r * Math.sin(angle);
    beads.push(`<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${isImam ? imamR : beadR}" fill="${GOLD}"/>`);
  }

  return `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  ${transparent ? "" : `<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>`}
  ${beads.join("\n  ")}
</svg>`;
}

async function main() {
  // Flat full-bleed icon (iOS source, legacy Android, favicon) — opaque, no alpha
  await sharp(Buffer.from(foregroundSvg({ transparent: false })))
    .flatten({ background: BG })
    .png({ palette: false })
    .toFile(path.join(outDir, "icon.png"));

  // Android adaptive icon: transparent foreground layer
  await sharp(Buffer.from(foregroundSvg({ transparent: true })))
    .png()
    .toFile(path.join(outDir, "icon-foreground.png"));

  // Android adaptive icon: solid background layer
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: BG },
  })
    .png()
    .toFile(path.join(outDir, "icon-background.png"));

  // Splash screen: same mark, small, centered on the brand background
  const splashSize = 2732;
  const markScale = 0.28;
  const markSize = Math.round(splashSize * markScale);
  const mark = await sharp(Buffer.from(foregroundSvg({ transparent: true })))
    .resize(markSize, markSize)
    .toBuffer();
  await sharp({
    create: { width: splashSize, height: splashSize, channels: 4, background: BG },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(path.join(outDir, "splash.png"));
  fs.copyFileSync(path.join(outDir, "splash.png"), path.join(outDir, "splash-dark.png"));

  console.log("Icons written to", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
