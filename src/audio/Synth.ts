/**
 * Mattoncini di sintesi: toni con glissato e raffiche di rumore filtrato.
 * Tutto generato al volo con Web Audio, nessun file audio.
 */
export class Synth {
  readonly noise: AudioBuffer;

  constructor(
    readonly ctx: AudioContext,
    readonly out: AudioNode,
  ) {
    // 1 s di rumore bianco riutilizzabile.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  /** Tono con glissato da `from` a `to` Hz e inviluppo semplice. */
  tone(o: {
    type: OscillatorType;
    from: number;
    to?: number;
    dur: number;
    vol: number;
    when?: number;
    attack?: number;
    out?: AudioNode;
    vibrato?: { rate: number; depth: number };
  }): OscillatorNode {
    const t = o.when ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.from, t);
    if (o.to !== undefined)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);

    const gain = this.envelope(t, o.dur, o.vol, o.attack ?? 0.005);
    osc.connect(gain).connect(o.out ?? this.out);
    if (o.vibrato) this.vibrato(osc.frequency, t, o.dur, o.vibrato.rate, o.vibrato.depth);
    osc.start(t);
    osc.stop(t + o.dur + 0.02);
    return osc;
  }

  /** Rumore filtrato con frequenza del filtro che scorre da `from` a `to`. */
  noiseBurst(o: {
    filter: BiquadFilterType;
    from: number;
    to?: number;
    q?: number;
    dur: number;
    vol: number;
    when?: number;
    attack?: number;
    out?: AudioNode;
  }): AudioBufferSourceNode {
    const t = o.when ?? this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = o.filter;
    filter.Q.value = o.q ?? 1;
    filter.frequency.setValueAtTime(o.from, t);
    if (o.to !== undefined) filter.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const gain = this.envelope(t, o.dur, o.vol, o.attack ?? 0.003);
    src
      .connect(filter)
      .connect(gain)
      .connect(o.out ?? this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.02);
    return src;
  }

  /** Inviluppo attacco → decadimento esponenziale fino al silenzio. */
  envelope(t: number, dur: number, vol: number, attack: number): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return gain;
  }

  vibrato(param: AudioParam, t: number, dur: number, rate: number, depth: number): void {
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = rate;
    const amount = this.ctx.createGain();
    amount.gain.value = depth;
    lfo.connect(amount).connect(param);
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
  }
}
