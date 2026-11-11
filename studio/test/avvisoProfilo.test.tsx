// L'avviso del profilo nella cornice: compare quando `profilo.json` non passa lo schema e si aggiorna con l'evento `profilo`.
import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { Cornice } from "../src/cornice/Cornice"
import { scegliLingua } from "../src/lingua"
import { errore, installaEventi, installaRete } from "./rete"

let eventi: ReturnType<typeof installaEventi>
let rete: ReturnType<typeof installaRete>

const PROBLEMI = ["macchina.scheda_video: deve essere un numero o null", "canali[0].piattaforma: manca"]

beforeEach(() => {
  eventi = installaEventi()
  window.location.hash = ""
  rete = installaRete({
    "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: null, ultima: null },
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/arrivi": { in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], firewall: "bloccato", pronto: false, motivo: null },
    "GET /api/profilo": { valido: true, presente: true, canali: [], profilo: {}, problemi: [] },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe("l'avviso del profilo", () => {
  it("con un profilo che va non c'è", async () => {
    render(<Cornice vista="video" />)
    await waitFor(() => expect(rete.chiamate.some((c) => c.percorso === "/api/profilo")).toBe(true))
    expect(screen.queryByRole("status", { name: /profilo/i })).toBeNull()
  })

  it("con un profilo non valido dice cosa non va e che si può correggere dalla chat o a mano", async () => {
    rete.imposta("GET /api/profilo", { valido: false, presente: true, canali: [], profilo: {}, problemi: PROBLEMI })
    render(<Cornice vista="video" />)
    const avviso = await screen.findByRole("status", { name: "Profilo da correggere" })
    expect(avviso).toHaveTextContent("file a mano")
    expect(avviso).toHaveTextContent("chat")
    for (const p of PROBLEMI) expect(avviso).toHaveTextContent(p)
  })

  it("compare e sparisce quando arriva l'evento del profilo, senza ricaricare la pagina", async () => {
    render(<Cornice vista="video" />)
    await waitFor(() => expect(eventi.istanze.length).toBeGreaterThan(0))
    await waitFor(() => expect(rete.chiamate.filter((c) => c.percorso === "/api/profilo")).toHaveLength(1))
    expect(screen.queryByRole("status", { name: "Profilo da correggere" })).toBeNull()

    rete.imposta("GET /api/profilo", { valido: false, presente: true, canali: [], profilo: {}, problemi: PROBLEMI })
    act(() => eventi.istanze[0]!.manda({ tipo: "profilo" }))
    expect(await screen.findByRole("status", { name: "Profilo da correggere" })).toBeInTheDocument()

    rete.imposta("GET /api/profilo", { valido: true, presente: true, canali: [], profilo: {}, problemi: [] })
    act(() => eventi.istanze[0]!.manda({ tipo: "profilo" }))
    await waitFor(() => expect(screen.queryByRole("status", { name: "Profilo da correggere" })).toBeNull())
  })

  it("se il server non sa dire del profilo, niente avviso", async () => {
    rete.imposta("GET /api/profilo", () => errore(404, "Non trovato"))
    render(<Cornice vista="video" />)
    await waitFor(() => expect(rete.chiamate.some((c) => c.percorso === "/api/profilo")).toBe(true))
    expect(screen.queryByRole("status", { name: /profil/i })).toBeNull()
  })

  it("in inglese parla inglese e rilegge le frasi del server nella lingua nuova", async () => {
    rete.imposta("GET /api/profilo", ({ intestazioni }: { intestazioni: Record<string, string> }) => ({
      valido: false,
      presente: true,
      canali: [],
      problemi: [intestazioni["X-Lingua"] === "en" ? "channels[0].platform: missing" : "canali[0].piattaforma: manca"],
    }))
    render(<Cornice vista="video" />)
    expect(await screen.findByText(/canali\[0\]\.piattaforma: manca/)).toBeInTheDocument()
    act(() => scegliLingua("en"))
    const avviso = await screen.findByRole("status", { name: "Profile needs fixing" })
    expect(avviso).toHaveTextContent("chat")
    await waitFor(() => expect(avviso).toHaveTextContent("channels[0].platform: missing"))
  })
})
