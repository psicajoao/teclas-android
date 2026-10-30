import { useCallback, useEffect, useState } from 'react'
import App from './App'
import Admin from './admin'
import { accessEnabled, checkAccess, confirmSignUp, daysLeft, REASON_TEXT, resetPassword, sb, sendLink, setNewPassword, signInPassword, signOut, signUp, verifyCode, wantTrial, type Access } from './access'

const SEEN = 'palco-keys.welcome'
/** Teste grátis e botão de compra: ligados só no lançamento (variáveis do build), para não abrir o app antes da hora. */
const TRIAL_ON = import.meta.env.VITE_TRIAL === 'on'
const BUY_URL = (import.meta.env.VITE_BUY_URL as string | undefined) || ''
const base = import.meta.env.BASE_URL
const SLIDES = [
  { img: '1.jpg', t: 'Toque ao vivo, sem complicação', p: 'Camadas, divisões de teclado e timbres prontos para o palco. Tudo na tela, do jeito que você toca.' },
  { img: '2.jpg', t: 'Escolha o timbre em segundos', p: 'Pianos, cordas, pads e corais organizados em pastas. Favoritos sempre à mão.' },
  { img: '3.jpg', t: 'Biblioteca de sons', p: 'Instale bancos de sons com um toque e deixe o app com a sua cara.' },
  { img: '4.jpg', t: 'Regiões do teclado', p: 'Divida o teclado e toque baixo, pad e solo ao mesmo tempo.' },
  { img: '5.jpg', t: 'Feito para computador', p: 'Computador com Windows, macOS ou Linux, no Chrome ou Edge. Instale pelo navegador e use até sem internet.' },
]

function seen(): boolean { try { return !!localStorage.getItem(SEEN) } catch { return false } }
function markSeen() { try { localStorage.setItem(SEEN, '1') } catch { /* ok */ } }

function Welcome({ acc, onEnter }: { acc: Access | null; onEnter: () => void }) {
  const last = SLIDES.length
  /** Quem ainda não tem acesso vai direto para a tela de e-mail (sem passar pelos slides). */
  const [i, setI] = useState(acc && !acc.ok ? last : 0)
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  /** entrar | criar | confirmar (código do e-mail) | esqueci (envia o link de nova senha) */
  const [mode, setMode] = useState<'entrar' | 'criar' | 'confirmar' | 'esqueci'>(TRIAL_ON ? 'criar' : 'entrar')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const go = (n: number) => setI((x) => Math.max(0, Math.min(last, x + n)))

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const validEmail = () => /^\S+@\S+\.\S+$/.test(email)
  const swap = (m: typeof mode) => { setMode(m); setMsg(''); setPass(''); setPass2('') }

  const create = async () => {
    if (!validEmail()) { setMsg('Digite um e-mail válido.'); return }
    if (pass.length < 8) { setMsg('A senha precisa ter pelo menos 8 caracteres.'); return }
    if (pass !== pass2) { setMsg('As duas senhas não são iguais.'); return }
    setBusy(true); setMsg('')
    const r = await signUp(email, pass)
    setBusy(false)
    if (r.err) setMsg(/already|registered/i.test(r.err) ? 'Este e-mail já tem conta. Toque em "Já tenho conta".' : 'Não consegui criar a conta: ' + r.err)
    else if (r.confirm) setMode('confirmar')
    else onEnter()
  }

  const login = async () => {
    if (!validEmail() || !pass) { setMsg('Digite o e-mail e a senha.'); return }
    setBusy(true); setMsg('')
    const err = await signInPassword(email, pass)
    setBusy(false)
    if (err) setMsg(/confirm/i.test(err) ? 'Falta confirmar o e-mail. Abra o e-mail que enviamos e toque no botão de confirmar.' : 'E-mail ou senha incorretos.')
    else onEnter()
  }

  const confirm = async () => {
    if (code.trim().length < 6) { setMsg('Digite o código que chegou no e-mail.'); return }
    setBusy(true); setMsg('')
    const err = await confirmSignUp(email, code)
    setBusy(false)
    if (err) setMsg('Código não confere. Confira o e-mail ou crie a conta de novo.')
    else onEnter()
  }

  const forgot = async () => {
    if (!validEmail()) { setMsg('Digite o seu e-mail.'); return }
    setBusy(true); setMsg('')
    const err = await resetPassword(email)
    setBusy(false)
    setMsg(err ? 'Não consegui enviar: ' + err : 'Enviamos um e-mail com o link para criar uma nova senha.')
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
            <h2>{!accessEnabled ? 'Tudo pronto!' : mode === 'criar' ? 'Criar conta' : mode === 'entrar' ? 'Entrar' : 'Palco Keys'}</h2>
            {!accessEnabled ? (
              <>
                <p>Toque em começar para abrir o Palco Keys.</p>
                <button className="wl-btn" onClick={onEnter}>Começar</button>
              </>
            ) : mode === 'confirmar' ? (
              <>
                <p>Enviamos um e-mail para <b>{email}</b>. Toque no botão de confirmar, ou digite aqui o código de 6 números.</p>
                <input inputMode="numeric" autoComplete="one-time-code" placeholder="código" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                <button className="wl-btn" disabled={busy} onClick={confirm}>{busy ? 'Conferindo…' : 'Confirmar e entrar'}</button>
                <button className="wl-link" onClick={() => swap('criar')}>Usar outro e-mail</button>
              </>
            ) : mode === 'esqueci' ? (
              <>
                <p>Digite o e-mail da sua conta. Enviaremos um link para criar uma nova senha.</p>
                <input type="email" inputMode="email" autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button className="wl-btn" disabled={busy} onClick={forgot}>{busy ? 'Enviando…' : 'Enviar link'}</button>
                <button className="wl-link" onClick={() => swap('entrar')}>Voltar</button>
              </>
            ) : mode === 'criar' ? (
              <>
                <p>{TRIAL_ON ? 'Crie a sua conta para começar o teste grátis de 7 dias. Quem já comprou cria a conta com o e-mail da compra.' : 'Crie a sua conta com o e-mail da compra.'}</p>
                <input type="email" inputMode="email" autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input type="password" autoComplete="new-password" placeholder="senha (mínimo 8 caracteres)" value={pass} onChange={(e) => setPass(e.target.value)} />
                <input type="password" autoComplete="new-password" placeholder="repita a senha" value={pass2} onChange={(e) => setPass2(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create() }} />
                <button className="wl-btn" disabled={busy} onClick={create}>{busy ? 'Criando…' : TRIAL_ON ? 'Criar conta e testar 7 dias grátis' : 'Criar conta'}</button>
                <button className="wl-link" onClick={() => swap('entrar')}>Já tenho conta</button>
                {BUY_URL && <a className="wl-btn o" href={BUY_URL} target="_blank" rel="noreferrer">Comprar licença (R$ 199)</a>}
              </>
            ) : (
              <>
                <p>{denied || 'Entre com o e-mail e a senha da sua conta.'}</p>
                <input id="wl-email" type="email" inputMode="email" autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input type="password" autoComplete="current-password" placeholder="senha" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') login() }} />
                <button className="wl-btn" disabled={busy} onClick={login}>{busy ? 'Entrando…' : 'Entrar'}</button>
                <button className="wl-link" onClick={() => swap('esqueci')}>Esqueci a senha</button>
                <button className="wl-link" onClick={() => swap('criar')}>Criar conta</button>
                {BUY_URL && <a className="wl-btn o" href={BUY_URL} target="_blank" rel="noreferrer">Comprar licença (R$ 199)</a>}
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
  const android = /Android/.test(ua) // celular ou tablet
  // Versão de teste para iPad (build com VITE_ALLOW_IPAD=1): iPad só entra com a conta de administrador (ver Gate).
  if (import.meta.env.VITE_ALLOW_IPAD === '1') return false // teste: qualquer aparelho; só o administrador entra (ver Gate)
  return iphone || android || isIpad()
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
          <p>O Palco Keys é feito para computador, com Windows, macOS ou Linux, usando Chrome ou Edge. Abra este endereço no seu computador.</p>
        </div>
      </main>
    </div>
  )
}

/** Só na versão de teste: tira a sessão do navegador mesmo se o Supabase demorar ou falhar, e recarrega limpo. */
async function forceSignOut() {
  try {
    await Promise.race([signOut(), new Promise((r) => setTimeout(r, 3000))])
  } catch { /* segue para limpar */ }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('sb-') || k.includes('supabase') || k.startsWith('palco')) localStorage.removeItem(k)
    sessionStorage.clear()
  } catch { /* ok */ }
  location.href = location.pathname + '?v=' + Date.now()
}

/** Só na versão de teste: entrar como administrador direto nesta tela, com o código de 6 dígitos do e-mail. */
function TestLogin({ acc }: { acc: Access | null }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const nonAdmin = !!(acc && acc.ok && !acc.admin)

  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setMsg('Digite um e-mail válido.'); return }
    setBusy(true); setMsg(''); wantTrial(false)
    const err = await sendLink(email)
    setBusy(false)
    if (err) setMsg('Não consegui enviar: ' + err)
    else setSent(true)
  }
  const verify = async () => {
    if (code.trim().length < 6) { setMsg('Digite o código que chegou no e-mail.'); return }
    setBusy(true); setMsg('')
    const err = await verifyCode(email, code)
    setBusy(false)
    if (err) setMsg('Código não confere: ' + err)
    else location.reload()
  }

  return (
    <div className="wl">
      <header className="wl-top">
        <img src={base + 'icon-192.png'} alt="" width={36} height={36} />
        <span className="wl-brand">Palco <span>Keys</span></span>
      </header>
      <main className="wl-main">
        <div className="wl-login">
          <h2>Teste: entrar como administrador</h2>
          {nonAdmin && <p>Esta sessão não é de administrador. Entre abaixo com o e-mail de administrador.</p>}
          {!sent ? (
            <>
              <p>Digite o e-mail de administrador. Vamos enviar um código de acesso.</p>
              <input type="email" inputMode="email" autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="wl-btn" disabled={busy} onClick={send}>{busy ? 'Enviando…' : 'Enviar código'}</button>
            </>
          ) : (
            <>
              <p>Digite o código que chegou em <b>{email}</b>.</p>
              <input inputMode="numeric" autoComplete="one-time-code" placeholder="código" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))} />
              <button className="wl-btn" disabled={busy} onClick={verify}>{busy ? 'Confirmando…' : 'Entrar'}</button>
              <button className="wl-link" onClick={() => { setSent(false); setCode('') }}>Usar outro e-mail</button>
            </>
          )}
          {msg && <p className="wl-err">{msg}</p>}
          {nonAdmin && <button className="wl-link" onClick={() => forceSignOut()}>Sair desta conta</button>}
        </div>
      </main>
    </div>
  )
}


/** Conta sem acesso (teste terminou, sem licença, cancelado): explica e leva à compra. */
function Ended({ acc, onOut }: { acc: Extract<Access, { ok: false }>; onOut: () => void }) {
  const expiredTrial = acc.reason === 'expired' && !!acc.trial
  const title = expiredTrial ? 'Seu teste grátis terminou' : acc.reason === 'expired' ? 'Seu acesso terminou' : 'Sua conta ainda não tem licença'
  const text = expiredTrial
    ? 'Os 7 dias de teste acabaram. Para continuar usando o Palco Keys, é preciso comprar a licença. Depois da compra, é só entrar de novo com este mesmo e-mail.'
    : acc.reason === 'not_listed'
      ? 'Sua conta está criada, mas este e-mail ainda não tem licença. Compre a licença com este mesmo e-mail para liberar o app.'
      : REASON_TEXT[acc.reason]
  return (
    <div className="wl">
      <header className="wl-top">
        <img src={base + 'icon-192.png'} alt="" width={36} height={36} />
        <span className="wl-brand">Palco <span>Keys</span></span>
      </header>
      <main className="wl-main">
        <div className="wl-login">
          <img className="wl-logo" src={base + 'icon-512.png'} alt="" width={84} height={84} />
          <h2>{title}</h2>
          <p>{text}</p>
          {BUY_URL && <a className="wl-btn" href={BUY_URL} target="_blank" rel="noreferrer">Comprar licença (R$ 199)</a>}
          <button className="wl-link" onClick={onOut}>Sair desta conta</button>
        </div>
      </main>
    </div>
  )
}

/** Contagem regressiva do teste, sempre visível dentro do app. */
function TrialBadge({ until }: { until: string }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(t) }, [])
  const d = daysLeft(until)
  if (d === null) return null
  const txt = d === 0 ? 'Último dia de teste' : d === 1 ? 'Falta 1 dia de teste' : `Faltam ${d} dias de teste`
  return (
    <div className="trial-badge" role="status">
      <span>{txt}</span>
      {BUY_URL && <a href={BUY_URL} target="_blank" rel="noreferrer">Comprar</a>}
    </div>
  )
}

/** Quem pediu "esqueci a senha" volta pelo link do e-mail e cria a nova senha aqui. */
function NewPassword({ onDone }: { onDone: () => void }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const save = async () => {
    if (a.length < 8) { setMsg('A senha precisa ter pelo menos 8 caracteres.'); return }
    if (a !== b) { setMsg('As duas senhas não são iguais.'); return }
    setBusy(true); setMsg('')
    const err = await setNewPassword(a)
    setBusy(false)
    if (err) setMsg('Não consegui salvar: ' + err)
    else onDone()
  }
  return (
    <div className="wl">
      <header className="wl-top">
        <img src={base + 'icon-192.png'} alt="" width={36} height={36} />
        <span className="wl-brand">Palco <span>Keys</span></span>
      </header>
      <main className="wl-main">
        <div className="wl-login">
          <h2>Nova senha</h2>
          <p>Escolha a nova senha da sua conta.</p>
          <input type="password" autoComplete="new-password" placeholder="nova senha (mínimo 8 caracteres)" value={a} onChange={(e) => setA(e.target.value)} />
          <input type="password" autoComplete="new-password" placeholder="repita a senha" value={b} onChange={(e) => setB(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
          <button className="wl-btn" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar senha'}</button>
          {msg && <p className="wl-err">{msg}</p>}
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
  const [recovery, setRecovery] = useState(false)

  const recheck = useCallback(async () => { setAcc(await checkAccess()) }, [])
  useEffect(() => { recheck() }, [recheck])
  useEffect(() => {
    if (!accessEnabled) return
    const { data } = sb().auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') setRecovery(true); else if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') recheck() })
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
    const h = () => setAdmin(location.hash === '#admin')
    window.addEventListener('hashchange', h)
    return () => { window.removeEventListener('hashchange', h) }
  }, [])

  // Quem já está liberado nunca vê as boas-vindas: elas só aparecem antes do primeiro acesso.
  useEffect(() => { if (acc && acc.ok && welcome) { markSeen(); setWelcome(false) } }, [acc, welcome])

  const enter = async () => { markSeen(); setWelcome(false); await recheck() }

  if (unsupportedDevice()) return <Unsupported />
  // Teste de iPad: só a conta de administrador passa; os demais veem a mensagem de aparelho não compatível.
  if (import.meta.env.VITE_ALLOW_IPAD === '1' && accessEnabled && acc && !(acc.ok && acc.admin)) return <TestLogin acc={acc} />

  if (accessEnabled && !acc) return <div className="wl"><div className="wl-wait">Conferindo seu acesso…</div></div>
  if (admin && acc && acc.ok && acc.admin) return <Admin onClose={() => { location.hash = ''; setAdmin(false) }} />
  if (recovery) return <NewPassword onDone={() => { setRecovery(false); recheck() }} />
  const blocked = accessEnabled && acc && !acc.ok
  const ended = blocked && acc && !acc.ok && ['expired', 'not_listed', 'trial_used', 'revoked'].includes(acc.reason)
  if (ended && acc && !acc.ok) return <Ended acc={acc} onOut={async () => { await signOut(); await enter() }} />
  if (welcome || blocked) return <Welcome acc={acc} onEnter={enter} />
  return (
    <>
      <App />
      {accessEnabled && acc && acc.ok && acc.trial && acc.until && <TrialBadge until={acc.until} />}
    </>
  )
}
