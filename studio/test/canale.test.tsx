// La voce «Canale»: Pubblico, Classifica e Crescita sono tre schede di una sola voce, che compare in barra solo quando c'è un canale letto.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { installaEventi, installaRete } from "./rete"

const LETTO = {
  ultima: { lettura: "2026-11-03-1000", quando: "2026-11-03T10:00:00" },
  letture: [{ lettura: "2026-11-03-1000", quando: "2026-11-03T10:00:00", completa: true, mancano: [] }],
  profilo: { nome: "esempio", follower: 640, mi_piace: 5200, video: 1 },
  video: [{ id: "1", slug: null, titolo: "Primo", pubblicato: "2026-10-05T13:25", visualizzazioni: 1000, mi_piace: 80, commenti: 2, commenti_letti: 0, variazione: null }],
}
const NON_LETTO = { ultima: null, letture: [], profilo: null, video: [] }
const CLASSIFICA_VUOTA = { quando: null, io: null, quando_io: null, come: [], righe: [] }
const CRESCITA_VUOTA = { quando: null }

function rete(canale: unknown, extra: Record<string, unknown> = {}) {
  return installaRete({
    "GET /api/profilo": { valido: true, presente: true, canali: [{ piattaforma: "tiktok", nome: "@esempio" }], profilo: {}, problemi: [] },
    "GET /api/video": [],
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: null, ultima: null },
    "GET /api/arrivi": { in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], firewall: "bloccato", pronto: false, motivo: null },
    "GET /api/chat": [],
    "GET /api/chat/modelli": [],
    "GET /api/chat/comandi": [],
    "GET /api/canale/tiktok": canale,
    "GET /api/canale/tiktok/classifica": CLASSIFICA_VUOTA,
    "GET /api/canale/tiktok/crescita": CRESCITA_VUOTA,
    "GET /api/canale/tiktok/andamento": [],
    "GET /api/canale/tiktok/messaggi": { quando: "2026-11-03T10:00:00", conversazioni: [] },
    "GET /api/canale/tiktok/commenti": { quando: "2026-11-03T10:00:00", video: "", commenti: [], nuovi: [] },
    "GET /api/consumi": { pronto: true, video: {} },
    "POST /api/chat": { id: "c1" },
    ...extra,
  })
}

// Le copie dei dati vivono nel modulo: ogni prova parte da un modulo nuovo, come quelle del primo giro.
async function studio(hash: string, canale: unknown, extra: Record<string, unknown> = {}) {
  const finta = rete(canale, extra)
  vi.resetModules()
  window.localStorage.setItem("mango-animation.primo-giro", "saltato")
  window.location.hash = hash
  ;(await import("../src/lingua")).scegliLingua("it")
  const { App } = await import("../src/App")
  render(<App />)
  return finta
}

const menu = () => screen.getByRole("navigation", { name: "Sezioni" })

let eventi: ReturnType<typeof installaEventi>
beforeEach(() => {
  eventi = installaEventi()
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("la voce «Canale» nella barra", () => {
  it("senza un canale letto non c'è, e la barra ha Video, Girato, Produzione e Impostazioni", async () => {
    await studio("#/video", NON_LETTO)
    await screen.findByRole("heading", { name: "Video" })
    await waitFor(() => expect(within(menu()).getAllByRole("link").map((l) => l.textContent)).toEqual(["Video", "Girato", "Produzione", "Impostazioni"]))
    // Le voci di prima non sono più in barra, e nemmeno la lingua, il tema e la cartella dei dati.
    expect(screen.queryByRole("link", { name: "Pubblico" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Stile" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Motori" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Lingua/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Tema/ })).toBeNull()
  })

  it("con un canale letto compare, tra Girato e Produzione, e porta a Pubblico", async () => {
    await studio("#/video", LETTO)
    const voce = await within(menu()).findByRole("link", { name: "Canale" })
    expect(voce).toHaveAttribute("href", "#/canale")
    expect(within(menu()).getAllByRole("link").map((l) => l.textContent)).toEqual(["Video", "Girato", "Canale", "Produzione", "Impostazioni"])
  })

  it("compare quando arriva la prima lettura, senza ricaricare lo studio", async () => {
    const { imposta } = await studio("#/video", NON_LETTO)
    await screen.findByRole("heading", { name: "Video" })
    expect(within(menu()).queryByRole("link", { name: "Canale" })).toBeNull()
    imposta("GET /api/canale/tiktok", LETTO)
    eventi.istanze.at(-1)!.manda({ tipo: "canale", canale: "tiktok" })
    expect(await within(menu()).findByRole("link", { name: "Canale" })).toBeInTheDocument()
  })

  it("è accesa su ognuna delle tre schede, anche dagli indirizzi di prima", async () => {
    for (const hash of ["#/pubblico", "#/classifica", "#/crescita", "#/canale/classifica"]) {
      await studio(hash, LETTO)
      expect(await within(menu()).findByRole("link", { name: "Canale" })).toHaveAttribute("aria-current", "page")
      document.body.innerHTML = ""
    }
  })
})

describe("le tre schede", () => {
  it("dagli indirizzi di prima si arriva alla scheda giusta; le schede sono collegamenti e ce n'è una sola accesa", async () => {
    for (const [hash, nome] of [["#/pubblico", "Pubblico"], ["#/classifica", "Classifica"], ["#/crescita", "Crescita"]] as const) {
      await studio(hash, LETTO)
      const schede = await screen.findByRole("navigation", { name: "Schede del canale" })
      expect(within(schede).getAllByRole("link").map((l) => l.textContent)).toEqual(["Pubblico", "Classifica", "Crescita"])
      expect(within(schede).getByRole("link", { name: "Classifica" })).toHaveAttribute("href", "#/canale/classifica")
      expect(within(schede).getByRole("link", { name: nome })).toHaveAttribute("aria-current", "page")
      expect(within(schede).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page")).toHaveLength(1)
      document.body.innerHTML = ""
    }
  })

  it("la pagina ha un titolo solo, «Canale»: le intestazioni delle schede non si ripetono", async () => {
    await studio("#/pubblico", LETTO)
    await screen.findByRole("heading", { name: "I video usciti" })
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Canale"])
    expect(screen.queryByRole("heading", { name: "Pubblico" })).toBeNull()
  })

  it("toccare una scheda cambia l'indirizzo e il contenuto", async () => {
    await studio("#/canale", LETTO, { "GET /api/canale/tiktok/crescita": CRESCITA_VUOTA })
    await screen.findByRole("heading", { name: "I video usciti" })
    expect(screen.getByRole("link", { name: "Crescita" })).toHaveAttribute("href", "#/canale/crescita")
    window.location.hash = "#/canale/crescita"
    expect(await screen.findByText(/Qui trovi il piano per far crescere il canale/)).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "I video usciti" })).toBeNull()
  })

  it("scegliere un video nella tabella resta sulla scheda Pubblico, con il video nell'indirizzo", async () => {
    await studio("#/canale/pubblico", LETTO)
    fireEvent.click((await screen.findAllByText("Primo"))[0]!)
    await waitFor(() => expect(window.location.hash).toBe("#/canale/pubblico?video=1"))
  })

  it("una scheda senza dati dice cosa chiedere, senza un secondo titolo, e la richiesta è quella della scheda", async () => {
    const { chiamate } = await studio("#/classifica", LETTO)
    expect(await screen.findByText("La classifica non è ancora stata fatta: la chat la prepara quando glielo chiedi.")).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Canale"])
    fireEvent.click(screen.getByRole("button", { name: "Fai la classifica" }))
    await waitFor(() => expect(chiamate.filter((c) => c.metodo === "POST" && c.percorso === "/api/chat").map((c) => (c.corpo as { testo: string }).testo)).toEqual(["Rifai la classifica dei profili di TikTok."]))
  })

  it("senza un canale letto, da ogni scheda, una pagina sola: nessuna scheda da girare a vuoto", async () => {
    await studio("#/crescita", NON_LETTO)
    expect(await screen.findByRole("heading", { level: 1, name: "Canale" })).toBeInTheDocument()
    expect(screen.queryByRole("navigation", { name: "Schede del canale" })).toBeNull()
    expect(screen.getByRole("button", { name: "Leggi i dati di TikTok" })).toBeInTheDocument()
    // La voce c'è finché si sta su quella pagina, perché dice dove si è.
    expect(within(menu()).getByRole("link", { name: "Canale" })).toHaveAttribute("aria-current", "page")
  })
})
