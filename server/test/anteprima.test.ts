import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, rm, utimes, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { aspetta, ascolta, avviaAmbiente, chiama, fermaTutti, piano, scriviGrezzo, scriviVideo, type Ambiente, type Cartelle } from "./aiuti"

afterEach(fermaTutti)

interface VoceElenco {
  slug: string
  miniatura: string | null
  anteprima: string | null
}

const SCHEDA = { titolo: "Una proposta", stato: "proposta", creato: "2026-11-03" }
const elenco = async (a: Ambiente): Promise<VoceElenco[]> => (await chiama<VoceElenco[]>(a, "GET", "/api/video")).corpo
const scrivi = async (percorso: string, tempo?: number): Promise<void> => {
  await mkdir(dirname(percorso), { recursive: true })
  await writeFile(percorso, "immagine")
  if (tempo !== undefined) await utimes(percorso, tempo, tempo)
}
const materiali = (a: Cartelle, slug: string, nome: string): string => join(a.archivio, "video", slug, "materiali", nome)
const uscite = (a: Cartelle, slug: string, nome: string): string => join(a.archivio, "video", slug, "uscite", nome)

describe("l'anteprima di una proposta", () => {
  test("materiali/anteprima.png è l'anteprima del video, e l'elenco la dà come miniatura; senza, è null", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "con", SCHEDA)
      await scrivi(materiali(c, "con", "anteprima.png"))
      await scriviVideo(c, "senza", SCHEDA)
    })
    const voci = await elenco(a)
    expect(voci.find((v) => v.slug === "con")).toMatchObject({ anteprima: "video/con/materiali/anteprima.png", miniatura: "video/con/materiali/anteprima.png" })
    expect(voci.find((v) => v.slug === "senza")).toMatchObject({ anteprima: null, miniatura: null })
    expect((await fetch(`${a.url}/media/video/con/materiali/anteprima.png`, { headers: a.accesso })).status).toBe(200)
  })

  test("jpg, jpeg e webp valgono come png; fra più file vince il più recente", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "foto", SCHEDA)
      await scrivi(materiali(c, "foto", "anteprima.png"), 1_700_000_000)
      await scrivi(materiali(c, "foto", "anteprima.jpg"), 1_700_000_100)
      await scriviVideo(c, "disegno", SCHEDA)
      await scrivi(materiali(c, "disegno", "anteprima.webp"))
      await scriviVideo(c, "altro-nome", SCHEDA)
      await scrivi(materiali(c, "altro-nome", "copertina-provvisoria.png"))
    })
    const voci = await elenco(a)
    expect(voci.find((v) => v.slug === "foto")!.anteprima).toBe("video/foto/materiali/anteprima.jpg")
    expect(voci.find((v) => v.slug === "disegno")!.anteprima).toBe("video/disegno/materiali/anteprima.webp")
    expect(voci.find((v) => v.slug === "altro-nome")!.anteprima).toBeNull()
  })

  test("l'ordine: copertina, miniatura dell'uscita e prima slide vengono prima; l'anteprima prima del girato e della prova", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await mkdir(join(c.archivio, "preparati", "2026-10-06", "a.mp4"), { recursive: true })
      await writeFile(join(c.archivio, "preparati", "2026-10-06", "a.mp4", "miniatura.jpg"), "jpg")
      for (const slug of ["copertina", "uscita", "slide", "girato", "prova"]) await scriviVideo(c, slug, { ...SCHEDA, titolo: slug }, slug === "girato" ? piano() : undefined)
      for (const slug of ["copertina", "uscita", "slide", "girato", "prova"]) await scrivi(materiali(c, slug, "anteprima.png"))
      await scrivi(uscite(c, "copertina", "copertina.png"))
      await scrivi(uscite(c, "uscita", "miniatura.jpg"))
      await scrivi(uscite(c, "slide", "slide-1.png"))
      await scrivi(uscite(c, "prova", "prova.jpg"))
    })
    const miniatura = async (slug: string): Promise<string | null | undefined> => (await elenco(a)).find((v) => v.slug === slug)?.miniatura
    expect(await miniatura("copertina")).toBe("video/copertina/uscite/copertina.png")
    expect(await miniatura("uscita")).toBe("video/uscita/uscite/miniatura.jpg")
    expect(await miniatura("slide")).toBe("video/slide/uscite/slide-1.png")
    expect(await miniatura("girato")).toBe("video/girato/materiali/anteprima.png")
    expect(await miniatura("prova")).toBe("video/prova/materiali/anteprima.png")
  })

  test("senza anteprima restano le fonti di prima, con l'anteprima null", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await mkdir(join(c.archivio, "preparati", "2026-10-06", "a.mp4"), { recursive: true })
      await writeFile(join(c.archivio, "preparati", "2026-10-06", "a.mp4", "miniatura.jpg"), "jpg")
      await scriviVideo(c, "girato", SCHEDA, piano())
    })
    expect((await elenco(a))[0]).toMatchObject({ miniatura: "preparati/2026-10-06/a.mp4/miniatura.jpg", anteprima: null })
  })

  test("compare, cambia e sparisce da sola quando il file cambia, e lo annuncia", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "v", SCHEDA)
    })
    const ascolto = await ascolta(a)
    const arrivi = () => ascolto.messaggi.filter((m) => m.tipo === "video" && m.slug === "v" && m.cosa === "materiali").length

    await scrivi(materiali(a, "v", "anteprima.png"))
    await aspetta(async () => (await elenco(a))[0]?.anteprima === "video/v/materiali/anteprima.png")
    expect(arrivi()).toBeGreaterThan(0)

    await scrivi(materiali(a, "v", "anteprima.jpg"), Date.now() / 1000 + 60)
    await aspetta(async () => (await elenco(a))[0]?.miniatura === "video/v/materiali/anteprima.jpg")

    await rm(materiali(a, "v", "anteprima.jpg"))
    await aspetta(async () => (await elenco(a))[0]?.miniatura === "video/v/materiali/anteprima.png")
    await rm(materiali(a, "v", "anteprima.png"))
    await aspetta(async () => (await elenco(a))[0]?.anteprima === null)
    expect((await elenco(a))[0]!.miniatura).toBeNull()
    ascolto.chiudi()
  })
})
