import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Produzione } from "../src/produzione/Produzione"
import type { ConsumiInChat, ConsumoDiUnVideo, Scheda, StatoCanale, VoceElenco } from "../src/tipi"
import { CLAUDE, CODEX, MOTORI_CON_CODEX } from "./motoriChat"
import { errore, installaEventi, installaRete } from "./rete"

const GIORNO = 86_400_000
const fa = (giorni: number): string => new Date(Date.now() - giorni * GIORNO).toISOString()

const voce = (slug: string, scheda: Partial<Scheda>, ultimoCambio = fa(1)): VoceElenco => ({
  slug,
  scheda: { titolo: `Titolo ${slug}`, stato: "pubblicato", creato: "2026-10-01", ...scheda },
  durata: 20,
  miniatura: null,
  anteprima: null,
  ha_piano: true,
  quadri: [],
  ha_finale: true,
  fase: null,
  ultimo_cambio: ultimoCambio,
})

const conto = (tempo: number, scritti: number): ConsumoDiUnVideo => {
  const token = { scritti, riletti: scritti * 500, nuovi: scritti * 5 }
  return { tempo, giri: 4, token, dal: fa(30), al: fa(1), motori: { "claude-code": { tempo, giri: 4, giri_con_token: 4, token } } }
}

/** Un video su cui hanno lavorato Claude e Codex, che non dice i token. */
const contoInDue = (tempoDiClaude: number, tempoDiCodex: number, scritti: number): ConsumoDiUnVideo => {
  const claude = conto(tempoDiClaude, scritti)
  return { ...claude, tempo: tempoDiClaude + tempoDiCodex, giri: 6, motori: { ...claude.motori, codex: { tempo: tempoDiCodex, giri: 2, giri_con_token: 0, token: null } } }
}

/** Un video su cui hanno lavorato Claude e Codex, che dice i token dei suoi giri. */
const contoInDueConToken = (tempoDiClaude: number, tempoDiCodex: number, scritti: number, scrittiDiCodex: number): ConsumoDiUnVideo => {
  const claude = conto(tempoDiClaude, scritti)
  const token = { scritti: scrittiDiCodex, riletti: scrittiDiCodex * 500, nuovi: scrittiDiCodex * 5 }
  return {
    ...claude,
    tempo: tempoDiClaude + tempoDiCodex,
    giri: 6,
    token: { scritti: scritti + scrittiDiCodex, riletti: scritti * 500 + token.riletti, nuovi: scritti * 5 + token.nuovi },
    motori: { ...claude.motori, codex: { tempo: tempoDiCodex, giri: 2, giri_con_token: 2, token } },
  }
}

const consumi = (video: Record<string, ConsumoDiUnVideo>, pronto = true, contati = ["claude-code"]): ConsumiInChat => ({
  pronto,
  contati,
  video,
  senza_video: { tempo: 0, giri: 0, token: { scritti: 0, riletti: 0, nuovi: 0 }, motori: {} },
})

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
  // Per prima: finché nessuna prova ha riempito la copia del canale, qui il canale non si legge.
  it("se il canale non si legge non dice che manca la lettura: le colonne dei numeri restano «—»", async () => {
    rete({ "GET /api/canale/tiktok": errore(500, "Il server è occupato.") })
    render(<Produzione />)
    const tabella = await screen.findByRole("table", { name: "Quanto costa e quanto rende ogni video" })
    await waitFor(() => expect(within(tabella).getAllByRole("row").length).toBe(4))
    expect(screen.queryByText(/Il canale non ha ancora nessuna lettura/)).toBeNull()
  })

  it("se il canale si legge una volta e la rilettura dopo fallisce, i numeri di prima restano e la pagina dice di che giorno sono", async () => {
    const eventi = installaEventi()
    const { imposta } = rete()
    render(<Produzione />)
    const tabella = await screen.findByRole("table", { name: "Quanto costa e quanto rende ogni video" })
    await waitFor(() => expect(within(tabella).getAllByRole("row").length).toBe(4))
    imposta("GET /api/canale/tiktok", () => errore(500, "Il server è occupato."))
    act(() => eventi.istanze.at(-1)!.manda({ tipo: "canale" }))
    expect(await screen.findByText("Dati del 3 nov 2026, 10:00: l'ultima rilettura non è riuscita.")).toBeInTheDocument()
    expect(screen.getByRole("table", { name: "Quanto costa e quanto rende ogni video" })).toBeInTheDocument()
  })

  it("la presentazione dice come si conta il lavoro in chat, senza rimandare a una scheda che non lo mostra più", async () => {
    rete()
    render(<Produzione />)
    const testo = await screen.findByText(/Quanti video fai, quanto lavoro in chat costano/)
    expect(testo).toHaveTextContent(/anche quelle del terminale e, per Claude, dei suoi aiutanti/)
    expect(testo).not.toHaveTextContent(/scheda di ogni video/)
  })

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
    fireEvent.click(within(tabella).getByRole("button", { name: /Visualizzazioni/ }))
    expect(titoli()).toEqual(["Titolo a", "Titolo b", "Titolo c"])
    fireEvent.click(within(tabella).getByRole("button", { name: /Visualizzazioni/ }))
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

  it("dice che il lavoro fatto con i motori della chat che i conti non leggono, nominati dal server, non è contato", async () => {
    rete({ "GET /api/chat/motori": MOTORI_CON_CODEX })
    render(<Produzione />)
    expect(await screen.findByText(/Il lavoro fatto con Mango Code e Codex non è contato\./)).toBeInTheDocument()
  })

  it("con Codex fra i motori contati nomina solo quelli che davvero non lo sono", async () => {
    rete({ "GET /api/chat/motori": MOTORI_CON_CODEX, "GET /api/consumi": consumi(CONTI, true, ["claude-code", "codex"]) })
    render(<Produzione />)
    expect(await screen.findByText(/Il lavoro fatto con Mango Code non è contato\./)).toBeInTheDocument()
    expect(screen.queryByText(/Mango Code e Codex/)).toBeNull()
  })

  it("se il server non nomina altri motori, non dice che il lavoro di uno non è contato", async () => {
    rete({ "GET /api/chat/motori": [CLAUDE] })
    render(<Produzione />)
    await screen.findByText(/Lavoro e conteggi sono la media di un video/)
    await waitFor(() => expect(screen.queryByText(/non è contato/)).toBeNull())
  })

  describe("con più di un motore", () => {
    const CONTI_DUE = { a: contoInDue(3660, 1800, 100_000), b: conto(7260, 200_000), c: conto(1800, 50_000), d: conto(60, 1) }
    const reteDue = () => rete({ "GET /api/chat/motori": [CLAUDE, CODEX], "GET /api/consumi": consumi(CONTI_DUE, true, ["claude-code", "codex"]) })

    it("la media di un periodo dice la parte di ognuno dove i motori sono due, e solo il totale dove ce n'è uno", async () => {
      reteDue()
      render(<Produzione />)
      const tabella = await screen.findByRole("table", { name: "La media di un video, per periodo" })
      const riga = (nome: RegExp) => within(tabella).getByRole("row", { name: nome })
      await waitFor(() => expect(riga(/Ultima settimana/)).toHaveTextContent("Claude 1 h 1 min · Codex 30 min"))
      expect(riga(/Ultima settimana/)).toHaveTextContent("1 h 31 min")
      expect(riga(/Ultimo mese/)).toHaveTextContent("Claude 1 h 31 min · Codex 15 min")
      expect(within(tabella).getByRole("columnheader", { name: "Lavoro in chat" })).toBeInTheDocument()
    })

    it("i token sono quelli di Claude: la pagina dice che per Codex non si conoscono", async () => {
      reteDue()
      render(<Produzione />)
      expect(await screen.findByText(/Per Codex i token non si conoscono: i conteggi sono quelli degli altri motori\./)).toBeInTheDocument()
      const tabella = screen.getByRole("table", { name: "La media di un video, per periodo" })
      expect(within(tabella).getByRole("row", { name: /Ultima settimana/ })).toHaveTextContent("100 mila")
    })

    it("se Codex dice i token dei suoi giri entrano nei conti, e la pagina non dice che non si conoscono", async () => {
      const conti = { a: contoInDueConToken(3660, 1800, 100_000, 20_000), b: conto(7260, 200_000), c: conto(1800, 50_000), d: conto(60, 1) }
      rete({ "GET /api/chat/motori": [CLAUDE, CODEX], "GET /api/consumi": consumi(conti, true, ["claude-code", "codex"]) })
      render(<Produzione />)
      const tabella = await screen.findByRole("table", { name: "La media di un video, per periodo" })
      await waitFor(() => expect(within(tabella).getByRole("row", { name: /Ultima settimana/ })).toHaveTextContent("120 mila"))
      expect(screen.queryByText(/i token non si conoscono/)).toBeNull()
      expect(screen.queryByText(/dei giri fatti dal terminale non si conoscono/)).toBeNull()
    })

    it("se Codex dice i token per alcuni video e non per altri, la pagina dice che sono quelli dei giri fatti con l'app accesa", async () => {
      const conti = { a: contoInDueConToken(3660, 1800, 100_000, 20_000), b: contoInDue(7260, 600, 200_000), c: conto(1800, 50_000), d: conto(60, 1) }
      rete({ "GET /api/chat/motori": [CLAUDE, CODEX], "GET /api/consumi": consumi(conti, true, ["claude-code", "codex"]) })
      render(<Produzione />)
      expect(await screen.findByText(/I token di Codex sono quelli dei giri fatti con l'app accesa: dei giri fatti dal terminale non si conoscono\./)).toBeInTheDocument()
      expect(screen.queryByText(/Per Codex i token non si conoscono/)).toBeNull()
    })

    it("un solo video con giri di Codex fatti in parte con l'app accesa e in parte dal terminale fa comparire la frase", async () => {
      const misto: ConsumoDiUnVideo = { tempo: 900, giri: 2, token: { scritti: 30_000, riletti: 3_000_000, nuovi: 120_000 }, dal: fa(5), al: fa(1), motori: { codex: { tempo: 900, giri: 2, giri_con_token: 1, token: { scritti: 30_000, riletti: 3_000_000, nuovi: 120_000 } } } }
      rete({ "GET /api/chat/motori": [CLAUDE, CODEX], "GET /api/consumi": consumi({ a: misto }, true, ["claude-code", "codex"]) })
      render(<Produzione />)
      expect(await screen.findByText(/I token di Codex sono quelli dei giri fatti con l'app accesa: dei giri fatti dal terminale non si conoscono\./)).toBeInTheDocument()
    })

    it("un video fatto solo con Codex, con i token dei suoi giri, ha le sue medie", async () => {
      const soloCodex: ConsumoDiUnVideo = { tempo: 900, giri: 2, token: { scritti: 30_000, riletti: 3_000_000, nuovi: 120_000 }, dal: fa(5), al: fa(1), motori: { codex: { tempo: 900, giri: 2, giri_con_token: 2, token: { scritti: 30_000, riletti: 3_000_000, nuovi: 120_000 } } } }
      rete({ "GET /api/chat/motori": [CLAUDE, CODEX], "GET /api/consumi": consumi({ a: soloCodex }, true, ["claude-code", "codex"]) })
      render(<Produzione />)
      const tabella = await screen.findByRole("table", { name: "La media di un video, per periodo" })
      await waitFor(() => expect(within(tabella).getByRole("row", { name: /Ultima settimana/ })).toHaveTextContent("15 min"))
      const celle = within(within(tabella).getByRole("row", { name: /Ultima settimana/ })).getAllByRole("cell")
      expect(celle.slice(1).map((c) => c.textContent)).toEqual(["15 min", "30 mila", "120 mila", "3,0 milioni"])
    })

    it("la tabella del costo dice la parte di ognuno solo per il video su cui hanno lavorato in due", async () => {
      reteDue()
      render(<Produzione />)
      const tabella = await screen.findByRole("table", { name: "Quanto costa e quanto rende ogni video" })
      await waitFor(() => expect(within(tabella).getAllByRole("row").length).toBe(4))
      const righe = within(tabella).getAllByRole("row").slice(1)
      const di = (titolo: string) => righe.find((r) => within(r).queryByRole("link", { name: titolo }))!
      expect(di("Titolo a")).toHaveTextContent("1 h 31 min")
      expect(di("Titolo a")).toHaveTextContent("Claude 1 h 1 min · Codex 30 min")
      expect(di("Titolo b")).not.toHaveTextContent("Codex")
    })

    it("un video fatto solo con Codex ha il suo tempo e nessun token inventato", async () => {
      const soloCodex: ConsumoDiUnVideo = { tempo: 900, giri: 2, token: { scritti: 0, riletti: 0, nuovi: 0 }, dal: fa(5), al: fa(1), motori: { codex: { tempo: 900, giri: 2, giri_con_token: 0, token: null } } }
      rete({ "GET /api/chat/motori": [CLAUDE, CODEX], "GET /api/consumi": consumi({ a: soloCodex }, true, ["claude-code", "codex"]) })
      render(<Produzione />)
      const tabella = await screen.findByRole("table", { name: "La media di un video, per periodo" })
      await waitFor(() => expect(within(tabella).getByRole("row", { name: /Ultima settimana/ })).toHaveTextContent("15 min"))
      const celle = within(within(tabella).getByRole("row", { name: /Ultima settimana/ })).getAllByRole("cell")
      expect(celle.slice(1).map((c) => c.textContent)).toEqual(["15 min", "—", "—", "—"])
    })
  })

  it("con il solo Claude Code la pagina è quella di prima: nessuna parte per motore, nessuna frase sui token", async () => {
    rete({ "GET /api/chat/motori": [CLAUDE] })
    render(<Produzione />)
    const tabella = await screen.findByRole("table", { name: "La media di un video, per periodo" })
    await waitFor(() => expect(within(tabella).getByRole("row", { name: /Ultima settimana/ })).toHaveTextContent("1 h 1 min"))
    expect(screen.queryByText(/Claude 1 h 1 min/)).toBeNull()
    expect(screen.queryByText(/token non si conoscono/)).toBeNull()
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
