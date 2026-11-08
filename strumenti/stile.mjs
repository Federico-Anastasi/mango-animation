import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const eOggetto = (v) => typeof v === "object" && v !== null && !Array.isArray(v)

/** Lo stile del creator sovrapposto a quello di serie (`docs/ARCHITETTURA.md`, «Lo stile»): gli oggetti si fondono chiave per chiave, ogni altro valore del creator sostituisce quello di serie. */
export function unisciStile(serie, creator) {
  if (!eOggetto(serie) || !eOggetto(creator)) return structuredClone(creator)
  const unito = {}
  for (const [chiave, valore] of Object.entries(serie)) unito[chiave] = chiave in creator ? unisciStile(valore, creator[chiave]) : structuredClone(valore)
  for (const [chiave, valore] of Object.entries(creator)) if (!(chiave in serie)) unito[chiave] = structuredClone(valore)
  return unito
}

function leggiJson(percorso, cosa) {
  try {
    return JSON.parse(readFileSync(percorso, "utf8"))
  } catch (errore) {
    throw new Error(`${cosa} non si legge (${percorso}): ${errore.message}`)
  }
}

/** Lo stile di serie del prodotto (`<codice>/stile.json`) con sopra quello del creator (`<lavoro>/stile.json`), se la cartella di lavoro ne ha uno. */
export function leggiStile(codice, lavoro) {
  const serie = leggiJson(join(codice, "stile.json"), "lo stile (stile.json)")
  const delCreator = lavoro ? join(lavoro, "stile.json") : null
  if (!delCreator || !existsSync(delCreator)) return serie
  const sopra = leggiJson(delCreator, "lo stile del creator")
  if (!eOggetto(sopra)) throw new Error(`lo stile del creator (${delCreator}) dev'essere un oggetto JSON`)
  return unisciStile(serie, sopra)
}
