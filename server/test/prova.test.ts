import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { aspetta, avviaAmbiente, chiama, fermaTutti, scriviVideo, type Ambiente, type Cartelle } from "./aiuti"

afterEach(fermaTutti)

interface VoceElenco {
  slug: string
  miniatura: string | null
}

const SCHEDA = { titolo: "Con la prova", stato: "in lavorazione", creato: "2026-10-27" }

async function ffmpeg(argomenti: string[]): Promise<void> {
  const p = Bun.spawn(["ffmpeg", "-y", "-loglevel", "error", ...argomenti], { stdout: "ignore", stderr: "pipe" })
  if ((await p.exited) !== 0) throw new Error(await new Response(p.stderr).text())
}

/** Venti secondi: nero il primo secondo, poi bianco. A un decimo della durata (2 s) il fotogramma è bianco, il primo è nero. */
const scriviProva = async (percorso: string): Promise<void> => {
  await mkdir(dirname(percorso), { recursive: true })
  await ffmpeg(["-f", "lavfi", "-i", "color=c=white:s=108x192:r=10:d=20,drawbox=x=0:y=0:w=108:h=192:color=black:t=fill:enable='lt(t,1)'", "-pix_fmt", "yuv420p", percorso])
}

/** La luminosità media di un'immagine, da 0 a 255. */
async function luminosita(percorso: string): Promise<number> {
  const p = Bun.spawn(["ffmpeg", "-v", "error", "-i", percorso, "-vf", "scale=1:1", "-pix_fmt", "gray", "-f", "rawvideo", "-"], { stdout: "pipe", stderr: "ignore" })
  const byte = new Uint8Array(await new Response(p.stdout).arrayBuffer())
  return byte[0] ?? -1
}

const avvia = (semina?: (c: Cartelle) => Promise<void>): Promise<Ambiente> => avviaAmbiente({ ffmpeg: Bun.which("ffmpeg"), ffprobe: Bun.which("ffprobe") }, semina)
const jpg = (a: Cartelle, slug: string): string => join(a.archivio, "video", slug, "uscite", "prova.jpg")
const elenco = async (a: Ambiente): Promise<VoceElenco[]> => (await chiama<VoceElenco[]>(a, "GET", "/api/video")).corpo

describe("la prova di un video, prima del girato", () => {
  test("un video con uscite/prova.mp4 e nient'altro ha per miniatura un fotogramma della prova, preso a un decimo della durata", async () => {
    const a = await avvia(async (c) => {
      await scriviVideo(c, "forno", SCHEDA)
      await scriviProva(join(c.archivio, "video", "forno", "uscite", "prova.mp4"))
    })
    await aspetta(async () => (await elenco(a))[0]?.miniatura === "video/forno/uscite/prova.jpg")
    expect(await luminosita(jpg(a, "forno"))).toBeGreaterThan(200)

    const dettaglio = await chiama<{ uscite: { file: string }[] }>(a, "GET", "/api/video/forno")
    expect(dettaglio.corpo.uscite.map((u) => u.file)).toEqual(["video/forno/uscite/prova.jpg", "video/forno/uscite/prova.mp4"])
    const file = await fetch(`${a.url}/media/video/forno/uscite/prova.mp4`, { headers: { ...a.accesso, Range: "bytes=0-9" } })
    expect(file.status).toBe(206)
    expect((await file.arrayBuffer()).byteLength).toBe(10)
  }, 30_000)

  test("la prova è l'ultima fonte: una copertina, o l'immagine del girato, vengono prima", async () => {
    const a = await avvia(async (c) => {
      await scriviVideo(c, "con-copertina", SCHEDA)
      await scriviProva(join(c.archivio, "video", "con-copertina", "uscite", "prova.mp4"))
      await Bun.write(join(c.archivio, "video", "con-copertina", "uscite", "copertina.png"), "png")
    })
    await aspetta(() => stat(jpg(a, "con-copertina")).catch(() => null))
    expect((await elenco(a))[0]).toMatchObject({ slug: "con-copertina", miniatura: "video/con-copertina/uscite/copertina.png" })
  }, 30_000)

  test("una prova rifatta dà un fotogramma nuovo; una che non è cambiata non si rilegge", async () => {
    const a = await avvia(async (c) => {
      await scriviVideo(c, "forno", SCHEDA)
      await scriviProva(join(c.archivio, "video", "forno", "uscite", "prova.mp4"))
    })
    await aspetta(async () => (await elenco(a))[0]?.miniatura === "video/forno/uscite/prova.jpg")
    await a.server.miniature.attendi()
    const primaDelRifacimento = (await stat(jpg(a, "forno"))).mtimeMs

    // Il file di prima, ma nero per intero: il fotogramma vecchio è bianco.
    const nuova = join(a.archivio, "video", "forno", "uscite", "prova.mp4")
    await ffmpeg(["-f", "lavfi", "-i", "color=c=black:s=108x192:r=10:d=20", "-pix_fmt", "yuv420p", nuova])
    // Si aspetta guardando la data del file, non aprendolo: un lettore che lo tiene aperto (ffmpeg, a ogni giro) fa fallire la sostituzione dell'immagine.
    await aspetta(async () => (await stat(jpg(a, "forno"))).mtimeMs > primaDelRifacimento, 15_000)
    await a.server.miniature.attendi()
    expect(await luminosita(jpg(a, "forno"))).toBeLessThan(50)

    await a.server.miniature.attendi()
    const dopo = (await stat(jpg(a, "forno"))).mtimeMs
    await Bun.sleep(600)
    await a.server.miniature.attendi()
    expect((await stat(jpg(a, "forno"))).mtimeMs).toBe(dopo)
  }, 40_000)

  test("senza ffmpeg la prova resta servita e il video resta senza immagine, senza errori", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "forno", SCHEDA)
      await Bun.write(join(c.archivio, "video", "forno", "uscite", "prova.mp4"), "video finto")
    })
    expect((await elenco(a))[0]).toMatchObject({ slug: "forno", miniatura: null })
    expect((await chiama<{ uscite: { file: string }[] }>(a, "GET", "/api/video/forno")).corpo.uscite.map((u) => u.file)).toEqual(["video/forno/uscite/prova.mp4"])
    expect(await readFile(join(a.archivio, "video", "forno", "uscite", "prova.mp4"), "utf-8")).toBe("video finto")
  })

  test("un file che non è un video non rompe niente e non lascia pezzi a metà", async () => {
    const a = await avvia(async (c) => {
      await scriviVideo(c, "rotto", SCHEDA)
      await Bun.write(join(c.archivio, "video", "rotto", "uscite", "prova.mp4"), "non è un video")
    })
    await a.server.miniature.attendi()
    expect((await elenco(a))[0]).toMatchObject({ slug: "rotto", miniatura: null })
    expect((await chiama<{ uscite: { file: string }[] }>(a, "GET", "/api/video/rotto")).corpo.uscite.map((u) => u.file)).toEqual(["video/rotto/uscite/prova.mp4"])
  })
})
