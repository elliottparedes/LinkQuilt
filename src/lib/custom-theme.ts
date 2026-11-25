// The editor, compiler, and renderer share this versioned theme vocabulary.
type ValueRule = { hint: string; accepts: (value: string) => boolean };

function units(unit: string, min: number, max: number): ValueRule {
  const pattern = new RegExp("^([0-9]{1,3}(?:\\.[0-9]{1,2})?)" + unit + "$");
  return { hint: `${min}–${max}${unit}`, accepts(value) {
    const match = pattern.exec(value);
    return !!match && Number(match[1]) >= min && Number(match[1]) <= max;
  } };
}

function choices(...values: string[]): ValueRule {
  return { hint: values.join(" | "), accepts: (value) => values.includes(value) };
}

const color: ValueRule = { hint: "#RGB, #RRGGBB or #RRGGBBAA", accepts: v => /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(v) };
export const themeProperties: Record<string, ValueRule> = {
  "--lb-text": color, "--lb-text-muted": color, "--lb-accent": color, "--lb-secondary": color,
  "--lb-card-bg": color, "--lb-card-border": color, "--lb-btn-text": color,
  "--lb-card-radius": units("px", 0, 64), "--lb-spacing": units("px", 4, 48),
  "--lb-border-width": units("px", 0, 6), "--lb-font-size": units("px", 12, 32),
  "--lb-font": choices("serif", "sans-serif", "monospace", "system-ui"),
  "--lb-font-weight": choices("400", "500", "600", "700", "800"),
  "--lb-shadow-color": color, "--lb-shadow-blur": units("px", 0, 32),
  "--lb-sky-angle": units("deg", 0, 360), "--lb-sky-color": color, "--lb-horizon-color": color,
  "--lb-background-effect": choices("waves", "none"), "--lb-wave-color": color,
  "--lb-foam-color": color, "--lb-wave-period": units("s", 3, 40), "--lb-wave-height": units("%", 10, 70),
  "--lb-pointer-effect": choices("none", "glow", "trail", "sparkles"), "--lb-pointer-color": color,
  "--lb-pointer-size": units("px", 3, 40), "--lb-pointer-fade": units("ms", 100, 999),
  "--lb-pointer-count": { hint: "1–16 particles", accepts: v => /^(?:[1-9]|1[0-6])$/.test(v) },
  "--lb-pointer-burst": choices("none", "sparkles"), "--lb-shimmer-color": color,
  "--lb-hover-glow": color, "--lb-mist-color": color, "--lb-light-color": color,
  "--lb-layer-period": units("s", 4, 60),
};
export type LayerName = "mist" | "light" | "shimmer";
export const layerNames: LayerName[] = ["mist", "light", "shimmer"];
export type ThemeFrame = { offset: number; transform?: string; opacity?: string };
export type ThemeDesign = { version: 1; vars: Record<string, string>; layers: Partial<Record<LayerName, ThemeFrame[]>> };
export const emptyDesign = (): ThemeDesign => ({ version: 1, vars: {}, layers: {} });
export function validFrameValue(key: string, value: string) {
  if (key === "opacity") return /^(?:0|0?\.\d{1,2}|1(?:\.0{1,2})?)$/.test(value);
  const move = /^translate\((-?\d{1,2})%,\s*(-?\d{1,2})%\)$/.exec(value);
  return key === "transform" && !!move && move.slice(1).every(n => Math.abs(Number(n)) <= 50);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
// Validate persisted and imported documents before any value reaches a CSS sink.
export function readDesign(input: unknown): ThemeDesign | null {
  if (input === "" || input == null) return emptyDesign();
  if (typeof input !== "string" || input.length > 12000) return null;
  let data: unknown;
  try { data = JSON.parse(input); } catch { return null; }
  if (!record(data) || data.version !== 1 || !record(data.vars) || !record(data.layers)) return null;
  if (Object.keys(data).some(key => !["version", "vars", "layers"].includes(key))) return null;
  const result = emptyDesign();
  for (const [name, value] of Object.entries(data.vars)) {
    if (!Object.hasOwn(themeProperties, name) || typeof value !== "string" || value.trim() !== value || !themeProperties[name].accepts(value)) return null;
    result.vars[name] = value;
  }
  for (const [name, frames] of Object.entries(data.layers)) {
    if (!layerNames.includes(name as LayerName) || !Array.isArray(frames) || frames.length < 2 || frames.length > 8) return null;
    const checked: ThemeFrame[] = [];
    for (const frame of frames) {
      if (!record(frame) || typeof frame.offset !== "number") return null;
      const previous = checked.at(-1);
      if (!Number.isInteger(frame.offset) || frame.offset < 0 || frame.offset > 100) return null;
      if (previous && frame.offset <= previous.offset) return null;
      const item: ThemeFrame = { offset: frame.offset };
      for (const [key, value] of Object.entries(frame)) {
        if (key === "offset") continue;
        if ((key !== "opacity" && key !== "transform") || typeof value !== "string" || value.trim() !== value || !validFrameValue(key, value)) return null;
        item[key] = value;
      }
      if (Object.keys(item).length === 1) return null;
      checked.push(item);
    }
    if (checked[0].offset !== 0 || checked.at(-1)?.offset !== 100) return null;
    result.layers[name as LayerName] = checked;
  }
  return result;
}
export function themeSource(design: ThemeDesign) {
  const rules = [":root {", ...Object.entries(design.vars).map(([k,v]) => `  ${k}: ${v};`), "}"];
  for (const [name, frames] of Object.entries(design.layers)) {
    rules.push("", `@keyframes ${name} {`);
    for (const { offset, ...fields } of frames) rules.push(`  ${offset}% { ${Object.entries(fields).map(([k,v]) => `${k}: ${v};`).join(" ")} }`);
    rules.push("}");
  }
  return rules.join("\n");
}
export function hasScene(design: ThemeDesign, video: boolean) {
  const vars = design.vars;
  return video || vars["--lb-background-effect"] === "waves" ||
    (!!vars["--lb-pointer-effect"] && vars["--lb-pointer-effect"] !== "none") ||
    vars["--lb-pointer-burst"] === "sparkles" || Object.keys(design.layers).length > 0;
}
export function designBackground(design: ThemeDesign | null, fallback?: string) {
  const vars = design?.vars;
  if (!vars?.["--lb-sky-color"] && !vars?.["--lb-horizon-color"]) return fallback;
  return "linear-gradient(var(--lb-sky-angle,160deg),var(--lb-sky-color,#082c48),var(--lb-horizon-color,#187f89))";
}
export function layerStyles(design: ThemeDesign) {
  return Object.entries(design.layers).map(([name, frames]) =>
    `@keyframes lb-design-${name}{${frames.map(({offset, opacity, transform}) =>
      `${offset}%{${opacity !== undefined ? "opacity:" + opacity + ";" : ""}${transform ? "transform:" + transform + ";" : ""}}`
    ).join("")}}`
  ).join("\n");
}
export const oceanSource = `:root {
  --lb-sky-color: #082c48;
  --lb-horizon-color: #187f89;
  --lb-text: #f0fff9;
  --lb-card-bg: #083b4bea;
  --lb-btn-text: #f0fff9;
  --lb-card-border: #6cb6b8;
  --lb-card-radius: 20px;
  --lb-background-effect: waves;
  --lb-wave-color: #106e82;
  --lb-foam-color: #c6fff1;
  --lb-wave-height: 42%;
  --lb-wave-period: 9s;
  --lb-pointer-effect: trail;
  --lb-pointer-color: #9effdf;
  --lb-hover-glow: #72d9cf;
}
@keyframes mist {
  0% { transform: translate(-12%,0%); opacity: 0.2; }
  50% { transform: translate(12%,3%); opacity: 0.5; }
  100% { transform: translate(-12%,0%); opacity: 0.2; }
}`;
export const themeGuide = [
  "Create a LinkQuilt CSS theme. Return CSS only. Use one :root block with these optional properties.",
  ...Object.entries(themeProperties).map(([k,r]) => k + "  " + r.hint),
  "Optional @keyframes mist and light animate background layers. @keyframes shimmer animates a highlight inside link cards. Use 2–8 ascending integer percentages from 0% through 100%. Each frame accepts opacity (0–1) and transform: translate(x%, y%) with integer coordinates from -50 to 50. Use --lb-layer-period for duration.",
  "Use local image and video uploads through the background picker. CSS accepts only the rules above. Maximum 10,000 characters.",
  "Ocean example", oceanSource
].join("\n");
