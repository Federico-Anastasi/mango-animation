// Il primo giro: la chat si apre da sola senza profilo, si salta, e le pagine dei canali senza dati portano il creator da Claude.
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { installaEventi, installaRete, type Chiamata } from "./rete"

const CHIAVE = "mango-animation.primo-giro"
const PROFILO_VUOTO = { valido: true, presente: false, canali: [], profilo: {}, problemi: [] }
const PROFILO_FATTO = (canali: Array<{ piattaforma: string; nome?: string }>) => ({ valido: true, presente: true, canali, profilo: {}, problemi: [] })

const CANALE_VUOTO = { ultima: null, letture: [], video: [] }
const CLASSIFICA_VUOTA = { quando: null, io: null, quando_io: null, come: [], righe: [] }
const STRATEGIA_VUOTA = { quando: null }

const DETTAGLIO = { id: "c1", titolo: "", attiva: true, stato: "lavora", lavora_da: null, lavoro: { ms: 0, da: null }, modello: null, effort: null, messaggi: [], in_attesa: [], task: [], contesto_usato: null }

function rete(profilo: unknown, extra: Record<string, unknown> = {}) {
  return installaRete({
    "GET /api/profilo": profilo,
    "GET /api/video": [],
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: null, ultima: null },
    "GET /api/arrivi": { in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], firewall: "bloccato", pronto: false, motivo: null },
    "GET /api/chat": [],
    "GET /api/chat/modelli": [],
    "GET /api/chat/comandi": [],
    "GET /api/canale/tiktok": CANALE_VUOTO,
    "GET /api/canale/tiktok/classifica": CLASSIFICA_VUOTA,
    "GET /api/canale/tiktok/crescita": STRATEGIA_VUOTA,
    "GET /api/consumi": { pronto: true, video: {} },
    "POST /api/chat": { id: "c1" },
    "GET /api/chat/c1": DETTAGLIO,
    ...extra,
  }).chiamate
}

const messaggiAClaude = (chiamate: Chiamata[]) => chiamate.filter((c) => c.metodo === "POST" && c.percorso === "/api/chat").map((c) => (c.corpo as { testo: string }).testo)

// Il primo giro ricorda nel modulo che cosa ha scelto il creator: ogni prova parte da un modulo nuovo.
async function nuovoStudio() {
  vi.resetModules()
  window.localStorage.clear()
  window.location.hash = ""
  ;(await import("../src/lingua")).scegliLingua("it")
  const { App } = await import("../src/App")
  return render(<App />)
}

beforeEach(() => {
  installaEventi()
})
afterEach(() => vi.unstubAllGlobals())

describe("il primo giro", () => {
  it("senza profilo la chat si apre da sola e Claude riceve il saluto, una volta sola", async () => {
    const chiamate = rete(PROFILO_VUOTO)
    const { unmount } = await nuovoStudio()
    await waitFor(() => expect(messaggiAClaude(chiamate)).toHaveLength(1))
    expect(messaggiAClaude(chiamate)[0]).toMatch(/prima volta.*primo giro/)
    expect(await screen.findByRole("complementary", { name: "Chat" })).toBeInTheDocument()
    expect(window.localStorage.getItem(CHIAVE)).toBe("iniziato")
    unmount()

    // Riaprendo lo studio a giro cominciato la conversazione si riprende, non si ricomincia.
    const { App } = await import("../src/App")
    render(<App />)
    await screen.findByRole("navigation", { name: "Sezioni" })
    expect(messaggiAClaude(chiamate)).toHaveLength(1)
  })

  it("con un profilo già fatto non parte niente", async () => {
    const chiamate = rete(PROFILO_FATTO([]))
    await nuovoStudio()
    await screen.findByRole("navigation", { name: "Sezioni" })
    await waitFor(() => expect(chiamate.some((c) => c.percorso === "/api/profilo")).toBe(true))
    expect(messaggiAClaude(chiamate)).toHaveLength(0)
  })

  it("«Salta» ferma il giro e non riparte", async () => {
    const chiamate = rete(PROFILO_VUOTO, { "POST /api/chat/c1/chiudi": {} })
    await nuovoStudio()
    fireEvent.click(await screen.findByRole("button", { name: "Salta il primo giro" }))
    await waitFor(() => expect(window.localStorage.getItem(CHIAVE)).toBe("saltato"))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Salta il primo giro" })).toBeNull())
    expect(chiamate.some((c) => c.percorso === "/api/chat/c1/chiudi")).toBe(true)
    expect(messaggiAClaude(chiamate)).toHaveLength(1)
  })

  it("dalla chat vuota si rifà", async () => {
    const chiamate = rete(PROFILO_FATTO([]))
    await nuovoStudio()
    fireEvent.click(await screen.findByRole("button", { name: /^Chat/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Rifai il primo giro" }))
    await waitFor(() => expect(messaggiAClaude(chiamate)).toEqual(["Vorrei rifare il primo giro."]))
  })
})

describe("il primo giro parte con un modello grande", () => {
  const MODELLI = [
    { id: "default", nome: "Predefinito (Sonnet 4.6)", descrizione: "", effort: [], reale: "claude-sonnet-4-6" },
    { id: "claude-opus-4-6", nome: "Opus 4.6", descrizione: "", effort: [], reale: "claude-opus-4-6" },
    { id: "opus", nome: "Opus 5.5", descrizione: "", effort: [], reale: "claude-opus-5-5" },
    { id: "opus[1m]", nome: "Opus 5.5 (1M)", descrizione: "", effort: [], reale: "claude-opus-5-5[1m]" },
    { id: "claude-haiku-4-5", nome: "Haiku 4.5", descrizione: "", effort: [], reale: "claude-haiku-4-5" },
  ]
  const corpoDellaNuova = (chiamate: Chiamata[]) => chiamate.find((c) => c.metodo === "POST" && c.percorso === "/api/chat")?.corpo

  it("la conversazione del primo giro usa l'Opus più recente, anche se il creator aveva un modello piccolo, e non cambia la scelta ricordata", async () => {
    const chiamate = rete(PROFILO_VUOTO, { "GET /api/chat/modelli": MODELLI })
    vi.resetModules()
    window.localStorage.clear()
    window.localStorage.setItem("mango-animation.chat.impostazioni", JSON.stringify({ modello: "claude-haiku-4-5", effort: null }))
    window.location.hash = ""
    ;(await import("../src/lingua")).scegliLingua("it")
    const { App } = await import("../src/App")
    render(<App />)
    await waitFor(() => expect(corpoDellaNuova(chiamate)).toBeDefined())
    expect(corpoDellaNuova(chiamate)).toEqual({ testo: expect.stringMatching(/primo giro/), modello: "opus" })
    expect(JSON.parse(window.localStorage.getItem("mango-animation.chat.impostazioni") ?? "null")).toEqual({ modello: "claude-haiku-4-5", effort: null })
  })

  it("senza Opus fra i modelli ripiega su «Predefinito», senza errore", async () => {
    const chiamate = rete(PROFILO_VUOTO, { "GET /api/chat/modelli": MODELLI.filter((m) => !/opus/.test(m.id)) })
    await nuovoStudio()
    await waitFor(() => expect(corpoDellaNuova(chiamate)).toBeDefined())
    expect(corpoDellaNuova(chiamate)).toMatchObject({ modello: "default" })
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("se i modelli non si leggono, il primo giro parte lo stesso con «Predefinito»", async () => {
    const chiamate = rete(PROFILO_VUOTO, { "GET /api/chat/modelli": () => new Response(JSON.stringify({ errore: "No." }), { status: 502 }) })
    await nuovoStudio()
    await waitFor(() => expect(corpoDellaNuova(chiamate)).toBeDefined())
    expect(corpoDellaNuova(chiamate)).toMatchObject({ modello: "default" })
  })

  it("«Rifai il primo giro» usa Opus", async () => {
    const chiamate = rete(PROFILO_FATTO([]), { "GET /api/chat/modelli": MODELLI })
    await nuovoStudio()
    fireEvent.click(await screen.findByRole("button", { name: /^Chat/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Rifai il primo giro" }))
    await waitFor(() => expect(corpoDellaNuova(chiamate)).toMatchObject({ modello: "opus" }))
  })

  it("se il creator ha scelto Mango Code, il primo giro resta con Mango Code", async () => {
    const chiamate = rete(PROFILO_VUOTO, { "GET /api/chat/modelli": [...MODELLI, { id: "mango-code/toq", nome: "Mango Code · TOQ", descrizione: "", effort: [], reale: "mango-code/toq" }] })
    vi.resetModules()
    window.localStorage.clear()
    window.localStorage.setItem("mango-animation.chat.impostazioni", JSON.stringify({ modello: "mango-code/toq", effort: null }))
    window.location.hash = ""
    ;(await import("../src/lingua")).scegliLingua("it")
    const { App } = await import("../src/App")
    render(<App />)
    await waitFor(() => expect(corpoDellaNuova(chiamate)).toBeDefined())
    expect(corpoDellaNuova(chiamate)).toMatchObject({ modello: "mango-code/toq" })
  })
})

describe("le pagine dei canali senza dati", () => {
  async function pagina(vista: string, profilo: unknown, extra: Record<string, unknown> = {}) {
    const chiamate = rete(profilo, extra)
    vi.resetModules()
    window.localStorage.setItem(CHIAVE, "saltato")
    window.location.hash = `#/${vista}`
    ;(await import("../src/lingua")).scegliLingua("it")
    const { App } = await import("../src/App")
    render(<App />)
    return chiamate
  }

  it("senza un canale una pagina sola, la stessa da ogni indirizzo del canale, dice cosa c'è e porta a collegarlo", async () => {
    for (const vista of ["pubblico", "classifica", "crescita", "canale/crescita"]) {
      const chiamate = await pagina(vista, PROFILO_FATTO([]))
      expect(await screen.findByRole("heading", { level: 1, name: "Canale" })).toBeInTheDocument()
      fireEvent.click(await screen.findByRole("button", { name: "Collega un canale" }))
      await waitFor(() => expect(messaggiAClaude(chiamate)[0]).toMatch(/collegare il mio canale/))
      document.body.innerHTML = ""
    }
  })

  it("con TikTok chiedono a Claude di leggerlo", async () => {
    const chiamate = await pagina("classifica", PROFILO_FATTO([{ piattaforma: "tiktok", nome: "@alice.cucina" }]))
    fireEvent.click(await screen.findByRole("button", { name: "Leggi i dati di TikTok" }))
    await waitFor(() => expect(messaggiAClaude(chiamate)).toEqual(["Aggiorna i dati di TikTok."]))
  })

  it("la lettura del canale parte sempre con Claude Code, che ha il browser, anche se la scelta di prima era Mango Code, e non cambia quella scelta", async () => {
    window.localStorage.setItem("mango-animation.chat.impostazioni", JSON.stringify({ modello: "mango-code/toq", effort: "low" }))
    const modelli = ["default", "mango-code/toq"].map((id) => ({ id, nome: id, descrizione: "", effort: ["low"], reale: id }))
    const chiamate = await pagina("classifica", PROFILO_FATTO([{ piattaforma: "tiktok", nome: "@alice.cucina" }]), { "GET /api/chat/modelli": modelli })
    fireEvent.click(await screen.findByRole("button", { name: "Leggi i dati di TikTok" }))
    await waitFor(() => expect(chiamate.find((c) => c.metodo === "POST" && c.percorso === "/api/chat")?.corpo).toEqual({ testo: "Aggiorna i dati di TikTok.", modello: "default" }))
    expect(JSON.parse(window.localStorage.getItem("mango-animation.chat.impostazioni") ?? "null")).toEqual({ modello: "mango-code/toq", effort: "low" })
  })

  it("con solo Instagram dicono che la lettura automatica arriverà e propongono a Claude di guardare il profilo", async () => {
    const chiamate = await pagina("pubblico", PROFILO_FATTO([{ piattaforma: "instagram", nome: "fondazione.esempio" }]))
    expect(await screen.findByText(/Di Instagram non c'è ancora la lettura automatica/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Chiedi alla chat di guardare il mio profilo" }))
    await waitFor(() => expect(messaggiAClaude(chiamate)[0]).toMatch(/profilo Instagram pubblico \(fondazione\.esempio\)/))
  })

  it("Produzione senza video pronti porta al primo video", async () => {
    const chiamate = await pagina("produzione", PROFILO_FATTO([]))
    fireEvent.click(await screen.findByRole("button", { name: "Facciamo il primo video" }))
    await waitFor(() => expect(messaggiAClaude(chiamate)[0]).toMatch(/primo video/))
  })
})
