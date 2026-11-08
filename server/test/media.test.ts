import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { avviaAmbiente, chiama, fermaTutti, piano, scriviGrezzo, scriviVideo, type Ambiente } from "./aiuti"

afterEach(fermaTutti)

const CONTENUTO = Uint8Array.from({ length: 1000 }, (_, i) => i % 251)

const conFile = () =>
  avviaAmbiente({}, async (c) => {
    await scriviVideo(c, "v")
    await writeFile(join(c.radice, "segreto.txt"), "NON SI DEVE LEGGERE")
    await mkdir(join(c.archivio, "video", "v", "uscite"), { recursive: true })
    await writeFile(join(c.archivio, "video", "v", "uscite", "finale.mp4"), CONTENUTO)
    await writeFile(join(c.archivio, "video", "v", "uscite", "foto.PNG"), "png")
    await writeFile(join(c.archivio, "video", "v", "nota.json"), "{}")
  })

/** Una richiesta scritta a mano: `fetch` risolve da solo i «..» (anche `%2e%2e`) prima di mandarli. */
const grezza = (a: Ambiente, percorso: string): Promise<{ stato: number; testo: string }> =>
  new Promise((risolvi) => {
    let ricevuto = ""
    void Bun.connect({
      hostname: "127.0.0.1",
      port: a.server.porta,
      socket: {
        open: (s) => void s.write(`GET ${percorso} HTTP/1.1\r\nHost: 127.0.0.1:${a.server.porta}\r\nX-Chiave-Api: ${a.server.chiaveApi}\r\nConnection: close\r\n\r\n`),
        data: (_, dati) => void (ricevuto += dati.toString()),
        close: () => risolvi({ stato: Number(ricevuto.slice(9, 12)), testo: ricevuto }),
        error: () => risolvi({ stato: 0, testo: ricevuto }),
      },
    })
  })

const scarica = (a: Ambiente, percorso: string, intestazioni: Record<string, string> = {}, metodo = "GET") => fetch(`${a.url}${percorso}`, { method: metodo, headers: { ...a.accesso, ...intestazioni } })

describe("/media con Range", () => {
  test("senza Range: 200 intero, con Accept-Ranges, lunghezza e tipo dal nome", async () => {
    const a = await conFile()
    const r = await scarica(a, "/media/video/v/uscite/finale.mp4")
    expect(r.status).toBe(200)
    expect(r.headers.get("accept-ranges")).toBe("bytes")
    expect(r.headers.get("content-length")).toBe("1000")
    expect(r.headers.get("content-type")).toBe("video/mp4")
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(CONTENUTO)
    expect((await scarica(a, "/media/video/v/uscite/foto.PNG")).headers.get("content-type")).toBe("image/png")
    expect((await scarica(a, "/media/video/v/nota.json")).headers.get("content-type")).toContain("application/json")
  })

  const casi: [string, string, number, number][] = [
    ["inizio", "bytes=0-99", 0, 99],
    ["mezzo", "bytes=300-399", 300, 399],
    ["dal mezzo alla fine", "bytes=500-", 500, 999],
    ["gli ultimi", "bytes=-100", 900, 999],
    ["fine oltre la fine: si ferma all'ultimo byte", "bytes=900-5000", 900, 999],
    ["un solo byte", "bytes=999-999", 999, 999],
    ["tutto", "bytes=0-", 0, 999],
  ]
  for (const [nome, intestazione, da, a_] of casi) {
    test(`206 — ${nome} (${intestazione})`, async () => {
      const a = await conFile()
      const r = await scarica(a, "/media/video/v/uscite/finale.mp4", { Range: intestazione })
      expect(r.status).toBe(206)
      expect(r.headers.get("content-range")).toBe(`bytes ${da}-${a_}/1000`)
      expect(r.headers.get("content-length")).toBe(String(a_ - da + 1))
      expect(r.headers.get("accept-ranges")).toBe("bytes")
      expect(new Uint8Array(await r.arrayBuffer())).toEqual(CONTENUTO.slice(da, a_ + 1))
    })
  }

  for (const intestazione of ["bytes=1000-", "bytes=2000-3000", "bytes=50-10", "bytes=-0"]) {
    test(`416 oltre la fine o senza senso (${intestazione})`, async () => {
      const a = await conFile()
      const r = await scarica(a, "/media/video/v/uscite/finale.mp4", { Range: intestazione })
      expect(r.status).toBe(416)
      expect(r.headers.get("content-range")).toBe("bytes */1000")
    })
  }

  test("un Range che non si capisce si ignora e si manda tutto; HEAD dà le intestazioni senza corpo", async () => {
    const a = await conFile()
    const r = await scarica(a, "/media/video/v/uscite/finale.mp4", { Range: "bytes=0-1,5-6" })
    expect(r.status).toBe(200)
    expect((await r.arrayBuffer()).byteLength).toBe(1000)
    const testa = await scarica(a, "/media/video/v/uscite/finale.mp4", { Range: "bytes=10-19" }, "HEAD")
    expect(testa.status).toBe(206)
    expect(testa.headers.get("content-length")).toBe("10")
    expect((await testa.arrayBuffer()).byteLength).toBe(0)
  })

  test("un video che il lettore sta leggendo si può sostituire, e chi leggeva la versione vecchia non riceve un miscuglio", async () => {
    // Su Windows un file aperto non si sostituisce: un montaggio falliva sul `finale.mp4` aperto nello studio.
    const grande = Uint8Array.from({ length: 8 * 1024 * 1024 }, (_, i) => i % 253)
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "v")
      await mkdir(join(c.archivio, "video", "v", "uscite"), { recursive: true })
      await writeFile(join(c.archivio, "video", "v", "uscite", "finale.mp4"), grande)
    })
    const finale = join(a.archivio, "video", "v", "uscite", "finale.mp4")
    const pezzo = await scarica(a, "/media/video/v/uscite/finale.mp4", { Range: "bytes=0-" })
    expect(pezzo.status).toBe(206)
    expect(pezzo.headers.get("content-range")).toBe(`bytes 0-${4 * 1024 * 1024 - 1}/${grande.length}`)
    expect(pezzo.headers.get("content-length")).toBe(String(4 * 1024 * 1024))
    const intero = await scarica(a, "/media/video/v/uscite/finale.mp4")
    const lettore = intero.body!.getReader()
    const primo = await lettore.read()
    expect(primo.done).toBe(false)
    const ricevuti: Uint8Array[] = [primo.value!]
    await Bun.sleep(100)
    await writeFile(`${finale}.nuovo`, CONTENUTO)
    await rename(`${finale}.nuovo`, finale)
    expect(new Uint8Array(await pezzo.arrayBuffer())).toEqual(grande.slice(0, 4 * 1024 * 1024))
    // Chi leggeva riceve solo byte della versione vecchia, eventualmente troncata: mai quelli della nuova in mezzo.
    try {
      for (let parte = await lettore.read(); !parte.done; parte = await lettore.read()) ricevuti.push(parte.value)
    } catch {
      // il flusso interrotto quando il file è cambiato
    }
    const vecchi = new Uint8Array(await new Blob(ricevuti).arrayBuffer())
    expect(vecchi.length).toBeLessThanOrEqual(grande.length)
    expect(vecchi).toEqual(grande.slice(0, vecchi.length))
    expect(new Uint8Array(await (await scarica(a, "/media/video/v/uscite/finale.mp4")).arrayBuffer())).toEqual(CONTENUTO)
  })

  test("un file che non c'è o una cartella: 404 con la frase", async () => {
    const a = await conFile()
    for (const percorso of ["/media/video/v/uscite/non-c-e.mp4", "/media/video/v/uscite", "/media/video"]) {
      const r = await scarica(a, percorso)
      expect(r.status).toBe(404)
      expect(((await r.json()) as { errore: string }).errore.length).toBeGreaterThan(5)
    }
  })

  test("non si esce dall'archivio: «..», percorsi assoluti, lettere di unità, barre rovesciate", async () => {
    const a = await conFile()
    const cattivi = [
      "/media/..%2fsegreto.txt",
      "/media/video/..%2f..%2fsegreto.txt",
      "/media/video/v/..%5c..%5c..%5csegreto.txt",
      "/media/%2fsegreto.txt",
      `/media/${encodeURIComponent(join(a.radice, "segreto.txt"))}`,
      "/media/C%3A/Windows/win.ini",
      "/media/video/v/uscite/finale.mp4%00.txt",
      "/media/%ZZ",
    ]
    for (const percorso of cattivi) {
      const r = await grezza(a, percorso)
      expect(r.stato, percorso).toBe(400)
      expect(r.testo).not.toContain("NON SI DEVE LEGGERE")
    }
    // Le chiavi, le sessioni e i registri dell'archivio non si servono (passano anche dallo studio sulla rete); gli allegati della chat sì.
    const segreti = ["arrivi/chiave.json", "arrivi/studio-remoto.json", "arrivi/registro.jsonl", ".chat/mango-code.json", ".git/config"]
    for (const relativo of [...segreti, ".chat/allegati/foto.png"]) await mkdir(join(a.archivio, relativo, ".."), { recursive: true }).then(() => writeFile(join(a.archivio, relativo), "NON SI DEVE LEGGERE"))
    for (const relativo of segreti) {
      for (const percorso of [`/media/${relativo}`, `/media/${relativo.toUpperCase()}`, `/media/${encodeURIComponent(relativo)}`]) {
        const r = await grezza(a, percorso)
        expect(r.stato, percorso).toBe(404)
        expect(r.testo).not.toContain("NON SI DEVE LEGGERE")
      }
    }
    expect((await grezza(a, "/media/.chat/allegati/foto.png")).stato).toBe(200)
    // I «..» scritti per esteso li risolve già l'indirizzo prima che arrivino alle rotte: non portano mai fuori.
    for (const percorso of ["/media/%2e%2e/segreto.txt", "/media/../segreto.txt", "/media/video/../../segreto.txt"]) {
      const r = await grezza(a, percorso)
      expect(r.stato, percorso).not.toBe(200)
      expect(r.testo).not.toContain("NON SI DEVE LEGGERE")
    }
  })
})

describe("/font e l'interfaccia", () => {
  test("/font serve i caratteri del repo e non altro", async () => {
    const a = await conFile()
    const r = await scarica(a, "/font/Archivo-700.ttf")
    expect(r.status).toBe(200)
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array(await readFile(join(import.meta.dir, "..", "..", "font", "Archivo-700.ttf"))))
    expect((await grezza(a, "/font/..%2fstile.json")).stato).toBe(400)
    expect((await grezza(a, "/font/../stile.json")).stato).not.toBe(200)
    expect((await scarica(a, "/font/non-c-e.ttf")).status).toBe(404)
  })

  test("senza studio/dist una pagina dice di costruirlo", async () => {
    const a = await conFile()
    for (const percorso of ["/", "/video/qualcosa"]) {
      const r = await scarica(a, percorso)
      expect(r.status).toBe(503)
      expect(r.headers.get("content-type")).toContain("text/html")
      expect(await r.text()).toContain("bun run --cwd studio build")
    }
  })

  test("con studio/dist: i file, la ricaduta su index.html per le rotte dell'interfaccia, il 404 per i file che mancano", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await mkdir(join(c.radice, "studio-dist", "assets"), { recursive: true })
      await writeFile(join(c.radice, "studio-dist", "index.html"), "<!doctype html><title>Studio</title>")
      await writeFile(join(c.radice, "studio-dist", "assets", "app.js"), "console.log(1)")
      await writeFile(join(c.radice, "segreto.txt"), "NON SI DEVE LEGGERE")
    })
    const indice = await scarica(a, "/")
    expect(indice.status).toBe(200)
    expect(await indice.text()).toContain("Studio")
    expect(await (await scarica(a, "/video/orto-98")).text()).toContain("Studio")
    const js = await scarica(a, "/assets/app.js")
    expect(js.headers.get("content-type")).toContain("javascript")
    expect(js.headers.get("cache-control")).toContain("immutable")
    expect(await js.text()).toBe("console.log(1)")
    expect((await scarica(a, "/assets/mancante.js")).status).toBe(404)
    const fuori = await grezza(a, "/..%2fsegreto.txt")
    expect(fuori.stato).toBe(404)
    expect(fuori.testo).not.toContain("NON SI DEVE LEGGERE")
  })
})

describe("le rotte che non ci sono e chi non può chiamarle", () => {
  test("rotta sconosciuta: 404 JSON; metodo sbagliato: 405; corpo non JSON: 400", async () => {
    const a = await conFile()
    const sconosciuta = await chiama<{ errore: string }>(a, "GET", "/api/non-c-e")
    expect(sconosciuta.stato).toBe(404)
    expect(sconosciuta.corpo.errore).toContain("API.md")
    expect((await chiama(a, "DELETE", "/api/stile")).stato).toBe(405)
    expect((await chiama(a, "POST", "/api/stile", {})).stato).toBe(405)
    const male = await fetch(`${a.url}/api/stile`, { method: "PUT", headers: { ...a.accesso, "Content-Type": "application/json" }, body: "{non json" })
    expect(male.status).toBe(400)
    expect(((await male.json()) as { errore: string }).errore).toContain("JSON")
  })

  test("un nome di host che non è il computer stesso è rifiutato (DNS rebinding)", async () => {
    const a = await conFile()
    const r = await scarica(a, "/api/video", { Host: "sito-cattivo.example" })
    expect(r.status).toBe(403)
    expect(((await r.json()) as { errore: string }).errore).toContain("127.0.0.1")
    expect((await scarica(a, "/api/video", { Host: `localhost:${a.server.porta}` })).status).toBe(200)
  })

  test("una scrittura che arriva da un'altra pagina web è rifiutata; da localhost passa", async () => {
    const a = await avviaAmbiente()
    const prova = (origine: string) => fetch(`${a.url}/api/video`, { method: "POST", headers: { ...a.accesso, "Content-Type": "application/json", Origin: origine }, body: JSON.stringify({ titolo: "Prova" }) })
    const estranea = await prova("https://sito-cattivo.example")
    expect(estranea.status).toBe(403)
    expect(((await estranea.json()) as { errore: string }).errore).toBe("Questa richiesta viene da un'altra pagina web e non la eseguo: le modifiche si fanno dall'interfaccia di Mango Animation.")
    expect((await chiama<unknown[]>(a, "GET", "/api/video")).corpo).toHaveLength(0)
    expect((await prova("http://localhost:5173")).status).toBe(201)
  })
})

describe("POST /api/apri", () => {
  test("mostra un file o una cartella dell'archivio in Esplora file", async () => {
    const a = await conFile()
    expect((await chiama(a, "POST", "/api/apri", { percorso: "video/v" })).corpo).toEqual({ ok: true })
    expect((await chiama(a, "POST", "/api/apri", { percorso: "video/v/uscite/finale.mp4" })).stato).toBe(200)
    expect((await chiama(a, "POST", "/api/apri", { percorso: "" })).stato).toBe(200)
    expect(a.apertiInEsplora).toEqual([
      { percorso: join(a.archivio, "video", "v"), eCartella: true },
      { percorso: join(a.archivio, "video", "v", "uscite", "finale.mp4"), eCartella: false },
      { percorso: a.archivio, eCartella: true },
    ])
  })

  test("dove: «browser» apre nel browser, non in Esplora file", async () => {
    const a = await conFile()
    expect((await chiama(a, "POST", "/api/apri", { dove: "browser", video: "v" })).corpo).toEqual({ ok: true, aperto: "/#/video/v" })
    expect(a.apertiNelBrowser).toHaveLength(1)
    expect(a.apertiInEsplora).toEqual([])
  })

  test("fuori dall'archivio, assoluto, con «..» o che non esiste: rifiutato e non apre niente", async () => {
    const a = await conFile()
    for (const percorso of ["../segreto.txt", "video/../../segreto.txt", join(a.radice, "segreto.txt"), "C:\\Windows", "/Windows", "video\\..\\..\\segreto.txt"]) {
      const r = await chiama<{ errore: string }>(a, "POST", "/api/apri", { percorso })
      expect(r.stato, percorso).toBe(400)
      expect(r.corpo.errore).toContain("dentro l'archivio")
    }
    expect((await chiama(a, "POST", "/api/apri", { percorso: "video/non-c-e" })).stato).toBe(404)
    expect((await chiama(a, "POST", "/api/apri", {})).stato).toBe(400)
    expect(a.apertiInEsplora).toEqual([])
  })
})

describe("lo stile", () => {
  test("GET lo legge; PUT lo scrive e rifiuta ciò che toglie un quadro usato da un piano", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    const stile = (await chiama<{ quadri: Record<string, unknown>; formato: { largo: number } }>(a, "GET", "/api/stile")).corpo
    expect(stile.formato.largo).toBe(1080)
    expect(Object.keys(stile.quadri)).toContain("girato-pieno")

    const senzaIlQuadro = { ...stile, quadri: Object.fromEntries(Object.entries(stile.quadri).filter(([n]) => n !== "girato-pieno")) }
    const rifiutato = await chiama<{ errore: string }>(a, "PUT", "/api/stile", senzaIlQuadro)
    expect(rifiutato.stato).toBe(400)
    expect(rifiutato.corpo.errore).toContain("«girato-pieno» è usato da «v»")
    expect(JSON.parse(await readFile(a.stile, "utf-8")).quadri["girato-pieno"]).toBeDefined()

    const senzaFormato = await chiama<{ errore: string }>(a, "PUT", "/api/stile", { quadri: stile.quadri })
    expect(senzaFormato.stato).toBe(400)
    expect(senzaFormato.corpo.errore).toContain("formato")
    expect((await chiama(a, "PUT", "/api/stile", [])).stato).toBe(400)

    const nuovo = { ...stile, sottotitoli: { corpo: 60 } }
    expect((await chiama(a, "PUT", "/api/stile", nuovo)).corpo).toEqual({ ok: true })
    expect(JSON.parse(await readFile(join(a.radice, "stile.json"), "utf-8"))).toEqual({ sottotitoli: { corpo: 60 } })
    const serie = JSON.parse(await readFile(a.stile, "utf-8")) as { sottotitoli: { corpo: number; modo: string } }
    expect(serie.sottotitoli.corpo).not.toBe(60)
    const dopo = (await chiama<{ sottotitoli: Record<string, unknown> }>(a, "GET", "/api/stile")).corpo.sottotitoli
    expect(dopo).toEqual({ ...serie.sottotitoli, corpo: 60 })
  })

  test("lo stile del creator, nella cartella di lavoro, si sovrappone a quello di serie; il PUT scrive solo lì", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await writeFile(join(c.radice, "stile.json"), JSON.stringify({ colori: { rosso: "#C00000" }, titolo: { durata: 3 } }))
    })
    const prima = await readFile(a.stile, "utf-8")
    const stile = (await chiama<{ colori: Record<string, string>; titolo: { durata: number; corpo: number } }>(a, "GET", "/api/stile")).corpo
    expect(stile.colori["rosso"]).toBe("#C00000")
    expect(stile.colori["carta"]).toBeDefined()
    expect(stile.titolo.durata).toBe(3)
    expect(stile.titolo.corpo).toBeGreaterThan(0)

    const nuovo = { ...stile, colori: { ...stile.colori, blu: "#000080" } }
    expect((await chiama(a, "PUT", "/api/stile", nuovo)).corpo).toEqual({ ok: true })
    expect(await readFile(a.stile, "utf-8")).toBe(prima)
    expect(JSON.parse(await readFile(join(a.radice, "stile.json"), "utf-8"))).toEqual({ colori: { rosso: "#C00000", blu: "#000080" }, titolo: { durata: 3 } })
  })

  test("uno stile del creator che non si legge lascia lo stile di prima e non ferma il server", async () => {
    const a = await avviaAmbiente()
    const prima = (await chiama<{ formato: { largo: number } }>(a, "GET", "/api/stile")).corpo
    await writeFile(join(a.radice, "stile.json"), "{ non json")
    await Bun.sleep(400)
    expect((await chiama<{ formato: { largo: number } }>(a, "GET", "/api/stile")).corpo).toEqual(prima)
  })
})

describe("il profilo del creator", () => {
  test("un profilo che lo schema non ammette non ferma la partenza e dice cosa correggere", async () => {
    const a = await avviaAmbiente({}, async (c) => writeFile(join(c.radice, "profilo.json"), JSON.stringify({ macchina: { scheda_vidoe: 1, scheda_video: "zero" } })))
    const r = await chiama<{ valido: boolean; problemi: string[] }>(a, "GET", "/api/profilo")
    expect(r.corpo.valido).toBe(false)
    expect(r.corpo.problemi.join(" ")).toContain("macchina.scheda_video")
    expect(r.corpo.problemi.join(" ")).toContain("«scheda_vidoe» non è una chiave ammessa")
  })
})
