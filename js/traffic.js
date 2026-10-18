// Kraken Port's air traffic: a swarm of hover-cars (after Rive City's sky full of red light bars), streaming in lanes
// down every channel canyon, across every cross canal and in high sky lanes over the roofs. The lanes form a lattice
// that repeats across the endless city, and every car lives in camera space: its lane is the nearest lattice line to
// you (give or take a few), its place along the lane wraps round you, so the swarm is everywhere you go with a fixed
// number of cars. Motion is computed on the GPU; carAt() is the same maths on the CPU for the HUD's lock-ons.
import * as THREE from "three";
import {
  vec2, vec3, float, fract, floor, mix, select, step, sin, abs, max, pow, length, normalize, cross, uv, dot,
  instancedBufferAttribute, positionGeometry, normalGeometry, cameraPosition, smoothstep,
} from "three/tsl";
import { rng } from "./port.js";
import { WORLD } from "./world.js";

const WINDOW = 1800; // metres of lane kept round the camera

/** Lane families: axis 1 lanes run north–south (down the channels), axis 0 lanes run east–west (along cross canals). */
function families(quality) {
  const Q = quality.particles ?? 1;
  const fam = [];
  // the channel canyons: low and busy
  // (dense, the way Rive City's canyon streams with tail lights at every height)
  for (const y of [26, 38, 54, 72, 94, 120, 150, 186]) for (const o of [-24, -10, 10, 24]) fam.push({ axis: 1, P: WORLD.CH, O: o, y, speed: 34 + (y % 7) * 4, n: Math.max(2, Math.round(11 * Q)), K: [-1, 0, 1] });
  // the cross canals
  for (const y of [32, 50, 74, 102, 136]) for (const o of [-9, 9]) fam.push({ axis: 0, P: WORLD.CR, O: WORLD.Z0 + o, y, speed: 30 + (y % 5) * 5, n: Math.max(2, Math.round(8 * Q)), K: [-2, -1, 0, 1, 2] });
  // high sky lanes over the roofs, both ways
  for (const y of [330, 362, 398]) {
    fam.push({ axis: 1, P: 420, O: 210, y, speed: 70, n: Math.max(2, Math.round(8 * Q)), K: [-2, -1, 0, 1, 2] });
    fam.push({ axis: 0, P: 420, O: 0, y: y + 14, speed: 64, n: Math.max(2, Math.round(8 * Q)), K: [-2, -1, 0, 1, 2] });
  }
  return fam;
}

export function createTraffic(U, quality = { particles: 1 }) {
  const r = rng(77);
  const cars = [];
  for (const f of families(quality)) {
    for (const k of f.K) {
      for (let i = 0; i < f.n; i++) {
        const dir = (i + k + 100) % 2 === 0 ? 1 : -1; // half the cars each way in every lane set
        cars.push({
          axis: f.axis, P: f.P, O: f.O + (dir > 0 ? 3 : -3), y: f.y + (r() - 0.5) * 6, dir, speed: f.speed * (0.8 + r() * 0.45), k,
          phase: r() * WINDOW, tint: r(), id: "HX-" + (1000 + Math.floor(r() * 8999)),
        });
      }
    }
  }
  const group = new THREE.Group();
  group.add(bodies(U, cars));
  group.add(lights(U, cars));
  return {
    group,
    cars,
    /** Where car i is at `time` with the camera at `cam` (the CPU twin of the GPU motion). */
    carAt(i, time, cam, out = new THREE.Vector3()) {
      const c = cars[i];
      const perpCam = c.axis ? cam.x : cam.z;
      const alongCam = c.axis ? cam.z : cam.x;
      const lane = Math.floor((perpCam - c.O) / c.P + 0.5) + c.k;
      const perp = c.O + lane * c.P;
      const u = (c.phase + time * c.speed * c.dir - alongCam) / WINDOW;
      const f = u - Math.floor(u);
      const s = f * WINDOW - WINDOW / 2 + alongCam;
      const bob = Math.sin(time * 0.9 + c.phase) * 0.6;
      const z = c.axis ? s : perp;
      out.edge = z > WORLD.SHORE - 30 ? 0 : Math.min(f / 0.08, (1 - f) / 0.08, 1);
      return c.axis ? out.set(perp, c.y + bob, s) : out.set(s, c.y + bob, perp);
    },
  };
}

function attrsFor(cars, repeat = 1) {
  const a = new Float32Array(cars.length * repeat * 4), b = new Float32Array(cars.length * repeat * 4);
  let i = 0;
  for (const c of cars)
    for (let k = 0; k < repeat; k++, i++) {
      a.set([c.axis, c.P, c.O, c.y], i * 4);
      b.set([c.dir * c.speed, c.phase, c.k, c.tint], i * 4);
    }
  return [instancedBufferAttribute(new THREE.InstancedBufferAttribute(a, 4), "vec4"), instancedBufferAttribute(new THREE.InstancedBufferAttribute(b, 4), "vec4")];
}
/** The lane maths in TSL: centre, forward and right for a car given its lane attributes. */
function laneFrame(U, A, B) {
  const axis = A.x, P = A.y, O = A.z;
  const perpCam = mix(cameraPosition.z, cameraPosition.x, axis);
  const alongCam = mix(cameraPosition.x, cameraPosition.z, axis);
  const lane = floor(perpCam.sub(O).div(P).add(0.5)).add(B.z);
  const perp = O.add(lane.mul(P));
  const u = B.y.add(U.time.mul(B.x)).sub(alongCam).div(WINDOW);
  const s = fract(u).mul(WINDOW).sub(WINDOW / 2).add(alongCam);
  const bob = sin(U.time.mul(0.9).add(B.y)).mul(0.6);
  const centre = mix(vec3(s, A.w.add(bob), perp), vec3(perp, A.w.add(bob), s), axis);
  const dir = select(B.x.lessThan(0.0), float(-1.0), float(1.0));
  const forward = mix(vec3(dir, 0.0, 0.0), vec3(0.0, 0.0, dir), axis);
  const right = mix(vec3(0.0, 0.0, dir.negate()), vec3(dir, 0.0, 0.0), axis);
  // cars at the ends of the window (where they wrap round) shrink away, and none fly out over the open sea
  const zOf = mix(perp, s, axis);
  const overCity = smoothstep(WORLD.SHORE + 30.0, WORLD.SHORE - 30.0, zOf);
  const edge = smoothstep(0.0, 0.05, fract(u)).mul(smoothstep(1.0, 0.95, fract(u))).mul(overCity);
  return { centre, forward, right, edge };
}

// ---- bodies: a low wedge with a canopy and side pods, dark lacquer, lit by its own strips (forward is +z) --------------
function carGeometry() {
  const parts = [];
  const body = new THREE.BoxGeometry(2.5, 0.7, 5.4, 1, 1, 3);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), y = p.getY(i);
    if (z > 1.5 && y > 0) p.setY(i, y - (z - 1.5) * 0.28); // the nose slopes down
    if (z > 2.2) p.setX(i, p.getX(i) * 0.82);
  }
  parts.push(body);
  const canopy = new THREE.BoxGeometry(1.6, 0.5, 2.2);
  canopy.translate(0, 0.55, -0.4);
  parts.push(canopy);
  for (const sx of [-1, 1]) {
    const pod = new THREE.BoxGeometry(0.45, 0.4, 4.6);
    pod.translate(sx * 1.45, -0.12, -0.2);
    parts.push(pod);
  }
  return mergeGeos(parts);
}
function bodies(U, cars) {
  const [A, B] = attrsFor(cars);
  const { centre, forward, right, edge } = laneFrame(U, A, B);
  const pg = positionGeometry;
  const m = new THREE.MeshBasicNodeMaterial();
  m.positionNode = centre.add(right.mul(pg.x.mul(edge))).add(vec3(0.0, pg.y.mul(edge), 0.0)).add(forward.mul(pg.z.mul(edge)));
  const nW = right.mul(normalGeometry.x).add(vec3(0.0, normalGeometry.y, 0.0)).add(forward.mul(normalGeometry.z));
  const sky = U.hazeColor(normalize(nW.add(vec3(0.0, 0.7, 0.0)))).mul(0.5);
  const base = vec3(0.025, 0.026, 0.03).add(sky.mul(max(normalGeometry.y, 0.0).mul(0.6).add(0.15)));
  const tail = step(pg.z, -2.62).mul(step(abs(pg.y.sub(0.05)), 0.16));
  const nose = step(2.62, pg.z).mul(step(abs(pg.y.add(0.05)), 0.12));
  const tailC = select(B.w.lessThan(0.8), vec3(1.0, 0.07, 0.04), vec3(1.0, 0.25, 0.65));
  m.colorNode = base.add(tailC.mul(tail).mul(3.0)).add(vec3(0.75, 0.9, 1.0).mul(nose).mul(1.6));
  const mesh = new THREE.InstancedMesh(carGeometry(), m, cars.length);
  mesh.frustumCulled = false;
  return mesh;
}

// ---- lights: the tail bar (the swarm's red), headlights and an underglow, riding with each car ------------------------
function lights(U, cars) {
  const L = [
    [0, 0.05, -2.75, 2.4, 0.42, 0], // x y z width height kind (0 tail bar, 1 headlight, 2 underglow)
    [-0.8, -0.05, 2.75, 0.5, 0.5, 1],
    [0.8, -0.05, 2.75, 0.5, 0.5, 1],
    [0, -0.6, 0, 4.2, 2.2, 2],
  ];
  const [A, B] = attrsFor(cars, L.length);
  const n = cars.length * L.length;
  const o = new Float32Array(n * 4), k = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const l = L[i % L.length];
    o.set(l.slice(0, 4), i * 4);
    k.set([l[4], l[5]], i * 2);
  }
  const O = instancedBufferAttribute(new THREE.InstancedBufferAttribute(o, 4), "vec4");
  const K = instancedBufferAttribute(new THREE.InstancedBufferAttribute(k, 2), "vec2");
  const { centre, forward, right, edge } = laneFrame(U, A, B);
  const at = centre.add(right.mul(O.x)).add(vec3(0.0, O.y, 0.0)).add(forward.mul(O.z));
  const toCam = normalize(cameraPosition.sub(at));
  const dist = length(cameraPosition.sub(at));
  const side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  const up = cross(toCam, side);
  const kind = K.y;
  const grow = max(float(1.0), dist.div(240.0)); // far lights keep a size so the swarm reads as streaks
  // the tail bar is a strip across the car (a bar from behind, a sliver from the side); the rest face the camera
  const isTail = step(kind, 0.5);
  const ax = mix(side, right, isTail);
  const ay = mix(up, vec3(0.0, 1.0, 0.0), isTail);
  const w = O.w.mul(grow).mul(edge), h = K.x.mul(grow).mul(edge);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
  m.positionNode = at.add(ax.mul(positionGeometry.x.mul(w))).add(ay.mul(positionGeometry.y.mul(h)));
  const q = uv().sub(0.5).mul(2.0);
  const core = pow(max(float(1.0).sub(length(q)), 0.0), 2.2);
  const bar = pow(max(float(1.0).sub(abs(q.y)), 0.0), 3.0).mul(smoothstep(1.0, 0.7, abs(q.x)));
  const tailC = select(B.w.lessThan(0.8), vec3(1.0, 0.08, 0.05), vec3(1.0, 0.25, 0.7));
  const underC = select(B.w.lessThan(0.5), vec3(1.0, 0.1, 0.25), select(B.w.lessThan(0.8), vec3(0.2, 0.7, 1.0), vec3(0.8, 0.2, 1.0)));
  const col = select(kind.lessThan(0.5), tailC.mul(bar).mul(2.6), select(kind.lessThan(1.5), vec3(0.85, 0.92, 1.0).mul(core).mul(1.6), underC.mul(core).mul(0.35)));
  // a car shows its headlights to you from the front and its tail bar from behind
  const towardCam = dot(normalize(cameraPosition.sub(centre)), forward);
  const show = select(kind.lessThan(0.5), smoothstep(0.2, -0.4, towardCam).mul(0.75).add(0.25), select(kind.lessThan(1.5), smoothstep(-0.2, 0.4, towardCam).mul(0.8).add(0.2), float(1.0)));
  m.colorNode = col.mul(show).mul(mix(float(0.6), float(1.15), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.65)));
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, n);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return mesh;
}

function mergeGeos(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uvs = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uvs.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return out;
}

void vec2;
