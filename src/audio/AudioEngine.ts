import { Music } from './Music';
import { noteToFreq } from './notes';
import { Synth } from './Synth';

export type SfxName =
  | 'roundStart'
  | 'roundStartFinal'
  | 'lidOpen'
  | 'lidClose'
  | 'lidFake'
  | 'dash'
  | 'fakeDash'
  | 'bonk'
  | 'eat'
  | 'poop'
  | 'phew'
  | 'fanfare';

export type Mood = 'happy' | 'annoyed' | 'sad';

/** Ciò che il gioco chiede all'audio (implementato da AudioEngine, finto nei test). */
export interface AudioOut {
  startMusic(bpm: number): void;
  stopMusic(): void;
  hiccupMusic(): void;
  sfx(name: SfxName, player?: number): void;
  meow(player: number, mood: Mood): void;
}

/** Altezza di base del miagolio di ogni gatto (Priamo, Tempesta, Poh, Mariù). */
const MEOW_PITCH = [430, 370, 560, 650];

const STORAGE_KEY = 'pappa.audio.muted';

/**
 * Audio del gioco con Web Audio. Il contesto audio nasce al primo tasto
 * o clic (regola dei browser): prima di allora tutte le chiamate sono ignorate.
 */
export class AudioEngine implements AudioOut {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private volumes = { music: 0.7, sfx: 0.8 };
  /** In pausa il contesto resta sospeso anche se si premono tasti. */
  private pausedByGame = false;
  private synth!: Synth;
  private music!: Music;
  private _muted = readMuted();
  private readonly listeners = new Set<() => void>();

  constructor(target: Window = window) {
    const unlock = () => this.unlock();
    target.addEventListener('keydown', unlock);
    target.addEventListener('pointerdown', unlock);
    // Col dito il browser concede l'audio solo al rilascio (pointerup), non all'appoggio.
    target.addEventListener('pointerup', unlock);
  }

  /** true quando il browser ha concesso l'audio. */
  /** true dopo la prima interazione (il browser ha permesso di creare l'audio). */
  get unlocked(): boolean {
    return this.ctx !== null;
  }

  get musicPlaying(): boolean {
    return this.ctx !== null && this.music.playing;
  }

  get ready(): boolean {
    return this.ctx?.state === 'running';
  }

  get muted(): boolean {
    return this._muted;
  }

  toggleMute(): void {
    this._muted = !this._muted;
    writeMuted(this._muted);
    if (this.ctx)
      this.master.gain.setTargetAtTime(this._muted ? 0 : 0.8, this.ctx.currentTime, 0.01);
    this.notify();
  }

  /** Avvisa quando cambia lo stato (sbloccato / muto), per l'HUD. */
  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  startMusic(bpm: number): void {
    if (this.ready) this.music.start(bpm);
  }

  stopMusic(): void {
    if (this.ctx) this.music.stop();
  }

  hiccupMusic(): void {
    if (this.ready) this.music.hiccup();
  }

  sfx(name: SfxName, player = 0): void {
    if (!this.ready) return;
    const s = this.synth;
    const t = this.ctx!.currentTime;
    switch (name) {
      case 'roundStart':
      case 'roundStartFinal': {
        const notes = name === 'roundStart' ? ['C6', 'G6'] : ['C6', 'E6', 'G6', 'C7'];
        notes.forEach((n, i) =>
          s.tone({ type: 'square', from: noteToFreq(n), dur: 0.09, vol: 0.1, when: t + i * 0.1 }),
        );
        break;
      }
      case 'lidOpen':
        s.noiseBurst({ filter: 'bandpass', from: 400, to: 3200, q: 1.5, dur: 0.16, vol: 0.35 });
        s.tone({ type: 'sine', from: 300, to: 900, dur: 0.07, vol: 0.3 });
        break;
      case 'lidClose':
        s.tone({ type: 'sine', from: 220, to: 80, dur: 0.14, vol: 0.4, when: t + 0.3 });
        s.noiseBurst({ filter: 'lowpass', from: 600, dur: 0.08, vol: 0.3, when: t + 0.3 });
        break;
      case 'lidFake':
        // Il coperchio di legno "bussa" sulla ciotola.
        s.tone({ type: 'sine', from: 720, to: 480, dur: 0.05, vol: 0.3 });
        s.tone({ type: 'sine', from: 650, to: 430, dur: 0.05, vol: 0.25, when: t + 0.11 });
        break;
      case 'dash':
      case 'fakeDash': {
        // Stesso inizio per scatto vero e finto: il suono non tradisce la finta.
        const pitch = 1 + player * 0.06;
        const dur = name === 'dash' ? 0.2 : 0.13;
        s.noiseBurst({
          filter: 'bandpass',
          from: 600 * pitch,
          to: 2600 * pitch,
          q: 1.3,
          dur,
          vol: 0.32,
        });
        break;
      }
      case 'bonk':
        s.tone({ type: 'sine', from: 540, to: 110, dur: 0.22, vol: 0.5, when: t + 0.17 });
        s.tone({ type: 'triangle', from: 1100, dur: 0.03, vol: 0.25, when: t + 0.17 });
        s.noiseBurst({ filter: 'lowpass', from: 900, dur: 0.06, vol: 0.3, when: t + 0.17 });
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) {
          s.tone({
            type: 'square',
            from: 340,
            to: 260,
            dur: 0.07,
            vol: 0.12,
            when: t + 0.25 + i * 0.16,
          });
        }
        break;
      case 'poop':
        // "Blegh" + mosca che ronza.
        s.tone({
          type: 'sawtooth',
          from: 170,
          to: 85,
          dur: 0.45,
          vol: 0.18,
          when: t + 0.22,
          vibrato: { rate: 18, depth: 25 },
        });
        s.tone({
          type: 'sawtooth',
          from: 240,
          dur: 0.7,
          vol: 0.035,
          when: t + 0.1,
          vibrato: { rate: 40, depth: 30 },
        });
        break;
      case 'phew':
        s.tone({ type: 'triangle', from: noteToFreq('G5'), dur: 0.12, vol: 0.18 });
        s.tone({ type: 'triangle', from: noteToFreq('E5'), dur: 0.2, vol: 0.18, when: t + 0.13 });
        break;
      case 'fanfare': {
        const melody = ['C5', 'E5', 'G5', 'C6', 'G5', 'C6'];
        const lengths = [0.11, 0.11, 0.11, 0.22, 0.11, 0.5];
        let at = t;
        melody.forEach((n, i) => {
          s.tone({ type: 'square', from: noteToFreq(n), dur: lengths[i], vol: 0.12, when: at });
          at += lengths[i];
        });
        s.tone({ type: 'triangle', from: noteToFreq('C3'), dur: at - t, vol: 0.2, when: t });
        break;
      }
    }
  }

  /** Miagolio sintetico: dente di sega con glissato e "formante" che si apre e chiude. */
  meow(player: number, mood: Mood): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + (mood === 'happy' ? 0.35 : 0.05);
    const base = MEOW_PITCH[player % MEOW_PITCH.length];
    const shape: Record<Mood, { curve: number[]; dur: number; vol: number }> = {
      happy: { curve: [1, 1.35, 0.95], dur: 0.45, vol: 0.22 },
      annoyed: { curve: [0.9, 1.2, 0.7], dur: 0.32, vol: 0.28 },
      sad: { curve: [1, 0.92, 0.7], dur: 0.6, vol: 0.18 },
    };
    const { curve, dur, vol } = shape[mood];

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * curve[0], t);
    osc.frequency.linearRampToValueAtTime(base * curve[1], t + dur * 0.35);
    osc.frequency.linearRampToValueAtTime(base * curve[2], t + dur);
    this.synth.vibrato(osc.frequency, t, dur, 6, base * 0.015);

    // "m-ia-o": il filtro si apre e si richiude.
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.Q.value = 3;
    formant.frequency.setValueAtTime(700, t);
    formant.frequency.linearRampToValueAtTime(1900, t + dur * 0.4);
    formant.frequency.linearRampToValueAtTime(900, t + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.05);
    gain.gain.setValueAtTime(vol, t + dur * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(formant).connect(gain).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Volumi da 0 a 10 (menu Opzioni). */
  setVolumes(music: number, sfx: number): void {
    this.volumes = { music: music / 10, sfx: sfx / 10 };
    this.applyVolumes();
  }

  /** Pausa: congela musica ed effetti esattamente dove sono. */
  suspend(): void {
    this.pausedByGame = true;
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    this.pausedByGame = false;
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    // La musica ha un tetto più basso: deve stare sotto agli effetti.
    this.musicBus.gain.value = this.volumes.music * 0.9;
    this.sfxBus.gain.value = this.volumes.sfx * 1.1;
  }

  private unlock(): void {
    if (!this.ctx) {
      // iPhone: senza "playback" l'interruttore silenzioso spegnerebbe il gioco (Safari 17+).
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.8;
      this.master.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.applyVolumes();
      this.synth = new Synth(ctx, this.sfxBus);
      this.music = new Music(this.synth, this.musicBus);
      ctx.onstatechange = () => this.notify();
      this.notify(); // appena sbloccato (può nascere già "running", senza statechange)
    }
    // Avvisa solo quando cambia qualcosa: i cambi di stato del contesto
    // arrivano già da `onstatechange` (avvisare a ogni tasto o clic ridisegnava i menu).
    if (this.ctx.state === 'suspended' && !this.pausedByGame) void this.ctx.resume();
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    /* storage non disponibile: pazienza */
  }
}
