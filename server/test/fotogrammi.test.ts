import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { aspetta, ascolta, avviaAmbiente, chiama, fermaTutti, piano, scriviVideo, type Cartelle } from "./aiuti"

afterEach(fermaTutti)

const FILE = "2026-10-06/a.mp4"

async function creaVideoProva(percorso: string): Promise<void> {
  await mkdir(join(percorso, ".."), { recursive: true })
  const p = Bun.spawn([Bun.which("ffmpeg")!, "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=4:size=320x240:rate=10", "-pix_fmt", "yuv420p", "-y", percorso], { stdout: "ignore", stderr: "pipe" })
  if ((await p.exited) !== 0) throw new Error(await new Response(p.stderr).text())
}

const tratto = (sorgente: string | null, da: number) => ({ scena: 0, pezzo: 0, sorgente, da, durata: 1, esce: 0, vista: null, zoom: null, legato: [null, null] })

async function seminaVideo(c: Cartelle, tratti: object[]): Promise<void> {
  await creaVideoProva(join(c.archivio, "grezzo", FILE))
  await writeFile(join(c.archivio, "grezzo", `${FILE}.scheda.json`), JSON.stringify({ tipo: "ripresa", origine: "telefono", durata: 4 }))
  await scriviVideo(c, "v", undefined, piano(FILE))
  await mkdir(join(c.archivio, "video", "v", "lavoro"), { recursive: true })
  await writeFile(join(c.archivio, "video", "v", "lavoro", "risolto.json"), JSON.stringify({ durata: 4, tratti }))
}

interface Dettaglio {
  risolto: { tratti: unknown[] }
  fotogrammi: (string | null)[]
}

const fotogrammiDi = async (a: Parameters<typeof chiama>[0]): Promise<(string | null)[]> => (await chiama<Dettaglio>(a, "GET", "/api/video/v")).corpo.fotogrammi
const eJpeg = async (percorso: string): Promise<boolean> => {
  const dati = await readFile(percorso).catch(() => null)
  return dati !== null && dati.length > 300 && dati[0] === 0xff && dati[1] === 0xd8
}

describe("il fotogramma di ogni tratto", () => {
  test("ogni tratto del risolto ha il suo, fatto una volta e tenuto con le cose preparate del file; il tratto senza voce non ne ha", async () => {
    const a = await avviaAmbiente({ ffmpeg: Bun.which("ffmpeg") }, (c) => seminaVideo(c, [tratto("a", 0.5), tratto(null, 0), tratto("a", 2.04), tratto("a", 2.0)]))
    const ascolto = await ascolta(a)
    const primo = await fotogrammiDi(a)
    expect(primo).toHaveLength(4)
    expect(primo[1]).toBeNull()
    const fatti = await aspetta(async () => {
      const f = await fotogrammiDi(a)
      return f[0] !== null && f[2] !== null && f[3] !== null ? f : null
    }, 15_000)
    expect(fatti).toEqual(["preparati/2026-10-06/a.mp4/fotogrammi/5.jpg", null, "preparati/2026-10-06/a.mp4/fotogrammi/20.jpg", "preparati/2026-10-06/a.mp4/fotogrammi/20.jpg"])
    expect(await eJpeg(join(a.archivio, fatti[0]!))).toBe(true)
    expect(await eJpeg(join(a.archivio, fatti[2]!))).toBe(true)
    expect((await readFile(join(a.archivio, fatti[0]!))).equals(await readFile(join(a.archivio, fatti[2]!)))).toBe(false)
    expect((await readdir(join(a.archivio, "preparati", FILE, "fotogrammi"))).sort()).toEqual(["20.jpg", "5.jpg"])
    await aspetta(() => ascolto.messaggi.some((m) => m.tipo === "video" && m.slug === "v" && m.cosa === "fotogrammi"))
    ascolto.chiudi()
  }, 30_000)

  test("un fotogramma già fatto non si rifà, e dopo un riavvio dell'indice si trova subito", async () => {
    const a = await avviaAmbiente({ ffmpeg: Bun.which("ffmpeg") }, async (c) => {
      await seminaVideo(c, [tratto("a", 1)])
      await mkdir(join(c.archivio, "preparati", FILE, "fotogrammi"), { recursive: true })
      await writeFile(join(c.archivio, "preparati", FILE, "fotogrammi", "10.jpg"), "quello di prima")
    })
    expect(await fotogrammiDi(a)).toEqual(["preparati/2026-10-06/a.mp4/fotogrammi/10.jpg"])
    await a.server.miniature.attendi()
    expect(await readFile(join(a.archivio, "preparati", FILE, "fotogrammi", "10.jpg"), "utf-8")).toBe("quello di prima")
  }, 30_000)

  test("senza risolto o senza ffmpeg la risposta c'è lo stesso, con un elenco vuoto o di null; un file che non è un video non rompe niente", async () => {
    const senza = await avviaAmbiente({ ffmpeg: null }, (c) => seminaVideo(c, [tratto("a", 1)]))
    expect(await fotogrammiDi(senza)).toEqual([null])
    const nessuno = await avviaAmbiente({ ffmpeg: Bun.which("ffmpeg") }, (c) => scriviVideo(c, "v", undefined, piano(FILE)))
    expect(await fotogrammiDi(nessuno)).toEqual([])
    const rotto = await avviaAmbiente({ ffmpeg: Bun.which("ffmpeg") }, async (c) => {
      await seminaVideo(c, [tratto("a", 1)])
      await writeFile(join(c.archivio, "grezzo", FILE), "non è un video")
    })
    await rotto.server.miniature.attendi()
    expect(await fotogrammiDi(rotto)).toEqual([null])
    expect(await stat(join(rotto.archivio, "preparati", FILE, "fotogrammi", "10.jpg")).catch(() => null)).toBeNull()
  }, 30_000)

  test("un risolto nuovo con tratti spostati fa i fotogrammi nuovi", async () => {
    const a = await avviaAmbiente({ ffmpeg: Bun.which("ffmpeg") }, (c) => seminaVideo(c, [tratto("a", 1)]))
    await aspetta(async () => (await fotogrammiDi(a))[0] !== null, 15_000)
    await writeFile(join(a.archivio, "video", "v", "lavoro", "risolto.json"), JSON.stringify({ durata: 4, tratti: [tratto("a", 1), tratto("a", 3.3)] }))
    const f = await aspetta(async () => {
      const dopo = await fotogrammiDi(a)
      return dopo.length === 2 && dopo[1] !== null ? dopo : null
    }, 15_000)
    expect(f[1]).toBe("preparati/2026-10-06/a.mp4/fotogrammi/33.jpg")
  }, 30_000)
})
