// One-off transform: replaces hardcoded rgba(35,41,31, X) (= COLORS.ink at
// various opacities) with calls to inkA(X), a helper that derives the rgba
// string from the *current* theme's ink color — needed so these surfaces
// (card backgrounds, borders, inactive-state tints) respond to dark mode.
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "src", "App.jsx");
let src = fs.readFileSync(file, "utf8");
let count = 0;

// Double-quoted strings containing rgba(35,41,31,X), with optional prefix/suffix
// text (e.g. "1px solid rgba(35,41,31,0.14)" or exactly "rgba(35,41,31,0.08)").
src = src.replace(/"([^"]*)rgba\(35,41,31,([0-9.]+)\)([^"]*)"/g, (_, pre, opacity, post) => {
  count++;
  if (!pre && !post) return `inkA(${opacity})`;
  return `\`${pre}\${inkA(${opacity})}${post}\``;
});

// Whatever remains must already be inside a backtick template literal.
src = src.replace(/rgba\(35,41,31,([0-9.]+)\)/g, (_, opacity) => {
  count++;
  return `\${inkA(${opacity})}`;
});

fs.writeFileSync(file, src);
console.log(`Replaced ${count} occurrences`);
