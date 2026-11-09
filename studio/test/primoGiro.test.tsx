// Il primo giro: la chat si apre da sola senza profilo, si salta, e le pagine dei canali senza dati portano il creator da Claude.
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { installaEventi, installaRete, type Chiamata } from "./rete"

const CHIAVE = "mango-animation.primo-giro"
const PROFILO_VUOTO = { valido: true, presente: false, canali: [], problemi: [] }
const PROFILO_FATTO = (canali: Array<{ piattaforma: string; nome?: string }>) => ({ valido: true, presente: true, canali, problemi: [] })

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

describe("le pagine dei canali senza dati", () => {
  async function pagina(vista: string, profilo: unknown) {
    const chiamate = rete(profilo)
    vi.resetModules()
    window.localStorage.setItem(CHIAVE, "saltato")
    window.location.hash = `#/${vista}`
    ;(await import("../src/lingua")).scegliLingua("it")
    const { App } = await import("../src/App")
    render(<App />)
    return chiamate
  }

  it("senza un canale dicono cosa fanno e portano a collegarlo", async () => {
    for (const [vista, titolo] of [["pubblico", "Pubblico"], ["classifica", "Classifica"], ["crescita", "Crescita"]] as const) {
      const chiamate = await pagina(vista, PROFILO_FATTO([]))
      expect(await screen.findByRole("heading", { level: 1, name: titolo })).toBeInTheDocument()
      fireEvent.click(await screen.findByRole("button", { name: "Collega un canale" }))
      await waitFor(() => expect(messaggiAClaude(chiamate)[0]).toMatch(/collegare il mio canale/))
      document.body.innerHTML = ""
    }
  })

  it("con TikTok chiedono a Claude di leggerlo", async () => {
    const chiamate = await pagina("classifica", PROFILO_FATTO([{ piattaforma: "tiktok", nome: "@alice.cucina" }]))
    fireEvent.click(await screen.findByRole("button", { name: "Leggi i dati di TikTok" }))
    await waitFor(() => expect(messaggiAClaude(chiamate)).toEqual(["Rifai la classifica dei profili di TikTok."]))
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
