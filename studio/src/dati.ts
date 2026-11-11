// Ogni dato che più viste mostrano ha un solo proprietario: una copia letta una volta, tenuta uguale al
// server dai messaggi del canale e condivisa da chi la guarda (`useCopia`). Finché nessuno la guarda non
// ascolta niente; quando torna qualcuno la mostra com'era e la rilegge.
import { useSyncExternalStore } from "react"
import { api } from "./api"
import { ascoltaCanale } from "./canale"
import type { AnimazioneDisponibile, ConsumiDiClaude, DettaglioVideo, Evento, GiornoGrezzo, StatoArrivi, StatoCanale, StatoLavori, StatoProfilo, StatoRegistrazione, StatoStudioRemoto, Stile, StileDiPartenza, VoceElenco, Carattere } from "./tipi"

export interface StatoCopia<T> {
  dato: T | null
  errore: string | null
  caricato: boolean
}

export interface Copia<T> {
  stato(): StatoCopia<T>
  iscriviti(ascolta: () => void): () => void
  rileggi(): Promise<void>
}

export function creaCopia<T>(leggi: () => Promise<T>, riguarda: (evento: Evento) => boolean): Copia<T> {
  let stato: StatoCopia<T> = { dato: null, errore: null, caricato: false }
  const ascoltatori = new Set<() => void>()
  let smetti: (() => void) | null = null
  let inVolo = false
  let ancora = false

  const imposta = (nuovo: StatoCopia<T>) => {
    stato = nuovo
    ascoltatori.forEach((a) => a())
  }

  const rileggi = async (): Promise<void> => {
    if (inVolo) {
      ancora = true
      return
    }
    inVolo = true
    ancora = false
    try {
      imposta({ dato: await leggi(), errore: null, caricato: true })
    } catch (e) {
      imposta({ dato: stato.dato, errore: e instanceof Error ? e.message : String(e), caricato: true })
    } finally {
      inVolo = false
    }
    if (ancora && smetti) await rileggi()
  }

  const avvia = () => {
    let caduto = false
    smetti = ascoltaCanale({
      evento: (e) => riguarda(e) && void rileggi(),
      errore: () => {
        caduto = true
      },
      aperta: () => {
        if (!caduto) return
        caduto = false
        void rileggi()
      },
    })
    void rileggi()
  }

  return {
    stato: () => stato,
    iscriviti(ascolta) {
      ascoltatori.add(ascolta)
      if (ascoltatori.size === 1) avvia()
      return () => {
        ascoltatori.delete(ascolta)
        if (ascoltatori.size > 0) return
        smetti?.()
        smetti = null
      }
    },
    rileggi,
  }
}

export function useCopia<T>(copia: Copia<T>): StatoCopia<T> {
  return useSyncExternalStore(copia.iscriviti, copia.stato)
}

export const elencoVideo = creaCopia<VoceElenco[]>(api.elencoVideo, (e) => e.tipo === "video")
export const grezzo = creaCopia<GiornoGrezzo[]>(api.grezzo, (e) => e.tipo === "grezzo")
export const stile = creaCopia<Stile>(api.stile, (e) => e.tipo === "stile")
/** I tre stili di partenza e i caratteri che lo stile può nominare: non cambiano da soli, i caratteri si rileggono quando se ne aggiunge uno. */
export const stiliDiPartenza = creaCopia<StileDiPartenza[]>(api.stiliDiPartenza, () => false)
export const caratteri = creaCopia<Carattere[]>(api.caratteri, () => false)
export const lavori = creaCopia<StatoLavori>(api.lavori, (e) => e.tipo === "lavori")
export const arrivi = creaCopia<StatoArrivi>(api.arrivi, (e) => e.tipo === "arrivi")
export const accessoStudio = creaCopia<StatoStudioRemoto>(api.accessoStudio, (e) => e.tipo === "accesso-studio" || e.tipo === "arrivi")
export const registrazione = creaCopia<StatoRegistrazione>(api.registrazione, (e) => e.tipo === "registrazione")
/** Le letture del canale TikTok: le guardano Pubblico, Crescita e Produzione. */
export const canaleTiktok = creaCopia<StatoCanale>(() => api.canale("tiktok"), (e) => e.tipo === "canale")
export const profilo = creaCopia<StatoProfilo>(api.profilo, (e) => e.tipo === "profilo")
export const consumi = creaCopia<ConsumiDiClaude>(api.consumi, (e) => e.tipo === "consumi")
export const animazioni = creaCopia<Record<string, AnimazioneDisponibile[]>>(api.animazioni, (e) => e.tipo === "animazioni")

const dettagli = new Map<string, Copia<DettaglioVideo>>()

/** La copia di un video, una per slug: i messaggi di quel video la rileggono, e quelli dello stile (da cui dipendono `risolto_aggiornato` e `montaggio_superato`). */
export function copiaVideo(slug: string): Copia<DettaglioVideo> {
  const esistente = dettagli.get(slug)
  if (esistente) return esistente
  const nuova = creaCopia<DettaglioVideo>(
    () => api.video(slug),
    (e) => e.tipo === "stile" || (e.tipo === "video" && e.slug === slug),
  )
  dettagli.set(slug, nuova)
  return nuova
}
