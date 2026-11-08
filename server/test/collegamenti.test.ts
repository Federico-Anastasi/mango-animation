import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, symlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { avviaAmbiente, chiama, fermaTutti, piano, scriviVideo } from "./aiuti"

afterEach(fermaTutti)

interface Girato {
  giorno: string
  file: { file: string; preparato: { leggero: string | null } }[]
}
interface Dettaglio {
  uscite: { file: string; byte: number }[]
}

// Un video pubblicato può stare su un altro disco: nell'archivio resta un collegamento al file.
describe("file collegati da un altro disco", () => {
  test("girato, preparati e uscite collegati restano visibili come file veri", async () => {
    const a = await avviaAmbiente({}, async ({ radice, archivio }) => {
      const altrove = join(radice, "altro-disco")
      const colloca = async (relativo: string, contenuto: string): Promise<void> => {
        const vero = join(altrove, relativo)
        const nell_archivio = join(archivio, relativo)
        await mkdir(dirname(vero), { recursive: true })
        await mkdir(dirname(nell_archivio), { recursive: true })
        await writeFile(vero, contenuto)
        await symlink(vero, nell_archivio, "file")
      }
      await colloca("grezzo/2026-10-06/a.mp4", "girato")
      await writeFile(join(archivio, "grezzo", "2026-10-06", "a.mp4.scheda.json"), JSON.stringify({ tipo: "ripresa", origine: "telefono", durata: 2 }))
      await colloca("preparati/2026-10-06/a.mp4/leggero.mp4", "leggero")
      await scriviVideo({ radice, archivio, stile: "" }, "uscito", { titolo: "Uscito", stato: "pubblicato", creato: "2026-10-06" }, piano())
      await colloca("video/uscito/uscite/finale.mp4", "montato!")
    })

    const girato = (await chiama<Girato[]>(a, "GET", "/api/grezzo")).corpo
    expect(girato.flatMap((g) => g.file.map((f) => f.file))).toEqual(["2026-10-06/a.mp4"])
    expect(girato[0]!.file[0]!.preparato.leggero).toBe("preparati/2026-10-06/a.mp4/leggero.mp4")

    const video = (await chiama<Dettaglio>(a, "GET", "/api/video/uscito")).corpo
    expect(video.uscite).toEqual([expect.objectContaining({ file: "video/uscito/uscite/finale.mp4", byte: 8 })])

    const servito = await fetch(`${a.url}/media/video/uscito/uscite/finale.mp4`, { headers: a.accesso })
    expect(await servito.text()).toBe("montato!")
  })
})
