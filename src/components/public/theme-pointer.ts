export function attachPointer(surface: HTMLElement, mode: string, count: number, burst: boolean) {
  const owner = surface.parentElement!;
  const area = owner.closest("#lb-theme-preview-root") ?? document;
  const dots = Array.from({ length: mode === "glow" && !burst ? 1 : count }, () => {
    const dot = document.createElement("i");
    dot.className = "lb-pointer-dot";
    surface.append(dot);
    return dot;
  });
  let frame = 0, next = 0, x = 0, y = 0;
  const duration = parseFloat(getComputedStyle(surface).getPropertyValue("--lb-pointer-fade")) || 550;
  function paintDot(angle?: number) {
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dot = dots[next++ % dots.length];
    dot.getAnimations().forEach(animation => animation.cancel());
    dot.style.left = (x - rect.left) * surface.offsetWidth / rect.width + "px";
    dot.style.top = (y - rect.top) * surface.offsetHeight / rect.height + "px";
    const end = angle !== undefined ? `translate(${Math.cos(angle) * 36}px, ${Math.sin(angle) * 36}px) scale(.1)` : mode === "sparkles" ? `translate(${(Math.random() - .5) * 26}px, 18px) rotate(60deg) scale(.1)` : "scale(.15)";
    dot.animate([{ opacity: .8, transform: "scale(1)" }, { opacity: 0, transform: end }], { duration, easing: "ease-out" });
  }
  function move(event: Event) {
    if (!(event instanceof PointerEvent) || event.pointerType === "touch") return;
    x = event.clientX;
    y = event.clientY;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; paintDot(); });
  }
  function scatter(event: Event) {
    if (!(event instanceof PointerEvent) || event.pointerType === "touch") return;
    x = event.clientX;
    y = event.clientY;
    const size = Math.min(dots.length, 8);
    for (let i = 0; i < size; i++) paintDot(i * Math.PI * 2 / size);
  }
  if (mode !== "none") area.addEventListener("pointermove", move, { passive: true });
  if (burst) area.addEventListener("pointerdown", scatter, { passive: true });
  return () => {
    area.removeEventListener("pointermove", move);
    area.removeEventListener("pointerdown", scatter);
    cancelAnimationFrame(frame);
    dots.forEach(dot => dot.remove());
  };
}
