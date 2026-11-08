export type Sfx = ReturnType<typeof createAudio>;

export function createAudio() {
  let ctx: AudioContext | null = null;
  let engine: OscillatorNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let gain: GainNode | null = null;
  let muted = false;
  let lastCoin = 0;

  function ensure() {
    if (ctx) return ctx;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx();
    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 380;
    gain = ctx.createGain();
    gain.gain.value = 0;
    filter.connect(gain);
    gain.connect(ctx.destination);
    engine = ctx.createOscillator();
    engine.type = "sawtooth";
    engine.frequency.value = 58;
    engine.connect(filter);
    engine.start();
    return ctx;
  }

  function blip(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
    if (muted) return;
    const ac = ensure();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur + 0.02);
  }

  return {
    unlock() {
      const ac = ensure();
      void ac.resume();
    },
    setMuted(v: boolean) {
      muted = v;
      if (gain && ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    },
    update(speed: number, gas: boolean, boost = false) {
      if (!ctx || !gain || !engine || !filter || muted) return;
      const f = 46 + Math.min(42, Math.abs(speed)) * 3.1 + (gas ? 16 : 0) + (boost ? 34 : 0);
      engine.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
      filter.frequency.setTargetAtTime(boost ? 980 : gas ? 520 : 280, ctx.currentTime, 0.08);
      const vol = boost ? 0.045 : gas ? 0.03 : Math.abs(speed) > 2 ? 0.01 : 0;
      gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.06);
    },
    coin() {
      const now = performance.now();
      if (now - lastCoin < 45) return;
      lastCoin = now;
      blip(860, 0.06, "square", 0.035, 180);
    },
    fuel() {
      blip(196, 0.14, "sawtooth", 0.04, 80);
    },
    ozone() {
      blip(320, 0.08, "square", 0.05, 420);
      blip(640, 0.16, "sawtooth", 0.03, 180);
    },
    flip() {
      blip(523, 0.09, "square", 0.04, 200);
      blip(784, 0.12, "square", 0.03, 80);
    },
    crash() {
      blip(90, 0.28, "sawtooth", 0.06, -40);
    },
    finish() {
      blip(523, 0.1, "square", 0.045, 40);
      blip(659, 0.14, "square", 0.04, 30);
    },
  };
}
