import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { ascolta, aspetta, avviaAmbiente, chiama, fermaTutti, piano, righeDelFinto, scriviGrezzo, scriviVideo, type Ambiente } from "./aiuti"

afterEach(fermaTutti)

const cartellaDiLavoro = (): Promise<string> => mkdtemp(join(tmpdir(), "mango-animation-lavoro-"))

interface Lavori {
  in_corso: { id: string; slug: string | null; comando: string; file: string | null; iniziato: string; righe: string[]; secondi_video: number | null; stima: number | null; trascorsi: number; fine_prevista: string | null } | null
  in_coda: { id: string; slug: string | null; comando: string; accodato: string; secondi_video: number | null; stima: number | null }[]
  finiti: { id: string; slug: string | null; comando: string; esito: string; errore: string | null; iniziato: string; finito: string; righe: string[]; secondi_video: number | null }[]
}

const lavori = async (a: Ambiente): Promise<Lavori> => (await chiama<Lavori>(a, "GET", "/api/lavori")).corpo
const metti = async (a: Ambiente, slug: string, comando: string): Promise<string> => (await chiama<{ id: string }>(a, "POST", `/api/video/${slug}/lavori`, { comando })).corpo.id
const sblocca = (a: Ambiente, slug: string): Promise<void> => writeFile(join(a.radice, `via-${slug}`), "")
const èVivo = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const pidDi = async (a: Ambiente, nome: string): Promise<number> => Number(await aspetta(() => readFile(join(a.radice, nome), "utf-8").catch(() => "")))

const conDueVideo = (extra = {}) =>
  avviaAmbiente(extra, async (c) => {
    await scriviGrezzo(c, "2026-10-06/a.mp4")
    await scriviVideo(c, "v", undefined, piano())
    await scriviVideo(c, "w", undefined, piano())
  })

describe("la coda dei lavori", () => {
  test("uno alla volta: il secondo parte solo quando il primo è finito", async () => {
    const a = await conDueVideo()
    const primo = await metti(a, "v", "monta")
    const secondo = await metti(a, "w", "monta")
    await aspetta(async () => (await lavori(a)).in_corso?.id === primo)
    await Bun.sleep(400)
    const durante = await lavori(a)
    expect(durante.in_corso).toMatchObject({ id: primo, slug: "v", comando: "monta" })
    expect(durante.in_coda.map((l) => l.id)).toEqual([secondo])
    expect(await righeDelFinto(a)).toEqual(["inizio monta v"])

    await sblocca(a, "v")
    await aspetta(async () => (await righeDelFinto(a)).includes("inizio monta w"))
    expect(await righeDelFinto(a)).toEqual(["inizio monta v", "fine monta v", "inizio monta w"])
    await sblocca(a, "w")
    await aspetta(async () => (await lavori(a)).finiti.length === 2)
    const fine = await lavori(a)
    expect(fine.in_corso).toBeNull()
    expect(fine.finiti.map((f) => [f.slug, f.esito])).toEqual([
      ["w", "riuscito"],
      ["v", "riuscito"],
    ])
  })

  test("risolvi passa avanti agli altri in coda, e due risolvi dello stesso video si fondono", async () => {
    const a = await conDueVideo()
    await metti(a, "v", "monta")
    await aspetta(async () => (await lavori(a)).in_corso?.comando === "monta")
    await metti(a, "w", "monta")
    await metti(a, "w", "controlla")
    const r1 = await metti(a, "v", "risolvi")
    const r2 = await metti(a, "v", "risolvi")
    const r3 = await metti(a, "w", "risolvi")
    expect(r2).toBe(r1)
    expect(r3).not.toBe(r1)
    expect((await lavori(a)).in_coda.map((l) => `${l.comando} ${l.slug}`)).toEqual(["risolvi v", "risolvi w", "monta w", "controlla w"])
    await sblocca(a, "v")
    await sblocca(a, "w")
    await aspetta(async () => (await lavori(a)).finiti.length === 5)
    expect((await righeDelFinto(a)).filter((r) => r.startsWith("inizio"))).toEqual(["inizio monta v", "inizio risolvi v", "inizio risolvi w", "inizio monta w", "inizio controlla w"])
  })

  test("l'esito viene dal codice d'uscita, l'errore è l'ultima riga di stderr, le righe sono quelle del lavoro", async () => {
    const a = await conDueVideo()
    await metti(a, "v", "prepara")
    await aspetta(async () => (await lavori(a)).finiti.length === 1)
    await metti(a, "w", "controlla")
    await aspetta(async () => (await lavori(a)).finiti.length === 2)
    const [riuscito, fallito] = (await lavori(a)).finiti
    expect(fallito).toMatchObject({ slug: "v", comando: "prepara", esito: "fallito", errore: "Manca il file prova.mp4: copialo in archivio/grezzo/ e riprova." })
    expect(fallito!.righe).toEqual(["prepara v", "Manca il file prova.mp4: copialo in archivio/grezzo/ e riprova."])
    expect(riuscito).toMatchObject({ slug: "w", comando: "controlla", esito: "riuscito", errore: null, righe: ["controlla w"] })
    expect(new Date(riuscito!.finito).getTime()).toBeGreaterThanOrEqual(new Date(riuscito!.iniziato).getTime())
  })

  test("un comando che esce con errore senza dire perché: la frase non ha numeri, il codice d'uscita sta nelle righe del lavoro", async () => {
    const a = await conDueVideo()
    await chiama(a, "POST", "/api/video/v/lavori", { comando: "copertina", disegno: "disegno.png" })
    await aspetta(async () => (await lavori(a)).finiti.length === 1)
    const [fallito] = (await lavori(a)).finiti
    expect(fallito).toMatchObject({ comando: "copertina", esito: "fallito", errore: "Il lavoro si è fermato senza spiegare perché: guarda le ultime righe." })
    expect(fallito!.righe).toEqual(["copertina v disegno.png", "Uscito con codice 4."])
  })

  describe("le schede in prestito dal modello di Mango Code", () => {
    const prestito = (rifiuta = false) => {
      const chiamate: string[] = []
      return {
        chiamate,
        schede: {
          prendi: async (scheda: number | null | undefined) => {
            chiamate.push(`prendi ${scheda}`)
            if (rifiuta) throw new Error("Il modello di Mango Code tiene la scheda video e non la lascia.")
            return "Ho liberato la scheda 1."
          },
          rendi: async () => {
            chiamate.push("rendi")
            return null
          },
        },
      }
    }

    test("un lavoro sulla scheda la prende prima di partire e la rende quando in coda non ce ne sono altri; risolvi non la tocca", async () => {
      const p = prestito()
      const a = await avviaAmbiente({ schede: p.schede }, async (c) => {
        await scriviGrezzo(c, "2026-10-06/a.mp4")
        await scriviVideo(c, "v", undefined, piano())
        await writeFile(join(c.radice, "profilo.json"), JSON.stringify({ macchina: { scheda_video: 1 } }))
      })
      await metti(a, "v", "monta")
      await aspetta(async () => (await lavori(a)).in_corso?.comando === "monta")
      await metti(a, "v", "controlla")
      await metti(a, "v", "risolvi")
      await sblocca(a, "v")
      await aspetta(async () => (await lavori(a)).finiti.length === 3)
      await aspetta(() => p.chiamate.includes("rendi"))
      expect(p.chiamate).toEqual(["prendi 1", "prendi 1", "rendi"])
      const monta = (await lavori(a)).finiti.find((f) => f.comando === "monta")
      expect(monta?.righe[0]).toBe("Ho liberato la scheda 1.")
    })

    test("se il modello non lascia la scheda il lavoro fallisce con la frase che dice perché, senza partire", async () => {
      const p = prestito(true)
      const a = await conDueVideo({ schede: p.schede })
      await metti(a, "v", "monta")
      await aspetta(async () => (await lavori(a)).finiti.length === 1)
      expect((await lavori(a)).finiti[0]).toMatchObject({ comando: "monta", esito: "fallito", errore: "Il modello di Mango Code tiene la scheda video e non la lascia." })
      expect(await righeDelFinto(a)).toEqual([])
    })
  })

  describe("la fine si annuncia con l'indice già aggiornato", () => {
    // L'osservatore consegna dopo 1,5 s: se la coda aspettasse lui, il lavoro risulterebbe finito su un indice vecchio.
    const conOsservatoreLento = () => conDueVideo({ rimbalzoMs: 1500, quietoUsciteMs: 1500 })
    const finito = async (a: Ambiente, id: string): Promise<boolean> => (await lavori(a)).finiti.some((f) => f.id === id)
    const dettaglio = async (a: Ambiente) => (await chiama<{ risolto_aggiornato: boolean; risolto: unknown; uscite: { file: string }[] }>(a, "GET", "/api/video/v")).corpo

    test("risolvi: appena finito il risolto è aggiornato, e l'evento del risolto viene prima di quello della fine", async () => {
      const a = await conOsservatoreLento()
      expect((await dettaglio(a)).risolto_aggiornato).toBe(true)
      const eventi = await ascolta(a)
      await chiama(a, "PUT", "/api/video/v/piano", { ...piano(), coda: 1 })
      expect((await dettaglio(a)).risolto_aggiornato).toBe(false)
      const id = await metti(a, "v", "risolvi")
      await aspetta(() => finito(a, id))
      expect(await dettaglio(a)).toMatchObject({ risolto_aggiornato: true, risolto: { durata: 12.5 } })
      const risolto = eventi.messaggi.findIndex((m) => m.tipo === "video" && m.cosa === "risolto")
      expect(risolto).toBeGreaterThanOrEqual(0)
      expect(risolto).toBeLessThan(eventi.messaggi.findLastIndex((m) => m.tipo === "lavori"))
      eventi.chiudi()
    })

    test("anteprima: il file nuovo è fra le uscite appena il lavoro è finito", async () => {
      const a = await conOsservatoreLento()
      const id = (await chiama<{ id: string }>(a, "POST", "/api/video/v/lavori", { comando: "anteprima", scena: "s" })).corpo.id
      await aspetta(() => finito(a, id))
      expect((await dettaglio(a)).uscite.map((u) => u.file)).toContain("video/v/uscite/anteprima.mp4")
    })

    test("controlla: il controllo si annuncia prima della fine, e una volta sola anche quando l'osservatore arriva", async () => {
      const a = await conOsservatoreLento()
      const eventi = await ascolta(a)
      const id = await metti(a, "v", "controlla")
      await aspetta(() => finito(a, id))
      const controlli = () => eventi.messaggi.filter((m) => m.tipo === "video" && m.cosa === "controllo")
      expect(controlli()).toHaveLength(1)
      await Bun.sleep(2000)
      expect(controlli()).toHaveLength(1)
      eventi.chiudi()
    })

    test("prepara-file: le parole del file sono nell'elenco del girato appena il lavoro è finito", async () => {
      const a = await conOsservatoreLento()
      const id = (await chiama<{ id: string }>(a, "POST", "/api/grezzo/prepara", { file: "2026-10-06/a.mp4" })).corpo.id
      await aspetta(() => finito(a, id))
      const giorni = (await chiama<{ file: { file: string; preparato: { parole: string | null } }[] }[]>(a, "GET", "/api/grezzo")).corpo
      expect(giorni[0]!.file.find((f) => f.file === "2026-10-06/a.mp4")!.preparato.parole).toBe("preparati/2026-10-06/a.mp4/parole.json")
    })
  })

  test("mentre gira, il lavoro mostra le righe che scrive", async () => {
    const a = await conDueVideo()
    await metti(a, "v", "monta")
    const corso = await aspetta(async () => (await lavori(a)).in_corso?.righe.includes("monta v"))
    expect(corso).toBe(true)
    await sblocca(a, "v")
  })

  test("DELETE ferma il lavoro in corso per PID, con i suoi figli, e la coda va avanti", async () => {
    const a = await conDueVideo()
    const primo = await metti(a, "v", "monta")
    const secondo = await metti(a, "w", "monta")
    const pid = await pidDi(a, "pid-v")
    const figlio = await pidDi(a, "figlio-v")
    expect(èVivo(pid) && èVivo(figlio)).toBe(true)

    const r = await chiama<{ ok: boolean; esito: string }>(a, "DELETE", `/api/lavori/${primo}`)
    expect(r.corpo).toEqual({ ok: true, esito: "fermato" })
    expect(èVivo(pid)).toBe(false)
    expect(èVivo(figlio)).toBe(false)
    await aspetta(async () => (await lavori(a)).in_corso?.id === secondo)
    expect((await lavori(a)).finiti[0]).toMatchObject({ id: primo, esito: "fermato", errore: null })
    await sblocca(a, "w")
  })

  test("DELETE toglie dalla coda un lavoro che non è partito; un id che non c'è è 404", async () => {
    const a = await conDueVideo()
    await metti(a, "v", "monta")
    await aspetta(async () => (await lavori(a)).in_corso !== null)
    const inAttesa = await metti(a, "w", "monta")
    expect((await chiama(a, "DELETE", `/api/lavori/${inAttesa}`)).corpo).toEqual({ ok: true, esito: "tolto" })
    expect((await lavori(a)).in_coda).toEqual([])
    const r = await chiama<{ errore: string }>(a, "DELETE", `/api/lavori/${inAttesa}`)
    expect(r.stato).toBe(404)
    expect(r.corpo.errore).toContain("già finito")
    await sblocca(a, "v")
  })

  test("ferma il server: il lavoro in corso si ferma per PID", async () => {
    const a = await conDueVideo()
    await metti(a, "v", "monta")
    const pid = await pidDi(a, "pid-v")
    const figlio = await pidDi(a, "figlio-v")
    await a.server.ferma()
    expect(èVivo(pid)).toBe(false)
    expect(èVivo(figlio)).toBe(false)
  })

  test("i finiti restano su archivio/lavori.jsonl, tornano dopo un riavvio e il file ha una ritenzione", async () => {
    const vecchi = Array.from({ length: 105 }, (_, i) => JSON.stringify({ id: `vecchio${i}`, slug: "v", comando: "controlla", file: null, iniziato: "2026-10-01T10:00:00.000Z", finito: "2026-10-01T10:00:01.000Z", esito: "riuscito", errore: null, righe: [] }))
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
      await writeFile(join(c.archivio, "lavori.jsonl"), vecchi.join("\n") + "\n")
    })
    expect((await lavori(a)).finiti).toHaveLength(20)
    expect((await lavori(a)).finiti[0]!.id).toBe("vecchio104")
    await metti(a, "v", "controlla")
    await aspetta(async () => (await lavori(a)).finiti[0]?.comando === "controlla" && (await lavori(a)).finiti[0]?.id !== "vecchio104")
    await aspetta(async () => (await readFile(join(a.archivio, "lavori.jsonl"), "utf-8")).trim().split("\n").length === 20)
    expect((await lavori(a)).finiti).toHaveLength(20)
    await a.server.ferma()

    const b = await avviaAmbiente({ archivio: a.archivio, stile: a.stile })
    const dopo = await lavori(b)
    expect(dopo.finiti).toHaveLength(20)
    expect(dopo.finiti[0]).toMatchObject({ comando: "controlla", esito: "riuscito" })
  })

  describe("un lavoro interrotto dalla morte del server", () => {
    const INTERROTTO = "Il server si è fermato mentre il lavoro girava: il lavoro non è finito. Rilancialo."

    test("chiudendo il server a metà, il lavoro torna fra i finiti come «interrotto», non «fermato»", async () => {
      const a = await conDueVideo()
      const id = await metti(a, "v", "monta")
      await pidDi(a, "pid-v")
      await a.server.ferma()

      const b = await avviaAmbiente({ archivio: a.archivio, stile: a.stile })
      const dopo = await lavori(b)
      expect(dopo.in_corso).toBeNull()
      expect(dopo.in_coda).toEqual([])
      expect(dopo.finiti[0]).toMatchObject({ id, slug: "v", comando: "monta", esito: "interrotto", errore: INTERROTTO })
    })

    test("se il server muore senza chiudere, al riavvio il lavoro che risultava in corso è fra i finiti, una volta sola, nella lingua di chi l'aveva chiesto", async () => {
      const a = await conDueVideo()
      const id = await metti(a, "v", "monta")
      await pidDi(a, "pid-v")
      const file = join(a.archivio, "lavori.jsonl")
      const alVia = await readFile(file, "utf-8")
      await a.server.ferma()
      await writeFile(file, alVia)

      const b = await avviaAmbiente({ archivio: a.archivio, stile: a.stile })
      const dopo = await lavori(b)
      expect(dopo.finiti.filter((f) => f.id === id)).toHaveLength(1)
      expect(dopo.finiti[0]).toMatchObject({ id, comando: "monta", esito: "interrotto", errore: INTERROTTO })
      await b.server.ferma()

      const c = await avviaAmbiente({ archivio: a.archivio, stile: a.stile })
      expect((await lavori(c)).finiti.filter((f) => f.id === id)).toHaveLength(1)
    })

    test("un lavoro chiesto in inglese è interrotto con la frase inglese", async () => {
      const a = await conDueVideo()
      const risposta = await chiama<{ id: string }>(a, "POST", "/api/video/v/lavori", { comando: "monta" }, "en")
      await pidDi(a, "pid-v")
      const file = join(a.archivio, "lavori.jsonl")
      const alVia = await readFile(file, "utf-8")
      await a.server.ferma()
      await writeFile(file, alVia)

      const b = await avviaAmbiente({ archivio: a.archivio, stile: a.stile })
      expect((await lavori(b)).finiti[0]).toMatchObject({ esito: "interrotto", errore: "The server stopped while the job was running: the job did not finish. Start it again." })
    })

    test("un lavoro già finito non diventa interrotto al riavvio", async () => {
      const a = await conDueVideo()
      const id = await metti(a, "v", "monta")
      await aspetta(async () => (await lavori(a)).in_corso?.id === id)
      await sblocca(a, "v")
      await aspetta(async () => (await lavori(a)).finiti[0]?.id === id)
      await a.server.ferma()
      const b = await avviaAmbiente({ archivio: a.archivio, stile: a.stile })
      expect((await lavori(b)).finiti.filter((f) => f.id === id)).toMatchObject([{ esito: "riuscito" }])
    })
  })

  describe("la stima della durata", () => {
    const INIZIO = Date.parse("2026-10-01T10:00:00.000Z")
    let contatore = 0
    /** Una riga di `lavori.jsonl` finita in `secondi`; senza `secondiVideo` è una riga scritta prima che il campo ci fosse. */
    const riga = (comando: string, secondi: number, secondiVideo?: number | null, esito = "riuscito"): string =>
      JSON.stringify({
        id: `storia${contatore++}`,
        slug: "v",
        comando,
        file: null,
        iniziato: new Date(INIZIO).toISOString(),
        finito: new Date(INIZIO + secondi * 1000).toISOString(),
        esito,
        errore: null,
        righe: [],
        ...(secondiVideo === undefined ? {} : { secondi_video: secondiVideo }),
      })
    const risolto = { durata: 20, scene: [{ nome: "aggancio", durata: 4 }, { nome: "s", durata: 16 }] }
    const conStoria = (righe: string[], extra = {}) =>
      avviaAmbiente(extra, async (c) => {
        await scriviGrezzo(c, "2026-10-06/a.mp4")
        await scriviVideo(c, "v", undefined, piano())
        await scriviVideo(c, "w", undefined, piano())
        await mkdir(join(c.archivio, "video", "v", "lavoro"), { recursive: true })
        await writeFile(join(c.archivio, "video", "v", "lavoro", "risolto.json"), JSON.stringify(risolto))
        // w ha un risolto che non dice la durata: senza, all'avvio il server lo risolverebbe e la durata ci sarebbe.
        await writeFile(join(c.archivio, "video", "w", "lavoro", "risolto.json"), "{}")
        if (righe.length > 0) await writeFile(join(c.archivio, "lavori.jsonl"), righe.join("\n") + "\n")
      })
    const inCorsoDa = async (a: Ambiente, slug: string, comando = "monta") => {
      const id = await metti(a, slug, comando)
      return aspetta(async () => {
        const l = (await lavori(a)).in_corso
        return l?.id === id ? l : null
      })
    }

    test("senza lavori uguali finiti la stima manca, e il trascorso c'è lo stesso", async () => {
      const a = await conStoria([riga("monta", 30, 10, "fallito"), riga("risolvi", 2, 10), riga("risolvi", 2, 10), riga("risolvi", 2, 10)])
      const l = await inCorsoDa(a, "v")
      expect(l).toMatchObject({ secondi_video: 20, stima: null, fine_prevista: null })
      expect(l.trascorsi).toBeGreaterThanOrEqual(0)
      await sblocca(a, "v")
    })

    test("dai lavori uguali riusciti, per secondo del video da lavorare: la mediana, e la fine prevista dall'inizio", async () => {
      // 2, 4 e 3 s per secondo di video: la mediana è 3, e v dura 20 s. Quello fallito e gli altri comandi non contano.
      const a = await conStoria([riga("monta", 20, 10), riga("monta", 40, 10), riga("monta", 1, 10, "fallito"), riga("controlla", 500, 10), riga("monta", 30, 10)])
      const l = await inCorsoDa(a, "v")
      expect(l).toMatchObject({ secondi_video: 20, stima: 60 })
      expect(Date.parse(l.fine_prevista!) - Date.parse(l.iniziato)).toBe(60_000)
      await metti(a, "v", "controlla")
      expect((await lavori(a)).in_coda[0]).toMatchObject({ comando: "controlla", secondi_video: 20, stima: null })
      await sblocca(a, "v")
    })

    test("senza i secondi del video, la mediana delle durate dei lavori uguali che non li avevano", async () => {
      // w non ha un risolto: si guarda solo alle righe senza secondi (50, 90, 70 → 70), non a quelle per secondo.
      const a = await conStoria([riga("monta", 50), riga("monta", 90), riga("monta", 20, 10), riga("monta", 70, null), riga("monta", 40, 10)])
      const l = await inCorsoDa(a, "w")
      expect(l).toMatchObject({ secondi_video: null, stima: 70 })
      await sblocca(a, "w")
    })

    test("l'anteprima conta i secondi della scena o del pezzo; la preparazione quelli del girato ancora da trascrivere", async () => {
      const a = await conStoria([riga("anteprima", 8, 4), riga("anteprima", 12, 4), riga("anteprima", 10, 4)])
      await mkdir(join(a.archivio, "preparati", "2026-10-06", "b.mp4"), { recursive: true })
      await scriviGrezzo(a, "2026-10-06/b.mp4")
      await writeFile(join(a.archivio, "preparati", "2026-10-06", "b.mp4", "parole.json"), "[]")
      await aspetta(async () => (await chiama<{ file: { file: string; preparato: { parole: string | null } }[] }[]>(a, "GET", "/api/grezzo")).corpo[0]?.file.find((f) => f.file === "2026-10-06/b.mp4")?.preparato.parole)
      await inCorsoDa(a, "w")
      await chiama(a, "POST", "/api/video/v/lavori", { comando: "anteprima", scena: "aggancio" })
      await chiama(a, "POST", "/api/video/v/lavori", { comando: "anteprima", da: 2, a: 10 })
      await metti(a, "v", "prepara")
      await chiama(a, "POST", "/api/grezzo/prepara", { file: "2026-10-06/a.mp4" })
      await chiama(a, "POST", "/api/grezzo/prepara", { file: "2026-10-06/b.mp4" })
      expect((await lavori(a)).in_coda.map((l) => [l.comando, l.secondi_video, l.stima])).toEqual([
        ["anteprima", 4, 10],
        ["anteprima", 8, 20],
        ["prepara", 2, null],
        ["prepara-file", 2, null],
        ["prepara-file", 0, null],
      ])
      await sblocca(a, "w")
    })

    test("un lavoro finito ricorda i secondi del video, anche nel file", async () => {
      const a = await conStoria([])
      await inCorsoDa(a, "v")
      await sblocca(a, "v")
      await aspetta(async () => (await lavori(a)).finiti.length === 1)
      expect((await lavori(a)).finiti[0]).toMatchObject({ comando: "monta", secondi_video: 20 })
      const righe = (await readFile(join(a.archivio, "lavori.jsonl"), "utf-8")).trim().split(String.fromCharCode(10)).map((r) => JSON.parse(r) as { esito: string })
      expect(righe.at(-1)).toMatchObject({ comando: "monta", esito: "riuscito", secondi_video: 20 })
    })

    test("i lavori che servono alla stima restano nel file anche quando la ritenzione lo accorcia, e dopo un riavvio", async () => {
      const risolvi = Array.from({ length: 105 }, () => riga("risolvi", 1, 20))
      const a = await conStoria([riga("monta", 20, 10), riga("monta", 40, 10), riga("monta", 30, 10), ...risolvi])
      await metti(a, "v", "controlla")
      await aspetta(async () => (await readFile(join(a.archivio, "lavori.jsonl"), "utf-8")).trim().split("\n").length < 100)
      const tenute = (await readFile(join(a.archivio, "lavori.jsonl"), "utf-8")).trim().split("\n").map((r) => JSON.parse(r) as { comando: string; finito: string })
      expect(tenute.filter((r) => r.comando === "monta")).toHaveLength(3)
      expect(tenute.map((r) => r.finito)).toEqual(tenute.map((r) => r.finito).sort())
      expect((await lavori(a)).finiti).toHaveLength(20)
      await a.server.ferma()

      const b = await avviaAmbiente({ archivio: a.archivio, stile: a.stile, lavoro: a.radice })
      expect(await inCorsoDa(b, "v")).toMatchObject({ stima: 60 })
      await sblocca(b, "v")
    })
  })

  describe("la scheda segue il lavoro", () => {
    const schedaDi = async (a: Ambiente, slug: string) => ({
      letta: (await chiama<{ scheda: Record<string, unknown> }>(a, "GET", `/api/video/${slug}`)).corpo.scheda,
      suDisco: JSON.parse(await readFile(join(a.archivio, "video", slug, "scheda.json"), "utf-8")) as Record<string, unknown>,
    })

    test("il primo lavoro su una proposta la porta a «in lavorazione», il resto della scheda resta com'è", async () => {
      const a = await avviaAmbiente({}, async (c) => {
        await scriviGrezzo(c, "2026-10-06/a.mp4")
        await scriviVideo(c, "v", { titolo: "Il video", stato: "proposta", creato: "2026-10-06", note: "da girare" }, piano())
      })
      const eventi = await ascolta(a)
      await metti(a, "v", "controlla")
      const voluta = { titolo: "Il video", stato: "in lavorazione", creato: "2026-10-06", note: "da girare" }
      expect(await schedaDi(a, "v")).toEqual({ letta: voluta, suDisco: voluta })
      await aspetta(() => eventi.messaggi.some((m) => m.tipo === "video" && m.slug === "v" && m.cosa === "scheda"))
      eventi.chiudi()
    })

    test("gli altri stati non cambiano da soli", async () => {
      const stati = ["in lavorazione", "pronto", "pubblicato", "scartato"]
      const a = await avviaAmbiente({}, async (c) => {
        await scriviGrezzo(c, "2026-10-06/a.mp4")
        for (const stato of stati) await scriviVideo(c, stato.replace(" ", "-"), { titolo: stato, stato, creato: "2026-10-06" }, piano())
      })
      for (const stato of stati) await metti(a, stato.replace(" ", "-"), "controlla")
      await aspetta(async () => (await lavori(a)).finiti.length === stati.length)
      for (const stato of stati) expect((await schedaDi(a, stato.replace(" ", "-"))).suDisco["stato"]).toBe(stato)
    })

    test("il risolvi che parte da solo dopo un piano nuovo non la cambia", async () => {
      const a = await conDueVideo()
      expect((await chiama(a, "PUT", "/api/video/v/piano", { ...piano(), coda: 1 })).stato).toBe(200)
      await aspetta(async () => (await lavori(a)).finiti.some((f) => f.comando === "risolvi"))
      expect((await schedaDi(a, "v")).suDisco["stato"]).toBe("proposta")
    })
  })

  test("se Python non c'è, il lavoro fallisce dicendo cosa fare", async () => {
    const a = await conDueVideo({ motore: { eseguibile: "python-che-non-esiste", modulo: "motore", ambiente: {} } })
    await metti(a, "v", "controlla")
    await aspetta(async () => (await lavori(a)).finiti.length === 1)
    const [f] = (await lavori(a)).finiti
    expect(f!.esito).toBe("fallito")
    expect(f!.errore).toContain("Non riesco ad avviare «python-che-non-esiste»")
    expect(f!.errore).toContain("PATH")
  })

  test("le variabili d'ambiente scelgono l'eseguibile e il comando", async () => {
    const { opzioniDaAmbiente } = await import("../src/configurazione")
    const lavoro = await cartellaDiLavoro()
    const o = opzioniDaAmbiente({ MANGO_ANIMATION_LAVORO: lavoro, MANGO_ANIMATION_PYTHON: "py", MANGO_ANIMATION_MODULO: "altro", MANGO_ANIMATION_PORTA: "5000", MANGO_ANIMATION_PORTA_ARRIVI: "5001" })
    expect(o.motore).toMatchObject({ eseguibile: "py", modulo: "altro" })
    expect([o.porta, o.arrivi.porta]).toEqual([5000, 5001])
    expect(opzioniDaAmbiente({ MANGO_ANIMATION_LAVORO: lavoro }).porta).toBe(47431)
    expect(opzioniDaAmbiente({ MANGO_ANIMATION_LAVORO: lavoro }).indirizzo).toBe("127.0.0.1")
    expect(() => opzioniDaAmbiente({ MANGO_ANIMATION_LAVORO: lavoro, MANGO_ANIMATION_PORTA: "abc" })).toThrow("porta valida")
  })

  test("la cartella di lavoro viene da una variabile sola, e l'archivio sta dentro; il codice è un altro posto", async () => {
    const { opzioniDaAmbiente } = await import("../src/configurazione")
    const lavoro = await cartellaDiLavoro()
    const o = opzioniDaAmbiente({ MANGO_ANIMATION_LAVORO: lavoro })
    expect(o.lavoro).toBe(resolve(lavoro))
    expect(o.archivio).toBe(join(resolve(lavoro), "archivio"))
    expect(o.codice).not.toBe(o.lavoro)
    expect(existsSync(join(o.codice, "server", "package.json"))).toBe(true)
  })

  test("senza cartella di lavoro, o con una che non c'è, il server non parte e dice cosa fare", async () => {
    const { opzioniDaAmbiente } = await import("../src/configurazione")
    expect(() => opzioniDaAmbiente({})).toThrow("MANGO_ANIMATION_LAVORO")
    expect(() => opzioniDaAmbiente({ MANGO_ANIMATION_LAVORO: "" })).toThrow("cartella di lavoro")
    const mancante = join(await cartellaDiLavoro(), "non-c-e")
    expect(() => opzioniDaAmbiente({ MANGO_ANIMATION_LAVORO: mancante })).toThrow("non c'è")
  })

  test("il motore parte dalla cartella del codice e trova i dati nella cartella di lavoro", async () => {
    const a = await conDueVideo()
    await metti(a, "v", "controlla")
    await aspetta(async () => (await lavori(a)).finiti.length === 1)
    expect(await righeDelFinto(a)).toContain("fine controlla v")
    expect(existsSync(join(a.archivio, "video", "v", "lavoro", "controllo.json"))).toBe(true)
    expect(a.codice).not.toBe(a.radice)
  })

  describe("la codifica della registrazione dello schermo", () => {
    const scheda = (codifica: string[]) => codifica[codifica.indexOf("-gpu") + 1]

    test("la scheda del profilo codifica con il suo indice", async () => {
      const { codificaRegistrazione } = await import("../src/configurazione")
      for (const indice of [0, 2]) {
        const codifica = codificaRegistrazione(indice, true)
        expect(codifica).toContain("h264_nvenc")
        expect(scheda(codifica)).toBe(String(indice))
      }
    })

    test("senza una scheda indicata, la scheda NVIDIA che c'è; senza nessuna, il processore", async () => {
      const { codificaRegistrazione } = await import("../src/configurazione")
      const conScheda = codificaRegistrazione(undefined, true)
      expect(conScheda).toContain("h264_nvenc")
      expect(conScheda).not.toContain("-gpu")
      expect(codificaRegistrazione(undefined, false)).toContain("libx264")
    })

    test("il profilo può chiedere il processore anche se la scheda c'è", async () => {
      const { codificaRegistrazione } = await import("../src/configurazione")
      expect(codificaRegistrazione(null, true)).toContain("libx264")
    })

    test("la scheda viene da macchina.scheda_registrazione del profilo che gli si dà", async () => {
      const { opzioniDaAmbiente } = await import("../src/configurazione")
      const { codifica } = opzioniDaAmbiente({ MANGO_ANIMATION_LAVORO: await cartellaDiLavoro() }, true).registrazione
      expect(codifica({})).not.toContain("-gpu")
      expect(scheda(codifica({ macchina: { scheda_registrazione: 3 } }))).toBe("3")
      expect(codifica({ macchina: { scheda_registrazione: null } })).toContain("libx264")
    })
  })

  describe("POST /api/video/:slug/lavori", () => {
    test("rifiuta un comando che non c'è, un video senza piano, un video che non c'è", async () => {
      const a = await avviaAmbiente({}, async (c) => {
        await scriviVideo(c, "senza-piano")
      })
      const comandoStrano = await chiama<{ errore: string }>(a, "POST", "/api/video/senza-piano/lavori", { comando: "cancella-tutto" })
      expect(comandoStrano.stato).toBe(400)
      expect(comandoStrano.corpo.errore).toContain("prepara, risolvi, monta, anteprima, controlla, copertina, carosello, prova")
      const senzaPiano = await chiama<{ errore: string }>(a, "POST", "/api/video/senza-piano/lavori", { comando: "monta" })
      expect(senzaPiano.stato).toBe(409)
      expect(senzaPiano.corpo.errore).toContain("piano")
      expect((await chiama(a, "POST", "/api/video/non-c-e/lavori", { comando: "monta" })).stato).toBe(404)
      expect((await chiama(a, "POST", "/api/video/senza-piano/lavori", {})).stato).toBe(400)
    })

    test("un carosello non ha piano: accetta solo il comando carosello, che un video non accetta", async () => {
      const a = await avviaAmbiente({}, async (c) => {
        await scriviVideo(c, "giro", { titolo: "Un giro", stato: "proposta", creato: "2026-11-02", formato: "carosello" })
        await scriviVideo(c, "senza-piano")
      })
      expect((await chiama(a, "POST", "/api/video/giro/lavori", { comando: "carosello" })).stato).toBe(202)
      await aspetta(async () => (await lavori(a)).finiti.length === 1)
      expect((await righeDelFinto(a)).filter((r) => r.startsWith("inizio"))).toEqual(["inizio carosello giro"])
      const monta = await chiama<{ errore: string }>(a, "POST", "/api/video/giro/lavori", { comando: "monta" })
      expect([monta.stato, monta.corpo.errore]).toEqual([409, expect.stringContaining("carosello")])
      const video = await chiama<{ errore: string }>(a, "POST", "/api/video/senza-piano/lavori", { comando: "carosello" })
      expect([video.stato, video.corpo.errore]).toEqual([409, expect.stringContaining("non è un carosello")])
      expect((await chiama(a, "POST", "/api/video/giro/lavori", { comando: "carosello", scena: "x" })).stato).toBe(400)
    })

    test("la prova prima di registrare non vuole il piano, e la proposta resta proposta: non c'è ancora niente da montare", async () => {
      const a = await avviaAmbiente({}, async (c) => {
        await scriviVideo(c, "idea", { titolo: "Un'idea", stato: "proposta", creato: "2026-11-03", proposta: { aggancio: "Prima.", centro: "", chiusa: "E tu?" } })
        await scriviVideo(c, "giro", { titolo: "Un giro", stato: "proposta", creato: "2026-11-02", formato: "carosello" })
      })
      expect((await chiama(a, "POST", "/api/video/idea/lavori", { comando: "prova" })).stato).toBe(202)
      await aspetta(async () => (await lavori(a)).finiti.length === 1)
      expect((await righeDelFinto(a)).filter((r) => r.startsWith("inizio"))).toEqual(["inizio prova idea"])
      expect((await chiama<{ scheda: { stato: string } }>(a, "GET", "/api/video/idea")).corpo.scheda.stato).toBe("proposta")
      const carosello = await chiama<{ errore: string }>(a, "POST", "/api/video/giro/lavori", { comando: "prova" })
      expect([carosello.stato, carosello.corpo.errore]).toEqual([409, expect.stringContaining("carosello")])
    })

    describe("anteprima e copertina", () => {
      const lancia = async (a: Ambiente, corpo: object): Promise<{ stato: number; errore?: string }> => {
        const r = await chiama<{ id?: string; errore?: string }>(a, "POST", "/api/video/v/lavori", corpo)
        return { stato: r.stato, errore: r.corpo.errore }
      }
      const chiamate = async (a: Ambiente): Promise<string[]> => (await righeDelFinto(a)).filter((r) => r.startsWith("inizio"))

      test("l'anteprima di una scena passa --scena al motore", async () => {
        const a = await conDueVideo()
        expect((await lancia(a, { comando: "anteprima", scena: "aggancio" })).stato).toBe(202)
        await aspetta(async () => (await lavori(a)).finiti.length === 1)
        expect(await chiamate(a)).toEqual(["inizio anteprima v --scena aggancio"])
      })

      test("l'anteprima di un pezzo passa --da e --a al motore", async () => {
        const a = await conDueVideo()
        expect((await lancia(a, { comando: "anteprima", da: 3.5, a: 9 })).stato).toBe(202)
        await aspetta(async () => (await lavori(a)).finiti.length === 1)
        expect(await chiamate(a)).toEqual(["inizio anteprima v --da 3.5 --a 9"])
      })

      test("l'anteprima vuole la scena oppure i due istanti, mai altro", async () => {
        const a = await conDueVideo()
        const casi: [object, string][] = [
          [{ comando: "anteprima" }, "scena"],
          [{ comando: "anteprima", da: 3 }, "da"],
          [{ comando: "anteprima", a: 3 }, "da"],
          [{ comando: "anteprima", da: 5, a: 5 }, "dopo"],
          [{ comando: "anteprima", da: -1, a: 5 }, "da"],
          [{ comando: "anteprima", da: "3", a: 5 }, "numeri"],
          [{ comando: "anteprima", scena: "x", da: 1, a: 2 }, "o la scena o"],
          [{ comando: "anteprima", scena: "" }, "scena"],
          [{ comando: "anteprima", scena: "--da" }, "scena"],
        ]
        for (const [corpo, parte] of casi) {
          const r = await lancia(a, corpo)
          expect([JSON.stringify(corpo), r.stato]).toEqual([JSON.stringify(corpo), 400])
          expect(r.errore).toContain(parte)
        }
        expect(await chiamate(a)).toEqual([])
      })

      test("la copertina passa il disegno e l'istante, che è facoltativo", async () => {
        const a = await conDueVideo()
        expect((await lancia(a, { comando: "copertina", disegno: "materiali/copertina.png" })).stato).toBe(202)
        expect((await lancia(a, { comando: "copertina", disegno: "materiali/copertina.png", istante: 2.5 })).stato).toBe(202)
        await aspetta(async () => (await lavori(a)).finiti.length === 2)
        expect(await chiamate(a)).toEqual(["inizio copertina v materiali/copertina.png", "inizio copertina v materiali/copertina.png --istante 2.5"])
      })

      test("la copertina vuole un disegno e un istante che non sia negativo", async () => {
        const a = await conDueVideo()
        for (const corpo of [{ comando: "copertina" }, { comando: "copertina", disegno: "" }, { comando: "copertina", disegno: "--istante" }, { comando: "copertina", disegno: "d.png", istante: -1 }, { comando: "copertina", disegno: "d.png", istante: "1" }]) {
          const r = await lancia(a, corpo)
          expect([JSON.stringify(corpo), r.stato]).toEqual([JSON.stringify(corpo), 400])
        }
        expect(await chiamate(a)).toEqual([])
      })

      test("un comando che non li usa rifiuta gli argomenti degli altri", async () => {
        const a = await conDueVideo()
        const r = await lancia(a, { comando: "monta", scena: "aggancio" })
        expect(r.stato).toBe(400)
        expect(r.errore).toContain("scena")
        expect(r.errore).toContain("anteprima")
        expect((await lancia(a, { comando: "anteprima", scena: "x", disegno: "d.png" })).stato).toBe(400)
        expect(await chiamate(a)).toEqual([])
      })
    })

    test("il dettaglio del video dice quale lavoro lo riguarda", async () => {
      const a = await conDueVideo()
      const id = await metti(a, "v", "monta")
      await aspetta(async () => (await lavori(a)).in_corso?.id === id)
      const secondo = await metti(a, "w", "monta")
      const dettaglio = (slug: string) => chiama<{ lavoro: { id: string; comando: string; stato: string } | null }>(a, "GET", `/api/video/${slug}`).then((r) => r.corpo.lavoro)
      expect(await dettaglio("v")).toEqual({ id, comando: "monta", stato: "in corso" })
      expect(await dettaglio("w")).toEqual({ id: secondo, comando: "monta", stato: "in coda" })
      await sblocca(a, "v")
      await sblocca(a, "w")
      await aspetta(async () => (await dettaglio("w")) === null)
    })

    describe("montaggio_superato", () => {
      const superato = async (a: Ambiente, slug: string): Promise<boolean> => (await chiama<{ montaggio_superato: boolean }>(a, "GET", `/api/video/${slug}`)).corpo.montaggio_superato
      const inCorsoDa = async (a: Ambiente, slug: string, comando = "monta"): Promise<void> => {
        const id = await metti(a, slug, comando)
        await aspetta(async () => (await lavori(a)).in_corso?.id === id)
        await Bun.sleep(60)
      }

      test("senza un montaggio in corso è falso, anche se il piano cambia", async () => {
        const a = await conDueVideo()
        expect(await superato(a, "v")).toBe(false)
        await chiama(a, "PUT", "/api/video/v/piano", { ...piano(), coda: 1 })
        expect(await superato(a, "v")).toBe(false)
      })

      test("un piano salvato dopo l'inizio del montaggio lo rende superato; quello di un altro video no", async () => {
        const a = await conDueVideo()
        await inCorsoDa(a, "v")
        expect(await superato(a, "v")).toBe(false)
        expect((await chiama(a, "PUT", "/api/video/v/piano", { ...piano(), coda: 1 })).stato).toBe(200)
        expect(await superato(a, "v")).toBe(true)
        expect(await superato(a, "w")).toBe(false)
        await sblocca(a, "v")
        await aspetta(async () => !(await superato(a, "v")))
      })

      test("vale anche per un piano riscritto da fuori, e il montaggio dopo non risulta superato", async () => {
        const a = await conDueVideo()
        await inCorsoDa(a, "v")
        await writeFile(join(a.archivio, "video", "v", "piano.json"), JSON.stringify({ ...piano(), coda: 2 }))
        await aspetta(async () => (await superato(a, "v")) || null)
        await sblocca(a, "v")
        await aspetta(async () => (await lavori(a)).in_corso?.comando !== "monta")
        await aspetta(async () => (await lavori(a)).in_corso === null)
        await rm(join(a.radice, "via-v"))
        await inCorsoDa(a, "v")
        expect(await superato(a, "v")).toBe(false)
        await sblocca(a, "v")
      })

      test("un piano salvato prima che il montaggio parta non lo rende superato", async () => {
        const a = await conDueVideo()
        await chiama(a, "PUT", "/api/video/v/piano", { ...piano(), coda: 1 })
        await aspetta(async () => (await lavori(a)).finiti.some((f) => f.comando === "risolvi"))
        await Bun.sleep(60)
        await inCorsoDa(a, "v")
        expect(await superato(a, "v")).toBe(false)
        await sblocca(a, "v")
      })

      test("lo stile cambiato dopo l'inizio lo rende superato", async () => {
        const a = await conDueVideo()
        await inCorsoDa(a, "v")
        const stile = JSON.parse(await readFile(a.stile, "utf-8")) as { uscita: { crf: number } }
        stile.uscita.crf += 1
        expect((await chiama(a, "PUT", "/api/stile", stile)).stato).toBe(200)
        expect(await superato(a, "v")).toBe(true)
        await sblocca(a, "v")
      })
    })
  })
})
