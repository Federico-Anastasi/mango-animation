// Lo studio si tiene al passo con ciò che il server annuncia, e dice quando un file scritto a mano non va.
import { act, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { animazioni, copiaVideo } from "../src/dati"
import { DettaglioFile } from "../src/girato/DettaglioFile"
import { useSorgentiPreparate } from "../src/montaggio/useSorgentiPreparate"
import type { InfoSorgente } from "../src/montaggio/sorgenti"
import type { FileGrezzo } from "../src/tipi"
import { PaginaVideo } from "../src/video/PaginaVideo"
import { dettaglioDiProva, stileDiProva } from "./fixture"
import { errore, installaEventi, installaRete, type Chiamata } from "./rete"

let eventi: ReturnType<typeof installaEventi>

// Il montaggio si carica a richiesta: la prima volta si compila, e le prove non devono dipendere da quanto ci mette.
beforeAll(() => import("../src/montaggio/Montaggio"), 60000)

beforeEach(() => {
  eventi = installaEventi()
  window.location.hash = ""
})
afterEach(() => vi.unstubAllGlobals())

describe("la scheda e il piano scritti male", () => {
  it("la pagina del video dice perché, e l'avviso se ne va appena il file è corretto", async () => {
    const dettaglio = { ...dettaglioDiProva(), problemi: { scheda: ["proposta: «spezzoni» non è una chiave ammessa"], piano: [] } }
    const { imposta } = installaRete({ "GET /api/video/prova": dettaglio, "GET /api/stile": stileDiProva(), "GET /api/grezzo": [], "GET /api/animazioni": {} })
    render(<PaginaVideo slug="prova" scheda="scheda" parametri={new URLSearchParams()} />)
    expect(await screen.findByText("La scheda di questo video ha un errore: chiedi nella chat di sistemarla. Qui vedi l'ultima scheda valida.")).toBeInTheDocument()
    const riquadro = screen.getByText("Dettaglio per chi sistema l'errore").closest("details")!
    expect(riquadro).not.toHaveAttribute("open")
    expect(riquadro).toHaveTextContent("proposta: «spezzoni» non è una chiave ammessa")
    expect(screen.queryByText(/chiave ammessa/, { selector: "p" })).toBeNull()

    imposta("GET /api/video/prova", dettaglioDiProva())
    act(() => eventi.istanze[0]!.manda({ tipo: "video", slug: "prova", cosa: "scheda" }))
    await waitFor(() => expect(screen.queryByText(/La scheda di questo video ha un errore/)).toBeNull())
  })

  it("un piano non valido si dice sopra le schede, e il montaggio non lo scambia per una base mancante", async () => {
    const dettaglio = { ...dettaglioDiProva(), piano_risolto_da_base: null, problemi: { scheda: [], piano: ["scene[0]: manca «nome»"] } }
    installaRete({ "GET /api/video/prova": dettaglio, "GET /api/stile": stileDiProva(), "GET /api/grezzo": [], "GET /api/animazioni": {} })
    render(<PaginaVideo slug="prova" scheda="montaggio" parametri={new URLSearchParams()} />)
    expect(await screen.findByText("Il piano di questo video ha un errore: chiedi nella chat di sistemarlo.")).toBeInTheDocument()
    expect(screen.getByText("Dettaglio per chi sistema l'errore").closest("details")).toHaveTextContent("scene[0]: manca «nome»")
    expect(await screen.findByText("Il piano di questo video ha un errore (è scritto sopra). Appena è sistemato il montaggio riappare.")).toBeInTheDocument()
    expect(screen.queryByText(/video di base/)).toBeNull()
  })

  it("un file del girato con la scheda rifiutata mostra il motivo invece di «sta ancora leggendo»", () => {
    const file: FileGrezzo = {
      file: "2026-10-06/a.mp4",
      nome: "a.mp4",
      byte: 1000,
      scheda: null,
      scheda_problemi: ["soggetto: non è una chiave ammessa"],
      preparato: { parole: null, sagoma: null, leggero: null, onda: null, miniatura: null, trascrizione: null },
      usato_in: [],
    }
    render(<DettaglioFile file={file} titoloDi={(slug) => slug} />)
    expect(screen.getByText("La scheda di questo file ha un errore: chiedi nella chat di sistemarla.")).toBeInTheDocument()
    expect(screen.getByText("Dettaglio per chi sistema l'errore").closest("details")).toHaveTextContent("soggetto: non è una chiave ammessa")
    expect(screen.queryByText(/sta ancora leggendo/)).toBeNull()
  })
})

describe("il dettaglio di un video", () => {
  it("si rilegge anche quando cambia lo stile, da cui dipende se il calcolo del montaggio è ancora buono", async () => {
    const { chiamate } = installaRete({ "GET /api/video/stile-prova": { ...dettaglioDiProva(), slug: "stile-prova" } })
    const copia = copiaVideo("stile-prova")
    const smetti = copia.iscriviti(() => undefined)
    await waitFor(() => expect(copia.stato().caricato).toBe(true))
    const letture = () => chiamate.filter((c) => c.percorso === "/api/video/stile-prova").length
    expect(letture()).toBe(1)

    act(() => eventi.istanze[0]!.manda({ tipo: "video", slug: "altro", cosa: "piano" }))
    expect(letture()).toBe(1)
    act(() => eventi.istanze[0]!.manda({ tipo: "stile" }))
    await waitFor(() => expect(letture()).toBe(2))
    smetti()
  })
})

describe("l'elenco delle scene", () => {
  it("si rilegge quando il server dice che le scene sono cambiate, e solo allora", async () => {
    const chiamate: Chiamata[] = installaRete({ "GET /api/animazioni": { v: [{ sigla: "a", titolo: "A", durata: 3 }] } }).chiamate
    const smetti = animazioni.iscriviti(() => undefined)
    await waitFor(() => expect(animazioni.stato().caricato).toBe(true))
    const letture = () => chiamate.filter((c) => c.percorso === "/api/animazioni").length
    expect(letture()).toBe(1)

    act(() => eventi.istanze[0]!.manda({ tipo: "video", slug: "v", cosa: "nuovo" }))
    act(() => eventi.istanze[0]!.manda({ tipo: "stile" }))
    expect(letture()).toBe(1)

    act(() => eventi.istanze[0]!.manda({ tipo: "animazioni" }))
    await waitFor(() => expect(letture()).toBe(2))
    smetti()
  })
})

describe("le parole e l'onda di un file preparato di nuovo", () => {
  const sorgente = (parole: boolean): InfoSorgente => ({ nome: "a", file: "2026-10-06/a.mp4", larghezza: null, altezza: null, durata: 5, parole, leggero: null, sagoma: null, sagomaPezzi: null, miniatura: null, onda: null, trovato: true })

  it("si rileggono se il file perde le parole e le riottiene", async () => {
    const { chiamate } = installaRete({ "GET /api/grezzo/parole?file=2026-10-06%2Fa.mp4": [{ p: "ciao", da: 0, a: 0.4 }] })
    const letture = () => chiamate.filter((c) => c.percorso.startsWith("/api/grezzo/parole")).length
    const { result, rerender } = renderHook(({ s }) => useSorgentiPreparate([s]), { initialProps: { s: sorgente(true) } })
    await waitFor(() => expect(result.current.parole("2026-10-06/a.mp4")).not.toBeNull())
    expect(letture()).toBe(1)

    rerender({ s: sorgente(false) })
    expect(result.current.parole("2026-10-06/a.mp4")).toBeNull()
    rerender({ s: sorgente(true) })
    await waitFor(() => expect(letture()).toBe(2))
  })
})

describe("un rifiuto del server con più motivi", () => {
  it("la prima riga è la frase, le altre stanno nel riquadro che si apre a richiesta", async () => {
    installaRete({ "GET /api/video/rotto": errore(404, "Non c'è un video «rotto» con una scheda valida: la sua scheda va sistemata.", { problemi: ["manca «stato»"] }) })
    render(<PaginaVideo slug="rotto" scheda="scheda" parametri={new URLSearchParams()} />)
    expect(await screen.findByText("Non c'è un video «rotto» con una scheda valida: la sua scheda va sistemata.")).toBeInTheDocument()
    const dettaglio = screen.getByText("Dettaglio per chi sistema l'errore").closest("details")!
    expect(dettaglio).not.toHaveAttribute("open")
    expect(dettaglio).toHaveTextContent("manca «stato»")
  })
})
