import { computeStats, getBike } from "./content";
import { botInput, createSim, stepSim } from "./sim";
import { generateTrack } from "./terrain";
import type { Upgrades, WorldId } from "./types";

const ZERO: Upgrades = { engine: 0, tank: 0, grip: 0, frame: 0, suspension: 0 };

export function runSimCheck() {
  const out: {
    world: WorldId;
    road: number;
    t: number;
    x: number;
    len: number;
    crashed: boolean;
    reason: string;
    finished: boolean;
    fuel: boolean;
    y: number;
    minY: number;
    speed2: number;
  }[] = [];
  const cases: [WorldId, number][] = [
    ["manila", 1],
    ["manila", 3],
    ["manila", 6],
    ["lagos", 1],
    ["moscow", 4],
  ];
  for (const [world, road] of cases) {
    const track = generateTrack(world, road);
    const stats = computeStats(getBike("barangay"), ZERO);
    const sim = createSim(track, stats);
    let t = 0;
    const dt = 1 / 120;
    let minY = sim.y;
    let speed2 = 0;
    while (t < 100 && !sim.crashed && !sim.finished && !sim.outOfFuel) {
      stepSim(sim, botInput(sim), track, stats, dt);
      t += dt;
      if (sim.y < minY) minY = sim.y;
      if (t >= 2 && speed2 === 0) speed2 = sim.vx;
    }
    out.push({
      world,
      road,
      t: Math.round(t * 10) / 10,
      x: Math.round(sim.x),
      len: Math.round(track.length),
      crashed: sim.crashed,
      reason: sim.crashReason,
      finished: sim.finished,
      fuel: sim.outOfFuel,
      y: Math.round(sim.y * 10) / 10,
      minY: Math.round(minY * 10) / 10,
      speed2: Math.round(speed2 * 10) / 10,
    });
  }
  return out;
}
