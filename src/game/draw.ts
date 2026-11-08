import type { FrameId } from "./types";
import type { Sim } from "./sim";
import type { Track, TrackPoint } from "./types";
import { normalsFor, roadRuns } from "./terrain";

const PROP = "#cfc6b8";
const INK = "#141414";
const PAPER = "#f6f4ef";

function lum(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  if (!Number.isFinite(n)) return 0.5;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function worldOf(sim: { x: number; y: number; rot: number }, lx: number, ly: number) {
  const c = Math.cos(sim.rot);
  const s = Math.sin(sim.rot);
  return { x: sim.x + lx * c - ly * s, y: sim.y + lx * s + ly * c };
}

function strokeLocal(
  ctx: CanvasRenderingContext2D,
  sim: { x: number; y: number; rot: number },
  pts: [number, number][],
) {
  if (!pts.length) return;
  ctx.beginPath();
  const p0 = worldOf(sim, pts[0][0], pts[0][1]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < pts.length; i++) {
    const p = worldOf(sim, pts[i][0], pts[i][1]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function fillLocal(
  ctx: CanvasRenderingContext2D,
  sim: { x: number; y: number; rot: number },
  pts: [number, number][],
) {
  if (pts.length < 3) return;
  ctx.beginPath();
  const p0 = worldOf(sim, pts[0][0], pts[0][1]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < pts.length; i++) {
    const p = worldOf(sim, pts[i][0], pts[i][1]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawWheel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  spin: number,
  knobby: boolean,
  hub: string,
  ppm: number,
) {
  const px = (n: number) => n / ppm;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  if (knobby) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = px(2);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
      ctx.lineTo(Math.cos(a) * (r + 0.05), Math.sin(a) * (r + 0.05));
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = px(1.6);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16);
    ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
    ctx.moveTo(-Math.cos(a) * r * 0.16, -Math.sin(a) * r * 0.16);
    ctx.lineTo(-Math.cos(a) * r * 0.55, -Math.sin(a) * r * 0.55);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = hub;
  ctx.fill();
  ctx.restore();
}

const RIG: Record<FrameId, { seat: [number, number]; handle: [number, number]; peg: [number, number] }> = {
  scooter: { seat: [-0.18, 0.5], handle: [0.32, 0.78], peg: [0.08, 0.16] },
  cub: { seat: [-0.08, 0.52], handle: [0.4, 0.7], peg: [0.16, 0.12] },
  naked: { seat: [-0.06, 0.54], handle: [0.44, 0.68], peg: [0.18, 0.14] },
  dirt: { seat: [-0.02, 0.62], handle: [0.5, 0.86], peg: [0.2, 0.18] },
  sport: { seat: [0.02, 0.48], handle: [0.52, 0.56], peg: [0.24, 0.12] },
};

function drawRider(
  ctx: CanvasRenderingContext2D,
  sim: { x: number; y: number; rot: number; lean: number },
  frame: FrameId,
  ppm: number,
) {
  const rig = RIG[frame];
  const px = (n: number) => n / ppm;
  const hip = worldOf(sim, rig.seat[0], rig.seat[1]);
  const torso = sim.rot + sim.lean;
  const ux = -Math.sin(torso);
  const uy = Math.cos(torso);
  const shoulder = { x: hip.x + ux * 0.46, y: hip.y + uy * 0.46 };
  const head = { x: hip.x + ux * 0.68, y: hip.y + uy * 0.68 };
  const handle = worldOf(sim, rig.handle[0], rig.handle[1]);
  const peg = worldOf(sim, rig.peg[0], rig.peg[1]);
  const knee = {
    x: hip.x * 0.45 + peg.x * 0.55 + ux * 0.02,
    y: hip.y * 0.35 + peg.y * 0.65 + 0.16,
  };

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = px(4);
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(knee.x, knee.y);
  ctx.lineTo(peg.x, peg.y);
  ctx.stroke();
  ctx.lineWidth = px(5);
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(shoulder.x, shoulder.y);
  ctx.stroke();
  ctx.lineWidth = px(3.5);
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(handle.x, handle.y);
  ctx.stroke();

  ctx.fillStyle = "#f3f3f1";
  ctx.strokeStyle = INK;
  ctx.lineWidth = px(2);
  ctx.beginPath();
  ctx.arc(shoulder.x - ux * 0.02, shoulder.y - uy * 0.02, 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#efc2a4";
  ctx.beginPath();
  ctx.arc(head.x, head.y, 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 0.16, Math.PI * 0.15, Math.PI * 0.85);
  ctx.fill();
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  frame: FrameId,
  color: string,
  ppm: number,
) {
  const px = (n: number) => n / ppm;
  const edge = lum(color) < 0.22 ? PAPER : INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = px(frame === "sport" ? 6 : 5.5);

  if (frame === "sport") {
    fillLocal(ctx, sim, [
      [-0.7, 0.18],
      [-0.2, 0.22],
      [0.45, 0.28],
      [0.72, 0.42],
      [0.48, 0.52],
      [0.05, 0.42],
      [-0.45, 0.4],
      [-0.72, 0.28],
    ]);
    ctx.strokeStyle = edge;
    ctx.lineWidth = px(2);
    strokeLocal(ctx, sim, [
      [-0.7, 0.18],
      [0.45, 0.28],
      [0.72, 0.42],
      [0.48, 0.52],
      [-0.45, 0.4],
      [-0.7, 0.18],
    ]);
  } else if (frame === "scooter") {
    ctx.lineWidth = px(6);
    strokeLocal(ctx, sim, [
      [-0.55, 0.18],
      [0.05, 0.16],
      [0.22, 0.28],
    ]);
    fillLocal(ctx, sim, [
      [0.18, 0.22],
      [0.48, 0.78],
      [0.28, 0.86],
      [0.08, 0.4],
    ]);
    ctx.strokeStyle = edge;
    ctx.lineWidth = px(2);
    strokeLocal(ctx, sim, [
      [0.18, 0.22],
      [0.48, 0.78],
      [0.28, 0.86],
      [0.08, 0.4],
    ]);
  } else if (frame === "dirt") {
    strokeLocal(ctx, sim, [
      [-0.55, 0.28],
      [-0.05, 0.34],
      [0.28, 0.48],
    ]);
    fillLocal(ctx, sim, [
      [-0.15, 0.4],
      [0.12, 0.48],
      [0.18, 0.62],
      [-0.02, 0.58],
    ]);
  } else if (frame === "naked") {
    strokeLocal(ctx, sim, [
      [-0.62, 0.2],
      [-0.1, 0.26],
      [0.32, 0.36],
    ]);
    ctx.beginPath();
    const tank = worldOf(sim, 0.02, 0.48);
    ctx.ellipse(tank.x, tank.y, 0.22, 0.12, sim.rot, 0, Math.PI * 2);
    ctx.fill();
  } else {
    strokeLocal(ctx, sim, [
      [-0.62, 0.2],
      [-0.05, 0.24],
      [0.36, 0.4],
    ]);
    fillLocal(ctx, sim, [
      [-0.12, 0.32],
      [0.12, 0.36],
      [0.1, 0.5],
      [-0.16, 0.46],
    ]);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = px(4.5);
  const swing = worldOf(sim, frame === "scooter" ? -0.2 : -0.12, 0.16);
  ctx.beginPath();
  ctx.moveTo(swing.x, swing.y);
  ctx.lineTo(sim.rear.x, sim.rear.y);
  ctx.stroke();

  const forkTop = worldOf(sim, RIG[frame].handle[0] - 0.02, RIG[frame].handle[1] - 0.08);
  ctx.beginPath();
  ctx.moveTo(forkTop.x, forkTop.y);
  ctx.lineTo(sim.front.x, sim.front.y);
  ctx.stroke();

  const barL = worldOf(sim, RIG[frame].handle[0] - 0.16, RIG[frame].handle[1] + 0.02);
  const barR = worldOf(sim, RIG[frame].handle[0] + 0.08, RIG[frame].handle[1] + 0.06);
  ctx.lineWidth = px(3.5);
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(barL.x, barL.y);
  ctx.lineTo(forkTop.x, forkTop.y);
  ctx.lineTo(barR.x, barR.y);
  ctx.stroke();
}

export function drawBike(ctx: CanvasRenderingContext2D, sim: Sim, frame: FrameId, color: string, ppm: number) {
  const knobby = frame === "dirt";
  if (sim.wheelOff !== "rear") drawWheel(ctx, sim.rear.x, sim.rear.y, sim.wheelR, sim.rear.spin, knobby, color, ppm);
  if (sim.wheelOff !== "front") drawWheel(ctx, sim.front.x, sim.front.y, sim.wheelR, sim.front.spin, knobby, color, ppm);
  drawFrame(ctx, sim, frame, color, ppm);
  if (!sim.rider) drawRider(ctx, sim, frame, ppm);
  if (sim.boost > 0.05 && sim.wheelOff !== "rear") {
    const c = Math.cos(sim.rot);
    const s = Math.sin(sim.rot);
    const flick = 0.45 + Math.random() * 0.55;
    const bx = sim.x - c * 1.05;
    const by = sim.y - s * 1.05;
    ctx.fillStyle = "#2f6fed";
    ctx.beginPath();
    ctx.moveTo(bx + -s * 0.14, by + c * 0.14);
    ctx.lineTo(bx - c * flick, by - s * flick);
    ctx.lineTo(bx + s * 0.14, by - c * 0.14);
    ctx.fill();
    ctx.fillStyle = "#e7f0ff";
    ctx.beginPath();
    ctx.moveTo(bx + -s * 0.07, by + c * 0.07);
    ctx.lineTo(bx - c * flick * 0.5, by - s * flick * 0.5);
    ctx.lineTo(bx + s * 0.07, by - c * 0.07);
    ctx.fill();
  }
}

function drawProp(ctx: CanvasRenderingContext2D, kind: Track["props"][number]["kind"], x: number, y: number, s: number) {
  ctx.fillStyle = PROP;
  if (kind === "palm") {
    ctx.fillRect(x - 0.06 * s, y, 0.12 * s, 1.7 * s);
    ctx.beginPath();
    ctx.ellipse(x, y + 1.75 * s, 0.72 * s, 0.26 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + 1.55 * s, 0.28 * s, 0.55 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "block") {
    const h = 1.4 * s;
    ctx.fillRect(x, y, 0.7 * s, h);
    ctx.fillRect(x + 0.18 * s, y + h * 0.55, 0.16 * s, 0.16 * s);
  } else if (kind === "tower") {
    ctx.fillRect(x, y, 0.55 * s, 2.4 * s);
    ctx.fillRect(x - 0.08 * s, y + 2.4 * s, 0.7 * s, 0.12 * s);
  } else if (kind === "pine") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.55 * s, y);
    ctx.lineTo(x + 0.28 * s, y + 2.1 * s);
    ctx.fill();
  } else {
    ctx.fillRect(x + 0.18 * s, y, 0.1 * s, 1.3 * s);
    ctx.beginPath();
    ctx.arc(x + 0.23 * s, y + 1.55 * s, 0.38 * s, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 0.23 * s, y + 1.85 * s, 0.2 * s, Math.PI, 0);
    ctx.fill();
  }
}

function ribbon(ctx: CanvasRenderingContext2D, run: TrackPoint[], th: number) {
  if (run.length < 2) return;
  const norms = normalsFor(run);
  ctx.beginPath();
  ctx.moveTo(run[0].x, run[0].y);
  for (let i = 1; i < run.length; i++) ctx.lineTo(run[i].x, run[i].y);
  for (let i = run.length - 1; i >= 0; i--) {
    const n = norms[i];
    ctx.lineTo(run[i].x - n.nx * th, run[i].y - n.ny * th);
  }
  ctx.closePath();
  ctx.fill();
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  dpr: number,
  sim: Sim,
  track: Track,
  camX: number,
  camY: number,
  ppm: number,
  color: string,
  frame: FrameId,
  reduce: boolean,
) {
  const shake = reduce ? 0 : sim.shake;
  const sx = shake > 0.02 ? (Math.random() - 0.5) * shake * 14 : 0;
  const sy = shake > 0.02 ? (Math.random() - 0.5) * shake * 10 : 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.translate(sx, sy);

  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const sunX = cssW - 48;
  const sunY = 42;
  ctx.arc(sunX, sunY, track.world === "moscow" ? 10 : 16, 0, Math.PI * 2);
  ctx.stroke();
  if (track.world === "lagos") {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sunX + Math.cos(a) * 20, sunY + Math.sin(a) * 20);
      ctx.lineTo(sunX + Math.cos(a) * 28, sunY + Math.sin(a) * 28);
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.translate(cssW / 2, cssH * 0.66);
  ctx.scale(ppm, -ppm);
  ctx.translate(-camX, -camY);

  const x0 = camX - cssW / ppm;
  const x1 = camX + cssW / ppm;
  for (const prop of track.props) {
    if (prop.x < x0 - 4 || prop.x > x1 + 4) continue;
    drawProp(ctx, prop.kind, prop.x, prop.y, prop.s);
  }

  ctx.fillStyle = INK;
  for (const run of roadRuns(track.points)) {
    if (run[run.length - 1].x < x0 - 5 || run[0].x > x1 + 5) continue;
    ribbon(ctx, run, 0.78);
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.2 / ppm;
  ctx.setLineDash([0.85, 0.65]);
  for (const run of roadRuns(track.points)) {
    if (run.length < 2) continue;
    if (run[run.length - 1].x < x0 - 5 || run[0].x > x1 + 5) continue;
    const norms = normalsFor(run);
    ctx.beginPath();
    const p0 = run[0];
    const n0 = norms[0];
    ctx.moveTo(p0.x - n0.nx * 0.28, p0.y - n0.ny * 0.28);
    for (let i = 1; i < run.length; i++) {
      const n = norms[i];
      ctx.lineTo(run[i].x - n.nx * 0.28, run[i].y - n.ny * 0.28);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const b of track.barriers) {
    if (b.x < x0 - 2 || b.x > x1 + 2) continue;
    ctx.fillStyle = INK;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 3; i++) ctx.fillRect(b.x, b.y + 0.18 + i * 0.32, b.w, 0.08);
  }

  const t = performance.now() / 1000;
  for (const item of track.pickups) {
    if (item.taken || item.x < x0 - 1 || item.x > x1 + 2) continue;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(item.x, item.gy + 0.1, 0.09, 0, Math.PI * 2);
    ctx.fill();
    if (item.kind === "fuel") {
      ctx.fillStyle = "#e23b2a";
      ctx.fillRect(item.x - 0.16, item.y - 0.05, 0.32, 0.42);
      ctx.fillStyle = INK;
      ctx.fillRect(item.x - 0.07, item.y + 0.34, 0.14, 0.1);
      ctx.fillStyle = PAPER;
      ctx.fillRect(item.x - 0.1, item.y + 0.08, 0.2, 0.08);
    } else if (item.kind === "ozone") {
      const pulse = 1 + Math.sin(t * 7 + item.x) * 0.06;
      ctx.save();
      ctx.translate(item.x, item.y + 0.16);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#2f6fed";
      ctx.fillRect(-0.2, -0.08, 0.4, 0.52);
      ctx.fillStyle = "#9ec0ff";
      ctx.fillRect(-0.08, 0.4, 0.16, 0.1);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(0.05, 0.34);
      ctx.lineTo(-0.1, 0.14);
      ctx.lineTo(0.02, 0.14);
      ctx.lineTo(-0.05, -0.04);
      ctx.lineTo(0.12, 0.16);
      ctx.lineTo(0.0, 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      const r = item.kind === "stack" ? 0.38 : 0.26;
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(t * 1.6 + item.x);
      ctx.fillStyle = item.kind === "stack" ? "#e2b113" : "#d9a30f";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a6408";
      ctx.fillRect(-0.045, -r * 0.55, 0.09, r * 1.1);
      ctx.restore();
    }
  }

  const fx = track.length - 8;
  if (fx > x0 - 2 && fx < x1 + 2) {
    const ground = track.points[track.points.length - 1];
    const gy = ground ? ground.y : 0;
    ctx.fillStyle = INK;
    ctx.fillRect(fx, gy, 0.1, 2.3);
    ctx.fillRect(fx + 1.4, gy, 0.1, 2.3);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? INK : "#ffffff";
        ctx.fillRect(fx + 0.1 + col * 0.35, gy + 1.35 + row * 0.22, 0.35, 0.22);
      }
    }
  }

  for (const d of sim.dust) {
    ctx.fillStyle = d.blue ? `rgba(47,111,237,${Math.max(0, d.life)})` : `rgba(90,90,90,${Math.max(0, d.life)})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.s, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const s of sim.shards) {
    if (s.life <= 0) continue;
    ctx.fillStyle = INK;
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }

  drawBike(ctx, sim, frame, color, ppm);

  if (sim.loose) {
    drawWheel(ctx, sim.loose.x, sim.loose.y, sim.wheelR, sim.loose.rot, frame === "dirt", color, ppm);
  }
  if (sim.rider) {
    ctx.save();
    ctx.translate(sim.rider.x, sim.rider.y);
    ctx.rotate(sim.rider.rot);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4 / ppm;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0.1, 0.45);
    ctx.moveTo(0, 0.2);
    ctx.lineTo(-0.28, 0.05);
    ctx.moveTo(0, 0.2);
    ctx.lineTo(0.28, 0.12);
    ctx.stroke();
    ctx.fillStyle = "#efc2a4";
    ctx.beginPath();
    ctx.arc(0.05, 0.62, 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(sx, sy);
  ctx.fillStyle = INK;
  ctx.font = `700 ${Math.max(14, cssW * 0.035)}px Unbounded, Manrope, sans-serif`;
  ctx.textAlign = "center";
  for (const p of sim.popups) {
    if (p.life <= 0) continue;
    const alpha = Math.min(1, p.life * 2);
    const screenX = cssW / 2 + (p.x - camX) * ppm;
    const screenY = cssH * 0.66 - (p.y - camY) * ppm - (1.2 - Math.min(1.2, p.life)) * 18;
    ctx.globalAlpha = alpha;
    ctx.fillText(p.text, screenX, screenY);
  }
  ctx.restore();

  if ((Math.abs(sim.vx) > 16 || sim.boost > 0.05) && !reduce) {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const boost = sim.boost > 0.05;
    ctx.strokeStyle = boost ? "rgba(47,111,237,0.55)" : "rgba(20,20,20,0.35)";
    ctx.lineWidth = boost ? 3 : 2;
    const lines = boost ? 8 : 5;
    for (let i = 0; i < lines; i++) {
      const y = (cssH * (i + 1)) / (lines + 1);
      const len = (boost ? 28 : 18) + (i % 3) * 12;
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(12 + len, y);
      ctx.stroke();
    }
    if (boost) {
      ctx.fillStyle = "rgba(47,111,237,0.07)";
      ctx.fillRect(0, 0, cssW, cssH);
    }
    ctx.restore();
  }
}

export function drawPreview(
  ctx: CanvasRenderingContext2D,
  pw: number,
  ph: number,
  dpr: number,
  frame: FrameId,
  color: string,
  time: number,
) {
  const w = pw / dpr;
  const h = ph / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const ppm = Math.min(w / 7.2, h / 3.6);
  ctx.save();
  ctx.translate(w * 0.52, h * 0.78);
  ctx.scale(ppm, -ppm);
  ctx.fillStyle = INK;
  ctx.fillRect(-12, -0.74, 24, 0.74);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2 / ppm;
  ctx.setLineDash([0.7, 0.5]);
  ctx.beginPath();
  ctx.moveTo(-8, -0.28);
  ctx.lineTo(8, -0.28);
  ctx.stroke();
  ctx.setLineDash([]);
  const pulse = Math.max(0, Math.sin(time * 1.5));
  const wheelR = frame === "dirt" ? 0.42 : frame === "scooter" ? 0.34 : 0.36;
  const pose = {
    x: 0,
    y: wheelR + 0.5,
    vx: 0,
    vy: 0,
    rot: pulse * 0.1,
    vr: 0,
    lean: pulse * 0.55,
    prevVx: 0,
    wheelR,
    rear: { x: -0.78, y: wheelR, spin: time * 6, grounded: true, compression: 0 },
    front: { x: 0.82, y: wheelR, spin: time * 6, grounded: true, compression: 0 },
    wasRear: true,
    wasFront: true,
    fuel: 1,
    fuelMax: 1,
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
  } as Sim;
  drawBike(ctx, pose, frame, color, ppm);
  ctx.restore();
}
