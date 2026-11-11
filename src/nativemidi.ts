/**
 * Casca iOS (Capacitor): o WKWebView do iPad não tem Web MIDI. Dentro do app nativo, este arquivo cria um
 * `navigator.requestMIDIAccess` equivalente, alimentado pelo plugin nativo PalcoMidi (CoreMIDI).
 * Fora do app nativo (navegador comum) não faz nada.
 */
type Cap = { isNativePlatform?: () => boolean }
type Ev = { data: number[]; t: number; age?: number; sent?: number }
type PortInfo = { id: string; name: string }

const cap = (window as unknown as { Capacitor?: Cap }).Capacitor

class NativeInput {
  readonly type = 'input'
  readonly manufacturer = ''
  readonly state = 'connected'
  readonly connection = 'open'
  onmidimessage: ((e: unknown) => void) | null = null
  private listeners: ((e: unknown) => void)[] = []
  readonly id: string
  readonly name: string
  constructor(id: string, name: string) { this.id = id; this.name = name }
  addEventListener(type: string, fn: (e: unknown) => void) { if (type === 'midimessage') this.listeners.push(fn) }
  removeEventListener(type: string, fn: (e: unknown) => void) { if (type === 'midimessage') this.listeners = this.listeners.filter((f) => f !== fn) }
  open() { return Promise.resolve(this) }
  close() { return Promise.resolve(this) }
  emit(bytes: number[]) {
    const e = { data: new Uint8Array(bytes), timeStamp: performance.now(), target: this, currentTarget: this, type: 'midimessage' }
    this.onmidimessage?.(e)
    for (const f of this.listeners) f(e)
  }
}

/** O CoreMIDI pode entregar várias mensagens juntas no mesmo pacote (acordes, running status): separa uma por uma. */
export function splitMidi(b: number[]): number[][] {
  const out: number[][] = []
  const need = (s: number) => (s >= 0xf8 ? 1 : s === 0xf6 ? 1 : s === 0xf1 || s === 0xf3 ? 2 : s === 0xf2 ? 3 : s >= 0xc0 && s < 0xe0 ? 2 : 3)
  let i = 0
  let running = 0
  while (i < b.length) {
    const s = b[i]
    if (s >= 0xf8) { out.push([s]); i++; continue }
    if (s === 0xf0) {
      let j = i + 1
      while (j < b.length && b[j] !== 0xf7) j++
      out.push(b.slice(i, Math.min(j + 1, b.length)))
      i = j + 1; running = 0
      continue
    }
    let status = s
    let start = i + 1
    if (s < 0x80) { if (!running) { i++; continue } status = running; start = i }
    else running = s < 0xf0 ? s : 0
    const n = need(status) - 1
    const msg = [status]
    let k = start
    while (msg.length < n + 1 && k < b.length && b[k] < 0x80) msg.push(b[k++])
    if (msg.length === n + 1) out.push(msg)
    i = k
  }
  return out
}

if (cap?.isNativePlatform?.()) {
  let accessP: Promise<unknown> | null = null
  const start = async () => {
    const { registerPlugin } = await import('@capacitor/core')
    type Plugin = {
      start(): Promise<{ ports: PortInfo[] }>
      addListener(name: string, fn: (d: never) => void): Promise<unknown>
    }
    console.log('PK midi: registrando plugin')
    const plugin = registerPlugin<Plugin>('PalcoMidi')
    const inputs = new Map<string, NativeInput>()
    const access = {
      inputs,
      outputs: new Map(),
      sysexEnabled: false,
      onstatechange: null as ((e: unknown) => void) | null,
      addEventListener() {},
      removeEventListener() {},
    }
    const sync = (ports: PortInfo[]) => {
      let changed = false
      const ids = new Set(ports.map((p) => p.id))
      for (const id of [...inputs.keys()]) if (!ids.has(id)) { inputs.delete(id); changed = true }
      for (const p of ports) if (!inputs.has(p.id)) { inputs.set(p.id, new NativeInput(p.id, p.name)); changed = true }
      if (changed) access.onstatechange?.({ type: 'statechange', target: access })
    }
    await plugin.addListener('ports', ((d: { ports: PortInfo[] }) => sync(d.ports)) as (d: never) => void)
    await plugin.addListener('midi', ((d: { port: string; events: Ev[] }) => {
      const input = inputs.get(d.port) ?? [...inputs.values()][0]
      // Medição para a tela de Áudio: ponte nativo → app (ms) e idade do pacote no CoreMIDI (ms).
      const first = d.events[0]
      if (first && typeof first.sent === 'number') {
        const w = window as unknown as { __pkBridge?: { bridge: number; age: number; max: number; at: number } }
        const bridge = Math.max(0, Date.now() - first.sent)
        const prev = w.__pkBridge
        w.__pkBridge = { bridge, age: first.age ?? 0, max: prev && Date.now() - prev.at < 5000 ? Math.max(prev.max, bridge) : bridge, at: Date.now() }
      }
      if (input) for (const ev of d.events) for (const m of splitMidi(ev.data)) input.emit(m)
    }) as (d: never) => void)
    console.log('PK midi: listeners ok, chamando start')
    sync((await plugin.start()).ports)
    console.log('PK midi: start ok')
    return access
  }
  ;(navigator as unknown as { requestMIDIAccess: () => Promise<unknown> }).requestMIDIAccess = () => (accessP ??= start())
}
