import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/** Il profilo del creator (`<lavoro>/profilo.json`), o `{}` se la cartella di lavoro non ne ha uno. Ne controlla lo schema chi lo usa. */
export function leggiProfilo(lavoro) {
  const file = lavoro ? join(lavoro, "profilo.json") : null
  if (!file || !existsSync(file)) return {}
  let profilo
  try {
    profilo = JSON.parse(readFileSync(file, "utf8"))
  } catch (errore) {
    throw new Error(`il profilo del creator non si legge (${file}): ${errore.message}`)
  }
  if (typeof profilo !== "object" || profilo === null || Array.isArray(profilo)) throw new Error(`il profilo del creator (${file}) dev'essere un oggetto JSON`)
  return profilo
}
