// Engine trails: a ribbon of heat behind each of HL-07's three engines, laid along where the nozzle has just been, so it
// bends through turns and stretches with speed. Hot at the nozzle, cooling to pink and fading to nothing, and held back
// so it glows under the bloom without flaring. The ribbon turns about its own length to face the camera.
import * as THREE from "three";
import { vec3, float, mix, smoothstep, attribute, normalize, cross, cameraPosition, positionGeometry, pow, max, abs, length, select } from "three/tsl";

export function createTrails(U, { engines, widths, points = 30 }) {
  const n = engines.length;
  const verts = n * points * 2;
  const P = new Float32Array(verts * 3), D = new Float32Array(verts * 3), T = new Float32Array(verts * 3);
  const idx = [];
  for (let e = 0; e < n; e++)
    for (let i = 0; i < points - 1; i++) {
      const a = (e * points + i) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  // along (0 at the nozzle, 1 at the end), across (-1 / 1), half-width in metres: fixed per vertex
  for (let e = 0; e < n; e++)
    for (let i = 0; i < points; i++)
      for (let s = 0; s < 2; s++) T.set([i / (points - 1), s ? 1 : -1, widths[e] ?? 0.6], ((e * points + i) * 2 + s) * 3);
  const geo = new THREE.BufferGeometry();
  const pA = new THREE.BufferAttribute(P, 3), dA = new THREE.BufferAttribute(D, 3);
  geo.setAttribute("position", pA);
  geo.setAttribute("aDir", dA);
  geo.setAttribute("aT", new THREE.BufferAttribute(T, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  geo.setIndex(idx);

  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const t = attribute("aT", "vec3");
  const dir = attribute("aDir", "vec3");
  const along = t.x;
  const toCam = cameraPosition.sub(positionGeometry);
  const side = cross(dir, toCam);
  // (a segment seen straight down its length has no side: fall back to the world's up)
  const sideN = select(length(side).lessThan(1e-4), vec3(0.0, 1.0, 0.0), normalize(side));
  const taper = mix(float(1.0), float(0.3), along);
  m.positionNode = positionGeometry.add(sideN.mul(t.y.mul(t.z).mul(taper)));
  const core = pow(max(float(1.0).sub(abs(t.y)), 0.0), 1.6);
  const fade = pow(float(1.0).sub(along), 1.7).mul(smoothstep(0.0, 0.04, along));
  const col = mix(vec3(1.0, 0.56, 0.22), vec3(1.0, 0.22, 0.62), smoothstep(0.1, 0.7, along));
  m.colorNode = col.mul(core).mul(fade).mul(U.speed).mul(mix(float(0.45), float(0.9), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.5)));
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;

  const hist = engines.map(() => Array.from({ length: points }, () => new THREE.Vector3()));
  const w = new THREE.Vector3(), back = new THREE.Vector3();
  let primed = false;
  return {
    mesh,
    /** Shift each trail back one step and lay its head at the nozzle (in the shuttle's group, whose matrix is current). */
    update(group) {
      back.set(0, 0, 1).applyQuaternion(group.quaternion);
      engines.forEach((local, e) => {
        const h = hist[e];
        w.copy(local).applyMatrix4(group.matrixWorld);
        // a jump (boarding, a recall, a rescue) starts the trail afresh rather than drawing a streak across the city
        if (!primed || w.distanceTo(h[0]) > 25) for (const p of h) p.copy(w);
        else {
          for (let i = points - 1; i > 0; i--) h[i].copy(h[i - 1]);
          h[0].copy(w);
        }
        for (let i = 0; i < points; i++) {
          const a = h[Math.max(0, i - 1)], b = h[Math.min(points - 1, i + 1)];
          let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const l = Math.hypot(dx, dy, dz);
          if (l < 1e-3) (dx = back.x), (dy = back.y), (dz = back.z);
          for (let s = 0; s < 2; s++) {
            const k = ((e * points + i) * 2 + s) * 3;
            P[k] = h[i].x;
            P[k + 1] = h[i].y;
            P[k + 2] = h[i].z;
            D[k] = dx;
            D[k + 1] = dy;
            D[k + 2] = dz;
          }
        }
      });
      primed = true;
      pA.needsUpdate = true;
      dA.needsUpdate = true;
    },
  };
}
