// L'interfaccia in italiano e in inglese. Il testo si scrive nelle due lingue nel punto in cui compare: `t("Annulla", "Undo")`.
// La lingua è quella scelta dal pulsante in alto o, senza scelta, quella del sistema (italiano se il sistema parla italiano, inglese altrimenti);
// cambiandola la pagina si ridisegna da capo, quindi un testo si traduce quando si disegna, mai alla partenza del programma.
import { useSyncExternalStore } from "react"

export type Lingua = "it" | "en"
export type SceltaLingua = "sistema" | Lingua

const CHIAVE = "mango-animation.lingua"
const ordine: readonly SceltaLingua[] = ["sistema", "it", "en"]

export function leggiScelta(): SceltaLingua {
  try {
    const salvata = localStorage.getItem(CHIAVE)
    return ordine.find((l) => l === salvata) ?? "sistema"
  } catch {
    return "sistema"
  }
}

const dalSistema = (): Lingua => (navigator.language.toLowerCase().startsWith("it") ? "it" : "en")
const risolvi = (scelta: SceltaLingua): Lingua => (scelta === "sistema" ? dalSistema() : scelta)

const ascoltatori = new Set<() => void>()
let scelta: SceltaLingua = leggiScelta()
let corrente: Lingua = risolvi(scelta)

function applica(nuova: SceltaLingua): void {
  scelta = nuova
  corrente = risolvi(nuova)
  document.documentElement.lang = corrente
  ascoltatori.forEach((a) => a())
}

export function scegliLingua(nuova: SceltaLingua): void {
  try {
    if (nuova === "sistema") localStorage.removeItem(CHIAVE)
    else localStorage.setItem(CHIAVE, nuova)
  } catch {
    // Senza memoria nel browser la scelta vale per questa apertura e basta.
  }
  applica(nuova)
}

export const prossimaScelta = (attuale: SceltaLingua): SceltaLingua => ordine[(ordine.indexOf(attuale) + 1) % ordine.length]!

/** La lingua in uso adesso. */
export const lingua = (): Lingua => corrente

/** Per formattare numeri e date. */
export const localeInUso = (): string => (corrente === "it" ? "it-IT" : "en-GB")

export type Valori = Record<string, string | number>

/** Il testo nella lingua in uso; `{nome}` nel testo si sostituisce col valore di `nome` (un segnaposto senza valore resta com'è, e si vede). */
export function t(italiano: string, inglese: string, valori?: Valori): string {
  const testo = corrente === "it" ? italiano : inglese
  return valori ? testo.replace(/\{(\w+)\}/g, (segnaposto, nome: string) => (nome in valori ? String(valori[nome]) : segnaposto)) : testo
}

/** Una frase che il server o il motore hanno scritto nelle due lingue (`cosa` e `cosa_en`): l'inglese se è la lingua in uso e c'è, altrimenti l'italiano (un file scritto prima dell'inglese). */
export const frasePerLingua = (italiano: string, inglese: string | undefined): string => (corrente === "en" && inglese ? inglese : italiano)

/** Per i componenti: cambia quando cambia la lingua scelta. */
export function useLingua(): { scelta: SceltaLingua; lingua: Lingua } {
  const letta = useSyncExternalStore(
    (ascolta) => {
      ascoltatori.add(ascolta)
      return () => ascoltatori.delete(ascolta)
    },
    () => scelta,
  )
  return { scelta: letta, lingua: corrente }
}

document.documentElement.lang = corrente
