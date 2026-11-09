import { afterEach, describe, expect, test } from "bun:test"
import { readFile, readdir, stat, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { aspetta, avviaAmbiente, chiama, fermaTutti, piano, scriviGrezzo, scriviVideo } from "./aiuti"

afterEach(fermaTutti)

interface Dettaglio {
  slug: string
  cartella: string
  scheda: { titolo: string; stato: string }
  piano: Record<string, unknown> | null
  piano_risolto_da_base: Record<string, unknown> | null
  risolto: { durata: number } | null
  risolto_aggiornato: boolean
  controllo: unknown
  uscite: { file: string; byte: number; cambiato: string; stesso_file: string | null }[]
  materiali: { file: string; byte: number }[]
  puo_annullare: boolean
  puo_rifare: boolean
  lavoro: { id: string; comando: string; stato: string } | null
  piano_cambiato: string | null
  piano_dopo_montato: boolean
}
interface Errore {
  errore: string
  problemi?: string[]
}

const leggiPiano = async (a: { archivio: string }, slug: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(join(a.archivio, "video", slug, "piano.json"), "utf-8"))

describe("video", () => {
  test("crea un video con un titolo: nasce la cartella con la scheda, e lo slug viene dal titolo", async () => {
    const a = await avviaAmbiente()
    const r = await chiama<{ slug: string }>(a, "POST", "/api/video", { titolo: "La lampada a LED: 8 watt in meno" })
    expect(r.stato).toBe(201)
    expect(r.corpo.slug).toBe("la-lampada-a-led-8-watt-in-meno")
    const scheda = JSON.parse(await readFile(join(a.archivio, "video", r.corpo.slug, "scheda.json"), "utf-8"))
    expect(scheda).toMatchObject({ titolo: "La lampada a LED: 8 watt in meno", stato: "proposta" })
    expect(scheda.creato).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const seconda = await chiama<{ slug: string }>(a, "POST", "/api/video", { titolo: "La lampada a LED: 8 watt in meno" })
    expect(seconda.corpo.slug).toBe("la-lampada-a-led-8-watt-in-meno-2")
  })

  test("con un elenco di file nasce un piano girato-pieno con un pezzo per file", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/20261006-222801-IMG_5106.MOV")
      await scriviGrezzo(c, "2026-10-06/altro.mp4")
    })
    const r = await chiama<{ slug: string }>(a, "POST", "/api/video", { titolo: "Due file", slug: "due-file", stato: "in lavorazione", grezzo: ["2026-10-06/20261006-222801-IMG_5106.MOV", "2026-10-06/altro.mp4"] })
    expect(r.stato).toBe(201)
    expect(await leggiPiano(a, "due-file")).toEqual({
      quadro: "girato-pieno",
      sorgenti: { "img-5106": { file: "2026-10-06/20261006-222801-IMG_5106.MOV" }, altro: { file: "2026-10-06/altro.mp4" } },
      scene: [{ nome: "scena", pezzi: [{ sorgente: "img-5106" }, { sorgente: "altro" }] }],
    })
    const d = await chiama<Dettaglio>(a, "GET", "/api/video/due-file")
    expect(d.corpo.scheda.stato).toBe("in lavorazione")
  })

  test("crea un carosello: la scheda ha il formato, nasce come proposta e non ha piano; un formato sconosciuto o un girato su un carosello sono rifiutati", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/altro.mp4")
    })
    const r = await chiama<{ slug: string }>(a, "POST", "/api/video", { titolo: "Quanta acqua serve", formato: "carosello" })
    expect(r.stato).toBe(201)
    const scheda = JSON.parse(await readFile(join(a.archivio, "video", r.corpo.slug, "scheda.json"), "utf-8"))
    expect(scheda).toMatchObject({ titolo: "Quanta acqua serve", stato: "proposta", formato: "carosello" })
    const d = await chiama<Dettaglio>(a, "GET", `/api/video/${r.corpo.slug}`)
    expect([d.corpo.piano, d.corpo.scheda]).toEqual([null, expect.objectContaining({ formato: "carosello" })])
    const video = await chiama<{ slug: string }>(a, "POST", "/api/video", { titolo: "Un video", formato: "video" })
    expect(video.stato).toBe(201)
    expect(JSON.parse(await readFile(join(a.archivio, "video", video.corpo.slug, "scheda.json"), "utf-8"))).toMatchObject({ formato: "video" })
    const storto = await chiama<Errore>(a, "POST", "/api/video", { titolo: "x", formato: "libro" })
    expect(storto.stato).toBe(400)
    const conGirato = await chiama<Errore>(a, "POST", "/api/video", { titolo: "x", formato: "carosello", grezzo: ["2026-10-06/altro.mp4"] })
    expect(conGirato.stato).toBe(400)
    expect(conGirato.corpo.errore).toContain("carosello")
  })

  test("rifiuta: senza titolo, slug storto, slug esistente, file che non c'è, stato sconosciuto", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "esiste")
    })
    expect((await chiama<Errore>(a, "POST", "/api/video", { titolo: "  " })).stato).toBe(400)
    expect((await chiama<Errore>(a, "POST", "/api/video", { titolo: "x", slug: "Storto Slug" })).stato).toBe(400)
    const doppio = await chiama<Errore>(a, "POST", "/api/video", { titolo: "x", slug: "esiste" })
    expect(doppio.stato).toBe(409)
    expect(doppio.corpo.errore).toContain("scegli un altro nome")
    const mancante = await chiama<Errore>(a, "POST", "/api/video", { titolo: "x", grezzo: ["2026-10-06/non-c-e.mp4"] })
    expect(mancante.stato).toBe(400)
    expect(mancante.corpo.errore).toContain("non c'è")
    expect((await chiama<Errore>(a, "POST", "/api/video", { titolo: "x", grezzo: ["../fuori.mp4"] })).stato).toBe(400)
    expect((await chiama<Errore>(a, "POST", "/api/video", { titolo: "x", stato: "boh" })).stato).toBe(400)
    const senzaJson = await fetch(`${a.url}/api/video`, { method: "POST", headers: a.accesso, body: JSON.stringify({ titolo: "x" }) })
    expect(senzaJson.status).toBe(400)
  })

  test("un carosello ha per miniatura la sua prima slide, e la scheda col formato si salva", async () => {
    const scheda = { titolo: "Carosello", stato: "proposta", creato: "2026-10-25", formato: "carosello" }
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "carosello", scheda)
      for (const n of [2, 1, 10]) await Bun.write(join(c.archivio, "video", "carosello", "uscite", `slide-${n}.png`), "png")
    })
    const elenco = await chiama<{ slug: string; miniatura: string | null; durata: number | null }[]>(a, "GET", "/api/video")
    expect(elenco.corpo[0]).toMatchObject({ slug: "carosello", miniatura: "video/carosello/uscite/slide-1.png", durata: null })
    const salvata = await chiama(a, "PUT", "/api/video/carosello/scheda", { ...scheda, titolo: "Carosello nuovo" })
    expect(salvata.stato).toBe(200)
    expect((await chiama<Errore>(a, "PUT", "/api/video/carosello/scheda", { ...scheda, formato: "libro" })).stato).toBe(400)
  })

  test("l'elenco e il dettaglio dicono ciò che c'è: scheda, piano, risolto, uscite, materiali", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "orto", { titolo: "Orto", stato: "pronto", creato: "2026-10-07" }, piano())
      const dentro = join(c.archivio, "video", "orto")
      await Bun.write(join(dentro, "uscite", "finale.mp4"), "video finto")
      await Bun.write(join(dentro, "materiali", "disegni", "uno.png"), "png")
      await Bun.write(join(dentro, "lavoro", "risolto.json"), JSON.stringify({ durata: 61.5 }))
      await Bun.write(join(dentro, "lavoro", "controllo.json"), JSON.stringify({ silenzi: [] }))
    })
    const cartella = join(a.archivio, "video", "orto")

    const elenco = await chiama<{ slug: string; scheda: { titolo: string }; durata: number; miniatura: string | null; ha_piano: boolean; ha_finale: boolean; ultimo_cambio: string }[]>(a, "GET", "/api/video")
    expect(elenco.corpo).toHaveLength(1)
    expect(elenco.corpo[0]).toMatchObject({ slug: "orto", scheda: { titolo: "Orto" }, durata: 61.5, miniatura: null, ha_piano: true, ha_finale: true })
    expect(new Date(elenco.corpo[0]!.ultimo_cambio).getTime()).toBeGreaterThan(0)

    const d = await chiama<Dettaglio>(a, "GET", "/api/video/orto")
    expect(d.stato).toBe(200)
    expect(d.corpo).toMatchObject({
      slug: "orto",
      cartella,
      piano: piano(),
      piano_risolto_da_base: piano(),
      risolto: { durata: 61.5 },
      controllo: { silenzi: [] },
      puo_annullare: false,
      puo_rifare: false,
      lavoro: null,
    })
    expect(d.corpo.uscite).toEqual([{ file: "video/orto/uscite/finale.mp4", byte: 11, cambiato: expect.any(String), stesso_file: null }])
    expect(d.corpo.materiali).toEqual([{ file: "video/orto/materiali/disegni/uno.png", byte: 3 }])
  })

  test("il dettaglio di un video che non c'è, o con lo slug storto, è 404 con la strada", async () => {
    const a = await avviaAmbiente()
    for (const slug of ["non-c-e", "Storto", "a%20b"]) {
      const r = await chiama<Errore>(a, "GET", `/api/video/${slug}`)
      expect(r.stato).toBe(404)
      expect(r.corpo.errore.length).toBeGreaterThan(10)
    }
  })

  test("risolto_aggiornato è falso finché il piano è più nuovo del risolto", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
      await Bun.write(join(c.archivio, "video", "v", "lavoro", "risolto.json"), JSON.stringify({ durata: 3 }))
    })
    expect((await chiama<Dettaglio>(a, "GET", "/api/video/v")).corpo.risolto_aggiornato).toBe(true)
    const nuovo = { ...piano(), coda: 1 }
    expect((await chiama(a, "PUT", "/api/video/v/piano", nuovo)).stato).toBe(200)
    expect((await chiama<Dettaglio>(a, "GET", "/api/video/v")).corpo.risolto_aggiornato).toBe(false)
    await aspetta(async () => (await chiama<Dettaglio>(a, "GET", "/api/video/v")).corpo.risolto_aggiornato)
  })

  test("piano_cambiato e piano_dopo_montato: la data del piano e il confronto con il montato, anche dopo un ricarica", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
      await scriviVideo(c, "senza", undefined, piano())
      const prima = new Date(Date.now() - 60_000)
      await utimes(join(c.archivio, "video", "v", "piano.json"), prima, prima)
      await Bun.write(join(c.archivio, "video", "v", "uscite", "finale.mp4"), "x")
      const dopo = new Date(Date.now() + 60_000)
      await utimes(join(c.archivio, "video", "v", "uscite", "finale.mp4"), dopo, dopo)
    })
    const leggi = async (slug: string) => (await chiama<Dettaglio>(a, "GET", `/api/video/${slug}`)).corpo
    const v = await leggi("v")
    expect(v.piano_dopo_montato).toBe(false)
    expect(Date.now() - Date.parse(v.piano_cambiato!)).toBeGreaterThan(55_000)

    const senza = await leggi("senza")
    expect(senza.piano_dopo_montato).toBe(false)
    expect(senza.piano_cambiato).toEqual(expect.any(String))

    expect((await chiama(a, "PUT", "/api/video/v/piano", { ...piano(), coda: 1 })).stato).toBe(200)
    expect((await leggi("v")).piano_dopo_montato).toBe(false)
    const finale = join(a.archivio, "video", "v", "uscite", "finale.mp4")
    const passato = new Date(Date.now() - 120_000)
    await utimes(finale, passato, passato)
    await aspetta(async () => (await leggi("v")).piano_dopo_montato)
    expect(Date.parse((await leggi("v")).piano_cambiato!)).toBeGreaterThan(Date.now() - 30_000)
  })

  test("piano_dopo_montato col risolto di adesso si confronta per impronta: un piano risalvato uguale non avvisa, uno cambiato sì", async () => {
    const secondi = (s: number): Date => new Date(Date.now() + s * 1000)
    const imposta = async (c: { archivio: string }, slug: string, impronta: unknown, montatoDa: unknown, pianoA: number, finaleA: number) => {
      const cartella = join(c.archivio, "video", slug)
      await scriviVideo(c as never, slug, undefined, piano())
      await utimes(join(cartella, "piano.json"), secondi(pianoA), secondi(pianoA))
      await Bun.write(join(cartella, "uscite", "finale.mp4"), "x")
      await utimes(join(cartella, "uscite", "finale.mp4"), secondi(finaleA), secondi(finaleA))
      await Bun.write(join(cartella, "lavoro", "montaggio.json"), JSON.stringify(montatoDa === undefined ? { fasi: [] } : { uscite: { finale: montatoDa } }))
      await Bun.write(join(cartella, "lavoro", "risolto.json"), JSON.stringify({ durata: 3, ...(impronta === undefined ? {} : { impronta }) }))
    }
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await imposta(c, "uguale", "A", "A", -30, -60)
      await imposta(c, "diverso", "B", "A", -120, -60)
      await imposta(c, "vecchio-nuovo", "B", undefined, -30, -60)
      await imposta(c, "vecchio-quieto", "B", undefined, -120, -60)
    })
    const leggi = async (slug: string) => (await chiama<Dettaglio>(a, "GET", `/api/video/${slug}`)).corpo
    expect((await leggi("uguale")).piano_dopo_montato).toBe(false)
    expect((await leggi("diverso")).piano_dopo_montato).toBe(true)
    expect((await leggi("vecchio-nuovo")).piano_dopo_montato).toBe(true)
    expect((await leggi("vecchio-quieto")).piano_dopo_montato).toBe(false)
  })

  test("PUT scheda: la sostituisce, e rifiuta ciò che lo schema non ammette", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "v")
    })
    const buona = { titolo: "Nuovo titolo", stato: "pubblicato", creato: "2026-10-06", pubblicazioni: [{ canale: "tiktok", data: "2026-10-07T13:15" }] }
    expect((await chiama(a, "PUT", "/api/video/v/scheda", buona)).stato).toBe(200)
    expect((await chiama<Dettaglio>(a, "GET", "/api/video/v")).corpo.scheda).toEqual(buona)
    expect(JSON.parse(await readFile(join(a.archivio, "video", "v", "scheda.json"), "utf-8"))).toEqual(buona)
    const cattiva = await chiama<Errore>(a, "PUT", "/api/video/v/scheda", { titolo: "", stato: "boh", creato: "ieri", inventato: 1 })
    expect(cattiva.stato).toBe(400)
    expect(cattiva.corpo.errore).toContain("stato")
    expect(cattiva.corpo.problemi?.length).toBeGreaterThanOrEqual(3)
    expect((await chiama<Errore>(a, "PUT", "/api/video/non-c-e/scheda", buona)).stato).toBe(404)
  })

  test("PUT scheda: canali, hashtag, pubblicazioni e scaletta come li scrive la scheda dello studio; `canali` vuoto è rifiutato", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "v")
    })
    const scheda = {
      titolo: "Il titolo",
      stato: "pubblicato",
      creato: "2026-10-06",
      canali: ["tiktok", "youtube"],
      hashtag: ["AI", "LLM"],
      pubblicazioni: [{ canale: "tiktok", data: "2026-10-07T13:15", url: "https://esempio.it/1" }, { canale: "youtube", data: "2026-10-09T08:00" }],
      scaletta: [{ apri: "Il sito", fai: "Scegli la scheda", spiega: "Rosso non entra" }, { apri: "Il programma" }],
    }
    expect((await chiama(a, "PUT", "/api/video/v/scheda", scheda)).stato).toBe(200)
    expect((await chiama<Dettaglio>(a, "GET", "/api/video/v")).corpo.scheda).toEqual(scheda)
    for (const storta of [{ ...scheda, canali: [] }, { ...scheda, canali: ["tiktok", "tiktok"] }, { ...scheda, canali: ["snapchat"] }, { ...scheda, scaletta: [{ fai: "Senza apri" }] }, { ...scheda, pubblicazioni: [{ canale: "tiktok" }] }]) {
      expect((await chiama(a, "PUT", "/api/video/v/scheda", storta)).stato).toBe(400)
    }
  })

  test("PATCH scheda: cambia solo i campi dati (JSON Merge Patch), null toglie, e rifiuta ciò che lo schema non ammette", async () => {
    const prima = { titolo: "Il titolo", stato: "proposta", creato: "2026-10-06", proposta: { aggancio: "a", centro: "c" }, hashtag: ["x", "y"] }
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "v", prima)
    })
    const r = await chiama<{ scheda: unknown }>(a, "PATCH", "/api/video/v/scheda", { stato: "pronto", proposta: { centro: "nuovo", aggancio: null }, hashtag: ["z"], didascalia: "d" })
    const dopo = { titolo: "Il titolo", stato: "pronto", creato: "2026-10-06", proposta: { centro: "nuovo" }, hashtag: ["z"], didascalia: "d" }
    expect([r.stato, r.corpo.scheda]).toEqual([200, dopo])
    expect((await chiama<Dettaglio>(a, "GET", "/api/video/v")).corpo.scheda).toEqual(dopo)
    expect(JSON.parse(await readFile(join(a.archivio, "video", "v", "scheda.json"), "utf-8"))).toEqual(dopo)
    const cattiva = await chiama<Errore>(a, "PATCH", "/api/video/v/scheda", { stato: "chiuso", titolo: null })
    expect(cattiva.stato).toBe(400)
    expect(cattiva.corpo.errore).toContain("stato")
    expect(JSON.parse(await readFile(join(a.archivio, "video", "v", "scheda.json"), "utf-8"))).toEqual(dopo)
    expect((await chiama<Errore>(a, "PATCH", "/api/video/v/scheda", ["stato"])).stato).toBe(400)
    expect((await chiama<Errore>(a, "PATCH", "/api/video/non-c-e/scheda", { stato: "pronto" })).stato).toBe(404)
  })

  test("PUT piano: lo salva, tiene la versione di prima in storia/ e mette in coda risolvi", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    const nuovo = { ...piano(), coda: 0.7 }
    const r = await chiama<{ ok: boolean; puo_annullare: boolean; puo_rifare: boolean }>(a, "PUT", "/api/video/v/piano", nuovo)
    expect(r.corpo).toEqual({ ok: true, puo_annullare: true, puo_rifare: false })
    expect(await leggiPiano(a, "v")).toEqual(nuovo)
    expect(JSON.parse(await readFile(join(a.archivio, "video", "v", "storia", "1.json"), "utf-8"))).toEqual(piano())
    await aspetta(async () => (await readFile(join(a.archivio, "video", "v", "lavoro", "risolto.json"), "utf-8").catch(() => null)) !== null)
    expect((await readdir(join(a.archivio, "video", "v"))).filter((n) => n.includes(".tmp-"))).toEqual([])
  })

  test("la vista di un pezzo col girato è quella del girato, non della voce", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviGrezzo(c, "2026-10-06/b.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    const nuovo = {
      quadro: "girato-pieno",
      sorgenti: { a: { file: "2026-10-06/a.mp4" }, b: { file: "2026-10-06/b.mp4", viste: { dietro: { taglio: [0, 0, 10, 10] } } } },
      scene: [{ nome: "s", vista: "dietro", pezzi: [{ sorgente: "a", da: 0, a: 2, girato: { sorgente: "b", fermo: 1 } }] }],
    }
    const r = await chiama<{ ok: boolean }>(a, "PUT", "/api/video/v/piano", nuovo)
    expect(r.corpo.ok).toBe(true)
  })

  test("PUT piano senza cambiamenti non aggiunge una versione", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    await chiama(a, "PUT", "/api/video/v/piano", { ...piano(), coda: 1 })
    await chiama(a, "PUT", "/api/video/v/piano", { ...piano(), coda: 1 })
    expect(await readdir(join(a.archivio, "video", "v", "storia"))).toEqual(["1.json"])
  })

  describe("un piano non valido è rifiutato, e il file resta com'era", () => {
    const casi: [string, (p: Record<string, unknown>) => Record<string, unknown>, string][] = [
      ["chiave sconosciuta", (p) => ({ ...p, inventata: 1 }), "inventata"],
      ["manca una chiave obbligatoria nel pezzo", (p) => ({ ...p, scene: [{ nome: "s", pezzi: [{ da: 1 }] }] }), "sorgente"],
      ["sorgente che non esiste nel girato", (p) => ({ ...p, sorgenti: { a: { file: "2026-10-06/fantasma.mp4" } } }), "fantasma.mp4"],
      ["file fuori da grezzo", (p) => ({ ...p, sorgenti: { a: { file: "../../fuori.mp4" } } }), "non c'è in archivio/grezzo"],
      ["sorgente del pezzo non dichiarata", (p) => ({ ...p, scene: [{ nome: "s", pezzi: [{ sorgente: "zeta" }] }] }), "«zeta»"],
      ["quadro sconosciuto", (p) => ({ ...p, quadro: "quadro-che-non-c-e" }), "quadro-che-non-c-e"],
      ["quadro sconosciuto in una scena", (p) => ({ ...p, scene: [{ nome: "s", quadro: "boh", pezzi: [{ sorgente: "a" }] }] }), "«boh»"],
      ["vista non dichiarata", (p) => ({ ...p, scene: [{ nome: "s", vista: "gara", pezzi: [{ sorgente: "a" }] }] }), "vista «gara»"],
      [
        "vista non dichiarata nel girato del pezzo",
        (p) => ({ ...p, sorgenti: { a: { file: "2026-10-06/a.mp4", viste: { gara: { taglio: [0, 0, 10, 10] } } }, b: { file: "2026-10-06/a.mp4" } }, scene: [{ nome: "s", vista: "gara", pezzi: [{ sorgente: "a", girato: { sorgente: "b", fermo: 1 } }] }] }),
        "sorgenti.b.viste",
      ],
      ["ancora su una sorgente non dichiarata", (p) => ({ ...p, scene: [{ nome: "s", pezzi: [{ sorgente: "a" }], ancore: [["x", 1, 1]] }] }), "ancore"],
      ["dice con da", (p) => ({ ...p, scene: [{ nome: "s", pezzi: [{ sorgente: "a", minuto: "1:00", dice: "ciao", da: 1 }] }] }), "insieme"],
      ["base che non esiste", () => ({ base: "nessuno" }), "«nessuno»"],
      ["base di sé stesso", () => ({ base: "v" }), "giro"],
    ]
    for (const [nome, cambia, attesa] of casi) {
      test(nome, async () => {
        const a = await avviaAmbiente({}, async (c) => {
          await scriviGrezzo(c, "2026-10-06/a.mp4")
          await scriviVideo(c, "v", undefined, piano())
        })
        const r = await chiama<Errore>(a, "PUT", "/api/video/v/piano", cambia(piano()))
        expect(r.stato).toBe(400)
        expect(r.corpo.errore).toContain("Il piano non è valido")
        expect(r.corpo.errore).toContain(attesa)
        expect(r.corpo.problemi?.length).toBeGreaterThan(0)
        expect(await leggiPiano(a, "v")).toEqual(piano())
        await expect(stat(join(a.archivio, "video", "v", "storia"))).rejects.toThrow()
      })
    }

    test("ciclo di base fra due video", async () => {
      const a = await avviaAmbiente({}, async (c) => {
        await scriviGrezzo(c, "2026-10-06/a.mp4")
        await scriviVideo(c, "uno", undefined, piano())
        await scriviVideo(c, "due", undefined, { base: "uno" })
      })
      const r = await chiama<Errore>(a, "PUT", "/api/video/uno/piano", { base: "due" })
      expect(r.stato).toBe(400)
      expect(r.corpo.errore).toContain("uno → due → uno")
    })

    test("un piano con base che non ha né quadro né scene propri vale solo se la base li dà", async () => {
      const a = await avviaAmbiente({}, async (c) => {
        await scriviGrezzo(c, "2026-10-06/a.mp4")
        await scriviVideo(c, "madre", undefined, piano())
        await scriviVideo(c, "figlia", undefined, undefined)
      })
      expect((await chiama(a, "PUT", "/api/video/figlia/piano", { base: "madre", coda: 2 })).stato).toBe(200)
      const d = await chiama<Dettaglio>(a, "GET", "/api/video/figlia")
      expect(d.corpo.piano).toEqual({ base: "madre", coda: 2 })
      expect(d.corpo.piano_risolto_da_base).toEqual({ ...piano(), coda: 2 })
    })
  })

  test("la base si fonde come dice PIANO.md: scene per nome, viste e liste sommate", async () => {
    const madre = {
      quadro: "schermo-e-viso",
      sorgenti: { d: { file: "2026-10-08/d.mp4", viste: { gara: { taglio: [0, 0, 10, 10] } } } },
      scene: [
        { nome: "uno", vista: "gara", pezzi: [{ sorgente: "d", da: 0, a: 1 }] },
        { nome: "due", vista: "gara", pezzi: [{ sorgente: "d", da: 2, a: 3 }] },
      ],
      sottotitoli: { nomi: ["Agata"], correzioni: [{ sentite: ["x"], giuste: "X" }] },
    }
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-08/d.mp4")
      await scriviVideo(c, "madre", undefined, madre)
      await scriviVideo(c, "figlia")
    })
    const figlia = {
      base: "madre",
      sorgenti: { d: { file: "2026-10-08/d.mp4", viste: { altra: { taglio: [1, 1, 5, 5] } } } },
      scene: [{ nome: "due", vista: "altra", pezzi: [{ sorgente: "d", da: 9, a: 10 }] }, { nome: "tre", vista: "altra", pezzi: [{ sorgente: "d", da: 5, a: 6 }] }],
      sottotitoli: { nomi: ["Alice"], correzioni: [{ sentite: ["y"], giuste: "Y" }] },
    }
    expect((await chiama(a, "PUT", "/api/video/figlia/piano", figlia)).stato).toBe(200)
    interface Unito {
      base?: string
      quadro: string
      scene: { nome: string; pezzi: { da: number }[] }[]
      sorgenti: { d: { viste: Record<string, unknown> } }
      sottotitoli: { nomi: string[]; correzioni: unknown[] }
    }
    const unito = (await chiama<Omit<Dettaglio, "piano_risolto_da_base"> & { piano_risolto_da_base: Unito }>(a, "GET", "/api/video/figlia")).corpo.piano_risolto_da_base
    expect(unito.base).toBeUndefined()
    expect(unito.quadro).toBe("schermo-e-viso")
    expect(unito.scene.map((s) => s.nome)).toEqual(["uno", "due", "tre"])
    expect(unito.scene[1]!.pezzi[0]!.da).toBe(9)
    expect(Object.keys(unito.sorgenti.d.viste)).toEqual(["gara", "altra"])
    expect(unito.sottotitoli.nomi).toEqual(["Agata", "Alice"])
    expect(unito.sottotitoli.correzioni).toHaveLength(2)
  })

  test("annulla e rifai percorrono la storia; un piano nuovo dopo un annulla taglia i «rifai»", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    const versioni = [1, 2, 3].map((coda) => ({ ...piano(), coda }))
    for (const v of versioni) await chiama(a, "PUT", "/api/video/v/piano", v)
    expect(await leggiPiano(a, "v")).toEqual(versioni[2]!)

    const nessunRifai = await chiama<Errore>(a, "POST", "/api/video/v/rifai")
    expect(nessunRifai.stato).toBe(409)
    expect(nessunRifai.corpo.errore).toContain("niente da rifare")

    let r = await chiama<{ ok: boolean; piano: unknown; puo_annullare: boolean; puo_rifare: boolean }>(a, "POST", "/api/video/v/annulla")
    expect(r.corpo).toEqual({ ok: true, piano: versioni[1], puo_annullare: true, puo_rifare: true })
    r = await chiama(a, "POST", "/api/video/v/annulla")
    expect(r.corpo).toMatchObject({ piano: versioni[0], puo_annullare: true, puo_rifare: true })
    r = await chiama(a, "POST", "/api/video/v/annulla")
    expect(r.corpo).toMatchObject({ piano: piano(), puo_annullare: false, puo_rifare: true })
    expect((await chiama(a, "POST", "/api/video/v/annulla")).stato).toBe(409)
    expect(await leggiPiano(a, "v")).toEqual(piano())
    expect((await chiama<Dettaglio>(a, "GET", "/api/video/v")).corpo).toMatchObject({ puo_annullare: false, puo_rifare: true })

    r = await chiama(a, "POST", "/api/video/v/rifai")
    expect(r.corpo).toMatchObject({ piano: versioni[0], puo_annullare: true, puo_rifare: true })
    r = await chiama(a, "POST", "/api/video/v/rifai")
    expect(r.corpo).toMatchObject({ piano: versioni[1], puo_rifare: true })
    r = await chiama(a, "POST", "/api/video/v/rifai")
    expect(r.corpo).toMatchObject({ piano: versioni[2], puo_annullare: true, puo_rifare: false })

    await chiama(a, "POST", "/api/video/v/annulla")
    await chiama(a, "POST", "/api/video/v/annulla")
    const diverso = { ...piano(), coda: 99 }
    const salvato = await chiama<{ puo_annullare: boolean; puo_rifare: boolean }>(a, "PUT", "/api/video/v/piano", diverso)
    expect(salvato.corpo).toMatchObject({ puo_annullare: true, puo_rifare: false })
    expect((await chiama(a, "POST", "/api/video/v/rifai")).stato).toBe(409)
    r = await chiama(a, "POST", "/api/video/v/annulla")
    expect(r.corpo).toMatchObject({ piano: versioni[0], puo_rifare: true })
  })

  test("la storia sopravvive a un riavvio: annullare dopo un riavvio funziona", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    await chiama(a, "PUT", "/api/video/v/piano", { ...piano(), coda: 1 })
    await chiama(a, "PUT", "/api/video/v/piano", { ...piano(), coda: 2 })
    await chiama(a, "POST", "/api/video/v/annulla")
    await a.server.ferma()
    const b = await avviaAmbiente({ archivio: a.archivio, stile: a.stile, lavoro: a.radice })
    const d = await chiama<Dettaglio>(b, "GET", "/api/video/v")
    expect(d.corpo).toMatchObject({ puo_annullare: true, puo_rifare: true, piano: { coda: 1 } })
  })

  test("DELETE: solo una proposta senza montato; il resto è 409", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "proposta-vuota")
      await scriviVideo(c, "pronto", { titolo: "p", stato: "pronto", creato: "2026-10-06" })
      await scriviVideo(c, "montata")
      await Bun.write(join(c.archivio, "video", "montata", "uscite", "finale.mp4"), "x")
    })

    for (const slug of ["pronto", "montata"]) {
      const r = await chiama<Errore>(a, "DELETE", `/api/video/${slug}`)
      expect(r.stato).toBe(409)
      expect(r.corpo.errore).toContain("scartato")
    }
    expect((await chiama(a, "DELETE", "/api/video/proposta-vuota")).stato).toBe(200)
    expect((await chiama(a, "GET", "/api/video/proposta-vuota")).stato).toBe(404)
    await expect(stat(join(a.archivio, "video", "proposta-vuota"))).rejects.toThrow()
    expect((await chiama(a, "DELETE", "/api/video/proposta-vuota")).stato).toBe(404)
  })

  test("DELETE di un video che fa da base a un altro è rifiutato", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "madre", undefined, piano())
      await scriviVideo(c, "figlia", undefined, { base: "madre" })
    })
    const r = await chiama<Errore>(a, "DELETE", "/api/video/madre")
    expect(r.stato).toBe(409)
    expect(r.corpo.errore).toContain("«figlia»")
  })

  test("un piano scritto a mano ma non valido JSON non rompe l'indice: resta quello di prima", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    await writeFile(join(a.archivio, "video", "v", "piano.json"), "{ non è json")
    await Bun.sleep(300)
    expect((await chiama<Dettaglio>(a, "GET", "/api/video/v")).corpo.piano).toEqual(piano())
  })
})
