import { createValue } from './signal'
import { noteName } from './midi'

/** Uma mensagem MIDI ensinada a um controle da tela. */
export type Binding = { kind: 'cc' | 'note' | 'pc'; ch: number; num: number }
export type Bindings = Record<string, Binding>

const KEY = 'teclas-android.learn'

function load(): Bindings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw)
      if (d && typeof d === 'object') return d as Bindings
    }
  } catch {
    /* sem armazenamento */
  }
  return {}
}

export const bindingsValue = createValue<Bindings>(load())
/** Controle da tela que está esperando uma mensagem do controlador (null = nenhum). */
export const waitingValue = createValue<string | null>(null)
/** Última mensagem MIDI recebida (para diagnóstico na página MIDI). */
export const lastMsgValue = createValue<string>('')
/** Verdadeiro enquanto a página de MIDI Learn está aberta (os controles não disparam ações). */
export const learnOpen = { current: false }

const bkey = (b: Binding) => `${b.kind}:${b.ch}:${b.num}`
let index = new Map<string, string>()
const rebuild = () => {
  index = new Map(Object.entries(bindingsValue.get()).map(([id, b]) => [bkey(b), id]))
}
rebuild()

export function setBinding(id: string, b: Binding | null) {
  const next: Bindings = { ...bindingsValue.get() }
  if (b) {
    // a mesma mensagem não pode comandar dois controles
    for (const [other, ob] of Object.entries(next)) if (other !== id && bkey(ob) === bkey(b)) delete next[other]
    next[id] = b
  } else delete next[id]
  bindingsValue.set(next)
  rebuild()
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignora */
  }
}

export function clearAll() {
  bindingsValue.set({})
  rebuild()
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignora */
  }
}

export const findAction = (kind: Binding['kind'], ch: number, num: number) => index.get(`${kind}:${ch}:${num}`) ?? null

export function describeBinding(b: Binding): string {
  const ch = ` · canal ${b.ch + 1}`
  if (b.kind === 'cc') return `CC ${b.num}${ch}`
  if (b.kind === 'pc') return `Program ${b.num + 1}${ch}`
  return `Nota ${noteName(b.num)}${ch}`
}
