// Un video che il creator ha sul computer entra nel girato: col corpo della richiesta (il browser) o, dall'app, per percorso (un file lasciato sulla finestra).
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { cercaDoppione } from "../src/arrivi/aggiungi"
import { avviaAmbiente, chiama, fermaTutti, sceltiDallApp, type Ambiente } from "./aiuti"

afterEach(fermaTutti)

const ADESSO = new Date(2026, 9, 9, 14, 5, 9)
const OPZIONI_ARRIVI = { porta: 0, limiteByte: 20 * 1024 ** 3, indirizzo: "192.168.1.20", adesso: () => ADESSO, spazioLibero: () => 100 * 1024 ** 3 }
const avvia = (arrivi: Partial<typeof OPZIONI_ARRIVI> = {}) => avviaAmbiente({ arrivi: { ...OPZIONI_ARRIVI, ...arrivi }, ffprobe: null })

interface Esito {
  stato: number
  corpo: { file?: string; byte?: number; errore?: string }
}

/** Il file nel corpo, come lo manda il browser. */
async function carica(a: Ambiente, nome: string, contenuto: Uint8Array | string, intestazioni: Record<string, string> = {}): Promise<Esito> {
  const r = await fetch(`${a.url}/api/grezzo/aggiungi`, { method: "POST", headers: { ...a.accesso, "X-Nome-File": encodeURIComponent(nome), ...intestazioni }, body: contenuto })
  return { stato: r.status, corpo: (await r.json()) as Esito["corpo"] }
}

const percorso = (a: Ambiente, percorsoDelFile: unknown, lingua?: "it" | "en") => chiama<Esito["corpo"]>(a, "POST", "/api/grezzo/aggiungi", { percorso: percorsoDelFile }, lingua)
const inCorso = (a: Ambiente) => readdir(join(a.archivio, "arrivi", ".in-corso")).catch(() => [])

describe("POST /api/grezzo/aggiungi: il file nel corpo", () => {
  test("entra in grezzo/<oggi>/ col nome degli arrivi, con la sua scheda; non è un arrivo dal telefono", async () => {
    const a = await avvia()
    const contenuto = new Uint8Array(300_000).fill(5)
    const r = await carica(a, "Giro Lungo.MOV", contenuto, { "Content-Type": "video/quicktime" })
    expect(r).toEqual({ stato: 201, corpo: { file: "2026-10-09/20261009-140509-Giro Lungo.MOV", byte: 300_000 } })
    const file = join(a.archivio, "grezzo", "2026-10-09", "20261009-140509-Giro Lungo.MOV")
    expect(new Uint8Array(await readFile(file))).toEqual(contenuto)
    expect(JSON.parse(await readFile(`${file}.scheda.json`, "utf-8"))).toEqual({ tipo: "ripresa", origine: "altro", arrivato: "2026-10-09T14:05:09", note: "" })
    expect(await inCorso(a)).toEqual([])

    const girato = await chiama<{ giorno: string; file: { nome: string }[] }[]>(a, "GET", "/api/grezzo")
    expect(girato.corpo.map((g) => g.file.map((f) => f.nome))).toEqual([["20261009-140509-Giro Lungo.MOV"]])
    // Gli ultimi arrivi sono quelli del telefono.
    expect((await chiama<{ ultimi: unknown[] }>(a, "GET", "/api/arrivi")).corpo.ultimi).toEqual([])
    const registro = (await readFile(join(a.archivio, "arrivi", "registro.jsonl"), "utf-8")).trim().split("\n").map((r) => JSON.parse(r) as { esito: string })
    expect(registro.map((r) => r.esito)).toEqual(["aggiunto"])
  })

  test("un video vero ha già la durata e le misure nella scheda quando la risposta arriva", async () => {
    const a = await avviaAmbiente({ arrivi: OPZIONI_ARRIVI })
    const video = join(a.radice, "prova.mp4")
    const fatto = Bun.spawn(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=10", "-pix_fmt", "yuv420p", video], { stdout: "ignore", stderr: "inherit" })
    expect(await fatto.exited).toBe(0)
    const r = await carica(a, "prova.mp4", new Uint8Array(await readFile(video)))
    expect(r.stato).toBe(201)
    const scheda = JSON.parse(await readFile(join(a.archivio, "grezzo", r.corpo.file!.split("/")[0]!, `${r.corpo.file!.split("/")[1]}.scheda.json`), "utf-8")) as Record<string, unknown>
    expect(scheda).toMatchObject({ tipo: "ripresa", origine: "altro", largo: 320, alto: 240 })
    expect(scheda["durata"]).toBeCloseTo(1, 0)
  })

  test("un file di oltre 16 MB passa (il limite degli altri corpi non vale qui), uno di un altro tipo no", async () => {
    const a = await avvia()
    const grande = new Uint8Array(17 * 1024 ** 2).fill(1)
    expect((await carica(a, "grande.mp4", grande)).stato).toBe(201)
    const altro = await fetch(`${a.url}/api/chat/allegati`, { method: "POST", headers: { ...a.accesso, "X-Nome": "grande.mp4" }, body: grande })
    expect(altro.status).toBe(413)
  })

  test("un file che non è video, foto o audio è rifiutato con la frase, nelle due lingue, e non lascia niente", async () => {
    const a = await avvia()
    for (const nome of ["contratto.pdf", "chiave.json", "senza-estensione"]) {
      const r = await carica(a, nome, "x")
      expect(r.stato).toBe(415)
      expect(r.corpo.errore).toContain("non è un video, una foto o una registrazione audio")
    }
    const inglese = await carica(a, "contratto.pdf", "x", { "X-Lingua": "en" })
    expect(inglese.corpo.errore).toBe("«contratto.pdf» is not a video, a photo or an audio recording: only those go into the footage.")
    expect(await readdir(join(a.archivio, "grezzo")).catch(() => [])).toEqual([])
    expect(await inCorso(a)).toEqual([])
  })

  test("lo stesso file due volte (stesso nome e stessa grandezza) è un doppione; un altro con quel nome no", async () => {
    const a = await avvia({ adesso: () => new Date() })
    expect((await carica(a, "clip.mp4", "12345")).stato).toBe(201)
    const di_nuovo = await carica(a, "Clip.mp4", "12345", { "X-Lingua": "en" })
    expect(di_nuovo.stato).toBe(409)
    expect(di_nuovo.corpo.errore).toMatch(/^«clip.mp4» is already in the footage \(.+\): I won't add it twice\.$/i)
    expect((await carica(a, "clip.mp4", "123456")).stato).toBe(201)
    expect(await inCorso(a)).toEqual([])
  })

  test("vuoto, senza nome e troppo grande dicono perché", async () => {
    const a = await avvia({ limiteByte: 100 })
    expect((await carica(a, "vuoto.mp4", "")).stato).toBe(400)
    expect((await carica(a, "", "x")).stato).toBe(400)
    const grande = await carica(a, "grande.mp4", new Uint8Array(101))
    expect(grande.stato).toBe(413)
    expect(grande.corpo.errore).toContain("più del massimo")
    expect(await inCorso(a)).toEqual([])
  })

  test("senza spazio sul disco non comincia", async () => {
    const a = await avvia({ spazioLibero: () => 1024 })
    const r = await carica(a, "clip.mp4", "x")
    expect(r.stato).toBe(507)
    expect(r.corpo.errore).toContain("spazio libero")
  })
})

describe("POST /api/grezzo/aggiungi: il percorso di un file scelto nell'app", () => {
  async function fuori(a: Ambiente, nome: string, contenuto: string | Uint8Array = "ciao dal video"): Promise<string> {
    const cartella = join(a.radice, "fuori")
    await mkdir(cartella, { recursive: true })
    await writeFile(join(cartella, nome), contenuto)
    return join(cartella, nome)
  }

  test("un file scelto si collega senza copiarlo: lo stesso file sul disco, e l'originale resta", async () => {
    const a = await avvia()
    const origine = await fuori(a, "giro.mov")
    await sceltiDallApp(a, [origine])
    const r = await percorso(a, origine)
    expect(r).toMatchObject({ stato: 201, corpo: { file: "2026-10-09/20261009-140509-giro.mov", byte: 14 } })
    const nelGirato = join(a.archivio, "grezzo", "2026-10-09", "20261009-140509-giro.mov")
    expect((await stat(nelGirato)).ino).toBe((await stat(origine)).ino)
    expect(await readFile(origine, "utf-8")).toBe("ciao dal video")
    expect(JSON.parse(await readFile(`${nelGirato}.scheda.json`, "utf-8"))).toMatchObject({ tipo: "ripresa", origine: "altro" })
    expect(await inCorso(a)).toEqual([])
  })

  test("un percorso che il creator non ha scelto non si prende, nemmeno con la chiave delle API; e vale una volta sola", async () => {
    const a = await avvia()
    const origine = await fuori(a, "giro.mov")
    const senza = await percorso(a, origine, "en")
    expect(senza.stato).toBe(403)
    expect(senza.corpo.errore).toBe("You didn't pick this file in the app: drop it on the footage page, or use «Add video».")
    expect(await readdir(join(a.archivio, "grezzo")).catch(() => [])).toEqual([])

    await sceltiDallApp(a, [origine])
    expect((await percorso(a, origine)).stato).toBe(201)
    expect((await percorso(a, origine)).stato).toBe(403)
  })

  test("un file scelto ma di un altro tipo, una cartella o un file sparito sono rifiutati con la frase", async () => {
    const a = await avvia()
    const credenziali = await fuori(a, ".credentials.json", "{}")
    const documento = await fuori(a, "nota.txt")
    const cartella = join(a.radice, "fuori", "cartella.mp4")
    await mkdir(cartella, { recursive: true })
    const sparito = join(a.radice, "fuori", "sparito.mp4")
    const vuoto = await fuori(a, "vuoto.mp4", "")
    await sceltiDallApp(a, [credenziali, documento, cartella, sparito, vuoto])

    expect((await percorso(a, credenziali)).stato).toBe(415)
    expect((await percorso(a, documento)).stato).toBe(415)
    expect((await percorso(a, cartella)).corpo.errore).toContain("è una cartella")
    expect((await percorso(a, sparito)).stato).toBe(400)
    expect((await percorso(a, vuoto)).corpo.errore).toContain("è vuoto")
    expect((await percorso(a, "giro.mov")).stato).toBe(400)
    expect(await readdir(join(a.archivio, "grezzo")).catch(() => [])).toEqual([])
  })

  test("lo stesso file già nel girato è un doppione", async () => {
    const a = await avvia({ adesso: () => new Date() })
    const origine = await fuori(a, "giro.mov")
    await sceltiDallApp(a, [origine])
    expect((await percorso(a, origine)).stato).toBe(201)
    await sceltiDallApp(a, [origine])
    const r = await percorso(a, origine)
    expect(r.stato).toBe(409)
    expect(r.corpo.errore).toContain("è già nel girato")
  })
})

describe("cercaDoppione", () => {
  const girato = new Map([["2026-10-09", new Map([["20261009-140509-clip.mp4", { nome: "20261009-140509-clip.mp4", byte: 10 }], ["a-mano.mov", { nome: "a-mano.mov", byte: 5 }]])]])
  test("guarda il nome senza il giorno d'arrivo e la grandezza, anche per un file messo a mano", () => {
    expect(cercaDoppione(girato, "CLIP.mp4", 10)).toBe("2026-10-09/20261009-140509-clip.mp4")
    expect(cercaDoppione(girato, "a-mano.mov", 5)).toBe("2026-10-09/a-mano.mov")
    expect(cercaDoppione(girato, "clip.mp4", 11)).toBeNull()
    expect(cercaDoppione(girato, "altro.mp4", 10)).toBeNull()
  })
})
