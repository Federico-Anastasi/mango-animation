// Gli allegati: dove si vede un file che il creator ha mandato.
import { urlMedia } from "../api"

const anteprime = new Map<string, string>()

/** L'anteprima locale di un'immagine appena caricata, finché la pagina è aperta: così nel messaggio si vede subito. */
export function ricordaAnteprima(percorso: string, url: string): void {
  anteprime.set(percorso, url)
}

/** L'anteprima di un allegato tolto prima di mandare non serve più: si rilascia la memoria dell'immagine. */
export function rilasciaAnteprima(percorso: string | null, url: string): void {
  URL.revokeObjectURL(url)
  if (percorso !== null) anteprime.delete(percorso)
}

export function nomeDelFile(percorso: string): string {
  return percorso.replace(/\\/g, "/").split("/").pop() ?? percorso
}

/** Dove si guarda un'immagine allegata: l'anteprima locale, o il file se sta dentro l'archivio. */
export function indirizzoImmagine(percorso: string): string | null {
  const locale = anteprime.get(percorso)
  if (locale) return locale
  const dritto = percorso.replace(/\\/g, "/")
  const nell = /(?:^|\/)archivio\/(.+)$/.exec(dritto)
  if (nell) return urlMedia(nell[1]!)
  return /^([a-z]:)?\//i.test(dritto) ? null : urlMedia(dritto)
}
