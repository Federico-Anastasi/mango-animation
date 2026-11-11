import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "../src/App"
import { leggiBlocchi } from "../src/chat/analisiMarkdown"
import { creaCollegatore } from "../src/chat/collegamenti"
import { caricaAllegato } from "../src/chat/api"
import { BottoneChat } from "../src/chat/BottoneChat"
import { Markdown } from "../src/chat/Markdown"
import { EtichettaMotore } from "../src/chat/EtichettaMotore"
import { MOTORE_CHAT, motoreDi } from "../src/chat/motore"
import { negozio } from "../src/chat/negozio"
import { scegliLarghezzaChat, apriChat, chiudiChat } from "../src/chat/pannello"
import { PannelloChat } from "../src/chat/PannelloChat"
import { descriviStrumento, percorsoCorto } from "../src/chat/strumenti"
import type { DettaglioConversazione, Messaggio, ModelloChat, Parte, Richiesta } from "../src/chat/tipi"
import type { VoceElenco } from "../src/tipi"
import { dettaglioDiProva } from "./fixture"
import { errore, installaEventi, installaRete, type Chiamata } from "./rete"

let chiamate: Chiamata[]
let eventi: ReturnType<typeof installaEventi>

const voce = (slug: string, titolo: string, extra: Partial<VoceElenco["scheda"]> = {}): VoceElenco => ({
  slug,
  scheda: { titolo, stato: "in lavorazione", creato: "2026-10-06", ...extra },
  durata: null,
  miniatura: null,
  anteprima: null,
  ha_piano: true,
  quadri: [],
  ha_finale: false,
  fase: null,
  ultimo_cambio: "2026-10-09T10:00:00",
})

const VIDEO = [voce("orto-balcone", "L'orto sul balcone"), voce("carosello-orto", "Il carosello dell'orto", { formato: "carosello" })]

const claude = (id: string, ...parti: Parte[]): Messaggio => ({ id, ruolo: "claude", quando: "2026-11-02T10:00:00", parti })
const fa = (id: string, testo: string): Messaggio => ({ id, ruolo: "utente", quando: "2026-11-02T09:59:00", parti: [{ tipo: "testo", testo }] })

const TUTTI = ["low", "medium", "high", "xhigh", "max"] as const
const MODELLI: ModelloChat[] = [
  { id: "default", nome: "Predefinito (Sonnet 5.5)", descrizione: "", effort: [...TUTTI], reale: "claude-sonnet-5-5" },
  { id: "opus", nome: "Opus 5.5", descrizione: "", effort: [...TUTTI], reale: "claude-opus-5-5" },
  { id: "claude-opus-4-6", nome: "Opus 4.6", descrizione: "", effort: ["low", "medium", "high", "max"], reale: "claude-opus-4-6" },
  { id: "claude-haiku-4-5-20251001", nome: "Haiku 4.5", descrizione: "", effort: [], reale: "claude-haiku-4-5-20251001" },
]

function conversazione(extra: Partial<DettaglioConversazione> = {}): DettaglioConversazione {
  return { id: "c1", titolo: "Le slide del carosello", attiva: false, stato: "pronta", lavora_da: null, lavoro: { ms: 0, da: null }, modello: null, effort: null, messaggi: [], in_attesa: [], task: [], contesto_usato: null, ...extra }
}

function rete(rotte: Record<string, unknown> = {}) {
  chiamate = installaRete({
    "GET /api/video": VIDEO,
    "GET /api/chat": [{ id: "c1", titolo: "Le slide del carosello", aggiornata: "2026-11-02T10:00:00", attiva: false }],
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/chat/modelli": MODELLI,
    "GET /api/chat/c1": conversazione(),
    ...rotte,
  }).chiamate
}

const scrivi = (campo: HTMLElement, testo: string) => fireEvent.change(campo, { target: { value: testo } })
const invio = (campo: HTMLElement) => fireEvent.keyDown(campo, { key: "Enter" })

/** Lascia finire le letture iniziali (video, lavori) prima che la prova tocchi qualcosa. */
const assesta = () => act(() => new Promise<void>((ok) => setTimeout(ok, 20)))

const manda = (evento: object) => act(() => eventi.istanze.at(-1)!.manda({ tipo: "chat", ...evento }))

async function apriConversazione(dettaglio: Partial<DettaglioConversazione> = {}, extra: Record<string, unknown> = {}) {
  rete({ "GET /api/chat/c1": conversazione(dettaglio), ...extra })
  negozio.apri("c1")
  render(<PannelloChat />)
  await screen.findByRole("log", { name: "La conversazione" })
  await assesta()
}

beforeEach(() => {
  eventi = installaEventi()
  window.location.hash = ""
  localStorage.clear()
  sessionStorage.clear()
  negozio.apri(null)
  chiudiChat()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("il markdown", () => {
  it("legge titoli, elenchi annidati, tabelle, codice e citazioni", () => {
    const blocchi = leggiBlocchi("# Titolo\n\n- uno\n  - dentro\n- due\n\n1. a\n2. b\n\n| a | b |\n|---|--:|\n| 1 | 2 |\n\n```bash\nbun test\n```\n\n> citato")
    expect(blocchi.map((b) => b.tipo)).toEqual(["titolo", "elenco", "elenco", "tabella", "codice", "citazione"])
    const elenco = blocchi[1]
    expect(elenco?.tipo === "elenco" && elenco.voci[0]?.blocchi.map((b) => b.tipo)).toEqual(["paragrafo", "elenco"])
  })

  it("rende codice con font mono e «Copia», e il testo copiato è il codice", async () => {
    const scrivi = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText: scrivi }, configurable: true })
    render(<Markdown testo={"Prima:\n\n```bash\nbun test\n```"} />)
    expect(screen.getByText("bun test").closest("pre")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Copia il codice" }))
    await waitFor(() => expect(scrivi).toHaveBeenCalledWith("bun test"))
  })

  it("un blocco di codice non chiuso, come quando il testo arriva a pezzi, si legge lo stesso", () => {
    render(<Markdown testo={"```ts\nconst a = 1"} />)
    expect(screen.getByText("const a = 1")).toBeInTheDocument()
  })

  it("un collegamento si apre solo se è sicuro, e niente HTML scritto nel testo diventa HTML", () => {
    const { container } = render(<Markdown testo={"[buono](https://esempio.it) [cattivo](javascript:alert(1)) <img src=x onerror=alert(1)>"} />)
    expect(screen.getByRole("link", { name: "buono" })).toHaveAttribute("href", "https://esempio.it")
    expect(screen.queryByRole("link", { name: "cattivo" })).toBeNull()
    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>")
  })

  it("rende le tabelle", () => {
    render(<Markdown testo={"| video | stato |\n|---|---|\n| orto | pronto |"} />)
    const tabella = screen.getByRole("table")
    expect(within(tabella).getByRole("columnheader", { name: "video" })).toBeInTheDocument()
    expect(within(tabella).getByRole("cell", { name: "pronto" })).toBeInTheDocument()
  })
})

describe("come la chat dice uno strumento", () => {
  it("un verbo e l'oggetto, mai il nome interno", () => {
    expect(descriviStrumento("Read", { file_path: "C:\\Users\\utente\\Desktop\\mango-animation\\docs\\PIANO.md" }).etichetta).toBe("Legge docs/PIANO.md")
    expect(descriviStrumento("Bash", { command: "bun test" }).etichetta).toBe("Lancia: bun test")
    expect(descriviStrumento("mcp__video__lavoro", { slug: "orto-balcone", comando: "monta" }).etichetta).toBe("Video · lavoro monta orto-balcone")
    expect(descriviStrumento("mcp__video__video_elenco", {}).etichetta).toBe("Video · elenco dei video")
    expect(descriviStrumento("mcp__video__girato_scarica", { url: "https://esempio.test/ok" }).etichetta).toBe("Video · scarica dal web")
    expect(descriviStrumento("mcp__video__girato_prepara", { file: "2026-10-06/a.mp4" }).etichetta).toBe("Video · prepara un file del girato")
    expect(descriviStrumento("Grep", { pattern: "stima" }).etichetta).toBe("Cerca «stima»")
    expect(descriviStrumento("ToolSearch", { query: "select:foto" }).etichetta).toBe("Cerca uno strumento")
    expect(percorsoCorto("/home/u/mango-animation/studio/src/App.tsx")).toBe("studio/src/App.tsx")
  })
})

describe("l'etichetta di un comando", () => {
  const radice = "cd /c/Users/utente/Desktop/mango-animation"

  it("senza il cd alla cartella davanti, così si legge cosa fa", () => {
    expect(descriviStrumento("Bash", { command: `${radice} && python -m motore valida orto-balcone` }).etichetta).toBe("Lancia: python -m motore valida orto-balcone")
    expect(descriviStrumento("Bash", { command: `cd "C:\Users\Lavoro\Mio Progetto\mango-animation"; git status` }).etichetta).toBe("Lancia: git status")
    expect(descriviStrumento("Bash", { command: `${radice} && ls archivio && ${radice} && git status` }).etichetta).toBe("Lancia: ls archivio && git status")
  })

  it("un cd dentro una cartella del lavoro resta: dice dove gira il comando", () => {
    expect(descriviStrumento("Bash", { command: `${radice} && cd studio && bunx vitest run` }).etichetta).toBe("Lancia: cd studio && bunx vitest run")
  })

  it("un comando che è solo il cd si mostra com'è", () => {
    expect(descriviStrumento("Bash", { command: radice }).etichetta).toBe(`Lancia: ${radice}`)
  })

  it("se il comando ha una descrizione, l'etichetta è quella; il comando intero resta nel dettaglio", () => {
    const comando = `${radice} && python -m motore valida orto-balcone`
    const d = descriviStrumento("Bash", { command: comando, description: "Controlla il piano di orto-balcone" })
    expect(d.etichetta).toBe("Controlla il piano di orto-balcone")
    expect(d.dettaglio).toBe(comando)
  })

  it("nella conversazione la riga mostra l'etichetta e il riquadro aperto il comando intero", async () => {
    const comando = `${radice} && python -m motore valida orto-balcone`
    await apriConversazione({ messaggi: [claude("m1", { tipo: "strumento", id: "t1", nome: "Bash", ingresso: { command: comando, description: "Controlla il piano" }, esito: "ok" })] })
    const riga = await screen.findByRole("button", { name: /Controlla il piano/ })
    expect(screen.queryByText(comando)).toBeNull()
    fireEvent.click(riga)
    expect(screen.getByText(comando)).toBeTruthy()
  })
})

describe("i collegamenti ai video", () => {
  it("il nome di un video e i percorsi della sua cartella portano alla vista giusta", () => {
    const collega = creaCollegatore(["orto-balcone", "orto-balcone-bis", "ai"])
    expect(collega("Il video orto-balcone-bis è pronto, vedi archivio/video/orto-balcone/piano.json.")).toEqual([
      "Il video ",
      { testo: "orto-balcone-bis", href: "#/video/orto-balcone-bis" },
      " è pronto, vedi ",
      { testo: "archivio/video/orto-balcone/piano.json", href: "#/video/orto-balcone/montaggio" },
      ".",
    ])
    expect(collega("l'ai non è un video")).toEqual(["l'ai non è un video"])
    expect(collega("archivio/video/orto-balcone/uscite/slide-3.png")).toEqual([{ testo: "archivio/video/orto-balcone/uscite/slide-3.png", href: "#/video/orto-balcone/slide" }])
    expect(collega("archivio/video/orto-balcone/uscite/finale.mp4")).toEqual([{ testo: "archivio/video/orto-balcone/uscite/finale.mp4", href: "#/video/orto-balcone/montaggio" }])
  })
})

describe("la conversazione", () => {
  it("rende ogni parte: testo, pensiero chiuso, strumenti con riga compatta, immagine grande, fine con durata", async () => {
    await apriConversazione({
      titolo: "Controllo dell'orto",
      messaggi: [
        fa("m1", "Guarda il video"),
        claude(
          "m2",
          { tipo: "pensiero", testo: "Devo prima leggere il piano." },
          { tipo: "testo", testo: "## Cosa ho trovato\n\n- **due** problemi\n- `orto-balcone` è pronto" },
          { tipo: "strumento", id: "t1", nome: "Read", ingresso: { file_path: "docs/PIANO.md" }, esito: "# Il piano\nriga due" },
          { tipo: "strumento", id: "t2", nome: "Bash", ingresso: { command: "bun test" }, esito: "tutto verde" },
          { tipo: "strumento", id: "t3", nome: "mcp__video__foto", ingresso: { slug: "orto-balcone" }, esito: "2 fotogrammi", immagini: [{ media_type: "image/png", data: "iVBORw0KGgo=" }] },
          { tipo: "strumento", id: "t4", nome: "Bash", ingresso: { command: "rm -rf x" }, errore: "permesso negato" },
          { tipo: "fine", durata_ms: 72_000 },
        ),
      ],
    })
    expect(screen.getByText("Guarda il video")).toBeInTheDocument()
    expect(screen.getByText("Cosa ho trovato")).toBeInTheDocument()
    expect(screen.getByText("due").tagName).toBe("STRONG")
    const pensiero = screen.getByText("Ha ragionato").closest("details")!
    expect(pensiero).not.toHaveAttribute("open")
    // I due strumenti finiti di fila stanno in una riga chiusa; quello fallito e quello con le immagini si vedono comunque.
    expect(screen.queryByRole("button", { name: /Legge docs\/PIANO\.md/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Ha lavorato · 2 passi/ }))
    expect(screen.getByRole("button", { name: /Legge docs\/PIANO\.md/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Lancia: bun test/ })).toBeInTheDocument()
    expect(screen.getByText("non riuscito")).toBeInTheDocument()
    expect(screen.getByText("Fatto in 1 min 12 s")).toBeInTheDocument()
    // L'esito sta chiuso finché non si apre la riga.
    expect(screen.queryByText(/riga due/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Legge docs\/PIANO\.md/ }))
    expect(screen.getByText(/riga due/)).toBeInTheDocument()
    // L'immagine dello strumento sta nella chat e al clic si apre a tutto schermo.
    const miniatura = screen.getByRole("button", { name: /Ingrandisci/ })
    expect(within(miniatura).getByRole("img")).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=")
    fireEvent.click(miniatura)
    const piena = screen.getByRole("dialog")
    expect(within(piena).getByRole("img")).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=")
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  describe("i passi dell'agente raccolti in una riga", () => {
    const passo = (id: string, comando: string, extra: Record<string, unknown> = {}) => ({ tipo: "strumento" as const, id, nome: "Bash", ingresso: { command: comando }, esito: "ok", ...extra })
    const riga = () => screen.getByRole("button", { name: /Ha lavorato/ })

    it("gli strumenti finiti di fila stanno in una riga chiusa, con il numero dei passi e la durata, che si apre con un clic", async () => {
      await apriConversazione({
        messaggi: [
          claude(
            "m2",
            passo("t1", "bun test", { iniziato: "2026-11-02T10:00:00.000Z", finito: "2026-11-02T10:00:10.000Z" }),
            { tipo: "strumento", id: "t2", nome: "Read", ingresso: { file_path: "a.md" }, esito: "ok", iniziato: "2026-11-02T10:00:10.000Z", finito: "2026-11-02T10:01:08.000Z" },
            { tipo: "testo", testo: "Ecco." },
          ),
        ],
      })
      expect(riga()).toHaveTextContent("Ha lavorato · 2 passi · 1 min 8 s")
      expect(riga()).toHaveAttribute("aria-expanded", "false")
      expect(screen.queryByRole("button", { name: /Lancia: bun test/ })).toBeNull()
      fireEvent.click(riga())
      expect(riga()).toHaveAttribute("aria-expanded", "true")
      expect(screen.getByRole("button", { name: /Lancia: bun test/ })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Legge a\.md/ })).toBeInTheDocument()
      fireEvent.click(riga())
      expect(screen.queryByRole("button", { name: /Lancia: bun test/ })).toBeNull()
    })

    it("un passo solo resta una riga a sé", async () => {
      await apriConversazione({ messaggi: [claude("m2", passo("t1", "bun test"), { tipo: "testo", testo: "Ecco." })] })
      expect(screen.queryByRole("button", { name: /Ha lavorato/ })).toBeNull()
      expect(screen.getByRole("button", { name: /Lancia: bun test/ })).toBeInTheDocument()
    })

    it("lo strumento in corso si vede fuori dal gruppo, e a esito arrivato entra nel gruppo", async () => {
      await apriConversazione({ stato: "lavora", attiva: true, messaggi: [fa("m1", "Controlla"), claude("m2", passo("t1", "uno"), passo("t2", "due"), passo("t3", "tre", { esito: undefined }))] })
      expect(riga()).toHaveTextContent("Ha lavorato · 2 passi")
      expect(screen.getByRole("button", { name: /Lancia: tre/ })).toHaveTextContent("in corso…")
      await manda({ id: "c1", evento: "parte", messaggio: "m2", indice: 2, parte: passo("t3", "tre") })
      expect(riga()).toHaveTextContent("Ha lavorato · 3 passi")
      expect(screen.queryByRole("button", { name: /Lancia: tre/ })).toBeNull()
    })

    it("un passo fallito si vede senza aprire il gruppo", async () => {
      await apriConversazione({ messaggi: [claude("m2", passo("t1", "uno"), passo("t2", "due"), passo("t3", "rm -rf x", { esito: undefined, errore: "permesso negato" }), passo("t4", "quattro"))] })
      expect(riga()).toHaveTextContent("Ha lavorato · 2 passi")
      expect(screen.getByText("non riuscito")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Lancia: rm -rf x/ })).toBeInTheDocument()
    })

    it("una richiesta di permesso o una domanda a scelta resta fuori dal gruppo, sempre", async () => {
      const permesso = { id: "r1", tipo: "permesso" as const, strumento: "Bash", ingresso: { command: "ls" }, frase: "Claude vuole lanciare: ls" }
      const domanda = { id: "r2", tipo: "domanda" as const, domande: [{ domanda: "Quale tono?", opzioni: [{ etichetta: "Serio" }, { etichetta: "Ironico" }] }] }
      await apriConversazione({ stato: "aspetta", attiva: true, in_attesa: [permesso, domanda], messaggi: [claude("m2", passo("t1", "uno"), passo("t2", "due"), { tipo: "strumento", id: "t3", nome: "AskUserQuestion", ingresso: {} })] })
      expect(riga()).toHaveTextContent("Ha lavorato · 2 passi")
      expect(screen.getByRole("button", { name: "Consenti" })).toBeInTheDocument()
      expect(screen.getByText("Quale tono?")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Ti fa una domanda/ })).toBeInTheDocument()
    })

    it("la scheda di un lavoro in coda non si nasconde nel gruppo", async () => {
      await apriConversazione({ messaggi: [claude("m1", passo("t1", "uno"), passo("t2", "due"), { tipo: "strumento", id: "t3", nome: "mcp__video__lavoro", ingresso: { slug: "orto-balcone", comando: "monta" }, esito: "Messo in coda (id 7)" })] })
      expect(riga()).toHaveTextContent("Ha lavorato · 2 passi")
      expect(screen.getByRole("button", { name: /Video · lavoro monta orto-balcone/ })).toBeInTheDocument()
    })
  })

  it("una conversazione caduta dice l'errore una volta sola, nel giro che è finito male", async () => {
    await apriConversazione({ stato: "errore", messaggi: [claude("m1", { tipo: "fine", durata_ms: 0, errore: "Mango Code ha chiuso il collegamento: riscrivi il messaggio." })] })
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.getByRole("alert")).toHaveTextContent("Si è fermato: Mango Code ha chiuso il collegamento: riscrivi il messaggio.")
  })

  it("la fine con un errore lo dice in chiaro", async () => {
    await apriConversazione({ messaggi: [claude("m1", { tipo: "fine", durata_ms: 3000, errore: "il limite di richieste è finito" })] })
    expect(screen.getByRole("alert")).toHaveTextContent("Si è fermato: il limite di richieste è finito")
  })

  it("il testo che arriva a pezzi sostituisce la stessa parte e cresce senza raddoppiare", async () => {
    await apriConversazione({ stato: "lavora", attiva: true, messaggi: [fa("m1", "Ciao"), claude("m2", { tipo: "testo", testo: "Sto" })] })
    await manda({ id: "c1", evento: "parte", messaggio: "m2", indice: 0, parte: { tipo: "testo", testo: "Sto guardando" } })
    await manda({ id: "c1", evento: "parte", messaggio: "m2", indice: 0, parte: { tipo: "testo", testo: "Sto guardando il piano del video." } })
    await screen.findByText("Sto guardando il piano del video.")
    expect(screen.getAllByText(/Sto guardando/)).toHaveLength(1)
  })

  it("uno strumento si aggiorna al suo posto quando arriva l'esito", async () => {
    await apriConversazione({ stato: "lavora", attiva: true, messaggi: [claude("m2", { tipo: "strumento", id: "t1", nome: "Bash", ingresso: { command: "bun test" } })] })
    expect(screen.getByText("in corso…")).toBeInTheDocument()
    await manda({ id: "c1", evento: "parte", messaggio: "m2", indice: 0, parte: { tipo: "strumento", id: "t1", nome: "Bash", ingresso: { command: "bun test" }, esito: "ok" } })
    expect(screen.queryByText("in corso…")).toBeNull()
    expect(screen.getAllByRole("button", { name: /Lancia: bun test/ })).toHaveLength(1)
  })

  it("un messaggio nuovo del creator arrivato dal server toglie quello «in coda» e resta uno solo", async () => {
    await apriConversazione({ stato: "lavora", attiva: true, messaggi: [claude("m1", { tipo: "testo", testo: "Lavoro." })] })
    rete({ "GET /api/chat/c1": conversazione({ stato: "lavora" }), "POST /api/chat/c1/messaggi": {} })
    const campo = screen.getByRole("textbox", { name: "Messaggio" })
    scrivi(campo, "Fai anche questo")
    invio(campo)
    expect(await screen.findByText("In coda: sarà letto appena finisce.")).toBeInTheDocument()
    await manda({ id: "c1", evento: "messaggio", messaggio: fa("m3", "Fai anche questo") })
    await waitFor(() => expect(screen.queryByText("In coda: sarà letto appena finisce.")).toBeNull())
    expect(screen.getAllByText("Fai anche questo")).toHaveLength(1)
  })

  it("una parte di un messaggio che non si conosce fa rileggere la conversazione", async () => {
    await apriConversazione({ stato: "lavora", attiva: true })
    rete({ "GET /api/chat/c1": conversazione({ stato: "lavora", messaggi: [claude("m7", { tipo: "testo", testo: "Detto mentre non ascoltavo." })] }) })
    await manda({ id: "c1", evento: "parte", messaggio: "m7", indice: 0, parte: { tipo: "testo", testo: "Detto" } })
    expect(await screen.findByText("Detto mentre non ascoltavo.")).toBeInTheDocument()
  })

  it("i nomi dei video e i percorsi nelle risposte sono collegamenti alla vista", async () => {
    await apriConversazione({ messaggi: [claude("m1", { tipo: "testo", testo: "Ho aperto orto-balcone e letto `archivio/video/orto-balcone/scheda.json`." })] })
    expect(await screen.findByRole("link", { name: "orto-balcone" })).toHaveAttribute("href", "#/video/orto-balcone")
    expect(screen.getByRole("link", { name: "archivio/video/orto-balcone/scheda.json" })).toHaveAttribute("href", "#/video/orto-balcone/scheda")
  })

  it("segue il testo in fondo solo se chi legge è già in fondo", async () => {
    await apriConversazione({ stato: "lavora", attiva: true, messaggi: [claude("m1", { tipo: "testo", testo: "uno" })] })
    const area = screen.getByRole("log", { name: "La conversazione" })
    let altezza = 1000
    Object.defineProperty(area, "scrollHeight", { configurable: true, get: () => altezza })
    Object.defineProperty(area, "clientHeight", { configurable: true, get: () => 100 })
    area.scrollTop = 900
    fireEvent.scroll(area)
    altezza = 1400
    await manda({ id: "c1", evento: "parte", messaggio: "m1", indice: 0, parte: { tipo: "testo", testo: "uno due" } })
    await waitFor(() => expect(area.scrollTop).toBe(1400))
    // Salito a rileggere: il testo nuovo non lo riporta giù, e compare «Vai in fondo».
    area.scrollTop = 200
    fireEvent.scroll(area)
    altezza = 1800
    await manda({ id: "c1", evento: "parte", messaggio: "m1", indice: 0, parte: { tipo: "testo", testo: "uno due tre" } })
    await screen.findByText("uno due tre")
    expect(area.scrollTop).toBe(200)
    fireEvent.click(screen.getByRole("button", { name: "Vai in fondo" }))
    expect(area.scrollTop).toBe(1800)
  })
})

describe("le richieste", () => {
  const permesso: Richiesta = { id: "r1", tipo: "permesso", strumento: "Bash", ingresso: { command: "rm -rf lavoro" }, frase: "Vuole lanciare: rm -rf lavoro" }

  it("un permesso dice cosa vuole fare e risponde «Consenti»", async () => {
    await apriConversazione({ stato: "aspetta", attiva: true, in_attesa: [permesso] })
    rete({ "GET /api/chat/c1": conversazione({ stato: "aspetta", in_attesa: [permesso] }), "POST /api/chat/c1/risposte/r1": {} })
    expect(screen.getByText("Vuole lanciare: rm -rf lavoro")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Consenti" }))
    await waitFor(() => expect(screen.queryByText("Vuole lanciare: rm -rf lavoro")).toBeNull())
    expect(chiamate.find((c) => c.percorso === "/api/chat/c1/risposte/r1")?.corpo).toEqual({ scelta: "consenti" })
  })

  it("«Consenti sempre» e «No» col motivo", async () => {
    rete({ "GET /api/chat/c1": conversazione({ stato: "aspetta", in_attesa: [permesso, { ...permesso, id: "r2" }] }), "POST /api/chat/c1/risposte/r1": {}, "POST /api/chat/c1/risposte/r2": {} })
    negozio.apri("c1")
    render(<PannelloChat />)
    await screen.findAllByRole("button", { name: "Consenti sempre" })
    fireEvent.click(screen.getAllByRole("button", { name: "Consenti sempre" })[0]!)
    await waitFor(() => expect(chiamate.find((c) => c.percorso === "/api/chat/c1/risposte/r1")?.corpo).toEqual({ scelta: "sempre" }))
    scrivi(screen.getByRole("textbox", { name: "Perché no (facoltativo)" }), "meglio una copia")
    fireEvent.click(screen.getByRole("button", { name: "No" }))
    await waitFor(() => expect(chiamate.find((c) => c.percorso === "/api/chat/c1/risposte/r2")?.corpo).toEqual({ scelta: "no", motivo: "meglio una copia" }))
  })

  it("se il server rifiuta la risposta, la richiesta resta e dice perché", async () => {
    await apriConversazione({ stato: "aspetta", attiva: true, in_attesa: [permesso] })
    rete({ "GET /api/chat/c1": conversazione({ stato: "aspetta", in_attesa: [permesso] }), "POST /api/chat/c1/risposte/r1": () => errore(409, "Questa richiesta ha già avuto risposta.") })
    fireEvent.click(screen.getByRole("button", { name: "No" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Questa richiesta ha già avuto risposta.")
    expect(screen.getByRole("button", { name: "Consenti" })).toBeEnabled()
  })

  it("se il server non ha più la richiesta, la conversazione si rilegge e la richiesta sparisce", async () => {
    await apriConversazione({ stato: "aspetta", attiva: true, in_attesa: [permesso] })
    rete({ "GET /api/chat/c1": conversazione({ stato: "lavora" }), "POST /api/chat/c1/risposte/r1": () => errore(404, "Questa richiesta non c'è più.") })
    fireEvent.click(screen.getByRole("button", { name: "Consenti" }))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Consenti" })).toBeNull())
  })

  it("una richiesta che arriva da un evento compare subito, con la conversazione che aspetta", async () => {
    await apriConversazione({ stato: "lavora", attiva: true })
    await manda({ id: "c1", evento: "richiesta", richiesta: permesso })
    expect(await screen.findByRole("button", { name: "Consenti" })).toBeInTheDocument()
    expect(screen.getByText("Aspetta una tua risposta")).toBeInTheDocument()
  })

  it("quando la richiesta ha avuto risposta (da qui o da un altro posto) sparisce", async () => {
    await apriConversazione({ stato: "aspetta", attiva: true, in_attesa: [permesso] })
    expect(screen.getByRole("button", { name: "Consenti" })).toBeInTheDocument()
    await manda({ id: "c1", evento: "risposta", richiesta: "r1" })
    expect(screen.queryByRole("button", { name: "Consenti" })).toBeNull()
  })

  it("le domande: opzioni come bottoni con la descrizione, «Altro» col testo, più domande e un invio solo", async () => {
    const domanda: Richiesta = {
      id: "q1",
      tipo: "domanda",
      domande: [
        { domanda: "Quale quadro?", intestazione: "Quadro", opzioni: [{ etichetta: "Sagoma", descrizione: "La tua sagoma a tutta larghezza" }, { etichetta: "Girato pieno", descrizione: "Solo tu che parli" }] },
        { domanda: "Quali slide?", intestazione: "Slide", multipla: true, opzioni: [{ etichetta: "Prima" }, { etichetta: "Ultima" }] },
      ],
    }
    await apriConversazione({ stato: "aspetta", attiva: true, in_attesa: [domanda] })
    rete({ "GET /api/chat/c1": conversazione({ stato: "aspetta", in_attesa: [domanda] }), "POST /api/chat/c1/risposte/q1": {} })
    expect(screen.getByText("La tua sagoma a tutta larghezza")).toBeInTheDocument()
    const invia = screen.getByRole("button", { name: "Invia le risposte" })
    expect(invia).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: /Sagoma/ }))
    expect(invia).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: /Prima/ }))
    fireEvent.click(screen.getByRole("button", { name: /Ultima/ }))
    // Altro, nella seconda domanda, vuoto non basta; scritto si aggiunge alle scelte.
    fireEvent.click(screen.getAllByRole("button", { name: /Altro/ })[1]!)
    expect(invia).toBeDisabled()
    scrivi(screen.getByRole("textbox", { name: "Altro: Quali slide?" }), "la quinta")
    expect(invia).toBeEnabled()
    fireEvent.click(invia)
    await waitFor(() => expect(chiamate.find((c) => c.percorso === "/api/chat/c1/risposte/q1")).toBeDefined())
    expect(chiamate.find((c) => c.percorso === "/api/chat/c1/risposte/q1")?.corpo).toEqual({ scelta: { risposte: { "Quale quadro?": "Sagoma", "Quali slide?": "Prima, Ultima, la quinta" } } })
  })

  it("una domanda a scelta singola: cambiare opzione sostituisce la scelta, «Altro» scrive la risposta", async () => {
    const domanda: Richiesta = { id: "q2", tipo: "domanda", domande: [{ domanda: "Come la chiamo?", opzioni: [{ etichetta: "Corta" }, { etichetta: "Lunga" }] }] }
    await apriConversazione({ stato: "aspetta", attiva: true, in_attesa: [domanda] })
    rete({ "GET /api/chat/c1": conversazione({ stato: "aspetta", in_attesa: [domanda] }), "POST /api/chat/c1/risposte/q2": {} })
    fireEvent.click(screen.getByRole("button", { name: /Corta/ }))
    fireEvent.click(screen.getByRole("button", { name: /Lunga/ }))
    expect(screen.getByRole("button", { name: /Corta/ })).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(screen.getByRole("button", { name: /Altro/ }))
    scrivi(screen.getByRole("textbox", { name: "Altro: Come la chiamo?" }), "Media")
    fireEvent.click(screen.getByRole("button", { name: "Invia la risposta" }))
    await waitFor(() => expect(chiamate.find((c) => c.percorso === "/api/chat/c1/risposte/q2")?.corpo).toEqual({ scelta: { risposte: { "Come la chiamo?": "Media" } } }))
  })
})

describe("l'etichetta del motore", () => {
  it("la testata di una conversazione di Mango Code dice Mango Code, e lo legge dal dato del motore", async () => {
    await apriDiMango()
    const testata = screen.getByRole("banner")
    expect(within(testata).getByText("Mango Code").closest("[data-motore]")).toHaveAttribute("data-motore", "mango-code")
  })

  it("la testata di una conversazione di Claude non porta né il nome né il segno di Claude, in nessuna lingua", async () => {
    await apriConversazione()
    const testata = screen.getByRole("banner")
    expect(testata.querySelector("[data-motore]")).toBeNull()
    expect(tuttoIlTesto(testata)).not.toMatch(/Claude/)
    expect(testata.querySelectorAll("svg path[d^='M12.0 9.6']")).toHaveLength(0)
  })

  it("un altro motore cambia l'etichetta da solo", () => {
    render(<EtichettaMotore motore={{ id: "altro", nome: "Un altro motore", corto: "Altro", icona: "chat" }} />)
    expect(screen.getByText("Un altro motore")).toBeInTheDocument()
    expect(screen.queryByText("Claude Code")).toBeNull()
  })

  it("il motore di Claude non ha il segno nella testata: l'etichetta non scrive niente", () => {
    const { container } = render(<EtichettaMotore motore={MOTORE_CHAT} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("una conversazione con un modello di Mango Code dice Mango Code", () => {
    expect(motoreDi("mango-code/toq")).toMatchObject({ id: "mango-code", nome: "Mango Code" })
    expect(motoreDi("opus")).toBe(MOTORE_CHAT)
    expect(motoreDi(null)).toBe(MOTORE_CHAT)
  })
})

describe("il modello e l'effort", () => {
  const menu = (nome: "Modello" | "Effort") => screen.getByLabelText(nome) as HTMLSelectElement
  const nomi = (select: HTMLSelectElement) => [...select.options].map((o) => o.textContent)

  it("due menu nella testata, con i nomi per il creator: i modelli dell'elenco e i livelli che il modello ha", async () => {
    await apriConversazione({ modello: "opus", effort: "high" })
    expect(nomi(menu("Modello"))).toEqual(["Predefinito (Sonnet 5.5)", "Opus 5.5", "Opus 4.6", "Haiku 4.5"])
    expect(menu("Modello").value).toBe("opus")
    expect(nomi(menu("Effort"))).toEqual(["Predefinito", "Basso", "Medio", "Alto", "Molto alto", "Massimo"])
    expect(menu("Effort").value).toBe("high")
    // I menu stanno nella testata, non nel campo di testo.
    expect(menu("Modello").closest("header")).not.toBeNull()
  })

  describe("l'elenco lungo", () => {
    const LUNGO: ModelloChat[] = [
      ...MODELLI,
      { id: "sonnet", nome: "Sonnet 4.6", descrizione: "", effort: [...TUTTI], reale: "claude-sonnet-4-6" },
      { id: "claude-opus-4-1", nome: "Opus 4.1", descrizione: "", effort: [], reale: "claude-opus-4-1" },
      { id: "claude-haiku-3-5", nome: "Haiku 3.5", descrizione: "", effort: [], reale: "claude-haiku-3-5" },
    ]

    it("mostra «Predefinito» e i tre modelli più recenti; gli altri si aprono con «Altri…» e restano raggiungibili", async () => {
      await apriConversazione({ modello: "opus" }, { "GET /api/chat/modelli": LUNGO })
      expect(nomi(menu("Modello"))).toEqual(["Predefinito (Sonnet 5.5)", "Opus 5.5", "Opus 4.6", "Sonnet 4.6", "Altri…"])
      fireEvent.change(menu("Modello"), { target: { value: [...menu("Modello").options].find((o) => o.textContent === "Altri…")!.value } })
      expect(nomi(menu("Modello"))).toEqual(["Predefinito (Sonnet 5.5)", "Opus 5.5", "Opus 4.6", "Sonnet 4.6", "Haiku 4.5", "Opus 4.1", "Haiku 3.5"])
      expect(menu("Modello").querySelector("optgroup")?.label).toBe("Altri")
      expect(menu("Modello").value).toBe("opus")
      expect(chiamate.some((c) => c.percorso === "/api/chat/c1/impostazioni")).toBe(false)
    })

    it("il modello scelto che sta fra gli «Altri» resta visibile e selezionato, con gli altri già aperti", async () => {
      await apriConversazione({ modello: "claude-opus-4-1" }, { "GET /api/chat/modelli": LUNGO })
      expect(menu("Modello").value).toBe("claude-opus-4-1")
      expect(nomi(menu("Modello"))).toContain("Opus 4.1")
      expect(nomi(menu("Modello"))).not.toContain("Altri…")
    })
  })

  it("il modello vero che Claude Code ha acceso trova la sua riga; senza scelta si vede «Predefinito»", async () => {
    await apriConversazione({ modello: "claude-opus-5-5", effort: null })
    expect(menu("Modello").value).toBe("opus")
    expect(menu("Effort").value).toBe("")
  })

  it("quando Mango Code si accende, il menu di una conversazione nuova rilegge i modelli all'evento del server", async () => {
    rete()
    render(<PannelloChat />)
    await screen.findByLabelText("Modello")
    await assesta()
    expect(nomi(menu("Modello"))).not.toContain("Mango Code · TOQ")
    rete({ "GET /api/chat/modelli": [...MODELLI, { id: "mango-code/toq", nome: "Mango Code · TOQ", descrizione: "", effort: [], reale: "mango-code/toq" }] })
    await act(() => eventi.istanze.at(-1)!.manda({ tipo: "modelli" }))
    await waitFor(() => expect(nomi(menu("Modello"))).toContain("Mango Code · TOQ"))
  })

  it("scegliere un modello a conversazione aperta lo manda al server e lo ricorda per le nuove", async () => {
    await apriConversazione({ modello: "default" })
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/c1/impostazioni": { modello: "opus", effort: null } })
    fireEvent.change(menu("Modello"), { target: { value: "opus" } })
    await waitFor(() => expect(menu("Modello").value).toBe("opus"))
    expect(chiamate.find((c) => c.percorso === "/api/chat/c1/impostazioni")?.corpo).toEqual({ modello: "opus" })
    expect(JSON.parse(localStorage.getItem("mango-animation.chat.impostazioni") ?? "null")).toEqual({ modello: "opus", effort: null })
  })

  it("l'effort: si sceglie fra i livelli del modello; se il server ne cambia un altro, i menu seguono il server", async () => {
    await apriConversazione({ modello: "opus", effort: "xhigh" })
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/c1/impostazioni": (c: { corpo: unknown }) => ((c.corpo as { modello?: string }).modello ? { modello: "claude-opus-4-6", effort: null } : { modello: "opus", effort: "max" }) })
    fireEvent.change(menu("Effort"), { target: { value: "max" } })
    await waitFor(() => expect(menu("Effort").value).toBe("max"))
    expect(chiamate.find((c) => c.percorso === "/api/chat/c1/impostazioni")?.corpo).toEqual({ effort: "max" })
    fireEvent.change(menu("Modello"), { target: { value: "claude-opus-4-6" } })
    await waitFor(() => expect(menu("Effort").value).toBe(""))
    expect(nomi(menu("Effort"))).toEqual(["Predefinito", "Basso", "Medio", "Alto", "Massimo"])
  })

  it("un modello senza livelli non mostra il menu dell'effort", async () => {
    await apriConversazione({ modello: "claude-haiku-4-5-20251001" })
    expect(screen.queryByLabelText("Effort")).toBeNull()
    expect(menu("Modello").value).toBe("claude-haiku-4-5-20251001")
  })

  it("un cambio che il server rifiuta si dice, e i menu restano com'erano", async () => {
    await apriConversazione({ modello: "opus" })
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/c1/impostazioni": () => errore(502, "Claude Code non ha accettato il cambio: modello non disponibile") })
    fireEvent.change(menu("Modello"), { target: { value: "claude-opus-4-6" } })
    expect(await screen.findByText("Claude Code non ha accettato il cambio: modello non disponibile")).toBeInTheDocument()
    expect(menu("Modello").value).toBe("opus")
    expect(localStorage.getItem("mango-animation.chat.impostazioni")).toBeNull()
  })

  it("l'evento del server aggiorna i menu", async () => {
    await apriConversazione({ modello: "default" })
    await manda({ id: "c1", evento: "impostazioni", modello: "opus", effort: "low" })
    expect(menu("Modello").value).toBe("opus")
    expect(menu("Effort").value).toBe("low")
    await manda({ id: "altra", evento: "impostazioni", modello: "claude-opus-4-6", effort: null })
    expect(menu("Modello").value).toBe("opus")
  })

  it("una conversazione nuova parte con l'ultima scelta, e la manda alla creazione", async () => {
    localStorage.setItem("mango-animation.chat.impostazioni", JSON.stringify({ modello: "opus", effort: "high" }))
    negozio.apri(null)
    rete({ "POST /api/chat": { id: "c9" }, "GET /api/chat/c9": conversazione({ id: "c9", attiva: true, stato: "lavora", modello: "opus", effort: "high", messaggi: [fa("m1", "Ciao")] }) })
    render(<PannelloChat />)
    await waitFor(() => expect(menu("Modello").value).toBe("opus"))
    expect(menu("Effort").value).toBe("high")
    const campo = screen.getByRole("textbox", { name: "Messaggio" })
    scrivi(campo, "Ciao")
    invio(campo)
    await waitFor(() => expect(chiamate.find((c) => c.metodo === "POST" && c.percorso === "/api/chat")).toBeDefined())
    expect(chiamate.find((c) => c.metodo === "POST" && c.percorso === "/api/chat")?.corpo).toMatchObject({ testo: "Ciao", modello: "opus", effort: "high" })
  })

  it("scegliere su una conversazione nuova non chiama il server; cambiando modello l'effort che non ha torna al predefinito", async () => {
    negozio.apri(null)
    rete()
    render(<PannelloChat />)
    await screen.findByLabelText("Modello")
    fireEvent.change(menu("Effort"), { target: { value: "xhigh" } })
    await waitFor(() => expect(menu("Effort").value).toBe("xhigh"))
    fireEvent.change(menu("Modello"), { target: { value: "claude-opus-4-6" } })
    await waitFor(() => expect(menu("Effort").value).toBe(""))
    expect(chiamate.some((c) => c.metodo === "POST")).toBe(false)
    expect(JSON.parse(localStorage.getItem("mango-animation.chat.impostazioni") ?? "null")).toEqual({ modello: "claude-opus-4-6", effort: null })
  })

  it("un modello ricordato che non c'è più non blocca la conversazione nuova", async () => {
    localStorage.setItem("mango-animation.chat.impostazioni", JSON.stringify({ modello: "vecchio-modello", effort: "high" }))
    negozio.apri(null)
    rete()
    render(<PannelloChat />)
    await waitFor(() => expect(negozio.leggi().modello).toBe("default"))
    expect(menu("Modello").value).toBe("default")
  })

  it("se l'elenco non si legge lo dice e si può riprovare", async () => {
    // Una copia nuova dell'elenco: quella degli altri casi l'ha già letto.
    vi.resetModules()
    const { scegliLingua } = await import("../src/lingua")
    scegliLingua("it")
    const { PannelloChat: Pannello } = await import("../src/chat/PannelloChat")
    let riuscito = false
    rete({ "GET /api/chat/modelli": () => (riuscito ? MODELLI : errore(502, "Claude Code non risponde.")) })
    render(<Pannello />)
    expect(await screen.findByText(/I modelli non si leggono: Claude Code non risponde\./)).toBeInTheDocument()
    riuscito = true
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }))
    await waitFor(() => expect(menu("Modello")).toBeEnabled())
  })
})

describe("il campo di testo", () => {
  it("Invio manda, Maiusc+Invio va a capo; il primo messaggio crea la conversazione e porta il contesto", async () => {
    window.location.hash = "#/video/carosello-orto/slide"
    rete({
      "GET /api/video/carosello-orto": { ...dettaglioDiProva(), slug: "carosello-orto", piano: null, scheda: { titolo: "Il carosello dell'orto", stato: "proposta", creato: "2026-10-06", formato: "carosello" } },
      "POST /api/chat": { id: "c9" },
      "GET /api/chat/c9": conversazione({ id: "c9", titolo: "Nuova", attiva: true, stato: "lavora", messaggi: [fa("m1", "Scrivi\nle slide")] }),
    })
    render(<PannelloChat />)
    const campo = await screen.findByRole("textbox", { name: "Messaggio" })
    // dove si trova il creator arriva a Claude con il messaggio, ma sopra il campo non si scrive: lo studio lo mostra già
    expect(screen.queryByText(/Sul video|Nella pagina/)).toBeNull()
    expect(screen.queryByRole("group", { name: "Frasi pronte" })).toBeNull()
    scrivi(campo, "Scrivi")
    fireEvent.keyDown(campo, { key: "Enter", shiftKey: true })
    expect(chiamate.some((c) => c.metodo === "POST")).toBe(false)
    scrivi(campo, "Scrivi\nle slide")
    invio(campo)
    await waitFor(() => expect(chiamate.find((c) => c.metodo === "POST" && c.percorso === "/api/chat")).toBeDefined())
    expect(chiamate.find((c) => c.metodo === "POST" && c.percorso === "/api/chat")?.corpo).toEqual({ testo: "Scrivi\nle slide", contesto: { video: "carosello-orto", vista: "Slide" } })
    expect(campo).toHaveValue("")
    await waitFor(() => expect(negozio.leggi().id).toBe("c9"))
    expect(localStorage.getItem("mango-animation.chat.corrente")).toBe("c9")
  })

  it("dal telefono Invio va a capo e si manda col pulsante, e l'aiuto lo dice", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: coarse)", media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    await apriConversazione()
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/c1/messaggi": {} })
    const campo = screen.getByRole("textbox", { name: "Messaggio" })
    expect(screen.getByText("Il pulsante manda, Invio va a capo")).toBeInTheDocument()
    scrivi(campo, "Prima riga")
    const fermato = fireEvent.keyDown(campo, { key: "Enter" })
    expect(fermato).toBe(true)
    expect(chiamate.some((c) => c.metodo === "POST")).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "Manda" }))
    await waitFor(() => expect(chiamate.find((c) => c.percorso === "/api/chat/c1/messaggi")?.corpo).toMatchObject({ testo: "Prima riga" }))
  })

  it("mentre Claude lavora si può mandare (va in coda) e «Ferma» lo interrompe", async () => {
    await apriConversazione({ stato: "lavora", attiva: true, messaggi: [fa("m1", "Monta"), claude("m2", { tipo: "testo", testo: "Monto." })] })
    rete({ "GET /api/chat/c1": conversazione({ stato: "lavora" }), "POST /api/chat/c1/messaggi": {}, "POST /api/chat/c1/ferma": {} })
    const campo = screen.getByRole("textbox", { name: "Messaggio" })
    expect(campo).toBeEnabled()
    scrivi(campo, "E poi la copertina")
    fireEvent.click(screen.getByRole("button", { name: "Manda" }))
    await waitFor(() => expect(chiamate.find((c) => c.percorso === "/api/chat/c1/messaggi")?.corpo).toMatchObject({ testo: "E poi la copertina" }))
    expect(screen.getByText("In coda: sarà letto appena finisce.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Ferma" }))
    await waitFor(() => expect(chiamate.some((c) => c.metodo === "POST" && c.percorso === "/api/chat/c1/ferma")).toBe(true))
  })

  it("un comando che finisce prima che il server risponda al messaggio lascia la conversazione pronta", async () => {
    await apriConversazione({ attiva: true })
    const lavoro = { ms: 0, da: null }
    // Un comando locale (/rename) finisce in pochi millisecondi: gli eventi arrivano prima della risposta alla POST.
    rete({
      "GET /api/chat/c1": conversazione({ attiva: true }),
      "POST /api/chat/c1/messaggi": () => {
        eventi.istanze.at(-1)!.manda({ tipo: "chat", id: "c1", evento: "stato", stato: "lavora", da: "2026-11-02T10:00:00", lavoro })
        eventi.istanze.at(-1)!.manda({ tipo: "chat", id: "c1", evento: "stato", stato: "pronta", lavoro })
        return {}
      },
    })
    scrivi(screen.getByRole("textbox", { name: "Messaggio" }), "/rename prova")
    invio(screen.getByRole("textbox", { name: "Messaggio" }))
    await waitFor(() => expect(chiamate.some((c) => c.percorso === "/api/chat/c1/messaggi")).toBe(true))
    await assesta()
    expect(document.querySelector("[data-stato]")).toHaveAttribute("data-stato", "pronta")
  })

  it("se il messaggio non parte, lo dice e si può riprovare", async () => {
    await apriConversazione()
    let riuscito = false
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/c1/messaggi": () => (riuscito ? {} : errore(500, "Claude Code non risponde.")) })
    scrivi(screen.getByRole("textbox", { name: "Messaggio" }), "Ciao")
    invio(screen.getByRole("textbox", { name: "Messaggio" }))
    expect(await screen.findByText(/Non è partito: Claude Code non risponde\./)).toBeInTheDocument()
    riuscito = true
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }))
    await waitFor(() => expect(screen.queryByText(/Non è partito/)).toBeNull())
    expect(chiamate.filter((c) => c.percorso === "/api/chat/c1/messaggi")).toHaveLength(2)
  })

  it("un'immagine incollata sale al server, si vede in anteprima, si toglie con la x e parte con il messaggio", async () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:anteprima-1", revokeObjectURL: () => undefined }))
    await apriConversazione()
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/allegati": { percorso: "archivio/chat/tmp/foto.png" }, "POST /api/chat/c1/messaggi": {} })
    const campo = screen.getByRole("textbox", { name: "Messaggio" })
    const file = new File(["x"], "schermata.png", { type: "image/png" })
    fireEvent.paste(campo, { clipboardData: { files: [file] } })
    const anteprima = await screen.findByRole("img", { name: "schermata.png" })
    expect(anteprima).toHaveAttribute("src", "blob:anteprima-1")
    const caricamento = chiamate.find((c) => c.percorso === "/api/chat/allegati")
    expect(caricamento?.intestazioni).toMatchObject({ "Content-Type": "image/png", "X-Nome": "schermata.png" })
    expect(caricamento?.corpo).toBe(file)
    await waitFor(() => expect(screen.getByRole("button", { name: "Manda" })).toBeEnabled())
    // La x lo toglie.
    fireEvent.click(screen.getByRole("button", { name: "Togli l'allegato schermata.png" }))
    expect(screen.queryByRole("img", { name: "schermata.png" })).toBeNull()
    fireEvent.paste(campo, { clipboardData: { files: [file] } })
    await screen.findByRole("img", { name: "schermata.png" })
    scrivi(campo, "Che ne pensi?")
    // Mentre il file sale Invio non manda: si aspetta che sia salito.
    await waitFor(() => expect(screen.getByRole("button", { name: "Manda" })).toBeEnabled())
    invio(campo)
    await waitFor(() => expect(chiamate.find((c) => c.percorso === "/api/chat/c1/messaggi")?.corpo).toMatchObject({ testo: "Che ne pensi?", allegati: [{ percorso: "archivio/chat/tmp/foto.png" }] }))
  })

  it("un file trascinato sul pannello diventa un allegato; il nome con gli accenti parte codificato", async () => {
    await apriConversazione()
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/allegati": { percorso: "archivio/chat/tmp/note.txt" } })
    const pannello = screen.getByRole("complementary", { name: "Chat" })
    const file = new File(["ciao"], "città—note.txt", { type: "text/plain" })
    fireEvent.drop(pannello, { dataTransfer: { types: ["Files"], files: [file] } })
    expect(await screen.findByText("città—note.txt")).toBeInTheDocument()
    expect(chiamate.find((c) => c.percorso === "/api/chat/allegati")?.intestazioni["X-Nome"]).toBe("citt%C3%A0%E2%80%94note.txt")
  })

  it("un allegato da solo basta: il messaggio parte senza testo", async () => {
    await apriConversazione()
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/allegati": { percorso: ".chat/allegati/foto.png" }, "POST /api/chat/c1/messaggi": {} })
    fireEvent.drop(screen.getByRole("complementary", { name: "Chat" }), { dataTransfer: { types: ["Files"], files: [new File(["x"], "foto.png", { type: "image/png" })] } })
    await screen.findByRole("button", { name: "Togli l'allegato foto.png" })
    await waitFor(() => expect(screen.getByRole("button", { name: "Manda" })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: "Manda" }))
    await waitFor(() => expect(chiamate.find((c) => c.percorso === "/api/chat/c1/messaggi")?.corpo).toEqual({ allegati: [{ percorso: ".chat/allegati/foto.png" }], contesto: { vista: "Elenco dei video" } }))
  })

  it("un allegato che non sale lo dice e non blocca il messaggio", async () => {
    await apriConversazione()
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/allegati": () => errore(413, "Il file è troppo grande.") })
    fireEvent.drop(screen.getByRole("complementary", { name: "Chat" }), { dataTransfer: { types: ["Files"], files: [new File(["x"], "grande.mov", { type: "video/quicktime" })] } })
    expect(await screen.findByText(/Non caricato: Il file è troppo grande\./)).toBeInTheDocument()
    scrivi(screen.getByRole("textbox", { name: "Messaggio" }), "Ciao")
    expect(screen.getByRole("button", { name: "Manda" })).toBeEnabled()
  })

  it("un file trascinato oltre i 16 MB non sale: dice di incollarlo, così si collega senza copiarlo", async () => {
    await apriConversazione()
    rete({ "GET /api/chat/c1": conversazione() })
    const grande = new File(["x"], "ripresa.mov", { type: "video/quicktime" })
    Object.defineProperty(grande, "size", { value: 16 * 1024 ** 2 + 1 })
    fireEvent.drop(screen.getByRole("complementary", { name: "Chat" }), { dataTransfer: { types: ["Files"], files: [grande] } })
    expect(await screen.findByText(/Non caricato: è più di 16 MB\. Copialo in Esplora risorse e incollalo qui con Ctrl\+V: si collega senza copiarlo\./)).toBeInTheDocument()
    expect(chiamate.some((c) => c.percorso === "/api/chat/allegati")).toBe(false)
  })
})

describe("la bozza", () => {
  it("ciò che è scritto e non mandato resta se la chat si chiude e si riapre", async () => {
    rete()
    const { unmount } = render(<PannelloChat />)
    scrivi(await screen.findByRole("textbox", { name: "Messaggio" }), "una cosa a metà")
    unmount()
    render(<PannelloChat />)
    expect(await screen.findByRole("textbox", { name: "Messaggio" })).toHaveValue("una cosa a metà")
    await assesta()
  })
})

describe("i lavori dentro la conversazione", () => {
  it("un lavoro messo in coda da Claude si vede come scheda viva, con stima e «Ferma»", async () => {
    const ora = new Date().toISOString()
    rete({
      "GET /api/lavori": { in_corso: { id: "7", slug: "orto-balcone", comando: "monta", iniziato: ora, stima: 240, fine_prevista: "2026-11-02T15:42:00", righe: ["fotogramma 120"] }, in_coda: [], finiti: [] },
      "DELETE /api/lavori/7": {},
      "GET /api/chat/c1": conversazione({ stato: "lavora", attiva: true, messaggi: [claude("m1", { tipo: "strumento", id: "t1", nome: "mcp__video__lavoro", ingresso: { slug: "orto-balcone", comando: "monta" }, esito: '{"id":"7"}' })] }),
    })
    negozio.apri("c1")
    render(<PannelloChat />)
    const scheda = await screen.findByRole("group", { name: "Lavoro: Montaggio" })
    expect(scheda).toHaveTextContent("Montaggio · L'orto sul balcone")
    expect(scheda).toHaveTextContent(/circa 4 min, finisce verso le 15:42/)
    expect(within(scheda).getByRole("progressbar")).toBeInTheDocument()
    fireEvent.click(within(scheda).getByRole("button", { name: "Ferma" }))
    await waitFor(() => expect(chiamate.some((c) => c.metodo === "DELETE" && c.percorso === "/api/lavori/7")).toBe(true))
  })

  it("un lavoro finito resta nella conversazione con il suo esito", async () => {
    rete({
      "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [{ id: "7", slug: "orto-balcone", comando: "monta", iniziato: "2026-11-02T10:00:00", finito: "2026-11-02T10:03:30", esito: "riuscito" }] },
      "GET /api/chat/c1": conversazione({ messaggi: [claude("m1", { tipo: "strumento", id: "t1", nome: "mcp__video__lavoro", ingresso: { slug: "orto-balcone", comando: "monta" }, esito: "Messo in coda (id 7)" })] }),
    })
    negozio.apri("c1")
    render(<PannelloChat />)
    expect(await screen.findByRole("group", { name: "Lavoro: Montaggio" })).toHaveTextContent("Finito in 3 min 30 s")
  })
})

describe("i lavori in background", () => {
  const fa_ = (secondi: number) => new Date(Date.now() - secondi * 1000).toISOString()
  const task = (id: string, background: boolean, extra: object = {}) => ({ id, tipo: "comando" as const, descrizione: `Esporta ${id}`, iniziato: fa_(65), background, ...extra })

  it("un lavoro in background si vede nella conversazione, da quanto va, e «Ferma» lo ferma", async () => {
    await apriConversazione({ task: [task("b1", true)], messaggi: [fa("m1", "Esporta")] })
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/c1/task/b1/ferma": {} })
    const scheda = screen.getByRole("group", { name: "Lavoro in background: Esporta b1" })
    expect(scheda).toHaveTextContent(/In background da 1 min 5 s/)
    fireEvent.click(within(scheda).getByRole("button", { name: "Ferma" }))
    await waitFor(() => expect(chiamate.some((c) => c.metodo === "POST" && c.percorso === "/api/chat/c1/task/b1/ferma")).toBe(true))
  })

  it("la scheda dice quanti token e strumenti il lavoro ha usato, e li aggiorna mentre va", async () => {
    await apriConversazione({ task: [task("a1", true, { tipo: "agente", uso: { token: 12_400, strumenti: 18 } })], messaggi: [fa("m1", "Cerca")] })
    const scheda = screen.getByRole("group", { name: "Lavoro in background: Esporta a1" })
    expect(scheda).toHaveTextContent("Sottoagente · In background da 1 min 5 s · 12,4k token · 18 strumenti")
    await manda({ id: "c1", evento: "task", task: [task("a1", true, { tipo: "agente", uso: { token: 13_900, strumenti: 19 } })] })
    expect(screen.getByRole("group", { name: "Lavoro in background: Esporta a1" })).toHaveTextContent("13,9k token · 19 strumenti")
  })

  it("un solo strumento è «1 strumento»; senza numeri la scheda non ne scrive", async () => {
    await apriConversazione({ task: [task("a1", true, { tipo: "agente", uso: { token: 820, strumenti: 1 } }), task("b1", true), task("a2", true, { tipo: "agente", uso: { token: 0, strumenti: 0 } })], messaggi: [fa("m1", "Cerca")] })
    expect(screen.getByRole("group", { name: "Lavoro in background: Esporta a1" })).toHaveTextContent("820 token · 1 strumento")
    expect(screen.getByRole("group", { name: "Lavoro in background: Esporta b1" })).not.toHaveTextContent(/token/)
    expect(screen.getByRole("group", { name: "Lavoro in background: Esporta a2" })).not.toHaveTextContent(/token/)
  })

  it("mentre Claude aspetta un sottoagente, la riga di lavoro mostra anche i suoi numeri", async () => {
    await apriConversazione({ stato: "lavora", attiva: true, lavora_da: fa_(30), task: [task("f1", false, { tipo: "agente", uso: { token: 12_400, strumenti: 18 } }), task("f2", false, { uso: { token: 600, strumenti: 2 } })], messaggi: [fa("m1", "Cerca")] })
    expect(screen.getByRole("status")).toHaveTextContent("13k token · 20 strumenti")
  })

  it("se il server non ferma il lavoro lo dice, e la scheda resta", async () => {
    await apriConversazione({ task: [task("b1", true)] })
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/c1/task/b1/ferma": errore(502, "Claude Code non ha fermato il lavoro: occupato") })
    fireEvent.click(screen.getByRole("button", { name: "Ferma" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Claude Code non ha fermato il lavoro: occupato")
    expect(screen.getByRole("group", { name: "Lavoro in background: Esporta b1" })).toBeInTheDocument()
  })

  it("l'evento «task» fa comparire e sparire le schede; un lavoro che Claude aspetta non ha scheda", async () => {
    await apriConversazione({ messaggi: [fa("m1", "Esporta")] })
    expect(screen.queryByRole("group", { name: /Lavoro in background/ })).toBeNull()
    await manda({ id: "c1", evento: "task", task: [task("b1", true), task("f1", false)] })
    expect(screen.getByRole("group", { name: "Lavoro in background: Esporta b1" })).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Lavoro in background: Esporta f1" })).toBeNull()
    await manda({ id: "c1", evento: "task", task: [] })
    expect(screen.queryByRole("group", { name: /Lavoro in background/ })).toBeNull()
  })

  it("«Manda in background» c'è solo mentre Claude aspetta un lavoro, e lo manda al server", async () => {
    await apriConversazione({ stato: "lavora", attiva: true, lavora_da: fa_(30), task: [], messaggi: [fa("m1", "Monta")] })
    expect(screen.queryByRole("button", { name: /Manda in background/ })).toBeNull()
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/c1/background": {} })
    await manda({ id: "c1", evento: "task", task: [task("f1", false)] })
    fireEvent.click(screen.getByRole("button", { name: /Manda in background/ }))
    await waitFor(() => expect(chiamate.some((c) => c.metodo === "POST" && c.percorso === "/api/chat/c1/background")).toBe(true))
    await manda({ id: "c1", evento: "task", task: [task("f1", true)] })
    expect(screen.queryByRole("button", { name: /Manda in background/ })).toBeNull()
  })

  it("Ctrl+B fa lo stesso, e senza un lavoro da spostare non fa niente (il tasto resta al browser)", async () => {
    await apriConversazione({ stato: "lavora", attiva: true, lavora_da: fa_(30), task: [], messaggi: [fa("m1", "Monta")] })
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/c1/background": {} })
    expect(fireEvent.keyDown(document, { key: "b", ctrlKey: true })).toBe(true)
    expect(chiamate.some((c) => c.percorso === "/api/chat/c1/background")).toBe(false)

    await manda({ id: "c1", evento: "task", task: [task("f1", false)] })
    expect(fireEvent.keyDown(screen.getByRole("textbox", { name: "Messaggio" }), { key: "b", ctrlKey: true })).toBe(false)
    await waitFor(() => expect(chiamate.filter((c) => c.percorso === "/api/chat/c1/background")).toHaveLength(1))
  })

  it("se il server rifiuta, la riga dice perché", async () => {
    await apriConversazione({ stato: "lavora", attiva: true, lavora_da: fa_(30), task: [task("f1", false)] })
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/c1/background": errore(409, "Claude non sta eseguendo niente in primo piano.") })
    fireEvent.click(screen.getByRole("button", { name: /Manda in background/ }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Claude non sta eseguendo niente in primo piano.")
    // Finito il lavoro in primo piano, la riga non resta.
    await manda({ id: "c1", evento: "task", task: [] })
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })

  it("il messaggio in coda dice come farlo arrivare subito, solo se c'è un lavoro da spostare", async () => {
    await apriConversazione({ stato: "lavora", attiva: true, lavora_da: fa_(30), task: [task("f1", false)], messaggi: [fa("m1", "Monta")] })
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/c1/messaggi": {} })
    scrivi(screen.getByRole("textbox", { name: "Messaggio" }), "E la copertina")
    fireEvent.click(screen.getByRole("button", { name: "Manda" }))
    expect(await screen.findByText("In coda: sarà letto quando finisce il lavoro in corso. Con Ctrl+B si legge subito.")).toBeInTheDocument()
    expect(screen.queryByText("In coda: sarà letto appena finisce.")).toBeNull()
  })
})

describe("il contesto usato", () => {
  it("la testata dice quanto è pieno il contesto, e cambia all'evento del server: verso la fine si colora", async () => {
    await apriConversazione({ contesto_usato: { usati: 68_485, totale: 131_072 } })
    const misura = screen.getByRole("meter", { name: "Contesto usato" })
    expect(misura).toHaveTextContent("Contesto 52%")
    expect(misura).toHaveAttribute("aria-valuenow", "52")
    expect(misura).toHaveAttribute("aria-valuetext", "68 mila token su 131 mila, 52%")
    expect(misura).toHaveAttribute("data-livello", "normale")
    expect(misura).not.toHaveTextContent("conversazione nuova")
    expect(misura.title).toContain("68.485 token su 131.072")
    await manda({ id: "c1", evento: "contesto_usato", contesto_usato: { usati: 100_000, totale: 131_072 } })
    expect(misura).toHaveTextContent("Contesto 76% · meglio una conversazione nuova")
    expect(misura).toHaveAttribute("data-livello", "alto")
    await manda({ id: "c1", evento: "contesto_usato", contesto_usato: { usati: 125_000, totale: 131_072 } })
    expect(misura).toHaveAttribute("data-livello", "pieno")
    // L'evento di un'altra conversazione non la tocca.
    await manda({ id: "c2", evento: "contesto_usato", contesto_usato: { usati: 1_000, totale: 131_072 } })
    expect(misura).toHaveTextContent("Contesto 95%")
  })

  it("senza la misura del contesto dice solo i token; senza niente non c'è", async () => {
    await apriConversazione({ contesto_usato: { usati: 146_380, totale: null } })
    expect(screen.queryByRole("meter", { name: "Contesto usato" })).toBeNull()
    expect(screen.getByText("Contesto 146 mila token")).toBeInTheDocument()
    await manda({ id: "c1", evento: "contesto_usato", contesto_usato: { usati: 150_000, totale: 1_000_000 } })
    expect(screen.getByRole("meter", { name: "Contesto usato" })).toHaveTextContent("Contesto 15%")
    // Una misura a zero non è una misura: niente percentuale.
    await manda({ id: "c1", evento: "contesto_usato", contesto_usato: { usati: 150_000, totale: 0 } })
    expect(screen.queryByRole("meter", { name: "Contesto usato" })).toBeNull()
    expect(screen.getByText("Contesto 150 mila token")).toBeInTheDocument()
  })

  it("dopo il riassunto della conversazione il valore vecchio sparisce finché non arriva il nuovo", async () => {
    await apriConversazione({ contesto_usato: { usati: 125_000, totale: 131_072 } })
    expect(screen.getByRole("meter", { name: "Contesto usato" })).toHaveTextContent("Contesto 95%")
    await manda({ id: "c1", evento: "contesto_usato", contesto_usato: null })
    expect(screen.queryByText(/^Contesto/)).toBeNull()
    await manda({ id: "c1", evento: "contesto_usato", contesto_usato: { usati: 9_000, totale: 131_072 } })
    expect(screen.getByRole("meter", { name: "Contesto usato" })).toHaveTextContent("Contesto 7%")
  })

  it("una conversazione che non l'ha ancora detto non mostra il contesto", async () => {
    await apriConversazione()
    expect(screen.queryByText(/^Contesto/)).toBeNull()
  })
})

describe("i tempi nella chat", () => {
  const fa_ = (secondi: number) => new Date(Date.now() - secondi * 1000).toISOString()

  it("mentre Claude lavora un cronometro va avanti, nella conversazione e nella testata", async () => {
    await apriConversazione({ stato: "lavora", attiva: true, lavora_da: fa_(134.5), lavoro: { ms: 0, da: fa_(134.5) }, messaggi: [fa("m1", "Monta")] })
    const stato = screen.getByRole("status")
    expect(stato).toHaveTextContent(/^Sta pensando · 2:1[45]$/)
    expect(screen.getByRole("complementary", { name: "Chat" })).toHaveTextContent(/Sta lavorando · 2:1[45]/)
    const prima = stato.textContent
    await waitFor(() => expect(stato.textContent).not.toBe(prima), { timeout: 2500 })
  })

  it("la riga in fondo conta il passo in corso, non il giro: dalla fine dell'ultimo strumento, o da quando è partito quello in corso", async () => {
    await apriConversazione({
      stato: "lavora",
      attiva: true,
      lavora_da: fa_(600),
      lavoro: { ms: 0, da: fa_(600) },
      messaggi: [fa("m1", "Monta"), claude("m2", { tipo: "strumento", id: "t1", nome: "Bash", ingresso: { command: "bun test" }, esito: "ok", iniziato: fa_(300), finito: fa_(40) })],
    })
    expect(screen.getByRole("status")).toHaveTextContent(/^Sta pensando · 0:4[0-2]$/)
    expect(screen.getByRole("complementary", { name: "Chat" })).toHaveTextContent(/Sta lavorando · 10:0\d/)
    await manda({ id: "c1", evento: "parte", messaggio: "m2", indice: 1, parte: { tipo: "strumento", id: "t2", nome: "Bash", ingresso: { command: "bun run monta" }, iniziato: fa_(5.5) } })
    expect(screen.getByRole("status")).toHaveTextContent(/^Aspetta lo strumento · 0:0[5-7]$/)
  })

  it("l'evento «lavora» con l'istante fa partire il cronometro, e quando finisce sparisce", async () => {
    await apriConversazione({ messaggi: [fa("m1", "Ciao")] })
    expect(screen.queryByRole("status")).toBeNull()
    await manda({ id: "c1", evento: "stato", stato: "lavora", da: fa_(65), lavoro: { ms: 0, da: fa_(65) } })
    expect(await screen.findByRole("status")).toHaveTextContent(/Sta pensando · 1:0[5-7]/)
    await manda({ id: "c1", evento: "stato", stato: "pronta", lavoro: { ms: 66_000, da: null } })
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByText(/Sta lavorando ·/)).toBeNull()
  })

  it("la testata conta il lavoro di tutta la conversazione: riparte da dove era, si ferma mentre aspetta il creator e resta a giro finito", async () => {
    await apriConversazione({ attiva: true, messaggi: [fa("m1", "Ciao")], lavoro: { ms: 125_000, da: null } })
    const chat = screen.getByRole("complementary", { name: "Chat" })
    expect(chat).toHaveTextContent(/Pronta · 2:05/)
    await manda({ id: "c1", evento: "stato", stato: "lavora", da: fa_(10), lavoro: { ms: 125_000, da: fa_(10) } })
    expect(chat).toHaveTextContent(/Sta lavorando · 2:1[5-7]/)
    await manda({ id: "c1", evento: "stato", stato: "aspetta", da: fa_(12), lavoro: { ms: 137_000, da: null } })
    expect(chat).toHaveTextContent(/Aspetta una tua risposta · 2:17/)
    await new Promise((r) => setTimeout(r, 1100))
    expect(chat).toHaveTextContent(/Aspetta una tua risposta · 2:17/)
  })

  it("uno strumento in corso conta da quando è partito; uno finito dice quanto è durato solo se è stato lungo", async () => {
    await apriConversazione({
      stato: "lavora",
      attiva: true,
      lavora_da: fa_(100),
      messaggi: [
        claude(
          "m2",
          { tipo: "strumento", id: "t1", nome: "Bash", ingresso: { command: "bun test" }, esito: "ok", iniziato: "2026-11-02T10:00:00.000Z", finito: "2026-11-02T10:02:05.000Z" },
          { tipo: "strumento", id: "t2", nome: "Read", ingresso: { file_path: "a.md" }, esito: "ok", iniziato: "2026-11-02T10:02:05.000Z", finito: "2026-11-02T10:02:06.000Z" },
          { tipo: "strumento", id: "t3", nome: "Bash", ingresso: { command: "bun run monta" }, iniziato: fa_(42) },
          { tipo: "strumento", id: "t4", nome: "Grep", ingresso: { pattern: "x" }, iniziato: fa_(1) },
        ),
      ],
    })
    const riga = (nome: RegExp) => screen.getByRole("button", { name: nome })
    expect(riga(/Ha lavorato/)).toHaveTextContent("Ha lavorato · 2 passi · 2 min 6 s")
    fireEvent.click(riga(/Ha lavorato/))
    expect(riga(/Lancia: bun test/)).toHaveTextContent("2 min 5 s")
    expect(riga(/Legge a\.md/)).not.toHaveTextContent(/\d s$/)
    expect(riga(/Lancia: bun run monta/)).toHaveTextContent(/in corso · 0:4[2-4]/)
    expect(riga(/Cerca «x»/)).toHaveTextContent("in corso…")
  })

  it("la scheda di un lavoro in coda dice da quanto aspetta e la stima, che ha il risalto", async () => {
    rete({
      "GET /api/lavori": { in_corso: null, in_coda: [{ id: "8", slug: "orto-balcone", comando: "monta", accodato: fa_(75), stima: 240 }], finiti: [] },
      "GET /api/chat/c1": conversazione({ stato: "lavora", attiva: true, messaggi: [claude("m1", { tipo: "strumento", id: "t1", nome: "mcp__video__lavoro", ingresso: { slug: "orto-balcone", comando: "monta" }, esito: '{"id":"8"}' })] }),
    })
    negozio.apri("c1")
    render(<PannelloChat />)
    const scheda = await screen.findByRole("group", { name: "Lavoro: Montaggio" })
    expect(scheda).toHaveTextContent(/In attesa da 1 min 1[5-7] s: la scheda video fa un lavoro alla volta · poi circa 4 min/)
    expect(within(scheda).getByText("circa 4 min").tagName).toBe("MARK")
  })

  it("la stima di un lavoro in corso ha il risalto; senza stima si dice che non si sa", async () => {
    rete({
      "GET /api/lavori": { in_corso: { id: "7", slug: "orto-balcone", comando: "monta", iniziato: fa_(20), stima: 240, fine_prevista: "2026-11-02T15:42:00" }, in_coda: [], finiti: [] },
      "GET /api/chat/c1": conversazione({ stato: "lavora", attiva: true, messaggi: [claude("m1", { tipo: "strumento", id: "t1", nome: "mcp__video__lavoro", ingresso: { slug: "orto-balcone", comando: "monta" }, esito: '{"id":"7"}' })] }),
    })
    negozio.apri("c1")
    render(<PannelloChat />)
    const scheda = await screen.findByRole("group", { name: "Lavoro: Montaggio" })
    expect(within(scheda).getByText(/circa 4 min, finisce verso le 15:42/).tagName).toBe("MARK")
  })
})

describe("le stime nel testo di Claude", () => {
  it("una durata approssimata e un orario sono evidenziati; il resto del testo no", () => {
    render(<Markdown testo="Ci vorranno **circa 3 minuti**: finisce verso le 15:42. Ho trovato 3 video." />)
    const segnati = [...document.querySelectorAll("mark")].map((m) => m.textContent)
    expect(segnati).toEqual(["circa 3 minuti", "verso le 15:42"])
  })

  it("nel codice, in linea o a blocco, niente risalto", () => {
    render(<Markdown testo={"Lancia `sleep circa 3 minuti` e poi:\n\n```\necho tra 2 minuti verso le 15:42\n```"} />)
    expect(document.querySelectorAll("mark")).toHaveLength(0)
  })

  it("anche mentre il testo arriva a pezzi: la stima compare quando è intera", () => {
    const { rerender } = render(<Markdown testo="Ci vorranno circa 3 mi" />)
    expect(document.querySelectorAll("mark")).toHaveLength(0)
    rerender(<Markdown testo="Ci vorranno circa 3 minuti" />)
    expect(document.querySelector("mark")).toHaveTextContent("circa 3 minuti")
  })
})

describe("il pannello", () => {
  it("si apre e si chiude dalla barra e con Ctrl+J, e ricorda la larghezza", async () => {
    window.location.hash = "#/video"
    rete({ "GET /api/registrazione": {}, "GET /api/arrivi": { pronto: false }, "POST /api/arrivi/controlla": {} })
    render(<App />)
    expect(screen.queryByRole("complementary", { name: "Chat" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /^Chat/ }))
    const pannello = await screen.findByRole("complementary", { name: "Chat" })
    expect(screen.getByRole("button", { name: /^Chat/ })).toHaveAttribute("aria-pressed", "true")
    expect(pannello.style.width).toBe("420px")
    // La larghezza si cambia dalla maniglia con le frecce e si ricorda.
    const maniglia = screen.getByRole("separator", { name: "Larghezza della chat" })
    fireEvent.keyDown(maniglia, { key: "ArrowLeft" })
    expect(pannello.style.width).toBe("444px")
    expect(localStorage.getItem("mango-animation.chat.larghezza")).toBe("444")
    fireEvent.keyDown(document, { key: "j", ctrlKey: true })
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Chat" })).toBeNull())
    fireEvent.keyDown(document, { key: "j", ctrlKey: true })
    expect((await screen.findByRole("complementary", { name: "Chat" })).style.width).toBe("444px")
  })

  it("la larghezza non scende sotto il minimo", async () => {
    scegliLarghezzaChat(100, true)
    apriChat()
    rete()
    render(<PannelloChat />)
    expect(screen.getByRole("complementary", { name: "Chat" }).style.width).toBe("320px")
    await assesta()
  })

  it("su un telefono prende tutto lo schermo e ha il bottone per tornare", async () => {
    vi.stubGlobal("innerWidth", 430)
    rete()
    render(<PannelloChat />)
    const pannello = await screen.findByRole("complementary", { name: "Chat" })
    expect(pannello).toHaveAttribute("data-stretta", "true")
    expect(screen.queryByRole("separator")).toBeNull()
    expect(screen.getByRole("button", { name: /Torna alla vista/ })).toBeInTheDocument()
  })

  it("il nuovo e le vecchie conversazioni: si riprende una dall'elenco", async () => {
    rete({
      "GET /api/chat/c1": conversazione({ messaggi: [fa("m1", "Una vecchia domanda")] }),
      "GET /api/chat/modelli": [...MODELLI, { id: "mango-code/toq", nome: "Mango Code · TOQ", descrizione: "", effort: [], reale: "mango-code/toq" }],
    })
    render(<PannelloChat />)
    fireEvent.click(await screen.findByRole("button", { name: /Le slide del carosello/ }))
    expect(await screen.findByText("Una vecchia domanda")).toBeInTheDocument()
    expect(screen.getByText("Le slide del carosello", { selector: "strong" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Nuova conversazione" }))
    expect(await screen.findByRole("heading", { name: "Cosa facciamo?" })).toBeInTheDocument()
    expect(negozio.leggi().id).toBeNull()
    await act(async () => void (await negozio.scegli({ modello: "mango-code/toq" })))
    expect(await screen.findByRole("heading", { name: "Parla con Mango Code" })).toBeInTheDocument()
    expect(screen.queryByText(/Claude Code/)).toBeNull()
  })

  it("una richiesta in attesa si vede sul bottone anche a chat chiusa", async () => {
    window.location.hash = "#/video"
    rete({ "GET /api/registrazione": {}, "GET /api/arrivi": { pronto: false }, "POST /api/arrivi/controlla": {}, "GET /api/chat/c1": conversazione({ stato: "aspetta", in_attesa: [{ id: "r1", tipo: "permesso", strumento: "Bash", ingresso: {}, frase: "x" }] }) })
    negozio.apri("c1")
    render(<App />)
    expect(await screen.findByRole("button", { name: "Chat: aspetta una risposta" })).toBeInTheDocument()
  })
})

const MANGO = "mango-code/toq"
const MODELLO_MANGO: ModelloChat = { id: MANGO, nome: "Mango Code · TOQ", descrizione: "", effort: [], reale: MANGO }

/** Tutto ciò che il creator può leggere o sentire dal lettore di schermo: i testi, le etichette, i segnaposto, i suggerimenti. */
function tuttoIlTesto(el: HTMLElement): string {
  const attributi = [...el.querySelectorAll("*"), el].flatMap((e) => ["aria-label", "placeholder", "title"].flatMap((a) => e.getAttribute(a) ?? []))
  return [el.textContent ?? "", ...attributi].join("\n")
}

async function apriDiMango(dettaglio: Partial<DettaglioConversazione> = {}, modelli: ModelloChat[] = [...MODELLI, MODELLO_MANGO]) {
  rete({ "GET /api/chat/modelli": modelli, "GET /api/chat/c1": conversazione({ modello: MANGO, ...dettaglio }), "POST /api/chat/c1/messaggi": {} })
  negozio.apri("c1")
  render(<PannelloChat />)
  await screen.findByRole("log", { name: "La conversazione" })
  await assesta()
}

describe("i testi dicono con chi si parla", () => {
  it("una conversazione di Mango Code che lavora non nomina Claude: riga di lavoro, campo, coda e messaggi", async () => {
    await apriDiMango({ stato: "lavora", attiva: true, messaggi: [fa("m1", "Elenca i video"), claude("m2", { tipo: "testo", testo: "Guardo." })] })
    expect(screen.getByRole("status")).toHaveTextContent("Mango Code sta pensando…")
    const campo = screen.getByRole("textbox", { name: "Messaggio per Mango Code" })
    expect(campo).toHaveAttribute("placeholder", "Mango Code sta lavorando: scrivi pure, il messaggio va in coda")
    expect(screen.getByRole("article", { name: "Mango Code" })).toBeInTheDocument()
    scrivi(campo, "Poi anche questo")
    invio(campo)
    expect(await screen.findByText("In coda: Mango Code lo legge appena finisce.")).toBeInTheDocument()
    expect(screen.queryByText(/Ctrl\+B/)).toBeNull()
    expect(tuttoIlTesto(screen.getByRole("complementary", { name: "Chat" }))).not.toMatch(/Claude/)
  })

  it("una conversazione di Claude che lavora non ha un nome suo, e che aspetta una risposta non promette la coda", async () => {
    await apriConversazione({ stato: "lavora", attiva: true, messaggi: [fa("m1", "Monta")] })
    expect(screen.getByRole("textbox", { name: "Messaggio" })).toHaveAttribute("placeholder", "Scrivi pure: il messaggio va in coda")
    await manda({ id: "c1", evento: "stato", stato: "aspetta", lavoro: { ms: 0, da: null } })
    expect(screen.getByRole("textbox", { name: "Messaggio" })).toHaveAttribute("placeholder", "Aspetta una tua risposta qui sopra")
    expect(tuttoIlTesto(screen.getByRole("complementary", { name: "Chat" }))).not.toMatch(/Claude/)
  })

  it("le richieste di Mango Code nominano Mango Code", async () => {
    const domanda: Richiesta = { id: "q1", tipo: "domanda", domande: [{ domanda: "Rosso o blu?", opzioni: [{ etichetta: "Rosso" }, { etichetta: "Blu" }] }] }
    const permesso: Richiesta = { id: "p1", tipo: "permesso", strumento: "Bash", ingresso: { command: "ls" }, frase: "Mango Code vuole usare Bash: ls" }
    await apriDiMango({ stato: "aspetta", attiva: true, in_attesa: [domanda, permesso] })
    expect(screen.getByRole("region", { name: "Mango Code ti fa una domanda" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Mango Code chiede il permesso" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Messaggio per Mango Code" })).toHaveAttribute("placeholder", "Mango Code aspetta una tua risposta qui sopra")
    expect(tuttoIlTesto(screen.getByRole("complementary", { name: "Chat" }))).not.toMatch(/Claude/)
  })

  it("il bottone Chat nella barra dice quale dei due sta lavorando o aspetta", async () => {
    rete({ "GET /api/chat/c1": conversazione({ modello: MANGO, stato: "lavora" }) })
    negozio.apri("c1")
    render(<BottoneChat />)
    expect(await screen.findByRole("button", { name: "Chat: Mango Code sta lavorando" })).toBeInTheDocument()
    await manda({ id: "c1", evento: "richiesta", richiesta: { id: "q1", tipo: "domanda", domande: [{ domanda: "A?", opzioni: [{ etichetta: "Sì" }] }] } })
    expect(await screen.findByRole("button", { name: "Chat: Mango Code aspetta una risposta" })).toBeInTheDocument()
  })

  it("finché la conversazione non è aperta, e se non si apre perché Mango Code è spento, non dice nessun motore", async () => {
    rete({ "GET /api/chat/c1": () => errore(502, "Questa conversazione è di Mango Code, che è spento: apri Mango Code per rileggerla.") })
    negozio.apri("c1")
    render(<PannelloChat />)
    const pannello = screen.getByRole("complementary", { name: "Chat" })
    expect(screen.getByRole("textbox", { name: "Messaggio" })).toHaveAttribute("placeholder", "Scrivi un messaggio")
    expect(tuttoIlTesto(pannello)).not.toMatch(/Claude|Mango Code/)
    expect(await screen.findByRole("alert")).toHaveTextContent("Questa conversazione è di Mango Code, che è spento: apri Mango Code per rileggerla.")
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Messaggio" })).toBeInTheDocument()
    expect(screen.queryByText("Claude Code")).toBeNull()
    expect(screen.queryByLabelText("Modello")).toBeNull()
  })

  it("l'invito di una conversazione nuova non offre frasi pronte che non ci sono", async () => {
    rete()
    render(<PannelloChat />)
    expect(await screen.findByText(/Lavora sui tuoi file e monta i video, con il Claude Code installato sul computer/)).toBeInTheDocument()
    expect(screen.queryByText(/frase pronta|lancia i comandi/)).toBeNull()
  })
})

describe("i menu di una conversazione iniziata", () => {
  const menu = (nome: "Modello" | "Effort") => screen.getByLabelText(nome) as HTMLSelectElement
  const nomi = (select: HTMLSelectElement) => [...select.options].map((o) => o.textContent)

  it("una conversazione di Mango Code offre solo i modelli di Mango Code e non ha l'effort", async () => {
    await apriDiMango()
    expect(nomi(menu("Modello"))).toEqual(["Mango Code · TOQ"])
    expect(menu("Modello").value).toBe(MANGO)
    expect(screen.queryByLabelText("Effort")).toBeNull()
  })

  it("una di Claude non offre quelli di Mango Code, una nuova li offre tutti", async () => {
    rete({ "GET /api/chat/modelli": [...MODELLI, MODELLO_MANGO], "GET /api/chat/c1": conversazione({ modello: "opus" }) })
    negozio.apri("c1")
    render(<PannelloChat />)
    await screen.findByRole("log", { name: "La conversazione" })
    await waitFor(() => expect(nomi(menu("Modello"))).toEqual(["Predefinito (Sonnet 5.5)", "Opus 5.5", "Opus 4.6", "Haiku 4.5"]))
    act(() => negozio.apri(null))
    await waitFor(() => expect(nomi(menu("Modello"))).toContain("Mango Code · TOQ"))
    // La scelta fra i due motori: «Claude» c'è solo qui, come titolo del gruppo accanto a «Mango Code».
    expect([...menu("Modello").querySelectorAll("optgroup")].map((g) => g.label)).toEqual(["Claude", "Mango Code"])
  })

  it("con un motore solo il menu non ha gruppi", async () => {
    await apriConversazione({ modello: "opus" })
    expect(menu("Modello").querySelectorAll("optgroup")).toHaveLength(0)
  })

  it("a Mango Code spento il menu dice che è spento, non l'id interno", async () => {
    await apriDiMango({}, MODELLI)
    expect(nomi(menu("Modello"))).toEqual(["Mango Code (spento)"])
    expect(screen.queryByText(/mango-code\//)).toBeNull()
  })

  it("un modello di Mango Code che non è più offerto, con Mango Code acceso, si legge per nome", async () => {
    await apriDiMango({ modello: "mango-code/altro" })
    expect(nomi(menu("Modello"))).toEqual(["Mango Code · altro", "Mango Code · TOQ"])
  })
})

describe("gli strumenti di Mango Code e gli errori di rete", () => {
  it("«LS» elenca i file; uno strumento sconosciuto ha un'etichetta leggibile", () => {
    expect(descriviStrumento("LS", { path: "/x/mango-animation/archivio/video" }).etichetta).toBe("Elenca i file archivio/video")
    expect(descriviStrumento("LS", {}).etichetta).toBe("Elenca i file")
    expect(descriviStrumento("patch", {}).etichetta).toBe("Usa lo strumento «patch»")
  })

  it("un file che non si carica lo dice con le parole del creator", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")))
    await expect(caricaAllegato(new File(["x"], "a.png"))).rejects.toThrow("Mango Animation non risponde. Controlla che sia acceso sul computer e riprova.")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })))
    await expect(caricaAllegato(new File(["x"], "a.png"))).rejects.toThrow("Il file non è stato caricato: riprova.")
  })
})

describe("i permessi", () => {
  it("non c'è una scelta dei permessi: la chat lavora in autonomia", async () => {
    await apriConversazione()
    expect(await screen.findByRole("combobox", { name: "Modello" })).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: "Salta i permessi" })).toBeNull()
  })
})
