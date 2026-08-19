// One-off extraction script: pulls the inline JSX app and embedded icons
// out of the legacy www/index.html (CDN-based prototype) so they can be
// rebuilt as a proper local Vite bundle.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcHtml = fs.readFileSync(path.join(root, "www", "index.html"), "utf8");

// 1. Extract the React/JSX app source (the <script type="text/babel"> block)
const babelStart = srcHtml.indexOf('<script type="text/babel"');
const babelOpenEnd = srcHtml.indexOf(">", babelStart) + 1;
const babelEnd = srcHtml.indexOf("</script>", babelOpenEnd);
let appSrc = srcHtml.slice(babelOpenEnd, babelEnd);

// Replace `const { useState, ... } = React;` with an ES import
appSrc = appSrc.replace(
  /const \{ useState, useEffect, useRef, useCallback \} = React;/,
  `import React, { useState, useEffect, useRef, useCallback } from "react";`
);

// Remove the trailing mount call — that goes in main.jsx instead
appSrc = appSrc.replace(
  /ReactDOM\.createRoot\(document\.getElementById\("root"\)\)\.render\(<AzkarApp \/>\);\s*$/,
  ""
);

// Drop the remote Google Fonts @import inside FONT_STYLE — fonts are now
// self-hosted via @fontsource and imported in main.jsx instead.
appSrc = appSrc.replace(
  /@import url\('https:\/\/fonts\.googleapis\.com[^']*'\);\n/,
  ""
);

fs.mkdirSync(path.join(root, "src"), { recursive: true });
fs.writeFileSync(path.join(root, "src", "App.jsx"), appSrc.trim() + "\n");

// 2. Extract the manifest data URI + apple-touch-icon + favicon base64 PNGs
// so we can regenerate real icon files from them.
function extractDataUri(regex) {
  const m = srcHtml.match(regex);
  return m ? m[1] : null;
}
const manifestDataUri = extractDataUri(/rel="manifest" href="data:application\/json;base64,([^"]+)"/);
const appleTouchIcon = extractDataUri(/rel="apple-touch-icon" href="data:image\/png;base64,([^"]+)"/);
const faviconIcon = extractDataUri(/rel="icon" href="data:image\/png;base64,([^"]+)"/);

fs.mkdirSync(path.join(root, "scripts", "extracted-icons"), { recursive: true });
if (manifestDataUri) {
  const manifestJson = Buffer.from(manifestDataUri, "base64").toString("utf8");
  const manifest = JSON.parse(manifestJson);
  fs.writeFileSync(
    path.join(root, "scripts", "extracted-icons", "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  manifest.icons.forEach((icon, i) => {
    const b64 = icon.src.split(",")[1];
    fs.writeFileSync(
      path.join(root, "scripts", "extracted-icons", `manifest-icon-${icon.sizes}.png`),
      Buffer.from(b64, "base64")
    );
  });
}
if (appleTouchIcon) {
  fs.writeFileSync(
    path.join(root, "scripts", "extracted-icons", "apple-touch-icon.png"),
    Buffer.from(appleTouchIcon, "base64")
  );
}
if (faviconIcon) {
  fs.writeFileSync(
    path.join(root, "scripts", "extracted-icons", "favicon.png"),
    Buffer.from(faviconIcon, "base64")
  );
}

console.log("Extracted app.jsx length:", appSrc.length);
console.log("Icons extracted:", fs.readdirSync(path.join(root, "scripts", "extracted-icons")));
