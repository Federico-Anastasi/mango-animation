// La barra in alto segue la cornice delle pagine a chat chiusa; con la chat aperta di fianco va da bordo a bordo.
import { act, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { installaEventi, installaRete } from "./rete"

beforeEach(() => {
  installaEventi()
  installaRete({
    "GET /api/profilo": { valido: true, presente: true, canali: [], profilo: {}, problemi: [] },
    "GET /api/video": [],
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: null, ultima: null },
    "GET /api/arrivi": { in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], firewall: "bloccato", pronto: false, motivo: null },
    "GET /api/canale/tiktok": { ultima: null, letture: [], profilo: null, video: [] },
    "GET /api/chat": [],
    "GET /api/chat/motori": [],
    "GET /api/chat/modelli": [],
    "GET /api/chat/comandi": [],
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

async function apri(vista: string, rotte: Record<string, unknown> = {}) {
  installaRete({
    "GET /api/profilo": { valido: true, presente: true, canali: [], profilo: {}, problemi: [] },
    "GET /api/video": [],
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: null, ultima: null },
    "GET /api/arrivi": { in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], firewall: "bloccato", pronto: false, motivo: null },
    "GET /api/canale/tiktok": { ultima: null, letture: [], profilo: null, video: [] },
    "GET /api/chat": [],
    "GET /api/chat/motori": [],
    "GET /api/chat/modelli": [],
    "GET /api/chat/comandi": [],
    ...rotte,
  })
  vi.resetModules()
  window.localStorage.setItem("mango-animation.primo-giro", "saltato")
  window.location.hash = vista
  ;(await import("../src/lingua")).scegliLingua("it")
  const { App } = await import("../src/App")
  render(<App />)
  return screen.findByRole("banner")
}

describe("la barra in alto", () => {
  it("ha la scritta, le pagine, gli stati e per ultimo l'ingranaggio delle impostazioni", async () => {
    const barra = await apri("#/video", { "GET /api/arrivi": { in_ascolto: true, indirizzo: "192.168.1.20:47420", qr: null, errore: null, ultimi: [], firewall: "consentito", pronto: true, motivo: null } })
    expect(within(barra).getByTestId("marchio")).toHaveTextContent("mango animation")
    const pagine = within(barra).getByRole("navigation", { name: "Sezioni" })
    expect(within(pagine).getAllByRole("link").map((l) => l.textContent)).toEqual(["Video", "Girato", "Produzione"])
    expect(within(pagine).queryByRole("link", { name: "Impostazioni" })).toBeNull()
    expect(await within(barra).findByRole("link", { name: /Telefono pronto/ })).toBeInTheDocument()
    const ingranaggio = within(barra).getByRole("link", { name: "Impostazioni" })
    expect(ingranaggio).toHaveAttribute("href", "#/impostazioni")
    expect(ingranaggio).not.toHaveTextContent(/\S/)
    const interattivi = within(barra).getAllByRole("link").concat(within(barra).getAllByRole("button"))
    const ultimo = interattivi.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).at(-1)
    expect(ultimo).toBe(ingranaggio)
  })

  it("l'ingranaggio è acceso nelle impostazioni, e la pagina attiva ha il suo segno", async () => {
    const barra = await apri("#/impostazioni")
    expect(within(barra).getByRole("link", { name: "Impostazioni" })).toHaveAttribute("aria-current", "page")
    expect(within(barra).getAllByRole("link", { current: "page" })).toHaveLength(1)
  })

  it("ogni stato ha il suo punto: verde pronto, grigio spento, ambra in corso, rosso solo la registrazione", async () => {
    const barra = await apri("#/video", {
      "GET /api/arrivi": { in_ascolto: true, indirizzo: "192.168.1.20:47420", qr: null, errore: null, ultimi: [], firewall: "consentito", pronto: true, motivo: null },
      "GET /api/lavori": { in_corso: { id: 7, comando: "prepara", slug: null, iniziato: "2026-11-02T10:00:00" }, in_coda: [], finiti: [] },
    })
    const punto = (nome: RegExp) => within(within(barra).getByRole(nome.source.startsWith("Tele") ? "link" : "button", { name: nome })).getByTestId("punto")
    expect(await within(barra).findByRole("link", { name: /Telefono pronto/ })).toBeInTheDocument()
    expect(punto(/Telefono pronto/)).toHaveAttribute("data-punto", "pronto")
    expect(punto(/Registra/)).toHaveAttribute("data-punto", "spento")
    expect(punto(/Chat/)).toHaveAttribute("data-punto", "spento")
    expect(await within(barra).findByRole("button", { name: /Lavoro in corso/ })).toBeInTheDocument()
    expect(within(within(barra).getByRole("button", { name: /Lavoro in corso/ })).getByTestId("punto")).toHaveAttribute("data-punto", "in-corso")
  })

  it("registrando, il punto è rosso", async () => {
    const barra = await apri("#/video", {
      "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: { modo: "voce", iniziata: "2026-11-02T10:00:00", file: ["a.mp4"] }, ultima: null },
    })
    const bottone = await within(barra).findByRole("button", { name: "Sto registrando" })
    expect(within(bottone).getByTestId("punto")).toHaveAttribute("data-punto", "registra")
  })


  it("segue la cornice a chat chiusa e occupa tutta la larghezza con la chat aperta", async () => {
    vi.resetModules()
    window.localStorage.setItem("mango-animation.primo-giro", "saltato")
    window.location.hash = "#/video"
    ;(await import("../src/lingua")).scegliLingua("it")
    const { App } = await import("../src/App")
    const { apriChat, chiudiChat } = await import("../src/chat/pannello")
    render(<App />)
    const barra = await screen.findByRole("banner")
    expect(barra).toHaveAttribute("data-chat", "chiusa")
    act(() => apriChat())
    expect(barra).toHaveAttribute("data-chat", "aperta")
    act(() => chiudiChat())
    expect(barra).toHaveAttribute("data-chat", "chiusa")
  })
})
