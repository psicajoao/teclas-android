// Sintetizadores próprios do Palco Keys (pads e leads para worship), feitos no navegador com Web Audio.
// Não usam SoundFont: são osciladores, filtro e envelopes, então não têm nenhuma questão de licença.

export type SynPreset = {
  id: string
  name: string
  /** Osciladores somados; detune em centavos. */
  oscs: { type: OscillatorType; detune: number; level: number }[]
  /** Ataque e release em segundos. */
  attack: number
  release: number
  /** Filtro passa-baixa: corte em Hz e ressonância (Q). */
  cutoff: number
  q: number
  /** Envelope do filtro: começa em cutoff * env e cai para cutoff (1 = sem envelope). */
  env: number
  /** Vibrato: taxa em Hz e profundidade em centavos. */
  vibRate: number
  vibDepth: number
  /** Quanto vai para a reverberação (0 a 1). */
  reverb: number
  /** Volume do patch. */
  gain: number
  /** Eco sincronizado com o andamento (colcheia pontuada): quanto volta (mix) e quantas repetições (fb). */
  delay?: { mix: number; fb: number }
  /** Abre os osciladores no estéreo (0 a 1): metade vai para cada lado, alternando. */
  spread?: number
}

/** Andamento atual do app (o eco dos timbres acompanha). */
export const synTempo = { bpm: 120 }

export const SYN_PRESETS: SynPreset[] = [
  {
    id: 'pad-quente', name: 'Pad Quente Worship',
    oscs: [
      { type: 'sawtooth', detune: -12, level: 0.5 },
      { type: 'sawtooth', detune: 0, level: 0.5 },
      { type: 'sawtooth', detune: 12, level: 0.5 },
    ],
    attack: 0.9, release: 1.8, cutoff: 1400, q: 0.5, env: 1, vibRate: 0.3, vibDepth: 4, reverb: 0.45, gain: 0.22,
  },
  {
    id: 'pad-ar', name: 'Pad Ar e Brilho',
    oscs: [
      { type: 'triangle', detune: -9, level: 0.6 },
      { type: 'triangle', detune: 9, level: 0.6 },
      { type: 'sine', detune: 0, level: 0.5 },
    ],
    attack: 1.4, release: 2.6, cutoff: 2600, q: 0.3, env: 1.2, vibRate: 0.2, vibDepth: 6, reverb: 0.6, gain: 0.3,
  },
  {
    id: 'pad-cordas', name: 'Pad Cordas Sintéticas',
    oscs: [
      { type: 'sawtooth', detune: -18, level: 0.3 },
      { type: 'sawtooth', detune: -6, level: 0.3 },
      { type: 'sawtooth', detune: 6, level: 0.3 },
      { type: 'sawtooth', detune: 18, level: 0.3 },
    ],
    attack: 0.5, release: 1.1, cutoff: 2200, q: 0.8, env: 1.1, vibRate: 4.5, vibDepth: 3, reverb: 0.4, gain: 0.16,
  },
  {
    id: 'lead-saw', name: 'Lead Saw Cantor',
    oscs: [
      { type: 'sawtooth', detune: -6, level: 0.5 },
      { type: 'sawtooth', detune: 6, level: 0.5 },
    ],
    attack: 0.01, release: 0.25, cutoff: 3200, q: 2, env: 1.9, vibRate: 5.2, vibDepth: 10, reverb: 0.25, gain: 0.3,
  },
  {
    id: 'lead-quadrada', name: 'Lead Quadrada Suave',
    oscs: [
      { type: 'square', detune: 0, level: 0.5 },
      { type: 'triangle', detune: 0, level: 0.5 },
    ],
    attack: 0.005, release: 0.2, cutoff: 2400, q: 1.5, env: 1.6, vibRate: 5.5, vibDepth: 6, reverb: 0.2, gain: 0.22,
  },
  {
    id: 'lead-voz', name: 'Lead Voz Sintética',
    oscs: [
      { type: 'triangle', detune: -4, level: 0.6 },
      { type: 'triangle', detune: 4, level: 0.6 },
    ],
    attack: 0.08, release: 0.45, cutoff: 1900, q: 3, env: 1.3, vibRate: 5, vibDepth: 14, reverb: 0.4, gain: 0.35,
  },
  {
    // Lead brilhante de "supersaw" com eco em colcheia pontuada: o som clássico de introdução de louvor eletrônico.
    id: 'lead-trance', name: 'Trance Lead',
    oscs: [
      { type: 'sawtooth', detune: -16, level: 0.32 },
      { type: 'sawtooth', detune: -8, level: 0.32 },
      { type: 'sawtooth', detune: 0, level: 0.32 },
      { type: 'sawtooth', detune: 8, level: 0.32 },
      { type: 'sawtooth', detune: 16, level: 0.32 },
    ],
    attack: 0.004, release: 0.4, cutoff: 3600, q: 1.1, env: 2.6, vibRate: 5.4, vibDepth: 5, reverb: 0.3, gain: 0.2,
    delay: { mix: 0.38, fb: 0.42 },
  },
  {
    // Lead de pluck curto e vivo, ótimo para frases repetidas com o eco.
    id: 'lead-pluck', name: 'Pluck Brilhante',
    oscs: [
      { type: 'sawtooth', detune: -7, level: 0.4 },
      { type: 'square', detune: 7, level: 0.3 },
      { type: 'sawtooth', detune: 0, level: 0.3 },
    ],
    attack: 0.002, release: 0.22, cutoff: 1800, q: 2.2, env: 4.2, vibRate: 5, vibDepth: 3, reverb: 0.22, gain: 0.24,
    delay: { mix: 0.34, fb: 0.38 },
  },
  {
    // Pad largo e etéreo: várias serras abertas com um seno sustentando o fundo.
    id: 'pad-etereo', name: 'Pad Etéreo Amplo',
    oscs: [
      { type: 'sawtooth', detune: -20, level: 0.26 },
      { type: 'sawtooth', detune: -9, level: 0.26 },
      { type: 'sawtooth', detune: 9, level: 0.26 },
      { type: 'sawtooth', detune: 20, level: 0.26 },
      { type: 'triangle', detune: 0, level: 0.4 },
    ],
    attack: 1.6, release: 3.2, cutoff: 1700, q: 0.4, env: 1.5, vibRate: 0.25, vibDepth: 5, reverb: 0.65, gain: 0.2,
  },
  {
    // Swell largo de introdução: serras em duas oitavas, abertas no estéreo, subindo devagar (medido numa gravação de referência).
    id: 'swell-brilho', name: 'Swell Brilhante',
    oscs: [
      { type: 'sawtooth', detune: -14, level: 0.3 },
      { type: 'sawtooth', detune: 0, level: 0.3 },
      { type: 'sawtooth', detune: 14, level: 0.3 },
      { type: 'sawtooth', detune: 1186, level: 0.46 },
      { type: 'sawtooth', detune: 1200, level: 0.46 },
      { type: 'sawtooth', detune: 1214, level: 0.46 },
    ],
    attack: 1.3, release: 2.4, cutoff: 1900, q: 0.5, env: 1.15, vibRate: 0.8, vibDepth: 12, reverb: 0.5, gain: 0.15, spread: 0.8,
  },
]

export const synPreset = (id: string) => SYN_PRESETS.find((p) => p.id === id) ?? null

/** Estado de um canal que o sintetizador usa (vindo dos controles MIDI). */
export type SynChan = { vol: number; expr: number; cut: number; reso: number; bend: number }

type Voice = { ch: number; note: number; amp: GainNode; flt: BiquadFilterNode; oscs: OscillatorNode[]; lfo: OscillatorNode; release: number }

const MAX_VOICES = 16

/** Reverberação simples gerada por ruído com decaimento. */
function impulse(ctx: BaseAudioContext, seconds = 2.6, decay = 3): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return buf
}

export class SynthVoices {
  private ctx: AudioContext
  private bus: GainNode
  private wet: GainNode
  private voices: Voice[] = []
  private dly: DelayNode
  private fb: GainNode
  private sends = new Map<GainNode, GainNode>()

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx
    this.bus = ctx.createGain()
    this.bus.gain.value = 0.9
    this.bus.connect(out)
    const verb = ctx.createConvolver()
    verb.buffer = impulse(ctx)
    this.wet = ctx.createGain()
    this.wet.gain.value = 1
    this.bus.connect(verb)
    verb.connect(this.wet)
    this.wet.connect(out)
    // eco compartilhado (o tempo acompanha o andamento no momento de cada nota)
    this.dly = ctx.createDelay(2)
    const fb = ctx.createGain()
    fb.gain.value = 0.4
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 3800
    this.dly.connect(tone).connect(fb).connect(this.dly)
    tone.connect(this.bus)
    this.fb = fb
  }

  noteOn(ch: number, note: number, velocity: number, p: SynPreset, st: SynChan) {
    const now = this.ctx.currentTime
    // limite de vozes: solta a mais antiga
    const mine = this.voices.filter((v) => v.ch === ch)
    while (mine.length >= MAX_VOICES) this.stop(mine.shift()!, now)

    const f = 440 * Math.pow(2, (note - 69) / 12)
    const amp = this.ctx.createGain()
    const level = (velocity / 127) * p.gain * (st.vol) * (st.expr)
    amp.gain.setValueAtTime(0, now)
    amp.gain.linearRampToValueAtTime(level, now + p.attack)

    const flt = this.ctx.createBiquadFilter()
    flt.type = 'lowpass'
    const cut = Math.min(14000, p.cutoff * st.cut)
    flt.Q.value = Math.max(0.1, p.q + st.reso)
    flt.frequency.setValueAtTime(Math.min(14000, cut * p.env), now)
    flt.frequency.exponentialRampToValueAtTime(Math.max(60, cut), now + Math.max(0.15, p.attack + 0.25))

    // vibrato (LFO) ligado a todos os osciladores
    const lfo = this.ctx.createOscillator()
    lfo.frequency.value = p.vibRate
    const lfoGain = this.ctx.createGain()
    lfoGain.gain.value = p.vibDepth
    lfo.connect(lfoGain)

    const oscs: OscillatorNode[] = []
    for (const o of p.oscs) {
      const osc = this.ctx.createOscillator()
      osc.type = o.type
      osc.frequency.value = f
      osc.detune.value = o.detune + st.bend
      lfoGain.connect(osc.detune)
      const g = this.ctx.createGain()
      g.gain.value = o.level
      if (p.spread) {
        const pan = this.ctx.createStereoPanner()
        pan.pan.value = (oscs.length % 2 ? 1 : -1) * p.spread
        osc.connect(g).connect(pan).connect(flt)
      } else osc.connect(g).connect(flt)
      oscs.push(osc)
    }
    flt.connect(amp).connect(this.bus)
    if (p.delay) {
      this.dly.delayTime.setTargetAtTime(Math.min(1.9, (60 / Math.max(40, synTempo.bpm)) * 0.75), now, 0.05)
      this.fb.gain.setTargetAtTime(p.delay.fb, now, 0.05)
      const send = this.ctx.createGain()
      send.gain.value = p.delay.mix
      amp.connect(send).connect(this.dly)
      this.sends.set(amp, send)
    }

    lfo.start(now)
    oscs.forEach((o) => o.start(now))
    this.voices.push({ ch, note, amp, flt, oscs, lfo, release: p.release })
  }

  noteOff(ch: number, note: number) {
    const now = this.ctx.currentTime
    for (const v of this.voices.filter((x) => x.ch === ch && x.note === note)) this.stop(v, now)
  }

  /** Muda a altura de todas as vozes de um canal (pitch bend), em centavos. */
  bend(ch: number, cents: number) {
    const now = this.ctx.currentTime
    for (const v of this.voices) if (v.ch === ch) v.oscs.forEach((o) => o.detune.setTargetAtTime(cents, now, 0.02))
  }

  allOff() {
    const now = this.ctx.currentTime
    for (const v of [...this.voices]) this.stop(v, now)
  }

  allOffChannel(ch: number) {
    const now = this.ctx.currentTime
    for (const v of this.voices.filter((x) => x.ch === ch)) this.stop(v, now)
  }

  /** Solta a voz com o release do patch e remove ela depois. */
  private stop(v: Voice, now: number) {
    this.voices = this.voices.filter((x) => x !== v)
    const g = v.amp.gain.value
    v.amp.gain.cancelScheduledValues(now)
    v.amp.gain.setValueAtTime(g, now)
    v.amp.gain.linearRampToValueAtTime(0, now + v.release)
    const end = now + v.release + 0.1
    v.oscs.forEach((o) => o.stop(end))
    v.lfo.stop(end)
    setTimeout(() => {
      try { v.amp.disconnect() } catch { /* */ }
      this.sends.delete(v.amp)
    }, (v.release + 0.3) * 1000)
  }
}
