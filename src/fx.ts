import type { Layer } from './rig'

/** arp/oct/chord = botão MIDI (uma escolha). efx/snd = grupos de áudio com vários efeitos ligáveis ao mesmo tempo. */
export type FxType = 'arp' | 'oct' | 'chord' | 'efx' | 'snd'

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
const panFmt = (v: number) => (v === 64 ? 'centro' : v < 64 ? `E ${Math.round(((64 - v) / 64) * 100)}` : `D ${Math.round(((v - 64) / 63) * 100)}`)

export const CHORDS = [
  { v: 0, l: 'Maior', iv: [0, 4, 7] },
  { v: 1, l: 'Menor', iv: [0, 3, 7] },
  { v: 2, l: 'Quinta (power)', iv: [0, 7] },
  { v: 3, l: 'Sus4', iv: [0, 5, 7] },
  { v: 4, l: '7ª maior', iv: [0, 4, 7, 11] },
  { v: 5, l: '7ª', iv: [0, 4, 7, 10] },
]

/** Efeitos dentro de um grupo: cada um liga/desliga sozinho e tem seus ajustes. */
export type SubFx = { id: string; label: string; hint: string; params: { key: string; label: string; def: number; fmt: (v: number) => string }[] }
export const GROUPS: Record<'efx' | 'snd', { label: string; hint: string; items: SubFx[] }> = {
  efx: {
    label: 'Efeitos',
    hint: 'Ligue quantos quiser ao mesmo tempo.',
    items: [
      { id: 'reverb', label: 'Reverb', hint: 'Espaço e ambiente', params: [{ key: 'reverb', label: 'Quantidade', def: 40, fmt: pct }] },
      { id: 'chorus', label: 'Chorus', hint: 'Dobra e alarga o som', params: [{ key: 'chorus', label: 'Quantidade', def: 50, fmt: pct }] },
      { id: 'delay', label: 'Delay', hint: 'Eco que repete a nota', params: [{ key: 'delay', label: 'Quantidade', def: 45, fmt: pct }] },
      { id: 'pan', label: 'Pan', hint: 'Esquerda ou direita', params: [{ key: 'pan', label: 'Posição', def: 64, fmt: panFmt }] },
    ],
  },
  snd: {
    label: 'Som',
    hint: 'Molde o timbre. Ligue quantos quiser.',
    items: [
      {
        id: 'filter',
        label: 'Filtro',
        hint: 'Cutoff escurece ou clareia o som',
        params: [
          { key: 'cutoff', label: 'Cutoff', def: 64, fmt: bip },
          { key: 'reso', label: 'Ressonância', def: 64, fmt: bip },
        ],
      },
      {
        id: 'env',
        label: 'Envelope',
        hint: 'Ataque e release',
        params: [
          { key: 'attack', label: 'Ataque', def: 64, fmt: bip },
          { key: 'release', label: 'Release', def: 64, fmt: bip },
        ],
      },
      {
        id: 'od',
        label: 'Overdrive',
        hint: 'Distorção quente de válvula (ótimo no órgão)',
        params: [
          { key: 'drive', label: 'Drive', def: 45, fmt: pct },
          { key: 'tone', label: 'Tom', def: 80, fmt: pct },
          { key: 'level', label: 'Nível', def: 64, fmt: bip },
        ],
      },
    ],
  },
}

export const FX_DEFS: FxDef[] = [
  { type: 'arp', label: 'Arpejador', kind: 'midi', hint: 'Toca as notas que você segura em sequência, no tempo do metrônomo.', params: [] },
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
]
export const fxDef = (t: FxType | null) => FX_DEFS.find((d) => d.type === t) ?? null

export function newSlot(type: FxType | null, on = true): FxSlot {
  if (!type) return { type: null, on: false, p: {} }
  const p: Record<string, number> = {}
  if (type === 'efx' || type === 'snd') {
    GROUPS[type].items.forEach((it) => it.params.forEach((q) => (p[q.key] = q.def)))
    return { type, on: true, p }
  }
  fxDef(type)!.params.forEach((q) => (p[q.key] = q.def))
  return type === 'arp' ? { type, on, p, arp: defaultArp() } : { type, on, p }
}

/** Os 3 efeitos da camada: [MIDI, Efeitos, Som]. Converte formatos antigos (um efeito por botão). */
export function slotsOf(l: Layer): FxSlot[] {
  const saved = (l.fx ?? []) as FxSlot[]
  const efx = newSlot('efx')
  const snd = newSlot('snd')
  let mid = newSlot(null)
  const old = saved.length === 3 && saved[1]?.type === 'efx' && saved[2]?.type === 'snd'
  if (old) return [saved[0]?.type && ['arp', 'oct', 'chord'].includes(saved[0].type) ? saved[0] : mid, saved[1], saved[2]]
  if (saved.length === 3) {
    // formato anterior: um efeito por botão
    if (saved[0]?.type && ['arp', 'oct', 'chord'].includes(saved[0].type as string)) mid = saved[0]
    const legacy = saved.slice(1)
    const flag: Record<string, [FxSlot, string]> = {}
    for (const s of legacy) {
      const t = s?.type as string | null
      if (!t || !s.on) continue
      if (t === 'reverb') {
        efx.p.reverbOn = 1
        efx.p.reverb = s.p.level ?? 40
      } else if (t === 'chorus') {
        efx.p.chorusOn = 1
        efx.p.chorus = s.p.level ?? 50
      } else if (t === 'delay') {
        efx.p.delayOn = 1
        efx.p.delay = s.p.level ?? 45
      } else if (t === 'pan') {
        efx.p.panOn = 1
        efx.p.pan = s.p.pan ?? 64
      } else if (t === 'filter') {
        snd.p.filterOn = 1
        snd.p.cutoff = s.p.cutoff ?? 64
        snd.p.reso = s.p.reso ?? 64
      } else if (t === 'env') {
        snd.p.envOn = 1
        snd.p.attack = s.p.attack ?? 64
        snd.p.release = s.p.release ?? 64
      }
    }
    void flag
    return [mid, efx, snd]
  }
  // sem efeitos salvos: usa o Reverb e o Pan antigos da camada
  efx.p.reverbOn = 1
  efx.p.reverb = l.reverb ?? 40
  if (l.pan != null && l.pan !== 64) {
    efx.p.panOn = 1
    efx.p.pan = l.pan
  }
  return [mid, efx, snd]
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
  od: { drive: number; tone: number; level: number } | null
}

export function fxValues(l: Layer): FxValues {
  const v: FxValues = { pan: 64, reverb: 0, chorus: 0, delay: 0, cutoff: 64, reso: 64, attack: 64, release: 64, oct: null, chord: null, arp: null, od: null }
  const [mid, efx, snd] = slotsOf(l)
  if (mid.type && mid.on) {
    if (mid.type === 'oct') v.oct = { shift: mid.p.shift ?? 1, both: (mid.p.both ?? 1) === 1 }
    if (mid.type === 'chord') v.chord = (CHORDS.find((c) => c.v === (mid.p.kind ?? 0)) ?? CHORDS[0]).iv
    if (mid.type === 'arp') v.arp = mid.arp ?? defaultArp()
  }
  if (efx.on) {
    if (efx.p.reverbOn) v.reverb = efx.p.reverb ?? 40
    if (efx.p.chorusOn) v.chorus = efx.p.chorus ?? 50
    if (efx.p.delayOn) v.delay = efx.p.delay ?? 45
    if (efx.p.panOn) v.pan = efx.p.pan ?? 64
  }
  if (snd.on) {
    if (snd.p.filterOn) {
      v.cutoff = snd.p.cutoff ?? 64
      v.reso = snd.p.reso ?? 64
    }
    if (snd.p.odOn) v.od = { drive: snd.p.drive ?? 45, tone: snd.p.tone ?? 80, level: snd.p.level ?? 64 }
    if (snd.p.envOn) {
      v.attack = snd.p.attack ?? 64
      v.release = snd.p.release ?? 64
    }
  }
  return v
}

/** Texto curto dos efeitos ligados de um grupo (para o botão do canal). */
export function groupSummary(s: FxSlot, g: 'efx' | 'snd'): string {
  if (!s.on) return 'Desligado'
  const on = GROUPS[g].items.filter((it) => s.p[it.id + 'On'])
  return on.length ? on.map((it) => it.label).join(' · ') : 'Nenhum'
}
