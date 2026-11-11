import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Crescita } from "../src/crescita/Crescita"
import type { Crescita as DatiCrescita, PuntoAndamento, StatoCanale } from "../src/tipi"
import { installaEventi, installaRete } from "./rete"

const PIANO: DatiCrescita = {
  quando: "2026-10-25",
  partenza: { data: "2026-10-25T09:38", follower: 626 },
  obiettivo: "atteso",
  scenari: [
    { nome: "prudente", tappe: [{ data: "2027-01-25T12:00", follower: 1400 }, { data: "2027-10-25T12:00", follower: 4500 }] },
    { nome: "atteso", tappe: [{ data: "2027-01-25T12:00", follower: 2000 }, { data: "2027-10-25T12:00", follower: 10000 }] },
  ],
  settimana: [{ giorno: "mercoledì", cosa: "lettura e controllo", controllo: true }],
  tipi: [{ nome: "Le mie prove", spiega: "il mio computer", video: ["tre-forni"] }],
  mix: ["Tre su quattro sono prove mie."],
  consigli: [{ titolo: "Serie con un nome", testo: "Una serie per volta." }],
  novita: [
    { nome: "Sondaggi nei commenti", cosa: "un sondaggio", per_te: "fa commentare", giudizio: "sì", fonte: "https://esempio.test" },
    { nome: "Video generati", cosa: "da una foto", per_te: "niente di finto", giudizio: "no" },
  ],
  come: ["Dalle letture del canale."],
}

const punto = (quando: string, follower: number): PuntoAndamento => ({ quando, follower, mi_piace: null, video: null })
const STATO: StatoCanale = {
  ultima: null,
  letture: [],
  profilo: null,
  video: [{ id: "1", slug: "tre-forni", pubblicato: "2026-10-04T13:25", visualizzazioni: 40000, nuovi_follower: 200, commenti_letti: 0, variazione: null }],
}

const rete = (piano: unknown) =>
  installaRete({
    "GET /api/canale/tiktok/crescita": piano,
    "GET /api/canale/tiktok/andamento": [punto("2026-11-01T10:00", 440), punto("2026-11-15T10:00", 640)],
    "GET /api/canale/tiktok": STATO,
    "GET /api/video": [],
  })

beforeEach(() => {
  installaEventi()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Crescita con la rilettura fallita", () => {
  it("se la rilettura del piano fallisce e restano i dati di prima, lo dice con la data del piano", async () => {
    const eventi = installaEventi()
    const { imposta } = rete(PIANO)
    render(<Crescita />)
    await screen.findByRole("heading", { name: "Questa settimana" })
    imposta("GET /api/canale/tiktok/crescita", () => new Response(JSON.stringify({ errore: "Il server non risponde." }), { status: 500 }))
    act(() => eventi.istanze.at(-1)!.manda({ tipo: "canale" }))
    expect(await screen.findByText("Dati del 25 ott 2026: l'ultima rilettura non è riuscita.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Questa settimana" })).toBeInTheDocument()
  })
})

describe("Crescita", () => {
  // Per prima: finché nessuna prova ha riempito la copia delle letture, qui sono ancora in arrivo.
  it("finché le letture dei follower non sono arrivate aspetta, e non dice che manca quella del lunedì", async () => {
    rete(PIANO)
    const vera = globalThis.fetch
    let arriva!: () => void
    const attesa = new Promise<void>((risolvi) => (arriva = risolvi))
    vi.stubGlobal("fetch", (indirizzo: string | URL | Request, init?: RequestInit) => (String(indirizzo).includes("/andamento") ? attesa.then(() => vera(indirizzo, init)) : vera(indirizzo, init)))
    render(<Crescita />)
    await new Promise((risolvi) => setTimeout(risolvi, 50))
    expect(screen.queryByText(/nessuna lettura copre il lunedì/)).toBeNull()
    arriva()
    expect(await screen.findByRole("heading", { name: "Questa settimana" })).toBeInTheDocument()
  })

  it("mette i numeri veri accanto al piano: follower di oggi, tappe, tipi di video, novità divise per giudizio", async () => {
    rete(PIANO)
    render(<Crescita />)
    await waitFor(() => expect(screen.getByRole("heading", { name: "Da dove vieni" })).toBeInTheDocument())
    const oggi = screen.getByRole("heading", { name: "Da dove vieni" }).parentElement!
    expect(oggi).toHaveTextContent("640followerlettura del 15 nov 2026, 10:00")
    expect(oggi).toHaveTextContent("+100negli ultimi 7 giorni")
    expect(oggi).toHaveTextContent("100follower a settimanain media dal 1 nov 2026")

    const tappe = screen.getByRole("table", { name: "Le tappe, in follower" })
    expect(within(tappe).getByRole("row", { name: /atteso/ })).toHaveTextContent("2.00010.000")
    expect(within(tappe).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["scenario", "3 mesi25 gen 2027", "1 anno25 ott 2027"])

    const tipi = screen.getByRole("row", { name: /Le mie prove/ })
    expect(tipi).toHaveTextContent("5,0")
    expect(tipi).toHaveTextContent("100%")

    expect(screen.getByRole("heading", { name: "Da usare adesso" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Non per te" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Più avanti" })).toBeNull()
    expect(screen.getByRole("link", { name: "fonte" })).toHaveAttribute("href", "https://esempio.test")
  })

  it("sul grafico, col mouse sopra una lettura, dice data e follower veri e dove diceva di essere lo scenario nello stesso giorno", async () => {
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(600)
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 600, bottom: 260, width: 600, height: 260, x: 0, y: 0, toJSON: () => ({}) })
    rete(PIANO)
    render(<Crescita />)
    const grafico = await screen.findByRole("img", { name: /Follower letti nel tempo/ })
    expect(screen.queryByRole("tooltip")).toBeNull()

    fireEvent.mouseMove(grafico, { clientX: 230 })
    const suggerimento = screen.getByRole("tooltip")
    expect(suggerimento).toHaveTextContent("15 nov 2026, 10:00")
    expect(suggerimento).toHaveTextContent("letture 640")
    expect(suggerimento).toHaveTextContent(/scenario atteso 9[34]\d/)

    fireEvent.mouseLeave(grafico)
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("sul grafico, lontano da una lettura, dà solo lo scenario: una lettura mancante non si inventa", async () => {
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(600)
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 600, bottom: 260, width: 600, height: 260, x: 0, y: 0, toJSON: () => ({}) })
    rete(PIANO)
    render(<Crescita />)
    const grafico = await screen.findByRole("img", { name: /Follower letti nel tempo/ })
    fireEvent.mouseMove(grafico, { clientX: 400 })
    const suggerimento = screen.getByRole("tooltip")
    expect(suggerimento).toHaveTextContent(/scenario atteso/)
    expect(suggerimento).not.toHaveTextContent("letture")
  })

  it("accanto ai rapporti per mille, il suggerimento dice da quali follower e visualizzazioni vengono", async () => {
    rete(PIANO)
    render(<Crescita />)
    const riga = await screen.findByRole("row", { name: /Le mie prove/ })
    expect(riga.querySelector("[title]")).toHaveAttribute("title", "200 nuovi follower su 40.000 visualizzazioni")
  })

  it("senza un piano in archivio dice come chiederlo", async () => {
    rete({ quando: null })
    render(<Crescita />)
    await waitFor(() => expect(screen.getByText(/Qui trovi il piano per far crescere il canale/)).toBeInTheDocument())
  })
})
