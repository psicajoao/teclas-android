import { useEffect, useState } from 'react'
import { engine } from './engine'
import { useValue } from './signal'
import { bindingsValue, waitingValue, lastMsgValue, setBinding, clearAll, describeBinding, learnOpen } from './learn'
import { midiConf, setMidiConf } from './midiconf'
import { listBanks, bankInfo } from './bank'

function Diag() {
  const [, tick] = useState(0)
  const safe = (() => { try { return localStorage.getItem('teclas-android.safe') === '1' } catch { return false } })()
  const banks = listBanks()
  const test = async () => {
    try { await engine.ctx?.resume() } catch { /* */ }
    engine.noteOn(60, 100, 0)
    setTimeout(() => engine.noteOff(60, 0), 700)
    tick((n) => n + 1)
  }
  return (
    <div className="set-card">
      <h3>Diagnóstico do som</h3>
      <dl>
        <dt>Estado do áudio</dt>
        <dd>{engine.ctx?.state ?? 'desligado'}</dd>
        <dt>SoundFonts guardados</dt>
        <dd>{banks.length ? banks.map((b) => `${b.name} (${Math.round(b.size / 1048576)} MB)`).join(', ') : 'nenhum'}</dd>
        {bankInfo.failed.length > 0 && (<><dt>Falharam ao carregar</dt><dd>{bankInfo.failed.join(', ')}</dd></>)}
      </dl>
      <button className="ghost" onClick={test}>Acordar o áudio e tocar um Dó</button>
      <label className="chall" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={safe} onChange={(e) => { try { localStorage.setItem('teclas-android.safe', e.target.checked ? '1' : '0') } catch { /* */ } tick((n) => n + 1) }} />
        Modo seguro: não carregar meus SoundFonts (vale na próxima abertura)
      </label>
    </div>
  )
}

function Backup() {
  const [msg, setMsg] = useState('')
  const exportar = () => {
    const dados: Record<string, string> = {}
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('teclas-android.') && k !== 'teclas-android.safe') dados[k] = localStorage.getItem(k) ?? ''
      }
    } catch { /* */ }
    const blob = new Blob([JSON.stringify({ app: 'palco-keys', versao: 1, data: new Date().toISOString(), dados })], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `palco-keys-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    setMsg('Backup salvo na pasta de Downloads.')
  }
  const [pend, setPend] = useState<Record<string, string> | null>(null)
  const importar = async (f: File | undefined) => {
    if (!f) return
    setPend(null)
    try {
      const j = JSON.parse(await f.text())
      if (j.app !== 'palco-keys' || !j.dados) throw new Error('arquivo inválido')
      const dados: Record<string, string> = {}
      for (const [k, v] of Object.entries(j.dados as Record<string, string>)) if (k.startsWith('teclas-android.')) dados[k] = v
      setPend(dados)
      setMsg(`Arquivo lido: ${f.name} (${Object.keys(dados).length} itens). Confirme abaixo para restaurar.`)
    } catch {
      setMsg(`Não consegui ler "${f.name}". Escolha o arquivo palco-keys-backup-….json que você exportou.`)
    }
  }
  const restaurar = () => {
    if (!pend) return
    try {
      for (const [k, v] of Object.entries(pend)) localStorage.setItem(k, v)
      setMsg('Backup restaurado. Reiniciando…')
      setTimeout(() => location.reload(), 800)
    } catch {
      setMsg('Não consegui gravar os dados neste navegador.')
    }
  }
  return (
    <div className="set-card">
      <h3>Backup</h3>
      <p style={{ opacity: 0.8, fontSize: 13, margin: '0 0 8px' }}>Leve suas músicas, setlists, pad, ajustes e controles MIDI para outro aparelho. Os SoundFonts (.sf2) não vão no arquivo: coloque-os de novo no outro aparelho.</p>
      <button className="ghost" onClick={exportar}>Exportar backup</button>{' '}
      <label className="ghost" style={{ display: 'inline-block', cursor: 'pointer', padding: '8px 12px' }}>
        Importar backup
        <input type="file" style={{ display: 'none' }} onChange={(e) => { void importar(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      {pend && (
        <p style={{ marginTop: 8 }}>
          Isto substitui as músicas, setlists e ajustes deste aparelho pelos do backup.{' '}
          <button className="ghost" onClick={restaurar}>Sim, restaurar</button>{' '}
          <button className="ghost" onClick={() => { setPend(null); setMsg('') }}>Cancelar</button>
        </p>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- gaveta (☰) */
export function Drawer({ onClose, onLearn, onSettings, onManual }: { onClose: () => void; onLearn: () => void; onSettings: () => void; onManual: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="drawer-wrap" onClick={onClose}>
      <nav className="drawer" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
        <h2>Menu</h2>
        <button className="drawer-item" onClick={onLearn}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          </svg>
          <span>
            MIDI Learn<small>Ensinar os botões do seu controlador</small>
          </span>
        </button>
        <button className="drawer-item" onClick={onSettings}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="8" cy="17" r="2" />
          </svg>
          <span>
            Configurações<small>Áudio e MIDI</small>
          </span>
        </button>
        <button className="drawer-item" onClick={onManual}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
            <path d="M4 19V5M9 8h6M9 12h6" />
          </svg>
          <span>
            Manual<small>Como usar o Palco Keys</small>
          </span>
        </button>
      </nav>
    </div>
  )
}

/* ---------------------------------------------------------------- configurações */
type Dev = { id: string; name: string }

function kindOfOutput(label: string) {
  const l = label.toLowerCase()
  if (/bluetooth|airpods|buds|headset|fone|headphone|beats|jbl/.test(l)) return { t: 'Bluetooth / fone', warn: true }
  if (/usb|interface|scarlett|focusrite|behringer|presonus|audient|steinberg|motu|rme|ur\d/.test(l)) return { t: 'Interface de áudio', warn: false }
  if (/built-in|builtin|speaker|alto-falante|internal|macbook|integrad/.test(l)) return { t: 'Alto-falante do aparelho', warn: false }
  if (/hdmi|display|monitor/.test(l)) return { t: 'HDMI / monitor', warn: false }
  return { t: '', warn: false }
}

function AudioTab({ latency }: { latency: { handler: number; output: number } | null }) {
  const [, tick] = useState(0)
  const [outs, setOuts] = useState<MediaDeviceInfo[]>([])
  const [sink, setSink] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((l) => setOuts(l.filter((d) => d.kind === 'audiooutput')))
      .catch(() => {})
    return () => clearInterval(t)
  }, [])
  const ctx = engine.ctx
  const anyCtx = ctx as (AudioContext & { sinkId?: string | { type: string }; setSinkId?: (id: string) => Promise<void> }) | null
  const canSink = !!anyCtx && typeof anyCtx.setSinkId === 'function'
  const base = ctx ? Math.round(ctx.baseLatency * 1000) : 0
  const out = ctx ? Math.round((ctx.outputLatency || 0) * 1000) : 0
  const cur = outs.find((d) => d.deviceId === sink) ?? outs.find((d) => d.deviceId === 'default') ?? outs[0]
  const kind = cur?.label ? kindOfOutput(cur.label) : { t: '', warn: false }
  const total = base + out
  const quality = total < 25 ? 'Excelente para tocar ao vivo' : total < 50 ? 'Bom para tocar ao vivo' : total < 100 ? 'Perceptível: prefira cabo ou interface' : 'Alto: difícil tocar em tempo real'
  const choose = async (id: string) => {
    setErr('')
    try {
      await anyCtx!.setSinkId!(id)
      setSink(id)
    } catch {
      setErr('Não foi possível trocar a saída de áudio neste navegador.')
    }
  }
  return (
    <div className="set-body">
      <div className="set-card">
        <h3>Como o áudio está sendo usado</h3>
        <dl>
          <dt>Motor de áudio</dt>
          <dd>{ctx ? (ctx.state === 'running' ? 'Ligado' : 'Pausado') : 'Desligado'}</dd>
          <dt>Taxa de amostragem</dt>
          <dd>{ctx ? `${ctx.sampleRate / 1000} kHz` : '–'}</dd>
          <dt>Atraso do navegador</dt>
          <dd>{ctx ? `${base} ms` : '–'}</dd>
          <dt>Atraso da saída</dt>
          <dd>{ctx ? `${out} ms` : '–'}</dd>
          <dt>Atraso total estimado</dt>
          <dd>
            <b>{total} ms</b> <small>{quality}</small>
          </dd>
          {latency && (
            <>
              <dt>Última nota medida</dt>
              <dd>{latency.handler + latency.output} ms</dd>
            </>
          )}
        </dl>
      </div>
      <div className="set-card">
        <h3>Saída de áudio</h3>
        {canSink ? (
          <label className="set-field">
            Dispositivo
            <select value={sink || cur?.deviceId || ''} onChange={(e) => choose(e.target.value)}>
              {outs.length === 0 && <option value="">Padrão do sistema</option>}
              {outs.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || (d.deviceId === 'default' ? 'Padrão do sistema' : `Saída ${i + 1}`)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="set-note">Este navegador usa sempre a saída padrão do sistema. Troque a saída nas configurações de som do aparelho.</p>
        )}
        {kind.t && <p className="set-chip">{kind.t}</p>}
        {kind.warn && <p className="set-note warn">Áudio por Bluetooth costuma somar de 100 a 250 ms de atraso. Para tocar ao vivo, prefira fone com cabo, interface de áudio USB ou a saída de fone do aparelho.</p>}
        {err && <p className="set-note warn">{err}</p>}
        <p className="set-note">Dica: fones ou caixas com cabo e interfaces USB têm o menor atraso.</p>
      </div>
      <Backup />
      <Diag />
    </div>
  )
}

function MidiTab({ inputs, onRefresh }: { inputs: Dev[]; onRefresh: () => void }) {
  const conf = useValue(midiConf)
  const last = useValue(lastMsgValue)
  const opts = (none: string) => (
    <>
      <option value={none === 'all' ? 'all' : 'off'}>{none === 'all' ? 'Todos os dispositivos' : 'Nenhum'}</option>
      {inputs.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </>
  )
  return (
    <div className="set-body">
      <div className="set-card">
        <div className="set-row">
          <h3>Dispositivos MIDI conectados</h3>
          <button className="ghost" onClick={onRefresh}>
            Atualizar
          </button>
        </div>
        {inputs.length === 0 ? (
          <p className="set-note">Nenhum controlador detectado. Ligue o teclado por USB ou conecte um dispositivo Bluetooth MIDI e toque uma tecla.</p>
        ) : (
          <ul className="devlist">
            {inputs.map((d) => (
              <li key={d.id}>
                <i aria-hidden="true" />
                {d.name}
              </li>
            ))}
          </ul>
        )}
        <p className="set-note">
          Bluetooth MIDI: pareie o teclado no aparelho primeiro (no Mac, em Configuração de Áudio e MIDI; no Android, no Bluetooth do sistema ou em um app como "MIDI BLE Connect"). Quando estiver conectado, ele aparece aqui sozinho.
        </p>
        <p className="set-note">
          Última mensagem recebida: <b>{last || 'nenhuma ainda'}</b>
        </p>
      </div>
      <div className="set-card">
        <h3>Teclados</h3>
        <label className="set-field">
          Teclado 1 (principal)
          <select value={conf.kb1} onChange={(e) => setMidiConf({ ...conf, kb1: e.target.value })}>
            {opts('all')}
          </select>
        </label>
        <label className="set-field">
          Teclado 2 (outro teclado, módulo ou sistema MIDI)
          <select value={conf.kb2} onChange={(e) => setMidiConf({ ...conf, kb2: e.target.value })}>
            {opts('off')}
          </select>
        </label>
        <label className="set-check">
          <input type="checkbox" checked={conf.kb2Notes} disabled={conf.kb2 === 'off'} onChange={(e) => setMidiConf({ ...conf, kb2Notes: e.target.checked })} />
          O teclado 2 também toca notas (desmarque para usá-lo só como controle de botões, pedais e faders)
        </label>
        <p className="set-note">Com "Todos os dispositivos" no teclado 1, tudo que estiver conectado funciona junto.</p>
      </div>
    </div>
  )
}

export function SettingsPanel({ onClose, inputs, latency, onRefresh }: { onClose: () => void; inputs: Dev[]; latency: { handler: number; output: number } | null; onRefresh: () => void }) {
  const [tab, setTab] = useState<'audio' | 'midi'>('audio')
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="zmodal setpanel" role="dialog" aria-modal="true" aria-label="Configurações">
      <div className="zhead">
        <div>
          <h2>Configurações</h2>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'audio'} className={tab === 'audio' ? 'on' : ''} onClick={() => setTab('audio')}>
              Áudio
            </button>
            <button role="tab" aria-selected={tab === 'midi'} className={tab === 'midi' ? 'on' : ''} onClick={() => setTab('midi')}>
              MIDI
            </button>
          </div>
        </div>
        <button className="ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
      {tab === 'audio' ? <AudioTab latency={latency} /> : <MidiTab inputs={inputs} onRefresh={onRefresh} />}
    </div>
  )
}

/* ---------------------------------------------------------------- MIDI Learn */
function Spot({ id, label, kind = 'btn', className = '' }: { id: string; label: string; kind?: 'btn' | 'slider' | 'knob' | 'vslider'; className?: string }) {
  const binds = useValue(bindingsValue)
  const waiting = useValue(waitingValue)
  const b = binds[id]
  const wait = waiting === id
  return (
    <div className={'spot ' + (kind === 'knob' ? 'knobspot' : kind) + (b ? ' bound' : '') + (wait ? ' wait' : '') + ' ' + className}>
      <button className="spot-hit" onClick={() => waitingValue.set(wait ? null : id)} aria-pressed={wait} aria-label={`Ensinar: ${label}`}>
        {kind === 'slider' && <i className="bar" />}
        {kind === 'vslider' && <i className="vbar" />}
        {kind === 'knob' && <i className="kn" />}
        <span className="sl">{label}</span>
        <span className="sb">{wait ? 'Mexa no controlador…' : b ? describeBinding(b) : ''}</span>
      </button>
      {b && !wait && (
        <button className="spot-x" onClick={() => setBinding(id, null)} aria-label={`Apagar ${label}`} title="Apagar">
          ×
        </button>
      )}
    </div>
  )
}

const TONES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function LearnPanel({ onClose, hasMidi }: { onClose: () => void; hasMidi: boolean }) {
  const binds = useValue(bindingsValue)
  const waiting = useValue(waitingValue)
  useEffect(() => {
    learnOpen.current = true
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (waitingValue.get()) waitingValue.set(null)
      else onClose()
    }
    window.addEventListener('keydown', k)
    return () => {
      learnOpen.current = false
      waitingValue.set(null)
      window.removeEventListener('keydown', k)
    }
  }, [onClose])
  const count = Object.keys(binds).length
  return (
    <div className="zmodal lmodal" role="dialog" aria-modal="true" aria-label="MIDI Learn">
      <div className="zhead">
        <div>
          <h2>MIDI Learn</h2>
          <p>
            {waiting
              ? 'Agora aperte ou mexa no botão do seu controlador. Para cancelar, toque no controle de novo ou aperte Esc.'
              : hasMidi
                ? 'Toque em um controle da tela e depois mexa no botão do controlador que vai comandá-lo. Tudo fica salvo automaticamente.'
                : 'Nenhum controlador MIDI conectado. Conecte um e depois toque num controle da tela.'}
          </p>
        </div>
        <div className="lbtns">
          <span className="lcount">{count} ensinado{count === 1 ? '' : 's'}</span>
          <button className="ghost" onClick={() => count && window.confirm('Apagar todos os controles ensinados?') && clearAll()} disabled={!count}>
            Limpar tudo
          </button>
          <button className="ghost" onClick={onClose}>
            Concluir
          </button>
        </div>
      </div>
      <div className="wf">
        <section className="wf-row wf-top">
          <Spot id="bpm:-1" label="BPM −" />
          <Spot id="bpm:+1" label="BPM +" />
          <Spot id="metro" label="Metrônomo" />
          <Spot id="transpose:-1" label="Transp. −" />
          <Spot id="transpose:+1" label="Transp. +" />
          <Spot id="click" label="Volume do clique" kind="slider" />
          <Spot id="tap" label="Tap tempo" />
          <Spot id="clickpan:-1" label="Clique: esquerdo" />
          <Spot id="clickpan:0" label="Clique: centro" />
          <Spot id="clickpan:1" label="Clique: direito" />
          <Spot id="master" label="Volume geral" kind="slider" />
          <Spot id="panic" label="Panic" />
        </section>
        <section className="wf-row">
          <Spot id="song:prev" label="◀ Música anterior" />
          <Spot id="song:next" label="Próxima música ▶" />
          <Spot id="list:prev" label="◀ Lista anterior" />
          <Spot id="list:next" label="Próxima lista ▶" />
        </section>
        <section className="wf-layers">
          {Array.from({ length: 10 }, (_, i) => (
            <div className="wf-layer" key={i}>
              <Spot id={`layer:${i}:power`} label={`Camada ${i + 1}`} />
              <Spot id={`layer:${i}:vol`} label="Volume" kind="vslider" />
              <Spot id={`layer:${i}:out`} label="Ganho de saída" kind="knob" className="mini" />
              <div className="wf-mini">
                <Spot id={`layer:${i}:fx0`} label="MIDI" className="mini" />
                <Spot id={`layer:${i}:fx1`} label="Efeitos" className="mini" />
                <Spot id={`layer:${i}:fx2`} label="Som" className="mini" />
                <Spot id={`layer:${i}:comp`} label="Comp." className="mini" />
                <Spot id={`layer:${i}:eq`} label="EQ" className="mini" />
              </div>
            </div>
          ))}
        </section>
        <section className="wf-pad">
          <h3>Pad contínuo</h3>
          <Spot id="pad:toggle" label="Ligar / parar" />
          <div className="wf-tones">
            {TONES.map((t, n) => (
              <Spot key={t} id={`pad:tone:${n}`} label={t} />
            ))}
          </div>
          <div className="wf-padctl">
            <Spot id="pad:vol" label="Volume" kind="slider" />
            <Spot id="pad:bright" label="Brightness" kind="knob" />
            <Spot id="pad:shimmer" label="Shimmer" kind="knob" />
          </div>
        </section>
        <section className="wf-row wf-secs">
          {Array.from({ length: 8 }, (_, i) => (
            <Spot key={i} id={`sec:${i}`} label={`Seção ${i + 1}`} />
          ))}
          <Spot id="sustain" label="Sustain" />
          <Spot id="kb:big" label="Teclado grande" />
        </section>
      </div>
    </div>
  )
}
