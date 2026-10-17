// Kraken Port's billboards. Two families:
//  - Character posters: AI key art of the port's people (an oni-helmet racer, an android geisha, a ronin, a
//    netrunner, a yakuza with glowing irezumi, a kitsune DJ, a cyborg ramen chef, a Halcyon pilot, and the cast).
//    Each is a photo layer and a type layer; the motion is the shader's (a slow push-in, a light sweep, hologram
//    splits, rare glitch tears, LED pitch up close), so the photo moves and the type stays crisp.
//  - Code-drawn screens: departures, weather, tides, the surf and dive ads, dot-matrix neon, the KRAKEN wordmark.
//    Their canvases redraw a dozen times a second, and only while one of them is near you.
// Every kind is one instanced mesh per orientation (one draw call for all of its screens), with frames, halos and
// legs as three more instanced meshes, so the city can carry hundreds of screens and stay smooth.
import * as THREE from "three";
import {
  texture, uv, vec2, vec3, vec4, float, sin, fract, floor, step, mix, smoothstep, length, positionWorld, cameraPosition, max,
  normalize, attribute, abs, hash as rawHash, uniform, clamp,
} from "three/tsl";
import { hashF } from "./fx.js";

const hash = (x) => hashF(float(x).add(1048576.0));
const HEAVY = (px) => `900 ${px}px Saira, sans-serif`;
const THIN = (px) => `200 ${px}px Saira, sans-serif`;
const MID = (px) => `500 ${px}px Saira, sans-serif`;
const MONO = (px) => `${px}px "Share Tech Mono", monospace`;
const JP = (px) => `900 ${px}px "Noto Sans JP", sans-serif`;
const C = { panel: "#0b0c12", white: "#f4f1ea", red: "#ff3b30", yellow: "#f5c400", amber: "#f0a900", cyan: "#3fe3e8", magenta: "#ff3dbb", pink: "#ff4fa8", mute: "rgba(244,241,234,0.62)" };

/** Board kinds: what they say and how they draw. `cta` marks a board that does something when you pick it. */
export const KINDS = {
  // ---- character posters ----
  oni: { name: "ONI CUP", line: "SKIFF RACING · NIGHT 12 · CANAL CIRCUIT", cta: "RACE", tint: [1.0, 0.2, 0.6], aspect: 0.5581, photo: "assets/chars/oni.jpg", focus: [0.5, 0.3], tag: "鬼杯 // SKIFF RACING", head: ["ONI", "CUP"], jp: "鬼杯", accent: "#ff3dbb" },
  geisha: { name: "KOTONE ✦ LIVE", line: "ANDROID IDOL · TEMPLE BASIN · 22:00", cta: "WATCH", tint: [0.3, 0.9, 1.0], aspect: 0.5581, photo: "assets/chars/geisha.jpg", focus: [0.5, 0.34], tag: "KRAKEN RADIO PRESENTS", head: ["KOTONE", "LIVE"], jp: "琴音", accent: "#3fe3e8", holo: true },
  ronin: { name: "RONIN SECURITY", line: "24H · ANY CANAL · ANY TIDE", cta: "HIRE", tint: [1.0, 0.6, 0.2], aspect: 1.7778, photo: "assets/chars/ronin.jpg", focus: [0.62, 0.42], tag: "用心棒 // PRIVATE GUARD", head: ["WE KEEP", "THE NIGHT"], jp: "浪人", accent: "#f0a900" },
  netrunner: { name: "KAGE NET", line: "NEURAL LINK · 0.2 MS · NO LOGS", cta: "JACK IN", tint: [0.2, 1.0, 0.7], aspect: 0.5625, photo: "assets/chars/netrunner.jpg", focus: [0.46, 0.32], tag: "DIVE THE DEEP NET", head: ["KAGE", "NET"], jp: "影網", accent: "#3dffb0" },
  yakuza: { name: "INK & CHROME", line: "NEW ARMS 30% OFF · DECK 6 · NO QUESTIONS", cta: "BOOK", tint: [1.0, 0.3, 0.15], aspect: 1.7778, photo: "assets/chars/yakuza.jpg", focus: [0.64, 0.4], tag: "刺青 · CYBERWARE CLINIC", head: ["INK &", "CHROME"], jp: "刺青", accent: "#ff5a2a" },
  kitsune: { name: "NINE TAILS", line: "CLUB NIGHT · UNTIL SUNRISE (IN 4 DAYS)", cta: "ENTER", tint: [1.0, 0.3, 0.85], aspect: 0.5625, photo: "assets/chars/kitsune.jpg", focus: [0.5, 0.36], tag: "九尾 // CLUB NIGHT", head: ["NINE", "TAILS"], jp: "九尾", accent: "#ff4fd8" },
  chef: { name: "RAMEN 7", line: "METHANE-FREE BROTH · DECK 4 · OPEN ALL TITAN DAY", cta: "ORDER", tint: [1.0, 0.45, 0.1], aspect: 1.7778, photo: "assets/chars/ramen.jpg", focus: [0.64, 0.42], tag: "ラーメン // DECK 4", head: ["SLURP", "LOUDER"], jp: "麺", accent: "#ff7a1a" },
  pilot: { name: "HALCYON LINES", line: "ORBIT → KRAKEN PORT · 42 MIN · GATE 3", cta: "BOARD", tint: [1.0, 0.75, 0.2], aspect: 1.7778, photo: "assets/chars/pilot.jpg", focus: [0.64, 0.4], tag: "HL-07 // DESCENTS DAILY", head: ["COME DOWN", "SLOWLY"], jp: "降下", accent: "#f0a900" },
  idol: { name: "KOI ✦ LIVE", line: "TONIGHT · TEMPLE BASIN · 22:00", cta: "WATCH", tint: [0.4, 0.85, 1.0], aspect: 0.7461, photo: "assets/cast/koi.jpg", focus: [0.5, 0.3], tag: "KRAKEN RADIO PRESENTS", head: ["KOI", "LIVE"], jp: "鯉", accent: "#3fe3e8", holo: true },
  wanted: { name: "WANTED", line: "ROOK · 50 000 ¥CR · ALIVE", tint: [1.0, 0.2, 0.2], aspect: 0.7461, photo: "assets/cast/rook.jpg", focus: [0.5, 0.26], tag: "PORT AUTHORITY // NOTICE 0417", head: ["WANTED"], jp: "手配", accent: "#ff3b30", wanted: true },
  moon: { name: "TAKE ME TO THE MOON", line: "NIGHT FLIGHTS · GATE 3 · ONE WAY ONLY", cta: "FLY", tint: [0.85, 0.5, 1.0], aspect: 0.5625, photo: "assets/chars/moon.jpg", focus: [0.5, 0.3], tag: "HALCYON LINES // LUNAR NIGHTS", head: ["TAKE ME", "TO THE MOON"], jp: "月へ", accent: "#ff6fd8" },
  edge: { name: "RUN THE EDGE", line: "CANAL GRAND PRIX · NO BRAKES · NO RULES", cta: "RACE", tint: [1.0, 0.55, 0.15], aspect: 1.7778, photo: "assets/chars/runner.jpg", focus: [0.64, 0.4], tag: "KRAKEN CIRCUIT // NIGHT 12", head: ["RUN THE", "EDGE"], jp: "限界", accent: "#ffb020" },
  fly: { name: "FLY WITH YOUR ARMS", line: "0.14 G · 1.5 BAR · WING RENTALS DECK 9", cta: "RENT", tint: [1.0, 0.6, 0.2], aspect: 0.7461, photo: "assets/cast/june.jpg", focus: [0.5, 0.28], tag: "WING RENTALS // DECK 9", head: ["FLY WITH", "YOUR ARMS"], jp: "飛", accent: "#ff9a2a" },
  // ---- code-drawn screens ----
  surf: { name: "SURF LIGEIA", line: "SWELL 0.4 M · −179 °C · HEATED SUITS ON DECK 2", cta: "RIDE", tint: [1.0, 0.3, 0.6], draw: drawSurf },
  azotosome: { name: "AZOTOSOME", line: "THE SEA MIGHT BE ALIVE · NIGHT TOURS", tint: [0.3, 0.9, 1.0], draw: drawAzotosome },
  hotel: { name: "HOTEL SATURNRISE", line: "EVERY ROOM FACES SATURN*", tint: [1.0, 0.75, 0.4], draw: drawHotel },
  pixel: { name: "クラーケン", line: "KRAKEN · NIGHT MARKET", tint: [1.0, 0.25, 0.65], draw: drawPixel },
  ramen: { name: "ラーメン 7", line: "METHANE-FREE BROTH · DECK 4", tint: [1.0, 0.35, 0.15], draw: drawRamen },
  dive: { name: "GANNET DIVES", line: "300 M DOWN · LIGHTS INCLUDED", cta: "DIVE", tint: [0.3, 0.95, 0.9], draw: drawDive },
  weather: { name: "KRAKEN WEATHER", line: "DRIZZLE · −179 °C · 1.47 BAR", tint: [0.5, 0.8, 1.0], draw: drawWeather },
  departures: { name: "DEPARTURES", line: "HALCYON LINES · GATE 3", tint: [1.0, 0.8, 0.3], draw: drawDepartures },
  nofire: { name: "NO FIRE", line: "NO OXYGEN · NO FIRE · NO PROBLEM", tint: [1.0, 0.3, 0.2], draw: drawNoFire },
  kraken: { name: "KRAKEN PORT", line: "WELCOME TO TITAN · POP. 41 200", tint: [1.0, 0.35, 0.7], draw: drawKraken },
  tides: { name: "TIDE TABLE", line: "SATURN LIFTS THE SEA 1 M EVERY 16 DAYS", tint: [0.4, 0.9, 1.0], draw: drawTides },
};
export const PHOTO_KINDS = Object.keys(KINDS).filter((k) => KINDS[k].photo);

const SIZE = { v: [288, 512], s: [384, 384], h: [512, 288] };
export const orientOf = (w, h) => (w / h < 0.8 ? "v" : w / h < 1.25 ? "s" : "h");

// ---- shared resources: one set per kind and orientation, used by every board of that kind ---------------------------
const SCREENS = new Map(); // `${kind}:${orient}` → { material, entry }
const loader = new THREE.TextureLoader();
const PHOTOS = new Map();
function photoTexture(src) {
  if (PHOTOS.has(src)) return PHOTOS.get(src);
  const rec = { tex: null, aspect: uniform(0.75) };
  rec.tex = loader.load(src, (t) => (rec.aspect.value = t.image.width / t.image.height));
  rec.tex.colorSpace = THREE.SRGBColorSpace;
  rec.tex.anisotropy = 8;
  PHOTOS.set(src, rec);
  return rec;
}

function screenFor(U, kind, orient) {
  const key = `${kind}:${orient}`;
  if (SCREENS.has(key)) return SCREENS.get(key);
  const k = KINDS[kind];
  const [w, h] = kind === "kraken" ? [1024, 288] : k.aspect ? (k.aspect < 1 ? [320, Math.round(320 / k.aspect)] : [576, Math.round(576 / k.aspect)]) : SIZE[orient];
  const phase = attribute("aPhase", "float");
  const uvB = uv();
  const dist = length(cameraPosition.sub(positionWorld));
  let col;
  const entry = { kind, orient, w, h, canvas: null, tex: null, animated: !k.photo };
  if (k.photo) {
    // ---- a character poster: photo layer with motion, type layer on top ------------------------------------------
    const ph = photoTexture(k.photo);
    const over = document.createElement("canvas");
    over.width = w * 2;
    over.height = h * 2;
    const og = over.getContext("2d");
    const paint = () => {
      og.clearRect(0, 0, over.width, over.height);
      og.save();
      og.scale(2, 2);
      drawOverlay(og, w, h, k, orient);
      og.restore();
    };
    paint();
    const otex = new THREE.CanvasTexture(over);
    otex.colorSpace = THREE.SRGBColorSpace;
    otex.anisotropy = 8;
    document.fonts?.ready.then(() => {
      paint();
      otex.needsUpdate = true;
    });
    entry.overlay = over;
    entry.photo = ph;
    // the board has the photo's own shape, so the whole picture shows: no crop
    const puv = uvB;
    const split = float(k.holo ? 0.0025 : 0.0);
    const pr = texture(ph.tex, puv.add(vec2(split, 0.0))).r;
    const pg = texture(ph.tex, puv).g;
    const pb = texture(ph.tex, puv.sub(vec2(split, 0.0))).b;
    let photoCol = vec3(pr, pg, pb);
    if (k.wanted) {
      // a printed notice: desaturated under a red wash
      const lum = photoCol.dot(vec3(0.299, 0.587, 0.114));
      photoCol = vec3(lum.mul(1.1), lum.mul(0.32), lum.mul(0.3));
    }
    if (k.holo) {
      // a hologram: a soft shimmer and a cool lift (no dark lines)
      const shimmer = sin(U.time.mul(1.7).add(uvB.y.mul(9.0))).mul(0.05).add(1.0);
      photoCol = photoCol.mul(shimmer).add(vec3(0.0, 0.025, 0.04));
    }
    const ov = texture(otex, uvB);
    col = mix(photoCol, ov.rgb, ov.a);
    // a faint light sweep across the glass now and then
    const sw = fract(uvB.x.mul(0.65).add(uvB.y.mul(0.35)).sub(U.time.mul(0.045)).add(phase));
    col = col.add(vec3(1.0, 0.96, 0.92).mul(smoothstep(0.0, 0.03, sw).mul(smoothstep(0.1, 0.03, sw))).mul(0.035));
  } else {
    // ---- a code-drawn screen ----------------------------------------------------------------------------------------
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    k.draw(g, w, h, 0, orient); // paint before the first upload (WebGPU wants a drawn canvas)
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    Object.assign(entry, { canvas, g, tex });
    col = texture(tex, uvB).rgb;
  }
  // partial fog: a lit screen carries further through haze than a wall does
  const lit = col.mul(U.screens).mul(1.2);
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = mix(lit, U.hazeColor(normalize(positionWorld.sub(cameraPosition))), U.fogFactor().mul(0.55));
  m.fog = false;
  const rec = { material: m, entry };
  SCREENS.set(key, rec);
  return rec;
}

/** The composite (photo + type) a character poster shows when it is opened in the HUD. */
export function compositeCanvas(entry) {
  if (!entry.overlay) return entry.canvas;
  if (entry.composite && entry.compositeReady) return entry.composite;
  const c = entry.composite ?? document.createElement("canvas");
  c.width = entry.overlay.width;
  c.height = entry.overlay.height;
  const g = c.getContext("2d");
  g.fillStyle = "#05060a";
  g.fillRect(0, 0, c.width, c.height);
  const img = entry.photo.tex.image;
  if (img && img.naturalWidth) {
    g.drawImage(img, 0, 0, c.width, c.height);
    entry.compositeReady = true;
  }
  g.drawImage(entry.overlay, 0, 0);
  entry.composite = c;
  return c;
}

// ---- frames, halos, legs: shared materials --------------------------------------------------------------------------
let frameMat = null, haloMat = null;
function sharedMats(U) {
  if (frameMat) return;
  frameMat = new THREE.MeshStandardNodeMaterial({ color: 0x15140f, roughness: 0.6, metalness: 0.5 });
  haloMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const tint = attribute("aTint", "vec3");
  const d = length(uv().sub(0.5)).mul(2.0);
  const fall = smoothstep(1.0, 0.35, d);
  haloMat.colorNode = tint.mul(fall.mul(fall)).mul(0.07).mul(U.screens).mul(mix(float(0.35), float(1.0), U.night)).mul(float(1.0).sub(U.fogFactor().mul(0.7)));
  haloMat.fog = false;
}

export function createBillboards(U, list) {
  sharedMats(U);
  const group = new THREE.Group();
  const boards = [];
  const byKey = new Map();
  for (const b of list) {
    const kk = KINDS[b.kind];
    if (kk.aspect) b.w = b.h * kk.aspect; // the photo's own shape, so nothing is cut
    const orient = b.kind === "kraken" ? "h" : orientOf(b.w, b.h);
    const key = `${b.kind}:${orient}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(b);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const meshes = [];
  for (const [key, bs] of byKey) {
    const [kind, orient] = key.split(":");
    const rec = screenFor(U, kind, orient);
    const geo = new THREE.PlaneGeometry(1, 1);
    const phase = new Float32Array(bs.length);
    const mesh = new THREE.InstancedMesh(geo, rec.material, bs.length);
    bs.forEach((b, i) => {
      phase[i] = (Math.sin(b.x * 12.9898 + b.z * 78.233) * 43758.5453) % 1;
      const pos = new THREE.Vector3(b.x, b.y, b.z);
      const quat = new THREE.Quaternion().setFromEuler(e.set(0, b.ry, 0));
      mesh.setMatrixAt(i, m4.compose(pos, quat, new THREE.Vector3(b.w, b.h, 1)));
      const matrix = new THREE.Matrix4().compose(pos, quat, one);
      const rec2 = { ...b, pos, matrix, entry: rec.entry, mesh, index: i };
      boards.push(rec2);
    });
    geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase.map((v) => Math.abs(v)), 1));
    mesh.frustumCulled = false;
    group.add(mesh);
    meshes.push(mesh);
  }
  // frames (a box behind each screen), halos (a glow in the haze in front), legs (pylons and roof stilts)
  const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat, boards.length);
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  const tints = new Float32Array(boards.length * 3);
  const halos = new THREE.InstancedMesh(haloGeo, haloMat, boards.length);
  const legs = [];
  boards.forEach((b, i) => {
    const off = new THREE.Vector3(0, 0, -0.75).applyQuaternion(new THREE.Quaternion().setFromEuler(e.set(0, b.ry, 0)));
    frames.setMatrixAt(i, m4.compose(b.pos.clone().add(off), q.setFromEuler(e.set(0, b.ry, 0)), new THREE.Vector3(b.w + 1.2, b.h + 1.2, 1.4)));
    const fwd = new THREE.Vector3(0, 0, 0.4).applyQuaternion(q);
    halos.setMatrixAt(i, m4.compose(b.pos.clone().add(fwd), q, new THREE.Vector3(b.w * 1.9, b.h * 1.9, 1)));
    tints.set(KINDS[b.kind].tint, i * 3);
    if (b.pylon) for (const sx of [-0.3, 0.3]) legs.push([new THREE.Vector3(sx * b.w, -b.y / 2, -0.75), b, 1.2, b.y]);
    if (b.roof) for (const sx of [-0.35, 0.35]) legs.push([new THREE.Vector3(sx * b.w, -b.h / 2 - 5, -0.75), b, 0.8, 12]);
  });
  haloGeo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 3));
  frames.frustumCulled = halos.frustumCulled = false;
  halos.renderOrder = 3;
  group.add(frames, halos);
  if (legs.length) {
    const legMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat, legs.length);
    legs.forEach(([local, b, t, hgt], i) => {
      const quat = new THREE.Quaternion().setFromEuler(e.set(0, b.ry, 0));
      legMesh.setMatrixAt(i, m4.compose(local.applyQuaternion(quat).add(b.pos), quat, new THREE.Vector3(t, hgt, t)));
    });
    legMesh.frustumCulled = false;
    group.add(legMesh);
  }
  const hit = new THREE.Vector3();
  return {
    group,
    boards,
    /** The board under a ray, or null. */
    pick(ray, maxDist = 900) {
      const hits = ray.intersectObjects(meshes, false);
      const h = hits.find((x) => x.distance < maxDist);
      if (!h) return null;
      return boards.find((b) => b.mesh === h.object && b.index === h.instanceId) ?? null;
    },
    update(time, dt, camera) {
      animate(time, camera, boards);
      void hit;
    },
  };
}

// code-drawn screens redraw ~12 times a second, round-robin, and only those with a board near the camera
let animTick = 0;
function animate(time, camera, boards) {
  animTick++;
  if (animTick % 2) return;
  const near = new Set();
  for (const b of boards) if (b.entry.animated && b.pos.distanceToSquared(camera.position) < 700 * 700) near.add(b.entry);
  const list = [...near];
  if (!list.length) return;
  const per = Math.max(1, Math.ceil(list.length / 2.5));
  const start = ((animTick / 2) * per) % list.length;
  for (let i = 0; i < per; i++) {
    const e = list[(start + i) % list.length];
    KINDS[e.kind].draw(e.g, e.w, e.h, time, e.orient);
    e.tex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------------------------
// the type layer of a character poster: tag, a vertical kanji column, the headline, an accent rule, the line, a CTA
// ---------------------------------------------------------------------------------------------------------
function drawOverlay(g, w, h, k, orient) {
  const v = orient !== "h";
  const acc = k.accent;
  // scrims so the type reads over any photo
  if (v) {
    const s = g.createLinearGradient(0, h * 0.4, 0, h);
    s.addColorStop(0, "rgba(5,6,10,0)");
    s.addColorStop(0.5, "rgba(5,6,10,0.78)");
    s.addColorStop(1, "rgba(5,6,10,0.96)");
    g.fillStyle = s;
    g.fillRect(0, h * 0.4, w, h * 0.6);
    const t = g.createLinearGradient(0, 0, 0, h * 0.16);
    t.addColorStop(0, "rgba(5,6,10,0.7)");
    t.addColorStop(1, "rgba(5,6,10,0)");
    g.fillStyle = t;
    g.fillRect(0, 0, w, h * 0.16);
  } else {
    const s = g.createLinearGradient(0, 0, w * 0.62, 0);
    s.addColorStop(0, "rgba(5,6,10,0.95)");
    s.addColorStop(0.6, "rgba(5,6,10,0.7)");
    s.addColorStop(1, "rgba(5,6,10,0)");
    g.fillStyle = s;
    g.fillRect(0, 0, w * 0.62, h);
  }
  const pad = v ? w * 0.08 : w * 0.05;
  const tw = v ? w - pad * 2 : w * 0.42;
  // tag with a dot
  g.fillStyle = acc;
  g.beginPath();
  g.arc(pad + 3, (v ? h * 0.065 : h * 0.13) - 4, 3, 0, Math.PI * 2);
  g.fill();
  const tp = fitText(g, k.tag, tw - 14, v ? 11 : 13, MONO, "normal", 2);
  text(g, k.tag, pad + 12, v ? h * 0.065 : h * 0.13, MONO(tp), acc, { track: 2 });
  // the kanji column, glowing in the accent
  const chars = [...k.jp];
  const js = v ? Math.min(w * 0.13, (h * 0.34) / chars.length) : Math.min(h * 0.16, (h * 0.7) / chars.length);
  const jx = w - pad - js * 0.5;
  g.save();
  g.shadowColor = acc;
  g.shadowBlur = js * 0.35;
  chars.forEach((ch, i) => text(g, ch, jx, (v ? h * 0.1 : h * 0.14) + js * (i + 0.9) * 1.04, JP(js), "#ffffff", { align: "center" }));
  g.restore();
  // headline, the last line in the accent
  const lines = k.head;
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a));
  const hp = fitText(g, longest, tw, v ? 62 : 70, HEAVY, "expanded");
  const top = v ? h * 0.7 - (lines.length - 1) * hp * 0.92 : h * 0.44 - (lines.length - 1) * hp * 0.46;
  lines.forEach((s, i) => text(g, s, pad, top + i * hp * 0.92, HEAVY(hp), i === lines.length - 1 && lines.length > 1 ? acc : C.white, { stretch: "expanded" }));
  const uy = top + (lines.length - 1) * hp * 0.92 + hp * 0.26;
  // the rule, broken in two, in the accent
  g.fillStyle = acc;
  g.fillRect(pad, uy, tw * 0.56, 3);
  g.fillRect(pad + tw * 0.62, uy, tw * 0.14, 3);
  const lp = fitText(g, k.line, tw, v ? 10.5 : 12.5, MONO, "normal", 1.5);
  text(g, k.line, pad, uy + (v ? 22 : 26), MONO(lp), C.mute, { track: 1.5 });
  if (k.cta) {
    const ch = v ? 30 : 34;
    const cy = v ? h - pad - ch : h * 0.8;
    g.font = MID(ch * 0.46);
    g.letterSpacing = `${ch * 0.12}px`;
    const cw = g.measureText(k.cta).width + ch * 1.5;
    g.fillStyle = acc;
    g.beginPath();
    g.roundRect(pad, cy, cw, ch, ch / 2);
    g.fill();
    g.fillStyle = "#07060c";
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(k.cta, pad + ch * 0.75, cy + ch * 0.54);
    g.letterSpacing = "0px";
  }
  // thin corner brackets, like a HUD frame on the ad
  corners(g, 6, 6, w - 12, h - 12, Math.min(w, h) * 0.06, "rgba(255,255,255,0.35)", 1.5);
}

// ---------------------------------------------------------------------------------------------------------
// drawing helpers: the anatomy of a Rive City board
// ---------------------------------------------------------------------------------------------------------
function panel(g, w, h, color = C.panel) {
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
}
function text(g, s, x, y, font, color, { align = "left", base = "alphabetic", track = 0, stretch = "normal" } = {}) {
  g.font = font;
  g.fontStretch = stretch;
  g.letterSpacing = `${track}px`;
  g.textAlign = align;
  g.textBaseline = base;
  g.fillStyle = color;
  g.fillText(s, x, y);
  g.letterSpacing = "0px";
  g.fontStretch = "normal";
}
function fitText(g, s, maxW, px, fontFn, stretch = "normal", track = 0) {
  g.font = fontFn(px);
  g.fontStretch = stretch;
  g.letterSpacing = `${track}px`;
  const w = g.measureText(s).width;
  g.letterSpacing = "0px";
  g.fontStretch = "normal";
  return w > maxW ? Math.floor((px * maxW) / w) : px;
}
/** The red underline, broken into a long and a short bar. */
function underline(g, x, y, w, t = 0) {
  const a = w * (0.58 + 0.04 * Math.sin(t * 1.3));
  g.fillStyle = C.red;
  g.fillRect(x, y, a, Math.max(3, w * 0.018));
  g.fillRect(x + a + w * 0.05, y, w * 0.18, Math.max(3, w * 0.018));
}
function pill(g, s, x, y, h, color = C.yellow, ink = "#14110a") {
  g.font = MID(h * 0.5);
  g.letterSpacing = `${h * 0.1}px`;
  const w = g.measureText(s).width + h * 1.4;
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2);
  g.fill();
  g.fillStyle = ink;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(s, x + h * 0.7, y + h * 0.54);
  g.letterSpacing = "0px";
  return w;
}
function scanlines() {
  // no dark lines across the screens
}
function glitch() {
  // no tears across the screens
}
function glitchTear(g, w, h, t, seed = 0) {
  // a rare horizontal tear: a strip of the board slides sideways for a frame or two
  const k = Math.sin(t * 2.1 + seed * 13.7) * Math.sin(t * 0.7 + seed);
  if (k < 0.93) return;
  const y = ((Math.sin(t * 91 + seed) * 0.5 + 0.5) * h) | 0;
  const sh = 6 + ((Math.sin(t * 37) * 0.5 + 0.5) * 18) | 0;
  try {
    g.drawImage(g.canvas, 0, y, w, sh, (Math.sin(t * 53) * 14) | 0, y, w, sh);
  } catch {}
}
function corners(g, x, y, w, h, len, color, lw = 2) {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.beginPath();
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    g.moveTo(cx + dx * len, cy);
    g.lineTo(cx, cy);
    g.lineTo(cx, cy + dy * len);
  }
  g.stroke();
}

// ---------------------------------------------------------------------------------------------------------
// the kinds
// ---------------------------------------------------------------------------------------------------------
function drawSurf(g, w, h, t, o) {
  panel(g, w, h);
  // the swell, in magenta and cyan lines
  g.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const yy = h * (0.42 + i * 0.045);
    g.strokeStyle = i % 3 === 0 ? "rgba(255,61,187,0.55)" : "rgba(63,227,232,0.28)";
    g.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = yy + Math.sin(x * 0.018 + t * (1.2 + i * 0.07) + i) * (6 + i * 1.4);
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  const pad = w * 0.07;
  if (o === "v") {
    const px = fitText(g, "LIGEIA", w - pad * 2, 90, HEAVY, "expanded");
    text(g, "SURF", pad, h * 0.24, HEAVY(px), C.white, { stretch: "expanded" });
    text(g, "LIGEIA", pad, h * 0.24 + px * 0.92, HEAVY(px), C.white, { stretch: "expanded" });
    underline(g, pad, h * 0.24 + px * 1.15, w - pad * 2, t);
    text(g, "SWELL 0.4 M · HEATED SUITS", pad, h * 0.24 + px * 1.15 + 28, MONO(14), C.mute, { track: 2 });
    pill(g, "RIDE", pad, h * 0.84, 40);
  } else {
    const px = fitText(g, "LIGEIA", w * 0.62, 120, HEAVY, "expanded");
    text(g, "SURF", pad, h * 0.36, HEAVY(px), C.white, { stretch: "expanded" });
    text(g, "LIGEIA", pad, h * 0.36 + px * 0.92, HEAVY(px), C.white, { stretch: "expanded" });
    underline(g, pad, h * 0.36 + px * 1.12, w * 0.6, t);
    text(g, "SWELL 0.4 M · −179 °C · HEATED SUITS ON DECK 2", pad, h * 0.36 + px * 1.12 + 26, MONO(13), C.mute, { track: 2 });
    pill(g, "RIDE", w - pad - 110, h * 0.12, 40);
  }
  scanlines(g, w, h, 0.1);
  glitch(g, w, h, t, 1);
}

function drawAzotosome(g, w, h, t) {
  panel(g, w, h, "#020306");
  const cx = w / 2, cy = h * 0.44, R = Math.min(w, h) * 0.34;
  // the membrane: rings that breathe out of phase
  for (let i = 9; i >= 0; i--) {
    const r = R * (0.3 + i * 0.08) * (1 + 0.04 * Math.sin(t * 1.6 + i * 0.8));
    const grad = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
    const hue = i % 2 ? "63,227,232" : "255,61,187";
    grad.addColorStop(0, `rgba(${hue},0)`);
    grad.addColorStop(1, `rgba(${hue},${0.08 + i * 0.012})`);
    g.fillStyle = grad;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.08) {
      const wob = 1 + 0.05 * Math.sin(a * 5 + t * 2 + i) + 0.03 * Math.sin(a * 9 - t * 3);
      const x = cx + Math.cos(a) * r * wob, y = cy + Math.sin(a) * r * wob * 1.12;
      a ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.fill();
    g.strokeStyle = `rgba(${hue},${0.5 - i * 0.03})`;
    g.lineWidth = 1.4;
    g.stroke();
  }
  // nucleus
  const n = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.32);
  n.addColorStop(0, "rgba(255,255,255,0.95)");
  n.addColorStop(0.3, "rgba(255,120,220,0.7)");
  n.addColorStop(1, "rgba(255,61,187,0)");
  g.fillStyle = n;
  g.fillRect(cx - R, cy - R, R * 2, R * 2);
  // drifting specks
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39 + t * 0.2, rr = R * (0.6 + ((i * 37) % 50) / 60);
    g.fillStyle = i % 2 ? "rgba(63,227,232,0.8)" : "rgba(255,255,255,0.6)";
    g.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a * 1.3) * rr, 2, 2);
  }
  text(g, "AZOTOSOME", w / 2, h * 0.86, MID(Math.min(34, w * 0.1)), C.white, { align: "center", track: 6, stretch: "expanded" });
  text(g, "THE SEA MIGHT BE ALIVE", w / 2, h * 0.86 + 24, MONO(12), C.cyan, { align: "center", track: 3 });
  scanlines(g, w, h, 0.14);
}

function drawHotel(g, w, h, t, o) {
  panel(g, w, h, "#07070a");
  const flick = Math.sin(t * 23) > 0.97 ? 0.4 : 1;
  g.save();
  g.shadowColor = "rgba(255,190,110,0.9)";
  g.shadowBlur = 18;
  const vertical = o === "v";
  if (vertical) {
    const lines = ["HOTEL", "SATURN", "RISE"];
    lines.forEach((s, i) => text(g, s, w / 2, h * (0.3 + i * 0.17), THIN(fitText(g, "SATURN", w * 0.86, 64, THIN, "expanded", 6)), `rgba(255,224,180,${flick})`, { align: "center", track: 6, stretch: "expanded" }));
  } else {
    const px = fitText(g, "SATURNRISE", w * 0.84, 80, THIN, "expanded", 8);
    text(g, "HOTEL", w / 2, h * 0.3, THIN(px * 0.42), `rgba(255,224,180,${flick})`, { align: "center", track: 18, stretch: "expanded" });
    text(g, "SATURNRISE", w / 2, h * 0.62, THIN(px), `rgba(255,224,180,${flick})`, { align: "center", track: 8, stretch: "expanded" });
  }
  g.restore();
  text(g, "EVERY ROOM FACES SATURN*", w / 2, h * 0.8, MONO(13), C.amber, { align: "center", track: 3 });
  text(g, "*SATURN NOT VISIBLE THROUGH HAZE", w / 2, h * 0.8 + 18, MONO(10), C.mute, { align: "center", track: 2 });
}

function drawPixel(g, w, h, t, o) {
  panel(g, w, h, "#050206");
  const glyphs = o === "v" ? ["ク", "ラ", "ー", "ケ", "ン"] : ["タ", "イ", "タ", "ン"];
  // render each glyph to a coarse grid and light the cells like LEDs
  const cols = o === "v" ? 1 : glyphs.length;
  const cell = o === "v" ? h / glyphs.length : w / glyphs.length;
  const N = 16;
  const off = pixelGlyphs(glyphs, N);
  const dot = (cell * 0.86) / N;
  glyphs.forEach((_, gi) => {
    const ox = o === "v" ? (w - N * dot) / 2 : gi * cell + (cell - N * dot) / 2;
    const oy = o === "v" ? gi * cell + (cell - N * dot) / 2 : (h - N * dot) / 2;
    const on = (Math.floor(t * 4) + gi) % 9 !== 0;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const lit = off[gi][y * N + x];
        g.fillStyle = lit && on ? (gi % 2 ? "#ff4fa8" : "#ff79c6") : "rgba(255,79,168,0.07)";
        g.beginPath();
        g.arc(ox + (x + 0.5) * dot, oy + (y + 0.5) * dot, dot * 0.38, 0, Math.PI * 2);
        g.fill();
      }
  });
  void cols;
}
const glyphCache = new Map();
function pixelGlyphs(glyphs, N) {
  const key = glyphs.join("") + N;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d", { willReadFrequently: true });
  const out = glyphs.map((s) => {
    g.clearRect(0, 0, N, N);
    g.fillStyle = "#fff";
    g.font = JP(N * 0.92);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(s, N / 2, N / 2 + 0.5);
    const d = g.getImageData(0, 0, N, N).data;
    const bits = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) bits[i] = d[i * 4 + 3] > 70 ? 1 : 0;
    return bits;
  });
  // only cache once the CJK face has arrived, so the glyphs are the real ones
  if (document.fonts?.check?.(JP(12))) glyphCache.set(key, out);
  return out;
}

function drawRamen(g, w, h, t, o) {
  panel(g, w, h, "#120403");
  // the red lantern disc
  const v = o === "v";
  const cx = v ? w / 2 : w * 0.24, cy = v ? h * 0.33 : h / 2, R = v ? w * 0.36 : h * 0.36;
  const glow = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.6);
  glow.addColorStop(0, "rgba(255,80,40,0.55)");
  glow.addColorStop(1, "rgba(255,40,20,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#e8361c";
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  text(g, "麺", cx, cy + R * 0.06, JP(R * 1.15), "#fff2e0", { align: "center", base: "middle" });
  // steam
  g.strokeStyle = "rgba(255,240,220,0.5)";
  g.lineWidth = 3;
  for (let i = -1; i <= 1; i++) {
    g.beginPath();
    for (let k = 0; k < 20; k++) {
      const yy = cy - R - 6 - k * 3;
      const xx = cx + i * R * 0.35 + Math.sin(k * 0.5 - t * 3 + i) * 5;
      k ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
    }
    g.stroke();
  }
  if (v) {
    text(g, "ラーメン", w / 2, h * 0.72, JP(fitText(g, "ラーメン", w * 0.86, 64, JP)), "#fff2e0", { align: "center" });
    text(g, "METHANE-FREE BROTH", w / 2, h * 0.82, MONO(13), C.amber, { align: "center", track: 2 });
    text(g, "DECK 4 · OPEN ALL TITAN DAY", w / 2, h * 0.82 + 20, MONO(11), C.mute, { align: "center", track: 2 });
  } else {
    text(g, "ラーメン 7", w * 0.5, h * 0.44, JP(fitText(g, "ラーメン 7", w * 0.46, 70, JP)), "#fff2e0");
    underline(g, w * 0.5, h * 0.52, w * 0.42, t);
    text(g, "METHANE-FREE BROTH", w * 0.5, h * 0.66, MONO(14), C.amber, { track: 2 });
    text(g, "DECK 4 · OPEN ALL TITAN DAY", w * 0.5, h * 0.66 + 20, MONO(12), C.mute, { track: 2 });
  }
  scanlines(g, w, h, 0.08);
}

function drawDive(g, w, h, t, o) {
  panel(g, w, h, "#02080a");
  const v = o === "v";
  const cx = v ? w / 2 : w * 0.74, cy = v ? h * 0.36 : h * 0.5;
  // sonar rings
  for (let i = 0; i < 5; i++) {
    const k = (t * 0.45 + i / 5) % 1;
    g.strokeStyle = `rgba(63,227,232,${(1 - k) * 0.7})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, k * (v ? w * 0.48 : h * 0.62), 0, Math.PI * 2);
    g.stroke();
  }
  // the sweep
  g.save();
  g.translate(cx, cy);
  g.rotate(t * 1.4);
  const sw = g.createLinearGradient(0, 0, v ? w * 0.45 : h * 0.55, 0);
  sw.addColorStop(0, "rgba(63,227,232,0.5)");
  sw.addColorStop(1, "rgba(63,227,232,0)");
  g.fillStyle = sw;
  g.beginPath();
  g.moveTo(0, 0);
  g.arc(0, 0, v ? w * 0.45 : h * 0.55, -0.35, 0);
  g.fill();
  g.restore();
  // a little submersible glyph at the centre
  g.fillStyle = C.white;
  g.beginPath();
  g.ellipse(cx, cy, 16, 7, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(cx - 3, cy - 12, 6, 6);
  const pad = w * 0.07;
  if (v) {
    const px = fitText(g, "GANNET", w - pad * 2, 70, HEAVY, "expanded");
    text(g, "GANNET", pad, h * 0.72, HEAVY(px), C.white, { stretch: "expanded" });
    text(g, "DIVES", pad, h * 0.72 + px * 0.9, HEAVY(px), C.white, { stretch: "expanded" });
    pill(g, "DIVE", pad, h * 0.9, 34, C.yellow);
  } else {
    const px = fitText(g, "GANNET", w * 0.5, 84, HEAVY, "expanded");
    text(g, "GANNET", pad, h * 0.4, HEAVY(px), C.white, { stretch: "expanded" });
    text(g, "DIVES", pad, h * 0.4 + px * 0.92, HEAVY(px), C.white, { stretch: "expanded" });
    underline(g, pad, h * 0.4 + px * 1.12, w * 0.46, t);
    text(g, "300 M DOWN · LIGHTS INCLUDED", pad, h * 0.4 + px * 1.12 + 24, MONO(13), C.mute, { track: 2 });
    pill(g, "DIVE", pad, h * 0.82, 34, C.yellow);
  }
  scanlines(g, w, h, 0.1);
  glitch(g, w, h, t, 3);
}

function drawFly(g, w, h, t, o) {
  panel(g, w, h, "#0c0904");
  const v = o === "v";
  // a winged figure in amber line art, flapping slowly
  const cx = v ? w * 0.5 : w * 0.73, cy = v ? h * 0.3 : h * 0.48, s = v ? w * 0.36 : h * 0.4;
  const flap = Math.sin(t * 2.2) * 0.35;
  g.strokeStyle = C.amber;
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  g.arc(cx, cy - s * 0.42, s * 0.09, 0, Math.PI * 2);
  g.moveTo(cx, cy - s * 0.32);
  g.lineTo(cx, cy + s * 0.25);
  g.moveTo(cx, cy + s * 0.25);
  g.lineTo(cx - s * 0.12, cy + s * 0.6);
  g.moveTo(cx, cy + s * 0.25);
  g.lineTo(cx + s * 0.12, cy + s * 0.6);
  g.stroke();
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx, cy - s * 0.2);
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * (1.2 + flap) * side;
      const r = s * (0.18 + i * 0.13);
      g.lineTo(cx + Math.sin(a) * r * side * side, cy - s * 0.2 - Math.cos(a) * r * 0.55 + i * 3);
    }
    g.stroke();
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * (1.2 + flap) * side;
      const r = s * (0.18 + i * 0.13);
      const x = cx + Math.sin(a) * r, y = cy - s * 0.2 - Math.cos(a) * r * 0.55 + i * 3;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + side * 4, y + s * 0.22);
      g.stroke();
    }
  }
  const pad = w * 0.07;
  const words = ["FLY", "WITH", "YOUR", "ARMS"];
  if (v) {
    const px = fitText(g, "ARMS", w - pad * 2, 60, HEAVY, "expanded");
    words.forEach((s2, i) => text(g, s2, pad, h * 0.58 + i * px * 0.88, HEAVY(px), i === 3 ? C.amber : C.white, { stretch: "expanded" }));
    text(g, "WING RENTALS · DECK 9", pad, h * 0.95, MONO(12), C.mute, { track: 2 });
  } else {
    const px = fitText(g, "WITH YOUR", w * 0.52, 58, HEAVY, "expanded");
    text(g, "FLY WITH", pad, h * 0.34, HEAVY(px), C.white, { stretch: "expanded" });
    text(g, "YOUR ARMS", pad, h * 0.34 + px * 0.95, HEAVY(px), C.amber, { stretch: "expanded" });
    underline(g, pad, h * 0.34 + px * 1.16, w * 0.5, t);
    text(g, "0.14 G · 1.5 BAR · WING RENTALS DECK 9", pad, h * 0.34 + px * 1.16 + 24, MONO(12), C.mute, { track: 2 });
  }
  scanlines(g, w, h, 0.08);
}

function drawWeather(g, w, h, t, o) {
  panel(g, w, h, "#05070c");
  const v = o === "v";
  const pad = w * 0.07;
  text(g, "KRAKEN WEATHER", pad, h * 0.16, MONO(v ? 13 : 15), C.cyan, { track: 3 });
  g.fillStyle = "rgba(63,227,232,0.25)";
  g.fillRect(pad, h * 0.16 + 8, w - pad * 2, 1);
  const temp = "−179°";
  const px = fitText(g, temp, w * (v ? 0.86 : 0.5), v ? 96 : 120, THIN, "expanded");
  text(g, temp, pad, h * (v ? 0.42 : 0.62), THIN(px), C.white, { stretch: "expanded" });
  const rows = [["DRIZZLE", "METHANE"], ["1.47 BAR", "PRESSURE"], ["0.3 M/S", "WIND"]];
  rows.forEach(([a, b], i) => {
    const x = v ? pad : w * 0.62, y = v ? h * (0.56 + i * 0.1) : h * (0.34 + i * 0.16);
    text(g, a, x, y, MID(v ? 20 : 22), C.white, { stretch: "expanded" });
    text(g, b, x, y + 15, MONO(10), C.mute, { track: 2 });
  });
  // the scrolling ticker band
  g.fillStyle = C.amber;
  g.fillRect(0, h - 30, w, 30);
  const msg = "  ·  SUNRISE IN 4 EARTH DAYS  ·  FERRY TO PUNGA MARE DELAYED  ·  DRIZZLE EASING BY DECK 9  ·  SATURN STILL THERE, PROBABLY";
  g.save();
  g.beginPath();
  g.rect(0, h - 30, w, 30);
  g.clip();
  g.font = MONO(14);
  g.letterSpacing = "2px";
  const mw = g.measureText(msg).width;
  const x0 = -((t * 60) % mw);
  g.fillStyle = "#120c00";
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillText(msg, x0, h - 15);
  g.fillText(msg, x0 + mw, h - 15);
  g.letterSpacing = "0px";
  g.restore();
  scanlines(g, w, h, 0.08);
}

const FLAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:·-";
function drawDepartures(g, w, h, t, o) {
  panel(g, w, h, "#09090b");
  const rows = [
    ["HL-07", "ORBIT", "18:40", "BOARDING"],
    ["HL-12", "LIGEIA", "19:05", "ON TIME"],
    ["FERRY", "PUNGA", "19:20", "DELAYED"],
    ["HL-03", "SELK", "19:55", "ON TIME"],
    ["SKIFF", "MAYDA", "20:10", "GATE 9"],
  ];
  const v = o === "v";
  const pad = w * 0.06;
  text(g, "DEPARTURES", pad, h * 0.13, MID(v ? 22 : 26), C.white, { track: 6, stretch: "expanded" });
  text(g, "HALCYON LINES · GATE 3", w - pad, h * 0.13, MONO(11), C.amber, { align: "right", track: 2 });
  const n = v ? 5 : 5;
  const rowH = (h * 0.78) / n;
  const cycle = Math.floor(t / 7);
  rows.slice(0, n).forEach((r, i) => {
    const y = h * 0.2 + i * rowH;
    const cols = v ? [r[0], r[1], r[3]] : r;
    const xs = v ? [pad, w * 0.36, w * 0.62] : [pad, w * 0.24, w * 0.47, w * 0.64];
    cols.forEach((s, c) => {
      // each cell flips through random glyphs for a moment after the board changes, then settles (staggered)
      const settle = (t % 7) - (i * 0.15 + c * 0.1);
      let str = s;
      if (settle < 0.9 && cycle > 0) str = s.replace(/[^ ]/g, () => FLAP[(Math.random() * FLAP.length) | 0]);
      for (let k = 0; k < str.length; k++) {
        const cw = (v ? 11 : 14) * 1.15;
        const x = xs[c] + k * cw;
        g.fillStyle = "#16161a";
        g.fillRect(x, y, cw - 2, rowH * 0.7);
        g.fillStyle = "#000";
        g.fillRect(x, y + rowH * 0.35, cw - 2, 1);
        const col = c === cols.length - 1 ? (str.startsWith("DEL") ? C.red : str.startsWith("BOARD") ? C.yellow : C.white) : C.white;
        text(g, str[k], x + (cw - 2) / 2, y + rowH * 0.36, MONO(v ? 15 : 19), col, { align: "center", base: "middle" });
      }
    });
  });
}

function drawNoFire(g, w, h, t, o) {
  panel(g, w, h, "#0d0505");
  const v = o === "v";
  const cx = v ? w / 2 : w * 0.25, cy = v ? h * 0.3 : h / 2, R = v ? w * 0.3 : h * 0.32;
  // a flame, struck through
  g.fillStyle = "rgba(255,120,40,0.9)";
  g.beginPath();
  const fl = Math.sin(t * 6) * 0.06;
  g.moveTo(cx, cy - R * (0.9 + fl));
  g.bezierCurveTo(cx + R * 0.7, cy - R * 0.2, cx + R * 0.5, cy + R * 0.7, cx, cy + R * 0.75);
  g.bezierCurveTo(cx - R * 0.5, cy + R * 0.7, cx - R * 0.7, cy - R * 0.2, cx, cy - R * (0.9 + fl));
  g.fill();
  g.strokeStyle = C.red;
  g.lineWidth = R * 0.14;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.moveTo(cx - R * 0.7, cy - R * 0.7);
  g.lineTo(cx + R * 0.7, cy + R * 0.7);
  g.stroke();
  const pad = w * 0.07;
  if (v) {
    const px = fitText(g, "FIRE", w - pad * 2, 80, HEAVY, "expanded");
    text(g, "NO", pad, h * 0.66, HEAVY(px), C.white, { stretch: "expanded" });
    text(g, "FIRE", pad, h * 0.66 + px * 0.9, HEAVY(px), C.white, { stretch: "expanded" });
    text(g, "THERE IS NO OXYGEN", pad, h * 0.92, MONO(12), C.mute, { track: 2 });
  } else {
    const px = fitText(g, "NO FIRE", w * 0.5, 96, HEAVY, "expanded");
    text(g, "NO FIRE", w * 0.46, h * 0.5, HEAVY(px), C.white, { stretch: "expanded" });
    underline(g, w * 0.46, h * 0.5 + px * 0.22, w * 0.46, t);
    text(g, "NO OXYGEN · NO FIRE · NO PROBLEM", w * 0.46, h * 0.5 + px * 0.22 + 26, MONO(13), C.mute, { track: 2 });
  }
  scanlines(g, w, h, 0.08);
}

function drawTides(g, w, h, t, o) {
  panel(g, w, h, "#04070a");
  const pad = w * 0.07;
  text(g, "TIDE TABLE", pad, h * 0.2, MID(o === "v" ? 24 : 28), C.white, { track: 6, stretch: "expanded" });
  text(g, "KRAKEN MARE · SATURN TIDE", pad, h * 0.2 + 20, MONO(11), C.cyan, { track: 2 });
  // the curve, with a moving now-marker
  const x0 = pad, x1 = w - pad, y0 = h * 0.62, amp = h * 0.16;
  g.strokeStyle = "rgba(63,227,232,0.25)";
  g.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const x = x0 + ((x1 - x0) * i) / 8;
    g.beginPath();
    g.moveTo(x, y0 - amp * 1.3);
    g.lineTo(x, y0 + amp * 1.3);
    g.stroke();
  }
  g.strokeStyle = C.cyan;
  g.lineWidth = 3;
  g.beginPath();
  for (let x = x0; x <= x1; x += 4) {
    const y = y0 - Math.sin(((x - x0) / (x1 - x0)) * Math.PI * 4 + t * 0.2) * amp;
    x === x0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke();
  const nx = x0 + (x1 - x0) * 0.38;
  const ny = y0 - Math.sin(0.38 * Math.PI * 4 + t * 0.2) * amp;
  g.fillStyle = C.amber;
  g.beginPath();
  g.arc(nx, ny, 6, 0, Math.PI * 2);
  g.fill();
  text(g, "NOW +0.62 M", nx + 12, ny - 10, MONO(12), C.amber, { track: 2 });
  text(g, "SATURN LIFTS THE SEA 1 M EVERY 16 DAYS", pad, h * 0.94, MONO(11), C.mute, { track: 1 });
}

function drawKraken(g, w, h, t) {
  panel(g, w, h, "#06030a");
  // tentacles: neon tubes curling up behind the wordmark
  for (let k = 0; k < 8; k++) {
    const bx = w * (0.08 + k * 0.12);
    g.strokeStyle = k % 2 ? "rgba(63,227,232,0.85)" : "rgba(255,61,187,0.9)";
    g.lineWidth = 7;
    g.lineCap = "round";
    g.shadowColor = g.strokeStyle;
    g.shadowBlur = 16;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const s = i / 40;
      const curl = Math.sin(t * 1.1 + k * 0.9 + s * 6) * (20 + s * 60) * (k % 2 ? 1 : -1);
      const x = bx + curl * s, y = h - s * h * 0.95;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    // suckers
    g.shadowBlur = 0;
    g.fillStyle = "rgba(255,255,255,0.7)";
    for (let i = 4; i < 36; i += 5) {
      const s = i / 40;
      const curl = Math.sin(t * 1.1 + k * 0.9 + s * 6) * (20 + s * 60) * (k % 2 ? 1 : -1);
      g.beginPath();
      g.arc(bx + curl * s + 6, h - s * h * 0.95, 2.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.shadowBlur = 0;
  const px = fitText(g, "KRAKEN PORT", w * 0.84, 170, HEAVY, "expanded", 6);
  g.save();
  g.shadowColor = "rgba(255,255,255,0.6)";
  g.shadowBlur = 20;
  text(g, "KRAKEN PORT", w / 2, h * 0.64, HEAVY(px), C.white, { align: "center", stretch: "expanded", track: 6 });
  g.restore();
  underline(g, w * 0.3, h * 0.64 + px * 0.16, w * 0.4, t);
  text(g, "WELCOME TO TITAN · POP. 41 200 · PLEASE DO NOT FEED THE SEA", w / 2, h * 0.64 + px * 0.16 + 30, MONO(18), C.mute, { align: "center", track: 4 });
  scanlines(g, w, h, 0.1);
  glitch(g, w, h, t, 7);
}


export { corners };
