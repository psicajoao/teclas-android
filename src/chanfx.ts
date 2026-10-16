/** Página de som por canal: Compressor (FX A), Equalizador (FX B) e Ajustes. */
export type CompCfg = { on: boolean; inGain: number; attack: number; release: number; ratio: number; threshold: number; mix: number; outGain: number }
export type EqCfg = { on: boolean; bands: number[] }
export type SetCfg = { blockSustain: boolean; transpose: number; voices: number; volRange: number; sampler: number; pan: number }
export type OdCfg = { drive: number; tone: number; level: number }
export type SndCfg = { comp: CompCfg; eq: EqCfg; set: SetCfg; od?: OdCfg | null }
export type SndPatch = { comp?: Partial<CompCfg>; eq?: Partial<EqCfg>; set?: Partial<SetCfg> }

export const EQ_FREQS = [60, 150, 400, 1000, 2400, 6000, 10000, 16000]
export const EQ_LABELS = ['60 Hz', '150 Hz', '400 Hz', '1 kHz', '2,4 kHz', '6 kHz', '10 kHz', '16 kHz']

export const defaultSnd = (): SndCfg => ({
  comp: { on: false, inGain: 0, attack: 10, release: 150, ratio: 4, threshold: -24, mix: 100, outGain: 0 },
  eq: { on: false, bands: Array(8).fill(0) },
  set: { blockSustain: false, transpose: 0, voices: 64, volRange: 0, sampler: 0, pan: 0 },
})

/** Config completa de uma camada (completa o que falta com os padrões). */
export function sndOf(l: { snd?: SndPatch } | undefined): SndCfg {
  const d = defaultSnd()
  const s = l?.snd
  if (!s) return d
  const bands = Array.isArray(s.eq?.bands) ? d.eq.bands.map((v, i) => s.eq!.bands![i] ?? v) : d.eq.bands
  return { comp: { ...d.comp, ...s.comp }, eq: { ...d.eq, ...s.eq, bands }, set: { ...d.set, ...s.set } }
}

export const hasSnd = (l: { snd?: SndPatch } | undefined) => {
  const c = sndOf(l)
  const d = defaultSnd()
  return c.comp.on || c.eq.on || JSON.stringify(c.set) !== JSON.stringify(d.set)
}

export const SND_PRESETS: { name: string; snd: SndPatch }[] = [
  { name: 'Padrão (tudo neutro)', snd: {} },
  { name: 'Mais volume (+6 dB)', snd: { comp: { on: true, inGain: 0, outGain: 6, ratio: 2, threshold: -6, mix: 100 } } },
  { name: 'Mais volume (+12 dB)', snd: { comp: { on: true, inGain: 0, outGain: 12, ratio: 3, threshold: -12, mix: 100 } } },
  { name: 'Compressão suave', snd: { comp: { on: true, ratio: 3, threshold: -20, attack: 20, release: 250, mix: 100, outGain: 3 } } },
  { name: 'Compressão forte (nivela tudo)', snd: { comp: { on: true, ratio: 10, threshold: -30, attack: 5, release: 120, mix: 100, outGain: 6 } } },
  { name: 'Piano brilhante', snd: { eq: { on: true, bands: [0, -1, -1, 0, 2, 3, 3, 2] } } },
  { name: 'Pad quente (menos agudo)', snd: { eq: { on: true, bands: [2, 2, 1, 0, -1, -3, -5, -6] } } },
  { name: 'Corta graves (baixo do outro teclado)', snd: { eq: { on: true, bands: [-12, -8, -3, 0, 0, 0, 0, 0] } } },
]

/** Sem nada alterado: o canal vai direto para a saída, sem gastar processamento. */
export const isNeutral = (c: SndCfg) => !c.od && !c.comp.on && !c.eq.on && c.set.pan === 0 && c.set.sampler === 0 && c.set.volRange === 0

/** Curva de válvula: saturação suave com leve assimetria (harmônicos pares e ímpares, som de órgão/amp). */
function driveCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 2048
  const out = new Float32Array(new ArrayBuffer(n * 4))
  const bias = 0.12
  const norm = Math.tanh(k * (1 + bias))
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    out[i] = Math.tanh(k * (x + bias * Math.abs(x))) / norm
  }
  return out
}

const db = (x: number) => Math.pow(10, x / 20)

/** Cadeia de áudio de um canal MIDI: ganho → compressor (mix seco/molhado) → ganho → EQ 8 bandas → pan → saída. */
export class ChanFx {
  readonly input: GainNode
  private ctx: AudioContext
  private sampler: GainNode
  private clean: GainNode
  private odIn: GainNode
  private shaper: WaveShaperNode
  private tone: BiquadFilterNode
  private odOut: GainNode
  private pre: GainNode
  private dry: GainNode
  private wet: GainNode
  private comp: DynamicsCompressorNode
  private post: GainNode
  private vol: GainNode
  private eq: BiquadFilterNode[]
  private panner: StereoPannerNode
  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx
    const g = () => ctx.createGain()
    this.input = g()
    this.sampler = g()
    this.clean = g()
    this.odIn = g()
    this.odOut = g()
    this.odOut.gain.value = 0
    this.shaper = ctx.createWaveShaper()
    this.shaper.oversample = '4x'
    this.tone = ctx.createBiquadFilter()
    this.tone.type = 'lowpass'
    this.tone.Q.value = 0.7
    this.pre = g()
    this.dry = g()
    this.wet = g()
    this.post = g()
    this.vol = g()
    this.comp = ctx.createDynamicsCompressor()
    this.comp.knee.value = 6
    this.input.connect(this.sampler)
    this.sampler.connect(this.clean)
    this.clean.connect(this.pre)
    this.odIn.connect(this.shaper)
    this.shaper.connect(this.tone)
    this.tone.connect(this.odOut)
    this.odOut.connect(this.pre)
    this.pre.connect(this.dry)
    this.comp.connect(this.wet)
    this.dry.connect(this.post)
    this.wet.connect(this.post)
    this.post.connect(this.vol)
    this.eq = EQ_FREQS.map((f, i) => {
      const b = ctx.createBiquadFilter()
      b.type = i === 0 ? 'lowshelf' : i === 7 ? 'highshelf' : 'peaking'
      b.frequency.value = f
      b.Q.value = 1
      b.gain.value = 0
      return b
    })
    this.panner = ctx.createStereoPanner()
    this.dest = dest
    this.wire(false, false, false, false)
  }
  private dest: AudioNode
  private flags = ''
  /** Liga só o que está em uso (distorção, compressor, EQ, pan): o resto fica fora do grafo e não gasta processador. */
  private wire(od: boolean, comp: boolean, eq: boolean, pan: boolean) {
    const key = [od, comp, eq, pan].join()
    if (key === this.flags) return
    this.flags = key
    const off = (n: AudioNode, to?: AudioNode) => { try { to ? n.disconnect(to) : n.disconnect() } catch { /* */ } }
    off(this.sampler, this.odIn)
    off(this.pre, this.comp)
    off(this.vol)
    this.eq.forEach((b) => off(b))
    off(this.panner)
    if (od) this.sampler.connect(this.odIn)
    if (comp) this.pre.connect(this.comp)
    let prev: AudioNode = this.vol
    if (eq) for (const b of this.eq) { prev.connect(b); prev = b }
    if (pan) { prev.connect(this.panner); this.panner.connect(this.dest) } else prev.connect(this.dest)
  }
  private curveFor = -1
  dispose() {
    try { this.input.disconnect(); this.vol.disconnect(); this.eq.forEach((b) => b.disconnect()); this.panner.disconnect() } catch { /* */ }
  }
  /** `volFrac` = posição do fader (0–1), usada pela "faixa do fader de volume". */
  apply(c: SndCfg, volFrac: number) {
    const t = this.ctx.currentTime
    const sm = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.015)
    const k = c.comp
    this.wire(!!c.od, k.on && k.mix > 0, c.eq.on, c.set.pan !== 0)
    sm(this.sampler.gain, db(c.set.sampler))
    const od = c.od
    if (od) {
      const pre = Math.pow(10, (od.drive / 127) * 1.7) // 1× a 50×
      if (this.curveFor !== Math.round(pre * 10)) {
        this.curveFor = Math.round(pre * 10)
        this.shaper.curve = driveCurve(pre)
      }
      sm(this.odIn.gain, 1)
      this.tone.frequency.setTargetAtTime(1200 * Math.pow(10, (od.tone / 127) * 1.0), t, 0.015)
      sm(this.odOut.gain, Math.max(0.3, 0.83 / Math.pow(pre, 0.45)) * db(((od.level - 64) / 64) * 12))
      sm(this.clean.gain, 0)
    } else {
      sm(this.odOut.gain, 0)
      sm(this.clean.gain, 1)
    }
    sm(this.pre.gain, k.on ? db(k.inGain) : 1)
    sm(this.post.gain, k.on ? db(k.outGain) : 1)
    const mix = k.on ? k.mix / 100 : 0
    sm(this.dry.gain, 1 - mix)
    sm(this.wet.gain, mix)
    this.comp.threshold.setTargetAtTime(k.threshold, t, 0.015)
    this.comp.ratio.setTargetAtTime(k.ratio, t, 0.015)
    this.comp.attack.setTargetAtTime(Math.min(1, k.attack / 1000), t, 0.015)
    this.comp.release.setTargetAtTime(Math.min(1, k.release / 1000), t, 0.015)
    // Folga de volume: o EQ que reforça uma faixa não pode estourar as notas fortes.
    const boost = c.eq.on ? Math.max(0, ...c.eq.bands) : 0
    sm(this.vol.gain, db(c.set.volRange * Math.max(0, Math.min(1, volFrac)) - boost * 0.9))
    this.eq.forEach((b, i) => sm(b.gain, c.eq.on ? c.eq.bands[i] : 0))
    sm(this.panner.pan, Math.max(-1, Math.min(1, c.set.pan / 100)))
  }
}
