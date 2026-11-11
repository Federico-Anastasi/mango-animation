import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { aspetta, avviaAmbiente, chiama, fermaTutti, piano, righeDelFinto, scriviGrezzo, scriviVideo, type Ambiente } from "./aiuti"

// La finta resa delle scene: stampa i percorsi come fa `animazioni/script/foto.ts`; «lenta» aspetta il file `via-lenta` accanto allo script.
const FINTE_SCENE = `import { existsSync } from "node:fs"
import { join } from "node:path"
const sigla = Bun.argv[2]
if (sigla === "rotta") {
  console.error("Non esiste una scena «rotta» in animazioni/. Le sigle sono: ok, difetto, tante.")
  process.exit(1)
}
if (sigla === "lenta") while (!existsSync(join(import.meta.dir, "via-lenta"))) await Bun.sleep(30)
for (const t of ["0", "2,5"]) console.log(join(import.meta.dir, sigla + "-" + t + "s.png"))
if (sigla === "difetto") {
  console.log("\\n2 segnalazioni:\\n- difetto a 2,5 s: testo sotto i 40 px (30 px): «ciao»\\n- difetto da 0 s a 3 s: lo sfondo resta fermo")
  process.exit(1)
}
if (sigla === "tante") {
  console.log("\\n40 segnalazioni:\\n" + Array.from({ length: 40 }, (_, i) => "- tante a " + i + " s: testo sotto i 40 px").join("\\n"))
  process.exit(1)
}
`

let cartella: string
beforeAll(async () => {
  // Il nome intero: la cartella temporanea può arrivare col nome corto di Windows, e lo script stampa i percorsi con quello lungo.
  cartella = await realpath(await mkdtemp(join(tmpdir(), "mango-animation-finte-scene-")))
  await writeFile(join(cartella, "scene.ts"), FINTE_SCENE)
})
afterAll(() => rm(cartella, { recursive: true, force: true }))
afterEach(fermaTutti)

interface Finito {
  id: string
  comando: string
  slug: string | null
  esito: string
  errore: string | null
  righe: string[]
  risultato?: { png: string[]; segnalazioni: string[] }
}
interface Lavori {
  in_corso: { id: string; comando: string } | null
  in_coda: { id: string; comando: string }[]
  finiti: Finito[]
}

const lavori = async (a: Ambiente): Promise<Lavori> => (await chiama<Lavori>(a, "GET", "/api/lavori")).corpo
const finito = (a: Ambiente, id: string): Promise<Finito> => aspetta(async () => (await lavori(a)).finiti.find((f) => f.id === id))
const foto = (a: Ambiente, corpo: unknown) => chiama<{ id: string; errore?: string }>(a, "POST", "/api/animazioni/foto", corpo)
const avvia = (extra = {}) =>
  avviaAmbiente({ comandoSceneFoto: [process.execPath, join(cartella, "scene.ts")], ...extra }, async (c) => {
    await scriviGrezzo(c, "2026-10-06/a.mp4")
    await scriviVideo(c, "v", undefined, piano())
  })

describe("POST /api/animazioni/foto", () => {
  test("è un lavoro della coda: i percorsi delle foto e le segnalazioni stanno nel risultato", async () => {
    const a = await avvia()
    const r = await foto(a, { sigla: "ok" })
    expect(r.stato).toBe(202)
    const fine = await finito(a, r.corpo.id)
    expect(fine).toMatchObject({ comando: "scene-foto", slug: null, esito: "riuscito", errore: null })
    expect(fine.risultato).toEqual({ png: [join(cartella, "ok-0s.png"), join(cartella, "ok-2,5s.png")], segnalazioni: [] })
  })

  test("un controllo fallito è un lavoro riuscito con le segnalazioni, anche se superano le righe tenute", async () => {
    const a = await avvia()
    const difetto = await finito(a, (await foto(a, { sigla: "difetto" })).corpo.id)
    expect(difetto).toMatchObject({ esito: "riuscito", errore: null })
    expect(difetto.risultato?.segnalazioni).toEqual(["difetto a 2,5 s: testo sotto i 40 px (30 px): «ciao»", "difetto da 0 s a 3 s: lo sfondo resta fermo"])
    const tante = await finito(a, (await foto(a, { sigla: "tante" })).corpo.id)
    expect(tante.righe.length).toBeLessThan(40)
    expect(tante.risultato?.segnalazioni).toHaveLength(40)
    expect(tante.risultato?.png).toHaveLength(2)
  })

  test("una scena che non c'è fallisce con la frase dello script", async () => {
    const a = await avvia()
    const fine = await finito(a, (await foto(a, { sigla: "rotta" })).corpo.id)
    expect(fine).toMatchObject({ esito: "fallito", errore: "Non esiste una scena «rotta» in animazioni/. Le sigle sono: ok, difetto, tante." })
    expect(fine.risultato).toBeUndefined()
  })

  test("aspetta il suo turno dietro a un montaggio e prende la scheda come gli altri lavori sulla scheda", async () => {
    const chiamate: string[] = []
    const a = await avvia({ schede: { prendi: async (s: number | null | undefined) => (chiamate.push(`prendi ${s}`), null), rendi: async () => (chiamate.push("rendi"), null) } })
    await chiama(a, "POST", "/api/video/v/lavori", { comando: "monta" })
    await aspetta(async () => (await lavori(a)).in_corso?.comando === "monta")
    const { id } = (await foto(a, { sigla: "lenta" })).corpo
    await Bun.sleep(300)
    const durante = await lavori(a)
    expect(durante.in_corso?.comando).toBe("monta")
    expect(durante.in_coda).toMatchObject([{ id, comando: "scene-foto" }])
    expect(await righeDelFinto(a)).toEqual(["inizio monta v"])
    await writeFile(join(a.radice, "via-v"), "")
    await aspetta(async () => (await lavori(a)).in_corso?.id === id)
    await writeFile(join(cartella, "via-lenta"), "")
    expect((await finito(a, id)).esito).toBe("riuscito")
    await aspetta(() => chiamate.includes("rendi"))
    expect(chiamate).toEqual(["prendi undefined", "prendi undefined", "rendi"])
    await rm(join(cartella, "via-lenta"), { force: true })
  })

  test("una sigla che non è una sigla è un 400, in italiano e in inglese", async () => {
    const a = await avvia()
    for (const corpo of [{}, { sigla: 3 }, { sigla: "--tutte" }, { sigla: "a b" }, { sigla: "" }]) expect((await foto(a, corpo)).stato).toBe(400)
    const inglese = await chiama<{ errore: string }>(a, "POST", "/api/animazioni/foto", { sigla: "--tutte" }, "en")
    expect(inglese.corpo.errore).toContain("scene code")
  })
})
