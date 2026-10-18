// Piloting HL-07 through Kraken Port the way Rive City's cars fly: hovering over the avenues, E / Space to climb and Q
// to sink, F up to the sky lane and back down to the street. W/S throttle, A/D steer, Shift boost, P autopilot (a loop
// round the port: up the Grand Avenue, round the pagoda's plaza, to the ward gate and back), C camera (chase,
// cockpit, showroom), drag to look. Blocks are solid up to their tallest tower: the hull and wing tips are tested
// against them and the shuttle slides along their edges; above a block's roofs it flies over.
import * as THREE from "three";
import { plotLand, PLOT } from "./districts.js";
import { PORT } from "./port.js";
import { TITLE_CAM } from "./hero.js";

const TAXI = 24; // m/s, cruising down the avenues
const SKIM = 58; // m/s, up in the sky lane
// it flies the way Rive City's cars do: hovering above the street, climbing and sinking at will, and a sky lane above
const HOVER = 12, HOVER_MIN = 5, SKY_LANE = 130;
const FLOAT_Y = 1.1; // parked on the street
const HALF_SPAN = 9.6;
const NOSE = 13.6;

// the autopilot's loop, as [x, z] waypoints
/**
 * Round the pagoda's island: up the lane to the edge of the basin, along a ring 52 m outside the terraces, back into the
 * lane past it. Every point is tight (passed within r metres) so the shuttle follows the ring instead of cutting across
 * it. north: travelling toward -z (on the +x side); south: toward +z (on the -x side).
 */
// the autopilot keeps to a lane 10 m either side of the channel's centre: clear of the expressway's pillars, which stand in
// the water on the right between x 24 and 29
const LANE = 10;
function aroundIsland(north) {
  const T = PORT.temple, rho = T.island + 52, sx = north ? 1 : -1, lane = north ? LANE : -LANE;
  const tight = (x, z) => Object.assign(new THREE.Vector2(x, z), { r: 24 });
  const pts = [tight(lane, north ? T.z + T.r + 14 : T.z - T.r - 14)];
  for (const a of north ? [5, 30, 60, 90, 120, 150, 175] : [175, 150, 120, 90, 60, 30, 5]) {
    pts.push(tight(sx * rho * Math.sin((a * Math.PI) / 180), T.z + rho * Math.cos((a * Math.PI) / 180)));
  }
  pts.push(tight(lane, north ? T.z - T.r - 30 : T.z + T.r + 30));
  return pts;
}
// the autopilot's tour: up the channel on the right, round the island, to the end and back down on the left
// (it turns round on a small circle in the open water past the channel's end, where the old port meets the wards:
// out of the lane only once clear of the banks, back into the other lane before it re-enters the channel)
const turnAround = () =>
  [[LANE, -1512], [30, -1540], [16, -1572], [-16, -1572], [-30, -1540], [-LANE, -1512], [-LANE, -1470]].map(([x, z]) => Object.assign(new THREE.Vector2(x, z), { r: 18 }));
// and at the harbour mouth, on a circle between the ends of the banks (z 610) and the stone landing (z 706)
const turnAtMouth = () =>
  [[-LANE, 590], [-26, 632], [0, 672], [26, 632], [LANE, 590]].map(([x, z]) => Object.assign(new THREE.Vector2(x, z), { r: 18 }));
const LOOP = () => [
  new THREE.Vector2(LANE, 520), ...aroundIsland(true), new THREE.Vector2(LANE, -1420), ...turnAround(),
  ...aroundIsland(false), new THREE.Vector2(-LANE, 520), ...turnAtMouth(),
];

export function createFlight({ camera, shuttle, plan, params, water }) {
  const state = {
    pos: new THREE.Vector3(0, FLOAT_Y, 520),
    yaw: 0, // 0 faces -z (north, up the channel)
    speed: 0,
    vy: 0,
    alt: FLOAT_Y,
    heave: 0,
    slip: 0,
    throttle: 0,
    skim: false,
    autopilot: params?.has("auto") ?? false,
    boost: false,
    view: params?.get("view") ?? (params?.has("cam") ? "free" : "title"),
    held: false, // the story holds the controls (arrival, title)
    look: { yaw: 0, pitch: 0, dragging: false, lx: 0, ly: 0 },
    bank: 0,
    pitch: 0,
    showAngle: 0.7,
    gatePulse: 0,
    progress: 0,
    blocked: 0,
    gaze: 0, // metres the chase camera's aim is lifted: looking up at something tall on arrival
    flyAlt: HOVER, // the height it flies at (E / Space climbs, Q sinks, F jumps to the sky lane and back)
  };
  let faceTarget = null, faceUntil = 0;
  let gazeTarget = 0, gazeUntil = 0, nowT = 0;
  const keys = new Set();
  const virtual = { throttle: 0, steer: 0, climb: 0 };

  // ---- solid blocks: the city's blocks up to their roofs (and the expressway's pillars), the pagoda, the wards' blocks,
  // the city's southern edge. The hull never stops dead on them: whatever a point of it pushes into pushes it back out along the
  // shortest way, and the part of its motion going into the obstacle is taken away, so it scrapes along and slides off
  // (the way Rive City's car glances off a wall). It can always turn and drive away.
  const CEILING = 480; // above this nothing in the city reaches but the pagoda's spire
  const solids = plan.platforms.map((p) => ({ x0: Math.min(p.x0, p.x1), x1: Math.max(p.x0, p.x1), z0: Math.min(p.z0, p.z1), z1: Math.max(p.z0, p.z1), top: p.top ?? 0 }));
  // how tall each block stands (its tallest tower, drum or dome), so up in the sky lane the shuttle passes over the low
  // ones; a block with nothing known on it is taken to be tall
  {
    const raise = (x, z, top) => {
      for (const s of solids) if (x > s.x0 - 1 && x < s.x1 + 1 && z > s.z0 - 1 && z < s.z1 + 1 && top > s.top) s.top = top;
    };
    for (const b of plan.boxes) raise(b.x, b.z, b.y + b.sy / 2);
    for (const c of plan.cyls) raise(c.x, c.z, c.y + c.h / 2);
    for (const d of plan.domes ?? []) raise(d.x, d.z, d.y + d.r);
    for (const s of solids) if (!s.top) s.top = CEILING;
  }
  const T = PORT.temple;
  const M = 1; // a metre of fender round everything
  /** How far (x, z) is inside a rectangle, and the way out; or null. */
  function outOfRect(x, z, x0, x1, z0, z1, best) {
    if (x <= x0 - M || x >= x1 + M || z <= z0 - M || z >= z1 + M) return best;
    const l = x - (x0 - M), r = x1 + M - x, b = z - (z0 - M), t = z1 + M - z;
    const d = Math.min(l, r, b, t);
    if (best && best.d >= d) return best;
    return d === l ? { d, nx: -1, nz: 0 } : d === r ? { d, nx: 1, nz: 0 } : d === b ? { d, nx: 0, nz: -1 } : { d, nx: 0, nz: 1 };
  }
  /** The deepest thing (x, z) at height y is inside, as { d, nx, nz } (the depth and the way out), or null in open air. */
  function penetration(x, z, y = 0) {
    let best = null;
    // the pagoda narrows as it climbs; above its finial there is nothing
    const dx = x, dz = z - T.z, dist = Math.hypot(dx, dz), R = y < 660 ? (T.island + 6) * (1 - Math.min(0.85, Math.max(0, y - 20) / 700)) : 0;
    if (dist < R) best = { d: R - dist, nx: dist > 1e-3 ? dx / dist : 1, nz: dist > 1e-3 ? dz / dist : 0 };
    if (y > CEILING) return best;
    for (const s of solids) if (y < s.top + 3) best = outOfRect(x, z, s.x0, s.x1, s.z0, s.z1, best);
    const land = plotLand(Math.floor(x / PLOT.X), Math.floor((z - PLOT.Z0) / PLOT.Z));
    if (land) best = outOfRect(x, z, land.x0, land.x1, land.z0, land.z1, best);
    if (z > 2200 && (!best || best.d < z - 2200)) best = { d: z - 2200, nx: 0, nz: -1 };
    return best;
  }
  // the points of the hull that feel the world: nose, cheeks, wingtips, flanks, tail
  const PROBES = [[0, NOSE], [4.5, 9], [-4.5, 9], [HALF_SPAN, 2], [-HALF_SPAN, 2], [6, -3], [-6, -3], [HALF_SPAN * 0.8, -9], [-HALF_SPAN * 0.8, -9], [0, -11], [0, 3]];
  // the last wall touched (its outward normal) and how long the shuttle has been pressed against it going nowhere
  const contact = { nx: 0, nz: 0, at: -1, sx: 0, sz: 0 }; // sx, sz: every wall touched lately, added up (the way out)
  let pinned = 0;
  /** Push the hull out of anything it is in and take away the motion into it; returns the hardest impact speed. */
  function resolveHull() {
    let impact = 0;
    for (let iter = 0; iter < 4; iter++) {
      const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw), rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
      let worst = null;
      for (const [r, f] of PROBES) {
        const pen = penetration(state.pos.x + rx * r + fx * f, state.pos.z + rz * r + fz * f, state.pos.y);
        if (pen && (!worst || pen.d > worst.d)) worst = pen;
      }
      if (!worst) break;
      contact.nx = worst.nx;
      contact.nz = worst.nz;
      contact.at = nowT;
      contact.sx += worst.nx;
      contact.sz += worst.nz;
      state.pos.x += worst.nx * (worst.d + 0.02);
      state.pos.z += worst.nz * (worst.d + 0.02);
      const vn = vel.x * worst.nx + vel.y * worst.nz;
      if (vn < 0) {
        impact = Math.max(impact, -vn);
        // the motion into the wall goes (a little bounce), the motion along it stays, scuffed by the contact
        vel.x -= worst.nx * vn * 1.12;
        vel.y -= worst.nz * vn * 1.12;
        vel.multiplyScalar(0.985);
      }
    }
    return impact;
  }

  // ---- rescue: no headway for a while with the throttle open (wedged in a notch, pinned in a corner) and the hull
  //      slides itself back to the nearest open air, facing the way to go. It can never be stuck. --------------------
  const anchor = { x: 0, z: 0, t: 0 };
  let rescue = null;
  function hullClear(x, z, yaw, scale = 1.35) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const [r, f] of PROBES) if (penetration(x + (rx * r + fx * f) * scale, z + (rz * r + fz * f) * scale, state.pos.y)) return false;
    return true;
  }
  function openWaterNear(x, z, prefer) {
    // (headings tried nearest first: keep the way you were going if the water allows)
    const yaws = [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9, Math.PI].map((d) => prefer + d);
    for (let r = 6; r <= 320; r += 8) {
      const n = Math.max(8, Math.round(r / 5));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        for (const yw of yaws) if (hullClear(px, pz, yw)) return { x: px, z: pz, yaw: yw };
      }
    }
    return null;
  }
  /** Where a trip goes next: the next waypoint along its route, followed even when you drive it yourself. */
  function guidePoint() {
    if (!trip) return null;
    const p = new THREE.Vector2(state.pos.x, state.pos.z);
    while (routeIx < route.length - 1) {
      const here = p.distanceTo(route[routeIx]);
      if (here < (route[routeIx].r ?? 55) || (!state.autopilot && p.distanceTo(route[routeIx + 1]) < here)) routeIx++;
      else break;
    }
    return { x: route[routeIx].x, z: route[routeIx].y };
  }

  // ---- input -----------------------------------------------------------------------------------------------------
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea, select")) return;
    const k = e.key.toLowerCase();
    if (state.view === "title") {
      if (k === "enter") api.board();
      return;
    }
    keys.add(k);
    if (k === "p") api.toggleAutopilot();
    if (k === "f") api.toggleSkim();
    if (k === "c") api.cycleView();
    if (k === "shift") state.boost = true;
  });
  addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    keys.delete(k);
    if (k === "shift") state.boost = false;
  });
  addEventListener("blur", () => keys.clear());
  const canvas = document.getElementById("scene");
  canvas.addEventListener("pointerdown", (e) => {
    state.look.dragging = true;
    state.look.lx = e.clientX;
    state.look.ly = e.clientY;
    state.look.moved = 0;
  });
  addEventListener("pointermove", (e) => {
    if (!state.look.dragging) return;
    const dx = e.clientX - state.look.lx, dy = e.clientY - state.look.ly;
    state.look.lx = e.clientX;
    state.look.ly = e.clientY;
    state.look.moved += Math.abs(dx) + Math.abs(dy);
    state.look.yaw -= dx * 0.004;
    state.look.pitch = Math.max(-0.5, Math.min(0.6, state.look.pitch - dy * 0.003));
  });
  addEventListener("pointerup", () => (state.look.dragging = false));

  // ---- autopilot: pure pursuit on a route (the tour loop, or a trip to one of the chapters) -----------------------
  const loopPts = LOOP();
  let route = loopPts, routeIx = 1, trip = null; // trip: { name, end: Vector2, yaw } while going to a chapter
  function autopilotSteer() {
    const p = new THREE.Vector2(state.pos.x, state.pos.z);
    if (trip) {
      // on a trip: take the waypoints in order (passed counts as reached, so it never circles one it missed), slow
      // into the last one and stop there
      while (routeIx < route.length - 1) {
        const w = route[routeIx], nxt = route[routeIx + 1];
        const passed = p.distanceTo(w) < 150 && (w.x - p.x) * (nxt.x - w.x) + (w.y - p.y) * (nxt.y - w.y) < 0;
        if (p.distanceTo(w) < (w.r ?? 55) || passed) routeIx++;
        else break;
      }
      const t = route[routeIx];
      const dist = p.distanceTo(t);
      if (routeIx === route.length - 1 && dist < 34) {
        const name = trip.name;
        if (trip.face) (faceTarget = trip.face), (faceUntil = nowT + 6);
        trip = null;
        route = loopPts;
        state.autopilot = false;
        api.onArrive?.(name);
        return { steer: 0, throttle: 0 };
      }
      const want = Math.atan2(-(t.x - p.x), -(t.y - p.y));
      let d = Math.atan2(Math.sin(want - state.yaw), Math.cos(want - state.yaw));
      const last = routeIx === route.length - 1;
      const slow = last ? Math.min(1, dist / 160) : 1;
      return { steer: Math.max(-1, Math.min(1, d * 2.2)), throttle: pace(d, dist) * Math.max(0.12, slow) };
    }
    // touring: advance the target once we are close to it
    while (p.distanceTo(route[routeIx]) < (route[routeIx].r ?? 70)) routeIx = (routeIx + 1) % route.length;
    const t = route[routeIx];
    const want = Math.atan2(-(t.x - p.x), -(t.y - p.y));
    let d = want - state.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return { steer: Math.max(-1, Math.min(1, d * 2.2)), throttle: pace(d, p.distanceTo(t)) };
  }
  /** How hard to drive at a target d radians off the nose and dist metres away: ease off when it lies inside the
   *  circle the hull can turn at this speed, so it turns onto it instead of orbiting it. */
  function pace(d, dist) {
    const v = Math.max(2, Math.abs(state.speed));
    const turnR = v / (0.14 + 0.4 * Math.min(1, v / 18));
    if (Math.abs(d) > 0.45 && dist < turnR * 2.2) return 0.14;
    return Math.abs(d) > 0.6 ? 0.35 : 0.85;
  }
  /** Waypoints from where the shuttle is to (x, z), up or down the Grand Channel, round the temple island. */
  function planTrip(x, z) {
    const pts = [];
    const z0 = state.pos.z;
    const north = z < z0;
    const lane = north ? LANE : -LANE;
    pts.push(new THREE.Vector2(lane, z0 + (north ? -40 : 40)));
    const T = PORT.temple;
    const passes = north ? z0 > T.z + T.r && z < T.z - T.r : z0 < T.z - T.r && z > T.z + T.r;
    if (passes) pts.push(...aroundIsland(north));
    pts.push(new THREE.Vector2(x, z));
    return pts;
  }

  // ---- step: the shuttle in the air ---------------------------------------------------------------------------------
  // Velocity lives in the world, the hull points where you steer: turning swings the nose and the momentum carries on,
  // so it slides out of a turn until the air grips it (loosely up in the sky lane). Springs ease its height toward the
  // altitude you set, and pitch and roll toward what it is doing: it banks into turns, noses down to speed up and lifts
  // its nose to climb, with a slow breath of hover under it.
  const vel = new THREE.Vector2(0, 0);
  const dyn = { y: FLOAT_Y, vy: 0, pitch: 0, vp: 0, roll: 0, vr: 0 };
  function update(time, dt) {
    let throttle = 0, steer = 0;
    if (!state.held) {
      if (state.autopilot) ({ steer, throttle } = autopilotSteer());
      if (keys.has("w") || keys.has("arrowup")) throttle = 1;
      if (keys.has("s") || keys.has("arrowdown")) throttle = -1;
      if (keys.has("a") || keys.has("arrowleft")) steer = 1;
      if (keys.has("d") || keys.has("arrowright")) steer = -1;
      if (virtual.throttle) throttle = virtual.throttle;
      if (virtual.steer) steer = virtual.steer;
      if ((keys.has("w") || keys.has("s") || keys.has("a") || keys.has("d")) && state.autopilot && !keys.has("shift")) state.autopilot = false;
    }
    state.throttle = Math.max(0, throttle);
    // steer: the rudder bites harder with speed through the water
    let fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
    let vF = vel.x * fx + vel.y * fz;
    const yawRate = steer * (0.14 + Math.min(1, Math.abs(vF) / 18) * 0.4) * (vF < -0.5 ? -1 : 1);
    state.yaw += yawRate * dt;
    // the momentum stays put while the hull turns: split it along the new heading
    fx = -Math.sin(state.yaw);
    fz = -Math.cos(state.yaw);
    const rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
    vF = vel.x * fx + vel.y * fz;
    let vL = vel.x * rx + vel.y * rz;
    const top = (state.skim ? SKIM : TAXI) * (state.boost ? 1.5 : 1);
    const target = throttle >= 0 ? throttle * top : throttle * TAXI * 0.75;
    // thrust and water drag along the hull; the water grips sideways (reverse bites quicker, the way a gear does)
    vF += (target - vF) * Math.min(1, dt * (throttle < 0 ? 0.9 : throttle ? 0.5 : 0.28));
    vL *= Math.exp(-dt * (state.skim ? 0.9 : 2.4));
    vel.set(fx * vF + rx * vL, fz * vF + rz * vL);
    state.speed = vF;
    state.slip = vL;
    // move, then let the world push back: scrape along walls and glance off corners, never stop dead
    state.pos.x += vel.x * dt;
    state.pos.z += vel.y * dt;
    nowT = time;
    const impact = resolveHull();
    if (impact > 2.5) knock(impact > 9);
    else state.blocked = Math.max(0, state.blocked - dt);
    // arrived: turn the hull to face the place (the way a car pulls up facing the shop), unless the pilot steers
    if (faceTarget) {
      const want = Math.atan2(-(faceTarget[0] - state.pos.x), -(faceTarget[2] - state.pos.z));
      const dy = Math.atan2(Math.sin(want - state.yaw), Math.cos(want - state.yaw));
      if (steer || time > faceUntil || Math.abs(dy) < 0.02) faceTarget = null;
      else state.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 0.9 * dt);
    }
    // a trip you drive yourself arrives when you get there
    if (trip && !state.autopilot && Math.hypot(trip.x - state.pos.x, trip.z - state.pos.z) < 40) {
      const name = trip.name;
      if (trip.face) (faceTarget = trip.face), (faceUntil = time + 6);
      trip = null;
      route = loopPts;
      api.onArrive?.(name);
    }
    // no headway for a while with the throttle open: slide back to open water
    if (Math.hypot(state.pos.x - anchor.x, state.pos.z - anchor.z) > 8 || throttle <= 0.2 || state.held) {
      anchor.x = state.pos.x;
      anchor.z = state.pos.z;
      anchor.t = time;
    } else if (time - anchor.t > 2.4 && !rescue) {
      const g = guidePoint();
      const prefer = g ? Math.atan2(-(g.x - state.pos.x), -(g.z - state.pos.z)) : state.yaw;
      const to = openWaterNear(state.pos.x, state.pos.z, prefer);
      if (to) rescue = { fx: state.pos.x, fz: state.pos.z, tx: to.x, tz: to.z, fyaw: state.yaw, tyaw: to.yaw, t: 0 };
      anchor.t = time;
    }
    if (rescue) {
      rescue.t = Math.min(1, rescue.t + dt / 0.8);
      const e = rescue.t * rescue.t * (3 - 2 * rescue.t);
      state.pos.x = rescue.fx + (rescue.tx - rescue.fx) * e;
      state.pos.z = rescue.fz + (rescue.tz - rescue.fz) * e;
      state.yaw = rescue.fyaw + Math.atan2(Math.sin(rescue.tyaw - rescue.fyaw), Math.cos(rescue.tyaw - rescue.fyaw)) * e;
      vel.set(0, 0);
      pinned = 0;
      if (rescue.t >= 1) rescue = null;
    }
    // pressed against a wall with the throttle open and going nowhere: swing the nose off it (toward the way along the
    // wall the nose already leans, and a little away from it), so holding W always carries you clear
    const touching = time - contact.at < 0.2;
    if (touching && throttle > 0.2 && Math.abs(vel.x * fx + vel.y * fz) < 3) pinned += dt;
    else pinned = Math.max(0, pinned - dt * 2);
    // (all the walls touched lately are added up, so in a corner between a bank and a pillar it turns toward the open
    // water between them rather than flipping from one to the other)
    contact.sx *= Math.exp(-dt * 1.5);
    contact.sz *= Math.exp(-dt * 1.5);
    if (pinned > 0.6 && Math.hypot(contact.sx, contact.sz) > 1e-3) {
      const want = Math.atan2(-contact.sx, -contact.sz);
      const dy = Math.atan2(Math.sin(want - state.yaw), Math.cos(want - state.yaw));
      state.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 1.6 * dt);
      state.blocked = Math.max(state.blocked, 0.3);
      if (Math.abs(dy) < 0.35) pinned = 0; // facing open water: let the throttle take it from here
    }
    state.speed = vel.x * fx + vel.y * fz;
    state.slip = vel.x * rx + vel.y * rz;
    // fly: E / Space climbs, Q sinks (the stick on touch), and the sky lane is anything above 60 m
    if (!state.held) {
      const up = keys.has("e") || keys.has(" ") || virtual.climb > 0, down = keys.has("q") || virtual.climb < 0;
      if (up) state.flyAlt = Math.min(620, state.flyAlt + 34 * dt);
      if (down) state.flyAlt = Math.max(HOVER_MIN, state.flyAlt - 34 * dt);
    }
    state.skim = state.flyAlt > 60;
    const speedK = Math.min(1, Math.abs(vF) / 20);
    const wantY = state.flyAlt + Math.sin(time * 0.9) * 0.3 + Math.sin(time * 2.3 + 1.1) * 0.08;
    const wantPitch = -dyn.vy * 0.012 + (throttle > 0 ? -0.04 : throttle < 0 ? 0.035 : 0.008) * speedK;
    const wantRoll = steer * speedK * 0.4 - vL * 0.012;
    dyn.vy += ((wantY - dyn.y) * 2.4 - dyn.vy * 2.7) * dt;
    dyn.vy = Math.max(-28, Math.min(28, dyn.vy));
    dyn.y += dyn.vy * dt;
    dyn.vp += ((wantPitch - dyn.pitch) * 16 - dyn.vp * 4.2) * dt;
    dyn.pitch += dyn.vp * dt;
    dyn.vr += ((wantRoll - dyn.roll) * 14 - dyn.vr * 3.6) * dt;
    dyn.roll += dyn.vr * dt;
    state.pos.y = dyn.y;
    state.alt = dyn.y; // above the street
    state.heave = dyn.vy;
    state.pitch = dyn.pitch;
    state.bank = dyn.roll;
    // place the hull
    shuttle.group.position.copy(state.pos);
    shuttle.group.rotation.set(dyn.pitch, state.yaw, dyn.roll, "YXZ");
    shuttle.tick(time, Math.min(1, Math.abs(vF) / SKIM + (state.skim ? 0.35 : 0.1)));
    // the arrival gaze holds a while, then eases back (at once if you steer or drag)
    nowT = time;
    if (time > gazeUntil || keys.size || state.look.dragging) gazeTarget = 0;
    state.gaze += (gazeTarget - state.gaze) * Math.min(1, dt * 1.1);
    // ease the look offset back to centre when not dragging
    if (!state.look.dragging) {
      state.look.yaw *= Math.max(0, 1 - dt * 0.9);
      state.look.pitch *= Math.max(0, 1 - dt * 0.9);
    }
    placeCamera(time, dt);
  }
  let lastKnock = -10;
  function knock(hard = false) {
    state.blocked = hard ? 0.8 : 0.5;
    const now = performance.now() / 1000;
    if (now - lastKnock < 0.6) return;
    lastKnock = now;
    api.onKnock?.(hard);
  }

  // ---- cameras -----------------------------------------------------------------------------------------------------
  const camPos = new THREE.Vector3(0, 14, 600), camLook = new THREE.Vector3(0, 6, 400);
  let snap = true;
  let camYaw = 0; // the chase camera's own heading: it swings round after the hull's, on a circle
  let boarding = null; // { t, from, fromLook } while the camera dives from the title shot to the chase camera
  const pointer = { x: 0, y: 0 }, parallax = { x: 0, y: 0 };
  let introAt = -1;
  addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  });
  const smoothstep01 = (x) => {
    const c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
  };
  function bez(a, b, c, d, t) {
    const u = 1 - t;
    return a.clone().multiplyScalar(u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
  }
  function placeCamera(time, dt) {
    if (state.view === "free") return;
    if (state.view === "title") {
      // standing on the boardwalk: the torii and the castle ahead, a slow breath of movement, and the cursor
      // leaning the view a little (a parallax, the way Kage and Unseen let the scene answer the mouse)
      parallax.x += (pointer.x - parallax.x) * Math.min(1, dt * 2.2);
      parallax.y += (pointer.y - parallax.y) * Math.min(1, dt * 2.2);
      const [px, py, pz] = TITLE_CAM.pos, [lx, ly, lz] = TITLE_CAM.look;
      // the opening dolly: from further back and a little higher, easing in as the doors part
      const k = introAt < 0 ? 1 : 1 - Math.pow(1 - Math.min(1, (time - introAt) / 3.2), 3);
      const back = (1 - k) * 22, lift = (1 - k) * 4;
      camPos.set(px + Math.sin(time * 0.07) * 0.6 + parallax.x * 1.4, py + lift + Math.sin(time * 0.11) * 0.12 - parallax.y * 0.45, pz + back - Math.sin(time * 0.05) * 1.5);
      camLook.set(lx + parallax.x * 7, ly - parallax.y * 3.5, lz);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      return;
    }
    const p = state.pos;
    const yaw = state.yaw + state.look.yaw;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    let wantPos, wantLook;
    if (state.view === "cockpit") {
      const fy = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
      // the pilot's eye, just above the top of the visor, looking out over the nose
      wantPos = p.clone().addScaledVector(fy, 8.6).add(new THREE.Vector3(0, 2.55 + state.pitch * 8.6, 0));
      wantLook = wantPos.clone().addScaledVector(f, 40).add(new THREE.Vector3(0, -3.2 + state.look.pitch * 40, 0));
      camPos.copy(wantPos);
      camLook.copy(wantLook);
      camera.position.copy(camPos);
      camera.up.set(Math.sin(-state.bank) * 0.5 * Math.cos(state.yaw), 1, 0).normalize();
      camera.lookAt(camLook);
      camera.up.set(0, 1, 0);
      return;
    }
    if (state.view === "drone") {
      // dev view: high above and behind, looking down at the wake
      wantPos = p.clone().addScaledVector(f, -46).add(new THREE.Vector3(0, 58, 0));
      wantLook = p.clone().addScaledVector(f, -14);
    } else if (state.view === "show") {
      state.showAngle += dt * 0.12;
      const a = state.showAngle + state.look.yaw;
      const r = 34;
      wantPos = p.clone().add(new THREE.Vector3(Math.sin(a) * r, 5.5 + state.look.pitch * 20, Math.cos(a) * r));
      wantLook = p.clone().add(new THREE.Vector3(0, 1.2, 0));
    } else {
      // chase: behind and above, a little to the outside of the turn
      // a tall phone screen sees more height than width: sit further back and higher so the shuttle fits
      const tall = camera.aspect < 0.8 ? 1.45 : 1;
      const back = (state.skim ? 40 : 34) * tall, up = (state.skim ? 12 : 10) * tall;
      // the camera follows the hull's heading round a circle, so a U-turn sweeps it round behind, never alongside
      camYaw += Math.atan2(Math.sin(yaw - camYaw), Math.cos(yaw - camYaw)) * (snap || boarding ? 1 : 1 - Math.exp(-dt * 2.4));
      const fc = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
      wantPos = p.clone().addScaledVector(fc, -back).add(new THREE.Vector3(0, up + state.look.pitch * 30, 0));
      wantLook = p.clone().addScaledVector(fc, 34).add(new THREE.Vector3(0, 3.5 + state.gaze, 0));
      wantPos.y -= state.gaze * 0.12;
    }
    if (boarding) {
      // up the boardwalk, through the great torii, and down in behind the shuttle
      boarding.t += dt / 4.6;
      const t = Math.min(1, boarding.t);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      if (!boarding.path) {
        const gz = PORT.channel.z0 + 90;
        boarding.path = new THREE.CatmullRomCurve3([boarding.from, new THREE.Vector3(0, 9, 860), new THREE.Vector3(0, 30, gz + 20), new THREE.Vector3(0, 30, gz - 40), new THREE.Vector3(0, 20, gz - 120), wantPos.clone()], false, "centripetal");
      }
      boarding.path.points[boarding.path.points.length - 1].copy(wantPos);
      camPos.copy(boarding.path.getPointAt(e));
      const ahead = boarding.path.getPointAt(Math.min(1, e + 0.06));
      camLook.copy(ahead.lerp(wantLook, smoothstep01((e - 0.55) / 0.45)));
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      state.gatePulse = Math.max(0, 1 - Math.abs(e - 0.42) / 0.12);
      if (t >= 1) {
        boarding = null;
        state.held = false;
        state.gatePulse = 0;
        api.onBoarded?.();
      }
      return;
    }
    // (the chase camera's lag is in its heading; its position only smooths the bob, and drops back a little at speed)
    const k = snap ? 1 : 1 - Math.exp(-dt * (state.view === "chase" ? 9 : 3.2));
    camPos.lerp(wantPos, k);
    // never let the hull run up to the lens (after a bounce or a slide the lagging camera would be too close)
    if (state.view === "chase") {
      const want = Math.hypot(wantPos.x - p.x, wantPos.z - p.z);
      const dx = camPos.x - p.x, dz = camPos.z - p.z, dd = Math.hypot(dx, dz);
      if (dd < want * 0.85 && dd > 1e-3) {
        camPos.x = p.x + (dx / dd) * want * 0.85;
        camPos.z = p.z + (dz / dd) * want * 0.85;
      }
      camPos.y = Math.max(camPos.y, p.y + 6);
    }
    camLook.lerp(wantLook, 1 - Math.exp(-dt * 5));
    if (snap) camLook.copy(wantLook);
    snap = false;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  if (state.view === "title") state.held = true;
  const api = {
    state,
    virtual,
    update,
    board() {
      if (state.view !== "title") return;
      camYaw = state.yaw;
      boarding = { t: 0, from: camPos.clone(), fromLook: camLook.clone() };
      state.view = "chase";
      api.onView?.("chase");
    },
    setView(v) {
      state.view = v;
      snap = true;
      api.onView?.(v);
    },
    cycleView() {
      const order = ["chase", "cockpit", "show"];
      api.setView(order[(order.indexOf(state.view) + 1) % order.length]);
    },
    get trip() {
      return trip;
    },
    /** The trip's route still to fly, from the next waypoint to its end (for the guidance line). */
    routeAhead() {
      if (!trip) return null;
      guidePoint();
      return route.slice(routeIx).map((v) => ({ x: v.x, z: v.y }));
    },
    /** The next turn of the trip's route, for the direction arrow (null when not on a trip). */
    guide() {
      return guidePoint();
    },
    toggleAutopilot() {
      state.autopilot = !state.autopilot;
      trip = null;
      route = loopPts;
      if (state.autopilot) {
        // pick up the loop at the nearest waypoint ahead
        let best = 0, bd = Infinity;
        loopPts.forEach((q, i) => {
          const d = q.distanceTo(new THREE.Vector2(state.pos.x, state.pos.z));
          if (d < bd) (bd = d), (best = i);
        });
        routeIx = (best + 1) % loopPts.length;
      }
    },
    /** Fly to one of the chapters on autopilot and stop there. */
    /** Put the shuttle back on the avenue at (x, z) facing yaw, at rest (the recall from far out in the wards). */
    recall(x, z, yaw = 0) {
      state.flyAlt = HOVER;
      dyn.y = HOVER;
      dyn.vy = 0;
      state.pos.set(x, HOVER, z);
      state.yaw = yaw;
      state.speed = 0;
      vel.set(0, 0);
      snap = true;
    },
    /** Look up: lift the chase camera's aim by `lift` metres for `secs` seconds. */
    gaze(lift, secs = 7) {
      gazeTarget = lift;
      gazeUntil = nowT + secs;
    },
    goTo(name, x, z, face = null) {
      route = planTrip(x, z);
      routeIx = 0;
      trip = { name, x, z, face };
      faceTarget = null;
      state.autopilot = true;
    },
    /** The home screen's opening move: the camera eases in along the boardwalk as the doors part. */
    intro(time) {
      introAt = time;
    },
    /** F: up to the sky lane, or back down to the street. */
    toggleSkim() {
      state.flyAlt = state.flyAlt > 60 ? HOVER : SKY_LANE;
    },
    forward() {
      return new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    },
  };
  return api;
}
