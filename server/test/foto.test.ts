import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Percorsi } from "../src/configurazione"
import { Miniature } from "../src/miniature"
import { eHeic, leggiFile } from "../src/sonda"
import { aspetta, avviaAmbiente, chiama, fermaTutti, righeDelFinto, scriviGrezzo } from "./aiuti"

afterEach(fermaTutti)

const chiamateA = async (a: Parameters<typeof righeDelFinto>[0], file: string): Promise<number> => (await righeDelFinto(a)).filter((r) => r === `inizio prepara-file ${file}`).length

describe("le foto HEIC del telefono si preparano da sole", () => {
  test("una HEIC con la sua scheda mette in coda prepara-file; un video no", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-11-02/IMG_1.heic", "x", { tipo: "ripresa", origine: "telefono" })
      await scriviGrezzo(c, "2026-11-02/IMG_2.HEIF", "x", { tipo: "ripresa", origine: "telefono" })
      await scriviGrezzo(c, "2026-11-02/film.mp4", "x", { tipo: "ripresa", origine: "telefono", durata: 2 })
      await scriviGrezzo(c, "2026-11-02/IMG_3.jpg", "x", { tipo: "ripresa", origine: "telefono" })
    })
    await aspetta(async () => (await chiamateA(a, "2026-11-02/IMG_1.heic")) === 1 && (await chiamateA(a, "2026-11-02/IMG_2.HEIF")) === 1)
    await Bun.sleep(300)
    expect(await chiamateA(a, "2026-11-02/film.mp4")).toBe(0)
    expect(await chiamateA(a, "2026-11-02/IMG_3.jpg")).toBe(0)
  })

  test("con la foto già fatta non si rifà, e la foto compare fra i preparati del file", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-11-02/fatta.heic", "x", { tipo: "ripresa", origine: "telefono" })
      await scriviGrezzo(c, "2026-11-02/nuova.heic", "x", { tipo: "ripresa", origine: "telefono" })
      await mkdir(join(c.archivio, "preparati", "2026-11-02", "fatta.heic"), { recursive: true })
      await writeFile(join(c.archivio, "preparati", "2026-11-02", "fatta.heic", "foto.jpg"), "x")
    })
    await aspetta(async () => (await chiamateA(a, "2026-11-02/nuova.heic")) === 1)
    await Bun.sleep(300)
    expect(await chiamateA(a, "2026-11-02/fatta.heic")).toBe(0)
    const giorni = (await chiama<{ file: { file: string; preparato: { foto: string | null } }[] }[]>(a, "GET", "/api/grezzo")).corpo
    expect(giorni[0]!.file.find((f) => f.file === "2026-11-02/fatta.heic")!.preparato.foto).toBe("preparati/2026-11-02/fatta.heic/foto.jpg")
    expect(giorni[0]!.file.find((f) => f.file === "2026-11-02/nuova.heic")!.preparato.foto).toBeNull()
  })

  test("una volta sola per file e per avvio, anche se la scheda cambia", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviGrezzo(c, "2026-11-02/IMG_1.heic", "x", { tipo: "ripresa", origine: "telefono" }))
    await aspetta(async () => (await chiamateA(a, "2026-11-02/IMG_1.heic")) === 1)
    await writeFile(join(a.archivio, "grezzo", "2026-11-02", "IMG_1.heic.scheda.json"), JSON.stringify({ tipo: "ripresa", origine: "telefono", note: "una nota" }))
    await aspetta(async () => (await chiama<{ file: { scheda: { note?: string } | null }[] }[]>(a, "GET", "/api/grezzo")).corpo[0]!.file[0]!.scheda?.note === "una nota")
    await Bun.sleep(300)
    expect(await chiamateA(a, "2026-11-02/IMG_1.heic")).toBe(1)
  })

  test("una HEIC messa a mano, senza scheda, parte dopo che la sonda ha scritto la scheda: senza le misure del riquadro", async () => {
    const a = await avviaAmbiente()
    await scriviGrezzo(a, "2026-11-02/a-mano.heic", "x", null)
    const scheda = join(a.archivio, "grezzo", "2026-11-02", "a-mano.heic.scheda.json")
    await aspetta(async () => (await chiamateA(a, "2026-11-02/a-mano.heic")) === 1)
    const scritta = JSON.parse(await readFile(scheda, "utf-8")) as Record<string, unknown>
    expect(scritta).toMatchObject({ tipo: "altro", origine: "altro" })
    for (const misura of ["durata", "largo", "alto", "fps"]) expect(scritta).not.toHaveProperty(misura)
  })
})

describe("la sonda e la miniatura lasciano le HEIC al motore", () => {
  test("eHeic riconosce HEIC e HEIF in ogni scrittura, non gli altri file", () => {
    expect(["a.heic", "A.HEIC", "dir/b.heif"].map(eHeic)).toEqual([true, true, true])
    expect(["a.jpg", "heic.mp4", "a.heic.scheda.json"].map(eHeic)).toEqual([false, false, false])
  })

  test("di una HEIC la sonda non dà misure e non lancia ffprobe", async () => {
    expect(await leggiFile("ffprobe-che-non-esiste", "x/a.heic")).toEqual({ misure: {} })
  })

  test("la miniatura del server non parte per una HEIC (ffmpeg ne leggerebbe un riquadro) e parte per gli altri file", async () => {
    const errori = spyOn(console, "error").mockImplementation(() => undefined)
    const vuota = await mkdtemp(join(tmpdir(), "miniature-"))
    try {
      const percorsi = { preparato: (f: string) => join(vuota, f), grezzo: (f: string) => join(vuota, f) } as unknown as Percorsi
      const miniature = new Miniature("ffmpeg-che-non-esiste", null, percorsi, () => ({ lato: 360, al: 0.1 }), async () => undefined)
      miniature.programma("2026-11-02/a.heic", 1)
      await miniature.attendi()
      expect(errori).not.toHaveBeenCalled()
      miniature.programma("2026-11-02/a.mp4", 1)
      await miniature.attendi()
      expect(errori).toHaveBeenCalledTimes(1)
    } finally {
      errori.mockRestore()
      await rm(vuota, { recursive: true, force: true })
    }
  })
})
