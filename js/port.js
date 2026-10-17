// Kraken Port: a floating city on Kraken Mare, Titan. Pontoon platforms line the Grand Channel, cross canals cut
// between them, glass tube bridges and pipe runs span the water, and the terminal dome under the Spire closes the
// far end. Towers are insulated slabs with setbacks and stacked habitat drums; there are pressure domes, tank
// farms, kiosks and lamps on the decks, blade signs and billboards. The sea is a planar mirror broken
// into streaks; the haze is a fog that glows toward the sun by day and with the city's own light at night.
import * as THREE from "three";
import {
  Fn, uniform, vec2, vec3, float, positionWorld, positionGeometry, normalGeometry, cameraPosition, normalize, dot, max, mix,
  smoothstep, step, pow, exp, length, fract, floor, abs, atan2, hash as rawHash, instancedBufferAttribute, instanceIndex, mx_noise_float,
  fog, reflector, select, clamp, cross, uv, fwidth, texture, normalWorld, sin, screenUV, mx_worley_noise_float,
} from "three/tsl";
import { hashF } from "./fx.js";
/** TSL's hash truncates to a u32, so negative inputs all hash to the same value: shift them positive first. */
const hash = (x) => hashF(float(x).add(1048576.0));

import { createBillboards } from "./billboards.js";
import { pagoda, torii, buildRoofs, buildRails, buildSakura, buildPetals, buildSignBoxes, NEON } from "./japan.js";
import { createKrakenVision } from "./kraken.js";
import { createCrab } from "./crab.js";
import { createWater } from "./water.js";
import { createPagoda } from "./pagoda.js";
import { harbourFront } from "./hero.js";
import { createDistricts } from "./districts.js";

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
/** TSL smoothstep that also accepts a falling edge (a > b). */
export const ss = (a, b, x) => (a > b ? float(1).sub(smoothstep(b, a, x)) : smoothstep(a, b, x));

// ---- the plan ----------------------------------------------------------------------------------------------
export const PORT = {
  channel: { halfW: 38, z0: 640, z1: -1500 },
  cross: [
    { z: 240, w: 46 },
    { z: -260, w: 40 },
    { z: -720, w: 52 },
    { z: -1130, w: 42 },
  ],
  basin: { z: -1720, r: 260 },
  deck: 4, // pontoon deck height above the sea
  temple: { z: -470, r: 186, island: 120 }, // the channel opens into a basin round the island of 天龍閣 (pagoda.js)
  walk: 9, // the open walkway between the channel edge and the towers
};

export const LOOK = {
  day: {
    hazeDim: "#5a3118", hazeBright: "#e8ae62", hazeGlow: "#ffe6b8", zenith: "#3c1c0c", water: "#0b0604", glowLow: "#000000",
    density: 0.0019, sun: "#ffc98a", sunI: 2.0, hemiSky: "#a8723e", hemiGround: "#140c06", hemiI: 0.75,
    windows: 0.09, lamps: 0.35, screens: 1.0, exposure: 0.95, rain: 0.4, reflect: 0.8,
  },
  night: {
    hazeDim: "#100d2c", hazeBright: "#2a1a52", hazeGlow: "#6a2a86", zenith: "#04030e", water: "#030209", glowLow: "#3c2478",
    density: 0.00135, sun: "#7c90c8", sunI: 0.22, hemiSky: "#2e2a6a", hemiGround: "#0a0608", hemiI: 0.9,
    windows: 1.2, lamps: 1.15, screens: 1.15, exposure: 1.12, rain: 0.7, reflect: 1.0,
  },
};

const SUN_DIR = new THREE.Vector3(0.18, 0.13, -1).normalize();

export function createPort({ quality = { reflect: 0.5 }, night = false, renderer } = {}) {
  const scene = new THREE.Scene();
  const U = {
    time: uniform(0),
    night: uniform(night ? 1 : 0),
    sunDir: uniform(SUN_DIR.clone()),
    hazeDim: uniform(new THREE.Color()),
    hazeBright: uniform(new THREE.Color()),
    hazeGlow: uniform(new THREE.Color()),
    glowLow: uniform(new THREE.Color()),
    zenith: uniform(new THREE.Color()),
    water: uniform(new THREE.Color()),
    density: uniform(0.001),
    windows: uniform(1),
    lamps: uniform(1),
    screens: uniform(1),
    rain: uniform(1),
    reflect: uniform(1),
    rainLook: 1,
    mist: uniform(0.0009),
  };

  // ---- haze: the fog colour is the sky colour in the same direction, brighter toward the sun -------------
  const hazeColor = (dir) => {
    const s = max(dot(dir, U.sunDir), 0.0);
    const low = exp(abs(dir.y).mul(-9.0)); // the city's light caught low in the haze at night
    return mix(U.hazeDim, U.hazeBright, pow(s, 3.0)).add(U.hazeGlow.mul(pow(s, 22.0)).mul(0.55)).add(U.glowLow.mul(low));
  };
  const fogFactor = Fn(() => {
    const dist = length(positionWorld.sub(cameraPosition));
    const hMean = max(positionWorld.y.add(cameraPosition.y).mul(0.5), 0.0);
    const dens = U.density.mul(exp(hMean.mul(-1.0 / 380.0)).mul(0.75).add(0.25));
    return float(1.0).sub(exp(dist.mul(dens).negate())).mul(0.99);
  });
  // ---- mist: a layer lying on the water, thickest at the sea and thinning to nothing a few tens of metres up, so the
  //      feet of the city dissolve while its tops stay sharp; it drifts in banks, and it carries the colour of the neon
  //      nearest it: red under the torii, gold off 海月楼, blue under the jellyfish, violet round her, warm at the pagoda ----
  const MIST_H = 16.0;
  const mistLight = (p) => {
    const pocket = (x, z, r, col) => vec3(...col).mul(exp(length(vec2(p.x.sub(x), p.z.sub(z))).div(-r)));
    return pocket(0, 730, 150, [1.0, 0.22, 0.28]).add(pocket(112, 812, 120, [1.0, 0.58, 0.24])).add(pocket(-150, 690, 160, [0.28, 0.58, 1.0]))
      .add(pocket(158, 590, 130, [0.78, 0.32, 1.0])).add(pocket(0, -470, 420, [1.0, 0.42, 0.55])).add(pocket(0, -300, 900, [0.9, 0.2, 0.7]).mul(0.4));
  };
  const mistFactor = Fn(() => {
    const yc = cameraPosition.y, yp = positionWorld.y;
    const d = length(positionWorld.sub(cameraPosition));
    const dy = yp.sub(yc);
    const ec = exp(yc.div(-MIST_H)), ep = exp(yp.div(-MIST_H));
    // the density integrated along the view ray through an exponential layer (the straight limit when level)
    const along = select(abs(dy).lessThan(0.05), d.mul(ec), d.mul(MIST_H).div(dy).mul(ec.sub(ep)));
    const banks = mx_noise_float(vec3(positionWorld.x.mul(0.005).add(U.time.mul(0.012)), positionWorld.z.mul(0.005), U.time.mul(0.015))).mul(0.5).add(0.5);
    const dens = U.mist.mul(banks.mul(1.3).add(0.35));
    return float(1.0).sub(exp(along.mul(dens).negate())).mul(0.9);
  });
  const mistColor = (dir) => U.hazeBright.mul(1.25).add(U.glowLow.mul(0.55)).add(mistLight(positionWorld).mul(0.4).mul(U.night)).add(hazeColor(dir).mul(0.3));
  if (new URLSearchParams(location.search).has("nomist")) scene.fogNode = fog(hazeColor(normalize(positionWorld.sub(cameraPosition))), fogFactor());
  else {
    const dir = normalize(positionWorld.sub(cameraPosition));
    const fd = fogFactor(), fm = mistFactor();
    const total = float(1.0).sub(float(1.0).sub(fd).mul(float(1.0).sub(fm)));
    scene.fogNode = fog(mix(hazeColor(dir), mistColor(dir), fm.div(max(total, 0.001))), total);
  }
  U.hazeColor = hazeColor;
  U.fogFactor = fogFactor;
  U.mistLight = mistLight;

  // ---- sky ---------------------------------------------------------------------------------------------
  {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
    const dir = normalize(positionWorld.sub(cameraPosition));
    const s = max(dot(dir, U.sunDir), 0.0);
    const up = max(dir.y, 0.0);
    let sky = mix(hazeColor(dir), U.zenith, smoothstep(0.02, 0.62, up));
    // a soft sun smeared by the haze: no disc, only a hot core in the glow
    sky = sky.add(U.hazeGlow.mul(pow(s, 700.0)).mul(mix(float(1.4), float(0.0), U.night)));
    const band = mx_noise_float(vec3(dir.x.mul(2.5), dir.y.mul(22.0), dir.z.mul(2.5).add(U.time.mul(0.004))));
    // a low cloud deck: projected onto a plane overhead, lumpy, lit from below by the city at night
    const cuv = dir.xz.div(max(dir.y, 0.04)).mul(0.35);
    const cloud = mx_noise_float(vec3(cuv.x.add(U.time.mul(0.006)), cuv.y, 1.0)).mul(0.6)
      .add(mx_noise_float(vec3(cuv.x.mul(3.1), cuv.y.mul(3.1).add(U.time.mul(0.01)), 4.0)).mul(0.4)).mul(0.5).add(0.5);
    const deck = smoothstep(0.03, 0.18, up).mul(smoothstep(0.85, 0.25, up));
    const cityLit = U.glowLow.mul(1.6).mul(pow(cloud, 2.2)).mul(deck).mul(exp(up.mul(-2.2)));
    // bokeh: soft discs of pink and blue light scattered through the upper sky, twinkling
    const su = vec2(atan2(dir.z, dir.x).mul(22.0), dir.y.mul(26.0));
    const cellB = floor(su);
    const hb = hash(cellB.x.mul(13.7).add(cellB.y.mul(71.3)));
    const centreB = vec2(hash(cellB.x.add(cellB.y.mul(5.1)).add(1.3)), hash(cellB.y.add(cellB.x.mul(3.7)).add(2.9)));
    const dB = length(fract(su).sub(centreB));
    const sizeB = mix(float(0.16), float(0.42), hash(hb.mul(7.3)));
    const disc = smoothstep(sizeB, sizeB.mul(0.15), dB).mul(step(0.86, hb));
    const tw = sin(U.time.mul(mix(float(0.5), float(2.0), hb)).add(hb.mul(40.0))).mul(0.35).add(0.65);
    const bokehC = mix(vec3(1.0, 0.25, 0.7), vec3(0.45, 0.4, 1.0), step(0.9, hb));
    // thickest just above the city glow, thinning toward the zenith
    const bokeh = bokehC.mul(disc).mul(tw).mul(smoothstep(0.06, 0.16, up)).mul(smoothstep(0.5, 0.18, up)).mul(cloud.mul(0.8).add(0.2)).mul(0.16).mul(U.night);
    m.colorNode = sky.mul(band.mul(0.07).add(1.0)).add(cityLit).add(bokeh);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), m);
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    dome.onBeforeRender = (r, s2, cam) => dome.position.copy(cam.position);
    scene.add(dome);
  }

  // ---- light -------------------------------------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.copy(SUN_DIR).multiplyScalar(1000);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  scene.add(hemi);

  // ---- the sea: swell, a simulated wake round the shuttle, foam and spray (water.js) ---------------------------------
  const water = createWater({ scene, U, quality, renderer });

  // ---- the city -------------------------------------------------------------------------------------------
  const plan = layout();
  const city = buildCity(U, plan);
  scene.add(city.group);
  scene.add(buildLamps(U, plan));
  scene.add(buildSignBoxes(U, plan.signs));
  scene.add(buildCables(plan.cables));
  scene.add(buildRoofs(U, plan.roofs));
  scene.add(buildRails(U, plan.rails));
  scene.add(buildSakura(U, plan.sakura));
  scene.add(buildPetals(U, plan.sakura, Math.round(150 * (quality.particles ?? 1))));
  const boards = createBillboards(U, plan.boards);
  scene.add(boards.group);
  const vision = plan.vision ? createKrakenVision(U, plan.vision) : null;
  if (vision) scene.add(vision.group);
  const crab = plan.crab ? createCrab(U, plan.crab) : null;
  if (crab) scene.add(crab.group);
  // 天龍閣: the Tenryū pagoda on its island in the temple basin, the canal running straight to it
  const dev = new URLSearchParams(location.search);
  const pagoda = dev.has("nopagoda") ? { group: new THREE.Group(), update() {} } : createPagoda(U, { x: 0, z: PORT.temple.z, s: 1.15 });
  scene.add(pagoda.group);
  // and round it all, the city that goes on for ever
  if (!dev.has("nodist")) scene.add(createDistricts(U).group);

  function setNight(x) {
    U.night.value = x;
    const a = LOOK.day, b = LOOK.night;
    const c = (k) => new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), x);
    const f = (k) => a[k] + (b[k] - a[k]) * x;
    for (const k of ["hazeDim", "hazeBright", "hazeGlow", "glowLow", "zenith", "water"]) U[k].value.copy(c(k));
    for (const k of ["density", "windows", "lamps", "screens", "reflect"]) U[k].value = f(k);
    U.rainLook = f("rain");
    sun.color.copy(c("sun"));
    sun.intensity = f("sunI");
    hemi.color.copy(c("hemiSky"));
    hemi.groundColor.copy(c("hemiGround"));
    hemi.intensity = f("hemiI");
    api.exposure = f("exposure");
  }

  const api = {
    scene,
    U,
    plan,
    boards,
    water,
    exposure: 1,
    setNight,
    update(time, dt, camera) {
      U.time.value = time;
      boards.update(time, dt, camera);
      vision?.update(time, camera);
      crab?.update(time);
      pagoda.update(time);
    },
  };
  setNight(night ? 1 : 0);
  return api;
}

// ---------------------------------------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------------------------------------
const BOARD_KINDS = ["edge", "moon", "oni", "ronin", "geisha", "departures", "netrunner", "yakuza", "kitsune", "chef", "idol", "pilot", "surf", "azotosome", "wanted", "weather", "fly", "dive", "tides", "pixel", "hotel", "nofire"];
// portrait photos only ever go on portrait boards and landscape photos on landscape boards, so no picture is cut
const PORTRAIT_OK = ["moon", "oni", "geisha", "netrunner", "kitsune", "idol", "wanted", "fly", "azotosome", "pixel", "nofire", "ramen", "surf", "dive", "hotel"];
const LANDSCAPE_OK = ["edge", "ronin", "yakuza", "chef", "pilot", "departures", "weather", "tides", "surf", "dive", "nofire", "hotel"];

function layout() {
  const r = rng(11);
  const { channel, cross, deck, walk } = PORT;
  const P = { platforms: [], boxes: [], cyls: [], domes: [], tanks: [], boards: [], beacons: [], edges: [], signs: [], posts: [], vents: [], roofs: [], rails: [], sakura: [] };
  let kindIx = 0;
  const nextKind = (orient) => {
    // portrait boards prefer the kinds that were drawn for portrait first
    for (let i = 0; i < BOARD_KINDS.length; i++) {
      const k = BOARD_KINDS[(kindIx + i) % BOARD_KINDS.length];
      if ((orient === "v" ? PORTRAIT_OK : LANDSCAPE_OK).includes(k)) {
        kindIx += i + 1;
        return k;
      }
    }
    return BOARD_KINDS[kindIx++ % BOARD_KINDS.length];
  };
  const box = (o) => P.boxes.push({ ry: 0, density: 0, tone: 0, seed: 0.5, ...o });
  const cyl = (o) => P.cyls.push({ density: 0, tone: 0, seed: 0.5, ...o });

  // spans between the cross canals
  const cuts = [channel.z0, ...cross.flatMap((c) => [c.z + c.w / 2, c.z - c.w / 2]), channel.z1];
  const spans = [];
  for (let i = 0; i < cuts.length; i += 2) spans.push([cuts[i], cuts[i + 1]]);

  for (const side of [-1, 1]) {
    let x = channel.halfW;
    for (let row = 0; row < 3; row++) {
      const w = row === 0 ? 120 + r() * 20 : 110 + r() * 50;
      for (const [za, zb] of spans) {
        const len = za - zb;
        const parts = len > 320 ? 2 : 1;
        for (let p = 0; p < parts; p++) {
          let z0 = za - (len / parts) * p - (p ? 8 : 0);
          const z1 = za - (len / parts) * (p + 1) + (p < parts - 1 ? 8 : 0);
          if (za === channel.z0) z0 -= 30 + row * 70; // the harbour mouth opens out
          P.platforms.push({ side, row, x0: side * x, x1: side * (x + w), z0, z1, seed: r() });
        }
      }
      x += w + (row === 0 ? 34 + r() * 8 : 28 + r() * 12);
    }
  }

  // the front row steps back round the temple basin, so the island has water all round it
  {
    const T = PORT.temple;
    const cut = [];
    for (const p of P.platforms) {
      const za = Math.max(p.z0, p.z1), zb = Math.min(p.z0, p.z1);
      if (p.row !== 0 || zb > T.z + T.r || za < T.z - T.r) {
        cut.push(p);
        continue;
      }
      if (za > T.z + T.r + 30) cut.push({ ...p, z0: za, z1: T.z + T.r, seed: p.seed });
      if (zb < T.z - T.r - 30) cut.push({ ...p, z0: T.z - T.r, z1: zb, seed: p.seed * 0.7 });
    }
    P.platforms = cut;
  }

  let castleBuilt = false;
  for (const p of P.platforms) {
    const xa = Math.min(p.x0, p.x1), xb = Math.max(p.x0, p.x1), za = Math.max(p.z0, p.z1), zb = Math.min(p.z0, p.z1);
    const w = xb - xa, d = za - zb, cx = (xa + xb) / 2, cz = (za + zb) / 2;
    box({ x: cx, y: deck / 2 - 3, z: cz, sx: w, sy: deck + 6, sz: d, kind: 1, seed: p.seed });
    P.edges.push({ x0: xa, z0: za, x1: xb, z1: zb, y: deck - 0.5 });
    const rr = rng(Math.floor(p.seed * 1e9) + 3);
    const edgeX = p.side < 0 ? xb : xa; // the channel-side edge
    const toward = -p.side; // +x on the left bank, -x on the right: from the towers toward the channel
    const face = p.side < 0 ? Math.PI / 2 : -Math.PI / 2; // a flat thing facing the channel

    if (p.row === 0) {
      // ---- the canyon wall: towers shoulder to shoulder behind a walkway --------------------------------
      let z = za - 6;
      const c0 = PORT.cross[0];
      if (p.side > 0 && !P.crab && za > PORT.channel.z0 - 80) {
        // かに港: the crab restaurant at the harbour mouth, its white slatted front facing the boats coming in
        const front = edgeX - toward * walk;
        const depth = 42, dz = 24, height = 27;
        const xc = front - toward * (depth / 2);
        const zc = z - dz / 2;
        box({ x: xc, y: deck + height / 2, z: zc, sx: depth, sy: height, sz: dz, kind: 10, seed: 0.37 });
        P.roofs.push({ x: xc, y: deck + height - 0.2, z: zc, sx: depth / 2 + 3.5, sy: 4.5, sz: dz / 2 + 3.5, neon: NEON.amber, tile: 1 });
        P.signs.push({ x: xc, y: deck + 7.4, z: z + 0.6, w: 32, h: 4.4, orient: "blade", vertical: false, sign: 8 });
        P.crab = { x: xc, y: deck + 17.5, z: z + 2.4, ry: 0, scale: 0.98 };
        z -= dz + 6;
      }
      if (p.side < 0 && !P.vision && Math.abs(za - (c0.z - c0.w / 2)) < 1) {
        // KRAKEN VISION: a big corner tower whose screen wraps round to face both the channel and the canal
        const front = edgeX - toward * walk;
        const depth = 46, dz = 46, height = 126;
        box({ x: front - depth / 2, y: deck + height / 2, z: z - dz / 2, sx: depth, sy: height, sz: dz, kind: 0, seed: 0.913, density: 0.42, tone: 0.75 });
        pagoda(P, { x: front - depth / 2, z: z - dz / 2, y: deck + height, w: 30, tiers: 3, tierH: 7, shrink: 0.78, neon: NEON.cyan });
        P.vision = { cx: front, cz: z, y0: deck + 34, h: 28, la: 30, lb: 30, r: 6 };
        streetSigns(P, rr, front, z - dz / 2 - 8, 20, 30, toward);
        z -= dz + 6;
      }
      while (z > zb + 24) {
        const dz = Math.min(z - zb - 6, 26 + rr() * 26);
        const zc = z - dz / 2;
        const depth = 26 + rr() * 34;
        const front = edgeX - toward * walk; // tower front face x
        const xc = front - toward * (depth / 2);
        const height = 70 + rr() * 150 + (rr() < 0.18 ? 90 : 0);
        const seed = rr();
        const kind = rr();
        if (!castleBuilt && p.side > 0 && zc < 200 && zc > 60) {
          // the castle keep, high on a podium of shops, facing the harbour
          castleBuilt = true;
          const podH = 34;
          box({ x: xc, y: deck + podH / 2, z: zc, sx: depth, sy: podH, sz: dz, kind: 0, seed, density: 0.5, tone: 0.65 });
          pagoda(P, { x: xc, z: zc, y: deck + podH, w: Math.min(depth, dz) * 0.82, tiers: 4, tierH: 9, shrink: 0.8, style: "castle", neon: NEON.gold, base: 9 });
        } else if (kind < 0.62) {
          const top = slabTower(P, rr, xc, zc, depth, dz, height, seed, toward, face, nextKind);
          // a pagoda crown on some towers: two to four tiers of eaves traced in neon
          if (top && rr() < 0.34 && height > 80) {
            const neon = [NEON.magenta, NEON.cyan, NEON.teal, NEON.violet][Math.floor(rr() * 4)];
            pagoda(P, { x: top.x, z: zc, y: top.y, w: Math.min(top.sx, top.sz) * 0.86, tiers: 2 + Math.floor(rr() * 3), tierH: 6.5, shrink: 0.78, neon });
          }
        } else drumTower(P, rr, xc, zc, Math.min(depth, dz) * 0.5, height, seed, toward, face, nextKind);
        // a holographic cherry tree on the walkway now and then
        if (rr() < 0.28) P.sakura.push({ x: edgeX - toward * 4.2, y: deck, z: zc - dz * 0.3, h: 11 + rr() * 5 });
        // kiosks and lamp posts on the walkway in front
        if (rr() < 0.55) {
          box({ x: edgeX - toward * 4.5, y: deck + 1.6, z: zc + (rr() - 0.5) * dz * 0.5, sx: 3.2, sy: 3.2, sz: 4 + rr() * 3, kind: 5, seed: rr(), tone: rr() });
        }
        P.posts.push({ x: edgeX - toward * 1.4, z: zc + dz * 0.45 });
        z -= dz + 3 + rr() * 6;
      }
      // the back of the platform: lower blocks, a dome or a tank or two
      const bx = edgeX - toward * (w * 0.78);
      if (rr() < 0.5) {
        const rad = Math.min(d * 0.3, 26 + rr() * 16);
        cyl({ x: bx, y: deck + 3, z: cz, r: rad, h: 6, kind: 2 });
        P.domes.push({ x: bx, y: deck + 6, z: cz, r: rad, seed: rr(), glass: 1 });
      } else {
        const h = 30 + rr() * 50;
        box({ x: bx, y: deck + h / 2, z: cz, sx: 30, sy: h, sz: Math.min(d * 0.6, 60), kind: 0, seed: rr(), density: 0.2 + rr() * 0.2, tone: rr() });
      }
    } else {
      // ---- the back rows: medium towers, domes and tank farms --------------------------------------------
      const slots = Math.max(1, Math.round(d / 85));
      for (let s = 0; s < slots; s++) {
        const s0 = za - (d / slots) * s, s1 = za - (d / slots) * (s + 1), sc = (s0 + s1) / 2, sl = s0 - s1;
        const pick = rr();
        const xc = cx + (rr() - 0.5) * w * 0.3;
        const tall = p.row === 1 ? 1 : 0.7;
        if (pick < 0.5) {
          const height = (60 + rr() * 140) * tall;
          slabTower(P, rr, xc, sc, 28 + rr() * 30, Math.min(sl * 0.7, 30 + rr() * 26), height, rr(), toward, face, null);
        } else if (pick < 0.72) {
          drumTower(P, rr, xc, sc, 12 + rr() * 10, (60 + rr() * 120) * tall, rr(), toward, face, null);
        } else if (pick < 0.86) {
          const rad = Math.min(sl * 0.4, 30 + rr() * 22);
          cyl({ x: xc, y: deck + 3, z: sc, r: rad, h: 6, kind: 2 });
          P.domes.push({ x: xc, y: deck + 6, z: sc, r: rad, seed: rr(), glass: 1 });
        } else {
          for (let k = 0; k < 3; k++) {
            const tr = 8 + rr() * 6;
            const tx = cx + (rr() - 0.5) * (w - 30), tz = sc + (rr() - 0.5) * (sl - 30);
            cyl({ x: tx, y: deck + tr * 0.5, z: tz, r: tr * 0.6, h: tr, kind: 2 });
            P.tanks.push({ x: tx, y: deck + tr * 1.45, z: tz, r: tr });
          }
        }
      }
    }
  }

  // (the temple island is the pagoda's own stone terraces: pagoda.js)
  // the sakura avenue: cherry trees down both walkways of the channel between the first canal and the temple basin
  for (const side of [-1, 1]) {
    for (let z = 200; z > PORT.temple.z + PORT.temple.r + 30; z -= 24) {
      if (cross.some((c) => Math.abs(z - c.z) < c.w / 2 + 6)) continue;
      P.sakura.push({ x: side * (channel.halfW + 3.4), y: deck, z: z + (side > 0 ? 12 : 0), h: 13 + ((z * 7) % 5) });
    }
  }
  // overhead cables: bundles slung across the canal mouths and, high up, across the channel
  P.cables = [];
  for (const c of cross) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const x = side * (channel.halfW + 6 + k * 9);
        P.cables.push({ ax: x, az: c.z + c.w / 2 + 2, bx: x + side * 4, bz: c.z - c.w / 2 - 2, y: 16 + k * 2.5 + (k % 2) * 3, sag: 2.5 + k * 0.4 });
      }
    }
  }
  for (const z of [180, -60, -330, -760, -1040]) {
    for (let k = 0; k < 4; k++) P.cables.push({ ax: -channel.halfW - 10, az: z + k * 1.2, bx: channel.halfW + 10, bz: z - 3 + k * 1.2, y: 46 + k * 1.6, sag: 5 + k });
  }

  // the great torii standing in the sea at the harbour mouth, the first thing you fly through
  torii(P, { x: 0, z: channel.z0 + 90, width: 104, height: 70 });

  // ---- glass tube bridges and pipe runs over the channel ---------------------------------------------------
  const L = channel.halfW * 2 + walk * 2 + 6;
  for (const t of [
    { z: 330, y: 44, r: 3.4 },
    { z: 120, y: 96, r: 3.0 },
    { z: -90, y: 58, r: 3.6 },
    { z: -640, y: 52, r: 3.4 },
    { z: -880, y: 76, r: 3.4 },
    { z: -1010, y: 150, r: 2.8 },
    { z: -1290, y: 52, r: 3.6 },
  ]) {
    cyl({ x: 0, y: t.y, z: t.z, r: t.r, h: L, kind: 3, seed: r(), rz: Math.PI / 2 });
    box({ x: 0, y: t.y + t.r + 0.25, z: t.z, sx: L, sy: 0.5, sz: 1.2, kind: 2 });
    box({ x: 0, y: t.y - t.r - 0.5, z: t.z, sx: L, sy: 1.0, sz: t.r * 1.3, kind: 2 });
    // a lamp strip under each tube
    P.edges.push({ x0: -L / 2, z0: t.z, x1: L / 2, z1: t.z, y: t.y - t.r - 0.3, line: true, step: 4 });
  }
  for (const pz of [210, -650, -1210]) {
    for (let k = 0; k < 3; k++) cyl({ x: 0, y: 70 + k * 2.4, z: pz + k * 0.3, r: 0.9, h: L, kind: 2, rz: Math.PI / 2 });
  }
  // low bridges over the cross canals
  for (const c of cross) {
    for (const side of [-1, 1]) {
      for (const bx of [150, 330]) {
        box({ x: side * bx, y: 14, z: c.z, sx: 9, sy: 2.4, sz: c.w + 18, kind: 2 });
        P.edges.push({ x0: side * bx, z0: c.z + c.w / 2, x1: side * bx, z1: c.z - c.w / 2, y: 12.6, line: true, step: 4 });
      }
      // free-standing boards at the canal mouths, angled toward the channel (not in front of KRAKEN VISION)
      if (!(c === cross[0] && side < 0)) P.boards.push({ x: side * (channel.halfW + 18), y: deck + 30, z: c.z + side * 6, w: 30, h: 17, ry: side < 0 ? Math.PI / 2 - 0.4 : -Math.PI / 2 + 0.4, kind: nextKind("h"), pylon: true });
    }
  }

  // (beyond the home district the city goes on without end: districts.js)

  // the harbour mouth: the boardwalk to the torii, the buildings and trees round it (hero.js)
  harbourFront(P);

  // steam vents on the roof plant, and searchlights on the tallest roofs
  const rv = rng(99);
  for (const b of P.boxes) if (b.kind === 3 && rv() < 0.6) P.vents.push({ x: b.x, y: b.y + b.sy / 2, z: b.z, size: 0.8 + rv() * 0.7 });
  const tops = P.boxes
    .filter((b) => b.kind === 0 && Math.abs(b.x) < 520 && b.z > -1500 && b.z < 600)
    .map((b) => ({ x: b.x, y: b.y + b.sy / 2, z: b.z }))
    .sort((a, b) => b.y - a.y);
  P.searchlights = tops.filter((_, i) => i % 3 === 0).slice(0, 7).map((t, i) => ({ ...t, phase: i * 1.7 }));
  return P;
}

/** A slab tower: up to three setback volumes, fins, balconies, roof plant, a mast, signs and boards. */
function slabTower(P, rr, xc, zc, depth, width, height, seed, toward, face, nextKind) {
  const { deck } = PORT;
  const tone = rr();
  const density = 0.2 + rr() * 0.32;
  let y = deck, sx = depth, sz = width, h = height;
  const tiers = height > 140 ? 3 : height > 90 ? 2 : 1;
  let x = xc;
  for (let k = 0; k < tiers; k++) {
    const th = k === tiers - 1 ? h : h * (0.45 + rr() * 0.2);
    P.boxes.push({ x, y: y + th / 2, z: zc, sx, sy: th, sz, ry: 0, kind: 0, seed: seed + k * 0.013, density, tone: k === tiers - 1 ? tone : 0.3 });
    // balconies every few floors on the channel face
    if (nextKind && k === 0) {
      const fx = x + toward * (sx / 2 + 0.8);
      for (let b = y + 14; b < y + th - 6; b += 3.8 * (3 + Math.floor(rr() * 2))) P.boxes.push({ x: fx, y: b, z: zc, sx: 1.6, sy: 0.5, sz: sz * 0.92, ry: 0, kind: 2, seed: 0.1, density: 0, tone: 0 });
    }
    // vertical fins on the long face
    if (rr() < 0.5) for (const f of [-0.5, 0, 0.5]) P.boxes.push({ x: x + toward * (sx / 2 + 0.4), y: y + th / 2, z: zc + f * sz * 0.9, sx: 0.8, sy: th, sz: 0.9, ry: 0, kind: 2, seed: 0.2 });
    // ledges round all four faces on residential towers: the horizontal lines that make a block read as homes
    if (rr() < 0.45) {
      const every = 3.6 * (2 + Math.floor(rr() * 2));
      for (let b = y + 8; b < y + th - 4; b += every) {
        P.boxes.push({ x, y: b, z: zc, sx: sx + 1.4, sy: 0.35, sz: sz + 1.4, ry: 0, kind: 2, seed: 0.15 });
      }
    }
    // air-conditioner boxes hung under windows on the channel face and the sides, low down where you see them
    if (nextKind && k === 0) {
      const n = Math.floor(10 + rr() * 26);
      for (let i = 0; i < n; i++) {
        const onSide = rr() < 0.35;
        const ay = y + 6 + Math.floor(rr() * Math.min(18, (th - 8) / 3.6)) * 3.6 + 0.6;
        if (onSide) {
          const s = rr() < 0.5 ? -1 : 1;
          P.boxes.push({ x: x + (rr() - 0.5) * sx * 0.8, y: ay, z: zc + s * (sz / 2 + 0.35), sx: 1.0, sy: 0.7, sz: 0.6, ry: 0, kind: 3, seed: 0.5 });
        } else {
          P.boxes.push({ x: x + toward * (sx / 2 + 0.35), y: ay, z: zc + (rr() - 0.5) * sz * 0.85, sx: 0.6, sy: 0.7, sz: 1.0, ry: 0, kind: 3, seed: 0.5 });
        }
      }
    }
    y += th;
    h -= th;
    // set back away from the channel
    const nsx = sx * (0.7 + rr() * 0.15), nsz = sz * (0.75 + rr() * 0.15);
    x -= toward * (sx - nsx) * 0.5;
    sx = nsx;
    sz = nsz;
    if (h <= 4) break;
  }
  // roof plant, tanks on legs, an antenna cluster and a mast
  P.boxes.push({ x: x + (rr() - 0.5) * sx * 0.3, y: y + 3, z: zc + (rr() - 0.5) * sz * 0.3, sx: sx * 0.4, sy: 6, sz: sz * 0.36, ry: 0, kind: 3, seed: 0.3, density: 0, tone: 0 });
  P.boxes.push({ x, y: y + 0.6, z: zc, sx: sx + 0.8, sy: 1.2, sz: sz + 0.8, ry: 0, kind: 2, seed: 0.2 }); // parapet
  if (rr() < 0.6) {
    for (let i = 0; i < 2; i++) {
      const tx = x + (rr() - 0.5) * sx * 0.6, tz = zc + (rr() - 0.5) * sz * 0.6;
      P.cyls.push({ x: tx, y: y + 5, z: tz, r: 2.2, h: 4.4, kind: 2 });
      P.cyls.push({ x: tx, y: y + 1.4, z: tz, r: 0.3, h: 2.8, kind: 2 });
    }
  }
  if (rr() < 0.5) for (let i = 0; i < 3; i++) P.cyls.push({ x: x + (rr() - 0.5) * sx * 0.5, y: y + 4 + i * 1.5, z: zc + (rr() - 0.5) * sz * 0.5, r: 0.12, h: 8 + i * 3, kind: 2 });
  const top = { x, y: y + 1.2, sx, sz };
  if (rr() < 0.65) {
    const mh = 18 + rr() * 30;
    P.cyls.push({ x, y: y + mh / 2, z: zc, r: 0.5, h: mh, kind: 2, seed: 0.1, density: 0, tone: 0 });
    P.beacons.push({ x, y: y + mh + 0.6, z: zc, size: 2.4, color: [1, 0.12, 0.06], blink: rr() });
  }
  if (!nextKind) return top;
  // a big screen on the channel face, sometimes a rooftop board; screens stand 2 m out, clear of the balconies
  const faceX = xc + toward * (depth / 2 + 0.9);
  const boardX = xc + toward * (depth / 2 + 2.1);
  if (rr() < 0.8) {
    const portrait = rr() < 0.45;
    const bw = portrait ? Math.min(width * 0.62, 22) : Math.min(width * 0.9, 40);
    const bh = portrait ? bw * 1.75 : bw * 0.56;
    const by = deck + 24 + rr() * Math.max(6, Math.min(height, 150) - bh - 34);
    P.boards.push({ x: boardX, y: by, z: zc, w: bw, h: bh, ry: face, kind: nextKind(portrait ? "v" : "h") });
  }
  if (rr() < 0.35 && height < 160) P.boards.push({ x: xc, y: deck + height + 13, z: zc, w: width * 0.92, h: 17, ry: face, kind: nextKind("h"), roof: true });
  streetSigns(P, rr, faceX, zc, width, Math.min(height, 70), toward);
  return top;
}

/** A habitat stack: insulated drums with ring decks between, a cap, pipes, signs and a board. */
function drumTower(P, rr, xc, zc, rad, height, seed, toward, face, nextKind) {
  const { deck } = PORT;
  let y = deck, r = Math.max(9, rad);
  const density = 0.24 + rr() * 0.3;
  const tone = rr();
  while (y < deck + height && r > 6) {
    const h = Math.min(deck + height - y, 22 + rr() * 36);
    P.cyls.push({ x: xc, y: y + h / 2, z: zc, r, h, kind: 0, seed, density, tone: y + h >= deck + height - 1 ? tone : 0.3 });
    y += h;
    P.cyls.push({ x: xc, y: y + 0.7, z: zc, r: r + 2.4, h: 1.4, kind: 1, seed });
    y += 1.4;
    r *= 0.74 + rr() * 0.2;
  }
  if (rr() < 0.55) P.domes.push({ x: xc, y, z: zc, r: r * 1.05, seed, glass: 0 });
  else {
    P.cyls.push({ x: xc, y: y + 15, z: zc, r: 0.6, h: 30, kind: 2 });
    P.beacons.push({ x: xc, y: y + 30.6, z: zc, size: 2.4, color: [1, 0.12, 0.06], blink: rr() });
  }
  // service pipes up the side
  P.cyls.push({ x: xc - toward * rad * 0.2, y: deck + (y - deck) * 0.48, z: zc + rad * 0.98, r: 0.9, h: (y - deck) * 0.92, kind: 2 });
  if (!nextKind) return;
  if (rr() < 0.8) {
    const bh = 16 + rr() * 14;
    const portrait = rr() < 0.55;
    P.boards.push({ x: xc + toward * (rad + 3.5), y: deck + 18 + rr() * Math.max(6, Math.min(height, 140) - bh - 30), z: zc, w: portrait ? bh * 0.56 : bh * 1.7, h: bh, ry: face, kind: nextKind(portrait ? "v" : "h") });
  }
  streetSigns(P, rr, xc + toward * (rad * 0.92), zc, rad * 1.4, Math.min(height, 60), toward);
}

/**
 * The street-level clutter of a Japanese night street on one face: light boxes jutting out (read up and down the
 * channel), flat boxes stacked on the wall, and a fascia sign over the walkway.
 */
function streetSigns(P, rr, faceX, zc, width, reach, toward) {
  const { deck } = PORT;
  // jutting vertical blades, in a column or two near the corners, stacked up the face
  const cols = width > 30 ? 2 : 1;
  for (let c = 0; c < cols; c++) {
    const z = zc + (cols === 1 ? (rr() - 0.5) * width * 0.4 : (c ? 1 : -1) * width * (0.3 + rr() * 0.12));
    let y = deck + 7 + rr() * 3;
    const n = 2 + Math.floor(rr() * 3);
    for (let i = 0; i < n && y < deck + reach; i++) {
      const h = 6 + rr() * 6, w = 2 + rr() * 1.2;
      P.signs.push({ x: faceX + toward * (w / 2 + 0.3), y: y + h / 2, z, w, h, orient: "blade", vertical: true, sign: Math.floor(rr() * 1000) });
      y += h + 0.8 + rr() * 2;
    }
  }
  // flat boxes on the wall
  const flats = Math.floor(rr() * 3);
  for (let i = 0; i < flats; i++) {
    const h = 7 + rr() * 7, w = 2.4 + rr() * 1.6;
    P.signs.push({ x: faceX + toward * 1.1, y: deck + 10 + rr() * Math.max(4, reach - 24), z: zc + (rr() - 0.5) * width * 0.7, w, h, orient: "flat", vertical: true, sign: Math.floor(rr() * 1000) });
  }
  // a horizontal fascia over the shopfront, and sometimes a second, higher one
  P.signs.push({ x: faceX + toward * 0.4, y: deck + 5.2, z: zc, w: Math.min(width * 0.7, 18), h: Math.min(width * 0.7, 18) / 4.2, orient: "flat", vertical: false, sign: Math.floor(rr() * 1000) });
  if (rr() < 0.4) P.signs.push({ x: faceX + toward * 0.4, y: deck + 16 + rr() * 20, z: zc + (rr() - 0.5) * width * 0.3, w: Math.min(width * 0.6, 14), h: Math.min(width * 0.6, 14) / 4.2, orient: "flat", vertical: false, sign: Math.floor(rr() * 1000) });
}

// ---------------------------------------------------------------------------------------------------------
// facade shading, after real night skylines (Hong Kong from the harbour, Shinjuku): homes lit warm and scattered,
// offices lit cool-white a floor at a time, the odd TV-blue window; LED shows running up the mullions of a few
// towers, lit corner edges on others, crowns; by day dark glass that mirrors the haze. Windows that shrink below a
// pixel fade to their average, so distant towers glow instead of crawling.
// u: metres along the wall from its centre, v: metres up from the base, halfW: half the wall's width (corners)
// ---------------------------------------------------------------------------------------------------------
function facade(U, u, v, seed, density, tone, h, halfW) {
  const style = hash(seed.mul(7.31));
  const floorH = mix(float(3.4), float(3.9), hash(seed.mul(2.9)));
  const cellW = mix(float(1.45), float(2.4), hash(seed.mul(31.7)));
  const uu = u.add(seed.mul(97.0));
  const gu = uu.div(cellW), gv = v.div(floorH);
  const fx = fract(gu), fy = fract(gv);
  const col = floor(gu), row = floor(gv);
  const grid = step(0.13, fx).mul(step(fx, 0.87)).mul(step(0.26, fy)).mul(step(fy, 0.86));
  const ribbon = step(0.32, fy).mul(step(fy, 0.82)).mul(step(0.035, fx));
  const porthole = step(length(vec2(fx.sub(0.5), fy.sub(0.56).mul(floorH.div(cellW)))), 0.31);
  const pane = select(style.lessThan(0.7), grid, select(style.lessThan(0.85), ribbon, porthole));
  const office = step(0.58, hash(seed.mul(5.13)));
  const bay = floor(col.div(mix(float(3.0), float(14.0), office)));
  const run = hash(row.mul(3.7).add(bay.mul(1.31)).add(seed.mul(911.0)));
  const hc = hash(col.mul(12.9898).add(row.mul(78.233)).add(seed.mul(4371.7)));
  const pickLit = mix(run.mul(0.55).add(hc.mul(0.45)), run.mul(0.92).add(hc.mul(0.08)), office);
  const valid = step(5.0, v).mul(step(v, h.sub(3.0)));
  const gaps = mix(float(1.0), step(0.22, hash(hc.mul(5.9).add(1.3))), office);
  const lit = step(float(1.0).sub(density), pickLit).mul(valid).mul(gaps);
  const h2 = hash(hc.mul(91.3).add(seed));
  const warm = vec3(1.0, 0.52, 0.2), pale = vec3(1.0, 0.76, 0.5), cool = vec3(0.78, 0.86, 0.98), tv = vec3(0.3, 0.46, 1.0), pink = vec3(1.0, 0.3, 0.58);
  const homeC = select(h2.lessThan(0.6), warm, select(h2.lessThan(0.88), pale, mix(pale, select(h2.lessThan(0.96), tv, pink), U.night)));
  const officeC = select(h2.lessThan(0.8), cool, pale);
  const wc = mix(homeC, officeC, office);
  const dim = mix(float(0.25), float(1.0), pow(hash(hc.mul(7.7)), 1.6));
  // inside the room: brighter toward the ceiling, blinds on some, furniture darkening the lower part
  const ceil = smoothstep(0.26, 0.86, fy).mul(0.55).add(0.45);
  const blinds = mix(float(1.0), step(0.45, fract(fy.mul(24.0))).mul(0.55).add(0.45), step(0.7, hash(hc.mul(3.1))));
  const room = ceil.mul(blinds);
  // when a cell is smaller than a pixel, blend to the wall's average
  const fw = max(fwidth(gu), fwidth(gv));
  const far = smoothstep(0.7, 2.2, fw);
  const avgC = mix(vec3(1.0, 0.68, 0.4), vec3(0.85, 0.9, 1.0), office);
  const paneAA = mix(pane, float(0.45), far);
  const litC = mix(wc.mul(lit).mul(dim).mul(room).mul(pane), avgC.mul(density).mul(0.16).mul(valid), far);
  const litAA = mix(lit.mul(pane), density.mul(0.3).mul(valid), far);
  // LED shows on a few towers: colour running along the mullions and slab edges
  const show = step(0.8, tone);
  const pattern = hash(seed.mul(3.33));
  const mullion = float(1.0).sub(smoothstep(0.0, 0.07, fx)).add(smoothstep(0.93, 1.0, fx)).min(1.0);
  const slabLine = float(1.0).sub(smoothstep(0.0, 0.06, fy));
  const ledFar = smoothstep(0.18, 0.6, fw);
  const lines = mix(max(mullion, slabLine.mul(0.6)), float(0.1), ledFar);
  const sweepPh = fract(v.div(90.0).sub(U.time.mul(0.12)).add(seed.mul(7.0)));
  const sweep = smoothstep(0.0, 0.08, sweepPh).mul(smoothstep(0.42, 0.08, sweepPh));
  const wave = sin(uu.mul(0.05).add(v.mul(0.035)).sub(U.time.mul(1.1))).mul(0.5).add(0.5);
  const ledA = vec3(0.15, 0.85, 1.0), ledB = vec3(1.0, 0.18, 0.55), ledC = vec3(1.0, 0.62, 0.12);
  const ledCol = select(pattern.lessThan(0.5), mix(ledA, ledB, wave), mix(ledC, ledB, sweep));
  const ledAmt = select(pattern.lessThan(0.5), wave.mul(0.7).add(0.3), sweep.add(0.12));
  const led = ledCol.mul(lines).mul(ledAmt).mul(show).mul(step(6.0, v)).mul(U.night).mul(1.7);
  // lit corner edges, and a crown at the top
  const edgeOn = step(0.55, tone).mul(step(tone, 0.8));
  const corner = smoothstep(halfW.sub(0.9), halfW.sub(0.2), abs(u)).mul(edgeOn).mul(step(5.0, v));
  const edgeC = select(hash(seed.mul(1.7)).lessThan(0.5), vec3(1.0, 0.9, 0.78), vec3(0.4, 0.9, 1.0));
  const crown = step(0.7, tone).mul(step(h.sub(2.6), v)).mul(step(v, h.sub(0.7)));
  const crownC = select(tone.greaterThan(0.93), vec3(0.25, 0.9, 1.0), select(tone.greaterThan(0.8), vec3(1.0, 0.22, 0.18), vec3(1.0, 0.6, 0.1)));
  const emissive = litC.mul(U.windows)
    .add(led)
    .add(edgeC.mul(corner).mul(U.lamps).mul(1.3))
    .add(crownC.mul(crown).mul(U.lamps).mul(1.8));
  // panels: insulation, dark metal or rust; fins every four bays; floor slabs; grime streaks running down
  const pick = hash(seed.mul(17.3));
  const base = select(pick.lessThan(0.45), vec3(0.24, 0.225, 0.2), select(pick.lessThan(0.8), vec3(0.06, 0.057, 0.054), vec3(0.17, 0.1, 0.065)));
  const fin = step(fract(uu.div(cellW.mul(4.0))), 0.05);
  const slab = step(fy, 0.08);
  const grime = mx_noise_float(vec3(uu.mul(0.05), v.mul(0.008), seed.mul(10.0))).mul(0.5).add(0.5);
  let albedo = base.mul(float(1.0).sub(fin.add(slab).min(1.0).mul(mix(float(0.4), float(0.15), far)))).mul(mix(float(0.62), float(1.05), grime));
  albedo = mix(albedo, vec3(0.018, 0.019, 0.022), paneAA);
  return { albedo, emissive, pane: paneAA, lit: litAA, rough: mix(float(0.85), float(0.15), paneAA) };
}

/** Glass mirrors the haze by day: the sky colour in the reflected direction, by Fresnel, on unlit panes. */
function glassSky(U, pane, lit) {
  const vdir = normalize(positionWorld.sub(cameraPosition));
  const n = normalWorld;
  const fres = pow(float(1.0).sub(abs(dot(vdir, n))), 4.0).mul(0.75).add(0.05);
  return U.hazeColor(vdir.reflect(n)).mul(fres).mul(pane).mul(float(1.0).sub(lit)).mul(mix(float(0.55), float(0.12), U.night));
}

function buildCity(U, plan) {
  const group = new THREE.Group();
  const isK = (kind, k) => step(k - 0.5, kind).mul(step(kind, k + 0.5));

  // ---- boxes: towers (0), pontoons (1), plain metal (2), roof plant (3), kiosks (5) ------------------------
  {
    const list = plan.boxes;
    const size = new Float32Array(list.length * 3), style = new Float32Array(list.length * 4);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), null, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach((b, i) => {
      size.set([b.sx, b.sy, b.sz], i * 3);
      style.set([b.kind, b.seed ?? 0.5, b.density ?? 0, b.tone ?? 0], i * 4);
      m4.compose(new THREE.Vector3(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.ry, 0)), new THREE.Vector3(b.sx, b.sy, b.sz));
      mesh.setMatrixAt(i, m4);
    });
    const S = instancedBufferAttribute(new THREE.InstancedBufferAttribute(size, 3), "vec3");
    const T = instancedBufferAttribute(new THREE.InstancedBufferAttribute(style, 4), "vec4");
    const m = new THREE.MeshStandardNodeMaterial();
    const p = positionGeometry.mul(S);
    const n = normalGeometry;
    const wall = step(abs(n.y), 0.5);
    const alongX = step(0.5, abs(n.z));
    const u = mix(p.z, p.x, alongX);
    const halfW = mix(S.z, S.x, alongX).mul(0.5);
    const v = p.y.add(S.y.mul(0.5));
    const kind = T.x;
    const f = facade(U, u, v, T.y, T.z, T.w, S.y, halfW);
    // pontoons: dark hull, plated deck, a hazard band along the deck edge
    const deckTop = step(0.5, n.y);
    const plate = step(0.965, fract(p.x.div(6.0))).add(step(0.965, fract(p.z.div(6.0)))).min(1.0);
    const hull = mix(vec3(0.04, 0.036, 0.032), vec3(0.11, 0.1, 0.095).mul(float(1.0).sub(plate.mul(0.45))), deckTop);
    const hazard = step(S.y.sub(1.5), v).mul(step(v, S.y.sub(0.9))).mul(step(0.5, fract(u.div(2.6)))).mul(wall);
    const hullC = mix(hull, vec3(0.42, 0.28, 0.05), hazard);
    // kiosks: a lit shopfront on the channel faces, shutters elsewhere
    const shop = step(0.5, abs(n.x)).mul(step(0.25, v)).mul(step(v, S.y.sub(0.5)));
    const shopC = select(T.w.lessThan(0.33), vec3(1.0, 0.72, 0.4), select(T.w.lessThan(0.66), vec3(0.4, 0.95, 1.0), vec3(1.0, 0.35, 0.55)));
    // shoji: red lacquer posts every 2.4 m, paper panels in a lattice that glow warm at night, a dark sill
    const post = step(fract(u.div(2.6).add(0.06)), 0.1);
    const lat = max(step(0.92, fract(u.div(0.34))), step(0.93, fract(v.div(0.5))));
    const sill = step(v, 0.8).add(step(S.y.sub(0.6), v)).min(1.0);
    // each bay of paper glows on its own level, a few are dark; the light is brighter low in the room
    const bayId = floor(u.div(2.6)).mul(7.1).add(T.y.mul(91.0));
    const panelLit = step(0.18, hash(bayId)).mul(mix(float(0.55), float(1.0), hash(bayId.add(3.3))));
    const paper = float(1.0).sub(post).mul(float(1.0).sub(lat)).mul(float(1.0).sub(sill));
    const lowGlow = smoothstep(S.y, float(0.0), v).mul(0.45).add(0.55);
    const shojiC = mix(mix(vec3(0.1, 0.07, 0.05), vec3(0.42, 0.05, 0.03), post), vec3(0.8, 0.74, 0.62), paper);
    const shojiE = vec3(1.0, 0.64, 0.34).mul(paper).mul(panelLit).mul(lowGlow).mul(mix(float(0.1), float(1.15), U.night))
      .add(vec3(1.0, 0.12, 0.06).mul(post).mul(0.12).mul(U.night));
    // castle: white plaster, black timber bands, small windows, some lit
    const cw = step(0.62, fract(u.div(3.0))).mul(step(fract(u.div(3.0)), 0.86)).mul(step(0.42, fract(v.div(4.2)))).mul(step(fract(v.div(4.2)), 0.7));
    const band = step(fract(v.div(4.2)), 0.08);
    const castleC = mix(mix(vec3(0.84, 0.83, 0.79), vec3(0.03, 0.03, 0.035), band), vec3(0.02, 0.02, 0.025), cw);
    const castleE = vec3(1.0, 0.7, 0.36).mul(cw).mul(step(0.45, hash(floor(u.div(3.0)).add(floor(v.div(4.2)).mul(13.0)).add(T.y.mul(31.0))))).mul(mix(float(0.1), float(1.2), U.night))
      // floodlit from below at night, like a real keep: white plaster warming toward the base
      .add(vec3(0.95, 0.88, 0.78).mul(float(1.0).sub(cw)).mul(float(1.0).sub(band)).mul(smoothstep(S.y.mul(1.1), float(0.0), v).mul(0.35).add(0.06)).mul(U.night));
    // stone: coursed blocks, staggered
    const course = floor(v.div(0.9));
    const bu = fract(u.div(1.6).add(course.mul(0.5)));
    const mortar = max(step(0.94, bu), step(0.9, fract(v.div(0.9))));
    const stoneC = vec3(0.3, 0.29, 0.27).mul(mix(float(0.75), float(1.05), hash(course.add(floor(u.div(1.6).add(course.mul(0.5))).mul(17.0))))).mul(float(1.0).sub(mortar.mul(0.55)));
    // white slats (the crab restaurant): vertical boards, a warm shopfront at street level
    const slat = smoothstep(0.86, 0.94, fract(u.div(0.42)));
    const shopfront = step(v, 4.6).mul(step(0.6, v));
    const mullionS = step(0.94, fract(u.div(3.2)));
    const slatsC = mix(mix(vec3(0.62, 0.56, 0.5), vec3(0.42, 0.38, 0.34), slat), vec3(0.05, 0.04, 0.04), shopfront.mul(float(1.0).sub(mullionS)));
    const slatsE = vec3(1.0, 0.7, 0.4).mul(shopfront).mul(float(1.0).sub(mullionS)).mul(mix(float(0.25), float(1.3), U.night))
      .add(vec3(0.9, 0.86, 0.8).mul(float(1.0).sub(shopfront)).mul(0.1).mul(U.night));
    // vermilion lacquer (the torii), with a lit edge line at night
    const lacquerC = vec3(0.66, 0.1, 0.04);
    const lacquerE = vec3(1.0, 0.1, 0.03).mul(step(S.y.sub(0.25), v).mul(0.9).add(0.5)).mul(mix(float(0.06), float(1.0), U.night));
    const tower = isK(kind, 0);
    m.colorNode = mix(vec3(0.06, 0.056, 0.052), f.albedo, wall).mul(tower)
      .add(mix(vec3(0.08, 0.06, 0.05), shojiC, wall).mul(isK(kind, 6)))
      .add(mix(vec3(0.07, 0.07, 0.075), castleC, wall).mul(isK(kind, 7)))
      .add(stoneC.mul(isK(kind, 8)))
      .add(lacquerC.mul(isK(kind, 9)))
      .add(mix(vec3(0.3, 0.3, 0.3), slatsC, wall).mul(isK(kind, 10)))
      .add(hullC.mul(isK(kind, 1)))
      .add(vec3(0.085, 0.08, 0.075).mul(isK(kind, 2)))
      .add(vec3(0.13, 0.125, 0.12).mul(isK(kind, 3)))
      .add(vec3(0.08, 0.075, 0.07).mul(isK(kind, 5)));
    m.emissiveNode = f.emissive.add(glassSky(U, f.pane, f.lit)).mul(wall).mul(tower)
      .add(shopC.mul(shop).mul(isK(kind, 5)).mul(U.lamps).mul(1.3))
      .add(shojiE.mul(wall).mul(isK(kind, 6)))
      .add(castleE.mul(wall).mul(isK(kind, 7)))
      .add(lacquerE.mul(isK(kind, 9)))
      .add(slatsE.mul(wall).mul(isK(kind, 10)));
    m.roughnessNode = mix(float(0.75), f.rough, tower.mul(wall));
    m.metalnessNode = mix(float(0.12), float(0.55), isK(kind, 2));
    mesh.material = m;
    group.add(mesh);
  }

  // ---- cylinders: habitat drums (0), ring decks (1), pipes and masts (2), glass tube bridges (3) -----------
  {
    const list = plan.cyls;
    const size = new Float32Array(list.length * 3), style = new Float32Array(list.length * 4);
    const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 48, 1, false), null, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach((c, i) => {
      size.set([c.r, c.h, c.r], i * 3);
      style.set([c.kind, c.seed ?? 0.5, c.density ?? 0, c.tone ?? 0], i * 4);
      m4.compose(new THREE.Vector3(c.x, c.y, c.z), q.setFromEuler(e.set(c.rx ?? 0, 0, c.rz ?? 0)), new THREE.Vector3(c.r, c.h, c.r));
      mesh.setMatrixAt(i, m4);
    });
    const S = instancedBufferAttribute(new THREE.InstancedBufferAttribute(size, 3), "vec3");
    const T = instancedBufferAttribute(new THREE.InstancedBufferAttribute(style, 4), "vec4");
    const m = new THREE.MeshStandardNodeMaterial();
    const pg = positionGeometry;
    const n = normalGeometry;
    const wall = step(abs(n.y), 0.5);
    const u = atan2(pg.z, pg.x).mul(S.x);
    const v = pg.y.add(0.5).mul(S.y);
    const kind = T.x;
    const f = facade(U, u, v, T.y, T.z, T.w, S.y, float(1e6));
    // ring decks: a rail of small lamps round the rim
    const rim = step(S.y.sub(0.5), v).mul(wall);
    const dots = step(0.55, fract(u.div(2.4)));
    const deckLamp = vec3(1.0, 0.68, 0.34).mul(rim).mul(dots).mul(U.lamps).mul(1.4);
    // glass tubes (lying along world x, so local +x is up): frames every 4 m, a light strip along the ceiling,
    // the warm walkway floor, and the haze mirrored on the glass by day
    const frameT = step(0.965, fract(v.div(6.0)));
    const ceiling = smoothstep(0.93, 0.985, pg.x);
    const floorGlow = smoothstep(-0.55, -0.85, pg.x).mul(0.45);
    const tubeC = mix(vec3(1.0, 0.8, 0.55), vec3(0.6, 0.92, 1.0), step(0.5, T.y));
    // seen through the glass from outside: one line of ceiling light down the length, a faint warm floor
    const tubeE = tubeC.mul(ceiling.mul(1.2).add(floorGlow.mul(0.35)).add(0.012)).mul(float(1.0).sub(frameT)).mul(mix(float(0.1), float(1.0), U.night)).mul(U.lamps);
    const tubeSky = glassSky(U, float(1.0).sub(frameT), float(0.0));
    const pipeC = vec3(0.12, 0.115, 0.11).mul(step(0.5, fract(v.div(4.0))).mul(0.15).add(0.85));
    const drum = isK(kind, 0);
    m.colorNode = mix(vec3(0.06, 0.056, 0.052), f.albedo, wall).mul(drum)
      .add(vec3(0.09, 0.085, 0.08).mul(isK(kind, 1)))
      .add(pipeC.mul(isK(kind, 2)))
      .add(mix(vec3(0.015, 0.017, 0.02), vec3(0.09, 0.085, 0.08), frameT).mul(isK(kind, 3)))
      .add(vec3(0.66, 0.1, 0.04).mul(isK(kind, 4)));
    // torii pillars: lit from the foot up the way temples floodlight their gates, a bright line up the front
    const upLight = smoothstep(S.y, float(0.0), v).mul(0.45).add(0.3);
    const tubeEdge = smoothstep(0.75, 0.98, abs(sin(atan2(pg.z, pg.x)))).mul(1.1);
    const pillarGlow = vec3(1.0, 0.1, 0.03).mul(upLight.add(tubeEdge)).mul(mix(float(0.05), float(1.0), U.night)).mul(isK(kind, 4));
    m.emissiveNode = f.emissive.add(glassSky(U, f.pane, f.lit)).mul(wall).mul(drum)
      .add(deckLamp.mul(isK(kind, 1)))
      .add(tubeE.add(tubeSky).mul(isK(kind, 3)))
      .add(pillarGlow);
    m.roughnessNode = mix(mix(float(0.7), f.rough, drum.mul(wall)), float(0.08), isK(kind, 3));
    m.metalnessNode = mix(float(0.1), float(0.55), isK(kind, 2));
    mesh.material = m;
    group.add(mesh);
  }

  // ---- domes: geodesic glass, lit from inside --------------------------------------------------------------
  {
    const list = plan.domes;
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), null, list.length);
    const style = new Float32Array(list.length * 2);
    const m4 = new THREE.Matrix4();
    list.forEach((d, i) => {
      style.set([d.seed, d.glass], i * 2);
      m4.compose(new THREE.Vector3(d.x, d.y, d.z), new THREE.Quaternion(), new THREE.Vector3(d.r, d.r * (d.glass ? 0.62 : 0.8), d.r));
      mesh.setMatrixAt(i, m4);
    });
    const T = instancedBufferAttribute(new THREE.InstancedBufferAttribute(style, 2), "vec2");
    const m = new THREE.MeshStandardNodeMaterial();
    const pg = positionGeometry;
    const lon = atan2(pg.z, pg.x).div(Math.PI * 2).add(0.5);
    const lat = pg.y;
    const near = (x) => float(1.0).sub(smoothstep(0.0, fwidth(x).mul(1.2).add(0.02), abs(fract(x.add(0.5)).sub(0.5))));
    const frame = max(max(near(lon.mul(48.0)), near(lat.mul(10.0))), near(lon.mul(48.0).add(lat.mul(10.0))));
    const glassy = T.y;
    const glow = mix(vec3(1.0, 0.6, 0.28), vec3(0.62, 1.0, 0.55), step(0.6, T.x)).mul(float(1.0).sub(lat.mul(0.55)));
    const flick = mx_noise_float(vec3(lon.mul(12.0), lat.mul(4.0), T.x.mul(20.0))).mul(0.35).add(0.75);
    m.colorNode = mix(mix(vec3(0.03, 0.03, 0.035), vec3(0.32, 0.3, 0.27), float(1.0).sub(glassy)), vec3(0.13, 0.12, 0.11), frame);
    m.emissiveNode = glow.mul(float(1.0).sub(frame)).mul(glassy).mul(flick).mul(U.windows).mul(0.6);
    m.roughnessNode = mix(float(0.12), float(0.6), frame);
    m.metalnessNode = float(0.3);
    mesh.material = m;
    group.add(mesh);
  }

  // ---- tanks ---------------------------------------------------------------------------------------------
  if (plan.tanks.length) {
    const list = plan.tanks;
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 48, 24), null, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach((t, i) => {
      m4.compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion(), new THREE.Vector3(t.r, t.r, t.r));
      mesh.setMatrixAt(i, m4);
    });
    const m = new THREE.MeshStandardNodeMaterial();
    const pg = positionGeometry;
    const weld = ss(0.012, 0.0, abs(pg.y)).add(ss(0.012, 0.0, abs(abs(pg.y).sub(0.55)))).min(1.0);
    const streak = mx_noise_float(vec3(atan2(pg.z, pg.x).mul(6.0), pg.y.mul(1.5), float(instanceIndex))).mul(0.5).add(0.5);
    m.colorNode = vec3(0.42, 0.4, 0.37).mul(float(1.0).sub(weld.mul(0.5))).mul(mix(float(0.6), float(1.0), streak));
    m.roughnessNode = float(0.45);
    m.metalnessNode = float(0.25);
    mesh.material = m;
    group.add(mesh);
  }
  return { group };
}

// ---------------------------------------------------------------------------------------------------------
// glows: deck-edge lamps, tube underlights, lamp posts and red beacons, as camera-facing sprites
// ---------------------------------------------------------------------------------------------------------
function glowMaterial(U, P, C, { gain = 2.2, minPx = 420 } = {}) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const center = P.xyz;
  const toCam = normalize(cameraPosition.sub(center));
  const right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  const up = cross(toCam, right);
  const dist = length(cameraPosition.sub(center));
  // far lamps keep a minimum apparent size, so rows of them still read as lines of light
  const size = P.w.mul(max(float(1.0), dist.div(minPx)));
  m.positionNode = center.add(right.mul(positionGeometry.x.mul(size))).add(up.mul(positionGeometry.y.mul(size)));
  const r = length(uv().sub(0.5)).mul(2.0);
  const core = pow(max(float(1.0).sub(r), 0.0), 7.0).add(pow(max(float(1.0).sub(r), 0.0), 2.0).mul(0.12));
  const blink = select(C.w.lessThan(0.0), float(1.0), step(0.55, fract(U.time.mul(0.6).add(C.w))).mul(0.92).add(0.08));
  m.colorNode = C.xyz.mul(core).mul(blink).mul(U.lamps).mul(gain).mul(float(1.0).sub(U.fogFactor().mul(0.8)));
  m.fog = false;
  return m;
}

function buildLamps(U, plan) {
  const pts = [];
  for (const e of plan.edges) {
    if (e.line) {
      const len = Math.hypot(e.x1 - e.x0, e.z1 - e.z0), n = Math.floor(len / (e.step ?? 5));
      for (let i = 0; i <= n; i++) pts.push([e.x0 + ((e.x1 - e.x0) * i) / n, e.y, e.z0 + ((e.z1 - e.z0) * i) / n, 0.55, 1.0, 0.8, 0.55, -1]);
    } else {
      const c = [[e.x0, e.z0], [e.x1, e.z0], [e.x1, e.z1], [e.x0, e.z1]];
      for (let k = 0; k < 4; k++) {
        const [ax, az] = c[k], [bx, bz] = c[(k + 1) % 4];
        const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 6);
        for (let i = 0; i < n; i++) {
          const warm = (i + k) % 4 === 0;
          pts.push([ax + ((bx - ax) * (i + 0.5)) / n, e.y, az + ((bz - az) * (i + 0.5)) / n, 0.42, warm ? 1.0 : 0.85, warm ? 0.5 : 0.8, warm ? 0.12 : 0.7, -1]);
        }
      }
    }
  }
  // lamp posts along the walkways: a pole and a warm lamp
  for (const p of plan.posts) pts.push([p.x + (p.x < 0 ? 1.75 : -1.75), PORT.deck + 6.3, p.z, 1.4, 1.0, 0.62, 0.32, -1]);
  for (const b of plan.beacons) pts.push([b.x, b.y, b.z, b.size, ...b.color, b.blink]);
  const count = pts.length;
  const pos = new Float32Array(count * 4), col = new Float32Array(count * 4);
  pts.forEach((p, i) => {
    pos.set([p[0], p[1], p[2], p[3]], i * 4);
    col.set([p[4], p[5], p[6], p[7]], i * 4);
  });
  const P = instancedBufferAttribute(new THREE.InstancedBufferAttribute(pos, 4), "vec4");
  const C = instancedBufferAttribute(new THREE.InstancedBufferAttribute(col, 4), "vec4");
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMaterial(U, P, C), count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  const group = new THREE.Group();
  group.add(mesh);
  // the lamps themselves: a pole that curves over at the top, a frosted globe
  const poleMat = new THREE.MeshStandardNodeMaterial({ color: 0x15141c, roughness: 0.5, metalness: 0.6 });
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.16, 6.6, 8), poleMat, plan.posts.length);
  const arm = new THREE.InstancedMesh(new THREE.TorusGeometry(0.9, 0.08, 6, 12, Math.PI * 0.6), poleMat, plan.posts.length);
  const globeMat = new THREE.MeshBasicNodeMaterial();
  globeMat.colorNode = vec3(1.0, 0.7, 0.42).mul(mix(float(0.4), float(1.05), U.night));
  const globe = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 16, 10), globeMat, plan.posts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  plan.posts.forEach((p, i) => {
    const out = p.x < 0 ? 1 : -1; // lean out over the water
    pole.setMatrixAt(i, m4.makeTranslation(p.x, PORT.deck + 3.3, p.z));
    arm.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x + out * 0.9, PORT.deck + 6.6, p.z), q.setFromEuler(e.set(0, 0, out > 0 ? 0 : Math.PI * 0.4)), new THREE.Vector3(1, 1, 1)));
    globe.setMatrixAt(i, m4.makeTranslation(p.x + out * 1.75, PORT.deck + 6.3, p.z));
  });
  group.add(pole, arm, globe);
  return group;
}

/** Overhead cables: sagging lines slung between the towers, the way wires cross every Tokyo side street. */
function buildCables(cables = []) {
  const pts = [];
  for (const c of cables) {
    const n = 18;
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.Vector3(c.ax + (c.bx - c.ax) * t, c.y - Math.sin(t * Math.PI) * c.sag, c.az + (c.bz - c.az) * t);
      if (prev) pts.push(prev, p);
      prev = p;
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicNodeMaterial({ color: 0x0a0910 }));
  lines.frustumCulled = false;
  return lines;
}
