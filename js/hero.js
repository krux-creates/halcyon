// The harbour mouth, the scene the home screen opens on: a long wet boardwalk out over the sea to a stone landing
// where the great torii stands, glowing; the Infinity Castle framed in the gate, climbing into the cloud. Round it: a
// bloom of jellyfish in light drifting over the water, a woman in light kneeling on the right bank, a neon expressway sweeping
// into the channel, an arched bridge, big vertical neon, cherry trees, and post lamps along the rails.
// harbourFront() adds the buildings and trees to the port's plan; createHero() builds everything else.
import * as THREE from "three";
import {
  vec2, vec3, float, mix, step, smoothstep, abs, fract, floor, sin, cos, length, max, min, pow, positionGeometry,
  normalGeometry, positionWorld, positionLocal, cameraPosition, normalize, uv, attribute, select, texture, screenUV,
  instancedBufferAttribute, normalView, positionViewDirection, dot, cross, mx_noise_float, hash as rawHash, clamp,
} from "three/tsl";
import { PORT } from "./port.js";
import { NEON, pagoda } from "./japan.js";
import { glowPoints, landmarkFog, hashF } from "./fx.js";
import { buildHoloImage } from "./holo.js";
import { buildJellies } from "./jelly.js";
import { pavilionMaterial, instancePavilions } from "./pavilion.js";

const hash = (x) => hashF(float(x).add(1048576.0));
const ssf = (a, b, x) => (a > b ? float(1).sub(smoothstep(b, a, x)) : smoothstep(a, b, x));

export const PIER = { x0: -9, x1: 9, z0: 990, z1: 752, deck: 2.6 };
export const LANDING = { x0: -64, x1: 64, z0: 752, z1: 706 };
/** The home screen's camera: on the boardwalk, eye height, the torii and the castle ahead. */
export const TITLE_CAM = { pos: [0, 4.6, 946], look: [0, 25.5, 846] };

/** Buildings, trees and boards round the harbour mouth, added to the port's plan before it is built. */
export function harbourFront(P) {
  const { deck } = PORT;
  const box = (o) => P.boxes.push({ ry: 0, density: 0, tone: 0, seed: 0.5, ...o });
  // the boardwalk and the landing are solid for the shuttle
  P.platforms.push({ side: 0, row: -1, x0: PIER.x0, x1: PIER.x1, z0: PIER.z0, z1: PIER.z1, seed: 0.1, hero: true });
  P.platforms.push({ side: 0, row: -1, x0: LANDING.x0, x1: LANDING.x1, z0: LANDING.z0, z1: LANDING.z1, seed: 0.2, hero: true });
  // the right: 海月楼, a Hongyadong cascade of pavilions up the bank (built in createHero), 未来の都市 in front of it;
  // a dark core stands inside it so the cascade has something to climb
  {
    const x = 112, z = 812;
    P.platforms.push({ side: 1, row: -1, x0: x - 34, x1: x + 34, z0: z + 34, z1: z - 34, seed: 0.3, hero: true });
    box({ x, y: deck / 2 - 3, z, sx: 68, sy: deck + 6, sz: 68, kind: 1, seed: 0.3 });
    box({ x: x + 14, y: deck + 80, z: z - 4, sx: 26, sy: 160, sz: 30, kind: 0, seed: 0.617, density: 0.3, tone: 0.84 });
    P.boards.push({ x: x + 14, y: deck + 96, z: z + 15 + 2.1, w: 20, h: 36, ry: 0, kind: "geisha" });
    P.beacons.push({ x: x + 16, y: deck + 214, z: z - 2, size: 3, color: [1, 0.12, 0.06], blink: 0.4 });
    for (const [sx, sz] of [[-28, 32], [-30, -30]]) P.sakura.push({ x: x + sx, y: deck, z: z + sz, h: 12 + Math.abs(sx) * 0.1 });
  }
  // the left: a pagoda on its own pontoon, a tea house, cherry trees
  {
    const x = -178, z = 770;
    P.platforms.push({ side: -1, row: -1, x0: x - 36, x1: x + 36, z0: z + 36, z1: z - 36, seed: 0.4, hero: true });
    box({ x, y: deck / 2 - 3, z, sx: 72, sy: deck + 6, sz: 72, kind: 1, seed: 0.4 });
    pagoda(P, { x, z: z - 10, y: deck, w: 22, tiers: 5, tierH: 9.5, shrink: 0.84, neon: NEON.magenta, base: 4 });
    box({ x: x + 18, y: deck + 5, z: z + 22, sx: 22, sy: 10, sz: 14, kind: 6, seed: 0.41 });
    P.roofs.push({ x: x + 18, y: deck + 10, z: z + 22, sx: 15, sy: 4.6, sz: 11, neon: NEON.amber, tile: 0 });
    for (const [sx, sz, hh] of [[24, -14, 15], [-22, 24, 13], [30, 26, 12], [-26, -24, 14]]) P.sakura.push({ x: x + sx, y: deck, z: z + sz, h: hh });
  }
  // near the boardwalk on the left: a dark wooden gatehouse, one warm window, framing the edge of the view
  {
    const x = -46, z = 906;
    P.platforms.push({ side: -1, row: -1, x0: x - 16, x1: x + 16, z0: z + 16, z1: z - 16, seed: 0.5, hero: true });
    box({ x, y: deck / 2 - 3, z, sx: 32, sy: deck + 6, sz: 32, kind: 1, seed: 0.5 });
    box({ x, y: deck + 7, z, sx: 18, sy: 14, sz: 14, kind: 2, seed: 0.51 });
    P.roofs.push({ x, y: deck + 14, z, sx: 13, sy: 5, sz: 10.5, neon: [0.5, 0.12, 0.06], tile: 0 });
    P.sakura.push({ x: x - 14, y: deck, z: z + 6, h: 13 });
  }
  // cherry trees on the landing either side of the torii
  // (lit blue, strung with tiny lights, the way Osaka lights its cherry trees at night)
  for (const sx of [-1, 1]) for (const [dx, dz] of [[60, 2], [46, -18]]) P.sakura.push({ x: sx * dx, y: deck, z: LANDING.z1 + 20 + dz, h: 15, blue: true });
}

export function createHero(U, { water, camera }) {
  const group = new THREE.Group();
  const D = PIER.deck;

  // ---- the boardwalk and the landing: wet planks and wet stone that mirror the night -------------------------------
  // they sample the water's reflection (the scene mirrored about the sea), so they are kept out of that render
  // (layer 1) and the torii and the city shine in them
  const wetMat = (stone) => {
    const m = new THREE.MeshStandardNodeMaterial();
    const p = positionWorld;
    let base, seam, rough;
    if (stone) {
      const gx = p.x.div(3.2), gz = p.z.div(1.6);
      const row = floor(gz);
      const fx = fract(gx.add(row.mul(0.5)));
      seam = max(ssf(0.04, 0.0, fx), ssf(0.96, 1.0, fx)).add(max(ssf(0.06, 0.0, fract(gz)), ssf(0.94, 1.0, fract(gz)))).min(1.0);
      const tone = hash(floor(gx.add(row.mul(0.5))).add(row.mul(17.0)));
      base = vec3(0.045, 0.043, 0.05).mul(tone.mul(0.5).add(0.75));
      rough = float(0.5);
    } else {
      // planks run toward the gate, 0.3 m wide, ends staggered
      const px = p.x.div(0.3);
      const plank = floor(px);
      const fx = fract(px);
      const pz = p.z.div(4.2).add(hash(plank).mul(4.0));
      seam = max(max(ssf(0.07, 0.0, fx), ssf(0.93, 1.0, fx)), max(ssf(0.012, 0.0, fract(pz)), ssf(0.988, 1.0, fract(pz))));
      const tone = hash(plank.add(floor(pz).mul(31.0)));
      const grain = mx_noise_float(vec3(p.x.mul(9.0), p.z.mul(0.35), plank)).mul(0.5).add(0.5);
      base = vec3(0.07, 0.045, 0.035).mul(tone.mul(0.6).add(0.55)).mul(grain.mul(0.3).add(0.85));
      rough = float(0.42);
    }
    // puddles: most of the surface is wet; seams stay dark
    const puddle = smoothstep(0.32, 0.62, mx_noise_float(vec3(p.x.mul(0.09), p.z.mul(0.05), 3.0)).mul(0.5).add(0.5));
    const wet = puddle.mul(0.55).add(0.4).mul(float(1.0).sub(seam.mul(0.8)));
    const v = normalize(cameraPosition.sub(p));
    const fres = float(0.04).add(float(0.96).mul(pow(float(1.0).sub(clamp(v.y, 0.0, 1.0)), 5.0)));
    // a little wobble in the puddles so they read as water, not glass
    const wob = vec2(mx_noise_float(vec3(p.x.mul(0.8), p.z.mul(0.8), U.time.mul(0.5))), mx_noise_float(vec3(p.z.mul(0.8), p.x.mul(0.8), U.time.mul(0.5).add(4.0)))).mul(0.006);
    const refl = water.reflection.uv(screenUV.flipX().add(wob)).rgb;
    m.colorNode = base.mul(float(1.0).sub(wet.mul(0.45))).mul(float(1.0).sub(seam.mul(0.5)));
    m.emissiveNode = refl.mul(fres.mul(0.85).add(0.04)).mul(wet).mul(0.78);
    m.roughnessNode = mix(rough, float(0.32), wet);
    m.metalnessNode = float(0.0);
    return m;
  };
  {
    const len = PIER.z0 - PIER.z1;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(PIER.x1 - PIER.x0, 0.7, len), wetMat(false));
    pier.position.set(0, D - 0.35, (PIER.z0 + PIER.z1) / 2);
    const landing = new THREE.Mesh(new THREE.BoxGeometry(LANDING.x1 - LANDING.x0, 3.6, LANDING.z0 - LANDING.z1), wetMat(true));
    landing.position.set(0, D - 1.8, (LANDING.z0 + LANDING.z1) / 2);
    for (const o of [pier, landing]) {
      o.layers.set(1);
      group.add(o);
    }
    // steps down into the water at the far side of the landing
    const stepMat = new THREE.MeshStandardNodeMaterial({ color: 0x0c0b10, roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(40 - i * 2, 0.6, 2.2), stepMat);
      s.position.set(0, D - 0.9 - i * 0.7, LANDING.z1 - 1.1 - i * 2.2);
      group.add(s);
    }
    // pilings under the boardwalk
    const piles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.32, 6, 8), new THREE.MeshStandardNodeMaterial({ color: 0x0a0807, roughness: 0.8 }), 2 * Math.ceil(len / 6));
    let k = 0;
    for (let z = PIER.z1 + 3; z < PIER.z0; z += 6) for (const x of [PIER.x0 + 0.6, PIER.x1 - 0.6]) piles.setMatrixAt(k++, new THREE.Matrix4().makeTranslation(x, D - 3.6, z));
    piles.count = k;
    group.add(piles);
  }

  // ---- rails, posts and post lamps; a magenta neon line along the edges -------------------------------------------
  const lampPts = [];
  {
    const woodMat = new THREE.MeshStandardNodeMaterial({ color: 0x120b08, roughness: 0.55, metalness: 0.0 });
    const posts = [];
    for (const x of [PIER.x0 + 0.25, PIER.x1 - 0.25]) for (let z = PIER.z1 + 1; z <= PIER.z0; z += 3) posts.push([x, z]);
    const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 1.3, 0.24), woodMat, posts.length);
    posts.forEach(([x, z], i) => postMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, D + 0.65, z)));
    group.add(postMesh);
    const len = PIER.z0 - PIER.z1;
    for (const x of [PIER.x0 + 0.25, PIER.x1 - 0.25]) {
      for (const [y, t] of [[D + 1.24, 0.16], [D + 0.7, 0.08]]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, t, len), woodMat);
        rail.position.set(x, y, (PIER.z0 + PIER.z1) / 2);
        group.add(rail);
      }
    }
    // a square paper lamp on every fourth post
    const lamps = posts.filter((_, i) => i % 4 === 0);
    const lampMat = new THREE.MeshBasicNodeMaterial();
    const luv = uv();
    const frame = max(max(ssf(0.1, 0.0, luv.x), ssf(0.9, 1.0, luv.x)), max(ssf(0.08, 0.0, luv.y), ssf(0.92, 1.0, luv.y)));
    const bars = ssf(0.06, 0.0, abs(fract(luv.y.mul(3.0)).sub(0.5)).sub(0.44).max(0.0));
    lampMat.colorNode = mix(vec3(1.0, 0.48, 0.18).mul(mix(float(0.5), float(1.15), U.night)), vec3(0.06, 0.03, 0.02), frame);
    const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.56, 0.42), lampMat, lamps.length);
    lamps.forEach(([x, z], i) => {
      lampMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, D + 1.62, z));
      lampPts.push([x, D + 1.62, z, 2.4, 1.0, 0.42, 0.14]);
    });
    group.add(lampMesh);
    // the neon edge: magenta along both sides of the boardwalk and round the landing
    const neonMat = new THREE.MeshBasicNodeMaterial();
    neonMat.colorNode = vec3(1.0, 0.16, 0.62).mul(mix(float(0.5), float(2.6), U.night)).mul(sin(U.time.mul(0.8)).mul(0.06).add(0.94));
    const strips = [
      [PIER.x0, D - 0.55, (PIER.z0 + PIER.z1) / 2, 0.08, 0.1, len],
      [PIER.x1, D - 0.55, (PIER.z0 + PIER.z1) / 2, 0.08, 0.1, len],
      [0, D + 0.02, LANDING.z1 + 0.05, LANDING.x1 - LANDING.x0, 0.08, 0.1],
      [LANDING.x0, D + 0.02, (LANDING.z0 + LANDING.z1) / 2, 0.1, 0.08, LANDING.z0 - LANDING.z1],
      [LANDING.x1, D + 0.02, (LANDING.z0 + LANDING.z1) / 2, 0.1, 0.08, LANDING.z0 - LANDING.z1],
    ];
    for (const [x, y, z, sx, sy, sz] of strips) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), neonMat);
      s.position.set(x, y, z);
      group.add(s);
    }
  }
  // lamp glows, and glows at the torii's feet and along its top
  const toriiZ = PORT.channel.z0 + 90;
  const gp = [...lampPts];
  for (const sx of [-1, 1]) {
    gp.push([sx * 52, 4, toriiZ + 2, 14, 1.0, 0.22, 0.08]);
    gp.push([sx * 52, 38, toriiZ + 2, 9, 1.0, 0.18, 0.06]);
  }
  for (let i = -3; i <= 3; i++) gp.push([i * 18, 72.5, toriiZ + 2, 10, 1.0, 0.16, 0.06]);
  group.add(glowPoints(U, gp, { blink: false }));
  // light: the torii throws red on the landing; two warm lamps along the boardwalk
  const toriiLight = new THREE.PointLight(0xff3a1c, 2600, 170, 2);
  toriiLight.position.set(0, 14, toriiZ + 8);
  const warmA = new THREE.PointLight(0xffa060, 160, 46, 2);
  warmA.position.set(0, 5, 905);
  const warmB = new THREE.PointLight(0xffa060, 160, 46, 2);
  warmB.position.set(0, 5, 820);
  group.add(toriiLight, warmA, warmB);

  // ---- the projections: a bloom of jellyfish in light over the water on the left, a woman in light kneeling on the right ---
  const jellies = buildJellies(U, {
    jellies: [
      { x: -150, y: 132, z: 690, R: 17, L: 78, phase: 0.0, period: 3.6, hue: 0 },
      { x: -228, y: 92, z: 640, R: 8, L: 36, phase: 0.43, period: 3.1, hue: 0 },
      { x: -84, y: 168, z: 720, R: 6, L: 26, phase: 0.71, period: 2.8, hue: 0.65 },
      { x: -205, y: 186, z: 760, R: 6.5, L: 30, phase: 0.18, period: 3.3, hue: 0 },
      { x: -62, y: 150, z: 640, R: 5, L: 22, phase: 0.86, period: 2.9, hue: 0 },
      { x: -290, y: 150, z: 560, R: 9, L: 40, phase: 0.29, period: 3.4, hue: 0.4 },
      { x: -250, y: 230, z: 600, R: 5.5, L: 22, phase: 0.55, period: 2.7, hue: 0 },
    ],
  });
  group.add(jellies.group);
  const holo = buildHoloImage(U);
  holo.group.position.set(158, 4, 590);
  group.add(holo.group, holo.motes);

  // ---- 海月楼: after Chongqing's Hongyadong, pavilions stacked up the right bank, stepping back as they climb; gold light
  // along every eave and rail, rooms glowing warm behind their shoji, a few in our pinks; red signboards on its face ------
  {
    const Q = (yaw) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const WEST = -Math.PI / 2, SOUTH = 0;
    const mods = [
      { v: "two", x: 110, y: 4, z: 812, s: 1.5, q: Q(WEST), hue: 3, light: 0.92, seed: 0.11 },
      { v: "hall", x: 100, y: 4, z: 846, s: 1.15, q: Q(SOUTH), hue: 0, light: 0.85, seed: 0.23 },
      { v: "hall", x: 114, y: 46, z: 808, s: 1.35, q: Q(WEST), hue: 3, light: 0.9, seed: 0.31 },
      { v: "hall", x: 108, y: 38, z: 840, s: 1.0, q: Q(SOUTH), hue: 3, light: 0.88, seed: 0.37 },
      { v: "two", x: 118, y: 70, z: 812, s: 1.2, q: Q(WEST), hue: 3, light: 0.9, seed: 0.41 },
      { v: "hall", x: 120, y: 104, z: 808, s: 1.1, q: Q(WEST), hue: 0, light: 0.86, seed: 0.53 },
      { v: "two", x: 122, y: 124, z: 812, s: 1.0, q: Q(WEST), hue: 3, light: 0.9, seed: 0.61 },
      { v: "yagura", x: 124, y: 154, z: 810, s: 0.95, q: Q(WEST), hue: 3, light: 0.92, seed: 0.71 },
    ];
    const mat = pavilionMaterial(U, { gain: 0.62 }); // (near the eye: as rich as the castle, never brighter)
    group.add(instancePavilions(mods, mat, { detail: 1 }));
    // red signboards: light boxes with gold characters, the way Hongyadong hangs its names
    const board = (text, w, h, vertical) => {
      const c = document.createElement("canvas");
      c.width = vertical ? 200 : 200 * [...text].length + 80;
      c.height = vertical ? 200 * [...text].length + 80 : 220;
      const g = c.getContext("2d");
      const paint = () => {
        g.fillStyle = "#7a0710";
        g.fillRect(0, 0, c.width, c.height);
        const grd = g.createLinearGradient(0, 0, 0, c.height);
        grd.addColorStop(0, "rgba(255,60,50,0.55)");
        grd.addColorStop(1, "rgba(160,10,20,0.2)");
        g.fillStyle = grd;
        g.fillRect(0, 0, c.width, c.height);
        g.strokeStyle = "#ffcf6a";
        g.lineWidth = 10;
        g.shadowColor = "#ffb347";
        g.shadowBlur = 18;
        g.strokeRect(14, 14, c.width - 28, c.height - 28);
        g.font = '900 150px "Noto Sans JP", sans-serif';
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#ffe2a0";
        g.shadowBlur = 24;
        [...text].forEach((ch, i) => (vertical ? g.fillText(ch, c.width / 2, 140 + i * 200) : g.fillText(ch, 140 + i * 200, c.height / 2 + 6)));
      };
      paint();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      document.fonts?.ready.then(() => {
        paint();
        tex.needsUpdate = true;
      });
      const m = new THREE.MeshBasicNodeMaterial();
      m.colorNode = texture(tex, uv()).rgb.mul(mix(float(0.45), float(1.55), U.night));
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    };
    for (const [text, w, h, vert, x, y, z] of [
      ["海月楼", 9, 29, true, 109.2, 186, 810],
      ["夜市", 15, 7.6, false, 93.4, 58, 808],
      ["蟹港本店", 22, 6, false, 101.6, 116, 808],
    ]) {
      const b = board(text, w, h, vert);
      b.position.set(x, y, z);
      b.rotation.y = WEST;
      group.add(b);
    }
  }

  // ---- vertical neon ---------------------------------------------------------------------------------------------------
  const signs = [neonVertical(U, "未来の都市", "#ff3dbb", 6.2)];
  signs[0].position.set(84, 72, 838);
  signs[0].lookAt(TITLE_CAM.pos[0], 64, TITLE_CAM.pos[2]);
  for (const s of signs) group.add(s);

  // ---- the expressway: in from the sea on the right, along the channel, out over the second canal --------------------
  const highway = buildHighway(U, [
    [620, 44, 700], [330, 41, 668], [140, 38, 632], [52, 36, 560], [31, 36, 440], [30, 36, 120], [30, 36, -140], [52, 37, -228],
    [140, 38, -262], [420, 40, -262], [900, 42, -262],
  ]);
  group.add(highway.group);

  // ---- an arched bridge low across the channel -------------------------------------------------------------------------
  group.add(buildArchBridge(U, 450));

  group.traverse((o) => (o.frustumCulled = false));
  return {
    group,
    /** The home screen opens: the projections build in from points of light. */
    intro(time) {
      jellies.build(time);
      holo.build(time + 0.5);
    },
    lights: { toriiLight, warmA, warmB },
    solids: highway.solids,
    update(time, cam) {
      jellies.update(time);
      holo.update(time);
      if (cam) holo.group.rotation.y = Math.atan2(cam.position.x - holo.group.position.x, cam.position.z - holo.group.position.z);
      const night = U.night.value;
      toriiLight.intensity = 400 + 2200 * night;
      warmA.intensity = warmB.intensity = 14 + 46 * night;
    },
  };
}

/** A vertical neon sign: glowing tube glyphs, no box behind them. */
function neonVertical(U, text, color, glyphM) {
  const chars = [...text];
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 160 * chars.length + 40;
  const g = c.getContext("2d");
  const paint = () => {
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = '700 128px "Noto Sans JP", sans-serif';
    chars.forEach((ch, i) => {
      const y = 100 + i * 160;
      g.shadowColor = color;
      g.shadowBlur = 30;
      g.fillStyle = color;
      g.fillText(ch, 80, y);
      g.shadowBlur = 8;
      g.fillStyle = "rgba(255,240,250,0.95)";
      g.fillText(ch, 80, y);
    });
  };
  paint();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  document.fonts?.ready.then(() => {
    paint();
    tex.needsUpdate = true;
  });
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const flick = step(0.025, fract(U.time.mul(0.19).add(glyphM))).mul(0.3).add(0.7);
  m.colorNode = texture(tex, uv()).rgb.mul(1.8).mul(flick).mul(mix(float(0.35), float(1.0), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.5)));
  m.fog = false;
  const h = glyphM * chars.length * 1.25;
  return new THREE.Mesh(new THREE.PlaneGeometry((h * c.width) / c.height, h), m);
}

// ---------------------------------------------------------------------------------------------------------------------
// the expressway: a deck swept along a curve (kept level), neon down both edges, traffic as streaks of light, pillars
// ---------------------------------------------------------------------------------------------------------------------
function buildHighway(U, pts) {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "centripetal");
  const N = 260, W = 15, T = 2.2;
  const len = curve.getLength();
  const frames = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = curve.getPointAt(u);
    const tg = curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(tg, new THREE.Vector3(0, 1, 0)).normalize();
    frames.push({ p, side, u });
  }
  // the deck: top, bottom and both sides as one strip mesh
  const deck = new THREE.BufferGeometry();
  {
    const pos = [], uvs = [], idx = [];
    const ring = (f) => [
      f.p.clone().addScaledVector(f.side, -W / 2),
      f.p.clone().addScaledVector(f.side, W / 2),
      f.p.clone().addScaledVector(f.side, W / 2).add(new THREE.Vector3(0, -T, 0)),
      f.p.clone().addScaledVector(f.side, -W / 2).add(new THREE.Vector3(0, -T, 0)),
    ];
    frames.forEach((f) => {
      for (const v of ring(f)) {
        pos.push(v.x, v.y, v.z);
        uvs.push(f.u * len, 0);
      }
    });
    for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) {
      const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = a + 4, d = b + 4;
      idx.push(a, c, b, b, c, d);
    }
    deck.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    deck.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    deck.setIndex(idx);
    deck.computeVertexNormals();
  }
  const deckMat = new THREE.MeshStandardNodeMaterial({ color: 0x0d0c12, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(deck, deckMat));
  // neon edges and the traffic on top: thin ribbons
  const ribbon = (offset, width, y) => {
    const pos = [], uvs = [], idx = [];
    frames.forEach((f) => {
      for (const s of [-1, 1]) {
        const v = f.p.clone().addScaledVector(f.side, offset + (s * width) / 2).add(new THREE.Vector3(0, y, 0));
        pos.push(v.x, v.y, v.z);
        uvs.push(f.u * len, s < 0 ? 0 : 1);
      }
    });
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    return geo;
  };
  const neon = (col) => {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.colorNode = vec3(...col).mul(mix(float(0.8), float(3.6), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.45)));
    m.fog = false;
    return m;
  };
  const edgeL = new THREE.Mesh(ribbon(-W / 2, 0.6, 0.95), neon([0.25, 0.75, 1.0]));
  const edgeR = new THREE.Mesh(ribbon(W / 2, 0.6, 0.95), neon([1.0, 0.2, 0.7]));
  const under = new THREE.Mesh(ribbon(0, W * 0.9, -T - 0.05), neon([1.0, 0.16, 0.6]));
  under.material.colorNode = vec3(1.0, 0.16, 0.6).mul(smoothstep(0.0, 0.08, uv().y).mul(smoothstep(1.0, 0.92, uv().y))).mul(0.0).add(vec3(1.0, 0.16, 0.6).mul(step(abs(uv().y.sub(0.5)), 0.04)).mul(mix(float(0.5), float(2.0), U.night)));
  group.add(edgeL, edgeR, under);
  // traffic as a long exposure: warm white heads streaming one way, red tails the other, each car a pair of threads of
  // light drawn out a hundred metres, the way a night road photographs
  const trafficMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  {
    const u = uv();
    const lane = floor(u.y.mul(4.0));
    const dir = select(lane.lessThan(2.0), float(1.0), float(-1.0));
    const speed = mix(float(30.0), float(52.0), hash(lane.add(3.0)));
    const along = u.x.div(130.0).sub(U.time.mul(speed).div(130.0).mul(dir)).add(hash(lane).mul(9.0));
    const cell = floor(along);
    const f = select(dir.greaterThan(0.0), fract(along), float(1.0).sub(fract(along)));
    const on = step(0.28, hash(cell.add(lane.mul(57.0))));
    // a bright head and a long tail fading behind it
    const streak = smoothstep(0.0, 0.03, f).mul(pow(ssf(0.92, 0.04, f), 1.6)).mul(on);
    const fl = fract(u.y.mul(4.0));
    const pair = max(ssf(0.07, 0.0, abs(fl.sub(0.34))), ssf(0.07, 0.0, abs(fl.sub(0.66))));
    const haze = ssf(0.5, 0.1, abs(fl.sub(0.5))).mul(0.18);
    const col = select(dir.greaterThan(0.0), vec3(1.0, 0.86, 0.66), vec3(1.0, 0.1, 0.07));
    trafficMat.colorNode = col.mul(streak).mul(pair.mul(2.4).add(haze)).mul(mix(float(0.5), float(1.0), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.55)));
    trafficMat.fog = false;
  }
  group.add(new THREE.Mesh(ribbon(0, W * 0.86, 0.12), trafficMat));
  // pillars down into the water: under the deck's outer edge where it runs along the channel, so they stand by the bank
  // and leave the lanes open; under its middle out over the open sea
  const pil = [];
  for (let d = 30; d < len - 10; d += 46) {
    const p = curve.getPointAt(d / len);
    if (Math.abs(p.x) < 80) {
      const tg = curve.getTangentAt(d / len);
      const side = new THREE.Vector3().crossVectors(tg, new THREE.Vector3(0, 1, 0)).normalize();
      p.addScaledVector(side, W / 2 - 1.8);
    }
    pil.push(p);
  }
  const pilMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 1, 3.2), deckMat, pil.length);
  pil.forEach((p, i) => pilMesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, (p.y - T) / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, p.y - T, 1))));
  group.add(pilMesh);
  return { group, solids: pil.map((p) => ({ x0: p.x - 2.6, x1: p.x + 2.6, z0: p.z - 2.6, z1: p.z + 2.6 })) };
}

/** A stone arched bridge across the channel with lamps on its balustrade and a magenta line under the arch. */
function buildArchBridge(U, z) {
  const group = new THREE.Group();
  const half = PORT.channel.halfW + 6;
  const N = 48;
  const yAt = (x) => 5 + 10 * Math.cos((x / half) * (Math.PI / 2));
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const x = -half + (2 * half * i) / N;
    const y = yAt(x);
    for (const [dz, dy] of [[-4, 0], [4, 0], [4, -1.6], [-4, -1.6]]) pos.push(x, y + dy, z + dz);
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = a + 4, d = b + 4;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const stone = new THREE.MeshStandardNodeMaterial({ color: 0x17141c, roughness: 0.75, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(geo, stone));
  // lamps on the balustrade
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const x = -half + (2 * half * i) / 8;
    for (const dz of [-3.8, 3.8]) pts.push([x, yAt(x) + 1.6, z + dz, 1.6, 1.0, 0.62, 0.3]);
  }
  group.add(glowPoints(U, pts, { blink: false, gain: 1.1 }));
  // the magenta line under the arch
  const lp = [];
  for (let i = 0; i <= N; i++) {
    const x = -half + (2 * half * i) / N;
    lp.push(new THREE.Vector3(x, yAt(x) - 1.7, z + 4.05));
  }
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lp), 96, 0.12, 6, false);
  const nm = new THREE.MeshBasicNodeMaterial();
  nm.colorNode = vec3(1.0, 0.16, 0.6).mul(mix(float(0.5), float(2.4), U.night));
  group.add(new THREE.Mesh(tube, nm));
  return group;
}

void cos;
void min;
void cross;
void normalGeometry;
void positionGeometry;
void instancedBufferAttribute;
void landmarkFog;
