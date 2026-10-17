// The endless city round the harbour. Kraken Port's lattice (world.js) repeats without end: channels every 1100 m,
// cross canals every 480 m. Every plot between them carries a pontoon and a tower, and nothing about them is stored:
// a fixed set of instances is laid round the camera, each works out which plot it stands on from the camera's own
// position, and the plot's coordinates hash to its height, its footprint, its colour and its signs. Walk any distance
// and the same street is always there. The hand-built home district (the Grand Channel, the castle) is left alone, and
// south of the shore lies the open sea. districtBlocked() answers the same question on the CPU for the shuttle.
import * as THREE from "three";
import {
  vec2, vec3, float, mix, step, smoothstep, abs, fract, floor, sin, max, min, pow, clamp, fwidth, varying,
  positionGeometry, normalGeometry, cameraPosition, instanceIndex, hash as rawHash, select,
} from "three/tsl";
import { WORLD } from "./world.js";
import { hashF } from "./fx.js";

const hash = (x) => hashF(float(x).add(1048576.0));
const aaLine = (d, hw) => {
  const fw = clamp(fwidth(d), 1e-5, 1e4);
  const w = max(float(hw), fw.mul(0.8));
  return float(1).sub(smoothstep(w.sub(fw.mul(0.5)), w.add(fw.mul(0.5)), d)).mul(float(hw).div(w));
};
const gridD = (x, p) => abs(fract(x.div(p).add(0.5)).sub(0.5)).mul(p);

// plots: ten to a channel span, five to a cross-canal span, so canals always fall on plot edges
export const PLOT = { X: WORLD.CH / 10, Z: WORLD.CR / 5, Z0: WORLD.Z0, WALK: 9, NX: 61, NZ: 71 };
// the hand-built home district, and the shore line beyond which there is only sea
export const HOME = { X: 780, Z: -1560, SHORE: 690 };

/** The land of plot (px, pz): its rectangle less the canals and their walkways, or null if it is water. */
export function plotLand(px, pz) {
  const cxp = (px + 0.5) * PLOT.X, czp = PLOT.Z0 + (pz + 0.5) * PLOT.Z;
  if (czp > HOME.SHORE) return null;
  if (Math.abs(cxp) < HOME.X && czp > HOME.Z) return null;
  const kx = ((px % 10) + 10) % 10, kz = ((pz % 5) + 5) % 5;
  let x0 = px * PLOT.X, x1 = x0 + PLOT.X, z0 = PLOT.Z0 + pz * PLOT.Z, z1 = z0 + PLOT.Z;
  if (kx === 0) x0 += WORLD.CHW + PLOT.WALK;
  if (kx === 9) x1 -= WORLD.CHW + PLOT.WALK;
  if (kz === 0) z0 += WORLD.CRW + PLOT.WALK;
  if (kz === 4) z1 -= WORLD.CRW + PLOT.WALK;
  return { x0, x1, z0, z1 };
}

/** Is (x, z) on a district pontoon? (the shuttle keeps to the canals) */
export function districtBlocked(x, z) {
  const land = plotLand(Math.floor(x / PLOT.X), Math.floor((z - PLOT.Z0) / PLOT.Z));
  return Boolean(land && x > land.x0 - 1 && x < land.x1 + 1 && z > land.z0 - 1 && z < land.z1 + 1);
}

export function createDistricts(U) {
  const group = new THREE.Group();
  const N = PLOT.NX * PLOT.NZ;

  // ---- where each instance stands: its plot, the plot's land, and what grows on it --------------------------------
  const plot = () => {
    const i = float(instanceIndex);
    const ox = i.mod(PLOT.NX).sub((PLOT.NX - 1) / 2);
    const oz = floor(i.div(PLOT.NX)).sub((PLOT.NZ - 1) / 2);
    const px = floor(cameraPosition.x.div(PLOT.X)).add(ox);
    const pz = floor(cameraPosition.z.sub(PLOT.Z0).div(PLOT.Z)).add(oz);
    const kx = px.sub(floor(px.div(10.0)).mul(10.0));
    const kz = pz.sub(floor(pz.div(5.0)).mul(5.0));
    const x0 = px.mul(PLOT.X).add(step(kx, 0.5).mul(WORLD.CHW + PLOT.WALK));
    const x1 = px.add(1.0).mul(PLOT.X).sub(step(8.5, kx).mul(WORLD.CHW + PLOT.WALK));
    const z0 = pz.mul(PLOT.Z).add(PLOT.Z0).add(step(kz, 0.5).mul(WORLD.CRW + PLOT.WALK));
    const z1 = pz.add(1.0).mul(PLOT.Z).add(PLOT.Z0).sub(step(3.5, kz).mul(WORLD.CRW + PLOT.WALK));
    const cz = pz.add(0.5).mul(PLOT.Z).add(PLOT.Z0);
    const cx = px.add(0.5).mul(PLOT.X);
    const home = step(abs(cx), HOME.X).mul(step(HOME.Z, cz));
    const valid = step(cz, HOME.SHORE).mul(float(1.0).sub(home));
    // the plot's key: a positive integer below 2^24 (exact in a float; TSL's hash truncates negatives to one value),
    // wrapping every 4096 plots, about 400 km; then a chain of hashes for independent draws
    const wx = px.sub(floor(px.div(4096.0)).mul(4096.0)), wz = pz.sub(floor(pz.div(4096.0)).mul(4096.0));
    const seed = hashF(wx.mul(4096.0).add(wz));
    const next = (h) => hashF(h.mul(16777215.0));
    const h1 = next(seed), h2 = next(h1), h3 = next(h2), h4 = next(h3);
    return { x0, x1, z0, z1, valid, seed, h1, h2, h3, h4, px, pz };
  };

  const dev = new URLSearchParams(location.search);
  // ---- pontoons: the land itself, dark decks with a lit edge ----------------------------------------------------------
  if (!dev.has("nopontoon")) {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.2 });
    const P = plot();
    const size = vec3(P.x1.sub(P.x0), 8.0, P.z1.sub(P.z0));
    const centre = vec3(P.x0.add(P.x1).mul(0.5), 0.0, P.z0.add(P.z1).mul(0.5));
    m.positionNode = select(P.valid.greaterThan(0.5), centre.add(positionGeometry.mul(size)), vec3(centre.x, -600.0, centre.z));
    const top = varying(step(0.5, normalGeometry.y));
    const edge = varying(positionGeometry.y);
    m.colorNode = vec3(0.04, 0.035, 0.05);
    m.emissiveNode = vec3(1.0, 0.5, 0.25).mul(smoothstep(0.3, 0.5, edge).mul(float(1.0).sub(top))).mul(0.5).mul(U.lamps);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, N);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ---- towers: insulated slabs, floors of light, neon at the corners, sign strips and bands of kanji on some; the taller
  //      ones step back into an upper tier, so the skyline is never one block high ----------------------------------------
  const towerMesh = (tier) => {
    const m = new THREE.MeshBasicNodeMaterial();
    const P = plot();
    const { h1, h2, h3, h4 } = P;
    const landW = P.x1.sub(P.x0), landD = P.z1.sub(P.z0);
    const tall = pow(P.seed, 2.3);
    const H0 = mix(float(28.0), float(420.0), tall).add(h4.mul(20.0));
    const W0 = landW.mul(mix(float(0.42), float(0.82), h1)), D0 = landD.mul(mix(float(0.42), float(0.82), h2));
    const cx = P.x0.add(P.x1).mul(0.5).add(h3.sub(0.5).mul(landW.sub(W0)));
    const cz = P.z0.add(P.z1).mul(0.5).add(h4.sub(0.5).mul(landD.sub(D0)));
    // tier 1: a narrower block set back on top of the taller towers
    const stepped = step(0.4, P.seed).mul(step(0.3, h3));
    const H = tier ? H0.mul(mix(float(0.22), float(0.55), h1)) : H0;
    const W = tier ? W0.mul(mix(float(0.48), float(0.72), h2)) : W0;
    const D = tier ? D0.mul(mix(float(0.5), float(0.7), h4)) : D0;
    const baseY = tier ? H0.add(4.0) : float(4.0);
    const size = vec3(W, H, D);
    const base = vec3(cx, H.mul(0.5).add(baseY), cz);
    // a few plots stand empty: open decks between the towers
    const built = P.valid.mul(step(0.12, h2)).mul(tier ? stepped : float(1.0));
    m.positionNode = select(built.greaterThan(0.5), base.add(positionGeometry.mul(size)), vec3(cx, -600.0, cz));
    // the fragment works in metres on each face
    const vSize = varying(size);
    const vLocal = varying(positionGeometry);
    const vSeed = varying(vec3(P.seed.add(tier * 0.37), h1, h3));
    const vNormal = varying(normalGeometry);
    const p = vLocal.mul(vSize);
    const alongX = step(0.5, abs(vNormal.z));
    const wall = step(abs(vNormal.y), 0.5);
    const u = mix(p.z, p.x, alongX);
    const halfW = mix(vSize.z, vSize.x, alongX).mul(0.5);
    const v = p.y.add(vSize.y.mul(0.5));
    const seed = vSeed.x;
    // windows: floors of 3.6 m, bays of 2.8 m, lit in runs; averaged once they would alias
    const fy = fract(v.div(3.6)), fx = fract(u.div(2.8));
    const pane = smoothstep(0.12, 0.2, fx).mul(smoothstep(0.88, 0.8, fx)).mul(smoothstep(0.22, 0.3, fy)).mul(smoothstep(0.82, 0.74, fy));
    const run = hash(floor(v.div(3.6)).mul(3.7).add(floor(u.div(14.0)).mul(1.31)).add(seed.mul(911.0)));
    const lit = step(0.58, run);
    const warm = mix(vec3(1.0, 0.62, 0.32), vec3(0.62, 0.8, 1.0), step(0.72, hash(floor(u.div(2.8)).add(floor(v.div(3.6)).mul(7.0)).add(seed))));
    const far = smoothstep(0.3, 0.8, fwidth(v.div(3.6)));
    const windows = mix(warm.mul(lit).mul(pane), warm.mul(0.18), far).mul(U.windows);
    // neon: up the corners in the tower's own colour, round the crown; vertical sign strips on the side faces of some,
    // a band of kanji-like glyph blocks near the top of the front faces of others
    const hue = vSeed.y;
    const neonCol = mix(mix(vec3(1.0, 0.2, 0.65), vec3(0.25, 0.85, 1.0), step(0.4, hue)), mix(vec3(0.65, 0.35, 1.0), vec3(1.0, 0.62, 0.25), step(0.85, hue)), step(0.7, hue));
    const corner = aaLine(halfW.sub(abs(u)), 0.5).mul(2.2);
    const crown = aaLine(vSize.y.sub(v), 0.6).mul(2.0);
    const signOn = step(0.62, vSeed.z).mul(step(0.5, abs(vNormal.x)));
    const signU = u.sub(halfW.mul(0.62));
    const strip = smoothstep(2.6, 2.2, abs(signU)).mul(step(18.0, v)).mul(step(v, vSize.y.sub(12.0))).mul(signOn);
    const glyph = step(0.45, hash(floor(v.div(4.2)).add(seed.mul(77.0)))).mul(smoothstep(1.7, 1.2, abs(signU))).mul(step(0.3, fract(v.div(4.2))));
    const bandOn = step(vSeed.z, 0.35).mul(step(0.5, abs(vNormal.z))).mul(step(60.0, vSize.y));
    const bandV = vSize.y.sub(v);
    const band = step(6.0, bandV).mul(step(bandV, 20.0)).mul(step(abs(u), halfW.sub(3.0))).mul(bandOn);
    const cell = floor(u.div(5.2)), row = floor(bandV.div(4.6));
    const blk = step(0.38, hash(cell.mul(3.1).add(row.mul(17.0)).add(seed.mul(53.0)))).mul(step(0.22, fract(u.div(5.2)))).mul(step(0.2, fract(bandV.div(4.6))));
    const sign = neonCol.mul(strip.mul(0.35).add(glyph.mul(strip).mul(1.6))).add(neonCol.mul(band.mul(0.22).add(band.mul(blk).mul(1.5))));
    const body = vec3(0.022, 0.02, 0.032);
    // the roof: dark, a neon line round its edge, a few lit plant housings
    const edgeD = min(vSize.x.mul(0.5).sub(abs(p.x)), vSize.z.mul(0.5).sub(abs(p.z)));
    const plant = step(0.8, hash(floor(p.x.div(7.0)).add(floor(p.z.div(7.0)).mul(13.0)).add(seed.mul(29.0)))).mul(step(4.0, edgeD));
    const roof = body.mul(0.8).add(neonCol.mul(aaLine(edgeD, 0.45)).mul(1.6).mul(U.lamps)).add(vec3(1.0, 0.6, 0.3).mul(plant).mul(0.12));
    m.colorNode = mix(roof, body.add(windows.add(neonCol.mul(max(corner, crown)).mul(U.lamps)).add(sign.mul(U.screens))), wall);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, N);
    mesh.frustumCulled = false;
    return mesh;
  };
  if (!dev.has("notower")) group.add(towerMesh(0), towerMesh(1));

  return { group };
}

void vec2;
void sin;
void min;
