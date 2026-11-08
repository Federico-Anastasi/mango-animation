import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pezziDichiarati } from "../src/sagoma"
import { ascolta, aspetta, avviaAmbiente, chiama, fermaTutti } from "./aiuti"

afterEach(fermaTutti)

interface Giorno {
  file: { file: string; preparato: { sagoma: string | null; sagoma_pezzi: { da: number; a: number; file: string; inizio: number }[] | null } }[]
}

describe("i pezzi di sagoma dichiarati", () => {
  test("l'elenco dei pezzi, e una sagoma di prima con gli intervalli, diventano pezzi; il resto si scarta", () => {
    expect(pezziDichiarati({ pezzi: [{ da: 1, a: 2, file: "sagoma/30-60.webm", inizio: 1 }, { da: "x" }, null] })).toEqual([{ da: 1, a: 2, file: "sagoma/30-60.webm", inizio: 1 }])
    expect(pezziDichiarati({ intervalli: [[0, 3], [5, 6], ["a", 1]] })).toEqual([
      { da: 0, a: 3, file: "sagoma.webm", inizio: 0 },
      { da: 5, a: 6, file: "sagoma.webm", inizio: 0 },
    ])
    expect(pezziDichiarati([1])).toEqual([])
    expect(pezziDichiarati({ pezzi: "no" })).toEqual([])
  })
})

describe("la sagoma preparata nel girato", () => {
  const girato = async (a: Awaited<ReturnType<typeof avviaAmbiente>>) => (await chiama<Giorno[]>(a, "GET", "/api/grezzo")).corpo[0]!.file[0]!.preparato

  test("i pezzi di sagoma.json che hanno il file compaiono coi percorsi dell'archivio, e si aggiornano a ogni pezzo finito", async () => {
    const a = await avviaAmbiente({}, async ({ archivio }) => {
      await mkdir(join(archivio, "grezzo", "2026-10-06"), { recursive: true })
      await writeFile(join(archivio, "grezzo", "2026-10-06", "a.mp4"), "girato")
      await writeFile(join(archivio, "grezzo", "2026-10-06", "a.mp4.scheda.json"), JSON.stringify({ tipo: "ripresa", origine: "telefono", durata: 20 }))
    })
    const cartella = join(a.archivio, "preparati", "2026-10-06", "a.mp4")
    const ascolto = await ascolta(a)
    expect((await girato(a)).sagoma_pezzi).toBeNull()

    await mkdir(join(cartella, "sagoma"), { recursive: true })
    await writeFile(join(cartella, "sagoma", "30-90.webm"), "x")
    await writeFile(join(cartella, "sagoma.json"), JSON.stringify({ pezzi: [{ da: 1, a: 3, file: "sagoma/30-90.webm", inizio: 1 }, { da: 5, a: 6, file: "sagoma/150-180.webm", inizio: 5 }] }))
    await aspetta(async () => (await girato(a)).sagoma_pezzi !== null)
    expect((await girato(a)).sagoma_pezzi).toEqual([{ da: 1, a: 3, file: "preparati/2026-10-06/a.mp4/sagoma/30-90.webm", inizio: 1 }])
    expect((await girato(a)).sagoma).toBeNull()

    await writeFile(join(cartella, "sagoma", "150-180.webm"), "x")
    await aspetta(async () => (await girato(a)).sagoma_pezzi?.length === 2)
    expect(ascolto.messaggi.some((m) => m.tipo === "grezzo")).toBe(true)
    ascolto.chiudi()
  })

  test("un elenco che non si legge non rompe il girato", async () => {
    const a = await avviaAmbiente({}, async ({ archivio }) => {
      await mkdir(join(archivio, "grezzo", "2026-10-06"), { recursive: true })
      await writeFile(join(archivio, "grezzo", "2026-10-06", "a.mp4"), "girato")
      await writeFile(join(archivio, "grezzo", "2026-10-06", "a.mp4.scheda.json"), JSON.stringify({ tipo: "ripresa", origine: "telefono", durata: 20 }))
      await mkdir(join(archivio, "preparati", "2026-10-06", "a.mp4"), { recursive: true })
      await writeFile(join(archivio, "preparati", "2026-10-06", "a.mp4", "sagoma.json"), "{ rotto")
      await writeFile(join(archivio, "preparati", "2026-10-06", "a.mp4", "leggero.mp4"), "x")
    })
    const p = await girato(a)
    expect(p.sagoma_pezzi).toBeNull()
  })
})
