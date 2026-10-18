// Kraken Port's streets. The canals are avenues now and the old sea a plaza of wet asphalt running to the horizon: the
// shuttle flies above them the way Rive City's cars fly their skylanes. Lane lines run down every avenue and cross
// street, puddles hold sharp reflections of the neon while the asphalt between them gives back a soft sheen, and the
// whole floor is one mesh with one mirror (the reflection of the city about the street).
// It keeps the water's old interface (reflection, heightAt, touch, splash, update) so nothing else had to learn a new one.
import * as THREE from "three";
import {
  vec2, vec3, float, positionWorld, cameraPosition, normalize, dot, max, min, mix, smoothstep, pow, length, abs, clamp,
  reflector, mx_noise_float, fract, floor, fwidth, round,
} from "three/tsl";
import { WORLD } from "./world.js";

const ss = (a, b, x) => (a > b ? float(1).sub(smoothstep(b, a, x)) : smoothstep(a, b, x));
/** A line of half-width hw at distance d from its centre, kept a pixel wide and dimmed instead when it would alias. */
const aaLine = (d, hw) => {
  const fw = clamp(fwidth(d), 1e-5, 1e4);
  const w = max(float(hw), fw.mul(0.8));
  return float(1).sub(smoothstep(w.sub(fw.mul(0.5)), w.add(fw.mul(0.5)), d)).mul(float(hw).div(w));
};

export function createWater({ scene, U, quality, cross = [], homeX = 780 }) {
  // ---- the mirror ----------------------------------------------------------------------------------------------------
  const reflection = reflector({ resolution: quality.reflect, bounces: false, generateMipmaps: true });
  reflection.target.rotateX(-Math.PI / 2);
  scene.add(reflection.target);

  const wp = positionWorld.xz;
  const toCam = cameraPosition.sub(positionWorld);
  const dist = length(toCam);
  const v = normalize(toCam);

  // ---- asphalt: grit at two scales, darker patches where it has been relaid ---------------------------------------
  const grit = mx_noise_float(vec3(wp.mul(0.4), 1.0)).mul(0.5).add(0.5);
  const patches = mx_noise_float(vec3(wp.mul(0.018), 7.0)).mul(0.5).add(0.5);
  // ---- puddles: sharp mirrors lying in the hollows ---------------------------------------------------------------
  const pn = mx_noise_float(vec3(wp.mul(0.04), 3.0)).mul(0.65).add(mx_noise_float(vec3(wp.mul(0.15), 9.0)).mul(0.35));
  const puddle = smoothstep(0.16, 0.3, pn);

  // ---- lanes: the avenues run north-south every 1100 m (the Grand Avenue at x = 0), the cross streets east-west -------
  const ax = wp.x.sub(round(wp.x.div(WORLD.CH)).mul(WORLD.CH)); // metres from the nearest avenue's centre
  const onAvenue = step0(abs(ax), WORLD.CHW);
  const dashZ = step0(fract(wp.y.div(15.0)), 0.42);
  const laneW = (WORLD.CHW * 2) / 6;
  const laneLines = max(aaLine(abs(abs(ax).sub(laneW)), 0.14), aaLine(abs(abs(ax).sub(laneW * 2)), 0.14)).mul(dashZ);
  const centre = max(aaLine(abs(ax.sub(0.45)), 0.12), aaLine(abs(ax.add(0.45)), 0.12));
  const edge = aaLine(abs(abs(ax).sub(WORLD.CHW - 1.2)), 0.16);
  const avenue = laneLines.mul(vec3(0.85, 0.82, 0.76)).add(centre.mul(vec3(1.0, 0.72, 0.18))).add(edge.mul(vec3(0.8, 0.78, 0.72))).mul(onAvenue);
  // cross streets: the home district's own, then the lattice beyond it
  let dzHome = float(1e6);
  for (const c of cross) dzHome = min(dzHome, abs(wp.y.sub(c.z)));
  const dzLat = abs(wp.y.sub(WORLD.Z0).sub(round(wp.y.sub(WORLD.Z0).div(WORLD.CR)).mul(WORLD.CR)));
  const inHome = step0(abs(wp.x), homeX).mul(step0(wp.y, 700.0));
  const dz = mix(dzLat, dzHome, inHome);
  const onCross = step0(dz, WORLD.CRW).mul(float(1.0).sub(onAvenue));
  const dashX = step0(fract(wp.x.div(12.0)), 0.45);
  const crossLines = aaLine(dz, 0.14).mul(dashX).mul(vec3(0.85, 0.82, 0.76)).add(aaLine(abs(dz.sub(WORLD.CRW - 1.2)), 0.16).mul(vec3(0.8, 0.78, 0.72))).mul(onCross);
  // paint wears: lines are a little patchy, and fade with distance before they can shimmer
  const wear = smoothstep(0.25, 0.6, mx_noise_float(vec3(wp.mul(0.3), 5.0)).mul(0.5).add(0.5)).mul(0.5).add(0.5);
  const paint = avenue.add(crossLines).mul(wear).mul(ss(900.0, 200.0, dist));

  // ---- shading: the mirror blurred on asphalt and sharp in the puddles, Fresnel, a breath of the city's haze ----------
  const ndv = clamp(dot(vec3(0.0, 1.0, 0.0), v), 0.0, 1.0);
  const fres = float(0.04).add(float(0.96).mul(pow(float(1.0).sub(ndv), 5.0)));
  reflection.levelNode = mix(float(3.4), float(0.5), puddle).add(smoothstep(60.0, 700.0, dist).mul(1.4));
  const refl = reflection.rgb.mul(U.reflect);
  const base = vec3(0.022, 0.021, 0.026).mul(grit.mul(0.4).add(0.78)).mul(patches.mul(0.32).add(0.84)).add(U.water.mul(0.6));
  const mirror = clamp(fres.mul(mix(float(0.5), float(1.0), puddle)).add(mix(float(0.1), float(0.3), puddle)), 0.0, 1.0);
  const lit = mix(float(0.55), float(1.0), U.night);
  let col = mix(base, refl, mirror);
  col = col.add(paint.mul(mix(float(0.55), float(0.32), U.night)).mul(float(1.0).sub(puddle.mul(0.6))).mul(lit));
  col = col.add(U.glowLow.mul(0.03));

  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = col;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000, 1, 1), m);
  ground.rotation.x = -Math.PI / 2;
  ground.frustumCulled = false;
  ground.renderOrder = -5;
  scene.add(ground);

  return {
    reflection,
    sea: ground,
    patch: ground,
    spray: null,
    /** The street is flat. */
    heightAt() {
      return 0;
    },
    addSource() {},
    touch() {},
    splash() {},
    update(t, dt, ship, boats, focus, camera) {
      // the floor follows whoever is looking at it (its look is all in world space, so nothing swims)
      const c = camera ?? null;
      if (c) ground.position.set(Math.round(c.position.x / 100) * 100, 0, Math.round(c.position.z / 100) * 100);
    },
  };
}

/** 1 where a <= b (a step that reads left to right). */
function step0(a, b) {
  return float(1.0).sub(smoothstep(float(b).sub(0.01), float(b), a));
}

void vec2;
void floor;
