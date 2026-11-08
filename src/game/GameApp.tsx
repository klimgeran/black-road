import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Lock } from "lucide-react";
import {
  BIKES,
  PAINTS,
  ROAD_NAMES,
  UPGRADE_META,
  WORLDS,
  getBike,
  getPaint,
  getWorld,
  maxUpgrade,
  roadLength,
  upgradeCost,
} from "./content";
import { drawPreview } from "./draw";
import { RaceView } from "./RaceView";
import { bestKey, defaultSave, loadSave, nextPlayable, roadUnlocked, worldUnlocked, writeSave } from "./save";
import type { FrameId, RunResult, SaveData, Screen, Upgrades, WorldId } from "./types";

export function GameApp() {
  const [save, setSave] = useState<SaveData>(defaultSave);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>({ id: "home" });
  const [run, setRun] = useState(0);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const loaded = loadSave();
    setSave(loaded);
    setReady(true);
    const q = new URLSearchParams(window.location.search);
    if (q.has("bot") || q.get("qa") === "race") {
      const world = (q.get("world") as WorldId) || "manila";
      const known = WORLDS.some((w) => w.id === world);
      const road = Math.max(1, Math.min(10, Number(q.get("road") || "1") || 1));
      setScreen({ id: "race", world: known ? world : "manila", road, bot: q.has("bot") });
    }
  }, []);

  useEffect(() => {
    if (ready) writeSave(save);
  }, [save, ready]);

  const bank = (result: RunResult) => {
    if (seen.current.has(result.token)) return;
    seen.current.add(result.token);
    if (result.outcome === "quit") return;
    setSave((prev) => {
      const gained = result.coins + result.flipCoins + result.finishBonus;
      const cleared = { ...prev.cleared };
      if (result.outcome === "finish") {
        cleared[result.world] = Math.max(cleared[result.world] ?? 0, result.road);
      }
      const key = bestKey(result.world, result.road);
      const best = { ...prev.best };
      if (gained > (best[key] ?? 0)) best[key] = gained;
      return {
        ...prev,
        coins: prev.coins + gained,
        cleared,
        best,
        meters: prev.meters + result.distance,
        flips: prev.flips + result.flips,
      };
    });
  };

  if (screen.id === "race") {
    return (
      <RaceView
        key={`${screen.world}-${screen.road}-${run}`}
        save={save}
        world={screen.world}
        road={screen.road}
        bot={screen.bot}
        onBank={bank}
        onSound={(sound) => setSave((s) => ({ ...s, sound }))}
        onExit={(to) => {
          if (to === "again") {
            setRun((n) => n + 1);
            return;
          }
          if (to === "next") {
            const road = Math.min(10, screen.road + 1);
            setScreen({ id: "race", world: screen.world, road, bot: false });
            setRun((n) => n + 1);
            return;
          }
          if (to === "garage") setScreen({ id: "garage" });
          else if (to === "home") setScreen({ id: "home" });
          else setScreen({ id: "roads", world: screen.world });
        }}
      />
    );
  }

  return (
    <div className="min-h-dvh overflow-y-auto bg-paper text-ink">
      {screen.id === "home" && <Home save={save} onGo={setScreen} />}
      {screen.id === "worlds" && <Worlds save={save} onGo={setScreen} />}
      {screen.id === "roads" && <Roads save={save} world={screen.world} onGo={setScreen} />}
      {screen.id === "garage" && <Garage save={save} setSave={setSave} onBack={() => setScreen({ id: "home" })} />}
    </div>
  );
}

function CoinChip({ n }: { n: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5">
      <span className="size-2.5 rounded-full bg-coin" />
      <span className="font-display text-sm">{n}</span>
    </div>
  );
}

function Home({ save, onGo }: { save: SaveData; onGo: (s: Screen) => void }) {
  const next = nextPlayable(save);
  const world = getWorld(next.world);
  const bike = getBike(save.bikeId);
  const paint = getPaint(save.color);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-8 safe-top">
      <div className="flex items-center justify-between">
        <p className="text-xs tracking-widest text-mute">SIDE VIEW</p>
        <CoinChip n={save.coins} />
      </div>
      <h1 className="mt-6 font-display text-5xl leading-none font-bold sm:text-7xl">
        BLACK
        <br />
        ROAD
      </h1>
      <p className="mt-4 max-w-sm text-base leading-relaxed text-mute">
        Hold the gas and the front comes up. Hold it too long and you loop. Brake stops you — keep holding and you roll back. Blue ozone before the big jumps.
      </p>
      <BikeStage frame={bike.frame} color={paint.hex} />
      {save.meters > 40 && (
        <p className="text-sm text-mute">
          {(save.meters / 1000).toFixed(1)} km all-time
          {save.flips > 0 ? ` · ${save.flips} flips` : ""}
        </p>
      )}
      <div className="mt-auto grid gap-2 pt-8">
        <button
          type="button"
          className="h-14 rounded-2xl bg-gas font-display text-lg text-paper"
          onClick={() => onGo({ id: "race", world: next.world, road: next.road, bot: false })}
        >
          Ride
        </button>
        <p className="text-center text-sm text-mute">
          {world.city} · road {next.road} · {ROAD_NAMES[next.world][next.road - 1]}
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button type="button" className="h-12 rounded-2xl border border-line" onClick={() => onGo({ id: "garage" })}>
            Garage
          </button>
          <button type="button" className="h-12 rounded-2xl border border-line" onClick={() => onGo({ id: "worlds" })}>
            Countries
          </button>
        </div>
      </div>
    </main>
  );
}

function Worlds({ save, onGo }: { save: SaveData; onGo: (s: Screen) => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-8 safe-top">
      <Top title="Countries" coins={save.coins} onBack={() => onGo({ id: "home" })} />
      <p className="mt-3 text-sm text-mute">Three countries, ten roads each. The next country opens after road 3.</p>
      <div className="mt-4 divide-y divide-line border-y border-line">
        {WORLDS.map((w) => {
          const open = worldUnlocked(save, w.id);
          const done = save.cleared[w.id] ?? 0;
          return (
            <button
              key={w.id}
              type="button"
              disabled={!open}
              className="flex w-full items-start justify-between gap-3 py-5 text-left disabled:opacity-45"
              onClick={() => onGo({ id: "roads", world: w.id })}
            >
              <span>
                <span className="block font-display text-3xl leading-none">{w.city}</span>
                <span className="mt-1 block text-sm text-mute">{w.country}</span>
                <span className="mt-2 block text-sm">{open ? w.blurb : lockText(w.id)}</span>
              </span>
              <span className="flex items-center gap-2 pt-1 text-sm">
                {open ? (
                  <span className="tabular-nums">
                    {done}/10
                  </span>
                ) : (
                  <Lock className="size-4" />
                )}
                <span className="text-mute">{w.index}</span>
              </span>
            </button>
          );
        })}
      </div>
    </main>
  );
}

function lockText(id: WorldId) {
  if (id === "lagos") return "Opens after Manila road 3.";
  if (id === "moscow") return "Opens after Lagos road 3.";
  return "";
}

function Roads({ save, world, onGo }: { save: SaveData; world: WorldId; onGo: (s: Screen) => void }) {
  const def = getWorld(world);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-8 safe-top">
      <Top title={def.city} coins={save.coins} onBack={() => onGo({ id: "worlds" })} />
      <p className="mt-2 text-sm text-mute">{def.country}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((road) => {
          const open = roadUnlocked(save, world, road);
          const done = (save.cleared[world] ?? 0) >= road;
          const best = save.best[bestKey(world, road)];
          return (
            <button
              key={road}
              type="button"
              disabled={!open}
              className={
                "min-h-24 rounded-2xl border p-3 text-left disabled:opacity-40 " +
                (open && !done ? "border-ink" : "border-line")
              }
              onClick={() => onGo({ id: "race", world, road, bot: false })}
            >
              <span className="flex items-center justify-between">
                <span className="font-display text-2xl leading-none">{String(road).padStart(2, "0")}</span>
                {!open && <Lock className="size-4" />}
              </span>
              <span className="mt-2 block text-sm">{ROAD_NAMES[world][road - 1]}</span>
              <span className="mt-1 block text-xs text-mute">
                {(roadLength(world, road) / 1000).toFixed(1)} km
                {best ? ` · ${best}` : ""}
                {done ? " · clear" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </main>
  );
}

function Garage({
  save,
  setSave,
  onBack,
}: {
  save: SaveData;
  setSave: (updater: (s: SaveData) => SaveData) => void;
  onBack: () => void;
}) {
  const bike = getBike(save.bikeId);
  const paint = getPaint(save.color);
  const owned = save.owned.includes(bike.id);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-10 safe-top">
      <Top title="Garage" coins={save.coins} onBack={onBack} />
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {BIKES.map((b) => {
          const on = b.id === save.bikeId;
          const has = save.owned.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              className={
                "h-11 shrink-0 rounded-full px-4 " + (on ? "bg-ink text-paper" : "border border-line")
              }
              onClick={() => setSave((s) => ({ ...s, bikeId: b.id }))}
            >
              {b.name}
              {!has ? <span className="text-mute"> · {b.price}</span> : null}
            </button>
          );
        })}
      </div>
      <h2 className="mt-4 font-display text-4xl leading-none">{bike.name}</h2>
      <p className="mt-2 text-sm text-mute">{bike.tag}</p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-canvas">
        <BikeStage frame={bike.frame} color={paint.hex} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {PAINTS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-label={p.name}
            className={"size-11 rounded-full border-2 " + (save.color === p.id ? "border-ink" : "border-line")}
            style={{ background: p.hex }}
            onClick={() => setSave((s) => ({ ...s, color: p.id }))}
          />
        ))}
      </div>
      <div className="mt-4">
        {owned ? (
          <p className="text-sm text-mute">Equipped. Paint and the shop apply to every bike.</p>
        ) : (
          <button
            type="button"
            disabled={save.coins < bike.price}
            className="h-12 w-full rounded-2xl bg-ink font-display text-paper disabled:opacity-40"
            onClick={() =>
              setSave((s) => ({
                ...s,
                coins: s.coins - bike.price,
                owned: [...s.owned, bike.id],
                bikeId: bike.id,
              }))
            }
          >
            {save.coins < bike.price ? `Need ${bike.price} coins` : `Buy · ${bike.price}`}
          </button>
        )}
      </div>
      <h3 className="mt-8 font-display text-xl">Shop</h3>
      <div className="mt-2 divide-y divide-line border-y border-line">
        {UPGRADE_META.map((u) => {
          const level = save.upgrades[u.key];
          const maxed = level >= maxUpgrade();
          const cost = upgradeCost(level);
          return (
            <div key={u.key} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{u.name}</p>
                <p className="text-sm text-mute">{u.hint}</p>
                <div className="mt-2 flex gap-1">
                  {Array.from({ length: maxUpgrade() }, (_, i) => (
                    <span key={i} className={"h-1.5 flex-1 rounded-full " + (i < level ? "bg-ink" : "bg-line")} />
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={maxed || save.coins < cost}
                className="h-11 shrink-0 rounded-full border border-line px-3 text-sm disabled:opacity-40"
                onClick={() =>
                  setSave((s) => ({
                    ...s,
                    coins: s.coins - cost,
                    upgrades: { ...s.upgrades, [u.key]: (s.upgrades[u.key] + 1) as Upgrades[keyof Upgrades] },
                  }))
                }
              >
                {maxed ? "Max" : cost}
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function Top({ title, coins, onBack }: { title: string; coins: number; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" className="grid size-11 place-items-center rounded-full border border-line" aria-label="Back" onClick={onBack}>
        <ChevronLeft className="size-5" />
      </button>
      <h1 className="font-display text-xl">{title}</h1>
      <CoinChip n={coins} />
    </div>
  );
}

function BikeStage({ frame, color }: { frame: FrameId; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    const loop = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) drawPreview(ctx, w, h, dpr, frame, color, now / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frame, color]);
  return <canvas ref={ref} className="mt-4 h-40 w-full" />;
}
