// Biblioteca pessoal do iPad do João: SoundFonts embutidos no app (só na versão VITE_PERSONAL; os arquivos não vão para o repositório
// nem para o site). Cada arquivo tem um timbre só e é carregado quando o timbre é escolhido.
export const PREMIUM_GROUP = 'Meus sons'
export type PremiumItem = { id: string; name: string; file: string; offset: number; mb: number; program: number; note?: string }
// offset = banco MIDI (CC0) reservado para cada arquivo; fica fora dos múltiplos de 8 usados pelos bancos do usuário.
export const PREMIUM: PremiumItem[] = [
  { id: 'pm.cathedral', name: 'Cathedral XP80', file: 'pm-cathedral.sf2', offset: 1, mb: 4, program: 0 },
  { id: 'pm.warmpadpno', name: 'Warm Pad Piano', file: 'pm-warmpadpno.sf2', offset: 2, mb: 13, program: 0 },
  { id: 'pm.hillsong', name: 'Hillsong Pad', file: 'pm-hillsong.sf2', offset: 3, mb: 37, program: 0 },
  { id: 'pm.warmpaddings', name: 'Warm Paddings', file: 'pm-warmpaddings.sf2', offset: 4, mb: 37, program: 0 },
  { id: 'pm.meiolouvores', name: 'No meio dos Louvores', file: 'pm-meiolouvores.sf2', offset: 5, mb: 50, program: 1 },
  { id: 'pm.motif80s', name: 'Motif XS7 80s', file: 'pm-motif80s.sf2', offset: 6, mb: 52, program: 0 },
  { id: 'pm.redambient', name: 'Nord Red Ambient Pad', file: 'pm-redambient.sf2', offset: 7, mb: 77, program: 0 },
  { id: 'pm.steinway', name: 'Steinway & Sons', file: 'pm-steinway.sf2', offset: 9, mb: 121, program: 0 },
  { id: 'pm.concertgrand', name: 'Concert Grand (Montage 8)', file: 'pm-concertgrand.sf2', offset: 10, mb: 211, program: 0 },
  { id: 'pm.nordvelvet', name: 'Nord Velvet (pesado)', file: 'pm-nordvelvet.sf2', offset: 11, mb: 381, program: 0, note: 'experimental' },
]
export const premiumEnabled = import.meta.env.VITE_PERSONAL === '1'
export const premiumByOffset = (bank: number) => (premiumEnabled ? PREMIUM.find((p) => p.offset === bank) : undefined)
