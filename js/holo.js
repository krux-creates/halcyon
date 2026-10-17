// The harbour's projections. A betta in blue light, the size of a ferry, swimming slowly over the water on the left:
// a lofted body with an ornate scale pattern, and fins made of fine rays (a veil of a tail, a long dorsal and anal fin,
// streamers under its chest) that ripple as it swims, each ray a thread of light; a beam from a projector on the
// water holds it up. And on the right, a woman kneeling on the bank in light, drawn clean: the picture itself, lit,
// with a slow sweep travelling up her and now and then a slip, the way a projection catches.
import * as THREE from "three";
import {
  vec2, vec3, float, mix, step, smoothstep, abs, fract, floor, sin, cos, length, max, min, pow, clamp, positionLocal,
  positionWorld, positionGeometry, uv, attribute, texture, normalView, positionViewDirection, dot, fwidth, mx_noise_float,
  hash as rawHash, uniform, instanceIndex, cameraPosition, normalize, cross,
} from "three/tsl";
import { hashF } from "./fx.js";

const hash = (x) => hashF(float(x).add(1048576.0));
const ss = (a, b, x) => (a > b ? float(1).sub(smoothstep(b, a, x)) : smoothstep(a, b, x));
const aaLine = (d, hw) => {
  const fw = clamp(fwidth(d), 1e-5, 1e4);
  const w = max(float(hw), fw.mul(0.8));
  return float(1).sub(smoothstep(w.sub(fw.mul(0.5)), w.add(fw.mul(0.5)), d)).mul(float(hw).div(w));
};
const gridD = (x, p) => abs(fract(x.div(p).add(0.5)).sub(0.5)).mul(p);

// ---------------------------------------------------------------------------------------------------------------------
// the woman in light: the picture itself, lit and clean
// ---------------------------------------------------------------------------------------------------------------------
export function buildHoloImage(U, { src = "assets/chars/holo.jpg", H = 205, aspect = 864 / 1536, lift = 20 } = {}) {
  const group = new THREE.Group();
  const uBuild = uniform(0);
  const W = H * aspect;
  const photo = new THREE.TextureLoader().load(src);
  photo.colorSpace = THREE.SRGBColorSpace;
  photo.anisotropy = 8;
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const u = uv();
  // now and then a thin band slips sideways for a moment
  const gtick = floor(U.time.mul(7.0));
  const slip = step(0.955, hash(gtick)).mul(step(abs(u.y.sub(hash(gtick.add(3.0)))), 0.02)).mul(hash(gtick.add(7.0)).sub(0.5).mul(0.035));
  const img = texture(photo, vec2(u.x.add(slip), u.y)).rgb;
  // the black around her is no light at all (and the jpeg's faint floor is cut away)
  const lit = max(img.sub(0.018), vec3(0.0)).mul(1.02);
  // a slow sweep of light up her (no scan lines: she is drawn clean)
  const sweep = ss(0.05, 0.0, abs(fract(u.y.sub(U.time.mul(0.055))).sub(0.5))).mul(0.45);
  const flick = step(0.03, fract(U.time.mul(0.23))).mul(0.1).add(0.9);
  const col = lit.mul(float(1.4).add(sweep)).mul(flick);
  // the build: up from a point of light where she kneels, a lattice running ahead of a bright scan line
  const front = mix(float(-0.06), float(1.08), uBuild);
  const ahead = u.y.sub(front);
  const shown = smoothstep(0.0, -0.012, ahead);
  const grid = max(aaLine(gridD(u.x, 0.025), 0.0012), aaLine(gridD(u.y, 0.016), 0.0009)).mul(smoothstep(0.1, 0.0, ahead)).mul(step(0.0, ahead));
  const figure = smoothstep(0.02, 0.12, max(max(img.r, img.g), img.b));
  const scanLine = aaLine(abs(ahead), 0.003).mul(figure.mul(0.8).add(0.2)).mul(step(uBuild, 0.999));
  const built = col.mul(shown).add(vec3(0.7, 0.55, 1.0).mul(grid.mul(figure.mul(0.85).add(0.15)).mul(0.9).add(scanLine.mul(2.2))));
  m.colorNode = built.mul(mix(float(0.4), float(1.0), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.45)));
  m.fog = false;
  // she floats above her projector, held up on its rays
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), m);
  plane.position.y = H / 2 + lift;
  plane.renderOrder = 7;
  group.add(plane);
  // the pool of light she is projected from
  const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pr = length(uv().sub(0.5)).mul(2.0);
  pm.colorNode = vec3(0.7, 0.35, 1.0).mul(pow(max(float(1.0).sub(pr), 0.0), 2.0)).mul(0.28).mul(mix(float(0.3), float(1.0), U.night));
  pm.fog = false;
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, W * 0.5), pm);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.4;
  group.add(pool);
  // the beam she is projected by: a cone of light opening up from the lens at her knees, thin rays running up it,
  // brightest at the lens and fading as they climb into her, pulses of light rising along them
  // (only as tall as the gap under her, and no wider than her knees, so its light never spills over her)
  group.add(projectionCone(U, { r0: 2.2, r1: W * 0.3, h: lift + 2, rgb: [0.82, 0.48, 1.0], gain: 1.0, uBuild, reach: 0.55 }));
  // light rising off the projector round her, slowly, fading as it climbs (in world space, so it is added beside her
  // turning group rather than inside it)
  const uOrigin = uniform(new THREE.Vector3());
  const rising = motes(U, 110, (age, h) => {
    const a = h.x.mul(6.2832), rr = h.y.mul(W * 0.42).add(4.0);
    return uOrigin.add(vec3(cos(a).mul(rr), age.mul(H * 0.8).add(1.0).add(lift * 0.3), sin(a).mul(rr).mul(0.6)));
  }, [0.78, 0.5, 1.0], 0.7);
  let t0 = null;
  return {
    group,
    motes: rising,
    build(time) {
      t0 = time;
    },
    update(time) {
      uOrigin.value.copy(group.position);
      if (t0 === null) return void (uBuild.value = 1);
      const since = time - t0;
      uBuild.value = Math.min(1, Math.max(0, (since - 0.9) / 2.8));
      if (since > 58) t0 = time - 0.9 - 2.8 * 0.4;
    },
  };
}

/**
 * A projector's cone of light: an open cone standing on its lens (radius r0 at the bottom, r1 at height h), drawn as a
 * haze thickest at its edges with thin rays of uneven brightness running up it, rising pulses, and a bright lens.
 */
export function projectionCone(U, { r0, r1, h, rgb, gain = 0.5, rays = 52, uBuild = null, reach = 1 }) {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r1, r0, h, 96, 1, true);
  geo.translate(0, h / 2 + 0.5, 0);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const q = uv(); // x round the cone, y up it (0 at the lens)
  m.colorNode = coneLight(U, q.x, q.y.mul(reach), rgb, gain, rays).mul(uBuild ? smoothstep(0.0, 0.25, uBuild).mul(0.6).add(0.4) : 1.0);
  m.fog = false;
  const cone = new THREE.Mesh(geo, m);
  cone.renderOrder = 6;
  group.add(cone);
  // the lens: a hot point of light on the ground
  const lm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const lr = length(uv().sub(0.5)).mul(2.0);
  lm.colorNode = vec3(...rgb).mul(pow(max(float(1.0).sub(lr), 0.0), 4.0).mul(2.4).add(ss(0.1, 0.0, abs(lr.sub(0.62))).mul(0.6))).mul(mix(float(0.35), float(1.0), U.night));
  lm.fog = false;
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(r0 * 7, r0 * 7), lm);
  lens.rotation.x = -Math.PI / 2;
  lens.position.y = 0.55;
  lens.renderOrder = 6;
  group.add(lens);
  return group;
}

/** The light of a projector cone at (around 0..1, up 0..1): rays, haze, rising pulses; shared by the woman and the jellies. */
export function coneLight(U, around, up, rgb, gain, rays = 52) {
  const t = U.time;
  const ri = around.mul(rays);
  const id = floor(ri);
  const rayGain = hash(id.add(17.0)).mul(0.8).add(0.2).mul(sin(t.mul(mix(float(0.6), float(1.8), hash(id.add(3.0)))).add(id.mul(2.3))).mul(0.25).add(0.75));
  const ray = aaLine(gridD(ri, 1.0), 0.07).mul(rayGain).mul(step(0.3, hash(id.add(41.0))));
  const pulse = ss(0.07, 0.0, abs(fract(up.mul(2.4).sub(t.mul(0.35)).add(hash(id).mul(0.6))).sub(0.5))).mul(ray).mul(1.2);
  const fadeUp = pow(float(1.0).sub(up), 1.7);
  const haze = float(0.06).add(ray.mul(0.55)).add(pulse);
  return vec3(...rgb).mul(haze.mul(fadeUp).mul(gain)).mul(mix(float(0.3), float(1.0), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.5)));
}

/**
 * Light motes: camera-facing glints whose positions are a pure function of time (no state on the CPU). Each one lives
 * a few seconds; at(age 0..1, hash vec3) says where it is, in world space.
 */
function motes(U, count, at, rgb, size = 0.6) {
  const h = vec3(hash(instanceIndex.add(11)), hash(instanceIndex.add(37)), hash(instanceIndex.add(71)));
  const age = fract(U.time.div(mix(float(4.0), float(7.0), h.z)).add(h.x.mul(13.0)));
  const centre = at(age, h);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const toCam = normalize(cameraPosition.sub(centre));
  const right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  const up = cross(toCam, right);
  const s = float(size).mul(h.y.mul(0.8).add(0.6));
  m.positionNode = centre.add(right.mul(positionGeometry.x.mul(s))).add(up.mul(positionGeometry.y.mul(s)));
  const rr = length(uv().sub(0.5)).mul(2.0);
  const glow = pow(max(float(1.0).sub(rr), 0.0), 2.5);
  const life = sin(age.mul(3.14159));
  const tw = sin(U.time.mul(mix(float(2.0), float(5.0), h.x)).add(h.y.mul(40.0))).mul(0.3).add(0.7);
  m.colorNode = vec3(...rgb).mul(glow).mul(life).mul(tw).mul(1.8).mul(mix(float(0.3), float(1.0), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.5)));
  m.fog = false;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  return mesh;
}
