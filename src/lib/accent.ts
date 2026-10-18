const ACCENT_KEY = "planit-accent";
const THEME_KEY = "planit-theme";

/** Header accent choices. Swatch values mirror `--brand` in the matching :root[data-accent] block in site.css. */
export const ACCENTS = [
  { id: "sage", label: "Sage", swatch: "#c3d99c" },
  { id: "sky", label: "Sky", swatch: "#a9cfe8" },
  { id: "lavender", label: "Lavender", swatch: "#c9bfe8" },
  { id: "coral", label: "Coral", swatch: "#f2b59f" },
  { id: "amber", label: "Amber", swatch: "#efd08a" },
  { id: "rose", label: "Rose", swatch: "#eab3c6" },
] as const;

export type AccentId = typeof ACCENTS[number]["id"];

function isAccent(value: unknown): value is AccentId {
  return ACCENTS.some(accent => accent.id === value);
}

export function readAccent(): AccentId {
  try {
    const value = localStorage.getItem(ACCENT_KEY);
    return isAccent(value) ? value : "sage";
  } catch {
    return "sage";
  }
}

export function applyAccent(id: AccentId) {
  if (id === "sage") delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = id;
}

export function saveAccent(id: AccentId) {
  applyAccent(id);
  try {
    localStorage.setItem(ACCENT_KEY, id);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies for this visit.
  }
  document.dispatchEvent(new CustomEvent("planit:accent", { detail: id }));
}

export function readDarkMode(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) === "dark";
  } catch {
    return false;
  }
}

/** Dark mode is a whole-page inversion filter in site.css (`:root[data-theme="dark"]`); photos and canvases are flipped back. */
export function saveDarkMode(dark: boolean) {
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {
    // Storage can be unavailable (private mode); the choice still applies for this visit.
  }
}

type Rgb = [number, number, number];

function hexRgb(hex: string, fallback: string): Rgb {
  const value = /^#[0-9a-f]{6}$/i.test(hex.trim()) ? hex.trim() : fallback;
  return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)) as Rgb;
}

/**
 * Accent tone as hex for WebGL/canvas code, which can't resolve CSS color-mix().
 * Follows the --tone-* scale in site.css: lightness 0 (near black) to 1 (near white);
 * saturation below 1 blends toward a neutral gray of the same lightness.
 */
export function accentTone(lightness: number, saturation = 1): string {
  const css = getComputedStyle(document.documentElement);
  const stops: [number, Rgb][] = [
    [0.08, [19, 24, 18]],
    [0.31, hexRgb(css.getPropertyValue("--brand-strong"), "#4c633d")],
    [0.73, hexRgb(css.getPropertyValue("--brand"), "#c3d99c")],
    [0.98, [251, 252, 249]],
  ];
  const l = Math.min(0.98, Math.max(0.08, lightness));
  const upper = stops.findIndex(([at]) => at >= l);
  const [a, from] = stops[Math.max(0, upper - 1)], [b, to] = stops[upper];
  const t = b === a ? 0 : (l - a) / (b - a);
  const gray = l * 255;
  return "#" + from.map((channel, i) => {
    const tinted = channel + (to[i] - channel) * t;
    return Math.round(gray + (tinted - gray) * saturation).toString(16).padStart(2, "0");
  }).join("");
}
