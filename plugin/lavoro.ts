// La cartella di lavoro vista dal plugin, fuori dall'app (`docs/ARCHITETTURA.md`, «Come il metodo arriva a Claude»).
import { statSync } from "node:fs"
import { join, resolve } from "node:path"

export const VARIABILE_LAVORO = "MANGO_ANIMATION_LAVORO"

const eCartella = (percorso: string): boolean => statSync(percorso, { throwIfNoEntry: false })?.isDirectory() ?? false

const stessa = (a: string, b: string): boolean => resolve(a).toLowerCase() === resolve(b).toLowerCase()

/**
 * `MANGO_ANIMATION_LAVORO` se c'è (la chat dell'app la passa sempre); altrimenti la cartella in cui Claude Code è aperto, se ha `archivio/`.
 * `null` in ogni altra cartella, compresa quella del codice: lì il plugin non fa niente.
 */
export function trovaLavoro(ambiente: Record<string, string | undefined>, cartellaAperta: string, radice: string): string | null {
  const indicata = ambiente[VARIABILE_LAVORO]
  if (indicata) {
    if (!eCartella(indicata)) throw new Error(`La cartella di lavoro «${indicata}» (${VARIABILE_LAVORO}) non c'è: crea la cartella o correggi la variabile.`)
    return resolve(indicata)
  }
  const aperta = ambiente["CLAUDE_PROJECT_DIR"] || cartellaAperta
  return !stessa(aperta, radice) && eCartella(join(aperta, "archivio")) ? resolve(aperta) : null
}
