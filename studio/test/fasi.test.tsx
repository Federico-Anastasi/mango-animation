import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { leggiBozza, ricordaBozza } from "../src/chat/bozza"
import { negozio } from "../src/chat/negozio"
import { chiudiChat } from "../src/chat/pannello"
import { PannelloChat } from "../src/chat/PannelloChat"
import { scegliLingua } from "../src/lingua"
import type { Fase, VoceElenco } from "../src/tipi"
import { ElencoVideo } from "../src/video/ElencoVideo"
import { PaginaVideo } from "../src/video/PaginaVideo"
import { cosaFareAdesso, passoCorto } from "../src/video/passi"
import { dettaglioDiProva } from "./fixture"
import { installaEventi, installaRete } from "./rete"

const voce = (slug: string, fase: Fase | null, extra: Partial<VoceElenco> = {}): VoceElenco => ({
  slug,
  scheda: { titolo: `Video ${slug}`, stato: "in lavorazione", creato: "2026-10-06" },
  durata: null,
  miniatura: null,
  anteprima: null,
  ha_piano: false,
  quadri: [],
  ha_finale: false,
  fase,
  ultimo_cambio: "2026-10-09T10:00:00",
  ...extra,
})

const PROVA: Fase = { passo: 3, azione: "prova" }
const NOMI_IT = ["Idea", "Copione", "Prova", "Riprese", "Animazioni", "Montaggio", "Correzioni", "Uscita"]

beforeEach(() => {
  installaEventi()
  window.location.hash = ""
  sessionStorage.clear()
  localStorage.clear()
  negozio.apri(null)
  chiudiChat()
})
afterEach(() => vi.unstubAllGlobals())

function paginaConFase(fase: Fase | null) {
  const dettaglio = { ...dettaglioDiProva(), fase }
  const { chiamate } = installaRete({ "GET /api/video/prova": dettaglio, "GET /api/stile": {}, "GET /api/grezzo": [], "GET /api/animazioni": {}, "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] } })
  render(<PaginaVideo slug="prova" scheda="scheda" parametri={new URLSearchParams()} />)
  return chiamate
}

describe("la riga dei passi nella pagina di un video", () => {
  it("dice gli otto passi: i fatti segnati, quello di adesso in rilievo, e «Passo 3 di 8 · Prova»", async () => {
    paginaConFase(PROVA)
    const riga = await screen.findByRole("region", { name: "A che punto è il video" })
    const passi = within(riga).getAllByRole("listitem")
    expect(passi.map((p) => p.textContent?.replace(/^\d/, ""))).toEqual(NOMI_IT)
    expect(passi.map((p) => p.dataset.stato)).toEqual(["fatto", "fatto", "adesso", "dopo", "dopo", "dopo", "dopo", "dopo"])
    expect(passi[2]).toHaveAttribute("aria-current", "step")
    expect(within(riga).getByText("Passo 3 di 8 · Prova")).toBeInTheDocument()
    expect(within(riga).getByText("Dimmi in chat: «fammi la prova».")).toBeInTheDocument()
  })

  it("il bottone scrive la frase nel campo della chat e non la manda", async () => {
    const chiamate = paginaConFase(PROVA)
    fireEvent.click(await screen.findByRole("button", { name: "Scrivila nella chat" }))
    expect(leggiBozza()).toBe("Fammi la prova.")
    expect(chiamate.filter((c) => c.metodo !== "GET")).toEqual([])
  })

  it("se nel campo c'è già qualcosa la frase va dopo, e due clic non la ripetono", async () => {
    paginaConFase(PROVA)
    ricordaBozza("Ciao")
    const bottone = await screen.findByRole("button", { name: "Scrivila nella chat" })
    fireEvent.click(bottone)
    fireEvent.click(bottone)
    expect(leggiBozza()).toBe("Ciao\nFammi la prova.")
  })

  it("un video uscito ha tutti i passi fatti e nessuna frase da dire", async () => {
    paginaConFase({ passo: 8, azione: "fatto" })
    const riga = await screen.findByRole("region", { name: "A che punto è il video" })
    expect(within(riga).getAllByRole("listitem").map((p) => p.dataset.stato)).toEqual(Array(8).fill("fatto"))
    expect(within(riga).queryByRole("button")).toBeNull()
    expect(within(riga).getByText("Fatto · uscito")).toBeInTheDocument()
  })

  it("un video senza fase (un carosello, uno scartato) non ha la riga", async () => {
    paginaConFase(null)
    await screen.findByLabelText("Titolo del video")
    expect(screen.queryByRole("region", { name: "A che punto è il video" })).toBeNull()
  })

  it("ogni passo ha il suo nome e la sua frase in italiano e in inglese", () => {
    const azioni: Fase[] = [
      { passo: 1, azione: "idea" }, { passo: 2, azione: "copione" }, { passo: 3, azione: "prova" }, { passo: 4, azione: "riprese" }, { passo: 4, azione: "testo" }, { passo: 5, azione: "animazioni" },
      { passo: 6, azione: "monta" }, { passo: 6, azione: "guarda" }, { passo: 7, azione: "correzioni" }, { passo: 8, azione: "pubblica" },
    ]
    const dire = (lingua: "it" | "en") => {
      scegliLingua(lingua)
      return azioni.map((f) => cosaFareAdesso(f)!.dire)
    }
    const it = dire("it")
    const en = dire("en")
    expect(new Set(it).size).toBe(azioni.length)
    expect(new Set(en).size).toBe(azioni.length)
    it.forEach((frase, i) => expect(frase).not.toBe(en[i]))
    expect(cosaFareAdesso({ passo: 8, azione: "fatto" })).toBeNull()
    expect(passoCorto(PROVA)).toBe("Step 3 of 8 · Rehearsal")
  })
})

describe("la frase scritta dal bottone arriva nel campo della chat", () => {
  it("il campo aperto la mostra, senza mandarla", async () => {
    const { chiamate } = installaRete({
      "GET /api/video": [],
      "GET /api/chat": [],
      "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
      "GET /api/chat/modelli": [],
    })
    render(<PannelloChat />)
    const campo = await screen.findByRole("textbox", { name: /Messaggio/ })
    const { proponiNellaChat } = await import("../src/chat/bozza")
    act(() => proponiNellaChat("Monta il video."))
    expect(campo).toHaveValue("Monta il video.")
    expect(chiamate.filter((c) => c.metodo === "POST")).toEqual([])
  })
})

describe("l'elenco dei video dice la fase", () => {
  it("ogni carta dice il passo, e non più «non ancora montato»", async () => {
    installaRete({
      "GET /api/video": [voce("uno", PROVA), voce("due", { passo: 6, azione: "monta" }, { durata: null }), voce("tre", { passo: 6, azione: "guarda" }, { durata: 42 }), voce("quattro", { passo: 8, azione: "fatto" }, { scheda: { titolo: "Video quattro", stato: "pubblicato", creato: "2026-10-06" } }), voce("car", null, { scheda: { titolo: "Un carosello", stato: "proposta", creato: "2026-10-06", formato: "carosello" } })],
    })
    render(<ElencoVideo />)
    expect(await screen.findByText("Passo 3 di 8 · Prova")).toBeInTheDocument()
    expect(screen.getAllByText("Passo 6 di 8 · Montaggio")).toHaveLength(2)
    expect(screen.queryByText(/Passo 8/)).toBeNull()
    expect(screen.queryByText("non ancora montato")).toBeNull()
    expect(screen.queryByText("da montare")).toBeNull()
    expect(screen.getByText("carosello")).toBeInTheDocument()
    expect(screen.getByText("42 s")).toBeInTheDocument()
  })
})
