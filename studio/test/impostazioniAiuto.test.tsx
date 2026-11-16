// «Aiuto» nelle impostazioni: versione e aggiornamenti, la guida, la segnalazione e i registri, con i ponti finti al posto di quelli dell'app.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Aiuto } from "../src/impostazioni/Aiuto"
import type { PonteAiuto } from "../src/impostazioni/ponteAiuto"
import { scegliLingua } from "../src/lingua"
import { installaEventi, installaRete } from "./rete"

function ponteFinto(extra: Partial<PonteAiuto> = {}) {
  const ponte = {
    leggi: vi.fn<PonteAiuto["leggi"]>(extra.leggi ?? (async () => ({ versione: "0.1.6", aggiornaDaSolo: true }))),
    controlla: vi.fn<PonteAiuto["controlla"]>(extra.controlla ?? (async () => ({ nuova: null }))),
    aggiornaDaSolo: vi.fn<PonteAiuto["aggiornaDaSolo"]>(extra.aggiornaDaSolo ?? (async () => undefined)),
    riavviaEAggiorna: vi.fn<PonteAiuto["riavviaEAggiorna"]>(extra.riavviaEAggiorna ?? (async () => undefined)),
    apriRegistri: vi.fn<PonteAiuto["apriRegistri"]>(extra.apriRegistri ?? (async () => undefined)),
  }
  window.__MANGO_ANIMATION__ = { aiuto: ponte }
  return ponte
}

const NESSUN_LAVORO = { in_corso: null, in_coda: [], finiti: [] }

beforeEach(() => {
  installaEventi()
  installaRete({ "GET /api/lavori": NESSUN_LAVORO })
})
afterEach(() => {
  delete window.__MANGO_ANIMATION__
  vi.unstubAllGlobals()
})

describe("Aiuto nel browser, senza l'app", () => {
  it("restano la guida nella lingua scelta e basta: niente versione, aggiornamenti, registri né segnalazione", () => {
    render(<Aiuto />)
    expect(screen.getByRole("heading", { level: 1, name: "Aiuto" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Apri la guida" })).toHaveAttribute("href", "https://github.com/Federico-Anastasi/mango-animation/blob/main/docs/guida/italiano.md")
    expect(screen.queryByRole("button", { name: "Controlla ora" })).toBeNull()
    expect(screen.queryByRole("switch")).toBeNull()
    expect(screen.queryByText("Registri")).toBeNull()
    expect(screen.queryByText("Segnala un problema")).toBeNull()
  })
})

describe("versione e aggiornamenti", () => {
  it("dice la versione dell'app e le righe stanno nell'ordine di ogni app Mango", async () => {
    ponteFinto()
    render(<Aiuto />)
    expect(await screen.findByText("Mango Animation 0.1.6")).toBeInTheDocument()
    const card = screen.getByRole("group", { name: "Versione" })
    expect(within(card).getAllByRole("listitem").map((r) => r.querySelector("span")?.textContent)).toEqual(["Mango Animation 0.1.6", "Aggiorna da solo"])
    expect(screen.getByRole("group", { name: "Se serve una mano" })).toBeInTheDocument()
  })

  it("«Controlla ora» mentre controlla lo dice, poi «Hai l'ultima versione»", async () => {
    let finisci: (r: { nuova: string | null }) => void = () => {}
    const ponte = ponteFinto({ controlla: () => new Promise((risolvi) => (finisci = risolvi)) })
    render(<Aiuto />)
    fireEvent.click(await screen.findByRole("button", { name: "Controlla ora" }))
    expect(await screen.findByText("Controllo in corso…")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Controlla ora" })).toBeDisabled()
    finisci({ nuova: null })
    expect(await screen.findByText("Hai l'ultima versione")).toBeInTheDocument()
    expect(ponte.controlla).toHaveBeenCalledOnce()
    expect(screen.queryByText("Controllo in corso…")).toBeNull()
  })

  it("con una versione nuova la dice e offre «Riavvia e aggiorna», che chiude e riapre l'app", async () => {
    const ponte = ponteFinto({ controlla: async () => ({ nuova: "0.1.7" }) })
    render(<Aiuto />)
    fireEvent.click(await screen.findByRole("button", { name: "Controlla ora" }))
    expect(await screen.findByText("C'è la versione 0.1.7")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Riavvia e aggiorna" })).toHaveAttribute("data-variante", "principale")
    expect(screen.queryByRole("button", { name: "Controlla ora" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Riavvia e aggiorna" }))
    expect(ponte.riavviaEAggiorna).toHaveBeenCalledOnce()
  })

  it("mentre un lavoro gira non si aggiorna: il bottone è spento e dice perché", async () => {
    installaRete({ "GET /api/lavori": { ...NESSUN_LAVORO, in_corso: { id: "m", slug: "pasta-fresca", comando: "monta" } } })
    const ponte = ponteFinto({ controlla: async () => ({ nuova: "0.1.7" }) })
    render(<Aiuto />)
    fireEvent.click(await screen.findByRole("button", { name: "Controlla ora" }))
    const riavvia = await screen.findByRole("button", { name: "Riavvia e aggiorna" })
    await waitFor(() => expect(riavvia).toBeDisabled())
    expect(riavvia).toHaveAttribute("title", "C'è un lavoro in corso o in attesa: aggiornare lo fermerebbe. Aspetta che finisca.")
    fireEvent.click(riavvia)
    expect(ponte.riavviaEAggiorna).not.toHaveBeenCalled()
  })

  it("se non riesce a controllare dice la frase dell'app, e si può riprovare", async () => {
    const ponte = ponteFinto({ controlla: async () => Promise.reject({ message: "Il server degli aggiornamenti non risponde." }) })
    render(<Aiuto />)
    fireEvent.click(await screen.findByRole("button", { name: "Controlla ora" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Il server degli aggiornamenti non risponde.")
    expect(screen.queryByText("Hai l'ultima versione")).toBeNull()
    ponte.controlla.mockResolvedValueOnce({ nuova: null })
    fireEvent.click(screen.getByRole("button", { name: "Controlla ora" }))
    expect(await screen.findByText("Hai l'ultima versione")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("«Aggiorna da solo» è acceso come dice l'app; spegnerlo lo comunica e la riga dice che all'avvio non cerca", async () => {
    const ponte = ponteFinto()
    render(<Aiuto />)
    const interruttore = await screen.findByRole("switch", { name: "Aggiorna da solo" })
    expect(interruttore).toBeChecked()
    expect(screen.getByText(/All'avvio cerca le versioni nuove/)).toBeInTheDocument()
    fireEvent.click(interruttore)
    await waitFor(() => expect(ponte.aggiornaDaSolo).toHaveBeenCalledWith(false))
    await waitFor(() => expect(screen.getByRole("switch", { name: "Aggiorna da solo" })).not.toBeChecked())
    expect(screen.getByText(/all'avvio non cerca versioni nuove/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("switch", { name: "Aggiorna da solo" }))
    await waitFor(() => expect(ponte.aggiornaDaSolo).toHaveBeenLastCalledWith(true))
  })

  it("«Aggiorna da solo» spento in partenza si legge spento", async () => {
    ponteFinto({ leggi: async () => ({ versione: "0.1.6", aggiornaDaSolo: false }) })
    render(<Aiuto />)
    expect(await screen.findByRole("switch", { name: "Aggiorna da solo" })).not.toBeChecked()
  })

  it("se l'app non riesce a cambiare la scelta lo dice e l'interruttore resta com'era", async () => {
    ponteFinto({ aggiornaDaSolo: async () => Promise.reject("Non riesco a scrivere le impostazioni.") })
    render(<Aiuto />)
    fireEvent.click(await screen.findByRole("switch", { name: "Aggiorna da solo" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a scrivere le impostazioni.")
    expect(screen.getByRole("switch", { name: "Aggiorna da solo" })).toBeChecked()
  })
})

describe("registri e segnalazione", () => {
  it("«Apri la cartella» apre i registri, e un rifiuto si legge", async () => {
    const ponte = ponteFinto()
    render(<Aiuto />)
    fireEvent.click(await screen.findByRole("button", { name: "Apri la cartella" }))
    expect(ponte.apriRegistri).toHaveBeenCalledOnce()
    ponte.apriRegistri.mockRejectedValueOnce({ message: "Non trovo la cartella dei registri." })
    fireEvent.click(screen.getByRole("button", { name: "Apri la cartella" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Non trovo la cartella dei registri.")
  })

  it("«Segnala un problema» si apre da qui con il modulo, e manda ciò che si scrive", async () => {
    const invia = vi.fn(async () => ({ inviata: true }))
    window.__MANGO_ANIMATION__ = { segnalazione: { invioAttivo: async () => true, invia } }
    render(<Aiuto />)
    expect(screen.queryByRole("textbox", { name: "Cosa è successo?" })).toBeNull()
    fireEvent.click(await screen.findByRole("button", { name: "Scrivi" }))
    fireEvent.change(await screen.findByRole("textbox", { name: "Cosa è successo?" }), { target: { value: "si blocca" } })
    const schermata = await screen.findByRole("switch", { name: /Includi una schermata della finestra/ })
    expect(schermata).not.toBeChecked()
    fireEvent.click(schermata)
    fireEvent.click(screen.getByRole("button", { name: "Invia" }))
    expect(await screen.findByText("Inviato, grazie")).toBeInTheDocument()
    expect(invia).toHaveBeenCalledWith({ errore: undefined, nota: "si blocca", schermata: true })
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }))
    expect(screen.queryByRole("textbox", { name: "Cosa è successo?" })).toBeNull()
  })
})

describe("Aiuto in inglese", () => {
  it("i testi e la guida sono inglesi", async () => {
    scegliLingua("en")
    ponteFinto({ controlla: async () => ({ nuova: "0.1.7" }) })
    render(<Aiuto />)
    expect(screen.getByRole("heading", { level: 1, name: "Help" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open the guide" })).toHaveAttribute("href", "https://github.com/Federico-Anastasi/mango-animation/blob/main/docs/guida/english.md")
    fireEvent.click(await screen.findByRole("button", { name: "Check now" }))
    expect(await screen.findByText("Version 0.1.7 is out")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Restart and update" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Update by itself" })).toBeChecked()
  })
})
