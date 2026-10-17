// KRAKEN VISION: Kraken Port's answer to Shinjuku's corner screen. An L-shaped LED screen wraps the corner of a
// tower over the first canal, curved round the corner; inside its frame a deep sea glows, and a giant kraken climbs
// out of it for real: a mantle leaning out of a white box frame, eyes that blink and follow you, eight tentacles
// that curl over the lip and down the building. Lit by its own screen.
import * as THREE from "three";
import {
  uniform, vec2, vec3, float, sin, cos, mix, smoothstep, step, abs, fract, length, uv, texture, pow, max, positionGeometry,
  normalView, positionViewDirection, dot, mx_noise_float, floor, hash as rawHash, clamp,
} from "three/tsl";
import { hashF } from "./fx.js";
/** TSL's hash truncates to a u32, so negative inputs all hash to the same value: shift them positive first. */
const hash = (x) => hashF(float(x).add(1048576.0));


/**
 * @param U port uniforms
 * @param spec { cx, cz, y0, h, la, lb, r } tower corner (east face at x = cx facing +x, south face at z = cz facing +z),
 *             bottom height, screen height, the two face lengths and the corner radius
 */
export function createKrakenVision(U, spec) {
  const { cx, cz, y0, h, la, lb, r } = spec;
  const group = new THREE.Group();
  const T = uniform(0);

  // ---- the screen: one strip round the corner --------------------------------------------------------------------
  const arc = (Math.PI * r) / 2;
  const L = la + arc + lb;
  const steps = 96;
  const pos = [], uvs = [], idx = [];
  const at = (s) => {
    // s in metres along the strip, from the west end of the south face round to the north end of the east face
    if (s < la) return [cx - r - la + s, cz + 0.6, 0, 1];
    if (s < la + arc) {
      const a = Math.PI / 2 - ((s - la) / arc) * (Math.PI / 2);
      return [cx - r + Math.cos(a) * (r + 0.6), cz - r + Math.sin(a) * (r + 0.6), Math.cos(a), Math.sin(a)];
    }
    return [cx + 0.6, cz - r - (s - la - arc), 1, 0];
  };
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * L;
    const [x, z] = at(s);
    pos.push(x, y0, z, x, y0 + h, z);
    uvs.push(s / L, 0, s / L, 1);
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();

  // the screen shows a deep sea: a glow from below, caustic light rippling across, bubbles rising, a brand line
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 512;
  const cg = canvas.getContext("2d");
  const paint = (t) => {
    const W = 1536, H = 512;
    const grd = cg.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#020611");
    grd.addColorStop(0.6, "#06233a");
    grd.addColorStop(1, "#0b5a78");
    cg.fillStyle = grd;
    cg.fillRect(0, 0, W, H);
    // light shafts
    cg.globalCompositeOperation = "lighter";
    for (let i = 0; i < 9; i++) {
      const x = ((i * 197 + t * 18) % (W + 300)) - 150;
      const sh = cg.createLinearGradient(x, 0, x + 120, H);
      sh.addColorStop(0, "rgba(120,220,255,0.0)");
      sh.addColorStop(0.5, "rgba(120,220,255,0.10)");
      sh.addColorStop(1, "rgba(120,220,255,0.0)");
      cg.fillStyle = sh;
      cg.beginPath();
      cg.moveTo(x, 0);
      cg.lineTo(x + 60, 0);
      cg.lineTo(x + 220, H);
      cg.lineTo(x + 140, H);
      cg.fill();
    }
    // bubbles
    for (let i = 0; i < 70; i++) {
      const x = (i * 131.7) % W;
      const y = H - ((t * (30 + (i % 7) * 9) + i * 53) % (H + 40));
      cg.strokeStyle = "rgba(190,240,255,0.45)";
      cg.lineWidth = 1.5;
      cg.beginPath();
      cg.arc(x + Math.sin(t + i) * 6, y, 2 + (i % 4), 0, Math.PI * 2);
      cg.stroke();
    }
    cg.globalCompositeOperation = "source-over";
    // the room-box illusion: the inner corner of a lit box sits on the fold of the screen
    const fold = (la + arc / 2) / L;
    const fx = fold * W;
    cg.strokeStyle = "rgba(255,255,255,0.18)";
    cg.lineWidth = 3;
    cg.beginPath();
    cg.moveTo(fx, 40);
    cg.lineTo(fx, H - 40);
    cg.moveTo(fx, H - 40);
    cg.lineTo(fx - 520, H - 8);
    cg.moveTo(fx, H - 40);
    cg.lineTo(fx + 520, H - 8);
    cg.stroke();
    // the brand, small, top left and right
    cg.fillStyle = "rgba(255,255,255,0.85)";
    cg.font = '600 34px Saira, sans-serif';
    cg.fontStretch = "expanded";
    cg.letterSpacing = "10px";
    cg.fillText("KRAKEN VISION", 60, 70);
    cg.textAlign = "right";
    cg.font = '22px "Share Tech Mono", monospace';
    cg.letterSpacing = "6px";
    cg.fillStyle = "rgba(255,90,170,0.9)";
    cg.fillText("クラーケン · 毎晩 · EVERY NIGHT", W - 60, 70);
    cg.textAlign = "left";
    cg.letterSpacing = "0px";
    cg.fontStretch = "normal";
  };
  paint(0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const sm = new THREE.MeshBasicNodeMaterial();
  const px = uv().mul(vec2(1536.0, 512.0));
  const led = step(0.2, fract(px.x.mul(0.5))).mul(step(0.2, fract(px.y.mul(0.5)))).mul(0.25).add(0.75);
  sm.colorNode = texture(tex, uv()).rgb.mul(led).mul(U.screens).mul(1.5);
  sm.fog = false;
  const screen = new THREE.Mesh(g, sm);
  group.add(screen);
  // the screen's housing: a dark band above and below
  const housing = new THREE.MeshStandardNodeMaterial({ color: 0x101012, roughness: 0.5, metalness: 0.6 });
  for (const y of [y0 - 1.2, y0 + h + 1.2]) {
    for (const [ax, az, bx, bz] of [[cx - r - la, cz + 0.9, cx - r, cz + 0.9], [cx + 0.9, cz - r - lb, cx + 0.9, cz - r]]) {
      const len = Math.hypot(bx - ax, bz - az);
      const m = new THREE.Mesh(new THREE.BoxGeometry(az === bz ? len : 1.6, 2.4, az === bz ? 1.6 : len), housing);
      m.position.set((ax + bx) / 2, y, (az + bz) / 2);
      group.add(m);
    }
  }

  // ---- the box frame the kraken climbs out of: a white lip round the corner, in front of the screen ------------------
  const frameMat = new THREE.MeshStandardNodeMaterial({ color: 0xe9e6df, roughness: 0.4, metalness: 0.05 });
  frameMat.emissiveNode = vec3(0.35, 0.75, 0.9).mul(0.12).mul(U.night);
  const lip = 5.0, ft = 1.4;
  const bx0 = cx - r - la * 0.55, bz0 = cz - r - lb * 0.55;
  const fy0 = y0 + h * 0.18, fy1 = y0 + h * 0.86;
  const frames = [
    // floor and ceiling of the box, as L-shaped slabs jutting out of the screen
    [(bx0 + cx) / 2, fy0, cz + lip / 2, cx - bx0, ft, lip],
    [cx + lip / 2, fy0, (bz0 + cz) / 2, lip, ft, cz - bz0],
    [(bx0 + cx) / 2, fy1, cz + lip / 2, cx - bx0, ft, lip],
    [cx + lip / 2, fy1, (bz0 + cz) / 2, lip, ft, cz - bz0],
    // the two outer posts
    [bx0, (fy0 + fy1) / 2, cz + lip / 2, ft, fy1 - fy0, lip],
    [cx + lip / 2, (fy0 + fy1) / 2, bz0, lip, fy1 - fy0, ft],
  ];
  for (const [x, y, z, sx, sy, sz] of frames) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), frameMat);
    m.position.set(x, y, z);
    group.add(m);
  }

  // ---- the kraken -----------------------------------------------------------------------------------------------------
  const skin = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.32, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.2 });
  {
    const p = positionGeometry;
    const spots = smoothstep(0.55, 0.75, mx_noise_float(p.mul(1.1)).mul(0.5).add(0.5));
    const base = mix(vec3(0.55, 0.08, 0.04), vec3(0.85, 0.28, 0.1), smoothstep(-1.0, 1.0, p.y.div(6.0)));
    skin.colorNode = mix(base, vec3(0.25, 0.02, 0.02), spots.mul(0.7));
    const rim = pow(float(1.0).sub(abs(dot(normalView, positionViewDirection))), 2.5);
    skin.emissiveNode = vec3(0.2, 0.75, 1.0).mul(rim).mul(0.45).add(vec3(1.0, 0.25, 0.1).mul(0.04)).mul(mix(float(0.4), float(1.0), U.night));
  }
  const kx = cx - 2.0, kz = cz - 2.0, ky = fy0 + (fy1 - fy0) * 0.55;
  const mantle = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), skin);
  mantle.scale.set(6.5, 8.5, 6.5);
  mantle.position.set(kx, ky + 2, kz);
  mantle.rotation.set(-0.35, Math.PI / 4, 0.35);
  group.add(mantle);
  // eyes: big, gold, a slit pupil, looking out of the corner
  const eyeMat = new THREE.MeshBasicNodeMaterial();
  {
    const q = uv().sub(vec2(0.5, 0.5));
    const slit = smoothstep(0.035, 0.02, abs(q.x.mul(4.0))).mul(smoothstep(0.32, 0.26, abs(q.y)));
    const iris = mix(vec3(1.0, 0.8, 0.2), vec3(1.0, 0.45, 0.05), smoothstep(0.0, 0.5, length(q)));
    eyeMat.colorNode = mix(iris.mul(1.6), vec3(0.0), slit);
  }
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16, Math.PI * 0.25, Math.PI * 1.0, 0, Math.PI), eyeMat);
    const a = Math.PI / 4 + side * 0.62;
    eye.position.set(kx + Math.cos(a) * 5.4, ky - 1.5, kz + Math.sin(a) * 5.4);
    eye.lookAt(eye.position.clone().add(new THREE.Vector3(Math.cos(a), 0.1, Math.sin(a))));
    eye.rotateY(-Math.PI / 2);
    group.add(eye);
    eyes.push(eye);
  }
  // tentacles: tubes along curves that leave the box over its lip and hang down the corner, curling as they move
  const tentacles = [];
  const rr = (n) => (Math.sin(n * 91.7) * 0.5 + 0.5);
  for (let k = 0; k < 8; k++) {
    const a = -0.4 + (k / 7) * 2.4 + Math.PI / 4 - 0.8; // fan out from the corner, toward the canal and the channel
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const reach = 14 + rr(k) * 10;
    const drop = 10 + rr(k + 3) * 22;
    const pts = [
      new THREE.Vector3(kx, ky - 4, kz),
      new THREE.Vector3(kx, ky - 6, kz).addScaledVector(dir, 5),
      new THREE.Vector3(kx, fy0 + 1.5, kz).addScaledVector(dir, 10),
      new THREE.Vector3(kx, fy0 - drop * 0.4, kz).addScaledVector(dir, reach * 0.85),
      new THREE.Vector3(kx, fy0 - drop * 0.75, kz).addScaledVector(dir, reach),
      new THREE.Vector3(kx, fy0 - drop, kz).addScaledVector(dir, reach * 0.8 + 3),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 96, 1, 14, false);
    // taper: scale each ring round its centre by the distance along the tube
    const p = tube.attributes.position, uvA = tube.attributes.uv;
    const centre = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const s = uvA.getX(i);
      curve.getPointAt(Math.min(1, s), centre);
      const rad = 1.7 * Math.pow(1 - s, 1.25) + 0.12;
      p.setXYZ(i, centre.x + (p.getX(i) - centre.x) * rad, centre.y + (p.getY(i) - centre.y) * rad, centre.z + (p.getZ(i) - centre.z) * rad);
    }
    tube.computeVertexNormals();
    const m = skin.clone();
    // suckers on the underside: pale rings along the length
    const su = uv();
    const ring = smoothstep(0.32, 0.22, abs(fract(su.x.mul(70.0)).sub(0.5))).mul(smoothstep(0.62, 0.72, fract(su.y)).mul(smoothstep(0.98, 0.88, fract(su.y))));
    m.colorNode = mix(skin.colorNode, vec3(0.95, 0.75, 0.62), ring);
    // the curl: each tentacle sways from its root, more toward the tip
    const phase = float(k * 1.37);
    const tip = pow(su.x, 1.6);
    const sway = vec3(sin(T.mul(0.9).add(su.x.mul(5.0)).add(phase)).mul(2.6), cos(T.mul(0.7).add(su.x.mul(4.0)).add(phase)).mul(1.6), cos(T.mul(1.1).add(su.x.mul(6.0)).add(phase)).mul(2.6)).mul(tip);
    m.positionNode = positionGeometry.add(sway);
    const mesh = new THREE.Mesh(tube, m);
    group.add(mesh);
    tentacles.push(mesh);
  }
  // the screen lights its kraken
  const glow = new THREE.PointLight(0x5ad8ff, 1400, 70, 2);
  glow.position.set(cx - 10, y0 + h * 0.5, cz - 10);
  group.add(glow);
  const warm = new THREE.PointLight(0xff4fa8, 600, 60, 2);
  warm.position.set(cx + 18, y0 + h * 0.2, cz + 18);
  group.add(warm);

  group.traverse((o) => (o.frustumCulled = false));
  let tick = 0;
  return {
    group,
    update(time, camera) {
      T.value = time;
      if (++tick % 2 === 0) {
        paint(time);
        tex.needsUpdate = true;
      }
      // the mantle breathes, the eyes blink
      const b = 1 + Math.sin(time * 0.8) * 0.03;
      mantle.scale.set(6.5 * b, 8.5 * (2 - b), 6.5 * b);
      const blink = Math.sin(time * 0.55) > 0.985 ? 0.15 : 1;
      for (const e of eyes) e.scale.y = blink;
      const night = U.night.value;
      glow.intensity = 300 + 1100 * night;
      warm.intensity = 120 + 480 * night;
      void camera;
    },
  };
}

void hash;
void floor;
void clamp;
void max;
void cos;
