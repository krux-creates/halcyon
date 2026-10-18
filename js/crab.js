// かに港 KANI-MINATO: the crab restaurant at the harbour mouth, after Dotonbori's mechanical crab. The crab was built
// in Blender (tools/crab.py) with every joint its own node; here it is painted (glossy red over a cream belly),
// mounted on the restaurant's white slatted front facing the boats coming in, floodlit, and set moving: the legs
// row slowly, the claws lift and pinch.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { vec3, float, mix, smoothstep, normalGeometry, positionGeometry, mx_noise_float, pow, abs, dot, normalView, positionViewDirection } from "three/tsl";

/**
 * @param U port uniforms
 * @param spec { x, y, z, ry, scale } where the crab's back sits, which way the wall faces, how big
 */
export function createCrab(U, spec) {
  const group = new THREE.Group();
  group.position.set(spec.x, spec.y, spec.z);
  group.rotation.y = spec.ry ?? 0;
  const mount = new THREE.Group();
  // the model lies back-up with its head toward -z: stand it on the wall, back out, head up
  mount.rotation.x = Math.PI / 2;
  mount.scale.setScalar(spec.scale ?? 1);
  group.add(mount);

  // ---- paint ------------------------------------------------------------------------------------------------------
  const shell = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.2, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.06 });
  {
    const n = normalGeometry;
    const belly = smoothstep(-0.15, -0.6, n.y);
    const mottle = mx_noise_float(positionGeometry.mul(2.2)).mul(0.5).add(0.5);
    const red = mix(vec3(0.86, 0.03, 0.03), vec3(1.0, 0.09, 0.05), mottle); // lacquered Kani Doraku red
    shell.colorNode = mix(red, vec3(0.93, 0.84, 0.7), belly);
    const rim = pow(float(1.0).sub(abs(dot(normalView, positionViewDirection))), 3.0);
    shell.emissiveNode = vec3(1.0, 0.25, 0.15).mul(rim).mul(0.25).add(vec3(0.9, 0.05, 0.02).mul(0.06).mul(float(1.0).sub(belly))).mul(mix(float(0.2), float(1.0), U.night));
  }
  const eyeMat = new THREE.MeshPhysicalNodeMaterial({ color: 0x050505, roughness: 0.1, clearcoat: 1 });
  // the joints between the segments: pale cream bands, the way the Dotonbori crab is painted
  const jointMat = new THREE.MeshPhysicalNodeMaterial({ color: 0xf1e3cc, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });

  const joints = [];
  const loader = new GLTFLoader();
  loader.load("assets/crab.glb", (gltf) => {
    const root = gltf.scene;
    root.traverse((o) => {
      if (o.isMesh) {
        const nm = o.name.replace(/_\d+$/, "");
        o.material = nm.startsWith("eye") && !nm.startsWith("eyestalk") ? eyeMat : /_(hip|k1|k2)$/.test(nm) ? jointMat : shell;
        o.frustumCulled = false;
      }
      // the joints we move: leg roots, knees, claw arms and the moving finger
      const m = /^(leg_[LR]\d)$|^(leg_[LR]\d_s2)$|^(claw_[LR])$|^(claw_[LR]_s2)$|^(claw_[LR]_finger)$/.exec(o.name);
      if (m) joints.push({ node: o, base: o.quaternion.clone(), name: o.name, phase: hashName(o.name) });
    });
    mount.add(root);
  });

  // ---- the floodlights under it: black arms with lamps, aimed up at the crab -----------------------------------------
  const armMat = new THREE.MeshStandardNodeMaterial({ color: 0x0b0b0c, roughness: 0.5, metalness: 0.7 });
  const lampMat = new THREE.MeshBasicNodeMaterial();
  lampMat.colorNode = vec3(1.0, 0.7, 0.45).mul(mix(float(0.5), float(1.1), U.night));
  for (const dx of [-9, -3, 3, 9]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 6), armMat);
    arm.position.set(dx, -8.5, 2.2);
    arm.rotation.x = -0.9;
    group.add(arm);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), lampMat);
    lamp.position.set(dx, -7.1, 3.7);
    group.add(lamp);
  }
  const flood = new THREE.SpotLight(0xffd8b0, 520, 60, 0.7, 0.7, 2);
  flood.position.set(0, -10, 9);
  flood.target.position.set(0, 1, 0);
  group.add(flood, flood.target);
  const fill = new THREE.PointLight(0xff5a3c, 500, 40, 2);
  fill.position.set(0, 4, 8);
  group.add(fill);

  const q = new THREE.Quaternion(), axisY = new THREE.Vector3(0, 1, 0), axisZ = new THREE.Vector3(0, 0, 1);
  return {
    group,
    update(time) {
      for (const j of joints) {
        let a = 0, axis = axisY;
        if (/^leg_[LR]\d$/.test(j.name)) a = Math.sin(time * 0.9 + j.phase) * 0.1; // the legs row
        else if (j.name.endsWith("_s2") && j.name.startsWith("leg")) (a = Math.sin(time * 0.9 + j.phase + 1.2) * 0.12), (axis = axisZ);
        else if (/^claw_[LR]$/.test(j.name)) a = Math.sin(time * 0.55 + j.phase) * 0.12; // the arms lift
        else if (j.name.endsWith("_s2")) (a = Math.sin(time * 0.55 + j.phase + 0.8) * 0.1), (axis = axisZ);
        else if (j.name.endsWith("_finger")) a = (Math.sin(time * 1.6 + j.phase) * 0.5 + 0.5) * 0.35 * (j.name.includes("_L") ? 1 : -1); // pinch
        j.node.quaternion.copy(j.base).multiply(q.setFromAxisAngle(axis, a));
      }
      const night = U.night.value;
      flood.intensity = 160 + 360 * night;
      fill.intensity = 60 + 140 * night;
    },
  };
}

function hashName(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return (h / 1000) * Math.PI * 2;
}
