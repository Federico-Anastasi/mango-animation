// La chat con più motori: lo studio li prende dal server (`GET /api/chat/motori`) e decide da lì nome, segno, menu e bottoni.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BottoneChat } from "../src/chat/BottoneChat"
import { negozio } from "../src/chat/negozio"
import { chiudiChat } from "../src/chat/pannello"
import { PannelloChat } from "../src/chat/PannelloChat"
import type { DettaglioConversazione, Messaggio, ModelloChat, MotoreChat } from "../src/chat/tipi"
import { scegliLingua } from "../src/lingua"
import { CINQUE, CLAUDE, CODEX, MANGO, MODELLI_CODEX, MODELLO_MANGO, MOTORI_CON_CODEX, livelli, modello } from "./motoriChat"
import { installaEventi, installaRete, type Chiamata } from "./rete"

let chiamate: Chiamata[]
let eventi: ReturnType<typeof installaEventi>

const MODELLI_CLAUDE: ModelloChat[] = [
  modello(CLAUDE, "default", "Predefinito (Sonnet 5.5)", CINQUE, "claude-sonnet-5-5"),
  modello(CLAUDE, "opus", "Opus 5.5", CINQUE, "claude-opus-5-5"),
  modello(CLAUDE, "claude-opus-4-6", "Opus 4.6", livelli("low", "medium", "high", "max")),
  modello(CLAUDE, "claude-haiku-4-5-20251001", "Haiku 4.5"),
]
const TUTTI_I_MODELLI = [...MODELLI_CLAUDE, MODELLO_MANGO, ...MODELLI_CODEX]

const conversazione = (extra: Partial<DettaglioConversazione> = {}): DettaglioConversazione => ({
  id: "c1",
  titolo: "Le slide del carosello",
  attiva: true,
  stato: "pronta",
  lavora_da: null,
  lavoro: { ms: 0, da: null },
  motore: "codex",
  modello: "codex/gpt-6-luna",
  effort: null,
  messaggi: [],
  in_attesa: [],
  task: [],
  contesto_usato: null,
  primo_giro: false,
  ...extra,
})

const fa = (id: string, testo: string): Messaggio => ({ id, ruolo: "utente", quando: "2026-11-02T09:59:00", parti: [{ tipo: "testo", testo }] })
const fra = (secondi: number) => new Date(Date.now() - secondi * 1000).toISOString()
const task = (id: string, background: boolean) => ({ id, tipo: "comando" as const, descrizione: `Esporta ${id}`, iniziato: fra(65), background })

function rete(rotte: Record<string, unknown> = {}) {
  chiamate = installaRete({
    "GET /api/video": [],
    "GET /api/chat": [{ id: "c1", titolo: "Le slide del carosello", aggiornata: "2026-11-02T10:00:00", attiva: true, motore: "codex" }],
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/chat/motori": MOTORI_CON_CODEX,
    "GET /api/chat/modelli": TUTTI_I_MODELLI,
    "GET /api/chat/comandi?motore=codex": [],
    "GET /api/chat/comandi?motore=claude-code": [],
    "GET /api/chat/comandi?motore=mango-code": [],
    "GET /api/chat/c1": conversazione(),
    ...rotte,
  }).chiamate
}

const assesta = () => act(() => new Promise<void>((ok) => setTimeout(ok, 20)))
const menu = (nome: "Modello" | "Effort") => screen.getByLabelText(nome) as HTMLSelectElement
const nomi = (select: HTMLSelectElement) => [...select.options].map((o) => o.textContent)
const gruppi = (select: HTMLSelectElement) => [...select.querySelectorAll("optgroup")].map((g) => g.label)

async function apri(dettaglio: Partial<DettaglioConversazione> = {}, rotte: Record<string, unknown> = {}) {
  rete({ "GET /api/chat/c1": conversazione(dettaglio), ...rotte })
  negozio.apri("c1")
  render(<PannelloChat />)
  await screen.findByRole("log", { name: /La conversazione|The conversation/ })
  await assesta()
}

const conCapacita = (motore: MotoreChat, capacita: Partial<MotoreChat["capacita"]>): MotoreChat => ({ ...motore, capacita: { ...motore.capacita, ...capacita } })

beforeEach(() => {
  eventi = installaEventi()
  window.location.hash = ""
  localStorage.clear()
  sessionStorage.clear()
  scegliLingua("it")
  negozio.apri(null)
  chiudiChat()
})
afterEach(() => vi.unstubAllGlobals())

describe("un terzo motore, preso dal server", () => {
  it("la testata dice il suo nome e il suo segno, e i testi della chat lo nominano", async () => {
    await apri({ stato: "lavora", messaggi: [fa("m1", "Monta"), { id: "m2", ruolo: "claude", quando: "2026-11-02T10:00:00", parti: [{ tipo: "testo", testo: "Guardo." }] }] })
    expect(within(screen.getByRole("banner")).getByText("Codex").closest("[data-motore]")).toHaveAttribute("data-motore", "codex")
    expect(screen.getByRole("status")).toHaveTextContent("Codex sta pensando…")
    expect(screen.getByRole("textbox", { name: "Messaggio per Codex" })).toHaveAttribute("placeholder", "Codex sta lavorando: scrivi pure, il messaggio va in coda")
    expect(screen.getByRole("article", { name: "Codex" })).toBeInTheDocument()
  })

  it("il bottone Chat nella barra lo nomina", async () => {
    rete({ "GET /api/chat/c1": conversazione({ stato: "lavora" }) })
    negozio.apri("c1")
    render(<BottoneChat />)
    expect(await screen.findByRole("button", { name: "Chat: Codex sta lavorando" })).toBeInTheDocument()
  })

  it("la chat nuova di chi ha scelto un suo modello lo invita per nome", async () => {
    localStorage.setItem("mango-animation.chat.impostazioni", JSON.stringify({ modello: "codex/gpt-6-luna", effort: null }))
    negozio.apri(null)
    rete()
    render(<PannelloChat />)
    expect(await screen.findByRole("heading", { name: "Parla con Codex" })).toBeInTheDocument()
    expect(screen.getByText(/È Codex: lavora sui tuoi file e monta i video/)).toBeInTheDocument()
  })

  it("in inglese i testi sono gli stessi nell'altra lingua", async () => {
    scegliLingua("en")
    await apri({ lavoro: { ms: 90_000, da: null } })
    expect(screen.getByTitle("Codex's working time across the whole conversation, without the waits")).toBeInTheDocument()
  })
})

describe("le capacità decidono cosa si mostra", () => {
  it("senza «in background» non c'è il bottone «Manda in background», né Ctrl+B, né la frase che lo promette", async () => {
    await apri({ stato: "lavora", messaggi: [fa("m1", "Monta")], task: [task("f1", false)] })
    expect(screen.queryByRole("button", { name: /Manda in background/ })).toBeNull()
    expect(fireEvent.keyDown(document, { key: "b", ctrlKey: true })).toBe(true)
    expect(chiamate.some((c) => c.percorso === "/api/chat/c1/background")).toBe(false)
    rete({ "GET /api/chat/c1": conversazione(), "POST /api/chat/c1/messaggi": {} })
    fireEvent.change(screen.getByRole("textbox", { name: "Messaggio per Codex" }), { target: { value: "E la copertina" } })
    fireEvent.click(screen.getByRole("button", { name: "Manda" }))
    expect(await screen.findByText("In coda: Codex lo legge appena finisce.")).toBeInTheDocument()
    expect(screen.queryByText(/Ctrl\+B/)).toBeNull()
  })

  it("con «in background» il bottone c'è", async () => {
    await apri({ stato: "lavora", messaggi: [fa("m1", "Monta")], task: [task("f1", false)] }, { "GET /api/chat/motori": [CLAUDE, MANGO, conCapacita(CODEX, { in_background: true })] })
    expect(screen.getByRole("button", { name: /Manda in background/ })).toBeInTheDocument()
  })

  it("senza «ferma lavoro» la scheda di un lavoro in background non ha «Ferma»; con la capacità sì", async () => {
    await apri({ task: [task("b1", true)] }, { "GET /api/chat/motori": [CLAUDE, MANGO, conCapacita(CODEX, { ferma_lavoro: false })] })
    const scheda = screen.getByRole("group", { name: "Lavoro in background: Esporta b1" })
    expect(within(scheda).queryByRole("button", { name: "Ferma" })).toBeNull()
    cleanup()
    await apri({ task: [task("b1", true)] })
    expect(within(screen.getByRole("group", { name: "Lavoro in background: Esporta b1" })).getByRole("button", { name: "Ferma" })).toBeInTheDocument()
  })

  it("senza «effort» il menu dell'effort non c'è, anche se il modello ha dei livelli", async () => {
    await apri({}, { "GET /api/chat/motori": [CLAUDE, MANGO, conCapacita(CODEX, { effort: false })] })
    expect(menu("Modello").value).toBe("codex/gpt-6-luna")
    expect(screen.queryByLabelText("Effort")).toBeNull()
  })

  it("/effort su un motore senza effort lo dice", async () => {
    await apri({}, { "GET /api/chat/motori": [CLAUDE, MANGO, conCapacita(CODEX, { effort: false })] })
    const campo = screen.getByRole("textbox", { name: "Messaggio per Codex" })
    fireEvent.change(campo, { target: { value: "/effort high" } })
    fireEvent.keyDown(campo, { key: "Enter" })
    expect(await screen.findByText("Questo modello non ha l'effort.")).toBeInTheDocument()
    expect(chiamate.some((c) => c.metodo === "POST")).toBe(false)
  })
})

describe("l'effort viene dai livelli del modello", () => {
  it("i livelli e i loro nomi sono quelli che il modello dà, anche uno che lo studio non conosceva", async () => {
    await apri({ modello: "codex/gpt-6-terra", effort: "ultra" })
    expect(nomi(menu("Effort"))).toEqual(["Predefinito", "Basso", "Medio", "Alto", "Ultra"])
    expect(menu("Effort").value).toBe("ultra")
  })

  it("il nome segue la lingua", async () => {
    scegliLingua("en")
    await apri({ modello: "codex/gpt-6-terra" })
    expect(nomi(menu("Effort"))).toEqual(["Default", "Low", "Medium", "High", "Ultra"])
  })

  it("cambiando modello l'effort che il nuovo non ha torna al predefinito", async () => {
    negozio.apri(null)
    localStorage.setItem("mango-animation.chat.impostazioni", JSON.stringify({ modello: "codex/gpt-6-terra", effort: "ultra" }))
    negozio.apri(null)
    rete()
    render(<PannelloChat />)
    await waitFor(() => expect(menu("Effort").value).toBe("ultra"))
    fireEvent.change(menu("Modello"), { target: { value: "codex/gpt-6-luna" } })
    await waitFor(() => expect(menu("Effort").value).toBe(""))
    expect(JSON.parse(localStorage.getItem("mango-animation.chat.impostazioni") ?? "null")).toEqual({ modello: "codex/gpt-6-luna", effort: null })
  })

  it("/effort legge il livello scritto dal nome in italiano o in inglese, o dall'id", async () => {
    await apri({ modello: "codex/gpt-6-terra" }, { "POST /api/chat/c1/impostazioni": (c: Chiamata) => ({ modello: "codex/gpt-6-terra", effort: (c.corpo as { effort: string }).effort }) })
    const campo = screen.getByRole("textbox", { name: "Messaggio per Codex" })
    fireEvent.change(campo, { target: { value: "/effort Ultra" } })
    fireEvent.keyDown(campo, { key: "Enter" })
    await waitFor(() => expect(chiamate.find((c) => c.percorso === "/api/chat/c1/impostazioni")?.corpo).toEqual({ effort: "ultra" }))
    fireEvent.change(campo, { target: { value: "/effort molto alto" } })
    fireEvent.keyDown(campo, { key: "Enter" })
    expect(await screen.findByText("Non conosco il livello «molto alto». Quelli che ci sono: Basso, Medio, Alto, Ultra.")).toBeInTheDocument()
  })
})

describe("il menu dei modelli con più motori", () => {
  const CINQUE_DI_CODEX = [
    ...MODELLI_CODEX,
    modello(CODEX, "codex/gpt-5.6-terra", "gpt-5.6-terra"),
    modello(CODEX, "codex/gpt-5.5-terra", "gpt-5.5-terra"),
    modello(CODEX, "codex/gpt-5.4-terra", "gpt-5.4-terra"),
  ]

  it("una conversazione nuova li offre tutti, un gruppo per motore", async () => {
    negozio.apri(null)
    rete()
    render(<PannelloChat />)
    await waitFor(() => expect(gruppi(menu("Modello"))).toEqual(["Claude", "Mango Code", "Codex"]))
  })

  it("di ogni motore il menu corto mostra i tre più recenti, e «Altri…» apre gli altri solo di quel motore", async () => {
    negozio.apri(null)
    rete({ "GET /api/chat/modelli": [...MODELLI_CLAUDE, MODELLO_MANGO, ...CINQUE_DI_CODEX] })
    render(<PannelloChat />)
    await waitFor(() => expect(gruppi(menu("Modello"))).toEqual(["Claude", "Mango Code", "Codex"]))
    expect(nomi(menu("Modello"))).toEqual(["Predefinito (Sonnet 5.5)", "Opus 5.5", "Opus 4.6", "Haiku 4.5", "Mango Code · TOQ", "gpt-6-luna", "gpt-6-terra", "gpt-5.6-terra", "Altri…"])
    fireEvent.change(menu("Modello"), { target: { value: [...menu("Modello").options].find((o) => o.textContent === "Altri…")!.value } })
    expect(nomi(menu("Modello"))).toEqual(["Predefinito (Sonnet 5.5)", "Opus 5.5", "Opus 4.6", "Haiku 4.5", "Mango Code · TOQ", "gpt-6-luna", "gpt-6-terra", "gpt-5.6-terra", "gpt-5.5-terra", "gpt-5.4-terra"])
    expect(gruppi(menu("Modello"))).toEqual(["Claude", "Mango Code", "Codex", "Codex · Altri"])
  })

  it("una conversazione iniziata offre solo i modelli del suo motore", async () => {
    await apri()
    expect(nomi(menu("Modello"))).toEqual(["gpt-6-luna", "gpt-6-terra"])
    expect(menu("Modello").querySelectorAll("optgroup")).toHaveLength(0)
  })

  it("un motore spento si legge «spento» e non con l'id interno, qualunque sia il motore", async () => {
    await apri({}, { "GET /api/chat/motori": [CLAUDE, MANGO, { ...CODEX, pronto: false }], "GET /api/chat/modelli": [...MODELLI_CLAUDE, MODELLO_MANGO] })
    expect(nomi(menu("Modello"))).toEqual(["Codex (spento)"])
    expect(screen.queryByText(/codex\//)).toBeNull()
  })

  it("un motore acceso, con un modello che non è più offerto, lo scrive per nome", async () => {
    await apri({ modello: "codex/gpt-4" })
    expect(nomi(menu("Modello"))).toEqual(["Codex · gpt-4", "gpt-6-luna", "gpt-6-terra"])
  })

  it("la copia dei motori si rilegge all'evento «modelli»", async () => {
    await apri({}, { "GET /api/chat/motori": [CLAUDE, MANGO, { ...CODEX, pronto: false }], "GET /api/chat/modelli": [...MODELLI_CLAUDE, MODELLO_MANGO] })
    expect(nomi(menu("Modello"))).toEqual(["Codex (spento)"])
    rete({ "GET /api/chat/c1": conversazione() })
    await act(() => eventi.istanze.at(-1)!.manda({ tipo: "modelli" }))
    await waitFor(() => expect(nomi(menu("Modello"))).toEqual(["gpt-6-luna", "gpt-6-terra"]))
  })
})

describe("una conversazione nuova nasce col motore del modello scelto", () => {
  it("la testata lo dice appena parte, prima che il server abbia risposto con la conversazione", async () => {
    localStorage.setItem("mango-animation.chat.impostazioni", JSON.stringify({ modello: "codex/gpt-6-luna", effort: null }))
    negozio.apri(null)
    let rispondi: (d: DettaglioConversazione) => void = () => undefined
    const arriva = new Promise<DettaglioConversazione>((ok) => (rispondi = ok))
    rete({ "POST /api/chat": { id: "c9" }, "GET /api/chat/c9": () => arriva })
    render(<PannelloChat />)
    const campo = await screen.findByRole("textbox", { name: "Messaggio per Codex" })
    fireEvent.change(campo, { target: { value: "Ciao" } })
    fireEvent.keyDown(campo, { key: "Enter" })
    await waitFor(() => expect(negozio.leggi().id).toBe("c9"))
    expect(negozio.leggi().motore).toBe("codex")
    expect(within(screen.getByRole("banner")).getByText("Codex")).toBeInTheDocument()
    rispondi(conversazione({ id: "c9" }) as never)
  })
})

// In fondo al file: queste prove ricaricano i moduli, perché il primo giro si ricorda nel modulo.
describe("il tempo di lavoro e il primo giro con un motore che le frasi nominano o no", () => {
  const PROFILO_VUOTO = { valido: true, presente: false, canali: [], profilo: {}, problemi: [] }

  // Il primo giro si ricorda nel modulo: ogni prova parte da un modulo nuovo.
  async function primoGiro(dettaglio: Partial<DettaglioConversazione>) {
    vi.resetModules()
    localStorage.setItem("mango-animation.primo-giro", "iniziato")
    ;(await import("../src/lingua")).scegliLingua("it")
    const { PannelloChat: Pannello } = await import("../src/chat/PannelloChat")
    const { negozio: nuovo } = await import("../src/chat/negozio")
    rete({ "GET /api/profilo": PROFILO_VUOTO, "GET /api/chat/c1": conversazione({ lavoro: { ms: 90_000, da: null }, primo_giro: true, ...dettaglio }) })
    nuovo.apri("c1")
    render(<Pannello />)
    await screen.findByRole("log", { name: /La conversazione|The conversation/ })
  }

  it("dicono il suo nome", async () => {
    await primoGiro({})
    expect(screen.getByTitle("Il tempo di lavoro di Codex in tutta la conversazione, senza le attese")).toBeInTheDocument()
    expect(await screen.findByText("Primo giro: Codex ti fa qualche domanda.")).toBeInTheDocument()
  })

  it("senza nome non ne mettono", async () => {
    await primoGiro({ motore: "claude-code", modello: null })
    expect(screen.getByTitle("Il tempo di lavoro in tutta la conversazione, senza le attese")).toBeInTheDocument()
    expect(await screen.findByText("Primo giro: qualche domanda per te.")).toBeInTheDocument()
  })
})
