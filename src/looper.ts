import { metro } from './metronome'
import { rig } from './rig'
import type { Layer } from './rig'

/** [tempo em batidas, tipo (0 solta, 1 toca, 2 pedal), nota/valor, velocidade] */
export type LoopEv = [number, 0 | 1 | 2, number, number]
/** Formato antigo (uma pista só, sem timbre próprio). */
export type LoopTrack = { bars: number; beats: number; ev: LoopEv[] }
/** Pista gravada: guarda as notas, o timbre (camadas) de quando foi gravada, volume, mudo e a grade de quantização. */
export type Track = { id: string; bars: number; beats: number; ev: LoopEv[]; layers?: Layer[]; vol: number; mute?: boolean; q?: number }
export const MAX_TRACKS = 4
/** Grades de quantização em batidas: desligada, 1/4, 1/8, 1/16. */
export const Q_STEPS = [0, 1, 0.5, 0.25]
export const Q_LABEL: Record<number, string> = { 0: 'Off', 1: '1/4', 0.5: '1/8', 0.25: '1/16' }

type St = 'idle' | 'count' | 'rec'
type Rt = { id: string; idx: number; cycle: number; ghost: number | null; heldP: Set<number>; susP: boolean; key: string; evq: LoopEv[] }

const uid = () => Math.random().toString(36).slice(2, 9)

/** Acerta as notas na grade (sem mudar o tamanho de cada nota). `len` e `g` em batidas. */
export function quantizeEv(ev: LoopEv[], len: number, g: number): LoopEv[] {
  if (!g) return ev
  const pend = new Map<number, { d: number; on: number }[]>()
  const out: LoopEv[] = []
  const clamp = (t: number) => Math.max(0, Math.min(len - 0.01, t))
  for (const e of ev) {
    if (e[1] === 1) {
      let t = Math.round(e[0] / g) * g
      if (t >= len) t -= len
      const q = pend.get(e[2]) ?? []
      q.push({ d: t - e[0], on: t })
      pend.set(e[2], q)
      out.push([clamp(t), 1, e[2], e[3]])
    } else if (e[1] === 0) {
      const m = pend.get(e[2])?.shift()
      const t = m ? Math.max(m.on + 0.03, e[0] + m.d) : e[0]
      out.push([clamp(t), 0, e[2], 0])
    } else out.push(e)
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

/** Gravador de várias pistas: grava o que você toca (MIDI) e repete em loop, no tempo do metrônomo. */
class Looper {
  state: St = 'idle'
  playing = false
  bpm = 120
  beats = 4
  tracks: Track[] = []
  onState: (() => void) | null = null
  onDone: ((t: Track) => void) | null = null
  private t0 = 0
  private rec: LoopEv[] = []
  private snap: Layer[] = []
  private down = new Set<number>()
  private sus = false
  private timer: ReturnType<typeof setInterval> | null = null
  private startTimer: ReturnType<typeof setTimeout> | null = null
  private rts = new Map<string, Rt>()

  private set(s: St) {
    this.state = s
    this.onState?.()
  }
  private setPlaying(p: boolean) {
    if (this.playing === p) return
    this.playing = p
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

  /** Próximo começo de volta da primeira pista (as outras pistas têm múltiplos do tamanho dela). */
  private nextMaster(minGap: number): number {
    const m = this.tracks[0]
    const rt = m && this.rts.get(m.id)
    if (!m || !rt) return this.nextBar(minGap)
    const len = m.bars * m.beats * this.beatMs()
    const now = performance.now()
    let t = rt.cycle
    if (t <= now) t += Math.ceil((now - t) / len) * len
    while (t - now < minGap) t += len
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

  /** Começa a gravar uma nova pista, no próximo compasso (ou na próxima volta, se já há pistas). As outras tocam junto. */
  record() {
    if (this.tracks.length >= MAX_TRACKS) return
    this.rec = []
    this.down.clear()
    this.sus = false
    this.snap = rig.getLayers()
    const bar = this.beats * this.beatMs()
    if (this.tracks.length && !this.playing) {
      const T = this.nextBar(bar * 0.4)
      this.openAll(T)
      this.t0 = T
    } else if (this.tracks.length) this.t0 = this.nextMaster(bar * 0.4)
    else this.t0 = this.nextBar(bar * 0.4)
    this.set('count')
    this.startTimer = setTimeout(() => { if (this.state === 'count') this.set('rec') }, Math.max(0, this.t0 - performance.now()))
  }

  /** Para a contagem/gravação. Ao fechar uma gravação, guarda a pista e já toca. */
  stop() {
    if (this.startTimer) clearTimeout(this.startTimer)
    this.startTimer = null
    if (this.state === 'count') { this.set('idle'); return }
    if (this.state !== 'rec') { this.stopPlay(); return }
    const bm = this.beatMs()
    let bars = Math.max(1, Math.ceil((performance.now() - this.t0) / bm / this.beats - 0.1))
    const m = this.tracks[0]
    if (m) bars = Math.ceil(bars / m.bars) * m.bars
    const end = bars * this.beats - 0.01
    this.down.forEach((n) => this.rec.push([end, 0, n, 0]))
    if (this.sus) this.rec.push([end, 2, 0, 0])
    if (!this.rec.some((e) => e[1] === 1)) { this.set('idle'); return }
    const tr: Track = { id: uid(), bars, beats: this.beats, ev: this.rec.slice().sort((x, y) => x[0] - y[0]), layers: this.snap, vol: 100, q: 0 }
    const T = this.playing ? this.nextMaster(40) : this.nextBar(60)
    this.tracks = [...this.tracks, tr]
    this.set('idle')
    this.onDone?.(tr)
    if (this.playing) this.openRt(tr, T)
    else this.openAll(T)
  }

  /** Toca todas as pistas juntas, a partir do próximo compasso. */
  playAll() {
    if (!this.tracks.length) return
    this.stopPlay()
    this.openAll(metro.running ? this.nextBar(60) : performance.now() + 60)
  }

  private openAll(T: number) {
    this.tracks.forEach((tr) => { if (!this.rts.has(tr.id)) this.openRt(tr, T) })
  }

  private openRt(tr: Track, T: number) {
    const ghost = tr.layers ? rig.ghostOpen(tr.layers, tr.vol) : null
    this.rts.set(tr.id, { id: tr.id, idx: 0, cycle: T, ghost, heldP: new Set(), susP: false, key: '', evq: [] })
    if (!this.timer) this.timer = setInterval(() => this.tick(), 20)
    this.setPlaying(true)
  }

  private closeRt(rt: Rt) {
    this.release(rt)
    if (rt.ghost != null) rig.ghostClose(rt.ghost)
    this.rts.delete(rt.id)
  }

  /** O app avisou que a lista de pistas mudou (apagar, mudo, volume, quantização). */
  sync() {
    for (const rt of [...this.rts.values()]) {
      const tr = this.tracks.find((t) => t.id === rt.id)
      if (!tr) { this.closeRt(rt); continue }
      if (rt.ghost != null) rig.ghostVol(rt.ghost, tr.vol)
      if (tr.mute) this.release(rt)
    }
    if (this.playing && !this.rts.size) this.stopPlay()
  }

  private evOf(tr: Track, rt: Rt): LoopEv[] {
    const key = `${tr.q ?? 0}:${tr.ev.length}`
    if (rt.key !== key) {
      rt.key = key
      rt.evq = quantizeEv(tr.ev, tr.bars * tr.beats, tr.q ?? 0)
      this.release(rt)
      const bm = this.beatMs()
      const pos = (performance.now() - rt.cycle) / bm
      const i = rt.evq.findIndex((e) => e[0] >= pos)
      rt.idx = i < 0 ? rt.evq.length : i
    }
    return rt.evq
  }

  private fire(rt: Rt, tr: Track, e: LoopEv) {
    if (tr.mute) return
    const vel = e[1] === 1 ? Math.max(1, Math.min(127, Math.round(e[3] * (rt.ghost == null ? tr.vol / 127 : 1)))) : e[3]
    if (rt.ghost != null) {
      if (e[1] === 1) { rig.ghostNoteOn(rt.ghost, e[2], vel); rt.heldP.add(e[2]) }
      else if (e[1] === 0) { rig.ghostNoteOff(rt.ghost, e[2]); rt.heldP.delete(e[2]) }
      else { rig.ghostSustain(rt.ghost, e[2] >= 64); rt.susP = e[2] >= 64 }
      return
    }
    // pista do formato antigo: toca com o timbre que está ativo agora
    rig.muteHook = true
    try {
      if (e[1] === 1) { rig.noteOn(e[2], vel); rt.heldP.add(e[2]) }
      else if (e[1] === 0) { rig.noteOff(e[2]); rt.heldP.delete(e[2]) }
      else { rig.cc(64, e[2]); rt.susP = e[2] >= 64 }
    } finally { rig.muteHook = false }
  }

  private release(rt: Rt) {
    if (rt.ghost != null) {
      rt.heldP.forEach((n) => rig.ghostNoteOff(rt.ghost!, n))
      if (rt.susP) rig.ghostSustain(rt.ghost, false)
    } else {
      rig.muteHook = true
      try {
        rt.heldP.forEach((n) => rig.noteOff(n))
        if (rt.susP) rig.cc(64, 0)
      } finally { rig.muteHook = false }
    }
    rt.heldP.clear()
    rt.susP = false
  }

  private tick() {
    const bm = this.beatMs()
    const now = performance.now()
    for (const rt of this.rts.values()) {
      const tr = this.tracks.find((t) => t.id === rt.id)
      if (!tr) continue
      const ev = this.evOf(tr, rt)
      const len = tr.bars * tr.beats * bm
      for (let g = 0; g < 5000; g++) {
        const e = ev[rt.idx]
        if (e) {
          if (now < rt.cycle + e[0] * bm) break
          this.fire(rt, tr, e)
          rt.idx++
        } else {
          if (now < rt.cycle + len) break
          rt.cycle += len
          rt.idx = 0
        }
      }
    }
  }

  stopPlay() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const rt of [...this.rts.values()]) this.closeRt(rt)
    this.setPlaying(false)
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
try { (window as unknown as { __looper?: unknown }).__looper = { looper, quantizeEv } } catch { /* sem janela */ }
