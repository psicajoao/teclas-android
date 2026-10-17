/**
 * Espaço do som: reverberação profunda, eco no andamento e shimmer (reverb com oitava acima),
 * compartilhados por todos os canais. Cada canal só manda uma parte do seu som para cá (envio).
 * Nada disso usa SoundFont: é tudo gerado no navegador.
 */
import { synTempo } from './synth'

export type SpaceCfg = { rev: number; dly: number; shim: number }
export const noSpace = (): SpaceCfg => ({ rev: 0, dly: 0, shim: 0 })
export const hasSpace = (s: SpaceCfg | undefined) => !!s && (s.rev > 0 || s.dly > 0 || s.shim > 0)

/** Processador que sobe a altura do som (granular, duas janelas cruzadas). */
const SHIFT_SRC = `
registerProcessor('palco-shift', class extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'ratio', defaultValue: 2, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }] }
  constructor() {
    super()
    this.W = 4096; this.size = 16384; this.mask = 16383
    this.bl = new Float32Array(16384); this.br = new Float32Array(16384)
    this.w = 0; this.p = 0; this.quiet = 0
    this.win = new Float32Array(4097)
    for (let i = 0; i <= 4096; i++) { const s = Math.sin(Math.PI * i / 4096); this.win[i] = s * s }
  }
  process(inputs, outputs, params) {
    const out = outputs[0]
    if (!out || !out.length) return true
    const inp = inputs[0]
    const n = out[0].length
    const inL = inp && inp[0] ? inp[0] : null
    const inR = inp && inp[1] ? inp[1] : inL
    // silêncio prolongado: não gasta processador (a cauda da realimentação já acabou)
    let pk = 0
    if (inL) for (let i = 0; i < n; i++) { const a = inL[i] < 0 ? -inL[i] : inL[i]; if (a > pk) pk = a }
    if (pk < 1e-6) { this.quiet++ } else this.quiet = 0
    if (this.quiet > 600) { if (this.quiet === 601) { this.bl.fill(0); this.br.fill(0) } return true }
    const r = params.ratio[0], W = this.W, size = this.size, mask = this.mask, win = this.win
    const oL = out[0], oR = out[1] || out[0]
    const bl = this.bl, br = this.br
    let w = this.w, p = this.p
    const step = (1 - r) / W
    for (let i = 0; i < n; i++) {
      let xl = inL ? inL[i] : 0, xr = inR ? inR[i] : 0
      if (xl < 1e-18 && xl > -1e-18) xl = 0
      if (xr < 1e-18 && xr > -1e-18) xr = 0
      bl[w] = xl; br[w] = xr
      let pB = p + 0.5; if (pB >= 1) pB -= 1
      const wA = win[(p * 4096) | 0], wB = win[(pB * 4096) | 0]
      let pos = w - p * W + size
      let i0 = pos | 0, f = pos - i0
      const al = bl[i0 & mask] * (1 - f) + bl[(i0 + 1) & mask] * f
      const ar = br[i0 & mask] * (1 - f) + br[(i0 + 1) & mask] * f
      pos = w - pB * W + size
      i0 = pos | 0; f = pos - i0
      const bL2 = bl[i0 & mask] * (1 - f) + bl[(i0 + 1) & mask] * f
      const bR2 = br[i0 & mask] * (1 - f) + br[(i0 + 1) & mask] * f
      oL[i] = wA * al + wB * bL2
      oR[i] = wA * ar + wB * bR2
      w = (w + 1) & mask
      p += step
      if (p >= 1) p -= 1; else if (p < 0) p += 1
    }
    this.w = w; this.p = p
    return true
  }
})
`

/** Resposta de impulso de sala/igreja: ruído com decaimento e escurecimento progressivo dos agudos. */
function makeIR(ctx: BaseAudioContext, seconds: number, decay: number, dark: number): AudioBuffer {
  const rate = ctx.sampleRate
  const pre = Math.floor(rate * 0.02)
  const len = Math.floor(rate * seconds)
  const buf = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let y = 0
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre)
      const a = Math.max(0.04, 1 - dark * Math.sqrt(t)) // coeficiente do filtro: cai com o tempo (agudos somem antes)
      y += a * ((Math.random() * 2 - 1) - y)
      d[i] = y * Math.pow(1 - t, decay)
    }
  }
  return buf
}

export class SpaceBus {
  readonly rev: GainNode
  readonly dly: GainNode
  readonly shim: GainNode
  private dL: DelayNode
  private dR: DelayNode
  private ctx: AudioContext
  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n }
    // reverberação profunda
    this.rev = g()
    const verb = ctx.createConvolver()
    verb.buffer = makeIR(ctx, 3.2, 3.0, 0.85)
    this.rev.connect(verb)
    verb.connect(g(1.6)).connect(out)
    // eco pingue-pongue em colcheia pontuada (acompanha o andamento)
    this.dly = g()
    this.dL = ctx.createDelay(2)
    this.dR = ctx.createDelay(2)
    const fbL = g(0.4)
    const fbR = g(0.4)
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 3600
    this.dly.connect(this.dL)
    this.dL.connect(tone)
    tone.connect(fbL).connect(this.dR)
    this.dR.connect(fbR).connect(this.dL)
    const pl = ctx.createStereoPanner(); pl.pan.value = -0.75
    const pr = ctx.createStereoPanner(); pr.pan.value = 0.75
    this.dL.connect(pl).connect(out)
    this.dR.connect(pr).connect(out)
    this.setTempo()
    setInterval(() => this.setTempo(), 300)
    // shimmer: o som entra numa reverb longa junto com uma cópia uma oitava acima, que também volta para dentro (oitavas em cascata)
    this.shim = g()
    void this.buildShimmer(out)
  }
  private setTempo() {
    const t = Math.min(1.9, (60 / Math.max(40, synTempo.bpm)) * 0.75)
    this.dL.delayTime.setTargetAtTime(t, this.ctx.currentTime, 0.05)
    this.dR.delayTime.setTargetAtTime(t, this.ctx.currentTime, 0.05)
  }
  private async buildShimmer(out: AudioNode) {
    const ctx = this.ctx
    const url = URL.createObjectURL(new Blob([SHIFT_SRC], { type: 'text/javascript' }))
    try { await ctx.audioWorklet.addModule(url) } catch { return } finally { URL.revokeObjectURL(url) }
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 260
    const shift = new AudioWorkletNode(ctx, 'palco-shift', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] })
    const verb = ctx.createConvolver()
    verb.buffer = makeIR(ctx, 2.4, 3.6, 0.9)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 5500
    const fb = ctx.createGain()
    fb.gain.value = 0.22
    const loop = ctx.createDelay(0.5)
    loop.delayTime.value = 0.03
    const direct = ctx.createGain()
    direct.gain.value = 0.55
    const wet = ctx.createGain()
    wet.gain.value = 2.0
    // a cópia agravada é suavizada antes da reverb (tira a aspereza do efeito)
    const soft = ctx.createBiquadFilter()
    soft.type = 'lowpass'
    soft.frequency.value = 4200
    this.shim.connect(hp)
    hp.connect(shift)
    shift.connect(soft).connect(verb)
    hp.connect(direct).connect(verb)
    verb.connect(lp)
    lp.connect(wet).connect(out)
    lp.connect(fb).connect(loop).connect(shift)
  }
}
