// The wind over Kraken Port: dust and sparks carried on a breeze that gusts, and faint streaks of the moving air.
// Everything lives in a box that wraps round the camera, so wherever you fly the air is full and nothing runs out.
// Near the street the box sits on the ground (nothing is wasted underground); up in the sky lanes it is centred on you.
// By day the motes are dust lit by the low sun, bright when you look toward it the way backlit haze is; by night they
// are sparks of neon and warm light. All of it moves on the GPU as a function of time: nothing is stored or stepped.
import * as THREE from "three";
import { vec3, float, mix, smoothstep, sin, cos, floor, length, max, pow, normalize, cross, dot, uv, positionGeometry, cameraPosition, instanceIndex, varying } from "three/tsl";
import { hashF } from "./fx.js";

export function createWind(U, { count = 3600, streaks = 320 } = {}) {
  const group = new THREE.Group();
  const BOX = vec3(170.0, 90.0, 170.0);
  const t = U.time;
  // the box: on the street while you are low, centred on you once you are higher than half its height
  const hub = vec3(cameraPosition.x, max(cameraPosition.y, 45.0), cameraPosition.z);
  // the breeze: steady from the south-west, gusting
  const gust = sin(t.mul(0.21)).mul(0.5).add(sin(t.mul(0.53).add(1.7)).mul(0.3)).add(1.0);
  const windDir = vec3(Math.cos(0.62), 0.0, -Math.sin(0.62));
  const drift = (h) => windDir.mul(t.mul(mix(float(3.5), float(8.0), h)).mul(gust.mul(0.25).add(0.85)));
  /** wrap a world point into the box round the hub */
  const wrap = (p) => {
    const rel = p.sub(hub);
    return hub.add(rel.sub(BOX.mul(floor(rel.div(BOX).add(0.5)))));
  };
  // four independent numbers per instance (seeded apart, so neighbours never share them)
  const seeds = (salt) => [0, 1, 2, 3].map((k) => hashF(instanceIndex.mul(8).add(salt + k)));

  // ---- motes: dust by day, sparks by night ---------------------------------------------------------------------------
  {
    const [h1, h2, h3, h4] = seeds(0);
    const swirl = vec3(sin(t.mul(0.6).add(h2.mul(30.0))).mul(2.2), sin(t.mul(0.45).add(h3.mul(20.0))).mul(1.4), cos(t.mul(0.5).add(h1.mul(25.0))).mul(2.2));
    const centre = wrap(vec3(h1, h2, h3).mul(BOX).add(drift(h4)).add(swirl));
    const toCam = normalize(cameraPosition.sub(centre));
    const right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    const up = cross(toCam, right);
    const dist = length(cameraPosition.sub(centre));
    const size = mix(float(0.09), float(0.3), pow(h4, 3.0)).mul(max(float(1.0), dist.div(22.0)));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.positionNode = centre.add(right.mul(positionGeometry.x.mul(size))).add(up.mul(positionGeometry.y.mul(size)));
    // everything that only depends on the mote is worked out once per vertex and handed on
    const life = varying(smoothstep(1.5, 6.0, dist).mul(smoothstep(84.0, 46.0, dist)).mul(smoothstep(0.0, 2.0, centre.y)));
    const twinkle = sin(t.mul(mix(float(1.5), float(4.0), h1)).add(h2.mul(40.0))).mul(0.3).add(0.7);
    // night: neon pink and cyan sparks with warm embers; day: dust, bright when backlit by the sun
    const NIGHT = mix(mix(vec3(1.0, 0.38, 0.82), vec3(0.4, 0.85, 1.0), smoothstep(0.55, 0.7, h3)), vec3(1.0, 0.66, 0.36), smoothstep(0.82, 0.9, h3));
    const back = pow(max(dot(toCam.negate(), U.sunDir), 0.0), 4.0);
    const DAY = vec3(1.0, 0.92, 0.78).mul(back.mul(1.3).add(0.22));
    const tint = varying(mix(DAY.mul(0.95), NIGHT.mul(1.7), U.night).mul(twinkle).mul(life));
    const r = length(uv().sub(0.5)).mul(2.0);
    const dot0 = pow(max(float(1.0).sub(r), 0.0), 2.0);
    m.colorNode = tint.mul(dot0).mul(float(1.0).sub(U.fogFactor().mul(0.6)));
    m.fog = false;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, count);
    mesh.frustumCulled = false;
    mesh.renderOrder = 7;
    group.add(mesh);
  }

  // ---- streaks: the air itself moving, faint long lines along the wind ------------------------------------------------
  {
    const [h1, h2, h3, h4] = seeds(4);
    const centre = wrap(vec3(h1, h2, h3).mul(BOX).add(drift(h4).mul(2.2)));
    const toCam = normalize(cameraPosition.sub(centre));
    const side = normalize(cross(windDir, toCam));
    const len = mix(float(4.0), float(14.0), h2);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.positionNode = centre.add(windDir.mul(positionGeometry.x.mul(len))).add(side.mul(positionGeometry.y.mul(0.08)));
    const dist = length(cameraPosition.sub(centre));
    const life = varying(smoothstep(3.0, 10.0, dist).mul(smoothstep(84.0, 40.0, dist)).mul(sin(t.mul(0.7).add(h3.mul(30.0))).mul(0.5).add(0.5)).mul(gust).mul(smoothstep(0.0, 2.0, centre.y)));
    const q = uv();
    const shape = smoothstep(0.0, 0.5, q.x).mul(smoothstep(1.0, 0.5, q.x)).mul(smoothstep(0.0, 0.5, q.y)).mul(smoothstep(1.0, 0.5, q.y));
    const col = mix(vec3(0.95, 0.9, 0.82).mul(0.2), vec3(0.75, 0.6, 1.0).mul(0.24), U.night).mul(shape).mul(life);
    m.colorNode = col.mul(float(1.0).sub(U.fogFactor().mul(0.6)));
    m.fog = false;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, streaks);
    mesh.frustumCulled = false;
    mesh.renderOrder = 7;
    group.add(mesh);
  }

  return {
    group,
    /** Everything is a function of U.time; nothing to step. */
    update() {},
  };
}
