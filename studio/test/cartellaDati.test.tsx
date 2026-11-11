// La cartella dei dati nelle impostazioni, con un ponte finto al posto di quello dell'app (`app/src/dati.rs`).
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Generali } from "../src/impostazioni/Generali"
import type { DatiCartella } from "../src/impostazioni/cartellaDati"
import { installaEventi, installaRete } from "./rete"

const PRIMA: DatiCartella = { attuale: "C:\Utenti\io\Documenti\Mango Animation", prossima: null, forzata: false }

function ponteFinto(iniziali: DatiCartella, dopoIlGesto: DatiCartella | null) {
  const ponte = { leggi: vi.fn(async () => iniziali), sposta: vi.fn(async () => dopoIlGesto) }
  window.__MANGO_ANIMATION__ = { cartellaDati: ponte }
  return ponte
}

beforeEach(() => {
  installaEventi()
  installaRete({})
})
afterEach(() => {
  delete window.__MANGO_ANIMATION__
  vi.unstubAllGlobals()
})

const apri = async () => {
  render(<Generali />)
  return screen.findByRole("region", { name: "Cartella dei dati" })
}

describe("la cartella dei dati", () => {
  it("nel browser, senza l'app, non c'è", () => {
    render(<Generali />)
    expect(screen.queryByRole("heading", { name: "Cartella dei dati" })).toBeNull()
    expect(screen.getByRole("heading", { name: "Lingua e tema" })).toBeInTheDocument()
  })

  it("dice dove stanno i dati e, cambiata, quale vale dal prossimo avvio senza spostare niente", async () => {
    const ponte = ponteFinto(PRIMA, { ...PRIMA, prossima: "D:\Video" })
    const pannello = await apri()
    expect(await screen.findByText(PRIMA.attuale)).toBeInTheDocument()
    expect(pannello).not.toHaveTextContent("prossimo avvio")
    fireEvent.click(screen.getByRole("button", { name: "Sposta la cartella dei dati…" }))
    expect(await screen.findByText("D:\Video")).toBeInTheDocument()
    expect(pannello).toHaveTextContent("Dal prossimo avvio:")
    expect(pannello).toHaveTextContent("Alla prossima apertura sposto io i file")
    expect(ponte.sposta).toHaveBeenCalledOnce()
  })

  it("se non si sceglie niente non cambia niente", async () => {
    const ponte = ponteFinto(PRIMA, null)
    const pannello = await apri()
    fireEvent.click(await screen.findByRole("button", { name: "Sposta la cartella dei dati…" }))
    await waitFor(() => expect(ponte.sposta).toHaveBeenCalledOnce())
    expect(pannello).not.toHaveTextContent("prossimo avvio")
  })

  it("con la variabile d'ambiente la cartella non si sposta da qui", async () => {
    ponteFinto({ ...PRIMA, forzata: true }, null)
    const pannello = await apri()
    expect(await screen.findByText("Questa cartella è fissata all'avvio di Mango Animation e da qui non si cambia.")).toBeInTheDocument()
    expect(pannello).not.toHaveTextContent(/variabile|MANGO_ANIMATION/)
    expect(screen.queryByRole("button", { name: "Sposta la cartella dei dati…" })).toBeNull()
    expect(pannello).toHaveTextContent(PRIMA.attuale)
  })

  it("un rifiuto del ponte si legge", async () => {
    const ponte = ponteFinto(PRIMA, null)
    ponte.sposta.mockRejectedValueOnce("Non riesco a preparare l'archivio.")
    await apri()
    fireEvent.click(await screen.findByRole("button", { name: "Sposta la cartella dei dati…" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a preparare l'archivio.")
  })
})
