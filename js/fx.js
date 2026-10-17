// Shared light-and-haze helpers for the landmarks: their own fog (the haze softens a lit landmark without swallowing
// it) and camera-facing glows for beacons, lamps and the jewels on eave tips.
import * as THREE from "three";
import { vec3, float, mix, step, fract, length, max, pow, positionGeometry, instancedBufferAttribute, positionWorld, cameraPosition, normalize, uv, select, cross, Fn, uint } from "three/tsl";

/**
 * TSL's hash, compiled once as a real WGSL function. The built-in is inlined at every call and uses its argument about
 * six times inside, so hashes of hashes multiply the generated code (four levels deep cost a minute of compile time).
 * Takes a non-negative float (the integer part is what is hashed); returns [0, 1).
 */
const pcg = Fn(([v]) => {
  // PCG (pcg-random.org, via shadertoy XlGcRh). The input is declared u32 and converted at the call: inside a layout
  // function TSL drops the conversion of a float parameter, and WGSL then refuses f32 * u32.
  const s = v.mul(uint(747796405)).add(uint(2891336453)).toVar();
  const w = s.shiftRight(s.shiftRight(uint(28)).add(uint(4))).bitXor(s).mul(uint(277803737)).toVar();
  return float(w.shiftRight(uint(22)).bitXor(w)).mul(1 / 2 ** 32);
}).setLayout({ name: "halcyonHash", type: "float", inputs: [{ name: "v", type: "uint" }] });
export const hashF = (x) => pcg(uint(x));

/** A landmark's own fog: haze softens it but its lights carry. */
export function landmarkFog(U, col, amount) {
  return mix(col, U.hazeColor(normalize(positionWorld.sub(cameraPosition))), U.fogFactor().mul(amount));
}

/** Camera-facing glows for beacons: [x, y, z, size, r, g, b]. */
export function glowPoints(U, pts, { blink = true, gain = 3.0 } = {}) {
  const pos = new Float32Array(pts.length * 4), col = new Float32Array(pts.length * 4);
  pts.forEach((p, i) => {
    pos.set(p.slice(0, 4), i * 4);
    col.set([p[4], p[5], p[6], blink ? (i * 0.37) % 1 : -1], i * 4);
  });
  const P = instancedBufferAttribute(new THREE.InstancedBufferAttribute(pos, 4), "vec4");
  const C = instancedBufferAttribute(new THREE.InstancedBufferAttribute(col, 4), "vec4");
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const centre = P.xyz;
  const toCam = normalize(cameraPosition.sub(centre));
  const right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  const up = cross(toCam, right);
  const dist = length(cameraPosition.sub(centre));
  const size = P.w.mul(max(float(1.0), dist.div(1400.0)));
  m.positionNode = centre.add(right.mul(positionGeometry.x.mul(size))).add(up.mul(positionGeometry.y.mul(size)));
  const rr = length(uv().sub(0.5)).mul(2.0);
  const core = pow(max(float(1.0).sub(rr), 0.0), 5.0).add(pow(max(float(1.0).sub(rr), 0.0), 2.0).mul(0.15));
  const blinkOn = select(C.w.lessThan(0.0), float(1.0), step(0.5, fract(U.time.mul(0.5).add(C.w))).mul(0.85).add(0.15));
  m.colorNode = C.xyz.mul(core).mul(blinkOn).mul(gain).mul(float(1.0).sub(U.fogFactor().mul(0.5)));
  m.fog = false;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, pts.length);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return mesh;
}
