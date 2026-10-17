// 天龍閣, the Tenryū pagoda: Kraken Port's temple, standing on its island in the basin at the end of the Grand
// Channel's first reach, so the canal runs to it the way an avenue runs to a gate. Nine tiers of dark timber and
// lattice windows glowing gold, vermilion columns round every veranda, a bracket band under deep eaves whose corners
// fly up, every eave traced in neon (cyan and pink in turn), jewels of light at the eave tips, and a gilt finial with
// nine rings and a red beacon. Under it, two octagonal stone terraces and a stair down to the water. Round it a dragon
// of light flies for ever, rising and falling as it goes.
// After the references: the neon-eaved pagoda in pink fog (6), the red-pillared tiered pagoda at the end of its
// avenue (7), with Night City's towers standing behind (5). Built with the threejs-towers vocabulary in pavilion.js.
import * as THREE from "three";
import {
  vec2, vec3, float, mix, step, smoothstep, abs, fract, floor, sin, cos, exp, max, min, pow, clamp, attribute, fwidth,
  hash as rawHash, uniform, positionWorld, positionGeometry, cameraPosition, normalize, cross, dot, normalGeometry, varying,
  length, uv, atan2,
} from "three/tsl";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Builder, PART } from "./pavilion.js";
import { glowPoints, landmarkFog, hashF } from "./fx.js";

const hash = (x) => hashF(float(x).add(1048576.0));
const ss = (a, b, x) => (a > b ? float(1).sub(smoothstep(b, a, x)) : smoothstep(a, b, x));
const aaLine = (d, hw) => {
  const fw = clamp(fwidth(d), 1e-5, 1e4);
  const w = max(float(hw), fw.mul(0.8));
  return float(1).sub(smoothstep(w.sub(fw.mul(0.5)), w.add(fw.mul(0.5)), d)).mul(float(hw).div(w));
};
const gridD = (x, p) => abs(fract(x.div(p).add(0.5)).sub(0.5)).mul(p);
const COLUMN = 7, BRACKET = 8, STONE = 9, GOLD = 10;
const TIERS = 9;

/** The roof's height at distance r from the centre of a square hip roof (the same profile Builder.roof uses). */
const roofY = (yE, yT, reach, r, pw) => yT - (yT - yE) * (1 - Math.pow(1 - Math.min(1, r / reach), pw));

export function createPagoda(U, { x: cx = 0, z: cz = -470, s = 1 } = {}) {
  const group = new THREE.Group();
  const B = new Builder();
  const jewels = []; // glows at the eave tips: [x, y, z, size, r, g, b]
  const S = (v) => v * s;

  // ---- the terraces: two octagons of dark stone, a stair down to the water on the harbour side ---------------------------
  B.stretch = -1;
  const R1 = S(104), R2 = S(86), H1 = S(9), H2 = S(7);
  B.prism(cx, cz, S(-6), H1, R1 * 1.02, R1, 8, { part: STONE, capTop: true });
  B.prism(cx, cz, H1, H1 + H2, R2 * 1.02, R2, 8, { part: STONE, capTop: true });
  for (let k = 0; k < 8; k++) {
    // the stair: eight broad steps from the water to the lower terrace, and on up to the upper one
    const sw = S(34), sd = S(2.6), top = (k + 1) * (H1 / 8);
    B.box(cx, (top - S(3)) / 2, cz + R1 * Math.cos(Math.PI / 8) + sd * (8 - k) - sd * 0.5, sw, top + S(3), sd, { part: () => STONE });
  }
  let y = H1 + H2;

  // ---- nine tiers ----------------------------------------------------------------------------------------------------------
  let w = S(128);
  const STOREY = [44, 38, 35, 33, 31, 29, 27, 25, 23].map(S);
  let lastRoof = null;
  for (let i = 0; i < TIERS; i++) {
    B.stretch = i;
    const H = STOREY[i];
    const ov = Math.max(S(4), w * 0.075); // the veranda's depth
    const deckH = S(2.4);
    // the body runs down into the roof below, so nothing shows between a veranda and the slope beneath it
    const bodyBase = lastRoof ? lastRoof.yE + S(2) : y;
    const yw = y + deckH;
    B.box(cx, (bodyBase + yw) / 2, cz, w, yw - bodyBase, w, { part: () => PART.TIMBER });
    // the veranda deck
    B.box(cx, y + deckH / 2, cz, w + ov * 2, deckH, w + ov * 2, { part: (f) => (f === "py" ? PART.DECK : PART.TIMBER) });
    // the walls: lattice windows, floor upon floor
    B.box(cx, yw + H / 2, cz, w, H, w, { part: (f) => (f === "py" || f === "ny" ? PART.TIMBER : PART.SHOJI), vBase: yw });
    // vermilion columns round the veranda edge
    const n = i < 3 ? 7 : i < 6 ? 5 : 4;
    const e = w / 2 + ov - S(1.8);
    const cr = Math.max(S(0.9), w * 0.011);
    for (let k = 0; k < n; k++) {
      const t = -e + (2 * e * k) / (n - 1);
      const spots = [[t, e], [t, -e]];
      if (k > 0 && k < n - 1) spots.push([e, t], [-e, t]); // (the corners are already stood by the front and back rows)
      for (const [px, pz] of spots) B.prism(cx + px, cz + pz, yw, yw + H, cr, cr, 8, { part: COLUMN });
    }
    // the rail round the veranda, lit
    const rh = S(1.2), re = w / 2 + ov - S(0.3);
    for (const [sx, sz, lx, lz] of [[0, 1, 1, 0], [0, -1, 1, 0], [1, 0, 0, 1], [-1, 0, 0, 1]]) {
      B.box(cx + sx * re, yw + rh, cz + sz * re, lx ? (w + ov * 2) : S(0.5), S(0.45), lz ? (w + ov * 2) : S(0.5), { part: () => PART.RAIL });
    }
    // the bracket band under the eave
    const yb = yw + H;
    const bw = w + ov * 2 + S(3);
    B.box(cx, yb + S(2.2), cz, bw, S(4.4), bw, { part: (f) => (f === "py" ? PART.TIMBER : BRACKET), vBase: yb });
    // the roof: deep eaves, corners flying up
    const yE = yb + S(4.4);
    const reach = w / 2 + ov + S(1.5) + Math.max(S(10), w * 0.32);
    const yT = yE + reach * 0.36;
    const pw = 1.8, lift = reach * 0.2, flare = 0.1;
    B.roof({ cx, cz, yE, yT, yS: yE - S(0.4), hx: reach, hz: reach, wx: bw / 2, wz: bw / 2, lift, flare, pw, nu: 18, nt: 6, fh: S(3.2) });
    const tip = reach * (1 + flare);
    const jc = i % 2 ? [1.0, 0.25, 0.6] : [0.35, 0.9, 1.0];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) jewels.push([cx + sx * tip, yE + lift + S(1.5), cz + sz * tip, S(3.2), ...jc]);
    lastRoof = { yE, yT, reach, pw };
    // the next tier stands on this roof where its veranda meets the slope
    w *= 0.86;
    const nextOv = Math.max(S(4), w * 0.075);
    y = roofY(yE, yT, reach, w / 2 + nextOv, pw);
    if (i === TIERS - 1) y = yT;
  }

  // ---- the finial: a drum, nine gilt rings, a jewel, a spike, a red beacon -----------------------------------------------------
  B.stretch = TIERS;
  const fx0 = y;
  B.prism(cx, cz, fx0 - S(2), fx0 + S(8), S(7), S(6), 8, { part: GOLD, capTop: true });
  let fy = fx0 + S(8);
  B.prism(cx, cz, fy, fy + S(70), S(1.4), S(0.9), 8, { part: GOLD });
  for (let k = 0; k < 9; k++) {
    const ry = fy + S(6) + k * S(6.2);
    const rr = S(5.2) - k * S(0.32);
    B.prism(cx, cz, ry, ry + S(1.6), rr, rr, 12, { part: GOLD, capTop: true, capBot: true });
  }
  fy += S(70);
  B.prism(cx, cz, fy, fy + S(6), S(3.4), S(3.8), 10, { part: GOLD });
  B.prism(cx, cz, fy + S(6), fy + S(12), S(3.8), S(1.2), 10, { part: GOLD, capTop: true });
  B.prism(cx, cz, fy + S(12), fy + S(40), S(0.8), S(0.1), 6, { part: GOLD });
  const top = fy + S(40);
  jewels.push([cx, top + S(2), cz, S(10), 1.0, 0.16, 0.08]);

  // ---- the pagoda's one material --------------------------------------------------------------------------------------------
  const geo = B.geometry();
  const mesh = new THREE.Mesh(geo, pagodaMaterial(U));
  mesh.frustumCulled = false;
  group.add(mesh);
  group.add(glowPoints(U, jewels, { blink: false, gain: 2.2 }));

  // ---- the dragon ---------------------------------------------------------------------------------------------------------------
  const dragon = new URLSearchParams(location.search).has("nodragon") ? { mesh: new THREE.Group(), update() {} } : buildDragon(U, { cx, cz, R0: S(150), Ra: S(14), Y0: S(300), Ya: S(120), L: S(600) });
  group.add(dragon.mesh);

  group.traverse((o) => (o.frustumCulled = false));
  return {
    group,
    top,
    island: R1,
    update(time) {
      dragon.update(time);
    },
  };
}

/** Every part of the pagoda, painted by the part id and tier baked into its vertices. */
function pagodaMaterial(U) {
  const m = new THREE.MeshBasicNodeMaterial();
  const P = attribute("aPart", "vec4");
  const id = P.x, pu = P.y, pv = P.z, tier = P.w;
  const is = (k) => step(k - 0.5, id).mul(step(id, k + 0.5));
  const nightK = mix(float(0.3), float(1.0), U.night);
  const PINK = vec3(1.0, 0.18, 0.62), CYAN = vec3(0.25, 0.88, 1.0);
  // cyan and pink in turn, cyan at the top (the way the reference's eaves alternate)
  const odd = fract(tier.mul(0.5)).mul(2.0);
  const neon = mix(CYAN, PINK, step(0.5, odd));
  const WARM = vec3(1.0, 0.56, 0.22);
  const TIMBER = vec3(0.013, 0.009, 0.008);
  const seed = hash(tier.mul(13.0).add(3.0));

  // lattice windows: rooms 5 m wide, floors 4.4 m tall, most lit gold, a few in the tier's neon, some dark; a kumiko
  // lattice over each, averaged away with distance; a slab line at every floor
  const bay = floor(pu.div(5.0)), fl = floor(pv.div(4.4));
  const room = hash(bay.mul(7.13).add(fl.mul(31.7)).add(seed.mul(997.0)));
  const lit = step(0.42, room);
  const tint = step(0.9, hash(bay.mul(1.7).add(fl.mul(3.3)).add(seed.mul(171.0))));
  const roomCol = mix(WARM, neon, tint.mul(0.8)).mul(mix(float(0.7), float(1.3), hash(room.mul(91.0))));
  const kumiko = max(aaLine(gridD(pu, 1.25), 0.07), aaLine(gridD(pv, 1.1), 0.07));
  const frame = min(max(aaLine(gridD(pu, 5.0), 0.55), aaLine(gridD(pv, 4.4), 0.7)), 1.0);
  const paper = mix(vec3(0.6, 0.56, 0.48), roomCol.mul(lit).mul(1.15).add(WARM.mul(0.015)), U.night).mul(float(1.0).sub(kumiko.mul(0.75)));
  const shoji = mix(paper, TIMBER, frame);
  // tiles: dark slate courses with a breath of the eave's neon in them
  const tile = vec3(0.028, 0.032, 0.048).mul(float(1.0).sub(aaLine(gridD(pv, 1.4), 0.12).mul(0.45))).mul(float(1.0).sub(aaLine(gridD(pu, 1.1), 0.1).mul(0.25)))
    .add(neon.mul(0.035));
  // the eave's neon tube, a slow pulse running round it
  const run = sin(pu.div(14.0).sub(U.time.mul(1.6)).add(tier.mul(1.3))).mul(0.12).add(0.88);
  const fascia = neon.mul(2.8).mul(run).mul(nightK);
  // under the eaves: dark, the rooms' light catching the rafters only near the wall (gone within ten metres), and a
  // breath of the eave's own neon (after tone mapping even a tenth of the wall's glow reads as lit plaster, so it falls fast)
  const rafters = aaLine(gridD(pu, 3.2), 0.3);
  const soffit = WARM.mul(exp(pv.mul(-0.24)).mul(1.1)).mul(nightK).mul(float(1.0).sub(rafters.mul(0.6))).add(TIMBER).add(neon.mul(0.025));
  const deck = vec3(0.05, 0.03, 0.022).add(WARM.mul(0.1).mul(nightK));
  const rail = neon.mul(1.7).mul(nightK);
  // vermilion columns, lacquered: brighter where the floodlights catch them low down, a highlight down each face
  const lacquer = vec3(0.42, 0.028, 0.018).mul(mix(float(0.55), float(1.0), U.night));
  const flood = exp(pv.mul(-0.06)).mul(0.9).add(0.25);
  const sheen = ss(0.0, 0.35, fract(pu.div(1.2))).mul(ss(1.0, 0.65, fract(pu.div(1.2)))).mul(0.5).add(0.6);
  const column = lacquer.mul(flood).mul(sheen).add(vec3(1.0, 0.2, 0.08).mul(0.05));
  // the bracket band: dark, gilt bracket heads in a row
  const bh = ss(0.9, 0.5, gridD(pu, 4.0)).mul(ss(1.4, 0.8, abs(pv.sub(2.2))));
  const bracket = TIMBER.add(vec3(1.0, 0.68, 0.3).mul(bh).mul(0.9).mul(nightK));
  // stone: dark granite courses, uplit warm from the water, a gold line along each terrace's lip
  const course = max(aaLine(gridD(pv, 1.6), 0.08), aaLine(gridD(pu.add(floor(pv.div(1.6)).mul(1.7)), 3.4), 0.08));
  const stone = vec3(0.045, 0.042, 0.05).mul(hash(floor(pu.div(3.4)).add(floor(pv.div(1.6)).mul(37.0))).mul(0.4).add(0.8))
    .mul(float(1.0).sub(course.mul(0.5))).add(WARM.mul(exp(pv.mul(-0.25)).mul(0.25)).mul(nightK));
  // gilt: bright, catching the light
  const gold = vec3(1.0, 0.66, 0.26).mul(1.25).mul(mix(float(0.7), float(1.0), U.night));
  const col = TIMBER.add(neon.mul(0.012)).mul(is(PART.TIMBER)).add(shoji.mul(is(PART.SHOJI))).add(tile.mul(is(PART.TILE)))
    .add(fascia.mul(is(PART.FASCIA))).add(soffit.mul(is(PART.SOFFIT))).add(deck.mul(is(PART.DECK))).add(rail.mul(is(PART.RAIL)))
    .add(column.mul(is(COLUMN))).add(bracket.mul(is(BRACKET))).add(stone.mul(is(STONE))).add(gold.mul(is(GOLD)));
  m.colorNode = landmarkFog(U, col, 0.42);
  m.fog = false;
  // dev: ?dbg=pagoda shows the part ids (red), u (green bands) and v (blue ramp over 60 m)
  if (new URLSearchParams(location.search).get("dbg") === "pagoda") m.colorNode = vec3(id.div(10.0), fract(pu.div(10.0)), pv.div(60.0));
  if (new URLSearchParams(location.search).get("dbg") === "soff1") m.colorNode = soffit.mul(is(PART.SOFFIT));
  if (new URLSearchParams(location.search).get("dbg") === "soff2") m.colorNode = col.mul(is(PART.SOFFIT));
  if (new URLSearchParams(location.search).get("dbg") === "ids") m.colorNode = vec3(is(PART.TILE), is(PART.SOFFIT), is(PART.SHOJI)).add(vec3(0.3).mul(is(PART.FASCIA)));
  if (new URLSearchParams(location.search).get("dbg") === "spill") m.colorNode = vec3(step(pv, 10.0), step(30.0, pv), step(10.0, pv).mul(step(pv, 30.0))).mul(is(PART.SOFFIT));
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------------
// the dragon: modelled in Blender (tools/dragon.py), straight along +x with the head forward, and flown along a closed loop
// round the pagoda on the GPU: every vertex finds its place on the body (s, from its x), the loop's frame there, and keeps
// its offset in that frame, so the whole beast bends along its flight. A slow wave runs down the body; mane, whiskers
// and tongue stream behind. Lacquered crimson scales, gold belly plates, flame-gradient mane and crest, ivory horns,
// teeth and claws, eyes like embers; lit gold from the pagoda, pink from the city below, with a neon rim.
// ---------------------------------------------------------------------------------------------------------------------------
const P_BODY = 0, P_TONGUE = 1, P_SPINE = 2, P_HEAD = 3, P_HORN = 4, P_WHISKER = 5, P_HAIR = 6, P_CLAW = 7, P_EYE = 8, P_LEG = 9;
const MODEL_L = 100; // the model's length, head to tail, in its own units

/** The loop on the CPU too, for the pearl the dragon chases. */
function loopAt(u, { cx, cz, R0, Ra, Y0, Ya }, out = new THREE.Vector3()) {
  const th = u * Math.PI * 2;
  const R = R0 + Math.sin(th * 3) * Ra;
  return out.set(cx + R * Math.cos(th), Y0 + Math.sin(th) * Ya, cz + R * Math.sin(th));
}

function buildDragon(U, opts) {
  const { cx, cz, R0, Ra, Y0, Ya, L } = opts;
  const group = new THREE.Group();
  const uHead = uniform(0);
  const loopLen = Math.PI * 2 * R0;
  const Lfrac = L / loopLen;
  const K = L / MODEL_L; // model units to metres
  const p = positionGeometry, n = normalGeometry;
  const tag = uv();
  const part = floor(tag.x.mul(10.0));
  const is = (k) => float(1.0).sub(step(0.5, abs(part.sub(k))));
  const strandT = float(1.0).sub(tag.y); // (glTF stores v flipped: 0 at the root of a strand, 1 at its tip)
  const s = clamp(p.x.negate().div(MODEL_L), 0.0, 1.0);
  const ox = p.x.add(s.mul(MODEL_L));
  // the loop and its frame where this part of the body is
  const u = uHead.sub(s.mul(Lfrac));
  const th = u.mul(Math.PI * 2);
  const R = float(R0).add(sin(th.mul(3.0)).mul(Ra));
  const dR = cos(th.mul(3.0)).mul(3.0 * Ra);
  const C = vec3(float(cx).add(R.mul(cos(th))), float(Y0).add(sin(th).mul(Ya)), float(cz).add(R.mul(sin(th))));
  const dC = vec3(dR.mul(cos(th)).sub(R.mul(sin(th))), cos(th).mul(Ya), dR.mul(sin(th)).add(R.mul(cos(th))));
  const T = normalize(dC);
  const side = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
  const up = cross(side, T);
  // the swim: a wave down the body (stronger toward the tail), the head steadier
  const t = U.time;
  const sway = sin(s.mul(9.0).sub(t.mul(1.1))).mul(K * 2.6).mul(s.mul(0.85).add(0.15));
  const heave = cos(s.mul(6.5).sub(t.mul(0.8))).mul(K * 1.6).mul(s.mul(0.7).add(0.3));
  // the mane, whiskers and tongue stream and ripple from root to tip
  const strand = is(P_HAIR).add(is(P_WHISKER)).add(is(P_TONGUE));
  const flow = sin(strandT.mul(5.0).sub(t.mul(2.4)).add(p.x.mul(0.3))).mul(strandT.mul(strandT)).mul(0.9).mul(strand);
  const local = vec3(ox, p.y.add(flow), p.z.add(flow.mul(0.7))).mul(K);
  const world = C.add(side.mul(sway)).add(up.mul(heave)).add(T.mul(local.x)).add(up.mul(local.y)).add(side.mul(local.z));
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  m.positionNode = world;
  // shading: light from the pagoda (gold), the city below (pink), the sky (violet), a neon rim; scales and plates drawn in
  const nW = varying(normalize(T.mul(n.x).add(up.mul(n.y)).add(side.mul(n.z))));
  const wP = varying(world);
  const view = normalize(cameraPosition.sub(wP));
  const ndv = abs(dot(nW, view));
  const nF = nW.mul(step(0.0, dot(nW, view)).mul(2.0).sub(1.0)); // face the camera (two-sided parts)
  const toPagoda = normalize(vec3(float(cx).sub(wP.x), float(0.0), float(cz).sub(wP.z)));
  const lit = vec3(1.0, 0.62, 0.3).mul(pow(max(dot(nF, toPagoda), 0.0), 1.5).mul(0.9))
    .add(vec3(1.0, 0.25, 0.55).mul(max(nF.y.negate(), 0.0).mul(0.45)))
    .add(vec3(0.45, 0.35, 0.9).mul(max(nF.y, 0.0).mul(0.22)))
    .add(0.05);
  const rim = pow(float(1.0).sub(ndv), 3.2);
  // scales: overlapping arcs round and along the body; the belly in gold plates
  const around = atan2(p.y, p.z).div(Math.PI * 2).add(0.5);
  const sc = vec2(s.mul(420.0), around.mul(22.0).add(floor(s.mul(420.0)).mul(0.5)));
  const cell = fract(sc);
  const arc = aaLine(abs(length(cell.sub(vec2(0.5, 0.0))).sub(0.5)), 0.09);
  // each scale darker toward its root, catching light at its rim
  const scaleShade = smoothstep(0.0, 0.5, length(cell.sub(vec2(0.5, 0.0)))).mul(0.6).add(0.4);
  const rLocal = max(length(vec2(p.y, p.z)), 0.001);
  const belly = smoothstep(-0.25, -0.6, p.y.div(rLocal)).mul(is(P_BODY).add(is(P_LEG)));
  const plate = aaLine(gridD(s.mul(260.0), 1.0), 0.06);
  const CRIMSON = vec3(0.32, 0.018, 0.045), GOLD = vec3(0.95, 0.6, 0.22), IVORY = vec3(0.95, 0.88, 0.74);
  const scaleCol = mix(CRIMSON.mul(scaleShade), vec3(1.0, 0.42, 0.3), arc.mul(0.85));
  const bellyCol = mix(GOLD.mul(0.75), GOLD.mul(0.35), plate);
  const skin = mix(scaleCol, bellyCol, belly);
  const flame = mix(mix(vec3(0.55, 0.04, 0.08), vec3(1.0, 0.36, 0.08), smoothstep(0.0, 0.5, strandT)), vec3(1.0, 0.86, 0.45), smoothstep(0.55, 1.0, strandT));
  const crest = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.2, 0.6), strandT);
  const albedo = skin.mul(is(P_BODY).add(is(P_LEG)))
    .add(mix(CRIMSON.mul(1.25), vec3(0.95, 0.25, 0.32), arc.mul(0.4)).mul(is(P_HEAD)))
    .add(mix(GOLD, IVORY, strandT).mul(is(P_HORN)))
    .add(mix(GOLD, IVORY, strandT).mul(is(P_WHISKER)))
    .add(flame.mul(is(P_HAIR)))
    .add(crest.mul(is(P_SPINE)))
    .add(IVORY.mul(is(P_CLAW)))
    .add(vec3(0.85, 0.12, 0.25).mul(is(P_TONGUE)));
  // what glows of itself: the eyes, the tips of the mane, the crest, a breath along the whiskers
  const glow = vec3(1.0, 0.85, 0.4).mul(3.2).mul(is(P_EYE))
    .add(flame.mul(strandT.mul(strandT).mul(1.6)).mul(is(P_HAIR)))
    .add(crest.mul(strandT.mul(1.1).add(0.25)).mul(is(P_SPINE)))
    .add(GOLD.mul(strandT.mul(0.6)).mul(is(P_WHISKER)));
  const neon = vec3(1.0, 0.24, 0.62).mul(rim).mul(0.75).mul(float(1.0).sub(is(P_EYE)));
  const col = albedo.mul(lit).add(glow).add(neon);
  m.colorNode = landmarkFog(U, col.mul(mix(float(0.45), float(1.0), U.night)), 0.42);
  m.fog = false;
  new GLTFLoader().load("assets/dragon.glb", (gltf) => {
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mesh = new THREE.Mesh(o.geometry, m);
      mesh.frustumCulled = false;
      group.add(mesh);
    });
  });
  // the pearl it chases: a glowing sphere of light just ahead of its jaws
  const uPearl = uniform(new THREE.Vector3());
  const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const toCam = normalize(cameraPosition.sub(uPearl));
  const right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  const upB = cross(toCam, right);
  const ps = float(K * 9.0);
  pm.positionNode = uPearl.add(right.mul(positionGeometry.x.mul(ps))).add(upB.mul(positionGeometry.y.mul(ps)));
  const pr = length(uv().sub(0.5)).mul(2.0);
  const flick = sin(U.time.mul(9.0)).mul(0.08).add(0.92);
  pm.colorNode = vec3(1.0, 0.9, 0.6).mul(pow(max(float(1.0).sub(pr.mul(2.2)), 0.0), 1.5).mul(3.0).add(pow(max(float(1.0).sub(pr), 0.0), 3.0).mul(vec3(1.0, 0.45, 0.2)).mul(1.2))).mul(flick)
    .mul(float(1.0).sub(U.fogFactor().mul(0.5)));
  pm.fog = false;
  const pearl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pm);
  pearl.frustumCulled = false;
  pearl.renderOrder = 8;
  group.add(pearl);
  return {
    mesh: group,
    update(time) {
      uHead.value = time * (13 / loopLen); // thirteen metres a second round the loop
      loopAt(uHead.value + (K * 16) / loopLen, opts, uPearl.value);
    },
  };
}

void positionWorld;
