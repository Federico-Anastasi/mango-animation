import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Classifica } from "../src/classifica/Classifica"
import type { ClassificaCanale } from "../src/tipi"
import { installaEventi, installaRete } from "./rete"

let eventi: ReturnType<typeof installaEventi>

const riga = (posto: number, nome: string, follower: number, mi_piace: number, visualizzazioni: number, punteggio: number) => ({ posto, nome, cosa_fa: `cosa fa ${nome}`, follower, mi_piace, visualizzazioni, punteggio })
const classifica = (extra: Partial<ClassificaCanale> = {}): ClassificaCanale => ({
  quando: "2026-10-08",
  io: "mio_canale",
  quando_io: "2026-10-13T19:19",
  come: ["Vengono da una ricerca."],
  righe: [riga(1, "grande", 175400, 3500000, 800, 5), riga(2, "visto", 300, 2000, 9000, 5), riga(3, "mio_canale", 120, 1100, 875.5, 8)],
  ...extra,
})

const nomi = () => screen.getAllByRole("listitem").map((li) => within(li).getByRole("link").textContent)

beforeEach(() => {
  eventi = installaEventi()
  window.location.hash = ""
})
afterEach(() => vi.unstubAllGlobals())

describe("Classifica con la rilettura fallita", () => {
  it("se la rilettura fallisce e restano i dati di prima, lo dice con la data dei dati", async () => {
    const { imposta } = installaRete({ "GET /api/canale/tiktok/classifica": classifica() })
    render(<Classifica />)
    await waitFor(() => expect(nomi()).toEqual(["@grande", "@visto", "@mio_canale"]))
    imposta("GET /api/canale/tiktok/classifica", () => new Response(JSON.stringify({ errore: "Il server non risponde." }), { status: 500 }))
    act(() => eventi.istanze.at(-1)!.manda({ tipo: "canale" }))
    expect(await screen.findByText("Dati del 8 ott 2026: l'ultima rilettura non è riuscita.")).toBeInTheDocument()
    expect(nomi()).toEqual(["@grande", "@visto", "@mio_canale"])
  })
})

describe("Classifica", () => {
  it("mostra i profili in ordine di punteggio, con i numeri all'italiana e le date delle due letture", async () => {
    installaRete({ "GET /api/canale/tiktok/classifica": classifica() })
    render(<Classifica />)
    await waitFor(() => expect(nomi()).toEqual(["@grande", "@visto", "@mio_canale"]))
    const prima = screen.getAllByRole("listitem")[0]!
    expect(within(prima).getByRole("link")).toHaveAttribute("href", "https://www.tiktok.com/@grande")
    expect(prima).toHaveTextContent("cosa fa grande")
    expect(prima).toHaveTextContent("175.400")
    expect(prima).toHaveTextContent("3.500.000")
    expect(screen.getAllByRole("listitem")[2]).toHaveTextContent("875,5")
    expect(screen.getByText(/8 ott 2026/)).toHaveTextContent("13 ott 2026, 19:19")
    expect(screen.getByText("Vengono da una ricerca.")).toBeInTheDocument()
  })

  it("segna la mia riga e dice a che posto sono per ogni numero", async () => {
    installaRete({ "GET /api/canale/tiktok/classifica": classifica() })
    render(<Classifica />)
    await waitFor(() => expect(nomi()).toHaveLength(3))
    expect(screen.getAllByRole("listitem")[2]).toHaveAttribute("aria-current", "true")
    const mio = screen.getByRole("complementary", { name: "La tua posizione" })
    expect(within(mio).getByText("punteggio").parentElement).toHaveTextContent("3° su 3")
    expect(within(mio).getByText("visualizzazioni").parentElement).toHaveTextContent("2° su 3")
  })

  it("si riordina per un numero, e toccandolo di nuovo si rovescia", async () => {
    installaRete({ "GET /api/canale/tiktok/classifica": classifica() })
    render(<Classifica />)
    await waitFor(() => expect(nomi()).toHaveLength(3))
    const visualizzazioni = screen.getByRole("button", { name: /visualizzazioni/ })
    fireEvent.click(visualizzazioni)
    expect(nomi()).toEqual(["@visto", "@mio_canale", "@grande"])
    expect(visualizzazioni).toHaveAttribute("aria-pressed", "true")
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(/^1/)
    fireEvent.click(visualizzazioni)
    expect(nomi()).toEqual(["@grande", "@mio_canale", "@visto"])
  })

  it("rilegge quando il canale cambia", async () => {
    const rete = installaRete({ "GET /api/canale/tiktok/classifica": classifica() })
    render(<Classifica />)
    await waitFor(() => expect(nomi()).toHaveLength(3))
    rete.imposta("GET /api/canale/tiktok/classifica", classifica({ righe: [riga(1, "mio_canale", 9000, 1100, 875, 3)] }))
    act(() => eventi.istanze[0]!.manda({ tipo: "canale", canale: "tiktok" }))
    await waitFor(() => expect(nomi()).toEqual(["@mio_canale"]))
  })

  it("senza classifica in archivio dice cosa fare", async () => {
    installaRete({ "GET /api/profilo": { valido: true, presente: true, canali: [], profilo: {}, problemi: [] }, "GET /api/canale/tiktok/classifica": classifica({ quando: null, io: null, quando_io: null, come: [], righe: [] }) })
    render(<Classifica />)
    expect(await screen.findByText(/Qui ti confronti con altri profili/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collega un canale" })).toBeInTheDocument()
  })
})
