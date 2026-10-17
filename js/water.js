// Kraken Port's sea, made to behave like water. Three layers of motion, all shared between what you see and what
// the shuttle feels:
//  1. Swell: a few long directional waves. Titan's gravity is a seventh of Earth's, so they are slow (a 23 m wave takes
//     ten seconds to pass). Evaluated identically on the CPU (buoyancy) and the GPU (the surface).
//  2. Ripples: a wave-equation height field simulated on the CPU around the shuttle (world-locked, it scrolls with
//     you). The hull pushes water aside and leaves a V-shaped wake, idling makes rings, the engines' downwash
//     roughs the water up when skimming, landings splash, and passing boats leave their own wakes.
//  3. Foam: churned up where the hull and engines work the water, then thins out and fades.
// The surface is a planar mirror bent by the combined normal: lights stretch into wavy columns, the wake breaks them
// up. A dense patch follows the shuttle and is displaced by the ripples so the wake has real height; the far sea
// carries the swell only. Spray is a GPU particle ring buffer that falls under Titan's 1.35 m/s².
import * as THREE from "three";
import {
  uniform, vec2, vec3, vec4, float, texture, positionWorld, positionLocal, cameraPosition, normalize,
  dot, max, min, mix, smoothstep, step, pow, length, abs, sin, cos, clamp, exp, reflector, mx_noise_float,
  mx_worley_noise_float, instancedBufferAttribute, positionGeometry, cross, uv, fract, floor, hash as rawHash,
} from "three/tsl";
import { hashF } from "./fx.js";

const hash = (x) => hashF(float(x).add(1048576.0));
const ssf = (a, b, x) => (a > b ? float(1).sub(smoothstep(b, a, x)) : smoothstep(a, b, x));

export const G_TITAN = 1.352;
// the swell: direction (radians), wavelength (m), amplitude (m), phase
export const SWELL = [
  { a: 0.35, L: 26, A: 0.11, p: 0.0 },
  { a: 1.95, L: 15, A: 0.06, p: 1.7 },
  { a: -0.85, L: 8.5, A: 0.032, p: 4.1 },
  { a: 2.7, L: 4.6, A: 0.014, p: 2.3 },
];
for (const w of SWELL) {
  w.k = (Math.PI * 2) / w.L;
  w.w = Math.sqrt(G_TITAN * w.k);
  w.dx = Math.cos(w.a);
  w.dz = Math.sin(w.a);
}
/** How lively the swell is here: calm inside the canals, a real swell out on the open sea. */
export function swellAmp(x, z) {
  const ox = Math.max(0, Math.abs(x) - 560), oz = Math.max(0, z - 700, -1950 - z);
  const out = Math.min(1, Math.hypot(ox, oz) / 420);
  return 0.55 + out * out * (3 - 2 * out) * 1.25;
}
export function swellHeight(x, z, t) {
  let h = 0;
  for (const w of SWELL) h += w.A * Math.sin((x * w.dx + z * w.dz) * w.k - t * w.w + w.p);
  return h * swellAmp(x, z);
}

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {object} o.U port uniforms (time, night, rain, reflect, water, hazeColor(), glowLow, hazeGlow, sunDir, fogFactor())
 * @param {object} o.quality { reflect, particles, water: "high"|"low" }
 * @param {THREE.WebGPURenderer} o.renderer
 */
export function createWater({ scene, U, quality, renderer }) {
  const N = quality.water === "low" ? 128 : 192;
  const CELL = quality.water === "low" ? 0.85 : 0.6;
  const SIZE = N * CELL;
  const C = 7.5; // wave speed, m/s: at 24 m/s the wake opens at ~18°, near the Kelvin angle
  const STEP = 1 / 60;
  const K = ((C * STEP) / CELL) ** 2;
  const DAMP = 0.9975;
  const NU = 0.06; // viscosity: fine ripples die faster than the long wake waves
  const ABSORB = 12; // cells of absorbing border so nothing reflects off the edge of the sim

  let h = new Float32Array(N * N), p = new Float32Array(N * N), nx = new Float32Array(N * N);
  const foam = new Float32Array(N * N);
  const damp = new Float32Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const e = Math.min(i, j, N - 1 - i, N - 1 - j);
      const f = e >= ABSORB ? 0 : (1 - e / ABSORB) ** 2;
      damp[j * N + i] = DAMP - 0.08 * f;
    }
  let ix0 = 0, iz0 = 0; // world cell index of the sim's corner

  // ---- the texture the GPU reads: R = ripple height, G = foam ---------------------------------------------------
  const filterable32 = !renderer.backend.isWebGPUBackend || renderer.hasFeature("float32-filterable");
  const texData = filterable32 ? new Float32Array(N * N * 2) : new Uint16Array(N * N * 2);
  const rippleTex = new THREE.DataTexture(texData, N, N, THREE.RGFormat, filterable32 ? THREE.FloatType : THREE.HalfFloatType);
  rippleTex.magFilter = rippleTex.minFilter = THREE.LinearFilter;
  rippleTex.wrapS = rippleTex.wrapT = THREE.ClampToEdgeWrapping;
  rippleTex.needsUpdate = true;
  const uOrigin = uniform(new THREE.Vector2(0, 0)); // world xz of the sim's corner
  const uSize = uniform(SIZE);
  const uCell = uniform(CELL);
  const uCenter = uniform(new THREE.Vector2(0, 0));

  // ---- swell in TSL: height and gradient, matching swellHeight() -------------------------------------------------
  const swellAmpTSL = (wp) => {
    const o = vec2(max(abs(wp.x).sub(560.0), 0.0), max(max(wp.y.sub(700.0), float(-1950.0).sub(wp.y)), 0.0));
    const out = min(length(o).div(420.0), 1.0);
    return float(0.55).add(out.mul(out).mul(float(3.0).sub(out.mul(2.0))).mul(1.25));
  };
  const swellTSL = (wp) => {
    let hh = float(0), gx = float(0), gz = float(0);
    for (const w of SWELL) {
      const ph = wp.x.mul(w.dx).add(wp.y.mul(w.dz)).mul(w.k).sub(U.time.mul(w.w)).add(w.p);
      hh = hh.add(sin(ph).mul(w.A));
      const c = cos(ph).mul(w.A * w.k);
      gx = gx.add(c.mul(w.dx));
      gz = gz.add(c.mul(w.dz));
    }
    const amp = swellAmpTSL(wp);
    return { h: hh.mul(amp), g: vec2(gx, gz).mul(amp) };
  };
  const rippleUV = (wp) => wp.sub(uOrigin).div(uSize);
  const inSim = (ruv) => step(0.0, ruv.x).mul(step(ruv.x, 1.0)).mul(step(0.0, ruv.y)).mul(step(ruv.y, 1.0));
  const edgeFade = (ruv) => smoothstep(0.0, 0.1, min(min(ruv.x, float(1.0).sub(ruv.x)), min(ruv.y, float(1.0).sub(ruv.y))));

  // ---- the shared surface shading ----------------------------------------------------------------------------------
  const reflection = reflector({ resolution: quality.reflect, bounces: false, generateMipmaps: true });
  reflection.target.rotateX(-Math.PI / 2);
  scene.add(reflection.target);

  const wp = positionWorld.xz;
  const toCam = cameraPosition.sub(positionWorld);
  const dist = length(toCam);
  const v = normalize(toCam);
  const sw = swellTSL(wp);
  // ripples: central differences of the simulated height, faded out at the sim's border
  const ruv = rippleUV(wp);
  const inside = inSim(ruv).mul(edgeFade(ruv));
  const texel = float(1.0 / N);
  const rH = (o) => texture(rippleTex, ruv.add(o)).r;
  const t2 = texel.mul(1.5);
  const rgx = rH(vec2(t2, 0.0)).sub(rH(vec2(t2.negate(), 0.0))).div(uCell.mul(3.0));
  const rgz = rH(vec2(0.0, t2)).sub(rH(vec2(0.0, t2.negate()))).div(uCell.mul(3.0));
  const foamRaw = texture(rippleTex, ruv).g.mul(inside);
  // fine chop for the shimmer, faded with distance so it never crawls
  const chopFade = ssf(160.0, 20.0, dist);
  const chop = vec2(
    mx_noise_float(vec3(wp.x.mul(0.55), wp.y.mul(0.55), U.time.mul(0.35))),
    mx_noise_float(vec3(wp.x.mul(0.55).add(17.0), wp.y.mul(0.55), U.time.mul(0.35))),
  ).mul(0.05).mul(chopFade);
  // drizzle rings when it rains
  const cell = floor(wp.div(2.2));
  const local = fract(wp.div(2.2)).sub(0.5).mul(2.2);
  const ph = hash(cell.x.mul(31.7).add(cell.y.mul(113.1)));
  const age = fract(U.time.mul(0.55).add(ph));
  const ring = smoothstep(0.08, 0.0, abs(length(local).sub(age.mul(1.1)))).mul(float(1.0).sub(age)).mul(ssf(40.0, 8.0, dist)).mul(U.rain);
  const rg = vec2(rgx, rgz).mul(inside);
  const grad = sw.g.add(rg.mul(1.1)).add(chop).add(vec2(ring.mul(0.3)));
  const n = normalize(vec3(grad.x.negate(), 1.0, grad.y.negate()));
  // the mirror, bent by the surface: sideways a little, toward and away from you a lot (lights stretch into columns)
  const near = clamp(float(26.0).div(dist), 0.12, 1.0);
  reflection.uvNode = reflection.uvNode.add(vec2(n.x.mul(0.11), n.z.mul(0.38)).mul(near));
  reflection.levelNode = mix(float(0.4), float(2.2), smoothstep(25.0, 420.0, dist)).add(foamRaw.mul(1.5)).add(min(length(rg).mul(7.0), 1.6));
  const ndv = clamp(dot(n, v), 0.0, 1.0);
  const fres = float(0.02).add(float(0.98).mul(pow(float(1.0).sub(ndv), 5.0)));
  const refl = reflection.rgb.mul(U.reflect);
  // water body: dark, a touch of colour from the haze where you look into it steeply
  const body = U.water.add(U.hazeColor(vec3(0.0, 1.0, 0.0)).mul(0.03).mul(ndv)).add(U.glowLow.mul(0.05));
  let col = mix(body, refl, clamp(fres.mul(1.15).add(0.06), 0.0, 1.0));
  // foam: bubbly white broken up by cells, lit by the sky and the city
  const lace = mx_worley_noise_float(vec3(wp.x.mul(0.9), wp.y.mul(0.9), U.time.mul(0.18))).mul(0.6)
    .add(mx_worley_noise_float(vec3(wp.x.mul(2.7), wp.y.mul(2.7), U.time.mul(0.3))).mul(0.4));
  // (always a lace with dark holes, never a sheet: as the foam thickens more of each bubble cell turns white, but the
  // threshold never falls so low that the cells close up; and it takes the colour of the lights it floats under)
  const dens = clamp(foamRaw, 0.0, 1.0);
  const laceT = float(0.86).sub(dens.mul(0.5));
  const foamMask = smoothstep(laceT, laceT.add(0.14), lace).mul(smoothstep(0.03, 0.15, foamRaw));
  const foamLight = mix(vec3(0.7, 0.68, 0.64), vec3(0.24, 0.23, 0.3), U.night).add(U.glowLow.mul(0.4)).add(U.hazeGlow.mul(0.1));
  const foamCol = foamLight.mul(0.72).add(refl.mul(0.3));
  col = mix(col, foamCol, foamMask.mul(0.62));
  // the crest of the wake catches more light than the troughs
  const crest = smoothstep(0.05, 0.4, texture(rippleTex, ruv).r.mul(inside));
  col = col.add(foamLight.mul(crest).mul(0.14));
  // sun glint (day)
  const r = v.negate().reflect(n);
  const glint = pow(max(dot(r, U.sunDir), 0.0), 220.0).mul(mix(float(2.2), float(0.0), U.night));
  col = col.add(U.hazeGlow.mul(glint));
  const surface = vec4(col, 1.0);

  // ---- the surface: one mesh (the mirror hides its own material while it renders the reflection, so the water must be
  // a single material): a dense grid round the shuttle, displaced by swell and ripples, and four big flat bands out to
  // the horizon. It moves with the simulation.
  const surfMat = new THREE.MeshBasicNodeMaterial();
  {
    const pw = positionLocal.xz.add(uCenter);
    const pr = rippleUV(pw);
    const ripple = texture(rippleTex, pr).r;
    const disp = swellTSL(pw).h.add(ripple).mul(edgeFade(pr)).mul(inSim(pr));
    surfMat.positionNode = positionLocal.add(vec3(0.0, disp, 0.0));
  }
  surfMat.colorNode = surface;
  const surfaceMesh = new THREE.Mesh(surfaceGeometry(N, CELL), surfMat);
  surfaceMesh.frustumCulled = false;
  surfaceMesh.renderOrder = -5;
  scene.add(surfaceMesh);
  const sea = surfaceMesh, patch = surfaceMesh;

  // ---- spray: GPU particles in a ring buffer -----------------------------------------------------------------------
  const spray = createSpray(U, Math.round(3200 * (quality.particles ?? 1)));
  scene.add(spray.mesh);

  // ---- the simulation -------------------------------------------------------------------------------------------------
  /** Recentre the sim on (cx, cz), shifting the fields by whole cells so the waves stay where they are in the world. */
  function recentre(cx, cz) {
    const nix = Math.round(cx / CELL - N / 2), niz = Math.round(cz / CELL - N / 2);
    const dx = nix - ix0, dz = niz - iz0;
    if (!dx && !dz) return;
    if (Math.abs(dx) >= N || Math.abs(dz) >= N) {
      h.fill(0);
      p.fill(0);
      foam.fill(0);
    } else {
      for (const arr of [h, p, foam]) {
        const tmp = nx;
        tmp.fill(0);
        for (let j = 0; j < N; j++) {
          const sj = j + dz;
          if (sj < 0 || sj >= N) continue;
          const i0 = Math.max(0, -dx), i1 = Math.min(N, N - dx);
          if (i1 <= i0) continue;
          tmp.set(arr.subarray(sj * N + i0 + dx, sj * N + i1 + dx), j * N + i0);
        }
        arr.set(tmp);
      }
    }
    ix0 = nix;
    iz0 = niz;
  }

  const sources = [];
  /** Push water down at (x, z) by `s` metres this step, over a gaussian of radius r; add foam. */
  function addSource(x, z, r, s, f = 0) {
    sources.push(x, z, r, s, f);
  }
  function applySources() {
    for (let k = 0; k < sources.length; k += 5) {
      const x = sources[k], z = sources[k + 1], r = sources[k + 2], s = sources[k + 3], f = sources[k + 4];
      const ci = x / CELL - ix0 - 0.5, cj = z / CELL - iz0 - 0.5;
      const rc = Math.max(1, r / CELL), R = Math.ceil(rc * 2);
      const i0 = Math.max(1, Math.floor(ci - R)), i1 = Math.min(N - 2, Math.ceil(ci + R));
      const j0 = Math.max(1, Math.floor(cj - R)), j1 = Math.min(N - 2, Math.ceil(cj + R));
      const inv = 1 / (rc * rc);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const d2 = ((i - ci) ** 2 + (j - cj) ** 2) * inv;
          if (d2 > 4) continue;
          const g = Math.exp(-d2 * 1.6);
          const idx = j * N + i;
          h[idx] -= s * g;
          if (f) foam[idx] = Math.min(1.2, foam[idx] + f * g);
        }
    }
    sources.length = 0;
  }
  function simStep() {
    applySources();
    for (let j = 1; j < N - 1; j++) {
      const row = j * N;
      for (let i = 1; i < N - 1; i++) {
        const idx = row + i;
        const c = h[idx];
        const lap = h[idx - 1] + h[idx + 1] + h[idx - N] + h[idx + N] - 4 * c;
        const lapP = p[idx - 1] + p[idx + 1] + p[idx - N] + p[idx + N] - 4 * p[idx];
        nx[idx] = (2 * c - p[idx] + K * lap) * damp[idx] + NU * (lap - lapP);
      }
    }
    // rotate the buffers: previous <- current, current <- next
    const t = p;
    p = h;
    h = nx;
    nx = t;
    // foam: fade, spread a little, and appear where the surface is torn up
    for (let j = 1; j < N - 1; j++) {
      const row = j * N;
      for (let i = 1; i < N - 1; i++) {
        const idx = row + i;
        const steep = Math.abs(h[idx] - p[idx]);
        let f = foam[idx] * 0.991 + (foam[idx - 1] + foam[idx + 1] + foam[idx - N] + foam[idx + N] - 4 * foam[idx]) * 0.07;
        if (steep > 0.014) f += (steep - 0.014) * 3.0;
        if (h[idx] > 0.07) f += (h[idx] - 0.07) * 0.5; // the bow wave's crest breaks white
        foam[idx] = f > 1.2 ? 1.2 : f;
      }
    }
  }
  const tmpF = new Float32Array(1), tmpU = new Uint32Array(tmpF.buffer);
  function upload() {
    if (filterable32) {
      for (let k = 0, n2 = N * N; k < n2; k++) {
        texData[k * 2] = h[k];
        texData[k * 2 + 1] = foam[k];
      }
    } else {
      for (let k = 0, n2 = N * N; k < n2; k++) {
        texData[k * 2] = THREE.DataUtils.toHalfFloat(h[k]);
        texData[k * 2 + 1] = THREE.DataUtils.toHalfFloat(foam[k]);
      }
    }
    rippleTex.needsUpdate = true;
    void tmpU;
  }
  /** The simulated ripple height at a world point (bilinear), 0 outside the sim. */
  function rippleAt(x, z) {
    const fi = x / CELL - ix0 - 0.5, fj = z / CELL - iz0 - 0.5;
    const i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= N - 1 || j >= N - 1) return 0;
    const tx = fi - i, tz = fj - j, idx = j * N + i;
    return (h[idx] * (1 - tx) + h[idx + 1] * tx) * (1 - tz) + (h[idx + N] * (1 - tx) + h[idx + N + 1] * tx) * tz;
  }

  let acc = 0;
  let time = 0;
  const api = {
    sea,
    patch,
    spray,
    reflection,
    N,
    CELL,
    /** Water surface height at a world point (swell + ripples). */
    heightAt(x, z) {
      return swellHeight(x, z, time) + rippleAt(x, z);
    },
    addSource,
    /** A fingertip on the water: a small push and a little foam. */
    touch(x, z, strength = 1) {
      addSource(x, z, 1.1, 0.045 * strength, 0.04 * strength);
    },
    /** A landing or a crash: a big push and a burst of spray. */
    splash(x, z, strength = 1, radius = 6) {
      for (let k = 0; k < 6; k++) addSource(x + (Math.random() - 0.5) * radius, z + (Math.random() - 0.5) * radius, radius * 0.6, 0.22 * strength, 0.9);
      spray.burst(x, z, radius, strength, time);
    },
    /**
     * @param time seconds
     * @param dt seconds
     * @param ship { pos, yaw, vF, vL, alt, throttle, skim, heave } or null
     * @param boats [{ x, z, dx, dz, speed }]
     */
    update(t, dt, ship, boats = [], focus = null) {
      time = t;
      if (ship) {
        const back = SIZE * 0.18;
        // on the home screen the simulation sits on the water round the boardwalk instead, so the cursor can stir it
        if (focus) recentre(focus.x, focus.z);
        else recentre(ship.pos.x + Math.sin(ship.yaw) * back, ship.pos.z + Math.cos(ship.yaw) * back);
        uCenter.value.set((ix0 + N / 2) * CELL, (iz0 + N / 2) * CELL);
        uOrigin.value.set(ix0 * CELL, iz0 * CELL);
        surfaceMesh.position.set(uCenter.value.x, 0, uCenter.value.y);
      }
      acc = Math.min(acc + dt, STEP * 3);
      while (acc >= STEP) {
        acc -= STEP;
        if (ship) shipSources(ship, t);
        for (const b of boats) {
          const s = Math.min(1, b.speed / 10) * 0.0035;
          addSource(b.x, b.z, 1.4, s, 0.05);
          addSource(b.x - b.dx * 4.5, b.z - b.dz * 4.5, 1.6, s * 0.6, 0.12);
        }
        simStep();
      }
      upload();
      if (ship) shipSpray(ship, t, dt);
      spray.update(t);
    },
  };

  // ---- what the shuttle does to the water ---------------------------------------------------------------------------
  // hull points in the shuttle's frame: x right, z back (the nose is at -z)
  const POD_X = 7.7;
  const toWorld = (ship, lx, lz) => {
    const c = Math.cos(ship.yaw), s = Math.sin(ship.yaw);
    return [ship.pos.x + lx * c + lz * s, ship.pos.z - lx * s + lz * c];
  };
  function shipSources(ship, t) {
    const wet = Math.max(0, 1 - (ship.alt - 1.2) / 1.6); // 1 afloat, 0 once lifted clear
    const v = Math.abs(ship.vF);
    const sp = Math.min(1.6, v / 14);
    const jitter = () => 0.88 + Math.random() * 0.24;
    if (wet > 0.01) {
      // the pods are the floats: bows push the water aside, the sides drag it along
      for (const sx of [-1, 1]) {
        let [x, z] = toWorld(ship, sx * POD_X, -8.8);
        addSource(x, z, 1.25, 0.0042 * sp * wet * jitter(), 0.09 * sp * wet);
        [x, z] = toWorld(ship, sx * POD_X, 0);
        addSource(x, z, 1.3, 0.0022 * sp * wet * jitter(), 0.02 * sp * wet);
        // engine wash churns white water behind each pod
        [x, z] = toWorld(ship, sx * POD_X, 12.5 + Math.random() * 3);
        addSource(x, z, 1.3, (Math.random() - 0.5) * 0.008 * ship.throttle * wet, 0.16 * (0.3 + ship.throttle) * wet * Math.min(1, v / 6));
      }
      // the keel just kisses the water
      const [bx, bz] = toWorld(ship, 0, -6);
      addSource(bx, bz, 1.8, 0.0018 * sp * wet * jitter(), 0.01 * sp * wet);
      // heave: bobbing up and down makes rings even when still
      if (Math.abs(ship.heave) > 0.02)
        for (const sx of [-1, 1]) {
          const [x, z] = toWorld(ship, sx * POD_X, 0);
          addSource(x, z, 2.4, ship.heave * 0.004 * wet, 0);
        }
    }
    // downwash: the engines blow the water rough in a ring under the shuttle when it flies low
    const low = Math.max(0, 1 - (ship.alt - 2) / 34);
    if (ship.alt > 2 && low > 0) {
      for (let k = 0; k < 5; k++) {
        const a = Math.random() * Math.PI * 2, rr = 6 + Math.random() * 7;
        addSource(ship.pos.x + Math.cos(a) * rr, ship.pos.z + Math.sin(a) * rr, 1.6, (Math.random() - 0.35) * 0.02 * low, 0.05 * low);
      }
    }
    void t;
  }
  let sprayAcc = 0;
  function shipSpray(ship, t, dt) {
    const wet = Math.max(0, 1 - (ship.alt - 1.2) / 1.6);
    const v = Math.abs(ship.vF);
    // bow spray: a sheet thrown out and up from each pod's bow, more with speed
    sprayAcc += dt * (wet * Math.max(0, v - 3) * 9 + (ship.alt > 2 ? Math.max(0, 1 - (ship.alt - 2) / 30) * 120 : 0));
    let n = Math.floor(sprayAcc);
    sprayAcc -= n;
    n = Math.min(n, 40);
    const c = Math.cos(ship.yaw), s = Math.sin(ship.yaw);
    for (let k = 0; k < n; k++) {
      if (ship.alt > 2 && (k % 2 === 0 || wet < 0.1)) {
        // downwash mist: kicked off the water in a ring, blown outwards
        const a = Math.random() * Math.PI * 2, rr = 5 + Math.random() * 8;
        const low = Math.max(0, 1 - (ship.alt - 2) / 30);
        spray.emit(ship.pos.x + Math.cos(a) * rr, 0.1, ship.pos.z + Math.sin(a) * rr, Math.cos(a) * (4 + Math.random() * 6), 1 + Math.random() * 3 * low, Math.sin(a) * (4 + Math.random() * 6), 1.6 + Math.random(), 0.5 + Math.random() * 0.8, t);
        continue;
      }
      const sx = Math.random() < 0.5 ? -1 : 1;
      const lz = -8.6 + Math.random() * 2.5;
      const [x, z] = toWorld(ship, sx * (POD_X + sx * 0.9), lz);
      // out sideways (in the shuttle's frame), up, and carried along with the hull
      const out = 2 + Math.random() * 3 + v * 0.08, up = 1.5 + Math.random() * 2.2 + v * 0.06, along = -v * (0.55 + Math.random() * 0.25);
      const lx = sx * out, lzv = -along;
      spray.emit(x, 0.15, z, lx * c + lzv * s + 0, up, -lx * s + lzv * c, 0.9 + Math.random() * 0.8, 0.18 + Math.random() * 0.22, t);
    }
  }
  return api;
}

/** A dense N×N grid (cell centres of the simulation) with four flat bands round it reaching to the horizon. */
function surfaceGeometry(N, CELL, E = 12000) {
  const A = ((N - 1) / 2) * CELL;
  const pos = [], idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pos.push(-A + i * CELL, 0, -A + j * CELL);
  for (let j = 0; j < N - 1; j++)
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  // the bands overlap the grid's flat border by half a cell, so there is never a crack between them
  const o = A - CELL * 0.5;
  const quad = (x0, z0, x1, z1) => {
    const k = pos.length / 3;
    pos.push(x0, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1);
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  };
  quad(-E, o, E, E);
  quad(-E, -E, E, -o);
  quad(-E, -o, -o, o);
  quad(o, -o, E, o);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// spray: droplets thrown off the water, falling under Titan's gravity (they hang in the air), stretched along their
// motion, lit by the city
// ---------------------------------------------------------------------------------------------------------------
function createSpray(U, COUNT) {
  const A = new Float32Array(COUNT * 4).fill(0); // spawn x y z, spawn time
  const B = new Float32Array(COUNT * 4).fill(0); // velocity x y z, life
  const Cz = new Float32Array(COUNT).fill(0); // size
  for (let i = 0; i < COUNT; i++) A[i * 4 + 3] = -999;
  const attrA = new THREE.InstancedBufferAttribute(A, 4), attrB = new THREE.InstancedBufferAttribute(B, 4), attrC = new THREE.InstancedBufferAttribute(Cz, 1);
  for (const a of [attrA, attrB, attrC]) a.setUsage(THREE.DynamicDrawUsage);
  const PA = instancedBufferAttribute(attrA, "vec4");
  const PB = instancedBufferAttribute(attrB, "vec4");
  const PC = instancedBufferAttribute(attrC, "float");
  const age = U.time.sub(PA.w);
  const life = PB.w;
  const alive = step(0.0, age).mul(step(age, life));
  const g = vec3(0.0, -G_TITAN, 0.0);
  const pos = PA.xyz.add(PB.xyz.mul(age)).add(g.mul(age.mul(age).mul(0.5)));
  const vel = PB.xyz.add(g.mul(age));
  const above = step(-0.1, pos.y);
  const toCam = normalize(cameraPosition.sub(pos));
  const speed = length(vel);
  const dir = normalize(vel.add(vec3(0.0, 0.0001, 0.0)));
  const side = normalize(cross(dir, toCam));
  const size = PC.mul(alive).mul(above).mul(age.div(0.12).min(1.0));
  const stretch = float(1.0).add(speed.mul(0.09));
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.positionNode = pos.add(side.mul(positionGeometry.x.mul(size))).add(dir.mul(positionGeometry.y.mul(size).mul(stretch)));
  const q = uv().sub(0.5).mul(2.0);
  const drop = pow(max(float(1.0).sub(length(q)), 0.0), 1.6);
  const fade = float(1.0).sub(smoothstep(life.mul(0.55), life, age));
  const lit = mix(vec3(0.85, 0.82, 0.76), vec3(0.5, 0.5, 0.6), U.night).add(U.glowLow.mul(0.6)).add(U.hazeGlow.mul(0.3));
  m.colorNode = lit.mul(drop).mul(fade).mul(0.75).mul(float(1.0).sub(U.fogFactor().mul(0.7)));
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, COUNT);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  let head = 0;
  let dirtyFrom = COUNT, dirtyTo = -1;
  return {
    mesh,
    emit(x, y, z, vx, vy, vz, lifeS, sizeM, t) {
      const i = head;
      head = (head + 1) % COUNT;
      A.set([x, y, z, t], i * 4);
      B.set([vx, vy, vz, lifeS], i * 4);
      Cz[i] = sizeM;
      dirtyFrom = Math.min(dirtyFrom, i);
      dirtyTo = Math.max(dirtyTo, i);
    },
    burst(x, z, radius, strength, t) {
      const n = Math.round(260 * strength);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
        const out = 2 + Math.random() * 7 * strength;
        this.emit(x + Math.cos(a) * r, 0.2, z + Math.sin(a) * r, Math.cos(a) * out, 3 + Math.random() * 7 * strength, Math.sin(a) * out, 1.8 + Math.random() * 1.6, 0.25 + Math.random() * 0.45, t);
      }
    },
    update() {
      if (dirtyTo < 0) return;
      for (const a of [attrA, attrB, attrC]) a.needsUpdate = true;
      dirtyFrom = COUNT;
      dirtyTo = -1;
    },
  };
}

void mix;
void exp;
void dot;
