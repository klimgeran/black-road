import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Fuel, Pause, Volume2, VolumeX } from "lucide-react";
import { computeStats, getBike, getPaint, getWorld, ROAD_NAMES } from "./content";
import { renderWorld } from "./draw";
import { createAudio, type Sfx } from "./audio";
import { botInput, createSim, stepSim, type Sim } from "./sim";
import { bestKey } from "./save";
import { generateTrack } from "./terrain";
import type { RunResult, SaveData, WorldId } from "./types";

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getX: () => number;
      setKeys: (codes: string[]) => void;
      setSteer: (v: number) => void;
    };
    __simDebug?: () => Record<string, number | string | boolean | null>;
  }
}

type Props = {
  save: SaveData;
  world: WorldId;
  road: number;
  bot: boolean;
  onBank: (result: RunResult) => void;
  onExit: (to: "again" | "next" | "roads" | "garage" | "home") => void;
  onSound: (on: boolean) => void;
};

function totalOf(r: RunResult) {
  return r.coins + r.flipCoins + r.finishBonus;
}

export function RaceView({ save, world, road, bot, onBank, onExit, onSound }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touch = useRef({ gas: false, brake: false });
  const pointers = useRef(new Map<number, "gas" | "brake">());
  const unlockRef = useRef<() => void>(() => {});
  const onBankRef = useRef(onBank);
  onBankRef.current = onBank;
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const [sound, setSound] = useState(save.sound);
  const soundRef = useRef(save.sound);
  soundRef.current = sound;
  const [result, setResult] = useState<RunResult | null>(null);
  const [hint, setHint] = useState(road <= 3);
  const fuelRef = useRef<HTMLDivElement>(null);
  const boostRef = useRef<HTMLDivElement>(null);
  const coinRef = useRef<HTMLSpanElement>(null);
  const kmRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const progRef = useRef<HTMLDivElement>(null);
  const city = getWorld(world);
  const roadName = ROAD_NAMES[world][road - 1] ?? `Road ${road}`;

  useEffect(() => {
    const t = window.setTimeout(() => setHint(false), 4200);
    return () => window.clearTimeout(t);
  }, [world, road]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bike = getBike(save.bikeId);
    const paint = getPaint(save.color);
    const stats = computeStats(bike, save.upgrades);
    const track = generateTrack(world, road);
    const sim = createSim(track, stats);
    const audio: Sfx = createAudio();
    audio.setMuted(!soundRef.current);
    unlockRef.current = () => audio.unlock();

    const keys = new Set<string>();
    let probe: Set<string> | null = null;
    let steer = 0;
    let reported = false;
    let camX = sim.x;
    let camY = sim.y;
    let view = 12;
    let last = performance.now();
    let acc = 0;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const token = `${Date.now()}-${world}-${road}-${Math.random().toString(36).slice(2, 7)}`;

    const snapshot = (outcome: RunResult["outcome"], reason: string): RunResult => {
      const finishBonus = outcome === "finish" ? Math.round(55 + road * 12 + (sim.fuel / sim.fuelMax) * 45) : 0;
      return {
        token,
        world,
        road,
        outcome,
        reason,
        coins: sim.coins,
        flipCoins: sim.flipCoins,
        finishBonus,
        flips: sim.flips,
        distance: Math.max(0, sim.x),
        time: sim.age,
      };
    };

    const report = (outcome: RunResult["outcome"], reason: string) => {
      if (reported) return;
      reported = true;
      const payload = snapshot(outcome, reason);
      onBankRef.current(payload);
      setResult(payload);
    };

    const inputOf = () => {
      let gas = false;
      let brake = false;
      const src = probe ?? keys;
      if (src.has("KeyD") || src.has("ArrowRight") || src.has("KeyW") || src.has("ArrowUp")) gas = true;
      if (src.has("KeyA") || src.has("ArrowLeft") || src.has("KeyS") || src.has("ArrowDown")) brake = true;
      if (steer > 0.2) brake = true;
      if (steer < -0.2) gas = true;
      if (!probe) {
        if (touch.current.gas) gas = true;
        if (touch.current.brake) brake = true;
        if (bot) {
          const b = botInput(sim);
          gas = b.gas;
          brake = b.brake;
        }
      }
      if (gas && brake) gas = false;
      return { gas, brake };
    };

    window.__controlsTest = {
      getYaw: () => sim.rot,
      getSpeed: () => sim.vx,
      getX: () => sim.x,
      setKeys: (codes) => {
        probe = new Set(codes);
      },
      setSteer: (v) => {
        steer = v;
      },
    };
    window.__simDebug = () => ({
      x: sim.x,
      y: sim.y,
      vx: sim.vx,
      vy: sim.vy,
      rot: sim.rot,
      fuel: sim.fuel,
      boost: sim.boost,
      crashed: sim.crashed,
      reason: sim.crashReason,
      finished: sim.finished,
      coins: sim.coins,
      flips: sim.flips,
      grounded: sim.rear.grounded || sim.front.grounded,
      length: track.length,
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setPaused((p) => !p);
        return;
      }
      keys.add(e.code);
      audio.unlock();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onBlur = () => keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let prevCoins = 0;
    let prevFuel = sim.fuel;
    let prevFlips = 0;
    let prevBoost = 0;

    const frame = (now: number) => {
      const frameDt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && !reported) {
        acc += frameDt;
        let steps = 0;
        const step = 1 / 120;
        while (acc >= step && steps < 6) {
          const before = readFlags(sim);
          stepSim(sim, inputOf(), track, stats, step);
          acc -= step;
          steps++;
          if (sim.coins > prevCoins) audio.coin();
          if (sim.fuel > prevFuel + 0.5) audio.fuel();
          if (sim.boost > prevBoost + 0.05) audio.ozone();
          if (sim.flips > prevFlips) audio.flip();
          if (sim.crashed && !before.crashed) {
            audio.crash();
            if (navigator.vibrate) navigator.vibrate(46);
          }
          if (sim.finished && !before.finished) audio.finish();
          prevCoins = sim.coins;
          prevFuel = sim.fuel;
          prevFlips = sim.flips;
          prevBoost = sim.boost;
          if ((sim.crashed || sim.finished || sim.outOfFuel) && sim.endTimer > (sim.crashed ? 1.05 : 0.62)) {
            const outcome = sim.finished ? "finish" : sim.outOfFuel ? "fuel" : "crash";
            report(outcome, sim.crashReason);
            break;
          }
        }
      }
      audio.setMuted(!soundRef.current || pausedRef.current || reported);
      audio.update(sim.vx, inputOf().gas && !pausedRef.current && !reported, sim.boost > 0);

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = rect.width || 1;
      const cssH = rect.height || 1;
      const base = cssW < 720 ? 11 : 18;
      const air = !sim.rear.grounded && !sim.front.grounded;
      const targetView = base + Math.min(6.5, Math.abs(sim.vx) * 0.2) + (air ? 2.6 : 0);
      const k = 1 - Math.exp(-3.4 * Math.max(frameDt, 0.008));
      view += (targetView - view) * k;
      const ppm = cssW / view;
      camX += (sim.x + view * 0.2 - camX) * k;
      camY += (sim.y + 0.15 - camY) * k;
      renderWorld(ctx, cssW, cssH, dpr, sim, track, camX, camY, ppm, paint.hex, stats.frame, reduce);

      const pct = sim.fuelMax > 0 ? Math.max(0, sim.fuel / sim.fuelMax) : 0;
      if (fuelRef.current) {
        fuelRef.current.style.transform = `scaleX(${pct})`;
        fuelRef.current.style.background = pct < 0.22 ? "var(--color-gas)" : "var(--color-ink)";
      }
      if (coinRef.current) coinRef.current.textContent = String(sim.coins + sim.flipCoins);
      if (boostRef.current) {
        const b = Math.max(0, Math.min(1, sim.boost / 1.35));
        boostRef.current.style.transform = `scaleX(${b})`;
        const track = boostRef.current.parentElement;
        if (track) {
          track.style.height = b > 0.02 ? "4px" : "0px";
          track.style.marginTop = b > 0.02 ? "4px" : "0px";
        }
      }
      if (kmRef.current) {
        kmRef.current.textContent = `${(Math.max(0, sim.x) / 1000).toFixed(2)} / ${(track.length / 1000).toFixed(1)} km`;
      }
      if (speedRef.current) speedRef.current.textContent = `${Math.round(sim.vx * 3.6)}`;
      if (progRef.current) progRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, sim.x / track.length))})`;

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      audio.setMuted(true);
      if (window.__simDebug) {
        window.__controlsTest = undefined;
        window.__simDebug = undefined;
      }
    };
  }, [world, road, bot, save.bikeId, save.color, save.upgrades]);

  const press = (which: "gas" | "brake") => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    unlockRef.current();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, which);
    syncTouch();
  };
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    pointers.current.delete(e.pointerId);
    syncTouch();
  };
  const syncTouch = () => {
    let gas = false;
    let brake = false;
    for (const v of pointers.current.values()) {
      if (v === "gas") gas = true;
      if (v === "brake") brake = true;
    }
    touch.current.gas = gas;
    touch.current.brake = brake;
  };

  const quit = () => {
    if (!result) {
      onBankRef.current({
        token: `quit-${Date.now()}`,
        world,
        road,
        outcome: "quit",
        reason: "",
        coins: 0,
        flipCoins: 0,
        finishBonus: 0,
        flips: 0,
        distance: 0,
        time: 0,
      });
    }
    onExit("roads");
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-canvas text-ink select-none">
      <header className="safe-top bg-canvas px-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
            <span className="size-2.5 rounded-full bg-coin" />
            <span ref={coinRef} className="font-display text-sm">
              0
            </span>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Fuel className="size-4 shrink-0 text-ink" aria-hidden />
            <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
              <div ref={fuelRef} className="h-full w-full origin-left bg-ink" />
            </div>
          </div>
          <span className="font-display text-sm tabular-nums">
            <span ref={speedRef}>0</span>
            <span className="text-mute"> km/h</span>
          </span>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full border border-line"
            aria-label={sound ? "Mute" : "Sound"}
            onClick={() =>
              setSound((s) => {
                onSound(!s);
                return !s;
              })
            }
          >
            {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full border border-line"
            aria-label="Pause"
            onClick={() => setPaused(true)}
          >
            <Pause className="size-5" />
          </button>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
          <span className="truncate">
            {city.city} · {roadName}
          </span>
          <span ref={kmRef} className="shrink-0 text-mute tabular-nums">
            0.00 km
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
          <div ref={progRef} className="h-full w-full origin-left bg-ink" />
        </div>
        <div className="mt-0 h-0 overflow-hidden rounded-full bg-[#d7e4ff]">
          <div ref={boostRef} className="h-full w-full origin-left bg-[#2f6fed]" />
        </div>
      </header>

      <div className="relative min-h-0 flex-1 touch-none">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {!result && !paused && (
          <div className="absolute inset-0 grid grid-cols-2">
            <button
              type="button"
              aria-label="Brake"
              className="h-full w-full bg-transparent"
              onPointerDown={press("brake")}
              onPointerUp={release}
              onPointerCancel={release}
            />
            <button
              type="button"
              aria-label="Gas"
              className="h-full w-full bg-transparent"
              onPointerDown={press("gas")}
              onPointerUp={release}
              onPointerCancel={release}
            />
          </div>
        )}
        {hint && !result && (
          <div className="pointer-events-none absolute inset-x-4 top-4 rounded-2xl bg-paper/95 px-4 py-3 text-sm leading-snug">
            {road <= 2
              ? "Right side is GAS. Hold it and the front lifts — release or you loop. Left is BRAKE: it stops you, then rolls you back."
              : "In the air, GAS backflips and BRAKE frontflips. Grab blue OZONE before the big jumps."}
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 left-0 right-0 hidden text-center text-xs text-mute md:block">
          A brake / reverse · D gas
        </p>
      </div>

      <div className="safe-bottom-play grid grid-cols-2 gap-2 bg-canvas px-3 pt-2">
        <button
          type="button"
          className="h-16 rounded-2xl bg-ink font-display text-lg text-paper"
          onPointerDown={press("brake")}
          onPointerUp={release}
          onPointerCancel={release}
        >
          BRAKE
        </button>
        <button
          type="button"
          className="h-16 rounded-2xl bg-gas font-display text-lg text-paper"
          onPointerDown={press("gas")}
          onPointerUp={release}
          onPointerCancel={release}
        >
          GAS
        </button>
      </div>

      {paused && !result && (
        <div className="absolute inset-0 z-10 flex items-end bg-ink/40 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-sm rounded-3xl bg-paper p-5">
            <h2 className="font-display text-3xl">Paused</h2>
            <div className="mt-4 grid gap-2">
              <button type="button" className="h-12 rounded-2xl bg-gas font-display text-paper" onClick={() => setPaused(false)}>
                Resume
              </button>
              <button type="button" className="h-12 rounded-2xl border border-line" onClick={() => onExit("again")}>
                Retry
              </button>
              <button type="button" className="h-12 rounded-2xl border border-line" onClick={quit}>
                Quit
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="absolute inset-0 z-10 flex flex-col bg-paper">
          <div className="bg-road px-5 py-8 text-paper safe-top">
            <p className="text-sm text-paper/70">
              {city.city} · road {road}
            </p>
            <h2 className="mt-2 font-display text-5xl leading-none">
              {result.outcome === "finish" ? "FINISH" : result.outcome === "fuel" ? "EMPTY" : "CRASH"}
            </h2>
            {result.reason ? <p className="mt-3 text-paper/80">{result.reason}</p> : null}
          </div>
          <div className="flex flex-1 flex-col px-5 py-5">
            <Row label="Road" value={result.coins} />
            <Row label="Flips" value={result.flipCoins} />
            <Row label="Finish" value={result.finishBonus} />
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="font-display text-xl">Total</span>
              <span className="font-display text-3xl text-coin">{totalOf(result)}</span>
            </div>
            <p className="mt-2 text-sm text-mute">
              {(result.distance / 1000).toFixed(2)} km
              {result.flips > 0 ? ` · ${result.flips} flips` : ""}
              {save.best[bestKey(world, road)] ? ` · best ${save.best[bestKey(world, road)]}` : ""}
            </p>
            <div className="mt-auto grid gap-2 pt-6">
              {result.outcome === "finish" && road < 10 && (
                <button type="button" className="h-14 rounded-2xl bg-gas font-display text-lg text-paper" onClick={() => onExit("next")}>
                  Next
                </button>
              )}
              {result.outcome === "finish" && road >= 10 && (
                <button type="button" className="h-14 rounded-2xl bg-gas font-display text-lg text-paper" onClick={() => onExit("roads")}>
                  Countries
                </button>
              )}
              <button type="button" className="h-12 rounded-2xl border border-line" onClick={() => onExit("again")}>
                Again
              </button>
              <button type="button" className="h-12 rounded-2xl border border-line" onClick={() => onExit("garage")}>
                Garage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 text-base">
      <span className="text-mute">{label}</span>
      <span className="font-display text-lg">+{value}</span>
    </div>
  );
}

function readFlags(sim: Sim) {
  return { crashed: sim.crashed, finished: sim.finished };
}
