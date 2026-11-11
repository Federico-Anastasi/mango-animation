import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { scegliLingua } from "../src/lingua"
import { Montaggio } from "../src/montaggio/Montaggio"
import { togliParole, zoomPezzo, type Contesto } from "../src/montaggio/ritocchi"
import { PaginaStile } from "../src/stile/PaginaStile"
import { controllaStile } from "../src/stile/validazione"
import { caratteriDiProva, conUscite, dettaglioDiProva, partenzeDiProva, pianoDiProva, stileDiProva } from "./fixture"
import { installaEventi, installaRete } from "./rete"

const giorni = [
  {
    giorno: "2026-10-06",
    file: [{ file: "2026-10-06/a.mp4", nome: "a.mp4", byte: 1, scheda: { tipo: "ripresa", origine: "telefono", durata: 12, largo: 540, alto: 960 }, scheda_problemi: [], preparato: { parole: null, sagoma: null, leggero: "preparati/x/leggero.mp4", miniatura: null, onda: "preparati/x/onda.bin", trascrizione: null }, usato_in: ["prova"] }],
  },
  {
    giorno: "2026-10-08",
    file: [{ file: "2026-10-08/b.mp4", nome: "b.mp4", byte: 1, scheda: { tipo: "diretta", origine: "registrazione", durata: 14, largo: 1280, alto: 720 }, scheda_problemi: [], preparato: { parole: null, sagoma: null, leggero: "preparati/x/leggero.mp4", miniatura: null, onda: "preparati/x/onda.bin", trascrizione: null }, usato_in: ["prova"] }],
  },
]

let eventi: ReturnType<typeof installaEventi>

beforeEach(() => {
  eventi = installaEventi()
  installaRete({
    "GET /api/stile": stileDiProva(),
    "GET /api/stile/partenza": partenzeDiProva(),
    "GET /api/caratteri": caratteriDiProva(),
    "GET /api/grezzo": giorni,
    "GET /api/animazioni": { prova: ["c1", "c2"] },
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /media/video/prova/lavoro/teste.json": {},
    "GET /media/preparati/2026-10-06/a.mp4/onda.bin": new Response(new Uint8Array(1200), { status: 200 }),
    "GET /media/preparati/2026-10-08/b.mp4/onda.bin": new Response(new Uint8Array(1400), { status: 200 }),
    "PUT /api/stile": {},
  })
  scegliLingua("en")
})
afterEach(() => vi.unstubAllGlobals())

describe("il montaggio in inglese", () => {
  it("mostra il video, il parlato e la barra nella lingua scelta", async () => {
    render(<Montaggio video={dettaglioDiProva()} tempoIniziale={null} />)
    await screen.findByRole("heading", { name: "The video" })
    expect(screen.getByRole("heading", { name: "Speech" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Undo/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edited" })).toBeInTheDocument()
    expect(screen.getByLabelText("Video layout")).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Word by word" })).toBeInTheDocument()
    expect(screen.getByText("Clips")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Il video" })).toBeNull()
    expect(screen.queryByText("Pezzi")).toBeNull()
  })

  it("il pannello del tratto scelto è in inglese", async () => {
    const { container } = render(<Montaggio video={dettaglioDiProva()} tempoIniziale={null} />)
    await screen.findByRole("heading", { name: "The video" })
    const tratto = container.querySelector('[data-tratto="0"]')!
    fireEvent.pointerDown(tratto, { clientX: 10, button: 0, pointerId: 1 })
    fireEvent.pointerUp(tratto, { clientX: 10, pointerId: 1 })
    const pannello = (await screen.findByRole("heading", { name: "Selected clip" })).parentElement!
    expect(within(pannello).getByRole("button", { name: /Split here/ })).toBeInTheDocument()
    expect(within(pannello).getByRole("button", { name: /Remove/ })).toBeInTheDocument()
    expect(within(pannello).queryByRole("button", { name: /Dividi/ })).toBeNull()
    expect(pannello).toHaveTextContent(/Scene «.*», clip 1 of/)
  })
})

describe("l'avviso del montaggio vecchio in inglese", () => {
  it("dice che si ricalcola solo con un risolvi in corso; altrimenti che non segue il piano", async () => {
    const { unmount } = render(<Montaggio video={{ ...dettaglioDiProva(), risolto_aggiornato: false, lavoro: { id: "r", comando: "risolvi", stato: "in corso" } }} tempoIniziale={null} />)
    expect(await screen.findByRole("status")).toHaveTextContent("The edit is being recalculated")
    unmount()
    render(<Montaggio video={{ ...dettaglioDiProva(), risolto_aggiornato: false }} tempoIniziale={null} />)
    expect(await screen.findByRole("status")).toHaveTextContent("The edit does not follow the current plan or style yet")
  })
})

describe("l'avviso del piano o dello stile cambiati in inglese", () => {
  it("dice plan or style, con la data, e che il video non li segue ancora", async () => {
    const uscite = conUscite([{ file: "video/prova/uscite/finale.mp4", byte: 10, cambiato: "2026-10-09T10:00:00Z" }])
    render(<Montaggio video={{ ...dettaglioDiProva(), ...uscite, piano_cambiato: "2026-10-09T11:15:00Z", piano_dopo_montato: true }} tempoIniziale={null} />)
    fireEvent.click(await screen.findByRole("button", { name: "Edited" }))
    expect(await screen.findByText(/The plan or the style changed after the last edit \(.+\): this video does not follow them yet\. Ask in the chat to re-edit it\./)).toBeInTheDocument()
  })
})

describe("gli avvisi del montaggio in inglese", () => {
  const conAvvisi = (avvisi: Array<{ tratto: number; cosa: string; cosa_en?: string }>) => {
    const video = dettaglioDiProva()
    return { ...video, risolto: { ...video.risolto!, avvisi } }
  }
  const avvisi = [
    { tratto: 0, cosa: "il taglio inizio cade nella voce (-20 dB)", cosa_en: "the start cut falls inside the voice (-20 dB)" },
    { tratto: 1, cosa: "un avviso scritto prima dell'inglese" },
  ]

  it("l'elenco del video mostra l'inglese, e l'italiano dove l'avviso non ha l'inglese", async () => {
    render(<Montaggio video={conAvvisi(avvisi)} tempoIniziale={null} />)
    await screen.findByRole("heading", { name: "Edit warnings" })
    expect(screen.getByText(/the start cut falls inside the voice \(-20 dB\)/)).toBeInTheDocument()
    expect(screen.getByText(/un avviso scritto prima dell'inglese/)).toBeInTheDocument()
    expect(screen.queryByText(/il taglio inizio cade nella voce/)).toBeNull()
  })

  it("in italiano restano le frasi italiane", async () => {
    scegliLingua("it")
    render(<Montaggio video={conAvvisi(avvisi)} tempoIniziale={null} />)
    await screen.findByRole("heading", { name: "Avvisi del montaggio" })
    expect(screen.getByText(/il taglio inizio cade nella voce \(-20 dB\)/)).toBeInTheDocument()
    expect(screen.queryByText(/the start cut falls/)).toBeNull()
  })

  it("il pannello del tratto mostra l'avviso del tratto in inglese", async () => {
    const { container } = render(<Montaggio video={conAvvisi(avvisi)} tempoIniziale={null} />)
    await screen.findByRole("heading", { name: "The video" })
    const tratto = container.querySelector('[data-tratto="0"]')!
    fireEvent.pointerDown(tratto, { clientX: 10, button: 0, pointerId: 1 })
    fireEvent.pointerUp(tratto, { clientX: 10, pointerId: 1 })
    const pannello = (await screen.findByRole("heading", { name: "Selected clip" })).parentElement!
    expect(within(pannello).getByText("the start cut falls inside the voice (-20 dB)")).toBeInTheDocument()
  })
})

describe("i ritocchi in inglese", () => {
  const dettaglio = dettaglioDiProva()
  const ctx: Contesto = { proprio: pianoDiProva(), effettivo: dettaglio.piano_risolto_da_base!, risolto: dettaglio.risolto! }

  it("i motivi di rifiuto sono nella lingua in uso", () => {
    const esito = togliParole(ctx, 0, -1)
    expect(esito).toEqual({ ok: false, motivo: "First choose the words to remove." })
    const zoom = zoomPezzo(ctx, 0, 0, { scala: 9 })
    expect(zoom.ok).toBe(false)
    if (!zoom.ok) expect(zoom.motivo).toBe("Zoom goes from 1 to 4.")
  })

  it("tornando all'italiano i motivi tornano italiani", () => {
    scegliLingua("it")
    const esito = togliParole(ctx, 0, -1)
    expect(esito).toEqual({ ok: false, motivo: "Scegli prima le parole da togliere." })
  })
})

describe("lo stile in inglese", () => {
  it("se il file cambia sotto una bozza lo dice in inglese, con le due scelte", async () => {
    render(<PaginaStile />)
    const corpo = (await screen.findAllByRole("textbox", { name: /^Size$/ }))[0]!
    fireEvent.change(corpo, { target: { value: "62" } })
    fireEvent.blur(corpo)
    const nuovo = stileDiProva()
    nuovo.sottotitoli.stacco = 0.9
    installaRete({ "GET /api/stile": nuovo, "GET /api/stile/partenza": partenzeDiProva(), "GET /api/caratteri": caratteriDiProva() })
    act(() => eventi.istanze[0]!.manda({ tipo: "stile" }))
    expect(await screen.findByText(/The style changed in the meantime/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Keep mine" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Take the new ones" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("la pagina e i controlli sono in inglese", async () => {
    render(<PaginaStile />)
    expect(await screen.findByRole("heading", { name: "Style" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Subtitles and title" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeInTheDocument()
    expect(screen.getByText("All layouts")).toBeInTheDocument()
    expect(screen.getByText(/No video uses a layout yet./)).toBeInTheDocument()
    expect(screen.getAllByRole("textbox", { name: /Voice volume/ })[0]).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Salva" })).toBeNull()
  })

  it("i nomi dei colori, dei formati e il «nessuno» dello stile di serie sono in inglese", async () => {
    render(<PaginaStile />)
    expect(await screen.findByLabelText("Color Background")).toBeInTheDocument()
    expect(screen.getByLabelText("Color Text")).toBeInTheDocument()
    expect(screen.getAllByRole("textbox", { name: /Format \(vertical\), width/ })[0]).toBeInTheDocument()
    expect(screen.getAllByRole("textbox", { name: /Format \(horizontal\), height/ })[0]).toBeInTheDocument()
    expect(screen.getAllByRole("option", { name: "none" }).length).toBeGreaterThan(0)
    expect(screen.queryByText("nessuno")).toBeNull()
    expect(screen.queryByLabelText(/Color carta/)).toBeNull()
  })

  it("un valore non valido lo dice in inglese", async () => {
    render(<PaginaStile />)
    const campo = (await screen.findAllByRole("textbox", { name: /Voice volume/ }))[0]!
    fireEvent.change(campo, { target: { value: "5" } })
    fireEvent.blur(campo)
    expect(await screen.findByRole("alert")).toHaveTextContent(/The voice volume is a level in decibels/)
  })

  it("la validazione traduce le frasi composte", () => {
    const s = stileDiProva()
    s.formati.verticale!.largo = 0
    expect(controllaStile(s)).toContain("The width of format verticale must be greater than zero.")
  })
})
