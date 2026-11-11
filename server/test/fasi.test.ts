import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, utimes, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { faseDelVideo, type Fase } from "../src/fasi"
import { voceVuota, type Uscita, type VoceVideo } from "../src/indice"
import { aspetta, avviaAmbiente, chiama, fermaTutti, piano, scriviGrezzo, scriviVideo, type Cartelle } from "./aiuti"

afterEach(fermaTutti)

const uscita = (nome: string): Uscita => ({ file: `video/v/uscite/${nome}`, byte: 1, cambiato: "2026-11-05T10:00:00.000Z", stesso_file: null })

/** Un video con una scheda e i fatti che si dicono, e niente altro. */
function video(fatti: { stato?: string; formato?: string; proposta?: object; anteprima?: boolean; uscite?: string[]; testo?: boolean; piano?: { animazione?: boolean } }): VoceVideo {
  const voce = voceVuota("v")
  voce.scheda = { titolo: "V", stato: fatti.stato ?? "proposta", creato: "2026-11-05", ...(fatti.formato ? { formato: fatti.formato } : {}), ...(fatti.proposta ? { proposta: fatti.proposta } : {}) }
  voce.anteprima = fatti.anteprima ? { file: "video/v/materiali/anteprima.png", mtime: 1 } : null
  voce.uscite = (fatti.uscite ?? []).map(uscita)
  voce.testoRegistrato = fatti.testo ?? false
  if (fatti.piano) {
    voce.pianoTesto = "{}"
    voce.pianoConBase = { quadro: "q", scene: [{ nome: "s", pezzi: [], ...(fatti.piano.animazione ? { animazione: "a1" } : {}) }] }
  }
  return voce
}

describe("la fase di un video", () => {
  test("ogni insieme di file dà il suo passo e la cosa da chiedere", () => {
    const copione = { aggancio: "Ciao" }
    const casi: Array<[string, VoceVideo, boolean, Fase]> = [
      ["scheda e basta", video({}), false, { passo: 1, azione: "idea" }],
      ["con l'anteprima", video({ anteprima: true }), false, { passo: 2, azione: "copione" }],
      ["con il copione", video({ proposta: copione }), false, { passo: 3, azione: "prova" }],
      ["con uno spezzone al posto dell'aggancio", video({ proposta: { spezzoni: [{ file: "a/b.mp4" }] } }), false, { passo: 3, azione: "prova" }],
      ["con la prova", video({ proposta: copione, uscite: ["prova.mp4"] }), false, { passo: 4, azione: "riprese" }],
      ["con un piano e basta (girato aggiunto a mano)", video({ piano: {} }), false, { passo: 4, azione: "testo" }],
      ["col testo registrato", video({ proposta: copione, testo: true, piano: {} }), false, { passo: 5, azione: "animazioni" }],
      ["con le animazioni nel piano", video({ testo: true, piano: { animazione: true } }), false, { passo: 6, azione: "monta" }],
      ["col montato, piano non toccato", video({ piano: {}, uscite: ["finale.mp4"] }), false, { passo: 6, azione: "guarda" }],
      ["col montato e il piano cambiato dopo", video({ piano: {}, uscite: ["finale.mp4"] }), true, { passo: 7, azione: "correzioni" }],
      ["pronto", video({ stato: "pronto", piano: {}, uscite: ["finale.mp4"] }), false, { passo: 8, azione: "pubblica" }],
      ["pubblicato", video({ stato: "pubblicato", uscite: ["finale.mp4"] }), false, { passo: 8, azione: "fatto" }],
    ]
    for (const [nome, voce, piuNuovo, atteso] of casi) expect([nome, faseDelVideo(voce, piuNuovo)]).toEqual([nome, atteso])
  })

  test("un carosello e un video scartato non hanno fase", () => {
    expect(faseDelVideo(video({ formato: "carosello" }), false)).toBeNull()
    expect(faseDelVideo(video({ stato: "scartato", piano: {} }), false)).toBeNull()
  })

  test("un video già uscito resta all'ultimo passo anche senza piano né prova", () => {
    expect(faseDelVideo(video({ stato: "pubblicato" }), false)).toEqual({ passo: 8, azione: "fatto" })
  })
})

const scrivi = async (percorso: string, contenuto = "x", tempo?: number): Promise<void> => {
  await mkdir(dirname(percorso), { recursive: true })
  await writeFile(percorso, contenuto)
  if (tempo !== undefined) await utimes(percorso, tempo, tempo)
}
const dentro = (c: Cartelle, slug: string, ...parti: string[]): string => join(c.archivio, "video", slug, ...parti)
const SCHEDA = { titolo: "Un video", stato: "proposta", creato: "2026-11-03" }
const COPIONE = { ...SCHEDA, proposta: { aggancio: "Ciao", centro: "Una cosa" } }

describe("la fase nelle rotte", () => {
  test("l'elenco e il dettaglio dicono la fase ricavata dai file, e la seguono quando i file cambiano", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "idea", SCHEDA)
      await scriviVideo(c, "copione", SCHEDA)
      await scrivi(dentro(c, "copione", "materiali", "anteprima.png"))
      await scriviVideo(c, "prova", COPIONE)
      await scriviVideo(c, "riprese", COPIONE)
      await scrivi(dentro(c, "riprese", "uscite", "prova.mp4"))
      await scriviVideo(c, "testo", SCHEDA, piano())
      await scriviVideo(c, "animazioni", COPIONE, piano())
      await scrivi(dentro(c, "animazioni", "materiali", "testo-registrato.md"))
      await scriviVideo(c, "da-montare", SCHEDA, { quadro: "sagoma-su-animazione", sorgenti: { a: { file: "2026-10-06/a.mp4" } }, scene: [{ nome: "s", animazione: "a1", pezzi: [{ sorgente: "a", da: 0, a: 2 }] }] })
      await scriviVideo(c, "montato", { ...SCHEDA, stato: "in lavorazione" }, piano())
      await scrivi(dentro(c, "montato", "uscite", "finale.mp4"), "x", 4_102_444_800)
      await scriviVideo(c, "corretto", { ...SCHEDA, stato: "in lavorazione" }, piano())
      await scrivi(dentro(c, "corretto", "uscite", "finale.mp4"), "x", 1_700_000_000)
      await scriviVideo(c, "pronto", { ...SCHEDA, stato: "pronto" }, piano())
      await scriviVideo(c, "uscito", { ...SCHEDA, stato: "pubblicato" })
      await scriviVideo(c, "scartato", { ...SCHEDA, stato: "scartato" })
      await scriviVideo(c, "slide", { ...SCHEDA, formato: "carosello" })
    })
    const elenco = (await chiama<Array<{ slug: string; fase: unknown }>>(a, "GET", "/api/video")).corpo
    const fasi = Object.fromEntries(elenco.map((v) => [v.slug, v.fase]))
    expect(fasi).toEqual({
      idea: { passo: 1, azione: "idea" },
      copione: { passo: 2, azione: "copione" },
      prova: { passo: 3, azione: "prova" },
      riprese: { passo: 4, azione: "riprese" },
      testo: { passo: 4, azione: "testo" },
      animazioni: { passo: 5, azione: "animazioni" },
      "da-montare": { passo: 6, azione: "monta" },
      montato: { passo: 6, azione: "guarda" },
      corretto: { passo: 7, azione: "correzioni" },
      pronto: { passo: 8, azione: "pubblica" },
      uscito: { passo: 8, azione: "fatto" },
      scartato: null,
      slide: null,
    })
    for (const slug of ["idea", "montato", "corretto", "slide"]) {
      expect((await chiama<{ fase: unknown }>(a, "GET", `/api/video/${slug}`)).corpo.fase).toEqual(fasi[slug])
    }

    // Il testo registrato compare mentre il server gira: la fase avanza da sola.
    await scrivi(dentro(a, "testo", "materiali", "testo-registrato.md"))
    await aspetta(async () => (await chiama<{ fase: { passo: number } }>(a, "GET", "/api/video/testo")).corpo.fase.passo === 5)
  })
})
