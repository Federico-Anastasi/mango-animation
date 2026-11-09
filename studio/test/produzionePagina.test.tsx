import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Produzione } from "../src/produzione/Produzione"
import type { ConsumiDiClaude, ConsumoDiUnVideo, Scheda, StatoCanale, VoceElenco } from "../src/tipi"
import { installaEventi, installaRete } from "./rete"

const GIORNO = 86_400_000
const fa = (giorni: number): string => new Date(Date.now() - giorni * GIORNO).toISOString()

const voce = (slug: string, scheda: Partial<Scheda>, ultimoCambio = fa(1)): VoceElenco => ({
  slug,
  scheda: { titolo: `Titolo ${slug}`, stato: "pubblicato", creato: "2026-10-01", ...scheda },
  durata: 20,
  miniatura: null,
  anteprima: null,
  ha_piano: true,
  ha_finale: true,
  ultimo_cambio: ultimoCambio,
})

const conto = (tempo: number, scritti: number): ConsumoDiUnVideo => ({ tempo, giri: 4, token: { scritti, riletti: scritti * 500, nuovi: scritti * 5 }, dal: fa(30), al: fa(1) })

const consumi = (video: Record<string, ConsumoDiUnVideo>, pronto = true): ConsumiDiClaude => ({ pronto, video, senza_video: { tempo: 0, giri: 0, token: { scritti: 0, riletti: 0, nuovi: 0 } } })

const dal = (video: StatoCanale["video"], letto = true): StatoCanale => ({ ultima: letto ? { lettura: "2026-11-03-1000", quando: "2026-11-03T10:00:00" } : null, letture: [], profilo: null, video })

const ELENCO = [
  voce("a", { pubblicazioni: [{ canale: "tiktok", data: fa(2) }] }),
  voce("b", { pubblicazioni: [{ canale: "tiktok", data: fa(20) }] }),
  voce("c", { stato: "pronto" }, fa(40)),
  voce("d", { stato: "in lavorazione" }),
]
const CONTI = { a: conto(3660, 100_000), b: conto(7260, 200_000), c: conto(1800, 50_000), d: conto(60, 1) }
const CANALE = dal([
  { id: "1", slug: "a", visualizzazioni: 3000, mi_piace: 200, nuovi_follower: 12, commenti_letti: 0, variazione: null },
  { id: "2", slug: "b", visualizzazioni: 1000, commenti_letti: 0, variazione: null },
])

const rete = (extra: Record<string, unknown> = {}) => installaRete({ "GET /api/video": ELENCO, "GET /api/consumi": consumi(CONTI), "GET /api/canale/tiktok": CANALE, ...extra })

beforeEach(() => {
  installaEventi()
})
afterEach(() => vi.unstubAllGlobals())

describe("Produzione", () => {
  it("dice per settimana, mese e da sempre quanti video sono fatti e quanto lavoro di Claude è costato in media ognuno", async () => {
    rete()
    render(<Produzione />)
    const tabella = await screen.findByRole("table", { name: "La media di un video, per periodo" })
    const riga = (nome: RegExp) => within(tabella).getByRole("row", { name: nome })
    await waitFor(() => expect(riga(/Ultima settimana/)).toHaveTextContent("1"))
    expect(riga(/Ultima settimana/)).toHaveTextContent("1 h 1 min")
    expect(riga(/Ultima settimana/)).toHaveTextContent("100 mila")
    expect(riga(/Ultimo mese/)).toHaveTextContent("2")
    expect(riga(/Ultimo mese/)).toHaveTextContent("1 h 31 min")
    expect(riga(/Ultimo mese/)).toHaveTextContent("150 mila")
    expect(riga(/Da sempre/)).toHaveTextContent("3")
    expect(riga(/Da sempre/)).toHaveTextContent("1 h 10 min")
  })

  it("mette in cima il video che costa di più rispetto a quanto rende, e sta in fondo chi non ha i numeri del canale", async () => {
    rete()
    render(<Produzione />)
    const tabella = await screen.findByRole("table", { name: "Quanto costa e quanto rende ogni video" })
    await waitFor(() => expect(within(tabella).getAllByRole("row").length).toBe(4))
    const righe = within(tabella).getAllByRole("row").slice(1)
    expect(righe.map((r) => within(r).getAllByRole("cell")[0]!.textContent)).toEqual(["Titolo b", "Titolo a", "Titolo c"])
    expect(righe[0]).toHaveTextContent("2 h 1 min")
    expect(righe[0]).toHaveTextContent("1.000")
    expect(righe[0]).toHaveTextContent("121,0")
    expect(righe[1]).toHaveTextContent("20,3")
    expect(righe[1]).toHaveTextContent("200")
    expect(righe[1]).toHaveTextContent("12")
    expect(righe[2]).toHaveTextContent("—")
    expect(within(righe[0]!).getByRole("link", { name: "Titolo b" })).toHaveAttribute("href", "#/video/b/scheda")
  })

  it("un clic sull'intestazione cambia l'ordine, un secondo lo rovescia", async () => {
    rete()
    render(<Produzione />)
    const tabella = await screen.findByRole("table", { name: "Quanto costa e quanto rende ogni video" })
    await waitFor(() => expect(within(tabella).getAllByRole("row").length).toBe(4))
    const titoli = () => within(tabella).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0]!.textContent)
    fireEvent.click(within(tabella).getByRole("button", { name: /Visite/ }))
    expect(titoli()).toEqual(["Titolo a", "Titolo b", "Titolo c"])
    fireEvent.click(within(tabella).getByRole("button", { name: /Visite/ }))
    expect(titoli()).toEqual(["Titolo b", "Titolo a", "Titolo c"])
  })

  it("elenca i più lunghi e i più rapidi, senza ripetere un video nelle due liste", async () => {
    rete()
    render(<Produzione />)
    const lunghi = await screen.findByRole("list", { name: "I più lunghi" })
    expect(within(lunghi).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Titolo b2 h 1 min"])
    expect(within(screen.getByRole("list", { name: "I più rapidi" })).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Titolo c30 min"])
  })

  it("senza le letture del canale mostra comunque il lavoro, e dice come avere i risultati", async () => {
    rete({ "GET /api/canale/tiktok": dal([], false) })
    render(<Produzione />)
    const tabella = await screen.findByRole("table", { name: "Quanto costa e quanto rende ogni video" })
    await waitFor(() => expect(within(tabella).getAllByRole("row").length).toBe(4))
    expect(screen.getByText(/chiedilo nella chat: «aggiorna i dati di TikTok»/)).toBeInTheDocument()
  })

  it("dice che il lavoro fatto con Mango Code non è contato", async () => {
    rete({})
    render(<Produzione />)
    expect(await screen.findByText(/Il lavoro fatto con Mango Code non è contato\./)).toBeInTheDocument()
  })

  it("finché il server legge le conversazioni avverte che i conti sono parziali", async () => {
    rete({ "GET /api/consumi": consumi(CONTI, false) })
    render(<Produzione />)
    expect(await screen.findByText(/conti sono parziali/)).toBeInTheDocument()
  })

  it("senza video fatti lo dice, e senza conti di Claude non inventa medie", async () => {
    rete({ "GET /api/video": [voce("d", { stato: "proposta" })] })
    const { unmount } = render(<Produzione />)
    expect(await screen.findByText(/Quando ci sarà un video pronto, compaiono i suoi conti/)).toBeInTheDocument()
    unmount()

    rete({ "GET /api/consumi": consumi({}) })
    render(<Produzione />)
    const tabella = await screen.findByRole("table", { name: "La media di un video, per periodo" })
    await waitFor(() => expect(within(tabella).getByRole("row", { name: /Da sempre/ })).toHaveTextContent("—"))
    expect(screen.queryByRole("table", { name: "Quanto costa e quanto rende ogni video" })).toBeNull()
  })
})
