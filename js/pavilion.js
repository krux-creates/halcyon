// The vocabulary of Kraken Port's wooden buildings, after threejs-towers: a few builders append into shared arrays
// (quads wound by the side they face, boxes, a hip roof with flying eaves from one profile function), every module
// variant becomes one geometry, and a whole cliff of them is drawn in one instanced call per variant. One material
// paints every part by an id baked into the vertices: dark timber, shoji glowing warm or neon from the room behind,
// dark tiles, a neon tube along every eave and ridge, light spilling under the eaves, a veranda rail lit like a sign.
import * as THREE from "three";
import { vec3, float, mix, step, smoothstep, abs, fract, floor, sin, max, min, exp, clamp, attribute, fwidth, hash as rawHash } from "three/tsl";
import { hashF } from "./fx.js";

const hash = (x) => hashF(float(x).add(1048576.0));
/** A line of half-width hw at distance d from its centre, kept at least a pixel wide and dimmed instead when it would alias. */
const aaLine = (d, hw) => {
  const fw = clamp(fwidth(d), 1e-5, 1e4); // (never zero, never infinite: a NaN anywhere would poison every part)
  const w = max(float(hw), fw.mul(0.8));
  return float(1).sub(smoothstep(w.sub(fw.mul(0.5)), w.add(fw.mul(0.5)), d)).mul(float(hw).div(w));
};
/** Distance from x to the nearest multiple of p. */
const gridD = (x, p) => abs(fract(x.div(p).add(0.5)).sub(0.5)).mul(p);

export const PART = { TIMBER: 0, SHOJI: 1, TILE: 2, FASCIA: 3, SOFFIT: 4, DECK: 5, RAIL: 6 };
export const HUE = { PINK: 0, CYAN: 1, VIOLET: 2, AMBER: 3 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Builder {
  constructor(stretch = 0) {
    this.pos = [];
    this.part = [];
    this.idx = [];
    this.stretch = stretch; // 1: u runs 0..1 and is scaled by the instance's length in the shader (bridges)
  }
  vert(p, d) {
    this.pos.push(p.x, p.y, p.z);
    this.part.push(d[0], d[1] ?? 0, d[2] ?? 0, this.stretch);
    return this.pos.length / 3 - 1;
  }
  /** Indices for a cell a-b-c-d, wound so its face looks along `out` (winding is the bug you hit most). */
  wind(ia, ib, ic, id, a, b, c, out) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.dot(out) >= 0) this.idx.push(ia, ib, ic, ia, ic, id);
    else this.idx.push(ia, ic, ib, ia, id, ic);
  }
  quad(a, b, c, d, da, db, dc, dd, out) {
    const ia = this.vert(a, da), ib = this.vert(b, db), ic = this.vert(c, dc), id = this.vert(d, dd);
    this.wind(ia, ib, ic, id, a, b, c, out);
  }
  /** An axis-aligned box. part(face) picks each face's part; u runs along the face and v up it, in metres from vBase. */
  box(cx, cy, cz, sx, sy, sz, { part = () => PART.TIMBER, vBase = cy - sy / 2, uScale = 1 } = {}) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const v0 = y0 - vBase, v1 = y1 - vBase;
    const side = (name, a, b, c, d, len, out) => {
      const k = part(name);
      this.quad(a, b, c, d, [k, 0, v0], [k, len * uScale, v0], [k, len * uScale, v1], [k, 0, v1], out);
    };
    side("px", V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), sz, V(1, 0, 0));
    side("nx", V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), sz, V(-1, 0, 0));
    side("pz", V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), sx, V(0, 0, 1));
    side("nz", V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), sx, V(0, 0, -1));
    const kt = part("py"), kb = part("ny");
    this.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), [kt, 0, 0], [kt, sx * uScale, 0], [kt, sx * uScale, sz], [kt, 0, sz], V(0, 1, 0));
    this.quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), [kb, 0, 0], [kb, sx * uScale, 0], [kb, sx * uScale, sz], [kb, 0, sz], V(0, -1, 0));
  }
  /**
   * A hip roof with flying eaves. One profile maps (panel, u across, t down) to a point: flat near the ridge and
   * steepening (the sag), corners lifting and flaring out. Eave half-sizes hx, hz at height yE; ridge at yT; the
   * soffit runs back under the eave to the wall line (wx, wz) at height yS. A neon tube runs the ridge.
   */
  roof({ cx = 0, cz = 0, yE, yT, yS = yE, hx, hz, wx, wz, lift = 1.6, flare = 0.07, pw = 1.7, nu = 6, nt = 3, fh = 0.8, uScale = 1 }) {
    const rx = Math.max(hx - hz, hx * 0.03);
    const panels = [
      { inner: (u) => [u * rx, 0], outer: (u) => [u * hx, hz], out: V(0, 0, 1), span: hx },
      { inner: (u) => [u * rx, 0], outer: (u) => [u * hx, -hz], out: V(0, 0, -1), span: hx },
      { inner: () => [rx, 0], outer: (u) => [hx, u * hz], out: V(1, 0, 0), span: hz },
      { inner: () => [-rx, 0], outer: (u) => [-hx, u * hz], out: V(-1, 0, 0), span: hz },
    ];
    const slope = Math.hypot(hz, yT - yE);
    const point = (pn, u, t) => {
      const tc = Math.min(1, t);
      const g = 1 - Math.pow(1 - tc, pw);
      const corner = u * u;
      const fl = 1 + flare * corner * Math.pow(tc, 3.2);
      const [ix, iz] = pn.inner(u), [ox, oz] = pn.outer(u);
      return V(cx + ix + (ox * fl - ix) * tc, yT - (yT - yE) * g + lift * corner * Math.pow(tc, 2.6), cz + iz + (oz * fl - iz) * tc);
    };
    for (const pn of panels) {
      // the tiles: a grid sharing its vertices so the slope shades smooth
      const ids = [], pts = [];
      for (let j = 0; j <= nt; j++) {
        ids.push([]);
        pts.push([]);
        for (let i = 0; i <= nu; i++) {
          const u = -1 + (2 * i) / nu, t = j / nt;
          const p = point(pn, u, t);
          pts[j].push(p);
          ids[j].push(this.vert(p, [PART.TILE, (u + 1) * pn.span * uScale, t * slope]));
        }
      }
      for (let j = 0; j < nt; j++) for (let i = 0; i < nu; i++) {
        this.wind(ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i], pts[j][i], pts[j][i + 1], pts[j + 1][i + 1], V(0, 1, 0));
      }
      // the fascia: a band hung under the eave edge, and the soffit back under it to the wall
      for (let i = 0; i < nu; i++) {
        const ua = -1 + (2 * i) / nu, ub = -1 + (2 * (i + 1)) / nu;
        const ea = point(pn, ua, 1), eb = point(pn, ub, 1);
        const da = ea.clone().setY(ea.y - fh), db = eb.clone().setY(eb.y - fh);
        const sa = (ua + 1) * pn.span * uScale, sb = (ub + 1) * pn.span * uScale;
        this.quad(ea, eb, db, da, [PART.FASCIA, sa, 0], [PART.FASCIA, sb, 0], [PART.FASCIA, sb, fh], [PART.FASCIA, sa, fh], pn.out);
        const wall = (u) => {
          const [ox, oz] = pn.outer(u);
          return V(cx + Math.sign(ox) * Math.min(Math.abs(ox), wx), yS, cz + Math.sign(oz) * Math.min(Math.abs(oz), wz));
        };
        // v on the soffit is metres out from the wall, so the light spilling from the rooms fades the same on any size of eave
        const wa = wall(ua), wb = wall(ub);
        const reach = (e, w) => Math.hypot(e.x - w.x, e.z - w.z);
        this.quad(da, db, wb, wa, [PART.SOFFIT, sa, reach(da, wa)], [PART.SOFFIT, sb, reach(db, wb)], [PART.SOFFIT, sb, 0], [PART.SOFFIT, sa, 0], V(0, -1, 0));
      }
    }
    // the ridge: a neon tube along the top
    this.box(cx, yT + 0.35, cz, rx * 2 + 0.8, 0.7, 0.7, { part: () => PART.FASCIA, uScale });
    return yT;
  }
  /**
   * An n-sided frustum standing on the y axis at (cx, cz): radius r0 at y0, r1 at y1 (to the corners), caps optional.
   * u runs round it in metres (at the base radius), v up it from y0.
   */
  prism(cx, cz, y0, y1, r0, r1, n, { part = PART.TIMBER, capTop = false, capBot = false, rot = Math.PI / n } = {}) {
    const ring = (y, r) => Array.from({ length: n + 1 }, (_, i) => {
      const a = rot + (i / n) * Math.PI * 2;
      return V(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
    });
    const lo = ring(y0, r0), hi = ring(y1, r1);
    const edge = 2 * r0 * Math.sin(Math.PI / n);
    for (let i = 0; i < n; i++) {
      const mid = lo[i].clone().add(lo[i + 1]).multiplyScalar(0.5).sub(V(cx, y0, cz)).setY(0);
      this.quad(lo[i], lo[i + 1], hi[i + 1], hi[i], [part, i * edge, 0], [part, (i + 1) * edge, 0], [part, (i + 1) * edge, y1 - y0], [part, i * edge, y1 - y0], mid);
    }
    const cap = (pts, y, up) => {
      const c = this.vert(V(cx, y, cz), [part, 0, 0]);
      const ids = pts.map((p) => this.vert(p, [part, p.x - cx, p.z - cz]));
      for (let i = 0; i < n; i++) {
        const nrm = new THREE.Vector3().subVectors(pts[i], V(cx, y, cz)).cross(new THREE.Vector3().subVectors(pts[i + 1], V(cx, y, cz)));
        if ((nrm.y > 0) === up) this.idx.push(c, ids[i], ids[i + 1]);
        else this.idx.push(c, ids[i + 1], ids[i]);
      }
    };
    if (capTop) cap(hi, y1, true);
    if (capBot) cap(lo, y0, false);
  }
  /** Append another builder's geometry, transformed by a matrix (rotations keep the winding). */
  merge(other, m4 = null) {
    const base = this.pos.length / 3;
    const v = new THREE.Vector3();
    for (let i = 0; i < other.pos.length; i += 3) {
      v.set(other.pos[i], other.pos[i + 1], other.pos[i + 2]);
      if (m4) v.applyMatrix4(m4);
      this.pos.push(v.x, v.y, v.z);
    }
    this.part.push(...other.part);
    for (const k of other.idx) this.idx.push(k + base);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("aPart", new THREE.Float32BufferAttribute(this.part, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** One storey: a veranda deck, shoji walls, a bracket band, posts and a rail; returns the eave height. */
function storey(B, { W, D, H, y, ov = 3, detail = 0, deck = true }) {
  const deckH = 1.0;
  if (deck) B.box(0, y + deckH / 2, 0, W + ov * 2, deckH, D + ov * 2, { part: (f) => (f === "py" ? PART.DECK : PART.TIMBER) });
  const yw = y + (deck ? deckH : 0);
  B.box(0, yw + H / 2, 0, W, H, D, { part: (f) => (f === "py" || f === "ny" ? PART.TIMBER : PART.SHOJI), vBase: yw });
  const yb = yw + H;
  B.box(0, yb + 0.6, 0, W + 1.2, 1.2, D + 1.2, { part: () => PART.TIMBER });
  if (deck) {
    const px = W / 2 + ov - 0.35, pz = D / 2 + ov - 0.35;
    const xs = [-px, px];
    if (detail) for (let x = -px + 6; x < px - 3; x += 6) xs.push(x);
    for (const x of xs) for (const z of [-pz, pz]) B.box(x, yw + (H + 1.2) / 2, z, 0.5, H + 1.2, 0.5);
    if (detail) for (const x of [-px, px]) for (let z = -pz + 6; z < pz - 3; z += 6) B.box(x, yw + (H + 1.2) / 2, z, 0.5, H + 1.2, 0.5);
    // the rail round the veranda, and (in detail) balusters under it
    const yr = yw + 1.05;
    B.box(0, yr, pz + 0.15, W + ov * 2, 0.22, 0.2, { part: () => PART.RAIL });
    B.box(0, yr, -pz - 0.15, W + ov * 2, 0.22, 0.2, { part: () => PART.RAIL });
    B.box(px + 0.15, yr, 0, 0.2, 0.22, D + ov * 2, { part: () => PART.RAIL });
    B.box(-px - 0.15, yr, 0, 0.2, 0.22, D + ov * 2, { part: () => PART.RAIL });
    if (detail) {
      for (let x = -px; x <= px; x += 1.5) for (const z of [-pz - 0.15, pz + 0.15]) B.box(x, yw + 0.5, z, 0.12, 1.0, 0.12);
    }
  }
  return yb + 1.2;
}

const VARIANTS = {
  /** a hall: one storey on a veranda under a broad hip roof */
  hall(B, detail) {
    const W = 30, D = 20, ov = 3;
    const yE = storey(B, { W, D, H: 9, y: 0, ov, detail });
    const hz = D / 2 + ov + 2.4, hx = W / 2 + ov + 2.4;
    B.roof({ yE, yT: yE + hz * 0.6, hx, hz, wx: W / 2 + 0.6, wz: D / 2 + 0.6, lift: 1.8, nu: detail ? 10 : 6, nt: detail ? 5 : 3 });
  },
  /** two storeys: the upper rises out of the lower roof, the way a castle tier does */
  two(B, detail) {
    const W = 30, D = 22, ov = 3;
    const yE = storey(B, { W, D, H: 9, y: 0, ov, detail });
    const hz = D / 2 + ov + 2.4, hx = W / 2 + ov + 2.4;
    const yT = B.roof({ yE, yT: yE + hz * 0.55, hx, hz, wx: W / 2 + 0.6, wz: D / 2 + 0.6, lift: 1.7, nu: detail ? 10 : 6, nt: detail ? 5 : 3 });
    const W2 = W * 0.62, D2 = D * 0.62;
    const top = Math.max(yT + 4.5, yE + 9);
    const H2 = top - (yE + 1);
    const yE2 = storey(B, { W: W2, D: D2, H: H2, y: yE + 1, ov: 0, deck: false, detail });
    const hz2 = D2 / 2 + 3.2, hx2 = W2 / 2 + 3.2;
    B.roof({ yE: yE2, yT: yE2 + hz2 * 0.7, hx: hx2, hz: hz2, wx: W2 / 2 + 0.6, wz: D2 / 2 + 0.6, lift: 1.5, nu: detail ? 8 : 5, nt: detail ? 4 : 3 });
  },
  /** a yagura: a square tower of three diminishing tiers */
  yagura(B, detail) {
    let w = 20, y = 0, prevTop = 0;
    for (let t = 0; t < 3; t++) {
      const H = t === 0 ? 9 : Math.max(7, prevTop - y + 4);
      const yE = storey(B, { W: w, D: w, H, y, ov: t === 0 ? 2.5 : 0, deck: t === 0, detail });
      const h = w / 2 + (t === 0 ? 2.5 : 0) + 2.6;
      prevTop = B.roof({ yE, yT: yE + h * 0.62, hx: h, hz: h, wx: w / 2 + 0.6, wz: w / 2 + 0.6, lift: 1.4, nu: detail ? 8 : 4, nt: detail ? 4 : 3 });
      y = yE + 1;
      w *= 0.74;
    }
    B.box(0, prevTop + 3, 0, 0.5, 6, 0.5, { part: () => PART.FASCIA });
  },
};

/** The geometry of one module variant ("hall" | "two" | "yagura"); detail adds posts, balusters and finer roofs. */
export function pavilionGeometry(variant, detail = 0) {
  const B = new Builder();
  VARIANTS[variant](B, detail);
  return B.geometry();
}

/** A roof on its own (a skirt of eaves round something taller): the same flying-eave profile at any size. */
export function roofGeometry(opts) {
  const B = new Builder();
  B.roof(opts);
  return B.geometry();
}

/** A covered corridor, one metre long (stretched to length per instance): a deck, shoji sides, a gabled roof. */
export function corridorGeometry() {
  const B = new Builder(1);
  const W = 5, wallH = 2.4, deckH = 0.8;
  B.box(0, deckH / 2, 0, 1, deckH, W, { part: (f) => (f === "py" ? PART.DECK : PART.TIMBER) });
  for (const z of [-W / 2 + 0.15, W / 2 - 0.15]) B.box(0, deckH + wallH / 2, z, 1, wallH, 0.3, { part: (f) => (f === "px" || f === "nx" || f === "py" || f === "ny" ? PART.TIMBER : PART.SHOJI), vBase: deckH });
  const yE = deckH + wallH, yT = yE + 1.6, he = W / 2 + 1.0;
  for (const sz of [-1, 1]) {
    const a = V(-0.5, yT, 0), b = V(0.5, yT, 0), c = V(0.5, yE, sz * he), d = V(-0.5, yE, sz * he);
    B.quad(a, b, c, d, [PART.TILE, 0, 0], [PART.TILE, 1, 0], [PART.TILE, 1, he], [PART.TILE, 0, he], V(0, 1, 0));
    B.quad(a, b, c, d, [PART.SOFFIT, 0, 0], [PART.SOFFIT, 1, 0], [PART.SOFFIT, 1, 1], [PART.SOFFIT, 0, 1], V(0, -1, 0));
    B.box(0, yE - 0.2, sz * he, 1, 0.4, 0.3, { part: () => PART.FASCIA });
  }
  return B.geometry();
}

/**
 * The shared material. Each instance carries aStyle = (seed, hue 0 pink | 1 cyan | 2 violet | 3 amber, how many of
 * its rooms are lit, length for stretched corridors). fogFn wraps the colour in a landmark's own fog; without it the
 * scene fog applies.
 */
export function pavilionMaterial(U, { fogFn = null, gain = 1 } = {}) {
  const m = new THREE.MeshBasicNodeMaterial();
  const P = attribute("aPart", "vec4");
  const S = attribute("aStyle", "vec4");
  const id = P.x;
  const is = (k) => step(k - 0.5, id).mul(step(id, k + 0.5));
  const seed = S.x, hue = S.y, light = S.z;
  const pu = P.y.mul(mix(float(1.0), S.w, P.w)), pv = P.z;
  const nightK = mix(float(0.28), float(1.0), U.night);
  const PINK = vec3(1.0, 0.2, 0.66), CYAN = vec3(0.22, 0.86, 1.0), VIOLET = vec3(0.64, 0.36, 1.0), AMBER = vec3(1.0, 0.64, 0.26);
  const hueCol = mix(mix(PINK, CYAN, step(0.5, hue)), mix(VIOLET, AMBER, step(2.5, hue)), step(1.5, hue));
  const WARM = vec3(1.0, 0.58, 0.26);
  const TIMBER = vec3(0.012, 0.008, 0.007); // (linear: dark lacquered wood at night)

  // shoji: a bay between posts every 3.6 m and a room every 4.2 m of height; each room lit warm or by a neon sign
  // inside, or dark; kumiko lattice over the paper, averaged away when it would alias
  const bayI = floor(pu.div(3.6));
  const floorI = floor(pv.div(4.2));
  const room = hash(bayI.mul(7.13).add(floorI.mul(31.7)).add(seed.mul(997.0)));
  const lit = step(float(1.0).sub(light), room);
  // most rooms glow warm (Hongyadong gold); a neon-hued module has a few rooms lit by its own sign colour
  const tint = hash(bayI.mul(1.7).add(floorI.mul(3.3)).add(seed.mul(171.0)));
  const neonModule = step(hue, 2.5);
  const roomCol = mix(WARM, hueCol, step(0.68, tint).mul(0.85).mul(neonModule)).mul(mix(float(0.75), float(1.25), hash(room.mul(91.0))));
  const kumiko = max(aaLine(gridD(pu, 0.9), 0.035), aaLine(gridD(pv, 0.6), 0.03));
  const frame = min(max(aaLine(gridD(pu, 3.6), 0.16), aaLine(gridD(pv, 4.2), 0.2)), 1.0);
  const paperNight = roomCol.mul(lit).mul(1.7).add(WARM.mul(0.03));
  const paperDay = vec3(0.58, 0.56, 0.5);
  const paper = mix(paperDay, paperNight, U.night).mul(float(1.0).sub(kumiko.mul(0.7)));
  const shoji = mix(paper, TIMBER, frame);
  // tiles: dark courses, a breath of the module's neon in them
  const tile = vec3(0.036, 0.038, 0.052).mul(float(1.0).sub(aaLine(gridD(pv, 0.9), 0.08).mul(0.4))).add(hueCol.mul(0.03));
  // the fascia and ridge: a neon tube (amber modules wear warm gold light, the way Hongyadong outlines its eaves)
  const pulse = sin(U.time.mul(1.3).add(seed.mul(40.0))).mul(0.08).add(0.92);
  const fascia = hueCol.mul(2.5).mul(pulse).mul(nightK);
  // the soffit: dark rafters, with the light spilling up out of the rooms strongest at the wall and gone a few metres out
  const rafters = aaLine(gridD(pu, 2.4), 0.22);
  const spill = exp(pv.mul(-0.22)).mul(1.4).add(0.004); // halves every 3 m: lit only near the wall
  const soffit = mix(WARM, hueCol, 0.3).mul(spill).mul(light.add(0.3)).mul(nightK).mul(float(1.0).sub(rafters.mul(0.55))).add(TIMBER);
  const deck = vec3(0.05, 0.03, 0.022).add(WARM.mul(0.14).mul(light).mul(nightK));
  const rail = hueCol.mul(1.7).mul(nightK);
  const timber = TIMBER.add(hueCol.mul(0.02));
  const col = timber.mul(is(PART.TIMBER)).add(shoji.mul(is(PART.SHOJI))).add(tile.mul(is(PART.TILE))).add(fascia.mul(is(PART.FASCIA)))
    .add(soffit.mul(is(PART.SOFFIT))).add(deck.mul(is(PART.DECK))).add(rail.mul(is(PART.RAIL)));
  const outCol = gain === 1 ? col : col.mul(gain);
  m.colorNode = fogFn ? fogFn(outCol) : outCol;
  m.fog = !fogFn;
  // dev: ?dbg=parts paints each part a flat colour
  if (new URLSearchParams(location.search).get("dbg") === "pv") {
    m.colorNode = vec3(fract(pv.div(20.0)), spill.div(2.0), is(4));
    m.fog = false;
  }
  if (new URLSearchParams(location.search).get("dbg") === "parts") {
    m.colorNode = vec3(0.8, 0.1, 0.1).mul(is(0)).add(vec3(0.1, 0.8, 0.1).mul(is(1))).add(vec3(0.1, 0.2, 0.9).mul(is(2))).add(vec3(0.9, 0.9, 0.1).mul(is(3)))
      .add(vec3(0.9, 0.1, 0.9).mul(is(4))).add(vec3(0.1, 0.9, 0.9).mul(is(5))).add(vec3(1.0).mul(is(6)));
    m.fog = false;
  }
  return m;
}

/**
 * Instance a list of modules: { v: "hall" | "two" | "yagura", x, y, z, q (quaternion), s (scale), seed, hue, light }.
 * One InstancedMesh per variant, all sharing one material.
 */
export function instancePavilions(items, material, { detail = 0 } = {}) {
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const v of Object.keys(VARIANTS)) {
    const list = items.filter((it) => it.v === v);
    if (!list.length) continue;
    const geo = pavilionGeometry(v, detail);
    const style = new Float32Array(list.length * 4);
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((it, i) => {
      style.set([it.seed ?? 0, it.hue ?? 0, it.light ?? 0.6, 1], i * 4);
      mesh.setMatrixAt(i, m4.compose(p.set(it.x, it.y, it.z), it.q ?? new THREE.Quaternion(), sc.setScalar(it.s ?? 1)));
    });
    geo.setAttribute("aStyle", new THREE.InstancedBufferAttribute(style, 4));
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

/** Instance corridors: { x, y, z (centre), L (length), yaw, pitch, seed, hue, light }; w scales their section. */
export function instanceCorridors(items, material, { w = 1 } = {}) {
  const geo = corridorGeometry();
  const style = new Float32Array(Math.max(1, items.length) * 4);
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  items.forEach((it, i) => {
    style.set([it.seed ?? 0, it.hue ?? 0, it.light ?? 0.6, it.L], i * 4);
    mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(it.x, it.y, it.z), q.setFromEuler(e.set(0, it.yaw ?? 0, it.pitch ?? 0, "YZX")), new THREE.Vector3(it.L, w, w)));
  });
  mesh.count = items.length;
  geo.setAttribute("aStyle", new THREE.InstancedBufferAttribute(style, 4));
  mesh.frustumCulled = false;
  return mesh;
}
