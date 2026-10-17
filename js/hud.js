// HALCYON's HUD, in the language extracted from Rive City (DESIGN-LANGUAGE.md §3): near-black pills with a hairline
// ring, a thin tracked mono label voice, a wide display voice for numbers, one amber accent. A segmented quality
// pill, a ticker that names where you are and the one thing to do, a keycap bar, lock reticles and tags on the
// skiffs, corner brackets on the screen you are nearest, screens that open when clicked, and the HUD glass that
// floats over the cockpit.
import * as THREE from "three";
import { KINDS, compositeCanvas } from "./billboards.js";
import { PORT } from "./port.js";
import { HOME } from "./districts.js";
import { columnOf, spanOf } from "./world.js";

/** Out in the endless wards: is (x, z) beyond the hand-built port, and what is that block called. */
const inWards = (x, z) => Math.abs(x) > HOME.X - 20 || z < HOME.Z;
const wardName = (x, z) => `MUGEN WARD ${String.fromCharCode(65 + (((columnOf(x) + 13) % 26) + 26) % 26)}-${Math.abs(spanOf(z))}`;

const CANALS = ["HIKARI CANAL", "KOI CANAL", "SHIMA CANAL", "YORU CANAL"];

// クラーケン, built from straight cuts the way Japanese cyberpunk logotypes are: one stroke weight, hard diagonals, a
// stencil gap run through the whole word. Each glyph sits in a 100 x 112 box, 96 apart.
const WORDMARK = [
  ["30,2 46,2 18,44 2,44", "38,18 96,18 96,36 54,110 36,110 78,34 38,34"],
  ["22,4 80,4 80,20 22,20", "10,34 94,34 94,52 54,110 36,110 74,50 10,50"],
  ["10,50 94,50 88,66 4,66"],
  ["26,2 42,2 18,50 2,50", "24,26 96,26 96,42 24,42", "58,42 74,42 46,110 30,110"],
  ["6,12 20,4 40,24 26,32", "4,96 84,18 98,32 18,110"],
];
const wordmarkSVG = () => `<svg class="wm" viewBox="0 0 484 112" aria-hidden="true">
  <defs>
    <linearGradient id="wmChrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#f3ece2"/><stop offset="0.8" stop-color="#bdb2bf"/><stop offset="1" stop-color="#efe4ec"/></linearGradient>
    <mask id="wmCut" maskUnits="userSpaceOnUse" x="0" y="0" width="484" height="112"><rect width="484" height="112" fill="#fff"/><rect y="73" width="484" height="3.4" fill="#000"/><path d="M0 26 L484 12" stroke="#000" stroke-width="1.6"/></mask>
  </defs>
  <g fill="url(#wmChrome)" mask="url(#wmCut)">${WORDMARK.map((g, i) => `<g transform="translate(${i * 96} 0)"><g class="wm-g" style="--i:${i}">${g.map((pts) => `<polygon points="${pts}"/>`).join("")}</g></g>`).join("")}</g>
</svg>`;

export function createHud({ flight, port, traffic, camera, onQuality, onNight, onSound, quality = "high" }) {
  const root = document.getElementById("ui");
  root.innerHTML = `
  <div class="hud" data-view="chase">
    <header class="hud-top">
      <svg class="railframe" aria-hidden="true"></svg>
      <nav class="chapters" aria-label="Chapters">
        <button type="button" data-ch="0" data-short="VISION"><i class="kj" aria-hidden="true" lang="ja">視</i><i class="sh" aria-hidden="true">VISION</i><em>01</em><span><b>Kraken Vision</b><b aria-hidden="true">Kraken Vision</b></span></button>
        <button type="button" data-ch="1" data-short="CRAB"><i class="kj" aria-hidden="true" lang="ja">蟹</i><i class="sh" aria-hidden="true">CRAB</i><em>02</em><span><b>The Crab</b><b aria-hidden="true">The Crab</b></span></button>
        <button type="button" data-ch="2" data-short="PAGODA"><i class="kj" aria-hidden="true" lang="ja">塔</i><i class="sh" aria-hidden="true">PAGODA</i><em>03</em><span><b>Tenryū Pagoda</b><b aria-hidden="true">Tenryū Pagoda</b></span></button>
        <button type="button" data-ch="3" data-short="WARD"><i class="kj" aria-hidden="true" lang="ja">区</i><i class="sh" aria-hidden="true">WARD</i><em>04</em><span><b>Mugen Ward</b><b aria-hidden="true">Mugen Ward</b></span></button>
      </nav>
      <div class="pill brand">
        <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15c3-5 6-7 9-7s6 2 9 7" /><path d="M7 15c1.6-2.4 3.3-3.6 5-3.6S15.4 12.6 17 15" /><circle cx="12" cy="17.4" r="1.4" /></svg>
        <b>HALCYON</b><span class="sep">·</span><span>KRAKEN PORT</span><span class="sep">·</span><span class="clock">22:41</span>
        <span class="np" aria-live="polite"><span class="np-t"></span></span>
        <button type="button" class="snd" aria-label="Music off" aria-pressed="false"><i></i><i></i><i></i><i></i></button>
        <i class="tablabel" aria-hidden="true">KRAKEN PORT</i>
      </div>
    </header>

    <div class="glass" aria-hidden="true">
      <div class="g-left">
        <svg class="g-turn" viewBox="0 0 24 24"><path d="M5 20V11h11" /><path d="M12 7l4 4-4 4" /></svg>
        <div><b class="g-dist">—</b><small class="g-place">GRAND CHANNEL</small></div>
      </div>
      <div class="g-mid"><span class="g-rule"></span><b class="g-speed">0</b><small>KM/H</small></div>
      <div class="g-right"><small class="g-mode">TAXI</small><b class="g-alt">1.1</b><small>M ALT</small></div>
    </div>

    <div class="tags" aria-hidden="true"></div>
    <div class="guide" aria-hidden="true" hidden><i class="g-dia"></i><i class="g-arrow"></i><span><b class="gd-name"></b><small class="gd-dist"></small></span></div>

    <footer class="hud-bottom">
      <div class="navarrow" hidden aria-live="polite"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3 42 42 24 32 6 42Z" /></svg><p><b class="na-turn">AHEAD</b><span class="na-to"></span></p></div>
      <div class="pill ticker" role="status">
        <i class="dot"></i><span class="t-a">GRAND CHANNEL</span><i class="sep">·</i><span class="t-b">0 KM/H</span><i class="sep">·</i><span class="t-c">W TO TAXI</span>
      </div>
      <div class="pill keys">
        <span class="k"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><em>DRIVE</em></span>
        <span class="k"><kbd>F</kbd><em>SKIM</em></span>
        <span class="k"><kbd>P</kbd><em>AUTOPILOT</em></span>
        <span class="k"><kbd>C</kbd><em>CAMERA</em></span>
        <span class="k"><kbd>N</kbd><em>DAY/NIGHT</em></span>
        <span class="k hint"><b>DRAG</b><em>LOOK</em></span>
        <span class="k hint"><b>CLICK</b><em>SCREENS</em></span>
      </div>
    </footer>

    <p class="vkanji" aria-hidden="true"><span>クラーケン港</span><small>N°07</small></p>

    <section class="title" aria-label="HALCYON">
      <div class="title-copy">
        <p class="eyebrow rv"><i class="dot"></i>HALCYON LINES <span>—</span> NIGHT DESCENT 07</p>
        <div class="wordmark">${wordmarkSVG()}</div>
        <h1 aria-label="Welcome to Kraken Port">
          <span class="ln">KRAKEN PORT</span>
        </h1>
        <p class="jp rv" lang="ja"><span class="tag">+07</span><svg class="xh" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0v12M0 6h12" /><circle cx="6" cy="6" r="3" /></svg>土星の月 タイタン <span class="sep">/</span> <span class="en">SATURN VI · 52°N</span></p>
        <p class="lede rv" data-text="A floating city on Titan's methane sea. Step through the gate and fly the canals.">A floating city on Titan's methane sea. Step through the gate and fly the canals.</p>
        <div class="title-actions rv">
          <button type="button" class="board aural"><span class="aural-seal" aria-hidden="true" lang="ja"><b>搭</b><b>乗</b></span><span class="aural-t">Board HL-07</span><span class="aural-ar" aria-hidden="true"><svg viewBox="0 0 14 14"><path d="M3 11 11 3M5 3h6v6" /></svg></span></button>
          <p class="title-note"><i class="dot"></i><span>Gate 3 · boarding now</span><kbd>Enter</kbd></p>
        </div>
      </div>
      <p class="touch-hint rv" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="11" /></svg><span>Move across the water</span></p>
    </section>
    <div class="arrive" role="status" aria-live="polite"><small>ARRIVED</small><b></b></div>

    <div class="touch">
      <div class="stick" aria-label="Drive: drag up to go, left and right to steer"><i class="knob"></i><span>DRIVE</span></div>
      <div class="tbtns">
        <button type="button" data-act="skim" aria-pressed="false">SKIM</button>
        <button type="button" data-act="auto" aria-pressed="false">AUTO</button>
        <button type="button" data-act="cam">CAM</button>
      </div>
    </div>

    <section class="focus" hidden aria-modal="true" role="dialog" aria-label="Screen">
      <div class="focus-card">
        <div class="focus-screen"><canvas></canvas><i class="br tl"></i><i class="br tr"></i><i class="br bl"></i><i class="br br2"></i></div>
        <div class="focus-meta">
          <p class="focus-tag">// SCREEN</p>
          <h2 class="focus-name">—</h2>
          <p class="focus-line">—</p>
          <div class="focus-actions"><button type="button" class="cta aural"><span class="aural-t">Open</span><span class="aural-ar" aria-hidden="true"><svg viewBox="0 0 14 14"><path d="M3 11 11 3M5 3h6v6" /></svg></span></button><button type="button" class="close glass"><kbd>ESC</kbd><span>Back to the channel</span></button></div>
        </div>
      </div>
    </section>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const hud = $(".hud");
  const tags = $(".tags");
  const glassEl = $(".glass");

  // ---- quality, music ----------------------------------------------------------------------------------------
  const setQualityUI = (q) =>
    root.querySelectorAll(".seg button").forEach((o) => {
      o.classList.toggle("is-on", o.dataset.q === q);
      o.setAttribute("aria-pressed", String(o.dataset.q === q));
    });
  root.querySelectorAll(".seg button").forEach((b) =>
    b.addEventListener("click", () => {
      setQualityUI(b.dataset.q);
      onQuality?.(b.dataset.q);
    }),
  );
  setQualityUI(quality);
  // ---- the NEON RAIL frame: one bar, chamfered at both ends, beveled in glossy magenta, a raised tab over the brand and
  //      one over the mode switch, and a tab under the chapter you are bound for; drawn to fit what it holds -----------
  const headerEl = $(".hud-top"), railEl = $(".railframe");
  function drawRail() {
    if (document.body.dataset.ui !== "rail") return;
    const W = headerEl.offsetWidth, H = headerEl.offsetHeight;
    if (!W || !H) return;
    const hb = headerEl.getBoundingClientRect();
    const span = (el) => {
      const r = el.getBoundingClientRect();
      return [r.left - hb.left, r.right - hb.left];
    };
    const wide = innerWidth > 860;
    const t = 10, s = 9, c = 20, pad = t + 4;
    const [b0, b1] = span($(".brand"));
    const segEl = $(".seg");
    const [m0, m1] = segEl ? span(segEl) : [0, 0];
    const onEl = $(".chapters button.is-on") ?? $(".chapters");
    const [k0, k1] = span(onEl);
    const shape = (i) => {
      const top = [[c + i * 0.45, i]];
      for (const [a, b] of [[b0 + 18, b1 - 18], [m0 + 16, m1 - 16]]) if (b - a > 2 * s + 10) top.push([a, i], [a + s, -t + i], [b - s, -t + i], [b, i]);
      top.push([W - c - i * 0.45, i]);
      const bottom = [[W - c - i * 0.45, H - i]];
      if (wide && k1 - k0 > 2 * s + 10) bottom.push([k1 - 6, H - i], [k1 - 6 - s, H + t - i], [k0 + 6 + s, H + t - i], [k0 + 6, H - i]);
      bottom.push([c + i * 0.45, H - i]);
      const pts = [[i, H / 2], ...top, [W - i, H / 2], ...bottom];
      return "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${(y + pad).toFixed(1)}`).join("L") + "Z";
    };
    railEl.setAttribute("viewBox", `0 0 ${W} ${H + pad * 2}`);
    railEl.style.top = `${-pad}px`;
    railEl.style.width = `${W}px`;
    railEl.style.height = `${H + pad * 2}px`;
    railEl.innerHTML = `<defs>
      <linearGradient id="rfFrame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--rf-hi)"/><stop offset="0.22" style="stop-color:var(--rf-a)"/><stop offset="0.6" style="stop-color:var(--rf-b)"/><stop offset="1" style="stop-color:var(--rf-lo)"/></linearGradient>
      <linearGradient id="rfPanel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--rf-p1)"/><stop offset="0.5" style="stop-color:var(--rf-p2)"/><stop offset="1" style="stop-color:var(--rf-p3)"/></linearGradient>
      <linearGradient id="rfSheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--rf-a);stop-opacity:0.32"/><stop offset="0.45" style="stop-color:var(--rf-a);stop-opacity:0"/></linearGradient>
      <pattern id="rfHazard" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="4.5" height="9" style="fill:var(--rf-a)" fill-opacity="0.75"/></pattern>
    </defs><path d="${shape(0)}" fill="url(#rfFrame)"/><path d="${shape(2)}" fill="url(#rfPanel)"/><path d="${shape(2)}" fill="url(#rfSheen)"/>
    <path d="${shape(5.5)}" fill="none" style="stroke:var(--rf-hi)" stroke-opacity="0.32" stroke-width="1"/>
    ${hazard(b0 + 18, b1 - 18)}${hazard(m0 + 16, m1 - 16)}
    <circle cx="${c + 1}" cy="${pad + 1}" r="2.2" style="fill:var(--rf-hi)"/><circle cx="${W - c - 1}" cy="${H + pad - 1}" r="2.2" style="fill:var(--rf-hi)"/>
    <path d="${dashes(c + 26, Math.min(c + 170, k0 - 20), H + pad + 7)}" style="stroke:var(--rf-a)" stroke-opacity="0.7" stroke-width="2"/>
    <path d="${dashes(Math.max(W - c - 170, k1 + 20), W - c - 26, pad - 7)}" style="stroke:var(--neon2)" stroke-opacity="0.8" stroke-width="2"/>`;
    // hazard stripes in the raised tabs, the way HUD frames band their tabs; segmented dashes off the bar's edges
    function hazard(a, b) {
      if (b - a <= 2 * s + 10) return "";
      const y0 = -t + 2 + pad, y1 = pad + 1;
      return `<path d="M${(a + s + 1).toFixed(1)} ${y0}L${(a + s + 1 + 46).toFixed(1)} ${y0}L${(a + 1 + 46 + 2).toFixed(1)} ${y1}L${(a + 3).toFixed(1)} ${y1}Z" fill="url(#rfHazard)"/>`;
    }
    function dashes(a, b, y) {
      if (b - a < 30) return "";
      let d = "";
      for (let x = a; x + 10 <= b; x += 16) d += `M${x.toFixed(1)} ${y}h10`;
      return d;
    }
  }
  addEventListener("resize", drawRail);
  document.fonts?.ready.then(drawRail);
  new ResizeObserver(() => drawRail()).observe(headerEl);

  // UI variations: NEON RAIL, SYS TERMINAL, NOREN signboards (?ui=rail|sys|noren, or U to cycle)
  const UIS = ["rail", "sys", "noren"];
  const setUI = (u) => {
    document.body.dataset.ui = u;
    requestAnimationFrame(drawRail);
    try {
      localStorage.setItem("halcyon-ui", u);
    } catch {}
  };
  setUI(UIS.includes(new URLSearchParams(location.search).get("ui")) ? new URLSearchParams(location.search).get("ui") : (() => {
    try {
      const s = localStorage.getItem("halcyon-ui");
      if (UIS.includes(s)) return s;
    } catch {}
    return "rail";
  })());
  addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "u" && !e.target.closest?.("input, textarea")) setUI(UIS[(UIS.indexOf(document.body.dataset.ui) + 1) % UIS.length]);
  });
  const snd = $(".snd"), np = $(".np"), npT = $(".np-t");
  snd.addEventListener("click", async () => {
    const on = snd.getAttribute("aria-pressed") !== "true";
    snd.setAttribute("aria-pressed", String(on));
    snd.setAttribute("aria-label", on ? "Music on" : "Music off");
    const title = await onSound?.(on);
    npT.textContent = on && title ? title : "";
    np.classList.toggle("is-on", Boolean(on && title));
  });
  addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "n" && !focusOpen) onNight?.();
    if (e.key === "Escape" && focusOpen) closeFocus();
  });

  // ---- touch: a stick on the left (up to go, sideways to steer) and three round buttons on the right -----------------
  const touchUI = matchMedia("(pointer: coarse)").matches || innerWidth < 760;
  hud.classList.toggle("is-touch", touchUI);
  const stick = $(".stick"), knob = $(".knob");
  let stickId = null;
  const setStick = (dx, dy) => {
    const r = 40;
    const len = Math.min(1, Math.hypot(dx, dy) / r);
    const a = Math.atan2(dy, dx);
    const x = Math.cos(a) * len * r, y = Math.sin(a) * len * r;
    knob.style.transform = `translate(${x}px, ${y}px)`;
    flight.virtual.steer = -x / r;
    flight.virtual.throttle = Math.max(-0.6, -y / r);
  };
  stick.addEventListener("pointerdown", (e) => {
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    const b = stick.getBoundingClientRect();
    setStick(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
  });
  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stickId) return;
    const b = stick.getBoundingClientRect();
    setStick(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
  });
  const release = () => {
    stickId = null;
    knob.style.transform = "";
    flight.virtual.steer = 0;
    flight.virtual.throttle = 0;
  };
  stick.addEventListener("pointerup", release);
  stick.addEventListener("pointercancel", release);
  root.querySelectorAll(".tbtns button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.act === "skim") flight.toggleSkim();
      if (b.dataset.act === "auto") flight.toggleAutopilot();
      if (b.dataset.act === "cam") flight.cycleView();
    }),
  );

  // ---- the title: BOARD dives the camera through the great torii and hands over the controls -----------------------
  $(".board").addEventListener("click", () => flight.board());
  root.querySelectorAll(".title h1 .ln").forEach((ln, li) => {
    ln.innerHTML = [...ln.textContent].map((ch, i) => (ch === " " ? `<i class="sp"> </i>` : `<i style="--i:${i + li * 4}"><b>${ch}</b></i>`)).join("");
  });

  // ---- chapters: fly straight to one (boarding first, from the home screen) -------------------------------------------
  const CHAPTERS = [
    { name: "KRAKEN VISION", x: -12, z: 300 },
    { name: "THE CRAB", x: 22, z: 664 },
    { name: "TENRYŪ PAGODA", x: 0, z: -96, gaze: 42 }, // (stops where the whole pagoda can be seen, and looks up at it)
    { name: "MUGEN WARD", x: 0, z: -1440 },
  ];
  root.querySelectorAll(".chapters button").forEach((b) =>
    b.addEventListener("click", () => {
      const ch = CHAPTERS[+b.dataset.ch];
      root.querySelectorAll(".chapters button").forEach((o) => o.classList.toggle("is-on", o === b));
      requestAnimationFrame(drawRail);
      const go = () => flight.goTo(ch.name, ch.x, ch.z);
      if (flight.state.view !== "title" && inWards(flight.state.pos.x, flight.state.pos.z)) {
        // far out in the wards the autopilot knows no route home: the line recalls the shuttle to the Grand Channel
        hud.classList.add("is-recall");
        setTimeout(() => {
          flight.recall(10, 420, 0);
          go();
        }, 520);
        setTimeout(() => hud.classList.remove("is-recall"), 1300);
        return;
      }
      if (flight.state.view === "title") {
        flight.onBoarded = () => {
          flight.onBoarded = null;
          go();
        };
        flight.board();
      } else go();
    }),
  );
  const arrive = $(".arrive");
  flight.onArrive = (name) => {
    const ch = CHAPTERS.find((c) => c.name === name);
    if (ch?.gaze) flight.gaze(ch.gaze, 8);
    arrive.querySelector("b").textContent = name;
    arrive.classList.remove("is-on");
    void arrive.offsetWidth;
    arrive.classList.add("is-on");
    root.querySelectorAll(".chapters button").forEach((o) => o.classList.remove("is-on"));
  };

  // ---- the opening: letters rise, the lede decrypts from glyphs, the numbers count up ----------------------------------
  function intro() {
    hud.classList.add("is-intro");
    const lede = $(".lede");
    const final = lede.dataset.text;
    const glyphs = "アイウエオカキクケコサシスセソ01#%&*+=<>/";
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now() + 700;
    const dur = reduce ? 1 : 1100;
    const step = () => {
      const k = Math.max(0, Math.min(1, (performance.now() - t0) / dur));
      const n = Math.floor(final.length * k);
      let s = final.slice(0, n);
      for (let i = n; i < Math.min(final.length, n + 14); i++) s += final[i] === " " ? " " : glyphs[(Math.random() * glyphs.length) | 0];
      lede.textContent = k >= 1 ? final : s;
      if (k < 1) requestAnimationFrame(step);
    };
    lede.textContent = "";
    requestAnimationFrame(step);
    root.querySelectorAll("[data-count]").forEach((el, i) => { // (none on the home screen now)
      const to = +el.dataset.count, dp = +(el.dataset.dp ?? 0);
      const s0 = performance.now() + 900 + i * 120;
      const tick = () => {
        const k = Math.max(0, Math.min(1, (performance.now() - s0) / (reduce ? 1 : 900)));
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = (to * e).toFixed(dp).replace("-", "−");
        if (k < 1) requestAnimationFrame(tick);
      };
      tick();
    });
  }

  // ---- tags: a pool of reticles and brackets, reused each frame ---------------------------------------------------
  const reticles = Array.from({ length: 4 }, () => {
    const el = document.createElement("div");
    el.className = "lock";
    el.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" class="r1"/><circle cx="50" cy="50" r="31" class="r2"/>
      <path class="ticks" d="M50 6v8M50 86v8M6 50h8M86 50h8"/><path class="tri" d="M50 0l-5 7h10zM50 100l-5-7h10zM0 50l7-5v10zM100 50l-7-5v10z"/>
      <path class="core" d="M42 58l8-16M50 58l8-16"/></svg><div class="lock-tag"><small>TRK // LOCK</small><b>SK-0000</b><span>0 M</span></div>`;
    tags.appendChild(el);
    return el;
  });
  const brackets = Array.from({ length: 2 }, () => {
    const el = document.createElement("div");
    el.className = "bracket";
    el.innerHTML = `<i class="br tl"></i><i class="br tr"></i><i class="br bl"></i><i class="br br2"></i><div class="b-label"><b>NAME</b><small>CLICK TO OPEN · 0 M</small></div>`;
    tags.appendChild(el);
    return el;
  });

  // ---- clicking a screen opens it ----------------------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  let downAt = null;
  const canvas = document.getElementById("scene");
  canvas.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
  canvas.addEventListener("pointerup", (e) => {
    if (flight.state.view === "title") return;
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const board = port.boards.pick(ray);
    if (board) openFocus(board);
  });
  let focusOpen = null;
  let focusSource = null;
  const focus = $(".focus");
  const focusCanvas = focus.querySelector("canvas");
  function openFocus(board) {
    const k = KINDS[board.kind];
    focusOpen = board;
    focusSource = compositeCanvas(board.entry);
    focusCanvas.width = focusSource.width;
    focusCanvas.height = focusSource.height;
    focus.querySelector(".focus-screen").style.aspectRatio = `${board.entry.w} / ${board.entry.h}`;
    focus.querySelector(".focus-name").textContent = k.name;
    focus.querySelector(".focus-line").textContent = k.line;
    focus.querySelector(".focus-tag").textContent = `// ${board.kind === "kraken" ? "LANDMARK" : "SCREEN"} · ${Math.round(board.dist ?? 0)} M`;
    const cta = focus.querySelector(".cta");
    cta.hidden = !k.cta;
    cta.querySelector(".aural-t").textContent = k.cta ? k.cta.charAt(0) + k.cta.slice(1).toLowerCase() : "";
    focus.hidden = false;
    flight.state.held = true;
    requestAnimationFrame(() => focus.classList.add("is-open"));
    focus.querySelector(".close").focus();
  }
  function closeFocus() {
    focus.classList.remove("is-open");
    focusOpen = null;
    flight.state.held = false;
    setTimeout(() => (focus.hidden = true), 200);
  }
  focus.querySelector(".close").addEventListener("click", closeFocus);
  focus.addEventListener("click", (e) => e.target === focus && closeFocus());

  // ---- per frame ------------------------------------------------------------------------------------------------------
  const v = new THREE.Vector3();
  const project = (p) => {
    v.copy(p).project(camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, on: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  };
  const tmp = new THREE.Vector3();
  let lastView = null;
  function update(time) {
    const s = flight.state;
    if (s.view !== lastView) {
      hud.dataset.view = s.view;
      lastView = s.view;
    }
    const kmh = Math.abs(s.speed) * 3.6;
    // where are we, and what is next
    const p = s.pos;
    const T = PORT.temple;
    let place = "GRAND CHANNEL";
    if (p.z > PORT.channel.z0) place = "HARBOUR MOUTH";
    else if (Math.hypot(p.x, p.z - T.z) < T.r + 30) place = "TENRYŪ BASIN";
    else if (inWards(p.x, p.z)) place = wardName(p.x, p.z);
    else if (p.z < PORT.channel.z1) place = "WARD GATE";
    PORT.cross.forEach((c, i) => {
      if (Math.abs(p.z - c.z) < c.w * 0.7) place = CANALS[i];
    });
    const ahead = flight.forward();
    const marks = [
      { name: "THE GREAT TORII", x: 0, z: PORT.channel.z0 + 90 },
      { name: "TENRYŪ PAGODA", x: 0, z: T.z },
      { name: "MUGEN WARD", x: 0, z: HOME.Z },
    ];
    let next = null, nd = Infinity;
    for (const m of marks) {
      const dx = m.x - p.x, dz = m.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 60 && (dx * ahead.x + dz * ahead.z) / d > 0.3 && d < nd) (nd = d), (next = m);
    }
    const trip = flight.trip;
    const action = s.autopilot && trip
      ? `AUTOPILOT · TO ${trip.name} · ${Math.round(Math.hypot(trip.x - p.x, trip.z - p.z))} M`
      : s.autopilot
      ? "AUTOPILOT · TOURING THE PORT"
      : kmh < 2
        ? touchUI ? "STICK UP TO TAXI" : "W TO TAXI"
        : s.skim
          ? touchUI ? "SKIM TO SETTLE" : "F TO SETTLE ON THE WATER"
          : touchUI ? "SKIM TO LIFT OFF" : "F TO SKIM";
    root.querySelector('[data-act="skim"]').setAttribute("aria-pressed", String(s.skim));
    root.querySelector('[data-act="auto"]').setAttribute("aria-pressed", String(s.autopilot));
    setText(".t-a", place);
    // the direction arrow: points along the canal route to the next turn (not through the buildings), says which way
    {
      const na = root.querySelector(".navarrow");
      const gp = flight.guide();
      if (gp && s.view !== "title") {
        camera.getWorldDirection(tmp);
        const fl = Math.hypot(tmp.x, tmp.z) || 1, fxx = tmp.x / fl, fzz = tmp.z / fl;
        const dx = gp.x - p.x, dz = gp.z - p.z, dl = Math.hypot(dx, dz) || 1;
        const ahead = (dx * fxx + dz * fzz) / dl, side = (dx * -fzz + dz * fxx) / dl;
        const ang = Math.atan2(side, ahead);
        na.style.setProperty("--r", `${ang.toFixed(3)}rad`);
        const deg = Math.abs((ang * 180) / Math.PI);
        setText(".na-turn", deg < 20 ? "AHEAD" : deg > 140 ? "TURN AROUND" : `${deg < 60 ? "BEAR" : "TURN"} ${ang < 0 ? "LEFT" : "RIGHT"}`);
        setText(".na-to", `${flight.trip.name} · ${Math.round(Math.hypot(flight.trip.x - p.x, flight.trip.z - p.z))} M`);
        na.hidden = false;
      } else na.hidden = true;
    }
    // guidance: where the trip is going, a diamond over the place with its distance; off screen it waits at the edge,
    // pointing the way
    {
      const g = root.querySelector(".guide");
      const tripG = flight.trip;
      if (tripG && s.view !== "title") {
        const pr = project(tmp.set(tripG.x, 26, tripG.z));
        const behind = v.z > 1;
        let x = behind ? innerWidth - pr.x : pr.x, y = behind ? innerHeight * 0.8 : pr.y;
        const m = 64, cx = innerWidth / 2, cy = innerHeight / 2;
        const inside = !behind && x > m && x < innerWidth - m && y > m + 70 && y < innerHeight - m - 90;
        if (!inside) {
          // to the edge, along the line from the centre
          const dx = x - cx, dy = y - cy;
          const k = Math.min((innerWidth / 2 - m) / Math.max(1, Math.abs(dx)), (innerHeight / 2 - m - 80) / Math.max(1, Math.abs(dy)));
          x = cx + dx * k;
          y = cy + dy * k;
          g.style.setProperty("--a", `${Math.atan2(dy, dx)}rad`);
        }
        g.classList.toggle("is-edge", !inside);
        g.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        setText(".gd-name", tripG.name);
        setText(".gd-dist", `${Math.round(Math.hypot(tripG.x - p.x, tripG.z - p.z))} M`);
        g.hidden = false;
      } else g.hidden = true;
    }
    setText(".t-b", next ? `${next.name} · ${Math.round(nd)} M` : `${Math.round(kmh)} KM/H`);
    setText(".t-c", s.blocked > 0.2 ? "MIND THE PONTOONS" : action);
    // the HUD glass (cockpit)
    setText(".g-speed", String(Math.round(kmh)));
    setText(".g-dist", next ? `${Math.round(nd)} M` : "—");
    setText(".g-place", next ? next.name : place);
    setText(".g-mode", s.autopilot ? "AUTOPILOT" : s.skim ? "SKIM" : "TAXI");
    setText(".g-alt", s.pos.y.toFixed(1));
    const d = new Date();
    setText(".clock", `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);

    // the pills own the top and bottom bands, and tags keep inside the edges
    const top = 72, bottom = innerHeight - 116;
    const claimed = [];
    const inFrame = (r) => r.x0 >= 12 && r.x1 <= innerWidth - 12 && r.y0 >= top && r.y1 <= bottom;
    const free = (r) => {
      if (!inFrame(r)) return false;
      for (const c of claimed) if (r.x0 < c.x1 && r.x1 > c.x0 && r.y0 < c.y1 && r.y1 > c.y0) return false;
      claimed.push(r);
      return true;
    };
    // in the cockpit the HUD glass owns the middle of the screen
    if (s.view === "cockpit") {
      const g = glassEl.getBoundingClientRect();
      claimed.push({ x0: g.left - 24, x1: g.right + 24, y0: g.top - 24, y1: g.bottom + 24 });
    }
    // corner brackets on the nearest screens in view, with a label
    const cands = [];
    for (const b of port.boards.boards) {
      const dist = b.pos.distanceTo(camera.position);
      b.dist = dist;
      if (dist > 420 || dist < 20) continue;
      const pr = project(b.pos);
      if (!pr.on || Math.abs(pr.x - innerWidth / 2) > innerWidth * 0.42) continue;
      cands.push({ b, dist });
    }
    cands.sort((a, b) => a.dist - b.dist);
    // fill the bracket pool from the nearest screens that fit, skipping ones that would collide
    let used = 0;
    if (!focusOpen && s.view !== "show" && s.view !== "title" && !s.held) {
      for (const c of cands) {
        if (used >= brackets.length) break;
        const xs = [], ys = [];
        for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
          tmp.set(cx * c.b.w, cy * c.b.h, 0.5).applyMatrix4(c.b.matrix);
          const pr = project(tmp);
          xs.push(pr.x);
          ys.push(pr.y);
        }
        const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6, y0 = Math.min(...ys) - 6, y1 = Math.max(...ys) + 6;
        if (x1 - x0 < 30 || x1 - x0 > innerWidth * 0.6) continue;
        if (!free({ x0, x1: Math.max(x1, x0 + 200), y0, y1: y1 + 44 })) continue;
        const el = brackets[used++];
        el.style.transform = `translate(${x0}px, ${y0}px)`;
        el.style.width = `${x1 - x0}px`;
        el.style.height = `${y1 - y0}px`;
        el.querySelector("b").textContent = KINDS[c.b.kind].name;
        el.querySelector("small").textContent = `CLICK TO OPEN · ${Math.round(c.dist)} M`;
        el.classList.add("is-on");
      }
    }
    for (let i = used; i < brackets.length; i++) brackets[i].classList.remove("is-on");

    // lock reticles on the nearest skiffs in view
    const near = [];
    for (let i = 0; i < traffic.cars.length; i++) {
      traffic.carAt(i, time, camera.position, tmp);
      if (tmp.edge < 1) continue;
      const dist = tmp.distanceTo(camera.position);
      if (dist > 320 || dist < 25) continue;
      const pr = project(tmp);
      if (!pr.on) continue;
      near.push({ sk: traffic.cars[i], dist, pr: { ...pr } });
    }
    near.sort((a, b) => a.dist - b.dist);
    let locks = 0;
    if (s.view !== "show" && s.view !== "title" && !focusOpen && !s.held) {
      for (const n of near) {
        if (locks >= reticles.length) break;
        const size = Math.max(36, Math.min(96, 3600 / n.dist));
        if (!free({ x0: n.pr.x - size / 2, x1: n.pr.x + size / 2 + 170, y0: n.pr.y - size / 2 - 14, y1: n.pr.y + size / 2 })) continue;
        const el = reticles[locks++];
        el.style.transform = `translate(${n.pr.x - size / 2}px, ${n.pr.y - size / 2}px)`;
        el.style.width = el.style.height = `${size}px`;
        el.querySelector("b").textContent = n.sk.id;
        el.querySelector(".lock-tag span").textContent = `${n.dist.toFixed(1)} M · ${Math.round(n.sk.speed * 3.6)} KM/H`;
        el.classList.add("is-on");
      }
    }
    for (let i = locks; i < reticles.length; i++) reticles[i].classList.remove("is-on");

    // keep the focused screen live
    if (focusOpen) {
      const g = focusCanvas.getContext("2d");
      if (focusOpen.entry.animated || !focusOpen.entry.compositeReady) focusSource = compositeCanvas(focusOpen.entry);
      g.drawImage(focusSource, 0, 0, focusCanvas.width, focusCanvas.height);
    }
  }
  const textCache = new Map();
  function setText(sel, t) {
    if (textCache.get(sel) === t) return;
    textCache.set(sel, t);
    root.querySelectorAll(sel).forEach((el) => (el.textContent = t));
  }

  const nowPlaying = (t) => {
    npT.textContent = t;
    np.classList.toggle("is-on", Boolean(t));
  };
  return { update, intro, open: openFocus, close: closeFocus, nowPlaying };
}
