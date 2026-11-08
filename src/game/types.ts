export type WorldId = "manila" | "lagos" | "moscow";

export type FrameId = "scooter" | "cub" | "naked" | "dirt" | "sport";

export type TrackPoint = {
  x: number;
  y: number;
  gap?: boolean;
  tag?: "lip";
};

export type PickupKind = "coin" | "stack" | "fuel" | "ozone";

export type Pickup = {
  x: number;
  y: number;
  gy: number;
  kind: PickupKind;
  value: number;
  taken: boolean;
};

export type Barrier = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PropKind = "palm" | "block" | "tower" | "pine" | "dome";

export type Prop = {
  x: number;
  y: number;
  kind: PropKind;
  s: number;
};

export type Track = {
  world: WorldId;
  road: number;
  points: TrackPoint[];
  length: number;
  pickups: Pickup[];
  barriers: Barrier[];
  props: Prop[];
};

export type Surface = {
  y: number;
  nx: number;
  ny: number;
  tx: number;
  ty: number;
  void: boolean;
};

export type Upgrades = {
  engine: number;
  tank: number;
  grip: number;
  frame: number;
  suspension: number;
};

export type SaveData = {
  version: 1;
  coins: number;
  bikeId: string;
  color: string;
  owned: string[];
  upgrades: Upgrades;
  cleared: Partial<Record<WorldId, number>>;
  best: Record<string, number>;
  meters: number;
  flips: number;
  sound: boolean;
};

export type Stats = {
  engine: number;
  maxSpeed: number;
  fuelMax: number;
  drink: number;
  grip: number;
  air: number;
  crash: number;
  wheelR: number;
  wheelie: number;
  suspension: number;
  frame: FrameId;
};

export type WheelState = {
  x: number;
  y: number;
  spin: number;
  grounded: boolean;
  compression: number;
};

export type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
};

export type Popup = {
  x: number;
  y: number;
  text: string;
  life: number;
};

export type Dust = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  s: number;
  blue?: boolean;
};

export type Shard = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  s: number;
};

export type RunResult = {
  token: string;
  world: WorldId;
  road: number;
  outcome: "finish" | "crash" | "fuel" | "quit";
  reason: string;
  coins: number;
  flipCoins: number;
  finishBonus: number;
  flips: number;
  distance: number;
  time: number;
};

export type Screen =
  | { id: "home" }
  | { id: "worlds" }
  | { id: "roads"; world: WorldId }
  | { id: "garage" }
  | { id: "race"; world: WorldId; road: number; bot: boolean };
