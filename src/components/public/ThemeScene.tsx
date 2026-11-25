"use client";

import { useEffect, useRef, useState } from "react";
import "./theme-scene.css";
import { layerStyles, type ThemeDesign } from "@/lib/custom-theme";

const waveEdge = "M0 58" + " q75 -65 151 -31 q-31 1 -30 21 q13 29 67 18 q64 -16 112 -8".repeat(4);

export function ThemeScene({ design, mode = "desktop", preview = false, video = false }: {
  design: ThemeDesign; mode?: string; preview?: boolean; video?: boolean;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduce, setReduce] = useState(true);
  const [fine, setFine] = useState(false);
  const vars = design.vars;
  const pointer = vars["--lb-pointer-effect"] ?? "none";
  const burst = vars["--lb-pointer-burst"] === "sparkles";
  const still = reduce || paused || hidden || mode === "reduced";
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const mouse = matchMedia("(any-pointer: fine)");
    function update() { setReduce(motion.matches); setFine(mouse.matches); setHidden(document.hidden); }
    update();
    motion.addEventListener("change", update);
    mouse.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      motion.removeEventListener("change", update);
      mouse.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    if (still || !fine || mode === "touch" || (pointer === "none" && !burst) || !overlay.current) return;
    const element = overlay.current;
    let disposed = false;
    let detach: (() => void) | undefined;
    void import("./theme-pointer").then(({ attachPointer }) => {
      if (!disposed) detach = attachPointer(element, pointer, Number(vars["--lb-pointer-count"] ?? 10), burst);
    });
    return () => { disposed = true; detach?.(); };
  }, [pointer, burst, fine, mode, still, vars]);
  useEffect(() => {
    if (!video) return;
    const root = preview ? surface.current?.closest("#lb-theme-preview-root") : document;
    const player = root?.querySelector<HTMLVideoElement>(preview ? "video" : ".lb-video-bg video");
    if (!player) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || connection?.effectiveType?.includes("2g")) { player.pause(); return; }
    if (still) player.pause();
    else if (player.getAttribute("src")) void player.play().catch(() => {});
  }, [still, video, preview]);
  const waves = vars["--lb-background-effect"] === "waves";
  const layers = Object.keys(design.layers).length > 0;
  return <>
    {layers && <style>{layerStyles(design)}</style>}
    <div aria-hidden="true" ref={surface} className="lb-theme-scene" data-preview={preview} data-still={still} data-shimmer={!!design.layers.shimmer}>
      {waves && [0, 1, 2].map(index => <div className="lb-surf" key={index} style={{ bottom: index * -4 + "%", opacity: .5 + index * .23, animationDelay: index * -2.3 + "s" }}>
        <svg viewBox="0 0 1200 160" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">
          <path fill="var(--lb-wave-color,#147d92)" d={waveEdge + " V160 H0 Z"}/>
          <path fill="none" stroke="var(--lb-foam-color,#b1f0e7)" strokeWidth="2" d={waveEdge}/>
        </svg>
      </div>)}
      {Object.entries(design.layers).filter(([name]) => name !== "shimmer").map(([name, frames]) => <div className={`lb-theme-layer lb-layer-${name}`} key={name} style={{
        animationName: `lb-design-${name}`,
        transform: frames[0].transform, opacity: frames[0].opacity
      }} />)}
    </div>
    {(pointer !== "none" || burst) && <div aria-hidden="true" className="lb-pointer-overlay" data-preview={preview} data-pointer={pointer} ref={overlay} />}
    <button type="button" className="lb-theme-pause" data-preview={preview} aria-pressed={paused}
      onClick={() => setPaused(!paused)}>{paused ? "Resume effects" : "Pause effects"}</button>
  </>;
}
