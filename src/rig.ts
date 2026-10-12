import { engine } from './engine'
import { TIMBRES } from './timbres'
import { rotorValue, arpStep } from './signal'
import { fxValues, DIVS } from './fx'
import { metro } from './metronome'
import type { FxSlot, ArpCfg } from './fx'

export type Zone = 'all' | 'left' | 'right'
/** lo/hi: primeira e última nota (MIDI) em que a camada toca. Sem lo/hi vale `zone` (formato antigo). */
export type Layer = { timbre: string | null; vol: number; zone: Zone; off?: boolean; pan?: number; reverb?: number; lo?: number; hi?: number; fx?: FxSlot[] }
export type Section = { name: string; layers: Layer[] }

export const LAYER_COUNT = 10
const DRUM_CH = 9
// O sintetizador só toca nos canais 0–15. Canais melódicos: 0–8 e 10–13 para as camadas
// (alocados sob demanda) e 14–15 para o pad. A seção nova usa canais livres, assim o
// crossfade convive com a seção antiga.
const LAYER_CH = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13]
const POOL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13]
const ALL_CH = [...POOL, DRUM_CH]

const byId = (id: string | null) => (id ? (TIMBRES.find((t) => t.id === id) ?? null) : null)
// Timbre efetivo de uma camada: nenhum quando a camada está desligada.
const tim = (l: Layer) => (l.off ? null : byId(l.timbre))
const clamp = (v: number) => Math.max(0, Math.min(127, Math.round(v)))

/** Faixa de notas (primeira, última) em que a camada toca. */
export function rangeOf(l: Layer, split = 60): [number, number] {
  if (l.lo != null || l.hi != null) return [l.lo ?? 0, l.hi ?? 127]
  if (l.zone === 'left') return [0, split - 1]
  if (l.zone === 'right') return [split, 127]
  return [0, 127]
}

type ArpState = { ch: number; notes: { n: number; v: number }[]; down: number; i: number; pos: number; next: number; sounding: { n: number; off: number }[] }

class Rig {
  master = 100
  /** Ponto de divisão do formato antigo (usado só por camadas sem lo/hi). */
  split = 60
  /** Transposição em semitons (não afeta a bateria). */
  transpose = 0
  private layers: Layer[] = []
  /** Canal usado por cada camada (null = sem canal próprio). */
  private assign: (number | null)[] = []
  private gNew = 127
  private oldSet: number[] = []
  /** Canais da música/seção anterior que continuam soando (notas seguradas ou pedal de sustain). */
  private carried: { chs: number[]; t: number }[] = []
  private retireTimer: ReturnType<typeof setInterval> | null = null
  private sustainDown = false
  private held = new Map<number, { ch: number; n: number }[]>()
  private timer: ReturnType<typeof setInterval> | null = null
  private finishFade: (() => void) | null = null

  private level(l: Layer) {
    return clamp((l.vol * this.master) / 127)
  }

  private melodic(l: Layer) {
    const t = tim(l)
    return t && !t.drum ? t : null
  }

  private silenceCh(chs: number[]) {
    for (const [note, outs] of [...this.held]) {
      const drop = outs.filter((o) => chs.includes(o.ch))
      if (!drop.length) continue
      drop.forEach((o) => engine.noteOff(o.n, o.ch))
      const keep = outs.filter((o) => !chs.includes(o.ch))
      if (keep.length) this.held.set(note, keep)
      else this.held.delete(note)
    }
    for (const ch of chs) {
      this.arps.delete(ch)
      engine.cc(123, 0, ch)
    }
  }

  private used() {
    return [...this.assign.filter((c): c is number => c != null), ...this.oldSet, ...this.carried.flatMap((c) => c.chs)]
  }

  private loadLayer(ch: number, l: Layer) {
    const t = this.melodic(l)
    if (!t) return
    engine.program(t.program, ch, t.bank ?? 0, t.lsb ?? 0)
    const f = fxValues(l)
    engine.cc(74, this.cutoffOf(f.cutoff), ch)
    engine.cc(71, f.reso, ch)
    engine.cc(73, f.attack, ch)
    engine.cc(72, f.release, ch)
    engine.cc(7, this.level(l), ch)
    engine.cc(10, f.pan, ch)
    engine.cc(91, f.reverb, ch)
    engine.cc(93, f.chorus, ch)
    engine.cc(94, f.delay, ch)
  }

  /** Corte do filtro: o valor da camada, aberto pela roda de modulação em direção ao máximo. */
  private cutoffOf(base: number) {
    return clamp(base + (this.mod / 127) * (127 - base))
  }

  private syncDrums(layers: Layer[]) {
    const d = layers.find((l) => tim(l)?.drum)
    if (d) {
      engine.program(tim(d)!.program, DRUM_CH)
      engine.cc(7, this.level(d), DRUM_CH)
      engine.cc(11, 127, DRUM_CH)
    } else {
      engine.cc(7, 0, DRUM_CH)
    }
  }

  private setGroup(chs: number[], v: number) {
    const val = clamp(v)
    for (const ch of chs) engine.cc(11, val, ch)
  }

  /** Libera os canais "carregados" quando o pedal sobe e o som já terminou de soar. */
  private retire() {
    const now = performance.now()
    this.carried = this.carried.filter((c) => {
      const age = now - c.t
      const stillHeld = [...this.held.values()].some((outs) => outs.some((o) => c.chs.includes(o.ch)))
      if ((!this.sustainDown && !stillHeld && age > 7000) || age > 45000) {
        this.silenceCh(c.chs)
        this.setGroup(c.chs, 0)
        return false
      }
      return true
    })
    if (!this.carried.length && this.retireTimer) {
      clearInterval(this.retireTimer)
      this.retireTimer = null
    }
  }

  /**
   * Troca para uma seção: instantânea (seconds = 0) ou com crossfade.
   * Com `carry`, o som da seção anterior NÃO é cortado: notas seguradas ou sustentadas pelo
   * pedal continuam soando até acabarem (usado ao trocar de música).
   */
  apply(layers: Layer[], seconds: number, carry = false) {
    this.startRotor()
    if (this.finishFade) this.finishFade()
    let oldChs = this.assign.filter((c): c is number => c != null)
    const need = layers.filter((l) => this.melodic(l)).length
    let free = POOL.filter((c) => !oldChs.includes(c) && !this.used().includes(c))
    if (need > free.length) {
      // canais insuficientes para sobrepor: corta o que for preciso na hora
      const all = [...oldChs, ...this.carried.flatMap((c) => c.chs)]
      this.silenceCh(all)
      this.setGroup(all, 0)
      oldChs = []
      this.carried = []
      free = [...POOL]
    }
    const g0 = this.gNew
    this.silenceCh(free)
    const assign: (number | null)[] = layers.map((l) => (this.melodic(l) ? free.shift()! : null))
    assign.forEach((ch, i) => {
      if (ch == null) return
      engine.cc(11, 0, ch)
      this.loadLayer(ch, layers[i])
    })
    this.syncDrums(layers)
    this.layers = layers.map((l) => ({ ...l }))
    this.assign = assign
    if (carry && oldChs.length) {
      this.carried.push({ chs: oldChs, t: performance.now() })
      if (!this.retireTimer) this.retireTimer = setInterval(() => this.retire(), 500)
      this.oldSet = []
    } else this.oldSet = oldChs
    if (carry) seconds = 0
    this.gNew = 0

    const newChs = () => this.assign.filter((c): c is number => c != null)
    const dur = Math.max(seconds, 0.06) * 1000
    const start = performance.now()
    const finish = () => {
      if (this.timer) clearInterval(this.timer)
      this.timer = null
      this.finishFade = null
      this.gNew = 127
      this.setGroup(newChs(), 127)
      this.setGroup(this.oldSet, 0)
      this.silenceCh(this.oldSet)
      this.oldSet = []
    }
    this.finishFade = finish
    this.timer = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / dur)
      this.gNew = 127 * Math.sin((t * Math.PI) / 2)
      this.setGroup(newChs(), this.gNew)
      this.setGroup(this.oldSet, g0 * Math.cos((t * Math.PI) / 2))
      if (t >= 1) finish()
    }, 20)
  }

  /** Edição ao vivo das camadas da seção atual (sem crossfade). */
  setLayers(layers: Layer[]) {
    this.startRotor()
    this.layers = layers.map((l) => ({ ...l }))
    layers.forEach((l, i) => {
      const has = this.assign[i] ?? null
      if (this.melodic(l)) {
        let ch = has
        if (ch == null) {
          ch = POOL.find((c) => !this.used().includes(c)) ?? null
          if (ch == null) return
          this.assign[i] = ch
          engine.cc(11, this.gNew, ch)
        }
        this.loadLayer(ch, l)
      } else if (has != null) {
        this.silenceCh([has])
        engine.cc(7, 0, has)
        this.assign[i] = null
      }
    })
    this.syncDrums(layers)
  }

  setMaster(v: number) {
    this.master = v
    this.setLayers(this.layers)
    pad.setMaster(v)
  }

  noteOn(note: number, velocity: number) {
    const outs = new Map<string, { ch: number; n: number }>()
    this.layers.forEach((l, i) => {
      const t = tim(l)
      if (!t) return
      const [lo, hi] = rangeOf(l, this.split)
      if (note < lo || note > hi) return
      const ch = t.drum ? DRUM_CH : this.assign[i]
      if (ch == null) return
      if (t.drum) {
        outs.set(`${ch}:${note}`, { ch, n: note })
        return
      }
      const f = fxValues(l)
      const base = Math.max(0, Math.min(127, note + this.transpose))
      if (f.arp) {
        this.arpPress(ch, base, velocity, f.arp)
        return
      }
      let notes = f.chord ? f.chord.map((iv) => base + iv) : [base]
      if (f.oct) {
        const up = notes.map((n) => n + 12 * f.oct!.shift)
        notes = f.oct.both ? [...notes, ...up] : up
      }
      notes.filter((n) => n >= 0 && n <= 127).forEach((n) => outs.set(`${ch}:${n}`, { ch, n }))
    })
    this.held.get(note)?.forEach((o) => engine.noteOff(o.n, o.ch))
    outs.forEach((o) => engine.noteOn(o.n, velocity, o.ch))
    this.held.set(note, [...outs.values()])
  }

  noteOff(note: number) {
    this.held.get(note)?.forEach((o) => engine.noteOff(o.n, o.ch))
    this.held.delete(note)
    const base = Math.max(0, Math.min(127, note + this.transpose))
    for (const st of this.arps.values()) this.arpRelease(st, base)
  }

  /* ---- Arpejador (um por camada/canal) ---- */
  bpm = 120
  private arps = new Map<number, ArpState>()
  private arpTimer: ReturnType<typeof setInterval> | null = null

  private arpCfgOf(ch: number): ArpCfg | null {
    const i = this.assign.indexOf(ch)
    const l = i >= 0 ? this.layers[i] : undefined
    return l && tim(l) ? fxValues(l).arp : null
  }

  private arpPress(ch: number, note: number, vel: number, cfg: ArpCfg) {
    let st = this.arps.get(ch)
    if (!st) {
      st = { ch, notes: [], down: 0, i: 0, pos: 0, next: performance.now(), sounding: [] }
      this.arps.set(ch, st)
    }
    if (cfg.latch && st.down === 0) st.notes = []
    st.down++
    st.notes = st.notes.filter((x) => x.n !== note)
    st.notes.push({ n: note, v: vel })
    if (st.notes.length === 1 && st.sounding.length === 0) {
      // começa no próximo passo da grade do metrônomo (ou da grade fixa, se o metrônomo está parado)
      const now = performance.now()
      const stepMs = (60000 / Math.max(30, this.bpm)) * (DIVS[cfg.div] ?? DIVS[3]).beats
      const anchor = metro.barAnchor() ?? 0
      const k = Math.ceil((now - anchor) / stepMs - 0.02)
      st.i = 0
      st.pos = ((k % Math.max(1, cfg.steps)) + Math.max(1, cfg.steps)) % Math.max(1, cfg.steps)
      st.next = anchor + k * stepMs
    }
    if (!this.arpTimer) this.arpTimer = setInterval(() => this.arpTick(), 6)
  }

  private arpRelease(st: ArpState, note: number) {
    if (!st.notes.some((x) => x.n === note)) return
    st.down = Math.max(0, st.down - 1)
    const cfg = this.arpCfgOf(st.ch)
    if (cfg?.latch || this.sustainDown) return
    st.notes = st.notes.filter((x) => x.n !== note)
  }

  private arpStop(st: ArpState) {
    st.sounding.forEach((s) => engine.noteOff(s.n, st.ch))
    st.sounding = []
    this.arps.delete(st.ch)
  }

  private arpTick() {
    const now = performance.now()
    for (const st of [...this.arps.values()]) {
      const cfg = this.arpCfgOf(st.ch)
      if (!cfg) {
        this.arpStop(st)
        continue
      }
      st.sounding = st.sounding.filter((s) => {
        if (s.off > now) return true
        engine.noteOff(s.n, st.ch)
        return false
      })
      if (!st.notes.length) {
        if (!st.sounding.length) this.arps.delete(st.ch)
        continue
      }
      let guard = 0
      while (st.next <= now && guard++ < 8) this.arpFire(st, cfg, now)
      if (st.next < now - 200) st.next = now
    }
    if (!this.arps.size && this.arpTimer) {
      clearInterval(this.arpTimer)
      this.arpTimer = null
      arpStep.set(-1)
    }
  }

  private arpFire(st: ArpState, cfg: ArpCfg, now: number) {
    const stepMs = (60000 / Math.max(30, this.bpm)) * (DIVS[cfg.div] ?? DIVS[3]).beats
    const idx = st.pos % Math.max(1, cfg.steps)
    const sw = (cfg.swing / 100) * 0.5
    st.next += stepMs * (st.pos % 2 === 0 ? 1 + sw : 1 - sw)
    st.pos++
    arpStep.set(idx)
    if (!cfg.on[idx]) return
    // notas em ordem (ou na ordem tocada), repetidas pelas oitavas
    const base = cfg.style === 5 ? st.notes : [...st.notes].sort((a, b) => a.n - b.n)
    const seq: { n: number; v: number }[] = []
    for (let o = 0; o < Math.max(1, cfg.oct); o++) base.forEach((x) => seq.push({ n: x.n + 12 * o, v: x.v }))
    const L = seq.length
    if (!L) return
    const gateMs = Math.max(25, stepMs * (cfg.gate / 100))
    const fire = (x: { n: number; v: number }) => {
      if (x.n < 0 || x.n > 127) return
      const v = clamp((x.v * cfg.vel[idx]) / 100)
      if (v <= 0) return
      st.sounding = st.sounding.filter((s) => {
        if (s.n !== x.n) return true
        engine.noteOff(s.n, st.ch)
        return false
      })
      engine.noteOn(x.n, v, st.ch)
      st.sounding.push({ n: x.n, off: now + gateMs })
    }
    if (cfg.style === 6) {
      base.forEach(fire)
      return
    }
    const k = st.i++
    let j: number
    switch (cfg.style) {
      case 1:
        j = L - 1 - (k % L)
        break
      case 2: {
        const cyc = Math.max(1, 2 * L - 2)
        const m = k % cyc
        j = m < L ? m : 2 * L - 2 - m
        break
      }
      case 3: {
        const cyc = Math.max(1, 2 * L - 2)
        const m = k % cyc
        j = L - 1 - (m < L ? m : 2 * L - 2 - m)
        break
      }
      case 4:
        j = Math.floor(Math.random() * L)
        break
      default:
        j = k % L
    }
    fire(seq[j])
  }


  /* ---- Rotor (Leslie) do órgão: só quando o som da seção é somente órgão ---- */
  private bend = 8192
  private rotFast = false
  private rotFreq = 0.8
  private rotPhase = 0
  private rotOn = false
  private rotChs: { ch: number; pan: number }[] = []
  private rotTick: ReturnType<typeof setInterval> | null = null
  private rotLast = 0

  private isOrgan(id: string | null) {
    const t = byId(id)
    if (!t || t.drum) return false
    if (t.group === 'Órgãos') return [16, 17, 18].includes(t.program) // drawbar, percussivo, rock (não o de igreja)
    return /hammond|drawbar|b-?3\b|\borgan\b|\borg[aã]o\b|leslie/i.test(t.name)
  }

  /** True quando só há órgão(s) soando na música: o pedal vira a chave de velocidade do rotor. */
  rotorEligible() {
    const act = this.layers.filter((l) => tim(l) && !tim(l)!.drum)
    return act.length > 0 && act.every((l) => this.isOrgan(l.timbre)) && !pad.playing && !this.carried.length
  }

  private startRotor() {
    if (this.rotTick) return
    this.rotLast = performance.now()
    this.rotTick = setInterval(() => this.rotorStep(), 16)
  }

  private rotorStep() {
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.rotLast) / 1000)
    this.rotLast = now
    const should = this.rotorEligible()
    if (should !== this.rotOn) {
      if (!should) this.rotorRestore()
      this.rotOn = should
      rotorValue.set(should ? (this.rotFast ? 'fast' : 'slow') : null)
      if (should) {
        this.rotChs = []
        this.assign.forEach((ch, i) => ch != null && this.rotChs.push({ ch, pan: fxValues(this.layers[i] ?? { timbre: null, vol: 0, zone: 'all' }).pan }))
      }
    }
    if (!this.rotOn) return
    // atualiza a lista de canais (camadas editadas ao vivo)
    this.rotChs = this.assign.flatMap((ch, i) => (ch != null && this.isOrgan(this.layers[i]?.timbre ?? null) ? [{ ch, pan: fxValues(this.layers[i]).pan }] : []))
    const target = this.rotFast ? 6.6 : 0.8
    // inércia do rotor: acelera em ~1,2 s e desacelera em ~3 s
    const rate = target > this.rotFreq ? 4.8 : 1.9
    this.rotFreq = target > this.rotFreq ? Math.min(target, this.rotFreq + rate * dt) : Math.max(target, this.rotFreq - rate * dt)
    this.rotPhase = (this.rotPhase + this.rotFreq * dt) % 1
    const s = Math.sin(this.rotPhase * Math.PI * 2)
    const c = Math.cos(this.rotPhase * Math.PI * 2)
    const f = this.rotFreq
    const fading = this.timer != null
    for (const { ch, pan } of this.rotChs) {
      engine.cc(10, clamp(pan + s * 34), ch) // varredura estéreo
      if (!fading) engine.cc(11, clamp(this.gNew * (0.78 + 0.22 * (0.5 + 0.5 * c))), ch) // tremolo
      engine.pitchBend(Math.max(0, Math.min(16383, Math.round(this.bend + c * f * 3 * 41))), ch) // doppler (vibrato leve)
    }
  }

  private rotorRestore() {
    for (const { ch, pan } of this.rotChs) {
      engine.cc(10, pan, ch)
      engine.cc(11, this.gNew, ch)
      engine.pitchBend(this.bend, ch)
    }
    this.rotChs = []
  }

  /** Alterna o rotor entre lento (coral) e rápido (tremolo). */
  rotorToggle() {
    this.rotFast = !this.rotFast
    if (this.rotOn) rotorValue.set(this.rotFast ? 'fast' : 'slow')
  }

  mod = 0
  cc(controller: number, value: number) {
    if (controller === 64) {
      if (this.rotorEligible()) {
        // só órgão: o pedal vira a chave do rotor (a cada apertada) e não sustenta
        if (value >= 64 && !this.sustainDown) this.rotorToggle()
        this.sustainDown = value >= 64
        return
      }
      this.sustainDown = value >= 64
    }
    if (controller === 7 || controller === 11) return // volume é controlado pelo app
    if (controller === 1) {
      // Roda de modulação = abre o brilho do timbre (corte do filtro): 0 = normal, topo = bem mais agudo/aberto. Sem vibrato.
      this.mod = value
      const v = Math.round(64 + (value / 127) * 63)
      LAYER_CH.forEach((ch) => engine.cc(74, v, ch))
      this.assign.forEach((ch, i) => ch != null && this.layers[i] && engine.cc(74, this.cutoffOf(fxValues(this.layers[i]).cutoff), ch))
      pad.setMod(value)
      return
    }
    if (controller === 74) return // o brilho das camadas é controlado pela roda
    ALL_CH.forEach((ch) => engine.cc(controller, value, ch))
  }

  pitchBend(value: number) {
    this.bend = value
    ALL_CH.forEach((ch) => engine.pitchBend(value, ch))
  }

  panic() {
    engine.panic()
    pad.reset()
    this.held.clear()
    this.arps.clear()
    this.carried = []
    this.sustainDown = false
    ALL_CH.forEach((ch) => engine.cc(123, 0, ch))
  }
}

export const rig = new Rig()

// ---------------------------------------------------------------------------
// Pad contínuo: acorde de quinta (fundamental, oitava, quinta, oitava) que fica
// soando em um tom. A troca de tom faz crossfade entre dois canais (11 e 12).
// ---------------------------------------------------------------------------
const PAD_CH = [14, 15]
const PAD_VELOCITY = 80

class Pad {
  get playing() {
    return this.key !== null
  }
  private cur = 0
  private key: number | null = null
  private program = 89
  private bank = 0
  private lsb = 0
  private vol = 80
  private master = 100
  private gain = [0, 0]
  private notes: number[][] = [[], []]
  private bright = 64
  private mod = 0
  private shimmer = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private finish: (() => void) | null = null

  private level() {
    return clamp((this.vol * this.master) / 127)
  }

  private setGain(i: number, v: number, force = false) {
    const val = clamp(v)
    if (!force && val === this.gain[i]) return
    this.gain[i] = val
    engine.cc(11, val, PAD_CH[i])
  }

  private silence(i: number) {
    this.notes[i].forEach((n) => engine.noteOff(n, PAD_CH[i]))
    this.notes[i] = []
    engine.cc(123, 0, PAD_CH[i])
  }

  private fade(up: number | null, down: number, seconds: number) {
    const dur = Math.max(seconds, 0.06) * 1000
    const g0 = this.gain[down]
    const start = performance.now()
    const done = () => {
      if (this.timer) clearInterval(this.timer)
      this.timer = null
      this.finish = null
      if (up !== null) this.setGain(up, 127)
      this.setGain(down, 0)
      this.silence(down)
    }
    this.finish = done
    this.timer = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / dur)
      if (up !== null) this.setGain(up, 127 * Math.sin((t * Math.PI) / 2))
      this.setGain(down, g0 * Math.cos((t * Math.PI) / 2))
      if (t >= 1) done()
    }, 20)
  }

  private applyTone(ch: number) {
    engine.cc(74, clamp(this.bright + (this.mod * (127 - this.bright)) / 127), ch) // brilho (corte do filtro) + roda de modulação
    engine.cc(91, clamp(30 + this.shimmer * 0.75), ch) // reverb
    engine.cc(93, clamp(this.shimmer * 0.9), ch) // chorus
  }

  setMod(v: number) {
    this.mod = v
    PAD_CH.forEach((ch) => this.applyTone(ch))
  }

  /** Brightness e Shimmer (0–127). */
  setTone(bright: number, shimmer: number) {
    this.bright = bright
    this.shimmer = shimmer
    PAD_CH.forEach((ch) => this.applyTone(ch))
  }

  /** Define o timbre (programa GM) e o volume do pad. */
  configure(t: { program: number; bank?: number; lsb?: number }, vol: number) {
    const program = t.program
    this.program = program
    this.bank = t.bank ?? 0
    this.lsb = t.lsb ?? 0
    this.vol = vol
    PAD_CH.forEach((ch) => {
      engine.program(program, ch, this.bank, this.lsb)
      engine.cc(7, this.level(), ch)
      this.applyTone(ch)
    })
  }

  setMaster(m: number) {
    this.master = m
    PAD_CH.forEach((ch) => engine.cc(7, this.level(), ch))
  }

  /** Toca o pad no tom indicado (0 = C ... 11 = B), entrando por crossfade. */
  play(key: number, seconds: number, force = false) {
    if (!force && this.key === key) return
    if (this.finish) this.finish()
    const old = this.cur
    const nw = 1 - old
    this.silence(nw)
    this.setGain(nw, 0, true)
    engine.program(this.program, PAD_CH[nw], this.bank, this.lsb)
    engine.cc(7, this.level(), PAD_CH[nw])
    this.applyTone(PAD_CH[nw])
    const root = 36 + key
    const notes = [root, root + 12, root + 19, root + 24]
    notes.forEach((n) => engine.noteOn(n, PAD_VELOCITY, PAD_CH[nw]))
    this.notes[nw] = notes
    this.key = key
    this.cur = nw
    this.fade(nw, old, seconds)
  }

  stop(seconds: number) {
    if (this.key === null) return
    if (this.finish) this.finish()
    const old = this.cur
    this.key = null
    this.fade(null, old, seconds)
  }

  reset() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.finish = null
    this.key = null
    this.notes = [[], []]
    this.setGain(0, 0, true)
    this.setGain(1, 0, true)
  }
}

export const pad = new Pad()
