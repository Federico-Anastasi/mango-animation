import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RiquadroStudioDalTelefono } from "../src/girato/RiquadroStudioDalTelefono"
import type { StatoStudioRemoto } from "../src/tipi"
import { installaEventi, installaRete, type Chiamata } from "./rete"

const SVG = "<svg xmlns='http://www.w3.org/2000/svg'/>"
const SPENTO: StatoStudioRemoto = { acceso: false, in_ascolto: true, casa: null, fuori: null, pronto: true, motivo: null }
const ACCESO: StatoStudioRemoto = {
  acceso: true,
  in_ascolto: true,
  casa: { indirizzo: "192.168.1.20:47420", link: "http://192.168.1.20:47420/studio?chiave=k", qr: SVG },
  fuori: { indirizzo: "100.101.102.103:47420", link: "http://100.101.102.103:47420/studio?chiave=k", qr: SVG, pronto: true, motivo: null },
  pronto: true,
  motivo: null,
}

let chiamate: Chiamata[]
let stato: StatoStudioRemoto

function rete(iniziale: StatoStudioRemoto) {
  stato = iniziale
  installaEventi()
  chiamate = installaRete({
    "GET /api/accesso-studio": () => stato,
    "PUT /api/accesso-studio": (c: Chiamata) => (stato = (c.corpo as { acceso: boolean }).acceso ? ACCESO : SPENTO),
    "POST /api/accesso-studio/chiave": () => stato,
    "POST /api/arrivi/controlla": {},
    "GET /api/arrivi": { pronto: true },
  }).chiamate
}

afterEach(() => vi.unstubAllGlobals())
beforeEach(() => {
  chiamate = []
})

describe("lo studio dal telefono", () => {
  it("spento di base: lo dice e offre di accenderlo; accendendolo mostra i link e i codici", async () => {
    rete(SPENTO)
    const { container } = render(<RiquadroStudioDalTelefono />)
    expect(await screen.findByText(/Spento/)).toBeInTheDocument()
    expect(container).toHaveTextContent("i video, il montaggio e la chat.")
    expect(screen.queryByAltText(/codice/i)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Accendi" }))
    await waitFor(() => expect(chiamate.find((c) => c.metodo === "PUT")?.corpo).toEqual({ acceso: true }))
    expect(await screen.findByText("192.168.1.20:47420")).toBeInTheDocument()
    expect(screen.getByText("100.101.102.103:47420")).toBeInTheDocument()
    expect(screen.getAllByRole("img", { name: /codice/i })).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: /Copia il link/ })).toHaveLength(2)
  })

  it("acceso: avverte che chi ha il link comanda il computer attraverso la chat, senza nominare un programma, e si può spegnere", async () => {
    rete(ACCESO)
    const { container } = render(<RiquadroStudioDalTelefono />)
    expect(await screen.findByText(/può far lavorare la chat sul tuo computer: non darlo a nessuno/i)).toBeInTheDocument()
    expect(container).not.toHaveTextContent("Claude")
    fireEvent.click(screen.getByRole("button", { name: "Spegni" }))
    await waitFor(() => expect(chiamate.find((c) => c.metodo === "PUT")?.corpo).toEqual({ acceso: false }))
    expect(await screen.findByText(/Spento/)).toBeInTheDocument()
  })

  it("«Rifai la chiave» chiede il link nuovo e dice che i telefoni già entrati devono rientrare", async () => {
    rete(ACCESO)
    render(<RiquadroStudioDalTelefono />)
    fireEvent.click(await screen.findByRole("button", { name: "Rifai la chiave" }))
    await waitFor(() => expect(chiamate.some((c) => c.metodo === "POST" && c.percorso === "/api/accesso-studio/chiave")).toBe(true))
    expect(screen.getByText(/rientrare/)).toBeInTheDocument()
  })

  it("senza Tailscale sul computer dice cosa serve per uscire di casa", async () => {
    rete({ ...ACCESO, fuori: null })
    render(<RiquadroStudioDalTelefono />)
    expect(await screen.findByText(/serve Tailscale/)).toBeInTheDocument()
    expect(screen.getAllByRole("img", { name: /codice/i })).toHaveLength(1)
  })

  it("se Windows non lascia entrare da Tailscale lo dice, senza il codice, e «Controlla di nuovo» rifà il controllo", async () => {
    rete({ ...ACCESO, fuori: { ...ACCESO.fuori!, pronto: false, motivo: "Windows non lascia entrare dalla rete di Tailscale." } })
    render(<RiquadroStudioDalTelefono />)
    expect(await screen.findByText(/Windows non lascia entrare dalla rete di Tailscale/)).toBeInTheDocument()
    expect(screen.getAllByRole("img", { name: /codice/i })).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Controlla di nuovo" }))
    await waitFor(() => expect(chiamate.some((c) => c.metodo === "POST" && c.percorso === "/api/arrivi/controlla")).toBe(true))
  })

  it("un errore del server si legge nel riquadro", async () => {
    rete(SPENTO)
    render(<RiquadroStudioDalTelefono />)
    await screen.findByText(/Spento/)
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errore: "Non riesco a salvare." }), { status: 500 })))
    fireEvent.click(screen.getByRole("button", { name: "Accendi" }))
    expect(await screen.findByText("Non riesco a salvare.")).toBeInTheDocument()
  })

  it("aperto dal telefono, cioè non da 127.0.0.1, non c'è: l'accesso si cambia solo dal computer", async () => {
    rete(ACCESO)
    vi.stubGlobal("location", { hostname: "192.168.1.20" })
    const { container } = render(<RiquadroStudioDalTelefono />)
    await Promise.resolve()
    expect(container).toBeEmptyDOMElement()
    expect(chiamate).toEqual([])
  })
})
