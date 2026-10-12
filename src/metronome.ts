import { engine } from './engine'

/** Metrônomo com agendamento no relógio do áudio (não atrasa nem oscila com a tela). */
class Metronome {
  bpm = 120
  beats = 4
  volume = 0.7
  /** Lado do clique: -1 = só esquerdo, 0 = centro, 1 = só direito (fone de ouvido sem mandar o clique para o PA). */
  pan = 0
  running = false
  onBeat: ((beat: number) => void) | null = null
  private next = 0
  private beat = 0
  private timer: ReturnType<typeof setInterval> | null = null

  start() {
    const ctx = engine.ctx
    if (!ctx || this.running) return
    this.running = true
    this.beat = 0
    this.next = ctx.currentTime + 0.06
    this.timer = setInterval(() => this.tick(), 25)
    this.tick()
  }

  stop() {
    this.running = false
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.onBeat?.(-1)
  }

  /** Início de um compasso (em performance.now) alinhado ao metrônomo, ou null se parado. */
  barAnchor(): number | null {
    const ctx = engine.ctx
    if (!ctx || !this.running) return null
    return performance.now() + (this.next - ctx.currentTime) * 1000 - this.beat * (60000 / this.bpm)
  }

  private tick() {
    const ctx = engine.ctx
    if (!ctx) return
    while (this.next < ctx.currentTime + 0.12) {
      const b = this.beat
      this.click(this.next, b === 0)
      const wait = Math.max(0, (this.next - ctx.currentTime) * 1000)
      setTimeout(() => this.running && this.onBeat?.(b), wait)
      this.beat = (this.beat + 1) % this.beats
      this.next += 60 / this.bpm
    }
  }

  private click(t: number, accent: boolean) {
    const ctx = engine.ctx!
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = accent ? 1760 : 1175
    const peak = this.volume * (accent ? 1 : 0.65)
    g.gain.setValueAtTime(peak, t)
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.06)
    osc.connect(g)
    if (this.pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner()
      p.pan.value = this.pan
      g.connect(p)
      p.connect(ctx.destination)
    } else g.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.07)
  }
}

export const metro = new Metronome()
