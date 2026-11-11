import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { comandoDelloStudio, elencoComandi, filtra, nomeInScrittura } from "../src/chat/comandi"
import { livelloScritto } from "../src/chat/modelli"
import { negozio } from "../src/chat/negozio"
import { chiudiChat } from "../src/chat/pannello"
import { PannelloChat } from "../src/chat/PannelloChat"
import type { ComandoChat, DettaglioConversazione, Messaggio, ModelloChat } from "../src/chat/tipi"
import { scegliLingua } from "../src/lingua"
import { errore, installaEventi, installaRete, type Chiamata } from "./rete"

let chiamate: Chiamata[]
let eventi: ReturnType<typeof installaEventi>

const TUTTI = ["low", "medium", "high", "xhigh", "max"] as const
const MANGO = "mango-code/toq"
const MODELLI: ModelloChat[] = [
  { id: "default", nome: "Predefinito (Sonnet 5.5)", descrizione: "", effort: [...TUTTI], reale: "claude-sonnet-5-5" },
  { id: "opus", nome: "Opus 5.5", descrizione: "", effort: [...TUTTI], reale: "claude-opus-5-5" },
  { id: "claude-haiku-4-5-20251001", nome: "Haiku 4.5", descrizione: "", effort: [], reale: "claude-haiku-4-5-20251001" },
  { id: MANGO, nome: "Mango Code · TOQ", descrizione: "", effort: [], reale: MANGO },
]

const COMANDI: ComandoChat[] = [
  { nome: "compact", descrizione: "Clear conversation history but keep a summary in context", argomenti: "<optional custom summarization instructions>", alias: [] },
  { nome: "context", descrizione: "Show current context usage", argomenti: "", alias: [] },
  { nome: "clear", descrizione: "Clear conversation history and free up context", argomenti: "", alias: ["reset", "new"] },
  { nome: "model", descrizione: "Set the AI model for Claude Code", argomenti: "[model]", alias: [] },
  { nome: "effort", descrizione: "Set effort level", argomenti: "[low|medium|high]", alias: [] },
  { nome: "rename", descrizione: "Rename the current conversation", argomenti: "<name>", alias: [] },
]

const conversazione = (extra: Partial<DettaglioConversazione> = {}): DettaglioConversazione => ({
  id: "c1",
  titolo: "Le slide del carosello",
  attiva: true,
  stato: "pronta",
  lavora_da: null,
  lavoro: { ms: 0, da: null },
  modello: null,
  effort: null,
  messaggi: [],
  in_attesa: [],
  task: [],
  contesto_usato: null,
  ...extra,
})

const fa = (id: string, testo: string): Messaggio => ({ id, ruolo: "utente", quando: "2026-11-02T09:59:00", parti: [{ tipo: "testo", testo }] })

function rete(rotte: Record<string, unknown> = {}) {
  chiamate = installaRete({
    "GET /api/video": [],
    "GET /api/chat": [{ id: "c1", titolo: "Le slide del carosello", aggiornata: "2026-11-02T10:00:00", attiva: true }],
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/chat/modelli": MODELLI,
    "GET /api/chat/comandi": COMANDI,
    "GET /api/chat/c1": conversazione(),
    ...rotte,
  }).chiamate
}

const assesta = () => act(() => new Promise<void>((ok) => setTimeout(ok, 20)))
const scrivi = (campo: HTMLElement, testo: string) => fireEvent.change(campo, { target: { value: testo } })
const tasto = (campo: HTMLElement, key: string) => fireEvent.keyDown(campo, { key })
const campo = () => screen.getByRole("textbox", { name: /^Messaggio/ })
const voci = () => within(screen.getByRole("listbox")).getAllByRole("option")
const opzioni = () => (screen.queryByRole("listbox") ? voci().map((o) => o.querySelector("span")?.textContent ?? "") : [])
const post = (percorso: string) => chiamate.filter((c) => c.metodo === "POST" && c.percorso === percorso)

async function apri(dettaglio: Partial<DettaglioConversazione> = {}, rotte: Record<string, unknown> = {}) {
  rete({ "GET /api/chat/c1": conversazione(dettaglio), ...rotte })
  negozio.apri("c1")
  render(<PannelloChat />)
  await screen.findByRole("log", { name: "La conversazione" })
  await assesta()
}

/** Scrive la barra e aspetta che i comandi del server siano arrivati. */
async function scriviBarra(testo = "/") {
  scrivi(campo(), testo)
  await screen.findByRole("listbox", { name: "Comandi" })
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

describe("i comandi: cosa si legge nel messaggio", () => {
  it("la tendina riguarda solo «/» più il nome in scrittura, senza spazi", () => {
    expect(nomeInScrittura("/")).toBe("")
    expect(nomeInScrittura("/comp")).toBe("comp")
    expect(nomeInScrittura("/compact ")).toBeNull()
    expect(nomeInScrittura("/model opus")).toBeNull()
    expect(nomeInScrittura("ciao /comp")).toBeNull()
    expect(nomeInScrittura("/uno\ndue")).toBeNull()
  })

  it("il filtro mette prima i nomi che cominciano così, poi gli alias, poi quelli che lo contengono", () => {
    const voci = elencoComandi(COMANDI, true)
    expect(filtra(voci, "re").map((v) => v.nome)).toEqual(["resume", "rename", "clear"])
    // «continue» è un alias di /resume: /context, che comincia col nome, viene prima.
    expect(filtra(voci, "cont").map((v) => v.nome)).toEqual(["context", "resume"])
    expect(filtra(voci, "COM").map((v) => v.nome)).toEqual(["compact"])
    expect(filtra(voci, "xyz")).toEqual([])
  })

  it("un comando del server con il nome di uno dello studio si mostra una volta sola, quello dello studio", () => {
    const voci = elencoComandi(COMANDI, true)
    expect(voci.filter((v) => v.nome === "clear")).toHaveLength(1)
    expect(voci.find((v) => v.nome === "clear")?.studio).toBe(true)
    expect(voci.find((v) => v.nome === "model")?.descrizione).toBe("Sceglie il modello")
    expect(voci.find((v) => v.nome === "compact")?.studio).toBe(false)
    expect(elencoComandi([...COMANDI, { nome: "quit", descrizione: "", argomenti: "", alias: [] }], true).some((v) => v.nome === "quit" && !v.studio)).toBe(false)
  })

  it("senza i comandi del server, o per un altro motore, restano quelli dello studio", () => {
    expect(elencoComandi(COMANDI, false).map((v) => v.nome)).toEqual(["clear", "exit", "resume", "model", "effort"])
    expect(elencoComandi(null, true).map((v) => v.nome)).toEqual(["clear", "exit", "resume", "model", "effort"])
  })

  it("un messaggio è un comando dello studio per la prima parola, alias compresi", () => {
    expect(comandoDelloStudio("/clear")).toEqual({ nome: "clear", argomento: "" })
    expect(comandoDelloStudio("/NEW")).toEqual({ nome: "clear", argomento: "" })
    expect(comandoDelloStudio("/quit")).toEqual({ nome: "exit", argomento: "" })
    expect(comandoDelloStudio("/continue")).toEqual({ nome: "resume", argomento: "" })
    expect(comandoDelloStudio("  /model   Opus 5.5 ")).toEqual({ nome: "model", argomento: "Opus 5.5" })
    expect(comandoDelloStudio("/compact")).toBeNull()
    expect(comandoDelloStudio("/clearly")).toBeNull()
    expect(comandoDelloStudio("clear")).toBeNull()
  })

  it("l'effort si scrive con il livello o con il nome in italiano e in inglese", () => {
    expect(livelloScritto("low")).toBe("low")
    expect(livelloScritto("Molto alto")).toBe("xhigh")
    expect(livelloScritto("very high")).toBe("xhigh")
    expect(livelloScritto("X-High")).toBe("xhigh")
    expect(livelloScritto("Massimo")).toBe("max")
    expect(livelloScritto("predefinito")).toBeNull()
    expect(livelloScritto("ultra")).toBeUndefined()
  })
})

describe("la tendina dei comandi", () => {
  it("scrivendo «/» si apre con i comandi dello studio e quelli del server, ognuno con argomenti e descrizione", async () => {
    await apri()
    await scriviBarra("/")
    await waitFor(() => expect(opzioni()).toEqual(["/clear", "/exit", "/resume", "/model [modello]", "/effort [livello]", "/compact <optional custom summarization instructions>", "/context", "/rename <name>"]))
    const compact = within(screen.getByRole("listbox")).getByRole("option", { name: /\/compact/ })
    expect(compact).toHaveTextContent("Clear conversation history but keep a summary in context")
    expect(within(screen.getByRole("listbox")).getByRole("option", { name: /\/exit/ })).toHaveTextContent("Chiude la conversazione")
  })

  it("si filtra mentre si scrive e si chiude con uno spazio o senza corrispondenze", async () => {
    await apri()
    await scriviBarra("/co")
    await waitFor(() => expect(opzioni()).toEqual(["/compact <optional custom summarization instructions>", "/context", "/resume"]))
    scrivi(campo(), "/zzz")
    expect(screen.queryByRole("listbox")).toBeNull()
    scrivi(campo(), "/context ")
    expect(screen.queryByRole("listbox")).toBeNull()
    scrivi(campo(), "ciao")
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("il campo punta all'opzione scelta; le frecce la spostano in giro, e la riga scelta si porta in vista", async () => {
    const scorri = vi.fn()
    Element.prototype.scrollIntoView = scorri
    await apri()
    await scriviBarra("/")
    const id = () => campo().getAttribute("aria-activedescendant")
    expect(document.getElementById(id()!)).toHaveTextContent("/clear")
    tasto(campo(), "ArrowDown")
    expect(document.getElementById(id()!)).toHaveTextContent("/exit")
    expect(document.getElementById(id()!)).toHaveAttribute("aria-selected", "true")
    expect(scorri).toHaveBeenLastCalledWith({ block: "nearest" })
    tasto(campo(), "ArrowUp")
    tasto(campo(), "ArrowUp")
    expect(document.getElementById(id()!)).toHaveTextContent("/rename")
    tasto(campo(), "ArrowDown")
    expect(document.getElementById(id()!)).toHaveTextContent("/clear")
    expect(voci().filter((o) => o.getAttribute("aria-selected") === "true")).toHaveLength(1)
    expect(campo()).toHaveAttribute("aria-controls", screen.getByRole("listbox").id)
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  it("Tab completa con lo spazio e chiude la tendina", async () => {
    await apri()
    await scriviBarra("/conte")
    tasto(campo(), "Tab")
    expect(campo()).toHaveValue("/context ")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(chiamate.some((c) => c.metodo === "POST")).toBe(false)
  })

  it("Invio su un comando senza argomenti lo completa e lo manda", async () => {
    await apri({}, { "POST /api/chat/c1/messaggi": {} })
    await scriviBarra("/conte")
    tasto(campo(), "Enter")
    await waitFor(() => expect(post("/api/chat/c1/messaggi")).toHaveLength(1))
    expect(post("/api/chat/c1/messaggi")[0]?.corpo).toMatchObject({ testo: "/context" })
    expect(campo()).toHaveValue("")
  })

  it("Invio su un comando con argomenti lo manda senza, come nel terminale", async () => {
    await apri({}, { "POST /api/chat/c1/messaggi": {} })
    await scriviBarra("/comp")
    tasto(campo(), "Enter")
    await waitFor(() => expect(post("/api/chat/c1/messaggi")).toHaveLength(1))
    expect(post("/api/chat/c1/messaggi")[0]?.corpo).toMatchObject({ testo: "/compact" })
  })

  it("Esc la chiude, e resta chiusa finché il testo non cambia", async () => {
    await apri()
    await scriviBarra("/co")
    tasto(campo(), "Escape")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(campo()).toHaveValue("/co")
    scrivi(campo(), "/cont")
    expect(screen.getByRole("listbox")).toBeInTheDocument()
  })

  it("un clic completa, senza mandare", async () => {
    await apri()
    await scriviBarra("/")
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /\/rename/ }))
    expect(campo()).toHaveValue("/rename ")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(chiamate.some((c) => c.metodo === "POST")).toBe(false)
  })

  it("senza la tendina Invio manda come sempre, e Maiusc+Invio non la sceglie", async () => {
    await apri({}, { "POST /api/chat/c1/messaggi": {} })
    await scriviBarra("/co")
    fireEvent.keyDown(campo(), { key: "Enter", shiftKey: true })
    expect(chiamate.some((c) => c.metodo === "POST")).toBe(false)
    scrivi(campo(), "Ciao")
    tasto(campo(), "Enter")
    await waitFor(() => expect(post("/api/chat/c1/messaggi")[0]?.corpo).toMatchObject({ testo: "Ciao" }))
  })

  it("un comando di Claude Code che non è dello studio arriva al server com'è scritto", async () => {
    await apri({}, { "POST /api/chat/c1/messaggi": {} })
    scrivi(campo(), "/rename prova")
    tasto(campo(), "Enter")
    await waitFor(() => expect(post("/api/chat/c1/messaggi")[0]?.corpo).toMatchObject({ testo: "/rename prova" }))
  })

  it("in una conversazione di Mango Code ci sono solo i comandi dello studio", async () => {
    await apri({ modello: MANGO })
    scrivi(campo(), "/")
    await screen.findByRole("listbox", { name: "Comandi" })
    expect(opzioni()).toEqual(["/clear", "/exit", "/resume", "/model [modello]", "/effort [livello]"])
  })

  it("quando il server dice che i comandi sono cambiati, la tendina si aggiorna", async () => {
    await apri()
    await scriviBarra("/ren")
    await waitFor(() => expect(opzioni()).toEqual(["/rename <name>"]))
    rete({ "GET /api/chat/comandi": [...COMANDI, { nome: "renew", descrizione: "Renew", argomenti: "", alias: [] }] })
    await act(() => eventi.istanze.at(-1)!.manda({ tipo: "comandi" }))
    await waitFor(() => expect(opzioni()).toEqual(["/rename <name>", "/renew"]))
  })

  it("se i comandi del server non si leggono, restano quelli dello studio e lo dice", async () => {
    await apri({}, { "GET /api/chat/comandi": () => errore(502, "Claude Code non risponde.") })
    scrivi(campo(), "/")
    await screen.findByRole("listbox", { name: "Comandi" })
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Gli altri comandi non si leggono: Claude Code non risponde."))
    expect(opzioni().slice(0, 5)).toEqual(["/clear", "/exit", "/resume", "/model [modello]", "/effort [livello]"])
  })
})

describe("i comandi dello studio, mandati", () => {
  it("/clear chiude la conversazione e ne apre una nuova vuota, senza mandare niente a Claude", async () => {
    await apri({ messaggi: [fa("m1", "Ciao")] }, { "POST /api/chat/c1/chiudi": { ok: true } })
    scrivi(campo(), "/clear")
    tasto(campo(), "Enter")
    await waitFor(() => expect(negozio.leggi().id).toBeNull())
    expect(post("/api/chat/c1/chiudi")).toHaveLength(1)
    expect(post("/api/chat/c1/messaggi")).toHaveLength(0)
    expect(campo()).toHaveValue("")
    expect(await screen.findByRole("heading", { name: "Cosa facciamo?" })).toBeInTheDocument()
  })

  it("/new e /reset sono la stessa cosa; in una conversazione nuova non c'è niente da chiudere", async () => {
    rete()
    render(<PannelloChat />)
    scrivi(await screen.findByRole("textbox", { name: "Messaggio" }), "/new")
    tasto(campo(), "Enter")
    await waitFor(() => expect(campo()).toHaveValue(""))
    expect(chiamate.some((c) => c.metodo === "POST")).toBe(false)
  })

  it("/exit chiude la conversazione e la lascia lì, «Chiusa»", async () => {
    await apri({ messaggi: [fa("m1", "Ciao")] }, { "POST /api/chat/c1/chiudi": { ok: true } })
    scrivi(campo(), "/exit")
    tasto(campo(), "Enter")
    await waitFor(() => expect(screen.getByRole("complementary", { name: "Chat" })).toHaveTextContent(/Chiusa/))
    expect(negozio.leggi()).toMatchObject({ id: "c1", attiva: false })
    await waitFor(() => expect(campo()).toHaveValue(""))
    expect(post("/api/chat/c1/messaggi")).toHaveLength(0)
  })

  it("se il server non chiude, lo dice e il comando resta scritto", async () => {
    await apri({}, { "POST /api/chat/c1/chiudi": () => errore(502, "Claude Code non risponde.") })
    scrivi(campo(), "/exit")
    tasto(campo(), "Enter")
    expect(await screen.findByText("Claude Code non risponde.")).toBeInTheDocument()
    expect(campo()).toHaveValue("/exit")
    expect(negozio.leggi().attiva).toBe(true)
  })

  it("/resume apre l'elenco delle conversazioni", async () => {
    await apri({ messaggi: [fa("m1", "Ciao")] })
    scrivi(campo(), "/resume")
    tasto(campo(), "Enter")
    expect(await screen.findByRole("list", { name: "Conversazioni" })).toBeInTheDocument()
    expect(campo()).toHaveValue("")
    expect(chiamate.some((c) => c.metodo === "POST")).toBe(false)
  })

  it("/model senza argomento porta il fuoco sul menu del modello", async () => {
    await apri()
    const apriElenco = vi.fn()
    ;(screen.getByLabelText("Modello") as HTMLSelectElement).showPicker = apriElenco
    scrivi(campo(), "/model ")
    tasto(campo(), "Enter")
    await waitFor(() => expect(campo()).toHaveValue(""))
    expect(screen.getByLabelText("Modello")).toHaveFocus()
    expect(apriElenco).toHaveBeenCalled()
  })

  it("/model con l'id o il nome di un modello offerto lo sceglie, senza badare alle maiuscole", async () => {
    await apri({}, { "POST /api/chat/c1/impostazioni": { modello: "opus", effort: null } })
    scrivi(campo(), "/model OPUS 5.5")
    tasto(campo(), "Enter")
    await waitFor(() => expect(post("/api/chat/c1/impostazioni")[0]?.corpo).toEqual({ modello: "opus" }))
    await waitFor(() => expect(campo()).toHaveValue(""))
    expect((screen.getByLabelText("Modello") as HTMLSelectElement).value).toBe("opus")
    scrivi(campo(), "/model claude-haiku-4-5-20251001")
    tasto(campo(), "Enter")
    await waitFor(() => expect(post("/api/chat/c1/impostazioni")[1]?.corpo).toEqual({ modello: "claude-haiku-4-5-20251001" }))
    expect(post("/api/chat/c1/messaggi")).toHaveLength(0)
  })

  it("/model con un nome che non c'è dice quali ci sono, e non svuota il campo; i modelli di Mango Code non sono offerti a Claude", async () => {
    await apri()
    scrivi(campo(), "/model gpt")
    tasto(campo(), "Enter")
    const frase = await screen.findByText(/Non trovo il modello «gpt»/)
    expect(frase).toHaveTextContent("Quelli che ci sono: Predefinito (Sonnet 5.5), Opus 5.5, Haiku 4.5.")
    expect(campo()).toHaveValue("/model gpt")
    scrivi(campo(), "/model mango-code/toq")
    tasto(campo(), "Enter")
    await waitFor(() => expect(screen.getByText(/Non trovo il modello «mango-code\/toq»/)).toBeInTheDocument())
    expect(post("/api/chat/c1/impostazioni")).toHaveLength(0)
  })

  it("/model: se il server rifiuta, lo dice sotto il campo e il comando resta", async () => {
    await apri({}, { "POST /api/chat/c1/impostazioni": () => errore(502, "Claude Code non accetta il cambio.") })
    scrivi(campo(), "/model opus")
    tasto(campo(), "Enter")
    await waitFor(() => expect(screen.getAllByText("Claude Code non accetta il cambio.").length).toBeGreaterThan(0))
    expect(campo()).toHaveValue("/model opus")
  })

  it("/effort senza argomento porta il fuoco sul menu dell'effort; con un livello lo sceglie, anche con il nome dello studio", async () => {
    await apri({ modello: "opus" }, { "POST /api/chat/c1/impostazioni": (c: Chiamata) => ({ modello: "opus", effort: (c.corpo as { effort: string }).effort }) })
    scrivi(campo(), "/effort ")
    tasto(campo(), "Enter")
    await waitFor(() => expect(campo()).toHaveValue(""))
    expect(screen.getByLabelText("Effort")).toHaveFocus()
    scrivi(campo(), "/effort molto alto")
    tasto(campo(), "Enter")
    await waitFor(() => expect(post("/api/chat/c1/impostazioni")[0]?.corpo).toEqual({ effort: "xhigh" }))
    scrivi(campo(), "/effort low")
    tasto(campo(), "Enter")
    await waitFor(() => expect(post("/api/chat/c1/impostazioni")[1]?.corpo).toEqual({ effort: "low" }))
    await waitFor(() => expect((screen.getByLabelText("Effort") as HTMLSelectElement).value).toBe("low"))
    scrivi(campo(), "/effort predefinito")
    tasto(campo(), "Enter")
    await waitFor(() => expect(post("/api/chat/c1/impostazioni")[2]?.corpo).toEqual({ effort: null }))
  })

  it("/effort con un livello che non c'è, o su un modello che non ha l'effort, lo dice", async () => {
    await apri({ modello: "opus" })
    scrivi(campo(), "/effort ultra")
    tasto(campo(), "Enter")
    expect(await screen.findByText(/Non conosco il livello «ultra»/)).toHaveTextContent("Quelli che ci sono: Basso, Medio, Alto, Molto alto, Massimo.")
    expect(campo()).toHaveValue("/effort ultra")
    expect(post("/api/chat/c1/impostazioni")).toHaveLength(0)
  })

  it("/effort su un modello che non ha l'effort dice che non c'è", async () => {
    await apri({ modello: "claude-haiku-4-5-20251001" })
    scrivi(campo(), "/effort ")
    tasto(campo(), "Enter")
    expect(await screen.findByText("Questo modello non ha l'effort.")).toBeInTheDocument()
    expect(campo()).toHaveValue("/effort ")
  })

  it("nella conversazione nuova /model sceglie per le prossime senza chiamare il server", async () => {
    rete()
    render(<PannelloChat />)
    await screen.findByLabelText("Modello")
    await assesta()
    scrivi(campo(), "/model opus")
    tasto(campo(), "Enter")
    await waitFor(() => expect(campo()).toHaveValue(""))
    expect(negozio.leggi().modello).toBe("opus")
    expect(chiamate.some((c) => c.metodo === "POST")).toBe(false)
  })

  it("il bottone Manda manda anche un comando dello studio", async () => {
    await apri({ messaggi: [fa("m1", "Ciao")] }, { "POST /api/chat/c1/chiudi": { ok: true } })
    scrivi(campo(), "/exit")
    fireEvent.click(screen.getByRole("button", { name: "Manda" }))
    await waitFor(() => expect(post("/api/chat/c1/chiudi")).toHaveLength(1))
  })
})

describe("chiudere la conversazione", () => {
  const chiudi = () => screen.queryByRole("button", { name: "Chiudi la conversazione" })

  it("il bottone c'è solo se la conversazione ha un id ed è accesa, ed è diverso dalla croce che chiude il pannello", async () => {
    await apri()
    expect(chiudi()).toBeInTheDocument()
    expect(chiudi()!.title).toMatch(/non resta niente acceso/)
    expect(screen.getByRole("button", { name: "Chiudi la chat" })).not.toBe(chiudi())
    expect(chiudi()!.innerHTML).not.toBe(screen.getByRole("button", { name: "Chiudi la chat" }).innerHTML)
    act(() => negozio.apri(null))
    await assesta()
    expect(chiudi()).toBeNull()
  })

  it("una conversazione non accesa non lo mostra e dice «Chiusa»", async () => {
    await apri({ attiva: false, messaggi: [fa("m1", "Ciao")] })
    expect(chiudi()).toBeNull()
    expect(screen.getByRole("complementary", { name: "Chat" })).toHaveTextContent(/Chiusa/)
  })

  it("un clic la chiude: il bottone sparisce, lo stato dice «Chiusa», e scrivendo di nuovo si riapre", async () => {
    await apri({ stato: "aspetta", messaggi: [fa("m1", "Ciao")] }, { "POST /api/chat/c1/chiudi": { ok: true }, "POST /api/chat/c1/messaggi": {} })
    fireEvent.click(chiudi()!)
    await waitFor(() => expect(chiudi()).toBeNull())
    expect(post("/api/chat/c1/chiudi")).toHaveLength(1)
    const pannello = screen.getByRole("complementary", { name: "Chat" })
    expect(pannello).toHaveTextContent(/Chiusa/)
    expect(pannello).not.toHaveTextContent(/Aspetta una tua risposta/)
    scrivi(campo(), "Rieccomi")
    tasto(campo(), "Enter")
    await waitFor(() => expect(chiudi()).toBeInTheDocument())
    expect(pannello).not.toHaveTextContent(/Chiusa/)
  })

  it("se il server non la chiude, lo dice e il bottone resta", async () => {
    await apri({}, { "POST /api/chat/c1/chiudi": () => errore(502, "Claude Code non risponde.") })
    fireEvent.click(chiudi()!)
    expect(await screen.findByText("Claude Code non risponde.")).toBeInTheDocument()
    expect(chiudi()).toBeInTheDocument()
  })

  it("l'evento «chiusa» la chiude anche se è stata chiusa altrove; quello di un'altra conversazione no", async () => {
    await apri({ stato: "lavora", lavora_da: "2026-11-02T10:00:00", messaggi: [fa("m1", "Ciao")] })
    await act(() => eventi.istanze.at(-1)!.manda({ tipo: "chat", id: "altra", evento: "chiusa" }))
    expect(chiudi()).toBeInTheDocument()
    await act(() => eventi.istanze.at(-1)!.manda({ tipo: "chat", id: "c1", evento: "chiusa" }))
    expect(chiudi()).toBeNull()
    expect(negozio.leggi()).toMatchObject({ attiva: false, stato: "pronta", lavoraDa: null, inAttesa: [] })
    expect(screen.getByRole("complementary", { name: "Chat" })).toHaveTextContent(/Chiusa/)
  })

  it("l'evento «titolo» cambia il titolo nella testata", async () => {
    await apri()
    expect(screen.getByText("Le slide del carosello", { selector: "strong" })).toBeInTheDocument()
    await act(() => eventi.istanze.at(-1)!.manda({ tipo: "chat", id: "c1", evento: "titolo", titolo: "Le slide rifatte" }))
    expect(screen.getByText("Le slide rifatte", { selector: "strong" })).toBeInTheDocument()
  })

  it("nell'elenco il pallino dice «aperta»", async () => {
    await apri()
    fireEvent.click(screen.getByRole("button", { name: "Le conversazioni" }))
    const elenco = await screen.findByRole("list", { name: "Conversazioni" })
    expect(within(elenco).getByRole("img", { name: "aperta" })).toBeInTheDocument()
  })
})

describe("i comandi in inglese", () => {
  it("la tendina, gli errori e il bottone parlano inglese", async () => {
    scegliLingua("en")
    rete({ "GET /api/chat/c1": conversazione() })
    negozio.apri("c1")
    render(<PannelloChat />)
    await screen.findByRole("log", { name: "The conversation" })
    await assesta()
    expect(screen.getByRole("button", { name: "Close the conversation" })).toBeInTheDocument()
    scrivi(screen.getByRole("textbox", { name: "Message" }), "/")
    await screen.findByRole("listbox", { name: "Commands" })
    expect(opzioni().slice(0, 5)).toEqual(["/clear", "/exit", "/resume", "/model [model]", "/effort [level]"])
    expect(within(screen.getByRole("listbox")).getByRole("option", { name: /\/resume/ })).toHaveTextContent("Open the list of conversations")
    scrivi(screen.getByRole("textbox", { name: "Message" }), "/effort ultra")
    tasto(screen.getByRole("textbox", { name: "Message" }), "Enter")
    expect(await screen.findByText(/I don't know the level “ultra”/)).toHaveTextContent("The ones available are: Low, Medium, High, Very high, Maximum.")
  })
})
