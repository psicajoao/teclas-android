import { metro } from './metronome'
import { rig } from './rig'

/** [tempo em batidas, tipo (0 solta, 1 toca, 2 pedal), nota/valor, velocidade] */
export type LoopEv = [number, 0 | 1 | 2, number, number]
export type LoopTrack = { bars: number; beats: number; ev: LoopEv[] }
type St = 'idle' | 'count' | 'rec' | 'play'

/** Grava as notas tocadas (MIDI) numa pista e repete em loop com o timbre atual, no tempo do metrônomo. */
class Looper {
  state: St = 'idle'
  bpm = 120
  beats = 4
  onState: (() => void) | null = null
  onDone: ((t: LoopTrack) => void) | null = null
  private t0 = 0
  private rec: LoopEv[] = []
  private down = new Set<number>()
  private sus = false
  private timer: ReturnType<typeof setInterval> | null = null
  private startTimer: ReturnType<typeof setTimeout> | null = null
  private track: LoopTrack | null = null
  private idx = 0
  private cycle = 0
  private heldP = new Set<number>()
  private susP = false

  private set(s: St) {
    this.state = s
    this.onState?.()
  }
  private beatMs() { return 60000 / this.bpm }

  /** Próximo começo de compasso do metrônomo (precisa estar ligado). */
  private nextBar(minGap: number): number {
    const bar = metro.beats * (60000 / metro.bpm)
    const a = metro.barAnchor()
    const now = performance.now()
    if (a == null) return now + minGap
    let t = a + Math.ceil((now - a) / bar) * bar
    if (t - now < minGap) t += bar
    return t
  }

  feed(type: 0 | 1 | 2, a: number, b: number) {
    if (this.state !== 'rec') return
    const now = performance.now()
    if (now < this.t0) return
    this.rec.push([(now - this.t0) / this.beatMs(), type, a, b])
    if (type === 1) this.down.add(a)
    else if (type === 0) this.down.delete(a)
    else this.sus = a >= 64
  }

  record() {
    this.stopPlay()
    this.rec = []
    this.down.clear()
    this.sus = false
    const bar = this.beats * this.beatMs()
    this.t0 = this.nextBar(bar * 0.4)
    this.set('count')
    this.startTimer = setTimeout(() => { if (this.state === 'count') this.set('rec') }, Math.max(0, this.t0 - performance.now()))
  }

  /** Para a contagem/gravação. Ao fechar uma gravação, guarda e já toca. */
  stop() {
    if (this.startTimer) clearTimeout(this.startTimer)
    this.startTimer = null
    if (this.state === 'count') { this.set('idle'); return }
    if (this.state !== 'rec') { this.stopPlay(); return }
    const bm = this.beatMs()
    const bars = Math.max(1, Math.ceil((performance.now() - this.t0) / bm / this.beats - 0.1))
    const end = bars * this.beats - 0.01
    this.down.forEach((n) => this.rec.push([end, 0, n, 0]))
    if (this.sus) this.rec.push([end, 2, 0, 0])
    if (!this.rec.some((e) => e[1] === 1)) { this.set('idle'); return }
    const tr: LoopTrack = { bars, beats: this.beats, ev: this.rec.slice().sort((x, y) => x[0] - y[0]) }
    this.onDone?.(tr)
    this.play(tr)
  }

  play(t: LoopTrack) {
    this.stopPlay()
    this.track = t
    this.idx = 0
    this.cycle = metro.running ? this.nextBar(60) : performance.now() + 60
    this.set('play')
    this.timer = setInterval(() => this.tick(), 20)
  }

  private fire(e: LoopEv) {
    rig.muteHook = true
    try {
      if (e[1] === 1) { rig.noteOn(e[2], e[3]); this.heldP.add(e[2]) }
      else if (e[1] === 0) { rig.noteOff(e[2]); this.heldP.delete(e[2]) }
      else { rig.cc(64, e[2]); this.susP = e[2] >= 64 }
    } finally { rig.muteHook = false }
  }

  private tick() {
    const t = this.track
    if (!t) return
    const bm = this.beatMs()
    const len = t.bars * t.beats * bm
    const now = performance.now()
    for (let g = 0; g < 5000; g++) {
      const ev = t.ev[this.idx]
      if (ev) {
        if (now < this.cycle + ev[0] * bm) break
        this.fire(ev)
        this.idx++
      } else {
        if (now < this.cycle + len) break
        this.cycle += len
        this.idx = 0
      }
    }
  }

  stopPlay() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    rig.muteHook = true
    try {
      this.heldP.forEach((n) => rig.noteOff(n))
      if (this.susP) rig.cc(64, 0)
    } finally { rig.muteHook = false }
    this.heldP.clear()
    this.susP = false
    if (this.state === 'play') this.set('idle')
  }

  /** Para tudo (troca de música etc.). */
  halt() {
    if (this.startTimer) clearTimeout(this.startTimer)
    this.startTimer = null
    this.stopPlay()
    if (this.state !== 'idle') this.set('idle')
  }
}

export const looper = new Looper()
rig.onInput = (type, a, b) => looper.feed(type, a, b)
