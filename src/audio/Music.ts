import { noteToFreq, notesAt } from './notes';
import type { Synth } from './Synth';

/** Quanto in anticipo si programmano le note (s) e ogni quanto si controlla (ms). */
const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

interface Run {
  gain: GainNode;
  timer: ReturnType<typeof setInterval>;
  sources: Set<AudioScheduledSourceNode>;
  nextStep: number;
  nextTime: number;
  stepDur: number;
}

/**
 * Musichetta chiptune in loop (onda quadra + triangolo + rumore).
 * Ogni avvio ha il suo bus: `stop()` lo azzera all'istante e ferma anche
 * le note già programmate, così il silenzio al reveal è immediato.
 */
export class Music {
  private run: Run | null = null;

  constructor(
    private readonly synth: Synth,
    private readonly bus: AudioNode,
  ) {}

  get playing(): boolean {
    return this.run !== null;
  }

  start(bpm: number): void {
    this.stop();
    const ctx = this.synth.ctx;
    const gain = ctx.createGain();
    gain.connect(this.bus);
    const run: Run = {
      gain,
      timer: setInterval(() => this.schedule(run), TICK_MS),
      sources: new Set(),
      nextStep: 0,
      nextTime: ctx.currentTime + 0.03,
      stepDur: 60 / bpm / 2, // crome
    };
    this.run = run;
    this.schedule(run);
  }

  /** Silenzio istantaneo (≈5 ms per evitare il "clic"). */
  stop(): void {
    const run = this.run;
    if (!run) return;
    this.run = null;
    clearInterval(run.timer);
    const now = this.synth.ctx.currentTime;
    run.gain.gain.cancelScheduledValues(now);
    run.gain.gain.setValueAtTime(run.gain.gain.value, now);
    run.gain.gain.linearRampToValueAtTime(0, now + 0.005);
    for (const s of run.sources) {
      try {
        s.stop(now + 0.01);
      } catch {
        /* già fermato */
      }
    }
    setTimeout(() => run.gain.disconnect(), 100);
  }

  /** Piccolo "singhiozzo" della musica (finta del coperchio a difficoltà alta). */
  hiccup(): void {
    const run = this.run;
    if (!run) return;
    const g = run.gain.gain;
    const now = this.synth.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(1, now);
    g.linearRampToValueAtTime(0.05, now + 0.01);
    g.setValueAtTime(0.05, now + 0.07);
    g.linearRampToValueAtTime(1, now + 0.09);
  }

  private schedule(run: Run): void {
    const ctx = this.synth.ctx;
    while (run.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      this.playStep(run, run.nextStep, run.nextTime);
      run.nextStep++;
      run.nextTime += run.stepDur;
    }
  }

  private playStep(run: Run, step: number, t: number): void {
    const { lead, bass, hat } = notesAt(step);
    const track = (src: AudioScheduledSourceNode) => {
      run.sources.add(src);
      src.onended = () => run.sources.delete(src);
    };
    if (lead) {
      track(
        this.synth.tone({
          type: 'square',
          from: noteToFreq(lead.note),
          dur: run.stepDur * lead.steps * 0.92,
          vol: 0.09,
          when: t,
          out: run.gain,
        }),
      );
    }
    track(
      this.synth.tone({
        type: 'triangle',
        from: noteToFreq(bass),
        dur: run.stepDur * 0.85,
        vol: 0.2,
        when: t,
        out: run.gain,
      }),
    );
    if (hat) {
      track(
        this.synth.noiseBurst({
          filter: 'highpass',
          from: 7000,
          dur: 0.035,
          vol: 0.05,
          when: t,
          out: run.gain,
        }),
      );
    }
  }
}
