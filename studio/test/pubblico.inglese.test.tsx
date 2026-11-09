import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Classifica } from "../src/classifica/Classifica"
import { Crescita } from "../src/crescita/Crescita"
import { scegliLingua } from "../src/lingua"
import { Produzione } from "../src/produzione/Produzione"
import { Pubblico } from "../src/pubblico/Pubblico"
import type { ClassificaCanale, ConsumiDiClaude, Crescita as DatiCrescita, PuntoAndamento, StatoCanale, VoceElenco } from "../src/tipi"
import { installaEventi, installaRete } from "./rete"

beforeEach(() => {
  installaEventi()
  scegliLingua("en")
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

const CANALE: StatoCanale = {
  ultima: { lettura: "2026-11-03-1000", quando: "2026-11-03T10:00:00" },
  letture: [],
  profilo: { nome: "mio_canale", follower: 640, mi_piace: 1000, video: 2 },
  video: [
    { id: "1", slug: null, titolo: "Primo", pubblicato: "2026-10-04T13:25", visualizzazioni: 4000, mi_piace: 200, commenti: 10, nuovi_follower: 12, commenti_letti: 0, variazione: null },
    { id: "2", slug: null, titolo: "Secondo", pubblicato: "2026-10-05T13:25", visualizzazioni: 1000, mi_piace: 50, commenti_letti: 0, variazione: null },
  ],
}

describe("Audience, in English", () => {
  it("shows the tables and the empty comments prompt in English", async () => {
    installaRete({
      "GET /api/canale/tiktok": CANALE,
      "GET /api/canale/tiktok/messaggi": { quando: "2026-11-03T10:00:00", conversazioni: [] },
      "GET /api/video": [],
    })
    render(<Pubblico />)
    expect(await screen.findByRole("heading", { name: "Audience" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Videos out" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Watched to the end" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Views" })).toBeInTheDocument()
    expect(screen.getByText("Pick a video from the table to read its comments.")).toBeInTheDocument()
    expect(screen.getByText(/All videos with numbers \(2\)/)).toBeInTheDocument()
    expect(screen.getByText(/per 1,000 views/)).toBeInTheDocument()
    expect(screen.queryByText("I video usciti")).toBeNull()
    expect(screen.queryByText(/Messaggi privati/)).toBeNull()
  })

  it("says so when there is no read yet", async () => {
    installaRete({ "GET /api/canale/tiktok": { ultima: null, letture: [], profilo: null, video: [] }, "GET /api/video": [] })
    render(<Pubblico />)
    expect(await screen.findByText(/Here you see how your released videos are doing/)).toBeInTheDocument()
  })
})

describe("Ranking, in English", () => {
  it("names the sorting buttons and the position in English", async () => {
    const riga = (posto: number, nome: string, punteggio: number) => ({ posto, nome, cosa_fa: `cosa fa ${nome}`, follower: 100, mi_piace: 200, visualizzazioni: 300, punteggio })
    const dato: ClassificaCanale = { quando: "2026-10-08", io: "mio_canale", quando_io: "2026-10-13T19:19", come: [], righe: [riga(1, "grande", 5), riga(2, "mio_canale", 8)] }
    installaRete({ "GET /api/canale/tiktok/classifica": dato })
    render(<Classifica />)
    expect(await screen.findByRole("heading", { name: "Ranking" })).toBeInTheDocument()
    const mio = screen.getByRole("complementary", { name: "Your position" })
    expect(within(mio).getByText("score").parentElement).toHaveTextContent("#2 of 2")
    expect(screen.getByRole("button", { name: /followers/ })).toBeInTheDocument()
    expect(screen.getByText("Sort by")).toBeInTheDocument()
    expect(screen.getByText(/yours on 13 Oct 2026/)).toBeInTheDocument()
    expect(screen.queryByText("Ordina per")).toBeNull()
  })
})

describe("Growth, in English", () => {
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
    mix: [],
    consigli: [],
    novita: [{ nome: "Sondaggi", cosa: "un sondaggio", per_te: "fa commentare", giudizio: "sì", fonte: "https://esempio.test" }],
    come: [],
  }
  const punto = (quando: string, follower: number): PuntoAndamento => ({ quando, follower, mi_piace: null, video: null })

  it("shows headings, milestones, weekday and verdicts in English", async () => {
    installaRete({
      "GET /api/canale/tiktok/crescita": PIANO,
      "GET /api/canale/tiktok/andamento": [punto("2026-11-01T10:00", 440), punto("2026-11-15T10:00", 640)],
      "GET /api/canale/tiktok": { ultima: null, letture: [], profilo: null, video: [{ id: "1", slug: "tre-forni", pubblicato: "2026-10-04T13:25", visualizzazioni: 40000, nuovi_follower: 200, commenti_letti: 0, variazione: null }] },
      "GET /api/video": [],
    })
    render(<Crescita />)
    expect(await screen.findByRole("heading", { name: "Where you come from" })).toBeInTheDocument()
    const oggi = screen.getByRole("heading", { name: "Where you come from" }).parentElement!
    expect(oggi).toHaveTextContent("640followersread on 15 Nov 2026, 10:00")
    expect(oggi).toHaveTextContent("in the last 7 days")
    const tappe = screen.getByRole("table", { name: "The milestones, in followers" })
    expect(within(tappe).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["scenario", "3 months25 Jan 2027", "1 year25 Oct 2027"])
    expect(screen.getByRole("heading", { name: "Use now" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "source" })).toBeInTheDocument()
    expect(screen.getByText("Wednesday")).toBeInTheDocument()
    expect(screen.queryByText("Da dove vieni")).toBeNull()
    expect(screen.queryByText("mercoledì")).toBeNull()
  })

  it("names the chart readout and the ratio hint in English", async () => {
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(600)
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 600, bottom: 260, width: 600, height: 260, x: 0, y: 0, toJSON: () => ({}) })
    installaRete({
      "GET /api/canale/tiktok/crescita": PIANO,
      "GET /api/canale/tiktok/andamento": [punto("2026-11-01T10:00", 440), punto("2026-11-15T10:00", 640)],
      "GET /api/canale/tiktok": { ultima: null, letture: [], profilo: null, video: [{ id: "1", slug: "tre-forni", pubblicato: "2026-10-04T13:25", visualizzazioni: 40000, nuovi_follower: 200, commenti_letti: 0, variazione: null }] },
      "GET /api/video": [],
    })
    render(<Crescita />)
    const riga = await screen.findByRole("row", { name: /Le mie prove/ })
    expect(riga.querySelector("[title]")).toHaveAttribute("title", "200 new followers out of 40,000 views")
    fireEvent.mouseMove(screen.getByRole("img", { name: /Followers read over time/ }), { clientX: 230 })
    expect(screen.getByRole("tooltip")).toHaveTextContent("reads 640")
    vi.restoreAllMocks()
  })

  it("explains how to ask when there is no plan", async () => {
    installaRete({ "GET /api/canale/tiktok/crescita": { quando: null }, "GET /api/canale/tiktok/andamento": [], "GET /api/canale/tiktok": { ultima: null, letture: [], profilo: null, video: [] }, "GET /api/video": [] })
    render(<Crescita />)
    expect(await screen.findByText(/Here you find the plan to grow the channel/)).toBeInTheDocument()
  })
})

describe("Production, in English", () => {
  it("shows periods, columns and plural forms in English", async () => {
    const GIORNO = 86_400_000
    const fa = (giorni: number): string => new Date(Date.now() - giorni * GIORNO).toISOString()
    const voce = (slug: string): VoceElenco => ({
      slug,
      scheda: { titolo: `Titolo ${slug}`, stato: "pubblicato", creato: "2026-10-01", pubblicazioni: [{ canale: "tiktok", data: fa(2) }] },
      durata: 20,
      miniatura: null,
      anteprima: null,
      ha_piano: true,
      ha_finale: true,
      ultimo_cambio: fa(1),
    })
    const conti: ConsumiDiClaude = {
      pronto: true,
      video: { a: { tempo: 3660, giri: 4, token: { scritti: 100_000, riletti: 5_000_000, nuovi: 500_000 }, dal: fa(30), al: fa(1) } },
      senza_video: { tempo: 0, giri: 0, token: { scritti: 0, riletti: 0, nuovi: 0 } },
    }
    installaRete({ "GET /api/video": [voce("a"), voce("b")], "GET /api/consumi": conti, "GET /api/canale/tiktok": { ultima: null, letture: [], profilo: null, video: [] } })
    render(<Produzione />)
    const tabella = await screen.findByRole("table", { name: "The average of a video, by period" })
    await waitFor(() => expect(within(tabella).getByRole("row", { name: /Last week/ })).toHaveTextContent("2"))
    expect(within(tabella).getByRole("row", { name: /Last week/ })).toHaveTextContent("(1 without counts)")
    expect(within(tabella).getByRole("row", { name: /Last week/ })).toHaveTextContent("1 h 1 min")
    expect(within(tabella).getByRole("row", { name: /Last week/ })).toHaveTextContent("100 thousand")
    expect(within(tabella).getByRole("columnheader", { name: "Read for the first time" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Production" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What it costs and what it returns" })).toBeInTheDocument()
    expect(screen.queryByText("Da sempre")).toBeNull()
  })
})
