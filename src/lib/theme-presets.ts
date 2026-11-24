/**
 * Built-in theme definitions.
 *
 * Extracted from src/server/queries/index.ts (seedThemesIfEmpty) so the
 * presets can be imported by tests without dragging in the "server-only"
 * runtime + the live database. seedThemesIfEmpty imports PRESETS from here.
 *
 * NOTE: `base` contains the shared token-system defaults. Presets spread
 * `base` then override. Keep this object in sync with schema.ts defaults —
 * the schema-default-conformance test enforces that.
 */

import type { ThemeInput } from "@/lib/theme-tokens";

/**
 * Concrete preset shape — all theme-token fields as required strings (presets
 * always fully specify them via `base`), plus the DB meta fields.
 *
 * Deliberately does NOT extend ThemeInput (which allows null/undefined) —
 * the drizzle insert target (`db.insert(themes).values(...)`) requires
 * notNull strings, so we keep this type strict to satisfy the type checker.
 */
export interface ThemePreset {
  // Meta
  name: string;
  isPreset: true;
  isActive: boolean;
  mode: "dark" | "light";

  // Theme tokens — all required in a preset (provided via `base`).
  backgroundType: string;
  backgroundValue: string;
  backgroundAngle: string;
  overlayColor: string;
  overlayOpacity: string;
  primaryColor: string;
  secondaryColor: string;
  cardBackground: string;
  cardBorderColor: string;
  textColor: string;
  mutedTextColor: string;
  fontFamily: string;
  fontScale: string;
  fontWeight: string;
  letterSpacing: string;
  linkStyle: string;
  animationType: string;
  radius: string;
  buttonSize: string;
  borderWidth: string;
  shadowStrength: string;
  hoverEffect: string;
  containerWidth: string;
  alignment: string;
  density: string;
  glow: string;
  glowColor: string;
  blur: string;
  noise: string;

  // Profile styling (1.3) — defaults live in `base`.
  avatarShape: string;
  avatarBorder: string;
  avatarFloat: string;
  /** "auto" keeps the shape-aware default; else a px number as a string. */
  avatarSize: string;
  // #87 divider element styling — defaults keep the pre-divider look.
  dividerStyle: string;
  /** "" = inherit the theme's card border color. */
  dividerColor: string;
  dividerThickness: string;
  dividerWidth: string;
  profileLayout: string;
  textAnimation: string;

  // Optional — not set by presets, relies on the DB column default ("").
  backgroundImageUrl?: string;
}

/** A ThemePreset is assignable to ThemeInput (used by resolver + tests). */
export function presetAsThemeInput(p: ThemePreset): ThemeInput {
  return p;
}

/** Shared defaults across all presets. */
export const base: Omit<ThemePreset, "name" | "backgroundType" | "backgroundValue" | "fontFamily" | "primaryColor" | "secondaryColor" | "cardBackground" | "cardBorderColor" | "textColor" | "mutedTextColor" | "linkStyle" | "animationType" | "backgroundImageUrl"> = {
  isPreset: true as const,
  isActive: false as const,
  mode: "dark" as const,
  backgroundAngle: "160deg",
  overlayColor: "#000000",
  overlayOpacity: "0",
  fontScale: "100",
  fontWeight: "500",
  letterSpacing: "0",
  radius: "auto",
  buttonSize: "md",
  borderWidth: "1px",
  shadowStrength: "medium",
  hoverEffect: "lift",
  containerWidth: "540px",
  alignment: "center",
  density: "normal",
  glow: "false",
  glowColor: "#533fd6",
  blur: "12px",
  noise: "false",
  avatarShape: "circle",
  avatarBorder: "solid",
  avatarFloat: "false",
  avatarSize: "auto",
  dividerStyle: "solid",
  dividerColor: "",
  dividerThickness: "1",
  dividerWidth: "100",
  profileLayout: "classic",
  textAnimation: "none",
};

export const PRESETS: ThemePreset[] = [
  // ── 1. Aurora (animated, the flagship) ──────────────────────────────
  {
    ...base,
    name: "Aurora",
    backgroundType: "aurora",
    backgroundValue: "#0a0820",
    fontFamily: "inter",
    primaryColor: "#7c5ff0",
    secondaryColor: "#a78bfa",
    cardBackground: "rgba(20,17,46,0.55)",
    cardBorderColor: "rgba(167,139,250,0.18)",
    textColor: "#eceafe",
    mutedTextColor: "#a39ec9",
    linkStyle: "glass",
    animationType: "fade-up",
    avatarBorder: "gradient",
    isActive: true,
  },
  // ── 2. Glassmorphism ────────────────────────────────────────────────
  {
    ...base,
    name: "Glassmorphism",
    backgroundType: "mesh",
    backgroundValue: "#6366f1,#ec4899,#0f172a",
    backgroundAngle: "radial",
    fontFamily: "dm-sans",
    primaryColor: "#818cf8",
    secondaryColor: "#f472b6",
    cardBackground: "rgba(255,255,255,0.12)",
    cardBorderColor: "rgba(255,255,255,0.18)",
    textColor: "#f1f5f9",
    mutedTextColor: "#94a3b8",
    linkStyle: "glass",
    animationType: "lift",
    radius: "16px",
    blur: "20px",
  },
  // ── 3. Neon Cyberpunk ───────────────────────────────────────────────
  {
    ...base,
    name: "Neon Cyberpunk",
    backgroundType: "solid",
    backgroundValue: "#0d0221",
    fontFamily: "jetbrains",
    primaryColor: "#00f0ff",
    secondaryColor: "#ff006e",
    cardBackground: "rgba(13,2,33,0.6)",
    cardBorderColor: "rgba(0,240,255,0.3)",
    textColor: "#e0e0ff",
    mutedTextColor: "#8585a3",
    linkStyle: "neon",
    animationType: "zoom-in",
    radius: "4px",
    glow: "true",
    glowColor: "#00f0ff",
    hoverEffect: "glow",
    fontWeight: "600",
  },
  // ── 4. Editorial Paper ──────────────────────────────────────────────
  {
    ...base,
    mode: "light",
    name: "Editorial Paper",
    backgroundType: "solid",
    backgroundValue: "#faf9f6",
    fontFamily: "playfair",
    primaryColor: "#1a1a1a",
    secondaryColor: "#8b7355",
    cardBackground: "#ffffff",
    cardBorderColor: "#e5e0d5",
    textColor: "#1a1a1a",
    mutedTextColor: "#6b6b6b",
    linkStyle: "sharp",
    animationType: "lift",
    radius: "0px",
    borderWidth: "0px",
    shadowStrength: "subtle",
    buttonSize: "lg",
    fontScale: "110",
    fontWeight: "400",
  },
  // ── 5. Terminal Mono ────────────────────────────────────────────────
  {
    ...base,
    name: "Terminal Mono",
    backgroundType: "solid",
    backgroundValue: "#0c0c0c",
    fontFamily: "jetbrains",
    primaryColor: "#00ff41",
    secondaryColor: "#00ff41",
    cardBackground: "rgba(0,255,65,0.04)",
    cardBorderColor: "rgba(0,255,65,0.2)",
    textColor: "#00ff41",
    mutedTextColor: "#5da669",
    linkStyle: "sharp",
    animationType: "none",
    radius: "0px",
    borderWidth: "1px",
    buttonSize: "sm",
    fontWeight: "400",
    letterSpacing: "0.5",
    hoverEffect: "none",
  },
  // ── 6. Pastel Soft ──────────────────────────────────────────────────
  {
    ...base,
    mode: "light",
    name: "Pastel Soft",
    backgroundType: "gradient",
    backgroundValue: "#fce7f3,#e0e7ff",
    backgroundAngle: "135deg",
    fontFamily: "poppins",
    primaryColor: "#db2777",
    secondaryColor: "#a78bfa",
    cardBackground: "rgba(255,255,255,0.7)",
    cardBorderColor: "rgba(236,72,153,0.15)",
    textColor: "#475569",
    mutedTextColor: "#64748b",
    linkStyle: "pill",
    animationType: "scale",
    radius: "9999px",
    shadowStrength: "soft",
    fontWeight: "500",
  },
  // ── 7. Brutalist ────────────────────────────────────────────────────
  {
    ...base,
    mode: "light",
    name: "Brutalist",
    backgroundType: "solid",
    backgroundValue: "#fbbf24",
    fontFamily: "space-grotesk",
    primaryColor: "#000000",
    secondaryColor: "#000000",
    cardBackground: "#ffffff",
    cardBorderColor: "#000000",
    textColor: "#000000",
    mutedTextColor: "#451a03",
    linkStyle: "sharp",
    animationType: "lift",
    radius: "0px",
    borderWidth: "3px",
    shadowStrength: "none",
    buttonSize: "lg",
    fontWeight: "700",
    letterSpacing: "0.5",
    hoverEffect: "glow",
    glow: "true",
    glowColor: "#000000",
  },
  // ── 8. Retro Sunset ─────────────────────────────────────────────────
  {
    ...base,
    name: "Retro Sunset",
    backgroundType: "gradient",
    backgroundValue: "#2d1b69,#c2185b,#f9a825",
    backgroundAngle: "180deg",
    fontFamily: "bebas",
    primaryColor: "#ffd54f",
    secondaryColor: "#ff6f00",
    cardBackground: "rgba(0,0,0,0.3)",
    cardBorderColor: "rgba(255,213,79,0.3)",
    textColor: "#fff8e1",
    mutedTextColor: "#ffe082",
    linkStyle: "pill",
    animationType: "lift",
    radius: "8px",
    glow: "true",
    glowColor: "#ffd54f",
    fontWeight: "400",
    fontScale: "120",
  },
  // ── 9. Minimal Light ────────────────────────────────────────────────
  {
    ...base,
    mode: "light",
    name: "Minimal Light",
    backgroundType: "solid",
    backgroundValue: "#ffffff",
    fontFamily: "outfit",
    primaryColor: "#2563eb",
    secondaryColor: "#2563eb",
    cardBackground: "#ffffff",
    cardBorderColor: "#e5e7eb",
    textColor: "#111827",
    mutedTextColor: "#6b7280",
    linkStyle: "outline",
    animationType: "lift",
    radius: "12px",
    borderWidth: "1px",
    shadowStrength: "subtle",
    hoverEffect: "lift",
    fontWeight: "500",
  },
  // ── 10. 8-Bit Retro ──────────────────────────────────────────────────
  // Pixel-perfect retro gaming aesthetic. Press Start 2P font, stepped
  // clip-path corners, hard 0-blur shadows. Light mode matching the
  // ReactBits 8-bit template: white bg, near-black text, orange accent.
  // Card borders are orange so accent color dominates the visual.
  {
    ...base,
    mode: "light",
    name: "8-Bit Retro",
    backgroundType: "solid",
    backgroundValue: "#ffffff",
    fontFamily: "press-start",
    primaryColor: "#ea580c",
    secondaryColor: "#0a0a0a",
    cardBackground: "#ffffff",
    cardBorderColor: "#ea580c",
    textColor: "#0a0a0a",
    mutedTextColor: "#737373",
    linkStyle: "pixel",
    animationType: "lift",
    radius: "0px",
    borderWidth: "3px",
    shadowStrength: "none",
    hoverEffect: "lift",
    glow: "false",
    glowColor: "#ea580c",
    blur: "0px",
    fontWeight: "400",
    fontScale: "75",
    letterSpacing: "0",
    buttonSize: "md",
    containerWidth: "480px",
  },
  // ── 11. Frutiger Aero ────────────────────────────────────────────────
  // The canonical mid-2000s "water + air" look: glossy gel-bubble buttons,
  // frosted glass, sky/aqua/leaf palette, bubbles video background. Light
  // mode. Video URL is hotlinked from Mixkit (free license, no attribution);
  // backgroundValue doubles as the aqua gradient fallback when the video
  // can't load. Ink text on bright aqua keeps contrast AA on the gel pills.
  {
    ...base,
    mode: "light",
    name: "Frutiger Aero",
    backgroundType: "video",
    backgroundValue: "#0689E4,#6DD6EC,#FAEFEF",
    backgroundAngle: "180deg",
    backgroundImageUrl:
      "https://assets.mixkit.co/videos/41991/41991-720.mp4",
    overlayColor: "#FAEFEF",
    overlayOpacity: "22",
    fontFamily: "nunito",
    fontWeight: "700",
    primaryColor: "#0689E4",
    // Sky (not Leaf #71AB23): the avatar gradient ring + gradient-flow name
    // use accent→secondary; keeping both in the blue family avoids the green
    // cast on the avatar border and display name.
    secondaryColor: "#6DD6EC",
    cardBackground: "rgba(250,239,239,0.55)",
    cardBorderColor: "rgba(201,214,221,0.65)",
    textColor: "#14425e",
    mutedTextColor: "#3d6a85",
    linkStyle: "gel",
    animationType: "blur-in",
    radius: "auto",
    shadowStrength: "soft",
    blur: "10px",
    glow: "true",
    glowColor: "#6DD6EC",
    hoverEffect: "lift",
    avatarBorder: "gradient",
    avatarFloat: "true",
    textAnimation: "gradient-flow",
  },
  {
    ...base,
    mode: "light",
    name: "Swiss Grid",
    backgroundType: "gradient",
    backgroundValue: "#f3f0e8 94%,#d21f2a 94%",
    backgroundAngle: "90deg",
    fontFamily: "inter",
    fontWeight: "700",
    primaryColor: "#b61d27",
    secondaryColor: "#262524",
    cardBackground: "#fffdf8",
    cardBorderColor: "#292622",
    textColor: "#211e1c",
    mutedTextColor: "#514942",
    linkStyle: "sharp",
    animationType: "none",
    radius: "0px",
    shadowStrength: "none",
    hoverEffect: "none",
    alignment: "left",
    density: "compact",
    containerWidth: "560px",
    avatarShape: "square",
    dividerColor: "#b61d27",
    dividerThickness: "3",
  },
  {
    ...base,
    name: "Deco Nocturne",
    backgroundType: "radial",
    backgroundValue: "#35261c,#171310,#100e0c",
    fontFamily: "playfair",
    fontWeight: "600",
    fontScale: "110",
    primaryColor: "#eac684",
    secondaryColor: "#bf8d4d",
    cardBackground: "#211a14",
    cardBorderColor: "#b08349",
    textColor: "#fff1d6",
    mutedTextColor: "#d3b997",
    linkStyle: "outline",
    animationType: "fade-up",
    radius: "2px",
    borderWidth: "2px",
    shadowStrength: "none",
    density: "relaxed",
    avatarShape: "square",
    avatarBorder: "ring",
    dividerStyle: "gradient",
    dividerWidth: "64",
  },
  {
    ...base,
    mode: "light",
    name: "Memphis Pop",
    backgroundType: "mesh",
    backgroundValue: "#ffd749,#ff82af,#53e3cc,#b5a0ff",
    fontFamily: "space-grotesk",
    fontWeight: "700",
    fontScale: "110",
    primaryColor: "#461bdb",
    secondaryColor: "#b32156",
    cardBackground: "#fff7ac",
    cardBorderColor: "#271847",
    textColor: "#241638",
    mutedTextColor: "#463458",
    linkStyle: "pill",
    animationType: "zoom-in",
    radius: "9999px",
    borderWidth: "3px",
    hoverEffect: "scale",
    avatarShape: "squircle",
    avatarBorder: "gradient",
    dividerStyle: "dotted",
    dividerThickness: "4",
  },
  {
    ...base,
    name: "Indigo Woodblock",
    backgroundType: "gradient",
    backgroundValue: "#14243c 10%,#234d70 52%,#152f4b 52%,#0e1e30 100%",
    backgroundAngle: "135deg",
    fontFamily: "lora",
    primaryColor: "#f2d8a8",
    secondaryColor: "#9fc9df",
    cardBackground: "#18334f",
    cardBorderColor: "#7499ae",
    textColor: "#fff6e5",
    mutedTextColor: "#d1e0e9",
    linkStyle: "sharp",
    animationType: "fade-up",
    radius: "0px",
    shadowStrength: "none",
    noise: "true",
    avatarBorder: "ring",
    dividerThickness: "2",
  },
  {
    ...base,
    mode: "light",
    name: "Risograph",
    backgroundType: "gradient",
    backgroundValue: "#ffb5ca 0%,#ffe9ed 42%,#ddd5ff 42%,#fff4e8 100%",
    backgroundAngle: "135deg",
    fontFamily: "jetbrains",
    fontScale: "95",
    primaryColor: "#4832ab",
    secondaryColor: "#a51850",
    cardBackground: "#fff5e3",
    cardBorderColor: "#663fa2",
    textColor: "#30204e",
    mutedTextColor: "#573e6e",
    linkStyle: "sharp",
    animationType: "slide-in",
    radius: "0px",
    borderWidth: "2px",
    shadowStrength: "none",
    alignment: "left",
    noise: "true",
    avatarShape: "square",
    avatarBorder: "gradient",
    dividerStyle: "dashed",
  },
  {
    ...base,
    mode: "light",
    name: "Herbarium",
    backgroundType: "radial",
    backgroundValue: "#f6f0da,#e9e6cb,#d0d6b3",
    fontFamily: "lora",
    fontScale: "105",
    primaryColor: "#36563a",
    secondaryColor: "#80532f",
    cardBackground: "#fbf6e7",
    cardBorderColor: "#879267",
    textColor: "#283a25",
    mutedTextColor: "#4d5c40",
    linkStyle: "rounded",
    animationType: "fade-up",
    radius: "7px",
    shadowStrength: "none",
    density: "relaxed",
    noise: "true",
    avatarBorder: "ring",
    dividerStyle: "dotted",
    dividerWidth: "72",
  },
  {
    ...base,
    name: "Orbital",
    backgroundType: "radial",
    backgroundValue: "#53354d 0%,#2e203b 32%,#17172c 32%,#101222 100%",
    fontFamily: "bebas",
    fontScale: "125",
    fontWeight: "400",
    letterSpacing: "0.06em",
    primaryColor: "#ffb28e",
    secondaryColor: "#bba6fa",
    cardBackground: "#221f39",
    cardBorderColor: "#a87c9d",
    textColor: "#fff2e9",
    mutedTextColor: "#ddc9e4",
    linkStyle: "pill",
    animationType: "blur-in",
    radius: "9999px",
    buttonSize: "lg",
    shadowStrength: "subtle",
    avatarBorder: "gradient",
    dividerStyle: "gradient",
    dividerWidth: "56",
  },
  {
    ...base,
    mode: "light",
    name: "Bauhaus Weave",
    backgroundType: "gradient",
    backgroundValue: "#e5c373 9%,#dfa579 9% 13%,#f1e3c2 13% 87%,#dfa579 87% 91%,#e5c373 91%",
    backgroundAngle: "90deg",
    fontFamily: "montserrat",
    fontWeight: "700",
    primaryColor: "#74452c",
    secondaryColor: "#4c5a37",
    cardBackground: "#edcc83",
    cardBorderColor: "#765338",
    textColor: "#38271d",
    mutedTextColor: "#503623",
    linkStyle: "sharp",
    animationType: "none",
    radius: "0px",
    borderWidth: "2px",
    shadowStrength: "none",
    hoverEffect: "none",
    noise: "true",
    avatarShape: "square",
    dividerThickness: "4",
  },
  {
    ...base,
    mode: "light",
    name: "Glazed Tile",
    backgroundType: "radial",
    backgroundValue: "#f7fffb,#d2f1ed,#9cddd8",
    fontFamily: "abril",
    fontWeight: "400",
    primaryColor: "#234594",
    secondaryColor: "#b33827",
    cardBackground: "#fcfffc",
    cardBorderColor: "#3566a7",
    textColor: "#14345a",
    mutedTextColor: "#315877",
    linkStyle: "rounded",
    animationType: "scale",
    radius: "24px",
    borderWidth: "2px",
    shadowStrength: "subtle",
    avatarShape: "rounded",
    avatarBorder: "gradient",
    dividerStyle: "gradient",
    dividerThickness: "3",
  },
];

/** Human-readable list of preset names (for test output + seed log). */
export const PRESET_NAMES = PRESETS.map((p) => p.name);
