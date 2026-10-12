// Biblioteca de SoundFonts (.sf2/.sf3) do usuário: os arquivos ficam no IndexedDB do aparelho
// (grandes demais para o localStorage) e a lista (nome/tamanho) no localStorage.
const DB = 'teclas-android.bank'
const LIST = 'teclas-android.banks'
export const MAX_BANKS = 15
export const BANK_STEP = 8 // deslocamento de "banco" MIDI por SoundFont, para não misturar presets

export type BankMeta = { slot: number; name: string; size: number }

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files')
      if (!db.objectStoreNames.contains('lib')) db.createObjectStore('lib')
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

function req<T>(q: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    q.onsuccess = () => res(q.result)
    q.onerror = () => rej(q.error)
  })
}

export function listBanks(): BankMeta[] {
  try {
    const v = JSON.parse(localStorage.getItem(LIST) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function saveList(l: BankMeta[]) {
  try {
    localStorage.setItem(LIST, JSON.stringify(l))
  } catch {
    /* sem armazenamento */
  }
}

/** Traz para a nova biblioteca o único arquivo guardado pela versão anterior. */
async function migrate() {
  try {
    const db = await open()
    const old = (await req(db.transaction('files').objectStore('files').get('bank'))) as { name: string; size: number; data: ArrayBuffer } | undefined
    if (!old) return
    const list = listBanks()
    if (!list.length) {
      const tx = db.transaction('lib', 'readwrite')
      tx.objectStore('lib').put(old.data, 1)
      await new Promise((r) => (tx.oncomplete = r))
      saveList([{ slot: 1, name: old.name, size: old.size }])
    }
    const tx2 = db.transaction('files', 'readwrite')
    tx2.objectStore('files').delete('bank')
  } catch {
    /* ignora */
  }
}

export async function getBankData(slot: number): Promise<ArrayBuffer | null> {
  try {
    const db = await open()
    const v = (await req(db.transaction('lib').objectStore('lib').get(slot))) as ArrayBuffer | Blob | undefined
    if (!v) return null
    return v instanceof Blob ? await v.arrayBuffer() : v
  } catch {
    return null
  }
}

export async function ensureMigrated() {
  await migrate()
}

/** Guarda os arquivos; devolve quantos foram adicionados. */
export async function addBanks(files: File[]): Promise<number> {
  const list = listBanks()
  const db = await open()
  let n = 0
  for (const f of files) {
    const slot = Array.from({ length: MAX_BANKS }, (_, i) => i + 1).find((s) => !list.some((b) => b.slot === s))
    if (!slot) break
    try { await navigator.storage?.persist?.() } catch { /* */ }
    const data = new Blob([f], { type: 'application/octet-stream' })
    const tx = db.transaction('lib', 'readwrite')
    tx.objectStore('lib').put(data, slot)
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
      tx.onabort = () => rej(tx.error)
    })
    list.push({ slot, name: f.name, size: f.size })
    saveList(list)
    n++
  }
  return n
}

export async function removeBank(slot: number) {
  const db = await open()
  const tx = db.transaction('lib', 'readwrite')
  tx.objectStore('lib').delete(slot)
  await new Promise((r) => (tx.oncomplete = r))
  saveList(listBanks().filter((b) => b.slot !== slot))
}

import { createValue } from './signal'
/** Texto de andamento do carregamento dos SoundFonts (vazio = nada carregando). */
export const customStatus = createValue('')

/** Preenchido pelo engine na partida. */
export const bankInfo = { failed: [] as string[], reasons: {} as Record<string, { slot: number; why: string }> }

// Sons "removidos" da lista (o arquivo continua guardado até o último som dele ser removido).
const HID = 'teclas-android.hidden'
export function getHidden(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(HID) ?? '[]')
    return new Set(Array.isArray(v) ? v : [])
  } catch {
    return new Set()
  }
}
export function setHidden(h: Set<string>) {
  try {
    localStorage.setItem(HID, JSON.stringify([...h]))
  } catch {
    /* sem armazenamento */
  }
}
export const slotOf = (id: string) => parseInt(id.slice(2), 10)
