import type { Barrier, Pickup, Prop, PropKind, Surface, Track, TrackPoint, WorldId } from "./types";
import { roadLength } from "./content";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(world: string, road: number) {
  let h = 2166136261;
  const s = `${world}:${road}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Cursor = { x: number; y: number };

function push(points: TrackPoint[], c: Cursor, x: number, y: number, extra?: Partial<TrackPoint>) {
  const nx = x <= c.x + 0.05 ? c.x + 0.05 : x;
  points.push({ x: nx, y, ...extra });
  c.x = nx;
  c.y = y;
}

function flat(points: TrackPoint[], c: Cursor, len: number) {
  const steps = Math.max(1, Math.round(len / 2));
  for (let i = 1; i <= steps; i++) push(points, c, c.x + len / steps, c.y);
}

function hills(points: TrackPoint[], c: Cursor, len: number, amp: number, waves: number) {
  const safeAmp = Math.min(amp, (len / (waves * 2 * Math.PI)) * 0.48);
  const steps = Math.max(4, Math.round(len / 2));
  const x0 = c.x;
  const y0 = c.y;
  const stepX = len / steps;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const y = y0 + Math.sin(t * Math.PI * 2 * waves) * safeAmp;
    push(points, c, x0 + stepX * i, y);
  }
}

function ramp(points: TrackPoint[], c: Cursor, len: number, height: number, maxRise: number) {
  const h = Math.min(height, len * maxRise);
  const steps = Math.max(3, Math.round(len / 2));
  const x0 = c.x;
  const y0 = c.y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = 1 - Math.cos((t * Math.PI) / 2);
    push(points, c, x0 + len * t, y0 + h * e);
  }
  points[points.length - 1].tag = "lip";
}

function drop(points: TrackPoint[], c: Cursor, len: number, height: number) {
  const h = Math.min(height, len * 0.85);
  const steps = Math.max(3, Math.round(len / 2));
  const x0 = c.x;
  const y0 = c.y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const s = (1 - Math.cos(t * Math.PI)) / 2;
    push(points, c, x0 + len * t, y0 - h * s);
  }
}

function gap(points: TrackPoint[], c: Cursor, width: number, landY: number) {
  push(points, c, c.x + Math.max(1.6, width), landY, { gap: true });
}

function relax(points: TrackPoint[], c: Cursor) {
  if (Math.abs(c.y) < 1.4) return;
  const target = c.y * 0.4;
  const delta = c.y - target;
  const len = Math.min(48, Math.abs(delta) * 14 + 12);
  drop(points, c, len, delta > 0 ? delta : 0);
  if (delta < 0) {
    ramp(points, c, len, -delta, 0.4);
    if (points[points.length - 1]) delete points[points.length - 1].tag;
  }
}

export function samplePoints(points: TrackPoint[], x: number): Surface {
  const n = points.length;
  if (n === 0) return { y: 0, nx: 0, ny: 1, tx: 1, ty: 0, void: false };
  if (x <= points[0].x) return { y: points[0].y, nx: 0, ny: 1, tx: 1, ty: 0, void: false };
  const last = points[n - 1];
  if (x >= last.x) return { y: last.y, nx: 0, ny: 1, tx: 1, ty: 0, void: false };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x <= x) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  if (b.gap) return { y: -80, nx: 0, ny: 1, tx: 1, ty: 0, void: true };
  const dx = b.x - a.x || 1;
  const dy = b.y - a.y;
  const t = (x - a.x) / dx;
  const y = a.y + dy * t;
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  return { y, nx: -ty, ny: tx, tx, ty, void: false };
}

export function sample(track: Track, x: number): Surface {
  return samplePoints(track.points, x);
}

function pointNormal(pts: TrackPoint[], i: number) {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  if (b.gap || a.gap) {
    const prev = pts[Math.max(0, i - 1)];
    const dx = pts[i].x - prev.x || 1;
    const dy = pts[i].y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return { nx: -dy / len, ny: dx / len };
  }
  const dx = b.x - a.x || 1;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}

export function roadRuns(points: TrackPoint[]): TrackPoint[][] {
  const runs: TrackPoint[][] = [];
  let run: TrackPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.gap) {
      if (run.length > 1) runs.push(run);
      run = [p];
      continue;
    }
    run.push(p);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

export function normalsFor(points: TrackPoint[]) {
  return points.map((_, i) => pointNormal(points, i));
}

export function generateTrack(world: WorldId, road: number): Track {
  const rng = mulberry32(seedFor(world, road));
  const diff = (road - 1) / 9;
  const length = roadLength(world, road);
  const ampK = world === "lagos" ? 1.28 : world === "moscow" ? 1.12 : 1;
  const points: TrackPoint[] = [{ x: 0, y: 0 }];
  const c: Cursor = { x: 0, y: 0 };
  const marks: { x: number; kind: "ozone" | "wall"; y?: number }[] = [];

  flat(points, c, 42);

  const beats: { at: number; type: "flip" | "wall" }[] = [
    { at: length * 0.2, type: "flip" },
    { at: length * 0.46, type: road >= 4 ? "wall" : "flip" },
    { at: length * 0.7, type: road >= 6 ? "wall" : "flip" },
  ];
  let beatI = 0;

  const flipLine = (strength: number) => {
    const s = Math.max(0.08, Math.min(1, strength));
    flat(points, c, 8);
    marks.push({ x: c.x + 7, kind: "ozone" });
    flat(points, c, 16);
    const h = 2.15 + s * 3.5;
    ramp(points, c, 12 + s * 3, h, 0.9);
    if (s > 0.34) {
      gap(points, c, 2.4 + s * 6.5, c.y - (1.1 + s * 2.1));
      drop(points, c, 12 + s * 8, 0.8 + s * 1.4);
    } else {
      drop(points, c, 18, h * 0.82);
    }
    flat(points, c, 16 + s * 8);
  };

  const wallLine = (strength: number) => {
    const s = Math.max(0.2, Math.min(1, strength));
    flat(points, c, 8);
    marks.push({ x: c.x + 6, kind: "ozone" });
    flat(points, c, 14);
    const h = 2.3 + s * 1.6;
    ramp(points, c, 10, h, 0.85);
    const lipX = c.x;
    const lipY = c.y;
    marks.push({ x: lipX + 3.1, kind: "wall", y: lipY - 0.35 });
    gap(points, c, 7 + s * 2.2, lipY - (1.5 + s * 0.7));
    flat(points, c, 18);
  };

  let guard = 0;
  while (c.x < length - 56 && guard++ < 90) {
    const remain = length - 56 - c.x;
    if (remain < 26) break;
    if (beatI < beats.length && c.x >= beats[beatI].at && remain > 96) {
      const strength = 0.1 + diff * 0.72 + beatI * 0.16 + (world === "moscow" ? 0.08 : 0);
      if (beats[beatI].type === "wall") wallLine(strength);
      else flipLine(strength);
      beatI++;
      continue;
    }
    if (Math.abs(c.y) > 7) {
      relax(points, c);
      continue;
    }
    const roll = rng();
    if (road <= 2) {
      if (roll < 0.55) hills(points, c, 40 + rng() * 18, (0.9 + diff) * 1.05 * ampK, 1);
      else if (roll < 0.8) {
        const h = 1.5 + rng() * 0.9;
        ramp(points, c, 12 + rng() * 3, h, 0.38);
        drop(points, c, 14 + rng() * 5, h * 0.9);
      } else flat(points, c, 16 + rng() * 12);
      continue;
    }

    const jumpChance = 0.18 + diff * 0.16;
    if (roll < jumpChance) {
      const h = Math.min(2.4 + diff * 2.8 + rng() * 1.2, 6.5);
      ramp(points, c, 12 + rng() * 4, h, road <= 4 ? 0.58 : 0.72);
      const gapW = 2 + diff * 4.2;
      gap(points, c, gapW, c.y - (0.7 + diff * 1.2));
      flat(points, c, 14 + rng() * 8);
    } else if (roll < 0.72) {
      hills(points, c, 36 + rng() * 24, (1.2 + diff * 1.35) * ampK, rng() < 0.55 ? 1 : 2);
    } else if (roll < 0.88) {
      const h = 1.8 + diff * 1.6;
      ramp(points, c, 14, h, 0.5);
      drop(points, c, 12 + rng() * 6, h * 0.8 + rng() * 0.4);
    } else flat(points, c, 14 + rng() * 14);
  }

  if (Math.abs(c.y) > 2) relax(points, c);
  flat(points, c, Math.max(40, length - c.x));

  const clean: TrackPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x > clean[clean.length - 1].x + 0.04) clean.push(p);
  }

  const endX = clean[clean.length - 1].x;
  const barriers: Barrier[] = [];
  const pickups: Pickup[] = [];

  const placeOnRoad = (x0: number) => {
    let x = x0;
    let s = samplePoints(clean, x);
    for (let k = 0; k < 24 && (s.void || x < 8); k++) {
      x -= 1.4;
      s = samplePoints(clean, x);
    }
    return { x, s };
  };

  for (const m of marks) {
    if (m.kind === "wall") {
      const base = m.y ?? 0;
      barriers.push({ x: m.x - 0.3, y: base, w: 0.74, h: 1.55 + diff * 0.4 });
      continue;
    }
    const spot = placeOnRoad(m.x);
    if (spot.s.void) continue;
    pickups.push({ x: spot.x, y: spot.s.y + 1.95, gy: spot.s.y, kind: "ozone", value: 0, taken: false });
  }

  const fuelSpacing = Math.max(92, 136 - road * 3 - (world === "manila" ? 10 : 0));
  let nextFuel = 54;
  let nextCoin = 18;
  for (let x = 16; x < endX - 14; x += 2) {
    const s = samplePoints(clean, x);
    if (s.void) continue;
    if (x >= nextCoin) {
      const blocked = barriers.some((b) => x > b.x - 1.2 && x < b.x + b.w + 1.6);
      const oz = pickups.some((p) => p.kind === "ozone" && Math.abs(p.x - x) < 2.2);
      if (!blocked && !oz) {
        pickups.push({ x, y: s.y + 1.35, gy: s.y, kind: "coin", value: 1, taken: false });
      }
      nextCoin = x + 7 + Math.floor(rng() * 4);
    }
    if (x >= nextFuel) {
      const oz = pickups.some((p) => p.kind === "ozone" && Math.abs(p.x - (x + 1.5)) < 8);
      if (!oz) pickups.push({ x: x + 1.5, y: s.y + 1.75, gy: s.y, kind: "fuel", value: 0, taken: false });
      nextFuel = x + fuelSpacing;
    }
  }

  for (const p of clean) {
    if (p.tag !== "lip") continue;
    for (let k = 0; k < 6; k++) {
      const x = p.x + 1.2 + k * 1.55;
      const s = samplePoints(clean, x);
      const arc = Math.sin((k / 5) * Math.PI) * 2.6;
      const blocked = barriers.some((b) => Math.abs(b.x - x) < 1.8);
      if (blocked) continue;
      pickups.push({
        x,
        y: p.y + 1.7 + arc,
        gy: s.void ? p.y : s.y,
        kind: k === 3 ? "stack" : "coin",
        value: k === 3 ? 5 : 1,
        taken: false,
      });
    }
  }

  const tailFuel = pickups.some((p) => p.kind === "fuel" && p.x > endX - 180);
  if (!tailFuel) {
    const x = endX - 70;
    const s = samplePoints(clean, x);
    if (!s.void) pickups.push({ x, y: s.y + 1.75, gy: s.y, kind: "fuel", value: 0, taken: false });
  }

  const props: Prop[] = [];
  const kinds: PropKind[] =
    world === "manila"
      ? ["palm", "palm", "block", "palm"]
      : world === "lagos"
        ? ["tower", "block", "tower", "block"]
        : ["pine", "dome", "pine", "block"];
  for (let x = 8; x < endX; x += 18 + rng() * 16) {
    const s = samplePoints(clean, x);
    if (s.void) continue;
    if (barriers.some((b) => Math.abs(b.x - x) < 2)) continue;
    props.push({
      x,
      y: s.y,
      kind: kinds[Math.floor(rng() * kinds.length)],
      s: 0.75 + rng() * 0.7,
    });
  }

  return { world, road, points: clean, length: endX, pickups, barriers, props };
}