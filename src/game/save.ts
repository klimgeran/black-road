import type { SaveData, WorldId } from "./types";
import { WORLDS } from "./content";

const KEY = "chernaya-doroga-v1";

export function defaultSave(): SaveData {
  return {
    version: 1,
    coins: 0,
    bikeId: "barangay",
    color: "signal",
    owned: ["barangay"],
    upgrades: { engine: 0, tank: 0, grip: 0, frame: 0, suspension: 0 },
    cleared: {},
    best: {},
    meters: 0,
    flips: 0,
    sound: true,
  };
}

export function loadSave(): SaveData {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<SaveData>;
    if (!p || p.version !== 1) return base;
    const upgrades = { ...base.upgrades, ...(p.upgrades ?? {}) };
    for (const k of Object.keys(upgrades) as (keyof typeof upgrades)[]) {
      const n = upgrades[k];
      upgrades[k] = Number.isFinite(n) ? Math.max(0, Math.min(5, Math.floor(n))) : 0;
    }
    return {
      ...base,
      coins: Number.isFinite(p.coins) ? Math.max(0, Math.floor(p.coins as number)) : 0,
      bikeId: typeof p.bikeId === "string" ? p.bikeId : base.bikeId,
      color: typeof p.color === "string" ? p.color : base.color,
      owned: Array.isArray(p.owned) && p.owned.length > 0 ? p.owned.filter((id) => typeof id === "string") : base.owned,
      upgrades,
      cleared: { ...base.cleared, ...(p.cleared ?? {}) },
      best: { ...(p.best ?? {}) },
      meters: Number.isFinite(p.meters) ? (p.meters as number) : 0,
      flips: Number.isFinite(p.flips) ? (p.flips as number) : 0,
      sound: p.sound !== false,
    };
  } catch {
    return base;
  }
}

export function writeSave(save: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode */
  }
}

export function worldUnlocked(save: SaveData, world: WorldId): boolean {
  const def = WORLDS.find((w) => w.id === world);
  if (!def || !def.unlock) return true;
  return (save.cleared[def.unlock.world] ?? 0) >= def.unlock.road;
}

export function roadUnlocked(save: SaveData, world: WorldId, road: number): boolean {
  if (!worldUnlocked(save, world)) return false;
  if (road <= 1) return true;
  return (save.cleared[world] ?? 0) >= road - 1;
}

export function nextPlayable(save: SaveData): { world: WorldId; road: number } {
  for (const w of WORLDS) {
    if (!worldUnlocked(save, w.id)) continue;
    const done = save.cleared[w.id] ?? 0;
    if (done < 10) return { world: w.id, road: done + 1 };
  }
  return { world: "moscow", road: 10 };
}

export function bestKey(world: WorldId, road: number) {
  return `${world}-${road}`;
}
