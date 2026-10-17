// Kraken Port's old town, Japanese cyberpunk: multi-tier pagodas with upturned eaves traced in neon, a castle keep
// (white plaster, dark roofs, gold trim) on a podium of towers, pagoda crowns on skyscrapers, a giant torii standing
// in the water at the harbour mouth, and holographic cherry trees whose petals drift through the canyon.
// Geometry is pushed into the port's plan (boxes, cylinders, beacons) plus roofs and trees drawn here.
import * as THREE from "three";
import {
  vec2, vec3, vec4, float, mix, step, smoothstep, abs, fract, floor, hash as rawHash, length, max, pow, sin, cos, uv, attribute,
  positionGeometry, instancedBufferAttribute, instanceIndex, cameraPosition, normalize, cross, mx_noise_float, dot,
  normalView, positionViewDirection, clamp, select, atan2, texture, frontFacing,
} from "three/tsl";
import { hashF } from "./fx.js";
/** TSL's hash truncates to a u32, so negative inputs all hash to the same value: shift them positive first. */
const hash = (x) => hashF(float(x).add(1048576.0));

import { PORT, rng, ss } from "./port.js";

export const NEON = {
  magenta: [1.0, 0.16, 0.62],
  cyan: [0.2, 0.92, 1.0],
  teal: [0.2, 1.0, 0.72],
  violet: [0.62, 0.32, 1.0],
  amber: [1.0, 0.62, 0.12],
  red: [1.0, 0.12, 0.1],
  gold: [1.0, 0.78, 0.3],
};
const NEON_LIST = [NEON.magenta, NEON.cyan, NEON.teal, NEON.violet, NEON.magenta, NEON.cyan];

// ---- layout helpers: they push into the port's plan ---------------------------------------------------------------

/** A pagoda: `tiers` bodies stepping in, each under a wide roof with upturned corners; a spire on top. */
export function pagoda(P, { x, z, y = PORT.deck, w, tiers = 5, tierH = 9, shrink = 0.86, style = "pagoda", neon = NEON.magenta, ry = 0, spire = true, base = 0 }) {
  let cy = y, cw = w;
  if (base > 0) {
    // a battered stone base
    P.boxes.push({ x, y: cy + base / 2, z, sx: cw * 1.12, sy: base, sz: cw * 1.12, ry, kind: 8, seed: 0.4 });
    cy += base;
  }
  for (let t = 0; t < tiers; t++) {
    const h = t === 0 ? tierH * 1.25 : tierH;
    const kind = style === "castle" ? 7 : 6;
    P.boxes.push({ x, y: cy + h / 2, z, sx: cw, sy: h, sz: cw, ry, kind, seed: (x * 0.013 + z * 0.007 + t * 0.1) % 1, density: 0.55, tone: t / tiers });
    cy += h;
    // a balcony rail traced in light round the tier, under the roof
    if (style === "pagoda" && t > 0) P.rails.push({ x, y: cy - h + 1.0, z, w: cw + 1.6, ry, color: neon });
    const over = cw * (style === "castle" ? 0.3 : 0.42);
    const rh = cw * (style === "castle" ? 0.26 : 0.3);
    P.roofs.push({ x, y: cy - 0.2, z, sx: (cw + over * 2) / 2, sy: rh, sz: (cw + over * 2) / 2, ry, neon: style === "castle" ? NEON.gold : neon, tile: style === "castle" ? 1 : 0 });
    cy += rh * 0.55;
    cw *= shrink;
  }
  if (spire) {
    P.cyls.push({ x, y: cy + cw * 0.9, z, r: Math.max(0.35, cw * 0.05), h: cw * 1.8, kind: 2, seed: 0.1 });
    for (let k = 0; k < 5; k++) P.cyls.push({ x, y: cy + cw * (0.3 + k * 0.22), z, r: Math.max(0.6, cw * 0.11) * (1 - k * 0.1), h: 0.5, kind: 1, seed: 0.2 });
    P.beacons.push({ x, y: cy + cw * 1.85, z, size: 2.2, color: neon, blink: -1 });
  }
  return cy;
}

/** A torii standing in the water: two pillars, the curved top beam and the tie beam, lit along the top. */
export function torii(P, { x, z, width, height, ry = 0 }) {
  const r = width * 0.035;
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (dx) => [x + c * dx, z - s * dx];
  for (const side of [-1, 1]) {
    const [px, pz] = at((side * width) / 2);
    P.cyls.push({ x: px, y: height / 2 - 2, z: pz, r, h: height + 4, kind: 4, seed: 0.3 });
    P.cyls.push({ x: px, y: 1.2, z: pz, r: r * 1.35, h: 3.2, kind: 2, seed: 0.3 }); // the black foot
  }
  P.boxes.push({ x, y: height * 0.78, z, sx: width * 1.08, sy: height * 0.06, sz: r * 2.2, ry, kind: 9, seed: 0.2 }); // nuki
  P.roofs.push({ x, y: height + height * 0.02, z, sx: width * 0.66, sy: height * 0.05, sz: r * 1.9, ry, neon: NEON.red, tile: 2 }); // kasagi, upswept
  P.boxes.push({ x, y: height * 0.97, z, sx: width * 1.02, sy: height * 0.05, sz: r * 2.4, ry, kind: 9, seed: 0.2 }); // shimaki
  // the plaque between the beams
  P.boxes.push({ x, y: height * 0.875, z, sx: width * 0.07, sy: height * 0.11, sz: r * 2.6, ry, kind: 9, seed: 0.1 });
}

// ---- roofs: one unit roof, instanced -----------------------------------------------------------------------------
/** A hip roof on [-1,1]^2, ridge height 1: concave slopes, corners curling up, a fascia band round the eave. */
export function roofGeometry(n = 40) {
  const pos = [], part = [], idx = [];
  const lift = (u, v) => {
    const du = 1 - Math.abs(u), dv = 1 - Math.abs(v);
    const d = Math.min(du, dv);
    const t = Math.min(1, d / 0.92);
    let y = Math.pow(t, 1.75);
    // corners curl up, more the closer to the corner, and the eave edges sweep up toward the corners
    const corner = Math.pow(Math.max(0, 1 - Math.hypot(du, dv) / 0.55), 2);
    const edge = Math.pow(Math.max(Math.abs(u), Math.abs(v)), 6) * 0.12 * (1 - t);
    y += corner * 0.42 + edge;
    return y;
  };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const u = (i / n) * 2 - 1, v = (j / n) * 2 - 1;
    pos.push(u, lift(u, v), v);
    part.push(0, Math.min(1 - Math.abs(u), 1 - Math.abs(v)));
  }
  const row = n + 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // fascia: walk the boundary and drop a band below it
  const ring = [];
  for (let i = 0; i < n; i++) ring.push([i, 0]);
  for (let j = 0; j < n; j++) ring.push([n, j]);
  for (let i = n; i > 0; i--) ring.push([i, n]);
  for (let j = n; j > 0; j--) ring.push([0, j]);
  const base = pos.length / 3;
  for (const [i, j] of ring) {
    const u = (i / n) * 2 - 1, v = (j / n) * 2 - 1;
    const y = lift(u, v);
    pos.push(u, y, v, u * 0.985, y - 0.09, v * 0.985);
    part.push(1, 0, 1, 1);
  }
  for (let k = 0; k < ring.length; k++) {
    const a = base + k * 2, b = base + ((k + 1) % ring.length) * 2;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // a soffit underneath so roofs read from below
  const sb = pos.length / 3;
  for (const [i, j] of ring) {
    const u = (i / n) * 2 - 1, v = (j / n) * 2 - 1;
    pos.push(u * 0.985, lift(u, v) - 0.09, v * 0.985);
    part.push(2, 0);
  }
  const centre = pos.length / 3;
  pos.push(0, 0.12, 0);
  part.push(2, 1);
  for (let k = 0; k < ring.length; k++) idx.push(centre, sb + ((k + 1) % ring.length), sb + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildRoofs(U, roofs) {
  if (!roofs.length) return new THREE.Group();
  const mesh = new THREE.InstancedMesh(roofGeometry(), null, roofs.length);
  const neon = new Float32Array(roofs.length * 4);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  roofs.forEach((r, i) => {
    neon.set([...r.neon, r.tile], i * 4);
    m4.compose(new THREE.Vector3(r.x, r.y, r.z), q.setFromEuler(e.set(0, r.ry ?? 0, 0)), new THREE.Vector3(r.sx, r.sy, r.sz));
    mesh.setMatrixAt(i, m4);
  });
  const N = instancedBufferAttribute(new THREE.InstancedBufferAttribute(neon, 4), "vec4");
  const part = attribute("aPart", "vec2");
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
  const pg = positionGeometry;
  const tileKind = N.w;
  // tile courses running down the slope, ridges between rows of tiles
  const along = max(abs(pg.x), abs(pg.z));
  const courses = smoothstep(0.35, 0.5, abs(fract(along.mul(28.0)).sub(0.5)));
  const ribs = smoothstep(0.42, 0.5, abs(fract(mix(pg.x, pg.z, step(abs(pg.x), abs(pg.z))).mul(36.0)).sub(0.5)));
  const tileDark = vec3(0.05, 0.06, 0.075).mul(float(1.0).sub(courses.mul(0.35)).sub(ribs.mul(0.25)));
  const castleTile = vec3(0.07, 0.075, 0.085).mul(float(1.0).sub(courses.mul(0.3)));
  const vermilion = vec3(0.62, 0.08, 0.04);
  const roofC = select(tileKind.lessThan(0.5), tileDark, select(tileKind.lessThan(1.5), castleTile, vermilion));
  // trim: a gold or copper edge on the last course before the eave
  const nearEave = smoothstep(0.06, 0.0, part.y).mul(step(part.x, 0.5));
  const trimC = select(tileKind.lessThan(0.5), vec3(0.32, 0.22, 0.1), vec3(0.75, 0.55, 0.18));
  const isFascia = step(0.5, part.x).mul(step(part.x, 1.5));
  const isSoffit = step(1.5, part.x);
  let col = mix(roofC, trimC, nearEave.mul(0.8));
  col = mix(col, vec3(0.04, 0.035, 0.03), isFascia);
  col = mix(col, vec3(0.09, 0.05, 0.04), isSoffit);
  m.colorNode = col;
  // the neon: the fascia is a tube of light, the ridge glows faintly, soffits catch the glow
  const pulse = sin(U.time.mul(1.4).add(float(instanceIndex).mul(0.7))).mul(0.12).add(0.88);
  const neonC = N.xyz.mul(pulse);
  const castle = step(0.5, tileKind).mul(step(tileKind, 1.5));
  // the tube runs along the lower lip of the fascia only
  const lip = isFascia.mul(smoothstep(0.35, 0.85, float(1.0).sub(fract(positionGeometry.y.mul(0.0).add(1.0)))));
  const tube = isFascia.mul(mix(float(1.7), float(0.45), castle));
  const ridge = smoothstep(0.95, 1.0, part.y).mul(step(part.x, 0.5)).mul(mix(float(0.3), float(0.0), castle));
  const soffitGlow = isSoffit.mul(smoothstep(0.25, 0.0, part.y)).mul(0.05);
  m.emissiveNode = neonC.mul(tube.add(ridge).add(soffitGlow)).mul(U.lamps).mul(mix(float(0.3), float(1.0), U.night));
  void lip;
  m.roughnessNode = mix(float(0.45), float(0.7), isSoffit);
  m.metalnessNode = mix(float(0.15), float(0.6), nearEave);
  mesh.material = m;
  mesh.frustumCulled = false;
  return mesh;
}

/** Balcony rails as thin lines of light round a tier. */
export function buildRails(U, rails) {
  const group = new THREE.Group();
  if (!rails.length) return group;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), null, rails.length * 4);
  const col = new Float32Array(rails.length * 4 * 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let k = 0;
  for (const r of rails) {
    for (let side = 0; side < 4; side++) {
      const a = (r.ry ?? 0) + (side * Math.PI) / 2;
      const ox = Math.sin(a) * r.w * 0.5, oz = Math.cos(a) * r.w * 0.5;
      m4.compose(new THREE.Vector3(r.x + ox, r.y, r.z + oz), q.setFromEuler(e.set(0, a, 0)), new THREE.Vector3(r.w, 0.14, 0.14));
      mesh.setMatrixAt(k, m4);
      col.set(r.color, k * 3);
      k++;
    }
  }
  const C = instancedBufferAttribute(new THREE.InstancedBufferAttribute(col, 3), "vec3");
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = C.mul(U.lamps).mul(mix(float(0.5), float(1.6), U.night));
  mesh.material = m;
  mesh.frustumCulled = false;
  group.add(mesh);
  return group;
}

// ---- holographic cherry trees and their petals ------------------------------------------------------------------
// A projected tree: a dark trunk with a few branches, and a canopy made of blossoms of light (small sprites packed
// in clumps), twinkling, pinker at the edges, with the odd white one.
export function buildSakura(U, trees) {
  const group = new THREE.Group();
  if (!trees.length) return group;
  const r = rng(5);
  // trunk and branches
  const limbs = [];
  for (const t of trees) {
    limbs.push({ x: t.x, y: t.y + t.h * 0.28, z: t.z, h: t.h * 0.56, rad: t.h * 0.035, rx: 0, rz: 0 });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + r();
      const tilt = 0.6 + r() * 0.35;
      limbs.push({ x: t.x + Math.cos(a) * t.h * 0.12, y: t.y + t.h * 0.62, z: t.z + Math.sin(a) * t.h * 0.12, h: t.h * 0.34, rad: t.h * 0.016, rx: Math.sin(a) * tilt, rz: -Math.cos(a) * tilt });
    }
  }
  const limbMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 1, 1, 6), new THREE.MeshStandardNodeMaterial({ color: 0x1c1216, roughness: 0.85 }), limbs.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  limbs.forEach((l, i) => limbMesh.setMatrixAt(i, m4.compose(new THREE.Vector3(l.x, l.y, l.z), q.setFromEuler(e.set(l.rx, 0, l.rz)), new THREE.Vector3(l.rad, l.h, l.rad))));
  limbMesh.frustumCulled = false;
  group.add(limbMesh);
  // blossoms
  const PER = 420;
  const pos = new Float32Array(trees.length * PER * 4);
  let k = 0;
  for (const t of trees) {
    const clumps = Array.from({ length: 9 }, () => {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * t.h * 0.42;
      return [t.x + Math.cos(a) * d, t.y + t.h * (0.66 + r() * 0.28) - d * 0.25, t.z + Math.sin(a) * d, t.h * (0.12 + r() * 0.1)];
    });
    for (let i = 0; i < PER; i++) {
      const c = clumps[i % clumps.length];
      const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = Math.cbrt(r()) * c[3];
      const s = Math.sqrt(1 - u * u);
      pos.set([c[0] + Math.cos(th) * s * rad, c[1] + u * rad * 0.7, c[2] + Math.sin(th) * s * rad, r() + (t.blue ? 2 : 0)], 4 * k++);
    }
  }
  const P0 = instancedBufferAttribute(new THREE.InstancedBufferAttribute(pos, 4), "vec4");
  // (w carries a blossom's random number, plus 2 on the trees lit blue)
  const blue = step(1.5, P0.w);
  const P = vec4(P0.xyz, fract(P0.w));
  const sway = vec3(sin(U.time.mul(0.8).add(P.w.mul(6.0))).mul(0.15), 0.0, cos(U.time.mul(0.7).add(P.w.mul(5.0))).mul(0.15));
  const centre = P.xyz.add(sway);
  const toCam = normalize(cameraPosition.sub(centre));
  const right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  const up = cross(toCam, right);
  const dist = length(cameraPosition.sub(centre));
  // on the blue trees some blossoms are the little lights strung through the branches: smaller and bright
  const led = blue.mul(step(0.62, P.w));
  const size = max(float(0.32), dist.mul(0.0019)).mul(P.w.mul(0.6).add(0.6)).mul(mix(float(1.0), float(0.45), led));
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.positionNode = centre.add(right.mul(positionGeometry.x.mul(size))).add(up.mul(positionGeometry.y.mul(size)));
  const q2 = uv().sub(0.5).mul(2.0);
  // a five-lobed blossom: brighter rim lobes round a white heart
  const ang = atan2(q2.y, q2.x);
  const lobes = cos(ang.mul(5.0)).mul(0.18).add(0.82);
  const rr2 = length(q2);
  const flower = smoothstep(lobes, lobes.mul(0.55), rr2);
  const heart = smoothstep(0.3, 0.0, rr2);
  const twinkle = sin(U.time.mul(mix(float(0.8), float(2.4), P.w)).add(P.w.mul(40.0))).mul(0.25).add(0.75);
  const white = step(0.93, P.w);
  const pink = mix(vec3(1.0, 0.38, 0.68), vec3(1.0, 0.85, 0.92), white);
  const lavender = vec3(0.62, 0.66, 1.0);
  const petals = mix(pink, lavender, blue.mul(0.85));
  const ledGlow = vec3(0.45, 0.68, 1.0).mul(smoothstep(0.9, 0.0, rr2)).mul(sin(U.time.mul(mix(float(2.0), float(6.0), P.w)).add(P.w.mul(70.0))).mul(0.45).add(0.75)).mul(3.2);
  const flowerCol = petals.mul(flower).add(vec3(1.0, 0.9, 0.95).mul(heart).mul(0.6)).mul(twinkle).mul(0.55);
  m.colorNode = mix(flowerCol, ledGlow, led).mul(mix(float(0.45), float(1.0), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.75)));
  const blossoms = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, trees.length * PER);
  blossoms.frustumCulled = false;
  blossoms.renderOrder = 6;
  group.add(blossoms);
  return group;
}

/** Petals: glowing pink flakes that fall from the trees, flutter, drift with the wind and fade out. */
export function buildPetals(U, trees, perTree = 140) {
  const group = new THREE.Group();
  if (!trees.length) return group;
  const count = trees.length * perTree;
  const src = new Float32Array(count * 4);
  const r = rng(8);
  let k = 0;
  for (const t of trees) for (let i = 0; i < perTree; i++) src.set([t.x + (r() - 0.5) * t.h * 0.7, t.y + t.h * (0.6 + r() * 0.3), t.z + (r() - 0.5) * t.h * 0.7, r()], 4 * k++);
  const S = instancedBufferAttribute(new THREE.InstancedBufferAttribute(src, 4), "vec4");
  const life = fract(U.time.mul(0.045).add(S.w));
  const fall = life.mul(36.0);
  const wind = vec3(life.mul(28.0), 0.0, life.mul(-10.0));
  const flutter = vec3(sin(U.time.mul(2.3).add(S.w.mul(40.0))).mul(1.4), 0.0, cos(U.time.mul(1.7).add(S.w.mul(31.0))).mul(1.4));
  const centre = S.xyz.sub(vec3(0.0, fall, 0.0)).add(wind).add(flutter);
  const toCam = normalize(cameraPosition.sub(centre));
  const right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  const up = cross(toCam, right);
  const dist = length(cameraPosition.sub(centre));
  const size = max(float(0.22), dist.mul(0.0016));
  // the flake tumbles: squash it on one axis over time
  const tumble = abs(sin(U.time.mul(3.0).add(S.w.mul(17.0)))).mul(0.8).add(0.2);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.positionNode = centre.add(right.mul(positionGeometry.x.mul(size))).add(up.mul(positionGeometry.y.mul(size.mul(tumble))));
  const q = uv().sub(0.5).mul(2.0);
  const petal = smoothstep(1.0, 0.35, length(q.mul(vec2(1.0, 1.35))));
  const fade = smoothstep(0.0, 0.08, life).mul(smoothstep(1.0, 0.75, life)).mul(ss(320.0, 120.0, dist));
  m.colorNode = vec3(1.0, 0.45, 0.75).mul(petal).mul(fade).mul(mix(float(0.55), float(1.3), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.7)));
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  group.add(mesh);
  return group;
}

void clamp;
void hash;
void floor;
void NEON_LIST;
void vec2;

// ---- light-box signs: the stacked backlit signs of a Shinjuku street, jutting out to face up and down the canal ----
// Each sign is one cell of an atlas; vertical ones in one atlas, horizontal fascia signs in another. Colour pairs are
// the ones real Japanese street signs use: red on white, white on red, black on yellow, white on blue, and so on.
const V_SIGNS = [
  ["居酒屋", "#f4efe4", "#c8141e"], ["ラーメン", "#c8141e", "#fff4d0"], ["カラオケ", "#ff2a8a", "#ffffff"], ["寿司", "#f5c400", "#111111"],
  ["焼肉", "#111111", "#f5c400"], ["薬局", "#0f5f3a", "#ffffff"], ["漫画喫茶", "#003a8a", "#ffffff"], ["夜市", "#2a0a4a", "#ff79c6"],
  ["港", "#08080c", "#3fe3e8"], ["土星", "#f4efe4", "#111111"], ["ホテル", "#7a0e5a", "#ffd6f2"], ["銭湯", "#0a4a6a", "#ffffff"],
  ["占い", "#4a1a8a", "#ffe14a"], ["ゲーム", "#111111", "#00ffd0"], ["酒", "#c8141e", "#ffffff"], ["喫茶", "#6a3a14", "#fff0d8"],
];
const H_SIGNS = [
  ["クラーケン港", "#08080c", "#ff4fa8"], ["営業中", "#0f5f3a", "#ffffff"], ["24時間営業", "#f5c400", "#111111"], ["ようこそ", "#f4efe4", "#c8141e"],
  ["深海ツアー", "#062a33", "#7ff7ff"], ["ハルシオン航空", "#111111", "#f0a900"], ["ネオン港", "#2a0a4a", "#ff79c6"], ["土星ホテル", "#7a0e5a", "#ffffff"],
  ["かに港 本店", "#b8121c", "#fff2e0"],
];
function atlas(list, cw, ch, vertical) {
  const c = document.createElement("canvas");
  c.width = cw * list.length;
  c.height = ch;
  const g = c.getContext("2d");
  const paint = () => {
    list.forEach(([text, bg, fg], i) => {
      const x = i * cw;
      g.fillStyle = bg;
      g.fillRect(x, 0, cw, ch);
      // the frame of the box, and a thin inner rule in the text colour
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(x, 0, cw, 6);
      g.fillRect(x, ch - 6, cw, 6);
      g.strokeStyle = fg;
      g.globalAlpha = 0.6;
      g.lineWidth = 3;
      g.strokeRect(x + 10, 10, cw - 20, ch - 20);
      g.globalAlpha = 1;
      g.fillStyle = fg;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const chars = [...text];
      if (vertical) {
        const size = Math.min(cw * 0.7, (ch - 40) / chars.length / 1.05);
        g.font = `900 ${size}px "Noto Sans JP", sans-serif`;
        chars.forEach((ch2, k) => g.fillText(ch2, x + cw / 2, ch / 2 + (k - (chars.length - 1) / 2) * size * 1.05));
      } else {
        const size = Math.min(ch * 0.62, ((cw - 40) / chars.length) * 1.0);
        g.font = `900 ${size}px "Noto Sans JP", sans-serif`;
        g.fillText(text, x + cw / 2, ch / 2 + 2);
      }
    });
  };
  paint();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  document.fonts?.ready.then(() => {
    paint();
    tex.needsUpdate = true;
  });
  return tex;
}

/**
 * signs: [{ x, y, z, w, h, orient: "blade" | "flat", vertical: bool, sign, face }]
 * blade: a plane in x-y (it juts from the facade and faces along the channel); flat: a plane in y-z on the facade.
 */
export function buildSignBoxes(U, signs) {
  const group = new THREE.Group();
  for (const vertical of [true, false]) {
    const list = signs.filter((s) => s.vertical === vertical);
    if (!list.length) continue;
    const names = vertical ? V_SIGNS : H_SIGNS;
    const tex = atlas(names, vertical ? 128 : 512, vertical ? 512 : 128, vertical);
    const pos = new Float32Array(list.length * 4), dim = new Float32Array(list.length * 4);
    list.forEach((s, i) => {
      pos.set([s.x, s.y, s.z, s.orient === "blade" ? 1 : 0], i * 4);
      dim.set([s.w, s.h, s.sign % names.length, ((s.sign * 7) % 97) / 97], i * 4);
    });
    const P = instancedBufferAttribute(new THREE.InstancedBufferAttribute(pos, 4), "vec4");
    const D = instancedBufferAttribute(new THREE.InstancedBufferAttribute(dim, 4), "vec4");
    const pg = positionGeometry;
    const blade = P.w;
    const off = mix(vec3(0.0, pg.y.mul(D.y), pg.x.mul(D.x)), vec3(pg.x.mul(D.x), pg.y.mul(D.y), 0.0), blade);
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.positionNode = P.xyz.add(off);
    // read correctly from either side
    const u = uv().x;
    const su = select(frontFacing, u, float(1.0).sub(u)).add(D.z).div(names.length);
    const tx = texture(tex, vec2(su, uv().y));
    // a few signs buzz: a quick dropout now and then
    const buzz = step(0.86, D.w).mul(step(0.92, fract(U.time.mul(1.7).add(D.w.mul(13.0))))).mul(0.6);
    const lit = float(1.0).sub(buzz);
    m.colorNode = tx.rgb.mul(mix(float(0.62), lit.mul(1.2), U.night));
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, list.length);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}
