import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Preencha depois de criar o projeto no Supabase. Vazio = o app abre sem login. */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const GATE_KEY = 'palco-keys.gate'
/** Modo teste: o login só liga em quem abrir o app com ?acesso=1 (os outros seguem sem login). */
export const GATE_MODE: string = import.meta.env.VITE_GATE_MODE || 'on'
function testOn(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('acesso')
    if (q === '1') localStorage.setItem(GATE_KEY, '1')
    if (q === '0') localStorage.removeItem(GATE_KEY)
    return !!localStorage.getItem(GATE_KEY)
  } catch { return false }
}
export const accessEnabled = !!(SUPABASE_URL && SUPABASE_ANON_KEY) && (GATE_MODE !== 'test' || testOn())

/** Quantos dias o app segue liberado sem conseguir falar com o servidor (tocar sem internet). */
const GRACE_DAYS = 7
const CACHE_KEY = 'palco-keys.access'
const DEV_KEY = 'palco-keys.device'

export type Reason = 'no_session' | 'not_listed' | 'revoked' | 'expired' | 'device_limit' | 'trial_used' | 'offline' | 'error'
export type Access = { ok: true; until: string | null; admin: boolean } | { ok: false; reason: Reason }

let client: SupabaseClient | null = null
export function sb(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  return client
}

function deviceId(): string {
  try {
    let d = localStorage.getItem(DEV_KEY)
    if (!d) { d = crypto.randomUUID(); localStorage.setItem(DEV_KEY, d) }
    return d
  } catch { return 'sem-armazenamento' }
}

function deviceName(): string {
  const u = navigator.userAgent
  const os = /iPad/.test(u) ? 'iPad' : /iPhone/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Aparelho'
  const br = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : /Firefox\//.test(u) ? 'Firefox' : ''
  return `${os} ${br}`.trim()
}

type Cache = { email: string; okAt: number; until: string | null; admin: boolean }
const readCache = (): Cache | null => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null } }
const writeCache = (c: Cache | null) => { try { c ? localStorage.setItem(CACHE_KEY, JSON.stringify(c)) : localStorage.removeItem(CACHE_KEY) } catch { /* sem armazenamento */ } }

const WANT_TRIAL = 'palco-keys.trial'
export const wantTrial = (on: boolean) => { try { on ? localStorage.setItem(WANT_TRIAL, '1') : localStorage.removeItem(WANT_TRIAL) } catch { /* ok */ } }

/** Confere se esta pessoa pode usar o app agora. Sem internet, vale a última liberação por alguns dias. */
export async function checkAccess(): Promise<Access> {
  // Se a conferência travar (rede lenta ou travamento do navegador), não deixa a tela presa em "Conferindo…".
  const slow = new Promise<Access>(res => setTimeout(() => {
    const c = readCache()
    res(c && Date.now() - c.okAt < GRACE_DAYS * 864e5 && (!c.until || new Date(c.until).getTime() > Date.now()) ? { ok: true, until: c.until, admin: c.admin } : { ok: false, reason: 'no_session' })
  }, 9000))
  return Promise.race([checkAccessReal(), slow])
}

async function checkAccessReal(): Promise<Access> {
  if (!accessEnabled) return { ok: true, until: null, admin: false }
  const cached = readCache()
  const offlineOk = (): Access =>
    cached && Date.now() - cached.okAt < GRACE_DAYS * 864e5 && (!cached.until || new Date(cached.until).getTime() > Date.now())
      ? { ok: true, until: cached.until, admin: cached.admin }
      : { ok: false, reason: 'offline' }
  try {
    const { data: s } = await sb().auth.getSession()
    if (!s.session) return cached && !navigator.onLine ? offlineOk() : { ok: false, reason: 'no_session' }
    let trial = false
    try { trial = !!localStorage.getItem(WANT_TRIAL) } catch { /* ok */ }
    const { data, error } = await sb().rpc('pk_check_access', { p_device: deviceId(), p_name: deviceName(), p_trial: trial })
    if (error) return offlineOk()
    const r = data as { ok: boolean; reason?: Reason; until?: string | null; admin?: boolean }
    if (r.ok) {
      wantTrial(false)
      writeCache({ email: s.session.user.email ?? '', okAt: Date.now(), until: r.until ?? null, admin: !!r.admin })
      return { ok: true, until: r.until ?? null, admin: !!r.admin }
    }
    writeCache(null)
    return { ok: false, reason: r.reason ?? 'error' }
  } catch {
    return offlineOk()
  }
}

/** Envia o e-mail com o botão "Liberar este aparelho" e o código de 6 números. */
export async function sendLink(email: string): Promise<string | null> {
  const { error } = await sb().auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: location.origin + location.pathname + (GATE_MODE === 'test' ? '?acesso=1' : '') } })
  return error ? error.message : null
}

/** Para quem abriu o app instalado (o botão do e-mail abre no navegador): entra com o código. */
export async function verifyCode(email: string, token: string): Promise<string | null> {
  const { error } = await sb().auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email' })
  return error ? error.message : null
}

export async function signOut() {
  writeCache(null)
  if (accessEnabled) await sb().auth.signOut()
}

export const REASON_TEXT: Record<Reason, string> = {
  no_session: 'Entre com o seu e-mail para continuar.',
  not_listed: 'Este e-mail ainda não tem acesso liberado. Peça a liberação ou comece o teste grátis.',
  revoked: 'O acesso deste e-mail foi cancelado.',
  expired: 'O período de acesso deste e-mail terminou.',
  device_limit: 'Este e-mail já está em aparelhos demais. Peça para liberar outro aparelho.',
  trial_used: 'Este aparelho já usou o teste grátis. Para continuar, faça a compra.',
  offline: 'Conecte à internet uma vez para confirmar seu acesso.',
  error: 'Não consegui confirmar o acesso agora. Tente de novo.',
}
