/**
 * Casca iOS (Capacitor): o WKWebView do iPad não tem Web MIDI. Dentro do app nativo, este arquivo cria um
 * `navigator.requestMIDIAccess` equivalente, alimentado pelo plugin nativo PalcoMidi (CoreMIDI).
 * Fora do app nativo (navegador comum) não faz nada.
 */
type Cap = { isNativePlatform?: () => boolean }
type Ev = { data: number[]; t: number }
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

if (cap?.isNativePlatform?.()) {
  let accessP: Promise<unknown> | null = null
  const start = async () => {
    const { registerPlugin } = await import('@capacitor/core')
    type Plugin = {
      start(): Promise<{ ports: PortInfo[] }>
      addListener(name: string, fn: (d: never) => void): Promise<unknown>
    }
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
      if (input) for (const ev of d.events) input.emit(ev.data)
    }) as (d: never) => void)
    sync((await plugin.start()).ports)
    return access
  }
  ;(navigator as unknown as { requestMIDIAccess: () => Promise<unknown> }).requestMIDIAccess = () => (accessP ??= start())
}
