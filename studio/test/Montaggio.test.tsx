import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { applicaRitocchi } from "../../server/src/ritocchi"
import { Montaggio } from "../src/montaggio/Montaggio"
import type { DettaglioVideo, Piano } from "../src/tipi"
import { dataOra } from "../src/testo"
import { conUscite, dettaglioDiProva, dettaglioSenzaVoce, pianoDiProva, stileDiProva } from "./fixture"
import { installaEventi, installaRete, type Chiamata } from "./rete"

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

let chiamate: Chiamata[]

function rete(extra: Record<string, unknown> = {}) {
  const r = installaRete({
    "GET /api/stile": stileDiProva(),
    "GET /api/grezzo": giorni,
    "GET /api/animazioni": { prova: ["c1", "c2"] },
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "PATCH /api/video/prova/piano": {},
    "POST /api/video/prova/annulla": {},
    "POST /api/video/prova/rifai": {},
    "POST /api/video/prova/lavori": {},
    "GET /api/video/prova/versioni": { versioni: [] },
    "GET /media/preparati/2026-10-06/a.mp4/onda.bin": new Response(new Uint8Array(1200), { status: 200 }),
    "GET /media/preparati/2026-10-08/b.mp4/onda.bin": new Response(new Uint8Array(1400), { status: 200 }),
    ...extra,
  })
  chiamate = r.chiamate
}

let pianoAperto: unknown

async function apri(video: DettaglioVideo = dettaglioDiProva(), tempo: string | null = null) {
  pianoAperto = video.piano
  const resa = render(<Montaggio video={video} tempoIniziale={tempo} />)
  await screen.findByRole("heading", { name: "Il video" })
  return resa
}

const nelParlato = (parola: string) => within(screen.getByRole("heading", { name: "Il parlato" }).parentElement!).getByRole("button", { name: parola })

const ritocchiMandati = () => chiamate.filter((c) => c.metodo === "PATCH" && c.percorso === "/api/video/prova/piano")
/** I piani che i gesti hanno chiesto: i ritocchi mandati, applicati dal vero codice del server al piano con cui si è aperto il montaggio. */
const piani = () => ritocchiMandati().map((c) => applicaRitocchi(pianoAperto, c.corpo) as Piano)

function scegliTratto(contenitore: HTMLElement, indice: number, x: number) {
  const tratto = contenitore.querySelector(`[data-tratto="${indice}"]`)!
  fireEvent.pointerDown(tratto, { clientX: x, button: 0, pointerId: 1 })
  fireEvent.pointerUp(tratto, { clientX: x, pointerId: 1 })
}

beforeEach(() => {
  installaEventi()
  rete()
})
afterEach(() => vi.unstubAllGlobals())

describe("il montaggio", () => {
  it("senza niente di scelto mostra il video, gli avvisi e il parlato", async () => {
    await apri()
    expect(screen.getByLabelText("Quadro del video")).toHaveValue("sagoma-su-animazione")
    expect(screen.getByRole("heading", { name: "Il parlato" })).toBeInTheDocument()
    expect(nelParlato("ciao")).toBeInTheDocument()
    expect(screen.getByTestId("palco")).toBeInTheDocument()
  })

  it("accanto all'anteprima il video e il parlato stanno in una riga che si stira; la timeline è sotto, a parte", async () => {
    const { container } = await apri()
    const pannelli = screen.getByRole("heading", { name: "Il video" }).closest("[data-accanto]")
    expect(pannelli).toHaveAttribute("data-accanto", "true")
    expect(pannelli).toContainElement(screen.getByRole("heading", { name: "Il parlato" }))
    const riga = pannelli!.closest("[data-allinea]")
    expect(riga).toHaveAttribute("data-allinea", "stira")
    expect(riga).toContainElement(screen.getByTestId("palco"))
    expect(riga).not.toContainElement(container.querySelector("[data-tratto]") as HTMLElement)
  })

  it("sceglie un tratto e ne mostra il pannello; Togli scrive il piano", async () => {
    const { container } = await apri()
    scegliTratto(container, 0, 10)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.click(screen.getByRole("button", { name: /Togli/ }))
    await waitFor(() => expect(piani()).toHaveLength(1))
    expect(piani()[0]!.scene![0]!.pezzi[0]).toMatchObject({ da: 3, a: 9, via: [[3, 3.5]] })
  })

  it("Dividi qui divide il pezzo dove sta la testina", async () => {
    const { container } = await apri()
    scegliTratto(container, 1, 70)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.click(screen.getByRole("button", { name: /Dividi qui/ }))
    await waitFor(() => expect(piani()).toHaveLength(1))
    expect(piani()[0]!.scene![0]!.pezzi).toHaveLength(2)
    expect(piani()[0]!.scene![0]!.pezzi[0]!.a).toBe(5)
    expect(piani()[0]!.scene![0]!.pezzi[1]!.da).toBe(5)
  })

  it("Dividi qui è spento se la testina non è dentro il tratto", async () => {
    const { container } = await apri()
    scegliTratto(container, 1, 70)
    scegliTratto(container, 3, 10 * 20)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.pointerDown(screen.getByRole("slider", { name: "Scorri il video" }), { clientX: 20, button: 0, pointerId: 1 })
    expect(screen.getByRole("button", { name: /Dividi qui/ })).toBeDisabled()
  })

  it("i bordi del tratto si scrivono dai campi Da e A", async () => {
    const { container } = await apri()
    scegliTratto(container, 0, 10)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    const da = screen.getByRole("textbox", { name: /^Da/ })
    fireEvent.change(da, { target: { value: "0,8" } })
    fireEvent.blur(da)
    await waitFor(() => expect(piani()).toHaveLength(1))
    expect(piani()[0]!.scene![0]!.pezzi[0]!.da).toBe(0.8)
  })

  it("un numero che non è un numero non scrive niente e lo dice", async () => {
    const { container } = await apri()
    scegliTratto(container, 0, 10)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    const da = screen.getByRole("textbox", { name: /^Da/ })
    fireEvent.change(da, { target: { value: "boh" } })
    fireEvent.blur(da)
    expect(await screen.findByText(/Scrivi un numero/)).toBeInTheDocument()
    expect(piani()).toHaveLength(0)
  })

  it("lo zoom si sceglie e si scrive sul pezzo", async () => {
    const { container } = await apri()
    scegliTratto(container, 0, 10)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.change(screen.getByRole("combobox", { name: "Ingrandimento" }), { target: { value: "fisso" } })
    await waitFor(() => expect(piani()).toHaveLength(1))
    expect(piani()[0]!.scene![0]!.pezzi[0]!.zoom).toEqual({ scala: 1.5, centro: [0.5, 0.5] })
  })

  it("scegliere parole le toglie dal montaggio, e una si può correggere", async () => {
    await apri()
    fireEvent.click(nelParlato("mondo"))
    expect(await screen.findByRole("heading", { name: "1 parola scelta" })).toBeInTheDocument()
    const campo = screen.getByLabelText("Come si scrive")
    fireEvent.change(campo, { target: { value: "Mondo!" } })
    fireEvent.click(screen.getByRole("button", { name: "Correggi" }))
    await waitFor(() => expect(piani()).toHaveLength(1))
    expect(piani()[0]!.sottotitoli!.correzioni).toEqual([{ sorgente: "a", sentite: ["mondo"], giuste: "Mondo!" }])
  })

  it("Togli dal montaggio sulle parole scelte scrive i secondi da togliere", async () => {
    await apri()
    fireEvent.click(nelParlato("mondo"))
    await screen.findByRole("heading", { name: "1 parola scelta" })
    fireEvent.click(screen.getByRole("button", { name: /Togli dal montaggio/ }))
    await waitFor(() => expect(piani()).toHaveLength(1))
    expect(piani()[0]!.scene![0]!.pezzi[0]!.via).toEqual([[2, 2.4], [3, 3.5]])
  })

  it("dopo un ritocco non se ne fanno altri finché il montaggio nuovo non arriva", async () => {
    const { container } = await apri()
    scegliTratto(container, 1, 70)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.click(screen.getByRole("button", { name: /Dividi qui/ }))
    await waitFor(() => expect(piani()).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole("button", { name: /Dividi qui/ })).toBeDisabled())
    fireEvent.keyDown(window, { key: "s" })
    expect(piani()).toHaveLength(1)
  })

  it("con il montaggio vecchio e un risolvi in corso dice che si sta ricalcolando e non lascia ritoccare i tratti", async () => {
    const video = { ...dettaglioDiProva(), risolto_aggiornato: false, puo_annullare: true, lavoro: { id: "r1", comando: "risolvi", stato: "in corso" as const } }
    const { container } = await apri(video)
    expect(screen.getByRole("status")).toHaveTextContent(/si sta ricalcolando/)
    scegliTratto(container, 0, 10)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    expect(screen.getByRole("button", { name: /Togli/ })).toBeDisabled()
    expect(screen.getByRole("textbox", { name: /^Da/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /Annulla/ })).toBeEnabled()
  })

  it("un risolvi di questo video in coda, visto dallo stato della coda, vale come ricalcolo in corso", async () => {
    rete({ "GET /api/lavori": { in_corso: { id: "m", slug: "altro", comando: "monta" }, in_coda: [{ id: "r", slug: "prova", comando: "risolvi" }], finiti: [] } })
    await apri({ ...dettaglioDiProva(), risolto_aggiornato: false })
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/si sta ricalcolando/))
  })

  it("con il montaggio vecchio e nessun risolvi che lo rifà non dice che si ricalcola: dice che non segue il piano, e non lascia ritoccare", async () => {
    rete({ "GET /api/lavori": { in_corso: { id: "m", slug: "altro", comando: "risolvi" }, in_coda: [{ id: "x", slug: "prova", comando: "monta" }], finiti: [] } })
    const { container } = await apri({ ...dettaglioDiProva(), risolto_aggiornato: false })
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/non segue ancora il piano o lo stile di adesso/))
    expect(screen.getByRole("status")).not.toHaveTextContent(/si sta ricalcolando/)
    expect(screen.getByRole("status")).toHaveTextContent(/chiedilo nella chat/)
    scegliTratto(container, 0, 10)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    expect(screen.getByRole("button", { name: /Togli/ })).toBeDisabled()
  })

  it("un pezzo che viene dalla base dice da dove viene e offre di staccarlo", async () => {
    const video = { ...dettaglioDiProva(), piano: { base: "madre", scene: [] } as Piano }
    const { container } = await apri(video)
    expect(screen.getByText(/parte dal video «madre»/)).toBeInTheDocument()
    scegliTratto(container, 0, 10)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    expect(screen.getByText(/viene dal video «madre»/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Togli/ })).toBeDisabled()
    fireEvent.click(within(screen.getByText(/viene dal video «madre»/).parentElement!).getByRole("button", { name: "Stacca dalla base" }))
    await waitFor(() => expect(piani()).toHaveLength(1))
    expect(piani()[0]!.base).toBeUndefined()
    expect(piani()[0]!.scene).toEqual(pianoDiProva().scene)
  })

  it("se il server rifiuta il piano, la frase del server compare e si può riprovare", async () => {
    rete({ "PATCH /api/video/prova/piano": new Response(JSON.stringify({ errore: "La vista «x» non è dichiarata." }), { status: 400 }) })
    const { container } = await apri()
    scegliTratto(container, 1, 70)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.click(screen.getByRole("button", { name: /Dividi qui/ }))
    expect(await screen.findByRole("alert")).toHaveTextContent("La vista «x» non è dichiarata.")
    await waitFor(() => expect(screen.getByRole("button", { name: /Dividi qui/ })).toBeEnabled())
  })

  it("un gesto è un solo PATCH con i soli ritocchi di quel gesto, ognuno con la prova del valore di prima; il piano intero non si manda", async () => {
    const { container } = await apri()
    scegliTratto(container, 1, 70)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.click(screen.getByRole("button", { name: /Dividi qui/ }))
    await waitFor(() => expect(ritocchiMandati()).toHaveLength(1))
    const mandati = ritocchiMandati()[0]!.corpo as { op: string; path: string }[]
    expect(mandati.length).toBeGreaterThan(0)
    expect(mandati.every((r) => r.path.startsWith("/scene/0/"))).toBe(true)
    expect(mandati.some((r) => r.op === "test")).toBe(true)
    expect(chiamate.some((c) => c.metodo === "PUT" && c.percorso === "/api/video/prova/piano")).toBe(false)
  })

  it("se il piano è cambiato nel frattempo (409) lo dice, lo rilegge e i gesti tornano attivi: il piano di un altro non si sovrascrive", async () => {
    rete({ "PATCH /api/video/prova/piano": new Response(JSON.stringify({ errore: "ritocco 1: «/scene/0/pezzi/0/a» non è più com'era." }), { status: 409 }), "GET /api/video/prova": dettaglioDiProva() })
    const { container } = await apri()
    scegliTratto(container, 1, 70)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.click(screen.getByRole("button", { name: /Dividi qui/ }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Il piano è cambiato nel frattempo: l'ho riletto, rifai il gesto.")
    await waitFor(() => expect(chiamate.filter((c) => c.metodo === "GET" && c.percorso === "/api/video/prova")).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole("button", { name: /Dividi qui/ })).toBeEnabled())
  })

  it("una frase del montaggio che rifiuta il gesto si legge, senza scrivere", async () => {
    const { container } = await apri()
    scegliTratto(container, 2, 8 * 20)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.click(screen.getByRole("button", { name: /Sposta prima/ }))
    expect(screen.getByRole("button", { name: /Sposta prima/ })).toBeDisabled()
    expect(piani()).toHaveLength(0)
  })

  it("il pannello porta il pezzo in un'altra scena, in testa a quella che viene dopo; la scelta si toglie", async () => {
    const dettaglio = dettaglioDiProva()
    for (const p of [dettaglio.piano!, dettaglio.piano_risolto_da_base!]) p.scene![0]!.pezzi.push({ sorgente: "a", da: 20, a: 22 })
    const { container } = await apri(dettaglio)
    scegliTratto(container, 0, 20)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.change(screen.getByLabelText("Porta in un'altra scena"), { target: { value: "1" } })
    await waitFor(() => expect(piani()).toHaveLength(1))
    expect(piani()[0]!.scene!.map((sc) => sc.pezzi.map((p) => p.da ?? p.minuto))).toEqual([[20], [1, "0:10"]])
    expect(screen.queryByRole("heading", { name: "Pezzo scelto" })).toBeNull()
  })

  it("l'unico pezzo di una scena non si porta via: la frase si legge e niente si scrive", async () => {
    const { container } = await apri()
    scegliTratto(container, 0, 20)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.change(screen.getByLabelText("Porta in un'altra scena"), { target: { value: "1" } })
    expect(await screen.findByText(/unico pezzo della sua scena/)).toBeInTheDocument()
    expect(piani()).toHaveLength(0)
    expect(screen.getByRole("heading", { name: "Pezzo scelto" })).toBeInTheDocument()
  })

  it("le misure della testa non si chiedono di un video che non è montato", async () => {
    await apri()
    expect(chiamate.some((c) => c.percorso.includes("teste.json"))).toBe(false)
  })

  it("di un video montato si leggono dal file che il montaggio ha scritto", async () => {
    rete({ "GET /media/video/prova/lavoro/teste.json": { "2026-10-06/a.mp4": { cima: 300, centri: [540] } } })
    await apri({ ...dettaglioDiProva(), ...conUscite([{ file: "video/prova/uscite/finale.mp4", byte: 1, cambiato: "2026-10-07T10:00:00" }]) })
    await waitFor(() => expect(chiamate.some((c) => c.percorso.startsWith("/media/video/prova/lavoro/teste.json?v="))).toBe(true))
  })

  it("Annulla e Rifai chiamano il server", async () => {
    await apri({ ...dettaglioDiProva(), puo_annullare: true, puo_rifare: true })
    fireEvent.click(screen.getByRole("button", { name: /Annulla/ }))
    await waitFor(() => expect(chiamate.some((c) => c.percorso === "/api/video/prova/annulla")).toBe(true))
  })

  it("i tasti: S divide alla testina", async () => {
    const { container } = await apri()
    scegliTratto(container, 1, 70)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.keyDown(window, { key: "s" })
    await waitFor(() => expect(piani()).toHaveLength(1))
    expect(piani()[0]!.scene![0]!.pezzi).toHaveLength(2)
  })

  it("i tasti: Canc toglie il tratto scelto", async () => {
    const { container } = await apri()
    scegliTratto(container, 2, 8 * 20)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.keyDown(window, { key: "Delete" })
    await waitFor(() => expect(piani()).toHaveLength(1))
    expect(piani()[0]!.scene![1]!.pezzi[0]).toMatchObject({ dice: "tre quattro", minuto: "0:12" })
  })

  it("i tasti: Ctrl+Z annulla e Ctrl+Maiusc+Z rifà", async () => {
    await apri({ ...dettaglioDiProva(), puo_annullare: true, puo_rifare: true })
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(chiamate.some((c) => c.percorso === "/api/video/prova/rifai")).toBe(true))
  })

  it("le versioni del piano stanno sotto la barra, e senza versioni di prima non compaiono", async () => {
    await apri()
    expect(screen.queryByRole("button", { name: /Versioni/ })).toBeNull()
    cleanup()
    rete({ "GET /api/video/prova/versioni": { versioni: [{ n: null, da: null, fino: null, scene: 2, pezzi: 3, in_uso: true }, { n: 1, da: null, fino: "2026-11-10T14:00:00", scene: 1, pezzi: 1, in_uso: false }] } })
    await apri()
    expect(await screen.findByRole("button", { name: /Versioni · 2/ })).toBeInTheDocument()
  })

  it("i tasti non agiscono mentre si scrive in un campo", async () => {
    await apri()
    const coda = screen.getByLabelText("Titolo sul video")
    coda.focus()
    fireEvent.keyDown(coda, { key: "s" })
    expect(piani()).toHaveLength(0)
  })

  it("montare si chiede nella chat: la barra non ripete la frase (la dice la riga dei passi), senza bottoni che scrivono nella chat; «Montato» dice se non c'è ancora", async () => {
    await apri()
    expect(screen.queryByText("Per montare, rimontare o cambiare il video, chiedilo nella chat.")).toBeNull()
    expect(screen.queryByRole("button", { name: /chat|Claude|Monta (il|questo)/ })).toBeNull()
    expect(screen.queryByText(/Barra spaziatrice|testina/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Montato" }))
    expect(screen.getByText("Non c'è ancora un video montato: chiedilo nella chat.")).toBeInTheDocument()
    expect(screen.queryByText(/Barra spaziatrice|testina/)).toBeNull()
  })

  it("un pezzo da preparare: l'avviso sotto l'anteprima dice di chiederlo nella chat, senza bottoni", async () => {
    await apri()
    expect(await screen.findByText("La sagoma di questo pezzo va ancora preparata.")).toBeInTheDocument()
    expect(screen.getByText("Per prepararlo, chiedilo nella chat.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Prepara|chat|Claude/ })).toBeNull()
  })

  it("i tasti si leggono passando sulla linea del tempo", async () => {
    const { container } = await apri()
    const corpo = container.querySelector("[data-tratto]")!.closest("[title^='Spazio']")
    expect(corpo).toHaveAttribute("title", "Spazio: avvia o ferma · Frecce: un fotogramma avanti o indietro, con Maiusc mezzo secondo · S: dividi qui il pezzo · Canc: togli il pezzo o le parole scelte")
  })

  it("se il piano è cambiato dopo l'ultimo montaggio, «Montato» lo dice con la data, anche appena aperta la pagina", async () => {
    const uscite = conUscite([{ file: "video/prova/uscite/finale.mp4", byte: 10, cambiato: "2026-10-09T10:00:00Z" }])
    await apri({ ...dettaglioDiProva(), ...uscite, piano_cambiato: "2026-10-09T11:15:00Z", piano_dopo_montato: true })
    fireEvent.click(screen.getByRole("button", { name: "Montato" }))
    expect(await screen.findByText(`Il piano o lo stile sono cambiati dopo l'ultimo montaggio (${dataOra("2026-10-09T11:15:00Z")}): questo video non li segue ancora. Chiedi nella chat di rimontarlo.`)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /chat|Claude|Rimonta/ })).toBeNull()
  })

  it("se il piano non è cambiato dopo il montaggio, nessun avviso", async () => {
    const uscite = conUscite([{ file: "video/prova/uscite/finale.mp4", byte: 10, cambiato: "2026-10-09T10:00:00Z" }])
    await apri({ ...dettaglioDiProva(), ...uscite, piano_cambiato: "2026-10-09T09:00:00Z", piano_dopo_montato: false })
    fireEvent.click(screen.getByRole("button", { name: "Montato" }))
    expect(screen.queryByText(/Il piano o lo stile sono cambiati dopo l'ultimo montaggio/)).toBeNull()
  })

  it("con il montaggio nuovo in corso lo dice", async () => {
    const uscite = conUscite([{ file: "video/prova/uscite/finale.mp4", byte: 10, cambiato: "2026-10-09T10:00:00Z" }])
    await apri({ ...dettaglioDiProva(), ...uscite, piano_cambiato: "2026-10-09T11:15:00Z", piano_dopo_montato: true, lavoro: { id: 1, comando: "monta", stato: "in corso" } })
    fireEvent.click(screen.getByRole("button", { name: "Montato" }))
    expect(await screen.findByText(`Il piano o lo stile sono cambiati dopo l'ultimo montaggio (${dataOra("2026-10-09T11:15:00Z")}): il montaggio nuovo è in corso.`)).toBeInTheDocument()
  })

  it("con un video montato si apre sul video vero, quello con la copertina", async () => {
    const video = {
      ...dettaglioDiProva(),
      ...conUscite([
        { file: "video/prova/uscite/finale.mp4", byte: 10, cambiato: "2026-10-09T10:00:00Z" },
        { file: "video/prova/uscite/con-copertina.mp4", byte: 11, cambiato: "2026-10-09T10:01:00Z" },
      ]),
    }
    const { container } = await apri(video)
    expect(screen.getByRole("button", { name: "Montato" })).toHaveAttribute("aria-pressed", "true")
    expect(container.querySelector("video")).toHaveAttribute("src", "/media/video/prova/uscite/con-copertina.mp4?v=2026-10-09T10%3A01%3A00Z")
  })

  it("una copertina più vecchia del montato non si mostra: si vede il montato", async () => {
    const video = {
      ...dettaglioDiProva(),
      ...conUscite([
        { file: "video/prova/uscite/con-copertina.mp4", byte: 11, cambiato: "2026-10-09T09:00:00Z" },
        { file: "video/prova/uscite/finale.mp4", byte: 10, cambiato: "2026-10-09T10:00:00Z" },
      ]),
    }
    const { container } = await apri(video)
    expect(container.querySelector("video")).toHaveAttribute("src", "/media/video/prova/uscite/finale.mp4?v=2026-10-09T10%3A00%3A00Z")
  })

  it("un file rifatto cambia l'indirizzo del video, così il browser non tiene quello vecchio", async () => {
    const conFinale = (cambiato: string) => ({ ...dettaglioDiProva(), ...conUscite([{ file: "video/prova/uscite/finale.mp4", byte: 10, cambiato }]) })
    const { container, rerender } = await apri(conFinale("2026-10-09T10:00:00Z"))
    rerender(<Montaggio video={conFinale("2026-10-09T11:00:00Z")} tempoIniziale={null} />)
    expect(container.querySelector("video")).toHaveAttribute("src", "/media/video/prova/uscite/finale.mp4?v=2026-10-09T11%3A00%3A00Z")
  })

  it("senza montaggio calcolato dice di chiederlo nella chat, senza bottoni", async () => {
    render(<Montaggio video={{ ...dettaglioDiProva(), risolto: null }} tempoIniziale={null} />)
    expect(await screen.findByText(/Se non arriva, chiedi nella chat di calcolarlo\./)).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("il tempo nell'indirizzo porta la testina lì", async () => {
    await apri(dettaglioDiProva(), "4.5")
    expect(screen.getByTestId("orologio")).toHaveTextContent("0:04,5 / 0:10,5")
  })

  it("le frecce spostano la testina, ma non su una maniglia che le usa per allargare le colonne", async () => {
    await apri(dettaglioDiProva(), "4.5")
    fireEvent.keyDown(screen.getAllByRole("separator").find((m) => m.tabIndex === 0)!, { key: "ArrowRight", shiftKey: true })
    expect(screen.getByTestId("orologio")).toHaveTextContent("0:04,5 / 0:10,5")
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true })
    expect(screen.getByTestId("orologio")).toHaveTextContent("0:05,0 / 0:10,5")
  })

  it("se dopo un salvataggio riuscito il piano non arriva, dopo qualche secondo si rilegge e i gesti tornano attivi", async () => {
    rete({ "GET /api/video/prova": dettaglioDiProva() })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await apri()
      const quadro = screen.getByLabelText("Quadro del video")
      fireEvent.change(quadro, { target: { value: "girato-pieno" } })
      await waitFor(() => expect(quadro).toBeDisabled())
      await waitFor(() => expect(piani()).toHaveLength(1))
      expect(chiamate.filter((c) => c.percorso === "/api/video/prova")).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(6000)
      await waitFor(() => expect(quadro).toBeEnabled())
      expect(chiamate.filter((c) => c.percorso === "/api/video/prova")).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("se le parole di un file non si scaricano lo dice, e «Riprova» le richiede", async () => {
    let riuscito = false
    const conParole = giorni.map((g) => ({ ...g, file: g.file.map((f) => ({ ...f, preparato: { ...f.preparato, parole: "preparati/x/parole.json" } })) }))
    rete({
      "GET /api/grezzo": conParole,
      "GET /api/grezzo/parole?file=2026-10-06%2Fa.mp4": () => (riuscito ? [{ p: "ciao", da: 0, a: 1 }] : new Response("guasto", { status: 502 })),
      "GET /api/grezzo/parole?file=2026-10-08%2Fb.mp4": [],
    })
    await apri()
    const frase = await screen.findByText("Le parole di questo video non si sono caricate: i bordi non si agganciano alle parole.")
    expect(frase).toBeInTheDocument()
    riuscito = true
    fireEvent.click(within(frase.closest("[role=alert]") as HTMLElement).getByRole("button", { name: "Riprova" }))
    await waitFor(() => expect(screen.queryByText(/non si sono caricate/)).toBeNull())
  })

  it("il quadro, il modo dei sottotitoli e il titolo si cambiano dal pannello del video", async () => {
    await apri()
    fireEvent.change(screen.getByLabelText("Quadro del video"), { target: { value: "girato-pieno" } })
    await waitFor(() => expect(piani()).toHaveLength(1))
    expect(piani()[0]!.quadro).toBe("girato-pieno")
  })
})

describe("un video senza piano", () => {
  const senzaPiano = (file: string[]): DettaglioVideo => ({
    ...dettaglioDiProva(),
    piano: null,
    piano_risolto_da_base: null,
    risolto: null,
    ...conUscite(file.map((f) => ({ file: `video/prova/uscite/${f}`, byte: 1, cambiato: "2026-10-15T18:00:00Z" }))),
  })

  it("mostra il file finito, quello con la copertina prima del montato", async () => {
    const { container } = render(<Montaggio video={senzaPiano(["finale.mp4", "con-copertina.mp4", "copertina.png"])} tempoIniziale={null} />)
    await waitFor(() => expect(container.querySelector("video")).toHaveAttribute("src", "/media/video/prova/uscite/con-copertina.mp4?v=2026-10-15T18%3A00%3A00Z"))
    expect(screen.queryByText(/video di base/)).not.toBeInTheDocument()
  })

  it("il file uscito vale più di quello con la copertina", async () => {
    const { container } = render(<Montaggio video={senzaPiano(["con-copertina.mp4", "pubblicato.mp4"])} tempoIniziale={null} />)
    await waitFor(() => expect(container.querySelector("video")).toHaveAttribute("src", "/media/video/prova/uscite/pubblicato.mp4?v=2026-10-15T18%3A00%3A00Z"))
  })

  it("senza file dice che il montaggio non c'è ancora", async () => {
    render(<Montaggio video={senzaPiano([])} tempoIniziale={null} />)
    expect(await screen.findByText("Questo video non ha ancora un montaggio. Prima viene il copione, nella scheda «Scheda».")).toBeInTheDocument()
    expect(screen.queryByText(/video di base/)).not.toBeInTheDocument()
  })

  it("con la riga dei passi, il vuoto del montaggio rimanda a quella e non dice che viene prima il copione", async () => {
    render(<Montaggio video={{ ...senzaPiano([]), fase: { passo: 3, azione: "prova" } }} tempoIniziale={null} />)
    expect(await screen.findByText("Questo video non ha ancora un montaggio: la riga dei passi qui sopra dice cosa viene prima.")).toBeInTheDocument()
  })

  it("uscito ma senza file dice che il file non è nell'archivio", async () => {
    const video = senzaPiano([])
    render(<Montaggio video={{ ...video, scheda: { ...video.scheda, stato: "pubblicato" } }} tempoIniziale={null} />)
    expect(await screen.findByText("Il file di questo video non è nell'archivio.")).toBeInTheDocument()
  })
})

describe("un video con pezzi senza voce", () => {
  it("si apre: anteprima, timeline coi suoi tratti e il parlato del solo pezzo che parla", async () => {
    const { container } = await apri(dettaglioSenzaVoce())
    expect(screen.getByTestId("palco")).toBeInTheDocument()
    expect(container.querySelectorAll("[data-tratto]")).toHaveLength(4)
    expect(nelParlato("ciao")).toBeInTheDocument()
  })

  it("il pannello del tratto non offre ciò che senza girato non ha senso", async () => {
    const { container } = await apri(dettaglioSenzaVoce())
    scegliTratto(container, 1, 100)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    expect(screen.getByRole("textbox", { name: /^Da/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Dividi qui/ })).toBeInTheDocument()
    scegliTratto(container, 0, 10)
    expect(screen.getByText(/Senza voce/, { selector: "p" })).toBeInTheDocument()
    expect(screen.getByText(/Dura 4,00 s/)).toBeInTheDocument()
    for (const assente of [screen.queryByRole("textbox", { name: /^Da/ }), screen.queryByRole("textbox", { name: /^A/ }), screen.queryByRole("button", { name: /Dividi qui/ }), screen.queryByRole("combobox", { name: /Ingrandimento/ })]) expect(assente).toBeNull()
    expect(screen.getByRole("button", { name: /Sposta dopo/ })).toBeDisabled()
  })

  it("Togli toglie il pezzo e, se era l'unico della scena, la scena", async () => {
    const { container } = await apri(dettaglioSenzaVoce())
    scegliTratto(container, 0, 10)
    await screen.findByRole("heading", { name: "Pezzo scelto" })
    fireEvent.click(screen.getByRole("button", { name: /Togli/ }))
    await waitFor(() => expect(piani()).toHaveLength(1))
    expect(piani()[0]!.scene!.map((x) => x.nome)).toEqual(["parlato", "chiusa"])
  })

  it("S sotto un pezzo senza voce non scrive niente e dice perché", async () => {
    await apri(dettaglioSenzaVoce())
    fireEvent.keyDown(window, { key: "s" })
    expect(await screen.findByRole("alert")).toHaveTextContent(/senza voce/)
    expect(piani()).toHaveLength(0)
  })

  it("un video di sole animazioni dice che non c'è voce, non di preparare il girato", async () => {
    const video = dettaglioSenzaVoce()
    const solo = { ...video.piano_risolto_da_base, quadro: "solo-animazione", sorgenti: {}, scene: [{ nome: "apertura", animazione: "c1", pezzi: [{ durata: 4 }] }] }
    const risolto = { ...video.risolto!, durata: 4, scene: [video.risolto!.scene[0]!], tratti: [video.risolto!.tratti[0]!], parole: [], battute: [], suoni: [] }
    await apri({ ...video, piano: solo, piano_risolto_da_base: solo, risolto })
    expect(screen.getByText(/non ha voce/)).toBeInTheDocument()
    expect(screen.queryByText(/preparalo/)).toBeNull()
  })
})
