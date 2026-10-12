import { createValue } from './signal'

/** Saída MIDI externa de um canal: manda as notas para um programa (KORG M1…) ou módulo de som. */
export type ExtCfg = { on: boolean; ch: number; both: boolean; prog: number | null }
export const defaultExt = (): ExtCfg => ({ on: false, ch: 1, both: false, prog: null })
export const extOf = (l: { timbre?: string | null; ext?: Partial<ExtCfg> } | undefined): ExtCfg => {
  const t = l?.timbre
  // timbre do grupo "KORG M1": sempre externo; o programa vem do próprio timbre escolhido
  if (typeof t === 'string' && t.startsWith('ex:')) {
    const n = t.slice(3)
    return { ...defaultExt(), ...l?.ext, on: true, prog: n === 'cur' ? null : Number(n) }
  }
  return { ...defaultExt(), ...l?.ext }
}
export const isExtTimbre = (t: string | null | undefined) => typeof t === 'string' && t.startsWith('ex:')

const KEY = 'teclas-android.extport'
export type OutPort = { id: string; name: string }

class ExtMidi {
  private access: MIDIAccess | null = null
  /** Portas de saída disponíveis agora. */
  ports = createValue<OutPort[]>([])
  /** Porta escolhida ('' = automática: a primeira "IAC", senão a primeira da lista). */
  portId = (() => {
    try {
      return localStorage.getItem(KEY) ?? ''
    } catch {
      return ''
    }
  })()
  /** Última mensagem enviada com sucesso (para o aviso de teste). */
  lastSent = createValue('')
  private lastProg = new Map<number, number>()

  setAccess(a: MIDIAccess) {
    this.access = a
    this.refresh()
  }
  refresh() {
    const list = this.access ? [...this.access.outputs.values()].map((o) => ({ id: o.id, name: o.name ?? o.id })) : []
    this.ports.set(list)
  }
  setPort(id: string) {
    this.portId = id
    try {
      localStorage.setItem(KEY, id)
    } catch {
      /* */
    }
    this.ports.set([...this.ports.get()])
  }
  /** Porta que está valendo agora. */
  current(): MIDIOutput | null {
    if (!this.access) return null
    const outs = [...this.access.outputs.values()]
    if (this.portId) {
      const p = outs.find((o) => o.id === this.portId)
      if (p) return p
    }
    return outs.find((o) => /iac/i.test(o.name ?? '')) ?? outs[0] ?? null
  }
  private send(bytes: number[]) {
    try {
      this.current()?.send(bytes)
    } catch {
      /* porta sumiu */
    }
  }
  noteOn(ch: number, n: number, v: number) {
    this.send([0x90 | ((ch - 1) & 15), n & 127, Math.max(1, v & 127)])
  }
  noteOff(ch: number, n: number) {
    this.send([0x80 | ((ch - 1) & 15), n & 127, 0])
  }
  cc(ch: number, c: number, v: number) {
    this.send([0xb0 | ((ch - 1) & 15), c & 127, v & 127])
  }
  bend(ch: number, v14: number) {
    this.send([0xe0 | ((ch - 1) & 15), v14 & 127, (v14 >> 7) & 127])
  }
  /** Troca de programa só quando mudou (não repete a cada ajuste de tela). */
  program(ch: number, p: number) {
    if (this.lastProg.get(ch) === p) return
    this.lastProg.set(ch, p)
    this.send([0xc0 | ((ch - 1) & 15), p & 127])
  }
  forgetPrograms() {
    this.lastProg.clear()
  }
  allOff(ch: number) {
    this.cc(ch, 123, 0)
    this.cc(ch, 64, 0)
  }
  /** Nota de teste (Do central) para conferir a ligação. */
  test(ch: number) {
    this.noteOn(ch, 60, 100)
    setTimeout(() => this.noteOff(ch, 60), 600)
  }
}

export const ext = new ExtMidi()
