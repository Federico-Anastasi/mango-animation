// La conversazione resta dentro le misure e i controlli comuni della suite: i fogli di stile e i componenti di `src/chat/` si leggono come testo.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const CARTELLA = join(__dirname, "..", "src", "chat")
const file = (fine: string) => readdirSync(CARTELLA).filter((nome) => nome.endsWith(fine)).map((nome) => ({ nome, testo: readFileSync(join(CARTELLA, nome), "utf8") }))

const GRANDEZZE_AMMESSE = new Set(["11px", "12px", "12.5px", "13px", "14px", "17px", "inherit"])

describe("l'aspetto della conversazione", () => {
  it("il testo ha solo le grandezze comuni alle app Mango, in pixel", () => {
    const fuori = file(".css").flatMap(({ nome, testo }) => [...testo.matchAll(/font-size:\s*([^;]+);/g)].filter((m) => !GRANDEZZE_AMMESSE.has(m[1]!.trim())).map((m) => `${nome}: ${m[0]}`))
    expect(fuori).toEqual([])
  })

  it("niente ombre", () => {
    const conOmbra = file(".css").filter(({ testo }) => /box-shadow/.test(testo)).map(({ nome }) => nome)
    expect(conOmbra).toEqual([])
  })

  it("niente caselle e niente pallini da scegliere", () => {
    const conCasella = file(".tsx").filter(({ testo }) => /type="(checkbox|radio)"/.test(testo)).map(({ nome }) => nome)
    expect(conCasella).toEqual([])
  })

  it("il codice è nel carattere del codice, senza legature", () => {
    const senzaLegature = file(".css").filter(({ testo }) => /font-size:\s*12\.5px/.test(testo) && !/font-variant-ligatures:\s*none/.test(testo)).map(({ nome }) => nome)
    expect(senzaLegature).toEqual([])
  })
})
