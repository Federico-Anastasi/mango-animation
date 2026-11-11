import { fireEvent, render, screen } from "@testing-library/react"
import { lazy, Suspense } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ConfineErrore } from "../src/comuni/ConfineErrore"
import { leggiIndirizzo } from "../src/indirizzo"
import { scegliLingua } from "../src/lingua"
import { PaginaStile } from "../src/stile/PaginaStile"
import { caratteriDiProva, partenzeDiProva, stileDiProva } from "./fixture"
import { installaRete } from "./rete"

function Rotto(): never {
  throw new Error("boom nel disegno")
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())

describe("il confine d'errore", () => {
  it("un'eccezione nel disegno mostra una frase e «Ricarica», non la pagina bianca", () => {
    render(
      <ConfineErrore>
        <Rotto />
      </ConfineErrore>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Qualcosa si è rotto in questa pagina")
    expect(screen.getByRole("button", { name: "Ricarica" })).toBeInTheDocument()
    expect(screen.getByText("boom nel disegno")).toBeInTheDocument()
  })

  it("«Ricarica» ricarica la pagina", () => {
    const ricarica = vi.fn()
    vi.stubGlobal("location", { ...window.location, reload: ricarica })
    render(
      <ConfineErrore>
        <Rotto />
      </ConfineErrore>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Ricarica" }))
    expect(ricarica).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it("in inglese la frase e il pulsante sono in inglese", () => {
    scegliLingua("en")
    render(
      <ConfineErrore>
        <Rotto />
      </ConfineErrore>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Something broke on this page")
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument()
  })

  it("un pezzo dell'interfaccia che non si scarica mostra la stessa frase", async () => {
    const NonSiScarica = lazy(() => Promise.reject(new Error("Failed to fetch dynamically imported module")))
    render(
      <ConfineErrore>
        <Suspense fallback="carico">
          <NonSiScarica />
        </Suspense>
      </ConfineErrore>,
    )
    expect(await screen.findByRole("alert")).toHaveTextContent("Qualcosa si è rotto in questa pagina")
  })

  it("cambiando la chiave dopo un errore, il contenuto buono torna senza ricaricare", () => {
    const { rerender } = render(
      <ConfineErrore key="a">
        <Rotto />
      </ConfineErrore>,
    )
    expect(screen.getByRole("alert")).toBeInTheDocument()
    rerender(
      <ConfineErrore key="b">
        <p>tutto bene</p>
      </ConfineErrore>,
    )
    expect(screen.getByText("tutto bene")).toBeInTheDocument()
  })
})

describe("il confine locale", () => {
  it("mostra la frase dell'errore senza «Ricarica», e riprova quando cambia la chiave", () => {
    const { rerender } = render(
      <ConfineErrore locale reimposta="a">
        <Rotto />
      </ConfineErrore>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("boom nel disegno")
    expect(screen.queryByRole("button", { name: "Ricarica" })).toBeNull()
    rerender(
      <ConfineErrore locale reimposta="b">
        <p>tutto bene</p>
      </ConfineErrore>,
    )
    expect(screen.getByText("tutto bene")).toBeInTheDocument()
  })
})

describe("l'indirizzo", () => {
  it("un % non valido nell'indirizzo non lancia: resta il pezzo com'è scritto", () => {
    expect(leggiIndirizzo("#/video/100%")).toMatchObject({ vista: "video", slug: "100%" })
    expect(leggiIndirizzo("#/video/100%25/montaggio")).toMatchObject({ slug: "100%", scheda: "montaggio" })
  })
})

describe("la pagina Stile con un colore che lo stile non ha", () => {
  const getContext = HTMLCanvasElement.prototype.getContext
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = getContext
    vi.unstubAllGlobals()
  })

  it("si apre, spiega il problema e non disegna il cartello rotto invece di spegnersi", async () => {
    // Il cartello di prova si disegna su una tela e con un carattere del browser: qui una tela che non disegna e un carattere che non arriva, ma i calcoli partono.
    HTMLCanvasElement.prototype.getContext = (() => ({ fillRect: () => {}, translate: () => {} })) as never
    vi.stubGlobal("FontFace", class { load = () => new Promise(() => {}) })
    const stile = stileDiProva()
    stile.sottotitoli.colore = "inesistente"
    installaRete({ "GET /api/stile": stile, "GET /api/stile/partenza": partenzeDiProva(), "GET /api/caratteri": caratteriDiProva() })
    render(<PaginaStile />)
    expect(await screen.findByRole("heading", { name: "I quadri" })).toBeInTheDocument()
    expect((await screen.findAllByText("Il colore «inesistente» non è nello stile.")).length).toBeGreaterThan(0)
    expect(screen.getByRole("heading", { name: "Sottotitoli e titolo" })).toBeInTheDocument()
  })
})
