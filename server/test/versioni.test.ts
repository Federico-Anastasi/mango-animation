import { afterEach, describe, expect, test } from "bun:test"
import { readFile, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { descriviVersioni, type VersioneSalvata } from "../src/storia"
import { aspetta, avviaAmbiente, chiama, fermaTutti, piano, righeDelFinto, scriviGrezzo, scriviVideo } from "./aiuti"

afterEach(fermaTutti)

interface Riga {
  n: number | null
  da: string | null
  fino: string | null
  scene: number | null
  pezzi: number | null
  in_uso: boolean
}
interface Errore {
  errore: string
  problemi?: string[]
}

const salvata = (n: number, scene: number, fino: number): VersioneSalvata => ({ n, fino, testo: JSON.stringify({ scene: Array.from({ length: scene }, () => ({ pezzi: [{}, {}] })) }) })
const ISO = (ms: number): string => new Date(ms).toISOString()

describe("le versioni del piano, descritte", () => {
  test("dalla più recente: il piano di adesso, poi ogni versione col suo periodo; la più vecchia non ha «da»", () => {
    const righe = descriviVersioni([salvata(1, 1, 1000), salvata(2, 2, 2000)], { primo: 1, ultimo: 2, posizione: 3 }, { testo: salvata(0, 3, 0).testo, mtime: 3000 })
    expect(righe).toEqual([
      { n: null, da: ISO(3000), fino: null, scene: 3, pezzi: 6, in_uso: true },
      { n: 2, da: ISO(1000), fino: ISO(2000), scene: 2, pezzi: 4, in_uso: false },
      { n: 1, da: null, fino: ISO(1000), scene: 1, pezzi: 2, in_uso: false },
    ])
  })

  test("dopo un annulla la versione in uso è un file di storia, e quelle più nuove restano sopra", () => {
    const righe = descriviVersioni([salvata(1, 1, 1000), salvata(2, 2, 2000), salvata(3, 3, 3000)], { primo: 1, ultimo: 3, posizione: 2 }, { testo: salvata(2, 2, 0).testo, mtime: 4000 })
    expect(righe.map((r) => [r.n, r.in_uso])).toEqual([[3, false], [2, true], [1, false]])
    expect(righe[1]).toMatchObject({ da: ISO(4000), fino: null })
  })

  test("un piano che non si legge non ha i conti", () => {
    const righe = descriviVersioni([{ n: 1, fino: 1000, testo: "non è json" }], { primo: 1, ultimo: 1, posizione: 2 }, { testo: "{}", mtime: 2000 })
    expect(righe.map((r) => [r.scene, r.pezzi])).toEqual([[null, null], [null, null]])
  })
})

const conScene = (quante: number): Record<string, unknown> => ({ ...piano(), scene: Array.from({ length: quante }, (_, i) => ({ nome: `s${i}`, pezzi: [{ sorgente: "a", da: 0, a: 2 }] })) })
const elenco = async (a: Parameters<typeof chiama>[0], slug = "v") => (await chiama<{ versioni: Riga[] }>(a, "GET", `/api/video/${slug}/versioni`)).corpo.versioni
const leggiPiano = async (a: { archivio: string }, slug = "v"): Promise<unknown> => JSON.parse(await readFile(join(a.archivio, "video", slug, "piano.json"), "utf-8"))

async function conTrePiani() {
  const a = await avviaAmbiente({}, async (c) => {
    await scriviGrezzo(c, "2026-10-06/a.mp4")
    await scriviVideo(c, "v", undefined, conScene(1))
  })
  for (const scene of [2, 3, 4]) expect((await chiama(a, "PUT", "/api/video/v/piano", conScene(scene))).stato).toBe(200)
  return a
}

describe("le versioni del piano, nelle rotte", () => {
  test("l'elenco dà il piano di adesso e le versioni di prima coi conti di scene e pezzi", async () => {
    const a = await conTrePiani()
    const versioni = await elenco(a)
    expect(versioni.map((r) => [r.n, r.scene, r.pezzi, r.in_uso])).toEqual([[null, 4, 4, true], [3, 3, 3, false], [2, 2, 2, false], [1, 1, 1, false]])
    expect(versioni[0]).toMatchObject({ fino: null })
    expect(versioni[1]!.fino).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(versioni[3]!.da).toBeNull()
    expect(versioni[1]!.da).toBe(versioni[2]!.fino)
  })

  test("«Guarda»: una versione si legge com'era, senza toccare niente", async () => {
    const a = await conTrePiani()
    const r = await chiama<{ n: number; piano: unknown }>(a, "GET", "/api/video/v/versioni/2")
    expect(r.corpo).toEqual({ n: 2, piano: conScene(2) })
    expect(await leggiPiano(a)).toEqual(conScene(4))
    expect((await chiama<Errore>(a, "GET", "/api/video/v/versioni/9")).stato).toBe(404)
    expect((await chiama<Errore>(a, "GET", "/api/video/v/versioni/0")).stato).toBe(404)
    expect((await chiama<Errore>(a, "GET", "/api/video/non-c-e/versioni")).stato).toBe(404)
  })

  test("«Torna a questa»: il piano di adesso finisce in storia, e annullare riporta a lui", async () => {
    const a = await conTrePiani()
    const finiti = async () => {
      const { corpo } = await chiama<{ in_corso: unknown; in_coda: unknown[] }>(a, "GET", "/api/lavori")
      return corpo.in_corso === null && corpo.in_coda.length === 0
    }
    await aspetta(finiti)
    const prima = (await righeDelFinto(a)).filter((riga) => riga === "inizio risolvi v").length
    const r = await chiama<{ ok: boolean; piano: unknown; puo_annullare: boolean; puo_rifare: boolean }>(a, "POST", "/api/video/v/versioni/1/ripristina")
    expect(r.corpo).toEqual({ ok: true, piano: conScene(1), puo_annullare: true, puo_rifare: false })
    expect(await leggiPiano(a)).toEqual(conScene(1))
    expect(await readdir(join(a.archivio, "video", "v", "storia"))).toHaveLength(4)
    const versioni = await elenco(a)
    expect(versioni.map((r) => [r.n, r.scene, r.in_uso])).toEqual([[null, 1, true], [4, 4, false], [3, 3, false], [2, 2, false], [1, 1, false]])
    await aspetta(async () => (await righeDelFinto(a)).filter((riga) => riga === "inizio risolvi v").length > prima)

    expect((await chiama<{ piano: unknown }>(a, "POST", "/api/video/v/annulla")).corpo.piano).toEqual(conScene(4))
    expect((await chiama<{ piano: unknown }>(a, "POST", "/api/video/v/rifai")).corpo.piano).toEqual(conScene(1))
  })

  test("dopo un annulla le versioni più nuove restano, e annullare un ritorno porta a ciò che era in uso", async () => {
    const a = await conTrePiani()
    await chiama(a, "POST", "/api/video/v/annulla")
    await chiama(a, "POST", "/api/video/v/annulla")
    expect(await leggiPiano(a)).toEqual(conScene(2))
    expect((await chiama(a, "POST", "/api/video/v/versioni/1/ripristina")).stato).toBe(200)
    const versioni = await elenco(a)
    expect(versioni.filter((r) => r.in_uso)).toHaveLength(1)
    expect(versioni.map((r) => r.scene)).toEqual([1, 2, 4, 3, 2, 1])
    expect((await chiama<{ piano: unknown }>(a, "POST", "/api/video/v/annulla")).corpo.piano).toEqual(conScene(2))
  })

  test("la versione in uso, o una che non c'è, si rifiuta con una frase che dice perché", async () => {
    const a = await conTrePiani()
    const stessa = await chiama<Errore>(a, "POST", "/api/video/v/versioni/3/ripristina")
    expect(stessa.stato).toBe(200)
    const dinuovo = await chiama<Errore>(a, "POST", "/api/video/v/versioni/3/ripristina")
    expect(dinuovo.stato).toBe(409)
    expect(dinuovo.corpo.errore).toContain("già quella in uso")
    const manca = await chiama<Errore>(a, "POST", "/api/video/v/versioni/99/ripristina", undefined, "en")
    expect(manca.stato).toBe(404)
    expect(manca.corpo.errore).toContain("has no version 99")
  })

  test("una versione che non va più (il girato è sparito) non torna, e il piano non cambia", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviGrezzo(c, "2026-10-06/b.mp4")
      await scriviVideo(c, "v", undefined, piano("2026-10-06/b.mp4"))
    })
    await chiama(a, "PUT", "/api/video/v/piano", piano("2026-10-06/a.mp4"))
    await rm(join(a.archivio, "grezzo", "2026-10-06", "b.mp4"))
    await aspetta(async () => (await chiama<{ fase: unknown }>(a, "GET", "/api/video/v")).stato === 200)
    const r = await chiama<Errore>(a, "POST", "/api/video/v/versioni/1/ripristina")
    expect(r.stato).toBe(400)
    expect(r.corpo.errore).toContain("Il piano non è valido")
    expect(await leggiPiano(a)).toEqual(piano("2026-10-06/a.mp4"))
    expect(await elenco(a)).toHaveLength(2)
  })

  test("un video senza piano non ha versioni", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "v"))
    expect((await chiama(a, "GET", "/api/video/v/versioni")).stato).toBe(404)
    expect((await chiama(a, "POST", "/api/video/v/versioni/1/ripristina")).stato).toBe(404)
  })
})
