// Chiaro, scuro o quello del sistema: la scelta si ricorda nel browser e vive come attributo sulla pagina.
import { useSyncExternalStore } from "react"

export type Tema = "sistema" | "chiaro" | "scuro"

const CHIAVE = "mango-animation.tema"
const ordine: readonly Tema[] = ["sistema", "chiaro", "scuro"]

export function leggiTema(): Tema {
  try {
    const salvato = localStorage.getItem(CHIAVE)
    return ordine.find((t) => t === salvato) ?? "sistema"
  } catch {
    return "sistema"
  }
}

const ascoltatori = new Set<() => void>()
let corrente: Tema = leggiTema()

export function applicaTema(tema: Tema): void {
  corrente = tema
  if (tema === "sistema") document.documentElement.removeAttribute("data-tema")
  else document.documentElement.dataset.tema = tema
  ascoltatori.forEach((a) => a())
}

export function scegliTema(tema: Tema): void {
  try {
    if (tema === "sistema") localStorage.removeItem(CHIAVE)
    else localStorage.setItem(CHIAVE, tema)
  } catch {
    // Senza memoria nel browser la scelta vale per questa apertura e basta.
  }
  applicaTema(tema)
}

export function useTema(): Tema {
  return useSyncExternalStore(
    (ascolta) => {
      ascoltatori.add(ascolta)
      return () => ascoltatori.delete(ascolta)
    },
    () => corrente,
  )
}
