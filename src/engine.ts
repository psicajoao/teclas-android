import { WorkletSynthesizer } from 'spessasynth_lib'
import { createValue } from './signal'
import { listBanks, getBankData, ensureMigrated, bankInfo, BANK_STEP, customStatus } from './bank'
import { registerCustom } from './timbres'
import type { BankMeta } from './bank'

const BASE = import.meta.env.BASE_URL
/** true quando o áudio do navegador está ligado (rodando). */
export const audioOn = createValue(true)

export class Engine {
  ctx: AudioContext | null = null
  synth: WorkletSynthesizer | null = null
  private analyser: AnalyserNode | null = null
  private buf = new Uint8Array(512)
  private starting: Promise<void> | null = null
  /** Canal MIDI atual: 0 para timbres melódicos, 9 para bateria (canal de percussão do GM). */
  channel = 0

  /** Inicia o áudio e carrega o banco GM. Precisa ser chamado após um toque/clique do usuário. */
  start(): Promise<void> {
    if (!this.starting) {
      this.starting = this.init().catch((e) => {
        this.starting = null
        try { void this.ctx?.close() } catch { /* */ }
        throw e
      })
    }
    return this.starting
  }

  /** Religa o áudio dentro de um toque do usuário (o iOS exige): resume + um som mudo de 1 amostra. */
  unlock(ctx: AudioContext | null = this.ctx) {
    if (!ctx) return
    try {
      void ctx.resume().catch(() => {})
      const b = ctx.createBuffer(1, 1, 22050)
      const src = ctx.createBufferSource()
      src.buffer = b
      src.connect(ctx.destination)
      src.start(0)
    } catch { /* */ }
  }

  /** Progresso do download do banco GM (0–1), para mostrar na tela inicial. */
  onProgress: ((p: number) => void) | null = null
  onStage: ((t: string) => void) | null = null

  private async init() {
    this.onStage?.('Ligando o áudio…')
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    void ctx.resume().catch(() => {})
    // iOS: tocar mesmo com o modo silencioso ligado, e religar o áudio se o sistema o suspender.
    try { (navigator as unknown as { audioSession?: { type: string } }).audioSession!.type = 'playback' } catch { /* */ }
    const sync = () => audioOn.set(ctx.state === 'running')
    const wake = () => { if (ctx.state !== 'running') this.unlock(ctx); sync() }
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const) document.addEventListener(ev, wake, true)
    document.addEventListener('visibilitychange', wake)
    ctx.onstatechange = () => { sync(); if (ctx.state !== 'running') void ctx.resume().catch(() => {}) }
    setInterval(sync, 1000)
    await ctx.audioWorklet.addModule(BASE + 'spessasynth_processor.min.js')
    const synth = new WorkletSynthesizer(ctx)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    synth.connect(analyser)
    analyser.connect(ctx.destination)
    this.analyser = analyser
    {
      this.onStage?.('Baixando sons…')
      const res = await fetch(BASE + 'sounds/GeneralUser-GS.sf2')
      if (!res.ok) throw new Error('Banco de sons GM não encontrado (public/sounds/GeneralUser-GS.sf2)')
      const total = Number(res.headers.get('content-length')) || 32319396
      let data: ArrayBuffer
      if (res.body) {
        const reader = res.body.getReader()
        const chunks: Uint8Array[] = []
        let got = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          got += value.length
          this.onProgress?.(Math.min(1, got / total))
        }
        const all = new Uint8Array(got)
        let o = 0
        for (const c of chunks) { all.set(c, o); o += c.length }
        data = all.buffer
      } else data = await res.arrayBuffer()
      this.onStage?.('Preparando sons…')
      await synth.soundBankManager.addSoundBank(data, 'gm')
    }
    await synth.isReady
    synth.setSystemParameter('reverbGain', 2.2)
    synth.setSystemParameter('chorusGain', 3)
    synth.setSystemParameter('delayGain', 2)
    await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 1500))])
    this.ctx = ctx
    this.synth = synth
    if (location.search.includes('selftest')) void this.selfTest()
  }

  private customLoading: Promise<void> | null = null
  /** SoundFonts do usuário: carregados em segundo plano depois que o app já está tocando. */
  loadCustom(): Promise<void> {
    try { if (localStorage.getItem('teclas-android.safe') === '1') return Promise.resolve() } catch { /* */ }
    if (!this.customLoading) this.customLoading = this.initCustom().catch(() => {})
    return this.customLoading
  }

  private async initCustom() {
    const synth = this.synth!
    // SoundFonts do usuário: todos carregados, cada um com seu deslocamento de banco; os presets novos de cada um viram timbres.
    await ensureMigrated()
    const key = (p: { bankMSB: number; bankLSB: number; program: number; isDrum: boolean }) => `${p.bankMSB}.${p.bankLSB}.${p.program}.${p.isDrum}`
    const known = new Set(synth.presetList.map(key))
    const found: { bank: BankMeta; patches: typeof synth.presetList }[] = []
    const metas = listBanks()
    let n = 0
    for (const meta of metas) {
      n++
      customStatus.set(`Carregando SoundFont ${n}/${metas.length}: ${meta.name.replace(/\.sf[23]$/i, '')}…`)
      try {
        const data = await getBankData(meta.slot)
        if (!data) throw new Error('vazio')
        const before = synth.presetList.length
        await Promise.race([synth.soundBankManager.addSoundBank(data, `bk${meta.slot}`, meta.slot * BANK_STEP), new Promise((_, rej) => setTimeout(() => rej(new Error('demorou demais')), 120000))])
        for (let i = 0; i < 25 && synth.presetList.length === before; i++) await new Promise((r) => setTimeout(r, 60))
        const fresh = synth.presetList.filter((p) => !known.has(key(p)))
        fresh.forEach((p) => known.add(key(p)))
        found.push({ bank: meta, patches: fresh })
        registerCustom(found)
      } catch {
        bankInfo.failed.push(meta.name)
      }
    }
    customStatus.set('')
    registerCustom(found)
  }

  async selfTest() {
    const out: Record<string, number> = {}
    for (const ch of [0, 5, 13, 14, 15]) {
      this.program(0, ch)
      this.cc(7, 127, ch)
      this.cc(11, 127, ch)
      this.noteOn(60, 110, ch)
      let m = 0
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 60))
        m = Math.max(m, this.peak())
      }
      out[ch] = Math.round(m * 100) / 100
      this.noteOff(60, ch)
      await new Promise((r) => setTimeout(r, 1200))
    }
    const fx: Record<string, number> = {}
    for (const [rev, cho] of [[0, 0], [127, 0], [0, 127], [127, 127]]) {
      this.program(0, 13)
      this.cc(7, 127, 13)
      this.cc(11, 127, 13)
      this.cc(91, rev, 13)
      this.cc(93, cho, 13)
      this.noteOn(60, 110, 13)
      await new Promise((r) => setTimeout(r, 300))
      this.noteOff(60, 13)
      await new Promise((r) => setTimeout(r, 200))
      let m = 0
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 80))
        m = Math.max(m, this.peak())
      }
      fx[`r${rev}c${cho}`] = Math.round(m * 1000) / 1000
      await new Promise((r) => setTimeout(r, 2500))
    }
    out.fx = JSON.stringify(fx) as unknown as number
    const sp = this.synth?.systemParameters as unknown as Record<string, unknown>
    out.sp = JSON.stringify({ rg: sp?.reverbGain, cg: sp?.chorusGain, en: sp?.effectsEnabled }) as unknown as number
    const d = document.createElement('div')
    d.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;background:#fff;color:#000;padding:8px;font:12px monospace;white-space:pre-wrap;max-width:100vw;word-break:break-all'
    d.textContent = 'SELFTEST ' + JSON.stringify(out)
    document.body.appendChild(d)
  }

  get ready() {
    return this.synth !== null
  }

  /** Latência de saída estimada do navegador, em milissegundos. */
  get outputLatencyMs(): number {
    if (!this.ctx) return 0
    const c = this.ctx
    return Math.round((c.baseLatency + (c.outputLatency || 0)) * 1000)
  }

  /** Pico do sinal de saída, de 0 a 1 (para o medidor). */
  peak(): number {
    if (!this.analyser) return 0
    this.analyser.getByteTimeDomainData(this.buf)
    let m = 0
    for (let i = 0; i < this.buf.length; i++) m = Math.max(m, Math.abs(this.buf[i] - 128))
    return m / 128
  }

  noteOn(note: number, velocity: number, channel = this.channel) {
    this.synth?.noteOn(channel, note, velocity)
  }
  noteOff(note: number, channel = this.channel) {
    this.synth?.noteOff(channel, note)
  }
  cc(controller: number, value: number, channel = this.channel) {
    // @ts-expect-error o tipo MIDIController é um enum numérico da biblioteca
    this.synth?.controllerChange(channel, controller, value)
  }
  pitchBend(value14: number, channel = this.channel) {
    this.synth?.pitchWheel(channel, value14)
  }
  program(program: number, channel = this.channel, bank = 0, lsb = 0) {
    if (channel !== 9) {
      this.cc(0, bank, channel)
      this.cc(32, lsb, channel)
    }
    this.synth?.programChange(channel, program)
  }
  panic() {
    this.synth?.stopAll(true)
  }
}

export const engine = new Engine()
