import type { SndPatch } from './chanfx'

// Pacote de timbres do app: sons do banco MuseScore General Lite (licença MIT, ver tela de créditos),
// cada um com nome próprio e ajustes salvos (equalizador, compressor, vozes).
// Eles só aparecem depois que o banco MuseScore General Lite estiver instalado na biblioteca.

export const PACK_GROUP = 'Worship'
/** Nome do arquivo do banco base (como a biblioteca guarda). */
export const PACK_BASE = 'MuseScore_General_Lite'

export type PackTimbre = { id: string; name: string; program: number; snd: SndPatch }

export const PACK: PackTimbre[] = [
  {
    // Piano de cauda com mais corpo: reforça os graves e tira um pouco do brilho metálico.
    id: 'pk.piano-cauda-worship', name: 'Piano Cauda Worship', program: 0,
    snd: { eq: { on: true, bands: [4, 3, 1, 0, 0, -1, -2, -3] }, set: { voices: 16 } },
  },
  {
    // Piano de cauda brilhante, com presença e um pouco de peso.
    id: 'pk.piano-brilhante-louvor', name: 'Piano Brilhante Louvor', program: 1,
    snd: { eq: { on: true, bands: [2, 1, 0, 0, 2, 2, 1, 0] }, set: { voices: 16 } },
  },
  {
    // Piano elétrico de lâminas, macio, com agudos mais suaves e compressão leve.
    id: 'pk.piano-eletrico-suave', name: 'Piano Elétrico Suave', program: 4,
    snd: { eq: { on: true, bands: [2, 2, 1, 0, -1, -2, -3, -4] }, comp: { on: true, ratio: 2, threshold: -18 }, set: { voices: 16 } },
  },
  {
    // Piano elétrico FM, cristalino, com mais ar nos agudos.
    id: 'pk.piano-eletrico-cristal', name: 'Piano Elétrico Cristal', program: 5,
    snd: { eq: { on: true, bands: [0, 0, 0, 0, 1, 3, 3, 2] }, set: { voices: 16 } },
  },
]
