import { TANPURA_CYCLE, talaBeats, tanpuraStrings } from "./practice";

const LOOKAHEAD = 0.15; // seconds of sound scheduled ahead of the clock
const TICK = 25; // milliseconds between scheduling passes

/**
 * Tanpura and tala for practice, made with Web Audio. Nothing loads from the
 * network, and nothing sounds until a person presses a button: the audio
 * context is created on that first gesture.
 */
export class PracticeEngine {
  private ctx: AudioContext | null = null;
  private tanpuraBus: GainNode | null = null;
  private talaBus: GainNode | null = null;
  private wave: PeriodicWave | null = null;
  private timer = 0;
  private tanpura: {
    strings: ReturnType<typeof tanpuraStrings>;
    cycleStart: number;
    step: number;
  } | null = null;
  private tala: {
    angas: number[];
    bpm: number;
    start: number;
    next: number;
  } | null = null;

  private audio() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      // A tanpura's tone: a full harmonic series, the upper partials kept soft
      // so the drone stays warm rather than bright.
      const size = 16;
      const real = new Float32Array(size);
      const imag = new Float32Array(size);
      for (let h = 1; h < size; h++) imag[h] = (h > 5 ? 0.55 : 1) / h;
      this.wave = this.ctx.createPeriodicWave(real, imag);
    }
    void this.ctx.resume();
    return this.ctx;
  }

  private bus(volume: number) {
    const ctx = this.audio();
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);
    return gain;
  }

  /** Fades a bus out and lets it go, so stopping never clicks. */
  private release(bus: GainNode | null) {
    if (!bus || !this.ctx) return;
    const now = this.ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(0, now + 0.25);
    window.setTimeout(() => bus.disconnect(), 400);
  }

  startTanpura(kattai: number, raga: string) {
    const ctx = this.audio();
    this.release(this.tanpuraBus);
    this.tanpuraBus = this.bus(0.9);
    this.tanpura = {
      strings: tanpuraStrings(kattai, raga),
      cycleStart: ctx.currentTime + 0.05,
      step: 0,
    };
    this.run();
  }

  /** A new shruti takes over from the next string. */
  retuneTanpura(kattai: number, raga: string) {
    if (this.tanpura) this.tanpura.strings = tanpuraStrings(kattai, raga);
  }

  stopTanpura() {
    this.tanpura = null;
    this.release(this.tanpuraBus);
    this.tanpuraBus = null;
  }

  startTala(angas: number[], bpm: number) {
    const ctx = this.audio();
    this.release(this.talaBus);
    this.talaBus = this.bus(0.8);
    const start = ctx.currentTime + 0.1;
    this.tala = { angas, bpm, start, next: 0 };
    this.run();
  }

  /** A new tempo keeps the learner's place in the avartanam. */
  setTempo(bpm: number) {
    if (!this.tala || !this.ctx) return;
    const now = this.ctx.currentTime;
    const elapsed = Math.max(0, ((now - this.tala.start) * this.tala.bpm) / 60);
    this.tala.start = now - (elapsed * 60) / bpm;
    this.tala.bpm = bpm;
  }

  stopTala() {
    this.tala = null;
    this.release(this.talaBus);
    this.talaBus = null;
  }

  /** Beats since the tala started, or -1 when it isn't playing. */
  beatsElapsed() {
    if (!this.tala || !this.ctx) return -1;
    return ((this.ctx.currentTime - this.tala.start) * this.tala.bpm) / 60;
  }

  dispose() {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.tanpura = null;
    this.tala = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  private run() {
    if (!this.timer)
      this.timer = window.setInterval(() => this.schedule(), TICK);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || (!this.tanpura && !this.tala)) {
      window.clearInterval(this.timer);
      this.timer = 0;
      return;
    }
    const until = ctx.currentTime + LOOKAHEAD;
    const drone = this.tanpura;
    while (drone) {
      const string = drone.strings[drone.step % drone.strings.length];
      const at = drone.cycleStart + string.at;
      if (at > until) break;
      if (at >= ctx.currentTime - 0.02) this.pluck(at, string.freq, string.level);
      drone.step++;
      if (drone.step % drone.strings.length === 0)
        drone.cycleStart += TANPURA_CYCLE;
    }
    const tala = this.tala;
    if (tala) {
      const beats = talaBeats(tala.angas);
      const length = 60 / tala.bpm;
      // Recompute from the start each pass, so a tempo change lands cleanly.
      tala.next = Math.max(
        tala.next,
        Math.ceil(((ctx.currentTime - tala.start) / length) - 0.001),
      );
      while (tala.start + tala.next * length <= until) {
        const beat = beats[tala.next % beats.length];
        this.click(
          tala.start + tala.next * length,
          beat.sam ? "sam" : beat.angaStart ? "anga" : "beat",
        );
        tala.next++;
      }
    }
  }

  private pluck(at: number, freq: number, level: number) {
    const ctx = this.ctx;
    if (!ctx || !this.wave || !this.tanpuraBus) return;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.Q.value = 0.4;
    tone.frequency.setValueAtTime(Math.min(freq * 14, 7000), at);
    tone.frequency.exponentialRampToValueAtTime(freq * 3.5, at + 3);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + 0.03);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 4.3);
    tone.connect(envelope).connect(this.tanpuraBus);
    // Two voices a few cents apart give the string its shimmer.
    for (const detune of [-3, 3]) {
      const voice = ctx.createOscillator();
      voice.setPeriodicWave(this.wave);
      voice.frequency.value = freq;
      voice.detune.value = detune;
      voice.connect(tone);
      voice.start(at);
      voice.stop(at + 4.4);
    }
  }

  /** A soft wooden knock: deeper on the sam, lighter on other beats. */
  private click(at: number, kind: "sam" | "anga" | "beat") {
    const ctx = this.ctx;
    if (!ctx || !this.talaBus) return;
    const pitch = { sam: 420, anga: 640, beat: 900 }[kind];
    const peak = { sam: 0.34, anga: 0.22, beat: 0.13 }[kind];
    const decay = kind === "sam" ? 0.22 : 0.1;
    const knock = ctx.createOscillator();
    knock.type = "sine";
    knock.frequency.setValueAtTime(pitch, at);
    knock.frequency.exponentialRampToValueAtTime(pitch * 0.6, at + decay);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(peak, at + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    knock.connect(envelope).connect(this.talaBus);
    knock.start(at);
    knock.stop(at + decay + 0.02);
  }
}
