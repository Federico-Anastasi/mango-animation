// La navigazione sta nell'indirizzo, così un ricarica resta dov'è:
// `#/video`, `#/video/<slug>` (la scheda di partenza), `#/video/<slug>/montaggio`, `#/video/<slug>/prova`, `#/video/<slug>/slide`, `#/video/<slug>/controllo?t=12.3`, `#/girato?file=…`, `#/produzione`,
// `#/canale/pubblico?video=…`, `#/canale/classifica`, `#/canale/crescita`, `#/impostazioni/profilo`, `#/impostazioni/stile`, `#/impostazioni/computer`, `#/impostazioni/telefono`, `#/impostazioni/generali`.
// Gli indirizzi di prima dei numeri del canale e delle impostazioni (`#/pubblico`, `#/classifica`, `#/crescita`, `#/stile`, `#/motori`) portano alla scheda o alla sezione che li ha presi con sé: i collegamenti scritti dalla chat continuano a funzionare.
import { useSyncExternalStore } from "react"

export type VistaApp = "video" | "girato" | "canale" | "produzione" | "impostazioni"
export type SchedaVideo = "prova" | "montaggio" | "slide" | "scheda" | "controllo" | "copertina" | "file"
/** Le tre schede della voce «Canale». */
export type SchedaCanale = "pubblico" | "classifica" | "crescita"
export type SezioneImpostazioni = "profilo" | "stile" | "computer" | "telefono" | "generali"

export const SCHEDE: readonly SchedaVideo[] = ["montaggio", "scheda", "controllo", "copertina", "file"]
export const SCHEDE_CAROSELLO: readonly SchedaVideo[] = ["slide", "scheda", "file"]
export const SCHEDE_CANALE: readonly SchedaCanale[] = ["pubblico", "classifica", "crescita"]
export const SEZIONI_IMPOSTAZIONI: readonly SezioneImpostazioni[] = ["profilo", "stile", "computer", "telefono", "generali"]

const TUTTE_LE_SCHEDE = ["prova", ...SCHEDE, ...SCHEDE_CAROSELLO] as const

/** La scheda col nome dato, se esiste. */
export const schedaDelNome = (nome: string | undefined): SchedaVideo | undefined => TUTTE_LE_SCHEDE.find((s) => s === nome)

interface IndirizzoComune {
  slug: string | null
  /** `null` se l'indirizzo non ne sceglie una: la pagina del video apre quella di partenza. */
  scheda: SchedaVideo | null
  parametri: URLSearchParams
}

/** Dove porta un indirizzo; per «Canale» e «Impostazioni» `parte` è la scheda o la sezione (quella di partenza se l'indirizzo non la dice). */
export type Indirizzo = IndirizzoComune & (
  | { vista: "canale"; parte: SchedaCanale }
  | { vista: "impostazioni"; parte: SezioneImpostazioni }
  | { vista: "video" | "girato" | "produzione"; parte: null }
)

/** Un `%` non valido (`#/video/100%`) lancerebbe durante il disegno: il pezzo resta com'è scritto. */
function decodifica(pezzo: string): string {
  try {
    return decodeURIComponent(pezzo)
  } catch {
    return pezzo
  }
}

/** Gli indirizzi di quando le pagine erano voci di barra a sé. */
const VECCHI: Record<string, { vista: "canale"; parte: SchedaCanale } | { vista: "impostazioni"; parte: SezioneImpostazioni }> = {
  pubblico: { vista: "canale", parte: "pubblico" },
  classifica: { vista: "canale", parte: "classifica" },
  crescita: { vista: "canale", parte: "crescita" },
  stile: { vista: "impostazioni", parte: "stile" },
  motori: { vista: "impostazioni", parte: "computer" },
}

export function leggiIndirizzo(hash: string): Indirizzo {
  const [percorso = "", ricerca = ""] = hash.replace(/^#\/?/, "").split("?")
  const [vista = "", slug, scheda] = percorso.split("/").map(decodifica)
  const parametri = new URLSearchParams(ricerca)
  const vecchio = VECCHI[vista]
  if (vecchio) return { ...vecchio, slug: null, scheda: null, parametri }
  if (vista === "canale") return { vista, slug: null, scheda: null, parte: SCHEDE_CANALE.find((s) => s === slug) ?? "pubblico", parametri }
  if (vista === "impostazioni") return { vista, slug: null, scheda: null, parte: SEZIONI_IMPOSTAZIONI.find((s) => s === slug) ?? "profilo", parametri }
  if (vista === "girato" || vista === "produzione") return { vista, slug: null, scheda: null, parte: null, parametri }
  return { vista: "video", slug: slug || null, scheda: schedaDelNome(scheda) ?? null, parte: null, parametri }
}

export function scriviIndirizzo(i: { vista: VistaApp; slug?: string | null; scheda?: SchedaVideo; parte?: SchedaCanale | SezioneImpostazioni; parametri?: Record<string, string> }): string {
  const base = i.vista === "video" && i.slug ? `#/video/${encodeURIComponent(i.slug)}${i.scheda ? `/${i.scheda}` : ""}` : `#/${i.vista}${i.parte ? `/${i.parte}` : ""}`
  const ricerca = new URLSearchParams(i.parametri).toString()
  return ricerca ? `${base}?${ricerca}` : base
}

export function vai(destinazione: string): void {
  window.location.hash = destinazione
}

const iscriviti = (ascolta: () => void) => {
  window.addEventListener("hashchange", ascolta)
  return () => window.removeEventListener("hashchange", ascolta)
}

export function useIndirizzo(): Indirizzo {
  const hash = useSyncExternalStore(iscriviti, () => window.location.hash)
  return leggiIndirizzo(hash)
}
