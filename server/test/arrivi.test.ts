import { afterEach, describe, expect, test } from "bun:test"
import { createHash, randomBytes } from "node:crypto"
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { connect } from "node:net"
import { join } from "node:path"
import { aspetta, ascolta, avviaAmbiente, chiama, fermaTutti, scriviGrezzo, scriviVideo, type Ambiente } from "./aiuti"

afterEach(fermaTutti)

const ADESSO = new Date(2026, 9, 9, 14, 5, 9)

// Lo spazio libero è quello di un disco grande, non della macchina su cui girano le prove (sotto mezzo giga il ricevitore rifiuta).
const OPZIONI_ARRIVI = { porta: 0, limiteByte: 20 * 1024 ** 3, indirizzo: "192.168.1.20", adesso: () => ADESSO, spazioLibero: () => 100 * 1024 ** 3 }
/** Un server con la ricezione dal telefono già accesa (di base è spenta finché non si collega un telefono). */
const avvia = async (extra: Parameters<typeof avviaAmbiente>[0] = {}, semina?: Parameters<typeof avviaAmbiente>[1]) => {
  const a = await avviaAmbiente({ arrivi: OPZIONI_ARRIVI, ...extra }, semina)
  await chiama(a, "PUT", "/api/arrivi", { acceso: true })
  return a
}
const chiave = async (a: Ambiente): Promise<string> => JSON.parse(await readFile(join(a.archivio, "arrivi", "chiave.json"), "utf-8")).chiave
const base = (a: Ambiente): string => `http://127.0.0.1:${a.server.portaArrivi}`
const indirizzo = async (a: Ambiente, chiaveDaUsare?: string): Promise<string> => `${base(a)}/arrivi/contenuti-video?chiave=${encodeURIComponent(chiaveDaUsare ?? (await chiave(a)))}`
const giorno = (a: Ambiente): string => join(a.archivio, "grezzo", "2026-10-09")
const inCorso = async (a: Ambiente): Promise<string[]> => readdir(join(a.archivio, "arrivi", ".in-corso")).catch(() => [])
/** I file arrivati e già al loro posto nel giorno di arrivo: aspetta quelli che stanno ancora in `.in-corso/` per la misura. */
const arrivati = async (a: Ambiente): Promise<string[]> => {
  await aspetta(async () => (await inCorso(a)).every((n) => !n.endsWith(".attesa")) || null, 15_000).catch(() => null)
  return (await readdir(giorno(a)).catch(() => [])).filter((n) => !n.endsWith(".scheda.json"))
}
const parziali = async (a: Ambiente): Promise<string[]> => (await inCorso(a)).filter((n) => !n.endsWith(".attesa"))
const registro = async (a: Ambiente): Promise<Record<string, unknown>[]> =>
  (await readFile(join(a.archivio, "arrivi", "registro.jsonl"), "utf-8"))
    .trim()
    .split("\n")
    .map((r) => JSON.parse(r))

const ffmpeg = async (argomenti: string[]): Promise<void> => {
  const p = Bun.spawn(["ffmpeg", "-y", "-loglevel", "error", ...argomenti], { stdout: "ignore", stderr: "pipe" })
  if ((await p.exited) !== 0) throw new Error(await new Response(p.stderr).text())
}

async function creaVideoProva(percorso: string, opzioni: { rotazione?: number; metadati?: string[] } = {}): Promise<void> {
  await mkdir(join(percorso, ".."), { recursive: true })
  const diritto = `${percorso}.diritto.mp4`
  await ffmpeg(["-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=10", "-f", "lavfi", "-i", "sine=duration=1", "-shortest", "-pix_fmt", "yuv420p", ...(opzioni.metadati ?? []), "-movflags", "use_metadata_tags", diritto])
  if (!opzioni.rotazione) return void (await Bun.write(percorso, Bun.file(diritto)))
  await ffmpeg(["-display_rotation", String(opzioni.rotazione), "-i", diritto, "-c", "copy", percorso])
}

describe("il ricevitore dal telefono", () => {
  test("il corpo grezzo arriva identico in grezzo/<giorno>/<AAAAMMGG-HHMMSS>-<nome>, con la scheda, il registro e nessun parziale", async () => {
    const a = await avvia({ ffprobe: null })
    const contenuto = randomBytes(300_000)
    const r = await fetch(await indirizzo(a), { method: "POST", body: contenuto, headers: { "x-nome-file": "IMG_0042.MOV", "content-type": "video/quicktime" } })
    expect(r.status).toBe(201)
    expect(await r.json()).toEqual({ ok: true, messaggio: "Ricevuto: IMG_0042.MOV (1 MB).", file: "20261009-140509-IMG_0042.MOV", byte: 300_000 })
    expect(await arrivati(a)).toEqual(["20261009-140509-IMG_0042.MOV"])
    expect((await readFile(join(giorno(a), "20261009-140509-IMG_0042.MOV"))).equals(contenuto)).toBe(true)
    expect(JSON.parse(await readFile(join(giorno(a), "20261009-140509-IMG_0042.MOV.scheda.json"), "utf-8"))).toEqual({ tipo: "ripresa", origine: "telefono", arrivato: "2026-10-09T14:05:09", note: "" })
    expect(await parziali(a)).toEqual([])
    expect((await registro(a)).map((r) => [r.esito, r.file])).toEqual([
      ["ricevuto", "20261009-140509-IMG_0042.MOV"],
      ["collocato", "2026-10-09/20261009-140509-IMG_0042.MOV"],
    ])
  })

  test("il modulo multipart (Comandi Rapidi: Modulo, File) arriva identico, col nome ripulito", async () => {
    const a = await avvia({ ffprobe: null })
    const contenuto = randomBytes(5 * 1024 ** 2)
    const form = new FormData()
    form.append("altro", "testo")
    form.append("file", new File([contenuto], "Vacanza è bella?.mov", { type: "video/quicktime" }))
    const r = await fetch(await indirizzo(a), { method: "POST", body: form })
    expect(r.status).toBe(201)
    const [nome] = await arrivati(a)
    expect(nome).toBe("20261009-140509-Vacanza è bella_.mov")
    expect((await readFile(join(giorno(a), nome!))).equals(contenuto)).toBe(true)
  })

  test("un nome malevolo si riduce al solo nome, dentro la cartella", async () => {
    const a = await avvia({ ffprobe: null })
    for (const nome of ["..\\..\\..\\Windows\\evil.mov", "../../fuori.mov", "C:\\x\\y\\zz.mov", "con.mov"]) {
      const r = await fetch(await indirizzo(a), { method: "POST", body: "abc", headers: { "x-nome-file": encodeURIComponent(nome) } })
      expect(r.status).toBe(201)
    }
    expect((await arrivati(a)).map((n) => n.slice(16)).sort()).toEqual(["_con.mov", "evil.mov", "fuori.mov", "zz.mov"])
    expect(await stat(join(a.archivio, "fuori.mov")).catch(() => null)).toBeNull()
  })

  test("due file con lo stesso nome nello stesso secondo non si sovrascrivono", async () => {
    const a = await avvia({ ffprobe: null })
    for (const corpo of ["uno", "due"]) await fetch(await indirizzo(a), { method: "POST", body: corpo, headers: { "x-nome-file": "a.mov" } })
    expect((await arrivati(a)).sort()).toEqual(["20261009-140509-a-2.mov", "20261009-140509-a.mov"])
  })

  describe("la chiave", () => {
    test("giusta nei tre modi: nell'indirizzo, in Authorization, in X-Chiave", async () => {
      const a = await avvia({ ffprobe: null })
      const k = await chiave(a)
      const senza = `${base(a)}/arrivi/contenuti-video`
      expect((await fetch(`${senza}?chiave=${k}`, { method: "POST", body: "1", headers: { "x-nome-file": "uno.mov" } })).status).toBe(201)
      expect((await fetch(senza, { method: "POST", body: "2", headers: { "x-nome-file": "due.mov", authorization: `Bearer ${k}` } })).status).toBe(201)
      expect((await fetch(senza, { method: "POST", body: "3", headers: { "x-nome-file": "tre.mov", "x-chiave": k } })).status).toBe(201)
    })

    test("sbagliata o assente nei tre modi: 401, e non si scrive niente", async () => {
      const a = await avvia({ ffprobe: null })
      const senza = `${base(a)}/arrivi/contenuti-video`
      const risposte = await Promise.all([
        fetch(`${senza}?chiave=nonlagiusta`, { method: "POST", body: "1", headers: { "x-nome-file": "a.mov" } }),
        fetch(senza, { method: "POST", body: "1", headers: { "x-nome-file": "a.mov", authorization: "Bearer nonlagiusta" } }),
        fetch(senza, { method: "POST", body: "1", headers: { "x-nome-file": "a.mov", "x-chiave": "nonlagiusta" } }),
        fetch(senza, { method: "POST", body: "1", headers: { "x-nome-file": "a.mov" } }),
      ])
      expect(risposte.map((r) => r.status)).toEqual([401, 401, 401, 401])
      expect(((await risposte[0]!.json()) as { errore: string }).errore).toContain("riapri il codice QR")
      expect(await arrivati(a)).toEqual([])
      expect((await registro(a))[0]).toMatchObject({ esito: "rifiutato", motivo: "chiave sbagliata" })
    })

    test("la chiave si genera una volta e resta la stessa dopo un riavvio", async () => {
      const a = await avvia({ ffprobe: null })
      const k = await chiave(a)
      expect(k.length).toBeGreaterThanOrEqual(32)
      await a.server.ferma()
      const b = await avvia({ archivio: a.archivio, stile: a.stile, ffprobe: null })
      expect(await chiave(b)).toBe(k)
    })
  })

  describe("i generi", () => {
    test("video, audio e foto passano; documenti e sconosciuti no (415), e non resta niente", async () => {
      const a = await avvia({ ffprobe: null })
      const manda = async (nome: string, tipo?: string) => fetch(await indirizzo(a), { method: "POST", body: "abc", headers: { "x-nome-file": nome, ...(tipo ? { "content-type": tipo } : {}) } })
      for (const nome of ["a.mov", "b.m4a", "c.heic", "d.mp4"]) expect((await manda(nome)).status).toBe(201)
      const documento = await manda("e.pdf")
      expect(documento.status).toBe(415)
      expect(((await documento.json()) as { errore: string }).errore).toContain("solo video, registrazioni audio, foto")
      expect((await manda("senza-estensione", "application/octet-stream")).status).toBe(415)
      expect((await manda("f.zip")).status).toBe(415)
      const form = new FormData()
      form.append("file", new File(["x"], "g.docx"))
      expect((await fetch(await indirizzo(a), { method: "POST", body: form })).status).toBe(415)
      expect(await arrivati(a)).toHaveLength(4)
      expect(await parziali(a)).toEqual([])
    })

    test("un file vuoto e un modulo senza file o interrotto sono rifiutati (400)", async () => {
      const a = await avvia({ ffprobe: null })
      expect((await fetch(await indirizzo(a), { method: "POST", body: "", headers: { "x-nome-file": "a.mov" } })).status).toBe(400)
      const soloTesto = new FormData()
      soloTesto.append("altro", "x")
      expect((await fetch(await indirizzo(a), { method: "POST", body: soloTesto })).status).toBe(400)
      const confine = "----prova"
      const metà = `--${confine}\r\nContent-Disposition: form-data; name="file"; filename="a.mov"\r\nContent-Type: video/quicktime\r\n\r\n${"x".repeat(5000)}`
      const interrotto = await fetch(await indirizzo(a), { method: "POST", body: metà, headers: { "content-type": `multipart/form-data; boundary=${confine}` } })
      expect(interrotto.status).toBe(400)
      expect(((await interrotto.json()) as { errore: string }).errore).toContain("a metà")
      expect(await arrivati(a)).toEqual([])
      expect(await parziali(a)).toEqual([])
    })
  })

  describe("i limiti", () => {
    test("oltre il limite dichiarato: 413 prima di leggere; a metà se la lunghezza manca", async () => {
      const a = await avvia({ ffprobe: null, arrivi: { porta: 0, limiteByte: 1024 ** 2, indirizzo: null, spazioLibero: () => 100 * 1024 ** 3 } })
      const troppo = randomBytes(1_200_000)
      const dichiarato = await fetch(await indirizzo(a), { method: "POST", body: troppo, headers: { "x-nome-file": "a.mov" } })
      expect(dichiarato.status).toBe(413)
      const flusso = new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < 12; i++) c.enqueue(troppo.subarray(i * 100_000, (i + 1) * 100_000))
          c.close()
        },
      })
      const senzaLunghezza = await fetch(await indirizzo(a), { method: "POST", body: flusso, headers: { "x-nome-file": "a.mov" } })
      expect(senzaLunghezza.status).toBe(413)
      expect(await arrivati(a)).toEqual([])
      expect(await parziali(a)).toEqual([])
    })

    test("disco pieno: 507 con lo spazio che manca, prima di scrivere; e se finisce a metà il parziale sparisce", async () => {
      const a = await avvia({ ffprobe: null, arrivi: { porta: 0, limiteByte: 20 * 1024 ** 3, indirizzo: null, spazioLibero: () => 100 * 1024 ** 2 } })
      const r = await fetch(await indirizzo(a), { method: "POST", body: "abc", headers: { "x-nome-file": "a.mov" } })
      expect(r.status).toBe(507)
      expect(((await r.json()) as { errore: string }).errore).toContain("spazio")
      expect(await arrivati(a)).toEqual([])

      let chiamate = 0
      const b = await avvia({ ffprobe: null, arrivi: { porta: 0, limiteByte: 20 * 1024 ** 3, indirizzo: null, spazioLibero: () => (++chiamate === 1 ? 10 * 1024 ** 3 : 1024) } })
      const pezzo = new Uint8Array(1024 ** 2)
      let inviati = 0
      const flusso = new ReadableStream<Uint8Array>({
        pull(c) {
          c.enqueue(pezzo)
          if (++inviati === 300) c.close()
        },
      })
      const metà = await fetch(await indirizzo(b), { method: "POST", body: flusso, headers: { "x-nome-file": "a.mov" } })
      expect(metà.status).toBe(507)
      expect(await arrivati(b)).toEqual([])
      expect(await parziali(b)).toEqual([])
    }, 30_000)

    test("50 MB a pezzi arrivano identici senza che la memoria cresca come il file", async () => {
      const a = await avvia({ ffprobe: null })
      const pezzo = randomBytes(1024 ** 2)
      const hash = createHash("sha256")
      let inviati = 0
      let picco = 0
      Bun.gc(true)
      const prima = process.memoryUsage().rss
      const flusso = new ReadableStream<Uint8Array>({
        async pull(c) {
          if (inviati === 50) return c.close()
          hash.update(pezzo)
          c.enqueue(pezzo)
          inviati++
          picco = Math.max(picco, process.memoryUsage().rss)
          await Bun.sleep(2)
        },
      })
      const r = await fetch(await indirizzo(a), { method: "POST", body: flusso, headers: { "x-nome-file": "grande.mov" } })
      expect(r.status).toBe(201)
      const [nome] = await arrivati(a)
      expect((await stat(join(giorno(a), nome!))).size).toBe(50 * 1024 ** 2)
      expect(createHash("sha256").update(await readFile(join(giorno(a), nome!))).digest("hex")).toBe(hash.digest("hex"))
      expect(picco - prima).toBeLessThan(30 * 1024 ** 2)
    })
  })

  describe("quando qualcosa va storto", () => {
    test("un invio interrotto dal telefono si registra come collegamento interrotto, senza rumore nel terminale, e non lascia parziali", async () => {
      const a = await avvia({ ffprobe: null })
      const k = await chiave(a)
      const rumore: string[] = []
      const originale = console.error
      console.error = (...x: unknown[]) => void rumore.push(x.map(String).join(" "))
      try {
        const presa = connect(a.server.portaArrivi!, "127.0.0.1")
        await new Promise((fatto) => presa.on("connect", fatto))
        presa.write(`POST /arrivi/contenuti-video?chiave=${k} HTTP/1.1\r\nHost: x\r\nx-nome-file: a.mov\r\nContent-Type: video/quicktime\r\nContent-Length: 1000000\r\n\r\n`)
        presa.write(Buffer.alloc(100_000, 1))
        await Bun.sleep(200)
        presa.destroy()
        const riga = await aspetta(async () => (await registro(a).catch(() => [])).find((r) => r.esito === "rifiutato"))
        expect(String(riga.motivo)).toContain("collegamento")
        expect(String(riga.motivo)).not.toContain("storto")
        expect(riga).toMatchObject({ nome_originale: "a.mov", byte: 100_000 })
      } finally {
        console.error = originale
      }
      expect(rumore).toEqual([])
      expect(await parziali(a)).toEqual([])
      expect(await arrivati(a)).toEqual([])
    })

    test("un errore imprevisto dice la causa: nella risposta, e nel registro con il dettaglio", async () => {
      const a = await avvia({ ffprobe: null })
      await mkdir(join(a.archivio, "arrivi"), { recursive: true })
      await writeFile(join(a.archivio, "arrivi", ".in-corso"), "un file al posto della cartella")
      const originale = console.error
      console.error = () => undefined
      try {
        const r = await fetch(await indirizzo(a), { method: "POST", body: "abc", headers: { "x-nome-file": "a.mov" } })
        expect(r.status).toBe(500)
        const errore = ((await r.json()) as { errore: string }).errore
        expect(errore).not.toBe("Qualcosa è andato storto sul computer: il file non è stato salvato.")
        expect(errore).toContain("non è riuscito a salvare")
        expect(errore).toMatch(/EEXIST|ENOTDIR|file already exists/i)
        const riga = (await registro(a)).find((x) => x.esito === "rifiutato")!
        expect(String(riga.dettaglio)).toMatch(/EEXIST|ENOTDIR|file already exists/i)
      } finally {
        console.error = originale
      }
    })
  })

  describe("guardare i video dal telefono", () => {
    const semina = async (c: Parameters<NonNullable<Parameters<typeof avviaAmbiente>[1]>>[0]): Promise<void> => {
      const uscite = (slug: string) => join(c.archivio, "video", slug, "uscite")
      await scriviVideo(c, "uno", { titolo: "Il primo", stato: "in lavorazione", creato: "2026-10-06" })
      await scriviVideo(c, "due", { titolo: "Il secondo", stato: "pronto", creato: "2026-10-07" })
      await scriviVideo(c, "tre", { titolo: "Il terzo", stato: "proposta", creato: "2026-10-08" })
      await mkdir(uscite("uno"), { recursive: true })
      await mkdir(uscite("due"), { recursive: true })
      await writeFile(join(uscite("uno"), "finale.mp4"), "finale-uno")
      await writeFile(join(uscite("due"), "finale.mp4"), "finale-due")
      await writeFile(join(uscite("due"), "con-copertina.mp4"), "0123456789")
    }

    test("la pagina elenca i video montati e si apre solo con la chiave", async () => {
      const a = await avvia({ ffprobe: null }, semina)
      const k = await chiave(a)
      const r = await fetch(`${base(a)}/guarda?chiave=${k}`)
      expect(r.status).toBe(200)
      const html = await r.text()
      expect(html).toContain("Il primo")
      expect(html).toContain("Il secondo")
      expect(html).not.toContain("Il terzo")
      expect(html).toContain(`/guarda/due.mp4?chiave=${k}`)
      expect((await fetch(`${base(a)}/guarda?chiave=no`)).status).toBe(401)
    })

    test("il video si scorre a pezzi ed è quello con la copertina, se c'è", async () => {
      const a = await avvia({ ffprobe: null }, semina)
      const k = await chiave(a)
      const pezzo = await fetch(`${base(a)}/guarda/due.mp4?chiave=${k}`, { headers: { range: "bytes=2-5" } })
      expect(pezzo.status).toBe(206)
      expect(pezzo.headers.get("content-range")).toBe("bytes 2-5/10")
      expect(await pezzo.text()).toBe("2345")
      expect(await (await fetch(`${base(a)}/guarda/uno.mp4?chiave=${k}`)).text()).toBe("finale-uno")
      for (const slug of ["tre", "nessuno", "..%2Funo"]) expect((await fetch(`${base(a)}/guarda/${slug}.mp4?chiave=${k}`)).status, slug).toBe(404)
      expect((await fetch(`${base(a)}/guarda/due.mp4?chiave=no`)).status).toBe(401)
    })

    test("le prove prima di registrare stanno in una sezione a parte e si guardano a pezzi", async () => {
      const a = await avvia({ ffprobe: null }, async (c) => {
        await semina(c)
        const uscite = (slug: string) => join(c.archivio, "video", slug, "uscite")
        await mkdir(uscite("tre"), { recursive: true })
        await writeFile(join(uscite("tre"), "prova.mp4"), "prova-tre-abcdef")
        await writeFile(join(uscite("uno"), "prova.mp4"), "prova-uno")
      })
      const k = await chiave(a)
      const html = await (await fetch(`${base(a)}/guarda?chiave=${k}`)).text()
      expect(html).toContain("Le prove")
      expect(html).toContain(`/guarda/prova/tre.mp4?chiave=${k}`)
      expect(html).toContain(`/guarda/prova/uno.mp4?chiave=${k}`)
      expect(html).not.toContain(`/guarda/tre.mp4`)
      expect(html).toContain(`/guarda/due.mp4?chiave=${k}`)
      const pezzo = await fetch(`${base(a)}/guarda/prova/tre.mp4?chiave=${k}`, { headers: { range: "bytes=2-5" } })
      expect(pezzo.status).toBe(206)
      expect(await pezzo.text()).toBe("ova-")
      expect(await (await fetch(`${base(a)}/guarda/prova/uno.mp4?chiave=${k}`)).text()).toBe("prova-uno")
      expect((await fetch(`${base(a)}/guarda/tre.mp4?chiave=${k}`)).status).toBe(404)
      for (const slug of ["due", "nessuno", "..%2Funo"]) expect((await fetch(`${base(a)}/guarda/prova/${slug}.mp4?chiave=${k}`)).status, slug).toBe(404)
      expect((await fetch(`${base(a)}/guarda/prova/tre.mp4?chiave=no`)).status).toBe(401)
    })

    test("la pagina da leggere mentre si registra sta in una sezione «Da registrare»", async () => {
      const a = await avvia({ ffprobe: null }, async (c) => {
        await semina(c)
        await writeFile(join(c.archivio, "video", "uno", "uscite", "copione.html"), "<p>Prima frase da dire.</p>")
      })
      const k = await chiave(a)
      const html = await (await fetch(`${base(a)}/guarda?chiave=${k}`)).text()
      expect(html).toContain("Da registrare")
      expect(html).toContain(`/guarda/copione/uno.html?chiave=${k}`)
      expect(html).not.toContain(`/guarda/copione/due.html`)
      const pagina = await fetch(`${base(a)}/guarda/copione/uno.html?chiave=${k}`)
      expect(pagina.status).toBe(200)
      expect(pagina.headers.get("content-type")).toContain("text/html")
      expect(await pagina.text()).toBe("<p>Prima frase da dire.</p>")
      for (const slug of ["due", "nessuno", "..%2Funo"]) expect((await fetch(`${base(a)}/guarda/copione/${slug}.html?chiave=${k}`)).status, slug).toBe(404)
      expect((await fetch(`${base(a)}/guarda/copione/uno.html?chiave=no`)).status).toBe(401)
    })

    test("lo stato degli arrivi dà l'indirizzo della pagina, con la chiave, e il suo codice QR", async () => {
      const a = await avvia({ ffprobe: null })
      const k = await chiave(a)
      const stato = await chiama<{ guarda: string; qr_guarda: string }>(a, "GET", "/api/arrivi")
      expect(stato.corpo.guarda).toBe(`http://192.168.1.20:${a.server.portaArrivi}/guarda?chiave=${encodeURIComponent(k)}`)
      expect(stato.corpo.qr_guarda).toContain("<svg")
    })
  })

  describe("caricare dal telefono", () => {
    test("la pagina si apre solo con la chiave e manda ogni file com'è, senza leggerlo in memoria", async () => {
      const a = await avvia({ ffprobe: null })
      const k = await chiave(a)
      expect((await fetch(`${base(a)}/carica?chiave=no`)).status).toBe(401)
      expect((await fetch(`${base(a)}/carica`)).status).toBe(401)
      expect((await fetch(`${base(a)}/carica?chiave=${k}`, { method: "POST", body: "x" })).status).toBe(405)
      const r = await fetch(`${base(a)}/carica?chiave=${k}`)
      expect(r.status).toBe(200)
      expect(r.headers.get("content-type")).toContain("text/html")
      const html = await r.text()
      expect(html).toContain(`accept="video/*,image/*,audio/*,.m4a,.mp3,.wav,.aac,.caf,.aif,.aiff,.flac,.ogg,.opus"`)
      expect(html).toContain("multiple")
      expect(html).toContain("Carica video")
      expect(html).toContain("«Opzioni»")
      expect(html).toContain("«Attuale»")
      expect(html).toContain("xhr.send(file)")
      expect(html).toContain("upload.onprogress")
      expect(html).toContain(`"/arrivi/contenuti-video?chiave=${encodeURIComponent(k)}"`)
      expect(html).not.toContain("FileReader")
      expect(html).not.toContain("arrayBuffer")
    })


    test("lo stato degli arrivi dà l'indirizzo della pagina, con la chiave, e il suo codice QR", async () => {
      const a = await avvia({ ffprobe: null })
      const k = await chiave(a)
      const stato = await chiama<{ carica: string; qr_carica: string; qr_guarda: string }>(a, "GET", "/api/arrivi")
      expect(stato.corpo.carica).toBe(`http://192.168.1.20:${a.server.portaArrivi}/carica?chiave=${encodeURIComponent(k)}`)
      expect(stato.corpo.qr_carica).toContain("<svg")
      expect(stato.corpo.qr_carica).not.toBe(stato.corpo.qr_guarda)
    })
  })

  describe("le rotte e nient'altro", () => {
    test("la guida mostra l'indirizzo con la chiave, sull'host da cui l'iPhone è arrivato, e il nome invariato della Scorciatoia", async () => {
      const a = await avvia({ ffprobe: null })
      const k = await chiave(a)
      const r = await fetch(`${base(a)}/installa/contenuti-video?chiave=${k}`, { headers: { host: "192.168.1.20:47420" } })
      expect(r.status).toBe(200)
      const html = await r.text()
      expect(html).toContain(`http://192.168.1.20:47420/arrivi/contenuti-video?chiave=${k}`)
      expect(html).toContain("Manda a Mango Animation")
      expect(html).toContain("a Mango Animation, originale")
      expect(html).toContain("codice QR in Mango Animation")
      expect(html).toContain("fino a 20 GB")
      expect((await fetch(`${base(a)}/installa/contenuti-video?chiave=no`)).status).toBe(401)
    })

    test("ogni altro percorso è 404 e il metodo sbagliato 405, anche con la chiave giusta; l'API non esce su questa porta", async () => {
      const a = await avvia({ ffprobe: null })
      const k = await chiave(a)
      for (const percorso of ["/", "/api/video", "/api/arrivi", "/media/x", "/arrivi", "/arrivi/altro", "/arrivi/contenuti-video/altro", "/installa", "/font/Archivo-700.ttf"]) {
        expect((await fetch(`${base(a)}${percorso}?chiave=${k}`)).status, percorso).toBe(404)
      }
      expect((await fetch(await indirizzo(a))).status).toBe(405)
      expect((await fetch(`${base(a)}/installa/contenuti-video?chiave=${k}`, { method: "POST" })).status).toBe(405)
    })
  })

  describe("la porta", () => {
    test("occupata: il server non cade, e GET /api/arrivi lo dice", async () => {
      const occupante = Bun.serve({ port: 0, hostname: "0.0.0.0", fetch: () => new Response("") })
      try {
        const a = await avvia({ ffprobe: null, arrivi: { porta: occupante.port!, limiteByte: 1024 ** 3, indirizzo: "192.168.1.20" } })
        const r = await chiama<{ in_ascolto: boolean; indirizzo: string | null; qr: string | null; errore: string; ultimi: unknown[] }>(a, "GET", "/api/arrivi")
        expect(r.corpo).toMatchObject({ in_ascolto: false, indirizzo: null, qr: null, ultimi: [] })
        expect(r.corpo.errore).toContain(String(occupante.port))
        expect(a.server.portaArrivi).toBeNull()
        expect((await chiama(a, "GET", "/api/video")).stato).toBe(200)
      } finally {
        occupante.stop(true)
      }
    })

    test("in ascolto: indirizzo del computer, codice QR verso la guida, ultimi arrivi, messaggi «arrivi» e «grezzo»", async () => {
      const a = await avvia({ ffprobe: null })
      const ascolto = await ascolta(a)
      const prima = await chiama<{ in_ascolto: boolean; indirizzo: string; qr: string; errore: null; ultimi: unknown[] }>(a, "GET", "/api/arrivi")
      expect(prima.corpo).toMatchObject({ in_ascolto: true, indirizzo: `192.168.1.20:${a.server.portaArrivi}`, errore: null, ultimi: [] })
      expect(prima.corpo.qr.startsWith("<svg")).toBe(true)
      expect(prima.corpo.qr).toContain("Codice QR")

      await fetch(await indirizzo(a), { method: "POST", body: "abc", headers: { "x-nome-file": "a.mov" } })
      await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "arrivi"))
      await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "grezzo"))
      const dopo = await chiama<{ ultimi: { file: string; quando: string; byte: number }[] }>(a, "GET", "/api/arrivi")
      expect(dopo.corpo.ultimi).toEqual([{ file: "2026-10-09/20261009-140509-a.mov", quando: ADESSO.toISOString(), byte: 3 }])
      const girato = await chiama<{ giorno: string; file: { file: string; scheda: { origine: string } }[] }[]>(a, "GET", "/api/grezzo")
      expect(girato.corpo[0]).toMatchObject({ giorno: "2026-10-09", file: [{ file: "2026-10-09/20261009-140509-a.mov", scheda: { origine: "telefono" } }] })
      ascolto.chiudi()

      await a.server.ferma()
      const b = await avvia({ archivio: a.archivio, stile: a.stile, ffprobe: null })
      expect((await chiama<{ ultimi: { file: string }[] }>(b, "GET", "/api/arrivi")).corpo.ultimi[0]?.file).toBe("2026-10-09/20261009-140509-a.mov")
    })
  })
})

const mandaVideo = async (a: Ambiente, nome: string, opzioni: Parameters<typeof creaVideoProva>[1] = {}): Promise<Response> => {
  const video = join(a.radice, nome)
  await creaVideoProva(video, opzioni)
  return fetch(await indirizzo(a), { method: "POST", body: Bun.file(video), headers: { "x-nome-file": nome } })
}
const schedaDi = async (percorso: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(`${percorso}.scheda.json`, "utf-8"))

describe("durata, misure e giorno con ffprobe", () => {
  test("un file arrivato dal telefono va nel giorno di arrivo, con la scheda già completa di durata e misure", async () => {
    const a = await avvia()
    expect((await mandaVideo(a, "prova.mov")).status).toBe(201)
    expect(await arrivati(a)).toEqual(["20261009-140509-prova.mov"])
    const scheda = await schedaDi(join(giorno(a), "20261009-140509-prova.mov"))
    expect(scheda).toMatchObject({ tipo: "ripresa", origine: "telefono", arrivato: "2026-10-09T14:05:09", largo: 320, alto: 240, fps: 10 })
    expect(scheda["durata"] as number).toBeGreaterThan(0.9)
    expect(scheda["durata"] as number).toBeLessThan(1.2)
  })

  test("un video girato in verticale (ruotato nei metadati) ha le misure ruotate", async () => {
    const a = await avvia()
    await mandaVideo(a, "verticale.mov", { rotazione: 90 })
    await arrivati(a)
    const scheda = await schedaDi(join(giorno(a), "20261009-140509-verticale.mov"))
    expect([scheda["largo"], scheda["alto"]]).toEqual([240, 320])
  })

  test("una foto HEIC arrivata dal telefono non prende le misure del riquadro che ffprobe leggerebbe: se ne occupa il motore", async () => {
    const a = await avvia()
    const foto = join(a.radice, "foto.jpg")
    await ffmpeg(["-f", "lavfi", "-i", "testsrc=size=320x240:rate=1", "-frames:v", "1", foto])
    expect((await fetch(await indirizzo(a), { method: "POST", body: Bun.file(foto), headers: { "x-nome-file": "IMG_1.heic" } })).status).toBe(201)
    await arrivati(a)
    expect(await schedaDi(join(giorno(a), "20261009-140509-IMG_1.heic"))).toEqual({ tipo: "ripresa", origine: "telefono", arrivato: "2026-10-09T14:05:09", note: "" })
  })

  test("se ffprobe non legge il file all'arrivo, il terminale dice quale file e perché; il file entra lo stesso", async () => {
    const a = await avvia()
    const righe: string[] = []
    const originale = console.error
    console.error = (...x: unknown[]) => void righe.push(x.map(String).join(" "))
    try {
      expect((await fetch(await indirizzo(a), { method: "POST", body: "non è un video", headers: { "x-nome-file": "rotto.mov" } })).status).toBe(201)
      expect(await arrivati(a)).toEqual(["20261009-140509-rotto.mov"])
    } finally {
      console.error = originale
    }
    const riga = righe.find((r) => r.includes("ffprobe non ha letto"))
    expect(riga).toContain("20261009-140509-rotto.mov")
    expect(riga).toMatch(/Invalid data|moov atom|codice/i)
  })

  test("il giorno è quello di arrivo, anche quando il file dice di essere stato girato un altro giorno", async () => {
    const a = await avvia()
    await mandaVideo(a, "iphone.mov", { metadati: ["-metadata", "com.apple.quicktime.creationdate=2026-10-04T23:30:00+0200", "-metadata", "creation_time=2026-10-04T21:30:00Z"] })
    expect(await arrivati(a)).toEqual(["20261009-140509-iphone.mov"])
    expect(await readdir(join(a.archivio, "grezzo"))).toEqual(["2026-10-09"])
  })

  test("la risposta al telefono non aspetta ffprobe: il file resta in .in-corso finché non è misurato", async () => {
    const a = await avvia({}, async (c) => {
      await writeFile(join(c.radice, "ffprobe-lento.cmd"), '@echo off\r\nping -n 3 127.0.0.1 >nul\r\necho {"format":{"duration":"2.5"},"streams":[{"codec_type":"video","width":100,"height":50,"avg_frame_rate":"25/1"}]}\r\n')
    })
    await a.server.ferma()
    const b = await avvia({ archivio: a.archivio, stile: a.stile, ffprobe: join(a.radice, "ffprobe-lento.cmd") })
    const inizio = Date.now()
    const r = await fetch(await indirizzo(b), { method: "POST", body: "contenuto", headers: { "x-nome-file": "lento.mov" } })
    expect(r.status).toBe(201)
    expect(Date.now() - inizio).toBeLessThan(1500)
    expect((await inCorso(b)).filter((n) => n.endsWith(".attesa"))).toHaveLength(1)
    expect(await stat(join(b.archivio, "grezzo", "2026-10-09")).catch(() => null)).toBeNull()

    await b.server.ricevitore.attendi()
    expect(await inCorso(b)).toEqual([])
    const nome = "20261009-140509-lento.mov"
    expect((await readFile(join(b.archivio, "grezzo", "2026-10-09", nome), "utf-8"))).toBe("contenuto")
    expect(await schedaDi(join(b.archivio, "grezzo", "2026-10-09", nome))).toMatchObject({ durata: 2.5, largo: 100, alto: 50, fps: 25 })
  })

  test("un file rimasto in .in-corso (il server si è fermato prima della misura) si colloca al riavvio", async () => {
    const a = await avvia({}, async (c) => {
      await mkdir(join(c.archivio, "arrivi", ".in-corso"), { recursive: true })
      await writeFile(join(c.archivio, "arrivi", ".in-corso", "20261008-101500-rimasto.mov.abcd1234.attesa"), "dati")
    })
    await a.server.ricevitore.attendi()
    const dentro = join(a.archivio, "grezzo", "2026-10-08", "20261008-101500-rimasto.mov")
    expect(await readFile(dentro, "utf-8")).toBe("dati")
    expect(await schedaDi(dentro)).toMatchObject({ origine: "telefono", arrivato: "2026-10-08T10:15:00" })
    expect(await inCorso(a)).toEqual([])
  })

  test("un file messo in grezzo/ senza scheda ne riceve una (tipo «altro»), con ffprobe lanciato una volta sola e mai da una GET", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await writeFile(
        join(c.radice, "ffprobe.cmd"),
        '@echo off\r\necho x>>"%~dp0chiamate-ffprobe.log"\r\necho {"format":{"duration":"2.5"},"streams":[{"codec_type":"video","width":100,"height":50,"avg_frame_rate":"25/1"}]}\r\n',
      )
    })
    await a.server.ferma()
    const b = await avviaAmbiente({ archivio: a.archivio, stile: a.stile, ffprobe: join(a.radice, "ffprobe.cmd") })
    const chiamateAllaSonda = async (): Promise<number> => ((await readFile(join(a.radice, "chiamate-ffprobe.log"), "utf-8").catch(() => "")).match(/x/g) ?? []).length

    await scriviGrezzo(b, "2026-10-08/diretta.mp4", "dati", null)
    const scheda = join(b.archivio, "grezzo", "2026-10-08", "diretta.mp4.scheda.json")
    const letta = await aspetta(async () => JSON.parse(await readFile(scheda, "utf-8").catch(() => "null")))
    expect(letta).toMatchObject({ tipo: "altro", origine: "altro", durata: 2.5, largo: 100, alto: 50, fps: 25 })
    expect(letta.arrivato).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    expect(await chiamateAllaSonda()).toBe(1)

    for (let i = 0; i < 5; i++) await chiama(b, "GET", "/api/grezzo")
    await writeFile(join(b.archivio, "grezzo", "2026-10-08", "diretta.mp4"), "dati cambiati")
    await Bun.sleep(400)
    expect(await chiamateAllaSonda()).toBe(1)
    expect((await chiama<{ file: { scheda: { durata: number } }[] }[]>(b, "GET", "/api/grezzo")).corpo[0]!.file[0]!.scheda.durata).toBe(2.5)
  })
})

describe("la miniatura di un file appena entrato", () => {
  const miniatura = (a: Ambiente, file: string): string => join(a.archivio, "preparati", file, "miniatura.jpg")
  const eJpeg = async (percorso: string): Promise<boolean> => {
    const inizio = await readFile(percorso).catch(() => null)
    return inizio !== null && inizio.length > 500 && inizio[0] === 0xff && inizio[1] === 0xd8
  }
  interface Girato {
    file: { file: string; preparato: { miniatura: string | null; leggero: string | null } }[]
  }

  test("un video arrivato dal telefono ha la sua immagine senza che nessuno lo prepari", async () => {
    const a = await avvia({ ffmpeg: Bun.which("ffmpeg") })
    await mandaVideo(a, "prova.mov")
    const file = "2026-10-09/20261009-140509-prova.mov"
    await aspetta(() => eJpeg(miniatura(a, file)), 15_000)
    await aspetta(async () => (await chiama<Girato[]>(a, "GET", "/api/grezzo")).corpo[0]?.file[0]?.preparato.miniatura === `preparati/${file}/miniatura.jpg`)
    expect((await chiama<Girato[]>(a, "GET", "/api/grezzo")).corpo[0]!.file[0]!.preparato.leggero).toBeNull()
    expect((await readdir(join(a.archivio, "preparati", file))).sort()).toEqual(["miniatura.jpg"])
  }, 30_000)

  test("un file che c'era già senza immagine la riceve all'avvio; quella che c'è non si rifà", async () => {
    const a = await avvia({ ffmpeg: Bun.which("ffmpeg") }, async (c) => {
      for (const nome of ["senza.mp4", "con.mp4"]) {
        await creaVideoProva(join(c.archivio, "grezzo", "2026-10-06", nome))
        await writeFile(join(c.archivio, "grezzo", "2026-10-06", `${nome}.scheda.json`), JSON.stringify({ tipo: "ripresa", origine: "telefono", durata: 1 }))
      }
      await mkdir(join(c.archivio, "preparati", "2026-10-06", "con.mp4"), { recursive: true })
      await writeFile(join(c.archivio, "preparati", "2026-10-06", "con.mp4", "miniatura.jpg"), "quella di prima")
    })
    await aspetta(() => eJpeg(miniatura(a, "2026-10-06/senza.mp4")), 15_000)
    expect(await readFile(miniatura(a, "2026-10-06/con.mp4"), "utf-8")).toBe("quella di prima")
  }, 30_000)

  test("una foto JPEG ha la sua immagine: ffmpeg da una foto non ricava niente se gli si chiede un istante", async () => {
    const a = await avvia({ ffmpeg: Bun.which("ffmpeg") }, async (c) => {
      const percorso = join(c.archivio, "grezzo", "2026-10-06", "IMG_5395.jpeg")
      await mkdir(join(percorso, ".."), { recursive: true })
      await ffmpeg(["-f", "lavfi", "-i", "testsrc=size=640x480:rate=1", "-frames:v", "1", percorso])
      await writeFile(`${percorso}.scheda.json`, JSON.stringify({ tipo: "ripresa", origine: "telefono", durata: 0.04, largo: 640, alto: 480 }))
    })
    await aspetta(() => eJpeg(miniatura(a, "2026-10-06/IMG_5395.jpeg")), 15_000)
    // L'elenco si aggiorna dall'osservatore, un attimo dopo il file.
    await aspetta(async () => (await chiama<Girato[]>(a, "GET", "/api/grezzo")).corpo[0]?.file[0]?.preparato.miniatura === "preparati/2026-10-06/IMG_5395.jpeg/miniatura.jpg")
  }, 30_000)

  test("una registrazione audio non ha immagine da cercare: niente tentativo, niente riga nel terminale", async () => {
    const righe: string[] = []
    const originale = console.error
    console.error = (...x: unknown[]) => void righe.push(x.map(String).join(" "))
    try {
      const a = await avvia({ ffmpeg: Bun.which("ffmpeg") }, async (c) => {
        const percorso = join(c.archivio, "grezzo", "2026-10-06", "memo.m4a")
        await mkdir(join(percorso, ".."), { recursive: true })
        await ffmpeg(["-f", "lavfi", "-i", "sine=duration=1", percorso])
        await writeFile(`${percorso}.scheda.json`, JSON.stringify({ tipo: "ripresa", origine: "telefono", durata: 1 }))
      })
      await a.server.miniature.attendi()
      expect(await stat(miniatura(a, "2026-10-06/memo.m4a")).catch(() => null)).toBeNull()
    } finally {
      console.error = originale
    }
    expect(righe.filter((r) => r.includes("miniatura"))).toEqual([])
  }, 30_000)

  test("un file che non è un video resta senza immagine e non rompe niente", async () => {
    const a = await avvia({ ffmpeg: Bun.which("ffmpeg") }, (c) => scriviGrezzo(c, "2026-10-06/rotto.mp4", "non è un video", { tipo: "altro", origine: "altro", durata: 2 }))
    await a.server.miniature.attendi()
    expect(await stat(miniatura(a, "2026-10-06/rotto.mp4")).catch(() => null)).toBeNull()
    expect((await chiama(a, "GET", "/api/grezzo")).stato).toBe(200)
  })
})

describe("la ricezione dal telefono sta spenta finché non si collega un telefono", () => {
  interface Stato {
    acceso: boolean
    in_ascolto: boolean
    indirizzo: string | null
    qr: string | null
    guarda: string | null
    carica: string | null
    pronto: boolean
    motivo: string | null
    errore: string | null
  }
  const apparecchio = (extra: Parameters<typeof avviaAmbiente>[0] = {}) => avviaAmbiente({ arrivi: OPZIONI_ARRIVI, ...extra })
  const stato = async (a: Ambiente): Promise<Stato> => (await chiama<Stato>(a, "GET", "/api/arrivi")).corpo
  const imposta = (a: Ambiente, acceso: boolean) => chiama<Stato>(a, "PUT", "/api/arrivi", { acceso })
  const regola = async (a: Ambiente): Promise<{ acceso: boolean } | null> => JSON.parse(await readFile(join(a.archivio, "arrivi", "ricezione.json"), "utf-8").catch(() => "null"))
  const raggiungibile = (porta: number): Promise<boolean> =>
    new Promise((risolvi) => {
      const presa = connect(porta, "127.0.0.1")
      presa.on("connect", () => {
        presa.destroy()
        risolvi(true)
      })
      presa.on("error", () => risolvi(false))
    })
  const studioAcceso = (a: Ambiente, acceso: boolean) => chiama(a, "PUT", "/api/accesso-studio", { acceso })

  test("di base nessuna porta è in ascolto, lo stato lo dice e non dà né indirizzi né codici", async () => {
    const a = await apparecchio()
    expect(a.server.portaArrivi).toBeNull()
    expect(await stato(a)).toMatchObject({ acceso: false, in_ascolto: false, indirizzo: null, qr: null, guarda: null, carica: null, pronto: false, errore: null })
    expect((await stato(a)).motivo).toContain("spenta")
    expect(await regola(a)).toBeNull()
  })

  test("si accende dallo studio: la porta si apre, i file arrivano, l'evento lo annuncia e la scelta resta dopo un riavvio", async () => {
    const a = await apparecchio()
    const ascolto = await ascolta(a)
    const acceso = await imposta(a, true)
    expect(acceso.stato).toBe(200)
    expect(acceso.corpo).toMatchObject({ acceso: true, in_ascolto: true, indirizzo: `192.168.1.20:${a.server.portaArrivi}`, pronto: true })
    expect(acceso.corpo.qr).toContain("<svg")
    expect(a.server.portaArrivi).toBeGreaterThan(0)
    await aspetta(() => ascolto.messaggi.find((m) => m.tipo === "arrivi"))
    expect((await fetch(await indirizzo(a), { method: "POST", body: "abc", headers: { "x-nome-file": "a.mov" } })).status).toBe(201)
    expect(await regola(a)).toEqual({ acceso: true })
    ascolto.chiudi()

    await a.server.ferma()
    const b = await apparecchio({ lavoro: a.radice, archivio: a.archivio, stile: a.stile })
    expect(b.server.portaArrivi).toBeGreaterThan(0)
    expect((await stato(b)).acceso).toBe(true)
  })

  test("si spegne dallo studio: la porta si chiude, gli indirizzi spariscono e il file già arrivato resta", async () => {
    const a = await apparecchio()
    await imposta(a, true)
    const porta = a.server.portaArrivi!
    await fetch(await indirizzo(a), { method: "POST", body: "abc", headers: { "x-nome-file": "a.mov" } })
    const spento = await imposta(a, false)
    expect(spento.corpo).toMatchObject({ acceso: false, in_ascolto: false, indirizzo: null, qr: null, guarda: null, carica: null, pronto: false })
    expect(a.server.portaArrivi).toBeNull()
    expect(await raggiungibile(porta)).toBe(false)
    expect(await regola(a)).toEqual({ acceso: false })
    expect(await arrivati(a)).toHaveLength(1)

    await a.server.ferma()
    const b = await apparecchio({ lavoro: a.radice, archivio: a.archivio, stile: a.stile })
    expect(b.server.portaArrivi).toBeNull()
    expect((await stato(b)).acceso).toBe(false)
  })

  test("si cambia solo dal computer e con un valore vero o falso", async () => {
    const a = await apparecchio()
    const dallaRete = await fetch(`${a.url}/api/arrivi`, { method: "PUT", headers: { ...a.accesso, "Content-Type": "application/json", "x-dalla-rete": "1" }, body: JSON.stringify({ acceso: true }) })
    expect(dallaRete.status).toBe(403)
    expect((await chiama(a, "PUT", "/api/arrivi", { acceso: "si" })).stato).toBe(400)
    expect((await chiama(a, "PUT", "/api/arrivi", {})).stato).toBe(400)
    expect(a.server.portaArrivi).toBeNull()
  })

  test("se la porta è occupata lo dice, e riprova quando si riaccende", async () => {
    const occupante = Bun.listen({ hostname: "0.0.0.0", port: 0, socket: { data() {} } })
    try {
      const a = await apparecchio({ arrivi: { ...OPZIONI_ARRIVI, porta: occupante.port } })
      const r = await imposta(a, true)
      expect(r.corpo).toMatchObject({ acceso: true, in_ascolto: false, pronto: false })
      expect(r.corpo.errore).toContain("Un altro programma")
      occupante.stop(true)
      await imposta(a, false)
      expect((await imposta(a, true)).corpo).toMatchObject({ in_ascolto: true, errore: null, pronto: true })
    } finally {
      occupante.stop(true)
    }
  })

  test("lo studio dalla rete tiene la porta aperta ma gli arrivi restano spenti: tutto ciò che è del telefono è 404", async () => {
    const a = await apparecchio()
    await studioAcceso(a, true)
    const porta = a.server.portaArrivi
    expect(porta).toBeGreaterThan(0)
    const k = await chiave(a)
    for (const [metodo, percorso] of [["POST", "/arrivi/contenuti-video"], ["GET", "/installa/contenuti-video"], ["GET", "/carica"], ["GET", "/guarda"]] as const) {
      const r = await fetch(`${base(a)}${percorso}?chiave=${encodeURIComponent(k)}`, { method: metodo, body: metodo === "POST" ? "abc" : undefined, headers: { "x-nome-file": "a.mov" } })
      expect([percorso, r.status]).toEqual([percorso, 404])
    }
    expect(await stato(a)).toMatchObject({ acceso: false, in_ascolto: false, indirizzo: null, pronto: false })
    expect((await chiama<{ in_ascolto: boolean }>(a, "GET", "/api/accesso-studio")).corpo.in_ascolto).toBe(true)
    expect(await readdir(join(a.archivio, "grezzo")).catch(() => [])).toEqual([])

    await imposta(a, true)
    expect(a.server.portaArrivi).toBe(porta)
    expect((await fetch(await indirizzo(a), { method: "POST", body: "abc", headers: { "x-nome-file": "a.mov" } })).status).toBe(201)
  })

  test("la porta si chiude solo quando non serve più né ai telefoni né allo studio", async () => {
    const a = await apparecchio()
    await imposta(a, true)
    await studioAcceso(a, true)
    const porta = a.server.portaArrivi!
    await imposta(a, false)
    expect(await raggiungibile(porta)).toBe(true)
    await studioAcceso(a, false)
    expect(a.server.portaArrivi).toBeNull()
    expect(await raggiungibile(porta)).toBe(false)

    await studioAcceso(a, true)
    expect(a.server.portaArrivi).toBeGreaterThan(0)
    await studioAcceso(a, false)
    expect(a.server.portaArrivi).toBeNull()
  })
})
