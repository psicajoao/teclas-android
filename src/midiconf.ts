import { createValue } from './signal'

/** Qual dispositivo MIDI é o teclado 1 e o teclado 2. */
export type MidiConf = { kb1: string; kb2: string; kb2Notes: boolean }
const KEY = 'teclas-android.midi'
const DEFAULT: MidiConf = { kb1: 'all', kb2: 'off', kb2Notes: true }

function load(): MidiConf {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) }
  } catch {
    /* usa o padrão */
  }
  return DEFAULT
}

export const midiConf = createValue<MidiConf>(load())
export function setMidiConf(c: MidiConf) {
  midiConf.set(c)
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* ignora */
  }
}

/** Ids dos dispositivos conectados agora (atualizado pelo App). */
export const connectedIds = new Set<string>()

/** Papel da mensagem vinda de um dispositivo: tudo, só controles (sem notas) ou ignorar. */
export function roleOf(id: string): 'full' | 'controls' | 'ignore' {
  const c = midiConf.get()
  const kb1Ok = c.kb1 === 'all' || !connectedIds.has(c.kb1) // se o teclado 1 sumiu, aceita todos (não ficar mudo)
  if (kb1Ok || id === c.kb1) return 'full'
  if (id === c.kb2) return c.kb2Notes ? 'full' : 'controls'
  return 'ignore'
}
