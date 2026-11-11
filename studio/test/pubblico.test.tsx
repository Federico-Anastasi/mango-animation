import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Pubblico } from "../src/pubblico/Pubblico"
import type { StatoCanale } from "../src/tipi"
import { errore, installaEventi, installaRete } from "./rete"

let eventi: ReturnType<typeof installaEventi>

beforeEach(() => {
  eventi = installaEventi()
})
afterEach(() => vi.unstubAllGlobals())

const CANALE: StatoCanale = {
  ultima: { lettura: "2026-11-03-1000", quando: "2026-11-03T10:00:00" },
  letture: [],
  profilo: { nome: "mio_canale", follower: 640, mi_piace: 1000, video: 2 },
  video: [
    { id: "1", slug: null, titolo: "Primo", pubblicato: "2026-10-04T13:25", visualizzazioni: 4000, commenti: 1, commenti_letti: 1, variazione: null },
    { id: "2", slug: null, titolo: "Secondo", pubblicato: "2026-10-05T13:25", visualizzazioni: 1000, commenti: 1, commenti_letti: 1, variazione: null },
  ],
}

describe("i dati di prima", () => {
  it("se la rilettura del canale fallisce e restano i dati di prima, la pagina lo dice con la data dei dati, e «Riprova» rilegge", async () => {
    const { imposta } = installaRete({ "GET /api/canale/tiktok": CANALE, "GET /api/video": [], "GET /api/canale/tiktok/messaggi": { quando: "2026-11-03T10:00:00", conversazioni: [] } })
    render(<Pubblico />)
    await screen.findByRole("heading", { name: "I video usciti" })
    expect(screen.queryByText(/l'ultima rilettura non è riuscita/)).toBeNull()
    imposta("GET /api/canale/tiktok", () => errore(500, "Il server non risponde."))
    act(() => eventi.istanze.at(-1)!.manda({ tipo: "canale" }))
    expect(await screen.findByText("Dati del 3 nov 2026, 10:00: l'ultima rilettura non è riuscita.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "I video usciti" })).toBeInTheDocument()
    imposta("GET /api/canale/tiktok", CANALE)
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }))
    await waitFor(() => expect(screen.queryByText(/l'ultima rilettura non è riuscita/)).toBeNull())
  })
})

describe("i messaggi privati", () => {
  it("se il server non ha nessuna lettura, lo dice come un vuoto", async () => {
    installaRete({ "GET /api/canale/tiktok": CANALE, "GET /api/video": [], "GET /api/canale/tiktok/messaggi": () => errore(404, "Non ci sono messaggi letti.") })
    render(<Pubblico />)
    expect(await screen.findByText("Nessun messaggio privato in archivio.")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("un errore vero non si fa passare per «nessun messaggio»: si vede, con «Riprova»", async () => {
    installaRete({ "GET /api/canale/tiktok": CANALE, "GET /api/video": [], "GET /api/canale/tiktok/messaggi": () => errore(500, "Il file dei messaggi non si legge.") })
    render(<Pubblico />)
    expect(await screen.findByText("Il file dei messaggi non si legge.")).toBeInTheDocument()
    expect(screen.queryByText("Nessun messaggio privato in archivio.")).toBeNull()
    expect(screen.getAllByRole("button", { name: "Riprova" }).length).toBeGreaterThan(0)
  })
})

describe("i commenti di un video", () => {
  it("se i commenti non si leggono lo dice con «Riprova», che li rilegge", async () => {
    let rotto = true
    installaRete({
      "GET /api/canale/tiktok": CANALE,
      "GET /api/video": [],
      "GET /api/canale/tiktok/messaggi": { quando: "2026-11-03T10:00:00", conversazioni: [] },
      "GET /api/canale/tiktok/commenti?video=1": () => (rotto ? errore(500, "Il file dei commenti non si legge.") : { quando: "2026-11-03T10:00:00", video: "1", commenti: [{ id: "c", autore: "ospite", testo: "bel video", risposta_a: null, del_creator: false }], nuovi: [] }),
    })
    render(<Pubblico video="1" />)
    expect(await screen.findByText("Il file dei commenti non si legge.")).toBeInTheDocument()
    rotto = false
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }))
    expect(await screen.findByText("bel video")).toBeInTheDocument()
  })

  it("la risposta in ritardo del video di prima non prende il posto di quella del video scelto adesso", async () => {
    let arrivaIlPrimo: () => void = () => undefined
    const primo = new Promise<void>((ok) => (arrivaIlPrimo = ok))
    const commenti = (testo: string) => ({ quando: "2026-11-03T10:00:00", commenti: [{ id: testo, autore: "ospite", testo }], nuovi: [] })
    const rotte: Record<string, () => Response | Promise<Response>> = {
      "/api/canale/tiktok": () => Response.json(CANALE),
      "/api/video": () => Response.json([]),
      "/api/canale/tiktok/messaggi": () => Response.json({ quando: "2026-11-03T10:00:00", conversazioni: [] }),
      "/api/canale/tiktok/commenti?video=1": async () => {
        await primo
        return Response.json(commenti("commento del primo"))
      },
      "/api/canale/tiktok/commenti?video=2": () => Response.json(commenti("commento del secondo")),
    }
    vi.stubGlobal("fetch", vi.fn(async (indirizzo: string) => rotte[indirizzo]!()))
    const { rerender } = render(<Pubblico video="1" />)
    await screen.findByRole("heading", { name: "Commenti: Primo" })
    rerender(<Pubblico video="2" />)
    expect(await screen.findByText("commento del secondo")).toBeInTheDocument()
    arrivaIlPrimo()
    await new Promise((ok) => setTimeout(ok, 30))
    await waitFor(() => expect(screen.getByText("commento del secondo")).toBeInTheDocument())
    expect(screen.queryByText("commento del primo")).toBeNull()
  })
})
