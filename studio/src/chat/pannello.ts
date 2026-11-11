// Il pannello della chat: aperto o chiuso e quanto è largo, ricordati nel browser.
import { useSyncExternalStore } from "react"

export const LARGHEZZA_MINIMA = 320
const LARGHEZZA_INIZIALE = 420
/** Sotto questa larghezza della finestra la chat occupa tutto lo schermo, sopra la vista. */
export const SOGLIA_STRETTA = 640

const CHIAVE_LARGHEZZA = "mango-animation.chat.larghezza"
const CHIAVE_APERTA = "mango-animation.chat.aperta"

interface StatoPannello {
  aperta: boolean
  larghezza: number
}

function leggi(chiave: string): string | null {
  try {
    return localStorage.getItem(chiave)
  } catch {
    return null
  }
}

function scrivi(chiave: string, valore: string): void {
  try {
    localStorage.setItem(chiave, valore)
  } catch {
    // Senza memoria nel browser la scelta vale per questa apertura e basta.
  }
}

const larghezzaSalvata = Number(leggi(CHIAVE_LARGHEZZA))
let stato: StatoPannello = {
  aperta: leggi(CHIAVE_APERTA) === "si" && (typeof window === "undefined" || window.innerWidth > SOGLIA_STRETTA),
  larghezza: Number.isFinite(larghezzaSalvata) && larghezzaSalvata >= LARGHEZZA_MINIMA ? larghezzaSalvata : LARGHEZZA_INIZIALE,
}
const ascoltatori = new Set<() => void>()

function imposta(nuovo: StatoPannello): void {
  stato = nuovo
  ascoltatori.forEach((a) => a())
}

export function apriChat(): void {
  scrivi(CHIAVE_APERTA, "si")
  imposta({ ...stato, aperta: true })
}

export function chiudiChat(): void {
  scrivi(CHIAVE_APERTA, "no")
  imposta({ ...stato, aperta: false })
}

export const commutaChat = (): void => (stato.aperta ? chiudiChat() : apriChat())

export function scegliLarghezzaChat(px: number, ricorda: boolean): void {
  const larghezza = Math.max(LARGHEZZA_MINIMA, Math.round(px))
  if (ricorda) scrivi(CHIAVE_LARGHEZZA, String(larghezza))
  imposta({ ...stato, larghezza })
}

export function ripristinaLarghezzaChat(): void {
  try {
    localStorage.removeItem(CHIAVE_LARGHEZZA)
  } catch {
    // Vedi sopra.
  }
  imposta({ ...stato, larghezza: LARGHEZZA_INIZIALE })
}

export function usePannelloChat(): StatoPannello {
  return useSyncExternalStore(
    (ascolta) => {
      ascoltatori.add(ascolta)
      return () => ascoltatori.delete(ascolta)
    },
    () => stato,
  )
}
