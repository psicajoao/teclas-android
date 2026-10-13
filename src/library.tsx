import { useState } from 'react'
import { addBanks, listBanks, MAX_BANKS } from './bank'

type Item = { file: string; name: string; author: string; license: string; mb: number; desc: string }
const ITEMS: Item[] = [
  { file: 'TimGM6mb.sf2', name: 'TimGM6mb', author: 'Tim Brechbill / David Bolton', license: 'GPL-2', mb: 6, desc: 'Leve e rápido. Bom para celulares mais simples.' },
  { file: 'FluidR3Mono_GM.sf3', name: 'Fluid R3 Mono GM', author: 'Frank Wen / Michael Cowgill', license: 'MIT', mb: 24, desc: 'Clássico GM completo, som equilibrado.' },
  { file: 'MuseScore_General_Lite.sf3', name: 'MuseScore General Lite', author: 'S. Christian Collins', license: 'MIT / CC0', mb: 40, desc: 'GM moderno e compacto, ótimo piano e cordas.' },
  { file: 'MuseScore_General_Full.sf3', name: 'MuseScore General Full', author: 'S. Christian Collins', license: 'MIT / CC0', mb: 86, desc: 'A versão mais completa e de maior qualidade. Arquivo grande.' },
]

export function Library({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const have = new Set(listBanks().map((b) => b.name))
  const get = async (it: Item) => {
    setErr('')
    if (listBanks().length >= MAX_BANKS) return setErr(`A lista já está cheia (${MAX_BANKS}). Remova algum SoundFont antes.`)
    setBusy(`Baixando ${it.name}…`)
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}sounds/library/${it.file}`)
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const blob = await r.blob()
      setBusy(`Guardando ${it.name}…`)
      await addBanks([new File([blob], it.file)])
      onDone(`${it.name} guardado. Recarregando…`)
    } catch (e) {
      const q = e instanceof DOMException && e.name === 'QuotaExceededError'
      setErr(q ? 'Sem espaço no aparelho. Abra pelo ícone da tela de início ou apague SoundFonts antigos.' : 'Não consegui baixar: ' + (e instanceof Error ? e.message : String(e)))
      setBusy('')
    }
  }
  return (
    <div className="overlay" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Biblioteca de sons</h2>
          <button className="ghost" onClick={onClose} disabled={!!busy}>Fechar</button>
        </div>
        <p className="pick-hint">SoundFonts de licença livre. Cada um baixa só o que quiser; fica guardado no seu aparelho e funciona sem internet. Use Wi-Fi nos arquivos grandes.</p>
        {busy && <p className="pick-hint"><b>{busy}</b> Aguarde, não feche.</p>}
        {err && <p className="pick-hint" style={{ color: '#ff8a8a' }}>{err}</p>}
        <div className="liblist" style={{ display: 'grid', gap: 8, padding: '4px 2px' }}>
          {ITEMS.map((it) => (
            <div key={it.file} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid #ffffff22', borderRadius: 10, padding: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{it.name} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {it.mb} MB</span></div>
                <div style={{ fontSize: '0.8em', opacity: 0.75 }}>{it.desc}</div>
                <div style={{ fontSize: '0.75em', opacity: 0.55 }}>{it.author} · Licença {it.license}</div>
              </div>
              <button className="ghost" disabled={!!busy || have.has(it.file)} onClick={() => void get(it)}>{have.has(it.file) ? 'Instalado' : 'Baixar'}</button>
            </div>
          ))}
        </div>
        <p className="pick-hint" style={{ fontSize: '0.75em', opacity: 0.6 }}>Créditos e licenças: /sounds/library/LICENCAS.txt. SoundFonts que você adicionar por conta própria (＋ Adicionar) são de sua responsabilidade; o Palco Keys não fornece nem se responsabiliza por esses arquivos.</p>
      </div>
    </div>
  )
}
