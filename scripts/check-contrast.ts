import { readFileSync } from "node:fs";

/**
 * WCAG contrast check for the design tokens. Reads src/styles/tokens.css so it cannot drift from the real colours.
 * Text pairs must reach 4.5:1 (AA). Pairs marked "ui" are icons/indicators and must reach 3:1.
 */
const css = readFileSync("src/styles/tokens.css", "utf8");
const token = (name: string): string => {
  const m = css.match(new RegExp(`--${name}: *(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`Token --${name} not found as a hex value`);
  return m[1];
};

const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

type Pair = [fg: string, bg: string, kind: "text" | "ui", note: string];
const pairs: Pair[] = [
  ["text", "background", "text", "body text on page"],
  ["text", "surface", "text", "body text on panels"],
  ["text", "accent-subtle", "text", "active nav / highlighted rows"],
  ["text-secondary", "background", "text", "secondary text on page"],
  ["text-secondary", "surface", "text", "secondary text on panels"],
  ["text-secondary", "accent-subtle", "text", "secondary text on highlights"],
  ["accent-foreground", "accent", "text", "text on yellow buttons"],
  ["accent-strong", "surface", "text", "links and amber text on white"],
  ["accent-strong", "background", "text", "links on page background"],
  ["accent-strong", "accent-subtle", "text", "amber text on light yellow"],
  ["status-success", "status-success-tint", "text", "success badge"],
  ["status-warning", "status-warning-tint", "text", "warning badge"],
  ["status-danger", "status-danger-tint", "text", "danger badge"],
  ["status-neutral", "status-neutral-tint", "text", "neutral badge"],
  ["status-success", "surface", "text", "success text on white"],
  ["status-warning", "surface", "text", "warning text on white"],
  ["status-danger", "surface", "text", "danger text on white"],
  ["accent-strong", "surface", "ui", "focus ring on white"],
  ["accent-strong", "background", "ui", "focus ring on page background"],
  ["accent-strong", "accent", "ui", "focus ring on a yellow button"],
  ["chart-2", "surface", "ui", "chart series 2 (dark amber) on white"],
  ["chart-3", "surface", "ui", "chart series 3 (mid amber) on white"],
  ["chart-4", "surface", "ui", "chart series 4 (grey) on white"],
  ["chart-5", "surface", "ui", "chart series 5 (light grey) on white"],
];

let failures = 0;
for (const [fg, bg, kind, note] of pairs) {
  const r = ratio(token(fg), token(bg));
  const need = kind === "text" ? 4.5 : 3;
  const ok = r >= need;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1 (need ${need})  ${fg} on ${bg}: ${note}`);
}

// Informational: yellow as a fill against white is not text or a required boundary (labels carry the meaning).
console.log(`info ${ratio(token("accent"), token("surface")).toFixed(2).padStart(5)}:1  accent fill on surface (decorative fill; always paired with a dark label)`);
console.log(failures ? `\n${failures} pair(s) below WCAG AA` : "\nall token pairs meet WCAG AA");
process.exit(failures ? 1 : 0);
