// The HALCYON shuttle, HL-07: a passenger lander that comes down through Titan's haze and lands on the sea.
// A lifting body (white ceramic over black heat tiles, after Dream Chaser) with a wraparound visor and a row of
// lit portholes; two outrigger pods that carry the engines and float it on the methane, joined to the body by
// gull wings; twin fins canted out on the pods; an amber chine stripe, nav lights and engine glow.
// Metres; the nose points to -z. Built from lofted superellipse sections; the livery is painted in TSL from each
// vertex's place on its section (how far along, how far round), so stripes and windows follow the hull.
import * as THREE from "three";
import {
  uniform, attribute, vec2, vec3, float, mix, step, smoothstep, abs, fract, floor, sin, cos, hash, length, max, min, texture,
  positionGeometry, normalGeometry, clamp, uv, pow, cameraPosition, normalize, cross, positionWorld,
} from "three/tsl";

const TAU = Math.PI * 2;

/** Catmull-Rom through key sections; every ring is a superellipse with its own top and bottom. */
function loft(keys, { around = 72, steps = 90, caps = true } = {}) {
  const sample = (t) => {
    const f = t * (keys.length - 1);
    const i = Math.min(keys.length - 2, Math.floor(f));
    const u = f - i;
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    const pick = (n, def = 0) => cr(k0[n] ?? def, k1[n] ?? def, k2[n] ?? def, k3[n] ?? def);
    return {
      z: pick("z"), x: pick("x"), y: pick("y"),
      w: Math.max(0.002, pick("w")), top: Math.max(0.002, pick("top")), bot: Math.max(0.002, pick("bot")),
      pt: pick("pt", 2.6), pb: pick("pb", 3), vee: pick("vee", 0),
    };
  };
  const pos = [], sec = [];
  for (let j = 0; j <= steps; j++) {
    const k = sample(j / steps);
    for (let i = 0; i <= around; i++) {
      const a = (i / around) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      const up = s >= 0;
      const e = 2 / (up ? k.pt : k.pb);
      const x = Math.sign(c) * Math.pow(Math.abs(c), e) * k.w;
      let y = Math.sign(s) * Math.pow(Math.abs(s), e) * (up ? k.top : k.bot);
      if (!up) y -= k.vee * Math.pow(Math.max(0, 1 - Math.abs(x) / k.w), 1.5) * Math.abs(s); // a V keel
      pos.push(k.x + x, k.y + y, k.z);
      sec.push(j / steps, i / around);
    }
  }
  const index = [];
  const row = around + 1;
  for (let j = 0; j < steps; j++) for (let i = 0; i < around; i++) {
    const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  if (caps) {
    for (const [j, facing] of [[0, -1], [steps, 1]]) {
      const k = sample(j / steps);
      const centre = pos.length / 3;
      pos.push(k.x, k.y, k.z);
      sec.push(j / steps, 0.75);
      const first = pos.length / 3;
      for (let i = 0; i <= around; i++) {
        const v = j * row + i;
        pos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        sec.push(j / steps, i / around);
      }
      for (let i = 0; i < around; i++) {
        if (facing > 0) index.push(centre, first + i, first + i + 1);
        else index.push(centre, first + i + 1, first + i);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aSec", new THREE.Float32BufferAttribute(sec, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A wing or fin: a lens-shaped section at the root and at the tip, lofted straight, capped. */
function panelLoft(root, tip, { n = 40 } = {}) {
  // root/tip: { a: [x,y,z] leading edge, chord, thick, axis: 'z' (chord runs along +z), up: [x,y,z] thickness dir }
  const ring = (s) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / n;
      // lens: x from 0..1 along the chord and back; thickness by a rounded-nose airfoil-ish curve
      const along = t < 0.5 ? t * 2 : 2 - t * 2;
      const side = t < 0.5 ? 1 : -1;
      const th = s.thick * 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(along, 0.72)), 0.85) * (1 - 0.15 * along);
      pts.push([s.a[0] + s.dir[0] * along * s.chord + s.up[0] * th * side, s.a[1] + s.dir[1] * along * s.chord + s.up[1] * th * side, s.a[2] + s.dir[2] * along * s.chord + s.up[2] * th * side, along]);
    }
    return pts;
  };
  const r0 = ring(root), r1 = ring(tip);
  const pos = [], sec = [], index = [];
  for (const [r, v] of [[r0, 0], [r1, 1]]) for (const p of r) {
    pos.push(p[0], p[1], p[2]);
    sec.push(p[3], v);
  }
  for (let i = 0; i < n; i++) {
    const a = i, b = (i + 1) % n, c = n + i, d = n + ((i + 1) % n);
    index.push(a, b, c, b, d, c);
  }
  // caps
  for (const [base, flip] of [[0, true], [n, false]]) {
    for (let i = 1; i < n - 1; i++) flip ? index.push(base, base + i + 1, base + i) : index.push(base, base + i, base + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aSec", new THREE.Float32BufferAttribute(sec, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// ---- the shapes ------------------------------------------------------------------------------------------------
const BODY = [
  { z: -13.6, y: 0.62, w: 0.06, top: 0.05, bot: 0.05, pt: 2.2, pb: 2.2 },
  { z: -12.9, y: 0.58, w: 0.95, top: 0.5, bot: 0.42, pt: 2.3, pb: 2.6, vee: 0.05 },
  { z: -11.2, y: 0.5, w: 1.95, top: 1.02, bot: 0.8, pt: 2.5, pb: 2.9, vee: 0.16 },
  { z: -8.6, y: 0.42, w: 2.62, top: 1.42, bot: 1.0, pt: 2.7, pb: 3.1, vee: 0.26 },
  { z: -5.2, y: 0.36, w: 2.98, top: 1.66, bot: 1.12, pt: 2.8, pb: 3.2, vee: 0.3 },
  { z: -1.4, y: 0.36, w: 3.06, top: 1.7, bot: 1.14, pt: 2.8, pb: 3.2, vee: 0.3 },
  { z: 1.2, y: 0.4, w: 3.0, top: 1.64, bot: 0.86, pt: 2.8, pb: 3.4, vee: 0.22 }, // the planing step
  { z: 5.4, y: 0.46, w: 2.7, top: 1.46, bot: 0.76, pt: 2.8, pb: 3.4, vee: 0.18 },
  { z: 9.4, y: 0.56, w: 2.2, top: 1.16, bot: 0.62, pt: 2.9, pb: 3.4, vee: 0.12 },
  { z: 12.3, y: 0.64, w: 1.7, top: 0.88, bot: 0.5, pt: 3.0, pb: 3.4, vee: 0.08 },
  { z: 12.6, y: 0.64, w: 1.5, top: 0.76, bot: 0.44, pt: 3.0, pb: 3.4 },
];
const POD = [
  { z: -9.4, y: 0, w: 0.05, top: 0.05, bot: 0.05, pt: 2.1, pb: 2.1 },
  { z: -8.6, y: 0, w: 0.62, top: 0.6, bot: 0.5, pt: 2.2, pb: 2.4 },
  { z: -6.4, y: 0, w: 1.0, top: 0.98, bot: 0.8, pt: 2.3, pb: 2.6 },
  { z: -1.0, y: 0, w: 1.14, top: 1.12, bot: 0.88, pt: 2.3, pb: 2.7 },
  { z: 5.0, y: 0, w: 1.1, top: 1.08, bot: 0.84, pt: 2.3, pb: 2.7 },
  { z: 9.4, y: 0, w: 0.98, top: 0.96, bot: 0.76, pt: 2.3, pb: 2.6 },
  { z: 11.2, y: 0, w: 0.86, top: 0.84, bot: 0.66, pt: 2.2, pb: 2.4 },
];
const POD_X = 7.7, POD_Y = -0.75;

function letteringTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d");
  const paint = () => {
    g.clearRect(0, 0, 1024, 256);
    g.fillStyle = "#14161a";
    g.font = '300 132px Saira, sans-serif';
    g.fontStretch = "expanded";
    g.letterSpacing = "26px";
    g.textBaseline = "middle";
    g.fillText("HALCYON", 24, 120);
    g.font = '28px "Share Tech Mono", monospace';
    g.letterSpacing = "10px";
    g.fillStyle = "#9a6a00";
    g.fillText("HL-07  ·  KRAKEN PORT  ·  TITAN", 30, 214);
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

/** An equirect of the port to reflect: haze above, a band of lit towers at the horizon, dark sea below. */
function portEnvironment(night) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, 512);
  if (night) {
    sky.addColorStop(0, "#07050b");
    sky.addColorStop(0.38, "#2a1424");
    sky.addColorStop(0.5, "#5a2434");
    sky.addColorStop(0.52, "#0a0608");
    sky.addColorStop(1, "#020102");
  } else {
    sky.addColorStop(0, "#3a1c0c");
    sky.addColorStop(0.36, "#b0702e");
    sky.addColorStop(0.5, "#f2c27c");
    sky.addColorStop(0.52, "#2a180c");
    sky.addColorStop(1, "#0a0604");
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  // a skyline band with windows
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let x = 0; x < 1024; x += 6 + r() * 14) {
    const h = 20 + r() * 90, w = 8 + r() * 18;
    g.fillStyle = night ? "#0c0810" : "#3a2414";
    g.fillRect(x, 256 - h, w, h);
    if (night) for (let k = 0; k < h / 4; k++) if (r() < 0.35) {
      g.fillStyle = r() < 0.8 ? "#ffcf8a" : r() < 0.5 ? "#ff4fa8" : "#3fe3e8";
      g.fillRect(x + 1 + r() * (w - 3), 256 - h + k * 4, 2, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createShuttle() {
  const group = new THREE.Group();
  const U = {
    throttle: uniform(0.2),
    night: uniform(0),
    time: uniform(0),
    lights: uniform(1),
  };
  const letters = letteringTexture();
  const envDay = portEnvironment(false), envNight = portEnvironment(true);

  // ---- the livery, shared by hull and pods ----------------------------------------------------------------------
  // aSec.x: 0 at the nose to 1 at the tail; aSec.y: round the section, 0 = right side, 0.25 = top, 0.5 = left
  function hullMaterial({ hullLen, visor, portholes, lettering, podBand }) {
    const m = new THREE.MeshPhysicalNodeMaterial();
    const S = attribute("aSec", "vec2");
    const s = S.x, a = S.y;
    const e = sin(a.mul(TAU)); // elevation round the section: 1 top, -1 bottom
    const side = cos(a.mul(TAU)); // +1 right, -1 left
    const p = positionGeometry;
    const metres = s.mul(hullLen);
    // white ceramic above, black tiles below, the line between them just under the widest point
    const below = smoothstep(-0.12, -0.2, e);
    const tile = vec2(fract(p.x.mul(3.2)), fract(p.z.mul(3.2)));
    const grout = max(step(0.94, tile.x), step(0.94, tile.y));
    const tileTone = hash(floor(p.x.mul(3.2)).add(floor(p.z.mul(3.2)).mul(31.0))).mul(0.05);
    const black = vec3(0.035, 0.036, 0.04).add(tileTone).mul(float(1.0).sub(grout.mul(0.5)));
    // panel lines on the white: frames every 2.2 m, a spine line either side of the top
    const frame = smoothstep(0.035, 0.0, abs(fract(metres.div(2.2)).sub(0.5)).sub(0.47).abs());
    const spine = smoothstep(0.012, 0.0, abs(abs(side).sub(0.32))).mul(step(0.6, e));
    const white = vec3(0.86, 0.85, 0.82).mul(float(1.0).sub(frame.add(spine).min(1.0).mul(0.35)));
    let col = mix(white, black, below);
    // the amber chine stripe
    const stripe = smoothstep(0.03, 0.0, abs(e.sub(-0.06))).mul(step(0.04, s)).mul(step(s, 0.97));
    col = mix(col, vec3(0.94, 0.62, 0.0), stripe);
    let rough = mix(float(0.32), float(0.62), below);
    let metal = float(0.05);
    let emissive = vec3(0.0);
    let clear = mix(float(0.7), float(0.0), below);
    if (visor) {
      // a wraparound visor, its lower edge rising toward the back
      const [s0, s1] = visor;
      const t = clamp(s.sub(s0).div(s1 - s0), 0.0, 1.0);
      const edge = mix(float(0.02), float(0.55), pow(t, 1.4));
      const inV = step(s0, s).mul(step(s, s1)).mul(smoothstep(edge, edge.add(0.025), e));
      const rim = inV.mul(float(1.0).sub(smoothstep(edge.add(0.025), edge.add(0.06), e)).max(smoothstep(s1 - 0.012, s1, s)));
      col = mix(col, vec3(0.012, 0.016, 0.022), inV);
      col = mix(col, vec3(0.08, 0.08, 0.085), rim);
      rough = mix(rough, float(0.04), inV);
      metal = mix(metal, float(0.85), inV);
      clear = mix(clear, float(1.0), inV);
      // the cockpit glow behind the glass at night
      emissive = emissive.add(vec3(0.9, 0.55, 0.15).mul(inV).mul(smoothstep(0.2, 0.0, e.sub(edge))).mul(0.18).mul(U.night).mul(U.lights));
    }
    if (portholes) {
      const [s0, s1, eRow] = portholes;
      const pitch = 1.15 / hullLen; // a porthole every 1.15 m
      const cell = fract(s.sub(s0).div(pitch)).sub(0.5);
      const inRow = step(s0, s).mul(step(s, s1));
      const r = length(vec2(cell.mul(pitch * hullLen), e.sub(eRow).mul(2.2)));
      const hole = smoothstep(0.24, 0.2, r).mul(inRow);
      const ring = smoothstep(0.3, 0.26, r).mul(inRow).sub(hole);
      col = mix(col, vec3(0.02, 0.02, 0.025), hole);
      col = mix(col, vec3(0.35, 0.34, 0.33), ring.max(0.0));
      const lit = step(0.18, hash(floor(s.sub(s0).div(pitch)).add(step(0.0, side).mul(57.0))));
      emissive = emissive.add(vec3(1.0, 0.72, 0.4).mul(hole).mul(lit).mul(mix(float(0.35), float(1.6), U.night)).mul(U.lights));
    }
    if (lettering) {
      const [s0, s1, e0, e1] = lettering;
      const u = clamp(s.sub(s0).div(s1 - s0), 0.0, 1.0);
      const v = clamp(e.sub(e0).div(e1 - e0), 0.0, 1.0);
      const inL = step(s0, s).mul(step(s, s1)).mul(step(e0, e)).mul(step(e, e1));
      // reads nose-to-tail on the right, tail-to-nose mirrored on the left so it is never backwards
      const lu = mix(float(1.0).sub(u), u, step(0.0, side));
      const tx = texture(letters, vec2(lu, v));
      col = mix(col, tx.rgb, tx.a.mul(inL));
    }
    if (podBand) {
      const band = step(podBand[0], s).mul(step(s, podBand[1])).mul(step(-0.1, e));
      col = mix(col, vec3(0.94, 0.62, 0.0), band);
    }
    m.colorNode = col;
    m.roughnessNode = rough;
    m.metalnessNode = metal;
    m.clearcoatNode = clear;
    m.clearcoatRoughnessNode = float(0.12);
    m.emissiveNode = emissive;
    m.envMap = envDay;
    m.envMapIntensity = 1.0;
    return m;
  }

  // ---- body ---------------------------------------------------------------------------------------------------
  const bodyMat = hullMaterial({ hullLen: 26.2, visor: [0.035, 0.2], portholes: [0.3, 0.7, 0.42], lettering: [0.33, 0.62, 0.02, 0.3] });
  const body = new THREE.Mesh(loft(BODY), bodyMat);
  group.add(body);

  // ---- pods -----------------------------------------------------------------------------------------------------
  const podMat = hullMaterial({ hullLen: 20.6, podBand: [0.07, 0.1] });
  const pods = [];
  for (const sx of [-1, 1]) {
    const pod = new THREE.Mesh(loft(POD.map((k) => ({ ...k, x: sx * POD_X, y: POD_Y }))), podMat);
    group.add(pod);
    pods.push(pod);
  }

  // ---- wings and fins ------------------------------------------------------------------------------------------
  const wingMat = new THREE.MeshPhysicalNodeMaterial();
  {
    const S = attribute("aSec", "vec2");
    const n = normalGeometry;
    const under = smoothstep(0.1, -0.3, n.y);
    const lead = smoothstep(0.08, 0.0, S.x);
    const tipBand = step(0.9, S.y);
    let col = mix(vec3(0.84, 0.83, 0.8), vec3(0.035, 0.036, 0.04), under);
    col = mix(col, vec3(0.08, 0.08, 0.085), lead);
    col = mix(col, vec3(0.94, 0.62, 0.0), tipBand.mul(float(1.0).sub(under)));
    wingMat.colorNode = col;
    wingMat.roughnessNode = mix(float(0.34), float(0.6), under);
    wingMat.clearcoatNode = mix(float(0.6), float(0.0), under);
    wingMat.envMap = envDay;
  }
  for (const sx of [-1, 1]) {
    // gull wing: from the body's flank down to the pod
    const root = { a: [sx * 2.7, 0.15, -3.6], dir: [0, 0, 1], up: [0, 1, 0], chord: 10.2, thick: 0.62 };
    const tip = { a: [sx * (POD_X - 0.75), POD_Y + 0.15, 0.8], dir: [0, 0, 1], up: [0, 1, 0], chord: 5.6, thick: 0.36 };
    group.add(new THREE.Mesh(panelLoft(root, tip), wingMat));
    // canard near the nose
    const cr = { a: [sx * 2.2, 0.55, -9.4], dir: [0, 0, 1], up: [0, 1, 0], chord: 2.6, thick: 0.2 };
    const ct = { a: [sx * 4.1, 0.75, -8.1], dir: [0, 0, 1], up: [0, 1, 0], chord: 1.3, thick: 0.12 };
    group.add(new THREE.Mesh(panelLoft(cr, ct), wingMat));
    // fin on the pod, canted out
    const cant = 0.32;
    const finRoot = { a: [sx * POD_X, POD_Y + 0.85, 4.8], dir: [0, 0, 1], up: [1, 0, 0], chord: 6.0, thick: 0.34 };
    const h = 3.8;
    const finTip = { a: [sx * (POD_X + Math.sin(cant) * h), POD_Y + 0.85 + Math.cos(cant) * h, 9.2], dir: [0, 0, 1], up: [1, 0, 0], chord: 2.6, thick: 0.16 };
    group.add(new THREE.Mesh(panelLoft(finRoot, finTip), wingMat));
  }
  // a dorsal fairing with the comms blade
  {
    const dr = { a: [0, 2.0, 3.0], dir: [0, 0, 1], up: [1, 0, 0], chord: 6.5, thick: 0.5 };
    const dt = { a: [0, 2.9, 7.6], dir: [0, 0, 1], up: [1, 0, 0], chord: 2.2, thick: 0.18 };
    group.add(new THREE.Mesh(panelLoft(dr, dt), wingMat));
  }

  // ---- engines: a nozzle at the back of each pod and a glowing core ---------------------------------------------
  const nozzleMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a1816, roughness: 0.35, metalness: 0.9 });
  const coreMat = new THREE.MeshBasicNodeMaterial();
  {
    const r = length(uv().sub(0.5)).mul(2.0);
    const flicker = sin(U.time.mul(40.0)).mul(0.04).add(0.96);
    // a hot orange core, not a white lamp: it glows under the bloom without blowing out the frame behind the shuttle
    coreMat.colorNode = mix(vec3(1.0, 0.64, 0.32), vec3(1.0, 0.34, 0.06), smoothstep(0.0, 1.0, r)).mul(U.throttle.mul(1.05).add(0.32)).mul(flicker);
  }
  const nozzles = [];
  for (const sx of [-1, 1]) {
    const pts = [new THREE.Vector2(0.86, 0), new THREE.Vector2(0.92, 0.3), new THREE.Vector2(0.8, 1.0), new THREE.Vector2(0.62, 1.05)];
    const noz = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), nozzleMat);
    noz.rotation.x = Math.PI / 2;
    noz.position.set(sx * POD_X, POD_Y, 11.0);
    group.add(noz);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.66, 40), coreMat);
    core.position.set(sx * POD_X, POD_Y, 11.6);
    group.add(core);
    nozzles.push(core);
  }

  // the main engine in the tail of the body: a bigger bell and core
  {
    const pts = [new THREE.Vector2(1.25, 0), new THREE.Vector2(1.32, 0.35), new THREE.Vector2(1.15, 1.2), new THREE.Vector2(0.9, 1.25)];
    const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), nozzleMat);
    bell.rotation.x = Math.PI / 2;
    bell.position.set(0, 0.5, 12.2);
    group.add(bell);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.98, 48), coreMat);
    core.position.set(0, 0.5, 12.95);
    group.add(core);
    const plate = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshStandardNodeMaterial({ color: 0x121214, roughness: 0.5, metalness: 0.7 }));
    plate.position.set(0, 0.55, 12.62);
    group.add(plate);
  }

  // ---- lights: nav (red left, green right), white strobes on the fins, landing lights under the nose -------------
  const glow = glowSprites(U, [
    { at: [-POD_X, POD_Y + 0.1, -9.3], color: [1, 0.08, 0.04], size: 0.9, blink: -1 },
    { at: [POD_X, POD_Y + 0.1, -9.3], color: [0.1, 1, 0.3], size: 0.9, blink: -1 },
    { at: [-(POD_X + 1.9), POD_Y + 4.3, 10.6], color: [1, 1, 1], size: 1.2, blink: 0.0 },
    { at: [POD_X + 1.9, POD_Y + 4.3, 10.6], color: [1, 1, 1], size: 1.2, blink: 0.5 },
    { at: [-0.9, -0.2, -11.6], color: [1, 0.95, 0.85], size: 1.6, blink: -1 },
    { at: [0.9, -0.2, -11.6], color: [1, 0.95, 0.85], size: 1.6, blink: -1 },
    { at: [-POD_X, POD_Y, 12.4], color: [1, 0.55, 0.15], size: 3.4, blink: -2 },
    { at: [POD_X, POD_Y, 12.4], color: [1, 0.55, 0.15], size: 3.4, blink: -2 },
    { at: [0, 0.5, 13.6], color: [1, 0.6, 0.2], size: 3.0, blink: -2 },
  ]);
  group.add(glow);

  group.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false;
  });

  const allHull = [bodyMat, podMat, wingMat];
  return {
    group,
    U,
    length: 26.2,
    // the three nozzles (the pods' and the main engine's), where the engine trails start, and their trails' half-widths
    engines: [new THREE.Vector3(-POD_X, POD_Y, 12.7), new THREE.Vector3(POD_X, POD_Y, 12.7), new THREE.Vector3(0, 0.5, 13.4)],
    engineWidths: [0.5, 0.5, 0.75],
    setNight(x) {
      U.night.value = x;
      const env = x > 0.5 ? envNight : envDay;
      for (const m of allHull) {
        if (m.envMap !== env) {
          m.envMap = env;
          m.needsUpdate = true;
        }
        // (the same by day as by night: any more and the bright haze flares white off the wings)
        m.envMapIntensity = 0.55;
      }
    },
    tick(time, throttle = 0.2) {
      U.time.value = time;
      U.throttle.value += (throttle - U.throttle.value) * 0.08;
    },
  };
}

/** Lights as camera-facing glows, in the shuttle's own space (they ride with it). blink: -1 steady, -2 engine. */
function glowSprites(U, list) {
  const group = new THREE.Group();
  for (const l of list) {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const r = length(uv().sub(0.5)).mul(2.0);
    const core = pow(max(float(1.0).sub(r), 0.0), 5.0).add(pow(max(float(1.0).sub(r), 0.0), 2.0).mul(0.15));
    let k = float(1.0);
    if (l.blink >= 0) k = step(0.9, fract(U.time.mul(0.8).add(l.blink))).mul(1.6);
    if (l.blink === -2) k = U.throttle.mul(0.8).add(0.05);
    m.colorNode = vec3(...l.color).mul(core).mul(k).mul(mix(float(0.6), float(1.4), U.night)).mul(U.lights).mul(2.0);
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(l.size, l.size), m);
    sprite.position.set(...l.at);
    sprite.renderOrder = 7;
    sprite.onBeforeRender = (renderer, scene, camera) => sprite.quaternion.copy(camera.quaternion).premultiply(sprite.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
    group.add(sprite);
  }
  return group;
}

void min;
void cross;
void normalize;
void cameraPosition;
void positionWorld;
