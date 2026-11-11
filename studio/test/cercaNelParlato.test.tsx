import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Girato } from "../src/girato/Girato"
import { scegliLingua } from "../src/lingua"
import type { FileGrezzo, RicercaParlato } from "../src/tipi"
import { errore, installaEventi, installaRete, type Chiamata } from "./rete"

const file = (nome: string, extra: Partial<FileGrezzo> = {}): FileGrezzo => ({
  file: `2026-10-06/${nome}`,
  nome,
  byte: 3_000_000,
  scheda: { tipo: "ripresa", origine: "telefono", durata: 120 },
  scheda_problemi: [],
  preparato: { parole: "preparati/2026-10-06/a.mp4/parole.json", sagoma: null, sagoma_pezzi: null, leggero: "preparati/2026-10-06/a.mp4/leggero.mp4", onda: null, miniatura: null, foto: null, trascrizione: null },
  usato_in: [],
  ...extra,
})

const GIORNI = [{ giorno: "2026-10-06", file: [file("a.mp4"), file("b.mp4")] }]

const RICERCA: RicercaParlato = {
  q: "pazienza",
  totale: 3,
  cercati: 2,
  non_letti: 0,
  risultati: [
    { file: "2026-10-06/a.mp4", da: 12.5, a: 12.9, prima: "il segreto è la", trovato: "pazienza", dopo: "lievita in frigorifero" },
    { file: "2026-10-06/a.mp4", da: 75, a: 75.4, prima: "", trovato: "pazienza", dopo: "" },
    { file: "2026-10-06/b.mp4", da: 3, a: 3.4, prima: "ci vuole", trovato: "pazienza", dopo: "" },
  ],
}

let chiamate: Chiamata[]
function rete(extra: Record<string, unknown> = {}) {
  chiamate = installaRete({
    "GET /api/registrazione": { disponibile: true, motivo: null, dispositivi: { microfoni: [], camere: [] }, in_corso: null, ultima: null },
    "GET /api/arrivi": { in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], pronto: false, motivo: null },
    "GET /api/accesso-studio": { acceso: false, in_ascolto: true, casa: null, fuori: null, pronto: true, motivo: null },
    "GET /api/grezzo": GIORNI,
    "GET /api/video": [],
    "GET /api/grezzo/parole?file=2026-10-06%2Fa.mp4": [],
    "GET /api/grezzo/cerca?q=pazienza": RICERCA,
    ...extra,
  }).chiamate
}
const ricerche = () => chiamate.filter((c) => c.percorso.startsWith("/api/grezzo/cerca")).map((c) => c.percorso)
const cerca = (testo: string) => fireEvent.change(screen.getByRole("searchbox", { name: /Cerca nel parlato|Search the speech/ }), { target: { value: testo } })

beforeEach(() => {
  installaEventi()
  window.location.hash = ""
})
afterEach(() => vi.unstubAllGlobals())

describe("cercare nel parlato, nel Girato", () => {
  it("con meno di due lettere non si cerca; con due o più, dopo una breve attesa, e l'elenco dei giorni lascia il posto ai risultati", async () => {
    rete()
    render(<Girato file={undefined} />)
    await screen.findByRole("heading", { name: "Girato" })
    expect(screen.getByRole("heading", { level: 2, name: /6 ott 2026/ })).toBeInTheDocument()
    cerca("p")
    await act(() => new Promise((ok) => setTimeout(ok, 450)))
    expect(ricerche()).toEqual([])
    cerca("pazienza")
    expect(await screen.findByText("3 risultati in 2 file")).toBeInTheDocument()
    expect(ricerche()).toEqual(["/api/grezzo/cerca?q=pazienza"])
    expect(screen.queryByRole("heading", { level: 2, name: /6 ott 2026/ })).toBeNull()
    expect(screen.queryByLabelText("Solo quelli mai usati")).toBeNull()
    cerca("")
    expect(await screen.findByRole("heading", { level: 2, name: /6 ott 2026/ })).toBeInTheDocument()
    expect(screen.getByLabelText("Solo quelli mai usati")).toBeInTheDocument()
  })

  it("ogni risultato dice il file, il secondo e la frase intorno con le parole trovate in evidenza", async () => {
    rete()
    render(<Girato file={undefined} />)
    await screen.findByRole("heading", { name: "Girato" })
    cerca("pazienza")
    const primo = await screen.findByRole("button", { name: /0:12/ })
    expect(primo).toHaveTextContent("…il segreto è la pazienza lievita in frigorifero…")
    expect(within(primo).getByText("pazienza").tagName).toBe("MARK")
    expect(screen.getByRole("heading", { name: /a\.mp4/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /b\.mp4/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /1:15/ })).toBeInTheDocument()
  })

  it("un clic apre il file a quel punto: l'indirizzo porta il file e il secondo, e il lettore ci va", async () => {
    rete()
    render(<Girato file={undefined} />)
    await screen.findByRole("heading", { name: "Girato" })
    cerca("pazienza")
    fireEvent.click(await screen.findByRole("button", { name: /0:12/ }))
    expect(window.location.hash).toBe("#/girato?file=2026-10-06%2Fa.mp4&t=12.5")
  })

  it("aperto con un secondo nell'indirizzo, il lettore va lì appena conosce il video", async () => {
    window.location.hash = "#/girato?file=2026-10-06%2Fa.mp4&t=12.5"
    rete()
    render(<Girato file="2026-10-06/a.mp4" />)
    const lettore = await waitFor(() => {
      const v = document.querySelector("video")
      if (!v) throw new Error("manca il lettore")
      return v
    })
    fireEvent(lettore, new Event("loadedmetadata"))
    expect(lettore.currentTime).toBe(12.5)
  })

  it("un file aperto dalla lista, senza un secondo nell'indirizzo, non sposta il lettore né la pagina", async () => {
    const scorri = vi.fn()
    Element.prototype.scrollIntoView = scorri
    window.location.hash = "#/girato?file=2026-10-06%2Fa.mp4"
    rete()
    render(<Girato file="2026-10-06/a.mp4" />)
    const lettore = await waitFor(() => {
      const v = document.querySelector("video")
      if (!v) throw new Error("manca il lettore")
      return v
    })
    lettore.currentTime = 7
    fireEvent(lettore, new Event("loadedmetadata"))
    expect(lettore.currentTime).toBe(7)
    expect(scorri).not.toHaveBeenCalled()
  })

  it("senza risultati dice cosa provare; senza parlato trascritto lo dice; un errore del server compare com'è", async () => {
    rete({ "GET /api/grezzo/cerca?q=tiramisu": { q: "tiramisu", risultati: [], totale: 0, cercati: 2, non_letti: 0 }, "GET /api/grezzo/cerca?q=pasta": { q: "pasta", risultati: [], totale: 0, cercati: 0, non_letti: 0 }, "GET /api/grezzo/cerca?q=%3F%3F": errore(400, "Scrivi almeno due lettere da cercare nel parlato.") })
    render(<Girato file={undefined} />)
    await screen.findByRole("heading", { name: "Girato" })
    cerca("tiramisu")
    expect(await screen.findByText("Nessun file dice «tiramisu». Prova con meno parole, o con l'inizio di una parola.")).toBeInTheDocument()
    cerca("pasta")
    expect(await screen.findByText(/Nessun file ha ancora il parlato trascritto/)).toBeInTheDocument()
    cerca("??")
    expect(await screen.findByRole("alert")).toHaveTextContent("Scrivi almeno due lettere da cercare nel parlato.")
  })

  it("dice quando i risultati sono più di quelli mostrati e quando di qualche file il parlato non si legge", async () => {
    rete({ "GET /api/grezzo/cerca?q=pazienza": { ...RICERCA, totale: 240, non_letti: 2 } })
    render(<Girato file={undefined} />)
    await screen.findByRole("heading", { name: "Girato" })
    cerca("pazienza")
    expect(await screen.findByText(/240 risultati in 2 file · ecco i primi 3: aggiungi qualche parola per restringere\./)).toBeInTheDocument()
    expect(screen.getByText("Di 2 file il parlato non si legge: chiedi nella chat di trascriverlo di nuovo.")).toBeInTheDocument()
  })

  it("senza file nel girato il campo non c'è", async () => {
    rete({ "GET /api/grezzo": [] })
    render(<Girato file={undefined} />)
    await screen.findByRole("heading", { name: "Girato" })
    expect(screen.queryByRole("searchbox")).toBeNull()
  })

  it("in inglese", async () => {
    scegliLingua("en")
    rete()
    render(<Girato file={undefined} />)
    await screen.findByRole("heading", { name: "Footage" })
    cerca("pazienza")
    expect(await screen.findByText("3 results in 2 files")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /0:12/ })).toHaveAttribute("title", "Opens the file at this point")
  })
})
