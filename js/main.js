// HALCYON: boots the WebGPU renderer (Three.js falls back to WebGL2 by itself), builds Kraken Port and runs the
// frame through a node post chain: bloom, then a film grade. The city is flown the way Rive City's is: hovering over
// the avenues, a sky lane above, day or night, with the wind carrying dust and sparks through the air.
// Dev params: ?day  ?rain  ?view=chase|cockpit|show  ?auto  ?cam=channel|deep|aerial|water|mouth|dome|mugen  ?campos=x,y,z&look=x,y,z
//             ?q=high|med|low  ?gov0 (no resolution governor)  ?t=<seconds>  ?still
import * as THREE from "three";
import { pass, uniform, vec2, vec3, vec4, float, screenUV, screenSize, mix, smoothstep, length, fract, sin, dot, texture, Fn, If, floor, hash, abs, step, select, min, max, pow, clamp } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { createPort } from "./port.js";
import { createParticles } from "./particles.js";
import { createTraffic } from "./traffic.js";
import { createShuttle } from "./shuttle.js";
import { createFlight } from "./flight.js";
import { createHud } from "./hud.js";
import { createHero } from "./hero.js";
import { createLoader } from "./loader.js";
import { createMusic } from "./music.js";
import { createRouteLine } from "./routeline.js";
import { createWind } from "./wind.js";
import { createTrails } from "./trails.js";

const params = new URLSearchParams(location.search);
window.__t0 = performance.now();
const loader = createLoader();
loader.set(0.06);
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, powerPreference: "high-performance" });
await renderer.init();
await loader.breathe(0.14);
// textures and models report in as they arrive
THREE.DefaultLoadingManager.onProgress = (_, loaded, total) => loader.set(0.55 + 0.25 * (loaded / Math.max(1, total)));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.dataset.backend = renderer.backend.isWebGPUBackend ? "webgpu" : "webgl2";

const QUALITY = {
  high: { ratio: 1.5, bloom: true, reflect: 0.5, particles: 1 },
  med: { ratio: 1.15, bloom: true, reflect: 0.4, particles: 0.6 },
  low: { ratio: 0.85, bloom: false, reflect: 0.3, particles: 0.3 },
};
// the city always runs at its base, HIGH (the governor trades resolution in steps if a machine needs it); ?q= is for QA
let qualityKey = QUALITY[params.get("q")] ? params.get("q") : "high";
let quality = QUALITY[qualityKey];

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 20000);
let nightTarget = params.has("day") ? 0 : 1;
let nightMix = nightTarget;
await loader.breathe(0.2);
const port = createPort({ quality, night: nightMix > 0.5, renderer });
window.__tPort = performance.now();
port.scene.add(camera);
await loader.breathe(0.44);
const air = createParticles(port.U, port.plan, quality);
port.scene.add(air.group);
// rain is off for now (it stays built, behind ?rain)
if (!params.has("rain")) {
  air.setRain(false);
  air.rain.value = 0;
}
const traffic = createTraffic(port.U, quality);
port.scene.add(traffic.group);
// the harbour mouth: the boardwalk, the koi, the oni, the expressway (the home screen's set)
const hero = createHero(port.U, { water: port.water, camera });
const routeLine = createRouteLine(port.U);
port.scene.add(routeLine.mesh);
const wind = createWind(port.U, { count: Math.round(3600 * (quality.particles ?? 1)) });
port.scene.add(wind.group);
window.__tHero = performance.now();
port.scene.add(hero.group);
for (const s of hero.solids) port.plan.platforms.push({ ...s, side: 0, row: -1, seed: 0 });
// the wet boardwalk mirrors the scene, so it stays out of the mirror's own render (layer 1)
camera.layers.enable(1);
port.water.reflection.reflector.getVirtualCamera(camera).layers.disable(1);
// the shuttle, parked on the Grand Avenue by the torii, nose up the avenue
const shuttle = createShuttle();
port.scene.add(shuttle.group);
shuttle.setNight(port.U.night.value);
// heat trails behind the engines, stretching with speed
port.U.speed = uniform(0);
const trails = createTrails(port.U, { engines: shuttle.engines, widths: shuttle.engineWidths });
port.scene.add(trails.mesh);
// the city's neon spill on the hull: a warm key from the front-left, a magenta rim from behind
{
  const key = new THREE.PointLight(0xfff0e0, 1500, 90, 2);
  key.position.set(-22, 22, -16);
  const rim = new THREE.PointLight(0xff3db0, 380, 90, 2);
  rim.position.set(22, 10, 30);
  const fill = new THREE.PointLight(0x3fe3e8, 260, 70, 2);
  fill.position.set(18, 4, -30);
  shuttle.group.add(key, rim, fill);
  shuttle.lights = { key, rim, fill };
}

await loader.breathe(0.55);

const music = createMusic({ onTitle: (t) => hud?.nowPlaying?.(t) });

// ---- flight and HUD ------------------------------------------------------------------------------------------
const flight = createFlight({ camera, shuttle, plan: port.plan, params, water: port.water });
const hud = createHud({
  flight,
  port,
  traffic,
  camera,
  onSound: (on) => music.toggle(on),
  // DAY | NIGHT in the rail, and N: the city eases from one to the other
  onTime: (n) => (nightTarget = n),
  getNight: () => nightTarget,
});

// ---- fixed views for checking the world ----------------------------------------------------------------
const VIEWS = {
  channel: { pos: [0, 14, 560], look: [0, 34, -300] },
  deep: { pos: [6, 12, -40], look: [0, 40, -900] },
  aerial: { pos: [520, 420, 980], look: [0, 0, -500] },
  water: { pos: [-10, 2.2, 180], look: [0, 14, -300] },
  mouth: { pos: [60, 70, 1500], look: [0, 50, 0] },
  dome: { pos: [0, 40, -1300], look: [0, 110, -1810] },
  lane: { pos: [24, 7, 420], look: [0, 6, 200] },
  vision: { pos: [12, 22, 330], look: [-52, 46, 196] },
  crab: { pos: [30, 12, 690], look: [64, 19, 606] },
  temple: { pos: [70, 16, -330], look: [0, 58, -470] },
  gate: { pos: [30, 14, 980], look: [0, 30, 640] },
  castle: { pos: [-20, 30, 330], look: [110, 60, 120] },
  ship: { pos: [-24, 7, 492], look: [0, 1.5, 522] },
  wake: { pos: [-30, 26, 600], look: [0, 0, 470] },
  shipside: { pos: [-34, 4, 520], look: [0, 1.5, 520] },
  shipback: { pos: [18, 9, 560], look: [0, 2, 515] },
  shiptop: { pos: [-14, 26, 548], look: [0, 0, 520] },
  pagoda: { pos: [150, 40, -90], look: [0, 300, -470] },
  pagodafar: { pos: [0, 30, 230], look: [0, 280, -470] },
};
// dev: ?campos=x,y,z&look=x,y,z puts the camera anywhere
if (params.get("campos")) {
  VIEWS.custom = { pos: params.get("campos").split(",").map(Number), look: (params.get("look") ?? "0,0,0").split(",").map(Number) };
  params.set("cam", "custom");
}
// dev: ?board=<kind> frames the first board of that kind, square on
if (params.get("board")) {
  const b = port.boards.boards.find((x) => x.kind === params.get("board"));
  if (b) {
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.ry, 0)));
    const d = Math.max(b.w, b.h) * 1.35;
    VIEWS.board = { pos: b.pos.clone().addScaledVector(n, d).toArray(), look: b.pos.toArray() };
    params.set("cam", "board");
  }
}
const view = VIEWS[params.get("cam")];
if (view) {
  flight.state.view = "free";
  camera.position.set(...view.pos);
  camera.lookAt(...view.look);
}

// ---- post: bloom, then a grade (a hint of fringing, vignette, grain) ----------------------------------
const post = new THREE.PostProcessing(renderer);
const scenePass = pass(port.scene, camera);
const sceneTex = scenePass.getTexture("output");
const sceneColor = scenePass.getTextureNode("output");
const uTime = uniform(0);
const uRain = uniform(1);
const uPulse = uniform(0);
// bloom reads a sanitised copy: one NaN or runaway pixel would otherwise bloom into a blinding square
const bloomIn = Fn(() => {
  const c = sceneColor.rgb;
  const finite = c.x.equal(c.x).and(c.y.equal(c.y)).and(c.z.equal(c.z));
  return vec4(select(finite, min(c, vec3(24.0)), vec3(0.0)), 1.0);
})();
// (held back: neon should glow, not wash the frame white)
const bloomNode = bloom(bloomIn, 0.36, 0.38, 0.9);
function outputFor(withBloom) {
  return Fn(() => {
    const d = screenUV.sub(0.5);
    const o = d.mul(0.00045).mul(length(d)).mul(4.0);
    // (the centre sample reads the pass's own texture node, so the scene pass renders even when bloom is off)
    const c = vec3(texture(sceneTex, screenUV.add(o)).r, sceneColor.g, texture(sceneTex, screenUV.sub(o)).b).toVar();
    // through the gate: a radial rush of light
    If(uPulse.greaterThan(0.001), () => {
      const acc = c.toVar();
      for (let i = 1; i < 10; i++) acc.addAssign(texture(sceneTex, vec2(0.5).add(d.mul(float(1.0).sub(uPulse.mul(0.024 * i))))).rgb);
      c.assign(acc.div(10.0).add(vec3(1.0, 0.45, 0.6).mul(uPulse.mul(uPulse).mul(0.12))));
    });
    const glow = withBloom ? bloomNode.rgb : vec3(0.0);
    if (withBloom) {
      c.addAssign(glow);
      // rain is seen where there is light behind it: thin falling dashes, slanted with the wind, lit by the bloom
      const rx = screenUV.x.add(screenUV.y.mul(0.05));
      const colId = floor(rx.mul(560.0));
      const hc = hash(colId);
      const ph = fract(screenUV.y.mul(1.4).add(uTime.mul(mix(float(1.5), float(2.4), hc))).add(hc.mul(13.0)));
      const dash = smoothstep(0.0, 0.02, ph).mul(smoothstep(0.13, 0.04, ph)).mul(step(0.5, hash(colId.add(77.0))));
      const thin = smoothstep(0.5, 0.05, abs(fract(rx.mul(560.0)).sub(0.5)));
      const veil = dash.mul(thin).mul(uRain);
      c.addAssign(glow.mul(veil).mul(2.2).add(vec3(0.012).mul(veil)));
    }
    const v = smoothstep(0.9, 0.28, length(d.mul(vec2(1.1, 1.0))));
    c.mulAssign(mix(float(1.0), v, 0.5));
    c.addAssign(fract(sin(dot(screenUV.mul(1000.0).add(uTime), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(0.007));
    return vec4(c, 1.0);
  })();
}
let builtBloom = null;
// a governor keeps the frame rate by trading resolution in steps, but never below one render pixel per screen pixel, so
// the city stays sharp. It learns the display's own refresh (60 or 120 Hz) from the fastest frames it sees, counts the
// frames that come late, steps down after two bad seconds and back up after four good ones. The water's mirror is
// sized in screen pixels, so it costs the same at any pixel ratio.
const gov = {
  on: !params.has("gov0") && !params.has("still"),
  levels: [1.5, 1.25, 1].filter((r, i, a) => r <= Math.max(1, devicePixelRatio) || i === a.length - 1),
  level: 0,
  deltas: [],
  refresh: 1000 / 60,
  bad: 0,
  good: 0,
  get ratio() {
    return Math.min(quality.ratio, this.levels[this.level] ?? 1);
  },
};
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(gov.ratio);
  renderer.setSize(w, h, false);
  // the mirror: a fixed share of the screen's own pixels, whatever the pixel ratio
  port.water.reflection.reflector.resolution = Math.min(1, (quality.reflect * 1.25) / gov.ratio);
  if (builtBloom !== quality.bloom) {
    builtBloom = quality.bloom;
    post.outputNode = outputFor(quality.bloom);
    post.needsUpdate = true;
  }
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 72 : 58;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
// build every shader before the first frame, so the scene never hitches as new things come into view
await loader.breathe(0.82);
// (renderer.compileAsync blanks the post pass on three r170, so the first frames compile behind the loader instead)
await loader.breathe(0.94);
const clock = new THREE.Clock();
let time = Number(params.get("t") ?? 0);
const still = params.has("still");
let frames = 0;
function governor(ms) {
  if (!gov.on || frames < 120 || document.hidden || ms > 250) return;
  gov.deltas.push(ms);
  if (gov.deltas.length < 60) return;
  // the display's refresh: the fastest tenth of the frames (they cannot come faster than the screen)
  const sorted = [...gov.deltas].sort((a, b) => a - b);
  gov.refresh = Math.max(6, Math.min(gov.refresh, sorted[Math.floor(sorted.length * 0.1)] * 1.02));
  const late = gov.deltas.filter((d) => d > gov.refresh * 1.45).length / gov.deltas.length;
  gov.last = { late: +late.toFixed(2), p10: +sorted[Math.floor(sorted.length * 0.1)].toFixed(1), p50: +sorted[Math.floor(sorted.length * 0.5)].toFixed(1) };
  gov.deltas.length = 0;
  if (late > 0.25) (gov.bad++, (gov.good = 0));
  else if (late < 0.03) (gov.good++, (gov.bad = 0));
  else gov.bad = gov.good = 0;
  if (gov.bad >= 2 && gov.level < gov.levels.length - 1) {
    gov.level++;
    gov.bad = 0;
    resize();
  } else if (gov.good >= 4 && gov.level > 0) {
    gov.level--;
    gov.good = 0;
    resize();
  }
}
renderer.setAnimationLoop(() => {
  if (frames === 0) window.__tFrame0 = performance.now();
  // dev: window.__burn = ms makes every frame that much slower (to test the governor)
  if (window.__burn) for (const until = performance.now() + window.__burn; performance.now() < until; );
  const raw = clock.getDelta();
  governor(raw * 1000);
  const dt = still ? 0 : Math.min(0.05, raw);
  time += dt;
  flight.update(time, dt);
  // (from the cockpit the hull is not drawn: the cockpit frame is, and nothing of the outside cuts into the view)
  shuttle.group.visible = flight.state.view !== "title" && flight.state.view !== "cockpit";
  trails.mesh.visible = shuttle.group.visible;
  shuttle.group.updateMatrixWorld(true);
  trails.update(shuttle.group);
  port.U.speed.value += (Math.min(1, Math.abs(flight.state.speed) / 50) - port.U.speed.value) * Math.min(1, dt * 3);
  // day and night ease into each other
  if (Math.abs(nightTarget - nightMix) > 0.001) {
    nightMix += Math.sign(nightTarget - nightMix) * Math.min(Math.abs(nightTarget - nightMix), dt * 0.6);
    port.setNight(nightMix);
    shuttle.setNight(nightMix);
  }
  for (const [l, day, night] of [[shuttle.lights.key, 300, 1500], [shuttle.lights.rim, 80, 380], [shuttle.lights.fill, 60, 260]]) l.intensity = day + (night - day) * nightMix;
  port.update(time, dt, camera);
  // the street keeps under the camera
  port.water.update(time, dt, null, [], null, camera);
  hero.update(time, camera);
  air.update(time, dt);
  wind.update(time);
  // the guidance line: the trip's route laid out ahead in the air, a little under the shuttle
  if (time - routeLine.at > 0.12) {
    routeLine.at = time;
    const ahead = flight.state.view !== "title" ? flight.routeAhead() : null;
    if (ahead?.length) routeLine.set([{ x: flight.state.pos.x, z: flight.state.pos.z }, ...ahead], Math.max(1.2, flight.state.pos.y - 5));
    else routeLine.hide();
  }
  uRain.value = air.rain.value;
  uPulse.value = reduceMotion ? 0 : flight.state.gatePulse ?? 0;
  renderer.toneMappingExposure = port.exposure;
  uTime.value = time;
  post.render();
  hud.update(time, dt);
  if (frames === 0) window.__firstFrame = performance.now();
  if (++frames === 4) {
    window.__ready = performance.now();
    document.fonts?.ready.then(() => loader.open()).then(() => {
      flight.intro(time);
      hud.intro();
      if (!still) hero.intro(time);
    });
  }
});

window.__h = { gov, port, air, traffic, shuttle, flight, hud, hero, camera, renderer, setNight: (x) => port.setNight(x), setRain: (on) => air.setRain(on) };
