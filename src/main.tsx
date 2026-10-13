import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource/righteous/latin-400.css'
import Gate from './gate'

/** Celular em pé: mostra o app já girado (dentro de um quadro deitado), sem pedir para virar o aparelho. */
const portraitQuery = window.matchMedia('(orientation: portrait) and (max-width: 700px)')
const rotated = window.self === window.top && portraitQuery.matches
portraitQuery.addEventListener('change', () => {
  if (window.self === window.top) location.reload()
})

const root = document.getElementById('root')!
if (rotated) {
  document.body.style.cssText = 'margin:0;background:#0a0612;overflow:hidden'
  root.style.display = 'none'
  const f = document.createElement('iframe')
  f.src = location.pathname + location.search
  f.setAttribute('allow', 'midi; autoplay')
  f.setAttribute('title', 'Palco Keys')
  f.style.cssText =
    'position:fixed;top:0;left:0;width:100vh;height:100vw;width:100dvh;height:100dvw;border:0;background:#0a0612;transform-origin:0 0;transform:translateX(100vw) translateX(0) rotate(90deg);transform:translateX(100dvw) rotate(90deg)'
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
