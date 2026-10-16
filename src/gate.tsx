import { useCallback, useEffect, useState } from 'react'
import App from './App'
import Admin from './admin'
import { accessEnabled, checkAccess, REASON_TEXT, sb, sendLink, signOut, wantTrial, type Access } from './access'

const SEEN = 'palco-keys.welcome'
const base = import.meta.env.BASE_URL
const SLIDES = [
  { img: '1.jpg', t: 'Toque ao vivo, sem complicação', p: 'Camadas, divisões de teclado e timbres prontos para o palco. Tudo na tela, do jeito que você toca.' },
  { img: '2.jpg', t: 'Escolha o timbre em segundos', p: 'Pianos, cordas, pads e corais organizados em pastas. Favoritos sempre à mão.' },
  { img: '3.jpg', t: 'Biblioteca de sons', p: 'Instale bancos de sons com um toque e deixe o app com a sua cara.' },
  { img: '4.jpg', t: 'Regiões do teclado', p: 'Divida o teclado e toque baixo, pad e solo ao mesmo tempo.' },
  { img: '5.jpg', t: 'Funciona em qualquer aparelho', p: 'Computador com Windows, macOS ou Linux, e tablet Android. Instale na tela inicial e use até sem internet.' },
]

function seen(): boolean { try { return !!localStorage.getItem(SEEN) } catch { return false } }
function markSeen() { try { localStorage.setItem(SEEN, '1') } catch { /* ok */ } }

function Welcome({ acc, onEnter }: { acc: Access | null; onEnter: () => void }) {
  const last = SLIDES.length
  /** Quem ainda não tem acesso vai direto para a tela de e-mail (sem passar pelos slides). */
  const [i, setI] = useState(acc && !acc.ok ? last : 0)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const go = (n: number) => setI((x) => Math.max(0, Math.min(last, x + n)))

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const send = async (trial: boolean) => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setMsg('Digite um e-mail válido.'); return }
    setBusy(true); setMsg('')
    wantTrial(trial)
    const err = await sendLink(email)
    setBusy(false)
    if (err) setMsg('Não consegui enviar: ' + err)
    else setSent(true)
  }

  const denied = acc && !acc.ok && acc.reason !== 'no_session' ? REASON_TEXT[acc.reason] : ''

  return (
    <div className="wl">
      <header className="wl-top">
        <img src={base + 'icon-192.png'} alt="" width={36} height={36} />
        <span className="wl-brand">Palco <span>Keys</span></span>
        {i < last && <button className="wl-skip" onClick={() => setI(last)}>Pular ›</button>}
      </header>
      <main className="wl-main">
        {i < last ? (
          <div className="wl-slide" key={i}>
            <div className="wl-im"><img src={`${base}welcome/${SLIDES[i].img}`} alt="" /></div>
            <div className="wl-tx"><h2>{SLIDES[i].t}</h2><p>{SLIDES[i].p}</p></div>
          </div>
        ) : (
          <div className="wl-login">
            <img className="wl-logo" src={base + 'icon-512.png'} alt="" width={84} height={84} />
            <h2>{accessEnabled ? 'Pronto para começar?' : 'Tudo pronto!'}</h2>
            {!accessEnabled ? (
              <>
                <p>Toque em começar para abrir o Palco Keys.</p>
                <button className="wl-btn" onClick={onEnter}>Começar</button>
              </>
            ) : !sent ? (
              <>
                <p>{denied || 'Digite o e-mail da sua compra. Enviaremos um link para liberar este aparelho.'}</p>
                <input id="wl-email" type="email" inputMode="email" autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button className="wl-btn" disabled={busy} onClick={() => send(false)}>{busy ? 'Enviando…' : 'Enviar link de acesso'}</button>
                <button className="wl-btn o" disabled={busy} onClick={() => send(true)}>Testar 7 dias grátis</button>
              </>
            ) : (
              <>
                <p>Enviamos um link para <b>{email}</b>. Abra o e-mail neste mesmo aparelho e toque no link para liberar.</p>
                <button className="wl-btn" onClick={onEnter}>Já liberei pelo e-mail</button>
                <button className="wl-link" onClick={() => { setSent(false);  }}>Usar outro e-mail</button>
              </>
            )}
            {msg && <p className="wl-err">{msg}</p>}
            {accessEnabled && acc && !acc.ok && acc.reason !== 'no_session' && (
              <button className="wl-link" onClick={async () => { await signOut(); onEnter() }}>Sair desta conta</button>
            )}
          </div>
        )}
      </main>
      <nav className="wl-nav">
        <button onClick={() => go(-1)} disabled={i === 0} aria-label="Anterior">‹</button>
        <div className="wl-dots">{Array.from({ length: last + 1 }, (_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        <button onClick={() => go(1)} disabled={i === last} aria-label="Próxima">›</button>
      </nav>
    </div>
  )
}

/** Só tablet Android e computador (Windows, macOS, Linux). Celular e iPad ficam de fora por enquanto. */
/** iPad (inclui o iPad que pede site de computador, que se identifica como Macintosh com tela de toque). */
function isIpad(): boolean {
  const ua = navigator.userAgent
  return /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 0)
}

/** Só tablet Android e computador (Windows, macOS, Linux). Celular e iPad ficam de fora por enquanto. */
function unsupportedDevice(): boolean {
  const ua = navigator.userAgent
  const iphone = /iPhone|iPod/.test(ua)
  const androidPhone = /Android/.test(ua) && /Mobile/.test(ua)
  // Versão de teste para iPad (build com VITE_ALLOW_IPAD=1): iPad só entra com a conta de administrador (ver Gate).
  if (import.meta.env.VITE_ALLOW_IPAD === '1') return false // teste: qualquer aparelho; só o administrador entra (ver Gate)
  return iphone || androidPhone || isIpad()
}

function Unsupported() {
  return (
    <div className="wl">
      <header className="wl-top">
        <img src={base + 'icon-192.png'} alt="" width={36} height={36} />
        <span className="wl-brand">Palco <span>Keys</span></span>
      </header>
      <main className="wl-main">
        <div className="wl-login">
          <h2>Este aparelho não é compatível</h2>
          <p>O Palco Keys funciona em tablet Android e em computador com Windows, macOS ou Linux. iPad em breve.</p>
        </div>
      </main>
    </div>
  )
}

/** Só na versão de teste: mostra que a conta logada não é de administrador e deixa sair dela. */
function TestBlocked() {
  return (
    <div className="wl">
      <header className="wl-top">
        <img src={base + 'icon-192.png'} alt="" width={36} height={36} />
        <span className="wl-brand">Palco <span>Keys</span></span>
      </header>
      <main className="wl-main">
        <div className="wl-login">
          <h2>Teste: conta sem administrador</h2>
          <p>Esta sessão não é de administrador. Saia desta conta e entre com o e-mail de administrador.</p>
          <button className="wl-btn" onClick={async () => { await signOut(); location.reload() }}>Sair desta conta</button>
        </div>
      </main>
    </div>
  )
}

/** Porteiro do app: boas-vindas na primeira vez, confere o acesso e abre o app. */
export default function Gate() {
  const [acc, setAcc] = useState<Access | null>(null)
  const [welcome, setWelcome] = useState(!seen())
  const [admin, setAdmin] = useState(location.hash === '#admin')

  const recheck = useCallback(async () => { setAcc(await checkAccess()) }, [])
  useEffect(() => { recheck() }, [recheck])
  useEffect(() => {
    if (!accessEnabled) return
    const { data } = sb().auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') recheck() })
    return () => data.subscription.unsubscribe()
  }, [recheck])
  /** Ao voltar para a aba (ex.: depois de tocar no link do e-mail), confere o acesso de novo sozinho. */
  useEffect(() => {
    if (!accessEnabled) return
    const back = () => { if (document.visibilityState === 'visible') recheck() }
    document.addEventListener('visibilitychange', back)
    window.addEventListener('focus', back)
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back) }
  }, [recheck])
  useEffect(() => {
    const w = () => setWelcome(true)
    const h = () => setAdmin(location.hash === '#admin')
    window.addEventListener('palco:welcome', w)
    window.addEventListener('hashchange', h)
    return () => { window.removeEventListener('palco:welcome', w); window.removeEventListener('hashchange', h) }
  }, [])

  const enter = async () => { markSeen(); setWelcome(false); await recheck() }

  if (unsupportedDevice()) return <Unsupported />
  // Teste de iPad: só a conta de administrador passa; os demais veem a mensagem de aparelho não compatível.
  if (import.meta.env.VITE_ALLOW_IPAD === '1' && acc && acc.ok && !acc.admin) return <TestBlocked />

  if (accessEnabled && !acc) return <div className="wl"><div className="wl-wait">Conferindo seu acesso…</div></div>
  if (admin && acc && acc.ok && acc.admin) return <Admin onClose={() => { location.hash = ''; setAdmin(false) }} />
  const blocked = accessEnabled && acc && !acc.ok
  if (welcome || blocked) return <Welcome acc={acc} onEnter={enter} />
  return <App />
}
