import type { FrameId, Stats, Upgrades, WorldId } from "./types";

export type BikeSpec = {
  id: string;
  name: string;
  tag: string;
  price: number;
  engine: number;
  top: number;
  tank: number;
  drink: number;
  grip: number;
  air: number;
  wheelie: number;
  frame: FrameId;
};

export type Paint = { id: string; name: string; hex: string };

export const PAINTS: Paint[] = [
  { id: "signal", name: "Signal", hex: "#e23b2a" },
  { id: "jeep", name: "Jeepney", hex: "#f0c400" },
  { id: "bay", name: "Bay", hex: "#1f6feb" },
  { id: "palm", name: "Palm", hex: "#1f9d55" },
  { id: "mango", name: "Mango", hex: "#ef7a2a" },
  { id: "neon", name: "Neon", hex: "#e24b8a" },
  { id: "paper", name: "Chalk", hex: "#f4f1ea" },
  { id: "night", name: "Night", hex: "#1a1a1a" },
];

export const BIKES: BikeSpec[] = [
  {
    id: "barangay",
    name: "Barangay",
    tag: "Scooter. Sips fuel and starts easy.",
    price: 0,
    engine: 11.5,
    top: 19,
    tank: 1.2,
    drink: 4.2,
    grip: 1,
    air: 0.85,
    wheelie: 0.55,
    frame: "scooter",
  },
  {
    id: "cub",
    name: "Cub",
    tag: "City bike. Smooth gas for every day.",
    price: 280,
    engine: 13,
    top: 22,
    tank: 1.05,
    drink: 5,
    grip: 1.05,
    air: 1,
    wheelie: 0.75,
    frame: "cub",
  },
  {
    id: "night",
    name: "Night",
    tag: "Naked. Faster, and the tank runs mean.",
    price: 760,
    engine: 15,
    top: 26,
    tank: 0.96,
    drink: 6.1,
    grip: 1.08,
    air: 1.15,
    wheelie: 1,
    frame: "naked",
  },
  {
    id: "mud",
    name: "Mud",
    tag: "Enduro. Forgives landings and loves ramps.",
    price: 1500,
    engine: 13.6,
    top: 23,
    tank: 1.08,
    drink: 5.2,
    grip: 1.32,
    air: 1.45,
    wheelie: 0.9,
    frame: "dirt",
  },
  {
    id: "rocket",
    name: "Rocket",
    tag: "Sport. Top speed and cleaner flips.",
    price: 2800,
    engine: 17.5,
    top: 31,
    tank: 0.84,
    drink: 7.4,
    grip: 1.12,
    air: 1.35,
    wheelie: 1.25,
    frame: "sport",
  },
];

export const ROAD_LENGTHS = [650, 850, 1000, 1200, 1400, 1550, 1750, 1950, 2200, 2500];

export const ROAD_NAMES: Record<WorldId, string[]> = {
  manila: ["Bay", "Boardwalk", "Jeepney", "Intramuros", "Makati", "Harbor", "Pasig", "BGC", "MOA", "Sunset"],
  lagos: ["Island", "Bridge", "Market", "Port", "Heat", "Lagoon", "Night", "Overpass", "Atlantic", "Ocean"],
  moscow: ["Embankment", "Ring", "Pines", "Bridge", "Hills", "River", "Domes", "Descent", "Loop", "Orbital"],
};

export type WorldDef = {
  id: WorldId;
  city: string;
  country: string;
  blurb: string;
  index: string;
  unlock: { world: WorldId; road: number } | null;
};

export const WORLDS: WorldDef[] = [
  {
    id: "manila",
    city: "Manila",
    country: "Philippines",
    blurb: "Palms, the bay, and your first ramps.",
    index: "01",
    unlock: null,
  },
  {
    id: "lagos",
    city: "Lagos",
    country: "Nigeria",
    blurb: "Steeper hills and a tighter city.",
    index: "02",
    unlock: { world: "manila", road: 3 },
  },
  {
    id: "moscow",
    city: "Moscow",
    country: "Russia",
    blurb: "Long descents and wide gaps.",
    index: "03",
    unlock: { world: "lagos", road: 3 },
  },
];

export const UPGRADE_META: {
  key: keyof Upgrades;
  name: string;
  hint: string;
}[] = [
  { key: "engine", name: "Engine", hint: "Quicker launch, higher top speed" },
  { key: "tank", name: "Tank", hint: "More fuel, less thirst" },
  { key: "grip", name: "Tires", hint: "Holds hills and hard throttle" },
  { key: "frame", name: "Frame", hint: "Survives harder landings" },
  { key: "suspension", name: "Suspension", hint: "Softer landings, snappier flips" },
];

const COSTS = [80, 180, 380, 760, 1400];

export function upgradeCost(level: number): number {
  return COSTS[level] ?? 0;
}

export function maxUpgrade(): number {
  return COSTS.length;
}

export function getBike(id: string): BikeSpec {
  return BIKES.find((b) => b.id === id) ?? BIKES[0];
}

export function getPaint(id: string): Paint {
  return PAINTS.find((p) => p.id === id) ?? PAINTS[0];
}

export function getWorld(id: WorldId): WorldDef {
  return WORLDS.find((w) => w.id === id) ?? WORLDS[0];
}

export function roadLength(world: WorldId, road: number): number {
  const bonus = world === "lagos" ? 120 : world === "moscow" ? 220 : 0;
  return ROAD_LENGTHS[Math.max(0, Math.min(9, road - 1))] + bonus;
}

export function computeStats(bike: BikeSpec, up: Upgrades): Stats {
  const eng = up.engine;
  const tank = up.tank;
  const grip = up.grip;
  const frame = up.frame;
  const sus = up.suspension;
  return {
    engine: bike.engine * (1 + eng * 0.14),
    maxSpeed: bike.top * (1 + eng * 0.06),
    fuelMax: 100 * bike.tank * (1 + tank * 0.18),
    drink: bike.drink * (1 - tank * 0.055),
    grip: bike.grip * (1 + grip * 0.16),
    air: bike.air * (1 + sus * 0.1),
    crash: 15.5 + frame * 2.2 + sus * 1.15 + (bike.frame === "dirt" ? 1.6 : 0),
    wheelR: bike.frame === "dirt" ? 0.42 : bike.frame === "scooter" ? 0.34 : 0.36,
    wheelie: bike.wheelie,
    suspension: 1 + sus * 0.18,
    frame: bike.frame,
  };
}
