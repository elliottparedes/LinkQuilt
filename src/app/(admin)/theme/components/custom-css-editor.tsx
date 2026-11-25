"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { oceanSource, readDesign, themeSource, emptyDesign } from "@/lib/custom-theme";
import { previewThemeCss } from "@/server/actions/theme";

export function CustomCssEditor({ design, source, onEdit, onValidated }: {
  design: string; source?: string; onEdit: (value: string) => void; onValidated: (value: string) => void;
}) {
  const current = source ?? (design ? themeSource(readDesign(design) ?? emptyDesign()) : "");
  const [message, setMessage] = useState("");
  const [validating, setValidating] = useState<string | null>(null);
  const pending = validating === current;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, [current]);
  function edit(text: string) { request.current++; setValidating(null); setMessage(""); onEdit(text); }
  async function copy() {
    try {
      await navigator.clipboard.writeText(current);
      setMessage("Theme CSS copied.");
    } catch {
      textarea.current?.select();
      setMessage("Theme CSS selected. Copy it with your keyboard.");
    }
  }
  async function validate() {
    const id = ++request.current;
    setValidating(current);
    try {
      const result = await previewThemeCss(current);
      if (id !== request.current) return;
      if ("error" in result) setMessage(result.error);
      else { onValidated(result.design); setMessage("Preview updated. Save and apply to publish."); }
    } catch { if (id === request.current) setMessage("Preview unavailable. Try again."); }
    finally { if (id === request.current) setValidating(null); }
  }
  return <div className="grid gap-3">
    <div className="flex items-center justify-between gap-2">
      <label htmlFor="theme-css-source" className="font-medium">Theme CSS</label>
      <Link className="text-sm underline" href="/theme/guide" target="_blank">CSS guide and AI prompt</Link>
    </div>
    <textarea ref={textarea} id="theme-css-source" className="min-h-64 rounded-md border bg-background p-3 font-mono text-xs" spellCheck={false}
      maxLength={10000} value={current} onChange={e => edit(e.target.value)} placeholder=":root { --lb-accent: #36cabc; }" />
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={validate} disabled={pending}>{pending ? "Validating…" : "Validate & preview"}</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => edit(oceanSource)}>Load Ocean example</Button>
      <Button type="button" size="sm" variant="outline" onClick={copy} disabled={!current}>Copy CSS</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => edit("")}>Clear CSS</Button>
    </div>
    <p role="status" className="text-sm">{message || (source !== undefined ? "Validate this draft before publishing." : "")}</p>
  </div>;
}
