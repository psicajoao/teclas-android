import { createValue } from './signal'

export type Timbre = { id: string; name: string; program: number; group: string; drum?: boolean; bank?: number; lsb?: number; src?: string }

/** Muda quando o banco personalizado é registrado (para redesenhar o seletor). */
export const customVersion = createValue(0)
export const CUSTOM_GROUP = 'Meus bancos'

// As 16 famílias do General MIDI, 8 timbres cada (programas 0 a 127).
const FAMILIES: { group: string; names: string[] }[] = [
  { group: 'Pianos', names: ['Piano de Cauda', 'Piano Brilhante', 'Piano de Cauda Elétrico', 'Piano Honky-tonk', 'Piano Elétrico 1', 'Piano Elétrico 2', 'Cravo', 'Clavinet'] },
  { group: 'Percussão Melódica', names: ['Celesta', 'Glockenspiel', 'Caixa de Música', 'Vibrafone', 'Marimba', 'Xilofone', 'Sinos Tubulares', 'Dulcimer'] },
  { group: 'Órgãos', names: ['Órgão Drawbar', 'Órgão Percussivo', 'Órgão Rock', 'Órgão de Igreja', 'Órgão de Palheta', 'Acordeão', 'Gaita', 'Bandoneon'] },
  { group: 'Violões e Guitarras', names: ['Violão de Nylon', 'Violão de Aço', 'Guitarra Jazz', 'Guitarra Limpa', 'Guitarra Abafada', 'Guitarra Overdrive', 'Guitarra Distorcida', 'Harmônicos de Guitarra'] },
  { group: 'Baixos', names: ['Baixo Acústico', 'Baixo Elétrico (dedo)', 'Baixo Elétrico (palheta)', 'Baixo Fretless', 'Slap Bass 1', 'Slap Bass 2', 'Baixo Sintetizado 1', 'Baixo Sintetizado 2'] },
  { group: 'Cordas', names: ['Violino', 'Viola', 'Violoncelo', 'Contrabaixo', 'Cordas Tremolo', 'Cordas Pizzicato', 'Harpa', 'Tímpano'] },
  { group: 'Conjuntos', names: ['Cordas 1', 'Cordas Lentas', 'Cordas Sintéticas 1', 'Cordas Sintéticas 2', 'Coro Aah', 'Voz Ooh', 'Voz Sintética', 'Orquestra Hit'] },
  { group: 'Metais', names: ['Trompete', 'Trombone', 'Tuba', 'Trompete com Surdina', 'Trompa', 'Seção de Metais', 'Metais Sintéticos 1', 'Metais Sintéticos 2'] },
  { group: 'Palhetas', names: ['Sax Soprano', 'Sax Alto', 'Sax Tenor', 'Sax Barítono', 'Oboé', 'Corne Inglês', 'Fagote', 'Clarinete'] },
  { group: 'Flautas', names: ['Piccolo', 'Flauta', 'Flauta Doce', 'Flauta de Pã', 'Garrafa Soprada', 'Shakuhachi', 'Apito', 'Ocarina'] },
  { group: 'Leads', names: ['Lead Quadrada', 'Lead Dente de Serra', 'Lead Calliope', 'Lead Chiff', 'Lead Charang', 'Lead Voz', 'Lead Quintas', 'Lead Baixo + Lead'] },
  { group: 'Pads', names: ['Pad New Age', 'Pad Quente', 'Pad Polysynth', 'Pad Coral', 'Pad Arco', 'Pad Metálico', 'Pad Halo', 'Pad Sweep'] },
  { group: 'Efeitos Sintéticos', names: ['Chuva', 'Trilha Sonora', 'Cristal', 'Atmosfera', 'Brilho', 'Goblins', 'Ecos', 'Ficção Científica'] },
  { group: 'Étnicos', names: ['Sitar', 'Banjo', 'Shamisen', 'Koto', 'Kalimba', 'Gaita de Fole', 'Rabeca', 'Shanai'] },
  { group: 'Percussivos', names: ['Sino de Tinir', 'Agogô', 'Tambor de Aço', 'Woodblock', 'Taiko', 'Tom Melódico', 'Tambor Sintético', 'Prato Reverso'] },
  { group: 'Efeitos Sonoros', names: ['Ruído de Guitarra', 'Respiração', 'Praia', 'Pássaros', 'Telefone', 'Helicóptero', 'Aplausos', 'Tiro'] },
]

// Kits de bateria do GM (tocam no canal 9; o número é o programa do kit).
const DRUM_KITS: [number, string][] = [
  [0, 'Bateria Padrão'], [8, 'Bateria Room'], [16, 'Bateria Power'], [24, 'Bateria Eletrônica'],
  [25, 'Bateria TR-808'], [32, 'Bateria Jazz'], [40, 'Bateria Brush'], [48, 'Percussão Orquestral'],
]

const MELODIC: Timbre[] = FAMILIES.flatMap((f, fi) =>
  f.names.map((name, i) => ({
    id: `gm${fi * 8 + i}`,
    name,
    program: fi * 8 + i,
    group: f.group,
  })),
)

export const TIMBRES: Timbre[] = [
  ...MELODIC,
  ...DRUM_KITS.map(([program, name]) => ({ id: `drum${program}`, name, program, group: 'Bateria', drum: true })),
]

type Patch = { name: string; program: number; bankMSB: number; bankLSB: number; isDrum: boolean }
/** Registra os timbres dos SoundFonts do usuário (grupo "Meus bancos"). */
export function registerCustom(banks: { bank: { slot: number; name: string }; patches: Patch[] }[]) {
  for (let i = TIMBRES.length - 1; i >= 0; i--) if (TIMBRES[i].group === CUSTOM_GROUP) TIMBRES.splice(i, 1)
  for (const { bank, patches } of banks) {
    const label = bank.name.replace(/\.sf[23]$/i, '')
    const list = [...patches].filter((p) => !p.isDrum).sort((a, b) => a.bankMSB - b.bankMSB || a.bankLSB - b.bankLSB || a.program - b.program)
    const seen = new Set<string>()
    for (const p of list) {
      const orig = p.bankMSB - bank.slot * 8
      const id = `bk${bank.slot}.${orig}.${p.bankLSB}.${p.program}`
      if (seen.has(id)) continue
      seen.add(id)
      TIMBRES.push({ id, name: p.name || `Preset ${p.program}`, program: p.program, group: CUSTOM_GROUP, bank: p.bankMSB, lsb: p.bankLSB, src: label })
    }
  }
  customVersion.set(customVersion.get() + 1)
}

export const GROUPS = [...FAMILIES.map((f) => f.group), 'Bateria']

// Timbres de louvor mais usados, para acesso rápido.
export const FAVORITES = ['gm0', 'gm4', 'gm19', 'gm48', 'gm49', 'gm52', 'gm89', 'gm94']
