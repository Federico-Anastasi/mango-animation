import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { scegliLingua } from "../src/lingua"
import { Versioni } from "../src/montaggio/Versioni"
import type { Piano, VersionePiano } from "../src/tipi"
import { dettaglioDiProva } from "./fixture"
import { errore, installaEventi, installaRete, type Chiamata } from "./rete"

const RIGHE: VersionePiano[] = [
  { n: null, da: "2026-11-10T15:30:00", fino: null, scene: 3, pezzi: 5, in_uso: true },
  { n: 2, da: "2026-11-10T14:00:00", fino: "2026-11-10T15:30:00", scene: 2, pezzi: 4, in_uso: false },
  { n: 1, da: null, fino: "2026-11-10T14:00:00", scene: 1, pezzi: 1, in_uso: false },
]
const VECCHIO: Piano = { quadro: "girato-pieno", sorgenti: { a: { file: "2026-10-06/a.mp4" } }, scene: [{ nome: "apertura", pezzi: [{ sorgente: "a", da: 0, a: 4, dice: "Ciao a tutti" }, { durata: 2 }] }] }

let chiamate: Chiamata[]
function rete(extra: Record<string, unknown> = {}) {
  chiamate = installaRete({
    "GET /api/video/prova/versioni": { versioni: RIGHE },
    "GET /api/video/prova/versioni/1": { n: 1, piano: VECCHIO },
    "POST /api/video/prova/versioni/2/ripristina": { ok: true },
    ...extra,
  }).chiamate
}
const video = dettaglioDiProva()

beforeEach(() => {
  installaEventi()
})
afterEach(() => vi.unstubAllGlobals())

const apri = async () => {
  render(<Versioni video={video} />)
  fireEvent.click(await screen.findByRole("button", { name: /Versioni · 3/ }))
}

describe("le versioni di un montaggio", () => {
  it("senza versioni di prima la sezione non c'è", async () => {
    rete({ "GET /api/video/prova/versioni": { versioni: [RIGHE[0]] } })
    render(<Versioni video={video} />)
    await waitFor(() => expect(chiamate.some((c) => c.percorso === "/api/video/prova/versioni")).toBe(true))
    expect(screen.queryByRole("button", { name: /Versioni/ })).toBeNull()
  })

  it("chiusa dice quante sono; aperta dà per ognuna data e ora, quante scene e pezzi, e solo le vecchie hanno i bottoni", async () => {
    rete()
    await apri()
    const righe = screen.getAllByRole("listitem")
    expect(righe).toHaveLength(3)
    expect(within(righe[0]!).getByText(/^In uso adesso, dal 10 nov 2026, 15:30$/)).toBeInTheDocument()
    expect(within(righe[0]!).getByText("3 scene · 5 pezzi")).toBeInTheDocument()
    expect(within(righe[0]!).queryByRole("button")).toBeNull()
    expect(within(righe[1]!).getByText("Fino al 10 nov 2026, 15:30")).toBeInTheDocument()
    expect(within(righe[1]!).getByText("2 scene · 4 pezzi")).toBeInTheDocument()
    expect(within(righe[2]!).getByText("1 scena · 1 pezzo")).toBeInTheDocument()
    expect(within(righe[2]!).getByRole("button", { name: "Guarda" })).toBeInTheDocument()
    expect(within(righe[2]!).getByRole("button", { name: "Torna a questa" })).toBeInTheDocument()
  })

  it("«Guarda» mostra com'era, in sola lettura: nessuna scrittura, e si richiude", async () => {
    rete()
    await apri()
    const riga = screen.getAllByRole("listitem")[2]!
    fireEvent.click(within(riga).getByRole("button", { name: "Guarda" }))
    expect(await within(riga).findByText("apertura")).toBeInTheDocument()
    expect(within(riga).getByText("«Ciao a tutti»")).toBeInTheDocument()
    expect(within(riga).getByText("senza voce, 2,0 s")).toBeInTheDocument()
    expect(chiamate.filter((c) => c.metodo !== "GET")).toEqual([])
    fireEvent.click(within(riga).getByRole("button", { name: "Chiudi" }))
    expect(within(riga).queryByText("apertura")).toBeNull()
  })

  it("«Torna a questa» chiede conferma: con «No» non succede niente, con «Sì» il server torna a quella versione", async () => {
    rete()
    await apri()
    const riga = () => screen.getAllByRole("listitem")[1]!
    fireEvent.click(within(riga()).getByRole("button", { name: "Torna a questa" }))
    const conferma = within(riga()).getByRole("alertdialog")
    expect(conferma).toHaveTextContent("Quello di adesso resta fra le versioni")
    fireEvent.click(within(conferma).getByRole("button", { name: "No, lascia com'è" }))
    expect(within(riga()).queryByRole("alertdialog")).toBeNull()
    expect(chiamate.filter((c) => c.metodo === "POST")).toEqual([])

    fireEvent.click(within(riga()).getByRole("button", { name: "Torna a questa" }))
    fireEvent.click(within(riga()).getByRole("button", { name: "Sì, torna a questa" }))
    await waitFor(() => expect(chiamate.filter((c) => c.metodo === "POST").map((c) => c.percorso)).toEqual(["/api/video/prova/versioni/2/ripristina"]))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("se il server rifiuta, la frase compare e il piano resta", async () => {
    rete({ "POST /api/video/prova/versioni/2/ripristina": errore(400, "Il piano non è valido: il file 2026-10-06/a.mp4 non c'è.") })
    await apri()
    fireEvent.click(within(screen.getAllByRole("listitem")[1]!).getByRole("button", { name: "Torna a questa" }))
    fireEvent.click(screen.getByRole("button", { name: "Sì, torna a questa" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Il piano non è valido")
  })

  it("si rilegge quando il piano cambia", async () => {
    rete()
    const { rerender } = render(<Versioni video={video} />)
    await screen.findByRole("button", { name: /Versioni · 3/ })
    rerender(<Versioni video={{ ...video, piano_cambiato: "2026-11-10T16:00:00" }} />)
    await waitFor(() => expect(chiamate.filter((c) => c.percorso === "/api/video/prova/versioni")).toHaveLength(2))
  })

  it("in inglese: «Versions», «Look», «Go back to this one»", async () => {
    scegliLingua("en")
    rete()
    render(<Versioni video={video} />)
    fireEvent.click(await screen.findByRole("button", { name: /Versions · 3/ }))
    const righe = screen.getAllByRole("listitem")
    expect(within(righe[0]!).getByText(/^In use now, since 10 Nov 2026, 15:30$/)).toBeInTheDocument()
    expect(within(righe[1]!).getByText("2 scenes · 4 clips")).toBeInTheDocument()
    expect(within(righe[1]!).getByText("Until 10 Nov 2026, 15:30")).toBeInTheDocument()
    fireEvent.click(within(righe[1]!).getByRole("button", { name: "Go back to this one" }))
    expect(within(righe[1]!).getByRole("button", { name: "Yes, go back to this one" })).toBeInTheDocument()
  })
})
