import { describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { leggiStile, unisciStile } from "../../strumenti/stile.mjs"
import { differenza } from "../src/stile"

describe("lo stile del creator sopra quello di serie", () => {
  test("gli oggetti si fondono chiave per chiave, ogni altro valore del creator sostituisce", () => {
    const serie = { colori: { carta: "#fff", rosso: "#f00" }, titolo: { corpo: 64, parte: { colore: "giallo", stacco: 18 } }, licenze: ["a", "b"], fps: 30, soloSerie: { x: 1 } }
    const creator = { colori: { rosso: "#c00", verde: "#0f0" }, titolo: { parte: { colore: "blu" } }, licenze: ["c"], fps: null, soloCreator: true }
    const unito = unisciStile(serie, creator)
    expect(unito).toEqual({
      colori: { carta: "#fff", rosso: "#c00", verde: "#0f0" },
      titolo: { corpo: 64, parte: { colore: "blu", stacco: 18 } },
      licenze: ["c"],
      fps: null,
      soloSerie: { x: 1 },
      soloCreator: true,
    })
    expect(Object.keys(unito as object)).toEqual(["colori", "titolo", "licenze", "fps", "soloSerie", "soloCreator"])
  })

  test("non cambia nessuno dei due", () => {
    const serie = { a: { b: [1] } }
    const creator = { a: { b: [2], c: { d: 1 } } }
    const unito = unisciStile(serie, creator) as { a: { b: number[]; c: { d: number } } }
    unito.a.c.d = 9
    unito.a.b.push(3)
    expect(serie).toEqual({ a: { b: [1] } })
    expect(creator).toEqual({ a: { b: [2], c: { d: 1 } } })
  })

  test("leggiStile unisce lo stile del codice con quello della cartella di lavoro, se c'è", async () => {
    const radice = await mkdtemp(join(tmpdir(), "stile-"))
    const codice = join(radice, "codice")
    const lavoro = join(radice, "lavoro")
    await mkdir(codice)
    await mkdir(lavoro)
    await writeFile(join(codice, "stile.json"), '{"colori":{"carta":"#fff","rosso":"#f00"}}')
    expect(leggiStile(codice, lavoro)).toEqual({ colori: { carta: "#fff", rosso: "#f00" } })
    expect(leggiStile(codice, undefined)).toEqual({ colori: { carta: "#fff", rosso: "#f00" } })
    await writeFile(join(lavoro, "stile.json"), '{"colori":{"rosso":"#c00"}}')
    expect(leggiStile(codice, lavoro)).toEqual({ colori: { carta: "#fff", rosso: "#c00" } })
    await writeFile(join(lavoro, "stile.json"), "[1]")
    expect(() => leggiStile(codice, lavoro)).toThrow("stile del creator")
    await writeFile(join(lavoro, "stile.json"), "{")
    expect(() => leggiStile(codice, lavoro)).toThrow("stile del creator")
  })
})

describe("ciò che va scritto nello stile del creator", () => {
  const serie = { colori: { carta: "#fff", rosso: "#f00" }, titolo: { corpo: 64, parte: { colore: "giallo", stacco: 18 } }, licenze: ["a", "b"], fps: 30 }

  test("solo ciò che differisce dalla serie, nella stessa forma", () => {
    const completo = { ...serie, colori: { carta: "#fff", rosso: "#c00", verde: "#0f0" }, titolo: { corpo: 64, parte: { colore: "blu", stacco: 18 } }, licenze: ["c"] }
    expect(differenza(serie, completo)).toEqual({ colori: { rosso: "#c00", verde: "#0f0" }, titolo: { parte: { colore: "blu" } }, licenze: ["c"] })
  })

  test("sovrapposta alla serie ridà lo stile completo", () => {
    const completo = { ...serie, colori: { carta: "#eee", rosso: "#f00" }, nuova: { x: [1, 2] }, fps: null }
    expect(unisciStile(serie, differenza(serie, completo))).toEqual(completo)
  })

  test("uno stile uguale alla serie non lascia niente da scrivere", () => {
    expect(differenza(serie, structuredClone(serie))).toEqual({})
  })

  test("una chiave che il completo non ha non si toglie: resta quella di serie", () => {
    expect(unisciStile(serie, differenza(serie, { colori: { carta: "#fff" } }))).toEqual(serie)
  })
})
