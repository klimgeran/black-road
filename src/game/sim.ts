import type { Body, Dust, Popup, Shard, Stats, Surface, Track, WheelState } from "./types";
import { sample } from "./terrain";

export const REST = 0.5;
const REAR_X = -0.78;
const FRONT_X = 0.82;
const AXLE_Y = -0.02;
const G = 19;
const INERTIA = 0.68;

export type Input = { gas: boolean; brake: boolean };

export type Sim = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  lean: number;
  prevVx: number;
  wheelR: number;
  rear: WheelState;
  front: WheelState;
  wasRear: boolean;
  wasFront: boolean;
  fuel: number;
  fuelMax: number;
  boost: number;
  gasHold: number;
  slope: number;
  coins: number;
  flipCoins: number;
  flips: number;
  air: number;
  airTime: number;
  crashed: boolean;
  crashReason: string;
  wheelOff: "rear" | "front" | null;
  finished: boolean;
  outOfFuel: boolean;
  dryTimer: number;
  endTimer: number;
  age: number;
  shake: number;
  popups: Popup[];
  dust: Dust[];
  shards: Shard[];
  rider: Body | null;
  loose: Body | null;
};

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function normAngle(a: number) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function localToWorld(sim: Sim, lx: number, ly: number) {
  const c = Math.cos(sim.rot);
  const s = Math.sin(sim.rot);
  return { x: sim.x + lx * c - ly * s, y: sim.y + lx * s + ly * c };
}

function applyForce(sim: Sim, px: number, py: number, fx: number, fy: number, dt: number) {
  sim.vx += fx * dt;
  sim.vy += fy * dt;
  const rx = px - sim.x;
  const ry = py - sim.y;
  const torque = rx * fy - ry * fx;
  sim.vr += (torque / INERTIA) * dt;
}

type Contact = {
  x: number;
  y: number;
  grounded: boolean;
  compression: number;
  ground: Surface;
  vn: number;
};

function contactWheel(sim: Sim, axleX: number, axleY: number, track: Track, radius: number): Contact {
  const ground = sample(track, axleX);
  const hangY = axleY - REST;
  if (ground.void) {
    return { x: axleX, y: hangY, grounded: false, compression: 0, ground, vn: 0 };
  }
  const surface = ground.y + radius;
  const compression = surface - hangY;
  const rx = axleX - sim.x;
  const ry = axleY - sim.y;
  const avx = sim.vx - sim.vr * ry;
  const avy = sim.vy + sim.vr * rx;
  const vn = avx * ground.nx + avy * ground.ny;
  if (compression > 0) {
    return { x: axleX, y: surface, grounded: true, compression, ground, vn };
  }
  return { x: axleX, y: hangY, grounded: false, compression: 0, ground, vn };
}

function kill(sim: Sim, reason: string, hard: boolean) {
  if (sim.crashed || sim.finished) return;
  sim.crashed = true;
  sim.crashReason = reason;
  sim.endTimer = 0;
  sim.shake = 1;
  if (hard) sim.wheelOff = Math.abs(sim.vr) > 1.2 || reason.includes("Wheel") ? (sim.rear.grounded ? "front" : "rear") : "rear";
  const head = localToWorld(sim, -0.05, 1.05);
  sim.rider = {
    x: head.x,
    y: head.y,
    vx: sim.vx * 0.35 + (sim.lean > 0 ? -1.5 : 1.2),
    vy: Math.max(4, sim.vy + 3),
    rot: sim.rot + sim.lean,
    vr: sim.vr + sim.lean * 2,
  };
  if (sim.wheelOff) {
    const w = sim.wheelOff === "rear" ? sim.rear : sim.front;
    sim.loose = { x: w.x, y: w.y, vx: sim.vx * 0.7 + 2, vy: 5, rot: 0, vr: 14 };
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    sim.shards.push({
      x: sim.x,
      y: sim.y + 0.4,
      vx: Math.cos(a) * (3 + Math.random() * 4),
      vy: Math.sin(a) * 3 + 2,
      life: 0.8 + Math.random() * 0.4,
      s: 0.06 + Math.random() * 0.08,
    });
  }
}

function stepBody(b: Body, dt: number, track: Track, radius: number) {
  b.vy -= G * dt;
  b.vx *= Math.max(0, 1 - 0.15 * dt);
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.rot += b.vr * dt;
  const g = sample(track, b.x);
  if (!g.void && b.y < g.y + radius) {
    b.y = g.y + radius;
    if (b.vy < 0) b.vy *= -0.28;
    b.vx *= 0.82;
    b.vr *= 0.9;
  }
}

function circleAabb(cx: number, cy: number, r: number, b: { x: number; y: number; w: number; h: number }) {
  const qx = clamp(cx, b.x, b.x + b.w);
  const qy = clamp(cy, b.y, b.y + b.h);
  let dx = cx - qx;
  let dy = cy - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  const d = Math.sqrt(d2);
  if (d < 1e-4) return { nx: 0, ny: 1, pen: r };
  return { nx: dx / d, ny: dy / d, pen: r - d };
}

export function createSim(track: Track, stats: Stats): Sim {
  const x = 8;
  const g = sample(track, x);
  const y = g.y + stats.wheelR + REST;
  const sim: Sim = {
    x,
    y,
    vx: 0,
    vy: 0,
    rot: 0,
    vr: 0,
    lean: 0,
    prevVx: 0,
    wheelR: stats.wheelR,
    rear: { x: x + REAR_X, y: g.y + stats.wheelR, spin: 0, grounded: true, compression: 0 },
    front: { x: x + FRONT_X, y: g.y + stats.wheelR, spin: 0, grounded: true, compression: 0 },
    wasRear: true,
    wasFront: true,
    fuel: stats.fuelMax,
    fuelMax: stats.fuelMax,
    boost: 0,
    gasHold: 0,
    slope: 0,
    coins: 0,
    flipCoins: 0,
    flips: 0,
    air: 0,
    airTime: 0,
    crashed: false,
    crashReason: "",
    wheelOff: null,
    finished: false,
    outOfFuel: false,
    dryTimer: 0,
    endTimer: 0,
    age: 0,
    shake: 0,
    popups: [],
    dust: [],
    shards: [],
    rider: null,
    loose: null,
  };
  return sim;
}

export function stepSim(sim: Sim, input: Input, track: Track, stats: Stats, dt: number) {
  sim.age += dt;
  sim.shake *= Math.exp(-2.8 * dt);
  for (const p of sim.popups) p.life -= dt;
  if (sim.popups.length && sim.popups[0].life <= 0) sim.popups.shift();

  let di = 0;
  while (di < sim.dust.length) {
    const d = sim.dust[di];
    d.life -= dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vy -= 6 * dt;
    if (d.life <= 0) {
      sim.dust[di] = sim.dust[sim.dust.length - 1];
      sim.dust.pop();
    } else di++;
  }
  for (const s of sim.shards) {
    s.life -= dt;
    s.vy -= G * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }

  if (sim.crashed) {
    if (sim.rider) stepBody(sim.rider, dt, track, 0.22);
    if (sim.loose) stepBody(sim.loose, dt, track, stats.wheelR);
    sim.vy -= G * dt;
    sim.x += sim.vx * dt;
    sim.y += sim.vy * dt;
    sim.rot += sim.vr * dt;
    const g = sample(track, sim.x);
    if (!g.void && sim.y < g.y + 0.4) {
      sim.y = g.y + 0.4;
      if (sim.vy < 0) sim.vy *= -0.2;
      sim.vx *= 0.86;
    }
    sim.vx *= Math.max(0, 1 - 0.2 * dt);
    sim.vr *= Math.max(0, 1 - 0.4 * dt);
    sim.endTimer += dt;
    return;
  }

  if (sim.finished || sim.outOfFuel) {
    sim.vx *= Math.max(0, 1 - 3 * dt);
    sim.x += sim.vx * dt;
    sim.endTimer += dt;
    return;
  }

  sim.boost = Math.max(0, sim.boost - dt);

  const gas = input.gas && !input.brake && sim.fuel > 0;
  const brake = input.brake;
  if (gas) sim.fuel = Math.max(0, sim.fuel - stats.drink * dt);
  if (brake && !gas && sim.fuel > 0 && Math.abs(sim.vx) < 2.4) {
    sim.fuel = Math.max(0, sim.fuel - stats.drink * 0.35 * dt);
  }

  sim.vy -= G * dt;

  const rearAxle = localToWorld(sim, REAR_X, AXLE_Y);
  const frontAxle = localToWorld(sim, FRONT_X, AXLE_Y);
  const rearC = contactWheel(sim, rearAxle.x, rearAxle.y, track, stats.wheelR);
  const frontC = contactWheel(sim, frontAxle.x, frontAxle.y, track, stats.wheelR);

  const K = (78 + stats.suspension * 10) * (0.85 + stats.suspension * 0.05);
  const C = 15 + stats.suspension * 2.2;

  let landingImpact = 0;

  const solve = (c: Contact, axle: { x: number; y: number }, wheel: WheelState, driven: boolean) => {
    if (c.grounded && !wheel.grounded && sim.age > 0.35) {
      const hit = Math.max(0, -c.vn);
      if (hit > landingImpact) landingImpact = hit;
    }
    if (!c.grounded) return;
    let f = c.compression * K - c.vn * C;
    if (f < 0) f = 0;
    if (driven && brake && sim.vx > 1.5) f *= 0.55;
    f = Math.min(f, 140);
    applyForce(sim, axle.x, axle.y, c.ground.nx * f, c.ground.ny * f, dt);

    const rx = axle.x - sim.x;
    const ry = axle.y - sim.y;
    const avx = sim.vx - sim.vr * ry;
    const avy = sim.vy + sim.vr * rx;
    const vt = avx * c.ground.tx + avy * c.ground.ty;
    let ft = 0;
    const boosted = sim.boost > 0;
    const grip = 11 * stats.grip * (driven ? 1 : 0.7) * (boosted ? 1.25 : 1);
    const top = stats.maxSpeed * (boosted ? 1.7 : 1);
    if (driven && (gas || boosted)) {
      const ratio = clamp(Math.max(0, vt) / top, 0, 1);
      const crawl = vt < 3.2 ? 1.45 : 1;
      const along = stats.engine * crawl * (boosted ? 1.85 : 1) * (1 - ratio * ratio) + (boosted ? 9 : 0);
      const atWheel = along * (0.18 + 0.1 * stats.wheelie);
      const atBody = along - atWheel;
      applyForce(sim, sim.x, sim.y, c.ground.tx * atBody, c.ground.ty * atBody, dt);
      ft += atWheel;
    }
    if (!driven && gas && !sim.rear.grounded) {
      const ratio = clamp(Math.max(0, vt) / top, 0, 1);
      ft += stats.engine * 0.55 * (1 - ratio * ratio);
    }
    if (brake) {
      if (vt > 0.85) {
        const share = driven ? 0.42 : 1;
        ft -= (16 + stats.grip * 3) * share;
      } else if (sim.fuel > 0) {
        const need = -7.4 - vt;
        ft += clamp(need * 4.2, -12, 12) * (driven ? 1 : 0.25);
      } else {
        ft -= vt * 3.2;
      }
    }
    ft += clamp(-vt * 0.22, -1.1, 1.1);
    ft = clamp(ft, -grip * (brake ? 1.35 : 1), grip);
    applyForce(sim, axle.x, axle.y, c.ground.tx * ft, c.ground.ty * ft, dt);
    wheel.spin += (vt / stats.wheelR) * dt;
  };

  solve(rearC, rearAxle, sim.rear, true);
  solve(frontC, frontAxle, sim.front, false);

  const both = rearC.grounded && frontC.grounded;
  const any = rearC.grounded || frontC.grounded;
  const nose = normAngle(sim.rot);
  if (!any) {
    const accel = (gas ? 1 : 0) * (7.2 + stats.air * 2.4) - (brake ? 1 : 0) * (6.8 + stats.air * 2.1);
    sim.vr += accel * dt;
    if (!gas && !brake) sim.vr *= Math.max(0, 1 - 1.1 * dt);
    sim.vr = clamp(sim.vr, -9, 9);
  } else {
    if (gas && rearC.grounded) {
      const speedK = 0.7 + 0.45 * (1 - clamp(sim.vx / (stats.maxSpeed + 0.01), 0, 1));
      const punch = (3.6 + stats.wheelie * 1.7) * speedK;
      const commit = nose > 0.72 ? 2.8 : nose > 0.4 ? 1.1 : 0;
      sim.vr += (punch + commit) * dt;
    }
    if (brake && nose > 0.12) sim.vr -= (3.4 + Math.max(0, nose) * 2) * dt;
    if (rearC.grounded && !frontC.grounded) {
      const cg = localToWorld(sim, 0.08, 0.22);
      const rx = cg.x - rearAxle.x;
      sim.vr += ((rx * -G) / INERTIA) * 0.055 * dt;
    }
    const align = both && !gas;
    if (align && !rearC.ground.void && !frontC.ground.void) {
      const ga = Math.atan2(frontC.y - rearC.y, frontC.x - rearC.x);
      const err = normAngle(ga - sim.rot);
      const speed = Math.hypot(sim.vx, sim.vy);
      const k = 6.2 + Math.max(0, 8 - speed) * 0.6;
      const lip = Math.abs(ga) > 0.4 ? 0.28 : 1;
      sim.vr += (err * k * lip - sim.vr * 4.4) * dt;
    } else if (any && !gas) {
      const ga = both ? Math.atan2(frontC.y - rearC.y, frontC.x - rearC.x) : 0;
      const err = normAngle(ga - sim.rot);
      sim.vr += (err * 5.5 - sim.vr * 5) * dt;
    }
  }

  sim.vr = clamp(sim.vr, -11, 11);
  sim.vx = clamp(sim.vx, -9, sim.boost > 0 ? 54 : 42);
  sim.vy = clamp(sim.vy, -38, 36);

  sim.x += sim.vx * dt;
  sim.y += sim.vy * dt;
  sim.rot += sim.vr * dt;

  // Positional depenetration so the bike stays on the ribbon.
  for (let pass = 0; pass < 2; pass++) {
    for (const lx of [REAR_X, FRONT_X]) {
      if (gas && lx === FRONT_X) continue;
      const axle = localToWorld(sim, lx, AXLE_Y);
      const gnd = sample(track, axle.x);
      if (gnd.void) continue;
      const hang = axle.y - REST;
      const pen = gnd.y + stats.wheelR - hang;
      if (pen > 0.01) {
        sim.x += gnd.nx * pen * 0.38;
        sim.y += gnd.ny * pen * 0.38;
        const vn = sim.vx * gnd.nx + sim.vy * gnd.ny;
        if (vn < 0) {
          sim.vx -= gnd.nx * vn * 0.85;
          sim.vy -= gnd.ny * vn * 0.85;
        }
      }
    }
  }

  const rearAxle2 = localToWorld(sim, REAR_X, AXLE_Y);
  const frontAxle2 = localToWorld(sim, FRONT_X, AXLE_Y);
  const rearF = contactWheel(sim, rearAxle2.x, rearAxle2.y, track, stats.wheelR);
  const frontF = contactWheel(sim, frontAxle2.x, frontAxle2.y, track, stats.wheelR);
  sim.rear.x = rearF.x;
  sim.rear.y = rearF.y;
  sim.rear.grounded = rearF.grounded;
  sim.rear.compression = rearF.compression;
  sim.front.x = frontF.x;
  sim.front.y = frontF.y;
  sim.front.grounded = frontF.grounded;
  sim.front.compression = frontF.compression;

  if (!sim.crashed && !sim.finished && !sim.outOfFuel) {
    const airborneNow = !sim.rear.grounded && !sim.front.grounded;
    if (gas && !airborneNow) sim.gasHold = Math.min(2.4, sim.gasHold + dt);
    else sim.gasHold = Math.max(0, sim.gasHold - dt * (brake ? 5 : 2.8));
    if (gas && !airborneNow && sim.gasHold > 0.2) {
      const underNow = sample(track, sim.x);
      const slope = underNow.void ? 0 : Math.atan2(underNow.ty, underNow.tx);
      const lift = Math.min(1.55, (sim.gasHold - 0.2) * 1.02);
      const want = slope + lift;
      const noseNow = normAngle(sim.rot);
      if (want > noseNow) {
        sim.rot = noseNow + Math.min(want - noseNow, 3.1 * dt);
        sim.vr = Math.max(sim.vr, 0.35);
        const rearA = localToWorld(sim, REAR_X, AXLE_Y);
        const planted = contactWheel(sim, rearA.x, rearA.y, track, stats.wheelR);
        if (!planted.ground.void && planted.compression > 0.02) sim.y += planted.compression * 0.9;
        const rearB = localToWorld(sim, REAR_X, AXLE_Y);
        const frontB = localToWorld(sim, FRONT_X, AXLE_Y);
        const r2 = contactWheel(sim, rearB.x, rearB.y, track, stats.wheelR);
        const f2 = contactWheel(sim, frontB.x, frontB.y, track, stats.wheelR);
        sim.rear.x = r2.x;
        sim.rear.y = r2.y;
        sim.rear.grounded = r2.grounded;
        sim.rear.compression = r2.compression;
        sim.front.x = f2.x;
        sim.front.y = f2.y;
        sim.front.grounded = f2.grounded;
        sim.front.compression = f2.compression;
      }
    }
  }

  // Barriers
  if (!sim.crashed) {
    const wheels = [sim.rear, sim.front];
    for (const w of wheels) {
      for (const b of track.barriers) {
        if (Math.abs(w.x - b.x) > 4) continue;
        const hit = circleAabb(w.x, w.y, stats.wheelR, b);
        if (!hit) continue;
        const into = -(sim.vx * hit.nx + sim.vy * hit.ny);
        sim.x += hit.nx * hit.pen;
        sim.y += hit.ny * hit.pen;
        const vn = sim.vx * hit.nx + sim.vy * hit.ny;
        if (vn < 0) {
          sim.vx -= hit.nx * vn;
          sim.vy -= hit.ny * vn;
        }
        if (Math.abs(hit.nx) > 0.65 && into > 9 && sim.age > 0.5) {
          kill(sim, "Hit a wall", true);
          break;
        }
      }
      if (sim.crashed) break;
    }
  }

  const airborne = !sim.rear.grounded && !sim.front.grounded;
  if (airborne) {
    sim.air += sim.vr * dt;
    sim.airTime += dt;
  } else if (sim.airTime > 0.28) {
    const turns = Math.abs(sim.air) / (Math.PI * 2);
    if (!sim.crashed && turns >= 0.68) {
      const n = Math.max(1, Math.round(turns));
      const bonus = 25 * n * n;
      sim.flipCoins += bonus;
      sim.flips += n;
      const back = sim.air > 0;
      sim.popups.push({
        x: sim.x,
        y: sim.y + 1.8,
        text: n === 1 ? (back ? "BACKFLIP" : "FRONTFLIP") : `${back ? "BACKFLIP" : "FRONTFLIP"} ×${n}  +${bonus}`,
        life: 1.35,
      });
      sim.shake = Math.max(sim.shake, 0.25);
    }
    sim.air = 0;
    sim.airTime = 0;
  } else {
    sim.air = 0;
    sim.airTime = 0;
  }

  if (!sim.crashed && landingImpact > 0) {
    const level = Math.abs(normAngle(sim.rot));
    const limit = stats.crash * (level < 0.65 ? 1.28 : 1);
    if (landingImpact > limit) {
      const hard = landingImpact > limit * 1.32;
      kill(sim, hard ? "Wheel ripped off" : "Hard landing", hard);
    } else if (landingImpact > 7) {
      sim.shake = Math.max(sim.shake, Math.min(0.7, landingImpact / 22));
    }
  }

  if (!sim.crashed && sim.age > 0.45) {
    const ang = normAngle(sim.rot);
    const spd = Math.hypot(sim.vx, sim.vy);
    const groundedNow = sim.rear.grounded || sim.front.grounded;
    const under = sample(track, sim.x);
    let rel = Math.abs(ang);
    if (!under.void) rel = Math.abs(normAngle(ang - Math.atan2(under.ty, under.tx)));
    if (groundedNow && ang - sim.slope > 1.32 && ang > 1.02) kill(sim, "Looped — let off the gas", true);
    else if (groundedNow && ang - sim.slope < -1.2 && sim.vx > 4) kill(sim, "Endo — eased off too late", true);
    else if (groundedNow && rel > 1.55 && spd > 3.5) kill(sim, "Bad landing", true);
    if (!under.void && sim.y < under.y - 0.2 && spd > 4) kill(sim, "Too short", true);
    if (sim.y < -18) kill(sim, "Left the road", false);
    const head = localToWorld(sim, -0.02 + sim.lean * -0.05, 1.12);
    const hg = sample(track, head.x);
    if (!hg.void && head.y < hg.y + 0.02 && spd > 7 && rel > 1.15 && !(sim.rear.grounded && ang > 0.2)) kill(sim, "Bad landing", true);
  }

  // Pickups
  if (!sim.crashed) {
    for (const item of track.pickups) {
      if (item.taken) continue;
      if (item.x < sim.x - 3 || item.x > sim.x + 14) continue;
      const dx = item.x - sim.x;
      const dy = item.y - (sim.y + 0.3);
      const d2 = dx * dx + dy * dy;
      if (item.kind !== "fuel" && item.kind !== "ozone" && d2 < 5.2 && d2 > 0.04) {
        const pull = Math.min(1, dt * 9);
        item.x += (sim.x - item.x) * pull;
        item.y += (sim.y + 0.35 - item.y) * pull;
      }
      const reach = item.kind === "fuel" || item.kind === "ozone" ? 1.25 : 1.15;
      if (d2 < reach * reach) {
        item.taken = true;
        if (item.kind === "ozone") {
          sim.boost = Math.max(sim.boost, 1.35);
          sim.vx += 12 + Math.min(6, Math.max(0, sim.vx) * 0.15);
          const cap = stats.maxSpeed * 1.82;
          if (sim.vx > cap) sim.vx = cap;
          sim.vy += 0.7;
          sim.popups.push({ x: item.x, y: item.y + 0.55, text: "OZONE", life: 0.9 });
          sim.shake = Math.max(sim.shake, 0.34);
        } else if (item.kind === "fuel") {
          sim.fuel = Math.min(sim.fuelMax, sim.fuel + sim.fuelMax * 0.46);
          sim.popups.push({ x: item.x, y: item.y + 0.4, text: "FUEL", life: 0.9 });
        } else {
          sim.coins += item.value;
        }
      }
    }
  }

  if ((sim.rear.grounded && sim.vx > 6 && Math.random() < dt * 22) || (sim.boost > 0 && Math.random() < dt * 46)) {
    sim.dust.push({
      x: sim.rear.x,
      y: sim.rear.y,
      vx: -sim.vx * 0.15 + (Math.random() - 0.5) * (sim.boost > 0 ? 3 : 1),
      vy: 0.8 + Math.random() * (sim.boost > 0 ? 2.2 : 1),
      life: sim.boost > 0 ? 0.28 : 0.35,
      s: 0.08 + Math.random() * (sim.boost > 0 ? 0.14 : 0.08),
      blue: sim.boost > 0,
    });
    if (sim.dust.length > 36) sim.dust.splice(0, sim.dust.length - 36);
  }

  const accel = (sim.vx - sim.prevVx) / Math.max(dt, 0.001);
  const targetLean = clamp(
    (gas ? 0.42 : 0) * (0.75 + stats.wheelie * 0.35) - (brake ? 0.22 : 0) + clamp(accel * 0.012, -0.15, 0.28),
    -0.34,
    0.68,
  );
  sim.lean += (targetLean - sim.lean) * (1 - Math.exp(-8 * dt));
  sim.prevVx = sim.vx;

  if (sim.fuel <= 0 && Math.hypot(sim.vx, sim.vy) < 0.75) {
    sim.dryTimer += dt;
    if (sim.dryTimer > 1.05) sim.outOfFuel = true;
  } else sim.dryTimer = 0;

  if (!sim.crashed && sim.x >= track.length - 6) {
    sim.finished = true;
    sim.endTimer = 0;
    sim.popups.push({ x: sim.x, y: sim.y + 1.6, text: "FINISH", life: 1.4 });
  }

  const nowAir = !sim.rear.grounded && !sim.front.grounded;
  const wasAir = !sim.wasRear && !sim.wasFront;
  if (!wasAir && nowAir && sim.vx > 4) {
    const lip = sample(track, sim.x - 0.6);
    if (!lip.void && lip.ty > 0.3) {
      const pop = (1.35 + stats.air * 0.5) * clamp((lip.ty - 0.22) * 2.2, 0, 1.5);
      sim.vy += pop + sim.vx * 0.035;
      sim.vr += 0.42 + stats.air * 0.18;
    }
  }

  const underLive = sample(track, sim.x);
  if (!underLive.void) sim.slope = Math.atan2(underLive.ty, underLive.tx);

  sim.wasRear = sim.rear.grounded;
  sim.wasFront = sim.front.grounded;
}

export function botInput(sim: Sim): Input {
  const rel = normAngle(sim.rot - sim.slope);
  const air = !sim.rear.grounded && !sim.front.grounded;
  if (air) {
    if (rel > 0.5) return { gas: false, brake: true };
    if (rel < -0.28) return { gas: true, brake: false };
    return { gas: true, brake: false };
  }
  if (rel > 0.46) return { gas: false, brake: true };
  if (rel < -0.32) return { gas: true, brake: false };
  return { gas: true, brake: false };
}
