import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Parlato, semplifica } from "../src/parlato"
import { avviaAmbiente, chiama, fermaTutti, scriviGrezzo, type Cartelle } from "./aiuti"

afterEach(fermaTutti)

/** Le parole di una frase, mezzo secondo l'una, dal secondo `da`. */
const dire = (frase: string, da = 0): Array<{ p: string; da: number; a: number }> => frase.split(" ").map((p, i) => ({ p, da: da + i * 0.5, a: da + i * 0.5 + 0.4 }))

describe("semplifica", () => {
  test("minuscolo, senza accenti, senza punteggiatura", () => {
    expect(semplifica("L'impasto è GIÀ così, «pronto»!")).toBe("l impasto e gia cosi pronto")
    expect(semplifica("  ")).toBe("")
    expect(semplifica("Perché?")).toBe("perche")
  })
})

describe("cercare nel parlato", () => {
  let cartella = ""
  const percorso = (nome: string): string => join(cartella, `${nome}.json`)
  const scrivi = async (nome: string, contenuto: unknown, tempo?: number): Promise<[string, string]> => {
    const file = percorso(nome)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, typeof contenuto === "string" ? contenuto : JSON.stringify(contenuto))
    if (tempo !== undefined) await utimes(file, tempo, tempo)
    return [nome, file]
  }
  const nuova = async (): Promise<Parlato> => {
    cartella = await mkdtemp(join(tmpdir(), "mango-animation-parlato-"))
    return new Parlato()
  }
  afterEach(() => (cartella ? rm(cartella, { recursive: true, force: true }) : undefined))

  test("trova una frase senza badare a maiuscole e accenti, con il secondo e le parole intorno come sono scritte", async () => {
    const parlato = await nuova()
    const a = await scrivi("a", dire("Oggi vi mostro un impasto semplice: il segreto è la Pazienza, lievita in frigorifero", 10))
    const { risultati, totale, cercati } = await parlato.cerca("SEGRETO E la pazienza", [a], 10)
    expect(totale).toBe(1)
    expect(cercati).toBe(1)
    expect(risultati).toEqual([{ file: "a", da: 13.5, a: 15.4, prima: "Oggi vi mostro un impasto semplice: il", trovato: "segreto è la Pazienza,", dopo: "lievita in frigorifero" }])
  })

  test("l'ultima parola può essere l'inizio di una parola, le altre no", async () => {
    const parlato = await nuova()
    const a = await scrivi("a", dire("il segreto della pazienza"))
    expect((await parlato.cerca("pazien", [a], 10)).totale).toBe(1)
    expect((await parlato.cerca("segreto della pazien", [a], 10)).totale).toBe(1)
    expect((await parlato.cerca("segret della", [a], 10)).totale).toBe(0)
    expect((await parlato.cerca("azienza", [a], 10)).totale).toBe(0)
  })

  test("gli apostrofi separano le parole: «l'impasto» si trova cercando «impasto»", async () => {
    const parlato = await nuova()
    const a = await scrivi("a", dire("Ecco l'impasto pronto"))
    const { risultati } = await parlato.cerca("impasto", [a], 10)
    expect(risultati.map((r) => r.trovato)).toEqual(["l'impasto"])
  })

  test("più risultati: nell'ordine dei file e del tempo, con il totale anche oltre il massimo", async () => {
    const parlato = await nuova()
    const a = await scrivi("2026-11-09/a", dire("pasta e pasta e ancora pasta"))
    const b = await scrivi("2026-11-08/b", dire("la pasta fresca"))
    const tutti = await parlato.cerca("pasta", [a, b], 10)
    expect(tutti.risultati.map((r) => [r.file, r.da])).toEqual([["2026-11-09/a", 0], ["2026-11-09/a", 1], ["2026-11-09/a", 2.5], ["2026-11-08/b", 0.5]])
    const pochi = await parlato.cerca("pasta", [a, b], 2)
    expect(pochi.risultati).toHaveLength(2)
    expect(pochi.totale).toBe(4)
  })

  test("un file che non si legge si conta e non ferma la ricerca; uno muto o che non c'è non è un errore", async () => {
    const parlato = await nuova()
    const buono = await scrivi("buono", dire("una pasta"))
    const rotto = await scrivi("rotto", "{non è json")
    const storto = await scrivi("storto", [{ p: "pasta" }])
    const muto = await scrivi("muto", [])
    const mancante: [string, string] = ["manca", percorso("manca")]
    const r = await parlato.cerca("pasta", [buono, rotto, storto, muto, mancante], 10)
    expect(r.risultati.map((x) => x.file)).toEqual(["buono"])
    expect(r).toMatchObject({ cercati: 2, non_letti: 2 })
  })

  test("un file che cambia si rilegge alla ricerca dopo; uno che non cambia no", async () => {
    const parlato = await nuova()
    const a = await scrivi("a", dire("prima versione"), 1_700_000_000)
    expect((await parlato.cerca("seconda", [a], 10)).totale).toBe(0)
    await scrivi("a", dire("ecco la seconda versione"), 1_700_000_100)
    expect((await parlato.cerca("seconda", [a], 10)).totale).toBe(1)
    expect((await parlato.cerca("prima", [a], 10)).totale).toBe(0)
  })

  test("le parole cercate non sono nel parlato di nessuno: risultati vuoti e totale zero; senza lettere non si cerca", async () => {
    const parlato = await nuova()
    const a = await scrivi("a", dire("niente di speciale"))
    expect(await parlato.cerca("tiramisù", [a], 10)).toMatchObject({ risultati: [], totale: 0, cercati: 1 })
    expect(await parlato.cerca("?!", [a], 10)).toMatchObject({ risultati: [], totale: 0, cercati: 0 })
  })
})

const parole = (file: string, giorno: string): string => join(giorno, file, "parole.json")

async function seminaParlato(c: Cartelle, giorno: string, nome: string, frase: string | null, conGrezzo = true): Promise<void> {
  if (conGrezzo) await scriviGrezzo(c, `${giorno}/${nome}`)
  if (frase === null) return
  const file = join(c.archivio, "preparati", parole(nome, giorno))
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(dire(frase)))
}

describe("GET /api/grezzo/cerca", () => {
  test("cerca nel parlato di tutti i file preparati: dal più recente, col file, il secondo e la frase intorno", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await seminaParlato(c, "2026-11-08", "vecchio.mp4", "Il segreto è la pazienza")
      await seminaParlato(c, "2026-11-09", "nuovo.mp4", "Oggi parliamo di pazienza e di farina")
      await seminaParlato(c, "2026-11-09", "altro.mp4", "Questo non c'entra")
      await seminaParlato(c, "2026-11-09", "non-preparato.mp4", null)
      await seminaParlato(c, "2026-11-07", "senza-grezzo.mp4", "La pazienza di un file che non c'è più", false)
    })
    const r = await chiama<{ q: string; risultati: Array<{ file: string; da: number; a: number; prima: string; trovato: string; dopo: string }>; totale: number; cercati: number; non_letti: number }>(a, "GET", `/api/grezzo/cerca?q=${encodeURIComponent("PAZIENZA")}`)
    expect(r.stato).toBe(200)
    expect(r.corpo).toEqual({
      q: "PAZIENZA",
      risultati: [
        { file: "2026-11-09/nuovo.mp4", da: 1.5, a: 1.9, prima: "Oggi parliamo di", trovato: "pazienza", dopo: "e di farina" },
        { file: "2026-11-08/vecchio.mp4", da: 2, a: 2.4, prima: "Il segreto è la", trovato: "pazienza", dopo: "" },
      ],
      totale: 2,
      cercati: 3,
      non_letti: 0,
    })
  })

  test("una frase di più parole con accenti e un'ultima parola a metà", async () => {
    const a = await avviaAmbiente({}, async (c) => seminaParlato(c, "2026-11-09", "a.mp4", "Perché lievita così in fretta"))
    const r = await chiama<{ risultati: Array<{ trovato: string }> }>(a, "GET", `/api/grezzo/cerca?q=${encodeURIComponent("perche lievita cosi in fre")}`)
    expect(r.corpo.risultati.map((x) => x.trovato)).toEqual(["Perché lievita così in fretta"])
  })

  test("senza almeno due lettere è 400 con la frase nella lingua dello studio", async () => {
    const a = await avviaAmbiente()
    for (const q of ["", "a", "?!"]) {
      const r = await chiama<{ errore: string }>(a, "GET", `/api/grezzo/cerca?q=${encodeURIComponent(q)}`)
      expect(r.stato).toBe(400)
      expect(r.corpo.errore).toBe("Scrivi almeno due lettere da cercare nel parlato.")
    }
    expect((await chiama<{ errore: string }>(a, "GET", "/api/grezzo/cerca", undefined, "en")).corpo.errore).toBe("Write at least two letters to search for in the speech.")
  })

  test("un file di cui il parlato si rovina si conta fra quelli che non si leggono", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await seminaParlato(c, "2026-11-09", "bello.mp4", "una pasta")
      await seminaParlato(c, "2026-11-09", "rotto.mp4", "x")
      await writeFile(join(c.archivio, "preparati", parole("rotto.mp4", "2026-11-09")), "{non è json")
    })
    const r = await chiama<{ risultati: unknown[]; cercati: number; non_letti: number }>(a, "GET", "/api/grezzo/cerca?q=pasta")
    expect(r.corpo).toMatchObject({ cercati: 1, non_letti: 1 })
    expect(r.corpo.risultati).toHaveLength(1)
  })
})

describe("la velocità su un archivio grande", () => {
  test("300 file da 1.500 parole: la prima ricerca li legge tutti, le altre rispondono dalla memoria", async () => {
    const lessico = Array.from({ length: 2000 }, (_, i) => `parola${i.toString(36)}`)
    const a = await avviaAmbiente({}, async (c) => {
      for (let n = 0; n < 300; n++) {
        const giorno = `2026-10-${String((n % 28) + 1).padStart(2, "0")}`
        const frase = Array.from({ length: 1500 }, (_, i) => lessico[(n * 31 + i * 7) % lessico.length]!)
        if (n === 150) frase.splice(700, 0, "il", "segreto", "è", "la", "pazienza")
        await seminaParlato(c, giorno, `ripresa-${n}.mp4`, frase.join(" "))
      }
    })
    const cerca = async (q: string) => {
      const inizio = performance.now()
      const r = await chiama<{ risultati: Array<{ file: string }>; totale: number; cercati: number }>(a, "GET", `/api/grezzo/cerca?q=${encodeURIComponent(q)}`)
      return { ms: performance.now() - inizio, ...r.corpo }
    }
    const prima = await cerca("il segreto è la pazienza")
    expect(prima.cercati).toBe(300)
    expect(prima.risultati.map((r) => r.file)).toEqual([`2026-10-${String((150 % 28) + 1).padStart(2, "0")}/ripresa-150.mp4`])
    const seconda = await cerca("segreto è la pazien")
    expect(seconda.totale).toBe(1)
    const tante = await cerca("parola1")
    expect(tante.totale).toBeGreaterThan(100)
    expect(tante.risultati).toHaveLength(100)
    console.log(`ricerca nel parlato, 300 file da 1.500 parole: prima ${prima.ms.toFixed(0)} ms, poi ${seconda.ms.toFixed(0)} ms, con 100 risultati ${tante.ms.toFixed(0)} ms`)
    expect(seconda.ms).toBeLessThan(1000)
    expect(prima.ms).toBeLessThan(15000)
  }, 120_000)
})
