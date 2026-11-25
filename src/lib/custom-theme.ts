// The editor, compiler, and renderer share this versioned theme vocabulary.
type ValueRule = { hint: string; accepts: (value: string) => boolean };
type ThemeProperty = ValueRule & { description: string };

function units(unit: string, min: number, max: number): ValueRule {
  const pattern = new RegExp("^([0-9]{1,3}(?:\\.[0-9]{1,2})?)" + unit + "$");
  return { hint: `${min}${unit}–${max}${unit} inclusive, up to 2 decimal places`, accepts(value) {
    const match = pattern.exec(value);
    return !!match && Number(match[1]) >= min && Number(match[1]) <= max;
  } };
}

function choices(...values: string[]): ValueRule {
  return { hint: values.join(" | "), accepts: (value) => values.includes(value) };
}

const color: ValueRule = { hint: "#RGB, #RRGGBB or #RRGGBBAA", accepts: v => /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(v) };
function describe(rule: ValueRule, description: string): ThemeProperty {
  return { ...rule, description };
}

export const themeProperties: Record<string, ThemeProperty> = {
  "--lb-text": describe(color, "Main text color"),
  "--lb-text-muted": describe(color, "Secondary text color"),
  "--lb-accent": describe(color, "Accent for highlights and buttons"),
  "--lb-secondary": describe(color, "Secondary accent"),
  "--lb-card-bg": describe(color, "Link card background"),
  "--lb-card-border": describe(color, "Link card border color"),
  "--lb-btn-text": describe(color, "Text on accent-colored controls"),
  "--lb-card-radius": describe(units("px", 0, 64), "Link card corner radius"),
  "--lb-spacing": describe(units("px", 4, 48), "Vertical spacing between items"),
  "--lb-border-width": describe(units("px", 0, 6), "Link card border thickness"),
  "--lb-font-size": describe(units("px", 12, 32), "Base text size"),
  "--lb-font": describe(choices("serif", "sans-serif", "monospace", "system-ui"), "Base font family"),
  "--lb-font-weight": describe(choices("400", "500", "600", "700", "800"), "Base font weight"),
  "--lb-shadow-color": describe(color, "Link card shadow color"),
  "--lb-shadow-blur": describe(units("px", 0, 32), "Link card shadow blur"),
  "--lb-hover-glow": describe(color, "Link card glow on hover"),
  "--lb-sky-angle": describe(units("deg", 0, 360), "Background gradient direction"),
  "--lb-sky-color": describe(color, "First background gradient color"),
  "--lb-horizon-color": describe(color, "Second background gradient color"),
  "--lb-background-effect": describe(choices("waves", "none"), "Animated background waves"),
  "--lb-wave-color": describe(color, "Wave fill color"),
  "--lb-foam-color": describe(color, "Wave crest color"),
  "--lb-wave-period": describe(units("s", 3, 40), "Duration of one wave cycle"),
  "--lb-wave-height": describe(units("%", 10, 70), "Wave height as a percentage of the scene"),
  "--lb-pointer-effect": describe(choices("none", "glow", "trail", "sparkles"), "Effect while a pointer moves"),
  "--lb-pointer-color": describe(color, "Pointer effect color"),
  "--lb-pointer-size": describe(units("px", 3, 40), "Pointer particle size"),
  "--lb-pointer-fade": describe(units("ms", 100, 999), "Pointer particle fade time"),
  "--lb-pointer-count": describe({ hint: "Unitless integer from 1 to 16", accepts: v => /^(?:[1-9]|1[0-6])$/.test(v) }, "Pointer particle limit"),
  "--lb-pointer-burst": describe(choices("none", "sparkles"), "Burst when the pointer presses"),
  "--lb-mist-color": describe(color, "Mist layer color"),
  "--lb-light-color": describe(color, "Light layer color"),
  "--lb-shimmer-color": describe(color, "Link card shimmer color"),
  "--lb-layer-period": describe(units("s", 4, 60), "Loop duration for custom keyframes"),
};
const layers = {
  mist: "Moves a band of mist in the background",
  light: "Moves a pool of light in the background",
  shimmer: "Animates a highlight inside link cards",
} as const;
export type LayerName = keyof typeof layers;
export const layerNames = Object.keys(layers) as LayerName[];
export const themeCssMaxLength = 10000;
const minFrames = 2;
const maxFrames = 8;
export const frameCountHint = `Use ${minFrames}–${maxFrames} ascending frames starting at 0% and ending at 100%, each with a value.`;
const translationLimit = 50;
export type ThemeFrame = { offset: number; transform?: string; opacity?: string };
export type ThemeDesign = { version: 1; vars: Record<string, string>; layers: Partial<Record<LayerName, ThemeFrame[]>> };
export const emptyDesign = (): ThemeDesign => ({ version: 1, vars: {}, layers: {} });
export function validFrameValue(key: string, value: string) {
  if (key === "opacity") return /^(?:0|0?\.\d{1,2}|1(?:\.0{1,2})?)$/.test(value);
  const move = /^translate\((-?\d{1,2})%,\s*(-?\d{1,2})%\)$/.exec(value);
  return key === "transform" && !!move && move.slice(1).every(n => Math.abs(Number(n)) <= translationLimit);
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
    if (!layerNames.includes(name as LayerName) || !Array.isArray(frames) || frames.length < minFrames || frames.length > maxFrames) return null;
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
  "Create a LinkQuilt theme from my design brief. Return only paste-ready CSS without Markdown fences or explanations.",
  "",
  "Stylesheet rules",
  "- Include exactly one top-level :root block. Set only the properties needed for my design. Each property may appear once. Omitted properties use LinkQuilt's defaults or the base theme.",
  "- Use unquoted literal values with the units shown. For fractional values with units, include a leading zero, as in 0.5px. Use hex colors in the formats listed below.",
  "- The only optional top-level rules are the named @keyframes below. Use balanced braces and parentheses. The stylesheet limit is " + themeCssMaxLength.toLocaleString("en-US") + " characters.",
  "- Leave out other selectors and at-rules, nested rules, !important, CSS variables inside values, URLs, HTML, and JavaScript.",
  "",
  "Complete list of :root properties and accepted values",
  ...Object.entries(themeProperties).map(([name, { hint, description }]) => `- ${name} (${hint}) — ${description}.`),
  "",
  "Optional animation rules",
  ...layerNames.map(name => `- @keyframes ${name} — ${layers[name]}.`),
  `- Use each layer at most once. ${frameCountHint}`,
  "- Label each frame with a single integer percentage such as 35%. Use percentages for the endpoints too.",
  "- Each frame contains one or both of these declarations, each at most once:",
  "  - opacity: A unitless number from 0 to 1 inclusive, with up to 2 decimal places.",
  `  - transform: translate(x%, y%), where x and y are integers from -${translationLimit} to ${translationLimit} inclusive. Example: translate(-12%, 4%).`,
  "- Set --lb-layer-period to change the shared loop duration.",
  "",
  "How to activate effects",
  "- Set --lb-sky-color or --lb-horizon-color to turn on the background gradient. Set --lb-background-effect to waves to turn on waves.",
  "- Set --lb-pointer-effect for pointer movement and --lb-pointer-burst for pointer presses. These effects can be combined. LinkQuilt suppresses pointer effects on touch and in reduced motion.",
  "- Add the corresponding @keyframes block to enable mist, light, or shimmer. The color properties customize those layers.",
  "- Choose local images and videos separately in LinkQuilt's background picker.",
].join("\n");
