import { describe, expect, it } from "vitest";
import { compileThemeCss } from "@/server/compile-theme-css";
import { oceanSource, themeSource, readDesign, emptyDesign } from "../custom-theme";
import { buildThemeStyleBlock } from "../theme-tokens";

describe("custom theme CSS", () => {
  it("round-trips Ocean through the same document used by preview, export and publish", () => {
    const result = compileThemeCss(oceanSource);
    if ("error" in result) throw new Error(result.error);
    const design = readDesign(result.design)!;
    expect(design.layers.mist).toHaveLength(3);
    expect(compileThemeCss(themeSource(design))).toEqual(result);
    expect(buildThemeStyleBlock({design: result.design})).toContain("--lb-card-radius: 20px");
  });
  it.each([
    ":root { --lb-text: #aaa", ":root { --lb-text: red }", ".profile { color: blue }",
    ":root { --lb-pointer-size: 1000px }", ":root { --lb-text: var(--external) }",
    ":root { --lb-text: #abc !important }", ":root {} @import 'theme.css';",
    ":root {} @keyframes mist { 0% {opacity:0} }", ":root {} /* unfinished",
    ":root { --lb-text: #abc; --lb-text: #fff }",
  ])("rejects unsupported or malformed CSS", source => {
    expect(compileThemeCss(source)).toHaveProperty("error");
  });
  it("identifies the offending line and rejects forged persisted properties", () => {
    expect(compileThemeCss(":root {\n --lb-text: red;\n}")).toMatchObject({error: expect.stringContaining("Line 2")});
    const design = JSON.stringify({...emptyDesign(), vars: {"--lb-text": "inherit"}});
    expect(readDesign(design)).toBeNull();
    expect(buildThemeStyleBlock({design})).toEqual(buildThemeStyleBlock({}));
  });
});
