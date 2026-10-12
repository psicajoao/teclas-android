import { useRef, useState } from 'react'
import { Knob } from './App'
import { useValue, arpStep } from './signal'
import { FX_DEFS, fxDef, newSlot, slotsOf, ARP_STYLES, DIVS, ARP_PRESETS } from './fx'
import type { FxSlot, FxType, ArpCfg } from './fx'
import type { Layer } from './rig'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/* ------------------------------------------------------------------ Arpejador */
function ArpBody({ cfg, onChange }: { cfg: ArpCfg; onChange: (c: ArpCfg) => void }) {
  const cur = useValue(arpStep)
  const barsRef = useRef<HTMLDivElement>(null)
  const latest = useRef(cfg)
  latest.current = cfg
  const put = (patch: Partial<ArpCfg>) => {
    latest.current = { ...latest.current, ...patch }
    onChange(latest.current)
  }
  const setVel = (e: React.PointerEvent) => {
    const el = barsRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const i = Math.min(15, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 16)))
    const v = Math.round(Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)) * 127)
    const vel = [...latest.current.vel]
    vel[i] = Math.max(8, v)
    put({ vel })
  }
  return (
    <div className="arp">
      <div className="arp-row">
        <div className="arp-group">
          <span className="arp-lab">Divisão</span>
          <div className="arp-chips">
            {DIVS.map((d, i) => (
              <button key={d.l} className={'chip' + (cfg.div === i ? ' on' : '')} onClick={() => put({ div: i })}>
                {d.l}
              </button>
            ))}
          </div>
        </div>
        <div className="arp-group">
          <span className="arp-lab">Passos</span>
          <div className="arp-step">
            <button onClick={() => put({ steps: Math.max(1, cfg.steps - 1) })} aria-label="Menos passos">
              −
            </button>
            <b>{cfg.steps}</b>
            <button onClick={() => put({ steps: Math.min(16, cfg.steps + 1) })} aria-label="Mais passos">
              +
            </button>
          </div>
        </div>
        <div className="arp-group">
          <span className="arp-lab">Oitavas</span>
          <div className="arp-step">
            <button onClick={() => put({ oct: Math.max(1, cfg.oct - 1) })} aria-label="Menos oitavas">
              −
            </button>
            <b>{cfg.oct}</b>
            <button onClick={() => put({ oct: Math.min(4, cfg.oct + 1) })} aria-label="Mais oitavas">
              +
            </button>
          </div>
        </div>
      </div>

      <div className="arp-styles" role="radiogroup" aria-label="Estilo">
        {ARP_STYLES.map((s, i) => (
          <button key={s.l} className={'arp-style' + (cfg.style === i ? ' on' : '')} role="radio" aria-checked={cfg.style === i} onClick={() => put({ style: i })}>
            <i>{s.i}</i>
            <span>{s.l}</span>
          </button>
        ))}
      </div>

      <div className="arp-grid">
        <div
          className="arp-bars"
          ref={barsRef}
          onPointerDown={(e) => {
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              /* */
            }
            setVel(e)
          }}
          onPointerMove={(e) => e.buttons && setVel(e)}
        >
          {Array.from({ length: 16 }, (_, i) => (
            <div key={i} className={'arp-col' + (i >= cfg.steps ? ' out' : '') + (!cfg.on[i] ? ' mute' : '') + (cur === i ? ' now' : '')}>
              <div className="arp-fill" style={{ height: `${(cfg.vel[i] / 127) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="arp-btns">
          {Array.from({ length: 16 }, (_, i) => (
            <button
              key={i}
              className={'arp-sb' + (cfg.on[i] ? ' on' : '') + (i >= cfg.steps ? ' out' : '') + (cur === i ? ' now' : '')}
              onClick={() => {
                const on = [...cfg.on]
                on[i] = !on[i]
                put({ on })
              }}
              aria-pressed={cfg.on[i]}
              aria-label={`Passo ${i + 1}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="arp-row arp-bottom">
        <Knob label="Duração" value={Math.round(((cfg.gate - 10) / 90) * 127)} reset={Math.round(((70 - 10) / 90) * 127)} onChange={(v) => put({ gate: Math.round(10 + (v / 127) * 90) })} always fmt={() => `${cfg.gate}%`} />
        <Knob label="Swing" value={Math.round((cfg.swing / 100) * 127)} reset={0} onChange={(v) => put({ swing: Math.round((v / 127) * 100) })} always fmt={() => `${cfg.swing}%`} />
        <button className={'arp-latch' + (cfg.latch ? ' on' : '')} aria-pressed={cfg.latch} onClick={() => put({ latch: !cfg.latch })}>
          <b>Segurar (latch)</b>
          <small>{cfg.latch ? 'Continua tocando ao soltar as teclas' : 'Para quando solta as teclas'}</small>
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Página de um efeito */
export function FxSheet({
  layer,
  chIndex,
  slot,
  color,
  onSlots,
  onClose,
}: {
  layer: Layer
  chIndex: number
  slot: number
  color: string
  onSlots: (s: FxSlot[]) => void
  onClose: () => void
}) {
  const slots = slotsOf(layer)
  const cur = slots[slot]
  const orig = useRef<FxSlot[]>(clone(slots))
  const [choosing, setChoosing] = useState(!cur.type)
  const [presets, setPresets] = useState(false)
  const def = fxDef(cur.type)
  const kind = slot === 0 ? 'midi' : 'audio'
  const set = (next: FxSlot) => onSlots(slots.map((s, i) => (i === slot ? next : s)))
  const pick = (t: FxType | null) => {
    set(newSlot(t))
    setChoosing(false)
  }
  const discard = () => {
    onSlots(orig.current)
    onClose()
  }
  return (
    <div className="overlay center" onClick={discard}>
      <div className={'fxsheet' + (cur.type === 'arp' && !choosing ? ' wide' : '')} style={{ ['--c' as string]: color }} role="dialog" aria-label="Efeito do canal" onClick={(e) => e.stopPropagation()}>
        <header className="fxs-head">
          <button className="ghost" onClick={() => setChoosing((c) => !c)}>
            ⟲ {choosing ? 'Voltar' : 'Trocar efeito'}
          </button>
          {cur.type === 'arp' && !choosing && (
            <div className="fxs-presets">
              <button className="ghost" onClick={() => setPresets((p) => !p)}>
                Predefinições ▾
              </button>
              {presets && (
                <div className="fxs-menu">
                  {ARP_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => {
                        set({ ...cur, arp: clone(p.cfg) })
                        setPresets(false)
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <h3>
            <i className="fxs-dot" /> Canal {chIndex + 1} · {choosing ? 'Escolher efeito' : (def?.label ?? '')}
          </h3>
          {!choosing && cur.type && (
            <button className={'fxs-pow' + (cur.on ? ' on' : '')} aria-pressed={cur.on} onClick={() => set({ ...cur, on: !cur.on })}>
              <span>{cur.on ? 'Efeito ligado' : 'Efeito desligado'}</span>
              <i />
            </button>
          )}
        </header>

        {choosing ? (
          <div className="fxs-choose">
            {FX_DEFS.filter((d) => d.kind === kind).map((d) => (
              <button key={d.type} className={'fxs-opt' + (cur.type === d.type ? ' on' : '')} onClick={() => (cur.type === d.type ? setChoosing(false) : pick(d.type))}>
                <b>{d.label}</b>
                <small>{d.hint}</small>
              </button>
            ))}
            <button className="fxs-opt none" onClick={() => pick(null)}>
              <b>Nenhum</b>
              <small>Deixa este botão vazio.</small>
            </button>
          </div>
        ) : cur.type === 'arp' ? (
          <ArpBody cfg={cur.arp!} onChange={(a) => set({ ...cur, arp: a })} />
        ) : (
          def && (
            <div className="fxs-body">
              <p className="fxs-hint">{def.hint}</p>
              <div className="fxs-params">
                {def.params.map((q) =>
                  q.kind === 'knob' ? (
                    <div key={q.key} className="fxs-knob">
                      <Knob label={q.label} value={cur.p[q.key] ?? q.def} reset={q.def} onChange={(v) => set({ ...cur, p: { ...cur.p, [q.key]: v } })} always fmt={q.fmt} />
                    </div>
                  ) : (
                    <div key={q.key} className="fxs-seg">
                      <span className="arp-lab">{q.label}</span>
                      <div className="fxs-segrow">
                        {q.options.map((o) => (
                          <button key={o.v} className={'chip big' + ((cur.p[q.key] ?? q.def) === o.v ? ' on' : '')} onClick={() => set({ ...cur, p: { ...cur.p, [q.key]: o.v } })}>
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          )
        )}

        <footer className="fxs-foot">
          {!choosing && cur.type && (
            <button className="ghost danger" onClick={() => pick(null)}>
              Remover efeito
            </button>
          )}
          <span className="fxs-sp" />
          <button className="ghost" onClick={discard}>
            Descartar alterações
          </button>
          <button className="ghost primary" onClick={onClose}>
            Confirmar
          </button>
        </footer>
      </div>
    </div>
  )
}
