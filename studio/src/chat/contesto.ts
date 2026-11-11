// Cosa sta guardando il creator nello studio: parte con ogni messaggio, così Claude sa di quale video e scheda si parla.
import { copiaVideo, useCopia, type Copia } from "../dati"
import { useIndirizzo, type Indirizzo, type SchedaVideo } from "../indirizzo"
import type { DettaglioVideo } from "../tipi"
import type { ContestoChat } from "./tipi"

const NOME_SCHEDA: Record<SchedaVideo, string> = { prova: "Prova", montaggio: "Montaggio", slide: "Slide", scheda: "Scheda", controllo: "Controllo", copertina: "Copertina", file: "File" }
const NOME_VISTA = { video: "Elenco dei video", girato: "Girato", produzione: "Produzione" } as const
const NOME_PARTE = { pubblico: "Pubblico", classifica: "Classifica", crescita: "Crescita", profilo: "Profilo", stile: "Stile", computer: "Computer", telefono: "Telefono", generali: "Generali" } as const

/** Il nome della vista fuori dai video; le schede del canale e le sezioni delle impostazioni hanno il loro. */
const nomeVista = (i: Indirizzo): string => (i.vista === "canale" ? NOME_PARTE[i.parte] : i.vista === "impostazioni" ? `Impostazioni › ${NOME_PARTE[i.parte]}` : NOME_VISTA[i.vista])

const nessunStato = { dato: null, errore: null, caricato: true }
const nessunVideo: Copia<DettaglioVideo> = { stato: () => nessunStato, iscriviti: () => () => undefined, rileggi: async () => undefined }

export interface Sguardo {
  slug: string | null
  /** Il nome della scheda aperta (o della vista, fuori dai video). */
  vista: string
}

/** La scheda che la pagina del video apre quando l'indirizzo non ne dice una. */
function schedaAperta(i: Indirizzo, video: DettaglioVideo | null): SchedaVideo | null {
  if (i.scheda) return i.scheda
  if (!video) return null
  if (video.scheda.formato === "carosello") return "slide"
  const prova = video.uscite.some((u) => u.file.endsWith("/uscite/prova.mp4"))
  return prova && video.piano === null ? "prova" : "montaggio"
}

/** Cosa ha davanti il creator, dall'indirizzo dello studio e dal video aperto. */
export function useSguardo(): Sguardo {
  const indirizzo = useIndirizzo()
  const slug = indirizzo.vista === "video" ? indirizzo.slug : null
  const video = useCopia(slug ? copiaVideo(slug) : nessunVideo).dato
  const scheda = slug ? schedaAperta(indirizzo, video) : null
  return { slug, vista: slug ? (scheda ? NOME_SCHEDA[scheda] : NOME_VISTA.video) : nomeVista(indirizzo) }
}

/** Ciò che parte con ogni messaggio: il video e la scheda. Claude lo legge, il creator non lo vede nel messaggio. */
export const contestoDa = (s: Sguardo): ContestoChat => ({ ...(s.slug ? { video: s.slug } : {}), vista: s.vista })
