// «Guarda» dell'agente dentro l'app: il server manda `vai` e la finestra cambia pagina, senza un secondo studio nel browser.
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { indirizzoDelVai } from "../src/vaiDelServer"
import { installaEventi, installaRete } from "./rete"

describe("indirizzoDelVai", () => {
  it("la pagina di un video, con la scheda se è una scheda che esiste", () => {
    expect(indirizzoDelVai({ video: "orto" })).toBe("#/video/orto")
    expect(indirizzoDelVai({ video: "orto", scheda: "slide" })).toBe("#/video/orto/slide")
    expect(indirizzoDelVai({ video: "orto", scheda: "inventata" })).toBe("#/video/orto")
  })

  it("un file di un video apre la scheda che lo mostra, come un collegamento nella chat", () => {
    expect(indirizzoDelVai({ percorso: "video/orto/uscite/con-copertina.mp4" })).toBe("#/video/orto/copertina")
    expect(indirizzoDelVai({ percorso: "video/orto/uscite/prova.mp4" })).toBe("#/video/orto/prova")
    expect(indirizzoDelVai({ percorso: "video/orto/uscite/finale.mp4" })).toBe("#/video/orto/montaggio")
    expect(indirizzoDelVai({ percorso: "video/orto/uscite/pubblicato.mp4" })).toBe("#/video/orto/file")
  })

  it("un file del girato apre il Girato su quel file", () => {
    expect(indirizzoDelVai({ percorso: "grezzo/2026-10-06/a b.mp4" })).toBe("#/girato?file=2026-10-06%2Fa+b.mp4")
  })

  it("altro non ha una pagina", () => {
    expect(indirizzoDelVai({ percorso: "canali/nota.txt" })).toBeNull()
    expect(indirizzoDelVai({})).toBeNull()
  })
})

describe("lo studio ascolta vai", () => {
  let eventi: ReturnType<typeof installaEventi>
  beforeEach(() => {
    eventi = installaEventi()
    installaRete({
      "GET /api/profilo": { valido: true, presente: true, canali: [], profilo: {}, problemi: [] },
      "GET /api/video": [],
      "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
      "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: null, ultima: null },
      "GET /api/arrivi": { in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], firewall: "bloccato", pronto: false, motivo: null },
      "GET /api/chat": [],
      "GET /api/chat/modelli": [],
      "GET /api/chat/comandi": [],
      "GET /api/stile": {},
      "GET /api/grezzo": [],
    })
    window.location.hash = "#/stile"
  })
  afterEach(() => vi.unstubAllGlobals())

  it("un messaggio vai porta la finestra sulla pagina chiesta", async () => {
    const { App } = await import("../src/App")
    render(<App />)
    await screen.findByRole("navigation", { name: "Sezioni" })
    await waitFor(() => expect(eventi.istanze.length).toBeGreaterThan(0))
    eventi.istanze[0]!.manda({ tipo: "vai", video: "orto", scheda: "scheda" })
    await waitFor(() => expect(window.location.hash).toBe("#/video/orto/scheda"))
    eventi.istanze[0]!.manda({ tipo: "vai", percorso: "grezzo/2026-10-06/a.mp4" })
    await waitFor(() => expect(window.location.hash).toBe("#/girato?file=2026-10-06%2Fa.mp4"))
  })

  it("su uno schermo stretto, dove la chat copre la vista, la chat si chiude per far vedere la pagina", async () => {
    const { apriChat } = await import("../src/chat/pannello")
    const { App } = await import("../src/App")
    window.innerWidth = 400
    apriChat()
    render(<App />)
    await screen.findByRole("complementary", { name: "Chat" })
    eventi.istanze[0]!.manda({ tipo: "vai", video: "orto" })
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Chat" })).toBeNull())
    window.innerWidth = 1024
  })
})
