// Una foto nel Girato si guarda come foto: l'immagine al posto del lettore e niente parlato da trascrivere.
import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DettaglioFile } from "../src/girato/DettaglioFile"
import { Girato } from "../src/girato/Girato"
import { scegliLingua } from "../src/lingua"
import type { FileGrezzo, PreparatoGrezzo } from "../src/tipi"
import { installaEventi, installaRete } from "./rete"

const VUOTO: PreparatoGrezzo = { parole: null, sagoma: null, leggero: null, onda: null, miniatura: null, trascrizione: null }

const foto = (nome: string, preparato: Partial<PreparatoGrezzo> = {}): FileGrezzo => ({
  file: `2026-10-06/${nome}`,
  nome,
  byte: 2_500_000,
  scheda: { tipo: "ripresa", origine: "telefono", arrivato: "2026-10-06T22:28:01", note: "" },
  scheda_problemi: [],
  preparato: { ...VUOTO, ...preparato },
  usato_in: [],
})

const dettaglio = (file: FileGrezzo) => render(<DettaglioFile file={file} titoloDi={(slug) => slug} />)

beforeEach(() => {
  installaEventi()
})
afterEach(() => vi.unstubAllGlobals())

describe("il dettaglio di una foto", () => {
  it("una HEIC mostra la foto intera, senza lettore, senza parlato e senza il tipo «Ripresa»", () => {
    const { container } = dettaglio(foto("IMG_0001.HEIC", { foto: "preparati/2026-10-06/IMG_0001.HEIC/foto.jpg", miniatura: "preparati/2026-10-06/IMG_0001.HEIC/miniatura.jpg" }))
    const immagine = container.querySelector("img")!
    expect(immagine.getAttribute("src")).toBe("/media/preparati/2026-10-06/IMG_0001.HEIC/foto.jpg")
    expect(container.querySelector("video")).toBeNull()
    expect(screen.queryByText(/non si apre qui così com'è/)).toBeNull()
    expect(screen.queryByRole("heading", { name: "Il parlato" })).toBeNull()
    expect(screen.queryByText(/trascritto/)).toBeNull()
    expect(screen.queryByLabelText("Tipo")).toBeNull()
    expect(screen.queryByText("Non ancora preparato.")).toBeNull()
    expect(screen.getByLabelText("Da dove viene")).toBeInTheDocument()
    expect(screen.getByLabelText("Note su questo file")).toBeInTheDocument()
  })

  it("una HEIC senza la foto intera mostra la miniatura", () => {
    const { container } = dettaglio(foto("IMG_0002.heic", { miniatura: "preparati/2026-10-06/IMG_0002.heic/miniatura.jpg" }))
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/media/preparati/2026-10-06/IMG_0002.heic/miniatura.jpg")
  })

  it("una JPEG o una PNG si guarda dall'originale, che il browser apre", () => {
    expect(dettaglio(foto("a.jpg")).container.querySelector("img")!.getAttribute("src")).toBe("/media/grezzo/2026-10-06/a.jpg")
    expect(dettaglio(foto("b.PNG")).container.querySelector("img")!.getAttribute("src")).toBe("/media/grezzo/2026-10-06/b.PNG")
  })

  it("una HEIC ancora senza immagine dice che la foto non è pronta, e non prova ad aprirla", () => {
    const { container } = dettaglio(foto("IMG_0003.heic"))
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("video")).toBeNull()
    expect(screen.getByText(/La foto non è ancora pronta/)).toBeInTheDocument()
  })

  it("in inglese parla inglese", () => {
    scegliLingua("en")
    dettaglio(foto("IMG_0003.heic"))
    expect(screen.getByText(/The photo is not ready yet/)).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "The speech" })).toBeNull()
  })

  it("un video ha ancora il suo parlato", () => {
    const { container } = dettaglio({ ...foto("a.mp4"), scheda: { tipo: "ripresa", origine: "telefono", durata: 12, note: "" } })
    expect(container.querySelector("video")).not.toBeNull()
    expect(screen.getByRole("heading", { name: "Il parlato" })).toBeInTheDocument()
    expect(screen.getByLabelText("Tipo")).toBeInTheDocument()
  })
})

describe("il dettaglio di un video senza traccia audio", () => {
  const video = (preparato: Partial<PreparatoGrezzo>): FileGrezzo => ({ ...foto("muto.mp4"), scheda: { tipo: "schermo", origine: "registrazione", durata: 12, note: "" }, preparato: { ...VUOTO, ...preparato } })
  // Preparato un video muto, il motore non scrive il livello della voce né le parole: restano la copia leggera e la miniatura.
  const preparatoMuto = { leggero: "preparati/2026-10-06/muto.mp4/leggero.mp4", miniatura: "preparati/2026-10-06/muto.mp4/miniatura.jpg" }

  it("dice che il file non ha audio, non che il parlato non è stato ancora trascritto", () => {
    dettaglio(video(preparatoMuto))
    expect(screen.getByText("Il file non ha audio: non c'è parlato da trascrivere.")).toBeInTheDocument()
    expect(screen.queryByText(/non è stato ancora trascritto/)).toBeNull()
    expect(screen.queryByText("Non ancora preparato.")).toBeNull()
  })

  it("in inglese lo dice in inglese", () => {
    scegliLingua("en")
    dettaglio(video(preparatoMuto))
    expect(screen.getByText("This file has no audio, so there is no speech to transcribe.")).toBeInTheDocument()
    expect(screen.queryByText(/has not been transcribed yet/)).toBeNull()
  })

  it("un video non ancora preparato non si sa se ha audio: resta «non ancora trascritto»", () => {
    dettaglio(video({}))
    expect(screen.getByText(/Il parlato non è stato ancora trascritto/)).toBeInTheDocument()
    expect(screen.queryByText(/non ha audio/)).toBeNull()
    expect(screen.getByText("Non ancora preparato.")).toBeInTheDocument()
  })

  it("un video con audio e le parole ancora da fare non è «senza audio»", () => {
    dettaglio(video({ ...preparatoMuto, onda: "preparati/2026-10-06/muto.mp4/onda.bin" }))
    expect(screen.getByText(/Il parlato non è stato ancora trascritto/)).toBeInTheDocument()
    expect(screen.queryByText(/non ha audio/)).toBeNull()
  })
})

describe("l'elenco del girato", () => {
  it("una foto è «Foto», non «Ripresa»", async () => {
    installaRete({ "GET /api/grezzo": [{ giorno: "2026-10-06", file: [foto("IMG_0001.HEIC", { miniatura: "preparati/x/miniatura.jpg" }), { ...foto("a.mp4"), scheda: { tipo: "ripresa", origine: "telefono", durata: 12, note: "" } }] }], "GET /api/video": [] })
    render(<Girato file={undefined} />)
    const riga = await screen.findByRole("button", { name: /IMG_0001/ })
    expect(riga).toHaveTextContent(/Foto/)
    expect(riga).not.toHaveTextContent(/Ripresa/)
    expect(screen.getByRole("button", { name: /a\.mp4/ })).toHaveTextContent(/Ripresa/)
  })
})
