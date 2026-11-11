import { afterEach, describe, expect, test } from "bun:test"
import { link, mkdir, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Uscita } from "../src/indice"
import { idDelFile, montatoDi, pianoDopoIlMontato, segnaGliStessiFile } from "../src/montato"
import { videoDaGuardare } from "../src/arrivi/guarda"
import { avviaAmbiente, chiama, fermaTutti, piano, scriviVideo } from "./aiuti"

afterEach(fermaTutti)

const uscita = (nome: string, cambiato: string, stesso: string | null = null): Uscita => ({ file: `video/v/uscite/${nome}`, byte: 1, cambiato, stesso_file: stesso })

describe("il piano dopo il montato", () => {
  const fatto = (montatoDa: unknown, impronta: unknown, aggiornato: boolean, piuNuovo: boolean, conMontato = true) =>
    pianoDopoIlMontato({
      conMontato,
      montaggio: montatoDa === undefined ? null : { uscite: { finale: montatoDa } },
      risolto: impronta === undefined ? { durata: 3 } : { impronta },
      risoltoAggiornato: aggiornato,
      pianoPiuNuovoDelFinale: piuNuovo,
    })

  test("senza montato non c'è niente da confrontare", () => {
    expect(fatto("A", "B", true, true, false)).toBe(false)
  })

  test("con le due impronte e il risolto di adesso decide l'impronta, non la data", () => {
    expect(fatto("A", "A", true, true)).toBe(false)
    expect(fatto("A", "B", true, false)).toBe(true)
  })

  test("un montato di prima dell'impronta, o un risolto che non la porta, si confronta per data", () => {
    expect(fatto(undefined, "B", true, true)).toBe(true)
    expect(fatto(undefined, "B", true, false)).toBe(false)
    expect(fatto("A", undefined, true, true)).toBe(true)
    expect(fatto("A", undefined, true, false)).toBe(false)
  })

  test("un risolto rimasto indietro rispetto al piano non dice niente dell'impronta: vale la data", () => {
    expect(fatto("A", "A", false, true)).toBe(true)
    expect(fatto("A", "B", false, false)).toBe(false)
  })

  test("un'impronta che non è un testo non conta", () => {
    expect(fatto(7, "A", true, true)).toBe(true)
    expect(fatto("A", ["A"], true, false)).toBe(false)
  })
})

describe("il video montato", () => {
  test("con la copertina se è lo stesso file o non è più vecchio del montato, altrimenti il montato", () => {
    const finale = uscita("finale.mp4", "2026-11-05T10:00:00.000Z", "video/v/uscite/con-copertina.mp4")
    const stesso = uscita("con-copertina.mp4", "2026-11-05T10:00:00.000Z")
    expect(montatoDi([finale, stesso])?.file).toBe(stesso.file)
    expect(montatoDi([uscita("finale.mp4", "2026-11-05T10:00:00.000Z"), uscita("con-copertina.mp4", "2026-11-05T10:05:00.000Z")])?.file).toBe("video/v/uscite/con-copertina.mp4")
    expect(montatoDi([uscita("finale.mp4", "2026-11-05T10:00:00.000Z"), uscita("con-copertina.mp4", "2026-11-04T10:00:00.000Z")])?.file).toBe("video/v/uscite/finale.mp4")
    expect(montatoDi([uscita("finale.mp4", "2026-11-05T10:00:00.000Z")])?.file).toBe("video/v/uscite/finale.mp4")
    expect(montatoDi([uscita("con-copertina.mp4", "2026-11-05T10:00:00.000Z")])?.file).toBe("video/v/uscite/con-copertina.mp4")
    expect(montatoDi([uscita("prova.mp4", "2026-11-05T10:00:00.000Z")])).toBeNull()
  })

  test("gli stessi file sul disco: il primo per nome è il file, gli altri dicono di chi sono un secondo nome", () => {
    const m = segnaGliStessiFile([
      { file: "u/finale.mp4", id: "1:7" },
      { file: "u/con-copertina.mp4", id: "1:7" },
      { file: "u/finale.srt", id: "1:8" },
      { file: "u/a.bin", id: null },
      { file: "u/b.bin", id: null },
    ])
    expect(Object.fromEntries(m)).toEqual({ "u/a.bin": null, "u/b.bin": null, "u/con-copertina.mp4": null, "u/finale.mp4": "u/con-copertina.mp4", "u/finale.srt": null })
  })

  test("due file vicini su un disco che numera i file oltre 2^53 non sono lo stesso file", () => {
    const grande = 2n ** 53n + 1686743n
    expect(idDelFile({ dev: 4031815358n, ino: grande })).not.toBe(idDelFile({ dev: 4031815358n, ino: grande + 1n }))
    expect(idDelFile({ dev: 4031815358n, ino: grande })).toBe(idDelFile({ dev: 4031815358n, ino: grande }))
    expect(idDelFile({ dev: 4031815358n, ino: 0n })).toBeNull()
  })

  test("la scheda del telefono guarda il montato giusto, non una copertina rimasta di un montaggio più vecchio", () => {
    const voce = (uscite: Uscita[]) => [{ slug: "v", scheda: { titolo: "V" }, uscite }] as unknown as Parameters<typeof videoDaGuardare>[0]
    expect(videoDaGuardare(voce([uscita("finale.mp4", "2026-11-05T10:00:00.000Z"), uscita("con-copertina.mp4", "2026-11-01T10:00:00.000Z")])).map((v) => v.file)).toEqual(["video/v/uscite/finale.mp4"])
  })

  test("nel dettaglio di un video con la copertina dentro il montato i due nomi sono un file solo, e il montato è quello con la copertina", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo({ ...c, stile: "" }, "v", { titolo: "V", stato: "in lavorazione", creato: "2026-10-06" }, piano())
      const uscite = join(c.archivio, "video", "v", "uscite")
      await mkdir(uscite, { recursive: true })
      await writeFile(join(uscite, "finale.mp4"), "video")
      await link(join(uscite, "finale.mp4"), join(uscite, "con-copertina.mp4"))
      await writeFile(join(uscite, "finale.srt"), "x")
    })
    const d = (await chiama<{ uscite: Uscita[]; montato: { file: string; quando: string } | null }>(a, "GET", "/api/video/v")).corpo
    const per = Object.fromEntries(d.uscite.map((u) => [u.file.split("/").pop()!, u.stesso_file]))
    expect(per).toEqual({ "con-copertina.mp4": null, "finale.mp4": "video/v/uscite/con-copertina.mp4", "finale.srt": null })
    expect(d.montato?.file).toBe("video/v/uscite/con-copertina.mp4")
  })

  test("un montaggio senza copertina dopo uno con la copertina: il montato è il nuovo finale, non il vecchio file con la copertina", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo({ ...c, stile: "" }, "v", { titolo: "V", stato: "in lavorazione", creato: "2026-10-06" }, piano())
      const uscite = join(c.archivio, "video", "v", "uscite")
      await mkdir(uscite, { recursive: true })
      await writeFile(join(uscite, "con-copertina.mp4"), "vecchio")
      await writeFile(join(uscite, "finale.mp4"), "nuovo")
      await utimes(join(uscite, "con-copertina.mp4"), new Date("2026-11-01T10:00:00Z"), new Date("2026-11-01T10:00:00Z"))
    })
    const d = (await chiama<{ montato: { file: string } | null }>(a, "GET", "/api/video/v")).corpo
    expect(d.montato?.file).toBe("video/v/uscite/finale.mp4")
  })

  test("senza montato il dettaglio dice null", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo({ ...c, stile: "" }, "v", { titolo: "V", stato: "proposta", creato: "2026-10-06" }, piano()))
    expect((await chiama<{ montato: unknown }>(a, "GET", "/api/video/v")).corpo.montato).toBeNull()
  })
})
