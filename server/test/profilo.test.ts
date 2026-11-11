import { afterEach, describe, expect, test } from "bun:test"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { ascolta, aspetta, avviaAmbiente, chiama, fermaTutti } from "./aiuti"

afterEach(fermaTutti)

interface StatoProfilo {
  valido: boolean
  presente: boolean
  profilo: Record<string, unknown>
  problemi: string[]
  errore?: string
}

const letto = async (radice: string) => JSON.parse(await readFile(join(radice, "profilo.json"), "utf-8")) as Record<string, unknown>

describe("il profilo dal pannello Impostazioni", () => {
  test("la lettura dà le sezioni del creator e non quelle del computer", async () => {
    const a = await avviaAmbiente()
    await writeFile(join(a.radice, "profilo.json"), JSON.stringify({ creator: { nome: "Anna", lingua: "it" }, canali: [{ piattaforma: "tiktok", nome: "annavideo", formato: "verticale" }], macchina: { scheda_video: 1 }, motori: { sagoma: { attiva: false } } }))
    await aspetta(async () => (await chiama<StatoProfilo>(a, "GET", "/api/profilo")).corpo.presente)
    const { corpo } = await chiama<StatoProfilo>(a, "GET", "/api/profilo")
    expect(corpo.profilo).toEqual({ creator: { nome: "Anna", lingua: "it" }, canali: [{ piattaforma: "tiktok", nome: "annavideo", formato: "verticale" }] })
  })

  test("senza profilo la scrittura lo crea; il resto del profilo resta com'è e lo studio ne è avvisato", async () => {
    const a = await avviaAmbiente()
    const ascolto = await ascolta(a)
    const creato = await chiama<StatoProfilo>(a, "PUT", "/api/profilo", { creator: { nome: "Anna", lingua: "it" } })
    expect(creato).toMatchObject({ stato: 200, corpo: { valido: true, presente: true, profilo: { creator: { nome: "Anna", lingua: "it" } } } })
    expect(await letto(a.radice)).toEqual({ versione: 1, creator: { nome: "Anna", lingua: "it" } })
    await aspetta(() => ascolto.messaggi.some((m) => m.tipo === "profilo"))

    await chiama(a, "PUT", "/api/motori", { sagoma: { attiva: false } })
    await writeFile(join(a.radice, "profilo.json"), JSON.stringify({ ...(await letto(a.radice)), macchina: { scheda_video: 1 }, fonti_delle_idee: [{ percorso: "D:\\progetti" }] }))
    await aspetta(() => (a.server.indice.profilo.valore["macchina"] as object | undefined) !== undefined)
    const nuove = { creator: { nome: "Anna B", lingua: "en" }, non_si_dice: ["parolacce"], canali: [{ piattaforma: "youtube", nome: "anna" }] }
    expect((await chiama(a, "PUT", "/api/profilo", nuove)).stato).toBe(200)
    expect(await letto(a.radice)).toEqual({ versione: 1, ...nuove, macchina: { scheda_video: 1 }, fonti_delle_idee: [{ percorso: "D:\\progetti" }], motori: { sagoma: { attiva: false } } })
    ascolto.chiudi()
  })

  test("una sezione a null si toglie dal profilo", async () => {
    const a = await avviaAmbiente()
    await chiama(a, "PUT", "/api/profilo", { creator: { nome: "Anna" }, pubblico: { livello: "non tecnico" }, non_si_dice: ["parolacce"] })
    const tolta = await chiama<StatoProfilo>(a, "PUT", "/api/profilo", { pubblico: null, non_si_dice: null })
    expect(tolta.corpo.profilo).toEqual({ creator: { nome: "Anna" } })
    expect(await letto(a.radice)).toEqual({ versione: 1, creator: { nome: "Anna" } })
  })

  test("ciò che lo schema non ammette si rifiuta con la frase nella lingua di chi chiede, e il file non cambia", async () => {
    const a = await avviaAmbiente()
    await chiama(a, "PUT", "/api/profilo", { creator: { nome: "Anna", lingua: "it" } })
    const prima = await readFile(join(a.radice, "profilo.json"), "utf-8")
    for (const [corpo, frase] of [
      [{ creator: { nome: "" } }, /Il nome del creator non può essere vuoto/],
      [{ creator: { nome: "Anna", lingua: "italiano" } }, /La lingua del creator deve essere un codice di due lettere/],
      [{ canali: [{ piattaforma: "myspace" }] }, /La piattaforma del canale 1 non va bene/],
      [{ canali: [{ nome: "senza piattaforma" }] }, /Manca la piattaforma del canale 1/],
    ] as const) {
      const r = await chiama<{ errore: string; problemi: string[] }>(a, "PUT", "/api/profilo", corpo)
      expect(r.stato).toBe(400)
      expect(r.corpo.errore).toMatch(/^Il profilo non è valido/)
      expect(r.corpo.errore).toMatch(frase)
      expect(r.corpo.problemi.length).toBeGreaterThan(0)
    }
    expect((await chiama<{ errore: string }>(a, "PUT", "/api/profilo", { creator: { nome: "" } }, "en")).corpo.errore).toMatch(/^The profile is not valid/)
    expect((await chiama<{ errore: string }>(a, "PUT", "/api/profilo", [1])).stato).toBe(400)
    expect(await readFile(join(a.radice, "profilo.json"), "utf-8")).toBe(prima)
  })

  test("da qui non si cambiano i motori, la macchina o la versione", async () => {
    const a = await avviaAmbiente()
    for (const corpo of [{ motori: { sagoma: { attiva: false } } }, { macchina: { scheda_video: 0 } }, { versione: 1 }]) {
      const r = await chiama<{ errore: string }>(a, "PUT", "/api/profilo", corpo)
      expect(r.stato).toBe(400)
      expect(r.corpo.errore).toContain("Da qui si cambiano solo")
    }
    expect(await Bun.file(join(a.radice, "profilo.json")).exists()).toBe(false)
  })

  test("con un profilo che non passa lo schema la scrittura risponde 409 e non lo sostituisce", async () => {
    const rotto = JSON.stringify({ creator: { nome: "Prova", lingua: 5 } })
    const a = await avviaAmbiente({}, async (c) => writeFile(join(c.radice, "profilo.json"), rotto))
    const r = await chiama<StatoProfilo & { errore: string }>(a, "PUT", "/api/profilo", { creator: { nome: "Nuovo" } })
    expect(r.stato).toBe(409)
    expect(r.corpo.errore).toContain("profilo.json")
    expect(await readFile(join(a.radice, "profilo.json"), "utf-8")).toBe(rotto)
  })
})
