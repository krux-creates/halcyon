// The jellyfish: a bloom of them drifting in the air over the harbour, projected in light. Each is a translucent bell
// (lit at its rim, four horseshoe gonads glowing inside, sixteen radial canals) dusted with points of light, a fringe of
// fine tentacles and four frilled oral arms trailing below. They swim the way moon jellies do: the bell snaps shut and
// the jelly lifts, then it relaxes slowly open and sinks a little; the tentacles trail behind the pulse and sway.
// After the jellyfish on ThreeUI (Noctiluca's lone glowing bell, the Abyss variant's swarm of point-cloud jellies),
// built here from scratch. Everything moves on the GPU as a function of time.
import * as THREE from "three";
import {
  vec2, vec3, float, mix, step, smoothstep, abs, fract, floor, sin, cos, exp, length, max, min, pow, clamp,
  positionGeometry, uv, cameraPosition, normalize, cross, dot, instancedBufferAttribute, uniform, atan2, varying,
} from "three/tsl";
import { coneLight } from "./holo.js";

const TAU = Math.PI * 2;
const ss = (a, b, x) => (a > b ? float(1).sub(smoothstep(b, a, x)) : smoothstep(a, b, x));

/**
 * The pulse of a bell at time t: c (0 relaxed .. 1 contracted), fast to contract and slow to relax; and the lift it
 * has gained (a rising staircase that eases back down between beats, so it bobs up and settles).
 */
function pulse(t, phase, period) {
  const f = fract(t.div(period).add(phase));
  const c = min(smoothstep(0.0, 0.22, f).mul(ss(1.0, 0.3, f)).mul(1.15), 1.0);
  const lift = smoothstep(0.05, 0.4, f).sub(f.mul(0.85));
  return { c, lift, f };
}

/** A point on the bell at (u around, v from the crown 0 to the rim 1), relative to the jelly's centre, size R. */
function bellPoint(u, v, R, c) {
  const a = u.mul(TAU);
  const k = v.mul(Math.PI * 0.5);
  // relaxed: a wide shallow dome; contracted: narrower and taller, the margin curling in
  const rad = R.mul(pow(sin(k), 0.85)).mul(float(1.0).sub(c.mul(0.2)));
  const curl = smoothstep(0.78, 1.0, v).mul(c).mul(R).mul(0.16);
  const y = R.mul(0.6).mul(cos(k)).mul(float(1.0).add(c.mul(0.14))).sub(curl.mul(0.6));
  return vec3(cos(a).mul(rad.sub(curl)), y, sin(a).mul(rad.sub(curl)));
}

export function buildJellies(U, { jellies }) {
  const group = new THREE.Group();
  const uBuild = uniform(1);
  // ---- the points: bell dust, the rim, tentacles, oral arms ---------------------------------------------------------
  const pts = []; // [jelly index, kind, u, v]
  const J = jellies.map((j, i) => ({ phase: (i * 0.37) % 1, period: 3.4, hue: 0, L: j.R * 4, ...j, i }));
  for (const j of J) {
    const scale = j.R / 16;
    const rings = Math.round(18 + 10 * scale);
    for (let k = 0; k < rings; k++) {
      const v = (k + 0.5) / rings;
      const n = Math.round((8 + 70 * Math.sin((v * Math.PI) / 2)) * Math.min(1.3, 0.55 + scale * 0.6));
      for (let i = 0; i < n; i++) pts.push([j.i, 0, (i + Math.random() * 0.6) / n, v + (Math.random() - 0.5) * (0.6 / rings)]);
    }
    const rimN = Math.round(70 + 80 * scale);
    for (let i = 0; i < rimN; i++) pts.push([j.i, 1, i / rimN, 1]);
    const T = j.tentacles ?? Math.round(14 + 10 * scale);
    const per = Math.round(34 + 30 * scale);
    for (let t = 0; t < T; t++) for (let i = 0; i < per; i++) pts.push([j.i, 2, (t + 0.5) / T, i / (per - 1)]);
    const armsPer = Math.round(50 + 40 * scale);
    for (let a = 0; a < 4; a++) for (let i = 0; i < armsPer; i++) pts.push([j.i, 3, a / 4, i / (armsPer - 1)]);
  }
  const N = pts.length;
  const aPt = new Float32Array(N * 4), aJ = new Float32Array(N * 4), aJ2 = new Float32Array(N * 4);
  pts.forEach((p, k) => {
    const j = J[p[0]];
    aPt.set([p[1], p[2], p[3], Math.random()], k * 4);
    aJ.set([j.x, j.y, j.z, j.R], k * 4);
    aJ2.set([j.phase, j.period, j.hue, j.L], k * 4);
  });
  const P = instancedBufferAttribute(new THREE.InstancedBufferAttribute(aPt, 4), "vec4");
  const Jp = instancedBufferAttribute(new THREE.InstancedBufferAttribute(aJ, 4), "vec4");
  const J2 = instancedBufferAttribute(new THREE.InstancedBufferAttribute(aJ2, 4), "vec4");
  const t = U.time;
  const kind = P.x, u = P.y, v = P.z, rnd = P.w;
  const R = Jp.w, phase = J2.x, period = J2.y, hue = J2.z, Lt = J2.w;
  const { c, lift } = pulse(t, phase, period);
  // the jelly's centre: a slow drift, the pulse's lift
  const drift = vec3(sin(t.mul(0.05).add(phase.mul(TAU))).mul(R.mul(1.4)), sin(t.mul(0.07).add(phase.mul(9.0))).mul(R.mul(0.5)).add(lift.mul(R.mul(0.35))), cos(t.mul(0.04).add(phase.mul(5.0))).mul(R.mul(0.8)));
  const C = Jp.xyz.add(drift);
  const is = (k) => float(1.0).sub(step(0.5, abs(kind.sub(k))));
  // bell dust and the rim
  const onBell = bellPoint(u, v, R, c);
  // tentacles: hang from the rim, trail behind the pulse (the stroke pulls them up, they sink back), sway in waves
  const ta = u.mul(TAU);
  const lag = pulse(t.sub(v.mul(1.1)), phase, period).c;
  const rimR = R.mul(float(1.0).sub(c.mul(0.2))).mul(0.96);
  const hang = v.mul(Lt).mul(float(1.0).sub(lag.mul(0.18)));
  const sway = vec3(sin(t.mul(0.9).sub(v.mul(5.0)).add(ta.mul(3.0))), 0.0, cos(t.mul(0.75).sub(v.mul(4.2)).add(ta.mul(2.0)))).mul(v.mul(v).mul(R.mul(0.55)));
  const narrow = mix(float(1.0), float(0.55), smoothstep(0.0, 0.5, v)).add(lag.mul(v).mul(0.25));
  const onTent = vec3(cos(ta).mul(rimR.mul(narrow)), hang.negate(), sin(ta).mul(rimR.mul(narrow))).add(sway);
  // oral arms: four frilled ribbons spiralling down from the centre
  const aa = u.mul(TAU).add(v.mul(2.2)).add(sin(t.mul(0.6).add(u.mul(7.0))).mul(0.3));
  const frill = sin(v.mul(46.0).add(t.mul(1.5)).add(rnd.mul(3.0))).mul(R.mul(0.07)).mul(v.add(0.2));
  const armR = R.mul(0.12).add(R.mul(0.1).mul(sin(v.mul(Math.PI)))).add(frill);
  const onArm = vec3(cos(aa).mul(armR), v.mul(Lt).mul(0.55).negate().sub(R.mul(0.05)), sin(aa).mul(armR)).add(sway.mul(0.5));
  const local = onBell.mul(is(0).add(is(1))).add(onTent.mul(is(2))).add(onArm.mul(is(3)));
  // the build: the projection draws from the crown down to the tips
  const reveal = clamp(uBuild.mul(1.5).sub(mix(v.mul(0.25), float(0.25).add(v.mul(0.5)), step(1.5, kind))), 0.0, 1.0);
  const centre = C.add(local);
  const toCam = normalize(cameraPosition.sub(centre));
  const right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  const up = cross(toCam, right);
  const dist = length(cameraPosition.sub(centre));
  const px = max(R.mul(0.03), dist.mul(0.0011)).mul(mix(float(0.7), float(1.3), rnd)).mul(mix(float(1.0), float(1.5), is(1)));
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.positionNode = centre.add(right.mul(positionGeometry.x.mul(px))).add(up.mul(positionGeometry.y.mul(px)));
  const rr = length(uv().sub(0.5)).mul(2.0);
  const dot0 = pow(max(float(1.0).sub(rr), 0.0), 2.2);
  const BLUE = vec3(0.35, 0.72, 1.0), PINK = vec3(1.0, 0.35, 0.75), WHITE = vec3(0.85, 0.95, 1.0);
  const tint = mix(BLUE, PINK, hue);
  const bright = mix(float(0.55), float(1.0), v).mul(is(0)).add(float(1.6).mul(is(1)))
    .add(float(1.0).sub(v.mul(0.75)).mul(0.9).mul(is(2))).add(float(1.1).sub(v.mul(0.6)).mul(is(3)));
  const sparkle = step(0.94, fract(rnd.mul(13.0).add(t.mul(0.4)))).mul(1.5);
  const col = mix(tint, WHITE, is(1).mul(0.5).add(sparkle.mul(0.3))).mul(bright.add(sparkle)).mul(dot0).mul(reveal).mul(c.mul(0.35).add(0.85));
  m.colorNode = col.mul(mix(float(0.45), float(1.0), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.5))).mul(0.9);
  m.fog = false;
  const dust = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, N);
  dust.frustumCulled = false;
  dust.renderOrder = 7;
  group.add(dust);

  // ---- the bells: translucent domes with a bright margin, radial canals and four glowing gonads -------------------------
  {
    const geo = new THREE.SphereGeometry(1, 64, 24, 0, TAU, 0, Math.PI / 2);
    const n = J.length;
    const a1 = new Float32Array(n * 4), a2 = new Float32Array(n * 4);
    J.forEach((j, i) => {
      a1.set([j.x, j.y, j.z, j.R], i * 4);
      a2.set([j.phase, j.period, j.hue, j.L], i * 4);
    });
    const B1 = instancedBufferAttribute(new THREE.InstancedBufferAttribute(a1, 4), "vec4");
    const B2 = instancedBufferAttribute(new THREE.InstancedBufferAttribute(a2, 4), "vec4");
    const Rb = B1.w, ph = B2.x, per = B2.y, hb = B2.z;
    const pb = pulse(t, ph, per);
    const driftB = vec3(sin(t.mul(0.05).add(ph.mul(TAU))).mul(Rb.mul(1.4)), sin(t.mul(0.07).add(ph.mul(9.0))).mul(Rb.mul(0.5)).add(pb.lift.mul(Rb.mul(0.35))), cos(t.mul(0.04).add(ph.mul(5.0))).mul(Rb.mul(0.8)));
    // map the hemisphere's (around, from the crown) onto the bell
    const g = positionGeometry;
    const vb = atan2(length(vec2(g.x, g.z)), g.y).div(Math.PI * 0.5);
    const ub = atan2(g.z, g.x).div(TAU).add(0.5);
    const local = bellPoint(ub, vb, Rb, pb.c);
    const mb = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const world = B1.xyz.add(driftB).add(local);
    mb.positionNode = world;
    const vV = varying(vb), uV = varying(ub), wV = varying(world), cV = varying(pb.c);
    const nrm = normalize(vec3(cos(uV.mul(TAU)).mul(sin(vV.mul(Math.PI * 0.5))), cos(vV.mul(Math.PI * 0.5)).mul(1.3), sin(uV.mul(TAU)).mul(sin(vV.mul(Math.PI * 0.5)))));
    const view = normalize(cameraPosition.sub(wV));
    const fres = pow(float(1.0).sub(abs(dot(nrm, view))), 2.0);
    // sixteen radial canals, the ring canal at the margin, the four horseshoe gonads round the crown
    const canalD = abs(fract(uV.mul(16.0).add(0.5)).sub(0.5));
    const canals = ss(0.07, 0.0, canalD).mul(smoothstep(0.15, 0.4, vV));
    const ringCanal = ss(0.03, 0.0, abs(vV.sub(0.93)));
    const lobe = abs(sin(uV.mul(TAU * 2.0)));
    const gon = ss(0.1, 0.0, abs(vV.sub(mix(float(0.22), float(0.4), lobe)))).mul(smoothstep(0.2, 0.6, lobe));
    const margin = smoothstep(0.86, 1.0, vV);
    const tintB = mix(vec3(0.3, 0.65, 1.0), vec3(1.0, 0.35, 0.75), hb);
    const body = tintB.mul(fres.mul(0.55).add(0.035)).add(tintB.mul(canals.mul(0.35))).add(vec3(0.75, 0.9, 1.0).mul(ringCanal.add(margin.mul(0.6)).mul(0.6)))
      .add(vec3(1.0, 0.5, 0.85).mul(gon).mul(0.8));
    const revealB = clamp(uBuild.mul(1.5).sub(vV.mul(0.25)), 0.0, 1.0);
    mb.colorNode = body.mul(cV.mul(0.4).add(0.8)).mul(revealB).mul(mix(float(0.45), float(1.0), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.5)));
    mb.fog = false;
    const bells = new THREE.InstancedMesh(geo, mb, n);
    bells.frustumCulled = false;
    bells.renderOrder = 6;
    group.add(bells);

    // ---- the beams they are projected by: a cone of light from a lens on the water up into each bell, following it as
    //      it drifts and lifts ------------------------------------------------------------------------------------------
    const bgeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true);
    bgeo.translate(0, 0.5, 0);
    const bm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const top = B1.y.add(driftB.y).sub(Rb.mul(0.1));
    const g2 = positionGeometry;
    const radius = mix(float(0.9), Rb.mul(0.78), g2.y);
    bm.positionNode = vec3(B1.x.add(driftB.x).add(g2.x.mul(radius)), float(0.3).add(g2.y.mul(top.sub(0.3))), B1.z.add(driftB.z).add(g2.z.mul(radius)));
    const bq = uv();
    const tintBeam = mix(vec3(0.35, 0.7, 1.0), vec3(1.0, 0.4, 0.8), hb);
    // (cylinder uv: y is 0 at the lens; the fade is eased so the rays still reach the bell, high as it floats)
    bm.colorNode = coneLight(U, bq.x, bq.y.mul(0.62), [1, 1, 1], 0.42, 36).mul(tintBeam).mul(clamp(uBuild.mul(2.0), 0.0, 1.0));
    bm.fog = false;
    const beams = new THREE.InstancedMesh(bgeo, bm, n);
    beams.frustumCulled = false;
    beams.renderOrder = 5;
    group.add(beams);
  }

  let t0 = null;
  return {
    group,
    /** Project them in from points of light, crown first. */
    build(time) {
      t0 = time;
    },
    update(time) {
      uBuild.value = t0 === null ? 1 : Math.min(1, Math.max(0, (time - t0 - 0.3) / 2.4));
    },
  };
}

void floor;
void min;
void exp;
