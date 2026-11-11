import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { copyFile, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chiamaApi } from "../src/mcp/api"
import { opzioniMcp } from "../src/mcp/opzioni"
import { creaServerMcp } from "../src/mcp/strumenti"
import type { OpzioniMcp } from "../src/mcp/opzioni"
import { lancia } from "../src/mcp/processi"
import { aspetta, avviaAmbiente, avviaConScarico, chiama, chiamateDelFintoYtdlp, fermaTutti, piano, righeDelFinto, scriviFintoYtdlp, scriviGrezzo, scriviVideo, type Ambiente } from "./aiuti"

// Il server MCP parla con un server vero (su una porta libera, col finto motore della coda) e lancia un secondo finto motore
// per i comandi leggeri: `valida`, `parole`, `foto`. Le scene animate le rende uno script finto.

const FINTO_MOTORE_LEGGERO = `import os, shutil, sys, time
comando, args = sys.argv[1], sys.argv[2:]
slug = args[0]
if slug == "rotto":
    print("il piano non va:\\n  la sorgente «a» non c'è", file=sys.stderr)
    sys.exit(1)
if slug == "muto":
    sys.exit(1)
if slug == "lento":
    time.sleep(60)
if comando == "valida":
    print("attenzione: la parola «uno» è incerta")
    print("il piano va")
elif comando == "anteprima-proposta":
    riga = args[args.index("--riga") + 1]
    if "ROTTA" in riga:
        print("manca il carattere dei titoli", file=sys.stderr)
        sys.exit(1)
    cartella = os.path.join(os.environ["FINTO_ARCHIVIO"], "video", slug, "materiali")
    os.makedirs(cartella, exist_ok=True)
    open(os.path.join(cartella, "anteprima.png"), "w", encoding="utf-8").write(riga)
    print(os.path.join(cartella, "anteprima.png"))
elif comando == "parole":
    print("cwd=" + os.getcwd())
    print("tratto 0: aggancio · a 0.00-2.00 s · nel video 0.00-2.00 s")
elif comando == "foto":
    cartella = os.path.join(os.path.dirname(os.environ["FINTO_JPG"]), "foto-" + slug)
    os.makedirs(cartella, exist_ok=True)
    anteprima = "--anteprima" in args
    prova = "--prova" in args
    for secondo in [s for s in args[1:] if s not in ("--anteprima", "--prova")]:
        if anteprima and not 50 <= float(secondo) < 60:
            print("l'anteprima copre il video da 50.0 a 60.0 s: il secondo " + secondo + " è fuori", file=sys.stderr)
            sys.exit(1)
        if prova and float(secondo) >= 10:
            print("il video dura 10.0 s: non arriva al secondo " + secondo, file=sys.stderr)
            sys.exit(1)
        if float(secondo) >= 100:
            print("il video dura 100.0 s: non arriva al secondo " + secondo, file=sys.stderr)
            sys.exit(1)
        file = os.path.join(cartella, secondo + ".jpg")
        shutil.copy(os.environ["FINTO_JPG"], file)
        print(file)
elif comando == "ascolta":
    import json
    print(json.dumps({"da": float(args[0]), "passo": 0.01, "silenzio_db": -39, "livello": [-60, -20, -20, -60], "voce": [[1.01, 1.03]], "spettrogramma": os.environ["FINTO_JPG"], "dove": args[2:]}))
elif comando == "foto-girato":
    if "non-c-e" in slug:
        print("«" + slug + "» non c'è in archivio/grezzo", file=sys.stderr)
        sys.exit(1)
    cartella = os.path.join(os.path.dirname(os.environ["FINTO_JPG"]), "foto-girato")
    os.makedirs(cartella, exist_ok=True)
    for secondo in args[1:]:
        file = os.path.join(cartella, secondo + ".jpg")
        shutil.copy(os.environ["FINTO_JPG"], file)
        print(file)
`

const FINTE_SCENE = `import { copyFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
const sigla = Bun.argv[2]
const cartella = join(import.meta.dir, "foto-scene")
mkdirSync(cartella, { recursive: true })
if (sigla === "rotta") {
  console.error("Non esiste una scena «rotta» in animazioni/. Le sigle sono: ok, difetto.")
  process.exit(1)
}
for (const t of ["0", "2,5"]) {
  const file = join(cartella, sigla + "-" + t + "s.png")
  copyFileSync(join(import.meta.dir, "originale.png"), file)
  console.log(file)
}
if (sigla === "difetto") {
  console.log("\\n2 segnalazioni:\\n- difetto a 2,5 s: testo sotto i 40 px (30 px): «ciao»\\n- difetto da 0 s a 3 s: lo sfondo resta fermo")
  process.exit(1)
}
`

let immagini: string
let png: string
let jpg: string
let fintoYtdlp: { comando: string[]; video: string }

beforeAll(async () => {
  immagini = await mkdtemp(join(tmpdir(), "mango-animation-mcp-immagini-"))
  fintoYtdlp = await scriviFintoYtdlp(join(immagini, "ytdlp"))
  png = join(immagini, "originale.png")
  jpg = join(immagini, "originale.jpg")
  for (const file of [png, jpg]) {
    const fatto = Bun.spawn(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=1080x1920", "-frames:v", "1", "-y", file], { stdin: "ignore", stdout: "ignore", stderr: "inherit" })
    expect(await fatto.exited).toBe(0)
  }
  await writeFile(join(immagini, "scene.ts"), FINTE_SCENE)
})

afterAll(() => rm(immagini, { recursive: true, force: true }))

const clienti: Client[] = []
afterEach(async () => {
  await Promise.all(clienti.splice(0).map((c) => c.close()))
  await fermaTutti()
})

const sblocca = (a: Ambiente, slug: string): Promise<void> => writeFile(join(a.radice, `via-${slug}`), "")

async function conVideo(lavori: object[] = []): Promise<Ambiente> {
  return avviaAmbiente({ comandoSceneFoto: [process.execPath, join(immagini, "scene.ts")] }, async (c) => {
    await scriviGrezzo(c, "2026-10-06/a.mp4")
    if (lavori.length > 0) await writeFile(join(c.archivio, "lavori.jsonl"), lavori.map((l) => JSON.stringify(l)).join("\n") + "\n")
    await scriviVideo(c, "v", { titolo: "Il video", stato: "in lavorazione", creato: "2026-10-06" }, piano())
    await scriviVideo(c, "w", { titolo: "Solo una proposta", stato: "proposta", creato: "2026-10-07" })
    await scriviVideo(c, "x", undefined, piano())
    await mkdir(join(c.archivio, "video", "v", "lavoro"), { recursive: true })
    await writeFile(
      join(c.archivio, "video", "v", "lavoro", "risolto.json"),
      JSON.stringify({
        durata: 12.5,
        scene: [{ nome: "s", quadro: "girato-pieno", inizio: 0, durata: 12.5, animazione: null, ancore: [], tempi: { uno: 1 } }],
        avvisi: [{ tratto: 0, cosa: "parole incerte: uno 0.2" }],
        parole: Array.from({ length: 500 }, (_, i) => ({ p: `parola${i}`, da: i, a: i + 0.5 })),
        tratti: Array.from({ length: 50 }, (_, i) => ({ da: i, durata: 1 })),
      }),
    )
  })
}

interface Collegamento {
  strumenti: () => Promise<{ name: string; description?: string; inputSchema: { properties?: Record<string, unknown> } }[]>
  /** Chiama uno strumento: `testo` è il primo contenuto di testo, `dati` il suo JSON. */
  chiama: (nome: string, argomenti?: Record<string, unknown>) => Promise<Risposta>
}

interface Risposta {
  errore: boolean
  contenuto: { type: string; text?: string; data?: string; mimeType?: string }[]
  testo: string
  dati: () => Record<string, unknown>
}

async function collega(a: Ambiente, extra: Partial<OpzioniMcp> = {}): Promise<Collegamento> {
  const cartella = join(a.radice, "finto-mcp")
  await mkdir(join(cartella, "finto_mcp"), { recursive: true })
  await writeFile(join(cartella, "finto_mcp", "__main__.py"), FINTO_MOTORE_LEGGERO)
  const opzioni: OpzioniMcp = {
    api: { indirizzo: a.url, intestazioni: async () => a.accesso },
    codice: a.codice,
    motore: { eseguibile: "python", modulo: "finto_mcp", ambiente: { PYTHONPATH: cartella, FINTO_JPG: jpg, FINTO_ARCHIVIO: a.archivio } },
    ffmpeg: Bun.which("ffmpeg"),
    ytdlp: null,
    ...extra,
  }
  const [lato1, lato2] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: "prova", version: "1" })
  clienti.push(client)
  await Promise.all([creaServerMcp(opzioni).connect(lato1), client.connect(lato2)])
  return {
    strumenti: async () => (await client.listTools()).tools,
    chiama: async (nome, argomenti = {}) => {
      const r = await client.callTool({ name: nome, arguments: argomenti })
      const contenuto = r.content as Risposta["contenuto"]
      const testo = contenuto.find((c) => c.type === "text")?.text ?? ""
      return { errore: r.isError === true, contenuto, testo, dati: () => JSON.parse(testo) as Record<string, unknown> }
    },
  }
}

const portaChiusa = async (): Promise<number> => {
  const provvisorio = Bun.serve({ port: 0, fetch: () => new Response("") })
  const porta = provvisorio.port
  await provvisorio.stop(true)
  return porta!
}

/** Larghezza e altezza di un JPEG, dal primo marcatore di fotogramma. */
function dimensioniJpeg(base64: string): { largo: number; alto: number } {
  const b = Buffer.from(base64, "base64")
  let i = 2
  while (i < b.length) {
    const marcatore = b[i + 1]!
    if (marcatore >= 0xc0 && marcatore <= 0xc3) return { alto: b.readUInt16BE(i + 5), largo: b.readUInt16BE(i + 7) }
    i += 2 + b.readUInt16BE(i + 2)
  }
  throw new Error("non è un JPEG")
}

describe("gli strumenti", () => {
  test("sono quelli del piano, ognuno con la sua descrizione in inglese e senza il nome di chi li usa", async () => {
    const mcp = await collega(await conVideo())
    const strumenti = await mcp.strumenti()
    expect(strumenti.map((s) => s.name).sort()).toEqual(["apri", "ascolta", "foto", "girato_foto", "girato_parole", "girato_prepara", "girato_scarica", "girato_scheda", "lavoro", "lavoro_aspetta", "lavoro_stato", "parole", "piano_annulla", "piano_ritocca", "piano_scrivi", "scene_foto", "scheda_cambia", "slide", "valida", "video_elenco", "video_leggi", "video_nuovo", "web_testo"])
    for (const s of strumenti) expect((s.description ?? "").length).toBeGreaterThan(60)
    const italiano = /\b(il|della|che|per|quando|dai|solo|un|una|nel|sono)\b/i
    const testi = strumenti.flatMap((s) => [s.description ?? "", ...Object.values(s.inputSchema.properties ?? {}).map((p) => String((p as { description?: string }).description ?? ""))])
    for (const t of testi) {
      expect(t).not.toMatch(/\bFA\b/)
      expect(t).not.toMatch(italiano)
    }
    expect(Object.keys(strumenti.find((s) => s.name === "lavoro")!.inputSchema.properties ?? {})).toEqual(["slug", "comando", "scena", "da", "a", "disegno", "istante"])
  })

  test("apri porta nel browser la pagina o il file attraverso /entra, e la chiave non compare mai nella risposta allo strumento", async () => {
    const a = await conVideo()
    await mkdir(join(a.archivio, "video", "v", "uscite"), { recursive: true })
    await writeFile(join(a.archivio, "video", "v", "uscite", "finale.mp4"), "x")
    const mcp = await collega(a)
    const risposte = [
      await mcp.chiama("apri", { video: "v" }),
      await mcp.chiama("apri", { video: "v", scheda: "slide" }),
      await mcp.chiama("apri", { percorso: "video/v/uscite/finale.mp4" }),
    ]
    for (const r of risposte) {
      expect(r.errore).toBe(false)
      expect(r.testo).not.toContain(a.server.chiaveApi)
    }
    const chiave = encodeURIComponent(a.server.chiaveApi)
    const origine = `http://127.0.0.1:${a.server.porta}`
    expect(a.apertiNelBrowser).toEqual([
      `${origine}/entra?chiave=${chiave}&dopo=${encodeURIComponent("/#/video/v")}`,
      `${origine}/entra?chiave=${chiave}&dopo=${encodeURIComponent("/#/video/v/slide")}`,
      `${origine}/entra?chiave=${chiave}&dopo=${encodeURIComponent("/media/video/v/uscite/finale.mp4")}`,
    ])
    // L'indirizzo aperto entra davvero: cookie e rimando alla pagina chiesta.
    const entrata = await fetch(a.apertiNelBrowser[2]!, { redirect: "manual" })
    expect([entrata.status, entrata.headers.get("location")]).toEqual([303, "/media/video/v/uscite/finale.mp4"])
    const file = await fetch(`${a.url}/media/video/v/uscite/finale.mp4`, { headers: { Cookie: entrata.headers.get("set-cookie")!.split(";")[0]! } })
    expect(await file.text()).toBe("x")
  })

  test("apri rifiuta ciò che non è un video, un file dell'archivio o che porta fuori, e non apre niente", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    for (const argomenti of [{}, { video: "non-c-e" }, { video: "v", percorso: "video/v" }, { percorso: "video/v" }, { percorso: "../fuori.txt" }, { percorso: "arrivi/chiave-api.json" }, { percorso: "video/v/non-c-e.mp4" }, { percorso: "video/v/scheda.json", scheda: "slide" }]) {
      expect((await mcp.chiama("apri", argomenti)).errore, JSON.stringify(argomenti)).toBe(true)
    }
    expect(a.apertiNelBrowser).toEqual([])
  })

  test("uno slug che non è uno slug non arriva né al server né al motore", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    for (const [nome, argomenti] of [
      ["video_leggi", { slug: "../x" }],
      ["valida", { slug: "--help" }],
      ["foto", { slug: "V", secondi: [1] }],
      ["lavoro", { slug: "a b", comando: "monta" }],
    ] as const) {
      const r = await mcp.chiama(nome, argomenti)
      expect([nome, r.errore]).toEqual([nome, true])
      expect(r.testo).toContain("slug")
    }
    expect(await righeDelFinto(a)).toEqual([])
  })

  test("lo strumento legge la chiave dal file nella cartella di lavoro a ogni richiesta; senza, il server risponde con la frase che la chiede", async () => {
    const a = await conVideo()
    const { api } = opzioniMcp({ MANGO_ANIMATION_LAVORO: a.radice, MANGO_ANIMATION_PORTA: String(a.server.porta) })
    expect(await api.intestazioni()).toEqual({ "x-chiave-api": a.server.chiaveApi })
    expect(await chiamaApi<{ slug: string }[]>(api, "GET", "/api/video")).toHaveLength(3)
    const senzaChiave = { ...api, intestazioni: async () => ({}) }
    await expect(chiamaApi(senzaChiave, "GET", "/api/video")).rejects.toThrow("X-Chiave-Api")
  })

  test("se il server è spento, ogni strumento che lo usa dice come accenderlo", async () => {
    const mcp = await collega(await conVideo(), { api: { indirizzo: `http://127.0.0.1:${await portaChiusa()}`, intestazioni: async () => ({}) } })
    const chiamate: [string, Record<string, unknown>][] = [
      ["video_elenco", {}],
      ["video_leggi", { slug: "v" }],
      ["piano_scrivi", { slug: "v", piano: {} }],
      ["piano_annulla", { slug: "v" }],
      ["lavoro", { slug: "v", comando: "monta" }],
      ["lavoro_stato", { id: "abc" }],
      ["lavoro_aspetta", { id: "abc", secondi: 1 }],
      ["girato_prepara", { file: "2026-10-06/a.mp4" }],
      ["girato_scarica", { url: "https://esempio.test/ok" }],
    ]
    for (const [nome, argomenti] of chiamate) {
      const r = await mcp.chiama(nome, argomenti)
      expect([nome, r.errore]).toEqual([nome, true])
      expect(r.testo).toContain("bun run --cwd server avvia")
    }
  })
})

describe("video_elenco e video_leggi", () => {
  test("l'elenco dà slug, titolo e stato", async () => {
    const mcp = await collega(await conVideo())
    const r = await mcp.chiama("video_elenco")
    expect(r.errore).toBe(false)
    const elenco = JSON.parse(r.testo) as { slug: string; titolo: string; stato: string; ha_piano: boolean; ha_finale: boolean }[]
    expect(elenco.find((v) => v.slug === "v")).toEqual({ slug: "v", titolo: "Il video", stato: "in lavorazione", ha_piano: true, ha_finale: false })
    expect(elenco.find((v) => v.slug === "w")).toMatchObject({ titolo: "Solo una proposta", stato: "proposta", ha_piano: false })
  })

  test("leggi dà scheda e piano, e del risolto solo durata, scene e avvisi", async () => {
    const mcp = await collega(await conVideo())
    const r = await mcp.chiama("video_leggi", { slug: "v" })
    expect(r.errore).toBe(false)
    expect(r.dati()).toMatchObject({
      slug: "v",
      scheda: { titolo: "Il video", stato: "in lavorazione" },
      piano: piano(),
      risolto: {
        durata: 12.5,
        scene: [{ nome: "s", quadro: "girato-pieno", inizio: 0, durata: 12.5, animazione: null }],
        avvisi: [{ tratto: 0, cosa: "parole incerte: uno 0.2" }],
      },
    })
    expect(Object.keys((r.dati() as { risolto: object }).risolto)).toEqual(["durata", "scene", "avvisi"])
    expect(r.testo).not.toContain("parola499")
    expect(r.testo.length).toBeLessThan(2000)
  })

  test("leggi dà la fase: il passo del metodo a cui è il video, o null se gli otto passi non lo riguardano", async () => {
    const mcp = await collega(await conVideo())
    expect(((await mcp.chiama("video_leggi", { slug: "v" })).dati() as { fase: unknown }).fase).toEqual({ passo: 4, azione: "testo" })
    expect(((await mcp.chiama("video_leggi", { slug: "w" })).dati() as { fase: unknown }).fase).toEqual({ passo: 1, azione: "idea" })
  })

  test("leggi dice se il montato c'è, quando è stato fatto, se segue il piano di adesso e se ha la copertina", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const montatoDi = async () => ((await mcp.chiama("video_leggi", { slug: "v" })).dati() as { montato: { file: string; fatto_il: string; segue_il_piano: boolean; con_copertina: boolean } | null }).montato
    expect(await montatoDi()).toBeNull()

    const uscite = join(a.archivio, "video", "v", "uscite")
    await mkdir(uscite, { recursive: true })
    await writeFile(join(uscite, "finale.mp4"), "x")
    const dopo = new Date(Date.now() + 60_000)
    await utimes(join(uscite, "finale.mp4"), dopo, dopo)
    const senzaCopertina = await aspetta(async () => (await montatoDi()) ?? undefined)
    expect(senzaCopertina).toMatchObject({ file: "video/v/uscite/finale.mp4", segue_il_piano: true, con_copertina: false })
    expect(Date.parse(senzaCopertina.fatto_il)).toBe(dopo.getTime())

    await writeFile(join(uscite, "con-copertina.mp4"), "y")
    await utimes(join(uscite, "con-copertina.mp4"), dopo, dopo)
    await aspetta(async () => (await montatoDi())?.con_copertina === true)

    const prima = new Date(Date.now() - 3_600_000)
    await utimes(join(uscite, "finale.mp4"), prima, prima)
    await utimes(join(uscite, "con-copertina.mp4"), prima, prima)
    await aspetta(async () => (await montatoDi())?.segue_il_piano === false)
  })

  test("leggi dice perché il piano scritto nel file non si usa: senza, si lavorerebbe sul piano vecchio senza saperlo", async () => {
    const a = await conVideo()
    await writeFile(join(a.archivio, "video", "v", "piano.json"), "{ non json")
    const mcp = await collega(a)
    await aspetta(async () => ((await mcp.chiama("video_leggi", { slug: "v" })).dati() as { problemi: { piano: string[] } }).problemi.piano.length > 0)
    const letto = (await mcp.chiama("video_leggi", { slug: "v" })).dati() as { problemi: { scheda: string[]; piano: string[] } }
    expect(letto.problemi.scheda).toEqual([])
    expect(letto.problemi.piano.join(" ")).toContain("scritto male")
  })

  test("un piano scritto a mano con un quadro che non c'è: leggi lo segnala e lavoro rifiuta, indicando gli strumenti che controllano", async () => {
    const a = await conVideo()
    await writeFile(join(a.archivio, "video", "v", "piano.json"), JSON.stringify({ ...piano(), quadro: "quadro-inventato" }))
    const mcp = await collega(a)
    await aspetta(async () => ((await mcp.chiama("video_leggi", { slug: "v" })).dati() as { problemi: { piano: string[] } }).problemi.piano.length > 0)
    expect(((await mcp.chiama("video_leggi", { slug: "v" })).dati() as { problemi: { piano: string[] } }).problemi.piano.join(" ")).toContain("quadro-inventato")
    const r = await mcp.chiama("lavoro", { slug: "v", comando: "monta" })
    expect(r.errore).toBe(true)
    expect(r.testo).toContain("quadro-inventato")
    expect(r.testo).toContain("piano_ritocca")
    expect((await righeDelFinto(a)).some((riga) => riga.includes("monta"))).toBe(false)
  })

  test("di un video con la scheda non valida lo strumento dà la frase semplice del server e, di seguito, i problemi: chi sistema ne ha bisogno", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "v", { titolo: "Senza stato" } as never))
    const mcp = await collega(a)
    const r = await mcp.chiama("video_leggi", { slug: "v" })
    expect(r.errore).toBe(true)
    expect(r.testo).toContain("Non c'è un video «v» con una scheda valida")
    expect(r.testo).toContain("manca «stato»")
  })

  test("un video senza risolto ha risolto nullo; uno che non c'è dà l'errore del server", async () => {
    const mcp = await collega(await conVideo())
    expect((await mcp.chiama("video_leggi", { slug: "w" })).dati()["risolto"]).toBeNull()
    const nonC = await mcp.chiama("video_leggi", { slug: "non-c-e" })
    expect(nonC.errore).toBe(true)
    expect(nonC.testo).toContain("Non c'è un video «non-c-e»")
  })
})

describe("video_nuovo", () => {
  const riga = "Quanto serve davvero a un modello che gira in casa"

  test("crea un carosello o un video come proposta, con la sua anteprima, e dà lo slug; un titolo o una riga vuoti sono un errore", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const r = await mcp.chiama("video_nuovo", { titolo: "Quanta farina serve davvero", formato: "carosello", riga })
    expect(r.errore).toBe(false)
    expect(r.dati()).toEqual({
      slug: "quanta-farina-serve-davvero",
      formato: "carosello",
      anteprima: "video/quanta-farina-serve-davvero/materiali/anteprima.png",
    })
    const scheda = JSON.parse(await readFile(join(a.archivio, "video", "quanta-farina-serve-davvero", "scheda.json"), "utf-8"))
    expect(scheda).toMatchObject({ titolo: "Quanta farina serve davvero", stato: "proposta", formato: "carosello" })
    expect(await readFile(join(a.archivio, "video", "quanta-farina-serve-davvero", "materiali", "anteprima.png"), "utf-8")).toBe(riga)
    const video = await mcp.chiama("video_nuovo", { titolo: "Un video", riga })
    expect(video.dati()).toMatchObject({ slug: "un-video", formato: "video", anteprima: "video/un-video/materiali/anteprima.png" })
    expect((await mcp.chiama("video_nuovo", { titolo: "", riga })).errore).toBe(true)
    expect((await mcp.chiama("video_nuovo", { titolo: "Senza riga", riga: "  " })).errore).toBe(true)
    expect((await mcp.chiama("video_nuovo", { titolo: "Senza riga del tutto" })).errore).toBe(true)
    expect(await Bun.file(join(a.archivio, "video", "senza-riga", "scheda.json")).exists()).toBe(false)
    // Un campo sbagliato non si ignora: un carosello chiesto con «tipo» diventerebbe un video.
    const sbagliato = await mcp.chiama("video_nuovo", { titolo: "Altro", riga, tipo: "carosello" })
    expect(sbagliato.errore).toBe(true)
    expect(sbagliato.testo).toContain("tipo")
    expect(await Bun.file(join(a.archivio, "video", "altro", "scheda.json")).exists()).toBe(false)
  })

  test("con girato nasce anche il piano, un pezzo per file; un file che non c'è o un carosello col girato sono l'errore del server", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const r = await mcp.chiama("video_nuovo", { titolo: "Dal girato", riga, girato: ["2026-10-06/a.mp4"] })
    expect(r.errore).toBe(false)
    expect(r.dati()).toMatchObject({ slug: "dal-girato", formato: "video" })
    const piano = JSON.parse(await readFile(join(a.archivio, "video", "dal-girato", "piano.json"), "utf-8"))
    expect(piano).toMatchObject({ quadro: "girato-pieno", scene: [{ pezzi: [{ sorgente: expect.any(String) }] }] })
    expect(Object.values(piano.sorgenti)).toEqual([{ file: "2026-10-06/a.mp4" }])
    const manca = await mcp.chiama("video_nuovo", { titolo: "Manca", riga, girato: ["2026-10-06/non-c-e.mp4"] })
    expect([manca.errore, manca.testo]).toEqual([true, expect.stringContaining("non c'è in archivio/grezzo/")])
    const carosello = await mcp.chiama("video_nuovo", { titolo: "Slide", riga, formato: "carosello", girato: ["2026-10-06/a.mp4"] })
    expect([carosello.errore, carosello.testo]).toEqual([true, expect.stringContaining("Un carosello non ha girato")])
    expect(await Bun.file(join(a.archivio, "video", "slide", "scheda.json")).exists()).toBe(false)
  })

  test("se l'anteprima non si fa, il video c'è lo stesso e l'errore lo dice con come rifarla", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const r = await mcp.chiama("video_nuovo", { titolo: "Mezzo fatto", riga: "ROTTA" })
    expect(r.errore).toBe(true)
    expect(r.testo).toContain("mezzo-fatto")
    expect(r.testo).toContain("manca il carattere dei titoli")
    expect(r.testo).toContain("anteprima-proposta")
    expect(await Bun.file(join(a.archivio, "video", "mezzo-fatto", "scheda.json")).exists()).toBe(true)
  })
})

describe("scheda_cambia", () => {
  test("cambia solo i campi dati, null toglie, e dà la scheda nuova; una scheda che lo schema non ammette resta com'era", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const r = await mcp.chiama("scheda_cambia", { slug: "w", campi: { stato: "pronto", didascalia: "Guardate fino in fondo", proposta: { aggancio: "Una tensione" } } })
    expect(r.errore).toBe(false)
    const attesa = { titolo: "Solo una proposta", stato: "pronto", creato: "2026-10-07", didascalia: "Guardate fino in fondo", proposta: { aggancio: "Una tensione" } }
    expect(r.dati()).toEqual(attesa)
    const cattiva = await mcp.chiama("scheda_cambia", { slug: "w", campi: { stato: "chiuso" } })
    expect([cattiva.errore, cattiva.testo]).toEqual([true, expect.stringContaining("stato")])
    expect(JSON.parse(await readFile(join(a.archivio, "video", "w", "scheda.json"), "utf-8"))).toEqual(attesa)
    expect((await mcp.chiama("scheda_cambia", { slug: "non-c-e", campi: { stato: "pronto" } })).errore).toBe(true)
  })
})

describe("piano_scrivi e piano_annulla", () => {
  test("scrivi cambia il piano e tiene la versione di prima; annulla la riporta", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const nuovo = { ...piano(), coda: 1 }
    const scritto = await mcp.chiama("piano_scrivi", { slug: "v", piano: nuovo })
    expect(scritto.errore).toBe(false)
    expect(scritto.dati()).toEqual({ ok: true, puo_annullare: true, puo_rifare: false })
    expect(JSON.parse(await readFile(join(a.archivio, "video", "v", "piano.json"), "utf-8"))).toEqual(nuovo)

    const annullato = await mcp.chiama("piano_annulla", { slug: "v" })
    expect(annullato.errore).toBe(false)
    expect(annullato.dati()).toMatchObject({ ok: true, piano: piano(), puo_rifare: true })
    expect(JSON.parse(await readFile(join(a.archivio, "video", "v", "piano.json"), "utf-8"))).toEqual(piano())
  })

  test("ritocca cambia solo i campi indicati per percorso, e annulla torna indietro come dopo scrivi", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const r = await mcp.chiama("piano_ritocca", { slug: "v", ritocchi: [{ op: "add", path: "/coda", value: 1 }] })
    expect(r.errore).toBe(false)
    expect(r.dati()).toMatchObject({ ok: true, piano: { ...piano(), coda: 1 }, puo_annullare: true })
    expect(JSON.parse(await readFile(join(a.archivio, "video", "v", "piano.json"), "utf-8"))).toEqual({ ...piano(), coda: 1 })
    const storto = await mcp.chiama("piano_ritocca", { slug: "v", ritocchi: [{ op: "replace", path: "/scene/9/nome", value: "x" }] })
    expect([storto.errore, storto.testo]).toEqual([true, expect.stringContaining("ritocco 1")])
    expect((await mcp.chiama("piano_annulla", { slug: "v" })).dati()).toMatchObject({ piano: piano() })
  })

  test("un piano che non va dà l'errore del server e il file non cambia", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const r = await mcp.chiama("piano_scrivi", { slug: "v", piano: { quadro: "non-c-e", sorgenti: {}, scene: [] } })
    expect(r.errore).toBe(true)
    expect(r.testo).toContain("Il piano non è valido")
    expect(JSON.parse(await readFile(join(a.archivio, "video", "v", "piano.json"), "utf-8"))).toEqual(piano())
  })

  test("annullare la prima versione è un errore con la frase del server", async () => {
    const mcp = await collega(await conVideo())
    const r = await mcp.chiama("piano_annulla", { slug: "v" })
    expect(r.errore).toBe(true)
    expect(r.testo).toContain("prima versione")
  })
})

describe("valida e parole", () => {
  test("valida dice che va e porta gli avvisi", async () => {
    const mcp = await collega(await conVideo())
    const r = await mcp.chiama("valida", { slug: "v" })
    expect(r.errore).toBe(false)
    expect(r.dati()).toEqual({ valido: true, avvisi: ["la parola «uno» è incerta"] })
  })

  test("se il motore esce con 1, la sua frase arriva com'è; senza frase, il codice", async () => {
    const mcp = await collega(await conVideo())
    const rotto = await mcp.chiama("valida", { slug: "rotto" })
    expect(rotto.errore).toBe(true)
    expect(rotto.testo).toBe("il piano non va:\n  la sorgente «a» non c'è")
    const muto = await mcp.chiama("parole", { slug: "muto" })
    expect(muto.errore).toBe(true)
    expect(muto.testo).toContain("codice 1")
  })

  test("parole dà il testo del motore, lanciato dalla cartella del codice", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const r = await mcp.chiama("parole", { slug: "v" })
    expect(r.errore).toBe(false)
    expect(r.testo).toContain("tratto 0: aggancio")
    expect(r.testo.toLowerCase()).toContain(a.codice.split(/[\\/]/).pop()!.toLowerCase())
  })

  test("un comando che non finisce entro il tempo massimo viene fermato", async () => {
    const inizio = Date.now()
    await expect(lancia(["python", "-c", "import time; time.sleep(60)"], { cwd: tmpdir(), env: {}, secondi: 1 })).rejects.toThrow("non ha finito entro 1 secondi")
    expect(Date.now() - inizio).toBeLessThan(10_000)
  })

  test("se Python non c'è lo dice", async () => {
    const mcp = await collega(await conVideo(), { motore: { eseguibile: "python-che-non-esiste", modulo: "motore", ambiente: {} } })
    const r = await mcp.chiama("valida", { slug: "v" })
    expect(r.errore).toBe(true)
    expect(r.testo).toContain("Non riesco ad avviare «python-che-non-esiste»")
  })
})

describe("slide", () => {
  const conCarosello = (slide: number[]): Promise<Ambiente> =>
    avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "v", { titolo: "Il video", stato: "in lavorazione", creato: "2026-10-06" }, piano())
      await scriviVideo(c, "giro", { titolo: "Un giro", stato: "proposta", creato: "2026-11-02", formato: "carosello" })
      await mkdir(join(c.archivio, "video", "giro", "uscite"), { recursive: true })
      for (const n of slide) await copyFile(png, join(c.archivio, "video", "giro", "uscite", `slide-${n}.png`))
    })

  test("dà le slide del carosello in ordine di numero, rimpicciolite, o solo quelle chieste", async () => {
    const mcp = await collega(await conCarosello([2, 10, 1]))
    const tutte = await mcp.chiama("slide", { slug: "giro" })
    expect(tutte.errore).toBe(false)
    expect(tutte.contenuto.map((c) => c.type)).toEqual(["text", "image", "text", "image", "text", "image"])
    expect(tutte.contenuto.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["Slide 1", "Slide 2", "Slide 10"])
    expect(tutte.contenuto.find((c) => c.type === "image")!.mimeType).toBe("image/jpeg")
    const una = await mcp.chiama("slide", { slug: "giro", numeri: [2] })
    expect(una.contenuto.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["Slide 2"])
  })

  test("se la resa del carosello è in corso, aspetta che finisca e dà le slide nuove", async () => {
    const a = await conCarosello([1])
    const nuova = join(a.radice, "slide-nuova.png")
    const fatto = Bun.spawn(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=red:size=1080x1920", "-frames:v", "1", "-y", nuova], { stdin: "ignore", stdout: "ignore", stderr: "inherit" })
    expect(await fatto.exited).toBe(0)
    const mcp = await collega(a)
    const vecchia = (await mcp.chiama("slide", { slug: "giro" })).contenuto.find((c) => c.type === "image")!.data
    expect((await mcp.chiama("lavoro", { slug: "giro", comando: "carosello" })).errore).toBe(false)
    await aspetta(async () => (await righeDelFinto(a)).includes("inizio carosello giro"))
    let tornata = false
    const attesa = mcp.chiama("slide", { slug: "giro" }).then((r) => ((tornata = true), r))
    await Bun.sleep(500)
    expect(tornata).toBe(false)
    await sblocca(a, "giro")
    const r = await attesa
    expect(r.errore).toBe(false)
    expect(r.contenuto.find((c) => c.type === "image")!.data).not.toBe(vecchia)
  })

  test("dice cosa fare se non è un carosello, se le slide non ci sono o ne manca una", async () => {
    const mcp = await collega(await conCarosello([]))
    const video = await mcp.chiama("slide", { slug: "v" })
    expect([video.errore, video.testo]).toEqual([true, expect.stringContaining("non è un carosello")])
    const vuoto = await mcp.chiama("slide", { slug: "giro" })
    expect([vuoto.errore, vuoto.testo]).toEqual([true, expect.stringContaining("lavoro «carosello»")])
    const altro = await collega(await conCarosello([1]))
    const manca = await altro.chiama("slide", { slug: "giro", numeri: [1, 5] })
    expect([manca.errore, manca.testo]).toEqual([true, expect.stringContaining("slide 5")])
  })
})

describe("foto", () => {
  test("dà un'immagine rimpicciolita per ogni secondo, con la sua etichetta", async () => {
    const mcp = await collega(await conVideo())
    const r = await mcp.chiama("foto", { slug: "v", secondi: [0, 12.5] })
    expect(r.errore).toBe(false)
    expect(r.contenuto.map((c) => c.type)).toEqual(["text", "image", "text", "image"])
    expect(r.contenuto.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["Secondo 0", "Secondo 12.5"])
    const immagini = r.contenuto.filter((c) => c.type === "image")
    for (const i of immagini) {
      expect(i.mimeType).toBe("image/jpeg")
      expect(dimensioniJpeg(i.data!)).toEqual({ largo: 540, alto: 960 })
    }
    expect(Buffer.from(immagini[0]!.data!, "base64").length).toBeLessThan((await Bun.file(jpg).arrayBuffer()).byteLength)
  })

  test("un video orizzontale resta orizzontale, con lo stesso lato lungo", async () => {
    const orizzontale = join(immagini, "orizzontale.jpg")
    const fatto = Bun.spawn(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=1920x1080", "-frames:v", "1", "-y", orizzontale], { stdin: "ignore", stdout: "ignore", stderr: "inherit" })
    expect(await fatto.exited).toBe(0)
    const a = await conVideo()
    const mcp = await collega(a, { motore: { eseguibile: "python", modulo: "finto_mcp", ambiente: { PYTHONPATH: join(a.radice, "finto-mcp"), FINTO_JPG: orizzontale } } })
    const r = await mcp.chiama("foto", { slug: "v", secondi: [3] })
    expect(dimensioniJpeg(r.contenuto.find((c) => c.type === "image")!.data!)).toEqual({ largo: 960, alto: 540 })
  })

  test("dall'anteprima, coi secondi del video montato; di base dal montato", async () => {
    const mcp = await collega(await conVideo())
    const anteprima = await mcp.chiama("foto", { slug: "v", secondi: [55, 59.5], video: "anteprima" })
    expect(anteprima.errore).toBe(false)
    expect(anteprima.contenuto.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["Secondo 55", "Secondo 59.5"])
    expect(anteprima.contenuto.filter((c) => c.type === "image")).toHaveLength(2)
    const fuori = await mcp.chiama("foto", { slug: "v", secondi: [3], video: "anteprima" })
    expect(fuori.errore).toBe(true)
    expect(fuori.testo).toBe("l'anteprima copre il video da 50.0 a 60.0 s: il secondo 3 è fuori")
    expect((await mcp.chiama("foto", { slug: "v", secondi: [3] })).errore).toBe(false)
    expect((await mcp.chiama("foto", { slug: "v", secondi: [3], video: "montato" })).errore).toBe(false)
  })

  test("dalla prova, coi suoi secondi", async () => {
    const mcp = await collega(await conVideo())
    const prova = await mcp.chiama("foto", { slug: "v", secondi: [3], video: "prova" })
    expect(prova.errore).toBe(false)
    expect(prova.contenuto.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["Secondo 3 della prova"])
    const oltre = await mcp.chiama("foto", { slug: "v", secondi: [30], video: "prova" })
    expect([oltre.errore, oltre.testo]).toEqual([true, "il video dura 10.0 s: non arriva al secondo 30"])
  })

  test("ascolta: livello, tratti di voce e spettrogramma di un pezzo del girato o del montato, al più 10 secondi", async () => {
    const mcp = await collega(await conVideo())
    const girato = await mcp.chiama("ascolta", { file: "2026-10-06/a.mp4", da: 1, a: 1.04 })
    expect(girato.errore).toBe(false)
    expect(girato.contenuto.map((c) => c.type)).toEqual(["text", "image"])
    expect(JSON.parse(girato.contenuto[0]!.text!)).toEqual({ da: 1, passo: 0.01, silenzio_db: -39, livello: [-60, -20, -20, -60], voce: [[1.01, 1.03]], dove: ["--file", "2026-10-06/a.mp4"] })
    const montato = await mcp.chiama("ascolta", { slug: "v", da: 0, a: 2 })
    expect(JSON.parse(montato.contenuto[0]!.text!).dove).toEqual(["--video", "v"])
    for (const sbagliato of [{ da: 0, a: 2 }, { slug: "v", file: "2026-10-06/a.mp4", da: 0, a: 2 }, { slug: "v", da: 0, a: 11 }, { slug: "v", da: 3, a: 2 }]) {
      expect((await mcp.chiama("ascolta", sbagliato)).errore, JSON.stringify(sbagliato)).toBe(true)
    }
  })

  test("girato_parole: le parole coi tempi di una finestra di un file preparato, al più 10 minuti", async () => {
    const a = await conVideo()
    await mkdir(join(a.archivio, "preparati", "2026-10-06", "a.mp4"), { recursive: true })
    const parole = [{ p: "uno", da: 1, a: 1.4 }, { p: "due", da: 5, a: 5.3 }, { p: "tre", da: 9.8, a: 10.2 }]
    await writeFile(join(a.archivio, "preparati", "2026-10-06", "a.mp4", "parole.json"), JSON.stringify(parole))
    const mcp = await collega(a)
    await aspetta(async () => !(await mcp.chiama("girato_parole", { file: "2026-10-06/a.mp4", da: 0, a: 10 })).errore)
    const r = await mcp.chiama("girato_parole", { file: "2026-10-06/a.mp4", da: 4, a: 10 })
    expect(r.dati()).toEqual({ file: "2026-10-06/a.mp4", da: 4, a: 10, parole: [["due", 5, 5.3], ["tre", 9.8, 10.2]] })
    expect((await mcp.chiama("girato_parole", { file: "2026-10-06/a.mp4", da: 0, a: 601 })).errore).toBe(true)
    const nonPronto = await mcp.chiama("girato_parole", { file: "2026-10-06/non-c-e.mp4", da: 0, a: 10 })
    expect([nonPronto.errore, nonPronto.testo]).toEqual([true, expect.stringContaining("non c'è")])
  })

  test("girato_foto: i fotogrammi di un file del girato ai suoi secondi", async () => {
    const mcp = await collega(await conVideo())
    const r = await mcp.chiama("girato_foto", { file: "2026-10-06/a.mp4", secondi: [1, 2.5] })
    expect(r.errore).toBe(false)
    expect(r.contenuto.map((c) => c.type)).toEqual(["text", "image", "text", "image"])
    expect(r.contenuto.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["Secondo 1 di 2026-10-06/a.mp4", "Secondo 2.5 di 2026-10-06/a.mp4"])
    const manca = await mcp.chiama("girato_foto", { file: "2026-10-06/non-c-e.mp4", secondi: [1] })
    expect([manca.errore, manca.testo]).toEqual([true, expect.stringContaining("non c'è")])
  })

  test("l'errore del motore arriva com'è; troppi o nessun secondo sono rifiutati", async () => {
    const mcp = await collega(await conVideo())
    const oltre = await mcp.chiama("foto", { slug: "v", secondi: [150] })
    expect(oltre.errore).toBe(true)
    expect(oltre.testo).toBe("il video dura 100.0 s: non arriva al secondo 150")
    expect((await mcp.chiama("foto", { slug: "v", secondi: [] })).errore).toBe(true)
    expect((await mcp.chiama("foto", { slug: "v", secondi: [1, 2, 3, 4, 5, 6, 7, 8, 9] })).errore).toBe(true)
    expect((await mcp.chiama("foto", { slug: "v", secondi: [-1] })).errore).toBe(true)
  })

  test("senza ffmpeg dice cosa manca", async () => {
    const mcp = await collega(await conVideo(), { ffmpeg: null })
    const r = await mcp.chiama("foto", { slug: "v", secondi: [1] })
    expect(r.errore).toBe(true)
    expect(r.testo).toContain("ffmpeg")
  })
})

describe("scene_foto", () => {
  test("dà i fotogrammi e dice che i controlli sono superati", async () => {
    const mcp = await collega(await conVideo())
    const r = await mcp.chiama("scene_foto", { sigla: "ok" })
    expect(r.errore).toBe(false)
    expect(r.dati()).toEqual({ sigla: "ok", controlli: "superati", segnalazioni: [] })
    expect(r.contenuto.map((c) => (c.type === "text" ? c.text : c.type)).slice(1)).toEqual(["ok-0s.png", "image", "ok-2,5s.png", "image"])
    expect(dimensioniJpeg(r.contenuto.find((c) => c.type === "image")!.data!)).toEqual({ largo: 540, alto: 960 })
  })

  test("un controllo fallito è un risultato: le immagini e le segnalazioni, non un errore", async () => {
    const mcp = await collega(await conVideo())
    const r = await mcp.chiama("scene_foto", { sigla: "difetto" })
    expect(r.errore).toBe(false)
    expect(r.dati()).toEqual({
      sigla: "difetto",
      controlli: "falliti",
      segnalazioni: ["difetto a 2,5 s: testo sotto i 40 px (30 px): «ciao»", "difetto da 0 s a 3 s: lo sfondo resta fermo"],
    })
    expect(r.contenuto.filter((c) => c.type === "image")).toHaveLength(2)
  })

  test("con il lavoro di una chiamata scaduta dà il risultato senza rifare la resa", async () => {
    const a = await conVideo()
    const { id } = (await chiama<{ id: string }>(a, "POST", "/api/animazioni/foto", { sigla: "ok" })).corpo
    const r = await (await collega(a)).chiama("scene_foto", { sigla: "ok", lavoro: id })
    expect(r.errore).toBe(false)
    expect(r.dati()).toEqual({ sigla: "ok", controlli: "superati", segnalazioni: [] })
    expect(r.contenuto.filter((c) => c.type === "image")).toHaveLength(2)
    expect((await chiama<{ finiti: unknown[] }>(a, "GET", "/api/lavori")).corpo.finiti).toHaveLength(1)
  })

  test("una sigla che non c'è è un errore con la frase dello script", async () => {
    const mcp = await collega(await conVideo())
    const r = await mcp.chiama("scene_foto", { sigla: "rotta" })
    expect(r.errore).toBe(true)
    expect(r.testo).toBe("Non esiste una scena «rotta» in animazioni/. Le sigle sono: ok, difetto.")
    expect((await mcp.chiama("scene_foto", { sigla: "--tutte" })).errore).toBe(true)
  })
})

describe("lavoro, lavoro_stato e lavoro_aspetta", () => {
  test("lavoro mette in coda e dà l'id; gli argomenti di anteprima e copertina arrivano al motore", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const casi: [Record<string, unknown>, string][] = [
      [{ comando: "risolvi" }, "inizio risolvi v"],
      [{ comando: "anteprima", scena: "s" }, "inizio anteprima v --scena s"],
      [{ comando: "anteprima", da: 1, a: 3 }, "inizio anteprima v --da 1 --a 3"],
      [{ comando: "copertina", disegno: "materiali/c.png", istante: 2 }, "inizio copertina v materiali/c.png --istante 2"],
    ]
    for (const [argomenti, riga] of casi) {
      const r = await mcp.chiama("lavoro", { slug: "v", ...argomenti })
      expect([riga, r.errore]).toEqual([riga, false])
      const { id } = r.dati() as { id: string }
      expect(id).toMatch(/^[0-9a-f]{8}$/)
      await aspetta(async () => (await righeDelFinto(a)).includes(riga))
    }
  })

  test("lavoro dà subito lo stato e la stima; lavoro_stato anche il trascorso e la fine prevista, all'ora del computer", async () => {
    // Tre montaggi da 25 s su 12,5 s di video: 2 s per secondo, e v dura 12,5 s.
    const storia = [0, 1, 2].map((i) => ({ id: `s${i}`, slug: "v", comando: "monta", file: null, iniziato: "2026-10-01T10:00:00.000Z", finito: "2026-10-01T10:00:25.000Z", esito: "riuscito", errore: null, righe: [], secondi_video: 12.5 }))
    const a = await conVideo(storia)
    const mcp = await collega(a)
    const avvio = (await mcp.chiama("lavoro", { slug: "v", comando: "monta" })).dati()
    expect(avvio).toMatchObject({ comando: "monta", slug: "v", stima: 25 })
    expect(["in coda", "in corso"]).toContain(String(avvio["stato"]))
    const controlla = (await mcp.chiama("lavoro", { slug: "v", comando: "controlla" })).dati()
    expect(controlla).toMatchObject({ stato: "in coda", stima: null })

    const corso = await aspetta(async () => {
      const r = (await mcp.chiama("lavoro_stato", { id: String(avvio["id"]) })).dati()
      return r["stato"] === "in corso" ? r : null
    })
    const { in_corso } = (await (await fetch(`${a.url}/api/lavori`, { headers: a.accesso })).json()) as { in_corso: { fine_prevista: string } }
    const fine = new Date(in_corso.fine_prevista)
    expect(corso).toMatchObject({ stima: 25, fine_prevista: `${String(fine.getHours()).padStart(2, "0")}:${String(fine.getMinutes()).padStart(2, "0")}` })
    expect(corso["trascorsi"]).toBeGreaterThanOrEqual(0)
    await sblocca(a, "v")
  })

  test("lavoro rifiuta con la frase del server: video senza piano, argomenti sbagliati", async () => {
    const mcp = await collega(await conVideo())
    const senzaPiano = await mcp.chiama("lavoro", { slug: "w", comando: "monta" })
    expect(senzaPiano.errore).toBe(true)
    expect(senzaPiano.testo).toContain("non ha ancora un piano")
    const nonBasta = await mcp.chiama("lavoro", { slug: "v", comando: "anteprima" })
    expect(nonBasta.errore).toBe(true)
    expect(nonBasta.testo).toContain("scena")
    expect((await mcp.chiama("lavoro", { slug: "v", comando: "cancella-tutto" })).errore).toBe(true)
  })

  test("lavoro_stato dice in coda, in corso e finito, con esito, errore e righe", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const primo = ((await mcp.chiama("lavoro", { slug: "v", comando: "monta" })).dati() as { id: string }).id
    const secondo = ((await mcp.chiama("lavoro", { slug: "x", comando: "monta" })).dati() as { id: string }).id
    await aspetta(async () => (await mcp.chiama("lavoro_stato", { id: primo })).dati()["stato"] === "in corso")
    expect((await mcp.chiama("lavoro_stato", { id: secondo })).dati()).toMatchObject({ id: secondo, comando: "monta", slug: "x", stato: "in coda", righe: [] })
    await sblocca(a, "v")
    await sblocca(a, "x")
    const finito = await aspetta(async () => {
      const r = (await mcp.chiama("lavoro_stato", { id: primo })).dati()
      return r["stato"] === "finito" ? r : null
    })
    expect(finito).toMatchObject({ id: primo, esito: "riuscito", errore: null, righe: ["monta v"] })
  })

  test("lavoro_stato con un id che non c'è dice cosa controllare", async () => {
    const mcp = await collega(await conVideo())
    const r = await mcp.chiama("lavoro_stato", { id: "00000000" })
    expect(r.errore).toBe(true)
    expect(r.testo).toContain("Non trovo il lavoro «00000000»")
  })

  test("lavoro_aspetta torna appena il lavoro finisce, senza aspettare il tempo massimo", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const { id } = (await mcp.chiama("lavoro", { slug: "v", comando: "monta" })).dati() as { id: string }
    await aspetta(async () => (await righeDelFinto(a)).includes("inizio monta v"))
    const inizio = Date.now()
    const attesa = mcp.chiama("lavoro_aspetta", { id, secondi: 30 })
    await Bun.sleep(300)
    await sblocca(a, "v")
    const r = await attesa
    expect(Date.now() - inizio).toBeLessThan(8000)
    expect(r.errore).toBe(false)
    expect(r.dati()).toMatchObject({ id, stato: "finito", esito: "riuscito", errore: null, righe: ["monta v"] })
  })

  test("lavoro_aspetta dà l'errore di un lavoro fallito, e subito se è già finito", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const { id } = (await mcp.chiama("lavoro", { slug: "v", comando: "prepara" })).dati() as { id: string }
    const r = await mcp.chiama("lavoro_aspetta", { id, secondi: 30 })
    expect(r.dati()).toMatchObject({ stato: "finito", esito: "fallito", errore: "Manca il file prova.mp4: copialo in archivio/grezzo/ e riprova." })
    const inizio = Date.now()
    expect((await mcp.chiama("lavoro_aspetta", { id, secondi: 30 })).dati()["esito"]).toBe("fallito")
    expect(Date.now() - inizio).toBeLessThan(2000)
  })

  test("lavoro_aspetta, scaduto il tempo, dà lo stato di allora", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const { id } = (await mcp.chiama("lavoro", { slug: "v", comando: "monta" })).dati() as { id: string }
    await aspetta(async () => (await righeDelFinto(a)).includes("inizio monta v"))
    const inizio = Date.now()
    const r = await mcp.chiama("lavoro_aspetta", { id, secondi: 3 })
    expect(Date.now() - inizio).toBeGreaterThanOrEqual(2900)
    expect(r.errore).toBe(false)
    expect(r.dati()).toMatchObject({ id, stato: "in corso" })
    // Lo stato di quando scade, non quello letto all'inizio dell'attesa.
    expect(r.dati()["trascorsi"]).toBeGreaterThanOrEqual(3)
    await sblocca(a, "v")
  })

  test("lavoro_aspetta rifiuta un tempo oltre il tetto e un id che non c'è", async () => {
    const mcp = await collega(await conVideo())
    expect((await mcp.chiama("lavoro_aspetta", { id: "abc", secondi: 301 })).errore).toBe(true)
    const r = await mcp.chiama("lavoro_aspetta", { id: "00000000", secondi: 1 })
    expect(r.errore).toBe(true)
    expect(r.testo).toContain("Non trovo il lavoro")
  })
})

describe("girato_prepara e girato_scarica", () => {
  test("girato_prepara mette in coda prepara-file come lavoro e si aspetta con lavoro_aspetta", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const r = await mcp.chiama("girato_prepara", { file: "2026-10-06/a.mp4" })
    expect(r.errore).toBe(false)
    expect(r.dati()).toMatchObject({ comando: "prepara-file", slug: null })
    expect(["in coda", "in corso"]).toContain(String(r.dati()["stato"]))
    const { id } = r.dati() as { id: string }
    const fine = await mcp.chiama("lavoro_aspetta", { id, secondi: 30 })
    expect(fine.dati()).toMatchObject({ id, stato: "finito", esito: "riuscito", righe: ["prepara-file 2026-10-06/a.mp4"] })
    expect(await righeDelFinto(a)).toEqual(["inizio prepara-file 2026-10-06/a.mp4", "fine prepara-file 2026-10-06/a.mp4"])
  })

  test("girato_scheda cambia solo i campi dati della scheda di un file; girato_prepara con ritrascrivi rifà le parole", async () => {
    const a = await conVideo()
    const mcp = await collega(a)
    const cambiata = await mcp.chiama("girato_scheda", { file: "2026-10-06/a.mp4", campi: { lingua: "en" } })
    expect(cambiata.errore).toBe(false)
    expect(cambiata.dati()).toMatchObject({ lingua: "en" })
    const cattiva = await mcp.chiama("girato_scheda", { file: "2026-10-06/a.mp4", campi: { lingua: "inglese" } })
    expect([cattiva.errore, cattiva.testo]).toEqual([true, expect.stringContaining("lingua")])
    const r = await mcp.chiama("girato_prepara", { file: "2026-10-06/a.mp4", ritrascrivi: true })
    await mcp.chiama("lavoro_aspetta", { id: (r.dati() as { id: string }).id, secondi: 30 })
    expect(await righeDelFinto(a)).toContain("inizio prepara-file 2026-10-06/a.mp4 --ritrascrivi")
  })

  test("girato_prepara dà l'errore del server per un file che non c'è o scritto male", async () => {
    const mcp = await collega(await conVideo())
    const manca = await mcp.chiama("girato_prepara", { file: "2026-10-06/non-c-e.mp4" })
    expect(manca.errore).toBe(true)
    expect(manca.testo).toContain("non c'è in archivio/grezzo/")
    const storto = await mcp.chiama("girato_prepara", { file: "../x" })
    expect(storto.errore).toBe(true)
    expect(storto.testo).toContain("giorno/nome")
  })

  test("web_testo: i sottotitoli di un video in rete nella lingua chiesta, col minuto, senza scaricare il video", async () => {
    const a = await conVideo()
    process.env["FINTO_YTDLP_LOG"] = join(a.radice, "ytdlp.log")
    const mcp = await collega(a, { ytdlp: fintoYtdlp.comando })
    const r = await mcp.chiama("web_testo", { url: "https://esempio.test/ok", lingua: "en" })
    expect([r.errore, r.testo]).toEqual([false, "01:02 hello en"])
    const chiamata = (await chiamateDelFintoYtdlp(a.radice))[0]!
    expect(chiamata).toContain("--skip-download")
    expect(chiamata[chiamata.indexOf("--sub-langs") + 1]).toBe("en,en-orig")
    const senza = await mcp.chiama("web_testo", { url: "https://esempio.test/senza-sottotitoli", lingua: "it" })
    expect([senza.errore, senza.testo]).toEqual([true, expect.stringContaining("«it»")])
    expect((await mcp.chiama("web_testo", { url: "file:///c:/x", lingua: "it" })).errore).toBe(true)
    const manca = await collega(a, { ytdlp: null })
    expect((await manca.chiama("web_testo", { url: "https://esempio.test/ok", lingua: "it" })).testo).toContain("yt-dlp")
  })

  test("girato_scarica scarica il tratto, risponde come lavoro e l'ultima riga dice il file", async () => {
    const a = await avviaConScarico(fintoYtdlp)
    const mcp = await collega(a)
    const r = await mcp.chiama("girato_scarica", { url: "https://esempio.test/ok", da: "1:30", a: 100, nome: "keynote" })
    expect(r.errore).toBe(false)
    expect(r.dati()).toMatchObject({ comando: "scarica", slug: null })
    const { id } = r.dati() as { id: string }
    const fine = (await mcp.chiama("lavoro_aspetta", { id, secondi: 30 })).dati()
    expect(fine).toMatchObject({ stato: "finito", esito: "riuscito" })
    expect((fine["righe"] as string[]).at(-1)).toBe("Scaricato: 2026-10-06/keynote.mp4")
    const [chiamata] = await chiamateDelFintoYtdlp(a.radice)
    expect(chiamata![chiamata!.indexOf("--download-sections") + 1]).toBe("*90-100")
    expect(JSON.parse(await readFile(join(a.archivio, "grezzo", "2026-10-06", "keynote.mp4.scheda.json"), "utf-8"))).toMatchObject({ origine: "scaricato", tratto: { da: 90, a: 100 } })
  })

  test("girato_scarica dà la frase del server: tratto sbagliato, yt-dlp mancante", async () => {
    const a = await avviaConScarico(fintoYtdlp, { ytdlp: null })
    const mcp = await collega(a)
    const storto = await mcp.chiama("girato_scarica", { url: "https://esempio.test/ok", da: 50, a: 20 })
    expect(storto.errore).toBe(true)
    expect(storto.testo).toContain("«a» deve venire dopo «da»")
    const manca = await mcp.chiama("girato_scarica", { url: "https://esempio.test/ok" })
    expect(manca.errore).toBe(true)
    expect(manca.testo).toContain("yt-dlp non è installato")
  })
})

describe("il processo su stdio", () => {
  test("parte con `bun run src/mcp/avvia.ts`, elenca gli strumenti e parla col server della porta data", async () => {
    const a = await conVideo()
    const trasporto = new StdioClientTransport({
      command: process.execPath,
      args: ["run", join(import.meta.dir, "..", "src", "mcp", "avvia.ts")],
      env: { MANGO_ANIMATION_LAVORO: a.radice, MANGO_ANIMATION_PORTA: String(a.server.porta), PATH: process.env["PATH"] ?? "", SystemRoot: process.env["SystemRoot"] ?? "", MANGO_DATA: process.env["MANGO_DATA"] ?? "" },
      stderr: "pipe",
    })
    const client = new Client({ name: "prova", version: "1" })
    clienti.push(client)
    await client.connect(trasporto)
    expect((await client.listTools()).tools).toHaveLength(23)
    const r = await client.callTool({ name: "video_elenco", arguments: {} })
    const elenco = JSON.parse((r.content as { text: string }[])[0]!.text) as { slug: string }[]
    expect(elenco.map((v) => v.slug).sort()).toEqual(["v", "w", "x"])
  })
})
