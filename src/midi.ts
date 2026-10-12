export type MidiEvent =
  | { type: 'noteOn'; note: number; velocity: number; channel: number; t: number }
  | { type: 'noteOff'; note: number; channel: number; t: number }
  | { type: 'cc'; controller: number; value: number; channel: number; t: number }
  | { type: 'bend'; value: number; channel: number; t: number }
  | { type: 'pc'; program: number; channel: number; t: number }

export function parseMidi(data: Uint8Array, t: number): MidiEvent | null {
  if (data.length < 2) return null
  const status = data[0] & 0xf0
  const channel = data[0] & 0x0f
  const a = data[1]
  const b = data[2] ?? 0
  if (status === 0x90 && b > 0) return { type: 'noteOn', note: a, velocity: b, channel, t }
  if (status === 0x80 || (status === 0x90 && b === 0)) return { type: 'noteOff', note: a, channel, t }
  if (status === 0xb0) return { type: 'cc', controller: a, value: b, channel, t }
  if (status === 0xc0) return { type: 'pc', program: a, channel, t }
  if (status === 0xe0) return { type: 'bend', value: a | (b << 7), channel, t }
  return null
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const noteName = (n: number) => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1)

export const DRUM_NAMES: Record<number, string> = {
  35: 'Bumbo 2', 36: 'Bumbo', 37: 'Aro', 38: 'Caixa', 39: 'Palma', 40: 'Caixa 2', 41: 'Surdo grave', 42: 'Chimbal fechado',
  43: 'Surdo médio', 44: 'Chimbal pedal', 45: 'Tom grave', 46: 'Chimbal aberto', 47: 'Tom médio', 48: 'Tom agudo',
  49: 'Prato ataque', 50: 'Tom agudo 2', 51: 'Condução', 52: 'Prato China', 53: 'Campana', 54: 'Pandeiro', 55: 'Splash',
  56: 'Cowbell', 57: 'Prato ataque 2', 58: 'Vibraslap', 59: 'Condução 2', 60: 'Bongô agudo', 61: 'Bongô grave',
  62: 'Conga abafada', 63: 'Conga aberta', 64: 'Conga grave', 65: 'Timbal agudo', 66: 'Timbal grave', 67: 'Agogô agudo',
  68: 'Agogô grave', 69: 'Cabasa', 70: 'Maracas', 71: 'Apito curto', 72: 'Apito longo', 73: 'Reco-reco curto',
  74: 'Reco-reco longo', 75: 'Claves', 76: 'Woodblock agudo', 77: 'Woodblock grave', 78: 'Cuíca abafada', 79: 'Cuíca aberta',
  80: 'Triângulo abafado', 81: 'Triângulo',
}
