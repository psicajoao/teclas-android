import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource/righteous/latin-400.css'
import Gate from './gate'
import { engine } from './engine'

/** Celular (qualquer lado): o app roda dentro de um quadro. Em pé, o quadro é girado; deitado, fica reto.
 *  Ao virar o aparelho só o quadro se reajusta, sem recarregar a página (não atrapalha a digitação). */
/** Só gira quando o app está instalado na tela inicial. No navegador, fica em pé (para digitar o login). */
const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const isPhone = installed && window.self === window.top && Math.min(window.innerWidth, window.innerHeight) <= 700

const root = document.getElementById('root')!
if (isPhone) {
  document.body.style.cssText = 'margin:0;background:#0a0612;overflow:hidden'
  root.style.display = 'none'
  const f = document.createElement('iframe')
  f.src = location.pathname + location.search
  f.setAttribute('allow', 'midi; autoplay')
  f.setAttribute('title', 'Palco Keys')
  const orient = window.matchMedia('(orientation: portrait)')
  const place = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const base = 'position:fixed;top:0;left:0;border:0;background:#0a0612;transform-origin:0 0;'
    // A orientação vem do próprio aparelho: no iOS, o tamanho da tela pode ainda estar antigo logo após o giro.
    f.style.cssText = orient.matches
      ? base + `width:${h}px;height:${w}px;transform:translateX(${w}px) rotate(90deg)`
      : base + `width:${w}px;height:${h}px;transform:none`
  }
  place()
  window.addEventListener('resize', place)
  window.addEventListener('orientationchange', () => { place(); window.setTimeout(place, 300); window.setTimeout(place, 900) })
  document.body.appendChild(f)
} else {
  createRoot(root).render(
    <StrictMode>
      <Gate />
    </StrictMode>,
  )
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
  })
}

// Só na versão de teste: mostra a latência que o aparelho informa, para medir em vez de adivinhar.
if (import.meta.env.VITE_ALLOW_IPAD === '1') {
  const b = document.createElement('div')
  b.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;background:#000c;color:#7fe;font:11px/1.3 monospace;padding:4px 7px;border-radius:6px;'
  document.body.appendChild(b)
  ;(window as unknown as { __engine: unknown }).__engine = engine
  const modes = ['playback', 'ambient', 'auto', 'play-and-record']
  let taps = 0
  let err = ''
  const onTap = (e: Event) => {
    e.stopPropagation()
    taps++
    err = ''
    let cur = 'playback'
    try { cur = localStorage.getItem('pk.as') || 'playback' } catch { /* */ }
    const next = modes[(modes.indexOf(cur) + 1) % modes.length]
    try { localStorage.setItem('pk.as', next) } catch { /* */ }
    try {
      const as = (navigator as unknown as { audioSession?: { type: string } }).audioSession
      if (!as) err = 'sem audioSession'
      else as.type = next
    } catch (x) { err = String(x).slice(0, 60) }
    void engine.ctx?.resume().catch(() => {})
  }
  b.style.pointerEvents = 'auto'
  b.style.padding = '10px 12px'
  b.addEventListener('pointerdown', onTap)
  b.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true })
  // Comparação direta: um bipe simples do navegador (sem o motor de sons do app) contra uma nota do piano do app.
  const bar = document.createElement('div')
  bar.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:99999;display:flex;gap:10px'
  let ready13 = false
  const mk = (label: string, fn: () => void) => {
    const x = document.createElement('button')
    x.textContent = label
    x.style.cssText = 'padding:14px 22px;font:700 15px system-ui;border-radius:12px;border:2px solid #7fe;background:#102;color:#7fe;touch-action:none'
    x.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn() })
    bar.appendChild(x)
  }
  mk('BIPE SIMPLES', () => {
    const c = engine.ctx
    if (!c) return
    const o = c.createOscillator()
    const g = c.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, c.currentTime)
    g.gain.linearRampToValueAtTime(0.25, c.currentTime + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.25)
    o.connect(g).connect(c.destination)
    o.start()
    o.stop(c.currentTime + 0.3)
  })
  mk('PIANO DO APP', () => {
    // canal 13 só para o teste: piano de cauda do GM, volume cheio, sem reverb
    if (!ready13) {
      ready13 = true
      engine.program(0, 13)
      engine.cc(7, 100, 13)
      engine.cc(11, 127, 13)
      engine.cc(91, 0, 13)
      engine.cc(93, 0, 13)
    }
    engine.noteOn(72, 100, 13)
    window.setTimeout(() => engine.noteOff(72, 13), 250)
  })
  document.body.appendChild(bar)
  let clip = 0
  setInterval(() => { if (engine.peak() > 0.98) clip = Date.now() }, 50)
  setInterval(() => {
    const c = engine.ctx as (AudioContext & { outputLatency?: number }) | null
    if (!c) { b.textContent = 'áudio: ligando…'; return }
    const ms = (v?: number) => (v == null ? 'n/d' : Math.round(v * 1000) + ' ms')
    const lag = (window as unknown as { __lag?: number[] }).__lag
    const l = lag && lag.length ? ` · MIDI ${Math.round(Math.min(...lag))}–${Math.round(Math.max(...lag))} ms` : ' · MIDI: toque'
    const kb = (window as unknown as { __kb?: { wait: number; proc: number }[] }).__kb
    const k = kb && kb.length ? ` · TECLADO espera ${Math.round(Math.max(...kb.map((x) => x.wait)))} ms, envio ${Math.round(Math.max(...kb.map((x) => x.proc)))} ms` : ''
    b.textContent = `base ${ms(c.baseLatency)} · saída ${ms(c.outputLatency)} · ${c.sampleRate} Hz · ${c.state}${l}${k}${Date.now() - clip < 4000 ? ' · ESTOUROU' : ''} · modo: ${(navigator as unknown as { audioSession?: { type: string } }).audioSession?.type ?? 'sem suporte'} (toque aqui para trocar) · toques ${taps}${err ? ' · erro: ' + err : ''}`
  }, 1000)
}
