// Il primo giro: la chat si apre da sola senza profilo, si salta, e le pagine dei canali senza dati portano il creator da Claude.
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CLAUDE, CODEX, MANGO, MODELLI_CODEX, MODELLO_MANGO, MOTORI, MOTORI_CON_CODEX, modello } from "./motoriChat"
import { installaEventi, installaRete, type Chiamata } from "./rete"

const CHIAVE = "mango-animation.primo-giro"
const PROFILO_VUOTO = { valido: true, presente: false, canali: [], profilo: {}, problemi: [] }
const PROFILO_FATTO = (canali: Array<{ piattaforma: string; nome?: string }>) => ({ valido: true, presente: true, canali, profilo: {}, problemi: [] })

const CANALE_VUOTO = { ultima: null, letture: [], video: [] }
const CLASSIFICA_VUOTA = { quando: null, io: null, quando_io: null, come: [], righe: [] }
const STRATEGIA_VUOTA = { quando: null }

const DETTAGLIO = { id: "c1", titolo: "", attiva: true, stato: "lavora", lavora_da: null, lavoro: { ms: 0, da: null }, motore: "claude-code", modello: null, effort: null, messaggi: [], in_attesa: [], task: [], contesto_usato: null, primo_giro: true }

function rete(profilo: unknown, extra: Record<string, unknown> = {}) {
  return installaRete({
    "GET /api/profilo": profilo,
    "GET /api/video": [],
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: null, ultima: null },
    "GET /api/arrivi": { in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], firewall: "bloccato", pronto: false, motivo: null },
    "GET /api/chat": [],
    "GET /api/chat/motori": MOTORI,
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
const avviiAClaude = (chiamate: Chiamata[]) => chiamate.filter((c) => c.metodo === "POST" && c.percorso === "/api/chat").map((c) => (c.corpo as { avvio?: string }).avvio)

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
    expect(avviiAClaude(chiamate)).toEqual(["primo-giro"])
    expect(await screen.findByRole("complementary", { name: "Chat" })).toBeInTheDocument()
    expect(window.localStorage.getItem(CHIAVE)).toBe("iniziato")
    unmount()

    // Riaprendo lo studio a giro cominciato la conversazione si riprende, non si ricomincia.
    const { App } = await import("../src/App")
    render(<App />)
    await screen.findByRole("navigation", { name: "Sezioni" })
    expect(messaggiAClaude(chiamate)).toHaveLength(1)
  })

  it("il creator non vede nessun messaggio come suo: la conversazione comincia con Claude", async () => {
    const chiamate = rete(PROFILO_VUOTO, { "GET /api/chat/c1": { ...DETTAGLIO, messaggi: [{ id: "a1", ruolo: "claude", quando: "2026-11-02T10:00:00", parti: [{ tipo: "testo", testo: "Ciao, sono qui per farti conoscere Mango Animation." }] }] } })
    await nuovoStudio()
    expect(await screen.findByText("Ciao, sono qui per farti conoscere Mango Animation.")).toBeInTheDocument()
    expect(avviiAClaude(chiamate)).toEqual(["primo-giro"])
    expect(screen.queryByRole("article", { name: "Tu" })).toBeNull()
    expect(screen.queryByText(/Lo sto mandando/)).toBeNull()
  })

  it("se l'avvio non parte lo dice, con «Riprova», senza un messaggio finto del creator", async () => {
    rete(PROFILO_VUOTO, { "POST /api/chat": () => new Response(JSON.stringify({ errore: "Claude Code non risponde." }), { status: 502 }) })
    await nuovoStudio()
    expect(await screen.findByRole("alert")).toHaveTextContent("Non è partito: Claude Code non risponde.")
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument()
    expect(screen.queryByRole("article", { name: "Tu" })).toBeNull()
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
    await waitFor(() => expect(avviiAClaude(chiamate)).toEqual(["rifare-primo-giro"]))
  })
})

describe("i passi di Claude nel primo giro", () => {
  const passo = (id: string, nome: string, ingresso: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ tipo: "strumento", id, nome, ingresso, ...extra })
  const giro = (...parti: unknown[]) => ({ ...DETTAGLIO, messaggi: [{ id: "a1", ruolo: "claude", quando: "2026-11-02T10:00:00", parti }] })

  it("sono tutti raccolti in una riga, anche quello in corso e quello non riuscito, e la riga di sotto dice in parole semplici cosa sta facendo", async () => {
    rete(PROFILO_VUOTO, {
      "GET /api/chat/c1": giro(
        passo("t1", "Skill", { skill: "welcome" }, { esito: "ok" }),
        passo("t2", "Read", { file_path: "profilo.json" }, { errore: "File does not exist" }),
        passo("t3", "Bash", { command: "ls" }),
      ),
    })
    await nuovoStudio()
    const riga = await screen.findByRole("button", { name: /Sta lavorando · 3 passi/ })
    expect(screen.queryByText(/Usa la guida/)).toBeNull()
    expect(screen.queryByText(/non riuscito/)).toBeNull()
    expect(screen.getByRole("status")).toHaveTextContent("Sta controllando il computer")
    fireEvent.click(riga)
    expect(screen.getByText("Usa la guida «welcome»")).toBeInTheDocument()
  })

  it("una domanda a scelta resta in vista, fuori dalla riga dei passi", async () => {
    rete(PROFILO_VUOTO, { "GET /api/chat/c1": { ...giro(passo("t1", "Skill", { skill: "welcome" }, { esito: "ok" }), passo("t2", "AskUserQuestion", { questions: [] }, { esito: "ok" })), stato: "pronta" } })
    await nuovoStudio()
    expect(await screen.findByRole("button", { name: /Ha lavorato · 1 passo/ })).toBeInTheDocument()
    expect(screen.getByText("Ti fa una domanda")).toBeInTheDocument()
  })

})

describe("il primo giro parte con un modello grande", () => {
  const MODELLI = [
    modello(CLAUDE, "default", "Predefinito (Sonnet 4.6)", [], "claude-sonnet-4-6"),
    modello(CLAUDE, "claude-opus-4-6", "Opus 4.6"),
    modello(CLAUDE, "opus", "Opus 5.5", [], "claude-opus-5-5"),
    modello(CLAUDE, "opus[1m]", "Opus 5.5 (1M)", [], "claude-opus-5-5[1m]"),
    modello(CLAUDE, "claude-haiku-4-5", "Haiku 4.5"),
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
    expect(corpoDellaNuova(chiamate)).toEqual({ avvio: "primo-giro", modello: "opus" })
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
    const chiamate = rete(PROFILO_VUOTO, { "GET /api/chat/modelli": [...MODELLI, MODELLO_MANGO] })
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

describe("il primo giro con più motori", () => {
  const corpoDellaNuova = (chiamate: Chiamata[]) => chiamate.find((c) => c.metodo === "POST" && c.percorso === "/api/chat")?.corpo

  async function conScelta(scelta: object, extra: Record<string, unknown>) {
    const chiamate = rete(PROFILO_VUOTO, extra)
    vi.resetModules()
    window.localStorage.clear()
    window.localStorage.setItem("mango-animation.chat.impostazioni", JSON.stringify(scelta))
    window.location.hash = ""
    ;(await import("../src/lingua")).scegliLingua("it")
    const { App } = await import("../src/App")
    render(<App />)
    await waitFor(() => expect(corpoDellaNuova(chiamate)).toBeDefined())
    return chiamate
  }

  it("parte con il modello grande che il motore scelto indica", async () => {
    const chiamate = await conScelta({ modello: "codex/gpt-6-luna", effort: "low" }, { "GET /api/chat/motori": MOTORI_CON_CODEX, "GET /api/chat/modelli": [modello(CLAUDE, "default", "Predefinito"), ...MODELLI_CODEX] })
    expect(corpoDellaNuova(chiamate)).toEqual({ avvio: "primo-giro", modello: "codex/gpt-6-terra" })
    expect(JSON.parse(window.localStorage.getItem("mango-animation.chat.impostazioni") ?? "null")).toEqual({ modello: "codex/gpt-6-luna", effort: "low" })
  })

  it("il modello grande che il server indica per Claude Code vale più della regola dell'Opus più recente", async () => {
    const motori = [{ ...CLAUDE, modello_grande: "claude-opus-4-6" }, MANGO]
    const modelli = [modello(CLAUDE, "default", "Predefinito"), modello(CLAUDE, "claude-opus-4-6", "Opus 4.6"), modello(CLAUDE, "opus", "Opus 5.5", [], "claude-opus-5-5")]
    const chiamate = await conScelta({ modello: null, effort: null }, { "GET /api/chat/motori": motori, "GET /api/chat/modelli": modelli })
    expect(corpoDellaNuova(chiamate)).toEqual({ avvio: "primo-giro", modello: "claude-opus-4-6" })
  })

  it("un motore che non indica un modello grande e non ha un Opus tiene la scelta del creator", async () => {
    const chiamate = await conScelta({ modello: "codex/gpt-6-luna", effort: "low" }, { "GET /api/chat/motori": [CLAUDE, { ...CODEX, modello_grande: null }], "GET /api/chat/modelli": [modello(CLAUDE, "default", "Predefinito"), ...MODELLI_CODEX] })
    expect(corpoDellaNuova(chiamate)).toEqual({ avvio: "primo-giro", modello: "codex/gpt-6-luna", effort: "low" })
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
    const modelli = [modello(CLAUDE, "default", "default"), MODELLO_MANGO]
    const chiamate = await pagina("classifica", PROFILO_FATTO([{ piattaforma: "tiktok", nome: "@alice.cucina" }]), { "GET /api/chat/modelli": modelli })
    fireEvent.click(await screen.findByRole("button", { name: "Leggi i dati di TikTok" }))
    await waitFor(() => expect(chiamate.find((c) => c.metodo === "POST" && c.percorso === "/api/chat")?.corpo).toEqual({ testo: "Aggiorna i dati di TikTok.", modello: "default" }))
    expect(JSON.parse(window.localStorage.getItem("mango-animation.chat.impostazioni") ?? "null")).toEqual({ modello: "mango-code/toq", effort: "low" })
  })

  describe("la lettura del canale va a un motore che ha il browser", () => {
    const corpo = (chiamate: Chiamata[]) => chiamate.find((c) => c.metodo === "POST" && c.percorso === "/api/chat")?.corpo
    const TIKTOK = PROFILO_FATTO([{ piattaforma: "tiktok", nome: "@alice.cucina" }])
    const modelli = [modello(CLAUDE, "default", "Predefinito"), MODELLO_MANGO, ...MODELLI_CODEX]

    it("se il creator ha scelto un motore che il browser ce l'ha, resta con la sua scelta", async () => {
      window.localStorage.setItem("mango-animation.chat.impostazioni", JSON.stringify({ modello: "codex/gpt-6-luna", effort: "low" }))
      const motori = [CLAUDE, MANGO, { ...CODEX, capacita: { ...CODEX.capacita, browser: true } }]
      const chiamate = await pagina("classifica", TIKTOK, { "GET /api/chat/motori": motori, "GET /api/chat/modelli": modelli })
      fireEvent.click(await screen.findByRole("button", { name: "Leggi i dati di TikTok" }))
      await waitFor(() => expect(corpo(chiamate)).toEqual({ testo: "Aggiorna i dati di TikTok.", modello: "codex/gpt-6-luna", effort: "low" }))
    })

    it("altrimenti va al primo motore pronto che ce l'ha, col suo modello predefinito", async () => {
      window.localStorage.setItem("mango-animation.chat.impostazioni", JSON.stringify({ modello: "codex/gpt-6-luna", effort: "low" }))
      const motori = [{ ...CLAUDE, pronto: false }, MANGO, CODEX, { ...CLAUDE, id: "altro", nome: "Altro", nelle_frasi: "Altro", prefisso: "altro/" }]
      const chiamate = await pagina("classifica", TIKTOK, { "GET /api/chat/motori": motori, "GET /api/chat/modelli": [...modelli, modello({ ...CLAUDE, id: "altro" }, "altro/x", "Altro X")] })
      fireEvent.click(await screen.findByRole("button", { name: "Leggi i dati di TikTok" }))
      await waitFor(() => expect(corpo(chiamate)).toEqual({ testo: "Aggiorna i dati di TikTok.", modello: "altro/x" }))
      expect(JSON.parse(window.localStorage.getItem("mango-animation.chat.impostazioni") ?? "null")).toEqual({ modello: "codex/gpt-6-luna", effort: "low" })
    })

    it("se nessun motore ce l'ha, la richiesta parte con la scelta del creator, senza promettere un motore", async () => {
      window.localStorage.setItem("mango-animation.chat.impostazioni", JSON.stringify({ modello: "mango-code/toq", effort: null }))
      const chiamate = await pagina("classifica", TIKTOK, { "GET /api/chat/motori": [{ ...CLAUDE, capacita: { ...CLAUDE.capacita, browser: false } }, MANGO], "GET /api/chat/modelli": modelli })
      fireEvent.click(await screen.findByRole("button", { name: "Leggi i dati di TikTok" }))
      await waitFor(() => expect(corpo(chiamate)).toEqual({ testo: "Aggiorna i dati di TikTok.", modello: "mango-code/toq" }))
    })
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
