import { afterEach, describe, expect, test } from "bun:test"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { ascolta, aspetta, avviaAmbiente, chiama, fermaTutti } from "./aiuti"

afterEach(fermaTutti)

describe("i motori del profilo", () => {
  test("senza profilo la lettura dà una sezione vuota, e la scrittura lo crea con la sola sezione", async () => {
    const a = await avviaAmbiente()
    expect(await chiama(a, "GET", "/api/motori")).toMatchObject({ stato: 200, corpo: {} })
    const scritta = await chiama(a, "PUT", "/api/motori", { sagoma: { attiva: false } })
    expect(scritta).toMatchObject({ stato: 200, corpo: { sagoma: { attiva: false } } })
    expect(JSON.parse(await readFile(join(a.radice, "profilo.json"), "utf-8"))).toEqual({ versione: 1, motori: { sagoma: { attiva: false } } })
    expect((await chiama(a, "GET", "/api/motori")).corpo).toEqual({ sagoma: { attiva: false } })
  })

  test("riscrive solo i motori: il resto del profilo resta com'è, e lo studio ne è avvisato", async () => {
    const a = await avviaAmbiente()
    await writeFile(join(a.radice, "profilo.json"), JSON.stringify({ creator: { nome: "Prova", lingua: "it" }, macchina: { scheda_video: 1 }, motori: { trascrizione: { dove: "scheda", modello: "small" } } }))
    await aspetta(() => (a.server.indice.profilo.valore["creator"] as { nome?: string } | undefined)?.nome === "Prova")
    const ascolto = await ascolta(a)
    const nuovi = { trascrizione: { attiva: true, dove: "processore", modello: "small" }, segui: { attiva: false } }
    expect((await chiama(a, "PUT", "/api/motori", nuovi)).stato).toBe(200)
    expect(JSON.parse(await readFile(join(a.radice, "profilo.json"), "utf-8"))).toEqual({ creator: { nome: "Prova", lingua: "it" }, macchina: { scheda_video: 1 }, motori: nuovi })
    await aspetta(() => ascolto.messaggi.some((m) => m.tipo === "profilo"))
    ascolto.chiudi()
  })

  test("la macchina del profilo si legge, vuota senza profilo, e segue il file quando cambia", async () => {
    const a = await avviaAmbiente()
    expect((await chiama(a, "GET", "/api/macchina")).corpo).toEqual({})
    await writeFile(join(a.radice, "profilo.json"), JSON.stringify({ macchina: { scheda_video: 1, disco_quasi_pieno: false } }))
    await aspetta(async () => (await chiama<{ scheda_video?: number }>(a, "GET", "/api/macchina")).corpo.scheda_video === 1)
    await writeFile(join(a.radice, "profilo.json"), JSON.stringify({ macchina: { scheda_video: null } }))
    await aspetta(async () => (await chiama<Record<string, unknown>>(a, "GET", "/api/macchina")).corpo.scheda_video === null)
  })

  test("ciò che lo schema non ammette si rifiuta con la frase, e il profilo resta com'era", async () => {
    const a = await avviaAmbiente()
    await chiama(a, "PUT", "/api/motori", { sagoma: { dove: "scheda" } })
    const prima = await readFile(join(a.radice, "profilo.json"), "utf-8")
    for (const [corpo, frase] of [
      [{ sagoma: { dove: "online" } }, /deve essere uno fra/],
      [{ inventata: { attiva: true } }, /non è una chiave ammessa/],
      [{ sagoma: { attiva: "si" } }, /deve essere vero o falso/],
    ] as const) {
      const r = await chiama<{ errore: string; problemi: string[] }>(a, "PUT", "/api/motori", corpo)
      expect(r.stato).toBe(400)
      expect(r.corpo.errore).toMatch(frase)
      expect(r.corpo.problemi.length).toBeGreaterThan(0)
    }
    expect((await chiama<{ errore: string }>(a, "PUT", "/api/motori", [1])).stato).toBe(400)
    expect(await readFile(join(a.radice, "profilo.json"), "utf-8")).toBe(prima)
  })
})
