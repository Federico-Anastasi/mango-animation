// I posti che il motore, gli strumenti e le animazioni dicono nelle loro frasi («`posto` di `x-nomi`», `motore/schemi/profilo.schema.json`) chiamano le righe di
// Impostazioni come le chiama l'interfaccia: se una riga cambia nome, la frase che la nomina cambia con lei.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { scegliLingua } from "../src/lingua"
import { testoDi, type IdRiga } from "../src/impostazioni/righe"

interface Coppia {
  it: string
  en: string
}

const schema = JSON.parse(readFileSync(resolve(__dirname, "../../motore/schemi/profilo.schema.json"), "utf8")) as { "x-nomi": Record<string, { posto?: Coppia }> }
const posto = (chiave: string): Coppia => {
  const voce = schema["x-nomi"][chiave]?.posto
  if (voce === undefined) throw new Error(`${chiave} non ha un posto in x-nomi`)
  return voce
}

const COMPUTER: [string, IdRiga][] = [
  ["trascrizione", "computer.trascrizione"],
  ["allineamento", "computer.allineamento"],
  ["sagoma", "computer.sagoma"],
  ["segui", "computer.segui"],
  ["pulizia_voce", "computer.pulizia_voce"],
]

describe("i posti delle voci del profilo", () => {
  afterEach(() => scegliLingua("sistema"))

  for (const lingua of ["it", "en"] as const) {
    const sezione = lingua === "it" ? "Impostazioni › Computer" : "Settings › Computer"
    it(`nominano le righe di Impostazioni › Computer come l'interfaccia (${lingua})`, () => {
      scegliLingua(lingua)
      for (const [funzione, riga] of COMPUTER) {
        const nome = testoDi(riga).nome
        expect(posto(`motori/${funzione}/attiva`)[lingua]).toContain(nome)
        expect(posto(`motori/${funzione}/attiva`)[lingua]).toContain(sezione)
        if (funzione !== "pulizia_voce") expect(posto(`motori/${funzione}/dove`)[lingua]).toContain(`${lingua === "it" ? "Dove gira" : "Where it runs"}: ${nome}`)
      }
      expect(posto("motori/dettatura/dove")[lingua]).toContain(testoDi("computer.dettatura").nome)
      expect(posto("motori/dettatura/attiva")[lingua]).toContain(testoDi("generale.dettatura").nome)
    })
  }
})
