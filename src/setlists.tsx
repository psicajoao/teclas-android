import { useState } from 'react'
import type { Song, Setlist } from './store'
import { uid } from './store'

type Props = {
  songs: Song[]
  setlists: Setlist[]
  active: string | null
  current?: string
  onSetlists: (fn: (all: Setlist[]) => Setlist[]) => void
  onOpen: (id: string | null) => void
  onClose: () => void
  onPlaySong: (id: string) => void
}

/** Listas de músicas (culto, ensaio…): a biblioteca guarda todas as músicas; cada lista escolhe e ordena as do dia. */
export function SetlistPage({ songs, setlists, active, onSetlists, onOpen, onClose }: Props) {
  const [sel, setSel] = useState<string>(active ?? 'all')
  const [confirmDel, setConfirmDel] = useState(false)
  const list = setlists.find((x) => x.id === sel) ?? null
  const patch = (p: Partial<Setlist>) => onSetlists((all) => all.map((x) => (x.id === sel ? { ...x, ...p } : x)))
  const byId = (id: string) => songs.find((s) => s.id === id)
  const ids = list ? list.ids.filter((i) => byId(i)) : []
  const create = () => {
    const n: Setlist = { id: uid(), name: `Lista ${setlists.length + 1}`, date: '', ids: [] }
    onSetlists((all) => [...all, n])
    setSel(n.id)
  }
  const duplicate = () => {
    if (!list) return
    const n: Setlist = { ...list, id: uid(), name: `${list.name} (cópia)`, ids: [...ids] }
    onSetlists((all) => [...all, n])
    setSel(n.id)
  }
  const remove = () => {
    if (!list) return
    if (!confirmDel) {
      setConfirmDel(true)
      setTimeout(() => setConfirmDel(false), 3000)
      return
    }
    onSetlists((all) => all.filter((x) => x.id !== list.id))
    setSel('all')
    setConfirmDel(false)
    if (active === list.id) onOpen(null)
  }
  const toggle = (id: string) => patch({ ids: ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id] })
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= ids.length) return
    const a = [...ids]
    ;[a[i], a[j]] = [a[j], a[i]]
    patch({ ids: a })
  }
  const fmtDate = (d?: string) => (d ? d.split('-').reverse().join('/') : '')

  return (
    <div className="overlay center" onClick={onClose}>
      <div className="fxsheet wide slp" role="dialog" aria-label="Listas de músicas" onClick={(e) => e.stopPropagation()}>
        <header className="fxs-head">
          <h3>Listas de músicas</h3>
          <button className="ghost primary" onClick={onClose}>
            Fechar
          </button>
        </header>
        <div className="slp-body">
          <nav className="slp-lists" aria-label="Listas">
            <button className={'slp-li' + (sel === 'all' ? ' on' : '') + (active == null ? ' live' : '')} onClick={() => setSel('all')}>
              <b>Todas as músicas</b>
              <small>Biblioteca · {songs.length}</small>
            </button>
            {setlists.map((x) => (
              <button key={x.id} className={'slp-li' + (sel === x.id ? ' on' : '') + (active === x.id ? ' live' : '')} onClick={() => setSel(x.id)}>
                <b>{x.name || 'Sem nome'}</b>
                <small>
                  {fmtDate(x.date) && `${fmtDate(x.date)} · `}
                  {x.ids.filter((i) => byId(i)).length} músicas
                </small>
              </button>
            ))}
            <button className="slp-li add" onClick={create}>
              ＋ Nova lista
            </button>
          </nav>

          <section className="slp-main">
            {!list ? (
              <>
                <p className="fxs-hint">
                  Aqui ficam todas as músicas que você já criou, com os timbres de cada uma. Para um culto ou ensaio, crie uma lista ao lado e escolha só as músicas que vai tocar, na ordem.
                </p>
                <button className="ghost primary" onClick={() => onOpen(null)}>
                  Tocar todas as músicas
                </button>
              </>
            ) : (
              <>
                <div className="slp-meta">
                  <input value={list.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Nome da lista" placeholder="Nome (ex.: Culto domingo)" />
                  <input type="date" value={list.date ?? ''} onChange={(e) => patch({ date: e.target.value })} aria-label="Data" />
                </div>
                <div className="slp-actions">
                  <button className="ghost primary" onClick={() => onOpen(list.id)}>
                    Tocar esta lista
                  </button>
                  <button className="ghost" onClick={duplicate}>
                    Duplicar
                  </button>
                  <button className={'ghost' + (confirmDel ? ' danger on' : '')} onClick={remove}>
                    {confirmDel ? 'Toque de novo para excluir' : 'Excluir lista'}
                  </button>
                </div>

                <div className="slp-cols">
                  <div className="slp-col">
                <h4>Biblioteca · toque para escolher</h4>
                <div className="slp-pick">
                  {songs.map((s) => {
                    const pos = ids.indexOf(s.id!)
                    return (
                      <button key={s.id} className={'slp-song' + (pos >= 0 ? ' on' : '')} onClick={() => toggle(s.id!)} aria-pressed={pos >= 0}>
                        <i>{pos >= 0 ? pos + 1 : '+'}</i>
                        <span>{s.name || 'Sem nome'}</span>
                      </button>
                    )
                  })}
                </div>
                  </div>
                  <div className="slp-col">
                <h4>Ordem para tocar ({ids.length})</h4>
                {ids.length === 0 ? (
                  <p className="fxs-hint">Vazia. Toque nas músicas abaixo, na ordem em que quer tocar.</p>
                ) : (
                  <ol className="slp-order">
                    {ids.map((id, i) => (
                      <li key={id}>
                        <span className="n">{i + 1}</span>
                        <b>{byId(id)!.name || 'Sem nome'}</b>
                        <button className="ghost sq" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">
                          ▲
                        </button>
                        <button className="ghost sq" onClick={() => move(i, 1)} disabled={i === ids.length - 1} aria-label="Descer">
                          ▼
                        </button>
                        <button className="ghost sq" onClick={() => toggle(id)} aria-label="Tirar da lista">
                          ✕
                        </button>
                      </li>
                    ))}
                  </ol>
                )}

                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
