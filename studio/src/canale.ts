// Il canale unico dal server (`GET /api/eventi`, `docs/API.md`, «Eventi»): ogni messaggio dice cosa è
// cambiato, e una vista rilegge solo quello. Mai su un timer.
import type { Evento, TipoEvento } from "./tipi"
import { ascoltaSorgente } from "./sorgenteCondivisa"

const URL_EVENTI = "/api/eventi"

export interface AscoltatoreCanale {
  evento?: (evento: Evento) => void
  aperta?: () => void
  errore?: () => void
}

export function leggiEvento(dati: string): Evento | null {
  try {
    const evento: unknown = JSON.parse(dati)
    if (typeof evento !== "object" || evento === null || !("tipo" in evento)) return null
    return typeof evento.tipo === "string" ? (evento as Evento) : null
  } catch {
    return null
  }
}

export function ascoltaCanale(ascoltatore: AscoltatoreCanale): () => void {
  return ascoltaSorgente(URL_EVENTI, {
    aperta: ascoltatore.aperta,
    errore: ascoltatore.errore,
    messaggio: (dati) => {
      const evento = leggiEvento(dati)
      if (evento) ascoltatore.evento?.(evento)
    },
  })
}

/** Il messaggio riguarda uno dei `tipi` e, se c'è, lo `slug` del video. */
export function riguarda(evento: Evento, tipi: readonly TipoEvento[], slug?: string): boolean {
  if (!tipi.includes(evento.tipo)) return false
  if (slug === undefined || evento.tipo !== "video") return true
  return evento.slug === slug
}
