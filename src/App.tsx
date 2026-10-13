import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { engine } from './engine'
import { rig, pad } from './rig'
import { rangeOf } from './rig'
import type { Layer } from './rig'
import { metro } from './metronome'
import { bendValue, modValue, beatValue, rotorValue, useValue } from './signal'
import { parseMidi, noteName, DRUM_NAMES } from './midi'
import { Library } from './library'
import { addBanks, removeBank, getHidden, setHidden, slotOf, listBanks, MAX_BANKS, bankInfo } from './bank'
import type { Timbre } from './timbres'
import { customStatus } from './bank'
import { FxSheet } from './fxpanel'
import { SoundSheet } from './soundpanel'
import { hasSnd, sndOf } from './chanfx'
import { slotsOf, fxDef, groupSummary } from './fx'
import type { FxSlot } from './fx'
import { audioOn } from './engine'
import { TIMBRES, GROUPS, FAVORITES, CUSTOM_GROUP, customVersion } from './timbres'
import { Drawer, SettingsPanel, LearnPanel } from './panels'
import { waitingValue, lastMsgValue, setBinding, findAction, learnOpen } from './learn'
import { roleOf, connectedIds } from './midiconf'
import MidiTest from './miditest'
import { load, save, newSong, loadPad, savePad, uid } from './store'
import type { Song, Setlist } from './store'
import { SetlistPage } from './setlists'
import { looper, MAX_TRACKS } from './looper'
import type { Track } from './looper'
import { TracksSheet } from './tracks'
import './index.css'

type Status = 'idle' | 'loading' | 'ready' | 'error'
const FIRST = 36 // C2
const LAST = 84 // C6
const FADES = [
  { v: 0, l: 'Instantânea' },
  { v: 1, l: '1 segundo' },
  { v: 2, l: '2 segundos' },
  { v: 4, l: '4 segundos' },
]
const PAD_FADES = [1, 2, 3, 5, 8]
const BEATS = [2, 3, 4, 6]
const LCOLORS = ['#00f0ff', '#b026ff', '#ff4fa3', '#ffb347', '#4dff9a', '#5b8cff', '#ff6b4a', '#e0ff4f', '#c77dff', '#4fe0d0']
const TONES: { n: string; alt?: string }[] = [
  { n: 'C' }, { n: 'C#', alt: 'Db' }, { n: 'D' }, { n: 'D#', alt: 'Eb' }, { n: 'E' }, { n: 'F' },
  { n: 'F#', alt: 'Gb' }, { n: 'G' }, { n: 'G#', alt: 'Ab' }, { n: 'A' }, { n: 'A#', alt: 'Bb' }, { n: 'B' },
]
const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(n % 12)
/** Quantas teclas brancas existem abaixo da nota (posição em "teclas brancas"). */
const wpos = (n: number) => Math.floor(n / 12) * 7 + [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6][n % 12]
const edgeL = (n: number) => (isBlack(n) ? wpos(n) - 0.3 : wpos(n))
const edgeR = (n: number) => (isBlack(n) ? wpos(n) + 0.3 : wpos(n) + 1)
const noteOfWhite = (w: number) => Math.floor(w / 7) * 12 + [0, 2, 4, 5, 7, 9, 11][((w % 7) + 7) % 7]
const PIANO_LO = 21 // A0
const PIANO_HI = 108 // C8
const PIANO_W = wpos(PIANO_HI) + 1 - wpos(PIANO_LO)
const byId = (id: string | null) => (id ? (TIMBRES.find((t) => t.id === id) ?? null) : null)
const tim = (l: Layer) => (l.off ? null : byId(l.timbre))
const clamp127 = (v: number) => Math.max(0, Math.min(127, Math.round(v)))
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const layerNames = (layers: Layer[]) =>
  layers
    .map(tim)
    .filter(Boolean)
    .map((t) => t!.name)
    .join(' + ')

function Fader({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    onChange(clamp127(((r.bottom - 13 - e.clientY) / Math.max(1, r.height - 26)) * 127))
  }
  return (
    <div
      ref={ref}
      className={'fader' + (disabled ? ' off' : '')}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-valuemin={0}
      aria-valuemax={127}
      aria-valuenow={value}
      aria-label="Volume"
      onPointerDown={(e) => {
        if (disabled) return
        e.currentTarget.setPointerCapture(e.pointerId)
        set(e)
      }}
      onPointerMove={(e) => {
        if (!disabled && e.buttons) set(e)
      }}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'ArrowUp') onChange(clamp127(value + 4))
        if (e.key === 'ArrowDown') onChange(clamp127(value - 4))
      }}
    >
      <div className="fill" style={{ height: `calc(13px + (100% - 26px) * ${value / 127})` }} />
      <div className="cap" style={{ bottom: `calc((100% - 26px) * ${value / 127})` }} />
    </div>
  )
}

function HFader({ value, onChange, label, width = 220 }: { value: number; onChange: (v: number) => void; label: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    onChange(clamp127(((e.clientX - r.left - 13) / Math.max(1, r.width - 26)) * 127))
  }
  return (
    <div
      ref={ref}
      className="hfader"
      style={{ width }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={127}
      aria-valuenow={value}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        set(e)
      }}
      onPointerMove={(e) => e.buttons && set(e)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(clamp127(value + 4))
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(clamp127(value - 4))
      }}
    >
      <div className="fill" style={{ width: `calc(13px + (100% - 26px) * ${value / 127})` }} />
      <div className="cap" style={{ left: `calc((100% - 26px) * ${value / 127})` }} />
    </div>
  )
}

export function Knob({ value, onChange, label, reset, disabled, always, fmt }: { value: number; onChange: (v: number) => void; label: string; reset: number; disabled?: boolean; always?: boolean; fmt?: (v: number) => string }) {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const [active, setActive] = useState(false)
  const pct = Math.round((value / 127) * 100)
  return (
    <div className={'knobwrap' + (disabled ? ' off' : '')}>
      <div
        className="knob"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={127}
        aria-valuenow={value}
        title="Arraste para cima ou para baixo. Toque duas vezes para voltar ao padrão."
        style={{ ['--p' as string]: value / 127 }}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, v: value }
          setActive(true)
        }}
        onPointerMove={(e) => {
          if (drag.current) onChange(clamp127(drag.current.v + (drag.current.y - e.clientY) * 0.9))
        }}
        onPointerUp={() => {
          drag.current = null
          setActive(false)
        }}
        onPointerCancel={() => {
          drag.current = null
          setActive(false)
        }}
        onDoubleClick={() => !disabled && onChange(reset)}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'ArrowUp') onChange(clamp127(value + 4))
          if (e.key === 'ArrowDown') onChange(clamp127(value - 4))
        }}
      />
      <span>{label}</span>
      {(always || active) && <b className="kval">{fmt ? fmt(value) : `${pct}%`}</b>}
    </div>
  )
}

function Wheel({ kind }: { kind: 'pitch' | 'mod' }) {
  const ref = useRef<HTMLDivElement>(null)
  const val = useValue(kind === 'pitch' ? bendValue : modValue)
  const frac = kind === 'pitch' ? (val + 1) / 2 : val / 127
  const apply = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const f = clamp((r.bottom - e.clientY) / r.height, 0, 1)
    if (kind === 'pitch') {
      const v = Math.abs(f * 2 - 1) < 0.05 ? 0 : f * 2 - 1
      bendValue.set(v)
      rig.pitchBend(Math.round(8192 + v * 8191))
    } else {
      const v = Math.round(f * 127)
      modValue.set(v)
      rig.cc(1, v)
    }
  }
  const back = () => {
    if (kind !== 'pitch') return
    bendValue.set(0)
    rig.pitchBend(8192)
  }
  return (
    <div className="wheelwrap">
      <div
        ref={ref}
        className={'wheel ' + kind}
        role="slider"
        aria-label={kind === 'pitch' ? 'Pitch bend' : 'Modulação'}
        aria-valuenow={Math.round(frac * 100)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          apply(e)
        }}
        onPointerMove={(e) => e.buttons && apply(e)}
        onPointerUp={back}
        onPointerCancel={back}
      >
        <div className="ridges" />
        <div className="grip" style={{ bottom: `calc(${frac * 100}% - ${frac * 22}px)` }} />
      </div>
      <span>{kind === 'pitch' ? 'Pitch' : 'Mod'}</span>
    </div>
  )
}

function Meter() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    let lvl = 0
    const loop = () => {
      lvl = Math.max(engine.peak(), lvl * 0.9)
      ref.current?.style.setProperty('--lvl', String(Math.min(1, lvl * 1.2)))
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="meter" ref={ref} aria-hidden="true">
      <i />
    </div>
  )
}

function BeatDots({ beats }: { beats: number }) {
  const cur = useValue(beatValue)
  return (
    <span className="beats" aria-hidden="true">
      {Array.from({ length: beats }, (_, i) => (
        <i key={i} className={(i === cur ? 'on ' : '') + (i === 0 ? 'first' : '')} />
      ))}
    </span>
  )
}

function ZoneEditor({ layers, split, onChange, onClose }: { layers: Layer[]; split: number; onChange: (i: number, lo: number, hi: number) => void; onClose: () => void }) {
  const areaRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ i: number; mode: 'lo' | 'hi' | 'move'; w0: number; lo: number; hi: number } | null>(null)
  const w0w = wpos(PIANO_LO)
  const wMin = w0w
  const wMax = wpos(PIANO_HI)
  const loW = (n: number) => Math.max(wMin, Math.min(wMax, wpos(n)))
  const hiW = (n: number) => Math.max(wMin, Math.min(wMax, isBlack(n) ? wpos(n) - 1 : wpos(n)))
  const whiteAt = (clientX: number) => {
    const r = areaRef.current!.getBoundingClientRect()
    return Math.max(wMin, Math.min(wMax, Math.floor(((clientX - r.left) / r.width) * PIANO_W + w0w)))
  }
  const xOf = (e: number) => ((e - w0w) / PIANO_W) * 100
  const rows = layers.map((l, i) => ({ l, i, t: byId(l.timbre) })).filter((r) => r.t && !r.t.drum)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const start = (e: React.PointerEvent, i: number, mode: 'lo' | 'hi' | 'move', lo: number, hi: number) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { i, mode, w0: whiteAt(e.clientX), lo: loW(lo), hi: hiW(hi) }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const w = whiteAt(e.clientX)
    let lo = d.lo
    let hi = d.hi
    if (d.mode === 'lo') lo = Math.min(w, d.hi)
    else if (d.mode === 'hi') hi = Math.max(w, d.lo)
    else {
      const span = d.hi - d.lo
      lo = Math.max(wMin, Math.min(wMax - span, d.lo + (w - d.w0)))
      hi = lo + span
    }
    onChange(d.i, noteOfWhite(lo), noteOfWhite(hi))
  }
  const end = () => (drag.current = null)
  const cs = Array.from({ length: 8 }, (_, k) => 24 + k * 12) // C1..C8
  return (
    <div className="zmodal" role="dialog" aria-modal="true" aria-label="Regiões do teclado">
      <div className="zhead">
        <div>
          <h2>Regiões do teclado</h2>
          <p>Arraste as pontas de cada faixa para escolher até onde o timbre toca. Arraste o meio para deslocar a faixa.</p>
        </div>
        <button className="ghost" onClick={onClose}>
          Concluir
        </button>
      </div>
      <div className="zbody">
        <div className="zrows" ref={areaRef}>
          {cs.map((c) => (
            <i key={c} className="zgrid" style={{ left: `${xOf(wpos(c))}%` }} />
          ))}
          {rows.length === 0 && <p className="zempty">Escolha timbres nas camadas para definir as regiões.</p>}
          {rows.map(({ l, i, t }) => {
            const [lo0, hi0] = rangeOf(l, split)
            const lo = Math.max(lo0, PIANO_LO)
            const hi = Math.min(hi0, PIANO_HI)
            const left = xOf(edgeL(lo))
            const right = xOf(edgeR(hi))
            return (
              <div key={i} className={'zrow' + (l.off ? ' off' : '')} style={{ ['--c' as string]: LCOLORS[i] }}>
                <div className="zbar" style={{ left: `${left}%`, width: `${right - left}%` }} onPointerDown={(e) => start(e, i, 'move', lo0, hi0)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
                  <span className="zlab">
                    <b>{noteName(lo)}</b> {t!.name} <b>{noteName(hi)}</b>
                  </span>
                  <span className="zh l" onPointerDown={(e) => start(e, i, 'lo', lo0, hi0)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
                  <span className="zh r" onPointerDown={(e) => start(e, i, 'hi', lo0, hi0)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
                </div>
              </div>
            )
          })}
          <button className="ghost zall" onClick={() => rows.forEach((r) => onChange(r.i, 0, 127))}>
            Todos no teclado inteiro
          </button>
        </div>
        <div className="zpiano">
          <svg viewBox={`0 0 ${PIANO_W} 10`} preserveAspectRatio="none" aria-hidden="true">
            {Array.from({ length: PIANO_HI - PIANO_LO + 1 }, (_, k) => PIANO_LO + k)
              .filter((n) => !isBlack(n))
              .map((n) => (
                <rect key={n} x={wpos(n) - w0w} y={0} width={1} height={10} fill="#f3eefb" stroke="#8f82aa" strokeWidth={0.05} />
              ))}
            {Array.from({ length: PIANO_HI - PIANO_LO + 1 }, (_, k) => PIANO_LO + k)
              .filter((n) => isBlack(n))
              .map((n) => (
                <rect key={n} x={wpos(n) - w0w - 0.3} y={0} width={0.6} height={6} fill="#1a1128" />
              ))}
          </svg>
          {cs.map((c) => (
            <span key={c} className="zc" style={{ left: `${xOf(wpos(c))}%` }}>
              {noteName(c)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Picker({ onPick, onClose, padMode }: { onPick: (id: string | null) => void; onClose: () => void; padMode: boolean }) {
  const ver = useValue(customVersion)
  const hasCustom = ver > 0 && TIMBRES.some((t) => t.group === CUSTOM_GROUP)
  const groups = [CUSTOM_GROUP, ...(padMode ? GROUPS.filter((g) => g !== 'Bateria') : GROUPS)]
  const [group, setGroup] = useState<string>(hasCustom ? CUSTOM_GROUP : 'Favoritos')
  const [q, setQ] = useState('')
  const [bank, setBank] = useState<number | null>(null)
  const [edit, setEdit] = useState(false)
  const [hidden, setHid] = useState(getHidden)
  const [busy, setBusy] = useState(false)
  const [up, setUp] = useState<{ d: number; t: number; name: string } | null>(null)
  const [msg, setMsg] = useState('')
  const isCustom = group === CUSTOM_GROUP
  const shown = useMemo(() => {
    let list = group === 'Favoritos' ? FAVORITES.map((id) => TIMBRES.find((t) => t.id === id)!) : TIMBRES.filter((t) => t.group === group)
    if (padMode) list = list.filter((t) => !t.drum)
    if (isCustom) {
      list = list.filter((t) => !hidden.has(t.id))
      if (bank !== null && !q.trim()) list = list.filter((t) => slotOf(t.id) === bank)
      if (q.trim()) list = list.filter((t) => (t.name + ' ' + (t.src ?? '')).toLowerCase().includes(q.trim().toLowerCase()))
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, q, padMode, ver, hidden, bank])
  const [lib, setLib] = useState(false)
  const reload = (m: string) => {
    setMsg(m)
    setTimeout(() => location.reload(), 800)
  }
  const add = async (files: FileList | null) => {
    const ok = Array.from(files ?? []).filter((f) => /\.sf[23]$/i.test(f.name))
    if (!ok.length) return setMsg('Escolha arquivos .sf2 ou .sf3.')
    setBusy(true)
    setUp({ d: 0, t: ok.length, name: ok[0].name })
    try {
      const n = await addBanks(ok, (d, t, name) => setUp({ d, t, name }))
      setUp(null)
      reload(`${n} SoundFont(s) guardado(s). Recarregando…`)
    } catch (e) {
      const q = e instanceof DOMException && e.name === 'QuotaExceededError'
      setMsg(q ? 'Sem espaço para guardar este arquivo. Abra pelo ícone da tela de início (tem mais espaço que o Safari) ou apague SoundFonts antigos.' : 'Não consegui guardar o arquivo: ' + (e instanceof Error ? e.message : String(e)))
      setBusy(false)
      setUp(null)
    }
  }
  const removeSound = async (t: Timbre) => {
    const slot = slotOf(t.id)
    const left = TIMBRES.filter((x) => x.group === CUSTOM_GROUP && slotOf(x.id) === slot && !hidden.has(x.id)).length
    if (left <= 1) {
      setBusy(true)
      await removeBank(slot)
      const h = new Set(hidden)
      TIMBRES.filter((x) => x.group === CUSTOM_GROUP && slotOf(x.id) === slot).forEach((x) => h.delete(x.id))
      setHidden(h)
      reload('Removido. Recarregando…')
    } else {
      const h = new Set(hidden).add(t.id)
      setHidden(h)
      setHid(h)
    }
  }
  const bankLabel = (slot: number) => (listBanks().find((b) => b.slot === slot)?.name ?? 'Banco ' + slot).replace(/\.sf[23]$/i, '').replace(/_/g, ' ')
  const folders = listBanks()
    .map((b) => ({ slot: b.slot, n: TIMBRES.filter((t) => t.group === CUSTOM_GROUP && slotOf(t.id) === b.slot && !hidden.has(t.id)).length }))
    .filter((f) => f.n > 0)
  const showFolders = isCustom && bank === null && !q.trim() && folders.length > 0
  const hiddenCount = TIMBRES.filter((t) => t.group === CUSTOM_GROUP && hidden.has(t.id)).length
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{padMode ? 'Som do pad' : 'Escolher timbre'}</h2>
          {!padMode && (
            <button className="ghost" onClick={() => onPick(null)}>
              Esvaziar camada
            </button>
          )}
          <button className="ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="chips">
          {['Favoritos', ...groups].map((g) => (
            <button key={g} className={'chip' + (g === group ? ' on' : '')} onClick={() => { setGroup(g); setEdit(false) }}>
              {g}
            </button>
          ))}
        </div>
        {isCustom && (
          <div className="pick-tools">
            <input className="pick-search" type="search" placeholder="Buscar nos meus bancos…" value={q} onChange={(e) => setQ(e.target.value)} />
            {listBanks().length >= MAX_BANKS ? (
              <button className="ghost addsf" onClick={() => setMsg(`A lista já está cheia (${MAX_BANKS} SoundFonts, o limite). Toque em "Limpar da lista" no aviso abaixo, ou em Editar, para liberar espaço e depois adicione de novo.`)}>
                ＋ Adicionar
              </button>
            ) : (
              <label className="ghost addsf" aria-disabled={busy}>
                ＋ Adicionar
                <input type="file" accept=".sf2,.sf3" multiple hidden disabled={busy} onChange={(e) => void add(e.target.files)} />
              </label>
            )}
            <button className="ghost" disabled={busy} onClick={() => setLib(true)}>Biblioteca</button>
            {hasCustom && (
              <button className={'ghost' + (edit ? ' on' : '')} onClick={() => setEdit(!edit)}>
                {edit ? 'Concluir' : 'Editar'}
              </button>
            )}
          </div>
        )}
        {lib && <Library onClose={() => setLib(false)} onDone={reload} />}
        {isCustom && edit && (
          <p className="pick-hint">
            Toque no som que quer tirar da lista.
            {hiddenCount > 0 && (
              <button className="linkbtn" onClick={() => { setHidden(new Set()); setHid(new Set()) }}>
                Restaurar {hiddenCount} removido(s)
              </button>
            )}
          </p>
        )}
        {up && (
          <div className="upbox" role="status" aria-live="polite">
            <b>
              Guardando {Math.min(up.d + 1, up.t)} de {up.t}…
            </b>
            <span>{up.name}</span>
            <progress max={up.t} value={up.d} />
            <small>Pode demorar com arquivos grandes. Não feche esta tela.</small>
          </div>
        )}
        {msg && <p className="pick-hint">{msg}</p>}
        {isCustom && bankInfo.failed.length > 0 && (() => {
          const miss = bankInfo.failed.filter((n) => bankInfo.reasons[n]?.why === 'vazio')
          const bad = bankInfo.failed.filter((n) => bankInfo.reasons[n]?.why !== 'vazio')
          return (
            <>
              {miss.length > 0 && (
                <p className="pick-hint">
                  O arquivo destes SoundFonts não está mais guardado neste aparelho (o navegador limpou os dados ou o ícone foi reinstalado): {miss.join(', ')}. Toque em
                  <button
                    className="linkbtn"
                    onClick={async () => {
                      for (const n of miss) {
                        await removeBank(bankInfo.reasons[n].slot)
                        delete bankInfo.reasons[n]
                        bankInfo.failed = bankInfo.failed.filter((x) => x !== n)
                      }
                      setHid(new Set(getHidden()))
                    }}
                  >
                    Limpar da lista
                  </button>
                  e depois em ＋ Adicionar para colocar os arquivos .sf2 de novo.
                </p>
              )}
              {bad.length > 0 && (
                <p className="pick-hint">
                  Não carregou: {bad.map((n) => `${n} (${bankInfo.reasons[n]?.why || 'erro'})`).join(', ')}
                </p>
              )}
            </>
          )
        })()}
        {isCustom && bank !== null && !q.trim() && (
          <div className="pick-tools">
            <button className="ghost" onClick={() => setBank(null)}>‹ Bancos</button>
            <b style={{ flex: 1 }}>{bankLabel(bank)}</b>
          </div>
        )}
        {showFolders && (
          <div className="cards">
            {folders.map((f) => (
              <button key={f.slot} className="card" onClick={() => { setBank(f.slot); setEdit(false) }}>
                <small>{f.n} sons</small>
                {bankLabel(f.slot)}
              </button>
            ))}
          </div>
        )}
        <div className="cards">
          {!showFolders && shown.map((t) => (
            <button key={t.id} className={'card' + (isCustom && edit ? ' edit' : '')} disabled={busy} onClick={() => (isCustom && edit ? void removeSound(t) : onPick(t.id))}>
              <small>{t.drum ? 'Kit' : t.group === CUSTOM_GROUP ? (t.src ?? '') : t.program + 1}</small>
              {t.name}
            </button>
          ))}
          {!showFolders && shown.length === 0 && (
            <p style={{ opacity: 0.6 }}>{isCustom ? 'Nenhum som seu ainda. Toque em ＋ Adicionar e escolha arquivos .sf2.' : 'Nenhum som encontrado.'}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function useWide() {
  const q = '(min-width: 740px) and (orientation: landscape)'
  const [w, setW] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setW(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return w
}

export default function App() {
  const [initial] = useState(load)
  const [songs, setSongs] = useState<Song[]>(initial.songs)
  const [songIdx, setSongIdx] = useState(initial.song)
  const [setlists, setSetlists] = useState<Setlist[]>(initial.setlists)
  const [activeSl, setActiveSl] = useState<string | null>(initial.active)
  const [slPage, setSlPage] = useState(false)
  const [secIdx, setSecIdx] = useState(0)
  const [secMenu, setSecMenu] = useState<number | null>(null)
  const [clip, setClip] = useState<Layer[] | null>(() => {
    try { return JSON.parse(localStorage.getItem('palco-keys.clip') || 'null') } catch { return null }
  })
  const [clipMsg, setClipMsg] = useState('')
  const [chMenu, setChMenu] = useState<number | null>(null)
  const [chMode, setChMode] = useState<'insert' | 'swap'>('insert')
  const [chAll, setChAll] = useState(true)
  const chTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chFired = useRef(false)
  const chStart = useRef<{ x: number; y: number } | null>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired = useRef(false)
  const [pickerFor, setPickerFor] = useState<number | 'pad' | null>(null)
  const [cfg, setCfg] = useState(loadPad)
  const [padOn, setPadOn] = useState(false)
  const [metroOn, setMetroOn] = useState(false)
  const [sustain, setSustain] = useState(false)
  const rotor = useValue(rotorValue)
  const [confirmDel, setConfirmDel] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [midiNote, setMidiNote] = useState('')
  const [midiTest, setMidiTest] = useState(false)
  const inputsKey = useRef('')
  const [midiSupported] = useState(() => 'requestMIDIAccess' in navigator)
  const [inputs, setInputs] = useState<{ id: string; name: string }[]>([])
  const [volume, setVolume] = useState(100)
  const [active, setActive] = useState<Set<number>>(new Set())
  const [latency, setLatency] = useState<{ handler: number; output: number } | null>(null)
  const accessRef = useRef<MIDIAccess | null>(null)
  const taps = useRef<number[]>([])
  const actionsRef = useRef({ select: (_i: number) => {}, step: (_d: number) => {}, song: (_d: number) => {}, metro: () => {}, run: (_id: string, _v: number, _k: string, _on: boolean) => {} })
  const lastOn = useRef<Record<string, boolean>>({})

  const activeList = setlists.find((x) => x.id === activeSl) ?? null
  const view = activeList ? activeList.ids.map((id) => songs.findIndex((x) => x.id === id)).filter((i) => i >= 0) : songs.map((_, i) => i)
  const song = songs[songIdx]
  const secI = Math.min(secIdx, song.sections.length - 1)
  const section = song.sections[secI]
  const bpm = song.bpm ?? 120
  const transpose = song.transpose ?? 0
  const ready = status === 'ready'
  const padTim = byId(cfg.timbre) ?? { program: 89 }

  useEffect(() => save(songs, songIdx, setlists, activeSl), [songs, songIdx, setlists, activeSl])
  useEffect(() => savePad(cfg), [cfg])
  useEffect(() => pad.setTone(cfg.bright, cfg.shimmer), [cfg.bright, cfg.shimmer])
  useEffect(() => pad.setHold(cfg.hold ?? 0), [cfg.hold])
  const stripsRef = useRef<HTMLElement>(null)
  const [page, setPage] = useState(0)
  const wide = useWide()
  const perPage = wide ? 5 : 4
  const listRef = useRef<HTMLOListElement>(null)
  const [dragSong, setDragSong] = useState<number | null>(null)
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragging = useRef(false)
  const moveSongTo = (from: number, to: number) => {
    if (activeList) {
      if (to < 0 || to >= view.length || from === to) return
      const ids = view.map((i) => songs[i].id!)
      const [m] = ids.splice(from, 1)
      ids.splice(to, 0, m)
      setSetlists((all) => all.map((x) => (x.id === activeList.id ? { ...x, ids } : x)))
      setDragSong(to)
      return
    }
    if (to < 0 || to >= songs.length || from === to) return
    const cur = songs[songIdx]
    const arr = [...songs]
    const [m] = arr.splice(from, 1)
    arr.splice(to, 0, m)
    setSongs(arr)
    setSongIdx(arr.indexOf(cur))
    setDragSong(to)
  }
  const handleDown = (e: React.PointerEvent, i: number) => {
    e.stopPropagation()
    const el = e.currentTarget
    const id = e.pointerId
    if (dragTimer.current) clearTimeout(dragTimer.current)
    dragTimer.current = setTimeout(() => {
      dragging.current = true
      try {
        el.setPointerCapture(id)
      } catch {
        /* sem captura: segue pelo movimento normal */
      }
      setDragSong(i)
      navigator.vibrate?.(15)
    }, 250)
  }
  const handleMove = (e: React.PointerEvent) => {
    if (!dragging.current || dragSong == null) return
    const items = [...(listRef.current?.children ?? [])] as HTMLElement[]
    const y = e.clientY
    let to = dragSong
    items.forEach((it, k) => {
      const r = it.getBoundingClientRect()
      if (y >= r.top && y <= r.bottom) to = k
    })
    if (to !== dragSong) moveSongTo(dragSong, to)
    const lr = listRef.current?.getBoundingClientRect()
    if (lr && listRef.current) {
      if (y < lr.top + 24) listRef.current.scrollTop -= 8
      else if (y > lr.bottom - 24) listRef.current.scrollTop += 8
    }
  }
  const handleUp = () => {
    if (dragTimer.current) clearTimeout(dragTimer.current)
    dragTimer.current = null
    dragging.current = false
    setDragSong(null)
  }
  const onStripsScroll = () => {
    const el = stripsRef.current
    if (el) setPage(Math.round(el.scrollLeft / (el.clientWidth * 0.98)))
  }
  const [, setLoopTick] = useState(0)
  looper.onState = () => setLoopTick((n) => n + 1)
  looper.onDone = (tr) => updateSong((s) => ({ ...s, tracks: [...(s.tracks ?? []), tr] }))
  const [tracksOpen, setTracksOpen] = useState(false)
  useEffect(() => {
    looper.halt()
  }, [songIdx])
  // pista única do formato antigo vira a primeira pista
  useEffect(() => {
    if (song.loop && !song.tracks?.length) updateSong((s) => ({ ...s, loop: null, tracks: [{ id: 'p' + Math.random().toString(36).slice(2, 8), bars: s.loop!.bars, beats: s.loop!.beats, ev: s.loop!.ev, vol: 100, q: 0 }] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.loop])
  const trackList: Track[] = song.tracks ?? []
  useEffect(() => {
    looper.tracks = trackList
    looper.sync()
  }, [trackList])
  useEffect(() => {
    looper.bpm = bpm
    looper.beats = cfg.beats
    metro.bpm = bpm
    rig.bpm = bpm
    metro.beats = cfg.beats
    metro.volume = cfg.click / 127
    metro.pan = cfg.clickPan ?? 0
  }, [bpm, cfg.beats, cfg.click, cfg.clickPan])
  useEffect(() => {
    rig.transpose = transpose
  }, [transpose])
  useEffect(() => {
    metro.onBeat = (b) => beatValue.set(b)
    return () => metro.stop()
  }, [])

  const updateSong = (fn: (s: Song) => Song) => setSongs((prev) => prev.map((s, i) => (i === songIdx ? fn(s) : s)))

  const press = useCallback((note: number, vel: number) => {
    rig.noteOn(note, vel)
    setActive((s) => new Set(s).add(note))
  }, [])
  const release = useCallback((note: number) => {
    rig.noteOff(note)
    setActive((s) => {
      const n = new Set(s)
      n.delete(note)
      return n
    })
  }, [])

  // Teclado da tela: cada dedo/mouse é acompanhado; deslizar sobre as teclas toca todas (glissando).
  const fingers = useRef(new Map<number, number>())
  const noteAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-n]') as HTMLElement | null
    return el ? Number(el.dataset.n) : null
  }
  const kbDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const n = noteAt(e.clientX, e.clientY)
    if (n === null) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* */ }
    fingers.current.set(e.pointerId, n)
    press(n, 100)
  }
  const kbMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const cur = fingers.current.get(e.pointerId)
    if (cur === undefined) return
    const n = noteAt(e.clientX, e.clientY)
    if (n === null || n === cur) return
    fingers.current.set(e.pointerId, n)
    release(cur)
    press(n, 100)
  }
  const kbUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const cur = fingers.current.get(e.pointerId)
    if (cur === undefined) return
    fingers.current.delete(e.pointerId)
    release(cur)
  }

  const onMidi = useCallback(
    (e: MIDIMessageEvent) => {
      if (!e.data) return
      const ev = parseMidi(e.data, e.timeStamp)
      if (!ev) return
      const src = (e.target as MIDIInput | null)?.id ?? ''
      const role = roleOf(src)
      if (role === 'ignore') return
      const srcName = (e.target as MIDIInput | null)?.name ?? 'MIDI'
      if (ev.type === 'noteOn' || ev.type === 'noteOff' || ev.type === 'cc' || ev.type === 'pc') {
        const kind = ev.type === 'cc' ? 'cc' : ev.type === 'pc' ? 'pc' : 'note'
        const num = ev.type === 'cc' ? ev.controller : ev.type === 'pc' ? ev.program : ev.note
        const val = ev.type === 'cc' ? ev.value : ev.type === 'noteOn' ? ev.velocity : ev.type === 'pc' ? 127 : 0
        lastMsgValue.set(`${kind === 'cc' ? 'CC ' + num : kind === 'pc' ? 'Program ' + (num + 1) : (ev.type === 'noteOn' ? 'Nota ' : 'Soltou ') + noteName(num)} · canal ${ev.channel + 1} · ${srcName}`)
        // MIDI Learn: a próxima mensagem vira o controle que está esperando
        const waiting = waitingValue.get()
        if (waiting) {
          const take = ev.type === 'noteOn' || ev.type === 'pc' || (ev.type === 'cc' && true)
          if (take) {
            setBinding(waiting, { kind, ch: ev.channel, num })
            waitingValue.set(null)
          }
          return
        }
        if (learnOpen.current) return
        const act = findAction(kind, ev.channel, num)
        if (act) {
          actionsRef.current.run(act, val, kind, ev.type !== 'noteOff' && (kind !== 'cc' || val >= 64))
          return
        }
      }
      if (role === 'controls' && (ev.type === 'noteOn' || ev.type === 'noteOff' || ev.type === 'bend')) return
      if (ev.type === 'noteOn') {
        press(ev.note, ev.velocity)
        setLatency({ handler: Math.max(0, Math.round(performance.now() - ev.t)), output: engine.outputLatencyMs })
      } else if (ev.type === 'noteOff') release(ev.note)
      else if (ev.type === 'cc') {
        rig.cc(ev.controller, ev.value)
        if (ev.controller === 1) modValue.set(ev.value)
        if (ev.controller === 64) setSustain(ev.value >= 64)
      } else if (ev.type === 'bend') {
        rig.pitchBend(ev.value)
        bendValue.set((ev.value - 8192) / 8192)
      } else if (ev.type === 'pc') actionsRef.current.select(ev.program)
    },
    [press, release],
  )

  const bindInputs = useCallback(
    (access: MIDIAccess) => {
      const list: { id: string; name: string }[] = []
      connectedIds.clear()
      access.inputs.forEach((input) => {
        if (input.onmidimessage !== onMidi) input.onmidimessage = onMidi
        connectedIds.add(input.id)
        list.push({ id: input.id, name: input.name || 'Controlador MIDI' })
      })
      const key = list.map((i) => i.id + i.name).join('|')
      if (key !== inputsKey.current) { inputsKey.current = key; setInputs(list) }
    },
    [onMidi],
  )

  const sfStatus = useValue(customStatus)
  const audioIsOn = useValue(audioOn)
  const [prog, setProg] = useState(0)
  const [stage, setStage] = useState('Carregando sons…')
  const start = async () => {
    setStatus('loading')
    setError('')
    setProg(0)
    engine.onProgress = setProg
    engine.onStage = setStage
    try {
      await engine.start()
      rig.master = volume
      rig.split = song.split
      rig.transpose = transpose
      rig.apply(section.layers, 0)
      pad.configure(padTim, cfg.vol)
      if (midiSupported) {
        try {
          const access = await navigator.requestMIDIAccess()
          accessRef.current = access
          bindInputs(access)
          access.onstatechange = () => bindInputs(access)
          // alguns navegadores só listam o teclado alguns segundos depois: duas checagens extras, sem repetir em laço
          window.setTimeout(() => bindInputs(access), 3000)
          window.setTimeout(() => bindInputs(access), 8000)
        } catch {
          setMidiNote('O MIDI foi bloqueado neste navegador. Abra no Chrome e permita o acesso ao MIDI. Dá para tocar pelo teclado da tela.')
        }
      } else {
        setMidiNote('Este navegador não suporta MIDI. Use o Chrome.')
      }
      setStatus('ready')
      void engine.loadCustom()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  useEffect(() => {
    if (accessRef.current) bindInputs(accessRef.current)
  }, [bindInputs])

  // Quando os SoundFonts do usuário terminam de carregar em segundo plano, reaplica os timbres atuais.
  const customVer = useValue(customVersion)
  useEffect(() => {
    if (!ready || customVer === 0) return
    rig.apply(section.layers, 0)
    pad.configure(padTim, cfg.vol)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customVer, ready])

  const [menuOpen, setMenuOpen] = useState(false)
  const [learnShown, setLearnShown] = useState(false)
  const [settingsShown, setSettingsShown] = useState(false)
  const [zonesOpen, setZonesOpen] = useState(false)
  const [bigKb, setBigKb] = useState(false)
  const [octBase, setOctBase] = useState(48)
  const [trans, setTrans] = useState<{ i: number; id: number; secs: number } | null>(null)
  const transTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectSection = (i: number) => {
    if (i < 0 || i >= song.sections.length) return
    setSecIdx(i)
    if (transTimer.current) clearTimeout(transTimer.current)
    if (ready && song.fade > 0.05) {
      setTrans({ i, id: Date.now(), secs: song.fade })
      transTimer.current = setTimeout(() => setTrans(null), song.fade * 1000 + 80)
    } else setTrans(null)
    rig.split = song.split
    if (ready) rig.apply(song.sections[i].layers, song.fade)
  }

  const changeSong = (idx: number) => {
    if (idx < 0 || idx >= songs.length || idx === songIdx) return
    setSongIdx(idx)
    setSecIdx(0)
    setConfirmDel(false)
    const s = songs[idx]
    rig.split = s.split
    rig.transpose = s.transpose ?? 0
    if (ready) {
      rig.apply(s.sections[0].layers, 0, true) // sem cortar o som da música anterior
      if (padOn && s.key != null) pad.play(s.key, cfg.fade)
    }
  }

  /** Próxima/anterior música dentro da lista que está aberta. */
  const stepSong = (d: number) => {
    if (!view.length) return
    const pos = view.indexOf(songIdx)
    changeSong(view[clamp((pos < 0 ? 0 : pos) + d, 0, view.length - 1)])
  }
  const addToActive = (id: string) => activeList && setSetlists((all) => all.map((x) => (x.id === activeList.id ? { ...x, ids: [...x.ids, id] } : x)))
  /** Abre uma lista (ou null = todas as músicas) e vai para a primeira música dela. */
  const openSetlist = (id: string | null) => {
    setActiveSl(id)
    const l = setlists.find((x) => x.id === id)
    const v = l ? l.ids.map((sid) => songs.findIndex((x) => x.id === sid)).filter((i) => i >= 0) : songs.map((_, i) => i)
    if (v.length && !v.includes(songIdx)) changeSong(v[0])
  }

  const recClick = () => {
    if (!ready) return
    if (looper.state === 'rec' || looper.state === 'count') { looper.stop(); return }
    if (!metro.running) { metro.start(); setMetroOn(true) }
    looper.record()
  }
  const loopPlay = () => {
    if (!ready) return
    if (looper.playing) looper.stopPlay()
    else if (trackList.length) {
      if (!metro.running) { metro.start(); setMetroOn(true) }
      looper.playAll()
    }
  }
  const editTrack = (id: string, patch: Partial<Track>) => updateSong((s) => ({ ...s, tracks: (s.tracks ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
  const delTrack = (id: string) => updateSong((s) => ({ ...s, tracks: (s.tracks ?? []).filter((t) => t.id !== id) }))

  const toggleMetro = () => {
    if (!ready) return
    if (metroOn) metro.stop()
    else metro.start()
    setMetroOn(!metroOn)
  }

  useEffect(() => {
    actionsRef.current = {
      select: selectSection,
      step: (d) => selectSection(clamp(secI + d, 0, song.sections.length - 1)),
      song: (d) => stepSong(d),
      metro: toggleMetro,
      run: runAction,
    }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key >= '1' && e.key <= '8') actionsRef.current.select(Number(e.key) - 1)
      else if (e.key === 'ArrowRight') actionsRef.current.step(1)
      else if (e.key === 'ArrowLeft') actionsRef.current.step(-1)
      else if (e.key === 'PageDown') actionsRef.current.song(1)
      else if (e.key === 'PageUp') actionsRef.current.song(-1)
      else if (e.key === 'm') actionsRef.current.metro()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const editLayer = (li: number, patch: Partial<Layer>) => {
    const layers = section.layers.map((l, i) => (i === li ? { ...l, ...patch } : l))
    updateSong((s) => ({ ...s, sections: s.sections.map((sec, i) => (i === secI ? { ...sec, layers } : sec)) }))
    if (ready) rig.setLayers(layers)
  }

  const addSong = () => {
    const n = newSong(`Música ${songs.length + 1}`)
    setSongs([...songs, n])
    addToActive(n.id!)
    setSongIdx(songs.length)
    setSecIdx(0)
    rig.split = n.split
    rig.transpose = 0
    if (ready) rig.apply(n.sections[0].layers, 0)
  }

  const duplicateSong = () => {
    const copy: Song = JSON.parse(JSON.stringify(song))
    copy.name = `${song.name} (cópia)`
    copy.id = uid()
    setSongs([...songs, copy])
    addToActive(copy.id)
    setSongIdx(songs.length)
    setSecIdx(0)
  }

  const deleteSong = () => {
    if (songs.length <= 1) return
    if (!confirmDel) {
      setConfirmDel(true)
      setTimeout(() => setConfirmDel(false), 3000)
      return
    }
    const gone = songs[songIdx].id
    setSetlists((all) => all.map((x) => ({ ...x, ids: x.ids.filter((i) => i !== gone) })))
    const rest = songs.filter((_, i) => i !== songIdx)
    const idx = Math.min(songIdx, rest.length - 1)
    setSongs(rest)
    setSongIdx(idx)
    setSecIdx(0)
    setConfirmDel(false)
    rig.split = rest[idx].split
    rig.transpose = rest[idx].transpose ?? 0
    if (ready) rig.apply(rest[idx].sections[0].layers, 0)
  }

  const [sndEdit, setSndEdit] = useState<number | null>(null)
  const [fxEdit, setFxEdit] = useState<{ layer: number; slot: number } | null>(null)
  const setSlots = (li: number, fx: FxSlot[]) => editLayer(li, { fx })
  const toggleFx = (li: number, si: number) => {
    const sl = slotsOf(section.layers[li])
    setSlots(li, sl.map((x, k) => (k === si ? { ...x, on: !x.on } : x)))
  }
  const chDown = (e: React.PointerEvent, i: number) => {
    chFired.current = false
    if ((e.target as HTMLElement).closest('.fader, .knobwrap, .power, .fxslot, .sndbtn')) return
    chStart.current = { x: e.clientX, y: e.clientY }
    if (chTimer.current) clearTimeout(chTimer.current)
    chTimer.current = setTimeout(() => {
      chFired.current = true
      setChMenu(i)
    }, 500)
  }
  const chMove = (e: React.PointerEvent) => {
    const st = chStart.current
    if (st && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10 && chTimer.current) {
      clearTimeout(chTimer.current)
      chTimer.current = null
    }
  }
  const chCancel = () => {
    if (chTimer.current) clearTimeout(chTimer.current)
    chTimer.current = null
  }
  const moveChannel = (from: number, to: number) => {
    if (from === to) return
    const re = <T,>(arr: T[]): T[] => {
      const a = [...arr]
      if (chMode === 'swap') {
        ;[a[from], a[to]] = [a[to], a[from]]
      } else {
        const [x] = a.splice(from, 1)
        a.splice(to, 0, x)
      }
      return a
    }
    const sections = song.sections.map((sec, i) => (chAll || i === secI ? { ...sec, layers: re(sec.layers) } : sec))
    updateSong((s) => ({ ...s, sections }))
    if (ready) rig.setLayers(sections[secI].layers)
    setChMenu(null)
    const el = stripsRef.current
    if (el) el.scrollTo({ left: Math.floor(to / perPage) * el.clientWidth * 0.98, behavior: 'smooth' })
  }

  const moveSection = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= song.sections.length) return
    const arr = [...song.sections]
    const cur = arr[secI]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    updateSong((s) => ({ ...s, sections: arr }))
    setSecIdx(arr.indexOf(cur))
    setSecMenu(j)
  }

  const startPress = (i: number) => {
    longFired.current = false
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      longFired.current = true
      setSecMenu(i)
      navigator.vibrate?.(15)
    }, 500)
  }
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  const copyTimbres = (i: number) => {
    const c = JSON.parse(JSON.stringify(song.sections[i].layers)) as Layer[]
    setClip(c)
    try { localStorage.setItem('palco-keys.clip', JSON.stringify(c)) } catch { /* sem armazenamento */ }
    setClipMsg(`Copiado: ${c.filter((l) => l.timbre).length} timbres de "${song.sections[i].name || 'Seção ' + (i + 1)}".`)
  }
  const pasteTimbres = (to: number | 'all') => {
    if (!clip) return
    const fresh = () => JSON.parse(JSON.stringify(clip)) as Layer[]
    updateSong((s) => ({ ...s, sections: s.sections.map((sec, k) => (to === 'all' || k === to ? { ...sec, layers: fresh() } : sec)) }))
    if (ready && (to === 'all' || to === secI)) rig.apply(fresh(), 0)
    setClipMsg(to === 'all' ? 'Colado em todas as partes.' : `Colado em "${song.sections[to].name || 'Seção ' + (to + 1)}".`)
  }

  const renameSection = (i: number, name: string) =>
    updateSong((s) => ({ ...s, sections: s.sections.map((sec, k) => (k === i ? { ...sec, name } : sec)) }))

  const changeVolume = (v: number) => {
    setVolume(v)
    rig.setMaster(v)
  }

  const [bpmText, setBpmText] = useState<string | null>(null)
  const setBpm = (n: number) => updateSong((s) => ({ ...s, bpm: clamp(Math.round(n), 40, 220) }))
  const nudgeBpm = (d: number) => updateSong((s) => ({ ...s, bpm: clamp((s.bpm ?? 120) + d, 40, 220) }))
  const tap = () => {
    const now = performance.now()
    const t = taps.current
    if (t.length && now - t[t.length - 1] > 2000) t.length = 0
    t.push(now)
    if (t.length > 6) t.shift()
    if (t.length >= 2) setBpm(60000 / ((t[t.length - 1] - t[0]) / (t.length - 1)))
  }

  const changeTranspose = (d: number) => updateSong((s) => ({ ...s, transpose: clamp((s.transpose ?? 0) + d, -12, 12) }))

  const toggleSustain = () => {
    if (rig.rotorEligible()) return rig.rotorToggle()
    rig.cc(64, sustain ? 0 : 127)
    setSustain(!sustain)
  }

  // Pad contínuo
  const tapTone = (k: number) => {
    if (!ready) return
    if (padOn && song.key === k) {
      pad.stop(cfg.fade)
      setPadOn(false)
      return
    }
    updateSong((s) => ({ ...s, key: k }))
    pad.configure(padTim, cfg.vol)
    pad.play(k, cfg.fade)
    setPadOn(true)
  }
  const stopPad = () => {
    pad.stop(cfg.fade)
    setPadOn(false)
  }
  const changePadVol = (v: number) => {
    setCfg({ ...cfg, vol: v })
    pad.configure(padTim, v)
  }

  const doPanic = () => {
    rig.panic()
    setPadOn(false)
    setActive(new Set())
    setSustain(false)
  }

  /** Executa um controle ensinado pelo MIDI Learn. `on` vale para botões; `value` (0–127) para faders e knobs. */
  const runAction = (id: string, value: number, kind: string, on: boolean) => {
    if (!ready) return
    const sliderOf = (v: number) => clamp(Math.round(v), 0, 127)
    const [a, b, c] = id.split(':')
    // faders e knobs
    if (id === 'master') return changeVolume(sliderOf(value))
    if (id === 'click') return setCfg((x) => ({ ...x, click: sliderOf(value) }))
    if (id === 'pad:vol') return changePadVol(sliderOf(value))
    if (id === 'pad:bright') return setCfg((x) => ({ ...x, bright: sliderOf(value) }))
    if (id === 'pad:shimmer') return setCfg((x) => ({ ...x, shimmer: sliderOf(value) }))
    if (a === 'layer' && c === 'vol') return editLayer(Number(b), { vol: sliderOf(value) })
    if (a === 'layer' && c === 'out') {
      // knob/fader = ganho de saída do canal (−24 a +24 dB, meio = 0 dB); liga o compressor se precisar
      const li = Number(b)
      const cur = sndOf(section.layers[li])
      let db = Math.round(((sliderOf(value) / 127) * 48 - 24) * 2) / 2
      if (Math.abs(db) < 0.6) db = 0
      return editLayer(li, { snd: { ...cur, comp: { ...cur.comp, outGain: db, on: cur.comp.on || db !== 0 } } })
    }
    // sustain: segue o botão enquanto está apertado
    if (id === 'sustain') {
      rig.cc(64, on ? 127 : 0)
      return setSustain(on)
    }
    // botões: disparam ao apertar (e uma vez só por aperto quando vêm como CC)
    if (kind === 'cc') {
      const was = lastOn.current[id] ?? false
      lastOn.current[id] = on
      if (!on || was) return
    } else if (!on) return
    if (a === 'sec') selectSection(Number(b))
    else if (id === 'song:prev') stepSong(-1)
    else if (id === 'song:next') stepSong(1)
    else if (id === 'metro') toggleMetro()
    else if (id === 'tap') tap()
    else if (id === 'transpose:-1') changeTranspose(-1)
    else if (id === 'transpose:+1') changeTranspose(1)
    else if (id === 'bpm:-1') nudgeBpm(-1)
    else if (id === 'bpm:+1') nudgeBpm(1)
    else if (id === 'panic') doPanic()
    else if (id === 'pad:toggle') (padOn ? stopPad() : tapTone(song.key ?? 0))
    else if (a === 'pad' && b === 'tone') tapTone(Number(c))
    else if (a === 'layer' && c === 'power') editLayer(Number(b), { off: !section.layers[Number(b)].off })
    else if (id === 'kb:big') setBigKb((x) => !x)
    else if (a === 'clickpan') setCfg((x) => ({ ...x, clickPan: Number(b) }))
    else if (a === 'list') {
      const ids: (string | null)[] = [null, ...setlists.map((x) => x.id)]
      const at = Math.max(0, ids.indexOf(activeSl))
      openSetlist(ids[clamp(at + (b === 'next' ? 1 : -1), 0, ids.length - 1)])
    } else if (a === 'layer' && (c === 'fx0' || c === 'fx1' || c === 'fx2')) toggleFx(Number(b), Number(c[2]))
    else if (a === 'layer' && (c === 'comp' || c === 'eq')) {
      const li = Number(b)
      const cur = sndOf(section.layers[li])
      editLayer(li, { snd: c === 'comp' ? { ...cur, comp: { ...cur.comp, on: !cur.comp.on } } : { ...cur, eq: { ...cur.eq, on: !cur.eq.on } } })
    }
  }

  const pickTimbre = (id: string | null) => {
    if (pickerFor === null) return
    if (pickerFor === 'pad') {
      if (id) {
        setCfg({ ...cfg, timbre: id })
        pad.configure(byId(id) ?? { program: 89 }, cfg.vol)
        if (padOn && song.key != null) pad.play(song.key, 2, true)
      }
    } else {
      editLayer(pickerFor, { timbre: id, off: false })
    }
    setPickerFor(null)
  }

  const used = section.layers.map(tim).filter(Boolean)
  const allDrums = used.length > 0 && used.every((t) => t!.drum)
  const label = (n: number) => (allDrums ? (DRUM_NAMES[n] ?? noteName(n)) : noteName(n))
  const kbFirst = bigKb ? octBase : FIRST
  const kbLast = bigKb ? octBase + 24 : LAST
  const keys = useMemo(() => Array.from({ length: kbLast - kbFirst + 1 }, (_, i) => kbFirst + i), [kbFirst, kbLast])
  const whites = keys.filter((n) => !isBlack(n))
  const kbW = wpos(kbLast) + 1 - wpos(kbFirst)
  const kbFrac = (x: number) => Math.max(0, Math.min(1, x / kbW))

  return (
    <div className={'app' + (ready ? ' fit' : '')}>
      {slPage && (
        <SetlistPage
          songs={songs}
          setlists={setlists}
          active={activeSl}
          current={songs[songIdx]?.id}
          onSetlists={setSetlists}
          onOpen={(id) => {
            openSetlist(id)
            setSlPage(false)
          }}
          onClose={() => setSlPage(false)}
          onPlaySong={(id) => {
            const i = songs.findIndex((x) => x.id === id)
            if (i >= 0) changeSong(i)
          }}
        />
      )}
      {sndEdit != null && section.layers[sndEdit] && (
        <SoundSheet
          layer={section.layers[sndEdit]}
          chIndex={sndEdit}
          color={LCOLORS[sndEdit]}
          name={byId(section.layers[sndEdit].timbre)?.name ?? 'Sem som'}
          onSnd={(snd) => editLayer(sndEdit, { snd })}
          onRemove={() => editLayer(sndEdit, { timbre: null })}
          onClose={() => setSndEdit(null)}
        />
      )}
      {fxEdit && section.layers[fxEdit.layer] && (
        <FxSheet
          layer={section.layers[fxEdit.layer]}
          chIndex={fxEdit.layer}
          slot={fxEdit.slot}
          color={LCOLORS[fxEdit.layer]}
          onSlots={(fx) => setSlots(fxEdit.layer, fx)}
          onClose={() => setFxEdit(null)}
          tempo={{ bpm, onBpm: setBpm, onTap: tap, metroOn, onMetro: toggleMetro }}
        />
      )}
      {chMenu != null && section.layers[chMenu] && (
        <div className="overlay center" onClick={() => setChMenu(null)}>
          <div className="secmenu" role="dialog" aria-label="Mover canal" onClick={(e) => e.stopPropagation()}>
            <h3>
              Canal {chMenu + 1}
              {byId(section.layers[chMenu].timbre) ? ' · ' + byId(section.layers[chMenu].timbre)!.name : ''}
            </h3>
            <div className="secmenu-row">
              <button className={'ghost' + (chMode === 'insert' ? ' on' : '')} onClick={() => setChMode('insert')}>
                Inserir (empurra os outros)
              </button>
              <button className={'ghost' + (chMode === 'swap' ? ' on' : '')} onClick={() => setChMode('swap')}>
                Trocar de lugar
              </button>
            </div>
            <div className="chgrid" aria-label="Mover para o canal">
              {section.layers.map((l, j) => (
                <button key={j} className="ghost" disabled={j === chMenu} onClick={() => moveChannel(chMenu, j)}>
                  <b>{j + 1}</b>
                  <small>{byId(l.timbre)?.name ?? '—'}</small>
                </button>
              ))}
            </div>
            <label className="chall">
              <input type="checkbox" checked={chAll} onChange={(e) => setChAll(e.target.checked)} /> Em todas as seções da música
            </label>
            <button className="ghost" onClick={() => setChMenu(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {ready && !audioIsOn && (
        <button className="sndoff" onClick={() => engine.kick()}>
          🔇 Som pausado pelo iPad{engine.ctx ? ` (${engine.ctx.state})` : ''}. Toque aqui para ligar
        </button>
      )}
      {ready && sfStatus && <div className="sfchip">{sfStatus}</div>}
      {secMenu != null && song.sections[secMenu] && (
        <div className="overlay center" onClick={() => setSecMenu(null)}>
          <div className="secmenu" role="dialog" aria-label="Opções da seção" onClick={(e) => e.stopPropagation()}>
            <h3>Seção {secMenu + 1}</h3>
            <label className="secmenu-name">
              Nome
              <input
                autoFocus
                value={song.sections[secMenu].name}
                maxLength={14}
                onChange={(e) => renameSection(secMenu, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setSecMenu(null)}
              />
            </label>
            <label className="secmenu-name">
              Tempo da troca de seção (vale para a música toda)
              <select value={song.fade} onChange={(e) => updateSong((s) => ({ ...s, fade: +e.target.value }))}>
                {FADES.map((f) => (
                  <option key={f.v} value={f.v}>
                    {f.l}
                  </option>
                ))}
              </select>
            </label>
            <div className="secmenu-row">
              <button className="ghost" onClick={() => copyTimbres(secMenu)}>
                Copiar timbres desta parte
              </button>
              <button className="ghost" disabled={!clip} onClick={() => pasteTimbres(secMenu)}>
                Colar timbres aqui
              </button>
            </div>
            <button className="ghost" disabled={!clip || song.sections.length < 2} onClick={() => pasteTimbres('all')}>
              Colar em todas as partes
            </button>
            {clipMsg && <p className="set-note" role="status">{clipMsg}</p>}
            <div className="secmenu-row">
              <button className="ghost" disabled={secMenu === 0} onClick={() => moveSection(secMenu, -1)}>
                ◀ Mover para a esquerda
              </button>
              <button className="ghost" disabled={secMenu >= song.sections.length - 1} onClick={() => moveSection(secMenu, 1)}>
                Mover para a direita ▶
              </button>
            </div>
            <button className="ghost" onClick={() => setSecMenu(null)}>
              Pronto
            </button>
          </div>
        </div>
      )}
      <header className="topbar">
        <h1>
          Palco <span>Keys</span>
        </h1>
        {ready && (
          <>
            <div className="tempo">
              <button className="ghost sq" onClick={() => nudgeBpm(-1)} aria-label="Diminuir andamento">
                −
              </button>
              <div className="bpm">
                <input
                  className="bpm-in"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label="Andamento em BPM"
                  value={bpmText ?? String(bpm)}
                  onFocus={(e) => { setBpmText(String(bpm)); e.currentTarget.select() }}
                  onChange={(e) => setBpmText(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  onBlur={() => { if (bpmText) setBpm(Number(bpmText)); setBpmText(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { setBpmText(null); e.currentTarget.blur() } }}
                />
                <small>BPM</small>
              </div>
              <button className="ghost sq" onClick={() => nudgeBpm(1)} aria-label="Aumentar andamento">
                +
              </button>
              <button className={'metrobtn' + (metroOn ? ' on' : '')} onClick={toggleMetro} aria-pressed={metroOn} aria-label="Metrônomo">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 21 10.5 3h3L16 21Z" />
                  <path d="M12 17 16.5 7" />
                  <path d="M7 21h10" />
                </svg>
                {metroOn ? <BeatDots beats={cfg.beats} /> : <span>Metrônomo</span>}
              </button>
              <div className="seg3 inrow looper" role="group" aria-label="Gravador de pistas">
                <button className={looper.state === 'rec' || looper.state === 'count' ? 'on' : ''} aria-label="Gravar uma nova pista / parar gravação" onClick={recClick} title="Gravar uma nova pista, com contagem no metrônomo. As pistas já gravadas tocam junto.">
                  {looper.state === 'rec' || looper.state === 'count' ? '■' : '●'}
                </button>
                <button className={looper.playing ? 'on' : ''} disabled={!trackList.length} aria-label="Tocar / parar as pistas" onClick={loopPlay} title="Tocar todas as pistas em loop">
                  {looper.playing ? '■' : '▶'}
                </button>
                <button aria-label="Pistas gravadas: volume, mudo e quantização" onClick={() => setTracksOpen(true)} title={`Pistas gravadas (${trackList.length} de ${MAX_TRACKS})`}>
                  ≡{trackList.length > 0 ? trackList.length : ''}
                </button>
              </div>
              <div className="seg3 inrow" title="De que lado sai o clique do metrônomo: E = esquerdo, C = centro, D = direito" role="radiogroup" aria-label="Lado de saída do clique">
                {([[-1, 'E', 'Só no lado esquerdo'], [0, 'C', 'Nos dois lados'], [1, 'D', 'Só no lado direito']] as const).map(([v, t, tip]) => (
                  <button key={v} role="radio" aria-checked={(cfg.clickPan ?? 0) === v} title={tip} aria-label={tip} className={(cfg.clickPan ?? 0) === v ? 'on' : ''} onClick={() => setCfg({ ...cfg, clickPan: v })}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="ctl">
              <label>Compasso</label>
              <select value={cfg.beats} onChange={(e) => setCfg({ ...cfg, beats: +e.target.value })}>
                {BEATS.map((b) => (
                  <option key={b} value={b}>
                    {b} tempos
                  </option>
                ))}
              </select>
            </div>
            <div className="ctl">
              <label>Transposição</label>
              <div className="stepper">
                <button onClick={() => changeTranspose(-1)} aria-label="Descer um semitom">
                  −
                </button>
                <span>{transpose > 0 ? `+${transpose}` : transpose}</span>
                <button onClick={() => changeTranspose(1)} aria-label="Subir um semitom">
                  +
                </button>
              </div>
            </div>
            <div className="ctl">
              <label>Volume do clique</label>
              <HFader label="Volume do clique" value={cfg.click} width={120} onChange={(v) => setCfg({ ...cfg, click: v })} />
            </div>
            <div className="ctl">
              <label>Andamento</label>
              <button className="ghost" onClick={tap}>
                Tap
              </button>
            </div>
            <div className="ctl master">
              <label>Volume geral</label>
              <div className="masterrow">
                <HFader label="Volume geral" value={volume} width={170} onChange={changeVolume} />
                <Meter />
              </div>
            </div>
            <button className="panic" onClick={doPanic} aria-label="Panic: silenciar tudo" title="Panic: silencia todo o som">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9.5" />
                <path d="M9.5 2.8h5" />
                <circle cx="12" cy="7.2" r="1.05" fill="currentColor" stroke="none" />
                <circle cx="6.9" cy="10.6" r="1.05" fill="currentColor" stroke="none" />
                <circle cx="17.1" cy="10.6" r="1.05" fill="currentColor" stroke="none" />
                <circle cx="8.2" cy="16.2" r="1.05" fill="currentColor" stroke="none" />
                <circle cx="15.8" cy="16.2" r="1.05" fill="currentColor" stroke="none" />
              </svg>
              <span>PANIC</span>
            </button>
            <button className="hamb" onClick={() => setMenuOpen(true)} aria-label="Menu" title="Menu">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6.5h16M4 12h16M4 17.5h16" />
            </svg>
          </button>
          </>
        )}
      </header>

      {!ready ? (
        <section className="start">
          <img className="logo" src={import.meta.env.BASE_URL + 'icon-512.png'} alt="" width={168} height={168} />
          <div className="brand">
            Palco <span>Keys</span>
          </div>
          <p className="tag">Teclado ao vivo · timbres em camadas · pad</p>
          <button className="big" onClick={start} disabled={status === 'loading'}>
            {status === 'loading' ? (prog > 0 && prog < 1 ? `Baixando sons… ${Math.round(prog * 100)}%` : stage) : status === 'error' ? 'Tentar de novo' : 'Iniciar'}
          </button>
          <p className="hint">Toque em Iniciar para ligar o áudio e conectar o teclado MIDI.</p>
          <button className="ghost" onClick={() => window.dispatchEvent(new Event('palco:welcome'))}>Ver boas-vindas</button>
          <button className="ghost" onClick={() => setMidiTest(true)}>Testar MIDI</button>
          {midiTest && <MidiTest onClose={() => setMidiTest(false)} />}
          {error && <p className="error">{error}</p>}
          {!midiSupported && <p className="error">Este navegador não suporta MIDI. Use o Chrome.</p>}
        </section>
      ) : (
        <>
          {midiNote && <p className="error">{midiNote}</p>}

          <div className="rig">
            <div className="leftcol">
            <aside className="setlist" aria-label="Repertório">
              <div className="sl-head">
                <button className="sl-title" onClick={() => setSlPage(true)} aria-label="Abrir listas de músicas" title="Abrir, criar e organizar listas">
                  <h2>{activeList ? activeList.name || 'Sem nome' : 'Todas as músicas'}</h2>
                  <small>{activeList ? `${activeList.date ? activeList.date.split('-').reverse().join('/') + ' · ' : ''}${view.length} música${view.length === 1 ? '' : 's'}` : 'Biblioteca ▾'}</small>
                </button>
                <button className="ghost sq" onClick={addSong} aria-label="Nova música">
                  +
                </button>
              </div>
              <ol ref={listRef}>
                {view.map((si, i) => {
                  const s = songs[si]
                  return (
                  <li key={si} className={dragSong === i ? 'dragging' : ''}>
                    <button className={'sl-item' + (si === songIdx ? ' on' : '')} onClick={() => changeSong(si)}>
                      <span className="n">{i + 1}</span>
                      <span className="t">
                        <b>{s.name || 'Sem nome'}</b>
                        <small>{layerNames((s.sections[1] ?? s.sections[0]).layers) || 'Sem timbres'}</small>
                      </span>
                      <span className="k">{s.key != null ? TONES[s.key].n : '–'}</span>
                    </button>
                    <button
                      className="grip"
                      aria-label={`Segure e arraste para mudar a ordem de ${s.name || 'música'}`}
                      title="Segure e arraste para mudar a ordem"
                      onPointerDown={(e) => handleDown(e, i)}
                      onPointerMove={handleMove}
                      onPointerUp={handleUp}
                      onPointerCancel={handleUp}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                        <circle cx="9" cy="6" r="1.7" /><circle cx="15" cy="6" r="1.7" />
                        <circle cx="9" cy="12" r="1.7" /><circle cx="15" cy="12" r="1.7" />
                        <circle cx="9" cy="18" r="1.7" /><circle cx="15" cy="18" r="1.7" />
                      </svg>
                    </button>
                  </li>
                  )
                })}
              </ol>
            </aside>
            <aside className="padband" aria-label="Pad contínuo">
              <div className="pad-head">
                <h2>Pad contínuo</h2>
                <button
                  className={'power' + (padOn ? ' on' : '')}
                  style={{ ['--c' as string]: '#00f0ff', marginTop: 0 }}
                  onClick={() => (padOn ? stopPad() : tapTone(song.key ?? 0))}
                  aria-label={padOn ? 'Parar o pad' : 'Ligar o pad'}
                  aria-pressed={padOn}
                  title={padOn ? 'Parar o pad' : 'Ligar o pad'}
                />
              </div>
              <button className="lname slim" onClick={() => setPickerFor('pad')}>
                <small>Som</small>
                {byId(cfg.timbre)?.name}
              </button>
              <div className="tones">
                {TONES.map((k, n) => (
                  <button
                    key={k.n}
                    className={'tone' + (song.key === n ? ' sel' : '') + (padOn && song.key === n ? ' live' : '')}
                    onClick={() => tapTone(n)}
                    aria-pressed={song.key === n}
                  >
                    {k.n}
                    {k.alt && <small>{k.alt}</small>}
                  </button>
                ))}
              </div>
              <div className="padmix">
                <div className="padfader">
                  <Fader value={cfg.vol} onChange={changePadVol} />
                  <div className="vv">{cfg.vol}</div>
                </div>
                <div className="knobs">
                  <Knob always label="Brightness" value={cfg.bright} reset={64} onChange={(v) => setCfg((c) => ({ ...c, bright: v }))} />
                  <Knob always label="Shimmer" value={cfg.shimmer} reset={0} onChange={(v) => setCfg((c) => ({ ...c, shimmer: v }))} />
                </div>
              </div>
              <label className="row">
                Entrada
                <select value={cfg.fade} onChange={(e) => setCfg({ ...cfg, fade: +e.target.value })}>
                  {PAD_FADES.map((f) => (
                    <option key={f} value={f}>
                      {f} s
                    </option>
                  ))}
                </select>
              </label>
              <label className="row" title="Para sons que vão sumindo sozinhos: o pad renova a nota de tempos em tempos, sem corte.">
                Manter nota
                <select value={cfg.hold ?? 0} onChange={(e) => setCfg({ ...cfg, hold: +e.target.value })}>
                  <option value={0}>Desligado</option>
                  {[6, 10, 15, 20, 30].map((f) => (
                    <option key={f} value={f}>
                      renovar a cada {f} s
                    </option>
                  ))}
                </select>
              </label>
              {(song.key == null || padOn) && (
                <p className="hint small">
                  {song.key == null ? 'Toque num tom para o pad começar. Cada música guarda o seu tom.' : `Tocando em ${TONES[song.key!].n}. Outro tom troca com transição.`}
                </p>
              )}
            </aside>
            </div>
            <main className="center">
              <section className="hero">
                <button className="ghost sq round" onClick={() => stepSong(-1)} disabled={view.indexOf(songIdx) <= 0} aria-label="Música anterior">
                  ◀
                </button>
                <div className="hero-mid">
                  <input
                    className="songname"
                    value={song.name}
                    onChange={(e) => updateSong((s) => ({ ...s, name: e.target.value }))}
                    aria-label="Nome da música"
                  />
                  <p>{layerNames(section.layers) || 'Escolha os timbres das camadas'}</p>
                  <div className="hero-actions">
                    <button className="ghost" onClick={duplicateSong}>
                      Duplicar
                    </button>
                    <button className={'ghost' + (confirmDel ? ' danger on' : '')} onClick={deleteSong} disabled={songs.length <= 1}>
                      {confirmDel ? 'Toque de novo para excluir' : 'Excluir música'}
                    </button>
                  </div>
                </div>
                <button className="ghost sq round" onClick={() => stepSong(1)} disabled={view.indexOf(songIdx) >= view.length - 1} aria-label="Próxima música">
                  ▶
                </button>
              </section>

              <section className="strips" aria-label="Camadas" ref={stripsRef} onScroll={onStripsScroll}>
                {section.layers.map((l, i) => {
                  const t = byId(l.timbre)
                  const live = !!t && !l.off
                  return (
                    <div
                      key={i}
                      className={'strip' + (live ? '' : ' dim')}
                      style={{ ['--c' as string]: LCOLORS[i] }}
                      onPointerDown={(e) => chDown(e, i)}
                      onPointerMove={chMove}
                      onPointerUp={chCancel}
                      onPointerCancel={chCancel}
                      onPointerLeave={chCancel}
                      onContextMenu={(e) => { e.preventDefault(); chFired.current = true; setChMenu(i) }}
                      onClickCapture={(e) => { if (chFired.current) { e.stopPropagation(); e.preventDefault(); chFired.current = false } }}
                    >
                      <div className="strip-top">
                        <button
                          className={'power' + (live ? ' on' : '')}
                          disabled={!t}
                          onClick={() => editLayer(i, { off: !l.off })}
                          aria-label={live ? 'Desligar camada' : 'Ligar camada'}
                          aria-pressed={live}
                        />
                        <button className="lname" onClick={() => setPickerFor(i)}>
                          <small>{t ? (t.drum ? 'Kit de bateria' : t.group) : `Camada ${i + 1}`}</small>
                          <span className="lnm">{t ? t.name : 'Escolher timbre'}</span>
                        </button>
                        <button className={'sndbtn' + (hasSnd(l) ? ' on' : '')} disabled={!t} onClick={() => setSndEdit(i)} aria-label="Compressor, equalizador e ajustes deste som" title="Compressor, equalizador e ajustes">
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 4v16M12 4v16M19 4v16" /><circle cx="5" cy="9" r="2.2" fill="currentColor" /><circle cx="12" cy="15" r="2.2" fill="currentColor" /><circle cx="19" cy="8" r="2.2" fill="currentColor" /></svg>
                        </button>
                      </div>
                      <div className="mix">
                        <Fader value={l.vol} disabled={!live} onChange={(v) => editLayer(i, { vol: v })} />
                        <div className="fxslots">
                          {slotsOf(l).map((sl, si) => {
                            const d = fxDef(sl.type)
                            const has = si === 0 ? !!sl.type : true
                            const name = si === 0 ? (d ? (d.type === 'arp' ? 'Arpejo' : d.label) : 'Escolher') : groupSummary(sl, si === 1 ? 'efx' : 'snd')
                            return (
                              <div key={si} className={'fxslot' + (has ? (sl.on ? ' on' : ' off') : ' empty')}>
                                <button
                                  className="fxpow"
                                  disabled={!has}
                                  aria-pressed={sl.on}
                                  aria-label={sl.on ? 'Desligar efeito' : 'Ligar efeito'}
                                  onClick={() => toggleFx(i, si)}
                                />
                                <button className="fxname" onClick={() => setFxEdit({ layer: i, slot: si })}>
                                  <small>{si === 0 ? 'MIDI' : si === 1 ? 'Efeitos' : 'Som'}</small>
                                  <b>{name}</b>
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      <div className="vv">{t ? l.vol : '–'}</div>
                    </div>
                  )
                })}
              </section>
              <div className="pager" aria-label="Páginas de camadas">
                <span className="swipehint">← deslize para ver mais camadas →</span>
                {Array.from({ length: Math.ceil(10 / perPage) }, (_, n) => n).map((n) => (
                  <button
                    key={n}
                    className={page === n ? 'on' : ''}
                    aria-label={`Camadas ${n * perPage + 1} a ${Math.min(10, n * perPage + perPage)}`}
                    onClick={() => stripsRef.current?.scrollTo({ left: n * stripsRef.current.clientWidth * 0.98, behavior: 'smooth' })}
                  >
                    {n * perPage + 1}–{Math.min(10, n * perPage + perPage)}
                  </button>
                ))}
              </div>
            </main>
            <div className="dock">
            <section className="secdock" aria-label="Seções">
              <div className="secline">
              <div className="sec-row">
                {song.sections.map((s, i) => (
                  <button
                    key={i}
                    className={'sec' + (i === secI ? ' on' : '')}
                    title="Toque para tocar a seção. Segure para renomear, mover ou excluir."
                    onClick={() => {
                      if (longFired.current) {
                        longFired.current = false
                        return
                      }
                      selectSection(i)
                    }}
                    onPointerDown={() => startPress(i)}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onPointerCancel={cancelPress}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      cancelPress()
                      longFired.current = true
                                      setSecMenu(i)
                    }}
                  >
                    <small>{i + 1}</small>
                    {s.name}
                    {trans?.i === i && <i key={trans.id} className="prog" style={{ animationDuration: `${trans.secs}s` }} />}
                  </button>
                ))}
              </div>
              <div className="quick">
                <button className={'qbtn' + ((rotor ? rotor === 'fast' : sustain) ? ' on' : '')} onClick={toggleSustain} aria-pressed={rotor ? rotor === 'fast' : sustain} title={rotor ? 'Só órgão: o pedal troca a velocidade do rotor (lento / rápido)' : 'Pedal de sustain'}>
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 20h18" />
                    <path d="M6 20 9 8h6l3 12" />
                    <path d="M9 8c0-2 1.2-3 3-3s3 1 3 3" />
                    <path d="M8 15h8" />
                  </svg>
                  <span>{rotor ? (rotor === 'fast' ? 'Rotor rápido' : 'Rotor lento') : 'Sustain'}</span>
                </button>
                <button className={'qbtn' + (zonesOpen ? ' on' : '')} onClick={() => setZonesOpen((o) => !o)} aria-expanded={zonesOpen} title="Regiões do teclado: onde cada timbre toca">
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2.5" y="6" width="19" height="12" rx="2" />
                    <path d="M12 6v12" strokeDasharray="2 2" />
                    <path d="m7 12-2 0m0 0 1.5-1.5M5 12l1.5 1.5" />
                    <path d="m17 12 2 0m0 0-1.5-1.5M19 12l-1.5 1.5" />
                  </svg>
                  <span>Regiões</span>
                </button>
                <button className={'qbtn' + (bigKb ? ' on' : '')} onClick={() => setBigKb((b) => !b)} aria-pressed={bigKb} title="Aumentar o teclado da tela">
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2.5" y="5" width="19" height="14" rx="2" />
                    <path d="M8.8 5v14M15.2 5v14" />
                    <path d="M7 5v7M17 5v7" strokeWidth="3" />
                  </svg>
                  <span>{bigKb ? 'Reduzir' : 'Teclado'}</span>
                </button>
              </div>
              </div>
            </section>

          </div>
          </div>

          <section className="stage">
            <div className="notes">
              {bigKb && (
                <button className="ghost sq oct" onClick={() => setOctBase((b) => Math.max(24, b - 12))} aria-label="Oitava abaixo" disabled={octBase <= 24}>
                  ◀
                </button>
              )}
              <span>{active.size ? [...active].sort((a, b) => a - b).map(label).join('  ') : bigKb ? `${noteName(kbFirst)} a ${noteName(kbLast)}` : 'Toque uma tecla'}</span>
              {bigKb && (
                <button className="ghost sq oct" onClick={() => setOctBase((b) => Math.min(72, b + 12))} aria-label="Oitava acima" disabled={octBase >= 72}>
                  ▶
                </button>
              )}
            </div>
            <div className="stage-row">
              <div className="wheels">
                <Wheel kind="pitch" />
                <Wheel kind="mod" />
              </div>
              <div className="stage-keys">
                <div className="zonebar" aria-hidden="true">
                  {section.layers.map((l, i) => {
                    if (!tim(l)) return null
                    const [lo, hi] = rangeOf(l, song.split)
                    const from = kbFrac(edgeL(Math.max(lo, kbFirst)) - wpos(kbFirst))
                    const to = kbFrac(edgeR(Math.min(hi, kbLast)) - wpos(kbFirst))
                    if (hi < kbFirst || lo > kbLast || to <= from) return null
                    return <i key={i} style={{ top: i * 2.2, left: `${from * 100}%`, width: `${(to - from) * 100}%`, background: LCOLORS[i] }} />
                  })}
                </div>
                <div
                  className={'keyboard' + (bigKb ? ' tall' : '')}
                  onPointerDown={kbDown}
                  onPointerMove={kbMove}
                  onPointerUp={kbUp}
                  onPointerCancel={kbUp}
                  onLostPointerCapture={kbUp}
                >
                  {whites.map((n) => (
                    <div key={n} data-n={n} className={'key white' + (active.has(n) ? ' down' : '')}>
                      {n % 12 === 0 && <span>{label(n)}</span>}
                      {!isBlack(n + 1) || n + 1 > kbLast ? null : (
                        <div data-n={n + 1} className={'key black' + (active.has(n + 1) ? ' down' : '')} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="hint small">
              Atalhos: teclas 1 a 8 ou setas ← → trocam de seção, PageUp e PageDown trocam de música, M liga o metrônomo. O Program Change 1 a 8 do teclado também troca de seção.
            </p>
          </section>
        </>
      )}

      {menuOpen && (
        <Drawer
          onClose={() => setMenuOpen(false)}
          onLearn={() => {
            setMenuOpen(false)
            setLearnShown(true)
          }}
          onSettings={() => {
            setMenuOpen(false)
            setSettingsShown(true)
          }}
        />
      )}
      {learnShown && <LearnPanel onClose={() => setLearnShown(false)} hasMidi={inputs.length > 0} />}
      {settingsShown && (
        <SettingsPanel
          onClose={() => setSettingsShown(false)}
          inputs={inputs}
          latency={latency}
          onRefresh={() => accessRef.current && bindInputs(accessRef.current)}
        />
      )}
      {zonesOpen && (
        <ZoneEditor
          layers={section.layers}
          split={song.split}
          onChange={(i, lo, hi) => editLayer(i, { lo, hi })}
          onClose={() => setZonesOpen(false)}
        />
      )}
      {tracksOpen && <TracksSheet tracks={trackList} playing={looper.playing} recording={looper.state !== 'idle'} onClose={() => setTracksOpen(false)} onEdit={editTrack} onDelete={delTrack} onRec={recClick} onPlay={loopPlay} />}
      {pickerFor !== null && <Picker padMode={pickerFor === 'pad'} onPick={pickTimbre} onClose={() => setPickerFor(null)} />}
    </div>
  )
}
