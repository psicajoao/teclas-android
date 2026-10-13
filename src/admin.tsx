import { useCallback, useEffect, useState } from 'react'
import { sb } from './access'

type Lic = { email: string; expires_at: string | null; active: boolean; max_devices: number; is_admin: boolean; note: string | null }
type Dev = { email: string; device_id: string; name: string | null; last_seen: string }

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : 'Permanente')
const status = (l: Lic) => (!l.active ? 'Cancelado' : l.expires_at && new Date(l.expires_at) < new Date() ? 'Vencido' : 'Ativo')

/** Painel do dono: liberar, dar prazo, cancelar e ver aparelhos. Abre em #admin. */
export default function Admin({ onClose }: { onClose: () => void }) {
  const [lics, setLics] = useState<Lic[]>([])
  const [devs, setDevs] = useState<Dev[]>([])
  const [email, setEmail] = useState('')
  const [days, setDays] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const a = await sb().from('pk_licenses').select('*').order('created_at', { ascending: false })
    const b = await sb().from('pk_devices').select('*').order('last_seen', { ascending: false })
    if (a.error) setMsg(a.error.message)
    setLics((a.data as Lic[]) ?? [])
    setDevs((b.data as Dev[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const add = async () => {
    const em = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(em)) { setMsg('E-mail inválido.'); return }
    const d = parseInt(days, 10)
    const expires_at = d > 0 ? new Date(Date.now() + d * 864e5).toISOString() : null
    const { error } = await sb().from('pk_licenses').upsert({ email: em, expires_at, active: true, note: note || null })
    setMsg(error ? error.message : `Liberado: ${em}`)
    if (!error) { setEmail(''); setDays(''); setNote('') }
    load()
  }
  const toggle = async (l: Lic) => { await sb().from('pk_licenses').update({ active: !l.active }).eq('email', l.email); load() }
  const del = async (l: Lic) => { await sb().from('pk_devices').delete().eq('email', l.email); await sb().from('pk_licenses').delete().eq('email', l.email); load() }
  const free = async (d: Dev) => { await sb().from('pk_devices').delete().eq('email', d.email).eq('device_id', d.device_id); load() }

  return (
    <div className="wl adm">
      <header className="wl-top">
        <span className="wl-brand">Acessos <span>Palco Keys</span></span>
        <button className="wl-skip" onClick={onClose}>Voltar ao app</button>
      </header>
      <main className="adm-main">
        <section className="adm-card">
          <h3>Liberar alguém</h3>
          <div className="adm-form">
            <input id="adm-email" type="email" placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input id="adm-days" inputMode="numeric" placeholder="dias (vazio = permanente)" value={days} onChange={(e) => setDays(e.target.value)} />
            <input id="adm-note" placeholder="anotação (ex.: amigo, banda)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="wl-btn" onClick={add}>Liberar</button>
          </div>
          {msg && <p className="wl-err">{msg}</p>}
        </section>
        <section className="adm-card">
          <h3>Pessoas ({lics.length})</h3>
          <div className="adm-list">
            {lics.map((l) => (
              <div key={l.email} className="adm-row">
                <div className="adm-who">
                  <b>{l.email}</b>{l.is_admin ? ' · dono' : ''}
                  <small>{status(l)} · até {fmt(l.expires_at)}{l.note ? ' · ' + l.note : ''}</small>
                  {devs.filter((d) => d.email === l.email).map((d) => (
                    <small key={d.device_id} className="adm-dev">{d.name || 'Aparelho'} · visto {fmt(d.last_seen)} <button onClick={() => free(d)}>remover</button></small>
                  ))}
                </div>
                {!l.is_admin && (
                  <div className="adm-act">
                    <button onClick={() => toggle(l)}>{l.active ? 'Cancelar' : 'Reativar'}</button>
                    <button onClick={() => del(l)}>Excluir</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
