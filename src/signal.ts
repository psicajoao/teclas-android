import { useSyncExternalStore } from 'react'

/** Valor observável: só os componentes que o leem são redesenhados quando ele muda. */
export function createValue<T>(initial: T) {
  let v = initial
  const listeners = new Set<() => void>()
  return {
    get: () => v,
    set: (n: T) => {
      if (n === v) return
      v = n
      listeners.forEach((l) => l())
    },
    sub: (l: () => void) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}

export function useValue<T>(s: ReturnType<typeof createValue<T>>): T {
  return useSyncExternalStore(s.sub, s.get)
}

export const bendValue = createValue(0) // -1 a 1
export const modValue = createValue(0) // 0 a 127
export const beatValue = createValue(-1) // batida atual do metrônomo (-1 = parado)

/** Rotor do órgão (alto-falante Leslie): null = desligado (sem só-órgão), 'slow' ou 'fast'. */
export const rotorValue = createValue<null | 'slow' | 'fast'>(null)
