// La barra in alto segue la cornice delle pagine a chat chiusa; con la chat aperta di fianco va da bordo a bordo.
import { act, render, screen } from "@testing-library/react"
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
    "GET /api/chat/modelli": [],
    "GET /api/chat/comandi": [],
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("la barra in alto", () => {
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
