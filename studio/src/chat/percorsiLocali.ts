const UNITA = /^[a-z]:[\\/]/i
const ALTRO_SCHEMA = /^[a-z][a-z0-9+.-]*:/i

export interface PercorsoLocale {
  /** Il percorso come lo si legge. */
  mostra: string
  /** La parte dopo `archivio/`, se il percorso sta nell'archivio: è ciò che il server sa aprire. */
  archivio: string | null
}

/**
 * Un indirizzo che indica un file o una cartella del computer (`file:`, lettera di unità, rete, `/…`, relativo).
 * `null` per ogni altro schema (`javascript:`, `data:`, …).
 */
export function percorsoDelComputer(href: string): PercorsoLocale | null {
  let percorso = href.trim()
  if (/^file:/i.test(percorso)) {
    percorso = percorso.slice(5)
    if (percorso.startsWith("///")) percorso = percorso.slice(2)
    try {
      percorso = decodeURI(percorso)
    } catch {
      // Un `%` non valido resta com'è scritto.
    }
    if (/^\/[a-z]:\//i.test(percorso)) percorso = percorso.slice(1)
  } else if (!UNITA.test(percorso) && ALTRO_SCHEMA.test(percorso)) return null
  const dopo = /(?:^|\/)archivio\/(.+?)\/*$/i.exec(percorso.replaceAll("\\", "/"))
  return { mostra: percorso, archivio: dopo?.[1] ?? null }
}
