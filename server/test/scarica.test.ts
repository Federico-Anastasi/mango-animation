import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { aspetta, avviaConScarico, chiama, chiamateDelFintoYtdlp, fermaTutti, scriviFintoYtdlp, scriviGrezzo, type Ambiente } from "./aiuti"

let finto: { comando: string[]; video: string }
let cartellaDelFinto: string

beforeAll(async () => {
  cartellaDelFinto = await mkdtemp(join(tmpdir(), "mango-animation-finto-ytdlp-"))
  finto = await scriviFintoYtdlp(cartellaDelFinto)
})

afterAll(() => rm(cartellaDelFinto, { recursive: true, force: true }))
afterEach(fermaTutti)

interface Lavori {
  in_corso: { id: string; comando: string } | null
  in_coda: { id: string; comando: string }[]
  finiti: { id: string; comando: string; esito: string; errore: string | null; righe: string[] }[]
}

const lavori = async (a: Ambiente): Promise<Lavori> => (await chiama<Lavori>(a, "GET", "/api/lavori")).corpo
const finito = async (a: Ambiente, id: string): Promise<Lavori["finiti"][number]> => aspetta(async () => (await lavori(a)).finiti.find((f) => f.id === id))
const scarica = (a: Ambiente, corpo: unknown) => chiama<{ id: string; errore?: string }>(a, "POST", "/api/grezzo/scarica", corpo)
const nelGrezzo = async (a: Ambiente, giorno = "2026-10-06"): Promise<string[]> => (await readdir(join(a.archivio, "grezzo", giorno)).catch(() => [])).sort()
const scheda = async (a: Ambiente, file: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(join(a.archivio, "grezzo", `${file}.scheda.json`), "utf-8")) as Record<string, unknown>
const parametriDi = (chiamata: string[], opzione: string): string | undefined => chiamata[chiamata.indexOf(opzione) + 1]
const avanzi = async (a: Ambiente): Promise<string[]> => readdir(join(a.archivio, "arrivi", ".scarichi")).catch(() => [])

describe("POST /api/grezzo/scarica", () => {
  test("scarica un video intero in grezzo/<oggi>/, con la sua scheda e senza lasciare avanzi", async () => {
    const a = await avviaConScarico(finto)
    const r = await scarica(a, { url: "https://esempio.test/ok", nome: "keynote" })
    expect(r.stato).toBe(202)
    const fine = await finito(a, r.corpo.id)
    expect(fine).toMatchObject({ comando: "scarica", esito: "riuscito", errore: null })
    expect(fine.righe.at(-1)).toBe("Scaricato: 2026-10-06/keynote.mp4")

    expect(await nelGrezzo(a)).toEqual(["keynote.mp4", "keynote.mp4.scheda.json"])
    expect(await scheda(a, "2026-10-06/keynote.mp4")).toMatchObject({
      tipo: "altro",
      origine: "scaricato",
      arrivato: "2026-10-06T22:28:01",
      url: "https://esempio.test/ok",
      titolo: "Keynote: L'AI è qui!",
      canale: "Apple",
      largo: 320,
      alto: 240,
    })
    expect(await scheda(a, "2026-10-06/keynote.mp4")).not.toHaveProperty("tratto")
    expect(await avanzi(a)).toEqual([])

    const [chiamata] = await chiamateDelFintoYtdlp(a.radice)
    expect(chiamata).not.toContain("--download-sections")
    expect(chiamata!.at(-1)).toBe("https://esempio.test/ok")
    const elenco = (await chiama<{ file: { nome: string; scheda: { origine: string } | null }[] }[]>(a, "GET", "/api/grezzo")).corpo
    expect(elenco[0]?.file.find((f) => f.nome === "keynote.mp4")?.scheda?.origine).toBe("scaricato")
  })

  test("passa a yt-dlp solo il tratto chiesto, in secondi o mm:ss, e lo scrive nella scheda", async () => {
    const a = await avviaConScarico(finto)
    await finito(a, (await scarica(a, { url: "https://esempio.test/ok", da: "1:30", a: 100.5, nome: "uno" })).corpo.id)
    await finito(a, (await scarica(a, { url: "https://esempio.test/ok", da: "0:00:10", nome: "due" })).corpo.id)
    await finito(a, (await scarica(a, { url: "https://esempio.test/ok", a: "45", nome: "tre" })).corpo.id)

    const chiamate = await chiamateDelFintoYtdlp(a.radice)
    expect(chiamate.map((c) => parametriDi(c, "--download-sections"))).toEqual(["*90-100.5", "*10-inf", "*0-45"])
    for (const c of chiamate) expect(c).toContain("--force-keyframes-at-cuts")
    expect((await scheda(a, "2026-10-06/uno.mp4"))["tratto"]).toEqual({ da: 90, a: 100.5 })
    expect((await scheda(a, "2026-10-06/due.mp4"))["tratto"]).toEqual({ da: 10 })
    expect((await scheda(a, "2026-10-06/tre.mp4"))["tratto"]).toEqual({ da: 0, a: 45 })
  })

  test("formato e altezza massima vengono dallo stile", async () => {
    const a = await avviaConScarico(finto)
    await finito(a, (await scarica(a, { url: "https://esempio.test/ok", nome: "x" })).corpo.id)
    const [chiamata] = await chiamateDelFintoYtdlp(a.radice)
    const selettore = parametriDi(chiamata!, "-f")!
    expect(selettore).toContain("height<=?1080")
    expect(selettore).toContain("vcodec^=?avc1")
    expect(selettore).toContain("acodec^=?mp4a")
    expect(parametriDi(chiamata!, "--merge-output-format")).toBe("mp4")
    expect(chiamata).toContain("--no-playlist")
  })

  test("un nome già preso non si sovrascrive; senza nome lo dà il titolo, o l'identificativo del video", async () => {
    const a = await avviaConScarico(finto, {}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/keynote.mp4", "originale", { tipo: "altro", origine: "altro" })
    })
    await finito(a, (await scarica(a, { url: "https://esempio.test/ok", nome: "keynote.mp4" })).corpo.id)
    await finito(a, (await scarica(a, { url: "https://esempio.test/ok" })).corpo.id)
    await finito(a, (await scarica(a, { url: "https://esempio.test/senza-titolo" })).corpo.id)

    expect(await nelGrezzo(a)).toEqual([
      "keynote-2.mp4",
      "keynote-2.mp4.scheda.json",
      "keynote-l-ai-e-qui.mp4",
      "keynote-l-ai-e-qui.mp4.scheda.json",
      "keynote.mp4",
      "keynote.mp4.scheda.json",
      "xyz789.mp4",
      "xyz789.mp4.scheda.json",
    ])
    expect(await readFile(join(a.archivio, "grezzo", "2026-10-06", "keynote.mp4"), "utf-8")).toBe("originale")
  })

  test("un nome con cartelle o simboli vietati diventa un nome di file semplice", async () => {
    const a = await avviaConScarico(finto)
    await finito(a, (await scarica(a, { url: "https://esempio.test/ok", nome: "../../fuori: dove?.mov" })).corpo.id)
    expect(await nelGrezzo(a)).toEqual(["fuori_ dove_.mp4", "fuori_ dove_.mp4.scheda.json"])
  })

  test("un indirizzo o un tratto che non vanno sono 400, e niente va in coda", async () => {
    const a = await avviaConScarico(finto)
    const sbagliate: [unknown, string][] = [
      [{}, "url"],
      [{ url: "keynote" }, "indirizzo"],
      [{ url: "file:///c:/segreto.mp4" }, "http"],
      [{ url: "https://esempio.test/ok", da: "abc" }, "«da»"],
      [{ url: "https://esempio.test/ok", da: -3 }, "«da»"],
      [{ url: "https://esempio.test/ok", a: "1:99" }, "«a»"],
      [{ url: "https://esempio.test/ok", da: 50, a: 50 }, "dopo"],
      [{ url: "https://esempio.test/ok", da: "2:00", a: 60 }, "dopo"],
      [{ url: "https://esempio.test/ok", nome: 7 }, "«nome»"],
      [{ url: "https://esempio.test/ok", inizio: 3 }, "inizio"],
      [[], "oggetto"],
    ]
    for (const [corpo, parola] of sbagliate) {
      const r = await scarica(a, corpo)
      expect([JSON.stringify(corpo), r.stato]).toEqual([JSON.stringify(corpo), 400])
      expect(r.corpo.errore).toContain(parola)
    }
    const lista = await lavori(a)
    expect([lista.in_corso, lista.in_coda, lista.finiti]).toEqual([null, [], []])
    expect(await chiamateDelFintoYtdlp(a.radice)).toEqual([])
  })

  test("senza yt-dlp dice come installarlo e non mette niente in coda", async () => {
    const a = await avviaConScarico(finto, { ytdlp: null })
    const r = await scarica(a, { url: "https://esempio.test/ok" })
    expect(r.stato).toBe(409)
    expect(r.corpo.errore).toContain("yt-dlp")
    expect(r.corpo.errore).toContain("NUOVO-COMPUTER")
    expect((await lavori(a)).in_coda).toEqual([])
  })

  test("se yt-dlp fallisce il lavoro è fallito con la sua ultima frase, e nel girato non resta niente", async () => {
    const a = await avviaConScarico(finto)
    const fine = await finito(a, (await scarica(a, { url: "https://esempio.test/rotto", nome: "x" })).corpo.id)
    expect(fine).toMatchObject({ esito: "fallito", errore: "ERROR: [youtube] abc: Video unavailable" })
    expect(await nelGrezzo(a)).toEqual([])
    expect(await avanzi(a)).toEqual([])
  })

  test("se yt-dlp esce con errore senza dire perché: la frase non nomina il programma né il numero, il codice sta nelle righe", async () => {
    const a = await avviaConScarico(finto)
    const fine = await finito(a, (await scarica(a, { url: "https://esempio.test/muto", nome: "x" })).corpo.id)
    expect(fine).toMatchObject({ esito: "fallito", errore: "Lo scarico non è riuscito: guarda le ultime righe del lavoro." })
    expect(fine.righe.at(-1)).toBe("yt-dlp è uscito con codice 3.")
    expect(await nelGrezzo(a)).toEqual([])
  })

  test("se yt-dlp esce bene ma non produce il video, lo dice", async () => {
    const a = await avviaConScarico(finto)
    const fine = await finito(a, (await scarica(a, { url: "https://esempio.test/niente", nome: "x" })).corpo.id)
    expect(fine.esito).toBe("fallito")
    expect(fine.errore).toBe("Lo scarico è finito ma il video non c'è: guarda le ultime righe del lavoro.")
    expect(await nelGrezzo(a)).toEqual([])
  })

  test("uno alla volta: parte dopo il lavoro in corso e, fermato, non lascia né file né avanzi", async () => {
    const a = await avviaConScarico(finto)
    const lento = await scarica(a, { url: "https://esempio.test/lento", nome: "lento" })
    await aspetta(async () => (await chiamateDelFintoYtdlp(a.radice)).length === 1)
    const seguente = await scarica(a, { url: "https://esempio.test/ok", nome: "dopo" })
    expect((await lavori(a)).in_corso?.id).toBe(lento.corpo.id)
    expect((await lavori(a)).in_coda.map((l) => l.id)).toEqual([seguente.corpo.id])
    expect(await chiamateDelFintoYtdlp(a.radice)).toHaveLength(1)

    expect((await chiama(a, "DELETE", `/api/lavori/${lento.corpo.id}`)).corpo).toEqual({ ok: true, esito: "fermato" })
    expect(await finito(a, lento.corpo.id)).toMatchObject({ esito: "fermato", errore: null })
    await finito(a, seguente.corpo.id)
    expect(await nelGrezzo(a)).toEqual(["dopo.mp4", "dopo.mp4.scheda.json"])
    expect(await avanzi(a)).toEqual([])
  })

  test("due richieste uguali, in attesa, sono un lavoro solo", async () => {
    const a = await avviaConScarico(finto)
    const primo = await scarica(a, { url: "https://esempio.test/lento", nome: "lento" })
    await aspetta(async () => (await lavori(a)).in_corso?.id === primo.corpo.id)
    const uno = await scarica(a, { url: "https://esempio.test/ok", da: 5, nome: "x" })
    const due = await scarica(a, { url: "https://esempio.test/ok", da: "0:05", nome: "x" })
    expect(due.corpo.id).toBe(uno.corpo.id)
    await writeFile(join(a.radice, "via-ytdlp"), "")
    await finito(a, uno.corpo.id)
  })

  test("all'avvio toglie gli scarichi lasciati a metà da un server chiuso a forza", async () => {
    const a = await avviaConScarico(finto, {}, async (c) => {
      await mkdir(join(c.archivio, "arrivi", ".scarichi", "vecchio"), { recursive: true })
      await writeFile(join(c.archivio, "arrivi", ".scarichi", "vecchio", "scarico.mp4.part"), "x")
    })
    expect(await avanzi(a)).toEqual([])
  })
})
