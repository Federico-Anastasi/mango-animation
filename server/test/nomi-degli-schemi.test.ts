// Ogni voce che uno schema ammette ha il suo nome nelle due lingue (`x-nomi`): le frasi dei problemi di profilo, piano e scheda la nominano con parole sue.
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const CARTELLA = join(import.meta.dir, "..", "..", "motore", "schemi")

type Sub = { type?: unknown; properties?: Record<string, Sub>; items?: Sub; prefixItems?: Sub[]; additionalProperties?: Sub | boolean; $ref?: string; anyOf?: unknown; oneOf?: Sub[] }
type Schema = Sub & { $defs?: Record<string, Sub>; "x-nomi": Record<string, { it: string; en: string }> }

/** Le chiavi di `x-nomi` che lo schema richiede: ogni voce, ogni elenco (`*`) e ogni gruppo con nomi scelti da chi scrive (`*`). Un `anyOf` si descrive con `forma` e non si scende. */
function chiaviDi(schema: Schema): string[] {
  const chiavi: string[] = [""]
  const visita = (sub: Sub, percorso: string): void => {
    const reale = sub.$ref ? schema.$defs![sub.$ref.split("/").pop()!]! : sub
    if (reale.anyOf && !reale.properties) return
    const sotto = (nome: string): string => (percorso ? `${percorso}/${nome}` : nome)
    for (const [nome, figlio] of Object.entries(reale.properties ?? {})) {
      chiavi.push(sotto(nome))
      visita(figlio, sotto(nome))
    }
    const elementi = [reale.items, ...(reale.prefixItems?.slice(0, 1) ?? []), typeof reale.additionalProperties === "object" ? reale.additionalProperties : undefined].find((s) => s !== undefined)
    if (elementi) {
      chiavi.push(sotto("*"))
      visita(elementi, sotto("*"))
    }
    for (const alternativa of reale.oneOf ?? []) visita(alternativa, percorso)
  }
  visita(schema, "")
  return [...new Set(chiavi)]
}

describe("x-nomi", () => {
  for (const nome of ["profilo", "piano", "scheda", "grezzo", "pagine"]) {
    test(`${nome}: ogni voce che lo schema ammette ha il suo nome nelle due lingue, e nessun nome è di troppo`, () => {
      const schema = JSON.parse(readFileSync(join(CARTELLA, `${nome}.schema.json`), "utf8")) as Schema
      const nomi = schema["x-nomi"]
      const chiavi = chiaviDi(schema)
      expect(chiavi.filter((k) => nomi[k] === undefined)).toEqual([])
      expect(Object.keys(nomi).filter((k) => !chiavi.includes(k) && !k.startsWith("pubblico/testate"))).toEqual([])
      for (const [k, v] of Object.entries(nomi)) expect([k, v.it !== "" && v.en !== "" && v.it !== v.en]).toEqual([k, true])
    })
  }
})
