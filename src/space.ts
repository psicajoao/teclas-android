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
  constructor() { super(); this.W = 2048; this.size = 8192; this.buf = [new Float32Array(8192), new Float32Array(8192)]; this.w = 0; this.p = 0 }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0]
    if (!out || !out.length) return true
    const r = params.ratio[0], W = this.W, size = this.size, mask = size - 1
    const n = out[0].length
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < out.length; c++) this.buf[c][this.w] = inp[c] ? inp[c][i] : inp[0] ? inp[0][i] : 0
      const p = this.p
      let pB = p + 0.5; if (pB >= 1) pB -= 1
      const wA = Math.sin(Math.PI * p) ** 2, wB = Math.sin(Math.PI * pB) ** 2
      for (let c = 0; c < out.length; c++) {
        const b = this.buf[c]
        const read = (d) => { const pos = this.w - d + size; const i0 = Math.floor(pos); const f = pos - i0; return b[i0 & mask] * (1 - f) + b[(i0 + 1) & mask] * f }
        out[c][i] = wA * read(p * W) + wB * read(pB * W)
      }
      this.w = (this.w + 1) & mask
      let np = p + (1 - r) / W
      if (np >= 1) np -= 1; if (np < 0) np += 1
      this.p = np
    }
    return true
  }
})`

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
    verb.buffer = makeIR(ctx, 4.8, 2.6, 0.85)
    this.rev.connect(verb)
    verb.connect(g(0.9)).connect(out)
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
    verb.buffer = makeIR(ctx, 6.5, 2.2, 0.7)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 9000
    const fb = ctx.createGain()
    fb.gain.value = 0.42
    const loop = ctx.createDelay(0.5)
    loop.delayTime.value = 0.03
    const direct = ctx.createGain()
    direct.gain.value = 0.55
    const wet = ctx.createGain()
    wet.gain.value = 1.0
    this.shim.connect(hp)
    hp.connect(shift)
    shift.connect(verb)
    hp.connect(direct).connect(verb)
    verb.connect(lp)
    lp.connect(wet).connect(out)
    lp.connect(fb).connect(loop).connect(shift)
  }
}
