import { WorkletSynthesizer } from 'spessasynth_lib'
import { createValue } from './signal'
import { listBanks, getBankData, ensureMigrated, bankInfo, BANK_STEP, customStatus } from './bank'
import { registerCustom } from './timbres'
import type { BankMeta } from './bank'
import { ChanFx, isNeutral } from './chanfx'
import type { SndCfg } from './chanfx'

const BASE = import.meta.env.BASE_URL
/** true quando o áudio do navegador está ligado (rodando). */
export const audioOn = createValue(true)

export class Engine {
  ctx: AudioContext | null = null
  synth: WorkletSynthesizer | null = null
  private analyser: AnalyserNode | null = null
  /** Cadeia (compressor/EQ…) de cada canal: só existe enquanto o canal tem algo alterado. */
  chains: (ChanFx | null)[] = Array(16).fill(null)
  /** Aplica a página de som (compressor/EQ/ajustes) de um canal MIDI. */
  setChannelFx(ch: number, c: SndCfg, volFrac: number) {
    this.maxVoices[ch] = Math.max(1, c.set.voices)
    const synth = this.synth ?? this.pendingSynth
    const out = this.analyser
    if (!synth || !out || !this.ctx && !this.pendingCtx) return
    const chain = this.chains[ch]
    if (isNeutral(c)) {
      if (chain) {
        synth.disconnectChannel(chain.input, ch)
        synth.connectChannel(out, ch)
        chain.dispose()
        this.chains[ch] = null
      }
      return
    }
    let fx = chain
    if (!fx) {
      fx = new ChanFx((this.ctx ?? this.pendingCtx)!, out)
      this.chains[ch] = fx
      synth.disconnectChannel(out, ch)
      synth.connectChannel(fx.input, ch)
    }
    fx.apply(c, volFrac)
  }
  private pendingSynth: WorkletSynthesizer | null = null
  private pendingCtx: AudioContext | null = null
  private maxVoices: number[] = Array(16).fill(64)
  private voices: number[][] = Array.from({ length: 16 }, () => [])
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
    analyser.connect(ctx.destination)
    this.analyser = analyser
    // tudo vai direto para a saída; um canal só passa por uma cadeia própria quando a página de som dele está alterada
    synth.connect(analyser)
    this.pendingSynth = synth
    this.pendingCtx = ctx
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
      } catch (e) {
        bankInfo.failed.push(meta.name)
        bankInfo.reasons[meta.name] = { slot: meta.slot, why: e instanceof Error ? e.message : String(e) }
      }
    }
    customStatus.set('')
    registerCustom(found)
  }

  async selfTest() {
    const out: Record<string, number> = {}
    for (const ch of [5]) {
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
    const gt: Record<string, number> = {}
    const base = { comp: { on: true, inGain: 0, attack: 10, release: 150, ratio: 1, threshold: 0, mix: 100, outGain: 0 }, eq: { on: false, bands: Array(8).fill(0) }, set: { blockSustain: false, transpose: 0, voices: 64, volRange: 0, sampler: 0, pan: 0 } }
    for (const g of [0, 12, -12]) {
      this.setChannelFx(13, { ...base, comp: { ...base.comp, outGain: g } }, 1)
      this.program(0, 13)
      this.cc(7, 100, 13)
      this.cc(11, 127, 13)
      this.cc(91, 0, 13)
      this.cc(93, 0, 13)
      this.noteOn(60, 90, 13)
      let m = 0
      for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 60)); m = Math.max(m, this.peak()) }
      gt[`g${g}`] = Math.round(m * 1000) / 1000
      this.noteOff(60, 13)
      await new Promise((r) => setTimeout(r, 1500))
    }
    for (const d of [0, 127]) {
      this.setChannelFx(13, { ...base, comp: { ...base.comp, on: false }, od: { drive: d, tone: 127, level: 64 } }, 1)
      this.noteOn(60, 40, 13)
      let m = 0
      for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 60)); m = Math.max(m, this.peak()) }
      gt[`od${d}`] = Math.round(m * 1000) / 1000
      this.noteOff(60, 13)
      await new Promise((r) => setTimeout(r, 1500))
    }
    this.setChannelFx(13, { ...base, comp: { ...base.comp, on: false } }, 1)
    out.gt = JSON.stringify(gt) as unknown as number
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
    const v = this.voices[channel]
    if (v) {
      const i = v.indexOf(note)
      if (i >= 0) v.splice(i, 1)
      v.push(note)
      // limite de vozes do canal: solta a nota mais antiga
      while (v.length > (this.maxVoices[channel] ?? 64)) this.synth?.noteOff(channel, v.shift()!)
    }
    this.synth?.noteOn(channel, note, velocity)
  }
  noteOff(note: number, channel = this.channel) {
    const v = this.voices[channel]
    const i = v ? v.indexOf(note) : -1
    if (i >= 0) v.splice(i, 1)
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
