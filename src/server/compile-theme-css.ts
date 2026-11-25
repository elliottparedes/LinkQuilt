import { generate, parse, tokenize, tokenTypes, type CssNode } from "css-tree";
import { emptyDesign, layerNames, readDesign, themeProperties, validFrameValue, type LayerName, type ThemeFrame } from "@/lib/custom-theme";

export function compileThemeCss(source: unknown): { design: string } | { error: string } {
  if (typeof source !== "string" || source.length > 10000) return { error: "Use up to 10,000 characters." };
  if (!source.trim()) return { design: "" };
  let line = 1;
  function fail(node: CssNode, message: string): never {
    line = node.loc?.start.line ?? 1;
    throw new Error(message);
  }
  try {
    // CSS parsers recover from missing closing tokens. Reject incomplete drafts
    // and bound nesting before asking the recursive parser to build a tree.
    const closers: number[] = [];
    tokenize(source, (type, start, end) => {
      let problem = "";
      if (type === tokenTypes.LeftCurlyBracket) closers.push(tokenTypes.RightCurlyBracket);
      if (type === tokenTypes.Function || type === tokenTypes.LeftParenthesis) closers.push(tokenTypes.RightParenthesis);
      if ((type === tokenTypes.RightCurlyBracket || type === tokenTypes.RightParenthesis) && type !== closers.pop()) problem = "Unexpected closing delimiter.";
      if (closers.length > 4) problem = "Theme rules are nested too deeply.";
      if (type === tokenTypes.Comment && !source.slice(start, end).endsWith("*/")) problem = "Close the CSS comment.";
      if (problem) { line = source.slice(0, start).split("\n").length; throw new Error(problem); }
    });
    if (closers.length) return { error: `Line ${source.split("\n").length} — close the open CSS block or function.` };
    const ast = parse(source, { positions: true, parseCustomProperty: true, onParseError(error) { throw error; } });
    if (ast.type !== "StyleSheet") return { error: "Expected a stylesheet." };
    const design = emptyDesign();
    let root = false;
    for (const node of ast.children) {
      if (node.type === "Comment") continue;
      if (node.type === "Rule" && generate(node.prelude) === ":root" && !root) {
        root = true;
        for (const decl of node.block.children) {
          if (decl.type !== "Declaration" || decl.important || !Object.hasOwn(themeProperties, decl.property)) fail(decl, "Use a documented theme property.");
          const rule = themeProperties[decl.property];
          const value = generate(decl.value);
          if (!rule.accepts(value)) fail(decl, `${decl.property} accepts ${rule.hint}.`);
          if (Object.hasOwn(design.vars, decl.property)) fail(decl, "Each property may appear once.");
          design.vars[decl.property] = value;
        }
        continue;
      }
      if (node.type !== "Atrule" || node.name !== "keyframes" || !node.prelude || !node.block) fail(node, "Use one :root block and optional named keyframes.");
      const name = generate(node.prelude) as LayerName;
      if (!layerNames.includes(name) || design.layers[name]) fail(node, "Use mist, light or shimmer once per layer.");
      const frames: ThemeFrame[] = [];
      for (const step of node.block.children) {
        if (step.type !== "Rule") fail(step, "Expected a percentage keyframe.");
        const selector = generate(step.prelude);
        if (!/^(?:\d{1,2}|100)%$/.test(selector)) fail(step, "Use an integer percentage.");
        const frame: ThemeFrame = { offset: parseInt(selector) };
        for (const decl of step.block.children) {
          if (decl.type !== "Declaration" || decl.important || (decl.property !== "opacity" && decl.property !== "transform")) fail(decl, "Use opacity or translate motion.");
          const value = generate(decl.value);
          if (!validFrameValue(decl.property, value) || Object.hasOwn(frame, decl.property)) fail(decl, "Use opacity 0–1 or translate(x%, y%) within ±50%.");
          frame[decl.property] = value;
        }
        frames.push(frame);
      }
      design.layers[name] = frames;
      if (!readDesign(JSON.stringify(design))) fail(node, "Use 2–8 ascending frames starting at 0% and ending at 100%, each with a value.");
    }
    if (!root) return { error: "Line 1 — include a :root block." };
    return { design: JSON.stringify(design) };
  } catch (error) {
    if (error instanceof Error && "line" in error && typeof error.line === "number") line = error.line;
    return { error: `Line ${line} — ${error instanceof Error ? error.message : "Invalid CSS"}` };
  }
}
