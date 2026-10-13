import { TIMBRES } from './timbres'
import { Q_STEPS, Q_LABEL, MAX_TRACKS } from './looper'
import type { Track } from './looper'

const names = (t: Track) => {
  const l = (t.layers ?? []).filter((x) => x.timbre && !x.off).map((x) => TIMBRES.find((m) => m.id === x.timbre)?.name ?? '').filter(Boolean)
  return l.length ? l.slice(0, 3).join(' + ') + (l.length > 3 ? ` +${l.length - 3}` : '') : 'timbre atual'
}

export function TracksSheet({ tracks, playing, recording, onClose, onEdit, onDelete, onRec, onPlay }: {
  tracks: Track[]; playing: boolean; recording: boolean
  onClose: () => void; onEdit: (id: string, p: Partial<Track>) => void; onDelete: (id: string) => void; onRec: () => void; onPlay: () => void
}) {
  return (
    <div className="overlay" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Pistas</h2>
          <button className="ghost" onClick={onPlay} disabled={!tracks.length}>{playing ? '■ Parar' : '▶ Tocar tudo'}</button>
          <button className="ghost" onClick={onRec} disabled={!recording && tracks.length >= MAX_TRACKS}>{recording ? '■ Parar gravação' : '● Gravar nova pista'}</button>
          <button className="ghost" onClick={onClose}>Fechar</button>
        </div>
        <p className="pick-hint">Cada pista guarda o timbre de quando foi gravada. Até {MAX_TRACKS} pistas por música. A quantização (Q) acerta as notas na grade sem apagar o que você tocou.</p>
        <div className="tracklist">
          {tracks.length === 0 && <p style={{ opacity: 0.6 }}>Nenhuma pista ainda. Toque em ● Gravar nova pista.</p>}
          {tracks.map((t, i) => (
            <div key={t.id} className={'trackrow' + (t.mute ? ' mute' : '')}>
              <div className="tinfo">
                <b>Pista {i + 1}</b>
                <small>{t.bars} {t.bars === 1 ? 'compasso' : 'compassos'} · {names(t)}</small>
              </div>
              <button className={'ghost' + (t.mute ? ' on' : '')} aria-pressed={!!t.mute} aria-label={`Silenciar pista ${i + 1}`} onClick={() => onEdit(t.id, { mute: !t.mute })}>M</button>
              <input type="range" min={0} max={127} value={t.vol} aria-label={`Volume da pista ${i + 1}`} onChange={(e) => onEdit(t.id, { vol: +e.target.value })} />
              <button className="ghost" aria-label={`Quantização da pista ${i + 1}: ${Q_LABEL[t.q ?? 0]}`} onClick={() => onEdit(t.id, { q: Q_STEPS[(Q_STEPS.indexOf(t.q ?? 0) + 1) % Q_STEPS.length] })}>Q {Q_LABEL[t.q ?? 0]}</button>
              <button className="ghost" aria-label={`Apagar pista ${i + 1}`} onClick={() => onDelete(t.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
