import { WorkletSynthesizer } from 'spessasynth_lib'
import { createValue } from './signal'
import { listBanks, getBankData, ensureMigrated, bankInfo, BANK_STEP, customStatus } from './bank'
import { registerCustom } from './timbres'
import type { BankMeta } from './bank'
import { ChanFx, isNeutral, defaultSnd } from './chanfx'
import { SpaceBus } from './space'
import type { SndCfg } from './chanfx'
import { SynthVoices, synPreset } from './synth'
import type { SynChan } from './synth'

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
      const ctx = (this.ctx ?? this.pendingCtx)!
      fx = new ChanFx(ctx, out, () => (this.space ??= new SpaceBus(ctx, out)))
      this.chains[ch] = fx
      synth.disconnectChannel(out, ch)
      synth.connectChannel(fx.input, ch)
    }
    fx.apply(c, volFrac)
  }
  private pendingSynth: WorkletSynthesizer | null = null
  private space: SpaceBus | null = null
  /** Shimmer do pad contínuo (0–127): liga o shimmer de verdade nos canais do pad. */
  setPadShimmer(chs: number[], v: number) {
    const a = Math.pow(Math.max(0, Math.min(127, v)) / 127, 1.3)
    for (const ch of chs) {
      const c = defaultSnd()
      c.space = { rev: a * 0.35, dly: 0, shim: a * 0.9 }
      this.setChannelFx(ch, c, 1)
    }
  }
  private pendingCtx: AudioContext | null = null
  /** Sintetizadores próprios (pads e leads): patch de cada canal, ou null quando o canal toca SoundFont. */
  private synVoices: SynthVoices | null = null
  private chanSyn: (string | null)[] = Array(16).fill(null)
  private chanSt: SynChan[] = Array.from({ length: 16 }, () => ({ vol: 1, expr: 1, cut: 1, reso: 0, bend: 0 }))
  private chanSus: boolean[] = Array(16).fill(false)
  private sustained: Set<number>[] = Array.from({ length: 16 }, () => new Set<number>())
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

  private kicks = 0
  /** Botão "Som pausado": tenta religar; se o iPad continuar sem som depois de vários toques, reinicia o app (os dados ficam salvos). */
  kick() {
    const ctx = this.ctx
    if (!ctx) return
    try { (navigator as unknown as { audioSession?: { type: string } }).audioSession!.type = sessionType() } catch { /* */ }
    if (this.kicks >= 1) void ctx.suspend().catch(() => {})
    this.kicks++
    this.unlock(ctx)
    setTimeout(() => {
      if (ctx.state === 'running') this.kicks = 0
      else if (this.kicks >= 3) location.reload()
    }, 700)
  }

  /** Progresso do download do banco GM (0–1), para mostrar na tela inicial. */
  onProgress: ((p: number) => void) | null = null
  onStage: ((t: string) => void) | null = null

  private async init() {
    this.onStage?.('Ligando o áudio…')
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    void ctx.resume().catch(() => {})
    // iOS: tocar mesmo com o modo silencioso ligado, e religar o áudio se o sistema o suspender.
    try { (navigator as unknown as { audioSession?: { type: string } }).audioSession!.type = sessionType() } catch { /* */ }
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
    this.synVoices = new SynthVoices(ctx, analyser)
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
      // Alguns navegadores (WebView no iPad) deixam o áudio suspenso e a preparação não anda: insiste em ligar e mostra o estado.
      const t0 = performance.now()
      const tick = setInterval(() => {
        void ctx.resume().catch(() => {})
        const s = Math.round((performance.now() - t0) / 1000)
        this.onStage?.(s < 8 ? 'Preparando sons…' : `Preparando sons… ${s}s (áudio: ${ctx.state}${ctx.state !== 'running' ? ' — toque na tela' : ''})`)
      }, 1000)
      try { await synth.soundBankManager.addSoundBank(data, 'gm') } finally { clearInterval(tick) }
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
    // Teste: abrir a página com &sembancos=1 no endereço pula os SoundFonts extras (sem apagar nada).
    if (import.meta.env.VITE_ALLOW_IPAD === '1' && location.search.includes('sembancos')) return Promise.resolve()
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
    const base = { comp: { on: true, inGain: 0, attack: 10, release: 150, ratio: 1, threshold: 0, mix: 100, outGain: 0 }, eq: { on: false, bands: Array(8).fill(0) }, set: { blockSustain: false, transpose: 0, voices: 64, volRange: 0, sampler: 0, pan: 0 }, space: { rev: 0, dly: 0, shim: 0 } }
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

  /** Põe um sintetizador (pad/lead) no canal. O SoundFont desse canal deixa de ser usado até um novo programa. */
  synthPatch(id: string, channel = this.channel) {
    this.chanSyn[channel] = id
    this.chanSt[channel] = { vol: 1, expr: 1, cut: 1, reso: 0, bend: 0 }
    this.chanSus[channel] = false
    this.sustained[channel].clear()
  }

  noteOn(note: number, velocity: number, channel = this.channel) {
    const syn = this.chanSyn[channel]
    if (syn) {
      const p = synPreset(syn)
      if (!p || !this.synVoices) return
      if (velocity === 0) return this.noteOff(note, channel)
      this.sustained[channel].delete(note)
      this.synVoices.noteOn(channel, note, velocity, p, this.chanSt[channel])
      return
    }
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
    if (this.chanSyn[channel]) {
      if (this.chanSus[channel]) this.sustained[channel].add(note)
      else this.synVoices?.noteOff(channel, note)
      return
    }
    const v = this.voices[channel]
    const i = v ? v.indexOf(note) : -1
    if (i >= 0) v.splice(i, 1)
    this.synth?.noteOff(channel, note)
  }
  cc(controller: number, value: number, channel = this.channel) {
    if (this.chanSyn[channel]) return this.synCc(controller, value, channel)
    // @ts-expect-error o tipo MIDIController é um enum numérico da biblioteca
    this.synth?.controllerChange(channel, controller, value)
  }
  /** Controles MIDI que um sintetizador entende (volume, expressão, filtro, sustain). */
  private synCc(controller: number, value: number, channel: number) {
    const st = this.chanSt[channel]
    if (controller === 7) st.vol = value / 127
    else if (controller === 11) st.expr = value / 127
    else if (controller === 74) st.cut = 0.25 + (value / 127) * 1.75
    else if (controller === 71) st.reso = (value / 127) * 8
    else if (controller === 64) {
      this.chanSus[channel] = value >= 64
      if (!this.chanSus[channel]) {
        for (const n of this.sustained[channel]) this.synVoices?.noteOff(channel, n)
        this.sustained[channel].clear()
      }
    } else if (controller === 120 || controller === 123) {
      this.sustained[channel].clear()
      this.synVoices?.allOffChannel(channel)
    }
  }
  pitchBend(value14: number, channel = this.channel) {
    if (this.chanSyn[channel]) {
      const st = this.chanSt[channel]
      st.bend = ((value14 - 8192) / 8192) * 200 // ±2 semitons
      this.synVoices?.bend(channel, st.bend)
      return
    }
    this.synth?.pitchWheel(channel, value14)
  }
  program(program: number, channel = this.channel, bank = 0, lsb = 0) {
    this.chanSyn[channel] = null
    if (channel !== 9) {
      this.cc(0, bank, channel)
      this.cc(32, lsb, channel)
    }
    this.synth?.programChange(channel, program)
  }
  panic() {
    this.synth?.stopAll(true)
    this.synVoices?.allOff()
    this.sustained.forEach((s) => s.clear())
  }
}

/** Modo de áudio do iOS. Na versão de teste dá para trocar tocando na etiqueta (para comparar a latência). */
export function sessionType(): string {
  if (import.meta.env.VITE_ALLOW_IPAD === '1') {
    try {
      // Só com ?medir o modo guardado vale; senão fica no normal e apaga a escolha antiga (ela podia deixar o som pausado).
      if (location.search.includes('medir')) return localStorage.getItem('pk.as') || 'playback'
      localStorage.removeItem('pk.as')
    } catch { /* */ }
  }
  return 'playback'
}
export const engine = new Engine()
