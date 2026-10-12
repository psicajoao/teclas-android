import type { Layer, Section } from './rig'
import { LAYER_COUNT } from './rig'

export type Song = { name: string; fade: number; split: number; sections: Section[]; key?: number | null; bpm?: number; transpose?: number }
export type PadConfig = { timbre: string; vol: number; fade: number; beats: number; click: number; bright: number; shimmer: number }

const KEY = 'teclas-android.v1'
const L = (timbre: string | null, vol = 100, zone: Layer['zone'] = 'all'): Layer => ({ timbre, vol, zone })
const pad = (ls: Layer[]): Layer[] => [...ls, ...Array.from({ length: LAYER_COUNT }, () => L(null))].slice(0, LAYER_COUNT)

export const newSong = (name = 'Nova música'): Song => ({
  name,
  fade: 2,
  split: 60,
  key: null,
  bpm: 120,
  transpose: 0,
  sections: [
    { name: 'Intro', layers: pad([L('gm89', 85)]) },
    { name: 'Verso', layers: pad([L('gm0', 100), L('gm89', 55)]) },
    { name: 'Refrão', layers: pad([L('gm0', 100), L('gm48', 80), L('gm89', 65)]) },
    { name: 'Ponte', layers: pad([L('gm94', 90), L('gm0', 65, 'right')]) },
    { name: 'Final', layers: pad([L('gm0', 100), L('gm48', 70), L('gm89', 60)]) },
  ],
})

const valid = (s: unknown): s is Song => {
  const x = s as Song
  return (
    !!x &&
    typeof x.name === 'string' &&
    typeof x.fade === 'number' &&
    typeof x.split === 'number' &&
    Array.isArray(x.sections) &&
    x.sections.length > 0 &&
    x.sections.every((sec) => typeof sec.name === 'string' && Array.isArray(sec.layers) && sec.layers.length <= LAYER_COUNT)
  )
}

const SECTION_NAMES = ['Intro', 'Verso', 'Refrão', 'Ponte', 'Final']
/** Toda música tem 5 seções: completa as que faltam copiando a última. */
function fiveSections(secs: Section[]): Section[] {
  const out = [...secs]
  while (out.length < 5) {
    const last = out[out.length - 1]
    out.push({ name: SECTION_NAMES[out.length] ?? `Seção ${out.length + 1}`, layers: last.layers.map((l) => ({ ...l })) })
  }
  return out
}

export function load(): { songs: Song[]; song: number } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw)
      if (Array.isArray(d.songs) && d.songs.length && d.songs.every(valid)) {
        const songs = (d.songs as Song[]).map((s) => ({
          ...s,
          sections: fiveSections(s.sections.map((sec) => ({ ...sec, layers: pad(sec.layers) }))),
        }))
        return { songs, song: Math.min(Math.max(0, d.song | 0), d.songs.length - 1) }
      }
    }
  } catch {
    /* sem armazenamento: segue com o padrão */
  }
  return { songs: [newSong('Minha primeira música')], song: 0 }
}

export function save(songs: Song[], song: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ songs, song }))
  } catch {
    /* ignora */
  }
}

const PAD_KEY = 'teclas-android.pad'
export function loadPad(): PadConfig {
  try {
    const raw = localStorage.getItem(PAD_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      if (typeof d.timbre === 'string' && typeof d.vol === 'number' && typeof d.fade === 'number') {
        return { beats: 4, click: 70, bright: 64, shimmer: 0, ...d }
      }
    }
  } catch {
    /* usa o padrão */
  }
  return { timbre: 'gm89', vol: 80, fade: 3, beats: 4, click: 70, bright: 64, shimmer: 0 }
}

export function savePad(c: PadConfig) {
  try {
    localStorage.setItem(PAD_KEY, JSON.stringify(c))
  } catch {
    /* ignora */
  }
}
