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
    <p>Copy the full CSS rule reference and give it to your AI along with a description of your page. Paste the generated CSS into the theme editor and validate the preview before publishing.</p>
    <div><Button onClick={copy}>Copy prompt for your AI</Button> <span role="status">{status}</span></div>
    <textarea ref={text} aria-label="Complete theme CSS rules and AI prompt" className="min-h-[65vh] rounded-lg border p-4 font-mono text-sm" readOnly value={themeGuide} />
  </article>;
}
