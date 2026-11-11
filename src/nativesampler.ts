// Motor de amostras nativo do iPad (plugin PalcoSampler, AVAudioUnitSampler). Só existe no app do iPad (Capacitor);
// no navegador/Mac/Windows isso fica indisponível e o app usa o motor web de sempre.
type Plugin = {
  load(o: { id: string; file: string; program: number }): Promise<{ ok: boolean }>
  unload(o: { id: string }): Promise<void>
  noteOn(o: { id: string; note: number; vel: number }): void
  noteOff(o: { id: string; note: number }): void
  cc(o: { id: string; cc: number; value: number }): void
  bend(o: { id: string; value: number }): void
  allOff(o: { id?: string }): void
  setGain(o: { id: string; db: number }): void
  setReverb(o: { wet: number }): void
}
let plugin: Plugin | null = null
let tried = false
export async function nativeSampler(): Promise<Plugin | null> {
  if (plugin || tried) return plugin
  tried = true
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return null
    plugin = registerPlugin<Plugin>('PalcoSampler')
  } catch {
    plugin = null
  }
  return plugin
}
/** Versão síncrona, para o caminho quente das notas: só devolve o plugin depois de nativeSampler() ter sido chamado. */
export const nativeSamplerNow = () => plugin
