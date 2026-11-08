import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { contatori } from "../src/disco"
import { aspetta, ascolta, avviaAmbiente, chiama, fermaTutti, piano, righeDelFinto, scriviGrezzo, scriviVideo } from "./aiuti"

afterEach(fermaTutti)

interface GiornoGrezzo {
  giorno: string
  file: { file: string; nome: string; byte: number; scheda: { tipo: string; durata?: number } | null; preparato: Record<string, string | null>; usato_in: string[] }[]
}

describe("il costo delle letture", () => {
  test("venti GET /api/video di fila (e le altre letture dell'indice) non leggono il disco", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      for (const giorno of ["2026-10-06", "2026-10-07"]) await scriviGrezzo(c, `${giorno}/a.mp4`)
      for (const slug of ["uno", "due", "tre"]) await scriviVideo(c, slug, undefined, piano())
    })
    await Bun.sleep(300)
    const prima = contatori.letture
    for (let i = 0; i < 20; i++) expect((await chiama<unknown[]>(a, "GET", "/api/video")).corpo).toHaveLength(3)
    for (let i = 0; i < 5; i++) await chiama(a, "GET", "/api/grezzo")
    await chiama(a, "GET", "/api/stile")
    await chiama(a, "GET", "/api/lavori")
    await chiama(a, "GET", "/api/arrivi")
    expect(contatori.letture).toBe(prima)

    await chiama(a, "GET", "/api/video/uno")
    expect(contatori.letture).toBeGreaterThan(prima)
  })

  test("nessun processo parte da una lettura: né il motore né ffprobe", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    for (const percorso of ["/api/video", "/api/video/v", "/api/grezzo", "/api/stile", "/api/lavori", "/api/arrivi", "/api/animazioni"]) await chiama(a, "GET", percorso)
    await Bun.sleep(300)
    expect(await righeDelFinto(a)).toEqual([])
  })
})

describe("il girato", () => {
  test("i giorni dal più recente; ogni file con scheda, ciò che è preparato e in quali video è usato", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/vecchio.mp4", "12345", { tipo: "ripresa", origine: "telefono", durata: 12.4 })
      await scriviGrezzo(c, "2026-10-08/diretta.mp4", "x", { tipo: "diretta", origine: "registrazione" })
      await scriviGrezzo(c, "2026-10-08/altro.mp4", "xy", { tipo: "schermo", origine: "registrazione" })
      await writeFile(join(c.archivio, "grezzo", "2026-10-08", "tmp.mp4.tmp-ab12"), "non è un file")
      await mkdir(join(c.archivio, "preparati", "2026-10-08", "diretta.mp4"), { recursive: true })
      for (const f of ["parole.json", "miniatura.jpg", "leggero.mp4", "onda.bin"]) await writeFile(join(c.archivio, "preparati", "2026-10-08", "diretta.mp4", f), "[]")
      await scriviVideo(c, "orto", undefined, piano("2026-10-08/diretta.mp4"))
      await scriviVideo(c, "figlia", undefined, { base: "orto" })
    })
    const r = await chiama<GiornoGrezzo[]>(a, "GET", "/api/grezzo")
    expect(r.corpo.map((g) => g.giorno)).toEqual(["2026-10-08", "2026-10-06"])
    const diretta = r.corpo[0]!.file.find((f) => f.nome === "diretta.mp4")!
    expect(diretta).toMatchObject({
      file: "2026-10-08/diretta.mp4",
      byte: 1,
      scheda: { tipo: "diretta" },
      usato_in: ["figlia", "orto"],
      preparato: {
        parole: "preparati/2026-10-08/diretta.mp4/parole.json",
        miniatura: "preparati/2026-10-08/diretta.mp4/miniatura.jpg",
        leggero: "preparati/2026-10-08/diretta.mp4/leggero.mp4",
        onda: "preparati/2026-10-08/diretta.mp4/onda.bin",
        sagoma: null,
        trascrizione: null,
      },
    })
    expect(r.corpo[0]!.file).toHaveLength(2)
    expect(r.corpo[0]!.file.find((f) => f.nome === "altro.mp4")).toMatchObject({ usato_in: [], preparato: { parole: null } })
    expect(r.corpo[1]!.file[0]).toMatchObject({ file: "2026-10-06/vecchio.mp4", byte: 5, scheda: { durata: 12.4 } })

    const elenco = await chiama<{ slug: string; miniatura: string | null }[]>(a, "GET", "/api/video")
    expect(elenco.corpo.find((v) => v.slug === "orto")!.miniatura).toBe("preparati/2026-10-08/diretta.mp4/miniatura.jpg")
  })

  test("«usato in» segue i piani: cambiando il file di un piano cambia chi lo usa, con il messaggio «grezzo»", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviGrezzo(c, "2026-10-06/b.mp4")
      await scriviVideo(c, "v", undefined, piano("2026-10-06/a.mp4"))
    })
    const ascolto = await ascolta(a)
    const usi = async () => Object.fromEntries((await chiama<GiornoGrezzo[]>(a, "GET", "/api/grezzo")).corpo[0]!.file.map((f) => [f.nome, f.usato_in]))
    expect(await usi()).toEqual({ "a.mp4": ["v"], "b.mp4": [] })
    await chiama(a, "PUT", "/api/video/v/piano", piano("2026-10-06/b.mp4"))
    expect(await usi()).toEqual({ "a.mp4": [], "b.mp4": ["v"] })
    await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "grezzo"))
    ascolto.chiudi()
  })

  test("le parole di un file preparato; un file non preparato, che non c'è o scritto male", async () => {
    const parole = [{ p: "ciao", da: 0.1, a: 0.4 }]
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/pronto.mp4")
      await scriviGrezzo(c, "2026-10-06/grezzo.mp4")
      await mkdir(join(c.archivio, "preparati", "2026-10-06", "pronto.mp4"), { recursive: true })
      await writeFile(join(c.archivio, "preparati", "2026-10-06", "pronto.mp4", "parole.json"), JSON.stringify(parole))
    })
    expect((await chiama<unknown>(a, "GET", "/api/grezzo/parole?file=2026-10-06/pronto.mp4")).corpo).toEqual(parole)
    const nonPreparato = await chiama<{ errore: string }>(a, "GET", "/api/grezzo/parole?file=2026-10-06/grezzo.mp4")
    expect(nonPreparato.stato).toBe(404)
    expect(nonPreparato.corpo.errore).toContain("Prepara")
    expect((await chiama(a, "GET", "/api/grezzo/parole?file=2026-10-06/non-c-e.mp4")).stato).toBe(404)
    for (const file of ["", "pronto.mp4", "../x/y", "2026-10-06/../../x", "a/b/c", "C:/x/y"]) expect((await chiama(a, "GET", `/api/grezzo/parole?file=${encodeURIComponent(file)}`)).stato, file).toBe(400)
    expect((await chiama(a, "GET", "/api/grezzo/parole")).stato).toBe(400)
  })

  test("PUT della scheda di un file: la scrive, la valida, e il file deve esistere", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4", "x", { tipo: "altro", origine: "altro" })
    })
    const ascolto = await ascolta(a)
    const nuova = { tipo: "diretta", origine: "registrazione", durata: 600, largo: 1920, alto: 1080, fps: 30, note: "la diretta dell'orto" }
    expect((await chiama(a, "PUT", "/api/grezzo/scheda?file=2026-10-06/a.mp4", nuova)).corpo).toEqual({ ok: true })
    expect((await chiama<GiornoGrezzo[]>(a, "GET", "/api/grezzo")).corpo[0]!.file[0]!.scheda).toEqual(nuova)
    await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "grezzo"))
    ascolto.chiudi()
    const cattiva = await chiama<{ errore: string; problemi: string[] }>(a, "PUT", "/api/grezzo/scheda?file=2026-10-06/a.mp4", { tipo: "boh", origine: "telefono", durata: -1 })
    expect(cattiva.stato).toBe(400)
    expect(cattiva.corpo.problemi.length).toBeGreaterThanOrEqual(2)
    expect((await chiama(a, "PUT", "/api/grezzo/scheda?file=2026-10-06/non-c-e.mp4", nuova)).stato).toBe(404)
  })

  test("PATCH della scheda di un file: cambia solo i campi dati, `null` toglie, e il risultato si valida", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4", "x", { tipo: "altro", origine: "scaricato", note: "un keynote" })
    })
    const lingua = async () => ((await chiama<GiornoGrezzo[]>(a, "GET", "/api/grezzo")).corpo[0]!.file[0]!.scheda as Record<string, unknown> | null)?.["lingua"]
    const cambiata = await chiama<{ ok: boolean; scheda: unknown }>(a, "PATCH", "/api/grezzo/scheda?file=2026-10-06/a.mp4", { lingua: "en", note: null })
    expect(cambiata.corpo).toEqual({ ok: true, scheda: { tipo: "altro", origine: "scaricato", lingua: "en" } })
    await aspetta(async () => (await lingua()) === "en")
    const cattiva = await chiama<{ errore: string }>(a, "PATCH", "/api/grezzo/scheda?file=2026-10-06/a.mp4", { lingua: "inglese" })
    expect(cattiva.stato).toBe(400)
    expect(cattiva.corpo.errore).toContain("lingua")
    expect(await lingua()).toBe("en")
    expect((await chiama(a, "PATCH", "/api/grezzo/scheda?file=2026-10-06/non-c-e.mp4", { lingua: "en" })).stato).toBe(404)
  })

  test("prepara un file per ritrascriverlo: il motore riceve --ritrascrivi", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
    })
    expect((await chiama(a, "POST", "/api/grezzo/prepara", { file: "2026-10-06/a.mp4", ritrascrivi: true })).stato).toBe(202)
    await aspetta(async () => (await chiama<{ finiti: unknown[] }>(a, "GET", "/api/lavori")).corpo.finiti.length === 1)
    expect((await righeDelFinto(a)).filter((r) => r.startsWith("inizio"))).toEqual(["inizio prepara-file 2026-10-06/a.mp4 --ritrascrivi"])
    expect((await chiama(a, "POST", "/api/grezzo/prepara", { file: "2026-10-06/a.mp4", ritrascrivi: "sì" })).stato).toBe(400)
  })

  test("prepara un file: in coda come prepara-file; due richieste uguali in attesa sono una", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviGrezzo(c, "2026-10-06/b.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    await chiama(a, "POST", "/api/video/v/lavori", { comando: "monta" })
    await aspetta(async () => (await chiama<{ in_corso: unknown }>(a, "GET", "/api/lavori")).corpo.in_corso)
    const uno = await chiama<{ id: string }>(a, "POST", "/api/grezzo/prepara", { file: "2026-10-06/a.mp4" })
    const stesso = await chiama<{ id: string }>(a, "POST", "/api/grezzo/prepara", { file: "2026-10-06/a.mp4" })
    const altro = await chiama<{ id: string }>(a, "POST", "/api/grezzo/prepara", { file: "2026-10-06/b.mp4" })
    expect([uno.stato, stesso.stato]).toEqual([202, 202])
    expect(stesso.corpo.id).toBe(uno.corpo.id)
    expect(altro.corpo.id).not.toBe(uno.corpo.id)
    expect((await chiama<{ in_coda: { comando: string; slug: null; file: string }[] }>(a, "GET", "/api/lavori")).corpo.in_coda).toMatchObject([
      { comando: "prepara-file", slug: null, file: "2026-10-06/a.mp4" },
      { comando: "prepara-file", slug: null, file: "2026-10-06/b.mp4" },
    ])
    await writeFile(join(a.radice, "via-v"), "")
    await aspetta(async () => (await righeDelFinto(a)).includes("inizio prepara-file 2026-10-06/b.mp4"))
    expect((await righeDelFinto(a)).filter((r) => r.startsWith("inizio prepara-file"))).toEqual(["inizio prepara-file 2026-10-06/a.mp4", "inizio prepara-file 2026-10-06/b.mp4"])
    expect((await chiama(a, "POST", "/api/grezzo/prepara", { file: "2026-10-06/non-c-e.mp4" })).stato).toBe(404)
    expect((await chiama(a, "POST", "/api/grezzo/prepara", { file: "../x" })).stato).toBe(400)
  })
})

describe("le animazioni", () => {
  test("l'elenco viene dal comando di animazioni/", async () => {
    const a = await avviaAmbiente()
    expect((await chiama(a, "GET", "/api/animazioni")).corpo).toEqual({ prova: [{ sigla: "a", titolo: "A", durata: 3 }] })
  })

  test("se il comando non c'è o fallisce: {} e non un 500", async () => {
    for (const comando of [["comando-che-non-esiste-davvero", "elenco"], [process.execPath, "-e", "console.error('manca tutto'); process.exit(3)"], [process.execPath, "-e", "console.log('non è json')"], [process.execPath, "-e", "console.log('[1,2]')"]]) {
      const a = await avviaAmbiente({ animazioni: { cartella: "x", comando } })
      const r = await chiama(a, "GET", "/api/animazioni")
      expect(r.stato).toBe(200)
      expect(r.corpo).toEqual({})
    }
  })

  test("si rifà quando cambia qualcosa in animazioni/src/scene/", async () => {
    let a = await avviaAmbiente({}, async (c) => {
      await mkdir(join(c.radice, "animazioni", "src", "scene", "uno"), { recursive: true })
    })
    await a.server.ferma()
    const scene = join(a.radice, "animazioni", "src", "scene")
    const codice = `const n = require("fs").readdirSync(${JSON.stringify(scene)}).length; console.log(JSON.stringify({ video: [{ sigla: "n" + n, titolo: "t", durata: 1 }] }))`
    a = await avviaAmbiente({ animazioni: { cartella: join(a.radice, "animazioni"), comando: [process.execPath, "-e", codice] } , lavoro: a.radice})
    const sigla = async () => (await chiama<{ video: { sigla: string }[] }>(a, "GET", "/api/animazioni")).corpo.video?.[0]?.sigla
    expect(await sigla()).toBe("n1")
    await mkdir(join(scene, "due"), { recursive: true })
    await aspetta(async () => (await sigla()) === "n2")
  })
})

describe("le animazioni del creator", () => {
  test("l'elenco si rifà quando cambia qualcosa in <lavoro>/animazioni/scene/", async () => {
    let a = await avviaAmbiente({}, async (c) => {
      await mkdir(join(c.radice, "animazioni", "scene", "uno"), { recursive: true })
    })
    await a.server.ferma()
    const scene = join(a.radice, "animazioni", "scene")
    const codice = `const n = require("fs").readdirSync(${JSON.stringify(scene)}).length; console.log(JSON.stringify({ video: [{ sigla: "n" + n, titolo: "t", durata: 1 }] }))`
    a = await avviaAmbiente({ animazioni: { cartella: "x", comando: [process.execPath, "-e", codice] }, lavoro: a.radice })
    const sigla = async () => (await chiama<{ video: { sigla: string }[] }>(a, "GET", "/api/animazioni")).corpo.video?.[0]?.sigla
    expect(await sigla()).toBe("n1")
    await mkdir(join(scene, "due"), { recursive: true })
    await aspetta(async () => (await sigla()) === "n2")
  })
})

describe("la chiusura", () => {
  test("ferma chiude i flussi degli eventi e smette di rispondere", async () => {
    const a = await avviaAmbiente()
    const ascolto = await ascolta(a)
    await a.server.ferma()
    await expect(fetch(`${a.url}/api/video`)).rejects.toThrow()
    ascolto.chiudi()
  })
})
