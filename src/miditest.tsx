import { useEffect, useRef, useState } from 'react'

/** Tela de diagnóstico: mostra o que o navegador entrega de MIDI, sem depender do resto do app. */
export default function MidiTest({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([])
  const [last, setLast] = useState('nenhuma ainda')
  const [count, setCount] = useState(0)
  const ref = useRef<MIDIAccess | null>(null)
  const add = (t: string) => setLines((l) => [...l.slice(-12), t])

  const scan = () => {
    const a = ref.current
    if (!a) return
    const ins: string[] = []
    a.inputs.forEach((i) => {
      ins.push(`${i.name ?? '?'} (${i.state}/${i.connection})`)
      if (!i.onmidimessage) i.onmidimessage = (e) => { setCount((c) => c + 1); setLast(Array.from(e.data ?? []).join(' ')) }
    })
    const outs: string[] = []
    a.outputs.forEach((o) => outs.push(o.name ?? '?'))
    add(`entradas: ${ins.length ? ins.join(', ') : 'nenhuma'} | saídas: ${outs.length || 'nenhuma'}`)
  }

  useEffect(() => {
    add(`requestMIDIAccess: ${'requestMIDIAccess' in navigator ? 'existe' : 'NÃO existe'}`)
    if (!('requestMIDIAccess' in navigator)) return
    let timer = 0
    navigator.requestMIDIAccess().then((a) => {
      ref.current = a
      add('acesso MIDI concedido')
      a.onstatechange = (e) => { const p = (e as MIDIConnectionEvent).port; if (p) add(`mudança: ${p.name ?? '?'} ${p.state}/${p.connection}`) }
      scan()
      timer = window.setTimeout(scan, 3000)
    }).catch((err) => add('ERRO: ' + (err instanceof Error ? err.message : String(err))))
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="wl" style={{ padding: 16, gap: 10 }}>
      <header className="wl-top"><span className="wl-brand">Teste de <span>MIDI</span></span><button className="wl-skip" onClick={onClose}>Fechar</button></header>
      <main style={{ maxWidth: 640, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Toque algumas teclas do seu teclado agora.</p>
        <p style={{ margin: 0, fontSize: 20 }}>Notas recebidas: <b>{count}</b></p>
        <p style={{ margin: 0 }}>Última mensagem: <code>{last}</code></p>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, margin: 0, fontSize: 13 }}>{lines.join('\n')}</pre>
        <button className="wl-btn" onClick={scan}>Procurar de novo</button>
      </main>
    </div>
  )
}
