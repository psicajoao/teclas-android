import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource/righteous/latin-400.css'
import Gate from './gate'

/** Celular (qualquer lado): o app roda dentro de um quadro. Em pé, o quadro é girado; deitado, fica reto.
 *  Ao virar o aparelho só o quadro se reajusta, sem recarregar a página (não atrapalha a digitação). */
/** Só gira quando o app está instalado na tela inicial. No navegador, fica em pé (para digitar o login). */
const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const isPhone = installed && window.self === window.top && Math.min(window.innerWidth, window.innerHeight) <= 700
/** Versão enxuta (só para celular): esconde pad, metrônomo, gravador e partes. Build com VITE_LEAN=1. */
if (import.meta.env.VITE_LEAN === '1') document.documentElement.classList.add('lean')

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
