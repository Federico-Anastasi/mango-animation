import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { dice } from "./lingua.mjs"

/** Il profilo del creator (`<lavoro>/profilo.json`), o `{}` se la cartella di lavoro non ne ha uno. Ne controlla lo schema chi lo usa. */
export function leggiProfilo(lavoro) {
  const file = lavoro ? join(lavoro, "profilo.json") : null
  if (!file || !existsSync(file)) return {}
  let profilo
  try {
    profilo = JSON.parse(readFileSync(file, "utf8"))
  } catch (errore) {
    throw new Error(dice(`il profilo del creator non si legge (${file}): ${errore.message}`, `the creator profile cannot be read (${file}): ${errore.message}`))
  }
  if (typeof profilo !== "object" || profilo === null || Array.isArray(profilo)) throw new Error(dice(`il profilo del creator (${file}) dev'essere un oggetto JSON`, `the creator profile (${file}) must be a JSON object`))
  return profilo
}
