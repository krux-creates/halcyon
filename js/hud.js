// HALCYON's HUD, in the language extracted from Rive City (DESIGN-LANGUAGE.md §3): near-black pills with a hairline
// ring, a thin tracked mono label voice, a wide display voice for numbers, one accent. A day/night switch in the rail,
// a ticker that names the street you are on and the one thing to do, a keycap bar, a turn-by-turn chip on a trip (the
// way a driving game shows the next turn), lock reticles and tags on the traffic, corner brackets on the screen you
// are nearest, screens that open when clicked, and in the cockpit the frame, the dash and the HUD glass over the nose.
import * as THREE from "three";
import { KINDS, compositeCanvas } from "./billboards.js";
import { PORT } from "./port.js";
import { HOME } from "./districts.js";
import { columnOf, spanOf } from "./world.js";

/** Out in the endless wards: is (x, z) beyond the hand-built port, and what is that block called. */
const inWards = (x, z) => Math.abs(x) > HOME.X - 20 || z < HOME.Z;
const wardName = (x, z) => `MUGEN WARD ${String.fromCharCode(65 + (((columnOf(x) + 13) % 26) + 26) % 26)}-${Math.abs(spanOf(z))}`;

const STREETS = ["HIKARI ST", "KOI ST", "SHIMA ST", "YORU ST"];

// the turn-by-turn glyphs (drawn turning right; mirrored for left)
const TURN = {
  ahead: "M12 21V5M6.5 10.5 12 5l5.5 5.5",
  bear: "M8 21v-7l8-8M10 6h6v6",
  turn: "M6 21V11h12M14 7l4 4-4 4",
  back: "M7 21V9.5a5 5 0 0 1 10 0V15M13 11.5l4 4 4-4",
};
/** Which glyph and words for a heading change of ang radians (positive is to the right). */
function maneuver(ang) {
  const deg = Math.abs((ang * 180) / Math.PI), side = ang < 0 ? "LEFT" : "RIGHT";
  if (deg < 18) return { k: "ahead", left: false, words: "STRAIGHT ON" };
  if (deg < 62) return { k: "bear", left: ang < 0, words: `BEAR ${side}` };
  if (deg < 140) return { k: "turn", left: ang < 0, words: `TURN ${side}` };
  return { k: "back", left: ang < 0, words: "TURN AROUND" };
}

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

export function createHud({ flight, port, traffic, camera, onTime, getNight, onSound }) {
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
      <div class="pill seg" role="group" aria-label="Time of day"><span class="seg-label">TIME</span><button type="button" data-t="0" aria-pressed="false">DAY</button><button type="button" data-t="1" aria-pressed="false">NIGHT</button></div>
      <div class="pill brand">
        <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15c3-5 6-7 9-7s6 2 9 7" /><path d="M7 15c1.6-2.4 3.3-3.6 5-3.6S15.4 12.6 17 15" /><circle cx="12" cy="17.4" r="1.4" /></svg>
        <b>HALCYON</b><span class="sep">·</span><span>KRAKEN PORT</span><span class="sep">·</span><span class="clock">22:41</span>
        <span class="np" aria-live="polite"><span class="np-t"></span></span>
        <button type="button" class="snd" aria-label="Music off" aria-pressed="false"><i></i><i></i><i></i><i></i></button>
        <i class="tablabel" aria-hidden="true">KRAKEN PORT</i>
      </div>
    </header>

    <div class="cockpit" aria-hidden="true">
      <svg class="ck-frame" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="ckDash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1420"/><stop offset="0.18" stop-color="#0b0910"/><stop offset="1" stop-color="#050408"/></linearGradient>
          <linearGradient id="ckPillar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#050408"/><stop offset="0.75" stop-color="#120e18"/><stop offset="1" stop-color="#1d1626"/></linearGradient>
          <linearGradient id="ckPillarR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#050408"/><stop offset="0.75" stop-color="#120e18"/><stop offset="1" stop-color="#1d1626"/></linearGradient>
        </defs>
        <path class="ck-roof" d="M0 0H1440V34C1180 58 960 64 720 64S260 58 0 34Z" />
        <path class="ck-pillar" d="M24 34H156L500 594 440 614Z" fill="url(#ckPillar)" />
        <path class="ck-pillar" d="M1416 34H1284L940 594 1000 614Z" fill="url(#ckPillarR)" />
        <path class="ck-door" d="M0 560 446 612 0 650Z" />
        <path class="ck-door" d="M1440 560 994 612 1440 650Z" />
        <path class="ck-sill" d="M0 560 446 612M1440 560 994 612" />
        <path class="ck-dash" d="M0 640C220 606 420 590 540 586L600 584C640 583 680 582 720 582S800 583 840 584L900 586C1020 590 1220 606 1440 640V900H0Z" fill="url(#ckDash)" />
        <path class="ck-edge" d="M0 640C220 606 420 590 540 586L600 584C640 583 680 582 720 582S800 583 840 584L900 586C1020 590 1220 606 1440 640" />
        <path class="ck-hood" d="M470 612C560 600 640 596 720 596S880 600 970 612" />
      </svg>
      <div class="dash">
        <div class="d-cell d-l"><small>// CHARGE</small><b class="d-charge">86<i>%</i></b><span class="d-bar"><i></i></span></div>
        <div class="d-cell d-m"><small>// DRIVE MODE</small><b class="d-mode">HOVER</b><span class="d-gear"><i>P</i><i>R</i><i>N</i><i class="is-on">D</i></span></div>
        <div class="d-cell d-r"><svg class="d-turn" viewBox="0 0 24 24"><path d="${TURN.ahead}" /></svg><div><b class="d-dist">—</b><small class="d-what">FREE FLIGHT</small></div></div>
      </div>
    </div>

    <div class="glass" aria-hidden="true">
      <div class="g-left">
        <svg class="g-turn" viewBox="0 0 24 24"><path d="${TURN.turn}" /></svg>
        <div><b class="g-dist">—</b><small class="g-place">GRAND AVENUE</small></div>
      </div>
      <div class="g-mid"><span class="g-rule"></span><b class="g-speed">0</b><small>KM/H</small></div>
      <div class="g-right"><small class="g-mode">HOVER</small><b class="g-alt">12.0</b><small>M ALT</small></div>
    </div>

    <div class="tags" aria-hidden="true"></div>
    <div class="guide" aria-hidden="true" hidden><i class="g-dia"></i><i class="g-arrow"></i><span><b class="gd-name"></b><small class="gd-dist"></small></span></div>
    <div class="navarrow" hidden aria-live="polite"><svg class="na-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${TURN.ahead}" /></svg><p><b class="na-dist">—</b><small class="na-turn">STRAIGHT ON</small></p><span class="na-to"></span></div>

    <footer class="hud-bottom">
      <div class="pill ticker" role="status">
        <i class="dot"></i><span class="t-a">GRAND AVENUE</span><i class="sep">·</i><span class="t-b">0 KM/H</span><i class="sep">·</i><span class="t-c">W TO FLY</span>
      </div>
      <div class="pill keys">
        <span class="k"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><em>DRIVE</em></span>
        <span class="k"><kbd>E</kbd><kbd>Q</kbd><em>UP/DOWN</em></span>
        <span class="k"><kbd>F</kbd><em>SKY LANE</em></span>
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
        <p class="lede rv" data-text="A city of neon towers under Titan's haze. Step through the gate and fly its avenues.">A city of neon towers under Titan's haze. Step through the gate and fly its avenues.</p>
        <div class="title-actions rv">
          <button type="button" class="board aural"><span class="aural-seal" aria-hidden="true" lang="ja"><b>搭</b><b>乗</b></span><span class="aural-t">Board HL-07</span><span class="aural-ar" aria-hidden="true"><svg viewBox="0 0 14 14"><path d="M3 11 11 3M5 3h6v6" /></svg></span></button>
          <p class="title-note"><i class="dot"></i><span>Gate 3 · boarding now</span><kbd>Enter</kbd></p>
        </div>
      </div>
      <p class="touch-hint rv" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="11" /></svg><span>Fly the avenues</span></p>
    </section>
    <div class="arrive" role="status" aria-live="polite"><small>ARRIVED</small><b></b></div>

    <div class="touch">
      <div class="stick" aria-label="Drive: drag up to go, left and right to steer"><i class="knob"></i><span>DRIVE</span></div>
      <div class="tbtns">
        <button type="button" data-act="up" aria-label="Climb">UP</button>
        <button type="button" data-act="down" aria-label="Sink">DN</button>
        <button type="button" data-act="skim" aria-pressed="false">SKY</button>
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
          <div class="focus-actions"><button type="button" class="cta aural"><span class="aural-t">Open</span><span class="aural-ar" aria-hidden="true"><svg viewBox="0 0 14 14"><path d="M3 11 11 3M5 3h6v6" /></svg></span></button><button type="button" class="close glassbtn"><kbd>ESC</kbd><span>Back to the avenue</span></button></div>
        </div>
      </div>
    </section>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const hud = $(".hud");
  const tags = $(".tags");
  const glassEl = $(".glass");

  // ---- the time of day: DAY | NIGHT (N toggles it too) -------------------------------------------------------
  let shownNight = null;
  const setTimeUI = (n) => {
    if (n === shownNight) return;
    shownNight = n;
    root.querySelectorAll(".seg button").forEach((o) => {
      const on = +o.dataset.t === n;
      o.classList.toggle("is-on", on);
      o.setAttribute("aria-pressed", String(on));
    });
    requestAnimationFrame(drawRail);
  };
  root.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => onTime?.(+b.dataset.t)));
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
    if (e.key.toLowerCase() === "n" && !focusOpen) onTime?.(1 - (getNight?.() ?? 1));
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
    flight.virtual.throttle = Math.max(-1, -y / r);
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
  root.querySelectorAll(".tbtns button").forEach((b) => {
    b.addEventListener("click", () => {
      if (b.dataset.act === "skim") flight.toggleSkim();
      if (b.dataset.act === "auto") flight.toggleAutopilot();
      if (b.dataset.act === "cam") flight.cycleView();
    });
    // UP and DN climb and sink for as long as they are held
    const climb = b.dataset.act === "up" ? 1 : b.dataset.act === "down" ? -1 : 0;
    if (!climb) return;
    b.addEventListener("pointerdown", () => (flight.virtual.climb = climb));
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => (flight.virtual.climb = 0));
  });

  // ---- the title: BOARD dives the camera through the great torii and hands over the controls -----------------------
  $(".board").addEventListener("click", () => flight.board());
  root.querySelectorAll(".title h1 .ln").forEach((ln, li) => {
    ln.innerHTML = [...ln.textContent].map((ch, i) => (ch === " " ? `<i class="sp"> </i>` : `<i style="--i:${i + li * 4}"><b>${ch}</b></i>`)).join("");
  });

  // ---- chapters: fly straight to one (boarding first, from the home screen) -------------------------------------------
  // (each stops in the avenue and turns to face its landmark, the way a car pulls up facing the shop)
  const V = port.plan.vision, C = port.plan.crab;
  const CHAPTERS = [
    { name: "KRAKEN VISION", x: -12, z: 300, face: V ? [V.cx, V.y0 + V.h / 2, V.cz] : null },
    { name: "THE CRAB", x: 22, z: 664, face: C ? [C.x, C.y, C.z] : null },
    { name: "TENRYŪ PAGODA", x: 0, z: -96, gaze: 42, face: [0, 260, PORT.temple.z] }, // (where the whole pagoda can be seen, looking up at it)
    { name: "MUGEN WARD", x: 0, z: -1440, face: [0, 120, -2600] },
  ];
  root.querySelectorAll(".chapters button").forEach((b) =>
    b.addEventListener("click", () => {
      const ch = CHAPTERS[+b.dataset.ch];
      root.querySelectorAll(".chapters button").forEach((o) => o.classList.toggle("is-on", o === b));
      requestAnimationFrame(drawRail);
      const go = () => flight.goTo(ch.name, ch.x, ch.z, ch.face);
      if (flight.state.view !== "title" && inWards(flight.state.pos.x, flight.state.pos.z)) {
        // far out in the wards the autopilot knows no route home: the line recalls the shuttle to the Grand Channel
        hud.classList.add("is-recall");
        setTimeout(() => {
          flight.recall(10, 420, 0); // (back on the Grand Avenue)
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
  let arrivedAt = -1e9;
  flight.onArrive = (name) => {
    arrivedAt = performance.now();
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
  const reticles = Array.from({ length: 3 }, () => {
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
    let place = "GRAND AVENUE";
    if (p.z > PORT.channel.z0) place = "TORII GATE";
    else if (Math.hypot(p.x, p.z - T.z) < T.r + 30) place = "TENRYŪ PLAZA";
    else if (inWards(p.x, p.z)) place = wardName(p.x, p.z);
    else if (p.z < PORT.channel.z1) place = "WARD GATE";
    PORT.cross.forEach((c, i) => {
      if (Math.abs(p.z - c.z) < c.w * 0.7) place = STREETS[i];
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
        ? touchUI ? "STICK UP TO FLY" : "W TO FLY"
        : s.skim
          ? touchUI ? "SKY TO DROP TO THE STREET" : "F TO DROP TO THE STREET"
          : touchUI ? "SKY FOR THE SKY LANE" : "F FOR THE SKY LANE · E/Q UP/DOWN";
    root.querySelector('[data-act="skim"]').setAttribute("aria-pressed", String(s.skim));
    root.querySelector('[data-act="auto"]').setAttribute("aria-pressed", String(s.autopilot));
    setText(".t-a", place);
    // the trip, turn by turn: the next turn along the route (not through the buildings), which way and how far, and
    // where it all ends; a driving game's GPS chip. In the cockpit it moves into the HUD glass and the dash.
    const tripNow = flight.trip;
    let turn = null;
    if (tripNow && s.view !== "title") {
      const ahead2 = flight.routeAhead() ?? [];
      const pts = [{ x: p.x, z: p.z }, ...ahead2];
      // the route's length still to fly, and its first bend worth calling out
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      const hx = -Math.sin(s.yaw), hz = -Math.cos(s.yaw);
      let along = 0, ang = 0, at = total;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x, dz = pts[i].z - pts[i - 1].z, dl = Math.hypot(dx, dz) || 1;
        // heading of this leg against the hull (first leg) or the leg before it
        const px = i === 1 ? hx : (pts[i - 1].x - pts[i - 2].x), pz = i === 1 ? hz : (pts[i - 1].z - pts[i - 2].z);
        const a = Math.atan2(px * dz - pz * dx, px * dx + pz * dz); // (positive: to the right)
        if (Math.abs(a) > 0.3 && (i > 1 || dl > 30)) {
          ang = a;
          at = i === 1 ? 0 : along;
          break;
        }
        along += dl;
      }
      turn = { m: maneuver(ang), dist: at, total, name: tripNow.name };
    }
    {
      const na = root.querySelector(".navarrow");
      if (turn && s.view !== "cockpit") {
        const t = turn.m;
        if (na.dataset.k !== t.k + t.left) {
          na.dataset.k = t.k + t.left;
          na.querySelector("path").setAttribute("d", TURN[t.k]);
          na.classList.toggle("is-left", t.left);
        }
        setText(".na-dist", turn.dist < 12 ? "NOW" : `${Math.round(turn.dist / 5) * 5} M`);
        setText(".na-turn", t.words);
        setText(".na-to", `${turn.name} · ${Math.round(turn.total / 10) * 10} M`);
        na.hidden = false;
      } else na.hidden = true;
    }
    // the guide: a diamond on the landmark the trip is bound for, with its distance; off screen it waits at the edge,
    // pointing the way
    {
      const g = root.querySelector(".guide");
      if (tripNow && s.view !== "title") {
        const f = tripNow.face;
        const pr = project(f ? tmp.set(f[0], Math.min(f[1], 120), f[2]) : tmp.set(tripNow.x, 26, tripNow.z));
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
        setText(".gd-name", tripNow.name);
        setText(".gd-dist", `${Math.round(Math.hypot((f ? f[0] : tripNow.x) - p.x, (f ? f[2] : tripNow.z) - p.z))} M`);
        g.hidden = false;
      } else g.hidden = true;
    }
    setText(".t-b", next ? `${next.name} · ${Math.round(nd)} M` : `${Math.round(kmh)} KM/H`);
    setText(".t-c", s.blocked > 0.2 ? "MIND THE BUILDINGS" : action);
    // the HUD glass and the dash (cockpit)
    const mode = s.autopilot ? "AUTOPILOT" : s.skim ? "SKY LANE" : "HOVER";
    setText(".g-speed", String(Math.round(kmh)));
    setText(".g-dist", turn ? (turn.dist < 12 ? "NOW" : `${Math.round(turn.dist / 5) * 5} M`) : next ? `${Math.round(nd)} M` : "—");
    setText(".g-place", turn ? turn.m.words : next ? next.name : place);
    setText(".g-mode", mode);
    setText(".g-alt", s.pos.y.toFixed(1));
    if (s.view === "cockpit") {
      setText(".d-mode", mode);
      setText(".d-dist", turn ? `${Math.round(turn.total / 10) * 10} M` : `${Math.round(s.pos.y)} M`);
      setText(".d-what", turn ? turn.name : "ALTITUDE");
      const dk = turn ? turn.m.k + turn.m.left : "ahead";
      const dt = root.querySelector(".d-turn");
      if (dt.dataset.k !== dk) {
        dt.dataset.k = dk;
        dt.querySelector("path").setAttribute("d", TURN[turn ? turn.m.k : "ahead"]);
        dt.classList.toggle("is-left", Boolean(turn?.m.left));
      }
      const glyph = root.querySelector(".g-turn");
      if (glyph.dataset.k !== dk) {
        glyph.dataset.k = dk;
        glyph.querySelector("path").setAttribute("d", TURN[turn ? turn.m.k : "turn"]);
        glyph.classList.toggle("is-left", Boolean(turn?.m.left));
      }
    }
    setTimeUI(Math.round(getNight?.() ?? 1));
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
    // in the cockpit the HUD glass owns the middle of the screen; on a trip the turn chip owns its corner
    if (s.view === "cockpit") {
      const g = glassEl.getBoundingClientRect();
      claimed.push({ x0: g.left - 24, x1: g.right + 24, y0: g.top - 24, y1: g.bottom + 24 });
    }
    const naEl = root.querySelector(".navarrow");
    if (!naEl.hidden) {
      const g = naEl.getBoundingClientRect();
      claimed.push({ x0: g.left - 16, x1: g.right + 16, y0: g.top - 16, y1: g.bottom + 16 });
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
    // (not while arriving: the landmark has the screen to itself for a few seconds)
    if (s.view !== "show" && s.view !== "title" && !focusOpen && !s.held && performance.now() - arrivedAt > 7000) {
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
