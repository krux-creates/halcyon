// The air over Kraken Port: rain you can switch off, splashes on the sea, motes hanging in the haze, mist banks
// lying on the water, steam from the rooftops and, at night, searchlights sweeping the cloud.
// Everything is one instanced mesh per effect, positioned and shaded on the GPU from the instance index and time.
import * as THREE from "three";
import {
  vec2, vec3, float, uniform, hash as rawHash, instanceIndex, positionGeometry, cameraPosition, normalize, cross, length, floor,
  fract, mix, smoothstep, step, max, pow, exp, abs, sin, cos, uv, dot, mx_noise_float, clamp, positionLocal, normalView, positionViewDirection, texture,
} from "three/tsl";
import { hashF } from "./fx.js";
/** TSL's hash truncates to a u32, so negative inputs all hash to the same value: shift them positive first. */
const hash = (x) => hashF(float(x).add(1048576.0));

import { ss } from "./port.js";

/**
 * @param U the port's uniforms (time, night, hazeColor()...)
 * @param plan the port's layout (for vents and searchlight towers)
 * @param quality { particles: 0..1 }
 */
export function createParticles(U, plan, quality = { particles: 1 }) {
  const group = new THREE.Group();
  const Q = quality.particles ?? 1;
  const rain = uniform(1); // 0 = dry, 1 = full rain; eased by setRain()
  let rainTarget = 1;

  const near = buildRain(U, rain, { count: Math.round(7000 * Q), box: [34, 24, 34], speed: [9.5, 12.5], width: 0.011, len: [0.55, 0.95], gain: 0.5 });
  const far = buildRain(U, rain, { count: Math.round(5000 * Q), box: [120, 70, 120], speed: [9.0, 12.0], width: 0.02, len: [1.2, 2.0], gain: 0.22, skipNear: 16 });
  const splashes = buildSplashes(U, rain, Math.round(700 * Q));
  const motes = buildMotes(U, Math.round(1400 * Q));
  const mist = buildMist(U, Math.round(150 * Math.max(0.5, Q)));
  const steam = buildSteam(U, plan.vents);
  const lights = buildSearchlights(U, plan.searchlights);
  for (const o of [near, far, splashes, motes, mist, steam, lights.group]) if (o) group.add(o);

  return {
    group,
    rain,
    get raining() {
      return rainTarget > 0;
    },
    setRain(on) {
      rainTarget = on ? 1 : 0;
    },
    update(time, dt) {
      rain.value += (rainTarget - rain.value) * Math.min(1, dt * 1.6);
      const wet = rain.value > 0.003;
      near.visible = far.visible = splashes.visible = wet;
      U.rain.value = rain.value * U.rainLook;
      lights.update(time);
    },
  };
}

// ---- rain -------------------------------------------------------------------------------------------------
// Streaks aligned to the fall, a hair wide with a brighter core and soft ends, lit by the haze in the direction you
// see them; never thinner than a pixel (a thinner streak is drawn a pixel wide and dimmer instead), so it never
// shimmers. A second, far layer is longer and fainter: rain as a veil in the distance.
function buildRain(U, rain, { count, box, speed, width, len, gain, skipNear = 0 }) {
  const B = vec3(...box);
  const r1 = hash(instanceIndex), r2 = hash(instanceIndex.add(7919)), r3 = hash(instanceIndex.add(104729)), r4 = hash(instanceIndex.add(15485863));
  const fall = mix(float(speed[0]), float(speed[1]), r3);
  const wind = vec3(1.6, 0.0, -0.7);
  const vel = vec3(wind.x, fall.negate(), wind.z);
  const p = vec3(r1, r2, r4).mul(B).add(vel.mul(U.time)).sub(cameraPosition);
  const base = p.sub(floor(p.div(B)).mul(B)).sub(B.mul(0.5)).add(cameraPosition);
  const axis = normalize(vel);
  const toCam = normalize(cameraPosition.sub(base));
  const right = normalize(cross(axis, toCam));
  const dist = length(cameraPosition.sub(base));
  const w = max(float(width), dist.mul(0.0011));
  const L = mix(float(len[0]), float(len[1]), r1);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.positionNode = base.add(right.mul(positionGeometry.x.mul(w))).add(axis.mul(positionGeometry.y.mul(L)));
  const x = uv().x.sub(0.5).mul(2.0);
  const y = uv().y;
  const across = exp(x.mul(x).mul(-4.5));
  const along = smoothstep(0.0, 0.3, y).mul(smoothstep(1.0, 0.7, y));
  const fade = smoothstep(0.6 + skipNear, 2.0 + skipNear, dist).mul(ss(box[0] * 0.5, box[0] * 0.3, dist));
  const energy = float(width).div(w); // thinner than a pixel: dimmer, not thinner
  const tint = U.hazeColor(toCam.negate()).mul(1.6).add(vec3(0.07, 0.075, 0.09));
  m.colorNode = tint.mul(across).mul(along).mul(fade).mul(energy.mul(0.7).add(0.3)).mul(rain).mul(gain);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return mesh;
}

// ---- splashes: a flick of spray and a ring, scattered on the water round the camera ---------------------------
function buildSplashes(U, rain, count) {
  const R = 26.0;
  const rate = 2.2;
  const ph = hash(instanceIndex.add(31));
  const cyc = floor(U.time.mul(rate).add(ph));
  const life = fract(U.time.mul(rate).add(ph));
  const a = hash(instanceIndex.toFloat().add(cyc.mul(13.7))).mul(6.2832);
  const d = pow(hash(instanceIndex.toFloat().mul(3.1).add(cyc.mul(7.3))), 0.5).mul(R);
  const centre = vec3(cameraPosition.x.add(cos(a).mul(d)), 0.02, cameraPosition.z.add(sin(a).mul(d)));
  const toCam = normalize(cameraPosition.sub(centre));
  const right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  const size = mix(float(0.08), float(0.2), smoothstep(0.0, 0.35, life));
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.positionNode = centre.add(right.mul(positionGeometry.x.mul(size.mul(1.6)))).add(vec3(0.0, positionGeometry.y.add(0.5).mul(size), 0.0));
  // a little crown: a bright rim at the top of an inverted bell
  const q = uv().sub(vec2(0.5, 0.0));
  const bell = smoothstep(0.08, 0.0, abs(length(q.mul(vec2(1.0, 1.6))).sub(mix(float(0.15), float(0.5), life))));
  const m2 = bell.mul(smoothstep(0.0, 0.2, uv().y));
  const dist = length(cameraPosition.sub(centre));
  m.colorNode = U.hazeColor(toCam.negate()).mul(2.2).mul(m2).mul(pow(float(1.0).sub(life), 2.0)).mul(ss(R, R * 0.5, dist)).mul(rain).mul(0.6);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return mesh;
}

// ---- motes: tiny specks hanging in the haze, drifting, catching light ------------------------------------------
function buildMotes(U, count) {
  const B = vec3(30.0, 20.0, 30.0);
  const r1 = hash(instanceIndex.add(5)), r2 = hash(instanceIndex.add(17)), r3 = hash(instanceIndex.add(29));
  const drift = vec3(
    sin(U.time.mul(0.11).add(r1.mul(40.0))).mul(1.6).add(U.time.mul(0.35)),
    sin(U.time.mul(0.07).add(r2.mul(40.0))).mul(1.2),
    cos(U.time.mul(0.09).add(r3.mul(40.0))).mul(1.6),
  );
  const p = vec3(r1, r2, r3).mul(B).add(drift).sub(cameraPosition);
  const base = p.sub(floor(p.div(B)).mul(B)).sub(B.mul(0.5)).add(cameraPosition);
  const toCam = normalize(cameraPosition.sub(base));
  const right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  const up = cross(toCam, right);
  const dist = length(cameraPosition.sub(base));
  const size = max(float(0.012), dist.mul(0.0011));
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.positionNode = base.add(right.mul(positionGeometry.x.mul(size))).add(up.mul(positionGeometry.y.mul(size)));
  const r = length(uv().sub(0.5)).mul(2.0);
  const twinkle = sin(U.time.mul(mix(float(1.0), float(3.0), r1)).add(r2.mul(30.0))).mul(0.4).add(0.6);
  const fade = smoothstep(3.0, 6.0, dist).mul(ss(15.0, 8.0, dist));
  m.colorNode = U.hazeColor(toCam.negate()).mul(2.5).add(vec3(0.1)).mul(pow(max(float(1.0).sub(r), 0.0), 2.0)).mul(twinkle).mul(fade).mul(0.18);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return mesh;
}

/** Soft particles would fade into walls by reading the scene depth, but sampling the depth inside the post pass
 *  blanks the frame on this three version, so the mist and steam are placed where they do not cut into walls. */
function softFade() {
  return float(1.0);
}

// ---- mist: soft banks lying on the water, drifting with the wind -------------------------------------------------
function buildMist(U, count) {
  const r1 = hash(instanceIndex.add(101)), r2 = hash(instanceIndex.add(211)), r3 = hash(instanceIndex.add(307));
  // over the channel and the open sea in front of the harbour mouth
  const inSea = step(0.6, r3);
  const x = mix(r1.sub(0.5).mul(56.0), r1.sub(0.5).mul(1400.0), inSea);
  const z = mix(mix(float(600.0), float(-1600.0), r2), mix(float(700.0), float(2200.0), r2), inSea);
  const wrapX = fract(x.add(U.time.mul(0.8)).div(1400.0).add(0.5)).sub(0.5).mul(1400.0);
  const cx = mix(x, wrapX, inSea);
  const radius = mix(float(18.0), float(70.0), hash(instanceIndex.add(401))).mul(mix(float(0.7), float(1.6), inSea));
  const centre = vec3(cx, mix(float(1.5), float(6.0), hash(instanceIndex.add(503))), z);
  const toCam = normalize(cameraPosition.sub(centre));
  const right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  const up = cross(toCam, right);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  m.positionNode = centre.add(right.mul(positionGeometry.x.mul(radius.mul(2.0)))).add(up.mul(positionGeometry.y.mul(radius.mul(0.7))));
  const q = uv().sub(0.5).mul(2.0);
  const body = smoothstep(1.0, 0.1, length(q));
  const wisp = mx_noise_float(vec3(q.x.mul(2.2).add(U.time.mul(0.05)), q.y.mul(3.0), hash(instanceIndex.add(601)).mul(30.0))).mul(0.5).add(0.5);
  const dist = length(cameraPosition.sub(centre));
  const nearFade = smoothstep(radius.mul(0.6), radius.mul(1.6), dist);
  const a = body.mul(wisp).mul(nearFade).mul(softFade(12.0)).mul(0.22);
  // lit by the neon nearest it, like the mist layer it drifts in
  m.colorNode = U.hazeColor(toCam.negate()).mul(1.08).add(U.glowLow.mul(0.4)).add(U.mistLight(centre).mul(0.45).mul(U.night));
  m.opacityNode = a;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return mesh;
}

// ---- steam from the rooftops: puffs that rise, swell, lean with the wind and thin out ---------------------------
function buildSteam(U, vents) {
  if (!vents?.length) return null;
  const PER = 18;
  const count = vents.length * PER;
  const pos = new Float32Array(vents.length * 4);
  vents.forEach((v, i) => pos.set([v.x, v.y, v.z, v.size ?? 1], i * 4));
  const tex = new THREE.DataTexture(pos, vents.length, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  // instance i belongs to vent floor(i / PER); its age runs 0..1 on a loop
  const vi = floor(instanceIndex.toFloat().div(PER));
  const k = instanceIndex.toFloat().sub(vi.mul(PER));
  const ventUV = vec2(vi.add(0.5).div(vents.length), 0.5);
  const V = texture(tex, ventUV);
  const speed = mix(float(0.05), float(0.09), hash(vi.add(3.0)));
  const age = fract(U.time.mul(speed).add(k.div(PER)).add(hash(vi)));
  const rise = age.mul(46.0).mul(V.w);
  const lean = vec3(age.mul(age).mul(26.0), 0.0, age.mul(-9.0)).mul(V.w);
  const wob = vec3(sin(age.mul(9.0).add(k)).mul(2.0), 0.0, cos(age.mul(7.0).add(k)).mul(2.0));
  const centre = V.xyz.add(vec3(0.0, rise, 0.0)).add(lean).add(wob);
  const size = mix(float(3.0), float(17.0), pow(age, 0.6)).mul(V.w);
  const toCam = normalize(cameraPosition.sub(centre));
  const right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  const up = cross(toCam, right);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  m.positionNode = centre.add(right.mul(positionGeometry.x.mul(size))).add(up.mul(positionGeometry.y.mul(size)));
  const q = uv().sub(0.5).mul(2.0);
  const puff = smoothstep(1.0, 0.0, length(q)).mul(mx_noise_float(vec3(q.mul(2.5), age.mul(3.0).add(k))).mul(0.4).add(0.7));
  const life = smoothstep(0.0, 0.12, age).mul(pow(float(1.0).sub(age), 1.6));
  // vapour, not smoke: brighter than the haze behind it, warmed by the city at night
  const lit = U.hazeColor(toCam.negate()).mul(mix(float(1.7), float(1.3), U.night)).add(U.glowLow.mul(0.7)).add(vec3(0.06, 0.055, 0.05));
  m.colorNode = lit;
  m.opacityNode = puff.mul(life).mul(softFade(4.0)).mul(0.24);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

// ---- searchlights: pale beams from the tallest roofs, sweeping the cloud at night ------------------------------
function buildSearchlights(U, spots) {
  const group = new THREE.Group();
  const beams = [];
  if (!spots?.length) return { group, update() {} };
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const along = positionLocal.y.div(1100.0);
  const edge = pow(abs(dot(normalView, positionViewDirection)), 2.5);
  const grain = mx_noise_float(vec3(positionLocal.x.mul(0.02), positionLocal.y.mul(0.006).sub(U.time.mul(0.1)), positionLocal.z.mul(0.02))).mul(0.35).add(0.75);
  m.colorNode = vec3(0.75, 0.82, 1.0).mul(ss(1.0, 0.0, along)).mul(edge).mul(grain).mul(0.05).mul(U.night);
  const geo = new THREE.ConeGeometry(34, 1100, 32, 1, true);
  geo.translate(0, -550, 0);
  geo.rotateX(Math.PI);
  for (const s of spots) {
    const beam = new THREE.Mesh(geo, m);
    beam.position.set(s.x, s.y, s.z);
    beam.renderOrder = 6;
    beam.frustumCulled = false;
    group.add(beam);
    beams.push({ beam, phase: s.phase });
  }
  return {
    group,
    update(time) {
      group.visible = U.night.value > 0.05;
      for (const b of beams) {
        b.beam.rotation.z = Math.sin(time * 0.17 + b.phase) * 0.42;
        b.beam.rotation.x = Math.cos(time * 0.13 + b.phase * 1.7) * 0.32;
      }
    },
  };
}

