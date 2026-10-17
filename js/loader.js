// The way in. One kana at a time of クラーケン港 (Unseen's single cycling glyph), a hairline that fills with real
// progress (Kage), a line of what is being raised. When everything is built and compiled, the doors part.
const STATUSES = [
  [0, "Flooding the canals"],
  [0.18, "Raising the towers"],
  [0.36, "Lighting the signs"],
  [0.55, "Lighting the pagoda"],
  [0.72, "Warming the engines"],
  [0.88, "Opening the gate"],
];
const GLYPHS = [..."クラーケン港"];

export function createLoader() {
  const el = document.getElementById("loader");
  const bar = el.querySelector(".ld-bar i");
  const pct = el.querySelector(".ld-pct");
  const status = el.querySelector(".ld-status");
  const glyph = el.querySelector(".ld-glyph");
  let shown = 0, target = 0, gi = 0, done = false;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // cycle the glyphs while we wait
  const cycle = setInterval(() => {
    gi = (gi + 1) % GLYPHS.length;
    glyph.innerHTML = `<span>${GLYPHS[gi]}</span>`;
  }, reduce ? 1200 : 360);
  // ease the shown number toward the real one, so it never jumps or stalls visibly
  let raf = 0;
  const tick = () => {
    shown += (target - shown) * 0.12 + (target > shown ? 0.002 : 0);
    if (shown > target) shown = target;
    bar.style.width = `${(shown * 100).toFixed(1)}%`;
    pct.textContent = `${Math.round(shown * 100)}%`;
    let s = STATUSES[0][1];
    for (const [at, txt] of STATUSES) if (shown >= at) s = txt;
    if (status.textContent !== s) status.textContent = s;
    if (!done || shown < 0.999) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return {
    /** Report progress 0..1 (never goes backwards). */
    set(p) {
      target = Math.max(target, Math.min(1, p));
    },
    /** Let the browser paint a frame so the bar moves between heavy build steps. */
    async breathe(p) {
      if (p != null) this.set(p);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    },
    /** Fill, hold a beat, then part the doors. Resolves when the doors have begun to open. */
    async open() {
      this.set(1);
      done = true;
      await new Promise((r) => setTimeout(r, reduce ? 50 : 520));
      clearInterval(cycle);
      glyph.innerHTML = `<span>港</span>`;
      el.classList.add("is-opening");
      await new Promise((r) => setTimeout(r, reduce ? 0 : 380));
      el.classList.add("is-open", "is-done");
      setTimeout(() => {
        cancelAnimationFrame(raf);
        el.hidden = true;
      }, 1500);
    },
  };
}
