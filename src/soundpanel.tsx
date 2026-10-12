import { useRef, useState } from 'react'
import { Knob } from './App'
import { sndOf, defaultSnd, SND_PRESETS, EQ_LABELS } from './chanfx'
import type { SndCfg, SndPatch } from './chanfx'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const to127 = (x: number, lo: number, hi: number) => Math.round(((x - lo) / (hi - lo)) * 127)
const from127 = (v: number, lo: number, hi: number) => lo + (v / 127) * (hi - lo)
const lg = (x: number, lo: number, hi: number) => Math.round((Math.log(x / lo) / Math.log(hi / lo)) * 127)
const unlg = (v: number, lo: number, hi: number) => lo * Math.pow(hi / lo, v / 127)
const fdb = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1)} dB`

/** Botão giratório com valor real (linear ou logarítmico). */
function RK({ label, v, lo, hi, def, log, fmt, onChange }: { label: string; v: number; lo: number; hi: number; def: number; log?: boolean; fmt: (x: number) => string; onChange: (x: number) => void }) {
  const val = log ? lg(v, lo, hi) : to127(v, lo, hi)
  const back = (n: number) => (log ? unlg(n, lo, hi) : from127(n, lo, hi))
  return (
    <Knob
      label={label}
      value={Math.max(0, Math.min(127, val))}
      reset={log ? lg(def, lo, hi) : to127(def, lo, hi)}
      always
      fmt={() => fmt(v)}
      onChange={(n) => onChange(n === (log ? lg(def, lo, hi) : to127(def, lo, hi)) ? def : Math.round(back(n) * 10) / 10)}
    />
  )
}

/** Fader vertical do equalizador (−12 a +12 dB). */
function EqBand({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const f = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    onChange(Math.round((f * 24 - 12) * 2) / 2)
  }
  const pct = ((value + 12) / 24) * 100
  return (
    <div className={'eqb' + (disabled ? ' off' : '')}>
      <b className="eqv">{value > 0 ? '+' : ''}{value.toFixed(1)}</b>
      <div
        ref={ref}
        className="eqtrack"
        role="slider"
        aria-label={label}
        aria-valuemin={-12}
        aria-valuemax={12}
        aria-valuenow={value}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          set(e)
        }}
        onPointerMove={(e) => e.buttons && set(e)}
        onDoubleClick={() => onChange(0)}
      >
        <i className="eqmid" />
        <i className="eqfill" style={value >= 0 ? { bottom: '50%', height: `${pct - 50}%` } : { top: '50%', height: `${50 - pct}%` }} />
        <i className="eqthumb" style={{ bottom: `calc(${pct}% - 9px)` }} />
      </div>
      <span>{label}</span>
    </div>
  )
}

const Step = ({ v, lo, hi, onChange, fmt, label }: { v: number; lo: number; hi: number; onChange: (n: number) => void; fmt?: (n: number) => string; label: string }) => (
  <div className="arp-step">
    <button onClick={() => onChange(Math.max(lo, v - 1))} aria-label={`Diminuir ${label}`}>−</button>
    <b>{fmt ? fmt(v) : v}</b>
    <button onClick={() => onChange(Math.min(hi, v + 1))} aria-label={`Aumentar ${label}`}>+</button>
  </div>
)

type Tab = 'comp' | 'eq' | 'set'

export function SoundSheet({ layer, chIndex, color, name, onSnd, onClose, onRemove }: { layer: { snd?: SndPatch }; chIndex: number; color: string; name: string; onSnd: (c: SndCfg) => void; onClose: () => void; onRemove: () => void }) {
  const cfg = sndOf(layer)
  const orig = useRef<SndCfg>(clone(cfg))
  const [tab, setTab] = useState<Tab>('comp')
  const [presets, setPresets] = useState(false)
  const put = (patch: SndPatch) => onSnd(sndOf({ snd: { comp: { ...cfg.comp, ...patch.comp }, eq: { ...cfg.eq, ...patch.eq }, set: { ...cfg.set, ...patch.set } } }))
  const k = cfg.comp
  const on = tab === 'comp' ? k.on : tab === 'eq' ? cfg.eq.on : true
  const c = (p: Partial<typeof k>) => put({ comp: { ...p, on: true } })
  const discard = () => {
    onSnd(orig.current)
    onClose()
  }
  const reset = () => {
    const d = defaultSnd()
    put(tab === 'comp' ? { comp: d.comp } : tab === 'eq' ? { eq: d.eq } : { set: d.set })
  }
  return (
    <div className="overlay center" onClick={discard}>
      <div className="fxsheet snd wide" style={{ ['--c' as string]: color }} role="dialog" aria-label="Página de som do canal" onClick={(e) => e.stopPropagation()}>
        <header className="fxs-head">
          <button className="ghost danger" onClick={() => { onRemove(); onClose() }}>Remover som</button>
          <h3><i className="fxs-dot" /> Canal {chIndex + 1} · {name}</h3>
          {tab !== 'set' && (
            <button className={'fxs-pow' + (on ? ' on' : '')} aria-pressed={on} onClick={() => put(tab === 'comp' ? { comp: { on: !k.on } } : { eq: { on: !cfg.eq.on } })}>
              <span>{on ? 'Efeito ligado' : 'Efeito desligado'}</span>
              <i />
            </button>
          )}
        </header>
        <nav className="sndtabs" role="tablist">
          <button role="tab" aria-selected={tab === 'comp'} className={tab === 'comp' ? 'on' : ''} onClick={() => setTab('comp')}>
            <small>FX A</small>Compressor{k.on && <i className="dot" />}
          </button>
          <button role="tab" aria-selected={tab === 'eq'} className={tab === 'eq' ? 'on' : ''} onClick={() => setTab('eq')}>
            <small>FX B</small>Equalizador{cfg.eq.on && <i className="dot" />}
          </button>
          <button role="tab" aria-selected={tab === 'set'} className={tab === 'set' ? 'on' : ''} onClick={() => setTab('set')}>
            <small>Som</small>Ajustes
          </button>
        </nav>

        {tab === 'comp' && (
          <div className="sndbody cols">
            <section className="sndgrp">
              <h4>Entrada</h4>
              <RK label="Ganho de entrada" v={k.inGain} lo={-24} hi={24} def={0} fmt={fdb} onChange={(x) => c({ inGain: x })} />
            </section>
            <section className="sndgrp">
              <h4>Envelope</h4>
              <RK label="Ataque" v={k.attack} lo={1} hi={200} def={10} log fmt={(x) => `${Math.round(x)} ms`} onChange={(x) => c({ attack: Math.round(x) })} />
              <RK label="Liberação" v={k.release} lo={20} hi={1000} def={150} log fmt={(x) => `${Math.round(x)} ms`} onChange={(x) => c({ release: Math.round(x) })} />
            </section>
            <section className="sndgrp">
              <h4>Loudness</h4>
              <RK label="Razão" v={k.ratio} lo={1} hi={20} def={4} fmt={(x) => `${x.toFixed(1)}:1`} onChange={(x) => c({ ratio: x })} />
              <RK label="Limiar" v={k.threshold} lo={-60} hi={0} def={-24} fmt={(x) => `${x.toFixed(0)} dB`} onChange={(x) => c({ threshold: Math.round(x) })} />
            </section>
            <section className="sndgrp">
              <h4>Mix</h4>
              <RK label="Seco / Molhado" v={k.mix} lo={0} hi={100} def={100} fmt={(x) => `${Math.round(x)}%`} onChange={(x) => c({ mix: Math.round(x) })} />
            </section>
            <section className="sndgrp">
              <h4>Saída</h4>
              <RK label="Ganho de saída" v={k.outGain} lo={-24} hi={24} def={0} fmt={fdb} onChange={(x) => c({ outGain: x })} />
            </section>
          </div>
        )}

        {tab === 'eq' && (
          <div className="sndbody eq">
            {cfg.eq.bands.map((g, i) => (
              <EqBand key={i} label={EQ_LABELS[i]} value={g} disabled={!cfg.eq.on} onChange={(v) => { const bands = [...cfg.eq.bands]; bands[i] = v; put({ eq: { on: true, bands } }) }} />
            ))}
            <p className="fxs-hint eqhint">Arraste cada faixa para cima (reforça) ou para baixo (corta). Toque duas vezes para zerar.</p>
          </div>
        )}

        {tab === 'set' && (
          <div className="sndbody set">
            <div className="setrow">
              <div><b>Bloquear sustain</b><small>Ignora o pedal de sustain neste som.</small></div>
              <button className={'toggle' + (cfg.set.blockSustain ? ' on' : '')} aria-pressed={cfg.set.blockSustain} onClick={() => put({ set: { blockSustain: !cfg.set.blockSustain } })}>
                {cfg.set.blockSustain ? 'Bloqueado' : 'Livre'}
              </button>
            </div>
            <div className="setrow">
              <div><b>Transposição MIDI de entrada</b><small>Sobe/desce as notas só deste som (semitons).</small></div>
              <Step label="transposição" v={cfg.set.transpose} lo={-24} hi={24} fmt={(n) => (n > 0 ? '+' : '') + n} onChange={(n) => put({ set: { transpose: n } })} />
            </div>
            <div className="setrow">
              <div><b>Número de vozes</b><small>Máximo de notas ao mesmo tempo (1 = som monofônico).</small></div>
              <Step label="vozes" v={cfg.set.voices} lo={1} hi={64} onChange={(n) => put({ set: { voices: n } })} />
            </div>
            <div className="setrow">
              <div><b>Faixa do fader de volume</b><small>Reforço extra quando o fader está no topo.</small></div>
              <div className="fxs-segrow">
                {[0, 3, 6, 9, 12].map((d) => (
                  <button key={d} className={'chip' + (cfg.set.volRange === d ? ' on' : '')} onClick={() => put({ set: { volRange: d } })}>
                    {d ? `+${d} dB` : 'Normal'}
                  </button>
                ))}
              </div>
            </div>
            <div className="setrow setknobs">
              <RK label="Volume do sampler" v={cfg.set.sampler} lo={-24} hi={12} def={0} fmt={fdb} onChange={(x) => put({ set: { sampler: x } })} />
              <RK label="Pan da saída" v={cfg.set.pan} lo={-100} hi={100} def={0} fmt={(x) => (Math.abs(x) < 1 ? 'Centro' : x < 0 ? `E ${Math.round(-x)}` : `D ${Math.round(x)}`)} onChange={(x) => put({ set: { pan: Math.round(x) } })} />
              <label className="outsel">
                <span>Saída de áudio</span>
                <select defaultValue="main" aria-label="Saída de áudio">
                  <option value="main">Principal (estéreo)</option>
                </select>
              </label>
            </div>
          </div>
        )}

        <footer className="fxs-foot">
          <div className="fxs-presets">
            <button className="ghost" onClick={() => setPresets((p) => !p)}>Predefinições ▾</button>
            {presets && (
              <div className="fxs-menu up">
                {SND_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => {
                      const d = defaultSnd()
                      put({ comp: p.snd.comp ? { ...d.comp, ...p.snd.comp } : d.comp, eq: p.snd.eq ? { ...d.eq, ...p.snd.eq } : d.eq })
                      setPresets(false)
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="ghost" onClick={reset}>Zerar esta aba</button>
          <span className="fxs-sp" />
          <button className="ghost" onClick={discard}>Descartar alterações</button>
          <button className="ghost primary" onClick={onClose}>Confirmar</button>
        </footer>
      </div>
    </div>
  )
}
