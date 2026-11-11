// La pagina Stile: i tre stili di partenza come cartoline da scegliere vedendole, e «Aggiungi un carattere».
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { errore, installaEventi, installaRete, type Chiamata } from "./rete"
import { caratteriDiProva, partenzeDiProva, stileDiProva } from "./fixture"

let chiamate: Chiamata[]

// Le copie dei dati vivono nel modulo: ogni prova parte da un modulo nuovo.
async function pagina(extra: Record<string, unknown> = {}, lingua: "it" | "en" = "it") {
  chiamate = installaRete({ "GET /api/stile": stileDiProva(), "GET /api/stile/partenza": partenzeDiProva(), "GET /api/caratteri": caratteriDiProva(), "PUT /api/stile": {}, ...extra }).chiamate
  vi.resetModules()
  ;(await import("../src/lingua")).scegliLingua(lingua)
  const { PaginaStile } = await import("../src/stile/PaginaStile")
  render(<PaginaStile />)
  await screen.findByRole("heading", { name: lingua === "it" ? "Parti da uno stile" : "Start from a style" })
}

const inviato = () => chiamate.filter((c) => c.metodo === "PUT" && c.percorso === "/api/stile").map((c) => c.corpo as ReturnType<typeof stileDiProva>)

beforeEach(() => {
  installaEventi()
})
afterEach(() => vi.unstubAllGlobals())

describe("le cartoline degli stili di partenza", () => {
  it("sono in cima alla pagina, una per stile, col nome, la frase e un'anteprima", async () => {
    await pagina()
    const cartoline = screen.getAllByRole("listitem").filter((v) => within(v).queryByRole("img", { name: "Titolo e sottotitolo di esempio" }))
    expect(cartoline.map((c) => within(c).getByRole("heading").textContent)).toEqual(["Scuro", "Caldo"])
    expect(within(cartoline[1]!).getByText("Carta color crema, lettere più tonde.")).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent("Parti da uno stile")
  })

  it("«Usa questo» cambia colori, sottotitoli, titolo e caratteri e lascia il resto; si salva con «Salva» e si annulla con «Annulla le modifiche»", async () => {
    await pagina()
    const salva = screen.getByRole("button", { name: "Salva" })
    expect(salva).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Usa lo stile Caldo" }))
    expect(salva).toBeEnabled()
    expect(screen.getByRole("button", { name: "Usa lo stile Caldo" })).toHaveTextContent("In uso")
    fireEvent.click(screen.getByRole("button", { name: "Annulla le modifiche" }))
    expect(salva).toBeDisabled()
    expect(screen.getByRole("button", { name: "Usa lo stile Caldo" })).toHaveTextContent("Usa questo")

    fireEvent.click(screen.getByRole("button", { name: "Usa lo stile Caldo" }))
    fireEvent.click(salva)
    await waitFor(() => expect(inviato()).toHaveLength(1))
    const [stile] = inviato()
    const caldo = partenzeDiProva()[1]!.stile
    expect([stile!.colori, stile!.caratteri, stile!.sottotitoli, stile!.titolo]).toEqual([caldo.colori, caldo.caratteri, caldo.sottotitoli, caldo.titolo])
    expect(stile!.quadri).toEqual(stileDiProva().quadri)
    expect(stile!.voce).toEqual(stileDiProva().voce)
  })

  it("con modifiche all'aspetto non salvate chiede conferma prima di sostituirle", async () => {
    await pagina()
    const corpo = screen.getAllByRole("textbox", { name: /^Corpo$/ })[0]!
    fireEvent.change(corpo, { target: { value: "62" } })
    fireEvent.blur(corpo)
    fireEvent.click(screen.getByRole("button", { name: "Usa lo stile Scuro" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Hai cambiato colori, sottotitoli o titolo e non hai salvato: usando lo stile «Scuro» li perdi.")
    expect(screen.getByRole("button", { name: "Usa lo stile Scuro" })).toHaveTextContent("Usa questo")
    fireEvent.click(screen.getByRole("button", { name: "Lascia stare" }))
    expect(screen.queryByRole("button", { name: "Lascia stare" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Usa lo stile Scuro" }))
    fireEvent.click(screen.getByRole("button", { name: "Usa «Scuro»" }))
    expect(screen.getByRole("button", { name: "Usa lo stile Scuro" })).toHaveTextContent("In uso")
    expect(screen.queryByRole("button", { name: "Lascia stare" })).toBeNull()
  })

  it("passando da una cartolina all'altra non chiede conferma: non c'è niente di suo da perdere", async () => {
    await pagina()
    fireEvent.click(screen.getByRole("button", { name: "Usa lo stile Caldo" }))
    fireEvent.click(screen.getByRole("button", { name: "Usa lo stile Scuro" }))
    expect(screen.queryByRole("button", { name: "Lascia stare" })).toBeNull()
    expect(screen.getByRole("button", { name: "Usa lo stile Scuro" })).toHaveTextContent("In uso")
    expect(screen.getByRole("button", { name: "Usa lo stile Caldo" })).toHaveTextContent("Usa questo")
  })

  it("una modifica che non riguarda l'aspetto non chiede conferma", async () => {
    await pagina()
    const pausa = screen.getAllByRole("textbox", { name: /Pausa che resta/ })[0]!
    fireEvent.change(pausa, { target: { value: "0,4" } })
    fireEvent.blur(pausa)
    fireEvent.click(screen.getByRole("button", { name: "Usa lo stile Scuro" }))
    expect(screen.queryByRole("button", { name: "Lascia stare" })).toBeNull()
    expect(screen.getByRole("button", { name: "Usa lo stile Scuro" })).toHaveTextContent("In uso")
  })

  it("in inglese i nomi, le frasi e i bottoni sono inglesi", async () => {
    await pagina({}, "en")
    expect(screen.getByRole("button", { name: "Use the Warm style" })).toHaveTextContent("Use this one")
    expect(screen.getByText("Warm cream paper, rounder lettering.")).toBeInTheDocument()
  })

  it("se gli stili di partenza non si leggono lo dice, e si può riprovare", async () => {
    chiamate = installaRete({ "GET /api/stile": stileDiProva(), "GET /api/stile/partenza": () => errore(404, "Non trovo gli stili di partenza nella cartella del prodotto: va reinstallato."), "GET /api/caratteri": caratteriDiProva() }).chiamate
    vi.resetModules()
    const { PaginaStile } = await import("../src/stile/PaginaStile")
    render(<PaginaStile />)
    expect(await screen.findByText(/va reinstallato/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "I colori" })).toBeInTheDocument()
  })
})

describe("il carattere", () => {
  const FILE = (nome: string, byte = 1000) => new File([new Uint8Array(byte)], nome)
  const scegli = (file: File) => fireEvent.change(screen.getByLabelText("File del carattere"), { target: { files: [file] } })

  it("le due scelte mostrano i caratteri col nome letto dal file e scrivono nello stile", async () => {
    await pagina()
    const sottotitoli = screen.getByLabelText("Dei sottotitoli e delle animazioni")
    const titolo = screen.getByLabelText("Del titolo")
    expect(within(sottotitoli).getAllByRole("option").map((o) => o.textContent)).toEqual(["Archivo SemiBold", "Metropolis Medium"])
    expect(sottotitoli).toHaveValue("font/Archivo-700.ttf")
    fireEvent.change(sottotitoli, { target: { value: "font/Metropolis-Medium.ttf" } })
    fireEvent.change(titolo, { target: { value: "font/Archivo-700.ttf" } })
    fireEvent.click(screen.getByRole("button", { name: "Salva" }))
    await waitFor(() => expect(inviato()).toHaveLength(1))
    const [stile] = inviato()
    expect(stile!.caratteri).toEqual({ titoli: "font/Metropolis-Medium.ttf", titolo: "font/Archivo-700.ttf" })
    expect([stile!.sottotitoli.carattere, stile!.titolo.carattere]).toEqual(["titoli", "titolo"])
  })

  it("«Aggiungi un carattere» manda il file, dice il nome letto e lo mette fra le scelte", async () => {
    const dopo = [...caratteriDiProva(), { file: "font/Montserrat.ttf", nome: "Montserrat Bold", mio: true }]
    let elenco = caratteriDiProva()
    await pagina({ "GET /api/caratteri": () => elenco, "POST /api/caratteri": () => ((elenco = dopo), { file: "font/Montserrat.ttf", nome: "Montserrat Bold" }) })
    scegli(FILE("Montserrat.ttf", 4))
    expect(await screen.findByRole("status")).toHaveTextContent("«Montserrat Bold» è tra i caratteri: sceglilo qui sopra.")
    const invio = chiamate.find((c) => c.metodo === "POST")!
    expect(invio.corpo).toEqual({ nome: "Montserrat.ttf", dati: "AAAAAA==" })
    await waitFor(() => expect(within(screen.getByLabelText("Del titolo")).getAllByRole("option")).toHaveLength(3))
    fireEvent.change(screen.getByLabelText("Del titolo"), { target: { value: "font/Montserrat.ttf" } })
    expect(screen.getByRole("button", { name: "Salva" })).toBeEnabled()
  })

  it("un file che il server rifiuta dice perché, con la sua frase", async () => {
    await pagina({ "POST /api/caratteri": () => errore(400, "Questo file non è un carattere che posso usare: scegli un file .ttf, .otf o .woff2.") })
    scegli(FILE("falso.ttf"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Questo file non è un carattere che posso usare")
    expect(within(screen.getByLabelText("Del titolo")).getAllByRole("option")).toHaveLength(2)
  })

  it("un file troppo grande non parte nemmeno", async () => {
    await pagina()
    scegli(FILE("enorme.ttf", 5 * 1024 ** 2 + 1))
    expect(await screen.findByRole("alert")).toHaveTextContent("Il file è troppo grande (oltre 5 MB)")
    expect(chiamate.some((c) => c.metodo === "POST")).toBe(false)
  })

  it("un carattere che lo stile nomina e l'elenco non ha si vede com'è scritto", async () => {
    const stile = stileDiProva()
    stile.caratteri["titolo"] = "font/perso.ttf"
    stile.titolo.carattere = "titolo"
    await pagina({ "GET /api/stile": stile })
    expect(screen.getByLabelText("Del titolo")).toHaveValue("font/perso.ttf")
  })
})
