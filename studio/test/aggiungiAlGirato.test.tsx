// Aggiungere al girato i video che si hanno sul computer: il pulsante «Aggiungi video», i file lasciati sulla pagina (nel browser col contenuto, nell'app col percorso)
// e, per ognuno, l'avanzamento o il perché non è entrato.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Girato } from "../src/girato/Girato"
import { scegliLingua } from "../src/lingua"
import { errore, installaEventi, installaRete, type Chiamata } from "./rete"

/** Un `XMLHttpRequest` che la prova comanda: il browser vero manda il file e ne dà l'avanzamento. */
class FintoXhr {
  static tutte: FintoXhr[] = []
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  onabort: (() => void) | null = null
  status = 0
  responseText = ""
  intestazioni: Record<string, string> = {}
  metodo = ""
  indirizzo = ""
  corpo: unknown = null
  constructor() {
    FintoXhr.tutte.push(this)
  }
  open(metodo: string, indirizzo: string) {
    this.metodo = metodo
    this.indirizzo = indirizzo
  }
  setRequestHeader(nome: string, valore: string) {
    this.intestazioni[nome] = valore
  }
  send(corpo: unknown) {
    this.corpo = corpo
  }
  avanza(loaded: number, total: number) {
    act(() => this.upload.onprogress?.({ lengthComputable: true, loaded, total }))
  }
  rispondi(status: number, corpo: unknown) {
    this.status = status
    this.responseText = JSON.stringify(corpo)
    act(() => this.onload?.())
  }
}

let chiamate: Chiamata[]
const SPENTO = { acceso: false, in_ascolto: false, casa: null, fuori: null, pronto: false, motivo: null }
const VIDEO = { giorno: "2026-10-06", file: [{ file: "2026-10-06/a.mp4", nome: "a.mp4", byte: 1000, scheda: { tipo: "ripresa", origine: "telefono", durata: 12, note: "" }, scheda_problemi: [], preparato: {}, usato_in: [] }] }

function avvia(girato: unknown[] = [VIDEO]) {
  chiamate = installaRete({ "GET /api/grezzo": girato, "GET /api/video": [], "GET /api/arrivi": { acceso: false, ultimi: [] }, "GET /api/accesso-studio": SPENTO }).chiamate
  return render(<Girato file={undefined} />)
}

const scegli = (file: File[]) => {
  const campo = screen.getByLabelText("Scegli i video da aggiungere") as HTMLInputElement
  fireEvent.change(campo, { target: { files: file } })
}
const clip = (nome: string, byte = 4000) => new File([new Uint8Array(byte)], nome, { type: "video/mp4" })
const riletture = () => chiamate.filter((c) => c.metodo === "GET" && c.percorso === "/api/grezzo").length

beforeEach(() => {
  installaEventi()
  FintoXhr.tutte = []
  vi.stubGlobal("XMLHttpRequest", FintoXhr)
})
afterEach(() => {
  delete window.__MANGO_ANIMATION__
  vi.unstubAllGlobals()
})

describe("il Girato vuoto", () => {
  it("propone prima «Aggiungi video», senza più mandare a mettere i file nella cartella", async () => {
    avvia([])
    expect(await screen.findByText(/Nel girato non c'è ancora niente\. Aggiungi un video dal computer/)).toBeInTheDocument()
    expect(screen.queryByText(/nella cartella del girato/)).toBeNull()
    const pulsanti = screen.getAllByRole("button").map((b) => b.textContent)
    expect(pulsanti.indexOf("Aggiungi video")).toBeGreaterThanOrEqual(0)
    expect(pulsanti.indexOf("Aggiungi video")).toBeLessThan(pulsanti.findIndex((p) => p?.includes("Apri la cartella del girato")))
  })

  it("in inglese parla inglese", async () => {
    scegliLingua("en")
    avvia([])
    expect(await screen.findByText(/There is nothing in the footage yet\. Add a video from your computer/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add video" })).toBeInTheDocument()
    expect(screen.getByLabelText("Choose the videos to add")).toBeInTheDocument()
  })
})

describe("«Aggiungi video»", () => {
  it("c'è anche col girato pieno; il file parte col suo nome, si vede avanzare e alla fine il girato si rilegge", async () => {
    avvia()
    await screen.findByRole("button", { name: /a\.mp4/ })
    expect(screen.getByRole("button", { name: "Aggiungi video" })).toBeInTheDocument()
    const prima = riletture()
    scegli([clip("Giro lungo.MOV", 4000)])

    await waitFor(() => expect(FintoXhr.tutte).toHaveLength(1))
    const xhr = FintoXhr.tutte[0]!
    expect(xhr.metodo).toBe("POST")
    expect(xhr.indirizzo).toBe("/api/grezzo/aggiungi")
    expect(xhr.intestazioni["X-Nome-File"]).toBe(encodeURIComponent("Giro lungo.MOV"))
    expect(xhr.intestazioni["X-Lingua"]).toBe("it")
    expect(xhr.corpo).toBeInstanceOf(File)

    xhr.avanza(1000, 4000)
    expect(await screen.findByText("25% · 1000 B di 4 KB")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Avanzamento di Giro lungo.MOV" })).toHaveValue(25)
    xhr.avanza(4000, 4000)
    expect(await screen.findByText("Inviato: il computer lo sta salvando…")).toBeInTheDocument()
    xhr.rispondi(201, { file: "2026-10-06/x", byte: 4000 })
    expect(await screen.findByText("Aggiunto al girato")).toBeInTheDocument()
    await waitFor(() => expect(riletture()).toBeGreaterThan(prima))
  })

  it("più file partono uno dopo l'altro", async () => {
    avvia()
    await screen.findByRole("button", { name: "Aggiungi video" })
    scegli([clip("uno.mp4"), clip("due.mp4")])
    await waitFor(() => expect(FintoXhr.tutte).toHaveLength(1))
    expect(screen.getByText("In attesa")).toBeInTheDocument()
    FintoXhr.tutte[0]!.rispondi(201, { file: "x", byte: 1 })
    await waitFor(() => expect(FintoXhr.tutte).toHaveLength(2))
    expect(FintoXhr.tutte[1]!.intestazioni["X-Nome-File"]).toBe("due.mp4")
  })

  it("un file non ammesso o già presente dice perché, e resta finché non si chiude l'elenco", async () => {
    avvia()
    await screen.findByRole("button", { name: "Aggiungi video" })
    scegli([clip("contratto.pdf"), clip("a.mp4")])
    await waitFor(() => expect(FintoXhr.tutte).toHaveLength(1))
    FintoXhr.tutte[0]!.rispondi(415, { errore: "«contratto.pdf» non è un video, una foto o una registrazione audio: nel girato entrano solo questi." })
    await waitFor(() => expect(FintoXhr.tutte).toHaveLength(2))
    FintoXhr.tutte[1]!.rispondi(409, { errore: "«a.mp4» è già nel girato (2026-10-06/a.mp4): non lo aggiungo due volte." })

    expect(await screen.findByText(/«contratto.pdf» non è un video/)).toBeInTheDocument()
    expect(screen.getByText(/«a.mp4» è già nel girato/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Chiudi l'elenco" }))
    expect(screen.queryByText(/«contratto.pdf» non è un video/)).toBeNull()
  })

  it("se il server non risponde lo dice, non resta muto", async () => {
    avvia()
    await screen.findByRole("button", { name: "Aggiungi video" })
    scegli([clip("a.mp4")])
    await waitFor(() => expect(FintoXhr.tutte).toHaveLength(1))
    act(() => FintoXhr.tutte[0]!.onerror?.())
    expect(await screen.findByText(/Mango Animation non risponde/)).toBeInTheDocument()
  })
})

describe("i file lasciati sulla pagina nel browser", () => {
  const conFile = (file: File[]) => ({ dataTransfer: { types: ["Files"], files: file, dropEffect: "" } })

  it("mentre si trascinano file compare la zona di rilascio; al rilascio i file partono e la zona sparisce", async () => {
    const { container } = avvia()
    await screen.findByRole("button", { name: "Aggiungi video" })
    const pagina = container.firstElementChild as HTMLElement
    expect(screen.queryByText(/Rilascia qui/)).toBeNull()
    fireEvent.dragEnter(pagina, conFile([]))
    expect(screen.getByText("Rilascia qui i video per aggiungerli al girato")).toBeInTheDocument()
    fireEvent.drop(pagina, conFile([clip("lasciato.mp4")]))
    expect(screen.queryByText(/Rilascia qui/)).toBeNull()
    await waitFor(() => expect(FintoXhr.tutte).toHaveLength(1))
    expect(FintoXhr.tutte[0]!.intestazioni["X-Nome-File"]).toBe("lasciato.mp4")
  })

  it("trascinare del testo non fa comparire la zona; uscire dalla pagina la toglie", async () => {
    const { container } = avvia()
    await screen.findByRole("button", { name: "Aggiungi video" })
    const pagina = container.firstElementChild as HTMLElement
    fireEvent.dragEnter(pagina, { dataTransfer: { types: ["text/plain"] } })
    expect(screen.queryByText(/Rilascia qui/)).toBeNull()
    fireEvent.dragEnter(pagina, conFile([]))
    fireEvent.dragLeave(pagina, conFile([]))
    expect(screen.queryByText(/Rilascia qui/)).toBeNull()
  })

  it("in inglese la zona parla inglese", async () => {
    scegliLingua("en")
    const { container } = avvia()
    await screen.findByRole("button", { name: "Add video" })
    fireEvent.dragEnter(container.firstElementChild as HTMLElement, conFile([]))
    expect(screen.getByText("Drop the videos here to add them to the footage")).toBeInTheDocument()
  })
})

describe("i file lasciati sulla finestra dell'app", () => {
  let manda: (e: unknown) => void
  beforeEach(() => {
    let ascoltatore: ((e: unknown) => void) | null = null
    window.__MANGO_ANIMATION__ = { trascinamento: { su: (f: (e: unknown) => void) => ((ascoltatore = f), () => (ascoltatore = null)) } } as unknown as typeof window.__MANGO_ANIMATION__
    manda = (e) => act(() => ascoltatore?.(e))
  })

  it("un file lasciato sulla pagina va al server col suo percorso, senza passare dal browser", async () => {
    const { container } = avvia()
    await screen.findByRole("button", { name: "Aggiungi video" })
    document.elementFromPoint = () => container.firstElementChild
    const rete = installaRete({ "GET /api/grezzo": [VIDEO], "POST /api/grezzo/aggiungi": { file: "2026-10-06/x", byte: 1 } })

    manda({ tipo: "entra", x: 10, y: 10, percorsi: [String.raw`D:\video\giro lungo.mov`] })
    expect(screen.getByText("Rilascia qui i video per aggiungerli al girato")).toBeInTheDocument()
    manda({ tipo: "lascia", x: 10, y: 10, percorsi: [String.raw`D:\video\giro lungo.mov`] })
    expect(screen.queryByText(/Rilascia qui/)).toBeNull()
    await waitFor(() => expect(rete.chiamate.find((c) => c.metodo === "POST")?.corpo).toEqual({ percorso: String.raw`D:\video\giro lungo.mov` }))
    expect(FintoXhr.tutte).toHaveLength(0)
    expect(await screen.findByText("Aggiunto al girato")).toBeInTheDocument()
    expect(screen.getByText("giro lungo.mov")).toBeInTheDocument()
  })

  it("un file lasciato fuori dalla pagina (sulla chat) non lo prende", async () => {
    avvia()
    await screen.findByRole("button", { name: "Aggiungi video" })
    document.elementFromPoint = () => document.body
    const rete = installaRete({ "GET /api/grezzo": [VIDEO] })
    manda({ tipo: "entra", x: 900, y: 10, percorsi: ["D:\\a.mov"] })
    expect(screen.queryByText(/Rilascia qui/)).toBeNull()
    manda({ tipo: "lascia", x: 900, y: 10, percorsi: ["D:\\a.mov"] })
    expect(rete.chiamate.filter((c) => c.metodo === "POST")).toEqual([])
  })

  it("se il server rifiuta il percorso, la frase compare accanto al nome", async () => {
    const { container } = avvia()
    await screen.findByRole("button", { name: "Aggiungi video" })
    document.elementFromPoint = () => container.firstElementChild
    installaRete({ "GET /api/grezzo": [VIDEO], "POST /api/grezzo/aggiungi": errore(415, "«nota.txt» non è un video, una foto o una registrazione audio: nel girato entrano solo questi.") })
    manda({ tipo: "lascia", x: 10, y: 10, percorsi: ["D:\\nota.txt"] })
    expect(await screen.findByText(/«nota.txt» non è un video/)).toBeInTheDocument()
  })
})
