import type { Layer } from './rig'

export type FxType = 'arp' | 'oct' | 'chord' | 'reverb' | 'chorus' | 'delay' | 'pan' | 'filter' | 'env'

/** Arpejador de uma camada. */
export type ArpCfg = {
  style: number // índice em ARP_STYLES
  div: number // índice em DIVS
  steps: number // 1–16
  on: boolean[] // 16 passos: toca ou pausa
  vel: number[] // 16 passos: 0–127 (100 = velocidade tocada)
  oct: number // 1–4 oitavas
  gate: number // 10–100 (% do passo)
  swing: number // 0–100
  latch: boolean // segura as notas depois de soltar as teclas
}

export type FxSlot = { type: FxType | null; on: boolean; p: Record<string, number>; arp?: ArpCfg }

export const ARP_STYLES = [
  { l: 'Sobe', i: '↗' },
  { l: 'Desce', i: '↘' },
  { l: 'Sobe e desce', i: '↕' },
  { l: 'Desce e sobe', i: '⇅' },
  { l: 'Aleatório', i: '⚄' },
  { l: 'Ordem tocada', i: '№' },
  { l: 'Acorde', i: '▮' },
]
export const DIVS = [
  { l: '1/4', beats: 1 },
  { l: '1/8', beats: 0.5 },
  { l: '1/8T', beats: 1 / 3 },
  { l: '1/16', beats: 0.25 },
  { l: '1/16T', beats: 1 / 6 },
  { l: '1/32', beats: 0.125 },
]

export const defaultArp = (): ArpCfg => ({
  style: 0,
  div: 3,
  steps: 16,
  on: Array(16).fill(true),
  vel: Array(16).fill(100),
  oct: 1,
  gate: 70,
  swing: 0,
  latch: false,
})

const A = (over: Partial<ArpCfg>, pattern?: number[], on?: boolean[]): ArpCfg => {
  const a = { ...defaultArp(), ...over }
  if (pattern) a.vel = Array.from({ length: 16 }, (_, i) => pattern[i % pattern.length])
  if (on) a.on = Array.from({ length: 16 }, (_, i) => on[i % on.length])
  return a
}
export const ARP_PRESETS: { name: string; cfg: ArpCfg }[] = [
  { name: 'Clássico 1/16', cfg: A({}) },
  { name: 'Trance (sobe e desce)', cfg: A({ style: 2, oct: 2, gate: 55 }, [118, 80, 100, 80]) },
  { name: 'Pulsante 1/8', cfg: A({ div: 1, gate: 60 }, [120, 85]) },
  { name: 'Sincopado', cfg: A({ steps: 16, gate: 50 }, [120, 90, 100, 85], [true, false, true, true, false, true, true, false]) },
  { name: 'Balanço (swing)', cfg: A({ div: 1, swing: 60, gate: 70 }, [115, 90]) },
  { name: 'Cascata (desce)', cfg: A({ style: 1, oct: 3, gate: 45 }, [110, 90, 80, 70]) },
  { name: 'Aleatório', cfg: A({ style: 4, oct: 2, gate: 50 }) },
  { name: 'Acordes em pulso', cfg: A({ style: 6, div: 1, steps: 8, gate: 40 }, [120, 80]) },
]

export type ParamDef =
  | { kind: 'knob'; key: string; label: string; def: number; fmt?: (v: number) => string }
  | { kind: 'seg'; key: string; label: string; def: number; options: { v: number; l: string }[] }

export type FxDef = { type: FxType; label: string; kind: 'midi' | 'audio'; hint: string; params: ParamDef[] }

const pct = (v: number) => `${Math.round((v / 127) * 100)}%`
const bip = (v: number) => {
  const d = Math.round(((v - 64) / 64) * 100)
  return d === 0 ? 'normal' : d > 0 ? `+${d}` : `${d}`
}

export const CHORDS = [
  { v: 0, l: 'Maior', iv: [0, 4, 7] },
  { v: 1, l: 'Menor', iv: [0, 3, 7] },
  { v: 2, l: 'Quinta (power)', iv: [0, 7] },
  { v: 3, l: 'Sus4', iv: [0, 5, 7] },
  { v: 4, l: '7ª maior', iv: [0, 4, 7, 11] },
  { v: 5, l: '7ª', iv: [0, 4, 7, 10] },
]

export const FX_DEFS: FxDef[] = [
  { type: 'arp', label: 'Arpejador', kind: 'midi', hint: 'Toca as notas que você segura em sequência.', params: [] },
  {
    type: 'oct',
    label: 'Oitava',
    kind: 'midi',
    hint: 'Sobe ou desce o som em oitavas, ou dobra com a nota original.',
    params: [
      {
        kind: 'seg',
        key: 'shift',
        label: 'Oitavas',
        def: 1,
        options: [
          { v: -2, l: '−2' },
          { v: -1, l: '−1' },
          { v: 1, l: '+1' },
          { v: 2, l: '+2' },
        ],
      },
      {
        kind: 'seg',
        key: 'both',
        label: 'Modo',
        def: 1,
        options: [
          { v: 0, l: 'Só a oitava' },
          { v: 1, l: 'Dobrar com a nota' },
        ],
      },
    ],
  },
  {
    type: 'chord',
    label: 'Acorde',
    kind: 'midi',
    hint: 'Cada nota que você toca vira um acorde.',
    params: [{ kind: 'seg', key: 'kind', label: 'Acorde', def: 0, options: CHORDS.map((c) => ({ v: c.v, l: c.l })) }],
  },
  { type: 'reverb', label: 'Reverb', kind: 'audio', hint: 'Espaço e ambiente do som.', params: [{ kind: 'knob', key: 'level', label: 'Quantidade', def: 40, fmt: pct }] },
  { type: 'chorus', label: 'Chorus', kind: 'audio', hint: 'Dobra e alarga o som.', params: [{ kind: 'knob', key: 'level', label: 'Quantidade', def: 50, fmt: pct }] },
  { type: 'delay', label: 'Delay', kind: 'audio', hint: 'Eco que repete a nota.', params: [{ kind: 'knob', key: 'level', label: 'Quantidade', def: 45, fmt: pct }] },
  { type: 'pan', label: 'Pan', kind: 'audio', hint: 'Posição do som entre esquerda e direita.', params: [{ kind: 'knob', key: 'pan', label: 'Posição', def: 64, fmt: (v) => (v === 64 ? 'centro' : v < 64 ? `E ${Math.round(((64 - v) / 64) * 100)}` : `D ${Math.round(((v - 64) / 63) * 100)}`) }] },
  {
    type: 'filter',
    label: 'Filtro',
    kind: 'audio',
    hint: 'Cutoff deixa o som mais escuro ou mais brilhante. Ressonância realça o corte.',
    params: [
      { kind: 'knob', key: 'cutoff', label: 'Cutoff', def: 64, fmt: bip },
      { kind: 'knob', key: 'reso', label: 'Ressonância', def: 64, fmt: bip },
    ],
  },
  {
    type: 'env',
    label: 'Envelope',
    kind: 'audio',
    hint: 'Ataque: quão rápido o som entra. Release: quanto ele demora a sumir.',
    params: [
      { kind: 'knob', key: 'attack', label: 'Ataque', def: 64, fmt: bip },
      { kind: 'knob', key: 'release', label: 'Release', def: 64, fmt: bip },
    ],
  },
]
export const fxDef = (t: FxType | null) => FX_DEFS.find((d) => d.type === t) ?? null

export function newSlot(type: FxType | null, on = true): FxSlot {
  if (!type) return { type: null, on: false, p: {} }
  const d = fxDef(type)!
  const p: Record<string, number> = {}
  d.params.forEach((q) => (p[q.key] = q.def))
  return type === 'arp' ? { type, on, p, arp: defaultArp() } : { type, on, p }
}

/** Os 3 efeitos da camada. Sem `fx` salvo: Reverb e Pan vindos dos valores antigos da camada. */
export function slotsOf(l: Layer): FxSlot[] {
  if (l.fx && l.fx.length === 3) return l.fx
  const rev = newSlot('reverb')
  rev.p.level = l.reverb ?? 40
  const pan = newSlot('pan')
  pan.p.pan = l.pan ?? 64
  return [newSlot(null), rev, pan]
}

export type FxValues = {
  pan: number
  reverb: number
  chorus: number
  delay: number
  cutoff: number
  reso: number
  attack: number
  release: number
  oct: { shift: number; both: boolean } | null
  chord: number[] | null
  arp: ArpCfg | null
}

export function fxValues(l: Layer): FxValues {
  const v: FxValues = { pan: 64, reverb: 0, chorus: 0, delay: 0, cutoff: 64, reso: 64, attack: 64, release: 64, oct: null, chord: null, arp: null }
  for (const s of slotsOf(l)) {
    if (!s.type || !s.on) continue
    switch (s.type) {
      case 'reverb':
        v.reverb = s.p.level ?? 40
        break
      case 'chorus':
        v.chorus = s.p.level ?? 50
        break
      case 'delay':
        v.delay = s.p.level ?? 45
        break
      case 'pan':
        v.pan = s.p.pan ?? 64
        break
      case 'filter':
        v.cutoff = s.p.cutoff ?? 64
        v.reso = s.p.reso ?? 64
        break
      case 'env':
        v.attack = s.p.attack ?? 64
        v.release = s.p.release ?? 64
        break
      case 'oct':
        v.oct = { shift: s.p.shift ?? 1, both: (s.p.both ?? 1) === 1 }
        break
      case 'chord':
        v.chord = (CHORDS.find((c) => c.v === (s.p.kind ?? 0)) ?? CHORDS[0]).iv
        break
      case 'arp':
        v.arp = s.arp ?? defaultArp()
        break
    }
  }
  return v
}
