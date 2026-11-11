// Ciò che il server legge da file che possono cambiare mentre gira: lo rilegge da solo e lo annuncia.
import { afterEach, describe, expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Messaggio } from "../src/eventi"
import { ascolta, aspetta, avviaAmbiente, chiama, fermaTutti, piano, righeDelFinto, scriviGrezzo, scriviVideo, type Ambiente, type Ascolto } from "./aiuti"

const REPO = join(import.meta.dir, "..", "..")
const cartelleProprie: string[] = []

afterEach(async () => {
  await fermaTutti()
  for (const cartella of cartelleProprie.splice(0)) await rm(cartella, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

/** Una copia degli schemi, per poterli cambiare senza toccare quelli veri. */
async function schemiDiProva(): Promise<string> {
  const cartella = await mkdtemp(join(tmpdir(), "mango-schemi-"))
  cartelleProprie.push(cartella)
  await cp(join(REPO, "motore", "schemi"), cartella, { recursive: true })
  return cartella
}

type Proprieta = Record<string, unknown>

/** Cambia l'elenco delle proprietà dello schema `nome`. */
async function cambiaSchema(cartella: string, nome: string, modifica: (proprieta: Proprieta) => void): Promise<void> {
  const file = join(cartella, `${nome}.schema.json`)
  const schema = JSON.parse(await readFile(file, "utf-8")) as { properties: Proprieta }
  modifica(schema.properties)
  await writeFile(file, JSON.stringify(schema, null, 2))
}

const campoNuovoNellaProposta = (proprieta: Proprieta): void => {
  const proposta = proprieta["proposta"] as { properties: Proprieta }
  proposta.properties["campo_nuovo"] = { type: "array", items: { type: "string" } }
}

const dettaglio = (a: Ambiente, slug: string) => chiama<{ scheda: { titolo: string }; problemi: { scheda: string[]; piano: string[] }; piano_risolto_da_base: unknown; materiali: { file: string }[] }>(a, "GET", `/api/video/${slug}`)

const arriva = (ascolto: Ascolto, messaggio: Messaggio, quante = 1) => aspetta(() => ascolto.messaggi.filter((m) => JSON.stringify(m) === JSON.stringify(messaggio)).length >= quante)

const schedaConCampoNuovo = (titolo: string) => ({ titolo, stato: "proposta", creato: "2026-10-06", proposta: { aggancio: "Un aggancio", campo_nuovo: ["uno", "due"] } })

describe("gli schemi", () => {
  test("uno schema cambiato sul disco fa entrare la scheda che prima era rifiutata, e lo studio ne è avvisato", async () => {
    const schemi = await schemiDiProva()
    const a = await avviaAmbiente({ schemi }, async (c) => scriviVideo(c, "v", { titolo: "Vecchio", stato: "proposta", creato: "2026-10-06" }))
    const ascolto = await ascolta(a)

    await writeFile(join(a.archivio, "video", "v", "scheda.json"), JSON.stringify(schedaConCampoNuovo("Nuovo")))
    await arriva(ascolto, { tipo: "video", slug: "v", cosa: "scheda" })
    const rifiutata = (await dettaglio(a, "v")).corpo
    expect(rifiutata.scheda.titolo).toBe("Vecchio")
    expect(rifiutata.problemi.scheda.join(" ")).toContain("«campo_nuovo» non è una chiave ammessa")

    const prima = ascolto.messaggi.length
    await cambiaSchema(schemi, "scheda", campoNuovoNellaProposta)
    await aspetta(async () => (await dettaglio(a, "v")).corpo.scheda.titolo === "Nuovo")
    expect((await dettaglio(a, "v")).corpo.problemi.scheda).toEqual([])
    expect(ascolto.messaggi.slice(prima)).toContainEqual({ tipo: "video", slug: "v", cosa: "scheda" })
    expect((await chiama<{ scheda: { titolo: string } }[]>(a, "GET", "/api/video")).corpo[0]?.scheda.titolo).toBe("Nuovo")
    ascolto.chiudi()
  })

  test("scheda_cambia non rifiuta un campo che lo schema ha appena imparato, senza aspettare l'osservatore", async () => {
    const schemi = await schemiDiProva()
    const a = await avviaAmbiente({ schemi }, async (c) => scriviVideo(c, "v"))
    const campi = { proposta: { campo_nuovo: ["uno"] } }
    const rifiutata = await chiama<{ errore: string }>(a, "PATCH", "/api/video/v/scheda", campi)
    expect(rifiutata.stato).toBe(400)
    expect(rifiutata.corpo.errore).toContain("«campo_nuovo» non è una chiave ammessa")

    await cambiaSchema(schemi, "scheda", campoNuovoNellaProposta)
    const fatta = await chiama(a, "PATCH", "/api/video/v/scheda", campi)
    expect(fatta.stato).toBe(200)
    expect((await dettaglio(a, "v")).corpo.problemi.scheda).toEqual([])
  })

  test("una scheda sul disco che non passa lo schema porta i suoi problemi nel dettaglio; corretta, spariscono", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "v", { titolo: "Buono", stato: "proposta", creato: "2026-10-06" }))
    const file = join(a.archivio, "video", "v", "scheda.json")
    await writeFile(file, JSON.stringify({ titolo: "Rotto", stato: "inventato", creato: "2026-10-06" }))
    await aspetta(async () => (await dettaglio(a, "v")).corpo.problemi.scheda.length > 0)
    const rotto = (await dettaglio(a, "v")).corpo
    expect(rotto.scheda.titolo).toBe("Buono")
    expect(rotto.problemi.scheda.join(" ")).toContain("stato")

    await writeFile(file, "{ non è json")
    await aspetta(async () => (await dettaglio(a, "v")).corpo.problemi.scheda.join(" ").includes("scritto male"))

    await writeFile(file, JSON.stringify({ titolo: "Corretto", stato: "pronto", creato: "2026-10-06" }))
    await aspetta(async () => (await dettaglio(a, "v")).corpo.scheda.titolo === "Corretto")
    expect((await dettaglio(a, "v")).corpo.problemi.scheda).toEqual([])
  })

  test("un video nuovo con la scheda non valida non è nell'elenco, e la sua pagina dice perché", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "v", { titolo: "Senza stato" } as never))
    const risposta = await chiama<{ errore: string; problemi: string[] }>(a, "GET", "/api/video/v")
    expect(risposta.stato).toBe(404)
    expect(risposta.corpo.errore).toBe("Non c'è un video «v» con una scheda valida: la sua scheda va sistemata.")
    expect(risposta.corpo.problemi.join(" ")).toContain("manca «stato»")
  })

  test("un piano che lo schema rifiuta porta i suoi problemi, e quando lo schema lo accetta diventa valido e si risolve", async () => {
    const schemi = await schemiDiProva()
    const a = await avviaAmbiente({ schemi }, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    const ascolto = await ascolta(a)
    await writeFile(join(a.archivio, "video", "v", "piano.json"), JSON.stringify({ ...piano(), novita: 1 }))
    await arriva(ascolto, { tipo: "video", slug: "v", cosa: "piano" })
    expect((await dettaglio(a, "v")).corpo.problemi.piano.join(" ")).toContain("«novita» non è una chiave ammessa")
    expect((await dettaglio(a, "v")).corpo.piano_risolto_da_base).toBeNull()

    const risolvi = (await righeDelFinto(a)).filter((r) => r === "inizio risolvi v").length
    await cambiaSchema(schemi, "piano", (proprieta) => {
      proprieta["novita"] = { type: "number" }
    })
    await aspetta(async () => (await dettaglio(a, "v")).corpo.piano_risolto_da_base !== null)
    expect((await dettaglio(a, "v")).corpo.problemi.piano).toEqual([])
    await aspetta(async () => (await righeDelFinto(a)).filter((r) => r === "inizio risolvi v").length > risolvi)
    ascolto.chiudi()
  })

  test("la scheda di un file del girato rifiutata dallo schema si vede, e con lo schema nuovo entra", async () => {
    const schemi = await schemiDiProva()
    const a = await avviaAmbiente({ schemi }, async (c) => scriviGrezzo(c, "2026-10-06/a.mp4", "x", { tipo: "ripresa", origine: "telefono", durata: 2, soggetto: "orto" }))
    const file = async () => (await chiama<{ file: { nome: string; scheda: unknown; scheda_problemi: string[] }[] }[]>(a, "GET", "/api/grezzo")).corpo[0]!.file[0]!
    expect((await file()).scheda).toBeNull()
    expect((await file()).scheda_problemi.join(" ")).toContain("«soggetto» non è una chiave ammessa")

    const ascolto = await ascolta(a)
    await cambiaSchema(schemi, "grezzo", (proprieta) => {
      proprieta["soggetto"] = { type: "string" }
    })
    await aspetta(async () => (await file()).scheda !== null)
    expect((await file()).scheda_problemi).toEqual([])
    await arriva(ascolto, { tipo: "grezzo" })
    ascolto.chiudi()
  })

  test("uno schema che non è JSON non ferma il server: resta in uso l'ultimo buono, e corretto si ricarica", async () => {
    const schemi = await schemiDiProva()
    const a = await avviaAmbiente({ schemi }, async (c) => scriviVideo(c, "v"))
    await writeFile(join(schemi, "scheda.schema.json"), "{ rotto")
    await Bun.sleep(300)
    expect((await chiama(a, "GET", "/api/video/v")).stato).toBe(200)
    expect((await chiama(a, "PATCH", "/api/video/v/scheda", { stato: "pronto" })).stato).toBe(200)
    expect((await chiama(a, "PATCH", "/api/video/v/scheda", { stato: "inventato" })).stato).toBe(400)

    await writeFile(join(schemi, "scheda.schema.json"), "{ \"type\": \"object\", \"properties\": { \"titolo\": { \"type\": \"number\" } } }")
    await aspetta(async () => (await chiama<{ errore: string }>(a, "PATCH", "/api/video/v/scheda", { titolo: "non è un numero" })).stato === 400)
    const originale = await readFile(join(REPO, "motore", "schemi", "scheda.schema.json"), "utf-8")
    await writeFile(join(schemi, "scheda.schema.json"), originale)
    await aspetta(async () => (await chiama(a, "PATCH", "/api/video/v/scheda", { titolo: "Di nuovo testo" })).stato === 200)
  })
})

describe("il profilo", () => {
  test("un profilo che cambia entra; uno che non passa lo schema lascia quello di prima", async () => {
    const a = await avviaAmbiente()
    const file = join(a.radice, "profilo.json")
    await writeFile(file, JSON.stringify({ creator: { nome: "Prova", lingua: "it" } }))
    await aspetta(() => (a.server.indice.profilo.valore["creator"] as { nome?: string } | undefined)?.nome === "Prova")

    await writeFile(file, JSON.stringify({ creator: { nome: "Cambiato", lingua: 5 }, inventato: true }))
    await Bun.sleep(300)
    expect((a.server.indice.profilo.valore["creator"] as { nome?: string }).nome).toBe("Prova")

    await writeFile(file, "{ rotto")
    await Bun.sleep(300)
    expect((a.server.indice.profilo.valore["creator"] as { nome?: string }).nome).toBe("Prova")

    await writeFile(file, JSON.stringify({ creator: { nome: "Cambiato", lingua: "it" } }))
    await aspetta(() => (a.server.indice.profilo.valore["creator"] as { nome?: string }).nome === "Cambiato")
  })

  const statoDelProfilo = (a: Ambiente, lingua?: "it" | "en") => chiama<{ valido: boolean; presente: boolean; canali: Array<{ piattaforma: string; nome?: string }>; profilo: Record<string, unknown>; problemi: string[] }>(a, "GET", "/api/profilo", undefined, lingua)

  test("il server parte anche con un profilo che lo schema non ammette: dice cosa correggere, nelle due lingue, e non riscrive il file", async () => {
    const rotto = JSON.stringify({ creator: { nome: "Prova", lingua: 5 }, inventato: true })
    const a = await avviaAmbiente({}, async (c) => writeFile(join(c.radice, "profilo.json"), rotto))
    const ascolto = await ascolta(a)

    const it = (await statoDelProfilo(a)).corpo
    expect(it.valido).toBe(false)
    expect(it.presente).toBe(true)
    expect(it.problemi.join(" ")).toContain("La lingua del creator deve essere un testo")
    expect((await statoDelProfilo(a, "en")).corpo.problemi.join(" ")).toContain("The creator's language must be")
    expect((await chiama(a, "GET", "/api/motori")).corpo).toEqual({})

    const scrittura = await chiama<{ errore: string }>(a, "PUT", "/api/motori", { sagoma: { attiva: false } })
    expect(scrittura.stato).toBe(409)
    expect(scrittura.corpo.errore).toContain("profilo.json")
    expect(await readFile(join(a.radice, "profilo.json"), "utf-8")).toBe(rotto)

    await writeFile(join(a.radice, "profilo.json"), JSON.stringify({ creator: { nome: "Sistemato", lingua: "it" } }))
    await arriva(ascolto, { tipo: "profilo" })
    await aspetta(async () => (await statoDelProfilo(a)).corpo.valido)
    expect((await statoDelProfilo(a)).corpo.problemi).toEqual([])
    expect((await chiama(a, "PUT", "/api/motori", { sagoma: { attiva: false } })).stato).toBe(200)
    ascolto.chiudi()
  })

  test("a server acceso un profilo che non passa lo schema si vede, e tornando a quello di prima l'avviso sparisce", async () => {
    const a = await avviaAmbiente()
    const file = join(a.radice, "profilo.json")
    const buono = JSON.stringify({ creator: { nome: "Prova", lingua: "it" }, canali: [{ piattaforma: "instagram", nome: "fondazione.esempio", formato: "verticale" }] })
    expect((await statoDelProfilo(a)).corpo).toEqual({ valido: true, presente: false, canali: [], profilo: {}, problemi: [] })
    await writeFile(file, buono)
    await aspetta(() => (a.server.indice.profilo.valore["creator"] as { nome?: string } | undefined)?.nome === "Prova")
    expect((await statoDelProfilo(a)).corpo.presente).toBe(true)
    expect((await statoDelProfilo(a)).corpo.canali).toEqual([{ piattaforma: "instagram", nome: "fondazione.esempio" }])

    await writeFile(file, "{ rotto")
    await aspetta(async () => !(await statoDelProfilo(a)).corpo.valido)
    expect((a.server.indice.profilo.valore["creator"] as { nome?: string }).nome).toBe("Prova")

    await writeFile(file, buono)
    await aspetta(async () => (await statoDelProfilo(a)).corpo.valido)
  })
})

describe("i materiali e le scene", () => {
  test("un file nuovo in materiali/ si annuncia e compare nel dettaglio", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "v"))
    const ascolto = await ascolta(a)
    await mkdir(join(a.archivio, "video", "v", "materiali"), { recursive: true })
    await writeFile(join(a.archivio, "video", "v", "materiali", "copione.md"), "testo")
    await arriva(ascolto, { tipo: "video", slug: "v", cosa: "materiali" })
    expect((await dettaglio(a, "v")).corpo.materiali.map((m) => m.file)).toEqual(["video/v/materiali/copione.md"])
    ascolto.chiudi()
  })

  test("l'elenco delle scene cambia quando cambia una scena, e lo studio ne è avvisato", async () => {
    const cartella = await mkdtemp(join(tmpdir(), "mango-animazioni-"))
    cartelleProprie.push(cartella)
    await mkdir(join(cartella, "src", "scene"), { recursive: true })
    await writeFile(join(cartella, "elenco.json"), JSON.stringify({ v: [{ sigla: "a", titolo: "A", durata: 3 }] }))
    const comando = [process.execPath, "-e", `process.stdout.write(require("node:fs").readFileSync(${JSON.stringify(join(cartella, "elenco.json"))}, "utf8"))`]
    const a = await avviaAmbiente({ animazioni: { cartella, comando } })
    const ascolto = await ascolta(a)
    expect(Object.values((await chiama<Record<string, unknown[]>>(a, "GET", "/api/animazioni")).corpo)[0]).toHaveLength(1)

    await writeFile(join(cartella, "elenco.json"), JSON.stringify({ v: [{ sigla: "a", titolo: "A", durata: 3 }, { sigla: "b", titolo: "B", durata: 2 }] }))
    await writeFile(join(cartella, "src", "scene", "b.tsx"), "export {}")
    await arriva(ascolto, { tipo: "animazioni" })
    expect(Object.values((await chiama<Record<string, unknown[]>>(a, "GET", "/api/animazioni")).corpo)[0]).toHaveLength(2)
    ascolto.chiudi()
  })

  test("le scene del creator si vedono anche se la loro cartella nasce dopo l'avvio", async () => {
    const cartella = await mkdtemp(join(tmpdir(), "mango-animazioni-"))
    cartelleProprie.push(cartella)
    await writeFile(join(cartella, "elenco.json"), JSON.stringify({}))
    const comando = [process.execPath, "-e", `process.stdout.write(require("node:fs").readFileSync(${JSON.stringify(join(cartella, "elenco.json"))}, "utf8"))`]
    const a = await avviaAmbiente({ animazioni: { cartella: join(cartella, "prodotto"), comando } })
    const ascolto = await ascolta(a)
    expect((await chiama(a, "GET", "/api/animazioni")).corpo).toEqual({})
    await writeFile(join(cartella, "elenco.json"), JSON.stringify({ v: [{ sigla: "c", titolo: "C", durata: 4 }] }))
    await mkdir(join(a.radice, "animazioni", "scene", "v"), { recursive: true })
    await writeFile(join(a.radice, "animazioni", "scene", "v", "c.tsx"), "export {}")
    await arriva(ascolto, { tipo: "animazioni" })
    expect(Object.values((await chiama<Record<string, unknown[]>>(a, "GET", "/api/animazioni")).corpo)[0]).toHaveLength(1)
    ascolto.chiudi()
  })
})
