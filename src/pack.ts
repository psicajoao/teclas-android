import type { SndPatch } from './chanfx'

// Pacote de timbres do app: sons do banco MuseScore General Lite (licença MIT, ver tela de créditos),
// cada um com nome próprio e ajustes salvos (equalizador, compressor, vozes).
// Eles só aparecem depois que o banco MuseScore General Lite estiver instalado na biblioteca.

export const PACK_GROUP = 'Worship'
/** Nome do arquivo do banco base (como a biblioteca guarda). */
export const PACK_BASE = 'MuseScore_General_Lite'

export type PackTimbre = { id: string; name: string; program: number; snd: SndPatch }

export const ORIGIN_MS = 'MuseScore General Lite'
export const ORIGIN_GU = 'GeneralUser GS'

export const PACK: PackTimbre[] = [
  {
    // Piano de cauda com mais corpo: reforça os graves e tira um pouco do brilho metálico.
    id: 'pk.piano-cauda-worship', name: 'Piano Cauda Worship', program: 0,
    snd: { eq: { on: true, bands: [4, 3, 1, 0, 0, -1, -2, -3] }, set: { voices: 32 } },
  },
  {
    // Piano de cauda brilhante, com presença e um pouco de peso.
    id: 'pk.piano-brilhante-louvor', name: 'Piano Brilhante Louvor', program: 1,
    snd: { eq: { on: true, bands: [2, 1, 0, 0, 2, 2, 1, 0] }, set: { voices: 32 } },
  },
  {
    // Piano elétrico de lâminas, macio, com agudos mais suaves e compressão leve.
    id: 'pk.piano-eletrico-suave', name: 'Piano Elétrico Suave', program: 4,
    snd: { eq: { on: true, bands: [2, 2, 1, 0, -1, -2, -3, -4] }, comp: { on: true, ratio: 2, threshold: -18 }, set: { voices: 32 } },
  },
  {
    // Piano elétrico FM, cristalino, com mais ar nos agudos.
    id: 'pk.piano-eletrico-cristal', name: 'Piano Elétrico Cristal', program: 5,
    snd: { eq: { on: true, bands: [0, 0, 0, 0, 1, 3, 3, 2] }, set: { voices: 32 } },
  },
]

// Timbres de louvor feitos sobre o banco que já vem dentro do app (GeneralUser GS, banco 0 do GM):
// aparecem para todos, sem baixar nada. Cada um tem equalizador (60 Hz … 16 kHz) e vozes ajustados.
const PAD = (extra?: Partial<SndPatch['set']>) => ({ voices: 32, ...extra })
export const PACK_BUILTIN: PackTimbre[] = [
  // Pads
  { id: 'pk.pad-calor', name: 'Pad Calor Worship', program: 89, snd: { eq: { on: true, bands: [1, 1, 0, -1, -1, 0, 0, -1] }, set: PAD() } },
  { id: 'pk.pad-halo', name: 'Pad Halo Celestial', program: 94, snd: { eq: { on: true, bands: [0, 0, 0, -1, 0, 1, 2, 2] }, set: PAD() } },
  { id: 'pk.pad-fantasia', name: 'Pad Fantasia', program: 88, snd: { eq: { on: true, bands: [0, 0, -1, 0, 1, 2, 2, 1] }, set: PAD() } },
  { id: 'pk.pad-atmosfera', name: 'Pad Atmosfera', program: 99, snd: { eq: { on: true, bands: [1, 1, 0, 0, 0, 0, -1, -2] }, set: PAD() } },
  { id: 'pk.pad-vidro', name: 'Pad Vidro de Arco', program: 92, snd: { eq: { on: true, bands: [0, 0, 0, 0, 0, 1, 1, 0] }, set: PAD() } },
  { id: 'pk.pad-espaco', name: 'Pad Voz do Espaço', program: 91, snd: { eq: { on: true, bands: [0, 1, 0, 0, 0, 1, 1, 0] }, set: PAD() } },
  // Cordas e vozes
  { id: 'pk.cordas-lentas', name: 'Cordas Lentas Louvor', program: 49, snd: { eq: { on: true, bands: [1, 1, 0, 0, 0, 1, 1, 0] }, set: PAD() } },
  { id: 'pk.cordas-amplas', name: 'Cordas Sintéticas Amplas', program: 50, snd: { eq: { on: true, bands: [0, 1, 0, -1, 0, 1, 1, 0] }, set: PAD() } },
  { id: 'pk.cordas-suaves', name: 'Cordas Sintéticas Suaves', program: 51, snd: { eq: { on: true, bands: [0, 1, 1, 0, -1, 0, 0, -1] }, set: PAD() } },
  { id: 'pk.coro', name: 'Coro Celestial', program: 52, snd: { eq: { on: true, bands: [0, 1, 1, 0, 0, 0, -1, -2] }, set: PAD() } },
  { id: 'pk.voz-ooh', name: 'Voz Ooh Suave', program: 53, snd: { eq: { on: true, bands: [0, 1, 1, 0, 0, -1, -1, -2] }, set: PAD() } },
  // Órgãos
  { id: 'pk.orgao-igreja', name: 'Órgão de Igreja', program: 19, snd: { eq: { on: true, bands: [2, 2, 0, -1, 0, 1, 1, 0] }, set: PAD() } },
  { id: 'pk.orgao-hammond', name: 'Órgão Hammond Louvor', program: 16, snd: { eq: { on: true, bands: [1, 1, 0, 0, 1, 1, 0, -1] }, set: PAD() } },
  // Leads
  { id: 'pk.lead-saw', name: 'Lead Saw Louvor', program: 81, snd: { eq: { on: true, bands: [-2, -1, 0, 1, 2, 1, 0, -1] }, comp: { on: true, ratio: 3, threshold: -16 }, set: { voices: 16 } } },
  { id: 'pk.lead-quadrada', name: 'Lead Quadrada Cantora', program: 80, snd: { eq: { on: true, bands: [-2, -1, 0, 1, 1, 0, -1, -2] }, comp: { on: true, ratio: 3, threshold: -16 }, set: { voices: 16 } } },
  { id: 'pk.lead-voz', name: 'Lead Voz Solo', program: 85, snd: { eq: { on: true, bands: [-2, -1, 0, 1, 1, 0, -1, -2] }, comp: { on: true, ratio: 2, threshold: -18 }, set: { voices: 16 } } },
  { id: 'pk.lead-chiff', name: 'Lead Chiff Sopro', program: 83, snd: { eq: { on: true, bands: [-2, -1, 0, 0, 1, 1, 0, -1] }, set: { voices: 16 } } },
]
