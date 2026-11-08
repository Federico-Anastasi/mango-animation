import { afterEach, describe, expect, test } from "bun:test"
import { appendFile, mkdir, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Messaggio } from "../src/eventi"
import { aspetta, ascolta, avviaAmbiente, chiama, fermaTutti, piano, righeDelFinto, scriviGrezzo, scriviVideo, type Cartelle } from "./aiuti"

afterEach(fermaTutti)

const scrivi = async (percorso: string, contenuto: string | object): Promise<void> => {
  await mkdir(join(percorso, ".."), { recursive: true })
  await writeFile(percorso, typeof contenuto === "string" ? contenuto : JSON.stringify(contenuto))
}

const avvii = async (a: Cartelle, comando: string, slug: string): Promise<number> => (await righeDelFinto(a)).filter((r) => r === `inizio ${comando} ${slug}`).length

describe("l'osservatore annuncia il messaggio giusto per ogni tipo di cambio", () => {
  test("scheda, piano, risolto, controllo, uscite di un video che c'è", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    const ascolto = await ascolta(a)
    const cartella = join(a.archivio, "video", "v")
    const arriva = (m: Messaggio) => aspetta(() => ascolto.messaggi.find((x) => JSON.stringify(x) === JSON.stringify(m)))

    await scrivi(join(cartella, "scheda.json"), { titolo: "Cambiato", stato: "pronto", creato: "2026-10-06" })
    await arriva({ tipo: "video", slug: "v", cosa: "scheda" })
    await scrivi(join(cartella, "lavoro", "risolto.json"), { durata: 9 })
    await arriva({ tipo: "video", slug: "v", cosa: "risolto" })
    await scrivi(join(cartella, "lavoro", "controllo.json"), { silenzi: [] })
    await arriva({ tipo: "video", slug: "v", cosa: "controllo" })
    await scrivi(join(cartella, "uscite", "finale.mp4"), "video")
    await arriva({ tipo: "video", slug: "v", cosa: "uscite" })
    await scrivi(join(cartella, "piano.json"), { ...piano(), coda: 3 })
    await arriva({ tipo: "video", slug: "v", cosa: "piano" })

    const elenco = await chiama<{ scheda: { titolo: string }; durata: number; ha_finale: boolean }[]>(a, "GET", "/api/video")
    expect(elenco.corpo[0]).toMatchObject({ scheda: { titolo: "Cambiato" }, durata: 9, ha_finale: true })
    ascolto.chiudi()
  })

  test("un video che nasce è «nuovo», uno senza scheda diventa «tolto», una cartella cancellata pure", async () => {
    const a = await avviaAmbiente()
    const ascolto = await ascolta(a)
    await scriviVideo(a, "nato")
    await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "video" && m.slug === "nato" && m.cosa === "nuovo"))
    expect((await chiama<unknown[]>(a, "GET", "/api/video")).corpo).toHaveLength(1)

    await rm(join(a.archivio, "video", "nato", "scheda.json"))
    await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "video" && m.slug === "nato" && m.cosa === "tolto"))
    expect((await chiama<unknown[]>(a, "GET", "/api/video")).corpo).toHaveLength(0)

    await scriviVideo(a, "altro")
    await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "video" && m.slug === "altro" && m.cosa === "nuovo"))
    await rm(join(a.archivio, "video", "altro"), { recursive: true })
    await aspetta(() => ascolto.messaggi.filter((m) => m.tipo === "video" && m.slug === "altro" && m.cosa === "tolto").length === 1)
    expect((await chiama<unknown[]>(a, "GET", "/api/video")).corpo).toHaveLength(0)
    ascolto.chiudi()
  })

  test("il girato: un file, la sua scheda, ciò che il motore prepara", async () => {
    const a = await avviaAmbiente()
    const ascolto = await ascolta(a)
    const conta = () => ascolto.messaggi.filter((m) => m.tipo === "grezzo").length

    await scriviGrezzo(a, "2026-10-09/nuovo.mp4")
    await aspetta(() => conta() >= 1)
    const prima = conta()
    await scrivi(join(a.archivio, "grezzo", "2026-10-09", "nuovo.mp4.scheda.json"), { tipo: "diretta", origine: "registrazione", durata: 5 })
    await aspetta(() => conta() > prima)
    const dopoScheda = conta()
    await scrivi(join(a.archivio, "preparati", "2026-10-09", "nuovo.mp4", "parole.json"), [{ p: "ciao", da: 0, a: 1 }])
    await scrivi(join(a.archivio, "preparati", "2026-10-09", "nuovo.mp4", "miniatura.jpg"), "jpg")
    await aspetta(() => conta() > dopoScheda)

    const giorni = await chiama<{ giorno: string; file: { file: string; scheda: { tipo: string }; preparato: { parole: string; miniatura: string; leggero: null } }[] }[]>(a, "GET", "/api/grezzo")
    expect(giorni.corpo).toHaveLength(1)
    expect(giorni.corpo[0]!.file[0]).toMatchObject({
      file: "2026-10-09/nuovo.mp4",
      scheda: { tipo: "diretta" },
      preparato: { parole: "preparati/2026-10-09/nuovo.mp4/parole.json", miniatura: "preparati/2026-10-09/nuovo.mp4/miniatura.jpg", leggero: null },
    })
    ascolto.chiudi()
  })

  test("lo stile del creator scritto da fuori annuncia «stile» e rifà il risolto dei video con un piano", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "con-piano", undefined, piano())
    })
    const ascolto = await ascolta(a)
    await writeFile(join(a.radice, "stile.json"), JSON.stringify({ sottotitoli: { corpo: 61 } }))
    await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "stile"))
    await aspetta(async () => (await avvii(a, "risolvi", "con-piano")) === 1)
  })

  test("lo stile cambiato annuncia «stile» e mette in coda risolvi solo per i video che hanno un piano", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "con-piano", undefined, piano())
      await scriviVideo(c, "senza-piano")
    })
    const ascolto = await ascolta(a)
    const stile = JSON.parse(await readFile(a.stile, "utf-8"))
    stile.sottotitoli.corpo = 60
    await writeFile(a.stile, JSON.stringify(stile, null, 2))
    await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "stile"))
    await aspetta(async () => (await avvii(a, "risolvi", "con-piano")) === 1)
    await Bun.sleep(300)
    expect(await avvii(a, "risolvi", "senza-piano")).toBe(0)
    expect(await avvii(a, "risolvi", "con-piano")).toBe(1)
    ascolto.chiudi()
  })

  test("ciò che non è un dato non fa rumore: tratti, parziali, file temporanei, registri", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "v")
    })
    const ascolto = await ascolta(a)
    await scrivi(join(a.archivio, "video", "v", "lavoro", "tratti", "0.mp4"), "x")
    await scrivi(join(a.archivio, "arrivi", ".in-corso", "uno.parziale"), "x")
    await scrivi(join(a.archivio, "arrivi", "registro.jsonl"), "{}")
    await scrivi(join(a.archivio, "video", "v", "scheda.json.tmp-abcd1234"), "x")
    await scrivi(join(a.archivio, "lavori.jsonl"), "{}")
    await Bun.sleep(400)
    expect(ascolto.messaggi).toEqual([])
    ascolto.chiudi()
  })

  test("il battito è un commento ogni tanto, non un messaggio", async () => {
    const a = await avviaAmbiente()
    const ascolto = await ascolta(a)
    await aspetta(() => (ascolto.testo().match(/: battito/g) ?? []).length >= 2)
    expect(ascolto.messaggi).toEqual([])
    ascolto.chiudi()
  })
})

describe("risolvi", () => {
  test("tre scritture ravvicinate del piano sono un solo risolvi", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    const file = join(a.archivio, "video", "v", "piano.json")
    for (const coda of [1, 2, 3]) await writeFile(file, JSON.stringify({ ...piano(), coda }))
    await aspetta(async () => (await avvii(a, "risolvi", "v")) >= 1)
    await Bun.sleep(500)
    expect(await avvii(a, "risolvi", "v")).toBe(1)
  })

  test("con la coda occupata, piani cambiati a ondate non accumulano doppioni", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
      await scriviVideo(c, "w", undefined, piano())
    })
    await chiama(a, "POST", "/api/video/w/lavori", { comando: "monta" })
    await aspetta(async () => (await chiama<{ in_corso: { comando: string } | null }>(a, "GET", "/api/lavori")).corpo.in_corso?.comando === "monta")
    const file = join(a.archivio, "video", "v", "piano.json")
    for (const coda of [1, 2, 3]) {
      await writeFile(file, JSON.stringify({ ...piano(), coda }))
      await Bun.sleep(150)
    }
    const lavori = await chiama<{ in_coda: { comando: string; slug: string }[] }>(a, "GET", "/api/lavori")
    expect(lavori.corpo.in_coda).toMatchObject([{ comando: "risolvi", slug: "v" }])
    await writeFile(join(a.radice, "via-w"), "")
    await aspetta(async () => (await avvii(a, "risolvi", "v")) === 1)
  })

  test("se cambia la base, si risolvono anche i video che la usano", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "madre", undefined, piano())
      await scriviVideo(c, "figlia", undefined, { base: "madre" })
      await scriviVideo(c, "estranea", undefined, piano())
    })
    await writeFile(join(a.archivio, "video", "madre", "piano.json"), JSON.stringify({ ...piano(), coda: 5 }))
    await aspetta(async () => (await avvii(a, "risolvi", "figlia")) === 1)
    expect(await avvii(a, "risolvi", "madre")).toBe(1)
    expect(await avvii(a, "risolvi", "estranea")).toBe(0)
  })
})

describe("risolvi all'avvio", () => {
  const SECONDO = 1000
  const conRisolto = async (c: Cartelle, slug: string, quandoRispettoAlPiano: number): Promise<void> => {
    const filePiano = join(c.archivio, "video", slug, "piano.json")
    const risolto = join(c.archivio, "video", slug, "lavoro", "risolto.json")
    await scrivi(risolto, { durata: 9 })
    const base = new Date(Date.now() - 60 * SECONDO)
    await utimes(filePiano, base, base)
    const dopo = new Date(base.getTime() + quandoRispettoAlPiano * SECONDO)
    await utimes(risolto, dopo, dopo)
  }

  test("un piano senza risolto o con il risolto più vecchio si risolve; uno con il risolto più nuovo no", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      for (const slug of ["senza", "vecchio", "fresco"]) await scriviVideo(c, slug, undefined, piano())
      await rm(join(c.archivio, "video", "senza", "lavoro", "risolto.json"))
      await conRisolto(c, "vecchio", -30)
      await conRisolto(c, "fresco", 30)
    })
    await aspetta(async () => (await avvii(a, "risolvi", "senza")) === 1 && (await avvii(a, "risolvi", "vecchio")) === 1)
    await Bun.sleep(300)
    expect(await avvii(a, "risolvi", "fresco")).toBe(0)
    expect(await avvii(a, "risolvi", "senza")).toBe(1)
  })

  test("un video senza piano o con un piano non valido non si risolve", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "senza-piano")
      await scriviVideo(c, "rotto", undefined, { ...piano(), quadro: "quadro-che-non-c-e" })
    })
    await Bun.sleep(400)
    expect(await righeDelFinto(a)).toEqual([])
  })

  test("uno stile più nuovo del risolto non rifà l'archivio all'avvio", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
      await conRisolto(c, "v", 30)
      const futuro = new Date(Date.now() + 120 * SECONDO)
      await utimes(c.stile, futuro, futuro)
    })
    await Bun.sleep(400)
    expect(await righeDelFinto(a)).toEqual([])
  })

  test("se la base è più nuova del risolto, si risolve anche il video che la usa", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "madre", undefined, piano())
      await scriviVideo(c, "figlia", undefined, { base: "madre" })
      await conRisolto(c, "madre", 30)
      await conRisolto(c, "figlia", 30)
      const ora = new Date()
      await utimes(join(c.archivio, "video", "madre", "piano.json"), ora, ora)
    })
    await aspetta(async () => (await avvii(a, "risolvi", "figlia")) === 1 && (await avvii(a, "risolvi", "madre")) === 1)
  })
})

describe("le scritture da fuori finiscono in storia", () => {
  test("Claude scrive piano.json da terminale: la versione che c'era si può annullare", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    const ascolto = await ascolta(a)
    const file = join(a.archivio, "video", "v", "piano.json")
    const uno = { ...piano(), coda: 1 }
    const due = { ...piano(), coda: 2 }

    await writeFile(file, JSON.stringify(uno))
    await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "video" && m.cosa === "piano"))
    await aspetta(async () => (await chiama<{ puo_annullare: boolean }>(a, "GET", "/api/video/v")).corpo.puo_annullare)
    await writeFile(file, JSON.stringify(due))
    await aspetta(async () => (await readdir(join(a.archivio, "video", "v", "storia"))).length === 2)
    expect(JSON.parse(await readFile(join(a.archivio, "video", "v", "storia", "1.json"), "utf-8"))).toEqual(piano())
    expect(JSON.parse(await readFile(join(a.archivio, "video", "v", "storia", "2.json"), "utf-8"))).toEqual(uno)

    const annulla = await chiama<{ piano: unknown }>(a, "POST", "/api/video/v/annulla")
    expect(annulla.corpo.piano).toEqual(uno)
    expect(JSON.parse(await readFile(file, "utf-8"))).toEqual(uno)
    expect((await chiama<{ piano: unknown }>(a, "POST", "/api/video/v/annulla")).corpo.piano).toEqual(piano())
    expect((await chiama<{ piano: unknown }>(a, "POST", "/api/video/v/rifai")).corpo.piano).toEqual(uno)
    ascolto.chiudi()
  })

  test("le scritture del server non finiscono in storia due volte quando l'osservatore le vede", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    await chiama(a, "PUT", "/api/video/v/piano", { ...piano(), coda: 1 })
    await Bun.sleep(400)
    expect(await readdir(join(a.archivio, "video", "v", "storia"))).toEqual(["1.json"])
    await chiama(a, "POST", "/api/video/v/annulla")
    await Bun.sleep(400)
    expect((await readdir(join(a.archivio, "video", "v", "storia"))).sort()).toEqual(["2.json", "cursore.json", "1.json"].sort())
  })

  test("una scrittura da fuori dopo un annulla taglia i «rifai»", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    await chiama(a, "PUT", "/api/video/v/piano", { ...piano(), coda: 1 })
    await chiama(a, "POST", "/api/video/v/annulla")
    expect((await chiama<{ puo_rifare: boolean }>(a, "GET", "/api/video/v")).corpo.puo_rifare).toBe(true)
    await writeFile(join(a.archivio, "video", "v", "piano.json"), JSON.stringify({ ...piano(), coda: 7 }))
    await aspetta(async () => !(await chiama<{ puo_rifare: boolean }>(a, "GET", "/api/video/v")).corpo.puo_rifare)
    expect((await chiama<{ puo_annullare: boolean }>(a, "GET", "/api/video/v")).corpo.puo_annullare).toBe(true)
  })
})

describe("un piano scritto a mano nel file, senza passare dal server", () => {
  const sbagliato = { ...piano(), quadro: "quadro-che-non-c-e" }
  const problemiDelPiano = async (a: Cartelle & { url: string }, slug: string): Promise<string[]> => (await chiama<{ problemi: { piano: string[] } }>(a as never, "GET", `/api/video/${slug}`)).corpo.problemi.piano

  test("un riferimento sbagliato è segnalato, non si risolve, e nessun lavoro parte finché non si corregge", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    const file = join(a.archivio, "video", "v", "piano.json")
    await writeFile(file, JSON.stringify(sbagliato))
    await aspetta(async () => (await problemiDelPiano(a, "v")).length > 0)
    expect((await problemiDelPiano(a, "v")).join(" ")).toContain("quadro-che-non-c-e")
    await Bun.sleep(400)
    expect(await avvii(a, "risolvi", "v")).toBe(0)

    const rifiutato = await chiama<{ errore: string; problemi: string[] }>(a, "POST", "/api/video/v/lavori", { comando: "monta" })
    expect(rifiutato.stato).toBe(409)
    expect(rifiutato.corpo.errore).toContain("quadro-che-non-c-e")
    expect(rifiutato.corpo.errore).toContain("piano_ritocca")
    expect(rifiutato.corpo.problemi.join(" ")).toContain("quadro-che-non-c-e")
    expect((await righeDelFinto(a)).some((r) => r.includes("monta"))).toBe(false)

    await writeFile(file, JSON.stringify({ ...piano(), coda: 1 }))
    await aspetta(async () => (await problemiDelPiano(a, "v")).length === 0)
    await aspetta(async () => (await avvii(a, "risolvi", "v")) === 1)
    expect((await chiama(a, "POST", "/api/video/v/lavori", { comando: "controlla" })).stato).toBe(202)
  })

  test("un file del girato che non c'è è segnalato, e quando arriva il piano torna buono e si risolve", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    await writeFile(join(a.archivio, "video", "v", "piano.json"), JSON.stringify(piano("2026-10-06/arriva.mp4")))
    await aspetta(async () => (await problemiDelPiano(a, "v")).length > 0)
    expect((await problemiDelPiano(a, "v")).join(" ")).toContain("arriva.mp4")
    expect((await chiama(a, "POST", "/api/video/v/lavori", { comando: "risolvi" })).stato).toBe(409)

    await scriviGrezzo(a, "2026-10-06/arriva.mp4")
    await aspetta(async () => (await problemiDelPiano(a, "v")).length === 0)
    await aspetta(async () => (await avvii(a, "risolvi", "v")) >= 1)
  })

  test("all'avvio un piano con un riferimento sbagliato è già segnalato, e rifiuta i lavori", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, sbagliato)
    })
    expect((await problemiDelPiano(a, "v")).join(" ")).toContain("quadro-che-non-c-e")
    expect((await chiama(a, "POST", "/api/video/v/lavori", { comando: "monta" })).stato).toBe(409)
    await Bun.sleep(300)
    expect(await righeDelFinto(a)).toEqual([])
  })

  test("un file che non è JSON rifiuta i lavori con la stessa frase di video_leggi", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    await writeFile(join(a.archivio, "video", "v", "piano.json"), "{ non json")
    await aspetta(async () => (await problemiDelPiano(a, "v")).length > 0)
    const rifiutato = await chiama<{ errore: string }>(a, "POST", "/api/video/v/lavori", { comando: "monta" })
    expect(rifiutato.stato).toBe(409)
    expect(rifiutato.corpo.errore).toContain("scritto male")
  })
})

describe("i file che crescono", () => {
  test("mentre un file di uscite/ cresce arriva un solo «uscite», quando ha smesso", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "v")
    })
    const ascolto = await ascolta(a)
    const file = join(a.archivio, "video", "v", "uscite", "finale.mp4")
    await mkdir(join(file, ".."), { recursive: true })
    let ultimaScrittura = 0
    for (let i = 0; i < 15; i++) {
      await appendFile(file, "x".repeat(1000))
      ultimaScrittura = Date.now()
      await Bun.sleep(40)
    }
    const arrivato = await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "video" && m.cosa === "uscite"))
    expect(arrivato).toBeTruthy()
    expect(Date.now() - ultimaScrittura).toBeGreaterThanOrEqual(150)
    await Bun.sleep(600)
    expect(ascolto.messaggi.filter((m) => m.tipo === "video" && m.cosa === "uscite")).toHaveLength(1)
    const dettaglio = await chiama<{ uscite: { byte: number }[] }>(a, "GET", "/api/video/v")
    expect(dettaglio.corpo.uscite[0]!.byte).toBe(15_000)
    ascolto.chiudi()
  })

  test("ciò che il motore scrive in lavoro/ a raffica (tratti, scene, foto) non fa nessun rumore, risolto e controllo sì", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "v")
    })
    const ascolto = await ascolta(a)
    for (let i = 0; i < 10; i++) await scrivi(join(a.archivio, "video", "v", "lavoro", i % 2 ? "scene" : "foto", `${i}.mp4`), "x")
    await Bun.sleep(400)
    expect(ascolto.messaggi).toEqual([])
    await scrivi(join(a.archivio, "video", "v", "lavoro", "risolto.json"), { durata: 4 })
    await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "video" && m.cosa === "risolto"))
    ascolto.chiudi()
  })

  test("un file copiato a mano in grezzo/ si misura solo quando ha smesso di crescere, una volta", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await writeFile(join(c.radice, "ffprobe.cmd"), '@echo off\r\nfor %%A in (%7) do echo %%~zA>>"%~dp0misure.log"\r\necho {"format":{"duration":"2.5"},"streams":[{"codec_type":"video","width":100,"height":50,"avg_frame_rate":"25/1"}]}\r\n')
    })
    await a.server.ferma()
    const b = await avviaAmbiente({ archivio: a.archivio, stile: a.stile, lavoro: a.radice, ffprobe: join(a.radice, "ffprobe.cmd") })
    const file = join(b.archivio, "grezzo", "2026-10-08", "lungo.mp4")
    await mkdir(join(file, ".."), { recursive: true })
    for (let i = 0; i < 12; i++) {
      await appendFile(file, "x".repeat(1000))
      await Bun.sleep(40)
    }
    const scheda = `${file}.scheda.json`
    const letta = await aspetta(async () => JSON.parse(await readFile(scheda, "utf-8").catch(() => "null")))
    expect(letta).toMatchObject({ tipo: "altro", durata: 2.5 })
    const misure = (await readFile(join(a.radice, "misure.log"), "utf-8")).split(/\r?\n/).filter(Boolean)
    expect(misure).toEqual(["12000"])
  })

  test("un file con la scheda ma senza durata (la misura all'arrivo non è riuscita) si misura, e la scheda tiene ciò che diceva", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await writeFile(join(c.radice, "ffprobe.cmd"), '@echo off\r\necho {"format":{"duration":"22.2"},"streams":[{"codec_type":"video","width":3840,"height":2160,"avg_frame_rate":"30/1","side_data_list":[{"rotation":-90}]}]}\r\n')
    })
    await a.server.ferma()
    const b = await avviaAmbiente({ archivio: a.archivio, stile: a.stile, lavoro: a.radice, ffprobe: join(a.radice, "ffprobe.cmd") })
    const file = join(b.archivio, "grezzo", "2026-10-20", "IMG_5277.MOV")
    await scrivi(`${file}.scheda.json`, { tipo: "ripresa", origine: "telefono", arrivato: "2026-10-20T23:03:36", note: "" })
    await scrivi(file, "x".repeat(1000))
    const letta = await aspetta(async () => {
      const scheda = JSON.parse(await readFile(`${file}.scheda.json`, "utf-8").catch(() => "null"))
      return scheda?.durata ? scheda : null
    })
    expect(letta).toEqual({ tipo: "ripresa", origine: "telefono", arrivato: "2026-10-20T23:03:36", note: "", durata: 22.2, largo: 2160, alto: 3840, fps: 30 })
  })
})
