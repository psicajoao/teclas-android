/** Página de som por canal: Compressor (FX A), Equalizador (FX B) e Ajustes. */
export type CompCfg = { on: boolean; inGain: number; attack: number; release: number; ratio: number; threshold: number; mix: number; outGain: number }
export type EqCfg = { on: boolean; bands: number[] }
export type SetCfg = { blockSustain: boolean; transpose: number; voices: number; volRange: number; sampler: number; pan: number }
export type SndCfg = { comp: CompCfg; eq: EqCfg; set: SetCfg }
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

const db = (x: number) => Math.pow(10, x / 20)

/** Cadeia de áudio de um canal MIDI: ganho → compressor (mix seco/molhado) → ganho → EQ 8 bandas → pan → saída. */
export class ChanFx {
  readonly input: GainNode
  private ctx: AudioContext
  private sampler: GainNode
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
    this.pre = g()
    this.dry = g()
    this.wet = g()
    this.post = g()
    this.vol = g()
    this.comp = ctx.createDynamicsCompressor()
    this.comp.knee.value = 6
    this.input.connect(this.sampler)
    this.sampler.connect(this.pre)
    this.pre.connect(this.dry)
    this.pre.connect(this.comp)
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
    let prev: AudioNode = this.vol
    for (const b of this.eq) {
      prev.connect(b)
      prev = b
    }
    this.panner = ctx.createStereoPanner()
    prev.connect(this.panner)
    this.panner.connect(dest)
  }
  /** `volFrac` = posição do fader (0–1), usada pela "faixa do fader de volume". */
  apply(c: SndCfg, volFrac: number) {
    const t = this.ctx.currentTime
    const sm = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.015)
    const k = c.comp
    sm(this.sampler.gain, db(c.set.sampler))
    sm(this.pre.gain, k.on ? db(k.inGain) : 1)
    sm(this.post.gain, k.on ? db(k.outGain) : 1)
    const mix = k.on ? k.mix / 100 : 0
    sm(this.dry.gain, 1 - mix)
    sm(this.wet.gain, mix)
    this.comp.threshold.setTargetAtTime(k.threshold, t, 0.015)
    this.comp.ratio.setTargetAtTime(k.ratio, t, 0.015)
    this.comp.attack.setTargetAtTime(Math.min(1, k.attack / 1000), t, 0.015)
    this.comp.release.setTargetAtTime(Math.min(1, k.release / 1000), t, 0.015)
    sm(this.vol.gain, db(c.set.volRange * Math.max(0, Math.min(1, volFrac))))
    this.eq.forEach((b, i) => sm(b.gain, c.eq.on ? c.eq.bands[i] : 0))
    sm(this.panner.pan, Math.max(-1, Math.min(1, c.set.pan / 100)))
  }
}
