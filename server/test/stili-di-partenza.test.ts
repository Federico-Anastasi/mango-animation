// I tre stili di partenza: un file solo (`stili-di-partenza.json`), letto dalla skill `welcome` e dallo studio.
import { afterEach, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { avviaAmbiente, chiama, fermaTutti } from "./aiuti"

afterEach(fermaTutti)

const REPO = join(import.meta.dir, "..", "..")
const SERIE = JSON.parse(readFileSync(join(REPO, "stile.json"), "utf8")) as Record<string, Record<string, unknown>>
const FILE = readFileSync(join(REPO, "stili-di-partenza.json"), "utf8")

interface Partenza {
  id: string
  nome: { it: string; en: string }
  descrizione: { it: string; en: string }
  stile: Record<string, Record<string, unknown>>
}

describe("gli stili di partenza", () => {
  test("il file del prodotto ha Scuro, Caldo e Vivace, con i nomi nelle due lingue e solo sezioni di aspetto", () => {
    const dati = JSON.parse(FILE) as Record<string, { nome: { it: string; en: string }; descrizione: { it: string; en: string }; stile: Record<string, unknown> }>
    expect(Object.values(dati).map((s) => s.nome.it)).toEqual(["Scuro", "Caldo", "Vivace"])
    for (const s of Object.values(dati)) {
      expect(s.nome.en && s.descrizione.it && s.descrizione.en).toBeTruthy()
      expect(Object.keys(s.stile).every((k) => ["colori", "caratteri", "sottotitoli", "titolo"].includes(k))).toBe(true)
    }
  })

  test("lo studio li riceve già fusi con lo stile di serie: ogni sezione è completa", async () => {
    const a = await avviaAmbiente()
    await writeFile(join(a.codice, "stili-di-partenza.json"), FILE)
    const { stato, corpo } = await chiama<Partenza[]>(a, "GET", "/api/stile/partenza")
    expect(stato).toBe(200)
    expect(corpo.map((s) => s.id)).toEqual(["scuro", "caldo", "vivace"])
    const vivace = corpo[2]!
    expect(Object.keys(vivace.stile).sort()).toEqual(["caratteri", "colori", "sottotitoli", "titolo"])
    // Cambia solo ciò che il file dice; il resto è quello di serie.
    expect(vivace.stile["colori"]).toEqual({ ...SERIE["colori"], rosso: "#FF3B5C", blu: "#2B59FF", giallo: "#FFD60A", verde: "#00B86B" })
    expect(vivace.stile["sottotitoli"]).toMatchObject({ modo: "parola per parola", scrittura: "minuscola", corpo: 64, contorno: 6 })
    expect(vivace.stile["titolo"]).toMatchObject({ fondo: "rosso", colore: "bianco", maiuscolo: true, corpo: 64 })
    expect(corpo[1]!.stile["caratteri"]).toEqual({ ...SERIE["caratteri"], titoli: "font/Metropolis-Medium.ttf" })
  })

  test("senza il file la frase dice che il prodotto va reinstallato", async () => {
    const a = await avviaAmbiente()
    const { stato, corpo } = await chiama<{ errore: string }>(a, "GET", "/api/stile/partenza", undefined, "it")
    expect(stato).toBe(404)
    expect(corpo.errore).toContain("reinstallato")
  })
})
