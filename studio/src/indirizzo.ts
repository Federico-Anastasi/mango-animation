// La navigazione sta nell'indirizzo, così un ricarica resta dov'è:
// `#/video`, `#/video/<slug>` (la scheda di partenza), `#/video/<slug>/montaggio`, `#/video/<slug>/prova`, `#/video/<slug>/slide`, `#/video/<slug>/controllo?t=12.3`, `#/girato?file=…`, `#/pubblico?video=…`, `#/classifica`, `#/crescita`, `#/produzione`, `#/stile`, `#/motori`.
import { useSyncExternalStore } from "react"

export type VistaApp = "video" | "girato" | "pubblico" | "classifica" | "crescita" | "produzione" | "stile" | "motori"
export type SchedaVideo = "prova" | "montaggio" | "slide" | "scheda" | "controllo" | "copertina" | "file"

export const SCHEDE: readonly SchedaVideo[] = ["montaggio", "scheda", "controllo", "copertina", "file"]
export const SCHEDE_CAROSELLO: readonly SchedaVideo[] = ["slide", "scheda", "file"]

export interface Indirizzo {
  vista: VistaApp
  slug: string | null
  /** `null` se l'indirizzo non ne sceglie una: la pagina del video apre quella di partenza. */
  scheda: SchedaVideo | null
  parametri: URLSearchParams
}

export function leggiIndirizzo(hash: string): Indirizzo {
  const [percorso = "", ricerca = ""] = hash.replace(/^#\/?/, "").split("?")
  const [vista, slug, scheda] = percorso.split("/").map((p) => decodeURIComponent(p))
  const parametri = new URLSearchParams(ricerca)
  if (vista === "girato" || vista === "stile" || vista === "motori" || vista === "pubblico" || vista === "classifica" || vista === "crescita" || vista === "produzione") return { vista, slug: null, scheda: null, parametri }
  const schedaVideo = (["prova", ...SCHEDE, ...SCHEDE_CAROSELLO] as const).find((s) => s === scheda) ?? null
  return { vista: "video", slug: slug || null, scheda: schedaVideo, parametri }
}

export function scriviIndirizzo(i: { vista: VistaApp; slug?: string | null; scheda?: SchedaVideo; parametri?: Record<string, string> }): string {
  const base = i.vista === "video" && i.slug ? `#/video/${encodeURIComponent(i.slug)}${i.scheda ? `/${i.scheda}` : ""}` : `#/${i.vista}`
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
