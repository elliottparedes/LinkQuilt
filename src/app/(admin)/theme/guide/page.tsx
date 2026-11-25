"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { themeGuide } from "@/lib/custom-theme";

export default function ThemeGuide() {
  const text = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(themeGuide); setStatus("Copied."); }
    catch { text.current?.select(); setStatus("Prompt selected. Copy it with your keyboard."); }
  }
  return <article className="mx-auto grid w-full max-w-3xl gap-4">
    <h1 className="text-2xl font-semibold">Custom theme guide</h1>
    <p>Give your AI the prompt below and describe the page you want. Paste its CSS into the theme editor, validate the preview, then save and apply your theme.</p>
    <div><Button onClick={copy}>Copy prompt for your AI</Button> <span role="status">{status}</span></div>
    <textarea ref={text} aria-label="Theme rules and Ocean example" className="min-h-[65vh] rounded-lg border p-4 font-mono text-sm" readOnly value={themeGuide} />
  </article>;
}
