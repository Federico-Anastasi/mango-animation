import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Cornice } from "../src/cornice/Cornice"
import { Girato } from "../src/girato/Girato"
import { scegliLingua } from "../src/lingua"
import type { FileGrezzo, VoceElenco } from "../src/tipi"
import { ElencoVideo } from "../src/video/ElencoVideo"
import { FileVideo } from "../src/video/FileVideo"
import { SchedaDelVideo } from "../src/video/SchedaDelVideo"
import { dettaglioDiProva } from "./fixture"
import { installaEventi, installaRete } from "./rete"

const voce = (slug: string, stato: VoceElenco["scheda"]["stato"], extra: Partial<VoceElenco> = {}): VoceElenco => ({
  slug,
  scheda: { titolo: `Video ${slug}`, stato, creato: "2026-10-06" },
  durata: null,
  miniatura: null,
  anteprima: null,
  ha_piano: false,
  ha_finale: false,
  ultimo_cambio: "2026-10-09T10:00:00",
  ...extra,
})

const file = (nome: string, extra: Partial<FileGrezzo> = {}): FileGrezzo => ({
  file: `2026-10-06/${nome}`,
  nome,
  byte: 3_000_000,
  scheda: { tipo: "ripresa", origine: "telefono", durata: 12 },
  scheda_problemi: [],
  preparato: { parole: null, sagoma: null, leggero: null, onda: null, miniatura: null, trascrizione: null },
  usato_in: [],
  ...extra,
})

const rotteBase = {
  "GET /api/consumi": { pronto: true, video: {}, senza_video: { tempo: 0, giri: 0, token: { scritti: 0, riletti: 0, nuovi: 0 } } },
  "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: null, ultima: null },
  "GET /api/arrivi": { in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], pronto: false, motivo: null },
  "GET /api/accesso-studio": { acceso: false, in_ascolto: true, casa: null, fuori: null, pronto: true, motivo: null },
}

beforeEach(() => {
  installaEventi()
  window.location.hash = ""
  scegliLingua("en")
})
afterEach(() => vi.unstubAllGlobals())

describe("video, footage and frame in English", () => {
  it("the frame shows the sections, the phone state and the jobs panel in English", async () => {
    installaRete({
      ...rotteBase,
      "GET /api/lavori": { in_corso: { id: "l1", slug: "uno", comando: "monta", iniziato: "2026-10-09T10:00:00", righe: [] }, in_coda: [], finiti: [{ id: "l0", slug: "uno", comando: "risolvi", esito: "fallito" }] },
      "GET /api/video": [voce("uno", "in lavorazione")],
    })
    render(<Cornice vista="video" />)
    const menu = screen.getByRole("navigation", { name: "Sections" })
    for (const nome of ["Videos", "Footage", "Audience", "Ranking", "Growth", "Production", "Style"]) expect(within(menu).getByText(nome)).toBeInTheDocument()
    expect(screen.queryByText("Girato")).toBeNull()
    expect(await screen.findByText("Phone not ready")).toBeInTheDocument()
    fireEvent.click(await screen.findByRole("button", { name: /Job in progress/ }))
    const pannello = await screen.findByRole("dialog", { name: "Jobs" })
    expect(within(pannello).getByText("Edit · Video uno")).toBeInTheDocument()
    expect(within(pannello).getByRole("button", { name: "Stop" })).toBeInTheDocument()
    expect(within(pannello).getByText("Recalculating the edit · Video uno")).toBeInTheDocument()
    expect(within(pannello).getByText("failed")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Theme: system/ })).toBeInTheDocument()
  })

  it("the list of videos groups by status and counts with English plurals", async () => {
    installaRete({ ...rotteBase, "GET /api/video": [voce("uno", "in lavorazione"), voce("due", "proposta"), voce("tre", "proposta")] })
    render(<ElencoVideo />)
    expect(await screen.findByRole("heading", { name: "In progress" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Proposals" })).toBeInTheDocument()
    expect(screen.getByText("1 video")).toBeInTheDocument()
    expect(screen.getByText("2 videos")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Search by title")).toBeInTheDocument()
    expect(screen.getAllByText("not edited yet")).toHaveLength(3)
    expect(screen.queryByText("In lavorazione")).toBeNull()
  })

  it("the footage list and a file's detail are in English", async () => {
    const giorni = [{ giorno: "2026-10-06", file: [file("a.mp4", { usato_in: ["uno"] }), file("b.mp4", { scheda: { tipo: "diretta", origine: "registrazione" } })] }]
    installaRete({ ...rotteBase, "GET /api/grezzo": giorni, "GET /api/video": [voce("uno", "in lavorazione")] })
    render(<Girato file="2026-10-06/b.mp4" />)
    expect(await screen.findByRole("heading", { name: "Footage" })).toBeInTheDocument()
    expect(screen.getByText("2 files")).toBeInTheDocument()
    expect(screen.getByText("used in 1 video: Video uno")).toBeInTheDocument()
    expect(screen.getByText("never used")).toBeInTheDocument()
    expect(screen.getByLabelText("Only those never used")).toBeInTheDocument()
    expect(screen.getByText("Not prepared yet.")).toBeInTheDocument()
    expect(screen.getByText("The speech")).toBeInTheDocument()
    expect(screen.getByText(/Filmed on 6 Oct 2026/)).toBeInTheDocument()
    expect(screen.queryByText("mai usato")).toBeNull()
  })

  it("the video card and the output files are in English", () => {
    installaRete({ ...rotteBase })
    const video = dettaglioDiProva()
    const { unmount } = render(<SchedaDelVideo video={video} salvaScheda={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "The proposal" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Caption and hashtags" })).toBeInTheDocument()
    expect(screen.getByText("No hashtags for this video.")).toBeInTheDocument()
    expect(screen.queryByText("La proposta")).toBeNull()
    unmount()
    render(<FileVideo video={video} salvaScheda={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "The output files" })).toBeInTheDocument()
    expect(screen.getByText("No file has come out yet: they appear here as soon as the video is edited.")).toBeInTheDocument()
  })
})
