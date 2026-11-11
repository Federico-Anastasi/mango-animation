import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { BottoneChat } from "../src/chat/BottoneChat"
import { Markdown } from "../src/chat/Markdown"
import { negozio } from "../src/chat/negozio"
import { chiudiChat } from "../src/chat/pannello"
import { PannelloChat } from "../src/chat/PannelloChat"
import { descriviStrumento } from "../src/chat/strumenti"
import type { DettaglioConversazione, Messaggio, ModelloChat, Richiesta } from "../src/chat/tipi"
import { scegliLingua } from "../src/lingua"
import { installaEventi, installaRete } from "./rete"

const MODELLI: ModelloChat[] = [
  { id: "default", nome: "Default (Sonnet 5.5)", descrizione: "", effort: ["low", "medium", "high", "xhigh", "max"], reale: "claude-sonnet-5-5" },
]

const conversazione = (extra: Partial<DettaglioConversazione> = {}): DettaglioConversazione => ({
  id: "c1",
  titolo: "Carousel slides",
  attiva: false,
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

const rete = (rotte: Record<string, unknown> = {}) =>
  installaRete({
    "GET /api/video": [],
    "GET /api/chat": [{ id: "c1", titolo: "Carousel slides", aggiornata: "2026-11-02T10:00:00", attiva: false }],
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/chat/modelli": MODELLI,
    "GET /api/chat/c1": conversazione(),
    ...rotte,
  })

const assesta = () => act(() => new Promise<void>((ok) => setTimeout(ok, 20)))

beforeEach(() => {
  installaEventi()
  window.location.hash = ""
  localStorage.clear()
  sessionStorage.clear()
  negozio.apri(null)
  chiudiChat()
  scegliLingua("en")
})

describe("la chat in inglese", () => {
  it("il pannello vuoto, il campo e le impostazioni parlano inglese", async () => {
    rete()
    render(<PannelloChat />)
    expect(await screen.findByRole("heading", { name: "What shall we do?" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveAttribute("placeholder", "Write a message")
    expect(await screen.findByLabelText("Model")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Attach a file" })).toBeInTheDocument()
    expect(screen.getByText("Enter sends, Shift+Enter adds a line")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New conversation" })).toBeInTheDocument()
    expect(screen.queryByText("Riprendi una conversazione")).toBeNull()
    expect(screen.queryByRole("button", { name: "Manda" })).toBeNull()
  })

  it("una conversazione con uno strumento fallito, un permesso e lo stato di lavoro", async () => {
    const permesso: Richiesta = { id: "r1", tipo: "permesso", strumento: "Bash", ingresso: { command: "ls" }, frase: "Claude wants to run: ls" }
    const messaggi: Messaggio[] = [
      { id: "m1", ruolo: "utente", quando: "2026-11-02T09:59:00", parti: [{ tipo: "testo", testo: "Hello" }] },
      {
        id: "m2",
        ruolo: "claude",
        quando: "2026-11-02T10:00:00",
        parti: [{ tipo: "strumento", id: "t1", nome: "Read", ingresso: { file_path: "docs/PIANO.md" }, errore: "denied" }, { tipo: "fine", durata_ms: 12000 }],
      },
    ]
    rete({ "GET /api/chat/c1": conversazione({ stato: "aspetta", attiva: true, messaggi, in_attesa: [permesso] }) })
    negozio.apri("c1")
    render(<PannelloChat />)
    await screen.findByRole("log", { name: "The conversation" })
    await assesta()
    expect(screen.getByText("Reads docs/PIANO.md")).toBeInTheDocument()
    expect(screen.getByText("failed")).toBeInTheDocument()
    expect(screen.getByText("Done in 12 s")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Allow" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Always allow" })).toBeInTheDocument()
    expect(screen.getByText("Waiting for your reply")).toBeInTheDocument()
    expect(screen.queryByText("Consenti")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Reads docs/ }))
    expect(screen.getByText("What went wrong")).toBeInTheDocument()
  })

  it("i passi di fila stanno in una riga «Worked · 2 steps» che si apre", async () => {
    const messaggi: Messaggio[] = [
      { id: "m2", ruolo: "claude", quando: "2026-11-02T10:00:00", parti: [{ tipo: "strumento", id: "t1", nome: "Read", ingresso: { file_path: "a.md" }, esito: "ok", iniziato: "2026-11-02T10:00:00.000Z", finito: "2026-11-02T10:00:03.000Z" }, { tipo: "strumento", id: "t2", nome: "Bash", ingresso: { command: "ls" }, esito: "ok", iniziato: "2026-11-02T10:00:03.000Z", finito: "2026-11-02T10:00:20.000Z" }] },
    ]
    rete({ "GET /api/chat/c1": conversazione({ messaggi }) })
    negozio.apri("c1")
    render(<PannelloChat />)
    await screen.findByRole("log", { name: "The conversation" })
    await assesta()
    const riga = screen.getByRole("button", { name: /Worked/ })
    expect(riga).toHaveTextContent("Worked · 2 steps · 20 s")
    expect(screen.queryByText("Reads a.md")).toBeNull()
    fireEvent.click(riga)
    expect(screen.getByText("Reads a.md")).toBeInTheDocument()
    expect(screen.queryByText("Ha lavorato")).toBeNull()
  })

  it("la scheda di un lavoro in background dice token e strumenti in inglese", async () => {
    rete({ "GET /api/chat/c1": conversazione({ task: [{ id: "a1", tipo: "agente", descrizione: "Search", iniziato: new Date(Date.now() - 65_000).toISOString(), background: true, uso: { token: 12_400, strumenti: 18 } }] }) })
    negozio.apri("c1")
    render(<PannelloChat />)
    const scheda = await screen.findByRole("group", { name: "Background job: Search" })
    expect(scheda).toHaveTextContent("Subagent · In the background for 1 min 5 s · 12.4k tokens · 18 tools")
  })

  it("il bottone, le descrizioni degli strumenti e il markdown", () => {
    rete()
    render(<BottoneChat />)
    expect(screen.getByRole("button", { name: "Chat" })).toBeInTheDocument()
    expect(descriviStrumento("Bash", { command: "bun test" }).etichetta).toBe("Runs: bun test")
    expect(descriviStrumento("Grep", { pattern: "piano" }).etichetta).toBe("Searches for “piano”")
    expect(descriviStrumento("mcp__video__lavoro", { comando: "monta", slug: "orto" }).etichetta).toBe("Video · job monta orto")
    render(<Markdown testo={"```bash\nbun test\n```"} />)
    expect(screen.getByRole("button", { name: "Copy the code" })).toBeInTheDocument()
  })
})
