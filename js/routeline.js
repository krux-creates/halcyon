// The guidance line: when a trip is on, its route is laid out ahead of the shuttle the way a driving game draws its
// GPS path: a ribbon in the air a little below the shuttle, chevrons streaming along it toward where you are going,
// thin rails at its edges, fading in just ahead of the nose and out in the distance. The path follows the route's
// waypoints (the avenues and the ring round the pagoda), so it shows the way round buildings, never through them.
import * as THREE from "three";
import { vec3, float, abs, fract, smoothstep, attribute, mix, sin } from "three/tsl";

const ss = (a, b, x) => (a > b ? float(1).sub(smoothstep(b, a, x)) : smoothstep(a, b, x));

export function createRouteLine(U, { segs = 260, width = 7, reach = 1100 } = {}) {
  const n = segs + 1;
  const pos = new Float32Array(n * 2 * 3), info = new Float32Array(n * 2 * 2);
  const idx = [];
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  const infoAttr = new THREE.BufferAttribute(info, 2);
  geo.setAttribute("position", posAttr);
  geo.setAttribute("aRoute", infoAttr);
  // (lies flat, facing up: the node materials ask for a normal even when unlit)
  geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 2 * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);

  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const R = attribute("aRoute", "vec2");
  const along = R.x, across = R.y; // metres from the nose, -1..1 across
  // chevrons: a V every 12 m, pointing the way, streaming forward
  const ph = fract(along.sub(abs(across).mul(3.2)).div(12.0).sub(U.time.mul(1.4)));
  const chev = smoothstep(0.0, 0.05, ph).mul(ss(0.3, 0.18, ph));
  const rails = smoothstep(0.82, 0.96, abs(across));
  const fade = smoothstep(8.0, 30.0, along).mul(ss(reach * 0.9, reach * 0.3, along));
  const pulse = sin(U.time.mul(2.2)).mul(0.08).add(0.92);
  const PINK = vec3(1.0, 0.32, 0.82), GOLD = vec3(1.0, 0.72, 0.3);
  const col = mix(PINK, GOLD, ss(0.0, 1.0, along.div(reach))).mul(chev.mul(1.25).add(rails.mul(0.55)).add(0.035)).mul(fade).mul(pulse);
  m.colorNode = col.mul(mix(float(0.7), float(1.0), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.5)));
  m.fog = false;
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;

  const curve = new THREE.CatmullRomCurve3([], false, "centripetal");
  const p = new THREE.Vector3(), t = new THREE.Vector3();
  let yNow = null;
  return {
    mesh,
    at: -1,
    /** Lay the line along points [{ x, z }] (the shuttle first) at height y. */
    set(points, y) {
      yNow = yNow === null ? y : yNow + (y - yNow) * 0.25;
      const pts = [];
      for (const q of points) {
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(q.x - last.x, q.z - last.z) > 3) pts.push(new THREE.Vector3(q.x, yNow, q.z));
      }
      if (pts.length < 2) return void (mesh.visible = false);
      curve.points = pts;
      const total = curve.getLength();
      const L = Math.min(total, reach);
      for (let i = 0; i < n; i++) {
        const s = (i / segs) * L;
        const u = Math.min(1, s / total);
        curve.getPointAt(u, p);
        curve.getTangentAt(u, t);
        const sx = t.z, sz = -t.x, sl = Math.hypot(sx, sz) || 1;
        const ox = (sx / sl) * width * 0.5, oz = (sz / sl) * width * 0.5;
        pos.set([p.x + ox, yNow, p.z + oz, p.x - ox, yNow, p.z - oz], i * 6);
        info.set([s, -1, s, 1], i * 4);
      }
      posAttr.needsUpdate = true;
      infoAttr.needsUpdate = true;
      mesh.visible = true;
    },
    hide() {
      mesh.visible = false;
      yNow = null;
    },
  };
}
