// Motor de amostras nativo do iPad (plugin PalcoSampler, AVAudioUnitSampler). Só existe no app do iPad (Capacitor);
// no navegador/Mac/Windows isso fica indisponível e o app usa o motor web de sempre.
import { TIMBRES, CUSTOM_GROUP, customVersion } from './timbres'
import { createValue } from './signal'

/** Linhas de diagnóstico mostradas na tela do iPad (sem precisar do Xcode). */
export const nlog = createValue<string[]>([])
export const nlogAdd = (m: string) => { console.log('PK ' + m); nlog.set([...nlog.get().slice(-5), m]) }

type LoadRes = { ok: boolean; engine?: boolean; engineError?: string; seconds?: number }
export type NativeFile = { file: string; name: string; size: number; presets: { name: string; program: number; bank: number }[] }
type Plugin = {
  load(o: { id: string; file: string; program: number; bank?: number }): Promise<LoadRes>
  unload(o: { id: string }): Promise<void>
  noteOn(o: { id: string; note: number; vel: number }): void
  noteOff(o: { id: string; note: number }): void
  cc(o: { id: string; cc: number; value: number }): void
  bend(o: { id: string; value: number }): void
  allOff(o: { id?: string }): void
  setGain(o: { id: string; db: number }): void
  setReverb(o: { wet: number }): void
  pick(): Promise<{ added: number; skipped: string[] }>
  library(): Promise<{ files: NativeFile[] }>
  removeFile(o: { file: string }): Promise<void>
  status(): Promise<{ engine: boolean; samplers: string[]; route: string; volume: number }>
}
let plugin: Plugin | null = null
let tried = false
export const isNativeApp = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() || location.protocol === 'capacitor:' || !!(window as unknown as { webkit?: { messageHandlers?: { bridge?: unknown } } }).webkit?.messageHandlers?.bridge

export async function nativeSampler(): Promise<Plugin | null> {
  if (plugin || tried) return plugin
  tried = true
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return null
    plugin = registerPlugin<Plugin>('PalcoSampler')
    nlogAdd('plugin registrado')
  } catch (e) {
    nlogAdd('plugin ERRO ' + String(e))
    plugin = null
  }
  return plugin
}
/** Versão síncrona, para o caminho quente das notas: só devolve o plugin depois de nativeSampler() ter sido chamado. */
export const nativeSamplerNow = () => plugin

/** Número de "banco" MIDI interno de cada SoundFont importado (para a camada achar o arquivo). */
export const nativeBanks = new Map<number, { file: string; name: string }>()
const FIRST_BANK = 41

/** Lê a biblioteca do usuário (pasta do app no iPad) e registra os timbres em "Meus bancos". */
export async function refreshNativeLibrary(): Promise<NativeFile[]> {
  const pl = await nativeSampler()
  if (!pl) return []
  console.log('PK lib: chamando library')
  const { files } = await pl.library()
  console.log('PK lib: ok', files.length)
  for (let i = TIMBRES.length - 1; i >= 0; i--) if (TIMBRES[i].group === CUSTOM_GROUP) TIMBRES.splice(i, 1)
  nativeBanks.clear()
  files.forEach((f, i) => {
    const bank = FIRST_BANK + i
    nativeBanks.set(bank, { file: f.file, name: f.name })
    const label = f.name.replace(/\.sf2$/i, '')
    for (const p of f.presets) {
      TIMBRES.push({ id: `nb.${f.name}.${p.bank}.${p.program}`, name: p.name || `Preset ${p.program}`, program: p.program, group: CUSTOM_GROUP, bank, lsb: p.bank, src: label })
    }
  })
  customVersion.set(customVersion.get() + 1)
  return files
}
